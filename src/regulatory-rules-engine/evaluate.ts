/**
 * Workflow 4: Regulatory Rule Evaluation for a Project - BR-4, BR-4a (business-rules.md).
 * The unit's central deterministic workflow. Pure function: given a PropertyContext (assembled
 * only for a CONFIRMED parcel - see property-intelligence/assemble.ts's type-level precondition),
 * ProjectDetails (shed or, since Unit 4, garage - BR-U4-2), spatial results, and the currently
 * ACTIVE rule set, produce an EvaluationOutcome. No I/O - fully deterministic and testable.
 */

import type { PropertyContext } from "../property-intelligence/types.js";
import { AvailabilityState, getFact } from "../property-intelligence/types.js";
import { MappedIntersectionResult } from "../spatial-analysis/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import { EvidenceQuality, LifecycleState } from "../regulatory-rule-governance/types.js";
import type { InferencePolicy, RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { deriveEcaRegulatoryImplication } from "./eca-implication.js";
import { zoningApplicabilityFindings, type ZoningApplicability } from "./zoning-applicability.js";
import { PARCEL_SPECIFIC_APPROVAL_DISCLOSURE, computeLotCoverageExclusionTolerance } from "./lot-coverage-tolerance.js";
import {
  ComplianceOutcome,
  EvaluationStatus,
  FindingClassification,
  GENERAL_LOCATION_ONLY_SETBACK_POLICY_SUBJECT,
  BuildingPermitStatus,
  PermitReviewPath,
  PermitCriterionId,
  PermitCriterionStatus,
  CoverageExcludedEcaCategory,
} from "./types.js";
import type {
  EvaluationOutcome,
  Finding,
  GarageProjectDetails,
  LotCoverageFacts,
  ProjectDetails,
  ShedProjectDetails,
  PermitCriterionResult,
  PermitRequirementFinding,
  TradePermitDisclosure,
  AccessoryStructureHeightLimit,
  EcaLotAreaAdjustment,
  ShedLotCoverageFacts,
  ShedLotCoverageResult,
} from "./types.js";

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

/**
 * Unit 6B - the 19 founder-confirmed governance rule types (code-generation-plan.md §5.1). Unlike
 * every ruleType above, none of these is dispatched through evaluateRule's per-rule switch: each
 * customer-facing Unit 6B result (PermitRequirementFinding, the standalone P2b Finding,
 * ShedLotCoverageResult) is an AGGREGATE that correlates several governance rows' ACTIVE status
 * at once (code-generation-plan.md §4.14 - never partially), which the one-rule-in/one-Finding-out
 * evaluateRule model cannot express. These string constants exist so evaluateProject's shed
 * branch (which checks ACTIVE status directly against `activeRules`) and the governance fixtures/
 * tests (regulatory-rule-governance) share one literal source of truth instead of duplicating
 * string literals that could silently drift apart.
 */
export const ShedPermitRuleType = {
  ROOF_AREA: "SHED_PERMIT_P1_ROOF_AREA",
  STORY_HEIGHT: "SHED_PERMIT_P2A_STORY_HEIGHT",
  ACCESSORY_HEIGHT_LIMIT_IN_SETBACK: "SHED_PERMIT_P2B1_ACCESSORY_HEIGHT_LIMIT_IN_SETBACK",
  ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK: "SHED_PERMIT_P2B2_ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK",
  FOUNDATION_EXEMPTION: "SHED_PERMIT_P3A_FOUNDATION_EXEMPTION",
  FOUNDATION_STFI_DISQUALIFIER: "SHED_PERMIT_P3B_FOUNDATION_STFI_DISQUALIFIER",
  ATTACHMENT: "SHED_PERMIT_P4_ATTACHMENT",
  USE: "SHED_PERMIT_P5_USE",
  ECA_CRITERION: "SHED_PERMIT_P6_ECA_CRITERION",
  SIZE_SPAN_FOOTPRINT: "SHED_PERMIT_P7A_SIZE_SPAN_FOOTPRINT",
  SIZE_SPAN_STRUCTURAL: "SHED_PERMIT_P7B_SIZE_SPAN_STRUCTURAL",
  EXEMPTION_NOT_ZONING_COMPLIANCE: "SHED_PERMIT_P9_EXEMPTION_NOT_ZONING_COMPLIANCE",
} as const;
export type ShedPermitRuleType = (typeof ShedPermitRuleType)[keyof typeof ShedPermitRuleType];

export const ShedLotCoverageRuleType = {
  BASE_MAXIMUM: "SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM",
  ECA_LOT_AREA_EXCLUSION: "SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION",
  TRANSIT_BONUS: "SHED_LOT_COVERAGE_C1C_TRANSIT_BONUS",
  STACKED_BONUS: "SHED_LOT_COVERAGE_C1D_STACKED_BONUS",
  MINIMUM_FLOOR: "SHED_LOT_COVERAGE_C1E_MINIMUM_FLOOR",
  DIRECTOR_ALTERNATIVE: "SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE",
  ESTIMATE_CAVEAT: "SHED_LOT_COVERAGE_C2_ESTIMATE_CAVEAT",
} as const;
export type ShedLotCoverageRuleType = (typeof ShedLotCoverageRuleType)[keyof typeof ShedLotCoverageRuleType];

/**
 * OUTCOME-DEPENDENCY MODEL (2026-10-07 founder decision, superseding the all-or-nothing
 * constituent gating of code-generation-plan.md §4.14).
 *
 * An outcome renders when every rule REQUIRED FOR THAT SPECIFIC CLAIM is ACTIVE. A rule that is not
 * ACTIVE is never evaluated and never contributes a deterministic conclusion (the general lifecycle
 * rule is unchanged); what changed is that an inactive discretionary Tier-2 rule no longer blocks
 * deterministic value that does not depend on resolving it.
 *
 * Capability B (`permitRequirement`):
 *  - criterion X is evaluated only if every rule in PERMIT_CRITERION_RULE_DEPENDENCIES[X] is ACTIVE;
 *  - buildingPermit REQUIRED needs just ONE active criterion that is conclusively NOT_MET;
 *  - buildingPermit REQUIRES_VERIFICATION (the "all deterministic criteria pass, ECA unresolved"
 *    result) needs every DETERMINISTIC permit rule ACTIVE (DETERMINISTIC_PERMIT_RULE_TYPES);
 *  - buildingPermit LIKELY_EXEMPT additionally needs the discretionary P6 ACTIVE and MET, so it is
 *    unreachable while P6 is inactive - by construction, not by a special case;
 *  - a review-path conclusion that rests on P3b (foundation disqualifier) needs P3b ACTIVE.
 * Capability C (`shedLotCoverage`):
 *  - the calculation needs the five deterministic rules in SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES;
 *  - any claim about a Director-approved alternative (POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE) needs
 *    the discretionary C1e-director ACTIVE (SHED_LOT_COVERAGE_DIRECTOR_ALTERNATIVE_RULE_TYPES).
 * `accessoryHeightLimitFinding` depends on both P2b rows (either branch may apply to a given shed).
 */
const PERMIT_CRITERION_RULE_DEPENDENCIES: Readonly<Record<PermitCriterionId, readonly string[]>> = {
  [PermitCriterionId.ROOF_AREA]: [ShedPermitRuleType.ROOF_AREA],
  [PermitCriterionId.STORY_HEIGHT]: [ShedPermitRuleType.STORY_HEIGHT],
  [PermitCriterionId.FOUNDATION]: [ShedPermitRuleType.FOUNDATION_EXEMPTION],
  [PermitCriterionId.ATTACHMENT]: [ShedPermitRuleType.ATTACHMENT],
  [PermitCriterionId.USE]: [ShedPermitRuleType.USE],
  [PermitCriterionId.ECA]: [ShedPermitRuleType.ECA_CRITERION],
  [PermitCriterionId.SIZE_SPAN]: [ShedPermitRuleType.SIZE_SPAN_FOOTPRINT, ShedPermitRuleType.SIZE_SPAN_STRUCTURAL],
};
/** Criteria whose rule is an inherently discretionary (Director-determined) Tier-2 rule: while
 * inactive they are never evaluated and are represented as an explicit SDCI-determines
 * consideration rather than omitted or inferred. */
const DISCRETIONARY_PERMIT_CRITERIA: ReadonlySet<PermitCriterionId> = new Set([PermitCriterionId.ECA]);
const PERMIT_REVIEW_PATH_FOUNDATION_DISQUALIFIER_RULE_TYPES: readonly string[] = [ShedPermitRuleType.FOUNDATION_STFI_DISQUALIFIER];
/** Every permit rule except the discretionary ones (the 8 Tier-1 rules incl. P3b). */
const DETERMINISTIC_PERMIT_RULE_TYPES: readonly string[] = [
  ...Object.entries(PERMIT_CRITERION_RULE_DEPENDENCIES)
    .filter(([criterionId]) => !DISCRETIONARY_PERMIT_CRITERIA.has(criterionId as PermitCriterionId))
    .flatMap(([, ruleTypes]) => ruleTypes),
  ...PERMIT_REVIEW_PATH_FOUNDATION_DISQUALIFIER_RULE_TYPES,
];
const PERMIT_REQUIREMENT_CONSTITUENT_RULE_TYPES: readonly string[] = [
  ...DETERMINISTIC_PERMIT_RULE_TYPES,
  ...Object.entries(PERMIT_CRITERION_RULE_DEPENDENCIES)
    .filter(([criterionId]) => DISCRETIONARY_PERMIT_CRITERIA.has(criterionId as PermitCriterionId))
    .flatMap(([, ruleTypes]) => ruleTypes),
];
const ACCESSORY_HEIGHT_LIMIT_CONSTITUENT_RULE_TYPES: readonly string[] = [
  ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_IN_SETBACK,
  ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK,
];
/** C2 is absorbed into the existing-structure-coverage fact's own caveat, never consumed here (domain-entities.md §3c). */
const SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES: readonly string[] = [
  ShedLotCoverageRuleType.BASE_MAXIMUM,
  ShedLotCoverageRuleType.ECA_LOT_AREA_EXCLUSION,
  ShedLotCoverageRuleType.TRANSIT_BONUS,
  ShedLotCoverageRuleType.STACKED_BONUS,
  ShedLotCoverageRuleType.MINIMUM_FLOOR,
];
const SHED_LOT_COVERAGE_DIRECTOR_ALTERNATIVE_RULE_TYPES: readonly string[] = [ShedLotCoverageRuleType.DIRECTOR_ALTERNATIVE];

function allRuleTypesActive(activeRules: RegulatoryRule[], requiredRuleTypes: readonly string[]): boolean {
  return ruleTypesAllIn(activeRuleTypeSet(activeRules), requiredRuleTypes);
}

function activeRuleTypeSet(activeRules: RegulatoryRule[]): ReadonlySet<string> {
  return new Set(activeRules.map((r) => (r.ruleSpecification as { ruleType?: string }).ruleType).filter((rt): rt is string => rt !== undefined));
}

function ruleTypesAllIn(activeRuleTypes: ReadonlySet<string>, requiredRuleTypes: readonly string[]): boolean {
  return requiredRuleTypes.every((rt) => activeRuleTypes.has(rt));
}

/** Every Unit 6B ruleType is consumed exclusively by the aggregate-computing functions below, via
 * allRuleTypesActive against the FULL activeRules list - never through evaluateRule's generic
 * per-rule switch (which has no case for any of them and would otherwise produce a spurious
 * "not recognized by this evaluator" REQUIRES_VERIFICATION Finding, one per Unit 6B row, the
 * moment any of them were ever ACTIVE - caught on review, 2026-09-15). evaluateProject's main
 * per-rule loop filters these out before dispatching. */
const UNIT_6B_AGGREGATE_ONLY_RULE_TYPES: ReadonlySet<string> = new Set([
  ...PERMIT_REQUIREMENT_CONSTITUENT_RULE_TYPES,
  ...ACCESSORY_HEIGHT_LIMIT_CONSTITUENT_RULE_TYPES,
  ...SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES,
  ...SHED_LOT_COVERAGE_DIRECTOR_ALTERNATIVE_RULE_TYPES,
  ShedPermitRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE,
  ShedLotCoverageRuleType.ESTIMATE_CAVEAT,
]);

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
  /** Unit 6B - required only when project.projectType === "shed" and every
   * SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES row is ACTIVE; assembled server-side from the
   * `existing-structure-coverage`/parcel-area facts and the in-memory proposed footprint, never
   * client-supplied. `allowanceFacts` is intentionally excluded here - it is a pure derivation
   * of `ecaAdjustment`/`parcelAreaSqFt` computed by evaluateShedLotCoverage itself, not an
   * external input (domain-entities.md §3c's Flow 4 pseudocode). Absent/omitted is safe even
   * when the constituent rules are ACTIVE - shedLotCoverage simply stays undefined rather than
   * throwing. */
  shedLotCoverageFacts?: Omit<ShedLotCoverageFacts, "allowanceFacts">;
  /** Unit 11 Slice 1. Provided by the pipeline for shed/garage evaluations. NOT_NR withholds every
   * Neighborhood Residential zoning conclusion (setback, height, separation, lot coverage) while the
   * zone-independent building-permit determination and mapped ECA context stand. Undefined (unit tests,
   * callers that did not retrieve zoning) leaves the pre-existing behavior unchanged. */
  zoningApplicability?: ZoningApplicability;
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

/** The exact subject prefix evaluateProject's unconditional ECA loop below uses for every
 * per-hazard Finding it produces. Exported as the single source of truth (maintenance
 * correction, 2026-09-15) - both ReportView.tsx's rendering and pipeline.ts's Report Explanation
 * input need to identify these same findings, and must never drift into two independent string
 * literals. */
export const CRITICAL_AREA_FINDING_SUBJECT_PREFIX = "Critical area: ";

/** True for any Finding produced by evaluateProject's per-hazard ECA loop. These already have a
 * correct, dedicated, structurally-precise presentation (the "Mapped Environmental / Site
 * Constraints" ReportView section, which reads the raw environmental-constraints evidence fact
 * directly, per-hazard, preserving the KNOWN/REQUIRES_VERIFICATION distinction). Consumers that
 * narrate findings in free text (ReportView's general Findings/Requires-Verification lists,
 * pipeline.ts's Report Explanation input) exclude them via this predicate rather than
 * re-presenting the same 10 findings a second, less precise way. */
export function isCriticalAreaFinding(subject: string): boolean {
  return subject.startsWith(CRITICAL_AREA_FINDING_SUBJECT_PREFIX);
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
  const notNr = input.zoningApplicability?.status === "NOT_NR";

  for (const rule of activeRules) {
    if (notNr) break; // verifiably not a Neighborhood Residential zone: no NR zoning conclusion is produced
    const ruleType = (rule.ruleSpecification as { ruleType?: string }).ruleType;
    if (ruleType !== undefined && UNIT_6B_AGGREGATE_ONLY_RULE_TYPES.has(ruleType)) {
      // Consumed exclusively by the shed aggregate-computing functions below via
      // allRuleTypesActive against the full activeRules list, never by the generic per-rule
      // switch - see UNIT_6B_AGGREGATE_ONLY_RULE_TYPES's docstring.
      continue;
    }
    findings.push(...evaluateRule(rule, input.project, activePolicies, input.lotCoverageFacts));
  }

  for (const ecaFinding of input.ecaFindings) {
    const implication = deriveEcaRegulatoryImplication(ecaFinding);
    const subject = `${CRITICAL_AREA_FINDING_SUBJECT_PREFIX}${ecaFinding.hazardType}`;
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

  if (input.zoningApplicability) findings.push(...zoningApplicabilityFindings(input.zoningApplicability, `${input.project.projectType} rules`));

  const outcome: EvaluationOutcome = {
    status: EvaluationStatus.COMPLETE,
    findings,
    uncoveredConstraintTypes: notNr
      ? ["zoning limits - setback, height, lot coverage (parcel is not in a Neighborhood Residential zone)"]
      : computeUncoveredConstraintTypes(input.project.projectType, activeRules),
  };

  if (input.project.projectType === "shed") {
    const activeRuleTypes = activeRuleTypeSet(activeRules);
    const permitRequirement = evaluateShedPermitRequirementForActiveRules(input.project, input.ecaFindings, activeRuleTypes);
    if (permitRequirement) outcome.permitRequirement = permitRequirement;
    if (!notNr && allRuleTypesActive(activeRules, ACCESSORY_HEIGHT_LIMIT_CONSTITUENT_RULE_TYPES)) {
      outcome.accessoryHeightLimitFinding = evaluateAccessoryHeightLimit(input.project);
    }
    if (!notNr && input.shedLotCoverageFacts && ruleTypesAllIn(activeRuleTypes, SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES)) {
      outcome.shedLotCoverage = evaluateShedLotCoverage(input.shedLotCoverageFacts, {
        directorAlternativeRuleActive: ruleTypesAllIn(activeRuleTypes, SHED_LOT_COVERAGE_DIRECTOR_ALTERNATIVE_RULE_TYPES),
      });
    }
  }

  return outcome;
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
    return missingEvidenceFinding(rule.subject, appliedRule, project.setbackEvidenceGapReason ?? "distanceToRearLotLineFt is not available.");
  }
  if (project.rearRoleEvidenceGapReason !== undefined) {
    // Maintenance correction (2026-09-17, founder correction after reviewer escalation) - the
    // measurement is KNOWN (the customer's own indicated rear line), but the CONCLUSION is not:
    // it may actually be a through-lot/Director-determined front line, or the customer answered
    // NOT_SURE about additional street frontage at all. "measurement = KNOWN; applicable
    // role-dependent regulatory conclusion = REQUIRES_VERIFICATION."
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: rule.subject,
      appliedRule,
      supportingEvidence: [`distanceToRearLotLineFt=${project.distanceToRearLotLineFt}`],
      explanationBasis: `The distance to your indicated rear property line is a known ${roundToTenthFt(project.distanceToRearLotLineFt)}ft, but ${project.rearRoleEvidenceGapReason}`,
    };
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
    explanationBasis: `Rear setback ${roundToTenthFt(project.distanceToRearLotLineFt)}ft ${pass ? "meets" : "does not meet"} the required ${required}ft (${project.alleyAdjacent ? "alley-adjacent" : "standard"}).`,
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
    return missingEvidenceFinding(rule.subject, appliedRule, project.dwellingSeparationEvidenceGapReason ?? "distanceToDwellingFt is not available.");
  }
  const pass = project.distanceToDwellingFt >= spec.minFt;
  return {
    classification: FindingClassification.KNOWN,
    subject: rule.subject,
    complianceOutcome: pass ? ComplianceOutcome.PASS : ComplianceOutcome.FAIL,
    appliedRule,
    supportingEvidence: [`distanceToDwellingFt=${project.distanceToDwellingFt}`],
    explanationBasis: `Dwelling separation ${roundToTenthFt(project.distanceToDwellingFt)}ft ${pass ? "meets" : "does not meet"} the required ${spec.minFt}ft.`,
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
    findings.push(missingEvidenceFinding(`${rule.subject} (side)`, appliedRule, project.setbackEvidenceGapReason ?? "distanceToSideLotLineFt is not available."));
  } else if (project.sideRoleEvidenceGapReason !== undefined) {
    // Maintenance correction (2026-09-17, founder correction after reviewer escalation) - the
    // customer answered NOT_SURE to "does this property have street frontage on more than one
    // side" - none of their side-candidate edges can be confidently called ordinary, even though
    // this particular number is computed the same way it would be for NO. Measurement stays KNOWN;
    // the conclusion does not.
    findings.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: `${rule.subject} (side)`,
      appliedRule,
      supportingEvidence: [`distanceToSideLotLineFt=${project.distanceToSideLotLineFt}`],
      explanationBasis: `The distance to your nearest indicated side property line is a known ${roundToTenthFt(project.distanceToSideLotLineFt)}ft, but ${project.sideRoleEvidenceGapReason}`,
    });
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
        // Maintenance correction (2026-09-17, founder correction after reviewer escalation) - a
        // confirmed street-facing side line is no longer represented as "included" here (it is
        // excluded, see the grouped additional-street-frontage finding below) - the prior wording
        // was stale once that exclusion was introduced.
        explanationBasis: `Side setback ${roundToTenthFt(project.distanceToSideLotLineFt)}ft ${pass ? "meets" : "does not meet"} the ${spec.sideMinFt}ft minimum (no reduced-setback exception applies to accessory structures in the side yard).`,
      })
    );
  }

  if (project.distanceToFrontLotLineFt === undefined) {
    findings.push(missingEvidenceFinding(`${rule.subject} (front)`, appliedRule, project.setbackEvidenceGapReason ?? "distanceToFrontLotLineFt is not available."));
  } else if (project.frontRoleEvidenceGapReason !== undefined) {
    // Maintenance correction (2026-09-17, founder correction after reviewer escalation) - the
    // measurement is KNOWN (the customer's own indicated front line), but the CONCLUSION is not:
    // current code's through-lot/Director-determination provisions mean this may not be the
    // code-defined front line at all. "measurement = KNOWN; applicable role-dependent regulatory
    // conclusion = REQUIRES_VERIFICATION."
    findings.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: `${rule.subject} (front)`,
      appliedRule,
      supportingEvidence: [`distanceToFrontLotLineFt=${project.distanceToFrontLotLineFt}`],
      explanationBasis: `The distance to your indicated front property line is a known ${roundToTenthFt(project.distanceToFrontLotLineFt)}ft, but ${project.frontRoleEvidenceGapReason}`,
    });
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
        explanationBasis: `Front setback ${roundToTenthFt(project.distanceToFrontLotLineFt)}ft ${pass ? "meets" : "does not meet"} the ${spec.frontFt}ft minimum.`,
      })
    );
  }

  // Maintenance correction (2026-09-17, founder correction after reviewer escalation
  // 53f30444-b566-4197-b0dd-e2aff768fa65) - one grouped finding (never one per edge, per founder
  // direction on the prior tessellated-arc report) for every confirmed-street edge current code
  // cannot resolve as a through-lot front (SMC 23.44.090.B), a Director-determined corner-lot front
  // (SMC 23.84A.024), or an ordinary side-street line - that determination needs real STREET
  // geometry evidence this correction does not add. Uses the closest (minimum) distance among them.
  // A parcel-edge-azimuth heuristic is included as NON-AUTHORITATIVE diagnostic evidence only - it
  // never determines the classification itself (the founder's own live-verification run showed why:
  // two adjacent fragments of ONE curved street corner can be locally near-parallel and falsely
  // suggest a through lot, despite not being two distinct streets at all).
  if (project.unresolvedStreetFrontageDistancesFt && Object.keys(project.unresolvedStreetFrontageDistancesFt).length > 0) {
    const entries = Object.entries(project.unresolvedStreetFrontageDistancesFt);
    const minDistanceFt = Math.min(...entries.map(([, distanceFt]) => distanceFt));
    const supportingEvidence = entries.map(([edgeRef, distanceFt]) => `${edgeRef}=${distanceFt}`);
    for (const [edgeRef, heuristic] of Object.entries(project.streetFrontageHeuristics ?? {})) {
      supportingEvidence.push(
        `heuristic(${edgeRef})=azimuthFrontDeg:${heuristic.azimuthFrontDeg},azimuthEdgeDeg:${heuristic.azimuthEdgeDeg},angleFromParallelDeg:${heuristic.angleFromParallelDeg},possibleThroughLot:${heuristic.possibleThroughLot},evidenceQuality:${heuristic.evidenceQuality}`
      );
    }
    findings.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: `${rule.subject} (additional street frontage)`,
      appliedRule,
      supportingEvidence,
      explanationBasis:
        `This property has additional street frontage (closest measured distance ${roundToTenthFt(minDistanceFt)}ft). Current Seattle code treats this differently depending on the actual relationship between the streets involved: a through lot (streets parallel or within 15 degrees of parallel, SMC 23.44.090.B) requires the front-setback standard here instead of the side standard, while a corner lot's additional frontage is a front-line determination the City's Director of Construction & Inspections makes based on the existing pattern of lots and buildings on the block (SMC 23.84A.024) - neither can be established from this property's own boundary shape alone. This cannot be confirmed pass or fail until that is established.`,
    });
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

