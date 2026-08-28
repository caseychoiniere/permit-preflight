/**
 * Unit 5 - vacant-land evaluation coverage (Code Generation review correction pass). Proves: (1)
 * the no-ACTIVE-coverage disclosure is the real, expected production behavior (BR-U5-5), and NEVER
 * becomes a REQUIRES_VERIFICATION Finding/ScenarioFigure; (2) candidate semantics vs. current POC
 * execution are genuinely distinct, per synthetic ACTIVE fixtures; (3) the density divisor never
 * silently defaults to raw parcel area; (4) U17's fraction-rounding rule is governed - never
 * applied without an ACTIVE U17 rule, even when density itself is ACTIVE; (5) rule-scope matching
 * never crosses between workflows; (6) the bounded 4-scenario family (Correction 3) is real.
 */
import { describe, expect, it } from "vitest";
import { evaluateVacantLand, findActiveScenarioRule, SCENARIO_DEFINITIONS } from "../../src/regulatory-rules-engine/evaluate-vacant-land.js";
import { applyFractionalUnitRounding } from "../../src/regulatory-rules-engine/vacant-land-density.js";
import type { BuildableEnvelopeFacts, DensityFacts, LotLineRoles } from "../../src/regulatory-rules-engine/vacant-land-types.js";
import {
  garageRearSetbackRule,
  vacantLandDensityRuleGeneral,
  vacantLandDensityRuleSmallLot,
  vacantLandFractionRoundingRule,
  vacantLandHeightRuleGeneral,
  vacantLandHeightRuleStacked,
  vacantLandLotCoverageRuleGeneral,
  vacantLandLotCoverageRuleTransit,
  vacantLandBuildabilityFloorRule,
  vacantLandPermittedUseRule,
  vacantLandSetbackRuleGeneral,
} from "../fixtures/test-only-active-rules.js";

const insufficientEnvelope: BuildableEnvelopeFacts = {
  rawParcelAreaSqFt: 5000,
  setbackConstrainedArea: { status: "NO_ACTIVE_COVERAGE" },
  ecaExclusionArea: { status: "REQUIRES_VERIFICATION", reason: "test default" },
  footnoteExceptionStatus: "REQUIRES_VERIFICATION",
};

function baseInput(overrides: {
  candidateActiveRules?: Parameters<typeof evaluateVacantLand>[0]["candidateActiveRules"];
  densityFacts?: DensityFacts;
  lotLineRoles?: LotLineRoles;
  scenarioBuildableEnvelopes?: Record<string, BuildableEnvelopeFacts>;
} = {}) {
  return {
    candidateActiveRules: overrides.candidateActiveRules ?? [],
    buildabilityApplicability: {},
    densityFacts: overrides.densityFacts ?? { rawParcelAreaSqFt: 5000 },
    lotLineRoles: overrides.lotLineRoles ?? { status: "INSUFFICIENT" as const },
    scenarioBuildableEnvelopes: overrides.scenarioBuildableEnvelopes ?? {},
  };
}

describe("Correction 3 - the bounded 4-scenario family is real, not a single GENERAL_DENSITY scenario", () => {
  it("SCENARIO_DEFINITIONS names exactly the founder's minimum bounded family", () => {
    const ids = SCENARIO_DEFINITIONS.map((s) => s.scenarioId).sort();
    expect(ids).toEqual(["GENERAL_DENSITY", "SMALL_LOT_BONUS", "STACKED_MULTI_UNIT", "TRANSIT_BONUS"].sort());
  });

  it("evaluateVacantLand always produces exactly 4 scenarios, never 1", () => {
    const outcome = evaluateVacantLand(baseInput());
    expect(outcome.scenarios).toHaveLength(4);
  });

  it("each scenario independently sources its own ACTIVE rules - GENERAL_DENSITY's density does not leak into SMALL_LOT_BONUS's figure", () => {
    const outcome = evaluateVacantLand(
      baseInput({ candidateActiveRules: [vacantLandDensityRuleGeneral], densityFacts: { rawParcelAreaSqFt: 6250, densityCountableLotAreaSqFt: 6250 } })
    );
    const general = outcome.scenarios.find((s) => s.scenarioId === "GENERAL_DENSITY")!;
    const smallLot = outcome.scenarios.find((s) => s.scenarioId === "SMALL_LOT_BONUS")!;
    expect(general.maxDwellingUnits.status).toBe("NO_ACTIVE_COVERAGE"); // no ACTIVE U17 yet
    expect(smallLot.maxDwellingUnits).toEqual({ status: "NO_ACTIVE_COVERAGE" }); // no ACTIVE density rule for this scenario at all
  });
});

