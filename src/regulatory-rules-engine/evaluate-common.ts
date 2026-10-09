/**
 * Helpers shared by every shed/garage evaluator (the NR evaluators in evaluate.ts and the multifamily accessory evaluators):
 * the screening-tolerance comparison, the evidence-quality gate, and the standard "cannot evaluate" finding.
 */

import { EvidenceQuality } from "../regulatory-rule-governance/types.js";
import type { InferencePolicy, RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { ComplianceOutcome, FindingClassification, GENERAL_LOCATION_ONLY_SETBACK_POLICY_SUBJECT } from "./types.js";
import type { Finding, ProjectDetails } from "./types.js";

/**
 * Screening tolerance for distances measured from county parcel mapping (not a survey). Optional on a spec: when present, a
 * distance within this many feet of a threshold is REQUIRES_VERIFICATION and only a distance clearly beyond it is a definite
 * PASS or FAIL. Absent => the original exact comparison (the staging fixtures and their tests rely on that).
 */
export type MappingTolerance = { mappingToleranceFt?: number };

/** Where a mapped distance lies against a minimum, given a screening tolerance. */
export function againstMinimum(distanceFt: number, minimumFt: number, toleranceFt: number): "CLEARS" | "SHORT" | "NEAR" {
  if (distanceFt >= minimumFt + toleranceFt) return "CLEARS";
  if (distanceFt < minimumFt - toleranceFt) return "SHORT";
  return "NEAR";
}
export const NOT_A_SURVEY = "Distances are measured from county parcel mapping, which is not a survey.";

export function classifySpatialFinding(input: {
  rule: RegulatoryRule;
  appliedRule: Finding["appliedRule"];
  subject: string;
  pass: boolean;
  spatialEvidenceQuality: ProjectDetails["spatialEvidenceQuality"];
  activePolicies: InferencePolicy[];
  supportingEvidence: string[];
  explanationBasis: string;
}): Finding {
  const { rule, appliedRule, subject, pass, spatialEvidenceQuality, activePolicies, supportingEvidence, explanationBasis } = input;

  const requiresGate = spatialEvidenceQuality !== undefined && spatialEvidenceQuality !== EvidenceQuality.AUTHORITATIVE;
  const ruleAcceptsThisQuality = requiresGate && rule.acceptedEvidenceQuality.includes(spatialEvidenceQuality);

  if (!requiresGate || ruleAcceptsThisQuality) {
    return {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: pass ? ComplianceOutcome.PASS : ComplianceOutcome.FAIL,
      appliedRule,
      supportingEvidence,
      explanationBasis,
    };
  }

  const matchingPolicy = activePolicies.find((p) => p.subject === GENERAL_LOCATION_ONLY_SETBACK_POLICY_SUBJECT);
  if (matchingPolicy) {
    return {
      classification: FindingClassification.INFERRED,
      subject,
      appliedRule,
      appliedInferencePolicy: {
        id: matchingPolicy.id,
        subject: matchingPolicy.subject,
        derivationMethod: matchingPolicy.derivationMethod,
        version: matchingPolicy.version,
      },
      supportingEvidence: [...supportingEvidence, `InferencePolicy(${matchingPolicy.id})`],
      explanationBasis: `${explanationBasis} Derived despite ${spatialEvidenceQuality} evidence quality via approved InferencePolicy "${matchingPolicy.subject}" (${matchingPolicy.derivationMethod}, v${matchingPolicy.version}).`,
    };
  }

  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule,
    supportingEvidence,
    explanationBasis: `${explanationBasis} However, this rule has not been governance-approved to rely on ${spatialEvidenceQuality} evidence, and no approved InferencePolicy covers it - REQUIRES_VERIFICATION rather than an unsupported KNOWN determination.`,
  };
}

export function missingEvidenceFinding(subject: string, appliedRule: Finding["appliedRule"], reason: string): Finding {
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule,
    supportingEvidence: [],
    explanationBasis: `Cannot evaluate: ${reason}`,
  };
}

/** Founder-caught presentation gap (2026-09-17) - PostGIS's ST_Distance returns full
 * floating-point precision (e.g. 43.60679091361771), which every setback/dwelling-separation
 * explanationBasis string below previously interpolated verbatim into customer-facing prose. The
 * underlying PASS/FAIL comparison (project.distanceToXFt >= spec.xFt) still uses the full-precision
 * value, unrounded - only the DISPLAYED text is rounded, to the nearest 0.1ft, never affecting the
 * actual compliance determination. */
export function roundToTenthFt(distanceFt: number): number {
  return Math.round(distanceFt * 10) / 10;
}

