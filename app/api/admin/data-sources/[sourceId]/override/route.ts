import { z } from "zod";
import { getDb, withAdminTransaction } from "../../../../../../src/db/client.js";
import { requireOperatorId, validateReason } from "../../../../../../src/admin-auth/operator.js";
import { setManualOverride, getSourceHealth, SourceHealthState } from "../../../../../../src/data-source-registry/index.js";
import { recordAdminAction } from "../../../../../../src/admin-action-log/repository.js";
import { AdminActionType, AdminTargetType } from "../../../../../../src/admin-action-log/types.js";
import { validateAtBoundary } from "../../../../../../src/shared/validation.js";

// Matches the Functional-Design-approved AdminActionType vocabulary exactly: the only "set
// override" action type is DATA_SOURCE_MARKED_UNHEALTHY - overriding a source to HEALTHY (which
// would suppress a real automated UNHEALTHY signal) was never named in the approved action-type
// list and is not implemented here; only UNHEALTHY is a legal override value via this route.
const OverrideSetBodySchema = z.object({
  state: z.literal(SourceHealthState.UNHEALTHY),
  reason: z.unknown(),
});

/** ADM-8 (set): admin proactively marks a source UNHEALTHY (e.g. a known outage not yet detected
 * automatically). Same atomic-transaction pattern as rule disable/re-enable - the domain mutation
 * and its AdminActionLog entry commit together inside one withAdminTransaction. Requires a
 * non-empty body - clearing later requires its own separate justification too. */
export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }

  const { sourceId } = await params;
  const rawBody = (await request.json().catch(() => undefined)) as unknown;
  const validated = validateAtBoundary(OverrideSetBodySchema, rawBody);
  if (validated.outcome === "INVALID") {
    return Response.json({ error: "Validation failed.", issues: validated.issues }, { status: 400 });
  }

  const reasonResult = validateReason(validated.data.reason);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "reason is required.", issues: reasonResult.issues }, { status: 400 });
  }

  await withAdminTransaction(async (tx) => {
    await setManualOverride(tx, sourceId, validated.data.state);
    await recordAdminAction(tx, {
      operatorId,
      actionType: AdminActionType.DATA_SOURCE_MARKED_UNHEALTHY,
      targetType: AdminTargetType.DATA_SOURCE,
      targetId: sourceId,
      reason: reasonResult.data,
    });
  });

  const snapshot = await getSourceHealth(getDb(), sourceId);
  return Response.json({ source: snapshot }, { status: 200 });
}