/** Founder-caught presentation gap (2026-09-17) - PostGIS's ST_Distance returns full
 * floating-point precision (e.g. 43.60679091361771), which every setback/dwelling-separation
 * explanationBasis string below previously interpolated verbatim into customer-facing prose. The
 * underlying PASS/FAIL comparison (project.distanceToXFt >= spec.xFt) still uses the full-precision
 * value, unrounded - only the DISPLAYED text is rounded, to the nearest 0.1ft, never affecting the
 * actual compliance determination. */
function roundToTenthFt(distanceFt: number): number {
  return Math.round(distanceFt * 10) / 10;
}

// ---------------------------------------------------------------------------------------------
// Unit 6B — Shed permit-requirement determination (functional-design/business-logic-model.md
// Flow 2/Flow 3). Each evaluator below is a plain, unconditional, deterministic function (no
// in-function ACTIVE check - the governing constraint code-generation-plan.md verified before
// this plan was written) - the sole gate keeping this dormant is evaluateProject's
// allRuleTypesActive check above, exactly Unit 4's LOT_COVERAGE precedent.
// ---------------------------------------------------------------------------------------------

function wallFootprintSqFt(project: ShedProjectDetails): number {
  return project.widthFt * project.depthFt;
}

/** P1 / ROOF_AREA - SRC R105.2 Item 3.1. */
function evaluateRoofArea(project: ShedProjectDetails): PermitCriterionResult {
  const footprint = wallFootprintSqFt(project);
  if (footprint > 120) {
    return {
      criterionId: PermitCriterionId.ROOF_AREA,
      status: PermitCriterionStatus.NOT_MET,
      explanationBasis: `Wall footprint ${footprint} sq ft exceeds the 120 sq ft roof-area exemption threshold (SRC R105.2 Item 3.1) - roof area can only be at least as large as the wall footprint, so this criterion is already unsatisfiable regardless of overhang.`,
    };
  }

  const overhang = project.roofOverhang;
  if (!overhang || overhang.extendsBeyondWalls === false) {
    return {
      criterionId: PermitCriterionId.ROOF_AREA,
      status: PermitCriterionStatus.MET,
      explanationBasis: `Wall footprint ${footprint} sq ft is within the 120 sq ft roof-area exemption threshold (SRC R105.2 Item 3.1), with no roof overhang extending beyond the walls.`,
    };
  }

  if (overhang.approxOverhangIn === undefined) {
    return {
      criterionId: PermitCriterionId.ROOF_AREA,
      status: PermitCriterionStatus.REQUIRES_VERIFICATION,
      explanationBasis: `Wall footprint ${footprint} sq ft is within the 120 sq ft threshold, but the roof overhangs the walls and no approximate overhang measurement was given - the actual projected roof area cannot be confirmed.`,
    };
  }

  const overhangFt = overhang.approxOverhangIn / 12;
  const projectedAreaSqFt = (project.widthFt + 2 * overhangFt) * (project.depthFt + 2 * overhangFt);
  if (projectedAreaSqFt <= 120) {
    return {
      criterionId: PermitCriterionId.ROOF_AREA,
      status: PermitCriterionStatus.MET,
      explanationBasis: `Projected roof area (wall footprint plus a ~${overhang.approxOverhangIn}in overhang on each side) is ${projectedAreaSqFt.toFixed(1)} sq ft, within the 120 sq ft threshold (SRC R105.2 Item 3.1).`,
    };
  }
  return {
    criterionId: PermitCriterionId.ROOF_AREA,
    status: PermitCriterionStatus.REQUIRES_VERIFICATION,
    explanationBasis: `Projected roof area (wall footprint plus a ~${overhang.approxOverhangIn}in overhang on each side) is approximately ${projectedAreaSqFt.toFixed(1)} sq ft, over the 120 sq ft threshold - but the overhang figure is approximate, so this cannot be confirmed as a definite failure.`,
  };
}

