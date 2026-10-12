/**
 * Starts the Vercel Workflow a payment confirmation created work for. Shared by every path that can confirm a payment (the Stripe webhook, the live Stripe check on
 * the status read, and the cron backstop) so they cannot drift apart. `start()` is an external side effect: callers invoke it only AFTER the confirming
 * transaction has committed, and a lost start is repaired by reconciliation check 1 (a QUEUED job past its grace period).
 *
 * No ".js" suffix on the workflow imports (see reconciliation.ts's comment) - the Workflow SDK's build-time discovery does its own module resolution.
 */

import { start } from "workflow/api";
import type { WebhookFollowUpWorkflow } from "../order-payment/repository.js";
import { reportGenerationWorkflow } from "../workflows/report-generation-workflow";
import { processRefundWorkflow } from "../workflows/refund-workflow";

export async function startFollowUpWorkflow(work: WebhookFollowUpWorkflow): Promise<void> {
  if (work.kind === "REPORT_GENERATION") await start(reportGenerationWorkflow, [work.jobId]);
  else await start(processRefundWorkflow, [work.orderId, work.reason]);
}
