import { describe, expect, it } from "vitest";
import { toAdminOrderView } from "../../src/order-payment/admin-view.js";
import type { Order } from "../../src/order-payment/types.js";
import { OrderState, RefundReason } from "../../src/order-payment/types.js";

function fullOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    screeningRequestId: "screening-1",
    state: OrderState.PAID,
    priceCents: 999,
    currency: "usd",
    checkoutCreationIdempotencyKey: "SENSITIVE-idempotency-key",
    stripeCheckoutSessionId: "SENSITIVE-cs_test_abc123",
    stripePaymentIntentId: "pi_test_abc123",
    customerEmail: "customer@example.com",
    paidAt: "2026-08-25T00:00:00.000Z",
    refundReason: RefundReason.CUSTOMER_REQUEST,
    refundIdempotencyKey: "SENSITIVE-refund-idempotency-key",
    stripeRefundId: "re_test_abc123",
    refundConfirmedAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("toAdminOrderView (2026-08-25 correction - admin order response minimization)", () => {
  it("[hard invariant] never includes checkoutCreationIdempotencyKey, refundIdempotencyKey, or stripeCheckoutSessionId", () => {
    const view = toAdminOrderView(fullOrder());
    const serialized = JSON.stringify(view);
    expect(view).not.toHaveProperty("checkoutCreationIdempotencyKey");
    expect(view).not.toHaveProperty("refundIdempotencyKey");
    expect(view).not.toHaveProperty("stripeCheckoutSessionId");
    // Belt-and-suspenders: the sensitive VALUES must not leak into the serialized view under any
    // key name either.
    expect(serialized).not.toContain("SENSITIVE-idempotency-key");
    expect(serialized).not.toContain("SENSITIVE-cs_test_abc123");
    expect(serialized).not.toContain("SENSITIVE-refund-idempotency-key");
  });

  it("includes the operationally-useful fields, including stripePaymentIntentId for Stripe support diagnosis", () => {
    const view = toAdminOrderView(fullOrder());
    expect(view).toEqual({
      id: "order-1",
      screeningRequestId: "screening-1",
      state: OrderState.PAID,
      priceCents: 999,
      currency: "usd",
      customerEmail: "customer@example.com",
      paidAt: "2026-08-25T00:00:00.000Z",
      refundReason: RefundReason.CUSTOMER_REQUEST,
      stripePaymentIntentId: "pi_test_abc123",
      stripeRefundId: "re_test_abc123",
      refundConfirmedAt: "2026-08-26T00:00:00.000Z",
    });
  });

  it("omits optional fields entirely (not null) when absent on the domain object", () => {
    const view = toAdminOrderView(
      fullOrder({
        stripePaymentIntentId: undefined,
        customerEmail: undefined,
        paidAt: undefined,
        refundReason: undefined,
        stripeRefundId: undefined,
        refundConfirmedAt: undefined,
      })
    );
    expect(view).toEqual({
      id: "order-1",
      screeningRequestId: "screening-1",
      state: OrderState.PAID,
      priceCents: 999,
      currency: "usd",
    });
  });
});
