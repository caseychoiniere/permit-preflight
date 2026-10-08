/**
 * The six REAL Unit 8 (Decks) governance candidates (aidlc-docs/construction/unit-8-decks/
 * functional-design.md §4). Real, non-fixture content mirroring fence-candidates.ts. Every threshold
 * the evaluator uses lives on `ruleSpecification` here. All Tier 1; advanced only to APPROVED by the
 * unit's one-off lifecycle script; activation is a separate founder decision. Each declared test case
 * is executed against the real evaluator by tests/regulatory-rule-governance/deck-candidates.test.ts.
 */

import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { DeckRuleType } from "../../src/regulatory-rules-engine/deck-types.js";

const ORD = "127376";
const MUNI_BASIS = "Ordinance 127376 (2025), SMC 23.44 as published on Municode Library (CURRENT), read live 2026-10-08.";
const SRC_BASIS = "2021 Seattle Residential Code, Chapter 1 (Seattle amendments), SDCI 2021SRCChapter1.pdf, text extracted from the PDF 2026-10-08.";
const SDCI_DECKS = "SDCI Decks page (seattle.gov/construction-and-inspections/permits/common-projects/decks), read live 2026-10-08";

const DECLARED_CAVEAT = {
  category: "declared input, not a measurement",
  description: "Deck height, size, location and structure facts are declared by the customer; the evaluator never measures the site. Every finding states it rests on the declared details, and an unanswered question resolves REQUIRES_VERIFICATION - never guessed.",
  affectedConditionOrInterpretation: "Whether the declared location is in fact a required setback",
  sourceReferences: ["SMC 23.44.090 Table A"],
  resolutionStatus: "Resolved by design - the report labels every conclusion as based on the declared details.",
};