/** P2a / STORY_HEIGHT - always MET; this product's scope is inherently single-story. */
function evaluateStoryHeight(): PermitCriterionResult {
  return {
    criterionId: PermitCriterionId.STORY_HEIGHT,
    status: PermitCriterionStatus.MET,
    explanationBasis: "A shed evaluated by this product is inherently single-story.",
  };
}

const FOUNDATION_EXEMPTION_MET_TYPES: readonly string[] = ["SLAB_ON_GRADE", "PIER_BLOCKS", "ON_SOIL"];
const FOUNDATION_EXEMPTION_NOT_MET_TYPES: readonly string[] = ["FROST_FOOTING", "PILES", "WOOD_FOUNDATION"];

/** P3a / FOUNDATION - SRC R105.2 Item 3.2. */
function evaluateFoundationExemption(project: ShedProjectDetails): PermitCriterionResult {
  const foundationType = project.foundationType;
  if (foundationType === undefined) {
    return {
      criterionId: PermitCriterionId.FOUNDATION,
      status: PermitCriterionStatus.REQUIRES_VERIFICATION,
      explanationBasis: "Foundation type was not provided - cannot confirm whether the shed qualifies for the R105.2 foundation exemption.",
    };
  }
  if (FOUNDATION_EXEMPTION_MET_TYPES.includes(foundationType)) {
    return {
      criterionId: PermitCriterionId.FOUNDATION,
      status: PermitCriterionStatus.MET,
      explanationBasis: `Foundation type "${foundationType}" qualifies for the R105.2 Item 3.2 foundation exemption.`,
    };
  }
  return {
    criterionId: PermitCriterionId.FOUNDATION,
    status: PermitCriterionStatus.NOT_MET,
    explanationBasis: `Foundation type "${foundationType}" does not qualify for the R105.2 Item 3.2 foundation exemption.`,
  };
}

