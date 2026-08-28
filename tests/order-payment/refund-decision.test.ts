/**
 * decideRefundAction is the single most safety-critical piece of logic in Unit 2B (the exact
 * thing the 2026-08-24 founder review corrected): REFUND_PENDING must be RESUMABLE, never a
 * dedup-exit. Tested here as a pure function, deterministically, with no database.
 */

import { describe, expect, it } from "vitest";
import { decideRefundAction } from "../../src/order-payment/repository.js";
import { OrderState } from "../../src/order-payment/types.js";

describe("decideRefundAction", () => {
  it("PAID -> CLAIM_AND_SUBMIT", () => {
    expect(decideRefundAction(OrderState.PAID)).toBe("CLAIM_AND_SUBMIT");
  });

  it("[hard invariant, corrected 2026-08-24] REFUND_PENDING -> RESUME_AND_SUBMIT, never a dedup-exit", () => {
    // This is the exact bug the founder review caught: an earlier design treated REFUND_PENDING
    // as "someone else already has it, exit" - which would strand a refund interrupted between
    // the local claim and the Stripe call. It must always resume, never NOOP.
    expect(decideRefundAction(OrderState.REFUND_PENDING)).toBe("RESUME_AND_SUBMIT");
    expect(decideRefundAction(OrderState.REFUND_PENDING)).not.toBe("NOOP");
  });

  it("REFUNDED -> NOOP (nothing to do)", () => {
    expect(decideRefundAction(OrderState.REFUNDED)).toBe("NOOP");
  });

  it("REFUND_FAILED -> NOOP (manual/support resolution only, never auto-retried)", () => {
    expect(decideRefundAction(OrderState.REFUND_FAILED)).toBe("NOOP");
  });

  it("PENDING -> NOOP (not a valid refund-workflow starting state)", () => {
    expect(decideRefundAction(OrderState.PENDING)).toBe("NOOP");
  });

  it("EXPIRED -> NOOP (not a valid refund-workflow starting state)", () => {
    expect(decideRefundAction(OrderState.EXPIRED)).toBe("NOOP");
  });
});
