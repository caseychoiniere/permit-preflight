/**
 * Unit 6B Capability C - lot-coverage exclusion tolerance (2026-10-07 founder decision).
 *
 * SMC 23.44.080.B subtracts four named critical-area categories from the lot area before the 50%
 * (or, for qualifying developments, 60%) limit is applied, and 23.44.080.D preserves a 625 sq ft
 * minimum where such an area exists. Permit Preflight cannot establish whether any such area
 * exists (the City's maps are advisory, SMC 25.09.030.A), but excluded area can only SHRINK the
 * denominator, so the rule itself yields an exact tolerance: how large the excluded area could be
 * before the estimate crosses each threshold. This module is that arithmetic and nothing more - it
 * asserts nothing about any mapped condition and is independent of every Tier-2 rule.
 *
 * With parcel P, estimated coverage E and unknown excluded area X > 0 the allowance at fraction f
 * is max(f x (P - X), 625); with X = 0 it is f x P.
 */

import type { LotCoverageExclusionTolerance, LotCoverageThresholdTolerance } from "./types.js";

const FLOOR_SQ_FT = 625;

export const PARCEL_SPECIFIC_APPROVAL_DISCLOSURE =
  "Parcel-specific SDCI approvals, reductions, waivers, or modifications are not evaluated by Permit Preflight and could affect the final allowable coverage.";

export function computeThresholdTolerance(parcelAreaSqFt: number, estimatedCoverageSqFt: number, thresholdPercent: 50 | 60): LotCoverageThresholdTolerance {
  const fraction = thresholdPercent / 100;
  const withinWithNoExclusions = estimatedCoverageSqFt <= parcelAreaSqFt * fraction;
  const atOrBelowFloor = estimatedCoverageSqFt <= FLOOR_SQ_FT;

  if (withinWithNoExclusions) {
    if (atOrBelowFloor) return { kind: "WITHIN_REGARDLESS_OF_EXCLUDED_AREA", thresholdPercent, floorSqFt: FLOOR_SQ_FT };
    // Non-negative here: E <= f x P  =>  P - E/f >= 0.
    const maxExcludedAreaSqFt = parcelAreaSqFt - estimatedCoverageSqFt / fraction;
    return {
      kind: "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS",
      thresholdPercent,
      maxExcludedAreaSqFt,
      maxExcludedPercentOfParcel: (maxExcludedAreaSqFt / parcelAreaSqFt) * 100,
    };
  }
  if (atOrBelowFloor) return { kind: "EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS", thresholdPercent, floorSqFt: FLOOR_SQ_FT };
  return { kind: "EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA", thresholdPercent };
}

function formatSqFt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Display policy: a tolerance is stated conservatively - rounded DOWN, to the nearest 10 sq ft once
 * it reaches 100 sq ft and to a whole sq ft below that - and never presented as exact. The exact
 * figure stays in the structured result. */
export function roundToleranceForDisplay(maxExcludedAreaSqFt: number): number {
  if (maxExcludedAreaSqFt >= 100) return Math.floor(maxExcludedAreaSqFt / 10) * 10;
  return Math.floor(maxExcludedAreaSqFt);
}

const NOT_A_MEASUREMENT =
  "This figure is a mathematical tolerance, not a measured or mapped size: Permit Preflight does not know whether any SMC 23.44.080.B exclusion area (riparian corridor, wetland and buffer, shoreline setback or submerged land, or steep-slope non-disturbance area) applies to this parcel or how large it would be, and a mapped critical-area layer is not the same as the regulatory exclusion area. SDCI or a field determination may still be required.";

function withinUnlessSentence(t: Extract<LotCoverageThresholdTolerance, { kind: "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS" }>, subject: string): string {
  const display = roundToleranceForDisplay(t.maxExcludedAreaSqFt);
  if (display <= 0) {
    return `${subject} Any area excluded from the lot area under SMC 23.44.080.B would put the estimate over the ${t.thresholdPercent}% limit.`;
  }
  return `${subject} It stays within the ${t.thresholdPercent}% limit unless more than approximately ${formatSqFt(display)} sq ft (${Math.floor(t.maxExcludedPercentOfParcel)}% of the parcel) is excluded from the lot area as a critical-area condition under SMC 23.44.080.B.`;
}