/** P4 / ATTACHMENT. */
function evaluateAttachment(project: ShedProjectDetails): PermitCriterionResult {
  if (project.attachment === undefined) {
    return {
      criterionId: PermitCriterionId.ATTACHMENT,
      status: PermitCriterionStatus.REQUIRES_VERIFICATION,
      explanationBasis: "Attachment status was not provided.",
    };
  }
  if (project.attachment === "DETACHED") {
    return { criterionId: PermitCriterionId.ATTACHMENT, status: PermitCriterionStatus.MET, explanationBasis: "The structure is detached from any dwelling." };
  }
  return {
    criterionId: PermitCriterionId.ATTACHMENT,
    status: PermitCriterionStatus.NOT_MET,
    explanationBasis: "The structure is attached to a dwelling - this is an addition, not a detached shed. See the addition review path rather than the shed exemption criteria.",
  };
}

const USE_MET_VALUES: readonly string[] = ["STORAGE", "GREENHOUSE_PLANTS"];

/** P5 / USE - never resolves NOT_MET, by founder instruction (BR-U6B-10). */
function evaluateUse(project: ShedProjectDetails): PermitCriterionResult {
  if (project.intendedUse !== undefined && USE_MET_VALUES.includes(project.intendedUse)) {
    return {
      criterionId: PermitCriterionId.USE,
      status: PermitCriterionStatus.MET,
      explanationBasis: `Intended use "${project.intendedUse}" matches an explicit exempt-use category (storage or growing plants).`,
    };
  }
  return {
    criterionId: PermitCriterionId.USE,
    status: PermitCriterionStatus.REQUIRES_VERIFICATION,
    explanationBasis:
      project.intendedUse === undefined
        ? "Intended use was not provided."
        : `Intended use "${project.intendedUse}" doesn't match the two explicit exempt categories (storage, growing plants) - confirm with SDCI whether it counts as a similar generally-unoccupied use.`,
  };
}

/** P6 / ECA - reads the environmental-constraints fact through the existing, unmodified
 * deriveEcaRegulatoryImplication (BR-4a). Worded around "in or near an ECA," never "confirmed no
 * ECA" (BR-U6B-2/3) - MET requires every hazard finding to be a confirmed, non-intersecting,
 * map-dispositive result; any advisory-only hazard (the large majority) always contributes
 * REQUIRES_VERIFICATION here, by BR-4a's own unmodified design - never silently ignored. */
