import { createStripeClient } from "../../../../src/order-payment/stripe-client.js";
import { handleVerifiedWebhook } from "../../../../src/order-payment/repository.js";
import { startFollowUpWorkflow } from "../../../../src/checkout-fulfillment/follow-up";
import { logger } from "../../../../src/shared/logger.js";

const MAX_BODY_BYTES = 65_536;

/**
 * BR-U2B-2/BR-U2B-4: the normal path by which an Order transitions PENDING->PAID, and the only path by which a refund is confirmed
 * REFUND_PENDING->REFUNDED/REFUND_FAILED. (When a webhook is delayed or never arrives, reconcileOrderWithStripe applies PENDING->PAID from an authenticated retrieval of the
 * Order's own Checkout Session by running this same handler's transaction with a synthetic event, and PENDING->EXPIRED by a separate conditional update.) Signature verification happens against the
 * exact raw body Stripe sent - never parsed/re-serialized first. The size bound is enforced BEFORE
 * signature verification, so an oversized payload is rejected cheaply.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!signature || !webhookSecret) {
    return Response.json({ error: "Missing signature." }, { status: 400 });
  }

  const stripeClient = createStripeClient();
  let event;
  try {
    event = stripeClient.constructWebhookEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logger.error("STRIPE_WEBHOOK_SIGNATURE_INVALID", { reason: err instanceof Error ? err.message : "Unknown error." });
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  const result = await handleVerifiedWebhook(event);

  // Started AFTER the atomic transaction inside handleVerifiedWebhook has committed - start() is
  // an external side effect and must never run inside that transaction. If this start() call
  // itself fails or is lost, Cron reconciliation's checks 1/2 catch it (Workflow-Start Idempotency
  // correction) - this response is not the correctness boundary either.
  if (result.startWorkflow) await startFollowUpWorkflow(result.startWorkflow);

  return Response.json({ received: true }, { status: 200 });
}
