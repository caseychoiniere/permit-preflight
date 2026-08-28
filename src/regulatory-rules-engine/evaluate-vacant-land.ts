/**
 * Unit 5 (Vacant Land) Regulatory Evaluation - a genuinely separate entry point from
 * `evaluateProject`/`expectedConstraintTypesFor` (evaluate.ts), never routed through it. Pure
 * function - no I/O, matching evaluateProject's own convention: all PostGIS/DB work happens in
 * the orchestrator (pipeline.ts) before this function is called.
 *
 * ACTIVE-only, per RegulatoryRuleApplicabilityScope (Correction 4) - callers must have already
 * filtered `candidateActiveRules` to rows scoped `{ workflowType: "VACANT_LAND" }`. No SMC
 * citation numbers appear as literals in this module - every numeric threshold (density rate,
 * height limit, coverage percent, setback distances, the U17 rounding threshold) comes from an
 * ACTIVE RegulatoryRule row's own `ruleSpecification` (Code Generation review Correction 1).
 *
 * **Corrected per founder review (Code Generation review pass)**:
 * - `ScenarioFigure`/`SetbackConstrainedAreaResult` are real three-state unions (KNOWN /
 *   NO_ACTIVE_COVERAGE / REQUIRES_VERIFICATION) - "no ACTIVE rule" is never converted into
 *   REQUIRES_VERIFICATION, and never produces a diligence-risk Finding (Correction 2).
 * - Implements the bounded 4-scenario family VL-4 requires (Correction 3): GENERAL_DENSITY,
 *   SMALL_LOT_BONUS, TRANSIT_BONUS, STACKED_MULTI_UNIT - each independently sourcing its own
 *   density/height/coverage/setback figures from scenario-scoped ACTIVE rules.
 * - U17's rounding threshold is supplied ONLY by an ACTIVE `VACANT_LAND_FRACTION_ROUNDING` rule -
 *   no ACTIVE U17 rule means `maxDwellingUnits` is NO_ACTIVE_COVERAGE even when the underlying
 *   density rule is itself ACTIVE (a rounded unit count is not governed without both).
 * - Scenario `citations` are derived exclusively from the real `appliedRule.citation` of whichever
 *   figures are actually KNOWN - never a static/hardcoded citation list (Correction 1D).
 */

import { LifecycleState } from "../regulatory-rule-governance/types.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { FindingClassification } from "./types.js";
import type { Finding } from "./types.js";
import { applyFractionalUnitRounding } from "./vacant-land-density.js";
import type { AppliedRuleRef, BuildableEnvelopeFacts, DensityFacts, LotLineRoles, ResidentialUseScenario, ScenarioFigure, VacantLandEvaluationOutcome } from "./vacant-land-types.js";

/** U1's two required, independently-evidenced applicability facts (Correction 1) - undefined
 * means unestablished, never inferred from a confirmed King County parcel record alone. */
export interface BuildabilityApplicabilityFacts {
  smcLotQualificationEstablished?: boolean;
  existenceAsOfEffectiveDateEstablished?: boolean;
}

export interface VacantLandBuildabilityFloorRuleSpec {
  ruleType: "VACANT_LAND_BUILDABILITY_FLOOR";
}
export interface VacantLandPermittedUseRuleSpec {
  ruleType: "VACANT_LAND_PERMITTED_USE";
}
export interface VacantLandFractionRoundingRuleSpec {
  ruleType: "VACANT_LAND_FRACTION_ROUNDING";
  /** SMC 23.44.060.D.1's real value is 0.85 - this module never asserts that number itself,
   * only the ACTIVE rule's own content does. */
  thresholdFraction: number;
}
export interface VacantLandDensityRuleSpec {
  ruleType: "VACANT_LAND_DENSITY";
  scenarioId: string;
  sqFtPerUnit: number;
}
export interface VacantLandHeightRuleSpec {
  ruleType: "VACANT_LAND_HEIGHT";
  scenarioId: string;
  maxFt: number;
}
export interface VacantLandLotCoverageRuleSpec {
  ruleType: "VACANT_LAND_LOT_COVERAGE";
  scenarioId: string;
  maxPercent: number;
}
/** Governs the setback profile the buildable-envelope PostGIS computation actually uses for a
 * given scenario (Correction 1C) - looked up and applied by the orchestrator (pipeline.ts), which
 * owns the PostGIS call, never hardcoded there. */
