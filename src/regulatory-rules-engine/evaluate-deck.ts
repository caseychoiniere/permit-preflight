/**
 * Unit 8 (Decks) regulatory evaluation. Pure function - no I/O. A separate entry point from
 * `evaluateProject` (like evaluate-fence.ts); the shed and garage paths are untouched.
 *
 * OUTCOME-DEPENDENCY MODEL: a claim is made only when every rule REQUIRED FOR THAT CLAIM is ACTIVE and
 * well-formed (DECK_OUTCOME_DEPENDENCIES). Every numeric threshold comes from the ACTIVE rule row's own
 * `ruleSpecification`; this module contains no SMC number as a literal. All inputs are USER-DECLARED and
 * every explanation says so.
 *
 * Fail-closed: a deck above the automatic setback allowance is NEVER reported as a violation - the code
 * text has further allowances (SMC 23.44.090.H.8 rear setback, E.4 porches/steps), so the result is
 * REQUIRES_VERIFICATION naming the ones that could apply (functional-design.md §1 source-conflict note).
 */

import { zoningApplicabilityFindings, type ZoningApplicability } from "./zoning-applicability.js";
import { LifecycleState } from "../regulatory-rule-governance/types.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { DeckAttachment, DeckBuildingRelation, DeckSetbackLocation } from "../screening-request/types.js";
import { ComplianceOutcome, FindingClassification } from "./types.js";
import type { Finding } from "./types.js";
import { DeckPermitCriterionId, DeckReviewPath, DeckRuleType } from "./deck-types.js";
import type {
  DeckDeclaredInput,
  DeckEvaluationOutcome,
  DeckLotCoverageThresholdRuleSpec,
  DeckPermitCriterionResult,
  DeckPermitExemptionRuleSpec,
  DeckPermitRequirement,
  DeckProjectDetails,
  DeckSetbackHeightAllowanceRuleSpec,
  DeckStfiEligibilityRuleSpec,
} from "./deck-types.js";

export const DECK_OUTCOME_DEPENDENCIES = {
  SETBACK_FINDING: [DeckRuleType.SETBACK_HEIGHT_ALLOWANCE],
  LOT_COVERAGE_FINDING: [DeckRuleType.LOT_COVERAGE_THRESHOLD],
  PERMIT_REQUIRED: [DeckRuleType.PERMIT_EXEMPTION],
  /** The "turns only on ECA status" result states SDCI's ECA condition, so it depends on D5 as well. */
  PERMIT_REQUIRES_VERIFICATION: [DeckRuleType.PERMIT_EXEMPTION, DeckRuleType.ECA_CONDITION],
  REVIEW_PATH: [DeckRuleType.STFI_ELIGIBILITY],
  EXEMPTION_DISCLAIMER: [DeckRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE],
} as const;

const LOCATION_LABEL: Record<DeckSetbackLocation, string> = {
  [DeckSetbackLocation.FRONT_SETBACK]: "front setback",
  [DeckSetbackLocation.STREET_SIDE_SETBACK]: "street-side setback",
  [DeckSetbackLocation.SIDE_SETBACK]: "side setback",
  [DeckSetbackLocation.REAR_SETBACK]: "rear setback",
  [DeckSetbackLocation.OUTSIDE_REQUIRED_SETBACKS]: "outside required setbacks",
};
const LOCATION_ORDER: DeckSetbackLocation[] = [
  DeckSetbackLocation.FRONT_SETBACK,
  DeckSetbackLocation.STREET_SIDE_SETBACK,
  DeckSetbackLocation.SIDE_SETBACK,
  DeckSetbackLocation.REAR_SETBACK,
  DeckSetbackLocation.OUTSIDE_REQUIRED_SETBACKS,
];

const DECLARED_BASIS = "Based on the deck details you entered (not measured from the site).";

export const DECK_PERMIT_DISCLOSURES: readonly string[] = [
  "Structural design, ledger connection to the house, guardrails, stairs, and other building-code requirements are not evaluated.",
  "Lot coverage is not estimated for decks, and critical-area, shoreline, right-of-way and covenant requirements are not evaluated.",
];

