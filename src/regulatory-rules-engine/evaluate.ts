/**
 * Workflow 4: Regulatory Rule Evaluation for a Shed Project - BR-4, BR-4a (business-rules.md).
 * The unit's central deterministic workflow. Pure function: given a PropertyContext (assembled
 * only for a CONFIRMED parcel - see property-intelligence/assemble.ts's type-level precondition),
 * ShedProjectDetails, spatial results, and the currently ACTIVE rule set, produce an
 * EvaluationOutcome. No I/O - fully deterministic and testable.
 */

import type { PropertyContext } from "../property-intelligence/types.js";
import { AvailabilityState, getFact } from "../property-intelligence/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import { EvidenceQuality, LifecycleState } from "../regulatory-rule-governance/types.js";
import type { InferencePolicy, RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { deriveEcaRegulatoryImplication } from "./eca-implication.js";
import {
  ComplianceOutcome,
  EvaluationStatus,
  FindingClassification,
  GENERAL_LOCATION_ONLY_SETBACK_POLICY_SUBJECT,
} from "./types.js";
import type { EvaluationOutcome, Finding, ShedProjectDetails } from "./types.js";

export interface RearSetbackRuleSpec {
  ruleType: "REAR_SETBACK";
  minFt: number;
  minFtIfAlleyAdjacent: number;
}
export interface HeightRuleSpec {
  ruleType: "HEIGHT_LIMIT";
  maxFt: number;
}
export interface DwellingSeparationRuleSpec {
  ruleType: "DWELLING_SEPARATION";
  minFt: number;
}
export interface SideFrontSetbackRuleSpec {
  ruleType: "SIDE_FRONT_SETBACK_STANDARD";
  sideAverageFt: number;
  sideMinFt: number;
  frontFt: number;
}

/** A rule type whose evaluation is genuinely ambiguous and requires an approved InferencePolicy
 * to resolve (BR-4's governed-inference requirement) - e.g. "which zone applies when the parcel
 * straddles a zoning boundary." Not exercised by the real shed rule set (which has no such
 * ambiguity), but a real, evaluable rule type demonstrating the invariant end-to-end. */
export interface RequiresInferencePolicyRuleSpec {
  ruleType: "REQUIRES_INFERENCE_POLICY";
  situationKey: string;
}

export interface EvaluateProjectInput {
  propertyContext: PropertyContext;
  project: ShedProjectDetails;
  /** Only rules whose lifecycleState is ACTIVE are consumed - anything else is ignored and
   * logged, never evaluated (BR-7's one-way-publication invariant, enforced here defensively
   * even though callers are expected to have already filtered to ACTIVE). */
  candidateActiveRules: RegulatoryRule[];
  ecaFindings: CriticalAreaFinding[];
  /** Only policies whose lifecycleState is ACTIVE may back an INFERRED finding (BR-4). */
  candidateActiveInferencePolicies: InferencePolicy[];
}

export function evaluateProject(input: EvaluateProjectInput): EvaluationOutcome {
  const activeRules = input.candidateActiveRules.filter((r) => r.lifecycleState === LifecycleState.ACTIVE);
  const activePolicies = input.candidateActiveInferencePolicies.filter((p) => p.lifecycleState === LifecycleState.ACTIVE);

  // Indispensable-input check (BR-3.5 / Workflow 6): if the parcel geometry itself is
  // unavailable, no meaningful evaluation can be produced at all.
  const rearSetbackFact = getFact(input.propertyContext, "parcel-geometry-available");
  if (rearSetbackFact?.availabilityState === AvailabilityState.SOURCE_ERROR || rearSetbackFact?.availabilityState === AvailabilityState.UNAVAILABLE) {
    return {
      status: EvaluationStatus.DEFERRED,
      findings: [],
      deferralReason: "Parcel geometry unavailable - no spatial rule can be evaluated for this property.",
    };
  }

  const findings: Finding[] = [];

  for (const rule of activeRules) {
    findings.push(...evaluateRule(rule, input.project, activePolicies));
  }

  for (const ecaFinding of input.ecaFindings) {
    const implication = deriveEcaRegulatoryImplication(ecaFinding);
    const subject = `Critical area: ${ecaFinding.hazardType}`;
    const supportingEvidence = [`CriticalAreaFinding(${ecaFinding.hazardType})`];
    switch (implication.classification) {
      case FindingClassification.KNOWN:
        findings.push({ classification: FindingClassification.KNOWN, subject, supportingEvidence, explanationBasis: implication.reason });
        break;
      case FindingClassification.REQUIRES_VERIFICATION:
        findings.push({ classification: FindingClassification.REQUIRES_VERIFICATION, subject, supportingEvidence, explanationBasis: implication.reason });
        break;
    }
  }

  return { status: EvaluationStatus.COMPLETE, findings };
}

function evaluateRule(rule: RegulatoryRule, project: ShedProjectDetails, activePolicies: InferencePolicy[]): Finding[] {
  const spec = rule.ruleSpecification as { ruleType?: string };
  const appliedRule = { id: rule.id, subject: rule.subject, citation: rule.citation };

  switch (spec.ruleType) {
    case "REAR_SETBACK":
      return [evaluateRearSetback(rule, appliedRule, spec as unknown as RearSetbackRuleSpec, project, activePolicies)];
    case "HEIGHT_LIMIT":
      return [evaluateHeight(rule, appliedRule, spec as unknown as HeightRuleSpec, project)];
    case "DWELLING_SEPARATION":
      return [evaluateDwellingSeparation(rule, appliedRule, spec as unknown as DwellingSeparationRuleSpec, project)];
    case "SIDE_FRONT_SETBACK_STANDARD":
      return evaluateSideFrontSetback(rule, appliedRule, spec as unknown as SideFrontSetbackRuleSpec, project, activePolicies);
    case "REQUIRES_INFERENCE_POLICY":
      return [
        evaluateWithInferencePolicy(rule, appliedRule, spec as unknown as RequiresInferencePolicyRuleSpec, activePolicies),
      ];
    default:
      return [
        {
          classification: FindingClassification.REQUIRES_VERIFICATION,
          subject: rule.subject,
          appliedRule,
          supportingEvidence: [],
          explanationBasis: `Rule specification type "${String(spec.ruleType)}" is not recognized by this evaluator.`,
        },
      ];
  }
}

function evaluateRearSetback(
  rule: RegulatoryRule,
  appliedRule: Finding["appliedRule"],
  spec: RearSetbackRuleSpec,
  project: ShedProjectDetails,
  activePolicies: InferencePolicy[]
): Finding {
  if (project.distanceToRearLotLineFt === undefined) {
    return missingEvidenceFinding(rule.subject, appliedRule, "distanceToRearLotLineFt is not available.");
  }
  const required = project.alleyAdjacent ? spec.minFtIfAlleyAdjacent : spec.minFt;
  const pass = project.distanceToRearLotLineFt >= required;
  return classifySpatialFinding({
    rule,
    appliedRule,
    subject: rule.subject,
    pass,
    spatialEvidenceQuality: project.spatialEvidenceQuality,
    activePolicies,
    supportingEvidence: [`distanceToRearLotLineFt=${project.distanceToRearLotLineFt}`, `alleyAdjacent=${project.alleyAdjacent}`],
    explanationBasis: `Rear setback ${project.distanceToRearLotLineFt}ft ${pass ? "meets" : "does not meet"} the required ${required}ft (${project.alleyAdjacent ? "alley-adjacent" : "standard"}).`,
  });
}

function evaluateHeight(
  rule: RegulatoryRule,
  appliedRule: Finding["appliedRule"],
  spec: HeightRuleSpec,
  project: ShedProjectDetails
): Finding {
  const pass = project.heightFt <= spec.maxFt;
  return {
    classification: FindingClassification.KNOWN,
    subject: rule.subject,
    complianceOutcome: pass ? ComplianceOutcome.PASS : ComplianceOutcome.FAIL,
    appliedRule,
    supportingEvidence: [`heightFt=${project.heightFt}`],
    explanationBasis: `Height ${project.heightFt}ft ${pass ? "meets" : "exceeds"} the ${spec.maxFt}ft limit.`,
  };
}

function evaluateDwellingSeparation(
  rule: RegulatoryRule,
  appliedRule: Finding["appliedRule"],
  spec: DwellingSeparationRuleSpec,
  project: ShedProjectDetails
): Finding {
  if (project.distanceToDwellingFt === undefined) {
    return missingEvidenceFinding(rule.subject, appliedRule, "distanceToDwellingFt is not available.");
  }
  const pass = project.distanceToDwellingFt >= spec.minFt;
  return {
    classification: FindingClassification.KNOWN,
    subject: rule.subject,
    complianceOutcome: pass ? ComplianceOutcome.PASS : ComplianceOutcome.FAIL,
    appliedRule,
    supportingEvidence: [`distanceToDwellingFt=${project.distanceToDwellingFt}`],
    explanationBasis: `Dwelling separation ${project.distanceToDwellingFt}ft ${pass ? "meets" : "does not meet"} the required ${spec.minFt}ft.`,
  };
}

function evaluateSideFrontSetback(
  rule: RegulatoryRule,
  appliedRule: Finding["appliedRule"],
  spec: SideFrontSetbackRuleSpec,
  project: ShedProjectDetails,
  activePolicies: InferencePolicy[]
): Finding[] {
  const findings: Finding[] = [];

  if (project.distanceToSideLotLineFt === undefined) {
    findings.push(missingEvidenceFinding(`${rule.subject} (side)`, appliedRule, "distanceToSideLotLineFt is not available."));
  } else {
    const pass = project.distanceToSideLotLineFt >= spec.sideMinFt;
    findings.push(
      classifySpatialFinding({
        rule,
        appliedRule,
        subject: `${rule.subject} (side)`,
        pass,
        spatialEvidenceQuality: project.spatialEvidenceQuality,
        activePolicies,
        supportingEvidence: [`distanceToSideLotLineFt=${project.distanceToSideLotLineFt}`],
        explanationBasis: `Side setback ${project.distanceToSideLotLineFt}ft ${pass ? "meets" : "does not meet"} the ${spec.sideMinFt}ft minimum (no reduced-setback exception applies to accessory structures in the side yard).`,
      })
    );
  }

  if (project.distanceToFrontLotLineFt === undefined) {
    findings.push(missingEvidenceFinding(`${rule.subject} (front)`, appliedRule, "distanceToFrontLotLineFt is not available."));
  } else {
    const pass = project.distanceToFrontLotLineFt >= spec.frontFt;
    findings.push(
      classifySpatialFinding({
        rule,
        appliedRule,
        subject: `${rule.subject} (front)`,
        pass,
        spatialEvidenceQuality: project.spatialEvidenceQuality,
        activePolicies,
        supportingEvidence: [`distanceToFrontLotLineFt=${project.distanceToFrontLotLineFt}`],
        explanationBasis: `Front setback ${project.distanceToFrontLotLineFt}ft ${pass ? "meets" : "does not meet"} the ${spec.frontFt}ft minimum.`,
      })
    );
  }

  return findings;
}

/**
 * BR-U2-10: evidence quality gates KNOWN classification for spatial findings. A finding whose
 * determination materially depends on a GENERAL_LOCATION_ONLY-sourced spatial measurement may be
 * KNOWN only if the applied ACTIVE rule's governed `acceptedEvidenceQuality` explicitly includes
 * that level (a human decision recorded at rule-approval time, never decided here at runtime).
 * Otherwise: INFERRED if an ACTIVE InferencePolicy exists for the fixed
 * GENERAL_LOCATION_ONLY_SETBACK_EVIDENCE situation (the same governed-InferencePolicy-or-nothing
 * discipline evaluateWithInferencePolicy already applies); otherwise REQUIRES_VERIFICATION. A
 * rule silent on acceptedEvidenceQuality is treated as NOT accepting GENERAL_LOCATION_ONLY - the
 * safe default is REQUIRES_VERIFICATION, never KNOWN-by-omission.
 */
function classifySpatialFinding(input: {
  rule: RegulatoryRule;
  appliedRule: Finding["appliedRule"];
  subject: string;
  pass: boolean;
  spatialEvidenceQuality: ShedProjectDetails["spatialEvidenceQuality"];
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

/**
 * BR-4's governed-inference requirement: an INFERRED finding may only be produced when a
 * matching approved InferencePolicy exists. The Engine never invents a derivation method - if
 * no policy matches `situationKey`, the result falls through to REQUIRES_VERIFICATION.
 */
function evaluateWithInferencePolicy(
  rule: RegulatoryRule,
  appliedRule: Finding["appliedRule"],
  spec: RequiresInferencePolicyRuleSpec,
  activePolicies: InferencePolicy[]
): Finding {
  const matchingPolicy = activePolicies.find((p) => p.subject === spec.situationKey);

  if (!matchingPolicy) {
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: rule.subject,
      appliedRule,
      supportingEvidence: [],
      explanationBasis: `No approved InferencePolicy exists for situation "${spec.situationKey}"; the Engine does not invent a derivation method.`,
    };
  }

  return {
    classification: FindingClassification.INFERRED,
    subject: rule.subject,
    appliedRule,
    appliedInferencePolicy: {
      id: matchingPolicy.id,
      subject: matchingPolicy.subject,
      derivationMethod: matchingPolicy.derivationMethod,
      version: matchingPolicy.version,
    },
    supportingEvidence: [`InferencePolicy(${matchingPolicy.id})`],
    explanationBasis: `Derived via approved InferencePolicy "${matchingPolicy.subject}" (${matchingPolicy.derivationMethod}, v${matchingPolicy.version}).`,
  };
}

function missingEvidenceFinding(subject: string, appliedRule: Finding["appliedRule"], reason: string): Finding {
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule,
    supportingEvidence: [],
    explanationBasis: `Cannot evaluate: ${reason}`,
  };
}
