/**
 * Real headless-Chromium PDF rendering (Unit 2B platform pivot, 2026-08-24 - see
 * src/report-pdf-rendering/render.ts). On Linux (Vercel's actual production runtime, and CI's
 * ubuntu-latest), `renderPdfBytes` uses `puppeteer-core` + `@sparticuz/chromium`, unchanged since
 * the platform pivot. Maintenance correction (2026-09-18, founder-directed bug fix) - on any other
 * platform (a developer's local macOS/Windows machine, where `@sparticuz/chromium`'s Linux-only
 * binary cannot execute - `spawn ENOEXEC`, live-verified 2026-09-17/18), `renderPdfBytes` instead
 * uses `playwright`'s own locally-executable Chromium, a local-verification-only fallback that
 * never runs on Vercel. This test therefore now runs unconditionally on every platform - whichever
 * branch `renderPdfBytes` takes for the current OS, it must produce real, valid PDF bytes.
 */

import { describe, expect, it } from "vitest";
import { renderReportHtml, renderPdfBytes } from "../../src/report-pdf-rendering/render.js";
import type { EvidenceReportArtifactRow } from "../../src/db/schema.js";

const artifact: EvidenceReportArtifactRow = {
  id: "test-artifact",
  screeningRequestId: "test-request",
  reportGenerationJobId: "test-job",
  findings: [{ classification: "KNOWN", subject: "Rear setback", complianceOutcome: "PASS", explanationBasis: "10ft meets 5ft.", supportingEvidence: [] }],
  evidence: [],
  explanation: null,
  ruleVersionsUsed: [],
  dataRetrievalTimestamps: {},
  generatedAt: new Date(),
};

describe("Real PDF rendering (headless Chromium)", () => {
  it("produces real PDF bytes starting with the %PDF header", async () => {
    const html = renderReportHtml(artifact);
    const bytes = await renderPdfBytes(html);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  }, 30000);
});