const ECA_NOTE =
  "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in or near an environmentally critical area (ECA): SDCI requires a permit for a deck in an ECA and a pre-application site visit for one in or near an ECA. Permit Preflight cannot determine that conclusively from available mapping; SDCI makes that determination.";
const SDCI_SETBACK_GUIDANCE =
  "SDCI's published guidance says a deck more than 18 inches above the ground cannot be placed within the required setbacks, while the code text lists further allowances.";
const EXEMPTION_DISCLAIMER = "A building-permit exemption does not waive setback, lot-coverage, or other zoning compliance.";

function ruleTypeOf(rule: RegulatoryRule): string | undefined {
  return (rule.ruleSpecification as { ruleType?: string }).ruleType;
}
function positiveFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
function rearAllowanceOk(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return positiveFinite(r["minDistanceFromRearLotLineFt"]) && positiveFinite(r["maxHeightFt"]) && positiveFinite(r["minSeparationFromDwellingFt"]);
}

/** A malformed specification makes the rule unavailable (fail closed). */
const SPEC_GUARDS: Record<string, (spec: Record<string, unknown>) => boolean> = {
  [DeckRuleType.SETBACK_HEIGHT_ALLOWANCE]: (s) => positiveFinite(s["allowedInSetbackMaxIn"]) && rearAllowanceOk(s["rearSetbackAllowance"]),
  [DeckRuleType.LOT_COVERAGE_THRESHOLD]: (s) => positiveFinite(s["notCountedMaxHeightIn"]),
  [DeckRuleType.PERMIT_EXEMPTION]: (s) => positiveFinite(s["maxHeightIn"]),
  [DeckRuleType.STFI_ELIGIBILITY]: (s) => positiveFinite(s["maxHeightAboveGroundFt"]) && positiveFinite(s["beamLengthDisqualifyingFt"]) && positiveFinite(s["maxAreaSqFt"]),
  [DeckRuleType.ECA_CONDITION]: () => true,
  [DeckRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE]: () => true,
};

interface ActiveRules {
  find<T>(ruleType: DeckRuleType): { rule: RegulatoryRule; spec: T } | undefined;
  missing(required: readonly DeckRuleType[]): DeckRuleType[];
}

function indexActiveRules(candidateActiveRules: RegulatoryRule[]): ActiveRules {
  const byType = new Map<string, RegulatoryRule>();
  for (const rule of candidateActiveRules) {
    if (rule.lifecycleState !== LifecycleState.ACTIVE) continue;
    const type = ruleTypeOf(rule);
    if (!type || !(type in SPEC_GUARDS)) continue;
    if (!SPEC_GUARDS[type]!(rule.ruleSpecification)) continue;
    if (!byType.has(type)) byType.set(type, rule);
  }
  return {
    find<T>(ruleType: DeckRuleType) {
      const rule = byType.get(ruleType);
      return rule ? { rule, spec: rule.ruleSpecification as unknown as T } : undefined;
    },
    missing(required) {
      return required.filter((t) => !byType.has(t));
    },
  };
}

function appliedRule(rule: RegulatoryRule): Pick<RegulatoryRule, "id" | "subject" | "citation"> {
  return { id: rule.id, subject: rule.subject, citation: rule.citation };
}
function num(v: number): string {
  return Number.isInteger(v) ? `${v}` : `${v}`.replace(/(\.\d*?)0+$/, "$1");
}
function inches(v: number): string {
  return `${num(v)} in`;
}

