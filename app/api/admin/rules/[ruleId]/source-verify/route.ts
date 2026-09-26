import { z } from "zod";
import { getDb } from "../../../../../../src/db/client.js";
import { requireOperatorId, validateReason } from "../../../../../../src/admin-auth/operator.js";
import { sourceVerifyRule } from "../../../../../../src/regulatory-rule-governance/admin-lifecycle.js";
import { validateAtBoundary } from "../../../../../../src/shared/validation.js";

// TIER_1 only - Tier-2 source-verification is out of scope for this mechanism entirely (see
// admin-lifecycle.ts's sourceVerifyRule docstring). No escalatedProfessional field is accepted:
// a client-supplied claim of a professional opinion, validated only by shape, would let anyone
// with admin access assert one was obtained without any check that it genuinely was.
const BodySchema = z.object({ tier: z.literal("TIER_1") });

/** Rule-lifecycle admin mechanism: TRIAGED -> SOURCE_VERIFIED (Tier 1 only).
 * `founderVerifiedAt` is never accepted from the client - always server-derived from request time. */
export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }

  const { ruleId } = await params;
  const body = (await request.json().catch(() => undefined)) as { reason?: unknown; tier?: unknown } | undefined;
  const reasonResult = validateReason(body?.reason);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "reason is required.", issues: reasonResult.issues }, { status: 400 });
  }
  const bodyResult = validateAtBoundary(BodySchema, { tier: body?.tier });
  if (bodyResult.outcome === "INVALID") {
    return Response.json({ error: "Invalid request body - only tier: \"TIER_1\" is accepted by this route.", issues: bodyResult.issues }, { status: 400 });
  }

  const result = await sourceVerifyRule(getDb(), ruleId, operatorId, reasonResult.data, bodyResult.data.tier);
  switch (result.outcome) {
    case "NOT_FOUND":
      return Response.json({ error: "Regulatory rule not found." }, { status: 404 });
    case "REJECTED":
    case "NOT_SUPPORTED":
      return Response.json({ error: result.reason }, { status: 400 });
    case "CONFLICT":
      return Response.json({ error: "The rule's lifecycle state changed before this request could be applied - reload and retry." }, { status: 409 });
    case "OK":
      return Response.json({ rule: result.rule }, { status: 200 });
  }
}
