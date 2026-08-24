/**
 * PDF rendering from an immutable EvidenceReportArtifact - the "render" half of NFR Design
 * Pattern 6. Pure with respect to the artifact: reads only what's passed in, never re-queries
 * property data, never reruns PostGIS/the Rules Engine/Report Explanation. In-process headless
 * Chromium via Playwright (tech-stack-decisions.md) - not a separate microservice.
 */

import type { EvidenceReportArtifactRow } from "../db/schema.js";
import { FindingClassification } from "../regulatory-rules-engine/types.js";
import type { Finding } from "../regulatory-rules-engine/types.js";

/** Builds the print-specific HTML report template from the persisted artifact only - shares the
 * same underlying data as the web rendering, but is free to lay it out differently for print
 * (e.g. a static map image instead of the interactive MapLibre map - not implemented in this
 * prototype's minimal PDF template, which omits the map entirely rather than fake one). */
export function renderReportHtml(artifact: EvidenceReportArtifactRow): string {
  const findings = artifact.findings as Finding[];
  const explanation = artifact.explanation as { text: string } | null;

  const findingsHtml = findings
    .map((f) => {
      const distinct = f.classification === FindingClassification.REQUIRES_VERIFICATION ? ' style="border-left: 4px solid #b45309; padding-left: 8px;"' : "";
      return `<div${distinct}>
        <strong>${escapeHtml(f.subject)}</strong> - ${escapeHtml(f.classification)}${f.complianceOutcome ? ` (${escapeHtml(f.complianceOutcome)})` : ""}
        <p>${escapeHtml(f.explanationBasis)}</p>
      </div>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Permit Preflight Report</title></head>
<body>
  <h1>Permit Preflight - Screening Report</h1>
  <p>Generated: ${escapeHtml(artifact.generatedAt.toISOString())}</p>
  <h2>Findings</h2>
  ${findingsHtml}
  ${explanation ? `<h2>Explanation</h2><p>${escapeHtml(explanation.text)}</p>` : "<h2>Explanation</h2><p><em>Plain-language synthesis is temporarily unavailable.</em></p>"}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Renders the HTML above to PDF bytes via an in-process headless Chromium instance. Dynamic
 * import so this module can be imported (e.g. by tests exercising renderReportHtml) without
 * requiring Playwright's browser binaries to be installed. Concurrency is the caller's
 * responsibility to limit (Infrastructure Design's "limit rendering concurrency conservatively"
 * requirement) - this function itself launches and closes exactly one browser per call. */
export async function renderPdfBytes(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter" });
    return pdf;
  } finally {
    await browser.close();
  }
}
