/**
 * The REAL candidate vacant-land regulatory content (U1-U17) researched during Unit 5 Functional
 * Design (aidlc-docs/construction/unit-5-vacant-land/functional-design/
 * vacant-land-rule-inventory-and-tier-triage.md, corrected through the founder's final correction
 * pass) - Code Generation review Correction 1A: ALL 17 candidates, not U1 alone, mirroring the
 * same fixture/content convention shed/garage already use (real, non-`ACTIVE`, held at
 * DRAFTED/TRIAGED per BR-U5-5, never SOURCE_VERIFY/TEST/APPROVE/ACTIVATE merely to make
 * evaluation work). Tier-2 candidates (U6, U8, U13) remain blocked by the existing post-POC
 * professional-review milestone, exactly like shed/garage's own Tier-2 candidates.
 *
 * Every `applicableWorkflowType: "VACANT_LAND"` candidate below omits `applicableProjectType`
 * entirely - never a "vacant-land" string shortcut (RegulatoryRuleApplicabilityScope,
 * Correction 4). See tests/regulatory-rule-governance/vacant-land-candidates.test.ts for the test
 * proving every one of the 17 stays honestly non-ACTIVE.
 */

import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";

const ORDINANCE_CITATION = {
  ordinanceNumber: "127376",
  effectiveDateBasis:
    "Ordinance 127376 passed 2025-12-16, signed 2025-12-22; exact effective date inferred from Seattle's standard 30-day-post-publication default (~January 21, 2026), not directly stated in the primary source.",
};

function candidate(input: Omit<DraftedRuleInput, "isTestOnlyFixture" | "applicableWorkflowType">): DraftedRuleInput {
  return { ...input, applicableWorkflowType: "VACANT_LAND", isTestOnlyFixture: false };
}

/** U1 - real, unchanged from the founder's own final correction pass (Correction 1). */
export const realVacantLandBuildabilityFloorCandidate = candidate({
  id: "vacant-land-buildability-floor-nr-2026",
  subject: "Minimum buildability floor for an existing lot - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_BUILDABILITY_FLOOR" },
  citation: { smcSections: ["SMC 23.44.060.C.4.c", "SMC 23.84A.024"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "applicability facts, not textual ambiguity",
      description:
        "This candidate's own text (SMC 23.44.060.C.4.c) is unambiguous - at least one dwelling unit is allowed on all lots in existence as of the ordinance's effective date. The real complexity is in two independently-evidenced applicability facts this project has no data source for: (1) whether the parcel qualifies as a 'lot' under SMC 23.84A.024's real, narrower test; (2) existence as of the ordinance's effective date.",
      affectedConditionOrInterpretation: "Whether this finding can ever reach KNOWN for a real parcel",
      sourceReferences: ["SMC 23.84A.024", "SMC 23.44.060.C.4.c"],
      resolutionStatus: "Not a governance blocker - Tier 1. The evidence gap is real and stays REQUIRES_VERIFICATION regardless of Tier.",
    },
  ],
  testCases: [
    { kind: "POSITIVE", description: "Both applicability facts established", input: { smcLotQualificationEstablished: true, existenceAsOfEffectiveDateEstablished: true }, expected: { classification: "KNOWN" } },
    { kind: "EXCEPTION", description: "Neither applicability fact established (real production default)", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } },
  ],
});

