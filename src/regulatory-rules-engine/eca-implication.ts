/**
 * BR-4a: Critical-Area Regulatory Implication Derivation. Owned EXCLUSIVELY by the Regulatory
 * Rules Engine - the only place a CriticalAreaFinding (a spatial/map fact, spatial-analysis/types.ts)
 * is turned into a regulatory Classification. CriticalAreaFinding itself is never read as a
 * regulatory conclusion anywhere else in the codebase.
 */

import { AdvisoryStatus, MappedIntersectionResult } from "../spatial-analysis/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import { FindingClassification } from "./types.js";

/** deriveEcaRegulatoryImplication never infers a critical-area finding (BR-4a has no governed
 * InferencePolicy path for map facts) - the type excludes INFERRED to make that an enforced
 * invariant rather than just current behavior. */
export type EcaFindingClassification = Exclude<FindingClassification, typeof FindingClassification.INFERRED>;

export interface EcaImplication {
  classification: EcaFindingClassification;
  reason: string;
}

export function deriveEcaRegulatoryImplication(finding: CriticalAreaFinding): EcaImplication {
  // BR-4a.1: INDETERMINATE map fact always yields REQUIRES_VERIFICATION, regardless of advisoryStatus.
  if (finding.mappedIntersectionResult === MappedIntersectionResult.INDETERMINATE) {
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      reason: `Mapped ${finding.hazardType} intersection is indeterminate (${finding.toleranceBasis}); cannot be resolved to a confident regulatory conclusion.`,
    };
  }

  // BR-4a.2: map-dispositive hazard types MAY use the mapped result as KNOWN-strength evidence.
  if (finding.advisoryStatus === AdvisoryStatus.MAP_DISPOSITIVE) {
    return {
      classification: FindingClassification.KNOWN,
      reason: `${finding.hazardType} is map-dispositive per authoritative guidance; mapped result: ${finding.mappedIntersectionResult}.`,
    };
  }

  // BR-4a.3: advisory-only hazard types never automatically become KNOWN, even on a clean
  // mapped intersection - authoritative guidance itself says these maps may miss real instances.
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    reason: `${finding.hazardType} mapping is advisory-only (mapped result: ${finding.mappedIntersectionResult}); authoritative confirmation is still required before this can be treated as KNOWN.`,
  };
}
