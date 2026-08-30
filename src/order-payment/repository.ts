/**
 * Order & Payment persistence and workflow logic - Unit 2B, BR-U2B-1 through BR-U2B-16.
 *
 * The database is the authoritative correctness boundary for every idempotency requirement in
 * this module (Workflow-Start Idempotency correction, 2026-08-24 - see
 * aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md). Stripe
 * signatures and idempotency keys are real and load-bearing for their own purposes, but every
 * "has this already happened" decision is a conditional database read/write, never inferred from
 * Vercel Workflow run existence or hook-token state.
 */

import { randomUUID } from "node:crypto";
import { eq, and, or, ne, isNull, isNotNull, sql as drizzleSql } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db, TransactionalDb } from "../db/client.js";
import { withFulfillmentTransaction } from "../db/client.js";
import { orders, processedStripeEvents, screeningRequests, reportGenerationJobs, type OrderRow } from "../db/schema.js";
import { ReportGenerationJobState } from "../report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../screening-request/authorization.js";
import type { StripeClient } from "./stripe-client.js";
import { OrderState, RefundReason } from "./types.js";
import type { Order } from "./types.js";
import { logger } from "../shared/logger.js";

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    screeningRequestId: row.screeningRequestId,
    state: row.state,
    priceCents: row.priceCents,
    currency: row.currency,
    checkoutCreationIdempotencyKey: row.checkoutCreationIdempotencyKey,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId ?? undefined,
    stripePaymentIntentId: row.stripePaymentIntentId ?? undefined,
    customerEmail: row.customerEmail ?? undefined,
    paidAt: row.paidAt?.toISOString(),
    refundReason: (row.refundReason as RefundReason | null) ?? undefined,
    refundIdempotencyKey: row.refundIdempotencyKey ?? undefined,
    stripeRefundId: row.stripeRefundId ?? undefined,
    refundConfirmedAt: row.refundConfirmedAt?.toISOString(),
  };
}

/**
 * Postgres unique-violation SQLSTATE - used to detect a lost race against BR-U2B-1's partial
 * unique indexes, never surfaced to the customer as a generic error.
 *
 * Corrected 2026-08-27 (real production defect, found via live Neon integration testing - not a
 * test-fixture issue): the neon-serverless driver's `tx.transaction()` (used for the SAVEPOINT
 * this function's own caller relies on) wraps the real Postgres error in an outer `Failed query:
 * ...` Error, with the actual driver error (carrying `.code`) on `.cause`, not on the outer object
 * itself. The original shallow `"code" in err` check only ever inspected the outer wrapper, so it
 * NEVER actually detected a real unique violation against a live database - the duplicate-payment-
 * anomaly SAVEPOINT catch (handlePaymentConfirmed, below) always rethrew instead of routing to the
 * REFUND_PENDING/DUPLICATE_PAYMENT branch, meaning that fail-safe had never actually functioned
 * against Postgres before this was caught. Now walks the full `.cause` chain.
 */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export async function getOrderById(db: Db, orderId: string): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row ? rowToOrder(row) : undefined;
}

export async function getOrderByCheckoutSessionId(db: Db, stripeCheckoutSessionId: string): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.stripeCheckoutSessionId, stripeCheckoutSessionId));
  return row ? rowToOrder(row) : undefined;
}

/** ADM-5 (Unit 3) - exact, normalized-case-insensitive match only (Q6): trim + lowercase both
 * sides via Postgres's own lower(), never a substring/prefix/wildcard/fuzzy match - this is an
 * admin support lookup, not a customer-discovery product, and partial email search risks
 * exposing unrelated customers' commercial records. */
export async function findOrdersByCustomerEmail(db: Db, email: string): Promise<Order[]> {
  const normalized = email.trim().toLowerCase();
  const rows = await db.select().from(orders).where(drizzleSql`lower(${orders.customerEmail}) = ${normalized}`);
  return rows.map(rowToOrder);
}