function evaluateEcaPermitCriterion(ecaFindings: CriticalAreaFinding[]): PermitCriterionResult {
  // Fail-closed (caught on review, 2026-09-15): an empty/absent findings array means "no
  // environmental-constraints data was available for this evaluation," never "confirmed clear
  // of every hazard." Real production ECA data always carries one element per Seattle hazard
  // category (domain-entities.md §1a) - a shed evaluation reaching this function with zero
  // findings reflects an unavailable/SOURCE_ERROR fact, not a genuine clean result. MET requires
  // actual per-hazard evidence, matching this project's established discipline of never treating
  // absence of evidence as confirmation.
  if (ecaFindings.length === 0) {
    return {
      criterionId: PermitCriterionId.ECA,
      status: PermitCriterionStatus.REQUIRES_VERIFICATION,
      explanationBasis: "No environmental-constraints data was available for this evaluation - cannot confirm the shed's parcel is clear of every mapped hazard category.",
    };
  }

  let confirmedIntersection: CriticalAreaFinding | undefined;
  let requiresVerification: CriticalAreaFinding | undefined;

  for (const finding of ecaFindings) {
    const implication = deriveEcaRegulatoryImplication(finding);
    if (implication.classification === FindingClassification.KNOWN && finding.mappedIntersectionResult === MappedIntersectionResult.INTERSECTS) {
      confirmedIntersection = finding;
    } else if (implication.classification === FindingClassification.REQUIRES_VERIFICATION) {
      requiresVerification = requiresVerification ?? finding;
    }
  }

  if (confirmedIntersection) {
    return {
      criterionId: PermitCriterionId.ECA,
      status: PermitCriterionStatus.NOT_MET,
      explanationBasis: `Mapped ${confirmedIntersection.hazardType} data confirms an intersection with this parcel.`,
    };
  }
  if (requiresVerification) {
    return {
      criterionId: PermitCriterionId.ECA,
      status: PermitCriterionStatus.REQUIRES_VERIFICATION,
      explanationBasis: `${requiresVerification.hazardType} mapping cannot confidently rule out that the shed's parcel is in or near a mapped environmentally critical area.`,
    };
  }
  return {
    criterionId: PermitCriterionId.ECA,
    status: PermitCriterionStatus.MET,
    explanationBasis: "No basis, from available mapped data, to conclude the shed's parcel is in or near a mapped environmentally critical area.",
  };
}

/** P7a + P7b combined / SIZE_SPAN. Never inferred from widthFt/depthFt. */
function evaluateSizeSpan(project: ShedProjectDetails): PermitCriterionResult {
  const footprint = wallFootprintSqFt(project);
  if (footprint > 750) {
    return {
      criterionId: PermitCriterionId.SIZE_SPAN,
      status: PermitCriterionStatus.NOT_MET,
      explanationBasis: `Wall footprint ${footprint} sq ft exceeds the 750 sq ft STFI size threshold (P7a).`,
    };
  }

  const span = project.structuralSpanInfo;
  if (!span) {
    return {
      criterionId: PermitCriterionId.SIZE_SPAN,
      status: PermitCriterionStatus.REQUIRES_VERIFICATION,
      explanationBasis: `Wall footprint ${footprint} sq ft is within the 750 sq ft threshold (P7a), but structural span information (P7b) was not provided.`,
    };
  }

  const spanFt = span.structuralSpanFt;
  const usesTruss = span.usesManufacturedTruss === true;

  if (spanFt < 14) {
    return {
      criterionId: PermitCriterionId.SIZE_SPAN,
      status: PermitCriterionStatus.MET,
      explanationBasis: `Structural span ${spanFt}ft is under 14ft and footprint ${footprint} sq ft is within 750 sq ft - both STFI size criteria are met.`,
    };
  }
  if (spanFt === 14) {
    return {
      criterionId: PermitCriterionId.SIZE_SPAN,
      status: PermitCriterionStatus.REQUIRES_VERIFICATION,
      explanationBasis: `Structural span is exactly 14ft, a boundary the source guidance does not textually reconcile ("less than 14 feet" vs. "more than 14 feet" framings) - cannot confirm STFI eligibility on span alone.`,
    };
  }
  if (spanFt > 14 && spanFt <= 30 && usesTruss) {
    return {
      criterionId: PermitCriterionId.SIZE_SPAN,
      status: PermitCriterionStatus.MET,
      explanationBasis: `Structural span ${spanFt}ft exceeds 14ft but is within 30ft and uses a manufactured truss - qualifies, and footprint ${footprint} sq ft is within 750 sq ft.`,
    };
  }
  return {
    criterionId: PermitCriterionId.SIZE_SPAN,
    status: PermitCriterionStatus.NOT_MET,
    explanationBasis:
      spanFt > 30
        ? `Structural span ${spanFt}ft exceeds 30ft even with a manufactured truss.`
        : `Structural span ${spanFt}ft exceeds 14ft without a qualifying manufactured truss.`,
  };
}

const STFI_DISQUALIFYING_FOUNDATION_TYPES: readonly string[] = ["PILES", "WOOD_FOUNDATION"];

/** P3b - independent of P3a/ECA/SIZE_SPAN (business-logic-model.md Flow 3, corrected on review
 * 2026-09-15). Not a PermitCriterionId - consulted directly by deriveBuildingPermitState. */
function foundationStfiDisqualification(foundationType: ShedProjectDetails["foundationType"]): "DISQUALIFIED" | "CLEAR" | "UNKNOWN" {
  if (foundationType === undefined) return "UNKNOWN";
  return STFI_DISQUALIFYING_FOUNDATION_TYPES.includes(foundationType) ? "DISQUALIFIED" : "CLEAR";
}

/** Flow 3's two-dimensional buildingPermit/reviewPath derivation, verbatim. */
function deriveBuildingPermitState(
  criteria: PermitCriterionResult[],
  foundationType: ShedProjectDetails["foundationType"],
  /** P3b not ACTIVE => the foundation disqualifier is not evaluated (treated as unknown). Default true
   * preserves the all-rules-active semantics every existing caller assumes. */
  foundationDisqualifierRuleActive = true
): { buildingPermit: BuildingPermitStatus; reviewPath: PermitReviewPath } {
  const byId = new Map(criteria.map((c) => [c.criterionId, c.status]));
  const exemptionCriteriaIds: PermitCriterionId[] = [
    PermitCriterionId.ROOF_AREA,
    PermitCriterionId.STORY_HEIGHT,
    PermitCriterionId.FOUNDATION,
    PermitCriterionId.ATTACHMENT,
    PermitCriterionId.USE,
    PermitCriterionId.ECA,
  ];
  const exemptionStatuses = exemptionCriteriaIds.map((id) => byId.get(id));

  let buildingPermit: BuildingPermitStatus;
  if (exemptionStatuses.every((s) => s === PermitCriterionStatus.MET)) {
    buildingPermit = BuildingPermitStatus.LIKELY_EXEMPT;
  } else if (exemptionStatuses.some((s) => s === PermitCriterionStatus.NOT_MET)) {
    buildingPermit = BuildingPermitStatus.REQUIRED;
  } else {
    buildingPermit = BuildingPermitStatus.REQUIRES_VERIFICATION;
  }

  if (buildingPermit === BuildingPermitStatus.LIKELY_EXEMPT) {
    return { buildingPermit, reviewPath: PermitReviewPath.NONE };
  }
  if (buildingPermit === BuildingPermitStatus.REQUIRES_VERIFICATION) {
    return { buildingPermit, reviewPath: PermitReviewPath.REQUIRES_VERIFICATION };
  }

  // buildingPermit === REQUIRED
  const sizeSpanStatus = byId.get(PermitCriterionId.SIZE_SPAN);
  const foundationDisqualification = foundationDisqualifierRuleActive ? foundationStfiDisqualification(foundationType) : "UNKNOWN";

  if (byId.get(PermitCriterionId.ECA) === PermitCriterionStatus.NOT_MET) {
    return { buildingPermit, reviewPath: PermitReviewPath.FULL_REVIEW_LIKELY };
  }
  if (foundationDisqualification === "DISQUALIFIED") {
    return { buildingPermit, reviewPath: PermitReviewPath.FULL_REVIEW_LIKELY };
  }
  if (sizeSpanStatus === PermitCriterionStatus.NOT_MET) {
    return { buildingPermit, reviewPath: PermitReviewPath.FULL_REVIEW_LIKELY };
  }
  // STFI_LIKELY only when every fact that supports that path is resolved - including the ECA: SDCI
  // requires a full review for a site in an environmentally critical area, so an UNRESOLVED ECA
  // criterion (the production reality: the ECA maps are advisory, SMC 25.09.030.A) must keep the path
  // REQUIRES_VERIFICATION rather than let "simple review likely" be reported (2026-10-08 founder
  // correction). The permit requirement itself (REQUIRED) is unaffected.
  if (sizeSpanStatus === PermitCriterionStatus.MET && foundationDisqualification === "CLEAR" && byId.get(PermitCriterionId.ECA) === PermitCriterionStatus.MET) {
    return { buildingPermit, reviewPath: PermitReviewPath.STFI_LIKELY };
  }
  return { buildingPermit, reviewPath: PermitReviewPath.REQUIRES_VERIFICATION };
}