export function describeDeckDeclaredInputs(project: DeckProjectConfigurationLike): DeckDeclaredInput[] {
  const relation: Record<string, string> = {
    [DeckBuildingRelation.OPEN_GROUND_BELOW]: "Open ground below",
    [DeckBuildingRelation.OVER_BASEMENT_OR_STORY_BELOW]: "Over a basement or story below",
    [DeckBuildingRelation.ROOF_DECK]: "A roof deck",
  };
  const rows: DeckDeclaredInput[] = [
    { label: "Height above ground", value: inches(project.heightAboveGradeIn) },
    { label: "Size", value: `${num(project.widthFt)} ft x ${num(project.depthFt)} ft (${num(project.widthFt * project.depthFt)} sq ft)` },
    { label: "Attached to the house", value: project.attachment === DeckAttachment.ATTACHED_TO_DWELLING ? "Yes" : "No (detached)" },
    { label: "What is below the deck", value: relation[project.buildingRelation]! },
    { label: "Where the deck is", value: LOCATION_ORDER.filter((l) => project.setbackLocations.includes(l)).map((l) => LOCATION_LABEL[l]).join("; ") },
    { label: "Solid flooring (no gaps)", value: project.solidFlooring === undefined ? "Not answered" : project.solidFlooring ? "Yes" : "No (gaps between boards)" },
    { label: "Longest beam", value: project.longestBeamFt === undefined ? "Not answered" : `${num(project.longestBeamFt)} ft` },
  ];
  if (project.distanceFromRearLotLineFt !== undefined) rows.push({ label: "Distance from the rear lot line", value: `${num(project.distanceFromRearLotLineFt)} ft` });
  if (project.distanceFromDwellingFt !== undefined) rows.push({ label: "Distance from the dwelling", value: `${num(project.distanceFromDwellingFt)} ft` });
  return rows;
}
/** Either the evaluator's details or the intake configuration (same fields; `projectType` ignored). */
type DeckProjectConfigurationLike = Omit<DeckProjectDetails, "projectType"> & { projectType?: "deck" };

// ---------------------------------------------------------------------------------------------
// Zoning findings
// ---------------------------------------------------------------------------------------------

function rearAllowanceAssessment(project: DeckProjectDetails, spec: DeckSetbackHeightAllowanceRuleSpec["rearSetbackAllowance"]): string {
  const unmet: string[] = [];
  const unknown: string[] = [];
  const met: string[] = [];
  if (project.attachment === DeckAttachment.ATTACHED_TO_DWELLING) unmet.push(`the deck is attached to the dwelling, so it cannot be separated from it by at least ${num(spec.minSeparationFromDwellingFt)} ft`);
  else if (project.distanceFromDwellingFt === undefined) unknown.push(`its distance from the dwelling (at least ${num(spec.minSeparationFromDwellingFt)} ft, eave to eave) was not provided`);
  else if (project.distanceFromDwellingFt < spec.minSeparationFromDwellingFt) unmet.push(`it is ${num(project.distanceFromDwellingFt)} ft from the dwelling, less than the ${num(spec.minSeparationFromDwellingFt)} ft required`);
  else met.push(`it is separated from the dwelling by at least ${num(spec.minSeparationFromDwellingFt)} ft`);

  const heightFt = project.heightAboveGradeIn / 12;
  if (heightFt > spec.maxHeightFt) unmet.push(`it is ${num(Math.round(heightFt * 100) / 100)} ft high, above the ${num(spec.maxHeightFt)} ft limit`);
  else met.push(`it is within the ${num(spec.maxHeightFt)} ft height limit`);

  if (project.distanceFromRearLotLineFt === undefined) unknown.push(`its distance from the rear lot line (at least ${num(spec.minDistanceFromRearLotLineFt)} ft unless the rear lot line is an alley) was not provided`);
  else if (project.distanceFromRearLotLineFt < spec.minDistanceFromRearLotLineFt) unmet.push(`it is ${num(project.distanceFromRearLotLineFt)} ft from the rear lot line, less than ${num(spec.minDistanceFromRearLotLineFt)} ft (this distance requirement does not apply to an alley lot line)`);
  else met.push(`it is at least ${num(spec.minDistanceFromRearLotLineFt)} ft from the rear lot line`);

  const parts: string[] = [];
  if (unmet.length > 0) parts.push(`Based on your answers it does not appear to meet the rear-setback allowance because ${unmet.join("; and ")}.`);
  if (unknown.length > 0) parts.push(`Whether it meets that allowance cannot be confirmed because ${unknown.join("; and ")}.`);
  if (unmet.length === 0 && unknown.length === 0) parts.push(`Based on your answers it appears to meet the rear-setback allowance (${met.join("; ")}); SDCI confirms.`);
  return parts.join(" ");
}