describe("Correction 2 - no-ACTIVE-coverage is NEVER REQUIRES_VERIFICATION, and never produces a diligence-risk Finding", () => {
  it("[hard invariant] with zero ACTIVE vacant-land rules (the real production state today), every figure is NO_ACTIVE_COVERAGE, never REQUIRES_VERIFICATION", () => {
    const outcome = evaluateVacantLand(baseInput());
    for (const scenario of outcome.scenarios) {
      expect(scenario.maxDwellingUnits.status).toBe("NO_ACTIVE_COVERAGE");
      expect(scenario.maxHeightFt.status).toBe("NO_ACTIVE_COVERAGE");
      expect(scenario.maxLotCoveragePercent.status).toBe("NO_ACTIVE_COVERAGE");
      expect(scenario.buildableEnvelope.setbackConstrainedArea.status).toBe("NO_ACTIVE_COVERAGE");
    }
    expect(outcome.buildabilityFindings).toHaveLength(0);
    expect(outcome.uncoveredConstraintTypes.sort()).toEqual(["buildability", "density", "height", "lot coverage", "permitted use", "setback"].sort());
  });

  it("[hard invariant] no diligence-risk Finding is ever created solely because a figure is NO_ACTIVE_COVERAGE", () => {
    const outcome = evaluateVacantLand(baseInput());
    // The only diligence risk with zero ACTIVE rules is the LotLineRoles INSUFFICIENT one - not
    // one risk per NO_ACTIVE_COVERAGE figure (which would be a real regression to two-state logic).
    expect(outcome.diligenceRisks).toHaveLength(1);
    expect(outcome.diligenceRisks[0]!.subject).toBe("Lot-line roles");
  });
});

describe("Unit 5 - candidate semantics vs. current POC execution (synthetic ACTIVE fixtures)", () => {
  it("U1/U2 produce real findings only when their governed rule is ACTIVE - never hardcoded", () => {
    const outcome = evaluateVacantLand(baseInput({ candidateActiveRules: [vacantLandBuildabilityFloorRule, vacantLandPermittedUseRule] }));
    expect(outcome.uncoveredConstraintTypes).not.toContain("buildability");
    expect(outcome.uncoveredConstraintTypes).not.toContain("permitted use");
    expect(outcome.buildabilityFindings).toHaveLength(2);
    expect(outcome.buildabilityFindings.find((f) => f.subject === "Minimum buildability floor")?.classification).toBe("REQUIRES_VERIFICATION");
    expect(outcome.buildabilityFindings.find((f) => f.subject === "Permitted residential use")?.classification).toBe("KNOWN");
  });

  it("a rule scoped to a different workflow (EXISTING_PROPERTY/garage) never matches a vacant-land evaluation, even if mistakenly passed in", () => {
    const outcome = evaluateVacantLand(baseInput({ candidateActiveRules: [garageRearSetbackRule] }));
    expect(outcome.buildabilityFindings).toHaveLength(0);
    expect(outcome.uncoveredConstraintTypes).toHaveLength(6);
  });
});

