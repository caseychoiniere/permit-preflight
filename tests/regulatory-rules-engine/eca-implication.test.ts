import { describe, expect, it } from "vitest";
import { deriveEcaRegulatoryImplication } from "../../src/regulatory-rules-engine/eca-implication.js";
import { resolveCriticalAreaFinding } from "../../src/spatial-analysis/eca.js";

describe("BR-4a - Critical-Area Regulatory Implication Derivation", () => {
  it("[hard invariant] an advisory-only hazard type's clean map intersection never becomes KNOWN", () => {
    const mapFact = resolveCriticalAreaFinding({ hazardType: "steep_slope", individualLayerResult: true, distanceToIndividualLayerEdgeFt: 500 });
    const implication = deriveEcaRegulatoryImplication(mapFact);
    expect(implication.classification).not.toBe("KNOWN");
    expect(implication.classification).toBe("REQUIRES_VERIFICATION");
  });

  it("allows KNOWN for a map-dispositive hazard type's clean map intersection", () => {
    const mapFact = resolveCriticalAreaFinding({ hazardType: "priority_habitat", individualLayerResult: true, distanceToIndividualLayerEdgeFt: 500 });
    const implication = deriveEcaRegulatoryImplication(mapFact);
    expect(implication.classification).toBe("KNOWN");
  });

  it("[hard invariant] INDETERMINATE map fact always yields REQUIRES_VERIFICATION regardless of advisory status", () => {
    const dispositiveButIndeterminate = resolveCriticalAreaFinding({ hazardType: "priority_habitat", individualLayerResult: undefined, combinedLayerResult: true });
    expect(deriveEcaRegulatoryImplication(dispositiveButIndeterminate).classification).toBe("REQUIRES_VERIFICATION");
  });

  it("[hard invariant] a CriticalAreaFinding (map fact) is never itself read as the classification - deriveEcaRegulatoryImplication is the only path", () => {
    const mapFact = resolveCriticalAreaFinding({ hazardType: "steep_slope", individualLayerResult: false });
    // mapFact has no "classification" field at all - see spatial-analysis/eca.test.ts. The only
    // way to get a Classification from it is through this module's explicit derivation function.
    expect(mapFact).not.toHaveProperty("classification");
    const implication = deriveEcaRegulatoryImplication(mapFact);
    expect(["KNOWN", "INFERRED", "REQUIRES_VERIFICATION"]).toContain(implication.classification);
  });
});
