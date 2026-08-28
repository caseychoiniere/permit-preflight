/**
 * The REAL candidate garage lot-coverage rule (L1) researched during Unit 4 Functional Design
 * (aidlc-docs/construction/unit-4-detached-garages/functional-design/
 * garage-rule-inventory-and-tier-triage.md).
 *
 * L1 is the one candidate in the 13-candidate garage inventory (H1, H2, S1-S5, L1-L6) classified
 * TIER 1 on governance grounds - a single unambiguous default (50%), explicit and enumerable
 * exceptions (L5/L6), no discretionary determination, no conflicting cross-reference. It does NOT
 * mean this rule's finding can reach KNOWN today - business-rules.md BR-U4-3/BR-U4-7 independently
 * block that regardless of Tier, since the required existing-structures figure is always
 * USER_SUPPLIED and the countable-lot-area denominator has no production ECA measurement
 * capability. Held here only up to DRAFTED/TRIAGED, per business-rules.md BR-U4-4 - the founder's
 * explicit sequencing decision defers any professional review (needed for the OTHER 12 candidates,
 * not this one) to a post-POC "Regulatory Professional Review / Commercialization Gate" milestone,
 * and Unit 4 Construction does not fabricate further governance progress ahead of that. See
 * tests/regulatory-rule-governance/garage-candidate.test.ts for the test proving this status is
 * honestly preserved.
 */

import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";

export const realGarageLotCoverageCandidate: DraftedRuleInput = {
  id: "garage-lot-coverage-base-nr-2026",
  subject: "Detached garage lot coverage (base 50% maximum) - Seattle NR zone",
  applicableProjectType: "garage",
  applicableZone: "NR",
  ruleSpecification: {
    ruleType: "LOT_COVERAGE",
  },
  citation: {
    smcSections: ["SMC 23.44.080.A"],
    ordinanceNumber: "127376",
    effectiveDate: undefined,
    effectiveDateBasis:
      "Ordinance 127376 passed 2025-12-16, signed 2025-12-22; exact effective date inferred from Seattle's " +
      "standard 30-day-post-publication default, not directly stated in the primary source.",
  },
  caveats: [
    {
      category: "explicit statutory exception not modeled by this candidate alone",
      description:
        "SMC 23.44.080.A's 50% default is itself subject to SMC 23.44.080.F (frequent-transit-area " +
        "multi-unit development, 60%) and SMC 23.44.080.G (stacked dwelling units, 60%) - both real, " +
        "in-scope candidates (L5, L6) triaged separately and independently, both Tier 2. This candidate " +
        "covers only the base-default case; the applicable-percentage resolution logic (which of L1/L5/L6 " +
        "governs a given parcel) lives in application code (LotCoverageFacts.applicableCoveragePercentage), " +
        "not in this rule's own specification.",
      affectedConditionOrInterpretation: "Whether 50% or 60% is the actually-applicable maximum for a given parcel",
      sourceReferences: ["SMC 23.44.080.A", "SMC 23.44.080.F", "SMC 23.44.080.G"],
      resolutionStatus: "L5/L6's own Tier-2 status is unresolved pending the deferred professional-review milestone - this caveat cannot close until they do.",
    },
    {
      category: "explicit statutory floor not modeled by this candidate alone",
      description:
        "SMC 23.44.080.D establishes a minimum coverage floor (625 sq ft, or a greater Director-approved " +
        "amount) on any lot containing an SMC 23.44.080.B-listed area - a real, in-scope candidate (L4), " +
        "Tier 2 on the Director-determination ground. This candidate does not itself apply that floor.",
      affectedConditionOrInterpretation: "The actual minimum allowed coverage on a B-constrained lot",
      sourceReferences: ["SMC 23.44.080.D"],
      resolutionStatus: "L4's own Tier-2 status is unresolved pending the deferred professional-review milestone.",
    },
    {
      category: "unread adjacent section",
      description: "SMC 23.44.090 through .190 (setback/separation/amenity-area/tree provisions) were read separately for the setback/height candidates (H1, H2, S1-S5), not re-verified against this specific lot-coverage candidate's own scope.",
      affectedConditionOrInterpretation: "Completeness of the applicable rule set",
      sourceReferences: ["SMC 23.44 (chapter)"],
      resolutionStatus: "Not yet reviewed by a domain professional.",
    },
  ],
  testCases: [
    {
      kind: "POSITIVE",
      description: "Countable coverage well under 50% of countable lot area - would PASS if the numerator/denominator were both KNOWN (they are not, in production, per BR-U4-3/BR-U4-7)",
      input: { combinedNumeratorSqFt: 1500, countableLotAreaSqFt: 5000, applicableCoveragePercent: 50 },
      expected: { wouldBeComplianceOutcome: "PASS" },
    },
    {
      kind: "NEGATIVE",
      description: "Countable coverage over 50% of countable lot area - would FAIL if both figures were KNOWN",
      input: { combinedNumeratorSqFt: 3000, countableLotAreaSqFt: 5000, applicableCoveragePercent: 50 },
      expected: { wouldBeComplianceOutcome: "FAIL" },
    },
    {
      kind: "BOUNDARY",
      description: "Countable coverage exactly at 50% of countable lot area",
      input: { combinedNumeratorSqFt: 2500, countableLotAreaSqFt: 5000, applicableCoveragePercent: 50 },
      expected: { wouldBeComplianceOutcome: "PASS" },
    },
    {
      kind: "EXCEPTION",
      description: "Existing-structures figure not supplied - REQUIRES_VERIFICATION regardless of how the comparison would resolve (BR-U4-3, the actual production behavior for every real garage submission today)",
      input: { existingStructuresCountableFootprintSqFt: undefined },
      expected: { classification: "REQUIRES_VERIFICATION" },
    },
  ],
  isTestOnlyFixture: false, // this IS the real candidate - explicitly distinguished from test fixtures
};
