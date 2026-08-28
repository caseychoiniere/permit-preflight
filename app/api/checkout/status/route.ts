import { getDb } from "../../../../src/db/client.js";
import { getGuestStatus } from "../../../../src/checkout-fulfillment/index.js";
import { GuestOrderStatus } from "../../../../src/order-payment/types.js";
import { CHECKOUT_SESSION_COOKIE, readCookie } from "../../../../src/shared/cookies.js";

/**
 * NFR Design Pattern 4: the unauthenticated guest status-read capability. Corrected 2026-08-25 -
 * the Stripe Checkout Session ID is read from an HttpOnly cookie (set by POST /api/checkout),
 * never from the URL path/query string (see that route's docstring for why). Read-only, no side
 * effects, never exposes internal fields (getGuestStatus's own minimization). `Cache-Control:
 * no-store` per Pattern 4's hardening - a status response must never be cached by an intermediary
 * or the browser.
 */
export async function GET(request: Request) {
  const sessionId = readCookie(request, CHECKOUT_SESSION_COOKIE);
  const status = sessionId ? await getGuestStatus(getDb(), sessionId) : GuestOrderStatus.NOT_FOUND;
  return Response.json({ status }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
