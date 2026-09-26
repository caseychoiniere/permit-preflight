/**
 * Rule-lifecycle admin mechanism, §5 (2026-09-24) - controlled bootstrap for the Unit 6B
 * governance candidates from RESEARCHED/DRAFTED (repository-tracked, never persisted) to a real
 * TRIAGED database row, and no further. `candidates` and their fixed row ids are always supplied
 * by the caller (never hardcoded module constants here) - this is what lets
 * `bootstrap-unit-6b.test.ts` exercise this exact logic against synthetic, disposable inputs and
 * never touch the real 19 Unit 6B UUIDs at all (corrected per reviewer decision
 * d380b4dd-211d-410d-9289-94d2f3f17491's CRITICAL testing finding). The real 19 candidates + real
 * fixed UUIDs are supplied only by `scripts/bootstrap-unit-6b-governance.ts`.
 *
 * Cannot activate anything - only `draft()` -> `triage()` run here; every row lands at TRIAGED.
 * Idempotent - `insertRuleIfAbsent` (repository.ts, `INSERT ... ON CONFLICT DO NOTHING`) never
 * overwrites an existing row. Insert + its `RULE_BOOTSTRAPPED` audit-log write are atomic, one
 * `withAdminTransaction` per candidate (corrected per the same reviewer decision's MAJOR
 * atomicity finding) - never a separate insert followed by a separate, un-atomic audit write.
 */

import { withAdminTransaction } from "../db/client.js";
import type { Db } from "../db/client.js";
import { insertRuleIfAbsent } from "./repository.js";
import { draft, triage } from "./lifecycle.js";
import type { DraftedRuleInput } from "./lifecycle.js";
import type { RegulatoryRule, Tier } from "./types.js";
import { recordAdminAction } from "../admin-action-log/repository.js";
import { AdminActionType, AdminTargetType } from "../admin-action-log/types.js";
import type { NewRegulatoryRuleRow } from "../db/schema.js";

/** Verbatim, founder-required provenance wording (2026-09-24 disposition) - never varied per call
 * site, so every bootstrapped row's audit entry discloses the same honest history: this is a
 * controlled bootstrap of repository-tracked research, not a fabricated historical transition. */
export const BOOTSTRAP_REASON =
  "Bootstrapped from repository-tracked Unit 6B governance state; historical RESEARCHED/DRAFTED/TRIAGED work predates DB persistence.";

export interface BootstrapCandidate {
  /** The candidate's real content (subject, ruleSpecification, citation, caveats, testCases) -
   * typically one of `tests/fixtures/shed-permit-candidates.ts`'s `realShedPermitCandidates`
   * entries for the real bootstrap, or a synthetic `isTestOnlyFixture: true` entry for tests. */
  input: DraftedRuleInput;
  /** The founder-confirmed tier for this candidate (candidate-regulatory-rules.md's Summary
   * table for the real 19) - resolved by the caller, not derived here. */
  tier: Tier;
  /** The fixed, pre-generated UUID this candidate's row is stored under - `regulatory_rules.id`
   * is a real Postgres uuid column; `input.id` (a human-readable string like
   * "shed-permit-p1-roof-area-2026") is never used as the row id directly. */
  fixedRowId: string;
}

export interface BootstrapOutcome {
  created: string[]; // fixedRowIds newly inserted this call
  alreadyPresent: string[]; // fixedRowIds that already existed (no-op, never overwritten)
}

function toNewRegulatoryRuleRow(fixedRowId: string, rule: RegulatoryRule): NewRegulatoryRuleRow {
  return {
    id: fixedRowId,
    subject: rule.subject,
    applicableProjectType: rule.applicableProjectType,
    applicableWorkflowType: rule.applicableWorkflowType,
    applicableZone: rule.applicableZone,
    ruleSpecification: rule.ruleSpecification,
    citation: rule.citation,
    lifecycleState: rule.lifecycleState,
    tier: rule.tier,
    caveats: rule.caveats,
    testCases: rule.testCases,
    verificationHistory: rule.verificationHistory,
    isTestOnlyFixture: rule.isTestOnlyFixture,
    acceptedEvidenceQuality: rule.acceptedEvidenceQuality,
  };
}

export async function bootstrapUnit6bGovernance(
  db: Db,
  candidates: BootstrapCandidate[],
  operatorId: string,
  reason: string = BOOTSTRAP_REASON
): Promise<BootstrapOutcome> {
  const created: string[] = [];
  const alreadyPresent: string[] = [];

  for (const candidate of candidates) {
    const drafted = draft(candidate.input);
    const triaged = triage(drafted, operatorId, candidate.tier);
    if (triaged.outcome !== "OK") {
      throw new Error(`Bootstrap failed for candidate "${candidate.input.id}" (row ${candidate.fixedRowId}): ${triaged.reason}`);
    }
    const row = toNewRegulatoryRuleRow(candidate.fixedRowId, triaged.rule);

    await withAdminTransaction(async (tx) => {
      const insertResult = await insertRuleIfAbsent(tx, row);
      if (!insertResult.inserted) {
        alreadyPresent.push(candidate.fixedRowId);
        return;
      }
      created.push(candidate.fixedRowId);
      await recordAdminAction(tx, {
        operatorId,
        actionType: AdminActionType.RULE_BOOTSTRAPPED,
        targetType: AdminTargetType.REGULATORY_RULE,
        targetId: candidate.fixedRowId,
        reason,
        metadata: { candidateInputId: candidate.input.id },
      });
    });
  }

  return { created, alreadyPresent };
}
