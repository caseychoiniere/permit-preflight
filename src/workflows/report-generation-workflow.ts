/**
 * reportGenerationWorkflow - Unit 2B's durable, event-driven replacement for Unit 2's Railway
 * in-process poller (Infrastructure Design's Execution Model; platform-pivot ADR). Started
 * immediately after a ReportGenerationJob is created (QUEUED), from either the Stripe webhook
 * route (VERIFIED_PAYMENT) or the INTERNAL_PROTOTYPE CLI script.
 *
 * Workflow-Start Idempotency correction (2026-08-24): the deterministic hook token below is
 * DEFENSE-IN-DEPTH ONLY - `claimQueuedJob` (Unit 2, unmodified) is the authoritative execution-
 * idempotency mechanism, since `start()`'s duplicate-run check is not atomic with run creation.
 * Multiple runs may exist for the same job; only the one that wins the atomic claim executes the
 * pipeline. This workflow function itself never touches the database/Stripe/Resend directly (the
 * Workflow SDK's sandboxed workflow runtime has no Node.js access) - every side effect is a
 * `"use step"` function below, each a thin wrapper around the existing, unmodified domain logic.
 */

import { createHook } from "workflow";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { reportGenerationJobs, type ReportGenerationJobRow } from "../db/schema.js";
import { claimQueuedJob } from "../report-generation-job/repository.js";
import { runReportGenerationPipeline } from "../report-generation-orchestrator/pipeline.js";
import { handleGenerationOutcome } from "../checkout-fulfillment/index.js";
import { createResendClient } from "../email-delivery/resend-client.js";
import { generateReportExplanation } from "../report-explanation/anthropic-wiring.js";

export async function reportGenerationWorkflow(jobId: string) {
  "use workflow";

  const hook = createHook({ token: `report-generation:${jobId}` });
  const conflict = await hook.getConflict();
  hook.dispose();
  if (conflict) {
    // Defense-in-depth only (see module docstring) - NOT relied upon for correctness. The claim
    // step below is what actually prevents duplicate execution even if this check is bypassed.
    return { outcome: "DEDUPED" as const, ownerRunId: conflict.runId };
  }

  const claimed = await claimJobStep(jobId);
  if (!claimed) {
    // Someone else's run already claimed (or completed) this job - exit immediately, without
    // running Property Intelligence, PostGIS, the Rules Engine, Anthropic, artifact creation, or
    // customer delivery (Execution Model's explicit requirement).
    return { outcome: "ALREADY_CLAIMED" as const };
  }

  await runPipelineStep(jobId);
  const job = await reloadJobStep(jobId);
  if (job) {
    await deliverOutcomeStep(job);
  }
  return { outcome: "PROCESSED" as const };
}

async function claimJobStep(jobId: string): Promise<boolean> {
  "use step";
  const claimed = await claimQueuedJob(getDb(), jobId);
  return claimed !== undefined;
}

async function runPipelineStep(jobId: string): Promise<void> {
  "use step";
  const db = getDb();
  const [job] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, jobId));
  if (!job) return;

  // Product-correctness correction (2026-08-28): this used to construct the Anthropic client
  // directly here and pass the resulting client OBJECT into runReportGenerationPipeline. Neither
  // that client nor ANTHROPIC_API_KEY ever actually crossed a Vercel Workflow orchestration
  // boundary (this whole function already runs inside this "use step" function's own execution,
  // which has full Node.js access) - but generateExplanation now owns the full "read the key,
  // construct the client, call explainFindings" operation as one self-contained unit (see
  // report-explanation/anthropic-wiring.ts), matching the general guidance to keep
  // credential-handling entirely inside a step's own execution rather than split across this
  // orchestration file and the pipeline it calls. Only a plain callback reference crosses into
  // runReportGenerationPipeline below - never a key or client value.
  await runReportGenerationPipeline(db, job, { generateExplanation: generateReportExplanation });
}

async function reloadJobStep(jobId: string): Promise<ReportGenerationJobRow | undefined> {
  "use step";
  const [job] = await getDb().select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, jobId));
  return job;
}

async function deliverOutcomeStep(job: ReportGenerationJobRow): Promise<void> {
  "use step";
  // COMPLETE/VERIFIED_PAYMENT triggers guest email delivery; FAILED/VERIFIED_PAYMENT starts
  // processRefundWorkflow with GENERATION_FAILURE (BR-U2B-6/BR-U2B-8); INTERNAL_PROTOTYPE jobs are
  // ignored entirely (checkout-fulfillment.handleGenerationOutcome's own scope guard). The Resend
  // client is constructed lazily (only if the COMPLETE branch actually needs it).
  await handleGenerationOutcome(getDb(), createResendClient, job);
}
