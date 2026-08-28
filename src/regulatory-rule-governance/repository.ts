/**
 * Regulatory Rule Governance repository - Unit 3 addition. Rules previously had no dedicated
 * persistence layer (report-generation-orchestrator/pipeline.ts's own inline, ACTIVE-only query
 * is untouched by this file and stays the evaluation path's read). This module exists for ADM-5's
 * version/lifecycle history read and ADM-7's disable/re-enable persistence.
 */

import { eq, and } from "drizzle-orm";
import { regulatoryRules } from "../db/schema.js";
import type { Db, TransactionalDb } from "../db/client.js";
import type { RegulatoryRule } from "./types.js";
import { LifecycleState } from "./types.js";

function rowToRegulatoryRule(row: typeof regulatoryRules.$inferSelect): RegulatoryRule {
  return {
    id: row.id,
    subject: row.subject,
    applicableProjectType: row.applicableProjectType ?? undefined,
    applicableWorkflowType: (row.applicableWorkflowType ?? undefined) as RegulatoryRule["applicableWorkflowType"],
    applicableZone: row.applicableZone,
    ruleSpecification: row.ruleSpecification as Record<string, unknown>,
    citation: row.citation as RegulatoryRule["citation"],
    lifecycleState: row.lifecycleState,
    tier: row.tier ?? undefined,
    caveats: row.caveats as RegulatoryRule["caveats"],
    testCases: row.testCases as RegulatoryRule["testCases"],
    verificationHistory: row.verificationHistory as RegulatoryRule["verificationHistory"],
    supersedesRuleId: row.supersedesRuleId ?? undefined,
    supersededByRuleId: row.supersededByRuleId ?? undefined,
    isTestOnlyFixture: row.isTestOnlyFixture,
    acceptedEvidenceQuality: row.acceptedEvidenceQuality as RegulatoryRule["acceptedEvidenceQuality"],
    approvalRecord: (row.approvalRecord as RegulatoryRule["approvalRecord"]) ?? undefined,
  };
}

export async function getRuleById(db: Db | TransactionalDb, id: string): Promise<RegulatoryRule | undefined> {
  const [row] = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, id));
  return row ? rowToRegulatoryRule(row) : undefined;
}

/** ADM-5's version/lifecycle history read - read-only, no filters required by any ADM-5
 * acceptance criterion beyond "list what exists"; `applicableProjectType`/`applicableZone` are
 * accepted as optional narrowing, matching this codebase's existing query-parameter style. */
export async function listRules(db: Db, filters?: { applicableProjectType?: string; applicableZone?: string }): Promise<RegulatoryRule[]> {
  const conditions = [
    ...(filters?.applicableProjectType ? [eq(regulatoryRules.applicableProjectType, filters.applicableProjectType)] : []),
    ...(filters?.applicableZone ? [eq(regulatoryRules.applicableZone, filters.applicableZone)] : []),
  ];
  const rows = conditions.length > 0 ? await db.select().from(regulatoryRules).where(and(...conditions)) : await db.select().from(regulatoryRules);
  return rows.map(rowToRegulatoryRule);
}

export type TransitionResult = { transitioned: true; rule: RegulatoryRule } | { transitioned: false };

/**
 * Concurrency-safe conditional transition (founder-directed correction, 2026-08-25) - the
 * database's own `WHERE lifecycle_state = <expected>` clause is the actual persistence
 * correctness boundary, NOT a read-then-unconditional-UPDATE-by-id, which would permit a
 * stale/concurrent request to appear to succeed. Mirrors the same database-level-guarantee
 * pattern `orders`' partial unique indexes already use elsewhere in this codebase.
 *
 * Always called from inside one `withAdminTransaction` call, immediately after the pure
 * `lifecycle.ts` `disable`/`reenable` function has already validated the SAME {from, to} pair
 * against an in-memory read of the row - this function re-verifies that expectation against the
 * database's current, authoritative state at write time, closing the TOCTOU gap a plain read
 * followed by an unconditional write would leave open.
 */
export async function transitionLifecycleState(
  tx: TransactionalDb,
  id: string,
  transition: { from: LifecycleState; to: LifecycleState }
): Promise<TransitionResult> {
  const rows = await tx
    .update(regulatoryRules)
    .set({ lifecycleState: transition.to })
    .where(and(eq(regulatoryRules.id, id), eq(regulatoryRules.lifecycleState, transition.from)))
    .returning();

  const [row] = rows;
  if (!row) return { transitioned: false };
  return { transitioned: true, rule: rowToRegulatoryRule(row) };
}
