/**
 * PDF rendering from an immutable EvidenceReportArtifact - the "render" half of NFR Design
 * Pattern 6. Pure with respect to the artifact: reads only what's passed in, never re-queries
 * property data, never reruns PostGIS/the Rules Engine/Report Explanation. In-process headless
 * Chromium via `puppeteer-core` + `@sparticuz/chromium` - not a separate microservice.
 *
 * Chromium binary source changed 2026-08-24 (Unit 2B platform pivot to Vercel): Vercel's
 * read-only function filesystem can't support Playwright's runtime browser download, so this no
 * longer uses `playwright`'s bundled Chromium for PRODUCTION rendering. Same function signature,
 * same immutable-artifact-only contract - a rendering-library swap inside this one function, not a
 * redesign of Pattern 6. `@sparticuz/chromium` ships Linux-only binaries (built for Lambda/Vercel's
 * function runtime) - it does not run on macOS/Windows (`spawn ENOEXEC` - confirmed via live
 * browser verification, 2026-09-17/18). Tracked as external-verification-tracker.md item 10 until
 * proven against a real Vercel deployment.
 *
 * Maintenance correction (2026-09-18, founder-directed bug fix) - `renderPdfBytes` now branches on
 * `process.platform`: Linux (Vercel's actual production runtime, and CI's ubuntu-latest) takes the
 * EXACT same `@sparticuz/chromium` + `puppeteer-core` path as before, byte-for-byte unchanged. Any
 * other platform (a developer's local macOS/Windows machine) falls back to `playwright`'s own
 * locally-executable Chromium - already an existing production dependency, used elsewhere for the
 * browser smoke-test suite - solely so this function can actually be exercised end-to-end outside
 * of a real Linux deployment, without masking or changing what ships to production. This is a
 * local-verification convenience only, not a claim that the fallback's PDF output is byte-identical
 * to `@sparticuz/chromium`'s (both are Chromium and should render the same static HTML template
 * equivalently, but production correctness still rests on the Linux path, matching the file's own
 * existing external-verification-tracker item).
 */

import type { EvidenceReportArtifactRow } from "../db/schema.js";
import { FindingClassification } from "../regulatory-rules-engine/types.js";
import type { Finding } from "../regulatory-rules-engine/types.js";

/** Unit 6B Capability B - mirrors ReportView.tsx's PermitRequirementFindingDisplay shape,
 * duplicated (not imported - src/ never imports from app/) matching this module's own existing
 * "read the persisted artifact only" boundary. */
