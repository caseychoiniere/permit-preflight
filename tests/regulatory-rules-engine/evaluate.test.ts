import { describe, expect, it } from "vitest";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";
import {
  approvedZoneBoundaryPolicy,
  dwellingSeparationRule,
  heightRule,
  notYetActiveRule,
  rearSetbackRule,
  sideFrontSetbackRule,
  zoneBoundaryInferenceRule,
} from "../fixtures/test-only-active-rules.js";

function propertyContext(facts: PropertyContext["facts"] = []): PropertyContext {
  return { parcelId: "test-parcel", assembledAt: "2026-01-01T00:00:00.000Z", facts };
}

describe("Regulatory Rules Engine - BR-4/BR-4a", () => {
  it("produces a KNOWN PASS finding for a compliant rear setback", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6 },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.status).toBe("COMPLETE");
    expect(outcome.findings[0]).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
  });

  it("produces a KNOWN FAIL finding for a non-compliant rear setback", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 2 },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.findings[0]).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
  });

  it("[hard invariant] missing evidence produces REQUIRES_VERIFICATION, never a silently favorable finding", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false }, // distanceToRearLotLineFt intentionally omitted
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.findings[0]!.classification).toBe("REQUIRES_VERIFICATION");
    expect(outcome.findings[0]!.complianceOutcome).toBeUndefined();
  });

  it("[hard invariant] only ACTIVE rules are consumed - a DRAFTED rule passed in is silently excluded from findings", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 200, alleyAdjacent: false }, // would clearly FAIL notYetActiveRule's 1ft max if evaluated
      candidateActiveRules: [notYetActiveRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.findings).toHaveLength(0);
  });

  it("evaluates height and dwelling separation correctly", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 15, alleyAdjacent: false, distanceToDwellingFt: 2 },
      candidateActiveRules: [heightRule, dwellingSeparationRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const heightFinding = outcome.findings.find((f) => f.appliedRule?.id === heightRule.id);
    const separationFinding = outcome.findings.find((f) => f.appliedRule?.id === dwellingSeparationRule.id);
    expect(heightFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" }); // 15ft > 12ft max
    expect(separationFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" }); // 2ft < 3ft min
  });

  it("side/front setback rule applies the FULL standard setback - no reduced-setback exception for accessory structures", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: {
        projectType: "shed",
        widthFt: 8,
        depthFt: 10,
        heightFt: 10,
        alleyAdjacent: false,
        distanceToSideLotLineFt: 2, // below the 3ft standard minimum
        distanceToFrontLotLineFt: 20,
      },
      candidateActiveRules: [sideFrontSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
    const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
    expect(sideFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
    expect(frontFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
  });

  it(
    "[hard invariant, regression test 2026-08-30] Building Intelligence returning zero/multiple/unconfirmed dwelling footprints (distanceToDwellingFt " +
      "undefined) affects ONLY the dwelling-separation finding - rear/height/side/front all still produce real KNOWN findings from the SAME ACTIVE " +
      "rule set the real staging shed rules use (rear setback, height, dwelling separation, side/front setback together, exactly as they're actually " +
      "loaded in production/staging)",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 15, // > 12ft max - deliberately FAILs, proving this isn't a "nothing evaluated" false positive
          alleyAdjacent: false,
          distanceToRearLotLineFt: 6,
          distanceToSideLotLineFt: 2,
          distanceToFrontLotLineFt: 20,
          // distanceToDwellingFt intentionally omitted - simulates Building Intelligence returning
          // zero footprints, multiple footprints with none selected, or a selection that didn't
          // match fresh source data. Never fabricated or defaulted.
        },
        candidateActiveRules: [rearSetbackRule, heightRule, dwellingSeparationRule, sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      expect(outcome.status).toBe("COMPLETE");
      expect(outcome.findings.length).toBeGreaterThanOrEqual(4); // rear, height, dwelling, side, front (side/front produce 2 findings)

      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);
      const heightFinding = outcome.findings.find((f) => f.appliedRule?.id === heightRule.id);
      const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
      const dwellingFinding = outcome.findings.find((f) => f.appliedRule?.id === dwellingSeparationRule.id);

      // The 4 unrelated findings are all real, evaluated KNOWN results - never suppressed, never
      // REQUIRES_VERIFICATION, just because Building Intelligence didn't establish a dwelling.
      expect(rearFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(heightFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
      expect(sideFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
      expect(frontFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });

      // Only dwelling separation is affected, and only in the expected, fail-closed way.
      expect(dwellingFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(dwellingFinding?.complianceOutcome).toBeUndefined();
    }
  );

  it("[hard invariant] INFERRED requires a matching approved InferencePolicy - falls to REQUIRES_VERIFICATION without one", () => {
    const withoutPolicy = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false },
      candidateActiveRules: [zoneBoundaryInferenceRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [], // no policy available
    });
    expect(withoutPolicy.findings[0]!.classification).toBe("REQUIRES_VERIFICATION");
    expect(withoutPolicy.findings[0]!.appliedInferencePolicy).toBeUndefined();

    const withPolicy = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false },
      candidateActiveRules: [zoneBoundaryInferenceRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [approvedZoneBoundaryPolicy],
    });
    expect(withPolicy.findings[0]!.classification).toBe("INFERRED");
    expect(withPolicy.findings[0]!.appliedInferencePolicy?.id).toBe(approvedZoneBoundaryPolicy.id);
  });

  it("[hard invariant] deterministic reproducibility - identical inputs produce an identical EvaluationOutcome (NFR-1)", () => {
    const input = {
      propertyContext: propertyContext(),
      project: { projectType: "shed" as const, widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6, distanceToDwellingFt: 4 },
      candidateActiveRules: [rearSetbackRule, dwellingSeparationRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    };
    const first = evaluateProject(input);
    const second = evaluateProject(input);
    expect(first).toEqual(second);
  });

  it("[hard invariant] every finding carries provenance (supportingEvidence/appliedRule/explanationBasis) populated at creation", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6 },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const finding = outcome.findings[0]!;
    expect(finding.appliedRule).toBeDefined();
    expect(finding.supportingEvidence.length).toBeGreaterThan(0);
    expect(finding.explanationBasis.length).toBeGreaterThan(0);
  });

  it("[hard invariant] defers the whole evaluation (never a hollow REQUIRES_VERIFICATION-only report) when parcel geometry itself is unavailable", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext([
        {
          factType: "parcel-geometry-available",
          provenance: { sourceAgency: "test", dataset: "test", retrievalTimestamp: "2026-01-01T00:00:00.000Z" },
          availabilityState: "UNAVAILABLE",
        },
      ]),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.status).toBe("DEFERRED");
    expect(outcome.findings).toHaveLength(0);
    expect(outcome.deferralReason).toBeTruthy();
  });
});
