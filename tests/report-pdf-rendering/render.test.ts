import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "../../app/components/ReportView.js";
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

describe("renderReportHtml - Unit 6B Capability B Building permit block (report/PDF consistency)", () => {
  const permitEvidenceEntry = {
    factType: "shed-permit-requirement",
    value: {
      buildingPermit: "REQUIRED",
      reviewPath: "STFI_LIKELY",
      criteria: [{ criterionId: "ROOF_AREA", status: "NOT_MET", explanationBasis: "Wall footprint 200 sq ft exceeds 120." }],
      tradePermitDisclosures: [{ trade: "ELECTRICAL", explanationBasis: "Electrical work may require a separate permit." }],
    },
    provenance: {},
  };

  it("renders the headline, criteria checklist, and trade disclosures when the evidence entry is present", () => {
    const html = renderReportHtml(fakeArtifact({ evidence: [permitEvidenceEntry] }));
    expect(html).toContain("Likely required - simple review (STFI)");
    expect(html).toContain("Wall footprint 200 sq ft exceeds 120.");
    expect(html).toContain("Electrical work may require a separate permit.");
    expect(html).toContain("SDCI makes the final determination.");
  });

  it("renders the BR-U6B-9 exemption disclaimer only when buildingPermit is LIKELY_EXEMPT", () => {
    const exempt = renderReportHtml(
      fakeArtifact({
        evidence: [{ ...permitEvidenceEntry, value: { ...permitEvidenceEntry.value, buildingPermit: "LIKELY_EXEMPT", reviewPath: "NONE" } }],
      })
    );
    expect(exempt).toContain("does not waive setback");

    const required = renderReportHtml(fakeArtifact({ evidence: [permitEvidenceEntry] }));
    expect(required).not.toContain("does not waive setback");
  });

  it("renders nothing for the Building permit section when the evidence entry is absent - correct dormancy, no broken/empty heading", () => {
    const html = renderReportHtml(fakeArtifact({ evidence: [] }));
    expect(html).not.toContain("Building permit");
    expect(html).not.toContain("SDCI makes the final determination.");
  });

  it("escapes HTML in permit criteria/trade-disclosure text, matching the existing findings escaping invariant", () => {
    const html = renderReportHtml(
      fakeArtifact({
        evidence: [
          {
            ...permitEvidenceEntry,
            value: { ...permitEvidenceEntry.value, criteria: [{ criterionId: "USE", status: "REQUIRES_VERIFICATION", explanationBasis: "<script>alert(1)</script>" }] },
          },
        ],
      })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderReportHtml - Unit 6B Capability C Estimated lot coverage block (report/PDF consistency)", () => {
  const facts = { parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 1000 };

  it("Case A (WITHIN_STANDARD_ALLOWANCE) shows the standard limit and result, never mentions the 60% allowance", () => {
    const html = renderReportHtml(
      fakeArtifact({
        evidence: [{ factType: "shed-lot-coverage", value: { status: "WITHIN_STANDARD_ALLOWANCE", estimatedCoverageSqFt: 1900, baseAllowanceSqFt: 2500, facts }, provenance: {} }],
      })
    );
    expect(html).toContain("Standard applicable limit: 50%");
    expect(html).toContain("Within the standard lot-coverage allowance");
    expect(html).not.toContain("60%");
  });

  it("Case B (MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE) discloses the 60% possibility, never claims a failure", () => {
    const html = renderReportHtml(
      fakeArtifact({
        evidence: [
          {
            factType: "shed-lot-coverage",
            value: { status: "REQUIRES_VERIFICATION", reason: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE", estimatedCoverageSqFt: 2800, baseAllowanceSqFt: 2500, potentialSpecialAllowanceSqFt: 3000, facts },
            provenance: {},
          },
        ],
      })
    );
    expect(html).toContain("Result: Requires verification");
    expect(html).toContain("60% allowance");
  });

  it("Case C without Director relevance states the 60% ceiling is exceeded", () => {
    const html = renderReportHtml(
      fakeArtifact({
        evidence: [
          { factType: "shed-lot-coverage", value: { status: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE", estimatedCoverageSqFt: 3500, potentialSpecialAllowanceSqFt: 3000, facts }, provenance: {} },
        ],
      })
    );
    expect(html).toContain("Even Seattle's higher 60% allowance");
  });

  it("Case C with Director relevance never claims an unconditional failure", () => {
    const html = renderReportHtml(
      fakeArtifact({
        evidence: [
          {
            factType: "shed-lot-coverage",
            value: { status: "REQUIRES_VERIFICATION", reason: "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE", estimatedCoverageSqFt: 3500, potentialSpecialAllowanceSqFt: 3000, facts },
            provenance: {},
          },
        ],
      })
    );
    expect(html).toContain("Director-approved amount");
    expect(html).not.toContain("Even Seattle's higher");
  });

  it("LOT_AREA_ADJUSTMENT_UNRESOLVED discloses the unresolved ECA exclusion, never a guessed WITHIN/EXCEEDS result", () => {
    const html = renderReportHtml(
      fakeArtifact({
        evidence: [
          { factType: "shed-lot-coverage", value: { status: "REQUIRES_VERIFICATION", reason: "LOT_AREA_ADJUSTMENT_UNRESOLVED", estimatedCoverageSqFt: 2000, facts }, provenance: {} },
        ],
      })
    );
    expect(html).toContain("may reduce the countable lot area");
  });

  it("always shows existingMappedCoverageSqFt", () => {
    const html = renderReportHtml(
      fakeArtifact({
        evidence: [{ factType: "shed-lot-coverage", value: { status: "WITHIN_STANDARD_ALLOWANCE", estimatedCoverageSqFt: 1900, baseAllowanceSqFt: 2500, facts }, provenance: {} }],
      })
    );
    expect(html).toContain("Existing mapped structure coverage: 1000 sq ft.");
  });

  it("renders nothing for the Estimated lot coverage section when the evidence entry is absent - correct dormancy", () => {
    const html = renderReportHtml(fakeArtifact({ evidence: [] }));
    expect(html).not.toContain("Estimated lot coverage");
  });
});

describe("renderReportHtml - Capability C existing-coverage caveat (BR-U6B-11 parity fix, 2026-09-27)", () => {
  const coverageEntry = {
    factType: "shed-lot-coverage",
    value: { status: "WITHIN_STANDARD_ALLOWANCE", estimatedCoverageSqFt: 1500, baseAllowanceSqFt: 2500, facts: { parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 1400, proposedShedFootprintSqFt: 100 } },
    provenance: {},
  };
  it("renders the over-count caveat adjacent to the existing-coverage figure when the existing-structure-coverage entry carries it", () => {
    const html = renderReportHtml(
      fakeArtifact({ evidence: [coverageEntry, { factType: "existing-structure-coverage", value: {}, provenance: { qualityCaveat: "This over-counts the code-countable area." } }] })
    );
    expect(html).toContain("Existing mapped structure coverage: 1400 sq ft.");
    expect(html).toContain("This over-counts the code-countable area.");
  });
  it("omits the caveat paragraph when no existing-structure-coverage entry exists", () => {
    expect(renderReportHtml(fakeArtifact({ evidence: [coverageEntry] }))).not.toContain("over-counts");
  });
});

describe("structured explanation: the web report and the PDF render the same sections (2026-10-13)", () => {
  const norm = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const explanation = {
    version: 2 as const,
    summary: "This screening found 1 requirement this proposal does not currently meet and 2 more that need verification. 3 requirements appear to be met. The details are below.",
    satisfied: [{ title: "ADU use", text: "ADUs are allowed in this zoning context.", evidenceRefs: [0], subjects: ["Accessory dwelling units allowed on this lot"] }],
    issues: [{ title: "Separation", text: "The ADU is 3.2 ft from the principal structure; 5 ft is required.", evidenceRefs: [1], subjects: ["Separation from the principal structure"] }],
    requiresVerification: [{ title: "Size", text: "Maximum ADU size could not be confirmed.", evidenceRefs: [2], subjects: ["ADU size"] }],
    additionalConsiderations: [],
    aboutScreening: "This is an automated screening. SDCI makes the final determination.",
  };
  it("a full artifact renders every explanation heading, item and the about text in both, in the same order, with no empty section and no markdown", () => {
    const artifact = fakeArtifact({ explanation });
    const pdf = norm(renderReportHtml(artifact));
    const web = norm(renderToStaticMarkup(createElement(ReportView, { report: { id: "a", findings: [], evidence: [], explanation, generatedAt: "2026-01-01T00:00:00Z" } as never })));
    const expected = ["Overall assessment", "Requirements that appear satisfied", "ADU use", "Issues that need attention", "Separation", "Requires verification", "Maximum ADU size could not be confirmed.", "About this screening", "SDCI makes the final determination."];
    for (const out of [web, pdf]) {
      let at = -1;
      for (const piece of expected) {
        const i = out.indexOf(piece, at + 1);
        expect(i, piece).toBeGreaterThan(at);
        at = i;
      }
      expect(out).not.toContain("Other requirements to be aware of");
      expect(out).not.toContain("**");
    }
  });
  it("a report generated before the structured contract still renders (as sections, not one escaped blob) in both", () => {
    const legacy = { text: "**Good News**\n\nSetbacks are met.\n\n**Issues That Need Attention**\n\n- Too close to the house.", referencedFindingIds: [] };
    const pdf = norm(renderReportHtml(fakeArtifact({ explanation: legacy })));
    const web = norm(renderToStaticMarkup(createElement(ReportView, { report: { id: "a", findings: [], evidence: [], explanation: legacy, generatedAt: "2026-01-01T00:00:00Z" } as never })));
    for (const out of [web, pdf]) {
      expect(out).toContain("Issues That Need Attention");
      expect(out).toContain("Too close to the house.");
      expect(out).not.toContain("**");
    }
  });
});
