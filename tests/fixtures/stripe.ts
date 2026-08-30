/**
 * Fake Stripe Checkout Session / webhook Event fixtures matching Stripe's real schema shape
 * (Unit 2B, step 15) - used both by deterministic tests (structural/shape checks) and by the
 * order-payment integration suite (tests/order-payment/*.integration.test.ts), which exercises
 * handleVerifiedWebhook/processRefund against a REAL Neon database using these fake Stripe
 * objects, never a real Stripe API call, so DB-focused Unit 2B correctness can be verified with
 * only DATABASE_URL provisioned (no STRIPE_SECRET_KEY required for those tests).
 *
 * Full `Stripe.Event`/`Stripe.Checkout.Session` types are large discriminated unions with many
 * fields this application never reads - fixtures here populate exactly what
 * order-payment/repository.ts actually reads (event.id, event.type, session.id,
 * session.payment_status, session.client_reference_id, session.customer_details.email,
 * session.payment_intent, refund.id, refund.status, refund.payment_intent) and are cast to the
 * real Stripe types at the boundary, matching this codebase's established fixture discipline
 * (test-only-active-rules.ts, shed-candidate.ts).
 */

import type Stripe from "stripe";

/**
 * Test-isolation correction (2026-08-27, founder-directed): a plain in-process counter reset to 0
 * on every fresh `vitest run` invocation - against a THROWAWAY database that was harmless (each
 * run started from empty), but against a PERSISTENT real Neon staging database it produced the
 * exact same event ID (`evt_test_1`, `evt_test_2`, ...) on every run, colliding with rows the
 * processed-events ledger already inserted on a PRIOR run. Production webhook deduplication then
 * correctly treated the "new" event as already-processed - not a production bug, a fixture-
 * uniqueness bug. Every auto-generated event id is now globally unique (crypto.randomUUID()),
 * with the counter kept only for human-readable ordering in test output, never for uniqueness.
 */
let eventCounter = 0;
function nextEventId(): string {
  eventCounter += 1;
  return `evt_test_${eventCounter}_${crypto.randomUUID()}`;
}

export function makeCheckoutSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: overrides.id ?? `cs_test_${Math.random().toString(36).slice(2)}`,
    object: "checkout.session",
    status: "open",
    payment_status: "unpaid",
    client_reference_id: null,
    customer_details: null,
    payment_intent: null,
    url: "https://checkout.stripe.com/c/pay/cs_test_fake",
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function makeEvent(type: Stripe.Event.Type, dataObject: unknown, overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: overrides.id ?? nextEventId(),
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object: dataObject },
    ...overrides,
  } as unknown as Stripe.Event;
}

/** A completed, paid Checkout Session event - the primary PENDING->PAID trigger. */
export function makeCheckoutSessionCompletedEvent(params: {
  orderId: string;
  sessionId?: string;
  customerEmail?: string;
  paymentIntentId?: string;
  eventId?: string;
}): Stripe.Event {
  const session = makeCheckoutSession({
    id: params.sessionId ?? `cs_test_${params.orderId}`,
    status: "complete",
    payment_status: "paid",
    client_reference_id: params.orderId,
    customer_details: { email: params.customerEmail ?? "guest@example.com" } as Stripe.Checkout.Session.CustomerDetails,
    payment_intent: params.paymentIntentId ?? `pi_test_${params.orderId}`,
  });
  return makeEvent("checkout.session.completed", session, params.eventId ? { id: params.eventId } : {});
}

export function makeCheckoutSessionExpiredEvent(params: { sessionId: string; eventId?: string }): Stripe.Event {
  const session = makeCheckoutSession({ id: params.sessionId, status: "expired", payment_status: "unpaid" });
  return makeEvent("checkout.session.expired", session, params.eventId ? { id: params.eventId } : {});
}

export function makeRefundUpdatedEvent(params: { paymentIntentId: string; status: "pending" | "succeeded" | "failed" | "canceled"; refundId?: string; eventId?: string }): Stripe.Event {
  const refund = {
    id: params.refundId ?? `re_test_${params.paymentIntentId}`,
    object: "refund",
    status: params.status,
    payment_intent: params.paymentIntentId,
  } as unknown as Stripe.Refund;
  return makeEvent("refund.updated", refund, params.eventId ? { id: params.eventId } : {});
}
