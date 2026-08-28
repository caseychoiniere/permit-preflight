/**
 * Cron reconciliation backstop (Infrastructure Design's Execution Model, "The Cron backstop"
 * section). Workflow durability covers crashes AFTER a workflow has started - it does not cover
 * the one hop before that: the `start()` call itself failing, timing out, or its response being
 * lost. This module inspects durable DATABASE state only, never whether a Workflow run exists
 * (Workflow-Start Idempotency correction, 2026-08-24) - every check below is a conditional
 * DB read followed by an ordinary re-`start()`, safe under overlapping/repeated Cron invocations
 * for the same reason the underlying claims are (a conditional DB action, not a flag Cron tracks
 * itself).
 */

import { eq, and } from "drizzle-orm";
import { start } from "workflow/api";
import type { Db } from "../db/client.js";
import { getDb } from "../db/client.js";
import { orders, reportGenerationJobs } from "../db/schema.js";
import {
  listStuckQueuedJobIds,
  listInProgressJobIds,
  reclaimStaleJob,
  DEFAULT_STALE_IN_PROGRESS_RECLAIM_THRESHOLD_MS,
  ReportGenerationJobState,
} from "../report-generation-job/repository.js";
import { listOrdersNeedingRefundResubmission } from "../order-payment/repository.js";
import { listStaleGuestDeliveries, deliverGuestReportAccess } from "../report-access/repository.js";
import { createResendClient } from "../email-delivery/resend-client.js";
import { OrderState, RefundReason } from "../order-payment/types.js";
// No ".js" suffix on these two imports specifically (unlike this codebase's usual convention) -
// the Workflow SDK's build-time workflow-discovery scanner does its own module resolution,
// separate from webpack/Next's, and does not follow the ".js"-pointing-at-".ts" remapping this
// app's custom next.config.mjs extensionAlias sets up for webpack. Confirmed empirically: with the
// ".js" suffix, `next build`'s workflow manifest registered 0 workflows; without it, both
// workflows and every step were discovered correctly (see the Code Generation README).
import { reportGenerationWorkflow } from "../workflows/report-generation-workflow";
import { processRefundWorkflow } from "../workflows/refund-workflow";
import { logger } from "../shared/logger.js";

export interface ReconciliationSummary {
  restartedQueuedJobs: number;
  refundsStartedForFailedGeneration: number;
  resumedStaleRefunds: number;
  redeliveredGuestReports: number;
  reclaimedStaleInProgressJobs: number;
}

/**
 * Check 5 (Operations correction, 2026-08-25): `ReportGenerationJob` rows stranded `IN_PROGRESS`
 * far past any legitimate execution/retry window - closes the responsibility lost when Unit 2's
 * Railway poller (which had its own stale-`IN_PROGRESS` reclaim loop) was superseded by the
 * platform pivot; Unit 2B's Cron reconciliation had not ported it until this correction.
 *
 * `reclaimStaleJob` is the sole atomic authority here - it releases the job back to `QUEUED` only
 * if it is still `IN_PROGRESS` and its claim is older than `thresholdMs` (see that function's own
 * corrected docstring for exactly why `QUEUED`, not `IN_PROGRESS`). Only one of any number of
 * overlapping callers can ever win that conditional UPDATE for a given job; every other caller's
 * attempt affects zero rows and does nothing further for it in that cycle - repeated/overlapping
 * Cron invocations remain harmless, the same discipline as every other check in this module. The
 * replacement `start(reportGenerationWorkflow, [jobId])` is called ONLY by the winner, and that
 * fresh run's own first step (`claimJobStep` -> the existing, unmodified `claimQueuedJob`) must
 * still win the ordinary atomic `QUEUED -> IN_PROGRESS` claim before executing anything - reclaim
 * does not, by itself, bypass or replace that gate.
 *
 * `startWorkflow` is injectable so this can be tested without the real Vercel Workflow runtime
 * (calling the real `start()` on an untransformed import outside a Next.js/webpack build throws -
 * see `scripts/generate-prototype-report.ts`'s docstring for the same constraint encountered
 * elsewhere) - defaults to the real `start(reportGenerationWorkflow, [jobId])` in production.
 */
