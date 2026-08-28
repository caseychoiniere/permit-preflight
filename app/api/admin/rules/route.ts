import { getDb } from "../../../../src/db/client.js";
import { listRules } from "../../../../src/regulatory-rule-governance/repository.js";

/** ADM-2: rule/version inspection, read-only. */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const applicableProjectType = searchParams.get("applicableProjectType") ?? undefined;
  const applicableZone = searchParams.get("applicableZone") ?? undefined;

  const rules = await listRules(getDb(), { applicableProjectType, applicableZone });
  return Response.json({ rules });
}