export const realDeckCandidates: DraftedRuleInput[] = [
  {
    id: "deck-d1-setback-height-allowance-2026",
    subject: "Deck in a required setback - allowed up to 18 in above grade; above that no automatic allowance (rear-setback and porch allowances named, never assumed)",
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: {
      ruleType: DeckRuleType.SETBACK_HEIGHT_ALLOWANCE,
      allowedInSetbackMaxIn: 18,
      rearSetbackAllowance: { minDistanceFromRearLotLineFt: 5, maxHeightFt: 12, minSeparationFromDwellingFt: 3 },
    },
    citation: { smcSections: ["SMC 23.44.090.H.1", "SMC 23.44.090.H.8", "SMC 23.44.090.E.4"], ordinanceNumber: ORD, effectiveDateBasis: MUNI_BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "unresolved source conflict, disclosed",
        description:
          "SDCI's Decks page says a deck over 18 in cannot be within the required setbacks. The code text is narrower: H.1 gives an automatic allowance only up to 18 in, while H.8 separately allows certain unenclosed structures in a rear setback (>= 5 ft from a non-alley rear lot line, <= 12 ft high, >= 3 ft from the dwelling) and E.4 allows porches and steps. Permit Preflight does not resolve the conflict: it attributes SDCI's guidance to SDCI, names the code allowances, mechanically compares declared numbers to H.8's conditions, and says whether any allowance applies is for SDCI to determine. A deck above 18 in in a setback is never reported as a violation.",
        affectedConditionOrInterpretation: "Decks above 18 in in a required setback",
        sourceReferences: ["SMC 23.44.090.H.1, H.8, E.4", SDCI_DECKS],
        resolutionStatus: "Unresolved - disclosed in the customer-facing text; REQUIRES_VERIFICATION is the terminal state.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "16 in deck in the side setback", input: { heightAboveGradeIn: 16, setbackLocations: ["SIDE_SETBACK"] }, expected: { subject: "Deck setback (side setback)", outcome: "KNOWN/PASS" } },
      { kind: "NEGATIVE", description: "30 in deck in the front setback is not automatically allowed", input: { heightAboveGradeIn: 30, setbackLocations: ["FRONT_SETBACK"] }, expected: { subject: "Deck setback (front setback)", outcome: "REQUIRES_VERIFICATION", contains: "Whether this deck qualifies for it, or for any other allowance, is for SDCI to determine" } },
      { kind: "EXCEPTION", description: "30 in detached deck 8 ft from the dwelling and 6 ft from the rear lot line (rear-setback allowance met)", input: { heightAboveGradeIn: 30, attachment: "DETACHED", setbackLocations: ["REAR_SETBACK"], distanceFromRearLotLineFt: 6, distanceFromDwellingFt: 8 }, expected: { subject: "Deck setback (rear setback)", outcome: "REQUIRES_VERIFICATION", contains: "appears to meet the rear-setback allowance" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "deck-d2-lot-coverage-threshold-2026",
    subject: "Deck lot coverage - a deck or part of a deck 36 in or less above existing grade is not counted",
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: { ruleType: DeckRuleType.LOT_COVERAGE_THRESHOLD, notCountedMaxHeightIn: 36 },
    citation: { smcSections: ["SMC 23.44.080.C.3", "SMC 23.44.080.C.5"], ordinanceNumber: ORD, effectiveDateBasis: MUNI_BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "not estimated",
        description: "The code excludes only decks, or parts of a deck, at or below the threshold, so any part above it counts. Only the greatest height is declared, so the report says at least part counts, that how much depends on how much is above the threshold, and that lot coverage is not estimated for decks; the result is REQUIRES_VERIFICATION.",
        affectedConditionOrInterpretation: "Whether the deck changes the lot-coverage result",
        sourceReferences: ["SMC 23.44.080.C.3"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "36 in deck (inclusive threshold) is not counted", input: { heightAboveGradeIn: 36 }, expected: { subject: "Deck and lot coverage", outcome: "KNOWN" } },
      { kind: "NEGATIVE", description: "37 in deck counts toward lot coverage", input: { heightAboveGradeIn: 37 }, expected: { subject: "Deck and lot coverage", outcome: "REQUIRES_VERIFICATION", contains: "any part of a deck above 36 in counts toward lot coverage" } },
      { kind: "EXCEPTION", description: "A tall deck still only reports the threshold fact; it never claims a coverage figure", input: { heightAboveGradeIn: 60 }, expected: { subject: "Deck and lot coverage", outcome: "REQUIRES_VERIFICATION", contains: "does not estimate lot coverage" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "deck-d3-permit-exemption-2026",
    subject: "Deck building-permit exemption - not more than 18 in above grade and not over a basement or story below",
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: { ruleType: DeckRuleType.PERMIT_EXEMPTION, maxHeightIn: 18 },
    citation: {
      smcSections: ["2021 Seattle Residential Code (SRC) R105.1", "2021 SRC R105.2, Item 7"],
      effectiveDateBasis: `${SRC_BASIS} R105.1 requires a permit except as specifically provided; item 7 specifically exempts 'Platforms, walks and driveways not more than 18 inches above grade and not over any basement or story below'. ${SDCI_DECKS} concurs (a permit is needed for a deck more than 18 in above the ground or a roof deck).`,
    },
    caveats: [
      {
        category: "textual inference",
        description: "A deck outside item 7 has no exemption under the code, so a permit is required (R105.1). The ECA condition is separate (rule D5) and keeps a deck that meets item 7 at REQUIRES_VERIFICATION rather than exempt.",
        affectedConditionOrInterpretation: "Reading failure of the exemption as 'permit required'",
        sourceReferences: ["SRC R105.1", "SRC R105.2 item 7"],
        resolutionStatus: "Resolved - quoted in the design.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "18 in deck over open ground (inclusive): both exemption criteria met", input: { heightAboveGradeIn: 18, buildingRelation: "OPEN_GROUND_BELOW" }, expected: { buildingPermit: "REQUIRES_VERIFICATION", criterion: "HEIGHT", status: "MET" } },
      { kind: "NEGATIVE", description: "19 in deck requires a permit", input: { heightAboveGradeIn: 19 }, expected: { buildingPermit: "REQUIRED", criterion: "HEIGHT", status: "NOT_MET" } },
      { kind: "EXCEPTION", description: "A low deck over a basement or story below is not exempt", input: { heightAboveGradeIn: 12, buildingRelation: "OVER_BASEMENT_OR_STORY_BELOW", attachment: "ATTACHED_TO_DWELLING" }, expected: { buildingPermit: "REQUIRED", criterion: "STRUCTURE_BELOW", status: "NOT_MET" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "deck-d4-stfi-eligibility-2026",
    subject: "Deck permit review path - subject-to-field-inspection unless over 8 ft, beam 14 ft or longer, roof deck, solid flooring, or over 750 sq ft",
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: { ruleType: DeckRuleType.STFI_ELIGIBILITY, maxHeightAboveGroundFt: 8, beamLengthDisqualifyingFt: 14, maxAreaSqFt: 750 },
    citation: {
      smcSections: [SDCI_DECKS, "SDCI Tip 316 'Subject-to-Field-Inspection (STFI) Permits'"],
      effectiveDateBasis: `${SDCI_DECKS}: a deck needs a full addition-or-alteration permit if more than 8 feet above the ground, with beams 14 feet or longer, a roof deck, in an ECA, with a solid surface, or over 750 square feet; otherwise most decks require only a subject-to-field-inspection permit.`,
    },
    caveats: [
      {
        category: "agency guidance",
        description: "The review path rests on SDCI's published criteria, which list an ECA as a full-review trigger. ECA status is never determinable, so when no other trigger applies the path stays REQUIRES_VERIFICATION (reviewer decision fb0ec2e9: never STFI-likely) - differing deliberately from the shed Capability B result.",
        affectedConditionOrInterpretation: "Whether the deck is in an environmentally critical area",
        sourceReferences: [SDCI_DECKS],
        resolutionStatus: "Resolved by design - REQUIRES_VERIFICATION is the terminal state when only the ECA question is open.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "24 in, gapped decking, short beams, 200 sq ft, open ground: every screened criterion for a simple review is met, but the unresolved ECA question keeps the path unconfirmed (never STFI-likely)", input: { heightAboveGradeIn: 24, widthFt: 10, depthFt: 20, solidFlooring: false, longestBeamFt: 10 }, expected: { buildingPermit: "REQUIRED", reviewPath: "REQUIRES_VERIFICATION" } },
      { kind: "NEGATIVE", description: "A 10 ft high deck needs a full review", input: { heightAboveGradeIn: 120, widthFt: 10, depthFt: 10, solidFlooring: false, longestBeamFt: 10 }, expected: { buildingPermit: "REQUIRED", reviewPath: "FULL_REVIEW_LIKELY" } },
      { kind: "EXCEPTION", description: "Beam length not answered: the review path cannot be confirmed", input: { heightAboveGradeIn: 24, widthFt: 10, depthFt: 10, solidFlooring: false }, expected: { buildingPermit: "REQUIRED", reviewPath: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "deck-d5-eca-condition-2026",
    subject: "Deck building permit - SDCI's environmentally-critical-area condition (stated as an unresolved consideration, never decided)",
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: { ruleType: DeckRuleType.ECA_CONDITION },
    citation: {
      smcSections: [SDCI_DECKS],
      effectiveDateBasis: `${SDCI_DECKS}: a permit is needed for a deck 'in an environmentally critical area (ECA)', and a pre-application site visit is required before applying. Agency guidance; the product only ATTRIBUTES it to SDCI and never decides it.`,
    },
    caveats: [
      {
        category: "agency guidance, advisory mapping",
        description: "ECA status cannot be determined from Seattle's advisory ECA maps (SMC 25.09.030.A), so the criterion is always REQUIRES_VERIFICATION and a deck meeting every other criterion is never reported as exempt.",
        affectedConditionOrInterpretation: "Whether the deck's site is in or near an ECA",
        sourceReferences: [SDCI_DECKS, "SMC 25.09.030.A"],
        resolutionStatus: "Resolved by design - REQUIRES_VERIFICATION is the terminal state.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "A low deck meeting every other criterion still turns on ECA status", input: { heightAboveGradeIn: 12 }, expected: { buildingPermit: "REQUIRES_VERIFICATION", criterion: "ECA", status: "REQUIRES_VERIFICATION" } },
      { kind: "NEGATIVE", description: "The ECA row never reads MET", input: { heightAboveGradeIn: 6 }, expected: { criterion: "ECA", status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "deck-d6-exemption-not-zoning-compliance-2026",
    subject: "Deck building-permit exemption is not zoning compliance (report-layer disclaimer)",
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: { ruleType: DeckRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE },
    citation: {
      smcSections: ["2021 Seattle Residential Code (SRC) R105.2 (preamble)"],
      effectiveDateBasis: `${SRC_BASIS} 'Exemption from the permit requirements of this code does not authorize any work to be done in any manner in violation of this code or any other laws or ordinances of the City.'`,
    },
    caveats: [
      {
        category: "no evaluation",
        description: "Gates no evaluation; the disclaimer is a governed claim emitted only while this rule is ACTIVE.",
        affectedConditionOrInterpretation: "n/a",
        sourceReferences: ["SRC R105.2 preamble"],
        resolutionStatus: "Not applicable - no open question.",
      },
    ],
    testCases: [{ kind: "POSITIVE", description: "A result turning only on ECA status carries the disclaimer", input: { heightAboveGradeIn: 12 }, expected: { disclaimerPresent: true } }],
    isTestOnlyFixture: false,
  },
];

export function tierForRealDeckCandidate(_candidateId: string): "TIER_1" {
  return "TIER_1";
}

export const DECK_FIXED_ROW_IDS: Record<string, string> = {
  "deck-d1-setback-height-allowance-2026": "2b1940d5-bcbe-4410-b7d0-8bcbae0b7065",
  "deck-d2-lot-coverage-threshold-2026": "4749a58d-d5d7-42e5-a4ed-dde018cb849d",
  "deck-d3-permit-exemption-2026": "3998bc78-5668-46cd-8ed7-00b47c2db39e",
  "deck-d4-stfi-eligibility-2026": "16ff2024-e27b-4541-912b-dbd8edeaddac",
  "deck-d5-eca-condition-2026": "3b0ee27a-8e74-4cb3-a4a9-90092fd94f07",
  "deck-d6-exemption-not-zoning-compliance-2026": "b942899a-8daf-4c69-b34c-cba036c14dc7",
};
