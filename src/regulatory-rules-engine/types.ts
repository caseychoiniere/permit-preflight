/**
 * Regulatory Rules Engine / Evaluation domain types (domain-entities.md). The Regulatory Rules
 * Engine is the SOLE place KNOWN / INFERRED / REQUIRES_VERIFICATION is assigned - enforced here
 * by construction: Finding.classification is only ever produced by evaluate.ts in this package,
 * never by property-intelligence/ or spatial-analysis/.
 */

import type { EvidenceQuality, RegulatoryRule } from "../regulatory-rule-governance/types.js";
import type { InferencePolicy } from "../regulatory-rule-governance/types.js";
import type {
  FoundationType,
  RoofOverhang,
  ShedAttachment,
  ShedIntendedUse,
  StructuralSpanInfo,
  UtilityIntent,
} from "../screening-request/types.js";

export type { EvidenceQuality };

export const FindingClassification = {
  KNOWN: "KNOWN",
  INFERRED: "INFERRED",
  REQUIRES_VERIFICATION: "REQUIRES_VERIFICATION",
} as const;
export type FindingClassification = (typeof FindingClassification)[keyof typeof FindingClassification];

export const ComplianceOutcome = {
  PASS: "PASS",
  FAIL: "FAIL",
} as const;
export type ComplianceOutcome = (typeof ComplianceOutcome)[keyof typeof ComplianceOutcome];

/** The fixed InferencePolicy.subject convention consulted by BR-U2-10's evidence-quality gate
 * when a rule doesn't itself accept GENERAL_LOCATION_ONLY evidence for a spatial finding. */
export const GENERAL_LOCATION_ONLY_SETBACK_POLICY_SUBJECT = "GENERAL_LOCATION_ONLY_SETBACK_EVIDENCE";

