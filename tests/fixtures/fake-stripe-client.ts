/**
 * A fake StripeClient matching order-payment/stripe-client.ts's StripeClient shape exactly -
 * used by the order-payment integration suite so DB-focused Unit 2B correctness (the corrected
 * refund state machine, checkout resumability, webhook idempotency) can be verified against a
 * real Neon database without a real Stripe API call or STRIPE_SECRET_KEY. Never used to test
 * Stripe integration itself - that is tests/order-payment/stripe-live.integration.test.ts's job
 * (real `stripe` SDK, STRIPE_SECRET_KEY-gated).
 */

import type Stripe from "stripe";
import type { CreateCheckoutSessionParams, StripeClient } from "../../src/order-payment/stripe-client.js";
import { makeCheckoutSession } from "./stripe.js";

export interface FakeStripeClientOptions {
  /** Simulates a live Stripe Checkout Session status different from what a test might otherwise
   * assume - used to exercise Pattern 1's live-Stripe-state-check branch. */
  sessionStatusOverride?: Record<string, { status: Stripe.Checkout.Session.Status; payment_status?: Stripe.Checkout.Session.PaymentStatus }>;
}

export function createFakeStripeClient(options: FakeStripeClientOptions = {}): StripeClient & { createdSessions: CreateCheckoutSessionParams[]; createdRefunds: { paymentIntentId: string; idempotencyKey: string }[] } {
  const createdSessions: CreateCheckoutSessionParams[] = [];
  const createdRefunds: { paymentIntentId: string; idempotencyKey: string }[] = [];
  const sessionsByOrderId = new Map<string, Stripe.Checkout.Session>();

  return {
    createdSessions,
    createdRefunds,
    async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
      createdSessions.push(params);
      const session = makeCheckoutSession({ id: `cs_test_${params.orderId}_${createdSessions.length}`, client_reference_id: params.orderId });
      sessionsByOrderId.set(params.orderId, session);
      return session;
    },
    async retrieveCheckoutSession(stripeCheckoutSessionId: string): Promise<Stripe.Checkout.Session> {
      const override = options.sessionStatusOverride?.[stripeCheckoutSessionId];
      return makeCheckoutSession({
        id: stripeCheckoutSessionId,
        status: override?.status ?? "open",
        payment_status: override?.payment_status ?? "unpaid",
      });
    },
    constructWebhookEvent(): Stripe.Event {
      throw new Error("Fake StripeClient never verifies webhook signatures - tests construct Stripe.Event fixtures directly (see tests/fixtures/stripe.ts).");
    },
    async createRefund(stripePaymentIntentId: string, refundIdempotencyKey: string): Promise<Stripe.Refund> {
      createdRefunds.push({ paymentIntentId: stripePaymentIntentId, idempotencyKey: refundIdempotencyKey });
      return { id: `re_test_${refundIdempotencyKey}`, object: "refund", status: "succeeded", payment_intent: stripePaymentIntentId } as unknown as Stripe.Refund;
    },
  };
}