function evaluateSetbackLocation(project: DeckProjectDetails, location: DeckSetbackLocation, rules: ActiveRules): { finding?: Finding; uncovered?: string } {
  const label = LOCATION_LABEL[location];
  const subject = `Deck setback (${label})`;
  const rule = rules.find<DeckSetbackHeightAllowanceRuleSpec>(DeckRuleType.SETBACK_HEIGHT_ALLOWANCE);
  if (!rule) return { uncovered: `deck setback (${label})` };
  const limitIn = rule.spec.allowedInSetbackMaxIn;
  const heightIn = project.heightAboveGradeIn;
  const supportingEvidence = [`declaredHeightIn=${num(heightIn)}`, `allowedInSetbackMaxIn=${num(limitIn)}`, `location=${location}`, `attachment=${project.attachment}`];

  if (location === DeckSetbackLocation.OUTSIDE_REQUIRED_SETBACKS) {
    return {
      finding: {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ComplianceOutcome.PASS,
        appliedRule: appliedRule(rule.rule),
        supportingEvidence,
        explanationBasis: `SMC 23.44.090.H limits unenclosed structures such as decks only within required setbacks. A deck declared outside every required setback is not subject to that limit; this does not mean it satisfies every other requirement. ${DECLARED_BASIS}`,
      },
    };
  }
  if (heightIn <= limitIn) {
    return {
      finding: {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ComplianceOutcome.PASS,
        appliedRule: appliedRule(rule.rule),
        supportingEvidence,
        explanationBasis: `In the ${label}, a deck not more than ${inches(limitIn)} above existing or finished grade is allowed (SMC 23.44.090.H.1); the declared height of ${inches(heightIn)} is within that. ${DECLARED_BASIS}`,
      },
    };
  }

  const lead = `In the ${label}, the automatic allowance for decks (SMC 23.44.090.H.1) covers only decks not more than ${inches(limitIn)} above grade; the declared height is ${inches(heightIn)}. ${SDCI_SETBACK_GUIDANCE}`;
  let detail: string;
  if (location === DeckSetbackLocation.REAR_SETBACK) {
    detail = `One further allowance lets certain unenclosed structures be in a rear setback (SMC 23.44.090.H.8). ${rearAllowanceAssessment(project, rule.spec.rearSetbackAllowance)} Whether any allowance applies to this deck is for SDCI to determine.`;
  } else {
    detail =
      "The only further allowance identified for this area is for unenclosed porches or steps (SMC 23.44.090.E.4). Whether this deck qualifies for it, or for any other allowance, is for SDCI to determine.";
  }
  return {
    finding: {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject,
      appliedRule: appliedRule(rule.rule),
      supportingEvidence,
      explanationBasis: `${lead} ${detail} ${DECLARED_BASIS}`,
    },
  };
}

