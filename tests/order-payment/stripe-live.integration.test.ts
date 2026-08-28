/**
 * Live Stripe test-mode integration test - real Checkout Session creation against Stripe's own
 * API, activated by STRIPE_SECRET_KEY, skipping cleanly otherwise. Same pattern as every existing
 * King County/Anthropic/Neon live-integration test in this codebase. NOT executed in this Code
 * Generation session - no STRIPE_SECRET_KEY provisioned in this sandbox. Uses only Stripe's own
 * test-mode Checkout Session API (no real charge is ever created by this test).
 */

import { describe, expect, it } from "vitest";
import { createStripeClient } from "../../src/order-payment/stripe-client.js";

const hasStripeKey = Boolean(process.env["STRIPE_SECRET_KEY"]);

describe.skipIf(!hasStripeKey)("Stripe Checkout Session - live test-mode integration", () => {
  it("creates a real test-mode Checkout Session with server-authoritative amount/currency and orderId correlation, then retrieves it", async () => {
    const client = createStripeClient();
    const orderId = `test-order-${crypto.randomUUID()}`;

    const session = await client.createCheckoutSession({
      orderId,
      priceCents: 999,
      currency: "usd",
      successUrl: "https://example.com/checkout/status",
      cancelUrl: "https://example.com/configure",
      idempotencyKey: crypto.randomUUID(),
    });

    expect(session.id).toMatch(/^cs_/);
    expect(session.client_reference_id).toBe(orderId);
    expect(session.amount_total).toBe(999);
    expect(session.currency).toBe("usd");
    expect(session.url).toBeTruthy();

    const retrieved = await client.retrieveCheckoutSession(session.id);
    expect(retrieved.id).toBe(session.id);
    expect(retrieved.status).toBe("open");
  });

  it("reusing the same idempotencyKey for a second createCheckoutSession call returns the SAME Stripe session, not a new one", async () => {
    const client = createStripeClient();
    const orderId = `test-order-${crypto.randomUUID()}`;
    const idempotencyKey = crypto.randomUUID();
    const params = { orderId, priceCents: 999, currency: "usd", successUrl: "https://example.com/success", cancelUrl: "https://example.com/cancel", idempotencyKey };

    const first = await client.createCheckoutSession(params);
    const second = await client.createCheckoutSession(params);

    expect(second.id).toBe(first.id);
  });
});

describe.skipIf(hasStripeKey)("Stripe Checkout Session - live test-mode integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasStripeKey).toBe(false); // STRIPE_SECRET_KEY not provisioned in this environment.
  });
});
