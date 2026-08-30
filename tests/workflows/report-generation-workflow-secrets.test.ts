/**
 * Production-boundary-style test (matches this codebase's existing convention - e.g.
 * internal-prototype-route-surface.test.ts, production-boundary.test.ts - inspecting the actual
 * source rather than rendering/executing it) for the 2026-08-28 correction: no ANTHROPIC_API_KEY
 * or Anthropic client object may ever be constructed in, or passed through,
 * src/workflows/report-generation-workflow.ts's own orchestration code. The real credential
 * handling now lives entirely inside report-explanation/anthropic-wiring.ts's
 * generateReportExplanation, called from a "use step" function (full Node.js access) as a plain
 * function reference - this test fails loudly if that boundary erodes.
 *
 * Checks for the actual READ pattern (`process.env["ANTHROPIC_API_KEY"]` /
 * `process.env.ANTHROPIC_API_KEY`), not a bare substring match on the name - both this file's own
 * docstrings and the source files under test legitimately mention "ANTHROPIC_API_KEY" in prose
 * comments explaining exactly this boundary, which a plain .toContain() would misflag.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOW_SOURCE_PATH = join(REPO_ROOT, "src", "workflows", "report-generation-workflow.ts");

/** Matches an actual env-var READ (`process.env.ANTHROPIC_API_KEY` or
 * `process.env["ANTHROPIC_API_KEY"]`), never a bare mention of the name in a comment/string. */
const READS_ANTHROPIC_KEY = /process\.env(\.|\[["'])ANTHROPIC_API_KEY/;

describe("report-generation-workflow.ts never handles Anthropic credentials directly", () => {
  const source = readFileSync(WORKFLOW_SOURCE_PATH, "utf8");

  it("[hard invariant] never reads process.env.ANTHROPIC_API_KEY directly", () => {
    expect(source).not.toMatch(READS_ANTHROPIC_KEY);
  });

  it("[hard invariant] never imports createAnthropicCompletionClient or the anthropic-client module directly", () => {
    expect(source).not.toContain("createAnthropicCompletionClient");
    expect(source).not.toMatch(/rule-research-assistant\/anthropic-client/);
  });

  it("[hard invariant] never passes a raw client under the old reportExplanationClient shape - only a plain generateExplanation callback reference", () => {
    expect(source).not.toContain("reportExplanationClient");
    expect(source).toMatch(/generateExplanation:\s*generateReportExplanation/);
  });

  it("imports generateReportExplanation from report-explanation/anthropic-wiring.js - the single place the real client is constructed", () => {
    expect(source).toMatch(/import\s*\{\s*generateReportExplanation\s*\}\s*from\s*["']\.\.\/report-explanation\/anthropic-wiring\.js["']/);
  });

  it("the same is true of the other real caller, scripts/generate-prototype-report.ts (a plain CLI script, but the same discipline applies)", () => {
    const scriptSource = readFileSync(join(REPO_ROOT, "scripts", "generate-prototype-report.ts"), "utf8");
    expect(scriptSource).not.toMatch(READS_ANTHROPIC_KEY);
    expect(scriptSource).not.toContain("createAnthropicCompletionClient");
    expect(scriptSource).not.toContain("reportExplanationClient");
    expect(scriptSource).toMatch(/generateExplanation:\s*generateReportExplanation/);
  });

  it("[hard invariant] process.env.ANTHROPIC_API_KEY is read in exactly one place in src/: anthropic-client.ts itself", () => {
    // Confirms the correction actually consolidated credential-reading rather than just moving it
    // to a second location - a real regression check, not just an absence check on one file.
    function findFilesReadingKey(dir: string): string[] {
      const results: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) results.push(...findFilesReadingKey(full));
        else if (entry.endsWith(".ts") && READS_ANTHROPIC_KEY.test(readFileSync(full, "utf8"))) results.push(full);
      }
      return results;
    }
    const offenders = findFilesReadingKey(join(REPO_ROOT, "src"));
    expect(offenders).toEqual([join(REPO_ROOT, "src", "rule-research-assistant", "anthropic-client.ts")]);
  });
});
