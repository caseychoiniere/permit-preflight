/**
 * Unit 7 (Fences) regulatory evaluation. Pure function - no I/O. A genuinely separate entry point
 * from `evaluateProject` (like evaluate-vacant-land.ts), never routed through it, so the shed and
 * garage paths are untouched.
 *
 * OUTCOME-DEPENDENCY MODEL (same discipline as evaluate.ts's Unit 6B gating): a claim is made only
 * when every rule REQUIRED FOR THAT CLAIM is ACTIVE (and its specification is well-formed); an
 * inactive rule never contributes a conclusion. See DEPENDENCIES below and
 * aidlc-docs/construction/unit-7-fences/functional-design.md §6.
 *
 * Every numeric threshold comes from the ACTIVE rule row's own `ruleSpecification`; this module
 * contains no SMC number as a literal. All inputs are USER-DECLARED and every explanation says so.
 */

import { LifecycleState } from "../regulatory-rule-governance/types.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { MappedIntersectionResult } from "../spatial-analysis/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import { FenceLocation, FenceWallRelation } from "../screening-request/types.js";
import { ComplianceOutcome, FindingClassification } from "./types.js";
import type { Finding } from "./types.js";
import { FencePermitCriterionId, FenceRuleType } from "./fence-types.js";
import type {
  FenceDeclaredInput,
  FenceEvaluationOutcome,
  FenceHeightFrontStreetSideRuleSpec,
  FenceHeightStandardRuleSpec,
  FenceOutsideSetbacksRuleSpec,
  FencePermitCriterionResult,
  FencePermitHeightRuleSpec,
  FencePermitMasonryRuleSpec,
  FencePermitRequirement,
  FenceProjectDetails,
  FenceRetainingWallRuleSpec,
} from "./fence-types.js";

/** Explicit outcome dependencies (functional-design.md §4-§6). Documentation made executable: each
 * evaluator below fetches exactly the rules listed for its claim. */
export const FENCE_OUTCOME_DEPENDENCIES = {
  HEIGHT_FRONT_OR_STREET_SIDE: [FenceRuleType.HEIGHT_FRONT_STREET_SIDE],
  HEIGHT_OTHER_SIDE_OR_REAR: [FenceRuleType.HEIGHT_STANDARD],
  HEIGHT_OUTSIDE_REQUIRED_SETBACKS: [FenceRuleType.OUTSIDE_REQUIRED_SETBACKS],
  /** Added to a location's dependencies only when the fence stands on a wall (the 4-ft cap). */
  HEIGHT_ON_WALL_ADDITIONAL: [FenceRuleType.RETAINING_WALL],
  WALL_FINDING: [FenceRuleType.RETAINING_WALL],
  PERMIT_REQUIRED_BY_HEIGHT: [FenceRuleType.PERMIT_HEIGHT_EXEMPTION],
  PERMIT_REQUIRED_BY_MASONRY: [FenceRuleType.PERMIT_MASONRY_CONCRETE],
  /** The "turns only on flood-prone status" result states SDCI's flood-prone permit condition, so it depends on F8 as well. */
  PERMIT_REQUIRES_VERIFICATION: [FenceRuleType.PERMIT_HEIGHT_EXEMPTION, FenceRuleType.PERMIT_MASONRY_CONCRETE, FenceRuleType.PERMIT_FLOOD_PRONE_CONDITION],
  /** The "exemption is not zoning compliance" disclaimer is a governed claim (F7). */
  PERMIT_EXEMPTION_DISCLAIMER: [FenceRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE],
} as const;

const LOCATION_LABEL: Record<FenceLocation, string> = {
  [FenceLocation.FRONT_SETBACK]: "front setback",
  [FenceLocation.STREET_SIDE_SETBACK]: "street-side setback",
  [FenceLocation.OTHER_SIDE_OR_REAR_SETBACK]: "side or rear setback",
  [FenceLocation.OUTSIDE_REQUIRED_SETBACKS]: "outside required setbacks",
};
const LOCATION_ORDER: FenceLocation[] = [
  FenceLocation.FRONT_SETBACK,
  FenceLocation.STREET_SIDE_SETBACK,
  FenceLocation.OTHER_SIDE_OR_REAR_SETBACK,
  FenceLocation.OUTSIDE_REQUIRED_SETBACKS,
];

