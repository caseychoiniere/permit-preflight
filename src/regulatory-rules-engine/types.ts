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
}
