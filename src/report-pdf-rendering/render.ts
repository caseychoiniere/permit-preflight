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
  /** Optional: absent on reports persisted before 2026-10-07 and whenever the ECA criterion is evaluated. */
  ecaDeferral?: { allOtherExemptionCriteriaMet: boolean; note?: string };
  /** Optional: present only when the review path is unresolved solely because of the ECA question. */
  reviewPathNote?: string;
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

/** Unit 6B Capability C - mirrors ReportView.tsx's ShedLotCoverageResultDisplay shape, duplicated
 * (not imported - src/ never imports from app/). */
interface ShedLotCoverageForPdf {
  status: "WITHIN_STANDARD_ALLOWANCE" | "REQUIRES_VERIFICATION" | "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE";
  reason?: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE" | "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE" | "LOT_AREA_ADJUSTMENT_UNRESOLVED";
  estimatedCoverageSqFt: number;
  facts: { parcelAreaSqFt: number; existingMappedCoverageSqFt: number };
  /** Optional: absent on reports persisted before 2026-10-07. */
  exclusionTolerance?: { explanation: string[] };
  parcelSpecificApprovalDisclosure?: string;
}

/** Tolerance explanation + neutral parcel-specific-approval disclosure (2026-10-07) - identical
 * text to ReportView.tsx; both are printed verbatim from the persisted evaluator output. */
function toleranceHtmlForPdf(coverage: ShedLotCoverageForPdf): string {
  const paragraphs = (coverage.exclusionTolerance?.explanation ?? []).map((p) => `<p>${escapeHtml(p)}</p>`);
  if (coverage.parcelSpecificApprovalDisclosure) paragraphs.push(`<p>${escapeHtml(coverage.parcelSpecificApprovalDisclosure)}</p>`);
  return paragraphs.join("");
}

/** Unit 7 (Fences) - mirrors ReportView.tsx's fence display shapes; duplicated (not imported - src/
 * never imports from app/). */