const DECLARED_BASIS = "Based on the fence details you entered (not measured from the site).";

export const FENCE_PERMIT_DISCLOSURES: readonly string[] = [
  "Sight-distance, driveway and alley visibility requirements, public right-of-way and street-use rules, boundary and neighbor matters, covenants or HOA rules, critical-area and shoreline restrictions, and zoning standards other than fence height by location are not evaluated.",
  "A retaining wall or bulkhead is regulated separately from the fence; only the fence-related height and setback checks above are made here.",
];

const FLOOD_NOTE =
  "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in a flood-prone area, where SDCI requires a construction permit. Permit Preflight cannot determine that conclusively from available mapping; SDCI makes that determination.";
const EXEMPTION_DISCLAIMER = "A building-permit exemption does not waive fence-height, setback, or other zoning compliance.";
const PERMIT_PATH_NOTE = "SDCI states that most fences needing a permit require only a construction subject-to-field-inspection permit; SDCI determines the review path.";
const ZONING_SCOPE_EXPLANATION =
  "These fence rules are Seattle's Neighborhood Residential zone rules (SMC 23.44.090.H). Permit Preflight did not verify this parcel's zoning, so it cannot confirm they apply to this property; a parcel in a different zone can have different fence limits. SDCI determines the applicable zone and rules.";
const SIGHT_DISTANCE_EXPLANATION =
  "Seattle can limit fences and other obstructions near intersections, driveways and alleys to keep drivers able to see. Permit Preflight has no intersection or driveway geometry and no verified rule text for this, so it does not evaluate it and makes no statement that it is satisfied. SDCI and SDOT determine it.";

function ruleTypeOf(rule: RegulatoryRule): string | undefined {
  return (rule.ruleSpecification as { ruleType?: string }).ruleType;
}

function positiveFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** Specification guards: a malformed specification makes the rule unavailable (fail closed) rather
 * than letting NaN/undefined silently compare as false. */
const SPEC_GUARDS: Record<string, (spec: Record<string, unknown>) => boolean> = {
  [FenceRuleType.HEIGHT_STANDARD]: (s) => positiveFinite(s["maxFt"]) && positiveFinite(s["openFeatureAllowanceFt"]) && positiveFinite(s["absoluteMaxFt"]),
  [FenceRuleType.HEIGHT_FRONT_STREET_SIDE]: (s) => positiveFinite(s["maxFt"]) && positiveFinite(s["absoluteMaxFt"]),
  [FenceRuleType.RETAINING_WALL]: (s) =>
    positiveFinite(s["fenceOnWallMaxFt"]) && positiveFinite(s["combinedMaxFt"]) && positiveFinite(s["raisingGradeWallMaxFt"]) && positiveFinite(s["cutWallFenceSetbackFt"]),
  [FenceRuleType.OUTSIDE_REQUIRED_SETBACKS]: (s) => positiveFinite(s["generalStructureHeightLimitFt"]),
  [FenceRuleType.PERMIT_HEIGHT_EXEMPTION]: (s) => positiveFinite(s["maxFt"]),
  [FenceRuleType.PERMIT_MASONRY_CONCRETE]: (s) => positiveFinite(s["elementsAboveFt"]),
  [FenceRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE]: () => true,
  [FenceRuleType.PERMIT_FLOOD_PRONE_CONDITION]: () => true,
};

interface ActiveRules {
  find<T>(ruleType: FenceRuleType): { rule: RegulatoryRule; spec: T } | undefined;
  /** Rule types (from `required`) that are not available - for uncovered reporting. */
  missing(required: readonly FenceRuleType[]): FenceRuleType[];
}

