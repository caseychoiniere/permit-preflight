/**
 * Writes the zoning coverage matrix (citywide zoning coverage): aidlc-docs/operations/zoning-coverage-matrix.{md,json}. Read-only against the database:
 * the "live" view uses ACTIVE rules, the "planned" view ACTIVE plus APPROVED. Run: npx tsx scripts/zoning-coverage-matrix.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { regulatoryRules } from "../src/db/schema.js";
import { listActiveRulesForProject } from "../src/regulatory-rule-governance/repository.js";
import type { RegulatoryRule } from "../src/regulatory-rule-governance/types.js";
import { parseZoningString } from "../src/zoning/designation.js";
import { buildCoverageMatrix, renderCoverageMatrixMarkdown } from "../src/zoning/coverage-matrix.js";

process.loadEnvFile(".env.local");

async function main() {
  const db = getDb();
  const designations: { ZONING: string }[] = JSON.parse(readFileSync(new URL("../tests/fixtures/seattle-zoning-designations.json", import.meta.url), "utf8"));
  const byCode = new Map<string, string>();
  for (const { ZONING } of designations) {
    const d = parseZoningString(ZONING);
    if (d.family === "UNKNOWN" || d.majorInstitutionOverlay || d.residentialCommercial || d.unrecognizedSuffixes.length > 0) continue;
    const current = byCode.get(d.zoneCode);
    const better = !current || (d.mha === "M" && parseZoningString(current).mha !== "M") || (d.mha === parseZoningString(current).mha && ZONING.length < current.length);
    if (better) byCode.set(d.zoneCode, ZONING);
  }
  const zones = [...byCode.values()].sort((a, b) => parseZoningString(a).family.localeCompare(parseZoningString(b).family) || a.localeCompare(b));

  const projectTypes = ["shed", "garage", "fence", "deck", "adu"];
  const active: RegulatoryRule[] = (await Promise.all(projectTypes.map((t) => listActiveRulesForProject(db, t)))).flat();
  const approvedRows = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.lifecycleState, ["APPROVED"]));
  const approved: RegulatoryRule[] = approvedRows
    .filter((r) => r.applicableWorkflowType === "EXISTING_PROPERTY")
    .map((r) => ({ ...r, applicableProjectType: r.applicableProjectType ?? undefined, ruleSpecification: r.ruleSpecification as Record<string, unknown> }) as unknown as RegulatoryRule);

  const live = buildCoverageMatrix({ rules: active, zones });
  const planned = buildCoverageMatrix({ rules: [...active, ...approved], zones });
  const generatedAt = new Date().toISOString();
  writeFileSync("aidlc-docs/operations/zoning-coverage-matrix.md", renderCoverageMatrixMarkdown(live, planned, generatedAt));
  writeFileSync("aidlc-docs/operations/zoning-coverage-matrix.json", JSON.stringify({ generatedAt, activeRuleCount: active.length, approvedRuleCount: approved.length, live, planned }, null, 1));
  console.log(`Wrote the matrix for ${zones.length} zone codes x ${projectTypes.length} project types (${active.length} ACTIVE, ${approved.length} APPROVED rules).`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
