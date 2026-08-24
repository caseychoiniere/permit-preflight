/**
 * In-process ReportGenerationJob poller - NFR Design Pattern 3 / Infrastructure Design's central
 * decision (one persistent Railway process, no queue, no separate worker). Job correctness comes
 * from the atomic claim in report-generation-job/repository.ts, not from anything here - this
 * module is only responsible for deciding *when* to attempt a claim and running the pipeline
 * once one succeeds.
 *
 * Carry-forward implementation requirements (Infrastructure Design, binding):
 * 1. Starts exactly once per production process.
 * 2. Must not accidentally create accumulating poller loops under Next.js dev hot reload.
 * 3. Graceful shutdown stops claiming NEW jobs; an interrupted in-flight job is recovered later
 *    via stale-claim recovery - shutdown never fabricates a fake COMPLETE.
 */

import type { Db } from "../db/client.js";
import { listQueuedJobIds, listInProgressJobIds, claimQueuedJob, reclaimStaleJob, DEFAULT_STALE_CLAIM_THRESHOLD_MS } from "../report-generation-job/repository.js";
import { runReportGenerationPipeline, type PipelineDependencies } from "./pipeline.js";
import { logger } from "../shared/logger.js";

export interface PollerOptions {
  intervalMs?: number;
  staleClaimThresholdMs?: number;
  dependencies?: PipelineDependencies;
}

export interface JobPoller {
  stop: () => void;
}

/** Module-level guard against duplicate pollers - e.g. Next.js dev-mode hot reload re-executing
 * this module's top-level code without a real process restart. Only meaningful within a single
 * process; does not (and must not) provide cross-process correctness, which the atomic DB claim
 * already provides. */
let pollerStarted = false;

export function startJobPoller(db: Db, options: PollerOptions = {}): JobPoller {
  if (pollerStarted) {
    // Requirement 2: dev hot-reload (or any accidental duplicate call) must not start a second
    // poller loop in the same process.
    return { stop: () => undefined };
  }
  pollerStarted = true;

  const intervalMs = options.intervalMs ?? 5_000;
  const staleClaimThresholdMs = options.staleClaimThresholdMs ?? DEFAULT_STALE_CLAIM_THRESHOLD_MS;

  let stopping = false;
  let ticking = false;

  const timer = setInterval(() => {
    if (stopping || ticking) return;
    ticking = true;
    void tick(db, staleClaimThresholdMs, options.dependencies)
      .catch((err) => logger.error("JOB_FAILED", { reportGenerationJobId: "poller-tick", reason: err instanceof Error ? err.message : "Unknown poller error." }))
      .finally(() => {
        ticking = false;
      });
  }, intervalMs);
  // Never keep the process alive solely because of this timer - it should not block a clean exit
  // if something else initiates shutdown.
  timer.unref?.();

  return {
    stop: () => {
      stopping = true; // Requirement 3: stop claiming new jobs immediately.
      clearInterval(timer);
      pollerStarted = false;
    },
  };
}

async function tick(db: Db, staleClaimThresholdMs: number, dependencies?: PipelineDependencies): Promise<void> {
  const queuedIds = await listQueuedJobIds(db);
  for (const jobId of queuedIds) {
    const claimed = await claimQueuedJob(db, jobId);
    if (!claimed) continue; // Someone else claimed it first - not an error.
    logger.info("JOB_CLAIMED", { reportGenerationJobId: claimed.id });
    await runReportGenerationPipeline(db, claimed, dependencies);
  }

  const inProgressIds = await listInProgressJobIds(db);
  for (const jobId of inProgressIds) {
    const reclaimed = await reclaimStaleJob(db, jobId, staleClaimThresholdMs);
    if (!reclaimed) continue; // Not actually stale yet, or already handled - not an error.
    logger.info("JOB_STALE_RECOVERY", { reportGenerationJobId: reclaimed.id });
    await runReportGenerationPipeline(db, reclaimed, dependencies);
  }
}
