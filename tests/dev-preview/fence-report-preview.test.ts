/**
 * Unit 7 (Fences) report parity: the REAL evaluator's output, rendered by the REAL ReportView and the
 * REAL PDF template, must carry identical text on both surfaces - including the newly added
 * uncovered-constraint notice (which the PDF previously never rendered).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FENCE_PREVIEW_RULE_SPECS, FENCE_PREVIEW_SCENARIOS, buildFencePreviewReport, toFencePreviewArtifactRow } from "../../src/dev-preview/fence-preview-fixtures.js";
import { renderReportHtml } from "../../src/report-pdf-rendering/render.js";
import { ReportView } from "../../app/components/ReportView.js";
import { realFenceCandidates } from "../fixtures/fence-candidates.js";
import type { EvidenceReportArtifactRow } from "../../src/db/schema.js";

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
const scenario = (id: string) => FENCE_PREVIEW_SCENARIOS.find((s) => s.id === id)!;
const web = (id: string) => normalize(renderToStaticMarkup(createElement(ReportView, { report: buildFencePreviewReport(scenario(id)) as never })));
const pdf = (id: string) => normalize(renderReportHtml(toFencePreviewArtifactRow(buildFencePreviewReport(scenario(id))) as unknown as EvidenceReportArtifactRow));

describe("fence preview fixtures cannot drift", () => {
  it("preview rule specifications equal the real governance candidates' specifications exactly", () => {
    for (const c of realFenceCandidates) {
      const { ruleType, ...spec } = c.ruleSpecification as { ruleType: string };
      expect(FENCE_PREVIEW_RULE_SPECS[ruleType], ruleType).toEqual(spec);
    }
    expect(Object.keys(FENCE_PREVIEW_RULE_SPECS)).toHaveLength(realFenceCandidates.length);
  });

  it.each(FENCE_PREVIEW_SCENARIOS)("[$id] the real evaluator yields what the scenario claims", (s) => {
    const report = buildFencePreviewReport(s);
    const permit = report.evidence.find((e) => e.factType === "fence-permit-requirement")?.value as { buildingPermit: string } | undefined;
    const uncovered = report.evidence.find((e) => e.factType === "uncovered-constraint-types")?.value as string[];
    if (s.expected.buildingPermit) expect(permit?.buildingPermit).toBe(s.expected.buildingPermit);
    if (s.expected.uncovered) {
      expect(uncovered).toEqual(expect.arrayContaining(s.expected.uncovered));
      expect(permit).toBeUndefined();
    } else {
      expect(uncovered).toEqual([]);
    }
    for (const [subject, outcome] of Object.entries(s.expected.subjects ?? {})) {
      const f = report.findings.find((x) => x.subject === subject);
      expect(`${f?.classification}${f?.complianceOutcome ? "/" + f.complianceOutcome : ""}`, subject).toBe(outcome);
    }
  });
});

describe("web and PDF print the same fence content", () => {
  it.each(FENCE_PREVIEW_SCENARIOS)("[$id] declared inputs, permit card, findings and notices match", (s) => {
    const report = buildFencePreviewReport(s);
    const w = web(s.id);
    const p = pdf(s.id);
    for (const surface of [w, p]) {
      expect(surface).toContain("What you told us");
      expect(surface).toContain("This fence was evaluated from the details you entered, not from measurements of the site.");
    }
    const inputs = report.evidence.find((e) => e.factType === "fence-declared-inputs")!.value as { label: string; value: string }[];
    for (const d of inputs) {
      expect(w).toContain(normalize(`${d.label}: ${d.value}`));
      expect(p).toContain(normalize(`${d.label}: ${d.value}`));
    }
    for (const f of report.findings) {
      expect(w).toContain(normalize(f.explanationBasis));
      expect(p).toContain(normalize(f.explanationBasis));
    }
    const permit = report.evidence.find((e) => e.factType === "fence-permit-requirement")?.value as
      | { buildingPermit: string; criteria: { explanationBasis: string }[]; note?: string; exemptionDisclaimer?: string; permitPathNote?: string; disclosures: string[] }
      | undefined;
    if (permit) {
      const headline = permit.buildingPermit === "REQUIRED" ? "Building permit likely required" : "Requires verification";
      for (const surface of [w, p]) {
        expect(surface).toContain("Building permit (fence)");
        expect(surface).toContain(headline);
        expect(surface).toContain("SDCI makes the final determination");
        for (const c of permit.criteria) expect(surface).toContain(normalize(c.explanationBasis));
        for (const d of permit.disclosures) expect(surface).toContain(normalize(d));
        for (const text of [permit.note, permit.exemptionDisclaimer, permit.permitPathNote]) if (text) expect(surface).toContain(normalize(text));
      }
    } else {
      expect(w).not.toContain("Building permit (fence)");
      expect(p).not.toContain("Building permit (fence)");
    }
    // The uncovered-constraint notice is on BOTH surfaces (it was web-only before 2026-10-08).
    const uncovered = report.evidence.find((e) => e.factType === "uncovered-constraint-types")!.value as string[];
    for (const t of uncovered) {
      for (const surface of [w, p]) {
        expect(surface).toContain("Not Yet Automatically Screenable");
        expect(surface).toContain(normalize(t.charAt(0).toUpperCase() + t.slice(1)));
        expect(surface).toContain("should not be read as a pass");
      }
    }
    if (uncovered.length === 0) {
      expect(w).not.toContain("Not Yet Automatically Screenable");
      expect(p).not.toContain("Not Yet Automatically Screenable");
    }
  });

  it("the flood-only scenario shows the exact flood note and exemption disclaimer, and never says exempt", () => {
    for (const surface of [web("fence-flood-only"), pdf("fence-flood-only")]) {
      expect(surface).toContain(
        "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in a flood-prone area, where SDCI requires a construction permit."
      );
      expect(surface).toContain("A building-permit exemption does not waive fence-height, setback, or other zoning compliance.");
      expect(surface).not.toContain("Likely not required");
    }
  });

  it("the permit-required scenario attributes the permit-path statement to SDCI and omits the flood-only note", () => {
    for (const surface of [web("fence-permit-required"), pdf("fence-permit-required")]) {
      expect(surface).toContain("Building permit likely required");
      expect(surface).toContain("SDCI states that most fences needing a permit require only a construction subject-to-field-inspection permit");
      expect(surface).not.toContain("The remaining question is whether the site is in a flood-prone area");
    }
  });

  it("the front-setback scenario shows sight distance as an unresolved item, never as satisfied", () => {
    for (const surface of [web("fence-front-over-limit"), pdf("fence-front-over-limit")]) {
      expect(surface).toContain("Sight-distance requirements (corner lot, driveway, alley)");
      expect(surface).toContain("makes no statement that it is satisfied");
    }
  });
});
