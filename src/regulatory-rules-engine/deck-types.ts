/**
 * Unit 8 (Decks) - evaluation types. See aidlc-docs/construction/unit-8-decks/functional-design.md.
 * Declared-input evaluation: no placement, no measurement of the site; every result says so.
 */

import type { DeckAttachment, DeckBuildingRelation, DeckSetbackLocation } from "../screening-request/types.js";
import type { Finding } from "./types.js";
import type { ZoningAppliedSummary } from "../zoning/resolve.js";

export interface DeckProjectDetails {
  projectType: "deck";
  heightAboveGradeIn: number;
  widthFt: number;
  depthFt: number;
  attachment: DeckAttachment;
  buildingRelation: DeckBuildingRelation;
  setbackLocations: DeckSetbackLocation[];
  solidFlooring?: boolean;
  longestBeamFt?: number;
  distanceFromRearLotLineFt?: number;
  distanceFromDwellingFt?: number;
}

/** The six governance rows (functional-design.md §4). Thresholds live on each row's own
 * `ruleSpecification`; an inactive or malformed row makes its claim unavailable. */
export const DeckRuleType = {
  SETBACK_HEIGHT_ALLOWANCE: "DECK_D1_SETBACK_HEIGHT_ALLOWANCE",
  LOT_COVERAGE_THRESHOLD: "DECK_D2_LOT_COVERAGE_THRESHOLD",
  PERMIT_EXEMPTION: "DECK_D3_PERMIT_EXEMPTION",
  STFI_ELIGIBILITY: "DECK_D4_STFI_ELIGIBILITY",
  ECA_CONDITION: "DECK_D5_ECA_CONDITION",
  EXEMPTION_NOT_ZONING_COMPLIANCE: "DECK_D6_EXEMPTION_NOT_ZONING_COMPLIANCE",
  /** Multifamily zones (SMC Chapter 23.45) have no lot-coverage percentage limit; this row states that, in place of D2. */
  NO_LOT_COVERAGE_LIMIT: "DECK_MF_NO_LOT_COVERAGE_LIMIT",
} as const;
export type DeckRuleType = (typeof DeckRuleType)[keyof typeof DeckRuleType];

export interface DeckSetbackHeightAllowanceRuleSpec {
  ruleType: typeof DeckRuleType.SETBACK_HEIGHT_ALLOWANCE;
  /** SMC 23.44.090.H.1 - structures up to this height above grade are allowed in any required setback. */
  allowedInSetbackMaxIn: number;
  /** SMC 23.44.090.H.8 - the rear-setback allowance for unenclosed structures. Present only where the zone has such an allowance (Neighborhood Residential). */
  rearSetbackAllowance?: { minDistanceFromRearLotLineFt: number; maxHeightFt: number; minSeparationFromDwellingFt: number };
  /** Customer-facing citation text for the allowance above (default: the Neighborhood Residential section, "SMC 23.44.090.H.1"). */
  allowanceCitation?: string;
  /** Customer-facing statement of where such structures are limited (default: "SMC 23.44.090.H"). */
  limitCitation?: string;
  /** The further allowances a deck above the automatic height could use, in this zone, stated for the not-determined case (default: the Neighborhood Residential text). */
  furtherAllowancesText?: string;
}
export interface DeckNoLotCoverageLimitRuleSpec {
  ruleType: typeof DeckRuleType.NO_LOT_COVERAGE_LIMIT;
  /** Customer-facing statement, with its citation, that the zone has no lot-coverage percentage limit and that a deck is not floor area. */
  statement: string;
}
export interface DeckLotCoverageThresholdRuleSpec {
  ruleType: typeof DeckRuleType.LOT_COVERAGE_THRESHOLD;
  notCountedMaxHeightIn: number;
}
export interface DeckPermitExemptionRuleSpec {
  ruleType: typeof DeckRuleType.PERMIT_EXEMPTION;
  maxHeightIn: number;
}
export interface DeckStfiEligibilityRuleSpec {
  ruleType: typeof DeckRuleType.STFI_ELIGIBILITY;
  maxHeightAboveGroundFt: number;
  /** A beam this long or longer disqualifies the subject-to-field-inspection path. */
  beamLengthDisqualifyingFt: number;
  maxAreaSqFt: number;
}

export const DeckPermitCriterionId = {
  HEIGHT: "HEIGHT",
  STRUCTURE_BELOW: "STRUCTURE_BELOW",
  ECA: "ECA",
} as const;
export type DeckPermitCriterionId = (typeof DeckPermitCriterionId)[keyof typeof DeckPermitCriterionId];

export interface DeckPermitCriterionResult {
  criterionId: DeckPermitCriterionId;
  status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION";
  explanationBasis: string;
}

/** There is deliberately no STFI_LIKELY: SDCI lists an ECA as a full-review trigger and ECA status can
 * never be determined from available mapping, so a deck with no known full-review trigger stays
 * REQUIRES_VERIFICATION (reviewer decision fb0ec2e9-c780-4a86-846f-326ed2d73620). */
export const DeckReviewPath = {
  FULL_REVIEW_LIKELY: "FULL_REVIEW_LIKELY",
  REQUIRES_VERIFICATION: "REQUIRES_VERIFICATION",
} as const;
export type DeckReviewPath = (typeof DeckReviewPath)[keyof typeof DeckReviewPath];

export interface DeckPermitRequirement {
  /** There is deliberately no LIKELY_EXEMPT: ECA status (which SDCI says requires a permit and a
   * pre-application site visit) cannot be determined from available mapping. */
  buildingPermit: "REQUIRED" | "REQUIRES_VERIFICATION";
  criteria: DeckPermitCriterionResult[];
  /** Only when buildingPermit is REQUIRED and the STFI rule is ACTIVE. */
  reviewPath?: DeckReviewPath;
  /** Plain-language reasons behind the review path (each states what drives it). */
  reviewPathReasons?: string[];
  turnsOnlyOnEcaStatus: boolean;
  /** Defined only when turnsOnlyOnEcaStatus. */
  note?: string;
  exemptionDisclaimer?: string;
  disclosures: string[];
}

export interface DeckDeclaredInput {
  label: string;
  value: string;
}

export interface DeckEvaluationOutcome {
  findings: Finding[];
  /** Evidence only - never a Finding, so it cannot reach the explanation model. */
  permitRequirement?: DeckPermitRequirement;
  declaredInputs: DeckDeclaredInput[];
  uncoveredConstraintTypes: string[];
  /** Citywide zoning coverage: the zoning this evaluation applied; absent when the caller supplied no zoning. */
  zoningApplied?: ZoningAppliedSummary;
}
