import { describe, expect, it } from "vitest";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import {
  rearSetbackRuleAuthoritativeOnly,
  rearSetbackRuleAcceptsGeneralLocation,
  generalLocationSetbackInferencePolicy,
} from "../fixtures/test-only-active-rules.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";

const availableGeometryContext: PropertyContext = {
  parcelId: "TEST-PARCEL",
  assembledAt: new Date().toISOString(),
  facts: [
    {
      factType: "parcel-geometry-available",
      value: true,
      availabilityState: "AVAILABLE",
      provenance: { sourceAgency: "test", dataset: "test", sourceIdentifier: "test", retrievalTimestamp: new Date().toISOString() },
    },
  ],
};

const baseProject = { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, distanceToRearLotLineFt: 10 };

describe("Regulatory Rules Engine - evidence-quality classification gate (BR-U2-10)", () => {
  it("AUTHORITATIVE evidence (or no spatialEvidenceQuality set) classifies KNOWN as before - unchanged Unit 1 behavior", () => {
    const outcome = evaluateProject({
      propertyContext: availableGeometryContext,
      project: baseProject,
      candidateActiveRules: [rearSetbackRuleAuthoritativeOnly],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const finding = outcome.findings.find((f) => f.subject === rearSetbackRuleAuthoritativeOnly.subject);
    expect(finding?.classification).toBe("KNOWN");
    expect(finding?.complianceOutcome).toBe("PASS");
  });

  it("[hard invariant] GENERAL_LOCATION_ONLY evidence + a rule that did NOT accept it -> REQUIRES_VERIFICATION, never KNOWN-by-omission", () => {
    const outcome = evaluateProject({
      propertyContext: availableGeometryContext,
      project: { ...baseProject, spatialEvidenceQuality: "GENERAL_LOCATION_ONLY" },
      candidateActiveRules: [rearSetbackRuleAuthoritativeOnly],
      ecaFindings: [],
      candidateActiveInferencePolicies: [], // no matching InferencePolicy either
    });
    const finding = outcome.findings.find((f) => f.subject === rearSetbackRuleAuthoritativeOnly.subject);
    expect(finding?.classification).toBe("REQUIRES_VERIFICATION");
    expect(finding?.complianceOutcome).toBeUndefined();
  });

  it("[hard invariant] a rule that explicitly accepted GENERAL_LOCATION_ONLY still classifies KNOWN - the gate is per-rule, governed, not a blanket ban", () => {
    const outcome = evaluateProject({
      propertyContext: availableGeometryContext,
      project: { ...baseProject, spatialEvidenceQuality: "GENERAL_LOCATION_ONLY" },
      candidateActiveRules: [rearSetbackRuleAcceptsGeneralLocation],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const finding = outcome.findings.find((f) => f.subject === rearSetbackRuleAcceptsGeneralLocation.subject);
    expect(finding?.classification).toBe("KNOWN");
    expect(finding?.complianceOutcome).toBe("PASS");
  });

  it("GENERAL_LOCATION_ONLY evidence + a rule that did NOT accept it, but an approved InferencePolicy covers it -> INFERRED, not fabricated KNOWN", () => {
    const outcome = evaluateProject({
      propertyContext: availableGeometryContext,
      project: { ...baseProject, spatialEvidenceQuality: "GENERAL_LOCATION_ONLY" },
      candidateActiveRules: [rearSetbackRuleAuthoritativeOnly],
      ecaFindings: [],
      candidateActiveInferencePolicies: [generalLocationSetbackInferencePolicy],
    });
    const finding = outcome.findings.find((f) => f.subject === rearSetbackRuleAuthoritativeOnly.subject);
    expect(finding?.classification).toBe("INFERRED");
    expect(finding?.appliedInferencePolicy?.id).toBe(generalLocationSetbackInferencePolicy.id);
  });

  it("[hard invariant] this gate never applies a fabricated numeric tolerance - it is purely categorical (accepted or not), no distance-based leniency introduced", () => {
    // A FAIL-margin case: distance well under the required minimum. Even with GENERAL_LOCATION_ONLY
    // evidence and a rule that accepts it, the compliance outcome must still be FAIL, not silently
    // passed due to any invented tolerance band.
    const outcome = evaluateProject({
      propertyContext: availableGeometryContext,
      project: { ...baseProject, distanceToRearLotLineFt: 1, spatialEvidenceQuality: "GENERAL_LOCATION_ONLY" },
      candidateActiveRules: [rearSetbackRuleAcceptsGeneralLocation],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const finding = outcome.findings.find((f) => f.subject === rearSetbackRuleAcceptsGeneralLocation.subject);
    expect(finding?.classification).toBe("KNOWN");
    expect(finding?.complianceOutcome).toBe("FAIL");
  });
});
