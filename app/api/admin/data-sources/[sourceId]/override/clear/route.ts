import { getDb, withAdminTransaction } from "../../../../../../../src/db/client.js";
import { requireOperatorId, validateReason } from "../../../../../../../src/admin-auth/operator.js";
import { clearManualOverride, getSourceHealth } from "../../../../../../../src/data-source-registry/index.js";
import { recordAdminAction } from "../../../../../../../src/admin-action-log/repository.js";
import { AdminActionType, AdminTargetType } from "../../../../../../../src/admin-action-log/types.js";

/** ADM-8 (clear): reverts effectiveHealthState to whatever observedHealthState already is,
 * immediately - no wait for a future ingestion result. Still requires a non-empty justification
 * (corrected 2026-08-25) - it is still an operator command, even though its effect is "revert to
 * the current observed value" rather than setting a new one; the request body must not be empty.
 * Same atomic-transaction pattern as the other 3 local mutations. */
export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }

  const { sourceId } = await params;
  const body = (await request.json().catch(() => undefined)) as { reason?: unknown } | undefined;
  const reasonResult = validateReason(body?.reason);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "reason is required.", issues: reasonResult.issues }, { status: 400 });
  }

  await withAdminTransaction(async (tx) => {
    await clearManualOverride(tx, sourceId);
    await recordAdminAction(tx, {
      operatorId,
      actionType: AdminActionType.DATA_SOURCE_OVERRIDE_CLEARED,
      targetType: AdminTargetType.DATA_SOURCE,
      targetId: sourceId,
      reason: reasonResult.data,
    });
  });

  const snapshot = await getSourceHealth(getDb(), sourceId);
  return Response.json({ source: snapshot }, { status: 200 });
}
