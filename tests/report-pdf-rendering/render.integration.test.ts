/**
 * Real headless-Chromium PDF rendering via `puppeteer-core` + `@sparticuz/chromium` (Unit 2B
 * platform pivot, 2026-08-24 - see src/report-pdf-rendering/render.ts). `@sparticuz/chromium`
 * ships Linux-only binaries (built for Lambda/Vercel's function runtime) - this suite skips
 * cleanly on any other platform, same "skip cleanly without what this needs" discipline as every
 * credential-gated live-integration test, just gated on platform instead of an env var. CI runs
 * on Linux (ubuntu-latest), so this still runs unconditionally there.
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

describe.skipIf(process.platform !== "linux")("Real PDF rendering (headless Chromium)", () => {
  it("produces real PDF bytes starting with the %PDF header", async () => {
    const html = renderReportHtml(artifact);
    const bytes = await renderPdfBytes(html);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  }, 30000);
});
