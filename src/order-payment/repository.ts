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
import { eq, and, or, ne, isNull, isNotNull, asc, sql as drizzleSql } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db, TransactionalDb } from "../db/client.js";
import { withFulfillmentTransaction } from "../db/client.js";
import { orders, processedStripeEvents, screeningRequests, reportGenerationJobs, type OrderRow } from "../db/schema.js";
import { ReportGenerationJobState } from "../report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../screening-request/authorization.js";
import { reportProductName, type StripeClient } from "./stripe-client.js";
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
/** Thrown inside the PAID-claim savepoint when a concurrent transaction (the webhook, a live Stripe check or the cron backstop) already moved this Order out of PENDING. */
class OrderNoLongerPendingError extends Error {}

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
  /** `startWorkflow` is set only when this call is the one that confirmed the payment from Stripe's own record (the caller starts it after commit). */
  | { outcome: "ALREADY_PAID"; orderId: string; startWorkflow?: WebhookFollowUpWorkflow }
  /** Stripe reports a newer state (paid or expired) than this Order's local PENDING - the
   * webhook that would reconcile it hasn't been processed yet, and Stripe's own record could not be applied (Stripe unreachable, or the payment is still
   * processing). Never locally forged: an Order transitions only from a verified webhook or an authenticated retrieval of its own Checkout Session
   * (reconcileOrderWithStripe), never from a browser redirect or client-supplied status (BR-U2B-2). */
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
    const [requestRow] = await db.select({ projectType: screeningRequests.projectType }).from(screeningRequests).where(eq(screeningRequests.id, order.screeningRequestId));
    const session = await stripeClient.createCheckoutSession({
      orderId: order.id,
      productName: reportProductName(requestRow?.projectType),
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
  // Stripe's own current state. An open session is only DISPLAY/ROUTING (no mutation). A paid or expired one is applied through reconcileOrderWithStripe below (paid: the same
  // transaction a verified webhook runs; expired: a separate conditional update), driven by an authenticated retrieval of this Order's own session, never by anything the browser supplies (BR-U2B-2).
  const session = await stripeClient.retrieveCheckoutSession(order.stripeCheckoutSessionId);
  if (session.status === "open") {
    if (!session.url) throw new Error(`Stripe Checkout Session ${session.id} has no url.`);
    return { outcome: "CHECKOUT_URL", checkoutUrl: session.url, orderId: order.id, stripeCheckoutSessionId: session.id };
  }
  // session.status is "complete" (payment succeeded, our webhook hasn't processed it yet) or "expired" (our expiry webhook hasn't processed it yet, so the local Order is
  // still PENDING). Never reuse the session. Waiting for the webhook alone would strand the customer if it never arrives (an expired session blocks every retry, a paid one
  // never reaches PAID), so Stripe's own record is applied (reconcileOrderWithStripe): a paid session confirms the order through the transaction the webhook uses, an
  // expired one closes it by a conditional update so a fresh checkout can start. Anything else (Stripe unreachable, payment still processing) stays RECONCILING.
  const reconciled = await reconcileOrderWithStripe(db, stripeClient, order);
  if (reconciled.outcome === "CONFIRMED") return { outcome: "ALREADY_PAID", orderId: order.id, ...(reconciled.startWorkflow ? { startWorkflow: reconciled.startWorkflow } : {}) };
  if (reconciled.outcome === "ALREADY_SETTLED") {
    const settled = await getOrderById(db, order.id);
    if (settled && settled.state === OrderState.PAID) return { outcome: "ALREADY_PAID", orderId: order.id };
    if (settled && settled.state === OrderState.EXPIRED) return createCheckoutSession(db, stripeClient, { screeningRequestId: order.screeningRequestId, priceCents: order.priceCents, currency: order.currency, successUrl, cancelUrl });
    return { outcome: "RECONCILING" };
  }
  if (reconciled.outcome === "EXPIRED") return createCheckoutSession(db, stripeClient, { screeningRequestId: order.screeningRequestId, priceCents: order.priceCents, currency: order.currency, successUrl, cancelUrl });
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

  // A signature-valid paid event only proves Stripe emitted it. It confirms THIS order only if it is the order's own Checkout Session, i.e. the id stored when the session was
  // created. Fail closed otherwise - including an order with no stored session id (a crash between insert and persist, BR-U2B-14): the idempotent checkout resumption persists
  // the id, after which Stripe's own record confirms the payment (reconcileOrderWithStripe) or a matching event does. Not recorded in the ledger, so a later matching
  // redelivery of the same event is still processed.
  if (current.stripeCheckoutSessionId !== session.id) {
    logger.error("PAYMENT_SESSION_ORDER_MISMATCH", { orderId, eventSessionId: session.id, orderHasStoredSession: current.stripeCheckoutSessionId !== undefined });
    return { handled: false };
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
      if (!claimed) throw new OrderNoLongerPendingError(`Order ${orderId} was no longer PENDING at update time.`);
    });
    paidHere = true;
  } catch (err) {
    // Lost a benign race for this same Order (another confirmation path committed first): nothing left to do, and nothing to start - the winner starts the workflow.
    if (err instanceof OrderNoLongerPendingError || (err instanceof Error && err.cause instanceof OrderNoLongerPendingError)) return recordProcessed(tx, event, session.id, { handled: true });
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

/**
 * The webhook is the normal way an Order leaves PENDING, but it is not the only truth: Stripe is. If the webhook is delayed, misrouted, rejected or never
 * forwarded (a local listener that is not running, an endpoint outage), a PAID Checkout Session would otherwise leave its Order PENDING forever, and an unpaid
 * or expired one would be indistinguishable from "payment still being confirmed". This asks Stripe directly about the Order's own Checkout Session and, when it
 * is paid, applies the SAME transaction the webhook applies (handleVerifiedWebhook), keyed by a deterministic ledger id per session so a later real webhook for
 * the same payment finds the Order already PAID and does nothing - fulfillment starts exactly once whichever path wins.
 */
export type PaymentReconciliation =
  /** Stripe says paid and this call (or a concurrent one) moved the Order out of PENDING. `startWorkflow` is set only when THIS call created the follow-up work. */
  | { outcome: "CONFIRMED"; startWorkflow?: WebhookFollowUpWorkflow }
  /** The Order was already past PENDING when asked (webhook won the race). */
  | { outcome: "ALREADY_SETTLED" }
  /** Stripe says the Checkout Session expired unpaid; the Order is now EXPIRED. */
  | { outcome: "EXPIRED" }
  /** Stripe says the session is open and unpaid. `checkoutUrl` is the same session's own hosted URL, so resuming never creates a second charge. */
  | { outcome: "AWAITING_PAYMENT"; checkoutUrl?: string }
  /** Stripe has the session complete but payment not yet settled (asynchronous payment method). */
  | { outcome: "PROCESSING" }
  /** Stripe could not be asked, or its answer did not match this Order. The Order stays PENDING; callers show "confirming", never a payment request. */
  | { outcome: "UNKNOWN"; reason: string };

export function reconciliationEventId(stripeCheckoutSessionId: string): string {
  return `reconcile:${stripeCheckoutSessionId}`;
}

export async function reconcileOrderWithStripe(db: Db, stripeClient: Pick<StripeClient, "retrieveCheckoutSession">, order: Order): Promise<PaymentReconciliation> {
  if (order.state !== OrderState.PENDING) return { outcome: "ALREADY_SETTLED" };
  if (!order.stripeCheckoutSessionId) return { outcome: "UNKNOWN", reason: "The order has no Checkout Session." };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripeClient.retrieveCheckoutSession(order.stripeCheckoutSessionId);
  } catch (err) {
    logger.error("PAYMENT_RECONCILIATION_STRIPE_UNAVAILABLE", { orderId: order.id, reason: err instanceof Error ? err.message : "Unknown error." });
    return { outcome: "UNKNOWN", reason: "Stripe could not be reached." };
  }
  if (session.id !== order.stripeCheckoutSessionId || (session.client_reference_id ?? session.metadata?.["orderId"]) !== order.id) {
    logger.error("PAYMENT_RECONCILIATION_SESSION_MISMATCH", { orderId: order.id, sessionId: session.id });
    return { outcome: "UNKNOWN", reason: "Stripe's session does not match this order." };
  }

  if (session.payment_status === "paid") {
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    // A paid session always carries a PaymentIntent; without one the transition cannot be recorded faithfully, and recording the ledger entry anyway would block a retry.
    if (!paymentIntentId) return { outcome: "UNKNOWN", reason: "Stripe reports the session paid but returned no payment." };
    const syntheticEvent = { id: reconciliationEventId(session.id), type: "checkout.session.completed", data: { object: session } } as unknown as Stripe.Event;
    try {
      const result = await handleVerifiedWebhook(syntheticEvent);
      return { outcome: "CONFIRMED", startWorkflow: result.startWorkflow };
    } catch (err) {
      logger.error("PAYMENT_RECONCILIATION_TRANSITION_FAILED", { orderId: order.id, reason: err instanceof Error ? err.message : "Unknown error." });
      const refreshed = await getOrderById(db, order.id);
      if (refreshed && refreshed.state !== OrderState.PENDING) return { outcome: "ALREADY_SETTLED" };
      return { outcome: "UNKNOWN", reason: "The payment could not be recorded yet." };
    }
  }

  if (session.status === "expired") {
    const [closed] = await db
      .update(orders)
      .set({ state: OrderState.EXPIRED, updatedAt: drizzleSql`now()` })
      .where(and(eq(orders.id, order.id), eq(orders.state, OrderState.PENDING)))
      .returning({ id: orders.id });
    // Lost the race (a payment confirmation committed first): report what is actually true, never a terminal EXPIRED that was not committed.
    if (!closed) return { outcome: "ALREADY_SETTLED" };
    return { outcome: "EXPIRED" };
  }
  if (session.status === "complete") return { outcome: "PROCESSING" };
  return { outcome: "AWAITING_PAYMENT", checkoutUrl: session.url ?? undefined };
}

/**
 * PENDING Orders old enough that the webhook should long since have arrived, least-recently-checked first (`updated_at` doubles as the last-checked stamp for a
 * PENDING order - see markPendingOrderChecked), so a batch limit can never starve later rows. There is deliberately no maximum age: a paid session is recoverable
 * however old it is, and the set drains by itself - paid becomes PAID, an expired session becomes EXPIRED.
 */
export async function listStalePendingOrders(db: Db, minAgeMs: number, limit: number): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.state, OrderState.PENDING), isNotNull(orders.stripeCheckoutSessionId), drizzleSql`${orders.createdAt} <= ${new Date(Date.now() - minAgeMs)}`))
    .orderBy(asc(orders.updatedAt), asc(orders.id))
    .limit(limit);
  return rows.map(rowToOrder);
}

/** Moves a still-PENDING order to the back of the cron queue after it was checked and left unresolved. A no-op once the order has left PENDING. */
export async function markPendingOrderChecked(db: Db, orderId: string): Promise<void> {
  await db.update(orders).set({ updatedAt: drizzleSql`now()` }).where(and(eq(orders.id, orderId), eq(orders.state, OrderState.PENDING)));
}