export interface ShedProjectDetails {
  projectType: "shed";
  widthFt: number;
  depthFt: number;
  heightFt: number;
  alleyAdjacent: boolean;
  distanceToRearLotLineFt?: number;
  distanceToSideLotLineFt?: number;
  distanceToFrontLotLineFt?: number;
  distanceToDwellingFt?: number;
  /** Unit 2 addition (BR-U2-10). The evidence quality of the parcel geometry the setback
   * distances above were computed from - undefined/AUTHORITATIVE means no gating applies (Unit
   * 1's original behavior, unchanged). GENERAL_LOCATION_ONLY triggers the evidence-quality gate
   * on KNOWN classification for REAR_SETBACK/SIDE_FRONT_SETBACK_STANDARD findings. */
  spatialEvidenceQuality?: EvidenceQuality;
  /** Maintenance correction (2026-09-15) - when the front/rear/side lot-line roles could not be
   * confidently resolved for this parcel's shape (LotLineRoleAssignment.status === INSUFFICIENT),
   * distanceToRearLotLineFt/distanceToSideLotLineFt/distanceToFrontLotLineFt are all undefined,
   * exactly as before - but the REASON is now carried through here instead of being discarded, so
   * the resulting REQUIRES_VERIFICATION findings can state the real cause ("the front, rear, and
   * side property lines could not be confidently identified for this parcel's shape") rather than
   * a bare "not available." Deliberately NOT used by dwelling separation - that fact no longer
   * depends on lot-line roles at all (postgis-adapter.ts's computeSetbackDistances now computes
   * the footprint regardless), so conflating the two reasons would misattribute an unrelated gap. */
  setbackEvidenceGapReason?: string;
  /** The real, KNOWN PostGIS distance to every side-candidate edge (ordinary and confirmed
   * street-frontage alike), keyed by edgeRef - preserved for evidence/citation transparency.
   * Maintenance correction (2026-09-16, founder-directed current-code research): current SMC
   * 23.44.090 imposes no distinct required depth for a "side street lot line" (see
   * postgis-adapter.ts's computeSetbackDistances for the full citation), so distanceToSideLotLineFt
   * above already reflects the minimum across every one of these entries - this field exists purely
   * so the individual per-edge breakdown remains available if ever needed. */
  sideEdgeDistancesFt?: Record<string, number>;
  /** Maintenance correction (2026-09-17, founder correction after reviewer escalation
   * 53f30444-b566-4197-b0dd-e2aff768fa65) - every confirmed-street edge whose role (through-lot
   * front per SMC 23.44.090.B, Director-determined front per SMC 23.84A.024, or ordinary
   * side-street) current code cannot resolve from this parcel's own boundary geometry alone, keyed
   * by edgeRef - the real, KNOWN PostGIS distance, but excluded from both
   * distanceToFrontLotLineFt's and distanceToSideLotLineFt's confident minimums. Resolving this
   * would require real STREET geometry evidence (the actual relationship between the streets
   * involved), which this correction deliberately does not add (no new street GIS adapter). See
   * postgis-adapter.ts's computeSetbackDistances for the full citation and classification logic. */
  unresolvedStreetFrontageDistancesFt?: Record<string, number>;
  /** Maintenance correction (2026-09-17) - NON-AUTHORITATIVE diagnostic evidence only, keyed the
   * same way as unresolvedStreetFrontageDistancesFt. A parcel-edge-azimuth heuristic that MAY hint
   * a given confirmed-street edge is a possible through lot - never used to decide a PASS/FAIL
   * conclusion (see postgis-adapter.ts's StreetFrontageHeuristic for why: azimuth of this parcel's
   * own boundary segments is not proof that two STREETS are parallel, and a tessellated/curved
   * frontage can falsely satisfy the numeric test). Persisted purely so a human reviewer (or a
   * future feature that adds real street-geometry evidence) has full raw traceability. */
  streetFrontageHeuristics?: Record<
    string,
    { frontEdgeRef: string; edgeRef: string; azimuthFrontDeg: number; azimuthEdgeDeg: number; angleFromParallelDeg: number; possibleThroughLot: boolean; evidenceQuality: "INFERRED" }
  >;
  /** Maintenance correction (2026-09-17, founder correction after reviewer escalation) - set
   * whenever unresolvedStreetFrontageDistancesFt is non-empty, OR the customer answered NOT_SURE to
   * "does this property have street frontage on more than one side" (in which case NO edge is
   * individually confirmed, but the front-line role is equally unresolved - we cannot rule out an
   * as-yet-unconfirmed additional street existing). distanceToFrontLotLineFt remains a KNOWN
   * measurement (the customer's own front pick), but the CONCLUSION built on it is uncertain, since
   * current code's through-lot/Director-determination provisions mean the true code-defined front
   * line is not necessarily the customer's pick. evaluateSideFrontSetback must reflect this as
   * REQUIRES_VERIFICATION for the front finding specifically, never silently downgrade the known
   * distance itself. */
  frontRoleEvidenceGapReason?: string;
  /** Maintenance correction (2026-09-17, founder correction after reviewer escalation) - set
   * whenever rearAlsoFacesStreet is true (the customer confirmed their rear line also faces a
   * street, so whether it's genuinely an ordinary rear line or a through-lot/Director-determined
   * front line is unresolved), OR the customer answered NOT_SURE (rear could secretly be a second
   * street too - not ruled out). distanceToRearLotLineFt remains a KNOWN measurement; only the
   * CONCLUSION built on it is uncertain. Deliberately independent of setbackEvidenceGapReason,
   * which covers the unrelated INSUFFICIENT-parcel-shape case. */
  rearRoleEvidenceGapReason?: string;
  /** Maintenance correction (2026-09-17, founder correction after reviewer escalation) - set ONLY
   * when the customer answered NOT_SURE: none of the side-candidate edges can be confidently
   * treated as ordinary (non-street-facing) side lines, since the customer has not confirmed
   * whether any of them face an additional street. distanceToSideLotLineFt remains a KNOWN
   * measurement (computed the same as it would be for NO); only the CONCLUSION is uncertain. Never
   * set for YES - there, only the SPECIFICALLY confirmed edges are excluded/unresolved
   * (unresolvedStreetFrontageDistancesFt), and every other side edge stays confidently ordinary
   * (the customer affirmatively did not mark it as street-facing). */
  sideRoleEvidenceGapReason?: string;
  /** Maintenance correction (2026-09-15, RC-4) - the real, distinct reason distanceToDwellingFt
   * is unavailable (no selection made, a stale/unmatched selection, or unavailable
   * building-outline data), threaded into the DWELLING_SEPARATION finding instead of a generic
   * "not available." Deliberately independent of setbackEvidenceGapReason - dwelling separation
   * no longer depends on lot-line roles at all (postgis-adapter.ts's computeSetbackDistances now
   * computes the footprint regardless), so its own gap always has a genuinely different cause. */
  dwellingSeparationEvidenceGapReason?: string;
  /** Unit 6B additions (functional-design/domain-entities.md §2) - permit-requirement/
   * lot-coverage evaluation-time inputs, carried through unchanged from ShedProjectConfiguration. */
  foundationType?: FoundationType;
  attachment?: ShedAttachment;
  intendedUse?: ShedIntendedUse;
  roofOverhang?: RoofOverhang;
  structuralSpanInfo?: StructuralSpanInfo;
  utilityIntent?: UtilityIntent;
  /** Unit 6B - whether the shed's already-computed placement falls inside a required setback,
   * feeding P2b's location-sensitive height determination (evaluate.ts's
   * evaluateAccessoryHeightLimit). Server-derived from the existing setback-distance computation,
   * never client-supplied - undefined means the setback-location fact itself is unresolved.
   * Founder-approved bounded-band derivation (aidlc-docs/decisions/2026-09-17-side-street-setback
   * -current-code-research.md's "Correction (2026-09-23, same day)" section, 2026-09-23) -
   * pipeline.ts's deriveIsInRequiredSetback computes this from SMC 23.44.090 Table A's per-boundary
   * thresholds against the shed's already-known front/rear/side distances, never from
   * REAR_SETBACK/SIDE_FRONT_SETBACK_STANDARD's own ACTIVE rule minimums (23.44.090.I.2's distinct
   * accessory-placement exception, a different figure - see that same research addendum). */
  isInRequiredSetback?: boolean;
  /** Unit 6B - the specific reason(s) isInRequiredSetback is undefined, when it is, so
   * evaluateAccessoryHeightLimit's REQUIRES_VERIFICATION finding can cite the real evidence gap
   * (dwelling-unit count, frequent-transit-service-area status, an unresolved lot-line role, the
   * unresolvable Chapter 23.53 additional-setback guard, or the unresolvable Queen Anne Boulevard
   * special-frontage guard) instead of a generic "unavailable" message. Always populated when
   * isInRequiredSetback is undefined; empty/absent only when isInRequiredSetback is itself
   * defined. */
  requiredSetbackEvidenceGapReasons?: string[];
}

