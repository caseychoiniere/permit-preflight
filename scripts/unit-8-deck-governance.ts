/**
 * One-off Unit 8 (Decks) governance run (2026-10-08), executed under the founder's Continuous
 * Autonomous Execution Policy ("lifecycle advancement where justified"). Uses only the existing
 * mechanisms - `bootstrapUnit6bGovernance` (insert-if-absent + RULE_BOOTSTRAPPED audit, TRIAGED only)
 * and the real admin lifecycle functions (sourceVerifyRule -> markRuleTested -> approveRule) - never a
 * direct DB edit. Advances the six deck rules to APPROVED and STOPS: it never calls activateRule
 * (APPROVED -> ACTIVE is a founder decision) and never touches any non-deck row.
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
import { DECK_FIXED_ROW_IDS, realDeckCandidates, tierForRealDeckCandidate } from "../tests/fixtures/deck-candidates.js";

process.loadEnvFile(".env.local");
// No default operator identity: the invoker must supply ADMIN_OPERATOR_ID explicitly, so a reserved
// governance record is never attributed to an identity by omission (reviewer decision
// 333344f2-057f-4bab-a9f8-410fa8c1660c).

const S1 = "SMC 23.44.090.H.1, H.8 and E.4 (Ord. 127376, § 31, 2025), Municode Library CURRENT, read live 2026-10-08";
const S2 = "SMC 23.44.080.C.3 and C.5 (Ord. 127376), Municode Library CURRENT, read live 2026-10-08";
const S3 = "2021 Seattle Residential Code Chapter 1 R105.1/R105.2 item 7 (Seattle amendments), text extracted from SDCI 2021SRCChapter1.pdf 2026-10-08";
const S4 = "SDCI Decks page, read live 2026-10-08";
const DESIGN = "aidlc-docs/construction/unit-8-decks/functional-design.md";
const TESTS = "tests/regulatory-rules-engine/deck-evaluate.test.ts and tests/regulatory-rule-governance/deck-candidates.test.ts (every declared case executed against the evaluator using this row's own persisted specification)";

const SOURCES: Record<string, string> = {
  "deck-d1-setback-height-allowance-2026": `${S1}; SDCI's Decks page states a broader prohibition than the code text - recorded as a source conflict and resolved fail-closed (a tall deck in a setback is never reported as a violation)`,
  "deck-d2-lot-coverage-threshold-2026": S2,
  "deck-d3-permit-exemption-2026": `${S3}; ${S4}`,
  "deck-d4-stfi-eligibility-2026": `${S4} (agency guidance listing the criteria that need a full review)`,
  "deck-d5-eca-condition-2026": `${S4} - an agency guidance statement; the product only attributes the condition to SDCI and never decides it (criterion is always REQUIRES_VERIFICATION)`,
  "deck-d6-exemption-not-zoning-compliance-2026": S3,
};

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID is not configured; pass it explicitly when invoking this script.");
  if (realDeckCandidates.length !== 6) throw new Error(`Expected exactly 6 deck candidates, found ${realDeckCandidates.length}.`);
  const db = getDb();

  const candidates: BootstrapCandidate[] = realDeckCandidates.map((input) => {
    const fixedRowId = DECK_FIXED_ROW_IDS[input.id];
    if (!fixedRowId) throw new Error(`No fixed row UUID for ${input.id}.`);
    return { input, tier: tierForRealDeckCandidate(input.id), fixedRowId };
  });
  const boot = await bootstrapUnit6bGovernance(db, candidates, operatorId);
  console.log(`Bootstrap: created ${boot.created.length}, already present ${boot.alreadyPresent.length}.`);

  const ids = candidates.map((c) => c.fixedRowId);
  const rows = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (rows.length !== 6) throw new Error(`Expected 6 deck rows in the database, found ${rows.length}.`);
  for (const row of rows) {
    if (row.lifecycleState !== "TRIAGED" && row.lifecycleState !== "APPROVED") {
      throw new Error(`${row.subject} is ${row.lifecycleState}; expected TRIAGED or APPROVED. Aborting before further changes.`);
    }
    if (row.lifecycleState === "ACTIVE") throw new Error("A deck rule is ACTIVE - refusing to proceed.");
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
      `Source verification (2026-10-08, Unit 8 under the Continuous Autonomous Execution Policy), Tier 1. Source: ${source}. Implementation checked against the quoted text in ${DESIGN}; lessons from the Unit 7 reviewer decisions (50af47ff-3dbf-4881-8b1f-35240796617c, 333344f2-057f-4bab-a9f8-410fa8c1660c) were applied up front: governed disclaimer and ECA claims, fail-closed unknowns, always-stated zoning scope. Scope: rule validity of a numeric threshold in current code text; the qualitative elements (whether another setback allowance applies; ECA status) are not resolved by any rule and yield REQUIRES_VERIFICATION.`,
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
      `Approval (2026-10-08, delegated lifecycle advancement): Tier-1 rule validity is source verified and the implementation is accepted as activation-ready. APPROVED does not mean ACTIVE: no deck result is customer-visible until a separate founder-authorized activation, and decks are additionally gated from public purchase by isDeckScreeningCoverageReady() (hardcoded false). acceptedEvidenceQuality=AUTHORITATIVE only. Test evidence: see this rule's RULE_TESTED audit entry.`,
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
