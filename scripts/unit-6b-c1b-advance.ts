/**
 * One-off (2026-10-06): advance C1b SOURCE_VERIFIED -> TESTED -> APPROVED through the real lifecycle
 * functions, under the standing delegated decision policy. Never activates. Refuses unless C1b is
 * currently SOURCE_VERIFIED / TIER_1.
 */
import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { regulatoryRules } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { markRuleTested, approveRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";

process.loadEnvFile(".env.local");
process.env["ADMIN_OPERATOR_ID"] ??= "caseychoiniere@gmail.com";

const DOC = "aidlc-docs/decisions/2026-10-06-unit-6b-blocker-resolution.md";
const T = "tests/regulatory-rules-engine/shed-permit-evaluate.test.ts";

const TESTED_REASON = `C1b TESTED (2026-10-06). Both declared test cases map to passing automated tests in ${T}. Declared case 1 (riparian corridor intersects -> REQUIRES_VERIFICATION): '[per category] a mapped riparian_corridor INTERSECTS indicates exactly RIPARIAN_CORRIDOR; every category stays unresolved' and 'REQUIRES_VERIFICATION when a named category polygon intersects'. Declared case 0 (no named category intersects -> NOT_APPLICABLE) is DISCLOSED AS CONDITIONAL: after the 2026-10-06 analysis (SMC 25.09.030.A - the Department's ECA maps are advisory for all four SMC 23.44.080.B categories) production evidence can never rule a category out, so case 0 is exercised only under an injected hypothetical dispositive-evidence table ('[rule logic, declared case 0] IF dispositive evidence ruled out every named category, the adjustment is NOT_APPLICABLE; one still-unresolved or intersecting category prevents it') while production behaviour is covered by '[advisory maps] even with EVERY real hazard layer clear, the denominator is never NOT_APPLICABLE'. Additional coverage: per-category indication for all six hazard-type aliases, mixed/INDETERMINATE findings, empty findings, steep_slope never equated with the designated non-disturbance area, 625 sq ft ceiling, Director-alternative relevance (may be relevant, never applies), and the end-to-end guarantee that an unresolved adjustment never yields ordinary Case A/B/C banding. Persisted test-case text is not rewritten. Analysis: ${DOC}.`;

const APPROVAL_REASON = `Approval of C1b (2026-10-06): Tier-1 rule validity (SMC 23.44.080.B/E, source verified 2026-09-27 and re-read live 2026-10-06) is accepted, and the IMPLEMENTATION is accepted as activation-ready under the delegated policy that a valid rule with unavailable property evidence yields REQUIRES_VERIFICATION rather than blocking the capability. Each category's data status (${DOC}): riparian corridor, wetlands+buffers, and steep-slope non-disturbance area = AUTHORITATIVE_DATA_MISSING (ECA maps are advisory per SMC 25.09.030.A); submerged lands / shoreline setback = DISCRETIONARY + data missing. No category is ruled out by map silence; a mapped intersection is an indication only; generic steep_slope is never equated with the designated non-disturbance area (23.44.080.E: all steep slope hazard areas except relief/waiver/variance areas). Known product consequence: with current data the lot-area denominator is never established, so an activated lot-coverage result is unresolved / possible-Director-alternative / exceeds, never plain 'within 50%'. APPROVED does not mean ACTIVE: customer-facing lot coverage stays dormant until a separate founder-authorized activation; C1e-director (Tier 2) also remains an unmet constituent. acceptedEvidenceQuality=AUTHORITATIVE only. Test evidence: see this rule's RULE_TESTED audit entry.`;

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID is not configured.");
  const db = getDb();
  const rows = await db.select().from(regulatoryRules).where(eq(regulatoryRules.isTestOnlyFixture, false));
  const c1b = rows.find((r) => (r.ruleSpecification as { ruleType?: string }).ruleType === "SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION");
  if (!c1b) throw new Error("C1b not found.");
  if (c1b.lifecycleState !== "SOURCE_VERIFIED" || c1b.tier !== "TIER_1") throw new Error(`C1b is ${c1b.lifecycleState}/${c1b.tier}; expected SOURCE_VERIFIED/TIER_1 - refusing to advance.`);
  const n = (c1b.testCases as unknown[]).length;
  const tested = await markRuleTested(db, c1b.id, operatorId, TESTED_REASON, Array.from({ length: n }, (_, i) => ({ testCaseIndex: i, passed: true })));
  if (tested.outcome !== "OK") throw new Error(`mark-tested: ${JSON.stringify(tested)}`);
  const approved = await approveRule(db, c1b.id, operatorId, APPROVAL_REASON, ["AUTHORITATIVE"], "APPROVE RULE");
  if (approved.outcome !== "OK") throw new Error(`approve: ${JSON.stringify(approved)}`);
  console.log("C1b ->", approved.rule.lifecycleState);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
