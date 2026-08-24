/**
 * The REAL candidate shed rule researched during Unit 0B
 * (aidlc-docs/construction/unit-0-pre-construction-validation/unit-0b-findings.md).
 *
 * This is genuine candidate regulatory content with a real citation - NOT a hypothetical
 * example. Per the user's explicit instruction, it is defined here only up to DRAFTED/TRIAGED
 * (Tier 2, founder-triaged) and is NEVER advanced to SOURCE_VERIFIED/APPROVED/ACTIVE in this
 * codebase, because that would require an actual land-use professional's recorded opinion, which
 * has not happened. See tests/regulatory-rule-governance/shed-candidate.test.ts for the test
 * that proves this status is honestly preserved, not bypassed.
 */

import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";

export const realShedCandidate: DraftedRuleInput = {
  id: "shed-rear-setback-nr-2026",
  subject: "Detached accessory structure (shed) rear-yard setback, height, and dwelling separation - Seattle NR zone",
  applicableProjectType: "shed",
  applicableZone: "NR",
  ruleSpecification: {
    ruleType: "REAR_SETBACK",
    minFt: 5,
    minFtIfAlleyAdjacent: 0,
  },
  citation: {
    smcSections: ["SMC 23.44.070.A.3", "SMC 23.44.090 Table A", "SMC 23.44.090.I.2"],
    ordinanceNumber: "127376",
    effectiveDate: undefined,
    effectiveDateBasis:
      "Ordinance 127376 passed 2025-12-16, signed 2025-12-22; exact effective date inferred from Seattle's " +
      "standard 30-day-post-publication default, not directly stated in the primary source.",
  },
  caveats: [
    {
      category: "inferred from absence of provision",
      description:
        "SMC 23.44.090.I.2 gives sheds a reduced rear-setback allowance, but is silent on whether the same " +
        "reduction applies to side or front yards - the candidate rule assumes it does not (full standard " +
        "setback applies to side/front), based on the absence of an equivalent stated exception there.",
      affectedConditionOrInterpretation: "Side/front yard setback applicability for accessory structures",
      sourceReferences: ["SMC 23.44.090.I.2", "SMC 23.44.090 Table A"],
      resolutionStatus: "Not yet reviewed by a domain professional - remains an open caveat pending Tier 2 review.",
    },
    {
      category: "unread adjacent section",
      description: "SMC 23.44.120 through .190 were not read during research; cannot rule out an additional applicable provision.",
      affectedConditionOrInterpretation: "Completeness of the applicable rule set",
      sourceReferences: ["SMC 23.44 (chapter, sections .120-.190 unread)"],
      resolutionStatus: "Not yet reviewed by a domain professional.",
    },
    {
      category: "conflicting guidance sources",
      description:
        "Some public SDCI guidance referenced legacy NR1/NR2/NR3 zone subtypes that appear to predate " +
        "Ordinance 127376's rezone consolidating them into a single flat NR zone - a real risk of stale " +
        "guidance being mistaken for current law.",
      affectedConditionOrInterpretation: "Which zone-subtype-specific rules, if any, still apply",
      sourceReferences: ["SDCI public guidance (undated)", "Ordinance 127376"],
      resolutionStatus: "Not yet reviewed by a domain professional.",
    },
  ],
  testCases: [
    {
      kind: "POSITIVE",
      description: "Interior lot, 96 sqft shed, 6ft from rear line, not alley-adjacent - passes",
      input: { distanceToRearLotLineFt: 6, alleyAdjacent: false },
      expected: { complianceOutcome: "PASS" },
    },
    {
      kind: "NEGATIVE",
      description: "Shed 3ft from rear line, not alley-adjacent - fails the 5ft minimum",
      input: { distanceToRearLotLineFt: 3, alleyAdjacent: false },
      expected: { complianceOutcome: "FAIL" },
    },
    {
      kind: "BOUNDARY",
      description: "Shed exactly 5ft from rear line, not alley-adjacent - passes at the boundary",
      input: { distanceToRearLotLineFt: 5, alleyAdjacent: false },
      expected: { complianceOutcome: "PASS" },
    },
    {
      kind: "EXCEPTION",
      description: "Shed directly on the rear lot line, but that line abuts an alley - passes under the alley exception",
      input: { distanceToRearLotLineFt: 0, alleyAdjacent: true },
      expected: { complianceOutcome: "PASS" },
    },
  ],
  isTestOnlyFixture: false, // this IS the real candidate - explicitly distinguished from test fixtures
};