export const realVacantLandPermittedUseCandidate = candidate({
  id: "vacant-land-permitted-use-nr-2026",
  subject: "Permitted residential use - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_PERMITTED_USE" },
  citation: { smcSections: ["SMC 23.44.020 Table A"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "enumerated exceptions not modeled by this candidate alone",
      description: "Residential uses are permitted outright except narrow listed exceptions (assisted living facilities X, caretaker's quarters X, congregate residences X/P within a major transit service area) - this candidate covers the ordinary residential case; the congregate-residence exception depends on the same major-transit-service-area data gap U5 names.",
      affectedConditionOrInterpretation: "Whether the ordinary-case P applies vs. a narrow exception",
      sourceReferences: ["SMC 23.44.020 Table A"],
      resolutionStatus: "Ordinary case is unambiguous; exceptions immaterial for a typical single/multi-family scenario.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "Ordinary residential use, not a congregate residence", input: {}, expected: { classification: "KNOWN" } }],
});

export const realVacantLandBaseDensityCandidate = candidate({
  id: "vacant-land-base-density-nr-2026",
  subject: "Base maximum density (general/stacked/transit subclauses) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY", scenarioId: "GENERAL_DENSITY", sqFtPerUnit: 1250 },
  citation: { smcSections: ["SMC 23.44.060.A"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "scenario-dependent subclause selection",
      description: "A.4's 1,250 sq ft/unit general default, A.1's 600 sq ft/unit stacked rate, A.2's 500 sq ft/unit tree-retention-bonus rate, and A.3's 650 sq ft/unit frequent-transit rate are four real, distinct subclauses - which applies depends on which hypothetical scenario is being evaluated (VL-4's own scenario-based framing), not a per-parcel ambiguity.",
      affectedConditionOrInterpretation: "Which of the four rates governs a given scenario",
      sourceReferences: ["SMC 23.44.060.A.1", "SMC 23.44.060.A.2", "SMC 23.44.060.A.3", "SMC 23.44.060.A.4"],
      resolutionStatus: "Not a governance blocker - each subclause's own number is unambiguous.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "General default rate, countable lot area established", input: { densityCountableLotAreaSqFt: 6250 }, expected: { rawUnits: 5 } }],
});

export const realVacantLandSmallLotDensityBonusCandidate = candidate({
  id: "vacant-land-small-lot-density-bonus-nr-2026",
  subject: "Small-lot density bonus (<5,000 sq ft) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY", scenarioId: "SMALL_LOT_BONUS", sqFtPerUnit: 900 },
  citation: { smcSections: ["SMC 23.44.060.C.1"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "ECA-absence condition",
      description: "A lot under 5,000 sq ft may be developed with up to 4 dwelling units, provided it contains no riparian corridor/wetland+buffer/submerged-land-or-shoreline-setback/steep-slope non-disturbance area - the same unresolved ECA area-of-overlap gap BR-U4-7 already found.",
      affectedConditionOrInterpretation: "Whether the bonus applies to a given small lot",
      sourceReferences: ["SMC 23.44.060.C.1", "SMC 23.44.080.B"],
      resolutionStatus: "Not a governance blocker - a real, disclosed evidence gap independent of Tier.",
    },
  ],
  testCases: [{ kind: "EXCEPTION", description: "Lot under 5,000 sq ft, ECA presence unresolved", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } }],
});

export const realVacantLandTransitDensityBonusCandidate = candidate({
  id: "vacant-land-transit-density-bonus-nr-2026",
  subject: "Small-lot + major-transit density bonus (<7,500 sq ft) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY", scenarioId: "TRANSIT_BONUS", sqFtPerUnit: 1250 },
  citation: { smcSections: ["SMC 23.44.060.C.2"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "unintegrated transit-proximity data gap",
      description: "A lot under 7,500 sq ft within 1/4 mile walking distance of a 'major transit service' stop may reach up to 6 units under the same ECA-absence condition as C.1 - no transit-service-area GIS layer is integrated in this project.",
      affectedConditionOrInterpretation: "Whether the transit-proximity condition is met",
      sourceReferences: ["SMC 23.44.060.C.2"],
      resolutionStatus: "Not a governance blocker - flagged for founder awareness, no new integration improvised.",
    },
  ],
  testCases: [{ kind: "EXCEPTION", description: "Transit-stop distance unknown (expected for essentially every real parcel today)", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } }],
});