/** Unit 4 (domain-entities.md) - shares every setback/height field with ShedProjectDetails
 * (same shape, reused by the same REAR_SETBACK/HEIGHT_LIMIT/SIDE_FRONT_SETBACK_STANDARD
 * evaluators, unchanged) but deliberately has NO `distanceToDwellingFt` -
 * DWELLING_SEPARATION is shed-only, outside SRE-GARAGE-1's setback/height/lot-coverage scope. */
export interface GarageProjectDetails {
  projectType: "garage";
  widthFt: number;
  depthFt: number;
  heightFt: number;
  alleyAdjacent: boolean;
  distanceToRearLotLineFt?: number;
  distanceToSideLotLineFt?: number;
  distanceToFrontLotLineFt?: number;
  spatialEvidenceQuality?: EvidenceQuality;
  /** Same maintenance correction as ShedProjectDetails - see that field's docstring. */
  setbackEvidenceGapReason?: string;
  /** Same as ShedProjectDetails - see that field's docstring. */
  sideEdgeDistancesFt?: Record<string, number>;
  /** Same as ShedProjectDetails - see that field's docstring. */
  unresolvedStreetFrontageDistancesFt?: Record<string, number>;
  /** Same as ShedProjectDetails - see that field's docstring. */
  streetFrontageHeuristics?: Record<
    string,
    { frontEdgeRef: string; edgeRef: string; azimuthFrontDeg: number; azimuthEdgeDeg: number; angleFromParallelDeg: number; possibleThroughLot: boolean; evidenceQuality: "INFERRED" }
  >;
  /** Same as ShedProjectDetails - see that field's docstring. */
  frontRoleEvidenceGapReason?: string;
  /** Same as ShedProjectDetails - see that field's docstring. */
  rearRoleEvidenceGapReason?: string;
  /** Same as ShedProjectDetails - see that field's docstring. */
  sideRoleEvidenceGapReason?: string;
}

export type ProjectDetails = ShedProjectDetails | GarageProjectDetails;

/**
 * Unit 4 (domain-entities.md, revised through the final targeted correction). Server-derived
 * evaluation-time facts for the LOT_COVERAGE ruleType - never client-supplied, assembled fresh at
 * evaluation time (business-rules.md BR-U4-8). `applicableCoveragePercentage` and
 * `minimumCoverageFloor` are discriminated result types, not bare optional numbers, so
 * "confidently does not apply" and "genuinely unresolved" are never collapsed into the same
 * `undefined` (final targeted correction, 2026-08-26).
 */
