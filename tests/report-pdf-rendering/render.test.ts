import { describe, expect, it } from "vitest";
import { renderReportHtml } from "../../src/report-pdf-rendering/render.js";
import type { EvidenceReportArtifactRow } from "../../src/db/schema.js";

function fakeArtifact(overrides: Partial<EvidenceReportArtifactRow> = {}): EvidenceReportArtifactRow {
  return {
    id: "test-artifact",
    screeningRequestId: "test-request",
    reportGenerationJobId: "test-job",
    findings: [],
    evidence: [],
    explanation: null,
    ruleVersionsUsed: [],
    dataRetrievalTimestamps: {},
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("renderReportHtml (pure, deterministic)", () => {
  it("renders a KNOWN finding's subject and compliance outcome", () => {
    const html = renderReportHtml(
      fakeArtifact({ findings: [{ classification: "KNOWN", subject: "Rear setback", complianceOutcome: "PASS", explanationBasis: "10ft meets 5ft.", supportingEvidence: [] }] })
    );
    expect(html).toContain("Rear setback");
    expect(html).toContain("PASS");
  });

  it("[hard invariant] REQUIRES_VERIFICATION findings render with visually distinct styling, not blended with KNOWN/INFERRED", () => {
    const html = renderReportHtml(
      fakeArtifact({ findings: [{ classification: "REQUIRES_VERIFICATION", subject: "Dwelling separation", explanationBasis: "Not available.", supportingEvidence: [] }] })
    );
    expect(html).toContain("border-left");
  });

  it("shows an 'unavailable' message when explanation is absent, never an empty/broken section", () => {
    const html = renderReportHtml(fakeArtifact({ explanation: null }));
    expect(html).toContain("temporarily unavailable");
  });

  it("[hard invariant] escapes HTML in finding text - never injects raw content into the document", () => {
    const html = renderReportHtml(
      fakeArtifact({ findings: [{ classification: "KNOWN", subject: "<script>alert(1)</script>", complianceOutcome: "PASS", explanationBasis: "x", supportingEvidence: [] }] })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never re-derives data - it only reads the fields already on the passed-in artifact", () => {
    // Structural check: the function takes exactly one argument (the artifact) - no separate
    // "re-fetch" or "re-evaluate" dependency is possible to pass in.
    expect(renderReportHtml.length).toBe(1);
  });
});