function evaluateLotCoverage(project: DeckProjectDetails, rules: ActiveRules): { finding?: Finding; uncovered?: string } {
  const rule = rules.find<DeckLotCoverageThresholdRuleSpec>(DeckRuleType.LOT_COVERAGE_THRESHOLD);
  if (!rule) return { uncovered: "deck lot coverage" };
  const thresholdIn = rule.spec.notCountedMaxHeightIn;
  const heightIn = project.heightAboveGradeIn;
  const supportingEvidence = [`declaredHeightIn=${num(heightIn)}`, `notCountedMaxHeightIn=${num(thresholdIn)}`];
  if (heightIn <= thresholdIn) {
    return {
      finding: {
        classification: FindingClassification.KNOWN,
        subject: "Deck and lot coverage",
        appliedRule: appliedRule(rule.rule),
        supportingEvidence,
        explanationBasis: `A deck, or the part of a deck, that is ${inches(thresholdIn)} or less above existing grade is not counted in lot coverage (SMC 23.44.080.C.3); the declared height is ${inches(heightIn)}. ${DECLARED_BASIS}`,
      },
    };
  }
  return {
    finding: {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: "Deck and lot coverage",
      appliedRule: appliedRule(rule.rule),
      supportingEvidence,
      explanationBasis: `The code excludes from lot coverage only decks, or parts of a deck, that are ${inches(thresholdIn)} or less above existing grade (SMC 23.44.080.C.3), so any part of a deck above ${inches(thresholdIn)} counts toward lot coverage. The declared greatest height is ${inches(heightIn)}, so at least part of this deck counts; how much depends on how much of it is above ${inches(thresholdIn)}, which Permit Preflight does not determine. Permit Preflight does not estimate lot coverage for decks, so whether this deck affects the lot-coverage limit is not determined. ${DECLARED_BASIS}`,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Building permit and review path
// ---------------------------------------------------------------------------------------------

function evaluateReviewPath(project: DeckProjectDetails, spec: DeckStfiEligibilityRuleSpec): { path: DeckReviewPath; reasons: string[] } {
  const disqualifiers: string[] = [];
  const unknown: string[] = [];
  const heightFt = project.heightAboveGradeIn / 12;
  if (heightFt > spec.maxHeightAboveGroundFt) disqualifiers.push(`the deck is more than ${num(spec.maxHeightAboveGroundFt)} ft above the ground`);
  if (project.buildingRelation === DeckBuildingRelation.ROOF_DECK) disqualifiers.push("it is a roof deck");
  if (project.longestBeamFt === undefined) unknown.push(`you did not say whether any beam is ${num(spec.beamLengthDisqualifyingFt)} ft or longer`);
  else if (project.longestBeamFt >= spec.beamLengthDisqualifyingFt) disqualifiers.push(`it has a beam ${num(spec.beamLengthDisqualifyingFt)} ft or longer`);
  if (project.solidFlooring === undefined) unknown.push("you did not say whether the flooring is solid (no gaps between boards)");
  else if (project.solidFlooring) disqualifiers.push("the flooring is solid (no gaps between boards)");
  const area = project.widthFt * project.depthFt;
  if (area > spec.maxAreaSqFt) disqualifiers.push(`it is over ${num(spec.maxAreaSqFt)} sq ft (${num(area)} sq ft)`);

  if (disqualifiers.length > 0) return { path: DeckReviewPath.FULL_REVIEW_LIKELY, reasons: disqualifiers.map((d) => `A full review is likely because ${d}.`) };
  if (unknown.length > 0) return { path: DeckReviewPath.REQUIRES_VERIFICATION, reasons: unknown.map((u) => `The review path cannot be confirmed because ${u}.`) };
  // Fail closed: every screened criterion is met, but SDCI lists an ECA as a full-review trigger and ECA status cannot be determined.
  return {
    path: DeckReviewPath.REQUIRES_VERIFICATION,
    reasons: [
      "Every screened criterion for a simple (subject-to-field-inspection) permit is met. The remaining question is whether the site is in an environmentally critical area, where SDCI requires a full review. Permit Preflight cannot determine that, so the review path is not confirmed.",
    ],
  };
}

function evaluatePermit(project: DeckProjectDetails, rules: ActiveRules): { permit?: DeckPermitRequirement; uncovered?: string } {
  const exemption = rules.find<DeckPermitExemptionRuleSpec>(DeckRuleType.PERMIT_EXEMPTION);
  const ecaRule = rules.find<Record<string, never>>(DeckRuleType.ECA_CONDITION);
  const stfi = rules.find<DeckStfiEligibilityRuleSpec>(DeckRuleType.STFI_ELIGIBILITY);

  const criteria: DeckPermitCriterionResult[] = [];
  if (exemption) {
    const max = exemption.spec.maxHeightIn;
    criteria.push({
      criterionId: DeckPermitCriterionId.HEIGHT,
      status: project.heightAboveGradeIn <= max ? "MET" : "NOT_MET",
      explanationBasis:
        project.heightAboveGradeIn <= max
          ? `The deck is ${inches(project.heightAboveGradeIn)} above grade, not more than ${inches(max)}.`
          : `The deck is ${inches(project.heightAboveGradeIn)} above grade, more than ${inches(max)}, so the permit exemption for low platforms does not apply.`,
    });
    const openGround = project.buildingRelation === DeckBuildingRelation.OPEN_GROUND_BELOW;
    criteria.push({
      criterionId: DeckPermitCriterionId.STRUCTURE_BELOW,
      status: openGround ? "MET" : "NOT_MET",
      explanationBasis: openGround
        ? "There is no basement or story below the deck."
        : project.buildingRelation === DeckBuildingRelation.ROOF_DECK
          ? "The deck is a roof deck, built over part of the building, so the permit exemption does not apply."
          : "The deck is over a basement or story below, so the permit exemption does not apply.",
    });
  }

  const anyNotMet = criteria.some((c) => c.status === "NOT_MET");
  const allRequired = rules.missing(DECK_OUTCOME_DEPENDENCIES.PERMIT_REQUIRES_VERIFICATION).length === 0;
  // REQUIRED stands on any single conclusive active disqualifier; every other conclusion needs both rules.
  if (!anyNotMet && !allRequired) return { uncovered: "deck building permit" };

  if (ecaRule) {
    criteria.push({
      criterionId: DeckPermitCriterionId.ECA,
      status: "REQUIRES_VERIFICATION",
      explanationBasis:
        "Whether the site is in or near an environmentally critical area (ECA), where SDCI requires a permit for a deck in an ECA and a pre-application site visit for one in or near an ECA, is a determination SDCI makes; Permit Preflight does not make it from available mapping.",
    });
  }

  const byId = new Map(criteria.map((c) => [c.criterionId, c.status]));
  const turnsOnlyOnEcaStatus = !anyNotMet && Boolean(ecaRule) && byId.get(DeckPermitCriterionId.HEIGHT) === "MET" && byId.get(DeckPermitCriterionId.STRUCTURE_BELOW) === "MET";
  const permit: DeckPermitRequirement = {
    buildingPermit: anyNotMet ? "REQUIRED" : "REQUIRES_VERIFICATION",
    criteria,
    turnsOnlyOnEcaStatus,
    disclosures: [...DECK_PERMIT_DISCLOSURES],
  };
  if (turnsOnlyOnEcaStatus) {
    permit.note = ECA_NOTE;
    if (rules.missing(DECK_OUTCOME_DEPENDENCIES.EXEMPTION_DISCLAIMER).length === 0) permit.exemptionDisclaimer = EXEMPTION_DISCLAIMER;
  }
  if (anyNotMet && stfi) {
    const { path, reasons } = evaluateReviewPath(project, stfi.spec);
    permit.reviewPath = path;
    permit.reviewPathReasons = reasons;
  }
  return { permit };
}

// ---------------------------------------------------------------------------------------------

export interface EvaluateDeckInput {
  project: DeckProjectDetails;
  /** Re-filtered to ACTIVE defensively; callers pre-filter by applicableProjectType = "deck". */
  candidateActiveRules: RegulatoryRule[];
  /** Unit 11 Slice 1. Undefined = zoning not retrieved (treated as unresolved: pre-existing behavior). */
  zoningApplicability?: ZoningApplicability;
}

export function evaluateDeck(input: EvaluateDeckInput): DeckEvaluationOutcome {
  const rules = indexActiveRules(input.candidateActiveRules);
  const { project } = input;
  const findings: Finding[] = [];
  const uncovered: string[] = [];

  // Verifiably not Neighborhood Residential: the NR setback and lot-coverage statements are withheld; the
  // zone-independent building-permit determination stands.
  if (input.zoningApplicability?.status === "NOT_NR") {
    uncovered.push("deck zoning limits (parcel is not in a Neighborhood Residential zone)");
  } else {
    for (const location of LOCATION_ORDER) {
      if (!project.setbackLocations.includes(location)) continue;
      const r = evaluateSetbackLocation(project, location, rules);
      if (r.finding) findings.push(r.finding);
      if (r.uncovered) uncovered.push(r.uncovered);
    }
    const coverage = evaluateLotCoverage(project, rules);
    if (coverage.finding) findings.push(coverage.finding);
    if (coverage.uncovered) uncovered.push(coverage.uncovered);
  }
  findings.push(...zoningApplicabilityFindings(input.zoningApplicability, "deck rules"));

  const permit = evaluatePermit(project, rules);
  if (permit.uncovered) uncovered.push(permit.uncovered);

  return {
    findings,
    ...(permit.permit ? { permitRequirement: permit.permit } : {}),
    declaredInputs: describeDeckDeclaredInputs(project),
    uncoveredConstraintTypes: [...new Set(uncovered)],
  };
}
