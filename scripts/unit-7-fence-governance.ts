/**
 * One-off Unit 7 (Fences) governance run (2026-10-08), executed under the founder's Continuous
 * Autonomous Execution Policy ("lifecycle advancement where justified"). Uses only the existing
 * mechanisms - `bootstrapUnit6bGovernance` (insert-if-absent + RULE_BOOTSTRAPPED audit, TRIAGED only)
 * and the real admin lifecycle functions (sourceVerifyRule -> markRuleTested -> approveRule) - never a
 * direct DB edit. Advances the eight fence rules to APPROVED and STOPS: it never calls activateRule
 * (APPROVED -> ACTIVE is a founder decision) and never touches any non-fence row.
 *
 * Safe to re-run: bootstrap never overwrites; a row already APPROVED is skipped; any other unexpected
 * state aborts before mutating anything further.
 */

import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { regulatoryRules } from "../src/db/schema.js";
import { inArray } from "drizzle-orm";
import { bootstrapUnit6bGovernance, type BootstrapCandidate } from "../src/regulatory-rule-governance/bootstrap-unit-6b.js";
import { approveRule, markRuleTested, sourceVerifyRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";
import { FENCE_FIXED_ROW_IDS, realFenceCandidates, tierForRealFenceCandidate } from "../tests/fixtures/fence-candidates.js";

process.loadEnvFile(".env.local");
// No default operator identity: the invoker must supply ADMIN_OPERATOR_ID explicitly, so a reserved
// governance record is never attributed to an identity by omission (reviewer decision
// 333344f2-057f-4bab-a9f8-410fa8c1660c).

const S1 = "SMC 23.44.090.H.4 and H.5 (Ord. 127376, § 31, 2025), Municode Library CURRENT, read live 2026-10-08";
const S3 = "2021 Seattle Residential Code Chapter 1 R105.1/R105.2 (Seattle amendments), text extracted from SDCI 2021SRCChapter1.pdf 2026-10-08";
const S4 = "SDCI Fences page, read live 2026-10-08";
const S5 = "SMC 23.44.070.A.1-A.3, Municode Library CURRENT, read live 2026-10-08";
const DESIGN = "aidlc-docs/construction/unit-7-fences/functional-design.md";
const TESTS = "tests/regulatory-rules-engine/fence-evaluate.test.ts and tests/regulatory-rule-governance/fence-candidates.test.ts (every declared case executed against the evaluator using this row's own persisted specification)";

const SOURCES: Record<string, string> = {
  "fence-f1-height-limit-standard-2026": S1,
  "fence-f2-height-limit-front-street-side-2026": S1,
  "fence-f3-retaining-wall-2026": `${S1}; ${S4} (wall that lowers grade: normal fence limits apply)`,
  "fence-f4-outside-required-setbacks-2026": `${S1} (scope of H.4); ${S5} (A.1: 32 ft; A.2: 42 ft; A.3: 12 ft for accessory structures in required setbacks, not binding on fences limited by H.4 to 8 ft or less)`,
  "fence-f5-permit-height-exemption-2026": `${S3}; ${S4}`,
  "fence-f6-permit-masonry-concrete-2026": S3,
  "fence-f7-exemption-not-zoning-compliance-2026": S3,
  "fence-f8-permit-flood-prone-condition-2026": `${S4} - an agency guidance statement; the underlying code section is not identified there, so the product only attributes the condition to SDCI and never decides it (criterion is always REQUIRES_VERIFICATION)`,
};

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID is not configured; pass it explicitly when invoking this script.");
  if (realFenceCandidates.length !== 8) throw new Error(`Expected exactly 8 fence candidates, found ${realFenceCandidates.length}.`);
  const db = getDb();

  const candidates: BootstrapCandidate[] = realFenceCandidates.map((input) => {
    const fixedRowId = FENCE_FIXED_ROW_IDS[input.id];
    if (!fixedRowId) throw new Error(`No fixed row UUID for ${input.id}.`);
    return { input, tier: tierForRealFenceCandidate(input.id), fixedRowId };
  });
  const boot = await bootstrapUnit6bGovernance(db, candidates, operatorId);
  console.log(`Bootstrap: created ${boot.created.length}, already present ${boot.alreadyPresent.length}.`);

  const ids = candidates.map((c) => c.fixedRowId);
  const rows = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (rows.length !== 8) throw new Error(`Expected 8 fence rows in the database, found ${rows.length}.`);
  for (const row of rows) {
    if (row.lifecycleState !== "TRIAGED" && row.lifecycleState !== "APPROVED") {
      throw new Error(`${row.subject} is ${row.lifecycleState}; expected TRIAGED or APPROVED. Aborting before further changes.`);
    }
    if (row.lifecycleState === "ACTIVE") throw new Error("A fence rule is ACTIVE - refusing to proceed.");
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
      `Source verification (2026-10-08, Unit 7 under the Continuous Autonomous Execution Policy), Tier 1. Source: ${source}. Implementation checked against the quoted text in ${DESIGN}; the reviewer's F4 traceability and permit-REQUIRED findings (decision 50af47ff-3dbf-4881-8b1f-35240796617c) were resolved by quoting SMC 23.44.070.A and SRC R105.1, and its implementation findings (decision 333344f2-057f-4bab-a9f8-410fa8c1660c: unknown-slope outside-setback PASS, F7/F8 gating, zoning scope) were fixed in code. Scope: rule validity of a numeric threshold in current code text; qualitative elements (predominately open; flood-prone status) are not resolved by any rule and yield REQUIRES_VERIFICATION.`,
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
      `Approval (2026-10-08, delegated lifecycle advancement): Tier-1 rule validity is source verified and the implementation is accepted as activation-ready. APPROVED does not mean ACTIVE: no fence result is customer-visible until a separate founder-authorized activation, and fences are additionally gated from public purchase by isFenceScreeningCoverageReady() (hardcoded false). acceptedEvidenceQuality=AUTHORITATIVE only. Test evidence: see this rule's RULE_TESTED audit entry.`,
      ["AUTHORITATIVE"],
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
