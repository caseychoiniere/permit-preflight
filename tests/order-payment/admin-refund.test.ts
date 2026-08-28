import { describe, expect, it } from "vitest";
import { decideAdminRefundCommand } from "../../src/order-payment/admin-refund.js";
import type { Order } from "../../src/order-payment/types.js";
import { OrderState, RefundReason } from "../../src/order-payment/types.js";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    screeningRequestId: "screening-1",
    state: OrderState.PAID,
    priceCents: 999,
    currency: "usd",
    checkoutCreationIdempotencyKey: "ccik-1",
    ...overrides,
  };
}

describe("ADM-6 decideAdminRefundCommand (2026-08-25 correction - preserves REFUND_PENDING resumability)", () => {
  it("(1) PAID allows a NEW CUSTOMER_REQUEST refund command", () => {
    const result = decideAdminRefundCommand(baseOrder({ state: OrderState.PAID }), RefundReason.CUSTOMER_REQUEST);
    expect(result).toEqual({ outcome: "ALLOW", refundReason: RefundReason.CUSTOMER_REQUEST, isResumption: false });
  });

  it("(1) PAID allows a NEW GOODWILL refund command", () => {
    const result = decideAdminRefundCommand(baseOrder({ state: OrderState.PAID }), RefundReason.GOODWILL);
    expect(result).toEqual({ outcome: "ALLOW", refundReason: RefundReason.GOODWILL, isResumption: false });
  });

  it("[hard invariant] PAID rejects a NEW refund with no refundReason supplied (never defaults one)", () => {
    const result = decideAdminRefundCommand(baseOrder({ state: OrderState.PAID }), undefined);
    expect(result.outcome).toBe("REJECTED");
  });

  it("(2)+(3) REFUND_PENDING allows resumption, using the EXISTING persisted refundReason", () => {
    const order = baseOrder({
      state: OrderState.REFUND_PENDING,
      refundReason: RefundReason.GENERATION_FAILURE, // a system-only reason - legitimately already persisted
      refundIdempotencyKey: "existing-refund-key-123",
    });
    const result = decideAdminRefundCommand(order, undefined);
    expect(result).toEqual({ outcome: "ALLOW", refundReason: RefundReason.GENERATION_FAILURE, isResumption: true });
  });

  it("(4) [hard invariant] REFUND_PENDING resumption does NOT allow the client to substitute a new refund reason", () => {
    const order = baseOrder({
      state: OrderState.REFUND_PENDING,
      refundReason: RefundReason.CUSTOMER_REQUEST, // the real, already-persisted reason
      refundIdempotencyKey: "existing-refund-key-123",
    });
    // Client attempts to supply a DIFFERENT reason (GOODWILL) - must be ignored entirely.
    const result = decideAdminRefundCommand(order, RefundReason.GOODWILL);
    expect(result.outcome).toBe("ALLOW");
    if (result.outcome === "ALLOW") {
      expect(result.refundReason).toBe(RefundReason.CUSTOMER_REQUEST); // NOT GOODWILL
    }
  });

  it("(5) REFUND_PENDING resumption requires the existing refundIdempotencyKey to be present - never invents one, never returns a new one", () => {
    const order = baseOrder({
      state: OrderState.REFUND_PENDING,
      refundReason: RefundReason.CUSTOMER_REQUEST,
      refundIdempotencyKey: "existing-refund-key-123",
    });
    const result = decideAdminRefundCommand(order, undefined);
    expect(result.outcome).toBe("ALLOW");
    // decideAdminRefundCommand's own return type carries no idempotency key at all - convergence
    // through the existing key happens entirely inside the unmodified processRefund/
    // processRefundWorkflow, which read it directly off the Order row this function only checked
    // for presence on.
    expect(result).not.toHaveProperty("refundIdempotencyKey");
  });

  it("[hard invariant] REFUND_PENDING with a missing persisted refundReason fails closed rather than inventing one", () => {
    const order = baseOrder({ state: OrderState.REFUND_PENDING, refundIdempotencyKey: "existing-refund-key-123" });
    const result = decideAdminRefundCommand(order, undefined);
    expect(result.outcome).toBe("REJECTED");
  });

  it("[hard invariant] REFUND_PENDING with a missing persisted refundIdempotencyKey fails closed rather than inventing one", () => {
    const order = baseOrder({ state: OrderState.REFUND_PENDING, refundReason: RefundReason.CUSTOMER_REQUEST });
    const result = decideAdminRefundCommand(order, undefined);
    expect(result.outcome).toBe("REJECTED");
  });

  it.each([OrderState.PENDING, OrderState.REFUNDED, OrderState.REFUND_FAILED, OrderState.EXPIRED])(
    "(6-9) [hard invariant] %s rejects the refund command (no AdminActionLog/start() should ever be reached)",
    (state) => {
      const result = decideAdminRefundCommand(baseOrder({ state }), RefundReason.CUSTOMER_REQUEST);
      expect(result.outcome).toBe("REJECTED");
    }
  );
});