const REVIEW_PATH_ECA_NOTE =
  "A simple (subject-to-field-inspection) review would apply unless the site is in or near an environmentally critical area, where SDCI requires a full review. Permit Preflight cannot determine that conclusively from Seattle's advisory mapping, so the review path is not confirmed.";

/** When the permit is REQUIRED and the ONLY thing keeping the review path unresolved is the ECA
 * question (size/span met, foundation clear, ECA not decided), say so - so an unresolved path stays
 * informative instead of a bare "needs verification". Undefined in every other case. */
function reviewPathEcaNote(
  criteria: PermitCriterionResult[],
  foundationType: ShedProjectDetails["foundationType"],
  foundationDisqualifierRuleActive: boolean,
  derived: { buildingPermit: BuildingPermitStatus; reviewPath: PermitReviewPath }
): string | undefined {
  if (derived.buildingPermit !== BuildingPermitStatus.REQUIRED || derived.reviewPath !== PermitReviewPath.REQUIRES_VERIFICATION) return undefined;
  const byId = new Map(criteria.map((c) => [c.criterionId, c.status]));
  const eca = byId.get(PermitCriterionId.ECA);
  const foundation = foundationDisqualifierRuleActive ? foundationStfiDisqualification(foundationType) : "UNKNOWN";
  if (byId.get(PermitCriterionId.SIZE_SPAN) === PermitCriterionStatus.MET && foundation === "CLEAR" && eca === PermitCriterionStatus.REQUIRES_VERIFICATION) return REVIEW_PATH_ECA_NOTE;
  return undefined;
}

const TRADE_PERMIT_DISCLOSURE_COPY =
  "Electrical, plumbing, or mechanical work may require separate permits. Permit Preflight's shed building-permit result does not determine those trade permits.";

/** P8 (candidate) - a fixed, non-tiered advisory (BR-U6B-8), entirely independent of
 * buildingPermit/reviewPath and not gated by any RegulatoryRule ACTIVE check. */
function buildTradePermitDisclosures(utilityIntent: ShedProjectDetails["utilityIntent"]): TradePermitDisclosure[] {
  const disclosures: TradePermitDisclosure[] = [];
  if (utilityIntent?.electrical) disclosures.push({ trade: "ELECTRICAL", explanationBasis: TRADE_PERMIT_DISCLOSURE_COPY });
  if (utilityIntent?.plumbing) disclosures.push({ trade: "PLUMBING", explanationBasis: TRADE_PERMIT_DISCLOSURE_COPY });
  if (utilityIntent?.mechanical) disclosures.push({ trade: "MECHANICAL", explanationBasis: TRADE_PERMIT_DISCLOSURE_COPY });
  return disclosures;
}

/** Everything-active evaluation (the shape every criterion/aggregate test exercises directly). The
 * production path is evaluateShedPermitRequirementForActiveRules, which applies the outcome-dependency
 * model above; with every permit rule active the two are identical. */
function evaluateShedPermitRequirement(project: ShedProjectDetails, ecaFindings: CriticalAreaFinding[]): PermitRequirementFinding {
  const criteria: PermitCriterionResult[] = [
    evaluateRoofArea(project),
    evaluateStoryHeight(),
    evaluateFoundationExemption(project),
    evaluateAttachment(project),
    evaluateUse(project),
    evaluateEcaPermitCriterion(ecaFindings),
    evaluateSizeSpan(project),
  ];
  const { buildingPermit, reviewPath } = deriveBuildingPermitState(criteria, project.foundationType);
  const reviewPathNote = reviewPathEcaNote(criteria, project.foundationType, true, { buildingPermit, reviewPath });
  return {
    buildingPermit,
    reviewPath,
    criteria,
    tradePermitDisclosures: buildTradePermitDisclosures(project.utilityIntent),
    ...(reviewPathNote ? { reviewPathNote } : {}),
  };
}

const ECA_DETERMINATION_NOTE =
  "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in or near an environmentally critical area. Permit Preflight cannot determine that conclusively from Seattle's advisory mapping; SDCI makes that determination.";

/** The ECA criterion while P6 is not ACTIVE: never evaluated, never MET or NOT_MET. Mapped layers that
 * indicate an intersection are disclosed as context only - they do not decide the criterion. */
function deferredEcaCriterion(ecaFindings: CriticalAreaFinding[]): PermitCriterionResult {
  const indicated = ecaFindings.filter((f) => f.mappedIntersectionResult === MappedIntersectionResult.INTERSECTS).map((f) => f.hazardType.replace(/_/g, " "));
  const context = indicated.length > 0 ? ` Mapped layers that show a possible intersection with this parcel (context only; not used to decide this criterion): ${indicated.join(", ")}.` : "";
  return {
    criterionId: PermitCriterionId.ECA,
    status: PermitCriterionStatus.REQUIRES_VERIFICATION,
    explanationBasis: `Whether the site is in or near an environmentally critical area is a determination SDCI makes; Permit Preflight does not make it from Seattle's advisory mapping.${context}`,
  };
}

/**
 * Production entry point for Capability B - applies the outcome-dependency model documented above.
 * Returns undefined (dormant) when no claim can be made: no active criterion is conclusively NOT_MET
 * AND some deterministic permit rule is not ACTIVE.
 */