/** Customer-facing explanation for an unresolved lot-area denominator. `estimatedCoverageSqFt` and
 * `parcelAreaSqFt` are the same figures the report headline percentage is computed from. */
export function computeLotCoverageExclusionTolerance(parcelAreaSqFt: number, estimatedCoverageSqFt: number): LotCoverageExclusionTolerance {
  const at50 = computeThresholdTolerance(parcelAreaSqFt, estimatedCoverageSqFt, 50);
  const at60 = computeThresholdTolerance(parcelAreaSqFt, estimatedCoverageSqFt, 60);
  const percent = Math.round((estimatedCoverageSqFt / parcelAreaSqFt) * 100);
  const lead = `Estimated lot coverage is ${percent}% (${formatSqFt(estimatedCoverageSqFt)} sq ft of ${formatSqFt(parcelAreaSqFt)} sq ft).`;
  const explanation: string[] = [];
  let includeMeasurementNote = false;

  switch (at50.kind) {
    case "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS":
      explanation.push(withinUnlessSentence(at50, lead));
      includeMeasurementNote = true;
      break;
    case "WITHIN_REGARDLESS_OF_EXCLUDED_AREA":
      explanation.push(
        `${lead} It stays within the 50% limit however much area is excluded from the lot area, because it is within 50% of the full parcel and does not exceed the ${at50.floorSqFt} sq ft minimum that SMC 23.44.080.D preserves where an exclusion area exists.`
      );
      includeMeasurementNote = true;
      break;
    case "EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS":
      explanation.push(
        `${lead} This is already above the 50% limit even if no area is excluded. It would be within the limit only if a qualifying SMC 23.44.080.B exclusion area exists, in which case the ${at50.floorSqFt} sq ft minimum (SMC 23.44.080.D) applies.`
      );
      includeMeasurementNote = true;
      break;
    case "EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA":
      explanation.push(`${lead} This is already above the 50% limit even if no area is excluded from the lot area; excluding area can only raise the percentage.`);
      break;
  }

  // The 60% allowance applies only to certain qualifying developments, so it is stated only when
  // the 50% limit is already exceeded - otherwise 50% is the governing standard and 60% is noise.
  if (at50.kind === "EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS" || at50.kind === "EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA") {
    switch (at60.kind) {
      case "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS": {
        const display = roundToleranceForDisplay(at60.maxExcludedAreaSqFt);
        explanation.push(
          display <= 0
            ? "Seattle's higher 60% allowance, which applies only to certain qualifying developments, would be exceeded by any area excluded from the lot area."
            : `Seattle's higher 60% allowance, which applies only to certain qualifying developments, would be met unless more than approximately ${formatSqFt(display)} sq ft (${Math.floor(at60.maxExcludedPercentOfParcel)}% of the parcel) is excluded from the lot area.`
        );
        includeMeasurementNote = true;
        break;
      }
      case "WITHIN_REGARDLESS_OF_EXCLUDED_AREA":
        explanation.push("Seattle's higher 60% allowance, which applies only to certain qualifying developments, would be met however much area is excluded.");
        includeMeasurementNote = true;
        break;
      case "EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS":
        explanation.push("Seattle's higher 60% allowance, which applies only to certain qualifying developments, is also exceeded unless a qualifying exclusion area exists.");
        includeMeasurementNote = true;
        break;
      case "EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA":
        explanation.push("Seattle's higher 60% allowance, which applies only to certain qualifying developments, is also exceeded even if no area is excluded.");
        break;
    }
  }

  if (includeMeasurementNote) explanation.push(NOT_A_MEASUREMENT);
  return { at50, at60, explanation };
}
