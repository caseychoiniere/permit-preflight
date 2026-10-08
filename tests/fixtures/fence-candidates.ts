/**
 * The eight REAL Unit 7 (Fences) governance candidates (aidlc-docs/construction/unit-7-fences/
 * functional-design.md §4). Real, non-fixture content (`isTestOnlyFixture: false`), mirroring
 * `shed-permit-candidates.ts`. Every threshold the evaluator uses lives on `ruleSpecification`
 * here - `evaluate-fence.ts` contains no SMC number as a literal.
 *
 * All eight are Tier 1: each is a numeric threshold in current code text with no Director judgment,
 * interpretive latitude, or unresolved source conflict. The two qualitative elements ("predominately
 * open"; flood-prone status) are handled WITHOUT a rule claiming to resolve them (the evaluator
 * yields REQUIRES_VERIFICATION). These rows are advanced only to APPROVED by the unit's one-off
 * lifecycle script; activation is a separate founder decision.
 *
 * Each declared test case is executed against the real evaluator by
 * tests/regulatory-rule-governance/fence-candidates.test.ts using THESE specifications.
 */

import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { FenceRuleType } from "../../src/regulatory-rules-engine/fence-types.js";

const SMC_FENCES = "SMC 23.44.090.H.4";
const SMC_WALLS = "SMC 23.44.090.H.5";
const SMC_CHAPTER_BASIS =
  "Ordinance 127376 (2025), SMC 23.44.090 as published on Municode Library (CURRENT) and re-read live 2026-10-08; the pre-2025 citation SMC 23.44.014 no longer exists.";
const SRC_BASIS = "2021 Seattle Residential Code, Chapter 1 (Seattle amendments), SDCI 2021SRCChapter1.pdf, text extracted from the PDF 2026-10-08.";

const DECLARED_INPUT_CAVEAT = {
  category: "declared input, not a measurement",
  description:
    "Fence height, location, slope and wall facts are declared by the customer; the evaluator never measures the site. Every finding states it rests on the declared details, and an inconsistent or unanswered declaration resolves REQUIRES_VERIFICATION or is rejected at intake - never guessed.",
  affectedConditionOrInterpretation: "Whether the declared location is in fact a required setback",
  sourceReferences: [SMC_FENCES, "SMC 23.44.090 Table A"],
  resolutionStatus: "Resolved by design - the report labels every conclusion as based on the declared details.",
};

