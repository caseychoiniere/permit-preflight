/**
 * ADM-7's admin-route orchestration - ties together the pure lifecycle.ts disable()/reenable()
 * domain-rule expression with repository.ts's concurrency-safe conditional DB transition and
 * AdminActionLog, all inside one withAdminTransaction call (founder-directed correction,
 * 2026-08-25).
 *
 * Sequence: (1) read the current row (plain Db, outside any transaction); (2) call the pure
 * disable()/reenable() - if it rejects, return immediately, no DB write attempted; (3) otherwise
 * open one withAdminTransaction and attempt the conditional transitionLifecycleState with the
 * exact {from, to} pair the pure function validated; (4) zero rows transitioned (a
 * concurrent/stale request already moved the row) -> CONFLICT, no AdminActionLog entry written;
 * (5) exactly one row transitioned -> recordAdminAction, in the same transaction.
 */

import { withAdminTransaction } from "../db/client.js";
import type { Db } from "../db/client.js";
import { getRuleById, transitionLifecycleState } from "./repository.js";
import { disable, reenable, triage, sourceVerify, markTested, approve, activate } from "./lifecycle.js";
import type { LifecycleResult } from "./lifecycle.js";
import { recordAdminAction } from "../admin-action-log/repository.js";
import { AdminActionType, AdminTargetType } from "../admin-action-log/types.js";
import type { RegulatoryRule, Tier, EvidenceQuality } from "./types.js";
import { Tier as TierEnum } from "./types.js";

export type AdminLifecycleOutcome =
  | { outcome: "OK"; rule: RegulatoryRule }
  | { outcome: "REJECTED"; reason: string }
  | { outcome: "NOT_SUPPORTED"; reason: string }
  | { outcome: "NOT_FOUND" }
  | { outcome: "CONFLICT" };

async function runTransition(
  db: Db,
  ruleId: string,
  operatorId: string,
  reason: string,
  direction: "DISABLE" | "REENABLE"
): Promise<AdminLifecycleOutcome> {
  const rule = await getRuleById(db, ruleId);
  if (!rule) return { outcome: "NOT_FOUND" };

  const pureResult: LifecycleResult<RegulatoryRule> = direction === "DISABLE" ? disable(rule) : reenable(rule);
  if (pureResult.outcome === "REJECTED") {
    return { outcome: "REJECTED", reason: pureResult.reason };
  }

  const from = rule.lifecycleState;
  const to = pureResult.rule.lifecycleState;

  return withAdminTransaction(async (tx): Promise<AdminLifecycleOutcome> => {
    const transition = await transitionLifecycleState(tx, ruleId, { from, to });
    if (!transition.transitioned) {
      // Stale/concurrent request - the row moved between the read above and this transaction.
      // Never write an audit entry for a command that did not actually happen.
      return { outcome: "CONFLICT" };
    }
    await recordAdminAction(tx, {
      operatorId,
      actionType: direction === "DISABLE" ? AdminActionType.RULE_DISABLED : AdminActionType.RULE_REENABLED,
      targetType: AdminTargetType.REGULATORY_RULE,
      targetId: ruleId,
      reason,
    });
    return { outcome: "OK", rule: transition.rule };
  });
}

export function disableRule(db: Db, ruleId: string, operatorId: string, reason: string): Promise<AdminLifecycleOutcome> {
  return runTransition(db, ruleId, operatorId, reason, "DISABLE");
}

export function reenableRule(db: Db, ruleId: string, operatorId: string, reason: string): Promise<AdminLifecycleOutcome> {
  return runTransition(db, ruleId, operatorId, reason, "REENABLE");
}

// ------------------------------------------------------------------------------------------
// Rule-lifecycle admin mechanism (2026-09-24) - RESEARCHED -> ... -> ACTIVE forward transitions.
// Same `runTransition` sequence as disable/reenable above: read outside any transaction, call the
// pure lifecycle.ts function, on REJECTED return immediately (no write), otherwise one
// withAdminTransaction with the conditional transitionLifecycleState + recordAdminAction.
//
// Founder-identity provenance: every function below derives `founderIdentity` exclusively from
// `operatorId` (the caller's own `requireOperatorId()` value) - never from a client-supplied body
// field. This matches this codebase's existing "admin-only single-operator" model exactly (the
// same authentication boundary disable/reenable already rely on) - see
// aidlc-docs/decisions/2026-09-24-rule-lifecycle-admin-mechanism-plan.md §3/§0.3 for the founder's
// direct authorization-boundary decision this reflects.
// ------------------------------------------------------------------------------------------

async function runNewTransition(
  db: Db,
  ruleId: string,
  operatorId: string,
  reason: string,
  pure: (rule: RegulatoryRule) => LifecycleResult<RegulatoryRule>,
  actionType: (typeof AdminActionType)[keyof typeof AdminActionType],
  additionalFields: (rule: RegulatoryRule) => Record<string, unknown>,
  metadata?: Record<string, unknown>
): Promise<AdminLifecycleOutcome> {
  const rule = await getRuleById(db, ruleId);
  if (!rule) return { outcome: "NOT_FOUND" };

  const pureResult = pure(rule);
  if (pureResult.outcome === "REJECTED") {
    return { outcome: "REJECTED", reason: pureResult.reason };
  }

  const from = rule.lifecycleState;
  const to = pureResult.rule.lifecycleState;

  return withAdminTransaction(async (tx): Promise<AdminLifecycleOutcome> => {
    const transition = await transitionLifecycleState(tx, ruleId, { from, to }, additionalFields(pureResult.rule));
    if (!transition.transitioned) {
      return { outcome: "CONFLICT" };
    }
    await recordAdminAction(tx, {
      operatorId,
      actionType,
      targetType: AdminTargetType.REGULATORY_RULE,
      targetId: ruleId,
      reason,
      ...(metadata ? { metadata } : {}),
    });
    return { outcome: "OK", rule: transition.rule };
  });
}