describe("Correction 1B - U17's rounding threshold is governed, never applied without an ACTIVE U17 rule", () => {
  it("a fraction of 0.85 or less rounds DOWN, not ordinary round-half-up (pure function)", () => {
    expect(applyFractionalUnitRounding(4.5, 0.85)).toBe(4);
    expect(applyFractionalUnitRounding(4.85, 0.85)).toBe(4);
  });

  it("a fraction over the given threshold constitutes an additional unit (pure function)", () => {
    expect(applyFractionalUnitRounding(4.86, 0.85)).toBe(5);
  });

  it("[hard invariant] density is ACTIVE but U17 is NOT ACTIVE - maxDwellingUnits stays NO_ACTIVE_COVERAGE, the 0.85 threshold is never silently applied", () => {
    const outcome = evaluateVacantLand(
      baseInput({ candidateActiveRules: [vacantLandDensityRuleGeneral], densityFacts: { rawParcelAreaSqFt: 6250, densityCountableLotAreaSqFt: 6250 } })
    );
    const general = outcome.scenarios.find((s) => s.scenarioId === "GENERAL_DENSITY")!;
    expect(general.maxDwellingUnits).toEqual({ status: "NO_ACTIVE_COVERAGE" });
  });

  it("with BOTH density and U17 ACTIVE, and densityCountableLotAreaSqFt established, applies the real governed rounding threshold", () => {
    const outcome = evaluateVacantLand(
      baseInput({
        candidateActiveRules: [vacantLandDensityRuleGeneral, vacantLandFractionRoundingRule],
        densityFacts: { rawParcelAreaSqFt: 6250, densityCountableLotAreaSqFt: 6250 },
      })
    );
    const general = outcome.scenarios.find((s) => s.scenarioId === "GENERAL_DENSITY")!;
    // 6250 / 1250 = 5.0 exactly - a whole number, unaffected by rounding.
    expect(general.maxDwellingUnits.status).toBe("KNOWN");
    if (general.maxDwellingUnits.status === "KNOWN") {
      expect(general.maxDwellingUnits.value).toBe(5);
      expect(general.maxDwellingUnits.appliedRule.id).toBe(vacantLandDensityRuleGeneral.id);
    }
  });
});

describe("Unit 5 - density divisor never silently defaults to raw parcel area (Correction 2)", () => {
  it("densityCountableLotAreaSqFt undefined (the fail-closed default) produces NO_ACTIVE_COVERAGE-independent REQUIRES_VERIFICATION even with ACTIVE density+U17, never computing from rawParcelAreaSqFt", () => {
    const outcome = evaluateVacantLand(
      baseInput({ candidateActiveRules: [vacantLandDensityRuleGeneral, vacantLandFractionRoundingRule], densityFacts: { rawParcelAreaSqFt: 6250 } })
    );
    const general = outcome.scenarios.find((s) => s.scenarioId === "GENERAL_DENSITY")!;
    expect(general.maxDwellingUnits).toEqual({
      status: "REQUIRES_VERIFICATION",
      reason: "The density-countable lot area (SMC 23.44.060.D.6/E-corrected) cannot currently be established for this parcel.",
    });
  });
});

