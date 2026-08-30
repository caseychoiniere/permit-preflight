/**
 * Report Explanation's ONLY point of contact with the concrete Anthropic-backed client -
 * explainFindings itself (index.ts) stays vendor-agnostic, accepting any AiCompletionClient, per
 * its own established separation. This file exists specifically so the credential-handling and
 * degrade-gracefully logic lives in exactly one place, shared by both real callers
 * (workflows/report-generation-workflow.ts's step, scripts/generate-prototype-report.ts's CLI
 * entry point) instead of each duplicating its own copy of "construct the client, catch failure,
 * fall back to undefined" - which is what let a real diagnostic gap go unnoticed (see the module
 * docstring on generateReportExplanation below).
 */

import { explainFindings, type ExplanationResult } from "./index.js";
import { createAnthropicCompletionClient } from "../rule-research-assistant/anthropic-client.js";
import type { Finding } from "../regulatory-rules-engine/types.js";
import { logger } from "../shared/logger.js";

/**
 * Product-correctness correction (2026-08-28): the ONLY place ANTHROPIC_API_KEY is read and the
 * ONLY place the real Anthropic client is constructed for report generation - both happen here,
 * inside a single self-contained operation that returns nothing but the serializable
 * ExplanationResult. Callers (report-generation-workflow.ts's runPipelineStep - an existing "use
 * step" function with full Node.js access, and generate-prototype-report.ts's CLI entry point,
 * itself already outside any workflow sandbox) never see or hold the API key or a client object;
 * neither ever crosses a Vercel Workflow orchestration boundary as workflow input/state, since
 * this function is called and awaited entirely within the caller's own step/process execution.
 *
 * Never throws - matches explainFindings' own "degrade gracefully, never fail the job" contract
 * (BR-U2-8): a missing key or a client-construction failure is treated exactly like any other
 * explanation failure (an unavailable client is not meaningfully different from a client that
 * fails on first use).
 *
 * Diagnostic gap this closes: previously, the reason a report's explanation degraded (no API key
 * configured vs. a genuine Anthropic API/schema failure vs. simply zero findings to explain) was
 * computed but never logged anywhere - only a STAGE_TIMING duration was visible, which looks
 * identical (near-zero) for "no client configured" and "explainFindings' own empty-findings guard
 * fired" alike, and gives no signal at all for a real API failure. Every UNAVAILABLE outcome is
 * now logged with its specific reason - never the API key, never a request header, only the
 * human-readable message explainFindings/createAnthropicCompletionClient already produce (which,
 * by construction, describe the failure - a missing env var, an HTTP status, a schema mismatch -
 * and never echo back request credentials; Anthropic's own error responses don't include them
 * either).
 */
export async function generateReportExplanation(findings: Finding[]): Promise<ExplanationResult> {
  let client;
  try {
    client = createAnthropicCompletionClient();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Anthropic client could not be constructed.";
    logger.warn("REPORT_EXPLANATION_DEGRADED", { reason });
    return { outcome: "UNAVAILABLE", reason };
  }

  const result = await explainFindings(findings, client);
  if (result.outcome === "UNAVAILABLE") {
    logger.warn("REPORT_EXPLANATION_DEGRADED", { reason: result.reason });
  }
  return result;
}