export interface LotCoverageFacts {
  rawParcelAreaSqFt: number;
  proposedGarageCountableFootprintSqFt: number;
  /** USER_SUPPLIED, unverified (BR-U4-3) - undefined means "not supplied", never defaulted. */
  existingStructuresCountableFootprintSqFt?: number;
  /** SMC 23.44.080.B+E excluded area (L2) - undefined unless measured or confidently ruled out
   * (BR-U4-7). No production ECA area-of-overlap capability exists today, so this stays
   * undefined for the large majority of real evaluations. */
  excludedLotAreaSqFt?: number;
  /** rawParcelAreaSqFt - excludedLotAreaSqFt (L2's applicable denominator) - undefined unless
   * (a) excludedLotAreaSqFt was measured, or (b) confident evidence shows no exclusion applies. */
  countableLotAreaSqFt?: number;
  /** L1 default (50%) vs. L5/L6's conditional 60% (garage-rule-inventory-and-tier-triage.md).
   * `stackedDwellingUnits === false` alone is NOT sufficient to reach ESTABLISHED(50) - it rules
   * out L6 only, never L5 (whose applicability cannot currently be independently established at
   * all, per BR-U4-7's final targeted correction) - so no real request today ever reaches
   * `L1_DEFAULT`; that branch exists for a future unit that integrates transit-area data. */
  applicableCoveragePercentage:
    | { status: "ESTABLISHED"; percent: 50 | 60; basis: "L1_DEFAULT" | "L5_TRANSIT_BONUS" | "L6_STACKED_BONUS" }
    | { status: "REQUIRES_VERIFICATION"; reason: string };
  /** L4/SMC 23.44.080.D's minimum floor - a discriminated result (never a bare optional number,
   * per the final targeted correction) so "does not apply" and "unresolved" are distinguishable. */
  minimumCoverageFloor:
    | { status: "NOT_APPLICABLE" }
    | { status: "REQUIRES_VERIFICATION"; statutoryMinimumSqFt: 625; reason: string }
    | { status: "KNOWN"; amountSqFt: number; provenance: string };
  /** MAX(percent x countableLotAreaSqFt, floor amount) - producible only when
   * countableLotAreaSqFt is defined, applicableCoveragePercentage.status is ESTABLISHED, and
   * minimumCoverageFloor.status is NOT_APPLICABLE or KNOWN. undefined otherwise. */
  allowedCoverageSqFt?: number;
}

interface FindingBase {
  subject: string;
  appliedRule?: Pick<RegulatoryRule, "id" | "subject" | "citation">;
  supportingEvidence: string[];
  explanationBasis: string;
}

/** Finding is a discriminated union on `classification`, enforced at the type level (not just by
 * evaluate.ts convention): INFERRED must carry the InferencePolicy that backs it; KNOWN and
 * REQUIRES_VERIFICATION cannot accidentally be constructed with one. `complianceOutcome` stays
 * optional on KNOWN (not required) because ECA-derived KNOWN findings are factual map
 * determinations with no pass/fail concept - see eca-implication.ts. */
export type Finding =
  | (FindingBase & {
      classification: typeof FindingClassification.KNOWN;
      complianceOutcome?: ComplianceOutcome;
      appliedInferencePolicy?: undefined;
    })
  | (FindingBase & {
      classification: typeof FindingClassification.INFERRED;
      complianceOutcome?: ComplianceOutcome;
      appliedInferencePolicy: Pick<InferencePolicy, "id" | "subject" | "derivationMethod" | "version">;
    })
  | (FindingBase & {
      classification: typeof FindingClassification.REQUIRES_VERIFICATION;
      complianceOutcome?: undefined;
      appliedInferencePolicy?: undefined;
    });

export const EvaluationStatus = {
  COMPLETE: "COMPLETE",
  DEFERRED: "DEFERRED",
} as const;
export type EvaluationStatus = (typeof EvaluationStatus)[keyof typeof EvaluationStatus];

