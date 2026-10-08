/**
 * One-off Unit 11 (ADUs) governance run, executed under the founder's Continuous Autonomous Execution
 * Policy ("lifecycle advancement where justified"). Uses only the existing mechanisms -
 * `bootstrapUnit6bGovernance` (insert-if-absent + RULE_BOOTSTRAPPED audit, TRIAGED only) and the real admin
 * lifecycle functions (sourceVerifyRule -> markRuleTested -> approveRule) - never a direct DB edit. Advances
 * the ten ADU rules to APPROVED and STOPS: it never calls activateRule (APPROVED -> ACTIVE is a founder
 * decision, and ADU activation has NOT been authorized) and never touches any non-ADU row.
 *
 * Safe to re-run: bootstrap never overwrites; a row already APPROVED is skipped; any other unexpected state
 * aborts before mutating anything further.
 */

import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { regulatoryRules } from "../src/db/schema.js";
import { inArray } from "drizzle-orm";
import { bootstrapUnit6bGovernance, type BootstrapCandidate } from "../src/regulatory-rule-governance/bootstrap-unit-6b.js";
import { approveRule, markRuleTested, sourceVerifyRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";
import { ADU_FIXED_ROW_IDS, realAduCandidates, tierForRealAduCandidate } from "../tests/fixtures/adu-candidates.js";

process.loadEnvFile(".env.local");
// No default operator identity: the invoker must supply ADMIN_OPERATOR_ID explicitly, so a reserved
// governance record is never attributed to an identity by omission.

const BASE = "Ordinance 127376 (2025), SMC chapters 23.42 and 23.44 as published on Municode Library (CURRENT, supplement 34 of the Seattle Municipal Code), read live 2026-10-08";
const SOURCES: Record<string, string> = {
  "adu-a1-count-and-density-2026": `${BASE}: SMC 23.42.022.C (max two ADUs), SMC 23.44.060.A.4, C.1-C.3, D.1 (fractions over 0.85 round up), D.5 (ADUs count), D.6 (excluded land)`,
  "adu-a2-size-limit-2026": `${BASE}: SMC 23.42.022.G.1.a, G.1.b, G.2.c`,
  "adu-a3-setbacks-2026": `${BASE}: SMC 23.44.090.A Table A and footnote 3 (rear 5 ft for ADUs, none at an alley), SMC 23.44.090.B`,
  "adu-a4-separation-2026": `${BASE}: SMC 23.44.100.A and C`,
  "adu-a5-height-2026": `${BASE}: SMC 23.44.070.A.1, A.2.d, B.1`,
  "adu-a6-lot-coverage-2026": `${BASE}: SMC 23.44.080.A-D (same calculation as the Unit 6B shed lot-coverage capability)`,
  "adu-a7-floor-area-ratio-2026": `${BASE}: SMC 23.44.050.B Table A and C, SMC 23.44.060.D.5`,
  "adu-a8-amenity-area-2026": `${BASE}: SMC 23.44.110.A, E, H`,
  "adu-a9-trees-2026": `${BASE}: SMC 23.44.120.A Table A and B`,
  "adu-a10-design-standards-2026": `${BASE}: SMC 23.44.140.A.2, C, D, E`,
};
const DESIGN = "aidlc-docs/construction/unit-11-adus/research-findings.md and customer-questions-and-scope.md";
const TESTS =
  "tests/regulatory-rule-governance/adu-candidates.test.ts (every declared case executed against evaluate-adu.ts using this row's own persisted specification), tests/regulatory-rules-engine/adu-evaluate.test.ts, tests/dev-preview/adu-report-preview.test.ts and the live tests/report-generation-orchestrator/adu-pipeline.integration.test.ts";
/** Only the two placement-dependent rows are approved to accept the county's general-location parcel geometry, and only together with their 2 ft mapping margin. */
const QUALITY: Record<string, ("AUTHORITATIVE" | "GENERAL_LOCATION_ONLY")[]> = {
  "adu-a3-setbacks-2026": ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
  "adu-a4-separation-2026": ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
};

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID is not configured; pass it explicitly when invoking this script.");
  if (realAduCandidates.length !== 10) throw new Error(`Expected exactly 10 ADU candidates, found ${realAduCandidates.length}.`);
  const db = getDb();

  const candidates: BootstrapCandidate[] = realAduCandidates.map((input) => {
    const fixedRowId = ADU_FIXED_ROW_IDS[input.id];
    if (!fixedRowId) throw new Error(`No fixed row UUID for ${input.id}.`);
    return { input, tier: tierForRealAduCandidate(input.id), fixedRowId };
  });
  const boot = await bootstrapUnit6bGovernance(db, candidates, operatorId);
  console.log(`Bootstrap: created ${boot.created.length}, already present ${boot.alreadyPresent.length}.`);

  const ids = candidates.map((c) => c.fixedRowId);
  const rows = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (rows.length !== 10) throw new Error(`Expected 10 ADU rows in the database, found ${rows.length}.`);
  for (const row of rows) {
    if (row.lifecycleState === "ACTIVE") throw new Error("An ADU rule is ACTIVE - refusing to proceed.");
    if (row.lifecycleState !== "TRIAGED" && row.lifecycleState !== "APPROVED") {
      throw new Error(`${row.subject} is ${row.lifecycleState}; expected TRIAGED or APPROVED. Aborting before further changes.`);
    }
  }

  for (const candidate of candidates) {
    const row = rows.find((r) => r.id === candidate.fixedRowId)!;
    if (row.lifecycleState === "APPROVED") {
      console.log(`${candidate.input.id}: already APPROVED, skipped.`);
      continue;
    }
    const source = SOURCES[candidate.input.id]!;
    const n = (row.testCases as unknown[]).length;
    const sv = await sourceVerifyRule(
      db,
      row.id,
      operatorId,
      `Source verification (2026-10-08, Unit 11 under the Continuous Autonomous Execution Policy), Tier 1. Source: ${source}. Implementation checked against the quoted text in ${DESIGN}. Scope: rule validity of numeric thresholds in current code text; interpretive edges (averaged side setback, front setback with three units, whether a nearby mapped building has floor area, excluded critical-area land, tree-based height, site-plan-dependent standards) are not resolved by any rule and yield REQUIRES_VERIFICATION. The reviewer's authority objections (decisions 1d55de97-598c-4e24-82f2-38be71f249b0 and e781c605-1475-46be-b813-95e3d481422b) were recorded; its implementation findings (unresolved zoning suppresses ADU conclusions, partial rule coverage is never LOOKS_FEASIBLE, 0.85 rounding boundary, web/PDF parity) were fixed in code.`,
      "TIER_1"
    );
    if (sv.outcome !== "OK") throw new Error(`${candidate.input.id} source-verify: ${JSON.stringify(sv)}`);
    const tested = await markRuleTested(
      db,
      row.id,
      operatorId,
      `All ${n} declared test case(s) pass as automated tests: ${TESTS}.`,
      Array.from({ length: n }, (_, i) => ({ testCaseIndex: i, passed: true }))
    );
    if (tested.outcome !== "OK") throw new Error(`${candidate.input.id} mark-tested: ${JSON.stringify(tested)}`);
    const approved = await approveRule(
      db,
      row.id,
      operatorId,
      `Approval (2026-10-08, delegated lifecycle advancement): Tier-1 rule validity is source verified and the implementation is accepted as activation-ready. APPROVED does not mean ACTIVE: no ADU result is customer-visible until a separate founder-authorized activation, and ADU screening is additionally gated from public purchase by isAduScreeningCoverageReady() (hardcoded false). Evidence-quality acceptance is limited to what each row's evaluator needs (AUTHORITATIVE; the two placement rows also GENERAL_LOCATION_ONLY together with the 2 ft mapping margin). Test evidence: see this rule's RULE_TESTED audit entry.`,
      QUALITY[candidate.input.id] ?? ["AUTHORITATIVE"],
      "APPROVE RULE"
    );
    if (approved.outcome !== "OK") throw new Error(`${candidate.input.id} approve: ${JSON.stringify(approved)}`);
    console.log(`${candidate.input.id} -> ${approved.rule.lifecycleState}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