interface FencePermitRequirementForPdf {
  buildingPermit: "REQUIRED" | "REQUIRES_VERIFICATION";
  criteria: { criterionId: string; status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION"; explanationBasis: string }[];
  note?: string;
  exemptionDisclaimer?: string;
  permitPathNote?: string;
  disclosures: string[];
}

/** Unit 8 (Decks) - mirrors ReportView.tsx's deck display shape; duplicated (not imported - src/ never imports from app/). */
interface DeckPermitRequirementForPdf {
  buildingPermit: "REQUIRED" | "REQUIRES_VERIFICATION";
  criteria: { criterionId: string; status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION"; explanationBasis: string }[];
  reviewPath?: "FULL_REVIEW_LIKELY" | "REQUIRES_VERIFICATION";
  reviewPathReasons?: string[];
  note?: string;
  exemptionDisclaimer?: string;
  disclosures: string[];
}
function deckPermitHeadlineForPdf(p: DeckPermitRequirementForPdf): string {
  if (p.buildingPermit === "REQUIRES_VERIFICATION") return "Requires verification";
  if (p.reviewPath === "FULL_REVIEW_LIKELY") return "Building permit likely required - full review";
  return "Building permit likely required";
}

function coveragePercentForPdf(estimatedCoverageSqFt: number, parcelAreaSqFt: number): number {
  return Math.round((estimatedCoverageSqFt / parcelAreaSqFt) * 100);
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
  // Unit 6B Capability C - same "shed-lot-coverage" evidence entry pipeline.ts adds, rendered as
  // the same 5-case copy as ReportView.tsx's "Estimated lot coverage" section.
  const shedLotCoverage = (artifact.evidence as { factType: string; value?: unknown }[]).find((e) => e.factType === "shed-lot-coverage")?.value as
    | ShedLotCoverageForPdf
    | undefined;

  // Unit 7 (Fences) - same persisted evidence entries ReportView.tsx reads, printed with identical text.
  const fenceDeclaredInputs = (artifact.evidence as { factType: string; value?: unknown }[]).find((e) => e.factType === "fence-declared-inputs")?.value as
    | { label: string; value: string }[]
    | undefined;
  const fencePermit = (artifact.evidence as { factType: string; value?: unknown }[]).find((e) => e.factType === "fence-permit-requirement")?.value as
    | FencePermitRequirementForPdf
    | undefined;

  // Unit 8 (Decks) - same persisted evidence entries ReportView.tsx reads, printed with identical text.
  const deckDeclaredInputs = (artifact.evidence as { factType: string; value?: unknown }[]).find((e) => e.factType === "deck-declared-inputs")?.value as
    | { label: string; value: string }[]
    | undefined;
  const deckPermit = (artifact.evidence as { factType: string; value?: unknown }[]).find((e) => e.factType === "deck-permit-requirement")?.value as
    | DeckPermitRequirementForPdf
    | undefined;

  // BR-U6B-11 - the existing-structure coverage figure is always disclosed with its over-count/
  // capture-date caveat. The web report shows it under Evidence Notes; the PDF has no Evidence
  // Notes section, so it is rendered adjacent to the figure (found by the dev report-preview
  // harness's web/PDF parity test, 2026-09-27).
  const coverageCaveat = (artifact.evidence as { factType: string; provenance?: { qualityCaveat?: string } }[]).find((e) => e.factType === "existing-structure-coverage")
    ?.provenance?.qualityCaveat;

  const findingsHtml = findings
    .map((f) => {
      const distinct = f.classification === FindingClassification.REQUIRES_VERIFICATION ? ' style="border-left: 4px solid #b45309; padding-left: 8px;"' : "";
      return `<div${distinct}>
        <strong>${escapeHtml(f.subject)}</strong> - ${escapeHtml(f.classification)}${f.complianceOutcome ? ` (${escapeHtml(f.complianceOutcome)})` : ""}
        <p>${escapeHtml(f.explanationBasis)}</p>
      </div>`;
    })
    .join("\n");

  // Parity with ReportView.tsx's "Not Yet Automatically Screenable" notice (found 2026-10-08 while adding
  // Unit 7: the PDF never rendered it, so a claim with no ACTIVE rule coverage would have been silently
  // omitted from a downloaded fence - or garage - report instead of shown as "not screened").
  const uncoveredConstraintTypes = (artifact.evidence as { factType: string; value?: unknown }[]).find((e) => e.factType === "uncovered-constraint-types")?.value as string[] | undefined;
  const uncoveredHtml =
    uncoveredConstraintTypes && uncoveredConstraintTypes.length > 0
      ? `<h2>Not Yet Automatically Screenable</h2>
  ${uncoveredConstraintTypes
    .map(
      (t) => `<div>
    <strong>${escapeHtml(t.charAt(0).toUpperCase() + t.slice(1))}</strong>
    <p>This constraint could not yet be automatically screened for this project type - no active regulatory rule currently governs it in this system. This is not the same as a compliance finding of any kind and should not be read as a pass.</p>
  </div>`
    )
    .join("\n  ")}`
      : "";

  const fenceDeclaredHtml =
    fenceDeclaredInputs && fenceDeclaredInputs.length > 0
      ? `<h2>What you told us</h2>
  <div>
    <p>This fence was evaluated from the details you entered, not from measurements of the site.</p>
    <ul>
      ${fenceDeclaredInputs.map((d) => `<li>${escapeHtml(d.label)}: ${escapeHtml(d.value)}</li>`).join("\n      ")}
    </ul>
  </div>`
      : "";

  const deckDeclaredHtml =
    deckDeclaredInputs && deckDeclaredInputs.length > 0
      ? `<h2>What you told us</h2>
  <div>
    <p>This deck was evaluated from the details you entered, not from measurements of the site.</p>
    <ul>
      ${deckDeclaredInputs.map((d) => `<li>${escapeHtml(d.label)}: ${escapeHtml(d.value)}</li>`).join("\n      ")}
    </ul>
  </div>`
      : "";

  const deckPermitHtml = deckPermit
    ? `<h2>Building permit (deck)</h2>
  <div>
    <strong>${escapeHtml(deckPermitHeadlineForPdf(deckPermit))}</strong>
    ${deckPermit.note ? `<p>${escapeHtml(deckPermit.note)}</p>` : ""}
    <ul>
      ${deckPermit.criteria.map((c) => `<li>${permitCriterionIconForPdf(c.status)} ${escapeHtml(c.explanationBasis)}</li>`).join("\n      ")}
    </ul>
    ${(deckPermit.reviewPathReasons ?? []).map((r) => `<p>${escapeHtml(r)}</p>`).join("\n    ")}
    ${deckPermit.exemptionDisclaimer ? `<p>${escapeHtml(deckPermit.exemptionDisclaimer)}</p>` : ""}
    ${deckPermit.disclosures.map((d) => `<p>${escapeHtml(d)}</p>`).join("\n    ")}
    <p>SDCI makes the final determination.</p>
  </div>`
    : "";

  const fencePermitHtml = fencePermit
    ? `<h2>Building permit (fence)</h2>
  <div>
    <strong>${fencePermit.buildingPermit === "REQUIRED" ? "Building permit likely required" : "Requires verification"}</strong>
    ${fencePermit.note ? `<p>${escapeHtml(fencePermit.note)}</p>` : ""}
    <ul>
      ${fencePermit.criteria.map((c) => `<li>${permitCriterionIconForPdf(c.status)} ${escapeHtml(c.explanationBasis)}</li>`).join("\n      ")}
    </ul>
    ${fencePermit.permitPathNote ? `<p>${escapeHtml(fencePermit.permitPathNote)}</p>` : ""}
    ${fencePermit.exemptionDisclaimer ? `<p>${escapeHtml(fencePermit.exemptionDisclaimer)}</p>` : ""}
    ${fencePermit.disclosures.map((d) => `<p>${escapeHtml(d)}</p>`).join("\n    ")}
    <p>SDCI makes the final determination.</p>
  </div>`
    : "";

  const permitHtml = permitRequirement
    ? `<h2>Building permit</h2>
  <div>
    <strong>${escapeHtml(permitHeadlineForPdf(permitRequirement.buildingPermit, permitRequirement.reviewPath))}</strong>
    ${permitRequirement.ecaDeferral?.note ? `<p>${escapeHtml(permitRequirement.ecaDeferral.note)}</p>` : ""}
    <ul>
      ${permitRequirement.criteria.map((c) => `<li>${permitCriterionIconForPdf(c.status)} ${escapeHtml(c.explanationBasis)}</li>`).join("\n      ")}
    </ul>
    ${permitRequirement.reviewPathNote ? `<p>${escapeHtml(permitRequirement.reviewPathNote)}</p>` : ""}
    ${permitRequirement.tradePermitDisclosures.map((d) => `<p>⚠ ${escapeHtml(d.explanationBasis)}</p>`).join("\n    ")}
    ${
      permitRequirement.buildingPermit === "LIKELY_EXEMPT"
        ? "<p>A building-permit exemption does not waive setback, lot-coverage, height, or rear-yard-coverage compliance.</p>"
        : ""
    }
    <p>SDCI makes the final determination.</p>
  </div>`
    : "";

  const lotCoverageHtml = shedLotCoverage
    ? `<h2>Estimated lot coverage</h2>
  <div>
    <strong>${coveragePercentForPdf(shedLotCoverage.estimatedCoverageSqFt, shedLotCoverage.facts.parcelAreaSqFt)}%</strong>
    ${
      shedLotCoverage.status === "WITHIN_STANDARD_ALLOWANCE"
        ? "<p>Standard applicable limit: 50%</p><p>Result: Within the standard lot-coverage allowance</p>"
        : ""
    }
    ${
      shedLotCoverage.status === "REQUIRES_VERIFICATION" && shedLotCoverage.reason === "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE"
        ? "<p>Standard applicable limit: 50%</p><p>Result: Requires verification</p><p>Estimated coverage exceeds the standard 50% limit but may fit within Seattle's 60% allowance for certain qualifying developments (common-amenity or stacked-dwelling-unit arrangements). Permit Preflight could not determine whether that allowance applies to this property.</p>"
        : ""
    }
    ${
      shedLotCoverage.status === "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE"
        ? `<p>Even Seattle's higher 60% allowance (for qualifying developments) appears exceeded.</p>${toleranceHtmlForPdf(shedLotCoverage)}`
        : ""
    }
    ${
      shedLotCoverage.status === "REQUIRES_VERIFICATION" && shedLotCoverage.reason === "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE"
        ? "<p>Result: Requires verification</p><p>The standard calculated allowance appears exceeded, but a parcel-specific Director-approved amount, if one exists, could alter this result. Permit Preflight has no way to confirm whether such an approval applies to this property.</p>"
        : ""
    }
    ${
      shedLotCoverage.status === "REQUIRES_VERIFICATION" && shedLotCoverage.reason === "LOT_AREA_ADJUSTMENT_UNRESOLVED"
        ? `<p>Result: Requires verification</p><p>A mapped riparian corridor, wetland, shoreline-setback, or steep-slope non-disturbance condition may intersect this parcel, or cannot be ruled out from mapped data (regulatory buffers and setback areas are not mapped), and may reduce the countable lot area used for this estimate, pending more precise geometry.</p>${toleranceHtmlForPdf(shedLotCoverage)}`
        : ""
    }
    <p>Existing mapped structure coverage: ${Math.round(shedLotCoverage.facts.existingMappedCoverageSqFt)} sq ft.</p>
    ${coverageCaveat ? `<p><em>${escapeHtml(coverageCaveat)}</em></p>` : ""}
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
  ${fenceDeclaredHtml}
  ${fencePermitHtml}
  ${deckDeclaredHtml}
  ${deckPermitHtml}
  ${uncoveredHtml}
  ${permitHtml}
  ${lotCoverageHtml}
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
