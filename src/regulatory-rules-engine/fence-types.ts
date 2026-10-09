/**
 * Unit 7 (Fences) - evaluation types. See aidlc-docs/construction/unit-7-fences/functional-design.md.
 * A fence is evaluated purely from USER-DECLARED inputs plus ACTIVE rule rows; there is no spatial
 * placement and no measurement of the site, and every result says so.
 */

import type { FenceLocation, FenceWallRelation } from "../screening-request/types.js";
import type { Finding } from "./types.js";
import type { ZoningAppliedSummary } from "../zoning/resolve.js";

export interface FenceProjectDetails {
  projectType: "fence";
  heightFt: number;
  locations: FenceLocation[];
  openFeatureHeightFt?: number;
  siteSlopes: boolean;
  tallestPortionHeightFt?: number;
  wallRelation: FenceWallRelation;
  wallHeightFt?: number;
  cutWallSetbackFt?: number;
  hasMasonryOrConcreteAbove6Ft?: boolean;
}

/** The eight governance rows (functional-design.md §4). Thresholds live on each row's own
 * `ruleSpecification` - this module asserts no SMC number as a literal; an inactive or malformed
 * row simply makes its claim unavailable. */
export const FenceRuleType = {
  HEIGHT_STANDARD: "FENCE_F1_HEIGHT_LIMIT_STANDARD",
  HEIGHT_FRONT_STREET_SIDE: "FENCE_F2_HEIGHT_LIMIT_FRONT_STREET_SIDE",
  RETAINING_WALL: "FENCE_F3_RETAINING_WALL",
  OUTSIDE_REQUIRED_SETBACKS: "FENCE_F4_OUTSIDE_REQUIRED_SETBACKS",
  PERMIT_HEIGHT_EXEMPTION: "FENCE_F5_PERMIT_HEIGHT_EXEMPTION",
  PERMIT_MASONRY_CONCRETE: "FENCE_F6_PERMIT_MASONRY_CONCRETE",
  EXEMPTION_NOT_ZONING_COMPLIANCE: "FENCE_F7_EXEMPTION_NOT_ZONING_COMPLIANCE",
  PERMIT_FLOOD_PRONE_CONDITION: "FENCE_F8_PERMIT_FLOOD_PRONE_CONDITION",
} as const;
export type FenceRuleType = (typeof FenceRuleType)[keyof typeof FenceRuleType];

export interface FenceHeightStandardRuleSpec {
  ruleType: typeof FenceRuleType.HEIGHT_STANDARD;
  maxFt: number;
  openFeatureAllowanceFt: number;
  absoluteMaxFt: number;
}
export interface FenceHeightFrontStreetSideRuleSpec {
  ruleType: typeof FenceRuleType.HEIGHT_FRONT_STREET_SIDE;
  maxFt: number;
  absoluteMaxFt: number;
}
export interface FenceRetainingWallRuleSpec {
  ruleType: typeof FenceRuleType.RETAINING_WALL;
  /** The cap on a fence standing on a retaining wall or bulkhead; absent where the zone has none (only the combined height applies). */
  fenceOnWallMaxFt?: number;
  combinedMaxFt: number;
  raisingGradeWallMaxFt: number;
  cutWallFenceSetbackFt: number;
}
export interface FenceOutsideSetbacksRuleSpec {
  ruleType: typeof FenceRuleType.OUTSIDE_REQUIRED_SETBACKS;
  generalStructureHeightLimitFt: number;
}
export interface FencePermitHeightRuleSpec {
  ruleType: typeof FenceRuleType.PERMIT_HEIGHT_EXEMPTION;
  maxFt: number;
}
export interface FencePermitMasonryRuleSpec {
  ruleType: typeof FenceRuleType.PERMIT_MASONRY_CONCRETE;
  elementsAboveFt: number;
}

export const FencePermitCriterionId = {
  HEIGHT: "HEIGHT",
  MASONRY_CONCRETE: "MASONRY_CONCRETE",
  FLOOD_PRONE: "FLOOD_PRONE",
} as const;
export type FencePermitCriterionId = (typeof FencePermitCriterionId)[keyof typeof FencePermitCriterionId];

export interface FencePermitCriterionResult {
  criterionId: FencePermitCriterionId;
  status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION";
  explanationBasis: string;
}

export interface FencePermitRequirement {
  /** There is deliberately no LIKELY_EXEMPT: flood-prone status (SDCI's permit condition) cannot be
   * determined from available mapping, so a fence that meets every other criterion is
   * REQUIRES_VERIFICATION - the same discipline as Unit 6B Capability B. */
  buildingPermit: "REQUIRED" | "REQUIRES_VERIFICATION";
  criteria: FencePermitCriterionResult[];
  /** True when HEIGHT and MASONRY_CONCRETE are both MET, so the result turns only on flood-prone status. */
  turnsOnlyOnFloodProneStatus: boolean;
  /** Defined only when turnsOnlyOnFloodProneStatus. */
  note?: string;
  /** Defined only when turnsOnlyOnFloodProneStatus (exemption is not zoning compliance). */
  exemptionDisclaimer?: string;
  /** Defined only when buildingPermit is REQUIRED: SDCI's attributed statement about the permit path. */
  permitPathNote?: string;
  /** Fixed, never-evaluated items. */
  disclosures: string[];
}

export interface FenceDeclaredInput {
  label: string;
  value: string;
}

export interface FenceEvaluationOutcome {
  /** Ordinary findings (height by location, wall, sight distance); flow through Report Explanation
   * like every other finding. */
  findings: Finding[];
  /** Evidence only - never a Finding, so it cannot reach the explanation model. Undefined while the
   * rules its claims depend on are not ACTIVE. */
  permitRequirement?: FencePermitRequirement;
  declaredInputs: FenceDeclaredInput[];
  /** Claims that could not be made because a rule they depend on is not ACTIVE (or is malformed). */
  uncoveredConstraintTypes: string[];
  /** Citywide zoning coverage: the zoning this evaluation applied; absent when the caller supplied no zoning. */
  zoningApplied?: ZoningAppliedSummary;
}