/** The CANONICAL paid order only (mirrors `orders_screening_request_id_paid_unique`'s corrected
 * predicate exactly, 2026-08-25) - a `refundReason = 'DUPLICATE_PAYMENT'` order also has a real,
 * non-null `paidAt` now, but it never authorized fulfillment and must never be returned here as
 * "the" paid order (that would let a duplicate row satisfy the ALREADY_PAID check). */
async function getPaidOrder(db: Db, screeningRequestId: string): Promise<Order | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.screeningRequestId, screeningRequestId), isNotNull(orders.paidAt), or(isNull(orders.refundReason), ne(orders.refundReason, RefundReason.DUPLICATE_PAYMENT))));
  return row ? rowToOrder(row) : undefined;
}

async function getPendingOrder(db: Db, screeningRequestId: string): Promise<Order | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.screeningRequestId, screeningRequestId), eq(orders.state, OrderState.PENDING)));
  return row ? rowToOrder(row) : undefined;
}

export type CreateCheckoutSessionResult =
  /** `stripeCheckoutSessionId` is returned so the caller (POST /api/checkout) can set it as an
   * HttpOnly cookie for the guest status-read capability (Operations correction, 2026-08-25) -
   * NEVER placed in the success_url/redirect target, which would put a bearer-capability value
   * directly in a platform-visible request path/query string (NFR Design Pattern 4's hardening,
   * corrected). */
  | { outcome: "CHECKOUT_URL"; checkoutUrl: string; orderId: string; stripeCheckoutSessionId: string }
  | { outcome: "ALREADY_PAID"; orderId: string }
  /** Stripe reports a newer state (paid or expired) than this Order's local PENDING - the
   * webhook that would reconcile it hasn't been processed yet. Never locally forged - only a
   * verified webhook may actually transition the Order (BR-U2B-2). */
  | { outcome: "RECONCILING" };

/**
 * BR-U2B-14/Pattern 1 (corrected per 2026-08-24 founder review): resumable, idempotent Checkout
 * Session creation. The internal Order always exists before any Stripe object - `Order` existence
 * never depends on `stripeCheckoutSessionId` being present yet.
 */
export async function createCheckoutSession(
  db: Db,
  stripeClient: StripeClient,
  params: { screeningRequestId: string; priceCents: number; currency: string; successUrl: string; cancelUrl: string }
): Promise<CreateCheckoutSessionResult> {
  const { screeningRequestId, priceCents, currency, successUrl, cancelUrl } = params;

  const paid = await getPaidOrder(db, screeningRequestId);
  if (paid) return { outcome: "ALREADY_PAID", orderId: paid.id };

  const pending = await getPendingOrder(db, screeningRequestId);
  if (pending) {
    return resumeOrReusePendingOrder(db, stripeClient, pending, successUrl, cancelUrl);
  }

  // No PENDING/PAID order exists (or the prior one is EXPIRED, which does not block a new
  // attempt) - create a new one. A concurrent caller may win the partial-unique-index race; that
  // is caught below and treated as "someone else already created the row I was about to create."
  try {
    const [row] = await db
      .insert(orders)
      .values({
        screeningRequestId,
        state: OrderState.PENDING,
        priceCents,
        currency,
        checkoutCreationIdempotencyKey: randomUUID(),
      })
      .returning();
    if (!row) throw new Error("Failed to create Order.");
    return resumeOrReusePendingOrder(db, stripeClient, rowToOrder(row), successUrl, cancelUrl);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = (await getPaidOrder(db, screeningRequestId)) ?? (await getPendingOrder(db, screeningRequestId));
    if (!existing) throw err; // Genuinely unexpected - the violated index implies a row exists.
    if (existing.state === OrderState.PAID) return { outcome: "ALREADY_PAID", orderId: existing.id };
    return resumeOrReusePendingOrder(db, stripeClient, existing, successUrl, cancelUrl);
  }
}