interface PermitRequirementFindingForPdf {
  buildingPermit: "LIKELY_EXEMPT" | "REQUIRED" | "REQUIRES_VERIFICATION";
  reviewPath: "NONE" | "STFI_LIKELY" | "FULL_REVIEW_LIKELY" | "REQUIRES_VERIFICATION";
  criteria: { criterionId: string; status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION" | "NOT_APPLICABLE"; explanationBasis: string }[];
  tradePermitDisclosures: { trade: string; explanationBasis: string }[];
}

/** frontend-components.md §2's exact 5-row headline table - same logic as ReportView.tsx's
 * permitHeadline, duplicated rather than imported (src/ never imports from app/). */
function permitHeadlineForPdf(buildingPermit: PermitRequirementFindingForPdf["buildingPermit"], reviewPath: PermitRequirementFindingForPdf["reviewPath"]): string {
  if (buildingPermit === "REQUIRES_VERIFICATION") return "Requires verification";
  if (buildingPermit === "LIKELY_EXEMPT") return "Likely not required";
  if (reviewPath === "STFI_LIKELY") return "Likely required - simple review (STFI)";
  if (reviewPath === "FULL_REVIEW_LIKELY") return "Likely required - full review";
  return "Permit likely required - review path needs verification";
}

function permitCriterionIconForPdf(status: PermitRequirementFindingForPdf["criteria"][number]["status"]): string {
  if (status === "MET") return "✓";
  if (status === "NOT_MET") return "✗";
  return "⚠";
}

/** Builds the print-specific HTML report template from the persisted artifact only - shares the
 * same underlying data as the web rendering, but is free to lay it out differently for print
 * (e.g. a static map image instead of the interactive MapLibre map - not implemented in this
 * prototype's minimal PDF template, which omits the map entirely rather than fake one). */
export function renderReportHtml(artifact: EvidenceReportArtifactRow): string {
  const findings = artifact.findings as Finding[];
  const explanation = artifact.explanation as { text: string } | null;
  // Unit 6B Capability B - report/PDF consistency: the same "shed-permit-requirement" evidence
  // entry pipeline.ts adds (present only once evaluateProject's dormancy gate is satisfied) is
  // rendered here as the complete block, matching ReportView.tsx's web section element-for-element
  // (headline, criteria checklist, trade disclosures, BR-U6B-9 exemption disclaimer, SDCI footer) -
  // never just the headline, so a downloaded PDF is never missing information the web report shows.
  const permitRequirement = (artifact.evidence as { factType: string; value?: unknown }[]).find((e) => e.factType === "shed-permit-requirement")?.value as
    | PermitRequirementFindingForPdf
    | undefined;

  const findingsHtml = findings
    .map((f) => {
      const distinct = f.classification === FindingClassification.REQUIRES_VERIFICATION ? ' style="border-left: 4px solid #b45309; padding-left: 8px;"' : "";
      return `<div${distinct}>
        <strong>${escapeHtml(f.subject)}</strong> - ${escapeHtml(f.classification)}${f.complianceOutcome ? ` (${escapeHtml(f.complianceOutcome)})` : ""}
        <p>${escapeHtml(f.explanationBasis)}</p>
      </div>`;
    })
    .join("\n");

  const permitHtml = permitRequirement
    ? `<h2>Building permit</h2>
  <div>
    <strong>${escapeHtml(permitHeadlineForPdf(permitRequirement.buildingPermit, permitRequirement.reviewPath))}</strong>
    <ul>
      ${permitRequirement.criteria.map((c) => `<li>${permitCriterionIconForPdf(c.status)} ${escapeHtml(c.explanationBasis)}</li>`).join("\n      ")}
    </ul>
    ${permitRequirement.tradePermitDisclosures.map((d) => `<p>⚠ ${escapeHtml(d.explanationBasis)}</p>`).join("\n    ")}
    ${
      permitRequirement.buildingPermit === "LIKELY_EXEMPT"
        ? "<p>A building-permit exemption does not waive setback, lot-coverage, height, or rear-yard-coverage compliance.</p>"
        : ""
    }
    <p>SDCI makes the final determination.</p>
  </div>`
    : "";

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Permit Preflight Report</title></head>
<body>
  <h1>Permit Preflight - Screening Report</h1>
  <p>Generated: ${escapeHtml(artifact.generatedAt.toISOString())}</p>
  <h2>Findings</h2>
  ${findingsHtml}
  ${permitHtml}
  ${explanation ? `<h2>Explanation</h2><p>${escapeHtml(explanation.text)}</p>` : "<h2>Explanation</h2><p><em>Plain-language synthesis is temporarily unavailable.</em></p>"}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Renders the HTML above to PDF bytes via an in-process headless Chromium instance. Dynamic
 * imports so this module can be imported (e.g. by tests exercising renderReportHtml) without
 * requiring `@sparticuz/chromium`'s bundled binary to be extractable on the current platform.
 * Concurrency is the caller's responsibility to limit (Infrastructure Design's "limit rendering
 * concurrency conservatively" requirement) - this function itself launches and closes exactly one
 * browser per call. */
export async function renderPdfBytes(html: string): Promise<Buffer> {
  // Same platform gate as tests/report-pdf-rendering/render.integration.test.ts's own
  // `describe.skipIf(process.platform !== "linux")` - Vercel's function runtime, and CI's
  // ubuntu-latest, are always "linux"; this branch is production's actual code path, unchanged.
  if (process.platform === "linux") {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([import("@sparticuz/chromium"), import("puppeteer-core")]);
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "letter" });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  // Local-verification-only fallback (see this module's own docstring) - never reached on Vercel.
  const { chromium: playwrightChromium } = await import("playwright");
  const browser = await playwrightChromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "letter" });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
