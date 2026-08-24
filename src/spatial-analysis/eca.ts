/**
 * Critical-Area source-precedence policy - BR-5, BR-5a (business-rules.md). Formalizes Unit 0B
 * Track 4's validated findings. Produces a CriticalAreaFinding - a spatial/map FACT ONLY, never
 * a regulatory conclusion (that derivation is BR-4a, owned exclusively by the Regulatory Rules
 * Engine - see src/regulatory-rules-engine/eca-implication.ts).
 */

import { AdvisoryStatus, MappedIntersectionResult } from "./types.js";
import type { CriticalAreaFinding } from "./types.js";

/** SDCI names exactly these two hazard types as map-dispositive; every other hazard type is
 * advisory-only, per Unit 0B Track 4's verified finding. */
const MAP_DISPOSITIVE_HAZARD_TYPES = new Set(["priority_habitat", "peat_settlement"]);

export function advisoryStatusFor(hazardType: string): AdvisoryStatus {
  return MAP_DISPOSITIVE_HAZARD_TYPES.has(hazardType) ? AdvisoryStatus.MAP_DISPOSITIVE : AdvisoryStatus.ADVISORY_ONLY;
}

export interface LayerQueryResult {
  hazardType: string;
  /** undefined = layer was not queried/not available for this hazard type. */
  individualLayerResult?: boolean;
  combinedLayerResult?: boolean;
  /** Distance in feet from the query point to the individual layer's nearest polygon edge, if
   * computable - used for BR-5.3's proximity check. undefined when not computable. */
  distanceToIndividualLayerEdgeFt?: number;
  layerVintageNote?: string;
}

export interface ToleranceBasis {
  /** A human-readable description of where this tolerance comes from - BR-5a requires this be
   * source/layer-pair-specific, never a single universal constant. */
  basis: string;
  toleranceFt: number;
}

/**
 * BR-5a: source/layer-pair-specific tolerance. Unit 0B's ~15-20m (49-66ft) observation is
 * preserved here as the specific, documented value for the ONE relationship it was measured
 * against (combined layer vs. individual Steep Slope layer) - not applied to any other hazard
 * type without its own basis.
 */
export function toleranceFor(hazardType: string): ToleranceBasis | undefined {
  if (hazardType === "steep_slope") {
    return {
      basis:
        "Unit 0B Track 4 empirical observation: combined ECA layer is a dissolved/generalized union of the " +
        "individual Steep Slope layer, producing a measured ~15-20m (49-66ft) discrepancy band near polygon edges.",
      toleranceFt: 66,
    };
  }
  // No documented tolerance basis for other hazard types yet - callers must not assume one.
  return undefined;
}

/** BR-5: map-fact-level precedence policy. */
export function resolveCriticalAreaFinding(query: LayerQueryResult): CriticalAreaFinding {
  const advisoryStatus = advisoryStatusFor(query.hazardType);
  const tolerance = toleranceFor(query.hazardType);

  const mappedIntersectionResult = decideMappedIntersection(query, tolerance);

  return {
    hazardType: query.hazardType,
    individualLayerResult: query.individualLayerResult,
    combinedLayerResult: query.combinedLayerResult,
    mappedIntersectionResult,
    advisoryStatus,
    toleranceBasis: tolerance?.basis ?? "no documented source/layer-pair tolerance basis for this hazard type",
    layerVintageNote: query.layerVintageNote,
  };
}

function decideMappedIntersection(query: LayerQueryResult, tolerance: ToleranceBasis | undefined): MappedIntersectionResult {
  // BR-5.1: individual authoritative layer always takes precedence; a combined-layer-only hit
  // never produces INTERSECTS.
  if (query.individualLayerResult === undefined) {
    if (query.combinedLayerResult === true) {
      return MappedIntersectionResult.INDETERMINATE; // combined-only hit, no corroborating individual-layer result
    }
    return query.combinedLayerResult === false ? MappedIntersectionResult.NO_INTERSECTION : MappedIntersectionResult.INDETERMINATE;
  }

  // BR-5.3: proximity to the individual layer's edge, within the source-specific tolerance,
  // is treated as indeterminate rather than a confident answer.
  if (
    tolerance &&
    query.distanceToIndividualLayerEdgeFt !== undefined &&
    query.distanceToIndividualLayerEdgeFt <= tolerance.toleranceFt
  ) {
    return MappedIntersectionResult.INDETERMINATE;
  }

  return query.individualLayerResult ? MappedIntersectionResult.INTERSECTS : MappedIntersectionResult.NO_INTERSECTION;
}
