/**
 * ReportGenerationJob claim/recovery - NFR Design Pattern 3. Job correctness comes from
 * Postgres's atomic conditional UPDATE, not from "only one process is running" - the SQL below
 * is safe under concurrent callers even though Unit 2 deploys a single replica.
 */

import { sql, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { reportGenerationJobs, type ReportGenerationJobRow } from "../db/schema.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../screening-request/authorization.js";

export const ReportGenerationJobState = {
  QUEUED: "QUEUED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
} as const;
export type ReportGenerationJobState = (typeof ReportGenerationJobState)[keyof typeof ReportGenerationJobState];

export const DEFAULT_STALE_CLAIM_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes - a starting value, tuned from Build & Test's real STAGE_TIMING data, not treated as final.

/** Creates a QUEUED job idempotently per screening request - re-authorizing an
 * already-snapshotted request must not create a duplicate job. */
export async function createReportGenerationJob(
  db: Db,
  screeningRequestId: string,
  authorization: GenerationAuthorization
): Promise<ReportGenerationJobRow> {
  const existing = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, screeningRequestId));
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(reportGenerationJobs)
    .values({ screeningRequestId, generationAuthorization: authorization, state: ReportGenerationJobState.QUEUED })
    .returning();
  if (!row) throw new Error("Failed to create ReportGenerationJob.");
  return row;
}

/** Atomic QUEUED -> IN_PROGRESS claim. Returns the claimed row, or undefined if someone else
 * (or this same poller on a prior tick) already claimed it - never a partial/ambiguous result. */
export async function claimQueuedJob(db: Db, jobId: string): Promise<ReportGenerationJobRow | undefined> {
  const [row] = await db
    .update(reportGenerationJobs)
    .set({ state: ReportGenerationJobState.IN_PROGRESS, claimedAt: sql`now()`, retryAttempts: sql`${reportGenerationJobs.retryAttempts} + 1`, updatedAt: sql`now()` })
    .where(sql`${reportGenerationJobs.id} = ${jobId} AND ${reportGenerationJobs.state} = ${ReportGenerationJobState.QUEUED}`)
    .returning();
  return row;
}

/**
 * Atomic stale-claim recovery: only reclaims a job that is still IN_PROGRESS and whose claim is
 * older than staleThresholdMs - never allows an arbitrary IN_PROGRESS job to be rerun.
 *
 * Corrected 2026-08-25 (Operations review, Unit 2B): releases the job back to QUEUED, rather than
 * re-setting it to IN_PROGRESS as Unit 2's original poller-model version of this function did.
 * Unit 2's poller called this and then immediately, synchronously, re-ran the pipeline in the same
 * process - "reclaim" meant "I am now the owner, about to actually process it," so re-marking
 * IN_PROGRESS (with a fresh `claimedAt`) was correct for that model. Unit 2B's event-driven model
 * is different: reclaiming and actually executing are two separate steps (a Cron-triggered
 * `start(reportGenerationWorkflow, [jobId])`, whose own first step, `claimJobStep`, calls the
 * EXISTING, unmodified `claimQueuedJob` - an atomic QUEUED -> IN_PROGRESS claim). For that second
 * claim to succeed, this function must actually leave the row in `QUEUED`, not `IN_PROGRESS` -
 * otherwise the freshly-started replacement workflow's own claim step would affect zero rows and
 * exit immediately without ever running the pipeline, silently undoing the whole point of
 * reclaiming it. The `WHERE ... AND claimedAt < now() - threshold` conditional remains the atomic
 * concurrency guard - only one overlapping caller (e.g. two overlapping Cron invocations) can ever
 * win this UPDATE for a given job; the other affects zero rows and does nothing further for it in
 * that cycle. See `checkout-fulfillment/reconciliation.ts`'s check 5 for the actual caller.
 */
export async function reclaimStaleJob(
  db: Db,
  jobId: string,
  staleThresholdMs: number = DEFAULT_STALE_CLAIM_THRESHOLD_MS
): Promise<ReportGenerationJobRow | undefined> {
  const [row] = await db
    .update(reportGenerationJobs)
    .set({ state: ReportGenerationJobState.QUEUED, retryAttempts: sql`${reportGenerationJobs.retryAttempts} + 1`, updatedAt: sql`now()` })
    .where(
      sql`${reportGenerationJobs.id} = ${jobId} AND ${reportGenerationJobs.state} = ${ReportGenerationJobState.IN_PROGRESS} AND ${reportGenerationJobs.claimedAt} < now() - (${staleThresholdMs} || ' milliseconds')::interval`
    )
    .returning();
  return row;
}

