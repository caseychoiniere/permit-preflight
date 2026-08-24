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

export const approvedZoneBoundaryPolicy: InferencePolicy = {
  id: "test-inference-policy-zone-boundary",
  subject: "zone-boundary-straddle",
  derivationMethod: "proportional area of parcel within each zoning polygon",
  citationOrBasis: "TEST-ONLY fixture basis",
  lifecycleState: "ACTIVE",
  version: "1.0.0",
  isTestOnlyFixture: true,
};
