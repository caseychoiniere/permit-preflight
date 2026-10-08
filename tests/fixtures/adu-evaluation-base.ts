/** A baseline ADU evaluation: a 6,000 sq ft NR lot with one house, a 20 x 20 ft one-story 16 ft ADU placed
 * comfortably clear of every line, nothing declared that would stress any limit. Tests override fields. */
import type { AduProjectDetails, AduSiteFacts } from "../../src/regulatory-rules-engine/adu-types.js";

export function baseAduProject(): AduProjectDetails {
  return {
    projectType: "adu",
    aduType: "DETACHED_NEW",
    widthFt: 20,
    depthFt: 20,
    stories: 1,
    bedrooms: 1,
    heightFt: 16,
    alleyAdjacent: false,
    existingPrincipalDwellingUnits: 1,
    existingAduCount: 0,
    distanceToRearLotLineFt: 20,
    distanceToSideLotLineFt: 8,
    distanceToFrontLotLineFt: 70,
    distanceToDwellingFt: 14,
  };
}

export function baseAduSite(): AduSiteFacts {
  return { parcelAreaSqFt: 6000, existingMappedCoverageSqFt: 1500, inFrequentTransitServiceArea: false, ecaFindings: [] };
}
