import { z } from "zod";
import { getDb } from "../../../../../../src/db/client.js";
import { requireOperatorId, validateReason } from "../../../../../../src/admin-auth/operator.js";
import { approveRule } from "../../../../../../src/regulatory-rule-governance/admin-lifecycle.js";
import { validateAtBoundary } from "../../../../../../src/shared/validation.js";

// `confirm` is a founder-directed deliberate-action safety interlock (2026-09-24), NOT a second
// authentication factor - see admin-lifecycle.ts's approveRule docstring.
const BodySchema = z.object({
  acceptedEvidenceQuality: z.array(z.enum(["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"])),
  confirm: z.string(),
});

/** Rule-lifecycle admin mechanism: TESTED -> APPROVED. `approvedAt` is always server-derived from
 * request time - never accepted from the client. */
export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }

  const { ruleId } = await params;
  const body = (await request.json().catch(() => undefined)) as { reason?: unknown; acceptedEvidenceQuality?: unknown; confirm?: unknown } | undefined;
  const reasonResult = validateReason(body?.reason);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "reason is required.", issues: reasonResult.issues }, { status: 400 });
  }
  const bodyResult = validateAtBoundary(BodySchema, {
    acceptedEvidenceQuality: body?.acceptedEvidenceQuality,
    confirm: body?.confirm,
  });
  if (bodyResult.outcome === "INVALID") {
    return Response.json({ error: "Invalid request body.", issues: bodyResult.issues }, { status: 400 });
  }

  const result = await approveRule(
    getDb(),
    ruleId,
    operatorId,
    reasonResult.data,
    bodyResult.data.acceptedEvidenceQuality,
    bodyResult.data.confirm
  );
  switch (result.outcome) {
    case "NOT_FOUND":
      return Response.json({ error: "Regulatory rule not found." }, { status: 404 });
    case "REJECTED":
      return Response.json({ error: result.reason }, { status: 400 });
    case "CONFLICT":
      return Response.json({ error: "The rule's lifecycle state changed before this request could be applied - reload and retry." }, { status: 409 });
    case "OK":
      return Response.json({ rule: result.rule }, { status: 200 });
  }
}
