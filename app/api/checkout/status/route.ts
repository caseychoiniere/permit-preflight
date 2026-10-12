import { getDb } from "../../../../src/db/client.js";
import { getGuestStatusView } from "../../../../src/checkout-fulfillment/index.js";
import { startFollowUpWorkflow } from "../../../../src/checkout-fulfillment/follow-up";
import { createStripeClient } from "../../../../src/order-payment/stripe-client.js";
import { logger } from "../../../../src/shared/logger.js";
import { GuestOrderStatus } from "../../../../src/order-payment/types.js";
import { CHECKOUT_SESSION_COOKIE, readCookie } from "../../../../src/shared/cookies.js";

/**
 * NFR Design Pattern 4: the unauthenticated guest status-read capability. Corrected 2026-08-25 -
 * the Stripe Checkout Session ID is read from an HttpOnly cookie (set by POST /api/checkout),
 * never from the URL path/query string (see that route's docstring for why). Read-only, no side
 * effects beyond reconciling a PENDING order with Stripe's own record of its Checkout Session (so a delayed or missed webhook cannot strand a paid customer),
 * never exposes internal fields (getGuestStatus's own minimization). `Cache-Control:
 * no-store` per Pattern 4's hardening - a status response must never be cached by an intermediary
 * or the browser.
 */
export async function GET(request: Request) {
  const sessionId = readCookie(request, CHECKOUT_SESSION_COOKIE);
  if (!sessionId) return Response.json({ status: GuestOrderStatus.NOT_FOUND }, { status: 200, headers: { "Cache-Control": "no-store" } });
  try {
    const view = await getGuestStatusView(getDb(), sessionId, { stripeClient: stripeClientOrUndefined(), startWorkflow: startFollowUpWorkflow });
    return Response.json(view, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // A real server failure is reported as one (never a fabricated status); the page keeps retrying and tells the customer it is having trouble.
    logger.error("CHECKOUT_STATUS_READ_FAILED", { reason: err instanceof Error ? err.message : "Unknown error." });
    return Response.json({ error: "Status temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

/** Without a Stripe key the status read is the pure DB read (the app's other Stripe-dependent routes already fail loudly on a missing key). */
function stripeClientOrUndefined() {
  try {
    return createStripeClient();
  } catch {
    return undefined;
  }
}
