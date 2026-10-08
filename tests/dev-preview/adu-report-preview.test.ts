/**
 * Unit 11 (ADUs) report parity: the REAL evaluator's output, rendered by the REAL ReportView and the REAL
 * PDF template, must carry identical text on both surfaces (headline, blockers and constraints, the
 * verify-before-design checklist, what you told us, findings, not-evaluated list and notices).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ADU_PREVIEW_RULE_SPECS, ADU_PREVIEW_SCENARIOS, buildAduPreviewReport, toAduPreviewArtifactRow } from "../../src/dev-preview/adu-preview-fixtures.js";
import { ADU_HEADLINE_LABEL, ADU_SECTION_TITLES } from "../../src/report-generation-orchestrator/adu-display.js";
import type { AduFeasibility } from "../../src/regulatory-rules-engine/adu-types.js";
import { renderReportHtml } from "../../src/report-pdf-rendering/render.js";
import { ReportView } from "../../app/components/ReportView.js";
import { realAduCandidates } from "../fixtures/adu-candidates.js";
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
const scenario = (id: string) => ADU_PREVIEW_SCENARIOS.find((s) => s.id === id)!;
const web = (id: string) => normalize(renderToStaticMarkup(createElement(ReportView, { report: buildAduPreviewReport(scenario(id)) as never })));
const pdf = (id: string) => normalize(renderReportHtml(toAduPreviewArtifactRow(buildAduPreviewReport(scenario(id))) as unknown as EvidenceReportArtifactRow));
const feasibilityOf = (id: string) => buildAduPreviewReport(scenario(id)).evidence.find((e) => e.factType === "adu-feasibility")!.value as AduFeasibility;

describe("ADU preview fixtures cannot drift", () => {
  it("preview rule specifications equal the real governance candidates' specifications exactly", () => {
    for (const c of realAduCandidates) {
      const { ruleType, ...spec } = c.ruleSpecification as { ruleType: string };
      expect(ADU_PREVIEW_RULE_SPECS[ruleType], ruleType).toEqual(spec);
    }
    expect(Object.keys(ADU_PREVIEW_RULE_SPECS)).toHaveLength(realAduCandidates.length);
  });

  it.each(ADU_PREVIEW_SCENARIOS)("[$id] the real evaluator yields what the scenario claims", (s) => {
    const report = buildAduPreviewReport(s);
    expect(feasibilityOf(s.id).headline).toBe(s.expected.headline);
    const uncovered = report.evidence.find((e) => e.factType === "uncovered-constraint-types")!.value as string[];
    if (s.expected.uncovered) expect(uncovered).toEqual(expect.arrayContaining(s.expected.uncovered));
    for (const [subject, outcome] of Object.entries(s.expected.subjects ?? {})) {
      const f = report.findings.find((x) => x.subject === subject);
      expect(`${f?.classification}${f?.complianceOutcome ? "/" + f.complianceOutcome : ""}`, subject).toBe(outcome);
    }
  });
});

describe("web and PDF print the same ADU content", () => {
  it.each(ADU_PREVIEW_SCENARIOS)("[$id] headline, checklist, declared inputs, findings and notices match", (s) => {
    const report = buildAduPreviewReport(s);
    const feasibility = feasibilityOf(s.id);
    const w = web(s.id);
    const p = pdf(s.id);
    for (const surface of [w, p]) {
      expect(surface).toContain(ADU_SECTION_TITLES.headline);
      expect(surface).toContain(normalize(ADU_HEADLINE_LABEL[feasibility.headline]));
      expect(surface).toContain(normalize(feasibility.summary));
      expect(surface).toContain(ADU_SECTION_TITLES.verify);
      for (const v of feasibility.verifyBeforeDesign) expect(surface).toContain(normalize(v));
      for (const b of [...feasibility.blockers, ...feasibility.constraints]) expect(surface).toContain(normalize(b));
      if (feasibility.blockers.length + feasibility.constraints.length > 0) expect(surface).toContain(ADU_SECTION_TITLES.stop);
      expect(surface).toContain("This is a screening read, not an approval or a permit determination.");
      expect(surface).toContain(ADU_SECTION_TITLES.told);
      expect(surface).toContain(ADU_SECTION_TITLES.notEvaluated);
      for (const n of feasibility.notEvaluated) expect(surface).toContain(normalize(n));
    }
    const inputs = report.evidence.find((e) => e.factType === "adu-declared-inputs")!.value as { label: string; value: string }[];
    for (const d of inputs) {
      expect(w).toContain(normalize(`${d.label}: ${d.value}`));
      expect(p).toContain(normalize(`${d.label}: ${d.value}`));
    }
    // Every finding prints on both surfaces (no per-hazard findings are emitted that only one surface would show).
    expect(report.findings.some((x) => x.subject.startsWith("Critical area: "))).toBe(false);
    for (const f of report.findings) {
      expect(w).toContain(normalize(f.explanationBasis));
      expect(p).toContain(normalize(f.explanationBasis));
    }
    const uncovered = report.evidence.find((e) => e.factType === "uncovered-constraint-types")!.value as string[];
    for (const t of uncovered) {
      for (const surface of [w, p]) {
        expect(surface).toContain("Not Yet Automatically Screenable");
        expect(surface).toContain(normalize(t.charAt(0).toUpperCase() + t.slice(1)));
      }
    }
  });

  it("the not-NR scenario names the zone, tells the customer ADU rules differ by zone, and prints no pass/fail", () => {
    for (const surface of [web("adu-not-nr"), pdf("adu-not-nr")]) {
      expect(surface).toContain("Cannot tell");
      expect(surface).toContain("LR1 (M)");
      expect(surface).toContain("ADU rules differ by zone");
      expect(surface).not.toMatch(/\bPASS\b|\bFAIL\b/);
    }
  });

  it("a looks-feasible report never says approved or permitted", () => {
    for (const surface of [web("adu-looks-feasible"), pdf("adu-looks-feasible")]) {
      expect(surface).not.toMatch(/\bapproved\b(?!.*not an approval)/i);
      expect(surface).toContain("not an approval");
      expect(surface).not.toMatch(/you (can|may) build|is allowed|will be approved/i);
    }
  });
});
