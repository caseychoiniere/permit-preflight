/**
 * Workflow 4: Regulatory Rule Evaluation for a Project - BR-4, BR-4a (business-rules.md).
 * The unit's central deterministic workflow. Pure function: given a PropertyContext (assembled
 * only for a CONFIRMED parcel - see property-intelligence/assemble.ts's type-level precondition),
 * ProjectDetails (shed or, since Unit 4, garage - BR-U4-2), spatial results, and the currently
 * ACTIVE rule set, produce an EvaluationOutcome. No I/O - fully deterministic and testable.
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
import type { EvaluationOutcome, Finding, GarageProjectDetails, LotCoverageFacts, ProjectDetails, ShedProjectDetails } from "./types.js";

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

/** Unit 4 - net-new ruleType (no lot-coverage evaluator existed for any project type before this
 * unit). No numeric threshold lives on the spec itself - the percentage/floor/denominator logic
 * is computed server-side into LotCoverageFacts (BR-U4-7); this spec's role is to exist as the
 * ACTIVE governance artifact naming which SMC 23.44.080 provision (L1-L6) a finding cites. */
export interface LotCoverageRuleSpec {
  ruleType: "LOT_COVERAGE";
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
  project: ProjectDetails;
  /** Only rules whose lifecycleState is ACTIVE are consumed - anything else is ignored and
   * logged, never evaluated (BR-7's one-way-publication invariant, enforced here defensively
   * even though callers are expected to have already filtered to ACTIVE). */
  candidateActiveRules: RegulatoryRule[];
  ecaFindings: CriticalAreaFinding[];
  /** Only policies whose lifecycleState is ACTIVE may back an INFERRED finding (BR-4). */
  candidateActiveInferencePolicies: InferencePolicy[];
  /** Unit 4 - required only when project.projectType === "garage" and a LOT_COVERAGE rule is
   * ACTIVE; assembled server-side (business-rules.md BR-U4-8), never client-supplied. Absent for
   * shed evaluations (unused) and safe to omit for garage evaluations too - a LOT_COVERAGE rule
   * evaluated without it simply produces REQUIRES_VERIFICATION rather than throwing. */
  lotCoverageFacts?: LotCoverageFacts;
}

/** BR-U4-2's exhaustiveness requirement, exercised at a real decision point (not decorative): the
 * constraint types a given project type is expected to have ACTIVE rule coverage for
 * (business-rules.md BR-U4-5). A future third ProjectType without an entry here is a compile-time
 * error via the `never` branch below. */
function expectedConstraintTypesFor(projectType: ProjectDetails["projectType"]): { constraintType: string; ruleTypes: string[] }[] {
  switch (projectType) {
    case "shed":
      // BR-U4-5 is a failure mode this unit (Unit 4) introduces for a newly-supported project
      // type with no ACTIVE coverage yet - shed has had ACTIVE coverage since Unit 1 and is not
      // retroactively subject to this disclosure.
      return [];
    case "garage":
      return [
        { constraintType: "setback", ruleTypes: ["REAR_SETBACK", "SIDE_FRONT_SETBACK_STANDARD"] },
        { constraintType: "height", ruleTypes: ["HEIGHT_LIMIT"] },
        { constraintType: "lot coverage", ruleTypes: ["LOT_COVERAGE"] },
      ];
    default: {
      const exhaustiveCheck: never = projectType;
      throw new Error(`Unhandled ProjectType "${String(exhaustiveCheck)}" in expectedConstraintTypesFor.`);
    }
  }
}

function computeUncoveredConstraintTypes(projectType: ProjectDetails["projectType"], activeRules: RegulatoryRule[]): string[] {
  const activeRuleTypes = new Set(activeRules.map((r) => (r.ruleSpecification as { ruleType?: string }).ruleType));
  return expectedConstraintTypesFor(projectType)
    .filter(({ ruleTypes }) => !ruleTypes.some((rt) => activeRuleTypes.has(rt)))
    .map(({ constraintType }) => constraintType);
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
      uncoveredConstraintTypes: [],
    };
  }

  const findings: Finding[] = [];

  for (const rule of activeRules) {
    findings.push(...evaluateRule(rule, input.project, activePolicies, input.lotCoverageFacts));
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

  return {
    status: EvaluationStatus.COMPLETE,
    findings,
    uncoveredConstraintTypes: computeUncoveredConstraintTypes(input.project.projectType, activeRules),
  };
}