function evaluateShedPermitRequirementForActiveRules(
  project: ShedProjectDetails,
  ecaFindings: CriticalAreaFinding[],
  activeRuleTypes: ReadonlySet<string>
): PermitRequirementFinding | undefined {
  const evaluators: Record<PermitCriterionId, () => PermitCriterionResult> = {
    [PermitCriterionId.ROOF_AREA]: () => evaluateRoofArea(project),
    [PermitCriterionId.STORY_HEIGHT]: () => evaluateStoryHeight(),
    [PermitCriterionId.FOUNDATION]: () => evaluateFoundationExemption(project),
    [PermitCriterionId.ATTACHMENT]: () => evaluateAttachment(project),
    [PermitCriterionId.USE]: () => evaluateUse(project),
    [PermitCriterionId.ECA]: () => evaluateEcaPermitCriterion(ecaFindings),
    [PermitCriterionId.SIZE_SPAN]: () => evaluateSizeSpan(project),
  };
  const presentationOrder: PermitCriterionId[] = [
    PermitCriterionId.ROOF_AREA,
    PermitCriterionId.STORY_HEIGHT,
    PermitCriterionId.FOUNDATION,
    PermitCriterionId.ATTACHMENT,
    PermitCriterionId.USE,
    PermitCriterionId.ECA,
    PermitCriterionId.SIZE_SPAN,
  ];

  const criteria: PermitCriterionResult[] = [];
  for (const id of presentationOrder) {
    if (ruleTypesAllIn(activeRuleTypes, PERMIT_CRITERION_RULE_DEPENDENCIES[id])) criteria.push(evaluators[id]());
    else if (DISCRETIONARY_PERMIT_CRITERIA.has(id)) criteria.push(deferredEcaCriterion(ecaFindings));
    // A non-discretionary criterion whose rule is not ACTIVE is simply not evaluated or listed.
  }

  const foundationDisqualifierActive = ruleTypesAllIn(activeRuleTypes, PERMIT_REVIEW_PATH_FOUNDATION_DISQUALIFIER_RULE_TYPES);
  const { buildingPermit, reviewPath } = deriveBuildingPermitState(criteria, project.foundationType, foundationDisqualifierActive);
  // REQUIRED stands on any single conclusive active disqualifier; every other conclusion needs the
  // full deterministic set (otherwise an unevaluated criterion could hide a disqualifier).
  if (buildingPermit !== BuildingPermitStatus.REQUIRED && !ruleTypesAllIn(activeRuleTypes, DETERMINISTIC_PERMIT_RULE_TYPES)) return undefined;

  const finding: PermitRequirementFinding = {
    buildingPermit,
    reviewPath,
    criteria,
    tradePermitDisclosures: buildTradePermitDisclosures(project.utilityIntent),
  };
  const reviewPathNote = reviewPathEcaNote(criteria, project.foundationType, foundationDisqualifierActive, { buildingPermit, reviewPath });
  if (reviewPathNote) finding.reviewPathNote = reviewPathNote;
  if (!ruleTypesAllIn(activeRuleTypes, PERMIT_CRITERION_RULE_DEPENDENCIES[PermitCriterionId.ECA])) {
    const otherExemptionCriteria: PermitCriterionId[] = [
      PermitCriterionId.ROOF_AREA,
      PermitCriterionId.STORY_HEIGHT,
      PermitCriterionId.FOUNDATION,
      PermitCriterionId.ATTACHMENT,
      PermitCriterionId.USE,
    ];
    const byId = new Map(criteria.map((c) => [c.criterionId, c.status]));
    const allOtherExemptionCriteriaMet = otherExemptionCriteria.every((id) => byId.get(id) === PermitCriterionStatus.MET);
    finding.ecaDeferral = { allOtherExemptionCriteriaMet, ...(allOtherExemptionCriteriaMet ? { note: ECA_DETERMINATION_NOTE } : {}) };
  }
  return finding;
}

/** P2b - a separate, ordinary, location-sensitive zoning Finding, never nested inside
 * PermitRequirementFinding and never implied by buildingPermit === LIKELY_EXEMPT (BR-U6B-9). */
function evaluateAccessoryHeightLimit(project: ShedProjectDetails): Finding {
  const subject = "Accessory structure height limit";
  let limit: AccessoryStructureHeightLimit;
  if (project.isInRequiredSetback === undefined) {
    // Founder-directed bounded-band derivation (2026-09-23) - cite the specific evidence gap(s)
    // pipeline.ts's deriveIsInRequiredSetback identified, never a generic "unavailable" message
    // when a specific cause is known (aidlc-docs/decisions/2026-09-17-side-street-setback-current
    // -code-research.md's "Correction (2026-09-23, same day)" section).
    const reasons = project.requiredSetbackEvidenceGapReasons;
    const reason =
      reasons && reasons.length > 0
        ? `Whether the shed's proposed placement falls inside a required setback is unresolved: ${reasons.join("; ")}.`
        : "Whether the shed's proposed placement falls inside a required setback is unresolved.";
    limit = { basis: "REQUIRES_VERIFICATION", reason };
  } else if (project.isInRequiredSetback) {
    limit = { basis: "IN_REQUIRED_SETBACK", limitFt: 12, roofMayNotExceedLimit: true };
  } else {
    limit = { basis: "OUTSIDE_REQUIRED_SETBACK", limitFt: 32, citation: "SMC 23.44.070" };
  }

  if (limit.basis === "REQUIRES_VERIFICATION") {
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject,
      supportingEvidence: [],
      explanationBasis: limit.reason,
    };
  }

  const pass = project.heightFt <= limit.limitFt;
  const supportingEvidence = [`heightFt=${project.heightFt}`, `basis=${limit.basis}`, `limitFt=${limit.limitFt}`];
  if (pass) {
    return {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.PASS,
      supportingEvidence,
      explanationBasis: `Height ${project.heightFt}ft meets the ${limit.limitFt}ft limit that applies (${limit.basis === "IN_REQUIRED_SETBACK" ? "shed is in a required setback, SMC 23.44.070" : "shed is outside every required setback, SMC 23.44.070"}).`,
    };
  }
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    supportingEvidence,
    explanationBasis: `Height ${project.heightFt}ft exceeds the ${limit.limitFt}ft limit that applies (SMC 23.44.070), but that section carries its own roof/height exceptions not enumerated here - cannot be confirmed as a definite failure without resolving whether an exception applies.`,
  };
}

const ECA_HAZARD_TYPE_TO_COVERAGE_EXCLUDED_CATEGORY: Record<string, CoverageExcludedEcaCategory> = {
  riparian_corridor: "RIPARIAN_CORRIDOR",
  wetland: "WETLAND_AND_BUFFER",
  wetland_buffer: "WETLAND_AND_BUFFER",
  shoreline_setback: "SUBMERGED_LAND_OR_SHORELINE_SETBACK",
  submerged_land: "SUBMERGED_LAND_OR_SHORELINE_SETBACK",
  steep_slope: "STEEP_SLOPE_NON_DISTURBANCE_AREA",
};

/**
 * C1b: no SMC 23.44.080.B category can be ruled out by mapped data today (2026-10-06 analysis,
 * aidlc-docs/decisions/2026-10-06-unit-6b-blocker-resolution.md). SMC 25.09.030.A: "The Department's
 * maps are advisory except" geologic-hazard (peat/seismic/volcanic) maps, FEMA flood maps, WDFW-mapped
 * areas and peat maps for parcels <= 50,000 sq ft - none of which are a 23.44.080.B category.
 * - RIPARIAN_CORRIDOR: riparian watercourse (Type F/Np/Ns per WAC) + 100 ft from the field-surveyed
 *   ordinary high water mark (25.09.012.D.5); the ECA layer is advisory and does not carry field-surveyed
 *   OHWM or WAC watercourse typing.
 * - WETLAND_AND_BUFFER: wetland by field criteria (25.09.012.C); buffer width by category AND habitat
 *   function (25.09.160 Table A); the layer lacks habitat function and is advisory.
 * - SUBMERGED_LAND_OR_SHORELINE_SETBACK: Shoreline District, SMC 23.60A; setback contextual/discretionary;
 *   the available layer is an environment-designation overlay, not submerged-land/setback geometry.
 * - STEEP_SLOPE_NON_DISTURBANCE_AREA: 23.44.080.E = all steep-slope hazard areas (>=40% over 10 ft, measured,
 *   25.09.012.A.3.b.5) except relief/waiver/variance areas; the steep-slope layer is advisory and cannot
 *   show absence, and the exceptions are permit-specific/discretionary.
 * Hence a mapped NO_INTERSECTION never rules a category out. A future dispositive source may flip an
 * entry to true; nothing else changes. A mapped INTERSECTS is an indication, not an establishment.
 */
const CATEGORY_RULED_OUT_BY_NO_INTERSECTION: Record<CoverageExcludedEcaCategory, boolean> = {
  RIPARIAN_CORRIDOR: false,
  WETLAND_AND_BUFFER: false,
  SUBMERGED_LAND_OR_SHORELINE_SETBACK: false,
  STEEP_SLOPE_NON_DISTURBANCE_AREA: false,
};

/** C1b/C1e - only the 4 SMC 23.44.080.B-named categories ever participate (BR-U6B-12). No
 * excluded-area geometry computation is wired for shed (see CATEGORY_RULED_OUT_BY_NO_INTERSECTION
 * for why none can be established), so ESTABLISHED is not reachable from this function today.
 * NOT_APPLICABLE is returned ONLY when the evidence rules out the complete exclusion area of every
 * category; otherwise REQUIRES_VERIFICATION - never fabricated, and never a false "no exclusion
 * applies" from a polygon that merely misses the parcel or an advisory map's silence. */
