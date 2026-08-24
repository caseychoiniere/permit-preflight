/**
 * ReportGenerationJob claim/recovery - NFR Design Pattern 3. Job correctness comes from
 * Postgres's atomic conditional UPDATE, not from "only one process is running" - the SQL below
 * is safe under concurrent callers even though Unit 2 deploys a single replica.
 */

import { sql, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { reportGenerationJobs, type ReportGenerationJobRow } from "../db/schema.js";
import type { GenerationAuthorization } from "../screening-request/authorization.js";

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

/** Atomic stale-claim recovery: only reclaims a job that is still IN_PROGRESS and whose claim is
 * older than staleThresholdMs - never allows an arbitrary IN_PROGRESS job to be rerun. */
export async function reclaimStaleJob(
  db: Db,
  jobId: string,
  staleThresholdMs: number = DEFAULT_STALE_CLAIM_THRESHOLD_MS
): Promise<ReportGenerationJobRow | undefined> {
  const [row] = await db
    .update(reportGenerationJobs)
    .set({ state: ReportGenerationJobState.IN_PROGRESS, claimedAt: sql`now()`, retryAttempts: sql`${reportGenerationJobs.retryAttempts} + 1`, updatedAt: sql`now()` })
    .where(
      sql`${reportGenerationJobs.id} = ${jobId} AND ${reportGenerationJobs.state} = ${ReportGenerationJobState.IN_PROGRESS} AND ${reportGenerationJobs.claimedAt} < now() - (${staleThresholdMs} || ' milliseconds')::interval`
    )
    .returning();
  return row;
}

export async function listQueuedJobIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: reportGenerationJobs.id }).from(reportGenerationJobs).where(eq(reportGenerationJobs.state, ReportGenerationJobState.QUEUED));
  return rows.map((r) => r.id);
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