export interface VacantLandSetbackRuleSpec {
  ruleType: "VACANT_LAND_SETBACK";
  scenarioId: string;
  frontFt: number;
  rearFt: number;
  sideFt: number;
  sideIsAveragingGoverned: boolean;
}

/** Correction 3's bounded scenario family - the minimum VL-4 requires, matching the founder's own
 * examples: general-density, small-lot bonus, transit-dependent, stacked/multi-unit. Each
 * scenario is a hypothetical configuration; a scenario existing here does NOT mean it is
 * eligible/available for a given parcel - eligibility is determined entirely by whether ACTIVE
 * governed rules exist and the parcel's own evidence resolves, per figure. */
export const SCENARIO_DEFINITIONS: { scenarioId: string; description: string }[] = [
  { scenarioId: "GENERAL_DENSITY", description: "General-density residential development under SMC 23.44.060.A.4's default rate (U3)." },
  { scenarioId: "SMALL_LOT_BONUS", description: "Small-lot density bonus for a lot under 5,000 sq ft, ECA-absence permitting (SMC 23.44.060.C.1, U4)." },
  { scenarioId: "TRANSIT_BONUS", description: "Small-lot, frequent-transit-area density and lot-coverage bonus (SMC 23.44.060.C.2 / 23.44.080.F, U5/U14)." },
  { scenarioId: "STACKED_MULTI_UNIT", description: "Stacked-dwelling-unit development with the associated height and lot-coverage bonuses (SMC 23.44.060.A.1-2 / 23.44.070.A.2 / 23.44.080.G, U8/U15)." },
];

/** BR-U5-5 (mirrors BR-U4-5) - the constraint types a vacant-land evaluation is expected to have
 * ACTIVE rule coverage for, at the whole-evaluation level (a constraint type is "covered" if AT
 * LEast one scenario has ACTIVE coverage for it; the fine-grained per-scenario truth lives on
 * each ScenarioFigure's own NO_ACTIVE_COVERAGE/KNOWN status). Every entry is expected to be
 * uncovered for the entire Units 5-11 POC-build phase (BR-U5-5). */
const EXPECTED_CONSTRAINT_TYPES = ["buildability", "permitted use", "density", "height", "lot coverage", "setback"] as const;

export function findActiveRuleByType(activeRules: RegulatoryRule[], ruleType: string): RegulatoryRule | undefined {
  return activeRules.find((r) => (r.ruleSpecification as { ruleType?: string }).ruleType === ruleType);
}
export function findActiveScenarioRule(activeRules: RegulatoryRule[], ruleType: string, scenarioId: string): RegulatoryRule | undefined {
  return activeRules.find((r) => {
    const spec = r.ruleSpecification as { ruleType?: string; scenarioId?: string };
    return spec.ruleType === ruleType && spec.scenarioId === scenarioId;
  });
}
export function toAppliedRuleRef(rule: RegulatoryRule): AppliedRuleRef {
  return { id: rule.id, subject: rule.subject, citation: rule.citation };
}

export interface EvaluateVacantLandInput {
  /** Pre-filtered by the orchestrator to RegulatoryRuleApplicabilityScope { workflowType:
   * "VACANT_LAND" } - re-filtered to ACTIVE defensively below. */
  candidateActiveRules: RegulatoryRule[];
  buildabilityApplicability: BuildabilityApplicabilityFacts;
  densityFacts: DensityFacts;
  lotLineRoles: LotLineRoles;
  /** Per-scenario buildable envelope, already computed by the orchestrator via the postgis-
   * adapter functions (this function stays pure/no I/O), keyed by scenarioId. A scenario absent
   * from this map (e.g. because no ACTIVE setback rule exists for it) is treated as
   * NO_ACTIVE_COVERAGE for its own buildable-envelope figure. */
  scenarioBuildableEnvelopes: Record<string, BuildableEnvelopeFacts>;
}

