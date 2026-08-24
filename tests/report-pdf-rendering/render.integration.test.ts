/**
 * Real headless-Chromium PDF rendering - requires Playwright's browser binaries to be installed
 * (`npx playwright install chromium`), not credentials, so this is unconditionally part of the
 * integration suite (CI installs browsers as part of its own setup, per the CI workflow).
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
