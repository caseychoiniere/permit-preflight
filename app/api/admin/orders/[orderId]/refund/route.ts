import { z } from "zod";
import { start } from "workflow/api";
import { getDb } from "../../../../../../src/db/client.js";
import { getOrderById } from "../../../../../../src/order-payment/repository.js";
import { decideAdminRefundCommand } from "../../../../../../src/order-payment/admin-refund.js";
import { RefundReason } from "../../../../../../src/order-payment/types.js";
import { requireOperatorId, validateReason } from "../../../../../../src/admin-auth/operator.js";
import { recordAdminAction } from "../../../../../../src/admin-action-log/repository.js";
import { AdminActionType, AdminTargetType } from "../../../../../../src/admin-action-log/types.js";
import { validateAtBoundary } from "../../../../../../src/shared/validation.js";
// No ".js" suffix (matches checkout-fulfillment/index.ts's own comment on the same import) -
// required for the Workflow SDK's own build-time discovery to correctly resolve this file.
import { processRefundWorkflow } from "../../../../../../src/workflows/refund-workflow";

// Only the two operator-selectable reasons - GENERATION_FAILURE/DUPLICATE_PAYMENT are
// system-only and are never offered as a choice when originating a NEW PAID -> REFUND_PENDING
// admin refund (a REFUND_PENDING order may still legitimately carry one of those as its EXISTING
// persisted reason when resuming - see the RESUME_AND_SUBMIT branch below, which never lets the
// client choose a reason at all).
const AdminRefundClosedChoice = z.enum([RefundReason.CUSTOMER_REQUEST, RefundReason.GOODWILL]);
const AdminRefundBodySchema = z.object({
  // Required for a NEW refund (Order currently PAID); ignored - never substituted - when resuming
  // an existing REFUND_PENDING refund, since that is not a new logical refund.
  refundReason: AdminRefundClosedChoice.optional(),
  justification: z.unknown(),
});

/**
 * ADM-6: admin-initiated refund. Corrected 2026-08-25 (twice): (1) the request body distinguishes
 * the machine-readable RefundReason (Unit 2B) from the operator's human justification
 * (AdminActionLog.reason) - the free-text justification is NEVER passed into RefundReason; (2)
 * preserves Unit 2B's REFUND_PENDING resumability instead of only allowing a refund command from
 * PAID - uses the existing, unmodified `decideRefundAction(order.state)` as the SOLE authoritative
 * branching rule (never a duplicated state machine):
 *
 * - `CLAIM_AND_SUBMIT` (Order is PAID): a genuinely NEW admin refund command. The operator
 *   chooses CUSTOMER_REQUEST or GOODWILL and supplies a justification.
 * - `RESUME_AND_SUBMIT` (Order is REFUND_PENDING): NOT a new refund - a transport/workflow
 *   resumption of the SAME logical refund attempt already in flight. The operator supplies only a
 *   new justification explaining why they are manually retrying/resuming it; the reason itself is
 *   read from the Order's own already-persisted `refundReason` (which may legitimately be a
 *   system-only reason like GENERATION_FAILURE/DUPLICATE_PAYMENT - the operator is not choosing
 *   it, merely resuming it) and is never accepted from the request body. If the persisted
 *   `refundReason`/`refundIdempotencyKey` are somehow missing, this is a data-invariant problem -
 *   fails closed rather than inventing either value.
 * - `NOOP` (PENDING/REFUNDED/REFUND_FAILED/EXPIRED): rejected with 409 - no `AdminActionLog` entry
 *   written, `start()` never called. REFUND_FAILED in particular stays manual/support-resolution
 *   only (BR-U2B-5) - never automatically reopened by this route.
 *
 * Sequencing (NFR Design Pattern 5, exact) for both allowed branches: validate ADMIN_OPERATOR_ID
 * -> validate justification -> validate Order state permits the command -> recordAdminAction(),
 * awaited to commit -> only then start(processRefundWorkflow, [orderId, refundReason]). Does not
 * call processRefund directly, does not modify order-payment/repository.ts's decideRefundAction or
 * refund-workflow.ts - this is a thin caller reusing the exact same start() call shape 3 existing
 * Unit 2B call sites already use.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }

  const { orderId } = await params;
  const rawBody = (await request.json().catch(() => undefined)) as unknown;
  const validated = validateAtBoundary(AdminRefundBodySchema, rawBody);
  if (validated.outcome === "INVALID") {
    return Response.json({ error: "Validation failed.", issues: validated.issues }, { status: 400 });
  }

  const reasonResult = validateReason(validated.data.justification);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "justification is required.", issues: reasonResult.issues }, { status: 400 });
  }
  const justification = reasonResult.data;

  const db = getDb();
  const order = await getOrderById(db, orderId);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  const command = decideAdminRefundCommand(order, validated.data.refundReason);
  if (command.outcome === "REJECTED") {
    return Response.json({ error: command.reason }, { status: 409 });
  }

  await recordAdminAction(db, {
    operatorId,
    actionType: AdminActionType.REFUND_INITIATED,
    targetType: AdminTargetType.ORDER,
    targetId: orderId,
    reason: justification,
    metadata: { refundReason: command.refundReason },
  });

  await start(processRefundWorkflow, [orderId, command.refundReason]);

  // Command accepted; confirmation is pending - only a verified Stripe webhook produces the
  // terminal REFUNDED state. The Order may still read PAID/REFUND_PENDING briefly after this
  // returns, since Workflow execution is asynchronous.
  return Response.json({ outcome: command.isResumption ? "REFUND_RESUMED" : "REFUND_INITIATED" }, { status: 202 });
}