async function resumeOrReusePendingOrder(
  db: Db,
  stripeClient: StripeClient,
  order: Order,
  successUrl: string,
  cancelUrl: string
): Promise<CreateCheckoutSessionResult> {
  if (!order.stripeCheckoutSessionId) {
    // Checkout-session creation was interrupted (network failure, lost response, or a crash) -
    // resume it using the SAME idempotency key, never a new Order.
    const session = await stripeClient.createCheckoutSession({
      orderId: order.id,
      priceCents: order.priceCents,
      currency: order.currency,
      successUrl,
      cancelUrl,
      idempotencyKey: order.checkoutCreationIdempotencyKey,
    });
    await db.update(orders).set({ stripeCheckoutSessionId: session.id, updatedAt: drizzleSql`now()` }).where(eq(orders.id, order.id));
    if (!session.url) throw new Error(`Stripe Checkout Session ${session.id} has no url.`);
    return { outcome: "CHECKOUT_URL", checkoutUrl: session.url, orderId: order.id, stripeCheckoutSessionId: session.id };
  }

  // A session already exists - never blindly reuse a locally-cached "usable" assumption. Read
  // Stripe's own current state for this DISPLAY/ROUTING decision only; it never locally mutates
  // Order.state (that remains exclusively a verified-webhook transition, BR-U2B-2).
  const session = await stripeClient.retrieveCheckoutSession(order.stripeCheckoutSessionId);
  if (session.status === "open") {
    if (!session.url) throw new Error(`Stripe Checkout Session ${session.id} has no url.`);
    return { outcome: "CHECKOUT_URL", checkoutUrl: session.url, orderId: order.id, stripeCheckoutSessionId: session.id };
  }
  // session.status is "complete" (payment succeeded, our webhook hasn't processed it yet) or
  // "expired" (our expiry webhook hasn't processed it yet, so the local Order is still PENDING) -
  // both are RECONCILING: never reuse, never locally forge PENDING -> PAID/EXPIRED.
  return { outcome: "RECONCILING" };
}

export async function getPaymentState(db: Db, orderId: string): Promise<OrderState | undefined> {
  const order = await getOrderById(db, orderId);
  return order?.state;
}

export type WebhookFollowUpWorkflow = { kind: "REPORT_GENERATION"; jobId: string } | { kind: "REFUND"; orderId: string; reason: RefundReason };

export interface HandleVerifiedWebhookResult {
  handled: boolean;
  duplicateAnomaly?: boolean;
  /** Set only when the atomic transaction actually created new durable state that needs a
   * corresponding Vercel Workflow started - `start()` is an external side effect and must never
   * be called from inside the DB transaction itself, so the caller (the webhook route) starts it
   * AFTER this function returns and the transaction has committed. */
  startWorkflow?: WebhookFollowUpWorkflow;
}

/**
 * BR-U2B-4/BR-U2B-15: processes one signature-VERIFIED Stripe event (verification itself happens
 * before this function is called - see app/api/webhooks/stripe/route.ts). Every domain mutation
 * commits atomically with the ProcessedStripeEvent ledger entry - a failure anywhere rolls the
 * whole thing back, leaving state exactly as it was before this call, so Stripe's own webhook
 * redelivery safely reprocesses from scratch.
 */
export async function handleVerifiedWebhook(event: Stripe.Event): Promise<HandleVerifiedWebhookResult> {
  return withFulfillmentTransaction(async (tx) => {
    const [existing] = await tx.select().from(processedStripeEvents).where(eq(processedStripeEvents.stripeEventId, event.id));
    if (existing) return { handled: true }; // Already processed - safe no-op (BR-U2B-4).

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") return recordProcessed(tx, event, session.id, { handled: true });
        return handlePaymentConfirmed(tx, event, session);
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await tx
          .update(orders)
          .set({ state: OrderState.EXPIRED, updatedAt: drizzleSql`now()` })
          .where(and(eq(orders.stripeCheckoutSessionId, session.id), eq(orders.state, OrderState.PENDING)));
        return recordProcessed(tx, event, session.id, { handled: true });
      }
      case "charge.refund.updated":
      case "refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        return handleRefundUpdated(tx, event, refund);
      }
      default:
        return recordProcessed(tx, event, event.id, { handled: false });
    }
  });
}

