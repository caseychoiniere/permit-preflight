/**
 * BR-U2B-4 step 1: signature verification against the exact raw body, before any event data is
 * trusted. `constructWebhookEvent`'s signature check is a local/offline HMAC computation (no
 * network call), so this is genuinely deterministic - a syntactically-valid fake API key never
 * makes a request for this operation. `generateTestHeaderString` is Stripe's own documented
 * testing utility for this exact purpose.
 */

import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { createStripeClient } from "../../src/order-payment/stripe-client.js";

const FAKE_API_KEY = "sk_test_fake_never_sent_over_network";
const WEBHOOK_SECRET = "whsec_test_fixture_secret";

describe("StripeClient.constructWebhookEvent", () => {
  it("accepts a correctly-signed payload and returns the parsed event", () => {
    const client = createStripeClient({ apiKey: FAKE_API_KEY });
    const payload = JSON.stringify({ id: "evt_test_1", object: "event", type: "checkout.session.completed" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

    const event = client.constructWebhookEvent(payload, header, WEBHOOK_SECRET);
    expect(event.id).toBe("evt_test_1");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("[hard invariant] rejects a payload whose signature does not match (tampered body)", () => {
    const client = createStripeClient({ apiKey: FAKE_API_KEY });
    const originalPayload = JSON.stringify({ id: "evt_test_2", object: "event", type: "checkout.session.completed" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload: originalPayload, secret: WEBHOOK_SECRET });

    const tamperedPayload = JSON.stringify({ id: "evt_test_2", object: "event", type: "checkout.session.expired" });
    expect(() => client.constructWebhookEvent(tamperedPayload, header, WEBHOOK_SECRET)).toThrow();
  });

  it("[hard invariant] rejects a payload signed with a different webhook secret", () => {
    const client = createStripeClient({ apiKey: FAKE_API_KEY });
    const payload = JSON.stringify({ id: "evt_test_3", object: "event", type: "checkout.session.completed" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong_secret" });

    expect(() => client.constructWebhookEvent(payload, header, WEBHOOK_SECRET)).toThrow();
  });
});