/** DRAFTED -> TRIAGED. `operatorId` is passed as `triage()`'s `founderIdentity` directly. */
export function triageRule(db: Db, ruleId: string, operatorId: string, reason: string, tier: Tier): Promise<AdminLifecycleOutcome> {
  return runNewTransition(
    db,
    ruleId,
    operatorId,
    reason,
    (rule) => triage(rule, operatorId, tier),
    AdminActionType.RULE_TRIAGED,
    (rule) => ({ tier: rule.tier })
  );
}

/**
 * TRIAGED -> SOURCE_VERIFIED. Tier-2 source-verification is out of scope for this mechanism
 * entirely (2026-09-24 correction, reviewer decision 67af6737-6812-4603-b301-31abf9db82c1) -
 * rejected with NOT_SUPPORTED before any DB access, before ever constructing a VerificationRecord.
 * Only TIER_1 requests reach the pure `sourceVerify()` function through this route. Tier-2
 * professional-opinion provenance is a separate, later, founder-directed design, not built here.
 *
 * `founderVerifiedAt` is always server-derived from request time, never client-supplied (matches
 * `approve()`'s existing `approvedAt` "caller decides what 'now' means" discipline).
 */
export async function sourceVerifyRule(db: Db, ruleId: string, operatorId: string, reason: string, tier: Tier): Promise<AdminLifecycleOutcome> {
  if (tier === TierEnum.TIER_2) {
    return { outcome: "NOT_SUPPORTED", reason: "Tier-2 source-verification is not supported by this mechanism." };
  }
  const founderVerifiedAt = new Date().toISOString();
  return runNewTransition(
    db,
    ruleId,
    operatorId,
    reason,
    (rule) => sourceVerify(rule, { tier, founderIdentity: operatorId, founderVerifiedAt }),
    AdminActionType.RULE_SOURCE_VERIFIED,
    (rule) => ({ verificationHistory: rule.verificationHistory })
  );
}

/** SOURCE_VERIFIED -> TESTED. No identity field on this transition (unchanged from `markTested()`
 * itself - the pure function already requires every declared test case to have a passing result). */
export function markRuleTested(
  db: Db,
  ruleId: string,
  operatorId: string,
  reason: string,
  results: { testCaseIndex: number; passed: boolean }[]
): Promise<AdminLifecycleOutcome> {
  return runNewTransition(db, ruleId, operatorId, reason, (rule) => markTested(rule, results), AdminActionType.RULE_TESTED, () => ({}));
}

const APPROVE_CONFIRMATION = "APPROVE RULE";
const ACTIVATE_CONFIRMATION = "ACTIVATE RULE";

/**
 * TESTED -> APPROVED. `confirm` must equal `"APPROVE RULE"` exactly (founder-directed safety
 * interlock, §0.3 of the plan) - checked first, before any DB access. This is a deliberate-action
 * guard, NOT a second authentication factor; it augments, and does not replace, the pure
 * `approve()` function's own validation. `approvedAt` is always server-derived from request time.
 */
export async function approveRule(
  db: Db,
  ruleId: string,
  operatorId: string,
  reason: string,
  acceptedEvidenceQuality: EvidenceQuality[],
  confirm: string
): Promise<AdminLifecycleOutcome> {
  if (confirm !== APPROVE_CONFIRMATION) {
    return { outcome: "REJECTED", reason: "INVALID_CONFIRMATION: confirm must equal \"APPROVE RULE\" exactly." };
  }
  const approvedAt = new Date().toISOString();
  return runNewTransition(
    db,
    ruleId,
    operatorId,
    reason,
    (rule) => approve(rule, operatorId, acceptedEvidenceQuality, approvedAt),
    AdminActionType.RULE_APPROVED,
    (rule) => ({ acceptedEvidenceQuality: rule.acceptedEvidenceQuality, approvalRecord: rule.approvalRecord }),
    { confirmationSatisfied: true }
  );
}

/**
 * APPROVED -> ACTIVE. `confirm` must equal `"ACTIVATE RULE"` exactly, same rule as `approveRule`.
 * The pure `activate()` function already structurally requires `lifecycleState === APPROVED` -
 * ACTIVE cannot be reached from any other state through this new mechanism. The separate,
 * pre-existing, unmodified `reenable()` function (DISABLED -> ACTIVE) remains its own distinct,
 * already-approved (Unit 3, ADM-7) exception, untouched by this function and carrying no
 * `confirm` requirement - it is not part of this mechanism.
 */
export async function activateRule(db: Db, ruleId: string, operatorId: string, reason: string, confirm: string): Promise<AdminLifecycleOutcome> {
  if (confirm !== ACTIVATE_CONFIRMATION) {
    return { outcome: "REJECTED", reason: "INVALID_CONFIRMATION: confirm must equal \"ACTIVATE RULE\" exactly." };
  }
  return runNewTransition(db, ruleId, operatorId, reason, (rule) => activate(rule), AdminActionType.RULE_ACTIVATED, () => ({}), {
    confirmationSatisfied: true,
  });
}
