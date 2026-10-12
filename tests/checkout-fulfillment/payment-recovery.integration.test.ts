/**
 * Launch-blocking checkout defect (2026-10-12): paid Checkout Sessions whose webhook never reached the app left Orders PENDING forever, and the customer read
 * "Confirming your payment..." indefinitely - whether the session was paid, unpaid or expired. These tests run the REAL transactions against live Neon with a
 * stubbed Stripe (a `retrieveCheckoutSession` that answers per session), and cover: an unpaid/expired session is never "confirming"; a payment confirmed from
 * Stripe's own record starts fulfillment exactly once; a duplicate or late webhook does nothing further; a delayed webhook recovers (on the customer's status read
 * and on the cron backstop); a Stripe outage never asks for a second payment; and every project type takes the same path.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, orders, reportGenerationJobs, processedStripeEvents } from "../../src/db/schema.js";
import { createCheckoutSession, getOrderById, handleVerifiedWebhook, listStalePendingOrders, reconcileOrderWithStripe, type WebhookFollowUpWorkflow } from "../../src/order-payment/repository.js";
import { GuestOrderStatus, OrderState } from "../../src/order-payment/types.js";
import { clearGuestStatusThrottle, getGuestStatusView } from "../../src/checkout-fulfillment/index.js";
import { reconcileStalePendingOrders } from "../../src/checkout-fulfillment/reconciliation.js";
import { createFakeStripeClient } from "../fixtures/fake-stripe-client.js";
import { makeCheckoutSession, makeCheckoutSessionCompletedEvent } from "../fixtures/stripe.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const RUN_ID = crypto.randomUUID().slice(0, 8);

type StripeSessionState = { status: "open" | "complete" | "expired"; payment_status: "unpaid" | "paid" };

describe.skipIf(!hasDb)("payment confirmation recovery - live Neon integration", () => {
  let db: Db;
  const cleanupScreeningRequestIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });
  afterAll(async () => {
    for (const id of cleanupScreeningRequestIds) {
      await db.delete(orders).where(eq(orders.screeningRequestId, id));
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  });

  /** A Stripe whose answer for each session the test controls (and which can be made to fail). */
  function stripeFor(sessions: Map<string, StripeSessionState & { orderId: string; failing?: boolean }>) {
    return {
      async retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session> {
        const s = sessions.get(id);
        if (!s || s.failing) throw new Error("Stripe unavailable");
        return makeCheckoutSession({
          id,
          status: s.status,
          payment_status: s.payment_status,
          client_reference_id: s.orderId,
          payment_intent: s.payment_status === "paid" ? `pi_test_${id}` : null,
          customer_details: s.payment_status === "paid" ? ({ email: "buyer@example.com" } as Stripe.Checkout.Session.CustomerDetails) : null,
          url: s.status === "open" ? `https://checkout.stripe.com/c/pay/${id}` : null,
        });
      },
    };
  }

  async function makeOrder(projectType: string = "shed"): Promise<{ orderId: string; sessionId: string; screeningRequestId: string }> {
    const values =
      projectType === "vacant-land"
        ? { workflowType: "VACANT_LAND", confirmedParcelId: `TEST-PIN-${Math.random()}`, projectType: null, projectDetails: null, screeningIntent: "VACANT_PARCEL", vacantLandDetails: { screeningIntent: "VACANT_PARCEL" }, validationState: "VALID" as const }
        : { confirmedParcelId: `TEST-PIN-${Math.random()}`, projectType, projectDetails: {}, validationState: "VALID" as const };
    const [sr] = await db.insert(screeningRequests).values(values).returning();
    if (!sr) throw new Error("setup failed");
    cleanupScreeningRequestIds.push(sr.id);
    const fake = createFakeStripeClient();
    const created = await createCheckoutSession(db, fake, { screeningRequestId: sr.id, priceCents: 999, currency: "usd", successUrl: "https://x/s", cancelUrl: "https://x/c" });
    if (created.outcome !== "CHECKOUT_URL") throw new Error("setup failed");
    const [order] = await db.select().from(orders).where(eq(orders.screeningRequestId, sr.id));
    return { orderId: order!.id, sessionId: created.stripeCheckoutSessionId, screeningRequestId: sr.id };
  }

  const jobsFor = (screeningRequestId: string) => db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, screeningRequestId));
  /** Backdates an order and puts it at the very front of the cron queue (least recently checked), so assertions are independent of other pending rows in the shared database. */
  async function queueFirst(orderId: string, createdAt: Date, updatedAt = new Date("2000-01-01T00:00:00Z")) {
    await db.update(orders).set({ createdAt, updatedAt }).where(eq(orders.id, orderId));
  }
  function recorder() {
    const started: WebhookFollowUpWorkflow[] = [];
    return { started, startWorkflow: async (w: WebhookFollowUpWorkflow) => void started.push(w) };
  }

  describe("A. an unpaid or expired checkout never masquerades as a payment being confirmed", () => {
    it("an open, unpaid session reads AWAITING_PAYMENT with the same session's checkout URL; the order stays PENDING and nothing is started", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "open" as const, payment_status: "unpaid" as const }]]);
      const r = recorder();
      const view = await getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions), startWorkflow: r.startWorkflow });
      expect(view.status).toBe(GuestOrderStatus.AWAITING_PAYMENT);
      expect(view.checkoutUrl).toBe(`https://checkout.stripe.com/c/pay/${o.sessionId}`);
      expect(view.orderReference).toBe(o.orderId);
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PENDING);
      expect(r.started).toEqual([]);
      expect(await jobsFor(o.screeningRequestId)).toHaveLength(0);
    });
    it("an expired session reads EXPIRED and the order is closed out", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "expired" as const, payment_status: "unpaid" as const }]]);
      const view = await getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions) });
      expect(view.status).toBe(GuestOrderStatus.EXPIRED);
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.EXPIRED);
    });
    it("without a Stripe client the pure DB read is CONFIRMING_PAYMENT (never AWAITING_PAYMENT, which needs Stripe's word)", async () => {
      const o = await makeOrder();
      expect((await getGuestStatusView(db, o.sessionId)).status).toBe(GuestOrderStatus.CONFIRMING_PAYMENT);
    });
  });

  describe("B/E. a payment Stripe reports paid is confirmed even though no webhook arrived (delayed or never-forwarded webhook)", () => {
    it("the customer's status read confirms it: order PAID with the payment intent, one QUEUED job, workflow started once, status PAYMENT_CONFIRMED", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
      const r = recorder();
      const view = await getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions), startWorkflow: r.startWorkflow });
      expect(view.status).toBe(GuestOrderStatus.PAYMENT_CONFIRMED);
      const order = (await getOrderById(db, o.orderId))!;
      expect(order.state).toBe(OrderState.PAID);
      expect(order.stripePaymentIntentId).toBe(`pi_test_${o.sessionId}`);
      expect(order.customerEmail).toBe("buyer@example.com");
      const jobs = await jobsFor(o.screeningRequestId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.state).toBe("QUEUED");
      expect(r.started).toEqual([{ kind: "REPORT_GENERATION", jobId: jobs[0]!.id }]);
    });
    it("a real checkout.session.completed webhook still moves a PENDING order to PAID and queues its job", async () => {
      const o = await makeOrder();
      const event = makeCheckoutSessionCompletedEvent({ sessionId: o.sessionId, orderId: o.orderId, paymentIntentId: `pi_wh_${RUN_ID}_${o.orderId.slice(0, 6)}`, customerEmail: "buyer@example.com" });
      const result = await handleVerifiedWebhook(event);
      expect(result.startWorkflow?.kind).toBe("REPORT_GENERATION");
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PAID);
    });
    it("the cron backstop confirms a paid order whose webhook never came (and only one old enough), and closes out an abandoned one", async () => {
      clearGuestStatusThrottle();
      const paid = await makeOrder();
      const abandoned = await makeOrder();
      const fresh = await makeOrder();
      const sessions = new Map<string, StripeSessionState & { orderId: string }>([
        [paid.sessionId, { orderId: paid.orderId, status: "complete", payment_status: "paid" }],
        [abandoned.sessionId, { orderId: abandoned.orderId, status: "expired", payment_status: "unpaid" }],
        [fresh.sessionId, { orderId: fresh.orderId, status: "complete", payment_status: "paid" }],
      ]);
      const old = new Date(Date.now() - 10 * 60 * 1000);
      await queueFirst(paid.orderId, old);
      await queueFirst(abandoned.orderId, old);
      const r = recorder();
      // Other pending rows in the shared database (older than the window, or unknown to this stub) are unaffected: the stub throws for sessions it does not know, which leaves an order PENDING.
      const summary = await reconcileStalePendingOrders(db, stripeFor(sessions), r.startWorkflow, { minAgeMs: 5 * 60 * 1000, limit: 10 });
      expect(summary.confirmed).toBe(1);
      expect(summary.expired).toBe(1);
      expect((await getOrderById(db, paid.orderId))!.state).toBe(OrderState.PAID);
      expect((await getOrderById(db, abandoned.orderId))!.state).toBe(OrderState.EXPIRED);
      // Younger than the grace period: left for the webhook.
      expect((await getOrderById(db, fresh.orderId))!.state).toBe(OrderState.PENDING);
      const paidJobs = await jobsFor(paid.screeningRequestId);
      expect(r.started.filter((w) => w.kind === "REPORT_GENERATION" && w.jobId === paidJobs[0]!.id)).toHaveLength(1);
    });
  });

  describe("C. duplicate and late webhooks never duplicate fulfillment", () => {
    it("repeated status reads, then the real webhook arriving late, then that webhook redelivered: one job, the workflow started once", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
      const r = recorder();
      const deps = { stripeClient: stripeFor(sessions), startWorkflow: r.startWorkflow, minCheckIntervalMs: 0 };
      await getGuestStatusView(db, o.sessionId, deps);
      await getGuestStatusView(db, o.sessionId, deps);
      const event = makeCheckoutSessionCompletedEvent({ sessionId: o.sessionId, orderId: o.orderId, paymentIntentId: `pi_test_${o.sessionId}`, customerEmail: "buyer@example.com" });
      const late = await handleVerifiedWebhook(event);
      const redelivered = await handleVerifiedWebhook(event);
      expect(late.startWorkflow).toBeUndefined();
      expect(redelivered.startWorkflow).toBeUndefined();
      expect(await jobsFor(o.screeningRequestId)).toHaveLength(1);
      expect(r.started).toHaveLength(1);
    });
    it("two confirmations racing each other (webhook + status read) start fulfillment once and neither errors", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
      const r = recorder();
      const event = makeCheckoutSessionCompletedEvent({ sessionId: o.sessionId, orderId: o.orderId, paymentIntentId: `pi_test_${o.sessionId}`, customerEmail: "buyer@example.com" });
      const [view, hook] = await Promise.all([getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions), startWorkflow: r.startWorkflow }), handleVerifiedWebhook(event)]);
      expect([GuestOrderStatus.PAYMENT_CONFIRMED, GuestOrderStatus.CONFIRMING_PAYMENT]).toContain(view.status);
      expect(hook.handled).toBe(true);
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PAID);
      expect(await jobsFor(o.screeningRequestId)).toHaveLength(1);
      expect(r.started.length + (hook.startWorkflow ? 1 : 0)).toBe(1);
    });
  });

  describe("D. the status poll walks the whole sequence", () => {
    it("CONFIRMING_PAYMENT -> PAYMENT_CONFIRMED -> REPORT_READY", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map<string, StripeSessionState & { orderId: string; failing?: boolean }>([[o.sessionId, { orderId: o.orderId, status: "complete", payment_status: "paid", failing: true }]]);
      const deps = { stripeClient: stripeFor(sessions), startWorkflow: recorder().startWorkflow, minCheckIntervalMs: 0 };
      expect((await getGuestStatusView(db, o.sessionId, deps)).status).toBe(GuestOrderStatus.CONFIRMING_PAYMENT);
      sessions.get(o.sessionId)!.failing = false;
      expect((await getGuestStatusView(db, o.sessionId, deps)).status).toBe(GuestOrderStatus.PAYMENT_CONFIRMED);
      await db.update(reportGenerationJobs).set({ state: "COMPLETE" }).where(eq(reportGenerationJobs.screeningRequestId, o.screeningRequestId));
      expect((await getGuestStatusView(db, o.sessionId, deps)).status).toBe(GuestOrderStatus.REPORT_READY);
    });
  });

  describe("F. a Stripe or webhook failure never tells the customer to pay again", () => {
    it("when Stripe cannot be reached the status is CONFIRMING_PAYMENT with the order reference - not AWAITING_PAYMENT, no checkout URL - and the order is untouched", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const, failing: true }]]);
      const view = await getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions), minCheckIntervalMs: 0 });
      expect(view.status).toBe(GuestOrderStatus.CONFIRMING_PAYMENT);
      expect(view.orderReference).toBe(o.orderId);
      expect(view.checkoutUrl).toBeUndefined();
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PENDING);
    });
    it("a Stripe session that belongs to a different order is never applied", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const sessions = new Map([[o.sessionId, { orderId: crypto.randomUUID(), status: "complete" as const, payment_status: "paid" as const }]]);
      const view = await getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions), minCheckIntervalMs: 0 });
      expect(view.status).toBe(GuestOrderStatus.CONFIRMING_PAYMENT);
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PENDING);
    });
    it("repeated reads inside the throttle window ask Stripe once", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      let calls = 0;
      const stripeClient = {
        async retrieveCheckoutSession(id: string) {
          calls++;
          return makeCheckoutSession({ id, status: "open", payment_status: "unpaid", client_reference_id: o.orderId, url: `https://checkout.stripe.com/c/pay/${id}` });
        },
      };
      let t = 1_000_000;
      const deps = { stripeClient, now: () => t, minCheckIntervalMs: 2000 };
      await getGuestStatusView(db, o.sessionId, deps);
      t += 500;
      await getGuestStatusView(db, o.sessionId, deps);
      expect(calls).toBe(1);
      t += 2000;
      await getGuestStatusView(db, o.sessionId, deps);
      expect(calls).toBe(2);
    });
  });

  describe("G. every project type takes the same repaired path", () => {
    for (const projectType of ["shed", "garage", "fence", "deck", "adu", "vacant-land"]) {
      it(`${projectType}: Stripe-paid, no webhook -> PAID, one job, one workflow start`, async () => {
        clearGuestStatusThrottle();
        const o = await makeOrder(projectType);
        const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
        const r = recorder();
        const view = await getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions), startWorkflow: r.startWorkflow });
        expect(view.status).toBe(GuestOrderStatus.PAYMENT_CONFIRMED);
        expect(await jobsFor(o.screeningRequestId)).toHaveLength(1);
        expect(r.started).toHaveLength(1);
      });
    }
  });

  describe("reviewer RC-1: a paid event only confirms the order whose own Checkout Session it is", () => {
    it("a signature-valid paid event for a DIFFERENT session that names this order (client_reference_id) does not confirm it, queue a job or start anything", async () => {
      const o = await makeOrder();
      const foreign = makeCheckoutSessionCompletedEvent({ sessionId: "cs_test_someone_elses_session", orderId: o.orderId, paymentIntentId: "pi_test_foreign", customerEmail: "x@example.com" });
      const result = await handleVerifiedWebhook(foreign);
      expect(result.handled).toBe(false);
      expect(result.startWorkflow).toBeUndefined();
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PENDING);
      expect(await jobsFor(o.screeningRequestId)).toHaveLength(0);
      // The order's own session still confirms it afterwards.
      const own = makeCheckoutSessionCompletedEvent({ sessionId: o.sessionId, orderId: o.orderId, paymentIntentId: "pi_test_own", customerEmail: "x@example.com" });
      expect((await handleVerifiedWebhook(own)).startWorkflow?.kind).toBe("REPORT_GENERATION");
    });
    it("an order with NO stored session id (crash between insert and persist, BR-U2B-14) is not confirmed by a webhook either; resuming checkout persists the id, after which Stripe's own record (or a matching event) confirms it", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      await db.update(orders).set({ stripeCheckoutSessionId: null }).where(eq(orders.id, o.orderId));
      const event = makeCheckoutSessionCompletedEvent({ sessionId: o.sessionId, orderId: o.orderId, paymentIntentId: "pi_test_unpersisted", customerEmail: "x@example.com" });
      const rejected = await handleVerifiedWebhook(event);
      expect(rejected.handled).toBe(false);
      expect(rejected.startWorkflow).toBeUndefined();
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PENDING);
      expect(await jobsFor(o.screeningRequestId)).toHaveLength(0);
      // Recovery: the idempotent resumption stores the session id...
      const fake = createFakeStripeClient();
      const resumed = await createCheckoutSession(db, fake, { screeningRequestId: o.screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/s", cancelUrl: "https://x/c" });
      expect(resumed.outcome).toBe("CHECKOUT_URL");
      if (resumed.outcome !== "CHECKOUT_URL") return;
      expect(resumed.orderId).toBe(o.orderId);
      expect((await getOrderById(db, o.orderId))!.stripeCheckoutSessionId).toBe(resumed.stripeCheckoutSessionId);
      // ...and Stripe's record of that session then confirms the payment.
      const sessions = new Map([[resumed.stripeCheckoutSessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
      const view = await getGuestStatusView(db, resumed.stripeCheckoutSessionId, { stripeClient: stripeFor(sessions), minCheckIntervalMs: 0 });
      expect(view.status).toBe(GuestOrderStatus.PAYMENT_CONFIRMED);
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PAID);
    });
  });

  describe("reviewer RC-2: the expiry transition reports what was actually committed", () => {
    it("Stripe says expired but a payment confirmation commits first: the answer is the real status (PAYMENT_CONFIRMED), never a terminal EXPIRED, and the order stays PAID", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const stripeClient = {
        async retrieveCheckoutSession(id: string) {
          // The race: between Stripe's answer and our conditional update, the webhook confirms the payment.
          await handleVerifiedWebhook(makeCheckoutSessionCompletedEvent({ sessionId: id, orderId: o.orderId, paymentIntentId: "pi_test_race", customerEmail: "x@example.com" }));
          return makeCheckoutSession({ id, status: "expired", payment_status: "unpaid", client_reference_id: o.orderId });
        },
      };
      const order = (await getOrderById(db, o.orderId))!;
      expect((await reconcileOrderWithStripe(db, stripeClient, order)).outcome).toBe("ALREADY_SETTLED");
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PAID);
      const o2 = await makeOrder();
      const stripe2 = {
        async retrieveCheckoutSession(id: string) {
          await handleVerifiedWebhook(makeCheckoutSessionCompletedEvent({ sessionId: id, orderId: o2.orderId, paymentIntentId: "pi_test_race2", customerEmail: "x@example.com" }));
          return makeCheckoutSession({ id, status: "expired", payment_status: "unpaid", client_reference_id: o2.orderId });
        },
      };
      const view = await getGuestStatusView(db, o2.sessionId, { stripeClient: stripe2, minCheckIntervalMs: 0 });
      expect(view.status).toBe(GuestOrderStatus.PAYMENT_CONFIRMED);
    });
  });

  describe("reviewer RC-3: the cron backstop has no recovery cliff and cannot starve", () => {
    it("a paid order whose webhook never came is recovered however old it is (5 days)", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      await queueFirst(o.orderId, new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
      const r = recorder();
      const summary = await reconcileStalePendingOrders(db, stripeFor(sessions), r.startWorkflow, { limit: 5 });
      expect(summary.confirmed).toBe(1);
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PAID);
      expect(r.started).toHaveLength(1);
    });
    it("least-recently-checked first: with a batch smaller than the backlog, orders checked and left unresolved go to the back so every order is reached", async () => {
      clearGuestStatusThrottle();
      const [a, b, c] = [await makeOrder(), await makeOrder(), await makeOrder()];
      const old = new Date(Date.now() - 10 * 60 * 1000);
      await queueFirst(a!.orderId, old, new Date("2000-01-01T00:00:00Z"));
      await queueFirst(b!.orderId, old, new Date("2000-01-02T00:00:00Z"));
      await queueFirst(c!.orderId, old, new Date("2000-01-03T00:00:00Z"));
      const asked: string[] = [];
      const stripeClient = {
        async retrieveCheckoutSession(id: string) {
          asked.push(id);
          const orderId = [a, b, c].find((x) => x!.sessionId === id)!.orderId;
          return makeCheckoutSession({ id, status: "open", payment_status: "unpaid", client_reference_id: orderId, url: `https://checkout.stripe.com/c/pay/${id}` });
        },
      };
      const run1 = await reconcileStalePendingOrders(db, stripeClient, undefined, { limit: 2 });
      expect(run1.checked).toBe(2);
      expect(asked).toEqual([a!.sessionId, b!.sessionId]);
      asked.length = 0;
      await reconcileStalePendingOrders(db, stripeClient, undefined, { limit: 2 });
      // The order not yet reached is first in line (ahead of the two just checked), so across two runs of a batch smaller than the backlog every order was reached.
      expect(asked[0]).toBe(c!.sessionId);
      expect(asked).not.toContain(a!.sessionId);
      const listed = (await listStalePendingOrders(db, 5 * 60 * 1000, 1000)).map((x) => x.id);
      expect(listed.indexOf(a!.orderId)).toBeLessThan(listed.indexOf(b!.orderId));
    });
  });

  describe("resuming checkout never strands a customer behind a webhook that may not come", () => {
    it("a PENDING order whose Stripe session expired is closed out and a FRESH checkout is created", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const fake = createFakeStripeClient();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "expired" as const, payment_status: "unpaid" as const }]]);
      const client = { ...fake, retrieveCheckoutSession: stripeFor(sessions).retrieveCheckoutSession };
      const result = await createCheckoutSession(db, client, { screeningRequestId: o.screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/s", cancelUrl: "https://x/c" });
      expect(result.outcome).toBe("CHECKOUT_URL");
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.EXPIRED);
      if (result.outcome === "CHECKOUT_URL") expect(result.orderId).not.toBe(o.orderId);
    });
    it("a PENDING order whose Stripe session is already paid is confirmed (ALREADY_PAID, with the fulfillment start handed back) instead of 'try again shortly'", async () => {
      clearGuestStatusThrottle();
      const o = await makeOrder();
      const fake = createFakeStripeClient();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
      const client = { ...fake, retrieveCheckoutSession: stripeFor(sessions).retrieveCheckoutSession };
      const result = await createCheckoutSession(db, client, { screeningRequestId: o.screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/s", cancelUrl: "https://x/c" });
      expect(result.outcome).toBe("ALREADY_PAID");
      if (result.outcome === "ALREADY_PAID") expect(result.startWorkflow?.kind).toBe("REPORT_GENERATION");
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PAID);
    });
    it("when Stripe cannot be reached, resuming stays RECONCILING (never a second checkout)", async () => {
      const o = await makeOrder();
      const fake = createFakeStripeClient();
      const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const, failing: true }]]);
      const client = { ...fake, retrieveCheckoutSession: stripeFor(sessions).retrieveCheckoutSession };
      // The resume path asks Stripe first (to decide display/routing); an outage there is an error, not a new checkout.
      await expect(createCheckoutSession(db, client, { screeningRequestId: o.screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/s", cancelUrl: "https://x/c" })).rejects.toThrow();
      expect((await getOrderById(db, o.orderId))!.state).toBe(OrderState.PENDING);
      // No second checkout was created for the order.
      expect(fake.createdSessions).toHaveLength(0);
    });
  });

  it("the synthetic reconciliation ledger entry is keyed per Checkout Session, so a repeat can never re-run the transition", async () => {
    clearGuestStatusThrottle();
    const o = await makeOrder();
    const sessions = new Map([[o.sessionId, { orderId: o.orderId, status: "complete" as const, payment_status: "paid" as const }]]);
    await getGuestStatusView(db, o.sessionId, { stripeClient: stripeFor(sessions) });
    const rows = await db.select().from(processedStripeEvents).where(eq(processedStripeEvents.stripeEventId, `reconcile:${o.sessionId}`));
    expect(rows).toHaveLength(1);
  });
});