export async function reclaimStaleInProgressJobs(
  db: Db,
  thresholdMs: number = DEFAULT_STALE_IN_PROGRESS_RECLAIM_THRESHOLD_MS,
  startWorkflow: (jobId: string) => Promise<unknown> = (jobId) => start(reportGenerationWorkflow, [jobId])
): Promise<number> {
  const inProgressIds = await listInProgressJobIds(db);
  let reclaimedCount = 0;
  for (const jobId of inProgressIds) {
    const reclaimed = await reclaimStaleJob(db, jobId, thresholdMs);
    if (!reclaimed) continue; // Not actually stale yet, or another overlapping invocation already won it.
    await startWorkflow(jobId);
    reclaimedCount++;
  }
  return reclaimedCount;
}

export async function runReconciliation(): Promise<ReconciliationSummary> {
  const db = getDb();
  const summary: ReconciliationSummary = {
    restartedQueuedJobs: 0,
    refundsStartedForFailedGeneration: 0,
    resumedStaleRefunds: 0,
    redeliveredGuestReports: 0,
    reclaimedStaleInProgressJobs: 0,
  };

  // Check 1: ReportGenerationJob rows QUEUED past the grace period.
  const stuckJobIds = await listStuckQueuedJobIds(db);
  for (const jobId of stuckJobIds) {
    await start(reportGenerationWorkflow, [jobId]);
    summary.restartedQueuedJobs++;
  }

  // Check 5: ReportGenerationJob rows stranded IN_PROGRESS past a conservative threshold - see
  // reclaimStaleInProgressJobs's own docstring. Run early (alongside check 1) since both repair
  // the same underlying category of problem (report generation not actually progressing).
  summary.reclaimedStaleInProgressJobs = await reclaimStaleInProgressJobs(db);

  // Check 2: Order rows PAID with an associated ReportGenerationJob.state = FAILED.
  const paidFailedRows = await db
    .select({ orderId: orders.id })
    .from(orders)
    .innerJoin(reportGenerationJobs, eq(reportGenerationJobs.screeningRequestId, orders.screeningRequestId))
    .where(and(eq(orders.state, OrderState.PAID), eq(reportGenerationJobs.state, ReportGenerationJobState.FAILED)));
  for (const row of paidFailedRows) {
    await start(processRefundWorkflow, [row.orderId, RefundReason.GENERATION_FAILURE]);
    summary.refundsStartedForFailedGeneration++;
  }

  // Check 3: Order rows REFUND_PENDING past the grace period with no stripeRefundId recorded.
  const staleRefundOrders = await listOrdersNeedingRefundResubmission(db);
  for (const order of staleRefundOrders) {
    // The reason argument is only consulted by processRefund's PAID branch (to set refundReason at
    // claim time) - resuming an already-REFUND_PENDING order never re-reads it, so the already-
    // persisted refundReason (falling back to a placeholder if somehow absent) is safe to pass.
    await start(processRefundWorkflow, [order.id, order.refundReason ?? RefundReason.CUSTOMER_REQUEST]);
    summary.resumedStaleRefunds++;
  }

  // Check 4: ReportAccessCredential rows still EMAIL_PENDING/EMAIL_FAILED past the threshold.
  const staleDeliveries = await listStaleGuestDeliveries(db);
  if (staleDeliveries.length > 0) {
    const resendClient = createResendClient();
    for (const delivery of staleDeliveries) {
      const [orderRow] = await db.select({ customerEmail: orders.customerEmail }).from(orders).where(eq(orders.screeningRequestId, delivery.screeningRequestId));
      try {
        await deliverGuestReportAccess(db, resendClient, orderRow?.customerEmail ?? undefined, delivery.reportArtifactId);
        summary.redeliveredGuestReports++;
      } catch (err) {
        logger.error("GUEST_DELIVERY_RECONCILIATION_FAILED", { reportArtifactId: delivery.reportArtifactId, reason: err instanceof Error ? err.message : "Unknown error." });
      }
    }
  }

  logger.info("RECONCILIATION_COMPLETE", { ...summary });
  return summary;
}
