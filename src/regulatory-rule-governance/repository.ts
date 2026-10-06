/**
 * Regulatory Rule Governance repository - Unit 3 addition. Rules previously had no dedicated
 * persistence layer (report-generation-orchestrator/pipeline.ts's own inline, ACTIVE-only query
 * is untouched by this file and stays the evaluation path's read). This module exists for ADM-5's
 * version/lifecycle history read and ADM-7's disable/re-enable persistence.
 */

import { eq, and, desc } from "drizzle-orm";
import { regulatoryRules, ruleProfessionalReviews, type NewRegulatoryRuleRow } from "../db/schema.js";
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
/**
 * `additionalFields` (rule-lifecycle admin mechanism, 2026-09-24) - merged into the same `SET`
 * clause as `lifecycleState`, for the fields each new transition also persists (`triage()`'s
 * `tier`, `sourceVerify()`'s appended `verificationHistory`, `approve()`'s
 * `acceptedEvidenceQuality`/`approvalRecord`). The `{from, to}` WHERE-guard itself is untouched -
 * this parameter is strictly additive to what's already SET, never a new correctness mechanism.
 */
export async function transitionLifecycleState(
  tx: TransactionalDb,
  id: string,
  transition: { from: LifecycleState; to: LifecycleState },
  additionalFields?: Partial<NewRegulatoryRuleRow>
): Promise<TransitionResult> {
  const rows = await tx
    .update(regulatoryRules)
    .set({ lifecycleState: transition.to, ...additionalFields })
    .where(and(eq(regulatoryRules.id, id), eq(regulatoryRules.lifecycleState, transition.from)))
    .returning();

  const [row] = rows;
  if (!row) return { transitioned: false };
  return { transitioned: true, rule: rowToRegulatoryRule(row) };
}

export type InsertResult = { inserted: true; rule: RegulatoryRule } | { inserted: false };

/**
 * Bootstrap-only insert (rule-lifecycle admin mechanism, §5) - `INSERT ... ON CONFLICT (id) DO
 * NOTHING`, deliberately never `DO UPDATE` (unlike `scripts/staging-test-rules.ts`'s own upsert
 * precedent), per the founder's explicit "unable to overwrite an existing record silently"
 * requirement. Used only by `bootstrap-unit-6b.ts`, never by any lifecycle-transition route.
 */
export async function insertRuleIfAbsent(tx: TransactionalDb, row: NewRegulatoryRuleRow): Promise<InsertResult> {
  const rows = await tx.insert(regulatoryRules).values(row).onConflictDoNothing({ target: regulatoryRules.id }).returning();
  const [inserted] = rows;
  if (!inserted) return { inserted: false };
  return { inserted: true, rule: rowToRegulatoryRule(inserted) };
}

export interface NewProfessionalReview {
  ruleId: string;
  reviewerIdentity: string;
  reviewerRole: string;
  reviewDate: Date;
  sourceProvisions: string[];
  conclusion: string;
  limitations: string;
  evidenceRefs: string[];
  suitableForProductUse: boolean;
  recordedBy: string;
}

/** Append-only insert of one professional-review row. Never updates or deletes an existing row. */
export async function insertProfessionalReview(tx: TransactionalDb, review: NewProfessionalReview): Promise<{ id: string }> {
  const [row] = await tx.insert(ruleProfessionalReviews).values(review).returning({ id: ruleProfessionalReviews.id });
  if (!row) throw new Error("Professional review insert returned no row.");
  return row;
}

function toPersistedReview(row: typeof ruleProfessionalReviews.$inferSelect) {
  return {
    id: row.id,
    reviewerIdentity: row.reviewerIdentity,
    reviewerRole: row.reviewerRole,
    reviewDate: row.reviewDate,
    sourceProvisions: row.sourceProvisions as string[],
    conclusion: row.conclusion,
    limitations: row.limitations,
    evidenceRefs: row.evidenceRefs as string[],
    suitableForProductUse: row.suitableForProductUse,
  };
}

/**
 * The newest GROUP of professional reviews recorded for a rule: every row sharing the maximum
 * created_at (normally one). Returning the whole tie group - rather than an arbitrary single row -
 * lets the caller fail closed when equally-new reviews disagree (a later review supersedes an
 * earlier one; reviews with identical timestamps cannot be ordered, so any unsuitable one blocks).
 */
export async function getNewestProfessionalReviews(db: Db | TransactionalDb, ruleId: string) {
  const rows = await db.select().from(ruleProfessionalReviews).where(eq(ruleProfessionalReviews.ruleId, ruleId)).orderBy(desc(ruleProfessionalReviews.createdAt), desc(ruleProfessionalReviews.id));
  const newest = rows[0]?.createdAt.getTime();
  return rows.filter((r) => r.createdAt.getTime() === newest).map(toPersistedReview);
}

/** Row-locking read (SELECT ... FOR UPDATE) used inside a transaction to serialize Tier-2 review
 * recording against Tier-2 source verification for the same rule. */
export async function getRuleByIdForUpdate(tx: TransactionalDb, id: string): Promise<RegulatoryRule | undefined> {
  const [row] = await tx.select().from(regulatoryRules).where(eq(regulatoryRules.id, id)).for("update");
  return row ? rowToRegulatoryRule(row) : undefined;
}