export const realVacantLandLowIncomeDensityBonusCandidate = candidate({
  id: "vacant-land-low-income-density-bonus-nr-2026",
  subject: "Small-lot low-income-housing density bonus (<7,500 sq ft, not near transit) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY", scenarioId: "LOW_INCOME_BONUS", sqFtPerUnit: 1250 },
  citation: { smcSections: ["SMC 23.44.060.C.3"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "genuine discretionary/administrative mechanism",
      description: "Reaching up to 6 units requires at least 2 principal units to be low-income units subject to a City-enforceable regulatory agreement, administered by a qualifying non-profit per Office-of-Housing criteria - a real administrative process, not resolvable by better data alone (survives the 'assuming facts were known' test).",
      affectedConditionOrInterpretation: "Whether a qualifying regulatory agreement exists or would be pursued",
      sourceReferences: ["SMC 23.44.060.C.3"],
      resolutionStatus: "TIER 2 - deferred to the post-POC professional-review milestone.",
    },
  ],
  testCases: [{ kind: "EXCEPTION", description: "No regulatory agreement in evidence", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } }],
});

export const realVacantLandEcaProportionalDensityCandidate = candidate({
  id: "vacant-land-eca-proportional-density-nr-2026",
  subject: "ECA-proportional density calculation - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY", scenarioId: "ECA_PROPORTIONAL", sqFtPerUnit: 1250 },
  citation: { smcSections: ["SMC 23.44.060.C.4"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "measured-percentage evidence gap",
      description: "On a lot containing ECA area, density may instead be computed as (units allowed under C.1-C.3 assuming no ECA) x (percentage of the lot NOT covered by ECA area), with a floor of at least 1 unit (cross-referencing U1). The formula itself is unambiguous; it requires knowing the actual measured percentage of ECA coverage, not merely whether any ECA area is present - the same area-of-overlap gap as U11/BR-U4-7.",
      affectedConditionOrInterpretation: "The actual measured ECA-covered percentage",
      sourceReferences: ["SMC 23.44.060.C.4"],
      resolutionStatus: "Not a governance blocker - a real, disclosed evidence gap.",
    },
  ],
  testCases: [{ kind: "EXCEPTION", description: "ECA-covered percentage cannot be measured (expected common case)", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } }],
});

export const realVacantLandDensityCountableAreaCandidate = candidate({
  id: "vacant-land-density-countable-area-nr-2026",
  subject: "Density-countable lot area (ECA/steep-slope exclusions from the divisor, U16) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY_COUNTABLE_AREA" },
  citation: { smcSections: ["SMC 23.44.060.D.6", "SMC 23.44.060.E"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "divisor correction, not raw parcel area",
      description: "The 'lot area' every density rate divides by is not the raw parcel boundary area - D.6 requires subtracting any steep-slope non-disturbance area (E) and other D.6-listed ECA categories first. rawParcelAreaSqFt alone is never sufficient input to a density figure.",
      affectedConditionOrInterpretation: "The regulatory density divisor",
      sourceReferences: ["SMC 23.44.060.D.6", "SMC 23.44.060.E"],
      resolutionStatus: "Not a governance blocker - the same ECA area-of-overlap capability gap applied to the density divisor specifically.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "No D.6-listed area intersects the parcel (confidently established)", input: {}, expected: { densityCountableLotAreaSqFt: "equals rawParcelAreaSqFt" } }],
});

export const realVacantLandFractionRoundingCandidate = candidate({
  id: "vacant-land-fraction-rounding-nr-2026",
  subject: "Fraction-rounding rule for computed dwelling-unit counts (U17) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_FRACTION_ROUNDING", thresholdFraction: 0.85 },
  citation: { smcSections: ["SMC 23.44.060.D.1"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "pure computation step, no evidence gap",
      description: "A fraction over 0.85 constitutes an additional unit - not ordinary round-half-up. This is a pure arithmetic rule applied to whichever density formula's own output; it inherits that formula's own KNOWN/REQUIRES_VERIFICATION status rather than introducing a new evidence gap of its own.",
      affectedConditionOrInterpretation: "The final rounded dwelling-unit count",
      sourceReferences: ["SMC 23.44.060.D.1"],
      resolutionStatus: "Not a governance blocker.",
    },
  ],
  testCases: [
    { kind: "BOUNDARY", description: "Fraction exactly 0.85 does not round up", input: { rawUnitCount: 4.85 }, expected: { rounded: 4 } },
    { kind: "POSITIVE", description: "Fraction over 0.85 rounds up", input: { rawUnitCount: 4.86 }, expected: { rounded: 5 } },
  ],
});

