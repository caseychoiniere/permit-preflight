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
import { disable, reenable } from "./lifecycle.js";
import type { LifecycleResult } from "./lifecycle.js";
import { recordAdminAction } from "../admin-action-log/repository.js";
import { AdminActionType, AdminTargetType } from "../admin-action-log/types.js";
import type { RegulatoryRule } from "./types.js";

export type AdminLifecycleOutcome =
  | { outcome: "OK"; rule: RegulatoryRule }
  | { outcome: "REJECTED"; reason: string }
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