export const realFenceCandidates: DraftedRuleInput[] = [
  {
    id: "fence-f1-height-limit-standard-2026",
    subject: "Fence height - required side/rear setbacks (6 ft; +2 ft predominantly open feature; 8 ft absolute cap)",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.HEIGHT_STANDARD, maxFt: 6, openFeatureAllowanceFt: 2, absoluteMaxFt: 8 },
    citation: { smcSections: [`${SMC_FENCES}.a`, `${SMC_FENCES}.b`, `${SMC_FENCES}.c`], ordinanceNumber: "127376", effectiveDateBasis: SMC_CHAPTER_BASIS },
    caveats: [
      DECLARED_INPUT_CAVEAT,
      {
        category: "qualitative eligibility",
        description: "The +2 ft allowance applies only to architectural features (arbors, trellises) that are 'predominately open'. Permit Preflight never asserts that; a declared feature always yields REQUIRES_VERIFICATION.",
        affectedConditionOrInterpretation: "H.4.b predominately-open architectural feature",
        sourceReferences: [`${SMC_FENCES}.b`],
        resolutionStatus: "Resolved by design - REQUIRES_VERIFICATION is the terminal state for a declared feature; SDCI determines eligibility.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "6 ft fence in a side or rear setback", input: { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, expected: { subject: "Fence height (side or rear setback)", outcome: "KNOWN/PASS" } },
      { kind: "NEGATIVE", description: "6.5 ft fence in a side or rear setback", input: { heightFt: 6.5, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, expected: { subject: "Fence height (side or rear setback)", outcome: "KNOWN/FAIL" } },
      { kind: "EXCEPTION", description: "6 ft fence with a 2 ft top feature", input: { heightFt: 6, openFeatureHeightFt: 2, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, expected: { subject: "Fence height (side or rear setback)", outcome: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-f2-height-limit-front-street-side-2026",
    subject: "Fence height - front setback and street-side setback (4 ft; no feature allowance; 6 ft absolute cap)",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.HEIGHT_FRONT_STREET_SIDE, maxFt: 4, absoluteMaxFt: 6 },
    citation: { smcSections: [`${SMC_FENCES}.a`, `${SMC_FENCES}.b`, `${SMC_FENCES}.c`], ordinanceNumber: "127376", effectiveDateBasis: SMC_CHAPTER_BASIS },
    caveats: [
      DECLARED_INPUT_CAVEAT,
      {
        category: "definition of the 4-foot zone",
        description: "The text limits 'the required front setback extended to side lot lines' and 'street side setbacks extended to the front and rear lot lines'. The customer declares which region each part of the fence lies in; a fence crossing regions lists each, and each is evaluated.",
        affectedConditionOrInterpretation: "Where a fence on a side lot line stops being in the extended front setback",
        sourceReferences: [`${SMC_FENCES}.a`, "SMC 23.44.090 Table A and B"],
        resolutionStatus: "Resolved by design - declared per region; no location is inferred.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "4 ft fence in the front setback", input: { heightFt: 4, locations: ["FRONT_SETBACK"] }, expected: { subject: "Fence height (front setback)", outcome: "KNOWN/PASS" } },
      { kind: "NEGATIVE", description: "5 ft fence in the front setback", input: { heightFt: 5, locations: ["FRONT_SETBACK"] }, expected: { subject: "Fence height (front setback)", outcome: "KNOWN/FAIL" } },
      { kind: "EXCEPTION", description: "4 ft average on a slope with the tallest portion at 6 ft (H.4.c)", input: { heightFt: 4, siteSlopes: true, tallestPortionHeightFt: 6, locations: ["STREET_SIDE_SETBACK"] }, expected: { subject: "Fence height (street-side setback)", outcome: "KNOWN/PASS" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-f3-retaining-wall-2026",
    subject: "Fence on or near a retaining wall or bulkhead in a required setback (4 ft on a wall; 9.5 ft combined; 6 ft raising-grade wall; 3 ft from a cut wall)",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.RETAINING_WALL, fenceOnWallMaxFt: 4, combinedMaxFt: 9.5, raisingGradeWallMaxFt: 6, cutWallFenceSetbackFt: 3 },
    citation: { smcSections: [`${SMC_FENCES}.a`, `${SMC_WALLS}.a`, `${SMC_WALLS}.b`], ordinanceNumber: "127376", effectiveDateBasis: SMC_CHAPTER_BASIS },
    caveats: [
      DECLARED_INPUT_CAVEAT,
      {
        category: "wall status not determinable",
        description: "Whether an existing wall 'raises grade' or 'protects a cut', and whether a cut wall is no taller than needed to support the cut (a geotechnical matter), cannot be determined by Permit Preflight; those resolve REQUIRES_VERIFICATION or are disclosed as not evaluated. SDCI's own guidance notes that when a wall lowers grade the normal fence limits apply, consistent with the 3 ft setback requirement.",
        affectedConditionOrInterpretation: "H.5 wall classification and necessity",
        sourceReferences: [`${SMC_WALLS}.a`, `${SMC_WALLS}.b`, "SDCI Fences page (2026-10-08)"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "5 ft new raising-grade wall under a 4 ft fence (9 ft combined)", input: { heightFt: 4, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "ON_NEW_WALL_RAISING_GRADE", wallHeightFt: 5 }, expected: { subject: "Fence and retaining wall or bulkhead", outcome: "KNOWN/PASS" } },
      { kind: "NEGATIVE", description: "6 ft raising-grade wall under a 4 ft fence (10 ft combined)", input: { heightFt: 4, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "ON_NEW_WALL_RAISING_GRADE", wallHeightFt: 6 }, expected: { subject: "Fence and retaining wall or bulkhead", outcome: "KNOWN/FAIL" } },
      { kind: "EXCEPTION", description: "Fence set back exactly 3 ft from a cut wall", input: { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "SET_BACK_FROM_CUT_WALL", wallHeightFt: 5, cutWallSetbackFt: 3 }, expected: { subject: "Fence and retaining wall or bulkhead", outcome: "KNOWN/PASS" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-f4-outside-required-setbacks-2026",
    subject: "Fence outside every required setback - SMC 23.44.090.H.4 does not apply; general structure height limit 32 ft",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.OUTSIDE_REQUIRED_SETBACKS, generalStructureHeightLimitFt: 32 },
    citation: { smcSections: [SMC_FENCES, "SMC 23.44.070.A.1", "SMC 23.44.070.A.2"], ordinanceNumber: "127376", effectiveDateBasis: SMC_CHAPTER_BASIS },
    caveats: [
      DECLARED_INPUT_CAVEAT,
      {
        category: "scoped negative finding",
        description: "H.4 allows fences in required setbacks up to stated heights and is silent outside them; 23.44.070.A.1 sets 32 ft for structures generally (42 ft for A.2 developments - the lowest, 32 ft, is used and intake caps a fence at 20 ft). The finding is worded 'no fence-specific limit identified among the provisions evaluated', never as general compliance.",
        affectedConditionOrInterpretation: "Absence of any other limit on a fence outside setbacks",
        sourceReferences: [SMC_FENCES, "SMC 23.44.070.A"],
        resolutionStatus: "Resolved by design - scope-limited wording; other standards disclosed as not evaluated.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "7 ft fence outside required setbacks", input: { heightFt: 7, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, expected: { subject: "Fence height (outside required setbacks)", outcome: "KNOWN/PASS" } },
      { kind: "NEGATIVE", description: "33 ft structure outside required setbacks (beyond intake's own 20 ft bound; exercises the rule logic directly)", input: { heightFt: 33, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, expected: { subject: "Fence height (outside required setbacks)", outcome: "KNOWN/FAIL" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-f5-permit-height-exemption-2026",
    subject: "Fence building-permit exemption - not over 8 feet high",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.PERMIT_HEIGHT_EXEMPTION, maxFt: 8 },
    citation: {
      smcSections: ["2021 Seattle Residential Code (SRC) R105.1", "2021 SRC R105.2, Item 4"],
      effectiveDateBasis: `${SRC_BASIS} R105.1 requires a permit except as specifically provided; item 4 specifically exempts 'Fences not over 8 feet high that do not have masonry or concrete elements above 6 feet'. SDCI Fences page (2026-10-08) concurs ('If you're building a taller fence, you need a construction permit').`,
    },
    caveats: [
      {
        category: "exemption is not zoning compliance",
        description: "R105.2's preamble states exemption does not authorize work in violation of the code or any other law; the report carries that disclaimer whenever the result turns only on flood-prone status.",
        affectedConditionOrInterpretation: "Reading an exemption as approval",
        sourceReferences: ["SRC R105.2 preamble"],
        resolutionStatus: "Resolved - disclaimer shown.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "8 ft fence (inclusive limit)", input: { heightFt: 8, locations: ["OUTSIDE_REQUIRED_SETBACKS"], hasMasonryOrConcreteAbove6Ft: false }, expected: { criterion: "HEIGHT", status: "MET" } },
      { kind: "NEGATIVE", description: "9 ft fence", input: { heightFt: 9, locations: ["OUTSIDE_REQUIRED_SETBACKS"], hasMasonryOrConcreteAbove6Ft: false }, expected: { buildingPermit: "REQUIRED", criterion: "HEIGHT", status: "NOT_MET" } },
      { kind: "EXCEPTION", description: "Sloping site, tallest portion not provided", input: { heightFt: 6, siteSlopes: true, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, expected: { criterion: "HEIGHT", status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-f6-permit-masonry-concrete-2026",
    subject: "Fence building-permit exemption - no masonry or concrete elements above 6 feet",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.PERMIT_MASONRY_CONCRETE, elementsAboveFt: 6 },
    citation: { smcSections: ["2021 Seattle Residential Code (SRC) R105.2, Item 4"], effectiveDateBasis: SRC_BASIS },
    caveats: [
      {
        category: "evidence gap, not a tier issue",
        description: "Whether any masonry or concrete element is above 6 ft is declared by the customer; when the fence can exceed 6 ft and the question is unanswered, the criterion is REQUIRES_VERIFICATION. A fence not over 6 ft cannot have such an element.",
        affectedConditionOrInterpretation: "Unanswered masonry/concrete question on a fence over 6 ft",
        sourceReferences: ["SRC R105.2 Item 4"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "6 ft fence (nothing can be above 6 ft)", input: { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, expected: { criterion: "MASONRY_CONCRETE", status: "MET" } },
      { kind: "NEGATIVE", description: "7 ft fence with masonry above 6 ft", input: { heightFt: 7, locations: ["OUTSIDE_REQUIRED_SETBACKS"], hasMasonryOrConcreteAbove6Ft: true }, expected: { buildingPermit: "REQUIRED", criterion: "MASONRY_CONCRETE", status: "NOT_MET" } },
      { kind: "EXCEPTION", description: "7 ft fence, masonry question unanswered", input: { heightFt: 7, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, expected: { criterion: "MASONRY_CONCRETE", status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-f7-exemption-not-zoning-compliance-2026",
    subject: "Fence building-permit exemption is not zoning compliance (report-layer disclaimer)",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE },
    citation: {
      smcSections: ["2021 Seattle Residential Code (SRC) R105.2 (preamble)"],
      effectiveDateBasis: `${SRC_BASIS} 'Exemption from the permit requirements of this code does not authorize any work to be done in any manner in violation of this code or any other laws or ordinances of the City.'`,
    },
    caveats: [
      {
        category: "no evaluation",
        description: "Gate-inert, like shed P9: it governs report wording only and gates no evaluation.",
        affectedConditionOrInterpretation: "n/a",
        sourceReferences: ["SRC R105.2 preamble"],
        resolutionStatus: "Not applicable - no open question.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "Result turning only on flood-prone status carries the disclaimer", input: { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, expected: { disclaimerPresent: true } },
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-f8-permit-flood-prone-condition-2026",
    subject: "Fence building permit - SDCI's flood-prone-area permit condition (stated as an unresolved consideration, never decided)",
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType: FenceRuleType.PERMIT_FLOOD_PRONE_CONDITION },
    citation: {
      smcSections: ["SDCI Fences page (seattle.gov/construction-and-inspections/permits/common-projects/fences)"],
      effectiveDateBasis:
        "Read live 2026-10-08: 'You will need a construction permit if the fence will be located in a flood-prone area.' This is an agency guidance statement; the underlying code section is not identified on the page, so the product only ever ATTRIBUTES the condition to SDCI and never decides it.",
    },
    caveats: [
      {
        category: "agency guidance, underlying section not identified",
        description:
          "The condition appears in SDCI's current Fences guidance but not in R105.2's fence item. Permit Preflight therefore states it as 'where SDCI requires a construction permit' and treats flood-prone status as undeterminable from available (advisory) mapping: the criterion is always REQUIRES_VERIFICATION, so a fence meeting every other criterion is never reported as exempt. A mapped flood layer indicating a possible intersection is shown as context only and never decides a criterion.",
        affectedConditionOrInterpretation: "Whether the fence's site is in a flood-prone area",
        sourceReferences: ["SDCI Fences page 2026-10-08", "SMC 25.09.030 (ECA maps are advisory)"],
        resolutionStatus: "Resolved by design - REQUIRES_VERIFICATION is the terminal state; no deterministic conclusion rests on this rule.",
      },
    ],
    testCases: [
      { kind: "POSITIVE", description: "6 ft side/rear fence meeting every other criterion: the flood-prone consideration is REQUIRES_VERIFICATION, never MET", input: { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, expected: { buildingPermit: "REQUIRES_VERIFICATION", criterion: "FLOOD_PRONE", status: "REQUIRES_VERIFICATION" } },
      { kind: "NEGATIVE", description: "A mapped flood-prone layer reporting no intersection still does not clear the criterion (advisory map)", input: { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], floodMapped: "CLEAR" }, expected: { buildingPermit: "REQUIRES_VERIFICATION", criterion: "FLOOD_PRONE", status: "REQUIRES_VERIFICATION" } },
      { kind: "EXCEPTION", description: "A mapped flood-prone intersection is context only: it does not make the permit REQUIRED", input: { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], floodMapped: "INTERSECTS" }, expected: { buildingPermit: "REQUIRES_VERIFICATION", criterion: "FLOOD_PRONE", status: "REQUIRES_VERIFICATION" } },
    ],
    isTestOnlyFixture: false,
  },
];

export function tierForRealFenceCandidate(_candidateId: string): "TIER_1" {
  return "TIER_1";
}

/** Fixed row UUIDs (generated once, committed, never regenerated) - mirrors scripts/bootstrap-unit-6b-governance.ts. */
export const FENCE_FIXED_ROW_IDS: Record<string, string> = {
  "fence-f1-height-limit-standard-2026": "fbdd7352-c9b6-4108-be33-1bb8c8a5f94c",
  "fence-f2-height-limit-front-street-side-2026": "75032bb9-5785-4402-9acd-49cf110a2d2d",
  "fence-f3-retaining-wall-2026": "4137e8c0-9078-4e0d-8b56-a28e6746d42f",
  "fence-f4-outside-required-setbacks-2026": "81b6ed8c-be0d-4fb0-abfa-eff529767d5a",
  "fence-f5-permit-height-exemption-2026": "6e459b37-3aaa-4935-ac8d-c4c2deff73a3",
  "fence-f6-permit-masonry-concrete-2026": "f209ec0c-6b80-4211-823b-acd02cf7f6e2",
  "fence-f7-exemption-not-zoning-compliance-2026": "bd9612cd-1048-4722-b8be-c3a4d7db5da9",
  "fence-f8-permit-flood-prone-condition-2026": "2816dbf2-8cbb-4d32-bd6b-e38849fbff09",
};
