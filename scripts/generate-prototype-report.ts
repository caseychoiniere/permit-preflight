#!/usr/bin/env tsx
/**
 * INTERNAL_PROTOTYPE trigger (BR-U2B-9, corrected 2026-08-24 route-surface review) - a server-only
 * CLI entry point, never a deployed Next.js Route Handler. "Unlinked from the UI" is not
 * authorization on Vercel, where every deployed Route Handler is a public HTTP endpoint; this
 * script imports the existing domain functions directly and is never bundled into the app's
 * deployed route surface. Run via `npm run generate-prototype-report -- <screeningRequestId>
 * <authorizedBy>` (or `tsx scripts/generate-prototype-report.ts <screeningRequestId>
 * <authorizedBy>`) from deploy/ops tooling or a local shell only.
 *
 * Runs the pipeline DIRECTLY in this process (claim + runReportGenerationPipeline) rather than via
 * `start(reportGenerationWorkflow, ...)` - a deliberate choice, not an oversight. The Vercel
 * Workflow SDK's `start()` is designed to be called from within the same Next.js app build that
 * registered the workflow (an API route, Server Action, etc.); this script runs standalone under
 * `tsx`, entirely outside that build/registration process, so relying on `start()` here would be
 * exercising an untested cross-context path. INTERNAL_PROTOTYPE is a rare, manually-run,
 * single-operator action - it does not need Workflow-SDK-grade durability. If this process crashes
 * mid-pipeline, the job is left IN_PROGRESS, recoverable via the existing atomic stale-claim
 * mechanism (report-generation-job/repository.ts's reclaimStaleJob) - not run automatically for
 * INTERNAL_PROTOTYPE jobs, so a stuck one requires a follow-up manual reclaim in this rare case.
 */

import { getDb } from "../src/db/client.js";
import { authorizeReportGeneration } from "../src/screening-request/authorization.js";
import { claimQueuedJob } from "../src/report-generation-job/repository.js";
import { runReportGenerationPipeline } from "../src/report-generation-orchestrator/pipeline.js";
import { createAnthropicCompletionClient } from "../src/rule-research-assistant/anthropic-client.js";
import { logger } from "../src/shared/logger.js";

async function main(): Promise<void> {
  const [screeningRequestId, authorizedBy] = process.argv.slice(2);
  if (!screeningRequestId || !authorizedBy) {
    console.error("Usage: generate-prototype-report <screeningRequestId> <authorizedBy>");
    process.exitCode = 1;
    return;
  }

  const db = getDb();
  const result = await authorizeReportGeneration(db, screeningRequestId, authorizedBy);

  if (result.outcome === "NOT_FOUND") {
    console.error(`Screening request ${screeningRequestId} not found.`);
    process.exitCode = 1;
    return;
  }
  if (result.outcome === "NOT_READY") {
    console.error(`Not ready: ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  logger.info("INTERNAL_PROTOTYPE_AUTHORIZED", { screeningRequestId, authorizedBy, reportGenerationJobId: result.reportGenerationJobId });

  const claimed = await claimQueuedJob(db, result.reportGenerationJobId);
  if (!claimed) {
    console.error(`ReportGenerationJob ${result.reportGenerationJobId} could not be claimed (unexpected - it was just created).`);
    process.exitCode = 1;
    return;
  }

  let reportExplanationClient;
  try {
    reportExplanationClient = createAnthropicCompletionClient();
  } catch {
    reportExplanationClient = undefined; // ANTHROPIC_API_KEY not set - degrades gracefully (BR-U2-8).
  }

  await runReportGenerationPipeline(db, claimed, { reportExplanationClient });
  console.log(`ReportGenerationJob ${result.reportGenerationJobId} finished. Check its state in the database for COMPLETE/FAILED.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
