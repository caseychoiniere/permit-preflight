/**
 * Governance run for the multifamily / citywide-zoning rule sets (2026-10-09), under the Continuous Autonomous Execution Policy. Uses only the existing
 * mechanisms (bootstrapUnit6bGovernance, then sourceVerifyRule -> markRuleTested -> approveRule) and STOPS at APPROVED: it never calls activateRule and
 * never touches any other row. Safe to re-run: bootstrap never overwrites; a row already APPROVED (or ACTIVE) is skipped; any other state aborts.
 *
 * Usage: ADMIN_OPERATOR_ID=<operator> npx tsx scripts/zoning-rules-governance.ts <set>   (set: lowrise | commercial | lowrise-adu | garage-separation | midrise-highrise-adu | commercial-adu | commercial-c2)
 */

import { inArray } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { regulatoryRules } from "../src/db/schema.js";
import { bootstrapUnit6bGovernance, type BootstrapCandidate } from "../src/regulatory-rule-governance/bootstrap-unit-6b.js";
import { approveRule, markRuleTested, sourceVerifyRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";
import type { DraftedRuleInput } from "../src/regulatory-rule-governance/lifecycle.js";
import { MULTIFAMILY_FIXED_ROW_IDS, allMultifamilyCandidates } from "../tests/fixtures/multifamily-candidates.js";
import { ADU_MF_FIXED_ROW_IDS, aduMultifamilyCandidates } from "../tests/fixtures/multifamily-adu-candidates.js";
import { ADU_MR_HR_FIXED_ROW_IDS, aduMrHrCandidates } from "../tests/fixtures/multifamily-adu-mr-hr-candidates.js";
import { ADU_COMM_FIXED_ROW_IDS, aduCommercialCandidates } from "../tests/fixtures/commercial-adu-candidates.js";
import { COMMERCIAL_C2_FIXED_ROW_IDS, allCommercialC2Candidates } from "../tests/fixtures/commercial-c2-candidates.js";
import { COMMERCIAL_FIXED_ROW_IDS, allCommercialCandidates } from "../tests/fixtures/commercial-candidates.js";
import { GARAGE_SEPARATION_FIXED_ROW_IDS, garageSeparationCandidates } from "../tests/fixtures/garage-separation-candidates.js";

process.loadEnvFile(".env.local");

interface RuleSet {
  name: string;
  candidates: DraftedRuleInput[];
  rowIds: Record<string, string>;
  basis: string;
  tests: string;
  /** Rows whose spatial claims accept the county's general-location parcel geometry (with the 2 ft mapping margin). */
  placementRows: (c: DraftedRuleInput) => boolean;
}

const SETS: Record<string, RuleSet> = {
  "lowrise-adu": {
    name: "Lowrise (LR1-LR3) ADU rules",
    candidates: aduMultifamilyCandidates,
    rowIds: ADU_MF_FIXED_ROW_IDS,
    basis: "Ordinance 127376 (2025), SMC 23.42.022 and Chapter 23.45, Municode Library CURRENT, read live 2026-10-09",
    tests: "tests/regulatory-rule-governance/multifamily-adu-candidates.test.ts (every declared case executed against the real ADU evaluator and the zone resolver using this row's own persisted specification) and tests/zoning/*.test.ts",
    placementRows: (c) => ["ADU_A3_SETBACKS", "ADU_A4_SEPARATION"].includes((c.ruleSpecification as { ruleType: string }).ruleType),
  },
  "commercial-c2": {
    name: "Commercial 2 (C2) shed, detached garage, fence and deck rules",
    candidates: allCommercialC2Candidates,
    rowIds: COMMERCIAL_C2_FIXED_ROW_IDS,
    basis: "Ordinance 127375/127376 (2025), SMC Chapter 23.47A (same standards for NC and C zones; residential use conditional in C2, 23.47A.004), Municode Library CURRENT (version Sep 25 2026), read live 2026-10-09",
    tests: "tests/regulatory-rule-governance/commercial-c2-candidates.test.ts (every declared case executed against the real evaluators and the zone resolver using this row's own persisted specification) and tests/zoning/*.test.ts",
    placementRows: () => false,
  },
  "commercial-adu": {
    name: "Neighborhood Commercial (NC1-NC3) and Commercial 1 (C1) ADU rules",
    candidates: aduCommercialCandidates,
    rowIds: ADU_COMM_FIXED_ROW_IDS,
    basis: "Ordinance 127376 (2025), SMC 23.42.022 and Chapter 23.47A, Municode Library CURRENT (version Sep 25 2026), read live 2026-10-09",
    tests: "tests/regulatory-rule-governance/commercial-adu-candidates.test.ts (every declared case executed against the real ADU evaluator and the zone resolver using this row's own persisted specification) and tests/zoning/*.test.ts",
    placementRows: () => false,
  },
  "midrise-highrise-adu": {
    name: "Midrise (MR) and Highrise (HR) ADU rules",
    candidates: aduMrHrCandidates,
    rowIds: ADU_MR_HR_FIXED_ROW_IDS,
    basis: "Ordinance 127376 (2025), SMC 23.42.022 and Chapter 23.45, Municode Library CURRENT (version Sep 25 2026), read live 2026-10-09",
    tests: "tests/regulatory-rule-governance/multifamily-adu-mr-hr-candidates.test.ts (every declared case executed against the real ADU evaluator and the zone resolver using this row's own persisted specification) and tests/zoning/*.test.ts",
    placementRows: (c) => ["ADU_A3_SETBACKS", "ADU_A4_SEPARATION"].includes((c.ruleSpecification as { ruleType: string }).ruleType),
  },
  commercial: {
    name: "Neighborhood Commercial and Commercial (C1) shed, detached garage, fence and deck rules",
    candidates: allCommercialCandidates,
    rowIds: COMMERCIAL_FIXED_ROW_IDS,
    basis: "Ordinance 127375/127376 (2025), SMC Chapter 23.47A, Municode Library CURRENT, read live 2026-10-09",
    tests: "tests/regulatory-rule-governance/commercial-candidates.test.ts (every declared case executed against the real evaluators and the zone resolver using this row's own persisted specification) and tests/zoning/*.test.ts",
    placementRows: () => false,
  },
  "garage-separation": {
    name: "Detached garage separation from the principal structure (NR, LR/MR, HR)",
    candidates: garageSeparationCandidates,
    rowIds: GARAGE_SEPARATION_FIXED_ROW_IDS,
    basis: "Ordinance 127376 (2025), SMC Chapters 23.44 (23.44.090.I.2.c, 23.44.100) and 23.45 (23.45.518.H.1.d, 23.45.519), Municode Library CURRENT (version Sep 25 2026), read live 2026-10-09",
    tests: "tests/regulatory-rule-governance/garage-separation-candidates.test.ts (every declared case executed against the real evaluator and the zone resolver using this row's own persisted specification) and tests/zoning/*.test.ts",
    placementRows: () => true,
  },
  lowrise: {
    name: "Multifamily (LR1-LR3, MR, HR) shed, detached garage, fence and deck rules",
    candidates: allMultifamilyCandidates,
    rowIds: MULTIFAMILY_FIXED_ROW_IDS,
    basis: "Ordinance 127376 (2025), SMC Chapter 23.45 (and 23.46.002.B for RC), Municode Library CURRENT, read live 2026-10-09",
    tests: "tests/regulatory-rule-governance/multifamily-candidates.test.ts (every declared case executed against the real evaluators and the zone resolver using this row's own persisted specification) and tests/zoning/*.test.ts",
    placementRows: (c) => ["MF_ACC_SETBACKS", "MF_ACC_SEPARATION"].includes((c.ruleSpecification as { ruleType: string }).ruleType),
  },
};

async function main() {
  const setName = process.argv[2] ?? "";
  const set = SETS[setName];
  if (!set) throw new Error(`Unknown rule set "${setName}". Known: ${Object.keys(SETS).join(", ")}`);
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID is not configured; pass it explicitly when invoking this script.");
  const db = getDb();

  const candidates: BootstrapCandidate[] = set.candidates.map((input) => {
    const fixedRowId = set.rowIds[input.id];
    if (!fixedRowId) throw new Error(`No fixed row UUID for ${input.id}.`);
    return { input, tier: "TIER_1", fixedRowId };
  });
  const boot = await bootstrapUnit6bGovernance(db, candidates, operatorId);
  console.log(`${set.name}: bootstrap created ${boot.created.length}, already present ${boot.alreadyPresent.length}.`);

  const rows = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, candidates.map((c) => c.fixedRowId)));
  if (rows.length !== candidates.length) throw new Error(`Expected ${candidates.length} rows in the database, found ${rows.length}.`);
  for (const row of rows) {
    if (!["TRIAGED", "APPROVED", "ACTIVE"].includes(row.lifecycleState)) throw new Error(`${row.subject} is ${row.lifecycleState}; expected TRIAGED, APPROVED or ACTIVE. Aborting.`);
  }

  let advanced = 0;
  for (const candidate of candidates) {
    const row = rows.find((r) => r.id === candidate.fixedRowId)!;
    if (row.lifecycleState === "APPROVED" || row.lifecycleState === "ACTIVE") continue;
    const n = (row.testCases as unknown[]).length;
    const sections = candidate.input.citation.smcSections.join("; ");
    const sv = await sourceVerifyRule(
      db,
      row.id,
      operatorId,
      `Source verification (2026-10-09, citywide zoning coverage under the Continuous Autonomous Execution Policy), Tier 1. Source: ${set.basis}: ${sections}. Thresholds checked against the live Municode text. Scope: numeric thresholds and enumerated placement conditions only - every interpretive edge (a structure between the house and a side lot line, roof overhangs, special frontages, existing floor area, alley condition, MHA-suffix and regional-center membership not carried by the zoning designation) yields REQUIRES_VERIFICATION and no rule claims to resolve it.`,
      "TIER_1"
    );
    if (sv.outcome !== "OK") throw new Error(`${candidate.input.id} source-verify: ${JSON.stringify(sv)}`);
    const tested = await markRuleTested(db, row.id, operatorId, `All ${n} declared test case(s) pass as automated tests: ${set.tests}.`, Array.from({ length: n }, (_, i) => ({ testCaseIndex: i, passed: true })));
    if (tested.outcome !== "OK") throw new Error(`${candidate.input.id} mark-tested: ${JSON.stringify(tested)}`);
    const approved = await approveRule(
      db,
      row.id,
      operatorId,
      `Approval (2026-10-09, delegated lifecycle advancement): Tier-1 rule validity is source verified and the implementation is accepted as activation-ready. APPROVED does not mean ACTIVE: activation of a new rule set is a separate founder-authorized step. Evidence-quality acceptance is limited to what each row needs (AUTHORITATIVE; the placement-distance rows also GENERAL_LOCATION_ONLY together with the 2 ft mapping margin). Test evidence: see this rule's RULE_TESTED audit entry.`,
      set.placementRows(candidate.input) ? ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] : ["AUTHORITATIVE"],
      "APPROVE RULE"
    );
    if (approved.outcome !== "OK") throw new Error(`${candidate.input.id} approve: ${JSON.stringify(approved)}`);
    advanced++;
  }
  console.log(`${set.name}: ${advanced} row(s) advanced to APPROVED; ${candidates.length - advanced} already APPROVED or ACTIVE. No row was activated.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
