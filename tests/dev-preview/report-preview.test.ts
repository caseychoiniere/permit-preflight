import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PREVIEW_SCENARIOS, buildPreviewReport, toPreviewArtifactRow } from "../../src/dev-preview/report-preview-fixtures.js";
import { renderReportHtml } from "../../src/report-pdf-rendering/render.js";
import { ReportView } from "../../app/components/ReportView.js";
import type { EvidenceReportArtifactRow } from "../../src/db/schema.js";

/** Collapse whitespace, decode the few entities React/the PDF template emit, and unify dash
 * glyphs so web-vs-PDF text can be compared for content parity (not markup parity). */
function normalize(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

function renderWeb(scenarioId: string): string {
  const scenario = PREVIEW_SCENARIOS.find((s) => s.id === scenarioId)!;
  const report = buildPreviewReport(scenario);
  return normalize(renderToStaticMarkup(createElement(ReportView, { report: report as never })));
}
function renderPdf(scenarioId: string): string {
  const scenario = PREVIEW_SCENARIOS.find((s) => s.id === scenarioId)!;
  const row = toPreviewArtifactRow(buildPreviewReport(scenario)) as unknown as EvidenceReportArtifactRow;
  return normalize(renderReportHtml(row));
}

describe("dev report-preview harness (Unit 6B dormant result sections)", () => {
  it("covers every required Capability B and Capability C result shape", () => {
    const ids = PREVIEW_SCENARIOS.map((s) => s.id);
    for (const id of [
      "permit-eca-determination-only",
      "permit-stfi-likely",
      "permit-full-review-likely",
      "permit-review-path-unresolved",
      "permit-requires-verification",
      "coverage-standard",
      "coverage-special-allowance",
      "coverage-exceeds",
      "coverage-exceeds-map-indicated",
      "coverage-lot-area-unresolved",
      "coverage-unresolved-over-50",
      "coverage-unresolved-small-lot-floor",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it.each(PREVIEW_SCENARIOS)("[$id] the REAL evaluator yields the shape the scenario claims (fixtures cannot drift from production evaluation)", (scenario) => {
    const report = buildPreviewReport(scenario);
    const permit = report.evidence.find((e) => e.factType === "shed-permit-requirement")?.value as { buildingPermit: string; reviewPath: string } | undefined;
    const coverage = report.evidence.find((e) => e.factType === "shed-lot-coverage")?.value as { status: string; reason?: string } | undefined;
    if (scenario.expected.buildingPermit) {
      expect(permit?.buildingPermit).toBe(scenario.expected.buildingPermit);
      expect(permit?.reviewPath).toBe(scenario.expected.reviewPath);
    }
    if (scenario.expected.lotCoverageStatus) {
      expect(coverage?.status).toBe(scenario.expected.lotCoverageStatus);
      expect(coverage?.reason).toBe(scenario.expected.lotCoverageReason);
    }
    // P2b finding must survive the same persistence boundary the pipeline uses.
    expect(report.findings.some((f) => f.subject === "Accessory structure height limit")).toBe(true);
  });

  it.each(PREVIEW_SCENARIOS)("[$id] web (ReportView) and PDF HTML render the same Unit 6B result content", (scenario) => {
    const web = renderWeb(scenario.id);
    const pdf = renderPdf(scenario.id);
    const report = buildPreviewReport(scenario);
    const permit = report.evidence.find((e) => e.factType === "shed-permit-requirement")?.value as { buildingPermit: string; reviewPath: string; criteria: { explanationBasis: string }[]; tradePermitDisclosures: { explanationBasis: string }[] } | undefined;
    const coverage = report.evidence.find((e) => e.factType === "shed-lot-coverage")?.value as { status: string; reason?: string; estimatedCoverageSqFt: number; facts: { parcelAreaSqFt: number; existingMappedCoverageSqFt: number } } | undefined;

    if (permit) {
      expect(web).toContain("Building permit");
      expect(pdf).toContain("Building permit");
      // Same headline (dash glyphs normalized), same first criterion text, same authority footer.
      const headlines: Record<string, string> = {
        "LIKELY_EXEMPT": "Likely not required",
        "REQUIRES_VERIFICATION": "Requires verification",
      };
      const expectedHeadline =
        headlines[permit.buildingPermit] ??
        (permit.reviewPath === "STFI_LIKELY"
          ? "Likely required - simple review (STFI)"
          : permit.reviewPath === "FULL_REVIEW_LIKELY"
            ? "Likely required - full review"
            : "Permit likely required - review path needs verification");
      expect(web).toContain(expectedHeadline);
      expect(pdf).toContain(expectedHeadline);
      for (const criterion of permit.criteria) {
        expect(web).toContain(normalize(criterion.explanationBasis));
        expect(pdf).toContain(normalize(criterion.explanationBasis));
      }
      for (const disclosure of permit.tradePermitDisclosures) {
        expect(web).toContain(normalize(disclosure.explanationBasis));
        expect(pdf).toContain(normalize(disclosure.explanationBasis));
      }
      expect(web).toContain("SDCI makes the final determination");
      expect(pdf).toContain("SDCI makes the final determination");
      // The ECA-only note (2026-10-07) is printed verbatim on both surfaces whenever the evaluator emits it.
      const note = (permit as { ecaDeferral?: { note?: string } }).ecaDeferral?.note;
      if (note) {
        expect(web).toContain(normalize(note));
        expect(pdf).toContain(normalize(note));
      }
      // P9: the exemption disclaimer appears on both surfaces iff LIKELY_EXEMPT.
      const disclaimer = "does not waive setback, lot-coverage, height, or rear-yard-coverage compliance";
      expect(web.includes(disclaimer)).toBe(permit.buildingPermit === "LIKELY_EXEMPT");
      expect(pdf.includes(disclaimer)).toBe(permit.buildingPermit === "LIKELY_EXEMPT");
    }
    // The accessory-height (P2b) finding renders identically on both surfaces.
    const p2b = report.findings.find((f) => f.subject === "Accessory structure height limit")!;
    expect(web).toContain(normalize(p2b.explanationBasis));
    expect(pdf).toContain(normalize(p2b.explanationBasis));

    if (coverage) {
      // Branch-specific result copy must be present on BOTH surfaces, not just the headline number.
      const branchPhrase: Record<string, string> = {
        WITHIN_STANDARD_ALLOWANCE: "Within the standard lot-coverage allowance",
        MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE: "60% allowance",
        EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE: "appears exceeded",
        POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE: "Director-approved amount",
        LOT_AREA_ADJUSTMENT_UNRESOLVED: "may reduce the countable lot area",
      };
      const key = (coverage as { reason?: string; status: string }).reason ?? (coverage as { status: string }).status;
      expect(web).toContain(branchPhrase[key]!);
      expect(pdf).toContain(branchPhrase[key]!);
      expect(web).toContain("Estimated lot coverage");
      expect(pdf).toContain("Estimated lot coverage");
      const percent = `${Math.round((coverage.estimatedCoverageSqFt / coverage.facts.parcelAreaSqFt) * 100)}%`;
      expect(web).toContain(percent);
      expect(pdf).toContain(percent);
      expect(web).toContain(`${coverage.facts.existingMappedCoverageSqFt} sq ft`);
      expect(pdf).toContain(`${coverage.facts.existingMappedCoverageSqFt} sq ft`);
      // Tolerance + neutral parcel-specific-approval disclosure (2026-10-07): identical text on both surfaces.
      const tolerance = (coverage as { exclusionTolerance?: { explanation: string[] }; parcelSpecificApprovalDisclosure?: string });
      for (const paragraph of tolerance.exclusionTolerance?.explanation ?? []) {
        expect(web).toContain(normalize(paragraph));
        expect(pdf).toContain(normalize(paragraph));
      }
      if (tolerance.parcelSpecificApprovalDisclosure) {
        expect(web).toContain(normalize(tolerance.parcelSpecificApprovalDisclosure));
        expect(pdf).toContain(normalize(tolerance.parcelSpecificApprovalDisclosure));
      }
      // C2: the over-count caveat travels with the estimate on both surfaces.
      expect(web.toLowerCase()).toContain("over-count");
      expect(pdf.toLowerCase()).toContain("over-count");
    }
  });

  it("[standard case] never mentions the 60% allowance on either surface (founder UX principle)", () => {
    expect(renderWeb("coverage-standard")).not.toContain("60%");
    expect(renderPdf("coverage-standard")).not.toContain("60%");
  });

  it("[B] all-other-criteria-met scenario shows the ECA-only explanation and never says exempt (web and PDF)", () => {
    for (const out of [renderWeb("permit-eca-determination-only"), renderPdf("permit-eca-determination-only")]) {
      expect(out).toContain("Requires verification");
      expect(out).toContain("All other screened building-permit exemption criteria are met. The remaining question is whether the site is in or near an environmentally critical area.");
      expect(out).toContain("SDCI makes that determination.");
      expect(out).not.toContain("Likely not required");
      expect(out).not.toContain("does not waive setback");
    }
  });

  it("[C] production-realistic scenarios print the exclusion tolerance, and no surface claims a Director alternative", () => {
    for (const id of ["coverage-lot-area-unresolved", "coverage-unresolved-over-50", "coverage-unresolved-small-lot-floor", "coverage-exceeds-map-indicated"]) {
      for (const out of [renderWeb(id), renderPdf(id)]) {
        expect(out).toContain("Parcel-specific SDCI approvals, reductions, waivers, or modifications are not evaluated by Permit Preflight");
        expect(out).not.toMatch(/Director-approved/i);
      }
    }
    expect(renderWeb("coverage-lot-area-unresolved")).toContain("approximately 1,870 sq ft (37% of the parcel)");
    expect(renderPdf("coverage-lot-area-unresolved")).toContain("approximately 1,870 sq ft (37% of the parcel)");
    expect(renderWeb("coverage-unresolved-over-50")).toContain("already above the 50% limit even if no area is excluded");
    expect(renderPdf("coverage-unresolved-over-50")).toContain("already above the 50% limit even if no area is excluded");
  });

  it("the preview's active set excludes P6 and C1e-director (they remain inactive for the MVP)", () => {
    const source = readFileSync(new URL("../../src/dev-preview/report-preview-fixtures.ts", import.meta.url), "utf8");
    expect(source).toContain("MVP_ACTIVE_RULE_TYPES.map(previewOnlyActiveRule)");
    expect(source).toMatch(/INACTIVE_DISCRETIONARY_RULE_TYPES[^\n]*SHED_PERMIT_P6_ECA_CRITERION[^\n]*SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE/);
  });
});