describe("Unit 5 - height/lot-coverage figures read directly from the ACTIVE rule's own governed content, per scenario", () => {
  it("height and lot-coverage figures are KNOWN only when their respective scenario-scoped ACTIVE rule exists, and read the number from ruleSpecification", () => {
    const outcome = evaluateVacantLand(
      baseInput({ candidateActiveRules: [vacantLandHeightRuleGeneral, vacantLandHeightRuleStacked, vacantLandLotCoverageRuleGeneral, vacantLandLotCoverageRuleTransit] })
    );
    const general = outcome.scenarios.find((s) => s.scenarioId === "GENERAL_DENSITY")!;
    const stacked = outcome.scenarios.find((s) => s.scenarioId === "STACKED_MULTI_UNIT")!;
    const transit = outcome.scenarios.find((s) => s.scenarioId === "TRANSIT_BONUS")!;
    const smallLot = outcome.scenarios.find((s) => s.scenarioId === "SMALL_LOT_BONUS")!;
    expect(general.maxHeightFt).toEqual({ status: "KNOWN", value: 32, appliedRule: expect.objectContaining({ id: vacantLandHeightRuleGeneral.id }) });
    expect(stacked.maxHeightFt).toEqual({ status: "KNOWN", value: 42, appliedRule: expect.objectContaining({ id: vacantLandHeightRuleStacked.id }) });
    expect(general.maxLotCoveragePercent).toEqual({ status: "KNOWN", value: 50, appliedRule: expect.objectContaining({ id: vacantLandLotCoverageRuleGeneral.id }) });
    expect(transit.maxLotCoveragePercent).toEqual({ status: "KNOWN", value: 60, appliedRule: expect.objectContaining({ id: vacantLandLotCoverageRuleTransit.id }) });
    expect(smallLot.maxHeightFt.status).toBe("NO_ACTIVE_COVERAGE");
  });

  it("scenario citations are derived exclusively from real KNOWN figures' appliedRule - never a static list", () => {
    const outcome = evaluateVacantLand(baseInput({ candidateActiveRules: [vacantLandHeightRuleGeneral] }));
    const general = outcome.scenarios.find((s) => s.scenarioId === "GENERAL_DENSITY")!;
    const stacked = outcome.scenarios.find((s) => s.scenarioId === "STACKED_MULTI_UNIT")!;
    expect(general.citations).toEqual(vacantLandHeightRuleGeneral.citation.smcSections);
    expect(stacked.citations).toEqual([]); // nothing ACTIVE for this scenario at all
  });
});

describe("Unit 5 - setback figure sourced from findActiveScenarioRule, never hardcoded", () => {
  it("findActiveScenarioRule locates the GENERAL_DENSITY-scoped setback rule and not other scenarios'", () => {
    const found = findActiveScenarioRule([vacantLandSetbackRuleGeneral], "VACANT_LAND_SETBACK", "GENERAL_DENSITY");
    expect(found?.id).toBe(vacantLandSetbackRuleGeneral.id);
    expect(findActiveScenarioRule([vacantLandSetbackRuleGeneral], "VACANT_LAND_SETBACK", "TRANSIT_BONUS")).toBeUndefined();
  });
});

describe("Unit 5 - LotLineRoles INSUFFICIENT is surfaced as a diligence risk", () => {
  it("adds a diligence risk when lotLineRoles.status is INSUFFICIENT (the real, expected default for every evaluation today)", () => {
    const outcome = evaluateVacantLand(baseInput());
    expect(outcome.diligenceRisks.some((r) => r.subject === "Lot-line roles")).toBe(true);
  });

  it("does not add the lot-line-roles diligence risk when ESTABLISHED", () => {
    const outcome = evaluateVacantLand(baseInput({ lotLineRoles: { status: "ESTABLISHED" } }));
    expect(outcome.diligenceRisks.some((r) => r.subject === "Lot-line roles")).toBe(false);
  });
});

describe("Unit 5 - a REQUIRES_VERIFICATION scenario figure (genuine evidence-unknown, ACTIVE rule present) does produce a diligence risk", () => {
  it("distinguishes REQUIRES_VERIFICATION (evidence unknown, real diligence risk) from NO_ACTIVE_COVERAGE (no risk) side by side", () => {
    const outcome = evaluateVacantLand(
      baseInput({ candidateActiveRules: [vacantLandDensityRuleGeneral, vacantLandFractionRoundingRule], densityFacts: { rawParcelAreaSqFt: 6250 } })
    );
    const general = outcome.scenarios.find((s) => s.scenarioId === "GENERAL_DENSITY")!;
    expect(general.maxDwellingUnits.status).toBe("REQUIRES_VERIFICATION");
    expect(outcome.diligenceRisks.some((r) => r.subject === "GENERAL_DENSITY scenario figure")).toBe(true);
    const stacked = outcome.scenarios.find((s) => s.scenarioId === "STACKED_MULTI_UNIT")!;
    expect(stacked.maxDwellingUnits.status).toBe("NO_ACTIVE_COVERAGE");
    expect(outcome.diligenceRisks.some((r) => r.subject === "STACKED_MULTI_UNIT scenario figure")).toBe(false);
  });
});
