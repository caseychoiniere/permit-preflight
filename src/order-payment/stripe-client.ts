/**
 * Concrete Stripe adapter - a narrow wrapper around the official `stripe` SDK, mirroring
 * `rule-research-assistant/anthropic-client.ts`'s shape (env-only credential, structurally
 * distinct instance, throws at construction time if the key is missing - never falls back to a
 * fabricated response).
 *
 * Test/live-mode separation (NFR-U2B-4, infrastructure-design.md): STRIPE_SECRET_KEY is either a
 * test-mode or live-mode key depending on environment - this module has no opinion on which; the
 * environment it runs in decides. Never mixed with a webhook secret of the other mode (enforced
 * by deployment configuration, not by this code).
 */

import Stripe from "stripe";

export interface StripeClientOptions {
  /** Defaults to process.env.STRIPE_SECRET_KEY. Only pass explicitly from a test harness. */
  apiKey?: string;
}

export interface CreateCheckoutSessionParams {
  /** BR-U2B-14: the already-durable internal Order ID, passed as Stripe's client_reference_id so
   * a later webhook can be reconciled even if this application never persisted the resulting
   * session ID. */
  orderId: string;
  priceCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** BR-U2B-14: reused for every retry of THIS specific session-creation call. */
  idempotencyKey: string;
}

/** Constructs a real Stripe-backed client. Throws immediately if no API key is available. */
export function createStripeClient(options: StripeClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env["STRIPE_SECRET_KEY"];
  if (!apiKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. The Stripe-backed client requires a real key at construction " +
        "time - it never falls back to a fabricated response. Set it in .env (see .env.example) or " +
        "pass { apiKey } explicitly. Deterministic tests never construct this client."
    );
  }
  const stripe = new Stripe(apiKey);

  return {
    async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
      return stripe.checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: params.orderId,
          metadata: { orderId: params.orderId },
          line_items: [
            {
              price_data: {
                currency: params.currency,
                unit_amount: params.priceCents,
                product_data: { name: "Permit Preflight Shed Buildability Report" },
              },
              quantity: 1,
            },
          ],
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
        },
        { idempotencyKey: params.idempotencyKey }
      );
    },

    async retrieveCheckoutSession(stripeCheckoutSessionId: string): Promise<Stripe.Checkout.Session> {
      return stripe.checkout.sessions.retrieve(stripeCheckoutSessionId);
    },

    /** Verifies the webhook signature against the exact raw body Stripe requires - throws on an
     * invalid signature (BR-U2B-2/BR-U2B-4). Never parses/re-serializes the body before this call. */
    constructWebhookEvent(rawBody: string | Buffer, signature: string, webhookSecret: string): Stripe.Event {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },

    /** BR-U2B-5: refundIdempotencyKey MUST be the DB-persisted Order.refundIdempotencyKey - never
     * a Vercel Workflow step's stepId (see order-payment/repository.ts's processRefund). */
    async createRefund(stripePaymentIntentId: string, refundIdempotencyKey: string): Promise<Stripe.Refund> {
      return stripe.refunds.create({ payment_intent: stripePaymentIntentId }, { idempotencyKey: refundIdempotencyKey });
    },
  };
}

export type StripeClient = ReturnType<typeof createStripeClient>;
