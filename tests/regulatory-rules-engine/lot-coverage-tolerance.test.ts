/**
 * Capability C exclusion tolerance (2026-10-07). Pure arithmetic of SMC 23.44.080.B/D and the
 * 50%/60% limits: how much area could be excluded from the lot before the estimate crosses each
 * threshold. Exact values asserted; display rounding is a separate, explicit policy.
 */
import { describe, expect, it } from "vitest";
import {
  PARCEL_SPECIFIC_APPROVAL_DISCLOSURE,
  computeLotCoverageExclusionTolerance,
  computeThresholdTolerance,
  roundToleranceForDisplay,
} from "../../src/regulatory-rules-engine/lot-coverage-tolerance.js";
import { evaluateShedLotCoverage } from "../../src/regulatory-rules-engine/evaluate.js";
import type { EcaLotAreaAdjustment } from "../../src/regulatory-rules-engine/types.js";

const unresolved: EcaLotAreaAdjustment = { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: [], reason: "test" };

describe("computeThresholdTolerance - exact values", () => {
  it("5,000 sq ft parcel / 1,564 sq ft estimate -> 50% tolerance is exactly 1,872 sq ft (37.44% of the parcel)", () => {
    const t = computeThresholdTolerance(5000, 1564, 50);
    expect(t).toMatchObject({ kind: "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS", thresholdPercent: 50 });
    if (t.kind !== "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") throw new Error();
    expect(t.maxExcludedAreaSqFt).toBe(1872);
    expect(t.maxExcludedPercentOfParcel).toBeCloseTo(37.44, 5);
  });

  it("9,000 / 2,064 -> 4,872 sq ft (54.13%)", () => {
    const t = computeThresholdTolerance(9000, 2064, 50);
    if (t.kind !== "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") throw new Error();
    expect(t.maxExcludedAreaSqFt).toBe(4872);
    expect(t.maxExcludedPercentOfParcel).toBeCloseTo(54.1333, 3);
  });

  it("3,000 / 1,264 -> 472 sq ft", () => {
    const t = computeThresholdTolerance(3000, 1264, 50);
    if (t.kind !== "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") throw new Error();
    expect(t.maxExcludedAreaSqFt).toBe(472);
  });

  it("60% tolerance: parcel - estimate / 0.60 (5,000 / 1,564 -> 2,393.33...)", () => {
    const t = computeThresholdTolerance(5000, 1564, 60);
    if (t.kind !== "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") throw new Error();
    expect(t.maxExcludedAreaSqFt).toBeCloseTo(5000 - 1564 / 0.6, 9);
  });

  it("50% boundary: estimate exactly equal to 50% of the parcel -> still within with no exclusions, tolerance exactly 0", () => {
    const t = computeThresholdTolerance(5000, 2500, 50);
    if (t.kind !== "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") throw new Error();
    expect(t.maxExcludedAreaSqFt).toBe(0);
  });

  it("estimate over 50% with zero exclusions -> EXCEEDS_REGARDLESS, no (negative) tolerance number exists", () => {
    const t = computeThresholdTolerance(5000, 2564, 50);
    expect(t).toEqual({ kind: "EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA", thresholdPercent: 50 });
    expect(JSON.stringify(t)).not.toContain("maxExcludedAreaSqFt");
  });

  it("60% boundary: exactly 60% of the parcel is within 60% with tolerance exactly 0; one sq ft more exceeds regardless", () => {
    const at = computeThresholdTolerance(5000, 3000, 60);
    if (at.kind !== "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") throw new Error();
    expect(at.maxExcludedAreaSqFt).toBe(0);
    expect(computeThresholdTolerance(5000, 3001, 60).kind).toBe("EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA");
  });

  it("tolerance is never negative and never exceeds the parcel across a sweep of estimates", () => {
    for (const parcel of [900, 1400, 3000, 5000, 9000, 40000]) {
      for (let e = 1; e <= parcel * 1.2; e += Math.max(1, Math.floor(parcel / 97))) {
        for (const pct of [50, 60] as const) {
          const t = computeThresholdTolerance(parcel, e, pct);
          if (t.kind === "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") {
            expect(t.maxExcludedAreaSqFt).toBeGreaterThanOrEqual(0);
            expect(t.maxExcludedAreaSqFt).toBeLessThan(parcel);
          }
        }
      }
    }
  });

  describe("625 sq ft minimum (SMC 23.44.080.D) interactions", () => {
    it("at or below 625 and within the threshold with no exclusions -> within however much is excluded", () => {
      expect(computeThresholdTolerance(3000, 600, 50)).toEqual({ kind: "WITHIN_REGARDLESS_OF_EXCLUDED_AREA", thresholdPercent: 50, floorSqFt: 625 });
      expect(computeThresholdTolerance(3000, 625, 50).kind).toBe("WITHIN_REGARDLESS_OF_EXCLUDED_AREA");
    });
    it("tiny parcel: over 50% with no exclusions but at most 625 -> exceeds unless an exclusion area exists (floor then applies)", () => {
      expect(computeThresholdTolerance(900, 480, 50)).toEqual({ kind: "EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS", thresholdPercent: 50, floorSqFt: 625 });
      expect(computeThresholdTolerance(900, 625, 50).kind).toBe("EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS");
    });
    it("tiny parcel above 625 sq ft: exceeds regardless (the floor cannot help)", () => {
      expect(computeThresholdTolerance(900, 626, 50).kind).toBe("EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA");
      expect(computeThresholdTolerance(900, 626, 60).kind).toBe("EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA");
    });
    it("just above 625 on a parcel where the estimate is within the threshold has a real, bounded tolerance (the floor does not apply to the bound)", () => {
      const t = computeThresholdTolerance(2000, 626, 50);
      if (t.kind !== "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS") throw new Error();
      expect(t.maxExcludedAreaSqFt).toBeCloseTo(2000 - 626 / 0.5, 9);
    });
  });
});