/**
 * Deliberately conservative default for Cron's stale-`IN_PROGRESS` reclaim (Unit 2B check 5) - NOT
 * the same value as `DEFAULT_STALE_CLAIM_THRESHOLD_MS` (5 minutes), which was tuned for Unit 2's
 * short-poll-tick model, a different execution shape entirely. This threshold exists to catch a
 * genuinely abandoned claim (the Vercel Function running the pipeline was killed outright - see
 * `report-generation-workflow.ts`'s docstring on why an ordinary application-level failure
 * essentially never leaves a job stuck here at all), never a merely-slow-but-still-running report.
 * The Workflow SDK retries a failed step up to 3 times (4 total attempts) with its own backoff
 * before propagating failure - this value must comfortably exceed the realistic worst case across
 * every pipeline stage plus that retry/backoff window, not just a single stage's typical duration.
 * 20 minutes is a starting, provisional value (same "not empirically tuned yet" status as every
 * other threshold in this codebase) - revise once real `STAGE_TIMING` data exists showing actual
 * worst-case full-pipeline duration including retries. Kept as a single named, easily-changed
 * constant (this codebase's established pattern for tunable thresholds) rather than a new env var.
 */
export const DEFAULT_STALE_IN_PROGRESS_RECLAIM_THRESHOLD_MS = 20 * 60 * 1000;

export async function listQueuedJobIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: reportGenerationJobs.id }).from(reportGenerationJobs).where(eq(reportGenerationJobs.state, ReportGenerationJobState.QUEUED));
  return rows.map((r) => r.id);
}

export const DEFAULT_STUCK_QUEUED_GRACE_MS = 2 * 60 * 1000; // infrastructure-design.md's "short grace period" for check 1 - not treated as final.

/** Cron reconciliation helper (Unit 2B, infrastructure-design.md check 1): jobs still QUEUED past
 * the grace period - the reportGenerationWorkflow start() call that should have followed job
 * creation may have failed/been lost. Re-starting the workflow for these is always safe: if the
 * original start() actually succeeded, the reconciling run's claimQueuedJob step affects zero rows
 * and exits harmlessly. */
export async function listStuckQueuedJobIds(db: Db, graceMs: number = DEFAULT_STUCK_QUEUED_GRACE_MS): Promise<string[]> {
  const cutoff = new Date(Date.now() - graceMs);
  const rows = await db
    .select({ id: reportGenerationJobs.id, createdAt: reportGenerationJobs.createdAt })
    .from(reportGenerationJobs)
    .where(eq(reportGenerationJobs.state, ReportGenerationJobState.QUEUED));
  return rows.filter((r) => r.createdAt <= cutoff).map((r) => r.id);
}

/** Candidates for stale-claim recovery: any IN_PROGRESS job (staleness itself is re-checked
 * atomically by reclaimStaleJob - this list may include non-stale jobs the caller shouldn't
 * actually reclaim yet). */
export async function listInProgressJobIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: reportGenerationJobs.id }).from(reportGenerationJobs).where(eq(reportGenerationJobs.state, ReportGenerationJobState.IN_PROGRESS));
  return rows.map((r) => r.id);
}

export async function markJobComplete(db: Db, jobId: string, evidenceReportArtifactId: string): Promise<void> {
  await db
    .update(reportGenerationJobs)
    .set({ state: ReportGenerationJobState.COMPLETE, evidenceReportArtifactId, updatedAt: sql`now()` })
    .where(eq(reportGenerationJobs.id, jobId));
}

export async function markJobFailed(db: Db, jobId: string, reason: string): Promise<void> {
  const [current] = await db.select({ failureReasons: reportGenerationJobs.failureReasons }).from(reportGenerationJobs).where(eq(reportGenerationJobs.id, jobId));
  const failureReasons = [...((current?.failureReasons as string[] | undefined) ?? []), reason];
  await db.update(reportGenerationJobs).set({ state: ReportGenerationJobState.FAILED, failureReasons, updatedAt: sql`now()` }).where(eq(reportGenerationJobs.id, jobId));
}

/** ADM-4 (Unit 3) - pure extraction of the affected Order id from a job's generationAuthorization,
 * when one exists. Never fabricates an orderId for an INTERNAL_PROTOTYPE job - such a job
 * truthfully has no customer Order, and this returns undefined rather than guessing. */
export function resolveOrderIdFromAuthorization(authorization: GenerationAuthorization): string | undefined {
  return authorization.type === GenerationAuthorizationType.VERIFIED_PAYMENT ? authorization.orderId : undefined;
}

/** ADM-5 (Unit 3) - resolves a report/artifact id to the job that produced it, so the caller can
 * follow generationAuthorization back to its Order. Read-only. */
export async function getJobByEvidenceReportArtifactId(db: Db, evidenceReportArtifactId: string): Promise<ReportGenerationJobRow | undefined> {
  const [row] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.evidenceReportArtifactId, evidenceReportArtifactId));
  return row;
}

/** ADM-1 (Unit 3) - order/report correlation read, read-only. */
export async function getReportGenerationJobsByScreeningRequestId(db: Db, screeningRequestId: string): Promise<ReportGenerationJobRow[]> {
  return db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, screeningRequestId));
}

/** ADM-4 (Unit 3) - read-only. No corresponding retry/requeue function exists anywhere in this
 * codebase (confirmed by the Functional Design correction ruling out FAILED-job retry as
 * out-of-scope for Unit 3) - this function's result is never fed into a mutation. */
export async function listFailedJobs(db: Db): Promise<ReportGenerationJobRow[]> {
  return db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.state, ReportGenerationJobState.FAILED));
}
