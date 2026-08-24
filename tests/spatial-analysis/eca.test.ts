import { describe, expect, it } from "vitest";
import { resolveCriticalAreaFinding } from "../../src/spatial-analysis/eca.js";

/**
 * Reflects the real contradiction Unit 0B found near 1802 43rd Ave E (Madison Park): a combined
 * ECA layer flagged "ECA_30" but the authoritative individual Steep Slope layer did not
 * corroborate it at the same point.
 */
describe("Critical-Area source precedence - BR-5/BR-5a", () => {
  it("[hard invariant] a combined-layer-only hit never produces INTERSECTS - individual layer takes precedence", () => {
    const finding = resolveCriticalAreaFinding({
      hazardType: "steep_slope",
      individualLayerResult: undefined,
      combinedLayerResult: true,
    });
    expect(finding.mappedIntersectionResult).not.toBe("INTERSECTS");
    expect(finding.mappedIntersectionResult).toBe("INDETERMINATE");
  });

  it("reports NO_INTERSECTION when the individual authoritative layer clearly says no", () => {
    const finding = resolveCriticalAreaFinding({
      hazardType: "steep_slope",
      individualLayerResult: false,
      combinedLayerResult: false,
      distanceToIndividualLayerEdgeFt: 500,
    });
    expect(finding.mappedIntersectionResult).toBe("NO_INTERSECTION");
  });

  it("reports INDETERMINATE when the point is within the source-specific tolerance band of a polygon edge", () => {
    const finding = resolveCriticalAreaFinding({
      hazardType: "steep_slope",
      individualLayerResult: false,
      distanceToIndividualLayerEdgeFt: 10, // within the documented ~66ft tolerance for this specific layer pair
    });
    expect(finding.mappedIntersectionResult).toBe("INDETERMINATE");
  });

  it("[hard invariant] does not apply the steep-slope tolerance to an undocumented hazard type", () => {
    const finding = resolveCriticalAreaFinding({
      hazardType: "wetland", // no documented tolerance basis
      individualLayerResult: false,
      distanceToIndividualLayerEdgeFt: 10,
    });
    // No tolerance basis exists for "wetland" - proximity alone must not trigger INDETERMINATE.
    expect(finding.mappedIntersectionResult).toBe("NO_INTERSECTION");
    expect(finding.toleranceBasis).toContain("no documented");
  });

  it("marks priority_habitat and peat_settlement as map-dispositive, everything else advisory-only", () => {
    expect(resolveCriticalAreaFinding({ hazardType: "priority_habitat", individualLayerResult: true }).advisoryStatus).toBe(
      "MAP_DISPOSITIVE"
    );
    expect(resolveCriticalAreaFinding({ hazardType: "steep_slope", individualLayerResult: true }).advisoryStatus).toBe(
      "ADVISORY_ONLY"
    );
  });

  it("[hard invariant] CriticalAreaFinding never carries a regulatory verdict field - only map-fact fields", () => {
    const finding = resolveCriticalAreaFinding({ hazardType: "steep_slope", individualLayerResult: true });
    expect(finding).not.toHaveProperty("classification");
    expect(finding).not.toHaveProperty("complianceOutcome");
  });
});
