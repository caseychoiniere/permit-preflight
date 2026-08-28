import { getDb } from "../../../../../src/db/client.js";
import { getRuleById } from "../../../../../src/regulatory-rule-governance/repository.js";

/** ADM-2: rule/version inspection, read-only. */
export async function GET(_request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params;
  const rule = await getRuleById(getDb(), ruleId);
  if (!rule) {
    return Response.json({ error: "Regulatory rule not found." }, { status: 404 });
  }
  return Response.json({ rule });
}
