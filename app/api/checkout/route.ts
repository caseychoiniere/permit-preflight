import { getDb } from "../../../src/db/client.js";
import { createStripeClient } from "../../../src/order-payment/stripe-client.js";
import { initiateCheckout } from "../../../src/checkout-fulfillment/index.js";
import { resolveAppBaseUrl } from "../../../src/shared/app-url.js";
import { CHECKOUT_SESSION_COOKIE, buildSetCookieHeader } from "../../../src/shared/cookies.js";

const CHECKOUT_SESSION_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60; // 24h - enough for a customer who steps away and checks back later.

/**
 * BR-U2B-9's public-flow entry point (replaces the old INTERNAL_PROTOTYPE-triggering route).
 * `successUrl`/`cancelUrl` are ALWAYS server-constructed, never client-supplied - accepting a
 * client-controlled redirect target here would be an open-redirect risk on a route that produces
 * a real Stripe Checkout Session.
 *
 * Corrected 2026-08-25: `successUrl` is now a CLEAN URL with no Checkout Session ID in its path or
 * query string - Vercel's own platform request logs (Runtime Logs, Log Drains) capture the full
 * Request Path and Search Params, so putting a bearer-capability value there would leak it to a
 * system this application's own logger has no control over. The Checkout Session ID is instead set
 * as an HttpOnly cookie here, read server-side by GET /api/checkout/status.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { screeningRequestId?: unknown };
  if (typeof body.screeningRequestId !== "string" || !body.screeningRequestId) {
    return Response.json({ error: "screeningRequestId is required." }, { status: 400 });
  }

  const baseUrl = resolveAppBaseUrl();
  const result = await initiateCheckout(getDb(), createStripeClient(), {
    screeningRequestId: body.screeningRequestId,
    successUrl: `${baseUrl}/checkout/status`,
    cancelUrl: `${baseUrl}/configure`,
  });

  switch (result.outcome) {
    case "NOT_FOUND":
      return Response.json({ error: "Screening request not found." }, { status: 404 });
    case "NOT_READY":
      return Response.json({ error: result.reason }, { status: 409 });
    case "RECONCILING":
      return Response.json({ error: "Payment status is still being confirmed - try again shortly." }, { status: 409 });
    case "ALREADY_PAID":
      return Response.json({ orderId: result.orderId, alreadyPaid: true }, { status: 200 });
    case "CHECKOUT_URL": {
      const setCookie = buildSetCookieHeader(request, CHECKOUT_SESSION_COOKIE, result.stripeCheckoutSessionId, {
        path: "/api/checkout",
        maxAgeSeconds: CHECKOUT_SESSION_COOKIE_MAX_AGE_SECONDS,
      });
      return Response.json({ checkoutUrl: result.checkoutUrl }, { status: 200, headers: { "Set-Cookie": setCookie } });
    }
  }
}
