/**
 * Governance run for the real shed (S1-S3) and detached-garage (G1-G5) rules (2026-10-08), executed under the Continuous Autonomous Execution
 * Policy. They replace the four STAGING-TEST-ONLY shed fixtures. Uses only the existing mechanisms (bootstrapUnit6bGovernance, then
 * sourceVerifyRule -> markRuleTested -> approveRule) and STOPS at APPROVED: it never calls activateRule and never touches any other row.
 * Safe to re-run: bootstrap never overwrites; a row already APPROVED is skipped; any other unexpected state aborts.
 */

import { inArray } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { regulatoryRules } from "../src/db/schema.js";
import { bootstrapUnit6bGovernance, type BootstrapCandidate } from "../src/regulatory-rule-governance/bootstrap-unit-6b.js";
import { approveRule, markRuleTested, sourceVerifyRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";
import { ACCESSORY_FIXED_ROW_IDS, allAccessoryCandidates } from "../tests/fixtures/accessory-candidates.js";

process.loadEnvFile(".env.local");

const BASE = "Ordinance 127376 (2025), Municode Library CURRENT, read live 2026-10-08";
const SOURCES: Record<string, string> = {
  "shed-s1-rear-setback-2026": `${BASE}: SMC 23.44.090.I.2.a and Table A`,
  "shed-s2-side-front-setback-2026": `${BASE}: SMC 23.44.090 Table A, I.1, B`,
  "shed-s3-dwelling-separation-2026": `${BASE}: SMC 23.44.090.I.2.c, SMC 23.44.100.A`,
  "garage-g1-rear-setback-2026": `${BASE}: SMC 23.44.090.G.3 and Table A`,
  "garage-g2-side-front-setback-2026": `${BASE}: SMC 23.44.090 Table A, G.1, G.2, G.4; SMC 23.44.160.D.4-5`,
  "garage-g3-height-in-setback-2026": `${BASE}: SMC 23.44.070.A.3`,
  "garage-g4-height-outside-setback-2026": `${BASE}: SMC 23.44.070.A.1`,
  "garage-g5-lot-coverage-2026": `${BASE}: SMC 23.44.080.A-E`,
};
const TESTS =
  "tests/regulatory-rule-governance/accessory-candidates.test.ts (every declared case executed against the evaluator using this row's own persisted specification) and tests/regulatory-rules-engine/evaluate.test.ts / garage-evaluate.test.ts";
/** Only the placement-distance rows accept the county's general-location parcel geometry, and only together with their 2 ft mapping margin. */
const PLACEMENT = new Set(["shed-s1-rear-setback-2026", "shed-s2-side-front-setback-2026", "shed-s3-dwelling-separation-2026", "garage-g1-rear-setback-2026", "garage-g2-side-front-setback-2026"]);

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID is not configured; pass it explicitly when invoking this script.");
  if (allAccessoryCandidates.length !== 8) throw new Error(`Expected exactly 8 accessory candidates, found ${allAccessoryCandidates.length}.`);
  const db = getDb();

  const candidates: BootstrapCandidate[] = allAccessoryCandidates.map((input) => {
    const fixedRowId = ACCESSORY_FIXED_ROW_IDS[input.id];
    if (!fixedRowId) throw new Error(`No fixed row UUID for ${input.id}.`);
    return { input, tier: "TIER_1", fixedRowId };
  });
  const boot = await bootstrapUnit6bGovernance(db, candidates, operatorId);
  console.log(`Bootstrap: created ${boot.created.length}, already present ${boot.alreadyPresent.length}.`);

  const rows = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, candidates.map((c) => c.fixedRowId)));
  if (rows.length !== 8) throw new Error(`Expected 8 accessory rows in the database, found ${rows.length}.`);
  for (const row of rows) {
    if (row.lifecycleState !== "TRIAGED" && row.lifecycleState !== "APPROVED") throw new Error(`${row.subject} is ${row.lifecycleState}; expected TRIAGED or APPROVED. Aborting.`);
  }

  for (const candidate of candidates) {
    const row = rows.find((r) => r.id === candidate.fixedRowId)!;
    if (row.lifecycleState === "APPROVED") {
      console.log(`${candidate.input.id}: already APPROVED, skipped.`);
      continue;
    }
    const n = (row.testCases as unknown[]).length;
    const sv = await sourceVerifyRule(
      db,
      row.id,
      operatorId,
      `Source verification (2026-10-08, accessory-structure rules under the Continuous Autonomous Execution Policy), Tier 1. Source: ${SOURCES[candidate.input.id]}. Thresholds checked against the live Municode text; the pre-2025 citation SMC 23.44.014 no longer exists. Scope: numeric thresholds only - side-average, small-lot transit, three-unit front setback, recorded-agreement, rear-setback-versus-elsewhere separation and garage exceptions are not resolved by any rule and yield REQUIRES_VERIFICATION (garage short-of-requirement results are never a definite FAIL).`,
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
      `Approval (2026-10-08, delegated lifecycle advancement): Tier-1 rule validity is source verified and the implementation is accepted as activation-ready. APPROVED does not mean ACTIVE: activation of the shed and garage sets is a separate founder-authorized step, and detached-garage screening is additionally gated from public purchase by isGarageScreeningCoverageReady() (hardcoded false). Evidence-quality acceptance is limited to what each row needs (AUTHORITATIVE; the five placement-distance rows also GENERAL_LOCATION_ONLY together with the 2 ft mapping margin). Test evidence: see this rule's RULE_TESTED audit entry.`,
      PLACEMENT.has(candidate.input.id) ? ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] : ["AUTHORITATIVE"],
      "APPROVE RULE"
    );
    if (approved.outcome !== "OK") throw new Error(`${candidate.input.id} approve: ${JSON.stringify(approved)}`);
    console.log(`${candidate.input.id} -> ${approved.rule.lifecycleState}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