export const realVacantLandHeightCandidate = candidate({
  id: "vacant-land-height-nr-2026",
  subject: "Height for a new principal dwelling - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_HEIGHT", scenarioId: "GENERAL_DENSITY", maxFt: 32 },
  citation: { smcSections: ["SMC 23.44.070.A", "SMC 23.44.070.B"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "A.2.d scoping ambiguity",
      description: "32 ft base default (A.1) and B's roof-height bonuses are unambiguous; A.2.d's 42 ft tree-retention allowance is worded without an explicit principal-vs-accessory qualifier - the same genuine textual ambiguity Unit 4's H2 found, more materially relevant here since a real principal dwelling might genuinely want the bonus.",
      affectedConditionOrInterpretation: "Whether A.2.d's 42 ft bonus applies via the tree-retention pathway specifically",
      sourceReferences: ["SMC 23.44.070.A.2.d"],
      resolutionStatus: "TIER 2 - deferred to the post-POC professional-review milestone.",
      reviewerNotes: "Reviewer type: zoning consultant/planner.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "Base 32 ft figure, no A.2 bonus claimed", input: {}, expected: { classification: "KNOWN", value: 32 } }],
});

export const realVacantLandStackedHeightBonusCandidate = candidate({
  id: "vacant-land-stacked-height-bonus-nr-2026",
  subject: "42 ft height bonus for qualifying stacked/multi-unit configurations - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_HEIGHT", scenarioId: "STACKED_MULTI_UNIT", maxFt: 42 },
  citation: { smcSections: ["SMC 23.44.070.A.2"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "3+-unit/stacked-unit pathways, no scoping ambiguity",
      description: "A.2's 3+-principal-dwelling-unit and stacked-dwelling-unit pathways (subclauses a-c) have no A.2.d-style scoping ambiguity - unlike the tree-retention pathway (see realVacantLandHeightCandidate), these are TIER 1.",
      affectedConditionOrInterpretation: "n/a - stated for contrast with A.2.d",
      sourceReferences: ["SMC 23.44.070.A.2.a", "SMC 23.44.070.A.2.b", "SMC 23.44.070.A.2.c"],
      resolutionStatus: "Not a governance blocker.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "Qualifying stacked-dwelling-unit scenario", input: {}, expected: { classification: "KNOWN", value: 42 } }],
});

export const realVacantLandSetbackCandidate = candidate({
  id: "vacant-land-setback-nr-2026",
  subject: "Setback baseline for a new principal dwelling (Table A) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_SETBACK", scenarioId: "GENERAL_DENSITY", frontFt: 15, rearFt: 15, sideFt: 5, sideIsAveragingGoverned: true },
  citation: { smcSections: ["SMC 23.44.090 Table A"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "branch-selection facts, no textual ambiguity",
      description: "Front 15 ft (1-2 units)/10 ft (3+); rear 15 ft/10 ft/5 ft (small lot, transit)/0 ft (alley-abutting); side 3 ft (small lot, transit) / 5 ft average, 3 ft minimum otherwise - reused directly from Unit 4's own S1 candidate, now governing the principal structure. Which branch applies is scenario-determined, not a per-parcel ambiguity; lot-size/transit-area status for the small-lot branches is the same unresolved gap as U5.",
      affectedConditionOrInterpretation: "Which Table A branch governs a given scenario",
      sourceReferences: ["SMC 23.44.090 Table A"],
      resolutionStatus: "TIER 1 (governance) - same conclusion as Unit 4's S1.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "Ordinary (non-small-lot) case, unit count fixed by scenario", input: {}, expected: { classification: "KNOWN" } }],
});

export const realVacantLandBaseLotCoverageCandidate = candidate({
  id: "vacant-land-base-lot-coverage-nr-2026",
  subject: "Base maximum lot coverage - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_LOT_COVERAGE", scenarioId: "GENERAL_DENSITY", maxPercent: 50 },
  citation: { smcSections: ["SMC 23.44.080.A"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "identical to Unit 4's L1",
      description: "Same citation, same number, same governance-level Tier conclusion as Unit 4's L1 - reused directly, reached independently here on the same real basis.",
      affectedConditionOrInterpretation: "n/a",
      sourceReferences: ["SMC 23.44.080.A"],
      resolutionStatus: "Not a governance blocker.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "Base 50% default", input: {}, expected: { classification: "KNOWN", value: 50 } }],
});

export const realVacantLandExcludedLotAreaCandidate = candidate({
  id: "vacant-land-excluded-lot-area-nr-2026",
  subject: "Excluded lot-area categories (lot-coverage denominator) - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_EXCLUDED_LOT_AREA" },
  citation: { smcSections: ["SMC 23.44.080.B", "SMC 23.44.080.E"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "identical unresolved gap to Unit 4's L2",
      description: "TIER 1 (governance), blocked from usability by the same unresolved ECA area-of-overlap gap as Unit 4's L2/BR-U4-7 - unchanged, not re-litigated here.",
      affectedConditionOrInterpretation: "The actual excluded lot area",
      sourceReferences: ["SMC 23.44.080.B", "SMC 23.44.080.E"],
      resolutionStatus: "Not a governance blocker - a real, disclosed evidence gap.",
    },
  ],
  testCases: [{ kind: "EXCEPTION", description: "No production ECA area-of-overlap capability", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } }],
});

export const realVacantLandNumeratorExclusionsCandidate = candidate({
  id: "vacant-land-numerator-exclusions-nr-2026",
  subject: "Lot-coverage numerator exclusions - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_NUMERATOR_EXCLUSIONS" },
  citation: { smcSections: ["SMC 23.44.080.C"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "identical to Unit 4's L3",
      description: "Same citation, same governance-level Tier conclusion as Unit 4's L3.",
      affectedConditionOrInterpretation: "n/a",
      sourceReferences: ["SMC 23.44.080.C"],
      resolutionStatus: "Not a governance blocker.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "Standard numerator exclusions applied", input: {}, expected: { classification: "KNOWN" } }],
});

export const realVacantLandMinimumCoverageFloorCandidate = candidate({
  id: "vacant-land-minimum-coverage-floor-nr-2026",
  subject: "Minimum lot coverage floor - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_MINIMUM_COVERAGE_FLOOR" },
  citation: { smcSections: ["SMC 23.44.080.D"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "genuine Director-approval discretionary mechanism",
      description: "The same Director-approval discretionary mechanism as Unit 4's L4 - a real administrative determination, not resolvable by better data alone.",
      affectedConditionOrInterpretation: "The actual minimum allowed coverage on a constrained lot",
      sourceReferences: ["SMC 23.44.080.D"],
      resolutionStatus: "TIER 2 - deferred to the post-POC professional-review milestone.",
    },
  ],
  testCases: [{ kind: "EXCEPTION", description: "Director-approval status unresolved", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } }],
});

export const realVacantLandTransitLotCoverageBonusCandidate = candidate({
  id: "vacant-land-transit-lot-coverage-bonus-nr-2026",
  subject: "Frequent-transit-area multi-unit 60% lot-coverage provision - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_LOT_COVERAGE", scenarioId: "TRANSIT_BONUS", maxPercent: 60 },
  citation: { smcSections: ["SMC 23.44.080.F"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "re-triaged for vacant-land context, unlike Unit 4's L5",
      description: "Unit 4's L5 found a genuine scoping ambiguity (accessory-garage presence vs. 'entirely of dwelling units') forcing Tier 2. That ambiguity does not arise for a vacant-land scenario genuinely representing a qualifying multi-unit residential development - re-triaged to Tier 1 here, Unit 4's own garage-context finding left unchanged. Requires the same frequent-transit-area gap as U5/U9.",
      affectedConditionOrInterpretation: "Frequent-transit-area status",
      sourceReferences: ["SMC 23.44.080.F"],
      resolutionStatus: "TIER 1 (governance) - a genuine, context-driven re-triage, not a blanket reclassification.",
    },
  ],
  testCases: [{ kind: "EXCEPTION", description: "Frequent-transit-area status unresolved", input: {}, expected: { classification: "REQUIRES_VERIFICATION" } }],
});

