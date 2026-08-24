/**
 * Next.js instrumentation hook - runs once when the server process starts (next start / next
 * dev), the officially-supported place to bootstrap the in-process ReportGenerationJob poller
 * (Infrastructure Design: no queue, no separate worker - the poller lives inside this same
 * process). Guarded against edge/browser runtimes and against duplicate starts (poller.ts's own
 * module-level guard) so Next.js dev hot-reload can't accumulate poller loops.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Bug found via real Build & Test smoke testing (2026-08-23): calling getDb() here eagerly
  // crashed server boot entirely - including /healthz, which must stay a shallow, DB-independent
  // check (Infrastructure Design) - whenever DATABASE_URL was unset. getDb() is lazy by design;
  // this hook must not defeat that by calling it before anything has actually requested a query.
  // Without DATABASE_URL, the poller simply doesn't start - the rest of the app (including the
  // health check and any DB-independent route) must still boot and serve requests normally.
  if (!process.env["DATABASE_URL"]) return;

  const { getDb } = await import("./src/db/client.js");
  const { startJobPoller } = await import("./src/report-generation-orchestrator/poller.js");
  const { createAnthropicCompletionClient } = await import("./src/rule-research-assistant/anthropic-client.js");

  let reportExplanationClient;
  try {
    reportExplanationClient = createAnthropicCompletionClient();
  } catch {
    // ANTHROPIC_API_KEY not set - Report Explanation degrades gracefully (BR-U2-8), the poller
    // still runs the deterministic pipeline without it.
    reportExplanationClient = undefined;
  }

  const poller = startJobPoller(getDb(), { dependencies: { reportExplanationClient } });

  // Operations gap found while writing unit-2-operations-runbook.md (2026-08-23): graceful
  // shutdown must stop claiming NEW jobs on process termination - an in-flight job is recovered
  // later via stale-claim recovery, never fabricated as COMPLETE. poller.stop() existed but
  // wasn't wired to a signal handler. Safe to call more than once (idempotent no-op after the
  // first call via poller.ts's own guard reset).
  const shutdown = () => poller.stop();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