async function recordProcessed(
  tx: TransactionalDb,
  event: Stripe.Event,
  stripeObjectId: string,
  result: HandleVerifiedWebhookResult
): Promise<HandleVerifiedWebhookResult> {
  await tx.insert(processedStripeEvents).values({ stripeEventId: event.id, eventType: event.type, stripeObjectId });
  return result;
}

async function handlePaymentConfirmed(
  tx: TransactionalDb,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<HandleVerifiedWebhookResult> {
  const orderId = session.client_reference_id ?? (session.metadata?.["orderId"] as string | undefined);
  if (!orderId) {
    // No way to resolve this event to an Order - record it as processed (so it isn't retried
    // forever) but do not attempt any domain transition.
    return recordProcessed(tx, event, session.id, { handled: false });
  }

  const [current] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!current) return recordProcessed(tx, event, session.id, { handled: false });

  if (current.state !== OrderState.PENDING) {
    // This specific Order is no longer PENDING (already PAID/refund-lifecycle) - a redelivery or
    // out-of-order event for it, not the BR-U2B-1 point 4 duplicate-payment scenario (which
    // involves a DIFFERENT, still-PENDING Order for the same screeningRequestId - see the unique-
    // violation branch below). Nothing further to do; safe no-op.
    return recordProcessed(tx, event, session.id, { handled: true });
  }

  const customerEmail = session.customer_details?.email ?? undefined;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) return recordProcessed(tx, event, session.id, { handled: false });

  // BR-U2B-1 points 3-4: the partial unique index on (screeningRequestId WHERE paidAt IS NOT
  // NULL) is the hard backstop - if a DIFFERENT Order for this same screeningRequestId already
  // captured the one-ever-PAID slot, THIS update violates it. A SAVEPOINT isolates that failure
  // so the outer atomic transaction (and the ledger write below) survives it.
  let paidHere = false;
  try {
    await tx.transaction(async (tx2) => {
      const [claimed] = await tx2
        .update(orders)
        .set({ state: OrderState.PAID, paidAt: drizzleSql`now()`, stripePaymentIntentId: paymentIntentId, customerEmail, updatedAt: drizzleSql`now()` })
        .where(and(eq(orders.id, orderId), eq(orders.state, OrderState.PENDING)))
        .returning();
      if (!claimed) throw new Error(`Order ${orderId} was no longer PENDING at update time.`);
    });
    paidHere = true;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  if (!paidHere) {
    // Duplicate-payment anomaly (BR-U2B-1 point 4, corrected 2026-08-25): Stripe genuinely
    // captured a second payment for this screeningRequestId - the audit record must say so
    // truthfully. `paidAt`/`stripePaymentIntentId`/`customerEmail` are set for REAL here, exactly
    // like the canonical PAID branch above - a duplicate payment is still a real, confirmed
    // payment, followed by a refund, not a payment that "didn't really happen." This row is
    // simultaneously classified `refundReason: DUPLICATE_PAYMENT`, which is what excludes it from
    // `orders_screening_request_id_paid_unique` (that index's predicate now reads `paidAt IS NOT
    // NULL AND refundReason IS DISTINCT FROM 'DUPLICATE_PAYMENT'`) - so this UPDATE does not
    // re-collide with the same constraint it just lost the race for.
    logger.error("DUPLICATE_PAYMENT_ANOMALY", { orderId, screeningRequestId: current.screeningRequestId, stripePaymentIntentId: paymentIntentId });
    await tx
      .update(orders)
      .set({
        state: OrderState.REFUND_PENDING,
        paidAt: drizzleSql`now()`,
        stripePaymentIntentId: paymentIntentId,
        customerEmail,
        refundReason: RefundReason.DUPLICATE_PAYMENT,
        refundIdempotencyKey: randomUUID(),
        updatedAt: drizzleSql`now()`,
      })
      .where(eq(orders.id, orderId));
    return recordProcessed(tx, event, session.id, { handled: true, duplicateAnomaly: true, startWorkflow: { kind: "REFUND", orderId, reason: RefundReason.DUPLICATE_PAYMENT } });
  }

  const [screeningRequest] = await tx.select().from(screeningRequests).where(eq(screeningRequests.id, current.screeningRequestId));
  if (!screeningRequest) return recordProcessed(tx, event, session.id, { handled: false });

  // Job creation is inlined here (rather than calling report-generation-job/repository.ts's
  // createReportGenerationJob) so it commits atomically, within this SAME Pool transaction, with
  // the Order's PAID transition and the ledger write (BR-U2B-15) - never a separate connection.
  const [existingJob] = await tx.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, current.screeningRequestId));
  let jobId = existingJob?.id;
  if (!existingJob) {
    const authorizedAt = new Date().toISOString();
    const authorization: GenerationAuthorization = {
      type: GenerationAuthorizationType.VERIFIED_PAYMENT,
      screeningRequestId: current.screeningRequestId,
      orderId,
      authorizedAt,
    };
    const [inserted] = await tx
      .insert(reportGenerationJobs)
      .values({ screeningRequestId: current.screeningRequestId, generationAuthorization: authorization, state: ReportGenerationJobState.QUEUED })
      .returning();
    jobId = inserted?.id;
  }

  return recordProcessed(tx, event, session.id, { handled: true, startWorkflow: jobId ? { kind: "REPORT_GENERATION", jobId } : undefined });
}

