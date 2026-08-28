/**
 * Regulatory Rules Engine / Evaluation domain types (domain-entities.md). The Regulatory Rules
 * Engine is the SOLE place KNOWN / INFERRED / REQUIRES_VERIFICATION is assigned - enforced here
 * by construction: Finding.classification is only ever produced by evaluate.ts in this package,
 * never by property-intelligence/ or spatial-analysis/.
 */

import type { EvidenceQuality, RegulatoryRule } from "../regulatory-rule-governance/types.js";
import type { InferencePolicy } from "../regulatory-rule-governance/types.js";

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
}