function indexActiveRules(candidateActiveRules: RegulatoryRule[]): ActiveRules {
  const byType = new Map<string, RegulatoryRule>();
  for (const rule of candidateActiveRules) {
    if (rule.lifecycleState !== LifecycleState.ACTIVE) continue;
    const type = ruleTypeOf(rule);
    if (!type || !(type in SPEC_GUARDS)) continue;
    if (!SPEC_GUARDS[type]!(rule.ruleSpecification)) continue; // malformed => unavailable
    if (!byType.has(type)) byType.set(type, rule);
  }
  return {
    find<T>(ruleType: FenceRuleType) {
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

function ft(v: number): string {
  return Number.isInteger(v) ? `${v}` : `${v}`.replace(/(\.\d*?)0+$/, "$1");
}

/** Height figures the evaluator reasons over. `topKnown` is false only on a sloping site whose
 * tallest portion was not declared - then `top` is a lower bound. */
function heights(project: FenceProjectDetails): { body: number; feature: number; top: number; topKnown: boolean } {
  const feature = project.openFeatureHeightFt ?? 0;
  const topKnown = !project.siteSlopes || project.tallestPortionHeightFt !== undefined;
  const topBody = project.siteSlopes ? project.tallestPortionHeightFt ?? project.heightFt : project.heightFt;
  return { body: project.heightFt, feature, top: topBody + feature, topKnown };
}

/** The labeled "what you told us" rows - shared by the report (via the evaluation outcome) and the
 * intake summary, so the customer sees the same wording before and after purchase. */
export function describeFenceDeclaredInputs(project: FenceProjectDetails): FenceDeclaredInput[] {
  const rows: FenceDeclaredInput[] = [
    { label: "Fence height", value: `${ft(project.heightFt)} ft${project.siteSlopes ? " (greatest 6-ft-segment average on a sloping site)" : ""}` },
    { label: "Where the fence is", value: LOCATION_ORDER.filter((l) => project.locations.includes(l)).map((l) => LOCATION_LABEL[l]).join("; ") },
    { label: "Sloping site", value: project.siteSlopes ? "Yes" : "No" },
  ];
  if (project.siteSlopes) rows.push({ label: "Tallest portion", value: project.tallestPortionHeightFt !== undefined ? `${ft(project.tallestPortionHeightFt)} ft` : "Not provided" });
  rows.push({ label: "Open arbor/trellis on top", value: project.openFeatureHeightFt ? `${ft(project.openFeatureHeightFt)} ft` : "None" });
  const wall: Record<string, string> = {
    [FenceWallRelation.NONE]: "No retaining wall or bulkhead",
    [FenceWallRelation.ON_NEW_WALL_RAISING_GRADE]: "On top of a new wall that raises grade",
    [FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD]: "On top of another retaining wall or bulkhead",
    [FenceWallRelation.SET_BACK_FROM_CUT_WALL]: "Set back from a wall that protects a cut into grade",
  };
  rows.push({ label: "Retaining wall or bulkhead", value: wall[project.wallRelation]! });
  if (project.wallHeightFt !== undefined) rows.push({ label: "Wall height", value: `${ft(project.wallHeightFt)} ft` });
  if (project.cutWallSetbackFt !== undefined) rows.push({ label: "Distance from the wall", value: `${ft(project.cutWallSetbackFt)} ft` });
  rows.push({
    label: "Masonry or concrete above 6 ft",
    value: project.hasMasonryOrConcreteAbove6Ft === undefined ? "Not answered" : project.hasMasonryOrConcreteAbove6Ft ? "Yes" : "No",
  });
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Height by location
// ---------------------------------------------------------------------------------------------

function onWall(project: FenceProjectDetails): boolean {
  return project.wallRelation === FenceWallRelation.ON_NEW_WALL_RAISING_GRADE || project.wallRelation === FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD;
}

function evaluateSetbackLocation(project: FenceProjectDetails, location: FenceLocation, rules: ActiveRules): { finding?: Finding; uncovered?: string } {
  const label = LOCATION_LABEL[location];
  const subject = `Fence height (${label})`;
  const isFourFootZone = location === FenceLocation.FRONT_SETBACK || location === FenceLocation.STREET_SIDE_SETBACK;
  const zoneRuleType = isFourFootZone ? FenceRuleType.HEIGHT_FRONT_STREET_SIDE : FenceRuleType.HEIGHT_STANDARD;
  const zone = isFourFootZone ? rules.find<FenceHeightFrontStreetSideRuleSpec>(zoneRuleType) : rules.find<FenceHeightStandardRuleSpec>(zoneRuleType);
  const wallRule = onWall(project) ? rules.find<FenceRetainingWallRuleSpec>(FenceRuleType.RETAINING_WALL) : undefined;
  if (!zone || (onWall(project) && !wallRule)) return { uncovered: `fence height (${label})` };

  const zoneSpec = zone.spec as { maxFt: number; absoluteMaxFt: number; openFeatureAllowanceFt?: number };
  const h = heights(project);
  const baseLimit = wallRule ? Math.min(zoneSpec.maxFt, wallRule.spec.fenceOnWallMaxFt) : zoneSpec.maxFt;
  // A top feature only gets its own allowance in the ordinary (non-4-ft, not on a wall) case; everywhere
  // else it simply counts toward the height that is limited.
  const featureAllowance = !isFourFootZone && !wallRule ? zoneSpec.openFeatureAllowanceFt ?? 0 : 0;
  const measuredBody = featureAllowance > 0 ? h.body : h.body + h.feature;

  const failures: string[] = [];
  if (measuredBody > baseLimit) {
    failures.push(
      featureAllowance > 0
        ? `the fence height of ${ft(h.body)} ft exceeds the ${ft(baseLimit)} ft limit`
        : h.feature > 0
          ? `the fence height with its top feature, ${ft(measuredBody)} ft, exceeds the ${ft(baseLimit)} ft limit (no extra height is allowed for a top feature here)`
          : `the fence height of ${ft(h.body)} ft exceeds the ${ft(baseLimit)} ft limit`
    );
  }
  if (featureAllowance > 0 && h.feature > featureAllowance) failures.push(`the top feature of ${ft(h.feature)} ft exceeds the ${ft(featureAllowance)} ft allowance for architectural features`);
  if (h.topKnown && h.top > zoneSpec.absoluteMaxFt) failures.push(`the tallest portion with any top feature, ${ft(h.top)} ft, exceeds the ${ft(zoneSpec.absoluteMaxFt)} ft absolute limit`);
  if (!h.topKnown && h.top > zoneSpec.absoluteMaxFt) failures.push(`even the lowest possible tallest portion, ${ft(h.top)} ft, exceeds the ${ft(zoneSpec.absoluteMaxFt)} ft absolute limit`);

  const supportingEvidence = [
    `declaredHeightFt=${ft(h.body)}`,
    ...(h.feature > 0 ? [`declaredTopFeatureFt=${ft(h.feature)}`] : []),
    ...(project.siteSlopes ? [`siteSlopes=true`, `tallestPortionFt=${project.tallestPortionHeightFt === undefined ? "not provided" : ft(project.tallestPortionHeightFt)}`] : []),
    `limitFt=${ft(baseLimit)}`,
    `absoluteLimitFt=${ft(zoneSpec.absoluteMaxFt)}`,
    `location=${location}`,
    ...(wallRule ? [`fenceOnWall=true`] : []),
  ];
  const where = isFourFootZone
    ? `${label} (fences here are limited to ${ft(zoneSpec.maxFt)} ft)`
    : `${label} (fences up to ${ft(zoneSpec.maxFt)} ft are allowed${featureAllowance > 0 ? `, plus up to ${ft(featureAllowance)} ft for a predominantly open arbor or trellis` : ""})`;
  const wallNote = wallRule ? ` A fence on top of a retaining wall or bulkhead is limited to ${ft(wallRule.spec.fenceOnWallMaxFt)} ft.` : "";

  if (failures.length > 0) {
    return {
      finding: {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ComplianceOutcome.FAIL,
        appliedRule: appliedRule(zone.rule),
        supportingEvidence,
        explanationBasis: `In the ${where}, ${failures.join("; and ")}.${wallNote} ${DECLARED_BASIS}`,
      },
    };
  }

  const unresolved: string[] = [];
  if (featureAllowance > 0 && h.feature > 0) {
    unresolved.push(
      `the ${ft(h.feature)} ft top feature is allowed only if it is an architectural feature that is predominantly open, which SDCI determines`
    );
  }
  if (!h.topKnown) unresolved.push("you did not provide the tallest portion of the fence on the sloping site, so the absolute height limit cannot be checked");
  if (unresolved.length > 0) {
    return {
      finding: {
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject,
        appliedRule: appliedRule(zone.rule),
        supportingEvidence,
        explanationBasis: `In the ${where}, the fence height of ${ft(h.body)} ft is within the ${ft(baseLimit)} ft limit, but ${unresolved.join("; and ")}.${wallNote} ${DECLARED_BASIS}`,
      },
    };
  }
  return {
    finding: {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.PASS,
      appliedRule: appliedRule(zone.rule),
      supportingEvidence,
      explanationBasis: `In the ${where}, the fence height of ${ft(measuredBody)} ft is within the ${ft(baseLimit)} ft limit${project.siteSlopes ? ` and the tallest portion (${ft(h.top)} ft) is within the ${ft(zoneSpec.absoluteMaxFt)} ft absolute limit` : ""}.${wallNote} ${DECLARED_BASIS}`,
    },
  };
}

function evaluateOutsideLocation(project: FenceProjectDetails, rules: ActiveRules): { finding?: Finding; uncovered?: string } {
  const rule = rules.find<FenceOutsideSetbacksRuleSpec>(FenceRuleType.OUTSIDE_REQUIRED_SETBACKS);
  const label = LOCATION_LABEL[FenceLocation.OUTSIDE_REQUIRED_SETBACKS];
  if (!rule) return { uncovered: `fence height (${label})` };
  const h = heights(project);
  const limit = rule.spec.generalStructureHeightLimitFt;
  const base = `SMC 23.44.090.H.4 limits fence height only within required setbacks. For a fence outside every required setback, no fence-specific height limit was identified among the provisions evaluated; the general structure height limit identified is ${ft(limit)} ft.`;
  const supportingEvidence = [`declaredHeightFt=${ft(h.body)}`, `generalStructureHeightLimitFt=${ft(limit)}`, `location=${FenceLocation.OUTSIDE_REQUIRED_SETBACKS}`];
  if (h.top > limit) {
    return {
      finding: {
        classification: FindingClassification.KNOWN,
        subject: `Fence height (${label})`,
        complianceOutcome: ComplianceOutcome.FAIL,
        appliedRule: appliedRule(rule.rule),
        supportingEvidence,
        explanationBasis: `${base} The declared height with any top feature${h.topKnown ? "" : " (at least)"}, ${ft(h.top)} ft, exceeds it. ${DECLARED_BASIS}`,
      },
    };
  }
  if (!h.topKnown) {
    // Fail closed: on a sloping site the tallest portion was not provided, so "within the limit" cannot be stated.
    return {
      finding: {
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject: `Fence height (${label})`,
        appliedRule: appliedRule(rule.rule),
        supportingEvidence,
        explanationBasis: `${base} You did not provide the tallest portion of the fence on the sloping site, so whether it is within that limit cannot be confirmed. ${DECLARED_BASIS}`,
      },
    };
  }
  return {
    finding: {
      classification: FindingClassification.KNOWN,
      subject: `Fence height (${label})`,
      complianceOutcome: ComplianceOutcome.PASS,
      appliedRule: appliedRule(rule.rule),
      supportingEvidence,
      explanationBasis: `${base} The declared height of ${ft(h.top)} ft is within it. This does not mean the fence satisfies every other requirement. ${DECLARED_BASIS}`,
    },
  };
}

function evaluateWall(project: FenceProjectDetails, rules: ActiveRules): { finding?: Finding; uncovered?: string } {
  if (project.wallRelation === FenceWallRelation.NONE) return {};
  // H.5 governs walls "in any required setback"; with every declared location outside one, no wall check applies.
  if (project.locations.every((l) => l === FenceLocation.OUTSIDE_REQUIRED_SETBACKS)) return {};
  const wall = rules.find<FenceRetainingWallRuleSpec>(FenceRuleType.RETAINING_WALL);
  if (!wall) return { uncovered: "fence on a retaining wall or bulkhead" };
  const spec = wall.spec;
  const subject = "Fence and retaining wall or bulkhead";
  const wallHeight = project.wallHeightFt!;
  const h = heights(project);

  if (project.wallRelation === FenceWallRelation.SET_BACK_FROM_CUT_WALL) {
    const setback = project.cutWallSetbackFt!;
    const ok = setback >= spec.cutWallFenceSetbackFt;
    return {
      finding: {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ok ? ComplianceOutcome.PASS : ComplianceOutcome.FAIL,
        appliedRule: appliedRule(wall.rule),
        supportingEvidence: [`declaredCutWallSetbackFt=${ft(setback)}`, `requiredSetbackFt=${ft(spec.cutWallFenceSetbackFt)}`, `declaredWallHeightFt=${ft(wallHeight)}`],
        explanationBasis: ok
          ? `A fence must be set back at least ${ft(spec.cutWallFenceSetbackFt)} ft from a wall that protects a cut into grade; the declared ${ft(setback)} ft meets that. Whether the wall itself is no taller than needed to support the cut is an engineering matter this screening does not evaluate. ${DECLARED_BASIS}`
          : `A fence must be set back at least ${ft(spec.cutWallFenceSetbackFt)} ft from a wall that protects a cut into grade; the declared ${ft(setback)} ft is less. ${DECLARED_BASIS}`,
      },
    };
  }

  if (project.wallRelation === FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD) {
    return {
      finding: {
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject,
        appliedRule: appliedRule(wall.rule),
        supportingEvidence: [`declaredWallHeightFt=${ft(wallHeight)}`, `fenceOnWallMaxFt=${ft(spec.fenceOnWallMaxFt)}`],
        explanationBasis: `A fence on top of a retaining wall or bulkhead is limited to ${ft(spec.fenceOnWallMaxFt)} ft (checked in the height findings above). Whether the declared ${ft(wallHeight)} ft wall is itself allowed in the required setback depends on whether it raises grade or protects a cut and on its history, which Permit Preflight cannot determine. ${DECLARED_BASIS}`,
      },
    };
  }

  // ON_NEW_WALL_RAISING_GRADE
  const failures: string[] = [];
  if (wallHeight > spec.raisingGradeWallMaxFt) failures.push(`the wall height of ${ft(wallHeight)} ft exceeds the ${ft(spec.raisingGradeWallMaxFt)} ft limit for a wall that raises grade`);
  const combined = wallHeight + h.top;
  if (combined > spec.combinedMaxFt) {
    failures.push(
      `the combined wall and fence height${h.topKnown ? "" : " (using the lowest possible tallest portion)"} of ${ft(combined)} ft exceeds the ${ft(spec.combinedMaxFt)} ft limit`
    );
  }
  const supportingEvidence = [`declaredWallHeightFt=${ft(wallHeight)}`, `fenceTopFt=${ft(h.top)}`, `combinedFt=${ft(combined)}`, `combinedMaxFt=${ft(spec.combinedMaxFt)}`];
  if (failures.length > 0) {
    return {
      finding: {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ComplianceOutcome.FAIL,
        appliedRule: appliedRule(wall.rule),
        supportingEvidence,
        explanationBasis: `For a fence on top of a new wall that raises grade, ${failures.join("; and ")}. ${DECLARED_BASIS}`,
      },
    };
  }
  if (!h.topKnown) {
    return {
      finding: {
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject,
        appliedRule: appliedRule(wall.rule),
        supportingEvidence,
        explanationBasis: `The wall height of ${ft(wallHeight)} ft is within the ${ft(spec.raisingGradeWallMaxFt)} ft limit, but the combined height limit of ${ft(spec.combinedMaxFt)} ft cannot be confirmed because the tallest portion of the fence on the sloping site was not provided. ${DECLARED_BASIS}`,
      },
    };
  }
  return {
    finding: {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.PASS,
      appliedRule: appliedRule(wall.rule),
      supportingEvidence,
      explanationBasis: `For a fence on top of a new wall that raises grade, the ${ft(wallHeight)} ft wall is within the ${ft(spec.raisingGradeWallMaxFt)} ft limit and the combined height of ${ft(combined)} ft is within the ${ft(spec.combinedMaxFt)} ft limit. ${DECLARED_BASIS}`,
    },
  };
}

function sightDistanceFinding(project: FenceProjectDetails): Finding | undefined {
  if (!project.locations.some((l) => l === FenceLocation.FRONT_SETBACK || l === FenceLocation.STREET_SIDE_SETBACK)) return undefined;
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: "Sight-distance requirements (corner lot, driveway, alley)",
    supportingEvidence: [`location includes ${project.locations.filter((l) => l === FenceLocation.FRONT_SETBACK || l === FenceLocation.STREET_SIDE_SETBACK).join(", ")}`],
    explanationBasis: SIGHT_DISTANCE_EXPLANATION,
  };
}

/** Always emitted: no zoning fact is retrieved for any project type today (the shed/garage evaluators
 * share the limitation), so for fences - new ground - the NR-only scope is stated in every report as an
 * unresolved item rather than assumed silently. */
function zoningScopeFinding(): Finding {
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: "Zoning applicability (Neighborhood Residential zones)",
    supportingEvidence: ["parcel zoning not verified"],
    explanationBasis: ZONING_SCOPE_EXPLANATION,
  };
}

// ---------------------------------------------------------------------------------------------
// Building permit
// ---------------------------------------------------------------------------------------------

function floodContext(ecaFindings: CriticalAreaFinding[]): string {
  const indicated = ecaFindings.some((f) => f.hazardType === "flood_prone" && f.mappedIntersectionResult === MappedIntersectionResult.INTERSECTS);
  return indicated ? " A mapped flood-prone layer shows a possible intersection with this parcel (context only; not used to decide this criterion)." : "";
}

function evaluatePermit(project: FenceProjectDetails, rules: ActiveRules, ecaFindings: CriticalAreaFinding[]): { permit?: FencePermitRequirement; uncovered?: string } {
  const floodRule = rules.find<Record<string, never>>(FenceRuleType.PERMIT_FLOOD_PRONE_CONDITION);
  const heightRule = rules.find<FencePermitHeightRuleSpec>(FenceRuleType.PERMIT_HEIGHT_EXEMPTION);
  const masonryRule = rules.find<FencePermitMasonryRuleSpec>(FenceRuleType.PERMIT_MASONRY_CONCRETE);
  const h = heights(project);

  const criteria: FencePermitCriterionResult[] = [];
  if (heightRule) {
    const max = heightRule.spec.maxFt;
    let status: FencePermitCriterionResult["status"];
    let basis: string;
    if (h.topKnown ? h.top <= max : false) {
      status = "MET";
      basis = `The fence's greatest height, ${ft(h.top)} ft, is not over ${ft(max)} ft.`;
    } else if (h.top > max) {
      status = "NOT_MET";
      basis = `The fence's greatest height${h.topKnown ? "" : " (at least)"}, ${ft(h.top)} ft, is over ${ft(max)} ft, so the exemption does not apply.`;
    } else {
      status = "REQUIRES_VERIFICATION";
      basis = `The tallest portion of the fence on the sloping site was not provided, so whether it is over ${ft(max)} ft cannot be confirmed.`;
    }
    criteria.push({ criterionId: FencePermitCriterionId.HEIGHT, status, explanationBasis: basis });
  }
  if (masonryRule) {
    const above = masonryRule.spec.elementsAboveFt;
    let status: FencePermitCriterionResult["status"];
    let basis: string;
    if (h.topKnown && h.top <= above) {
      status = "MET";
      basis = `The fence is not over ${ft(above)} ft, so it has no masonry or concrete elements above ${ft(above)} ft.`;
    } else if (project.hasMasonryOrConcreteAbove6Ft === false) {
      status = "MET";
      basis = `You indicated there are no masonry or concrete elements above ${ft(above)} ft.`;
    } else if (project.hasMasonryOrConcreteAbove6Ft === true) {
      status = "NOT_MET";
      basis = `You indicated there are masonry or concrete elements above ${ft(above)} ft, so the exemption does not apply.`;
    } else {
      status = "REQUIRES_VERIFICATION";
      basis = `The fence may extend above ${ft(above)} ft and you did not say whether any masonry or concrete is above that height.`;
    }
    criteria.push({ criterionId: FencePermitCriterionId.MASONRY_CONCRETE, status, explanationBasis: basis });
  }

  const anyNotMet = criteria.some((c) => c.status === "NOT_MET");
  const allRequired = rules.missing(FENCE_OUTCOME_DEPENDENCIES.PERMIT_REQUIRES_VERIFICATION).length === 0;
  // REQUIRED stands on any single conclusive active disqualifier; every other conclusion needs both rules.
  if (!anyNotMet && !allRequired) return { uncovered: "fence building permit" };

  // The flood-prone consideration is a governed claim (F8): listed only while that rule is ACTIVE. A REQUIRED
  // result rests on F5/F6 alone and does not need it.
  if (floodRule) {
    criteria.push({
      criterionId: FencePermitCriterionId.FLOOD_PRONE,
      status: "REQUIRES_VERIFICATION",
      explanationBasis: `Whether the site is in a flood-prone area, where SDCI requires a construction permit, is a determination SDCI makes; Permit Preflight does not make it from available mapping.${floodContext(ecaFindings)}`,
    });
  }

  const byId = new Map(criteria.map((c) => [c.criterionId, c.status]));
  const turnsOnlyOnFloodProneStatus =
    !anyNotMet && Boolean(floodRule) && byId.get(FencePermitCriterionId.HEIGHT) === "MET" && byId.get(FencePermitCriterionId.MASONRY_CONCRETE) === "MET";
  const permit: FencePermitRequirement = {
    buildingPermit: anyNotMet ? "REQUIRED" : "REQUIRES_VERIFICATION",
    criteria,
    turnsOnlyOnFloodProneStatus,
    disclosures: [...FENCE_PERMIT_DISCLOSURES],
  };
  if (turnsOnlyOnFloodProneStatus) {
    permit.note = FLOOD_NOTE;
    if (rules.missing(FENCE_OUTCOME_DEPENDENCIES.PERMIT_EXEMPTION_DISCLAIMER).length === 0) permit.exemptionDisclaimer = EXEMPTION_DISCLAIMER;
  }
  if (anyNotMet) permit.permitPathNote = PERMIT_PATH_NOTE;
  return { permit };
}

// ---------------------------------------------------------------------------------------------

export interface EvaluateFenceInput {
  project: FenceProjectDetails;
  /** Re-filtered to ACTIVE defensively; callers pre-filter by applicableProjectType = "fence". */
  candidateActiveRules: RegulatoryRule[];
  /** Used only for disclosed flood-prone context - never to decide a criterion. */
  ecaFindings: CriticalAreaFinding[];
}

export function evaluateFence(input: EvaluateFenceInput): FenceEvaluationOutcome {
  const rules = indexActiveRules(input.candidateActiveRules);
  const { project } = input;
  const findings: Finding[] = [];
  const uncovered: string[] = [];

  for (const location of LOCATION_ORDER) {
    if (!project.locations.includes(location)) continue;
    const result = location === FenceLocation.OUTSIDE_REQUIRED_SETBACKS ? evaluateOutsideLocation(project, rules) : evaluateSetbackLocation(project, location, rules);
    if (result.finding) findings.push(result.finding);
    if (result.uncovered) uncovered.push(result.uncovered);
  }

  const wall = evaluateWall(project, rules);
  if (wall.finding) findings.push(wall.finding);
  if (wall.uncovered) uncovered.push(wall.uncovered);

  const sight = sightDistanceFinding(project);
  if (sight) findings.push(sight);
  findings.push(zoningScopeFinding());

  const permit = evaluatePermit(project, rules, input.ecaFindings);
  if (permit.uncovered) uncovered.push(permit.uncovered);

  return {
    findings,
    ...(permit.permit ? { permitRequirement: permit.permit } : {}),
    declaredInputs: describeFenceDeclaredInputs(project),
    uncoveredConstraintTypes: [...new Set(uncovered)],
  };
}