function evaluateEcaLotAreaAdjustment(
  ecaFindings: CriticalAreaFinding[],
  /** Injectable only so tests can exercise the rule logic under hypothetical dispositive evidence;
   * production always uses CATEGORY_RULED_OUT_BY_NO_INTERSECTION. */
  ruledOutByNoIntersection: Record<CoverageExcludedEcaCategory, boolean> = CATEGORY_RULED_OUT_BY_NO_INTERSECTION
): EcaLotAreaAdjustment {
  const findingsByCategory = new Map<CoverageExcludedEcaCategory, CriticalAreaFinding[]>();
  for (const finding of ecaFindings) {
    const category = ECA_HAZARD_TYPE_TO_COVERAGE_EXCLUDED_CATEGORY[finding.hazardType];
    if (category) findingsByCategory.set(category, [...(findingsByCategory.get(category) ?? []), finding]);
  }

  const unresolvedCategories: CoverageExcludedEcaCategory[] = [];
  const mapIndicatedCategories: CoverageExcludedEcaCategory[] = [];
  for (const category of Object.values(CoverageExcludedEcaCategory)) {
    const findings = findingsByCategory.get(category) ?? [];
    const ruledOut = ruledOutByNoIntersection[category] && findings.length > 0 && findings.every((f) => f.mappedIntersectionResult === MappedIntersectionResult.NO_INTERSECTION);
    if (!ruledOut) unresolvedCategories.push(category);
    if (findings.some((f) => f.mappedIntersectionResult !== MappedIntersectionResult.NO_INTERSECTION)) mapIndicatedCategories.push(category);
  }

  if (unresolvedCategories.length === 0) {
    return {
      status: "NOT_APPLICABLE",
      reason: "Available mapped evidence rules out the complete exclusion area of every SMC 23.44.080.B-named category for this parcel.",
    };
  }
  return {
    status: "REQUIRES_VERIFICATION",
    intersectingCategories: unresolvedCategories,
    mapIndicatedCategories,
    reason:
      "A SMC 23.44.080.B-named lot-area-exclusion category may intersect this parcel, or cannot be ruled out from the mapped data (the City's environmentally critical area maps are advisory, SMC 25.09.030.A, and regulatory buffers and setback areas are not modeled), so the lot-coverage denominator is not established by this evaluation.",
  };
}

/** Flow 4 - the CASE A/B/C banding between the base (C1a, 50%) and potential special (C1c/C1d,
 * 60%) allowances, including the asymmetric fail-closed override for an unresolved C1b
 * denominator. `allowanceFacts` is computed here, not supplied by the caller - a pure derivation
 * of `ecaAdjustment`/`parcelAreaSqFt` (domain-entities.md §3c). */
function evaluateShedLotCoverage(
  input: Omit<ShedLotCoverageFacts, "allowanceFacts">,
  /** Any claim that a Director-approved alternative may be relevant depends on C1e-director being
   * ACTIVE. Defaults to false (fail-closed): without it only the neutral parcel-specific-approval
   * disclosure is emitted and no result mentions a Director alternative. */
  options: { directorAlternativeRuleActive?: boolean } = {}
): ShedLotCoverageResult {
  const { ecaAdjustment, parcelAreaSqFt, existingMappedCoverageSqFt, proposedShedFootprintSqFt } = input;
  const directorAlternativeRuleActive = options.directorAlternativeRuleActive === true;

  let adjustedLotAreaSqFt = parcelAreaSqFt;
  let c1eFloorSqFt: 625 | undefined;
  let c1eDirectorAlternativeRelevant = false;

  if (ecaAdjustment.status === "ESTABLISHED") {
    adjustedLotAreaSqFt = parcelAreaSqFt - ecaAdjustment.excludedAreaSqFt;
    if (ecaAdjustment.minimumCoverageFloor.status === "KNOWN") {
      c1eFloorSqFt = 625;
    }
    c1eDirectorAlternativeRelevant = directorAlternativeRuleActive && ecaAdjustment.minimumCoverageFloor.status === "REQUIRES_VERIFICATION";
  }

  const facts: ShedLotCoverageFacts = {
    ...input,
    allowanceFacts: { adjustedLotAreaSqFt, c1eFloorSqFt, c1eDirectorAlternativeRelevant },
  };

  const baseAllowanceSqFt = Math.max(adjustedLotAreaSqFt * 0.5, c1eFloorSqFt ?? 0);
  const potentialSpecialAllowanceSqFt = Math.max(adjustedLotAreaSqFt * 0.6, c1eFloorSqFt ?? 0);
  const estimatedCoverageSqFt = existingMappedCoverageSqFt + proposedShedFootprintSqFt;

  if (ecaAdjustment.status === "REQUIRES_VERIFICATION") {
    // Optimistic ceiling: exclusions only shrink the denominator, so the full parcel is the most
    // generous case - but if a SMC 23.44.080.B area is present the 625 sq ft floor (23.44.080.D) could
    // exceed 60% of a very small parcel, so the ceiling is the greater of the two.
    const optimisticPotentialSpecialAllowanceSqFt = Math.max(parcelAreaSqFt * 0.6, 625);
    if (estimatedCoverageSqFt > optimisticPotentialSpecialAllowanceSqFt) {
      // A Director-approved alternative (23.44.080.D, via a Chapter 25.09 reduction/waiver/modification)
      // exists only on lots with a 23.44.080.B area. When a mapped layer positively indicates one,
      // the alternative MAY be relevant (never "applies"); with no map indication the existing
      // hedged "appears exceeded" result stands.
      if (directorAlternativeRuleActive && (ecaAdjustment.mapIndicatedCategories?.length ?? 0) > 0) {
        return {
          status: "REQUIRES_VERIFICATION",
          reason: "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE",
          estimatedCoverageSqFt,
          potentialSpecialAllowanceSqFt: optimisticPotentialSpecialAllowanceSqFt,
          facts: { ...facts, allowanceFacts: { ...facts.allowanceFacts, c1eDirectorAlternativeRelevant: true } },
        };
      }
      return {
        status: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE",
        estimatedCoverageSqFt,
        potentialSpecialAllowanceSqFt: optimisticPotentialSpecialAllowanceSqFt,
        facts,
        exclusionTolerance: computeLotCoverageExclusionTolerance(parcelAreaSqFt, estimatedCoverageSqFt),
        parcelSpecificApprovalDisclosure: PARCEL_SPECIFIC_APPROVAL_DISCLOSURE,
      };
    }
    return {
      status: "REQUIRES_VERIFICATION",
      reason: "LOT_AREA_ADJUSTMENT_UNRESOLVED",
      estimatedCoverageSqFt,
      facts,
      exclusionTolerance: computeLotCoverageExclusionTolerance(parcelAreaSqFt, estimatedCoverageSqFt),
      parcelSpecificApprovalDisclosure: PARCEL_SPECIFIC_APPROVAL_DISCLOSURE,
    };
  }

  if (estimatedCoverageSqFt <= baseAllowanceSqFt) {
    return { status: "WITHIN_STANDARD_ALLOWANCE", estimatedCoverageSqFt, baseAllowanceSqFt, facts };
  }
  if (estimatedCoverageSqFt <= potentialSpecialAllowanceSqFt) {
    return {
      status: "REQUIRES_VERIFICATION",
      reason: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE",
      estimatedCoverageSqFt,
      baseAllowanceSqFt,
      potentialSpecialAllowanceSqFt,
      facts,
    };
  }
  if (c1eDirectorAlternativeRelevant) {
    return {
      status: "REQUIRES_VERIFICATION",
      reason: "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE",
      estimatedCoverageSqFt,
      potentialSpecialAllowanceSqFt,
      facts,
    };
  }
  return { status: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE", estimatedCoverageSqFt, potentialSpecialAllowanceSqFt, facts };
}

export {
  evaluateRoofArea,
  evaluateStoryHeight,
  evaluateFoundationExemption,
  evaluateAttachment,
  evaluateUse,
  evaluateEcaPermitCriterion,
  evaluateSizeSpan,
  foundationStfiDisqualification,
  deriveBuildingPermitState,
  buildTradePermitDisclosures,
  evaluateShedPermitRequirement,
  evaluateShedPermitRequirementForActiveRules,
  evaluateAccessoryHeightLimit,
  evaluateEcaLotAreaAdjustment,
  evaluateShedLotCoverage,
};