describe("roundToleranceForDisplay - conservative rounding policy (round DOWN; nearest 10 sq ft from 100 up, whole sq ft below)", () => {
  it.each([
    [1872, 1870],
    [4872, 4870],
    [472, 470],
    [100, 100],
    [99.9, 99],
    [20.5, 20],
    [0.4, 0],
    [0, 0],
  ])("%s -> %s", (input, expected) => {
    expect(roundToleranceForDisplay(input)).toBe(expected);
  });
});

describe("computeLotCoverageExclusionTolerance - customer-facing explanation", () => {
  const text = (parcel: number, estimate: number) => computeLotCoverageExclusionTolerance(parcel, estimate).explanation.join("\n");

  it("5,000 / 1,564: states 31%, ~1,870 sq ft (37% of the parcel) and the 50% limit", () => {
    const out = text(5000, 1564);
    expect(out).toContain("Estimated lot coverage is 31%");
    expect(out).toContain("within the 50% limit unless more than approximately 1,870 sq ft (37% of the parcel)");
    // 60% is noise while 50% still governs.
    expect(out).not.toContain("60%");
  });

  it("9,000 / 2,064 and 3,000 / 1,264", () => {
    expect(text(9000, 2064)).toContain("approximately 4,870 sq ft (54% of the parcel)");
    expect(text(3000, 1264)).toContain("approximately 470 sq ft (15% of the parcel)");
  });

  it("preserves the four required cautions whenever a number is given", () => {
    const out = text(5000, 1564);
    expect(out).toContain("mathematical tolerance, not a measured or mapped size");
    expect(out).toContain("does not know whether any SMC 23.44.080.B exclusion area");
    expect(out).toContain("a mapped critical-area layer is not the same as the regulatory exclusion area");
    expect(out).toContain("SDCI or a field determination may still be required");
  });

  it("already over 50% with zero exclusions: says so plainly, gives no positive 50% tolerance, and adds the 60% tolerance", () => {
    const out = text(5000, 2564);
    expect(out).toContain("already above the 50% limit even if no area is excluded");
    expect(out).not.toMatch(/stays within the 50% limit/);
    expect(out).toContain("60% allowance, which applies only to certain qualifying developments, would be met unless more than approximately 720 sq ft (14% of the parcel)");
  });

  it("estimate exactly at 50%: any excluded area would put the estimate over (no '0 sq ft' phrasing)", () => {
    const out = text(5000, 2500);
    expect(out).toContain("Any area excluded from the lot area under SMC 23.44.080.B would put the estimate over the 50% limit");
    expect(out).not.toContain("approximately 0");
  });

  it("estimate exactly at 60% (over 50%): any excluded area exceeds the 60% allowance", () => {
    expect(text(5000, 3000)).toContain("would be exceeded by any area excluded");
  });

  it("over both thresholds with zero exclusions: plain statement, no tolerance number, no measurement note needed", () => {
    const out = text(5000, 3164);
    expect(out).toContain("already above the 50% limit even if no area is excluded");
    expect(out).toContain("also exceeded even if no area is excluded");
    expect(out).not.toContain("approximately");
  });

  it("tiny parcel floor wording", () => {
    const out = text(900, 480);
    expect(out).toContain("would be within the limit only if a qualifying SMC 23.44.080.B exclusion area exists, in which case the 625 sq ft minimum (SMC 23.44.080.D) applies");
    expect(text(3000, 600)).toContain("however much area is excluded");
  });

  it("tiny tolerances are stated in whole sq ft, never as 0", () => {
    expect(text(1400, 690)).toContain("approximately 20 sq ft");
    expect(text(1400, 699.5)).toContain("approximately 1 sq ft");
  });

  it("never claims a Director alternative, an alternative amount, or that a parcel qualifies for one", () => {
    for (const [p, e] of [[5000, 1564], [5000, 2564], [5000, 3164], [900, 480], [3000, 600]] as const) {
      expect(text(p, e).toLowerCase()).not.toContain("director");
    }
  });
});

