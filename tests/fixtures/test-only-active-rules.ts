/**
 * TEST-ONLY ACTIVE rule fixtures - used exclusively to prove Regulatory Rules Engine
 * (evaluate.ts) correctness. Content mirrors the real Unit 0B shed rule shape for realism, but
 * these are clearly-labeled (isTestOnlyFixture: true) synthetic records manually constructed at
 * ACTIVE state for testing, NEVER the real shed candidate (see tests/fixtures/shed-candidate.ts
 * and tests/regulatory-rule-governance/shed-candidate.test.ts for that honest, non-ACTIVE status).
 */

import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import type { InferencePolicy } from "../../src/regulatory-rule-governance/types.js";

function testOnlyActiveRule(overrides: Partial<RegulatoryRule> & Pick<RegulatoryRule, "id" | "ruleSpecification" | "subject">): RegulatoryRule {
  return {
    applicableProjectType: "shed",
    applicableZone: "TEST-NR",
    citation: { smcSections: ["TEST.23.44.0"] },
    lifecycleState: "ACTIVE",
    tier: "TIER_1",
    caveats: [],
    testCases: [],
    verificationHistory: [
      { tier: "TIER_1", founderIdentity: "test-founder@example.com", founderVerifiedAt: "2026-01-01T00:00:00.000Z" },
    ],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: ["AUTHORITATIVE"],
    ...overrides,
  };
}

export const rearSetbackRule = testOnlyActiveRule({
  id: "test-active-rear-setback",
  subject: "TEST-ONLY: Shed rear setback",
  ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
});

export const heightRule = testOnlyActiveRule({
  id: "test-active-height",
  subject: "TEST-ONLY: Shed height limit",
  ruleSpecification: { ruleType: "HEIGHT_LIMIT", maxFt: 12 },
});

export const dwellingSeparationRule = testOnlyActiveRule({
  id: "test-active-dwelling-separation",
  subject: "TEST-ONLY: Shed dwelling separation",
  ruleSpecification: { ruleType: "DWELLING_SEPARATION", minFt: 3 },
});

export const sideFrontSetbackRule = testOnlyActiveRule({
  id: "test-active-side-front-setback",
  subject: "TEST-ONLY: Shed side/front setback (standard, no reduction)",
  ruleSpecification: { ruleType: "SIDE_FRONT_SETBACK_STANDARD", sideAverageFt: 5, sideMinFt: 3, frontFt: 15 },
});

export const zoneBoundaryInferenceRule = testOnlyActiveRule({
  id: "test-active-zone-boundary-inference",
  subject: "TEST-ONLY: Applicable zone when parcel straddles a zoning boundary",
  ruleSpecification: { ruleType: "REQUIRES_INFERENCE_POLICY", situationKey: "zone-boundary-straddle" },
});

/** A rule left in DRAFTED (not ACTIVE) - used to prove the Engine's ACTIVE-only filter. */
export const notYetActiveRule = testOnlyActiveRule({
  id: "test-not-active",
  subject: "TEST-ONLY: should never be evaluated",
  ruleSpecification: { ruleType: "HEIGHT_LIMIT", maxFt: 1 },
  lifecycleState: "DRAFTED",
});

/** BR-U2-10 fixtures: an ACTIVE rear-setback rule whose governance approval did NOT accept
 * GENERAL_LOCATION_ONLY evidence (the safe default - silent means not-accepted), and one that
 * explicitly did. Both otherwise identical to rearSetbackRule. */
export const rearSetbackRuleAuthoritativeOnly = testOnlyActiveRule({
  id: "test-active-rear-setback-authoritative-only",
  subject: "TEST-ONLY: Shed rear setback (authoritative evidence only)",
  ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
  acceptedEvidenceQuality: ["AUTHORITATIVE"],
});

export const rearSetbackRuleAcceptsGeneralLocation = testOnlyActiveRule({
  id: "test-active-rear-setback-accepts-general-location",
  subject: "TEST-ONLY: Shed rear setback (accepts general-location evidence)",
  ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
  acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
});

export const generalLocationSetbackInferencePolicy: InferencePolicy = {
  id: "test-inference-policy-general-location-setback",
  subject: "GENERAL_LOCATION_ONLY_SETBACK_EVIDENCE",
  derivationMethod: "TEST-ONLY: accept general-location parcel geometry with a documented margin-of-error allowance",
  citationOrBasis: "TEST-ONLY fixture basis",
  lifecycleState: "ACTIVE",
  version: "1.0.0",
  isTestOnlyFixture: true,
};

/** Unit 4 - synthetic ACTIVE garage fixtures. Never the real candidates
 * (garage-rule-inventory-and-tier-triage.md's H1/H2/S1-S5/L1-L6, all held honestly non-ACTIVE per
 * business-rules.md BR-U4-4 - see tests/fixtures/garage-candidate.ts for that). */
export const garageRearSetbackRule = testOnlyActiveRule({
  id: "test-active-garage-rear-setback",
  subject: "TEST-ONLY: Garage rear setback",
  applicableProjectType: "garage",
  ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
});

