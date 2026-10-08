/**
 * Unit 8 (Decks) report parity: the REAL evaluator's output rendered by the REAL ReportView and the
 * REAL PDF template must carry identical text on both surfaces.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DECK_PREVIEW_RULE_SPECS, DECK_PREVIEW_SCENARIOS, buildDeckPreviewReport, toDeckPreviewArtifactRow } from "../../src/dev-preview/deck-preview-fixtures.js";
import { renderReportHtml } from "../../src/report-pdf-rendering/render.js";
import { ReportView } from "../../app/components/ReportView.js";
import { realDeckCandidates } from "../fixtures/deck-candidates.js";
import type { EvidenceReportArtifactRow } from "../../src/db/schema.js";

function normalize(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/[–—]/g, "-").replace(/\s+/g, " ");
}
const scenario = (id: string) => DECK_PREVIEW_SCENARIOS.find((s) => s.id === id)!;
const web = (id: string) => normalize(renderToStaticMarkup(createElement(ReportView, { report: buildDeckPreviewReport(scenario(id)) as never })));
const pdf = (id: string) => normalize(renderReportHtml(toDeckPreviewArtifactRow(buildDeckPreviewReport(scenario(id))) as unknown as EvidenceReportArtifactRow));

describe("deck preview fixtures cannot drift", () => {
  it("preview rule specifications equal the real governance candidates' specifications exactly", () => {
    for (const c of realDeckCandidates) {
      const { ruleType, ...spec } = c.ruleSpecification as { ruleType: string };
      expect(DECK_PREVIEW_RULE_SPECS[ruleType], ruleType).toEqual(spec);
    }
    expect(Object.keys(DECK_PREVIEW_RULE_SPECS)).toHaveLength(realDeckCandidates.length);
  });

  it.each(DECK_PREVIEW_SCENARIOS)("[$id] the real evaluator yields what the scenario claims", (s) => {
    const report = buildDeckPreviewReport(s);
    const permit = report.evidence.find((e) => e.factType === "deck-permit-requirement")?.value as { buildingPermit: string; reviewPath?: string } | undefined;
    const uncovered = report.evidence.find((e) => e.factType === "uncovered-constraint-types")?.value as string[];
    if (s.expected.buildingPermit) expect(permit?.buildingPermit).toBe(s.expected.buildingPermit);
    if (s.expected.reviewPath) expect(permit?.reviewPath).toBe(s.expected.reviewPath);
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

describe("web and PDF print the same deck content", () => {
  it.each(DECK_PREVIEW_SCENARIOS)("[$id] declared inputs, permit card, findings and notices match", (s) => {
    const report = buildDeckPreviewReport(s);
    const w = web(s.id);
    const p = pdf(s.id);
    for (const surface of [w, p]) {
      expect(surface).toContain("What you told us");
      expect(surface).toContain("This deck was evaluated from the details you entered, not from measurements of the site.");
    }
    for (const d of report.evidence.find((e) => e.factType === "deck-declared-inputs")!.value as { label: string; value: string }[]) {
      expect(w).toContain(normalize(`${d.label}: ${d.value}`));
      expect(p).toContain(normalize(`${d.label}: ${d.value}`));
    }
    for (const f of report.findings) {
      expect(w).toContain(normalize(f.explanationBasis));
      expect(p).toContain(normalize(f.explanationBasis));
    }
    const permit = report.evidence.find((e) => e.factType === "deck-permit-requirement")?.value as
      | { buildingPermit: string; reviewPath?: string; criteria: { explanationBasis: string }[]; reviewPathReasons?: string[]; note?: string; exemptionDisclaimer?: string; disclosures: string[] }
      | undefined;
    if (permit) {
      const headline =
        permit.buildingPermit === "REQUIRES_VERIFICATION"
          ? "Requires verification"
          : permit.reviewPath === "FULL_REVIEW_LIKELY"
            ? "Building permit likely required - full review"
            : "Building permit likely required";
      for (const surface of [w, p]) {
        expect(surface).toContain("Building permit (deck)");
        expect(surface).toContain(headline);
        expect(surface).toContain("SDCI makes the final determination");
        for (const c of permit.criteria) expect(surface).toContain(normalize(c.explanationBasis));
        for (const d of permit.disclosures) expect(surface).toContain(normalize(d));
        for (const r of permit.reviewPathReasons ?? []) expect(surface).toContain(normalize(r));
        for (const text of [permit.note, permit.exemptionDisclaimer]) if (text) expect(surface).toContain(normalize(text));
      }
    } else {
      expect(w).not.toContain("Building permit (deck)");
      expect(p).not.toContain("Building permit (deck)");
    }
    const uncovered = report.evidence.find((e) => e.factType === "uncovered-constraint-types")!.value as string[];
    for (const t of uncovered) {
      for (const surface of [w, p]) {
        expect(surface).toContain("Not Yet Automatically Screenable");
        expect(surface).toContain(normalize(t.charAt(0).toUpperCase() + t.slice(1)));
      }
    }
    if (uncovered.length === 0) {
      expect(w).not.toContain("Not Yet Automatically Screenable");
      expect(p).not.toContain("Not Yet Automatically Screenable");
    }
  });

  it("the low-deck scenario states the exact ECA-only note and the disclaimer, and never says exempt", () => {
    for (const surface of [web("deck-low-eca-only"), pdf("deck-low-eca-only")]) {
      expect(surface).toContain("SDCI requires a permit for a deck in an ECA and a pre-application site visit for one in or near an ECA.");
      expect(surface).toContain("A building-permit exemption does not waive setback, lot-coverage, or other zoning compliance.");
      expect(surface).not.toContain("Likely not required");
    }
  });

  it("a tall deck in the front setback attributes the prohibition to SDCI, leaves the allowance question to SDCI, and is never shown as a failure", () => {
    for (const surface of [web("deck-high-front"), pdf("deck-high-front")]) {
      expect(surface).toContain("SDCI's published guidance says a deck more than 18 inches above the ground cannot be placed within the required setbacks");
      expect(surface).toContain("is for SDCI to determine");
      expect(surface).not.toMatch(/\bFAIL\b/);
      expect(surface).not.toContain("appears not to be allowed");
    }
  });

  it("the roof-deck scenario shows a full-review reason on both surfaces", () => {
    for (const surface of [web("deck-roof"), pdf("deck-roof")]) {
      expect(surface).toContain("A full review is likely because it is a roof deck.");
    }
  });
});