export interface EvaluationOutcome {
  status: EvaluationStatus;
  findings: Finding[];
  /** Present when status === "DEFERRED" - why no meaningful evaluation could be produced. */
  deferralReason?: string;
  /** Unit 4 addition (business-rules.md BR-U4-5) - the constraint types ("setback", "height",
   * "lot coverage") this project type is expected to be screened for (per SRE-GARAGE-1/
   * SRE-SHED-1) but for which zero ACTIVE rules currently exist. Empty for shed today (shed has
   * ACTIVE coverage for every constraint type it promises). Report rendering must consume this to
   * show NoActiveRuleCoverageNotice rather than presenting an empty findings array as a clean
   * screening result - the distinct failure mode this unit introduces. */
  uncoveredConstraintTypes: string[];
  /** Unit 6B addition - shed-only, undefined for garage. Present once every rule REQUIRED FOR THE
   * SPECIFIC CLAIM it makes is ACTIVE (outcome-dependency model, evaluate.ts; 2026-10-07): REQUIRED
   * needs one conclusive active disqualifier, REQUIRES_VERIFICATION needs every deterministic permit
   * rule, LIKELY_EXEMPT additionally needs the discretionary P6. A customer-visible
   * REQUIRES_VERIFICATION inside it is therefore a genuine evidence gap or the explicit
   * SDCI-determines ECA consideration (`ecaDeferral`), never a rule-activation artifact. P2b's own
   * height Finding is NOT part of this - see accessoryHeightLimitFinding below. */
  permitRequirement?: PermitRequirementFinding;
  /** Unit 6B addition - the standalone P2b zoning-height finding (domain-entities.md §3a note) -
   * an ordinary Finding, never nested inside permitRequirement, never implied by
   * permitRequirement.buildingPermit === LIKELY_EXEMPT (BR-U6B-9). */
  accessoryHeightLimitFinding?: Finding;
  /** Unit 6B addition - shed-only, undefined for garage, and undefined until the five deterministic
   * C1a/b/c/d/e-floor rules are ACTIVE. The discretionary C1e-director rule is NOT a prerequisite;
   * it gates only claims about a Director-approved alternative (2026-10-07). */
  shedLotCoverage?: ShedLotCoverageResult;
}

// ---------------------------------------------------------------------------------------------
// Unit 6B — Shed permit-requirement determination (functional-design/domain-entities.md §3a).
// ---------------------------------------------------------------------------------------------

export const BuildingPermitStatus = {
  LIKELY_EXEMPT: "LIKELY_EXEMPT",
  REQUIRED: "REQUIRED",
  REQUIRES_VERIFICATION: "REQUIRES_VERIFICATION",
} as const;
export type BuildingPermitStatus = (typeof BuildingPermitStatus)[keyof typeof BuildingPermitStatus];

export const PermitReviewPath = {
  /** Only ever paired with buildingPermit === LIKELY_EXEMPT. */
  NONE: "NONE",
  STFI_LIKELY: "STFI_LIKELY",
  FULL_REVIEW_LIKELY: "FULL_REVIEW_LIKELY",
  REQUIRES_VERIFICATION: "REQUIRES_VERIFICATION",
} as const;
export type PermitReviewPath = (typeof PermitReviewPath)[keyof typeof PermitReviewPath];

/** P2b is deliberately excluded - a separate, location-sensitive zoning Finding
 * (EvaluationOutcome.accessoryHeightLimitFinding), never part of this criterion set. P3b is also
 * deliberately excluded - an independent reviewPath disqualifier consulted directly in
 * deriveBuildingPermitState, not folded into any one criterion (2026-09-15 correction). */
export const PermitCriterionId = {
  ROOF_AREA: "ROOF_AREA", // P1
  STORY_HEIGHT: "STORY_HEIGHT", // P2a only
  FOUNDATION: "FOUNDATION", // P3a
  ATTACHMENT: "ATTACHMENT", // P4
  USE: "USE", // P5
  ECA: "ECA", // P6
  SIZE_SPAN: "SIZE_SPAN", // P7a + P7b combined
} as const;
export type PermitCriterionId = (typeof PermitCriterionId)[keyof typeof PermitCriterionId];