export function evaluateVacantLand(input: EvaluateVacantLandInput): VacantLandEvaluationOutcome {
  const activeRules = input.candidateActiveRules.filter((r) => r.lifecycleState === LifecycleState.ACTIVE);

  const buildabilityFindings: Finding[] = [];
  const diligenceRisks: Finding[] = [];
  const coveredConstraintTypes = new Set<string>();

  // U1 - buildability floor. Candidate semantics vs. current POC execution: only produces a
  // Finding at all when an ACTIVE VACANT_LAND_BUILDABILITY_FLOOR rule exists - its absence is
  // disclosed via uncoveredConstraintTypes only, never as a REQUIRES_VERIFICATION Finding
  // standing in for missing governance.
  const buildabilityRule = findActiveRuleByType(activeRules, "VACANT_LAND_BUILDABILITY_FLOOR");
  if (buildabilityRule) {
    coveredConstraintTypes.add("buildability");
    const bothFactsEstablished = input.buildabilityApplicability.smcLotQualificationEstablished === true && input.buildabilityApplicability.existenceAsOfEffectiveDateEstablished === true;
    const finding: Finding = bothFactsEstablished
      ? {
          subject: "Minimum buildability floor",
          appliedRule: toAppliedRuleRef(buildabilityRule),
          supportingEvidence: ["SMC-lot qualification (23.84A.024) confirmed", "Existence as of the ordinance's effective date confirmed"],
          explanationBasis: "At least one dwelling unit is allowed on this lot regardless of how the density formula computes.",
          classification: FindingClassification.KNOWN,
        }
      : {
          subject: "Minimum buildability floor",
          appliedRule: toAppliedRuleRef(buildabilityRule),
          supportingEvidence: [],
          explanationBasis:
            "This finding requires confirming both that the parcel qualifies as a 'lot' under SMC 23.84A.024 (separate-development qualification, street/easement access, not divided by a street or alley) and that it existed as of the ordinance's effective date - neither is currently established.",
          classification: FindingClassification.REQUIRES_VERIFICATION,
        };
    buildabilityFindings.push(finding);
    if (finding.classification === FindingClassification.REQUIRES_VERIFICATION) diligenceRisks.push(finding);
  }

  // U2 - permitted use.
  const permittedUseRule = findActiveRuleByType(activeRules, "VACANT_LAND_PERMITTED_USE");
  if (permittedUseRule) {
    coveredConstraintTypes.add("permitted use");
    buildabilityFindings.push({
      subject: "Permitted residential use",
      appliedRule: toAppliedRuleRef(permittedUseRule),
      supportingEvidence: ["Confirmed zone (SMC 23.44.020 Table A)"],
      explanationBasis: "Residential use is permitted outright in this zone for the ordinary case.",
      classification: FindingClassification.KNOWN,
    });
  }

  // U17 - the fraction-rounding threshold, governed. No ACTIVE U17 rule means no scenario's
  // maxDwellingUnits can ever reach KNOWN, regardless of the density rule's own ACTIVE status -
  // a rounded unit count is not governed content without both.
  const roundingRule = findActiveRuleByType(activeRules, "VACANT_LAND_FRACTION_ROUNDING");

  const scenarios: ResidentialUseScenario[] = SCENARIO_DEFINITIONS.map(({ scenarioId, description }) => {
    const densityRule = findActiveScenarioRule(activeRules, "VACANT_LAND_DENSITY", scenarioId);
    const heightRule = findActiveScenarioRule(activeRules, "VACANT_LAND_HEIGHT", scenarioId);
    const coverageRule = findActiveScenarioRule(activeRules, "VACANT_LAND_LOT_COVERAGE", scenarioId);

    let maxDwellingUnits: ScenarioFigure;
    if (!densityRule || !roundingRule) {
      maxDwellingUnits = { status: "NO_ACTIVE_COVERAGE" };
    } else {
      coveredConstraintTypes.add("density");
      const spec = densityRule.ruleSpecification as unknown as VacantLandDensityRuleSpec;
      if (input.densityFacts.densityCountableLotAreaSqFt === undefined) {
        maxDwellingUnits = { status: "REQUIRES_VERIFICATION", reason: "The density-countable lot area (SMC 23.44.060.D.6/E-corrected) cannot currently be established for this parcel." };
      } else {
        const roundingSpec = roundingRule.ruleSpecification as unknown as VacantLandFractionRoundingRuleSpec;
        const rawUnits = input.densityFacts.densityCountableLotAreaSqFt / spec.sqFtPerUnit;
        maxDwellingUnits = { status: "KNOWN", value: applyFractionalUnitRounding(rawUnits, roundingSpec.thresholdFraction), appliedRule: toAppliedRuleRef(densityRule) };
      }
    }

    let maxHeightFt: ScenarioFigure;
    if (!heightRule) {
      maxHeightFt = { status: "NO_ACTIVE_COVERAGE" };
    } else {
      coveredConstraintTypes.add("height");
      maxHeightFt = { status: "KNOWN", value: (heightRule.ruleSpecification as unknown as VacantLandHeightRuleSpec).maxFt, appliedRule: toAppliedRuleRef(heightRule) };
    }

    let maxLotCoveragePercent: ScenarioFigure;
    if (!coverageRule) {
      maxLotCoveragePercent = { status: "NO_ACTIVE_COVERAGE" };
    } else {
      coveredConstraintTypes.add("lot coverage");
      maxLotCoveragePercent = { status: "KNOWN", value: (coverageRule.ruleSpecification as unknown as VacantLandLotCoverageRuleSpec).maxPercent, appliedRule: toAppliedRuleRef(coverageRule) };
    }

    const buildableEnvelope = input.scenarioBuildableEnvelopes[scenarioId] ?? {
      rawParcelAreaSqFt: input.densityFacts.rawParcelAreaSqFt,
      setbackConstrainedArea: { status: "NO_ACTIVE_COVERAGE" as const },
      ecaExclusionArea: { status: "REQUIRES_VERIFICATION" as const, reason: "No buildable-envelope computation was supplied for this scenario." },
      footnoteExceptionStatus: "REQUIRES_VERIFICATION" as const,
    };
    if (buildableEnvelope.setbackConstrainedArea.status === "ESTABLISHED") coveredConstraintTypes.add("setback");

    // Citations derived exclusively from real KNOWN figures' own appliedRule - never a static list.
    const citations = new Set<string>();
    for (const figure of [maxDwellingUnits, maxHeightFt, maxLotCoveragePercent]) {
      if (figure.status === "KNOWN") for (const smc of figure.appliedRule.citation.smcSections) citations.add(smc);
    }
    if (buildableEnvelope.setbackConstrainedArea.status === "ESTABLISHED") {
      for (const smc of buildableEnvelope.setbackConstrainedArea.appliedRule.citation.smcSections) citations.add(smc);
    }

    // Diligence risks: only genuine evidence-unknown conditions, never a NO_ACTIVE_COVERAGE figure.
    for (const figure of [maxDwellingUnits, maxHeightFt, maxLotCoveragePercent]) {
      if (figure.status === "REQUIRES_VERIFICATION") {
        diligenceRisks.push({ subject: `${scenarioId} scenario figure`, supportingEvidence: [], explanationBasis: figure.reason, classification: FindingClassification.REQUIRES_VERIFICATION });
      }
    }
    if (buildableEnvelope.setbackConstrainedArea.status === "REQUIRES_VERIFICATION") {
      diligenceRisks.push({
        subject: `${scenarioId} buildable envelope`,
        supportingEvidence: [],
        explanationBasis: buildableEnvelope.setbackConstrainedArea.reason,
        classification: FindingClassification.REQUIRES_VERIFICATION,
      });
    }

    return { scenarioId, description, maxDwellingUnits, maxHeightFt, maxLotCoveragePercent, buildableEnvelope, citations: [...citations] };
  });

  if (input.lotLineRoles.status !== "ESTABLISHED") {
    diligenceRisks.push({
      subject: "Lot-line roles",
      supportingEvidence: [],
      explanationBasis: "Front/rear/side lot-line roles are not established for this parcel - the buildable-envelope figure cannot be computed without them.",
      classification: FindingClassification.REQUIRES_VERIFICATION,
    });
  }

  const uncoveredConstraintTypes = EXPECTED_CONSTRAINT_TYPES.filter((c) => !coveredConstraintTypes.has(c));

  return { buildabilityFindings, densityFacts: input.densityFacts, scenarios, diligenceRisks, uncoveredConstraintTypes };
}
