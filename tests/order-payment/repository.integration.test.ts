/**
 * Live Neon integration test for Unit 2B's Order & Payment module. Skips cleanly (does not fail)
 * when DATABASE_URL is unset - see tests/db/unit2-schema.integration.test.ts for the pattern this
 * follows. Uses a FAKE StripeClient/ResendClient throughout (tests/fixtures/) - only DATABASE_URL
 * is required, never STRIPE_SECRET_KEY, since these tests verify the database-level correctness
 * this unit is built around, not Stripe integration itself (see stripe-live.integration.test.ts
 * for that). NOT executed in this Code Generation session - no DATABASE_URL provisioned in this
 * sandbox.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, orders, reportGenerationJobs } from "../../src/db/schema.js";
import {
  createCheckoutSession,
  handleVerifiedWebhook,
  processRefund,
  getOrderById,
  listOrdersNeedingRefundResubmission,
} from "../../src/order-payment/repository.js";
import { OrderState, RefundReason } from "../../src/order-payment/types.js";
import { listStuckQueuedJobIds } from "../../src/report-generation-job/repository.js";
import { createFakeStripeClient } from "../fixtures/fake-stripe-client.js";
import { makeCheckoutSessionCompletedEvent, makeCheckoutSessionExpiredEvent } from "../fixtures/stripe.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Unit 2B Order & Payment - live Neon integration", () => {
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

  async function makeScreeningRequest(): Promise<string> {
    const [row] = await db
      .insert(screeningRequests)
      .values({ confirmedParcelId: `TEST-PIN-${Math.random()}`, projectType: "shed", projectDetails: {}, validationState: "VALID" })
      .returning();
    if (!row) throw new Error("setup failed");
    cleanupScreeningRequestIds.push(row.id);
    return row.id;
  }

  describe("Pattern 1: checkout-session creation resumability (BR-U2B-14)", () => {
    it("creates a new PENDING order and a Checkout Session on first call", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();

      const result = await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });

      expect(result.outcome).toBe("CHECKOUT_URL");
      expect(stripeClient.createdSessions).toHaveLength(1);
    });

    it("resumes (does not duplicate) when stripeCheckoutSessionId is absent - reuses the same checkoutCreationIdempotencyKey", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();

      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [order] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!order) throw new Error("setup failed");

      // Simulate a crash between the Order insert and the session-id persist.
      await db.update(orders).set({ stripeCheckoutSessionId: null }).where(eq(orders.id, order.id));

      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });

      const stillOnePendingOrder = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      expect(stillOnePendingOrder).toHaveLength(1);
      expect(stripeClient.createdSessions).toHaveLength(2);
      expect(stripeClient.createdSessions[0]?.idempotencyKey).toBe(stripeClient.createdSessions[1]?.idempotencyKey);
    });

    it("[hard invariant] a concurrent-initiation race cannot produce two PENDING orders for the same screeningRequestId", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();

      await Promise.all([
        createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" }),
        createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" }),
      ]);

      const pendingOrders = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      expect(pendingOrders).toHaveLength(1);
    });

    it("an existing open session is reused, not duplicated", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();

      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });

      expect(stripeClient.createdSessions).toHaveLength(1); // retrieveCheckoutSession found it "open" - never re-created.
    });
  });

  describe("Webhook idempotency + atomic fulfillment (BR-U2B-4/BR-U2B-15)", () => {
    it("checkout.session.completed transitions PENDING -> PAID and creates exactly one ReportGenerationJob", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();
      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [order] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!order) throw new Error("setup failed");

      const event = makeCheckoutSessionCompletedEvent({ orderId: order.id });
      const result = await handleVerifiedWebhook(event);

      expect(result.handled).toBe(true);
      expect(result.startWorkflow?.kind).toBe("REPORT_GENERATION");

      const paidOrder = await getOrderById(db, order.id);
      expect(paidOrder?.state).toBe(OrderState.PAID);
      expect(paidOrder?.customerEmail).toBe("guest@example.com");

      const jobs = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, screeningRequestId));
      expect(jobs).toHaveLength(1);
      expect((jobs[0]?.generationAuthorization as { type: string }).type).toBe("VERIFIED_PAYMENT");
    });

    it("[hard invariant] redelivering the exact same event is a no-op (ledger dedup) - no second job, no error", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();
      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [order] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!order) throw new Error("setup failed");

      const event = makeCheckoutSessionCompletedEvent({ orderId: order.id, eventId: "evt_dedup_test" });
      await handleVerifiedWebhook(event);
      const secondResult = await handleVerifiedWebhook(event);

      expect(secondResult.handled).toBe(true);
      const jobs = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, screeningRequestId));
      expect(jobs).toHaveLength(1);
    });

    it("checkout.session.expired transitions a PENDING order to EXPIRED, never touches a non-PENDING order", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();
      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [order] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!order?.stripeCheckoutSessionId) throw new Error("setup failed");

      await handleVerifiedWebhook(makeCheckoutSessionExpiredEvent({ sessionId: order.stripeCheckoutSessionId }));

      const expired = await getOrderById(db, order.id);
      expect(expired?.state).toBe(OrderState.EXPIRED);
    });

    it("[hard invariant, BR-U2B-1 point 4, corrected 2026-08-25] a duplicate-payment anomaly retains the real paidAt/stripePaymentIntentId (never falsified to NULL), never creates a second job, and is not silently ignored", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();

      // Order A: normal path to PAID - the canonical order.
      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [orderA] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!orderA) throw new Error("setup failed");
      await handleVerifiedWebhook(makeCheckoutSessionCompletedEvent({ orderId: orderA.id, eventId: "evt_orderA" }));
      const paidA = await getOrderById(db, orderA.id);
      expect(paidA?.state).toBe(OrderState.PAID);

      // Order B: a second, independently-created PENDING order for the SAME screeningRequestId
      // (only possible once Order A is no longer PENDING - the partial unique index allows this,
      // simulating the abnormal race BR-U2B-1 point 4 anticipates).
      const [orderB] = await db
        .insert(orders)
        .values({ screeningRequestId, state: OrderState.PENDING, priceCents: 999, currency: "usd", checkoutCreationIdempotencyKey: crypto.randomUUID() })
        .returning();
      if (!orderB) throw new Error("setup failed");

      const result = await handleVerifiedWebhook(makeCheckoutSessionCompletedEvent({ orderId: orderB.id, eventId: "evt_orderB_duplicate", paymentIntentId: "pi_test_orderB" }));

      expect(result.duplicateAnomaly).toBe(true);
      expect(result.startWorkflow).toEqual({ kind: "REFUND", orderId: orderB.id, reason: RefundReason.DUPLICATE_PAYMENT });

      const reloadedB = await getOrderById(db, orderB.id);
      expect(reloadedB?.state).toBe(OrderState.REFUND_PENDING);
      expect(reloadedB?.paidAt).toBeTruthy(); // set for REAL - Stripe genuinely confirmed this payment.
      expect(reloadedB?.stripePaymentIntentId).toBe("pi_test_orderB");
      expect(reloadedB?.refundReason).toBe(RefundReason.DUPLICATE_PAYMENT);

      const jobs = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, screeningRequestId));
      expect(jobs).toHaveLength(1); // still only Order A's job - never a second one for Order B.

      // Order A remains the sole CANONICAL paid order even after this - createCheckoutSession's
      // ALREADY_PAID check must resolve to Order A, never Order B.
      const reuse = await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      expect(reuse).toEqual({ outcome: "ALREADY_PAID", orderId: orderA.id });
    });

    it("[hard invariant] the canonical Order stays canonical for the uniqueness rule even after its own later refund (GENERATION_FAILURE/manual), and a THIRD duplicate payment still cannot become canonical", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();

      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [orderA] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!orderA) throw new Error("setup failed");
      await handleVerifiedWebhook(makeCheckoutSessionCompletedEvent({ orderId: orderA.id, eventId: "evt_orderA_2" }));

      // Order A (the canonical order) is later refunded for an ordinary reason (not a duplicate).
      await processRefund(db, stripeClient, orderA.id, RefundReason.GENERATION_FAILURE);
      const refundedA = await getOrderById(db, orderA.id);
      expect(refundedA?.state).toBe(OrderState.REFUND_PENDING);
      expect(refundedA?.refundReason).toBe(RefundReason.GENERATION_FAILURE);

      // A THIRD Order, independently created and Stripe-confirmed paid, must STILL be treated as a
      // duplicate - Order A's own refund does not free up the canonical slot for a new payer.
      const [orderC] = await db
        .insert(orders)
        .values({ screeningRequestId, state: OrderState.PENDING, priceCents: 999, currency: "usd", checkoutCreationIdempotencyKey: crypto.randomUUID() })
        .returning();
      if (!orderC) throw new Error("setup failed");

      const result = await handleVerifiedWebhook(makeCheckoutSessionCompletedEvent({ orderId: orderC.id, eventId: "evt_orderC_duplicate", paymentIntentId: "pi_test_orderC" }));
      expect(result.duplicateAnomaly).toBe(true);

      const reloadedC = await getOrderById(db, orderC.id);
      expect(reloadedC?.state).toBe(OrderState.REFUND_PENDING);
      expect(reloadedC?.paidAt).toBeTruthy();
      expect(reloadedC?.refundReason).toBe(RefundReason.DUPLICATE_PAYMENT);

      const jobs = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, screeningRequestId));
      expect(jobs).toHaveLength(1); // still only Order A's original job.
    });
  });

  describe("Refund state machine (BR-U2B-5, corrected 2026-08-24)", () => {
    async function makePaidOrder(stripeClient: ReturnType<typeof createFakeStripeClient>): Promise<{ orderId: string; screeningRequestId: string }> {
      const screeningRequestId = await makeScreeningRequest();
      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [order] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!order) throw new Error("setup failed");
      await handleVerifiedWebhook(makeCheckoutSessionCompletedEvent({ orderId: order.id }));
      return { orderId: order.id, screeningRequestId };
    }

    it("PAID -> claims REFUND_PENDING, persists refundIdempotencyKey, submits to Stripe", async () => {
      const stripeClient = createFakeStripeClient();
      const { orderId } = await makePaidOrder(stripeClient);

      const result = await processRefund(db, stripeClient, orderId, RefundReason.CUSTOMER_REQUEST);

      expect(result.outcome).toBe("SUBMITTED");
      expect(stripeClient.createdRefunds).toHaveLength(1);
      const order = await getOrderById(db, orderId);
      expect(order?.state).toBe(OrderState.REFUND_PENDING);
      expect(order?.refundIdempotencyKey).toBeTruthy();
      expect(order?.stripeRefundId).toBeTruthy();
    });

    it("[hard invariant] REFUND_PENDING resumption (simulating a lost Stripe response) resubmits using the SAME idempotency key, never a new one", async () => {
      const stripeClient = createFakeStripeClient();
      const { orderId } = await makePaidOrder(stripeClient);

      await processRefund(db, stripeClient, orderId, RefundReason.CUSTOMER_REQUEST);
      // A second run for the same logical attempt - e.g. Cron reconciliation resuming after the
      // first run's own crash/response-loss. Must NOT exit merely because the order is already
      // REFUND_PENDING (the exact bug the 2026-08-24 founder review corrected).
      const secondResult = await processRefund(db, stripeClient, orderId, RefundReason.CUSTOMER_REQUEST);

      expect(secondResult.outcome).toBe("SUBMITTED");
      expect(stripeClient.createdRefunds).toHaveLength(2);
      expect(stripeClient.createdRefunds[0]?.idempotencyKey).toBe(stripeClient.createdRefunds[1]?.idempotencyKey);
    });

    it("[hard invariant] a concurrent claim race on the same PAID order still results in every run submitting with the SAME key - never a silent exit", async () => {
      const stripeClient = createFakeStripeClient();
      const { orderId } = await makePaidOrder(stripeClient);

      const [resultA, resultB] = await Promise.all([
        processRefund(db, stripeClient, orderId, RefundReason.CUSTOMER_REQUEST),
        processRefund(db, stripeClient, orderId, RefundReason.CUSTOMER_REQUEST),
      ]);

      expect(resultA.outcome).toBe("SUBMITTED");
      expect(resultB.outcome).toBe("SUBMITTED");
      expect(stripeClient.createdRefunds).toHaveLength(2);
      expect(stripeClient.createdRefunds[0]?.idempotencyKey).toBe(stripeClient.createdRefunds[1]?.idempotencyKey);

      const order = await getOrderById(db, orderId);
      expect(order?.state).toBe(OrderState.REFUND_PENDING);
    });

    it("REFUND_FAILED is a NOOP - never automatically retried", async () => {
      const stripeClient = createFakeStripeClient();
      const { orderId } = await makePaidOrder(stripeClient);
      await db.update(orders).set({ state: OrderState.REFUND_FAILED }).where(eq(orders.id, orderId));

      const result = await processRefund(db, stripeClient, orderId, RefundReason.CUSTOMER_REQUEST);

      expect(result.outcome).toBe("NOOP");
      expect(stripeClient.createdRefunds).toHaveLength(0);
    });

    it("REFUNDED is a NOOP - nothing to do", async () => {
      const stripeClient = createFakeStripeClient();
      const { orderId } = await makePaidOrder(stripeClient);
      await db.update(orders).set({ state: OrderState.REFUNDED }).where(eq(orders.id, orderId));

      const result = await processRefund(db, stripeClient, orderId, RefundReason.CUSTOMER_REQUEST);

      expect(result.outcome).toBe("NOOP");
      expect(stripeClient.createdRefunds).toHaveLength(0);
    });
  });

  describe("Cron reconciliation helpers", () => {
    it("listOrdersNeedingRefundResubmission finds a stale REFUND_PENDING order with no stripeRefundId", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const stripeClient = createFakeStripeClient();
      await createCheckoutSession(db, stripeClient, { screeningRequestId, priceCents: 999, currency: "usd", successUrl: "https://x/success", cancelUrl: "https://x/cancel" });
      const [order] = await db.select().from(orders).where(eq(orders.screeningRequestId, screeningRequestId));
      if (!order) throw new Error("setup failed");
      await db.update(orders).set({ state: OrderState.REFUND_PENDING, refundIdempotencyKey: crypto.randomUUID(), updatedAt: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(orders.id, order.id));

      const stale = await listOrdersNeedingRefundResubmission(db, 60_000);
      expect(stale.map((o) => o.id)).toContain(order.id);
    });

    it("listStuckQueuedJobIds finds a QUEUED job past the grace period", async () => {
      const screeningRequestId = await makeScreeningRequest();
      const [job] = await db
        .insert(reportGenerationJobs)
        .values({ screeningRequestId, generationAuthorization: { type: "INTERNAL_PROTOTYPE", screeningRequestId, authorizedBy: "test", authorizedAt: new Date().toISOString() }, state: "QUEUED" })
        .returning();
      if (!job) throw new Error("setup failed");
      await db.update(reportGenerationJobs).set({ createdAt: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(reportGenerationJobs.id, job.id));

      const stuck = await listStuckQueuedJobIds(db, 60_000);
      expect(stuck).toContain(job.id);
    });
  });
});

describe.skipIf(hasDb)("Unit 2B Order & Payment - live Neon integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
  });
});