export const garageHeightRule = testOnlyActiveRule({
  id: "test-active-garage-height",
  subject: "TEST-ONLY: Garage height limit",
  applicableProjectType: "garage",
  ruleSpecification: { ruleType: "HEIGHT_LIMIT", maxFt: 12 },
});

export const garageLotCoverageRule = testOnlyActiveRule({
  id: "test-active-garage-lot-coverage",
  subject: "TEST-ONLY: Garage lot coverage",
  applicableProjectType: "garage",
  ruleSpecification: { ruleType: "LOT_COVERAGE" },
});

/** Unit 5 - synthetic ACTIVE vacant-land fixtures. Never the real candidates
 * (vacant-land-rule-inventory-and-tier-triage.md's U1-U17, all held honestly non-ACTIVE per
 * business-rules.md BR-U5-5 - see tests/fixtures/vacant-land-candidate.ts for that). Each
 * explicitly sets applicableProjectType: undefined / applicableWorkflowType: "VACANT_LAND" -
 * never the shed/garage default this helper otherwise applies. */
export const vacantLandBuildabilityFloorRule = testOnlyActiveRule({
  id: "test-active-vacant-land-buildability-floor",
  subject: "TEST-ONLY: Vacant-land buildability floor",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_BUILDABILITY_FLOOR" },
});

export const vacantLandPermittedUseRule = testOnlyActiveRule({
  id: "test-active-vacant-land-permitted-use",
  subject: "TEST-ONLY: Vacant-land permitted use",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_PERMITTED_USE" },
});

/** Code Generation review correction - every scenario-scoped ruleType now carries a real
 * scenarioId (GENERAL_DENSITY/SMALL_LOT_BONUS/TRANSIT_BONUS/STACKED_MULTI_UNIT,
 * evaluate-vacant-land.ts's SCENARIO_DEFINITIONS), disambiguating multiple ACTIVE rules of the
 * same ruleType across scenarios. */
export const vacantLandDensityRuleGeneral = testOnlyActiveRule({
  id: "test-active-vacant-land-density-general",
  subject: "TEST-ONLY: Vacant-land general density",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY", scenarioId: "GENERAL_DENSITY", sqFtPerUnit: 1250 },
});

export const vacantLandDensityRuleSmallLot = testOnlyActiveRule({
  id: "test-active-vacant-land-density-small-lot",
  subject: "TEST-ONLY: Vacant-land small-lot density bonus",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_DENSITY", scenarioId: "SMALL_LOT_BONUS", sqFtPerUnit: 900 },
});

export const vacantLandHeightRuleGeneral = testOnlyActiveRule({
  id: "test-active-vacant-land-height-general",
  subject: "TEST-ONLY: Vacant-land height limit (general)",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_HEIGHT", scenarioId: "GENERAL_DENSITY", maxFt: 32 },
});

export const vacantLandHeightRuleStacked = testOnlyActiveRule({
  id: "test-active-vacant-land-height-stacked",
  subject: "TEST-ONLY: Vacant-land height limit (stacked bonus)",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_HEIGHT", scenarioId: "STACKED_MULTI_UNIT", maxFt: 42 },
});

export const vacantLandLotCoverageRuleGeneral = testOnlyActiveRule({
  id: "test-active-vacant-land-lot-coverage-general",
  subject: "TEST-ONLY: Vacant-land lot coverage (general)",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_LOT_COVERAGE", scenarioId: "GENERAL_DENSITY", maxPercent: 50 },
});

export const vacantLandLotCoverageRuleTransit = testOnlyActiveRule({
  id: "test-active-vacant-land-lot-coverage-transit",
  subject: "TEST-ONLY: Vacant-land lot coverage (transit bonus)",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_LOT_COVERAGE", scenarioId: "TRANSIT_BONUS", maxPercent: 60 },
});

export const vacantLandSetbackRuleGeneral = testOnlyActiveRule({
  id: "test-active-vacant-land-setback-general",
  subject: "TEST-ONLY: Vacant-land setback (general)",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_SETBACK", scenarioId: "GENERAL_DENSITY", frontFt: 15, rearFt: 15, sideFt: 5, sideIsAveragingGoverned: true },
});

export const vacantLandFractionRoundingRule = testOnlyActiveRule({
  id: "test-active-vacant-land-fraction-rounding",
  subject: "TEST-ONLY: Vacant-land fraction-unit rounding (U17)",
  applicableProjectType: undefined,
  applicableWorkflowType: "VACANT_LAND",
  ruleSpecification: { ruleType: "VACANT_LAND_FRACTION_ROUNDING", thresholdFraction: 0.85 },
});

export const approvedZoneBoundaryPolicy: InferencePolicy = {
  id: "test-inference-policy-zone-boundary",
  subject: "zone-boundary-straddle",
  derivationMethod: "proportional area of parcel within each zoning polygon",
  citationOrBasis: "TEST-ONLY fixture basis",
  lifecycleState: "ACTIVE",
  version: "1.0.0",
  isTestOnlyFixture: true,
};