function evaluateRule(rule: RegulatoryRule, project: ProjectDetails, activePolicies: InferencePolicy[], lotCoverageFacts?: LotCoverageFacts): Finding[] {
  const spec = rule.ruleSpecification as { ruleType?: string };
  const appliedRule = { id: rule.id, subject: rule.subject, citation: rule.citation };

  switch (spec.ruleType) {
    case "REAR_SETBACK":
      return [evaluateRearSetback(rule, appliedRule, spec as unknown as RearSetbackRuleSpec, project, activePolicies)];
    case "HEIGHT_LIMIT":
      return [evaluateHeight(rule, appliedRule, spec as unknown as HeightRuleSpec, project)];
    case "DWELLING_SEPARATION":
      // Shed-only (SRE-GARAGE-1's scope is setback/height/lot-coverage; a garage has no
      // distanceToDwellingFt fact at all - domain-entities.md). Guarded here, not just by type,
      // since RegulatoryRule.ruleSpecification is untrusted-at-runtime JSON - a real garage rule
      // could never legitimately carry this ruleType, but the evaluator fails closed either way.
      if (project.projectType !== "shed") {
        return [missingEvidenceFinding(rule.subject, appliedRule, `DWELLING_SEPARATION does not apply to project type "${project.projectType}".`)];
      }
      return [evaluateDwellingSeparation(rule, appliedRule, spec as unknown as DwellingSeparationRuleSpec, project)];
    case "SIDE_FRONT_SETBACK_STANDARD":
      return evaluateSideFrontSetback(rule, appliedRule, spec as unknown as SideFrontSetbackRuleSpec, project, activePolicies);
    case "LOT_COVERAGE":
      // Garage-only (Unit 4). Fails closed to REQUIRES_VERIFICATION - never a KNOWN pass/fail -
      // whenever the project type is wrong or LotCoverageFacts weren't supplied, rather than
      // letting a generic numeric helper produce an incorrect result.
      if (project.projectType !== "garage") {
        return [missingEvidenceFinding(rule.subject, appliedRule, `LOT_COVERAGE does not apply to project type "${project.projectType}".`)];
      }
      if (!lotCoverageFacts) {
        return [missingEvidenceFinding(rule.subject, appliedRule, "LotCoverageFacts were not supplied for this evaluation.")];
      }
      return [evaluateLotCoverage(rule, appliedRule, spec as unknown as LotCoverageRuleSpec, project, lotCoverageFacts)];
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
  project: ProjectDetails,
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
  project: ProjectDetails
): Finding {
  // NOTE (Unit 4): this simple heightFt<=maxFt comparison is correct for the shed HEIGHT_LIMIT
  // rule this project has today. It does NOT yet model H1/H2's real roof-form/setback-siting
  // envelope nuance (garage-rule-inventory-and-tier-triage.md) - that content only needs to exist
  // once a real garage HEIGHT_LIMIT candidate reaches TRIAGED with an actual specification, which
  // is itself gated behind the deferred professional review (BR-U4-4). Revisit this comparison
  // when that candidate's real ruleSpecification shape is defined, not before.
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
  project: ProjectDetails,
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
 * Unit 4 - net-new (garage-rule-inventory-and-tier-triage.md's L1-L6). Always produces
 * REQUIRES_VERIFICATION today, never KNOWN - `existingStructuresCountableFootprintSqFt` is
 * USER_SUPPLIED and unverified by construction (business-rules.md BR-U4-3), so the combined
 * figure can never be authoritative regardless of how the denominator/percentage/floor resolve.
 * Both branches below still exist because they produce materially different, more useful
 * explanations - "we don't know the SMC-applicable allowed coverage" vs. "we know it, but the
 * existing-structures input is still unverified" - matching BR-4's explanation-quality bar.
 */
function evaluateLotCoverage(
  rule: RegulatoryRule,
  appliedRule: Finding["appliedRule"],
  _spec: LotCoverageRuleSpec,
  _project: GarageProjectDetails,
  facts: LotCoverageFacts
): Finding {
  const supportingEvidence = [`proposedGarageCountableFootprintSqFt=${facts.proposedGarageCountableFootprintSqFt}`];

  if (facts.existingStructuresCountableFootprintSqFt === undefined) {
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: rule.subject,
      appliedRule,
      supportingEvidence,
      explanationBasis:
        "Existing-structures countable footprint was not supplied. This figure is always self-reported and unverified (business-rules.md BR-U4-3), so the combined lot-coverage finding cannot reach a KNOWN determination even once supplied - but it is required as an input before any comparison can be made at all.",
    };
  }
  supportingEvidence.push(`existingStructuresCountableFootprintSqFt=${facts.existingStructuresCountableFootprintSqFt}`);
  const combinedNumeratorSqFt = facts.proposedGarageCountableFootprintSqFt + facts.existingStructuresCountableFootprintSqFt;
  supportingEvidence.push(`combinedNumeratorSqFt=${combinedNumeratorSqFt}`);

  if (facts.allowedCoverageSqFt === undefined) {
    const reasons: string[] = [];
    if (facts.countableLotAreaSqFt === undefined) {
      reasons.push("the SMC-applicable countable lot area could not be established");
    }
    if (facts.applicableCoveragePercentage.status === "REQUIRES_VERIFICATION") {
      reasons.push(facts.applicableCoveragePercentage.reason);
    }
    if (facts.minimumCoverageFloor.status === "REQUIRES_VERIFICATION") {
      reasons.push(facts.minimumCoverageFloor.reason);
    }
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: rule.subject,
      appliedRule,
      supportingEvidence,
      explanationBasis: `Cannot establish the SMC-applicable allowed coverage amount: ${reasons.join("; ") || "an unresolved input remains"}.`,
    };
  }

  supportingEvidence.push(`allowedCoverageSqFt=${facts.allowedCoverageSqFt}`);
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: rule.subject,
    appliedRule,
    supportingEvidence,
    explanationBasis: `Combined coverage of ${combinedNumeratorSqFt} sq ft against an allowed ${facts.allowedCoverageSqFt} sq ft cannot be confirmed KNOWN - the existing-structures figure is self-reported and unverified (business-rules.md BR-U4-3), regardless of how the comparison itself would resolve.`,
  };
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