async function handleRefundUpdated(tx: TransactionalDb, event: Stripe.Event, refund: Stripe.Refund): Promise<HandleVerifiedWebhookResult> {
  const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (!paymentIntentId) return recordProcessed(tx, event, refund.id, { handled: false });

  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.stripePaymentIntentId, paymentIntentId), eq(orders.state, OrderState.REFUND_PENDING)));
  if (!order) return recordProcessed(tx, event, refund.id, { handled: true }); // Already reconciled or unknown.

  if (refund.status === "succeeded") {
    await tx
      .update(orders)
      .set({ state: OrderState.REFUNDED, refundConfirmedAt: drizzleSql`now()`, stripeRefundId: refund.id, updatedAt: drizzleSql`now()` })
      .where(eq(orders.id, order.id));
  } else if (refund.status === "failed") {
    await tx
      .update(orders)
      .set({ state: OrderState.REFUND_FAILED, updatedAt: drizzleSql`now()` })
      .where(eq(orders.id, order.id));
  }
  // pending/requires_action/canceled: no transition yet - remain REFUND_PENDING.

  return recordProcessed(tx, event, refund.id, { handled: true });
}

export type ProcessRefundResult =
  | { outcome: "SUBMITTED"; stripeRefundId: string }
  | { outcome: "NOOP" };

/**
 * BR-U2B-5 (corrected 2026-08-24): branches on the Order's CURRENT state rather than a single
 * claim-then-submit. PAID claims and persists refundIdempotencyKey; REFUND_PENDING is RESUMABLE
 * (never a dedup-exit) - it loads the already-persisted key and (re-)submits. The Stripe
 * idempotency key is ALWAYS Order.refundIdempotencyKey - never a caller-supplied or step-local
 * value - so a reconciliation-started resumption of the same logical attempt submits with the
 * exact same key a crashed earlier attempt used.
 */
/**
 * Pure branching decision for processRefund's corrected state machine (2026-08-24 founder
 * review) - separated out from the DB/Stripe I/O below so the single most safety-critical fact
 * about this unit ("REFUND_PENDING is RESUMABLE, never a dedup-exit") is deterministically
 * testable without a database. This function makes no I/O and has no side effects.
 */
export type RefundAction = "CLAIM_AND_SUBMIT" | "RESUME_AND_SUBMIT" | "NOOP";