describe("evaluateShedLotCoverage - tolerance wiring (denominator unresolved only)", () => {
  it("unresolved results and unresolved EXCEEDS carry the tolerance and the neutral approval disclosure", () => {
    const within = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 1500, proposedShedFootprintSqFt: 64, ecaAdjustment: unresolved });
    if (within.status !== "REQUIRES_VERIFICATION" || within.reason !== "LOT_AREA_ADJUSTMENT_UNRESOLVED") throw new Error("expected unresolved");
    expect(within.exclusionTolerance.at50.kind).toBe("WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS");
    expect(within.parcelSpecificApprovalDisclosure).toBe(PARCEL_SPECIFIC_APPROVAL_DISCLOSURE);

    const over = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3100, proposedShedFootprintSqFt: 64, ecaAdjustment: unresolved });
    if (over.status !== "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE") throw new Error("expected exceeds");
    expect(over.exclusionTolerance?.at50.kind).toBe("EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA");
    expect(over.parcelSpecificApprovalDisclosure).toBe(PARCEL_SPECIFIC_APPROVAL_DISCLOSURE);
  });

  it("625 floor interaction through the evaluator: 900 sq ft parcel, 464 sq ft estimate (over 50% = 450, within 60% = 540) -> unresolved with the floor wording", () => {
    const r = evaluateShedLotCoverage({ parcelAreaSqFt: 900, existingMappedCoverageSqFt: 400, proposedShedFootprintSqFt: 64, ecaAdjustment: unresolved });
    if (r.status !== "REQUIRES_VERIFICATION" || r.reason !== "LOT_AREA_ADJUSTMENT_UNRESOLVED") throw new Error("expected unresolved");
    expect(r.exclusionTolerance.at50.kind).toBe("EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS");
    expect(r.exclusionTolerance.at60.kind).toBe("WITHIN_REGARDLESS_OF_EXCLUDED_AREA");
    // 544 sq ft (> 60% of 900) is still unresolved, not exceeded, because 625 is the optimistic ceiling.
    const higher = evaluateShedLotCoverage({ parcelAreaSqFt: 900, existingMappedCoverageSqFt: 480, proposedShedFootprintSqFt: 64, ecaAdjustment: unresolved });
    if (higher.status !== "REQUIRES_VERIFICATION" || higher.reason !== "LOT_AREA_ADJUSTMENT_UNRESOLVED") throw new Error("expected unresolved");
    expect(higher.exclusionTolerance.at60.kind).toBe("EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS");
  });

  it("an established / not-applicable denominator never carries a tolerance or approval disclosure (nothing is unresolved)", () => {
    const r = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3500, proposedShedFootprintSqFt: 500, ecaAdjustment: { status: "NOT_APPLICABLE", reason: "test" } });
    expect(JSON.stringify(r)).not.toContain("exclusionTolerance");
    expect(JSON.stringify(r)).not.toContain("parcelSpecificApprovalDisclosure");
  });
});
