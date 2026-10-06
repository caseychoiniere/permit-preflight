import { z } from "zod";
import { getDb } from "../../../../../../src/db/client.js";
import { requireOperatorId, validateReason } from "../../../../../../src/admin-auth/operator.js";
import { recordProfessionalReview } from "../../../../../../src/regulatory-rule-governance/admin-lifecycle.js";
import { validateAtBoundary } from "../../../../../../src/shared/validation.js";
import { ProfessionType } from "../../../../../../src/regulatory-rule-governance/types.js";

const BodySchema = z.object({
  reviewerIdentity: z.string(),
  reviewerRole: z.enum(Object.values(ProfessionType) as [string, ...string[]]),
  reviewDate: z.string(),
  sourceProvisions: z.array(z.string()),
  conclusion: z.string(),
  limitations: z.string(),
  evidenceRefs: z.array(z.string()),
  suitableForDeterministicOrFailClosedUse: z.boolean(),
  confirm: z.string(),
});

/** Records Tier-2 professional-review evidence (append-only). Records an opinion a human professional
 * produced; never generates one. The existing single-operator admin identity is the recorder. */
export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }

  const { ruleId } = await params;
  const raw = (await request.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  const reasonResult = validateReason(raw?.["reason"]);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "reason is required.", issues: reasonResult.issues }, { status: 400 });
  }
  const bodyResult = validateAtBoundary(BodySchema, raw ? { ...raw, reason: undefined } : undefined);
  if (bodyResult.outcome === "INVALID") {
    return Response.json({ error: "Invalid request body.", issues: bodyResult.issues }, { status: 400 });
  }
  const { confirm, ...review } = bodyResult.data;

  const result = await recordProfessionalReview(getDb(), ruleId, operatorId, reasonResult.data, review as never, confirm);
  switch (result.outcome) {
    case "NOT_FOUND":
      return Response.json({ error: "Regulatory rule not found." }, { status: 404 });
    case "REJECTED":
      return Response.json({ error: result.reason }, { status: 400 });
    case "OK":
      return Response.json({ reviewId: result.reviewId }, { status: 200 });
  }
}