export function decideRefundAction(orderState: OrderState): RefundAction {
  switch (orderState) {
    case OrderState.PAID:
      return "CLAIM_AND_SUBMIT";
    case OrderState.REFUND_PENDING:
      // The corrected behavior: resumable, not a dedup-exit (see module docstring and
      // src/workflows/refund-workflow.ts).
      return "RESUME_AND_SUBMIT";
    case OrderState.REFUNDED:
    case OrderState.REFUND_FAILED:
    case OrderState.PENDING:
    case OrderState.EXPIRED:
      // REFUND_FAILED in particular is never automatically retried in Unit 2B (manual/support
      // resolution only, BR-U2B-5's scope).
      return "NOOP";
  }
}

export async function processRefund(db: Db, stripeClient: StripeClient, orderId: string, reason: RefundReason): Promise<ProcessRefundResult> {
  const order = await getOrderById(db, orderId);
  if (!order) return { outcome: "NOOP" };

  const action = decideRefundAction(order.state);
  if (action === "NOOP") return { outcome: "NOOP" };

  let refundIdempotencyKey: string;

  if (action === "CLAIM_AND_SUBMIT") {
    const key = randomUUID();
    const [claimed] = await db
      .update(orders)
      .set({ state: OrderState.REFUND_PENDING, refundReason: reason, refundIdempotencyKey: key, updatedAt: drizzleSql`now()` })
      .where(and(eq(orders.id, orderId), eq(orders.state, OrderState.PAID)))
      .returning();
    if (claimed) {
      refundIdempotencyKey = key;
    } else {
      // Lost the race - another run already claimed it. Fall through to the REFUND_PENDING
      // branch instead of exiting, so this run still helps ensure Stripe actually gets called.
      const reread = await getOrderById(db, orderId);
      if (reread?.state !== OrderState.REFUND_PENDING || !reread.refundIdempotencyKey) return { outcome: "NOOP" };
      refundIdempotencyKey = reread.refundIdempotencyKey;
    }
  } else {
    // action === "RESUME_AND_SUBMIT" (order.state was already REFUND_PENDING at the top of this
    // function) - resumable, never re-claimed.
    if (!order.refundIdempotencyKey) {
      throw new Error(`Order ${orderId} is REFUND_PENDING with no persisted refundIdempotencyKey - invariant violation.`);
    }
    refundIdempotencyKey = order.refundIdempotencyKey;
  }

  if (!order.stripePaymentIntentId) {
    throw new Error(`Order ${orderId} has no stripePaymentIntentId - cannot submit a refund.`);
  }
  const refund = await stripeClient.createRefund(order.stripePaymentIntentId, refundIdempotencyKey);
  await db.update(orders).set({ stripeRefundId: refund.id, updatedAt: drizzleSql`now()` }).where(eq(orders.id, orderId));
  return { outcome: "SUBMITTED", stripeRefundId: refund.id };
}

export const DEFAULT_REFUND_STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes - infrastructure-design.md's "short grace period," a starting value tuned from real Stripe/Workflow latency data, not treated as final.

/** Reconciliation helper (Cron backstop, infrastructure-design.md check 3): REFUND_PENDING orders
 * with no stripeRefundId recorded, past the staleness threshold - re-starting processRefundWorkflow
 * for these lands directly in its resumable REFUND_PENDING branch, never re-attempting the PAID
 * claim. Kept here, not in checkout-fulfillment, since it is a direct read of this component's own
 * owned state. */
export async function listOrdersNeedingRefundResubmission(db: Db, staleThresholdMs: number = DEFAULT_REFUND_STALE_THRESHOLD_MS): Promise<Order[]> {
  const cutoff = new Date(Date.now() - staleThresholdMs);
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.state, OrderState.REFUND_PENDING), isNull(orders.stripeRefundId)));
  return rows.filter((r) => r.updatedAt <= cutoff).map(rowToOrder);
}
