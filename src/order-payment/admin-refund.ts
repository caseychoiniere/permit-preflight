/**
 * ADM-6's refund-command decision logic (2026-08-25 correction) - factored out of the admin
 * refund route into a pure, deterministically-testable function. Uses the existing, unmodified
 * `decideRefundAction(order.state)` as the SOLE authoritative branching rule - this file never
 * duplicates Unit 2B's state machine, only translates its 3 outcomes into what the admin route
 * should do next.
 */

import { decideRefundAction } from "./repository.js";
import type { Order, RefundReason } from "./types.js";

export type AdminRefundCommand =
  | {
      outcome: "ALLOW";
      refundReason: RefundReason;
      /** false for a genuinely NEW refund (Order was PAID); true when resuming the SAME logical
       * refund attempt already in flight (Order was REFUND_PENDING) - never a new one. */
      isResumption: boolean;
    }
  | { outcome: "REJECTED"; reason: string };

/**
 * `clientSuppliedRefundReason` is honored ONLY for a new (PAID -> REFUND_PENDING) command - it is
 * always ignored for a resumption, which reads the reason from the Order's own already-persisted
 * `refundReason` instead (which may legitimately be a system-only reason like
 * GENERATION_FAILURE/DUPLICATE_PAYMENT - the operator is not choosing it, merely resuming it).
 */
export function decideAdminRefundCommand(order: Order, clientSuppliedRefundReason: RefundReason | undefined): AdminRefundCommand {
  const action = decideRefundAction(order.state);

  if (action === "CLAIM_AND_SUBMIT") {
    if (!clientSuppliedRefundReason) {
      return { outcome: "REJECTED", reason: "refundReason is required to initiate a new refund." };
    }
    return { outcome: "ALLOW", refundReason: clientSuppliedRefundReason, isResumption: false };
  }

  if (action === "RESUME_AND_SUBMIT") {
    // Data-invariant check only - never invents either value. processRefund/processRefundWorkflow
    // (unmodified) are what actually read/reuse refundIdempotencyKey; this function only confirms
    // it exists before allowing the command through.
    if (!order.refundReason || !order.refundIdempotencyKey) {
      return {
        outcome: "REJECTED",
        reason: "REFUND_PENDING order is missing its persisted refundReason/refundIdempotencyKey - data-invariant problem, refusing to invent either.",
      };
    }
    return { outcome: "ALLOW", refundReason: order.refundReason, isResumption: true };
  }

  // NOOP per decideRefundAction: PENDING/REFUNDED/REFUND_FAILED/EXPIRED.
  return { outcome: "REJECTED", reason: `Order state ${order.state} does not permit a refund command.` };
}