export const PermitCriterionStatus = {
  MET: "MET",
  NOT_MET: "NOT_MET",
  REQUIRES_VERIFICATION: "REQUIRES_VERIFICATION",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type PermitCriterionStatus = (typeof PermitCriterionStatus)[keyof typeof PermitCriterionStatus];

export interface PermitCriterionResult {
  criterionId: PermitCriterionId;
  /** USE (P5) never produces NOT_MET (BR-U6B-10) - enforced by the evaluator, not the type. */
  status: PermitCriterionStatus;
  explanationBasis: string;
}

export interface TradePermitDisclosure {
  trade: "ELECTRICAL" | "PLUMBING" | "MECHANICAL";
  explanationBasis: string;
}

/** Present only while the discretionary ECA criterion (P6) is not ACTIVE: the criterion is then
 * never evaluated (an inactive rule cannot generate a deterministic conclusion), and the
 * aggregate carries this fixed "SDCI determines" consideration instead. 2026-10-07 founder
 * decision: discretionary Tier-2 rules no longer gate deterministic value that does not depend on
 * resolving them. */
export interface DeferredEcaDetermination {
  /** True when every other screened exemption criterion (roof area, story height, foundation,
   * attachment, use) is MET - i.e. the exemption turns only on the ECA question. */
  allOtherExemptionCriteriaMet: boolean;
  /** Customer-facing statement; defined only when allOtherExemptionCriteriaMet. */
  note?: string;
}

export interface PermitRequirementFinding {
  buildingPermit: BuildingPermitStatus;
  reviewPath: PermitReviewPath;
  criteria: PermitCriterionResult[];
  tradePermitDisclosures: TradePermitDisclosure[];
  /** Absent whenever P6 is ACTIVE (the ECA criterion is then evaluated like any other). */
  ecaDeferral?: DeferredEcaDetermination;
}

// ---------------------------------------------------------------------------------------------
// Unit 6B — P2b: location-sensitive accessory-structure zoning height limit
// (functional-design/domain-entities.md §3a note, corrected 2026-09-15).
// ---------------------------------------------------------------------------------------------

export type AccessoryStructureHeightLimit =
  | { basis: "IN_REQUIRED_SETBACK"; limitFt: 12; roofMayNotExceedLimit: true }
  | { basis: "OUTSIDE_REQUIRED_SETBACK"; limitFt: 32; citation: "SMC 23.44.070" }
  | { basis: "REQUIRES_VERIFICATION"; reason: string };

// ---------------------------------------------------------------------------------------------
// Unit 6B — Estimated lot-coverage analysis (functional-design/domain-entities.md §3b/§3c,
// bounded CASE A/B/C model per the 2026-09-15 founder decision).
// ---------------------------------------------------------------------------------------------

export const CoverageExcludedEcaCategory = {
  RIPARIAN_CORRIDOR: "RIPARIAN_CORRIDOR",
  WETLAND_AND_BUFFER: "WETLAND_AND_BUFFER",
  SUBMERGED_LAND_OR_SHORELINE_SETBACK: "SUBMERGED_LAND_OR_SHORELINE_SETBACK",
  STEEP_SLOPE_NON_DISTURBANCE_AREA: "STEEP_SLOPE_NON_DISTURBANCE_AREA",
} as const;
export type CoverageExcludedEcaCategory = (typeof CoverageExcludedEcaCategory)[keyof typeof CoverageExcludedEcaCategory];

export type EcaLotAreaAdjustment =
  | { status: "NOT_APPLICABLE"; reason: string }
  | {
      status: "REQUIRES_VERIFICATION";
      /** Every named category that cannot be ruled out (today: all four - no dispositive map exists). */
      intersectingCategories: CoverageExcludedEcaCategory[];
      /** The subset a mapped layer POSITIVELY indicates (advisory INTERSECTS). An indication, never an
       * establishment - drives only whether a Director-approved alternative may be relevant. */
      mapIndicatedCategories?: CoverageExcludedEcaCategory[];
      reason: string;
    }
  | {
      status: "ESTABLISHED";
      excludedAreaSqFt: number;
      minimumCoverageFloor: { status: "NOT_APPLICABLE" } | { status: "KNOWN"; floorSqFt: 625 } | { status: "REQUIRES_VERIFICATION"; reason: string };
      basis: string;
    };

/** functional-design/domain-entities.md §3c - the two known, code-given allowance ceilings (C1a
 * 50% base, C1c/C1d 60% potential) plus the C1e floor/Director-alternative facts that feed
 * evaluateShedLotCoverage's CASE A/B/C banding. Computed server-side, never client-supplied. */
export interface LotCoverageAllowanceFacts {
  /** parcelAreaSqFt, less any ESTABLISHED C1b exclusion; raw parcelAreaSqFt when ecaAdjustment is
   * NOT_APPLICABLE. */
  adjustedLotAreaSqFt: number;
  /** Present only when ecaAdjustment.status === "ESTABLISHED" with a KNOWN minimumCoverageFloor
   * (C1e's 625 sq ft floor) - never fabricated when C1b doesn't apply. */
  c1eFloorSqFt?: 625;
  /** True when ecaAdjustment.status === "ESTABLISHED" and minimumCoverageFloor.status ===
   * "REQUIRES_VERIFICATION" - a Director-approved alternative (C1e, T2) MAY set a higher floor. */
  c1eDirectorAlternativeRelevant: boolean;
}

export interface ShedLotCoverageFacts {
  parcelAreaSqFt: number;
  existingMappedCoverageSqFt: number;
  proposedShedFootprintSqFt: number;
  ecaAdjustment: EcaLotAreaAdjustment;
  allowanceFacts: LotCoverageAllowanceFacts;
}

export type ShedLotCoverageResult =
  | { status: "WITHIN_STANDARD_ALLOWANCE"; estimatedCoverageSqFt: number; baseAllowanceSqFt: number; facts: ShedLotCoverageFacts }
  | {
      status: "REQUIRES_VERIFICATION";
      reason: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE";
      estimatedCoverageSqFt: number;
      baseAllowanceSqFt: number;
      potentialSpecialAllowanceSqFt: number;
      facts: ShedLotCoverageFacts;
    }
  | {
      status: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE";
      estimatedCoverageSqFt: number;
      potentialSpecialAllowanceSqFt: number;
      facts: ShedLotCoverageFacts;
      /** Present only when the lot-area denominator is unresolved (C1b), which is the only path on
       * which a Director-approved alternative could exist. */
      exclusionTolerance?: LotCoverageExclusionTolerance;
      parcelSpecificApprovalDisclosure?: string;
    }
  | {
      status: "REQUIRES_VERIFICATION";
      reason: "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE";
      estimatedCoverageSqFt: number;
      potentialSpecialAllowanceSqFt: number;
      facts: ShedLotCoverageFacts;
    }
  | {
      status: "REQUIRES_VERIFICATION";
      reason: "LOT_AREA_ADJUSTMENT_UNRESOLVED";
      estimatedCoverageSqFt: number;
      facts: ShedLotCoverageFacts;
      exclusionTolerance: LotCoverageExclusionTolerance;
      parcelSpecificApprovalDisclosure: string;
    };

/** How a coverage estimate relates to one threshold (50% base / 60% special) as a function of the
 * unknown excluded area X (SMC 23.44.080.B), with the 625 sq ft minimum (23.44.080.D) that applies
 * whenever an exclusion area exists. Pure arithmetic of the approved rules - claims nothing about
 * any mapped condition. */
export type LotCoverageThresholdTolerance =
  | {
      /** Within the threshold with no exclusions AND the estimate exceeds 625 sq ft: within only
       * while the excluded area stays at or below maxExcludedAreaSqFt (exact, unrounded; 0 means any
       * excluded area puts the estimate over). */
      kind: "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS";
      thresholdPercent: 50 | 60;
      maxExcludedAreaSqFt: number;
      maxExcludedPercentOfParcel: number;
    }
  | {
      /** Within the threshold with no exclusions and the estimate is at most the 625 sq ft minimum,
       * so it stays within however much area is excluded. */
      kind: "WITHIN_REGARDLESS_OF_EXCLUDED_AREA";
      thresholdPercent: 50 | 60;
      floorSqFt: 625;
    }
  | {
      /** Above the threshold with no exclusions, but at most the 625 sq ft minimum: within only if a
       * qualifying exclusion area exists (which brings the minimum into play). */
      kind: "EXCEEDS_UNLESS_EXCLUSION_AREA_EXISTS";
      thresholdPercent: 50 | 60;
      floorSqFt: 625;
    }
  | {
      /** Above the threshold with no exclusions and above 625 sq ft: excluding area can only make it worse. */
      kind: "EXCEEDS_REGARDLESS_OF_EXCLUDED_AREA";
      thresholdPercent: 50 | 60;
    };

export interface LotCoverageExclusionTolerance {
  at50: LotCoverageThresholdTolerance;
  at60: LotCoverageThresholdTolerance;
  /** Customer-facing paragraphs, generated here so the web and PDF renderings print identical text. */
  explanation: string[];
}