export const realVacantLandStackedLotCoverageBonusCandidate = candidate({
  id: "vacant-land-stacked-lot-coverage-bonus-nr-2026",
  subject: "Stacked-dwelling-units 60% lot-coverage provision - Seattle NR zone",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "VACANT_LAND_LOT_COVERAGE", scenarioId: "STACKED_MULTI_UNIT", maxPercent: 60 },
  citation: { smcSections: ["SMC 23.44.080.G"], ...ORDINANCE_CITATION },
  caveats: [
    {
      category: "identical conclusion to Unit 4's L6, more directly usable here",
      description: "Here the 'stacked dwelling units' fact is the scenario itself being evaluated, not a self-reported physical fact about an existing building - even more directly usable than in Unit 4's own context.",
      affectedConditionOrInterpretation: "n/a",
      sourceReferences: ["SMC 23.44.080.G"],
      resolutionStatus: "Not a governance blocker.",
    },
  ],
  testCases: [{ kind: "POSITIVE", description: "Stacked-dwelling-units scenario", input: {}, expected: { classification: "KNOWN", value: 60 } }],
});

/** All 17 real, non-ACTIVE candidates (U1-U17), for iteration in tests proving the governance
 * completeness invariant (Code Generation review Correction 1A). */
export const ALL_REAL_VACANT_LAND_CANDIDATES: DraftedRuleInput[] = [
  realVacantLandBuildabilityFloorCandidate, // U1
  realVacantLandPermittedUseCandidate, // U2
  realVacantLandBaseDensityCandidate, // U3
  realVacantLandSmallLotDensityBonusCandidate, // U4
  realVacantLandTransitDensityBonusCandidate, // U5
  realVacantLandLowIncomeDensityBonusCandidate, // U6 (TIER 2)
  realVacantLandEcaProportionalDensityCandidate, // U7
  realVacantLandHeightCandidate, // U8 (TIER 2)
  realVacantLandSetbackCandidate, // U9
  realVacantLandBaseLotCoverageCandidate, // U10
  realVacantLandExcludedLotAreaCandidate, // U11
  realVacantLandNumeratorExclusionsCandidate, // U12
  realVacantLandMinimumCoverageFloorCandidate, // U13 (TIER 2)
  realVacantLandTransitLotCoverageBonusCandidate, // U14
  realVacantLandStackedLotCoverageBonusCandidate, // U15
  realVacantLandDensityCountableAreaCandidate, // U16
  realVacantLandFractionRoundingCandidate, // U17
  // U8 and U15's own "bonus" siblings, kept adjacent to their base candidates above for real,
  // structural coverage of the height/coverage bonus pathways the inventory documents.
  realVacantLandStackedHeightBonusCandidate,
];
