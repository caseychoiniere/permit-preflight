/**
 * REAL governance candidates for the Neighborhood Commercial (NC1-NC3) and Commercial (C1) zones, for shed, detached garage, fence and deck (citywide zoning
 * coverage, 2026-10-09). Content is current Seattle code as read live from Municode on 2026-10-09 (Ord. 127375/127376), SMC Chapter 23.47A:
 *  - 23.47A.014 (setbacks: none at ground level except where a lot abuts or is across an alley from a residential zone; G.1 decks; G.5 fences, bulkheads and walls),
 *  - 23.47A.012 (structure height: the height mapped for the zone, 30 ft at the lowest), 23.47A.013 (floor area ratio; no lot-coverage limit),
 *  - 23.47A.032 (parking location and access), 23.47A.004 (residential use is permitted outright in NC1-NC3 and C1; it is a conditional use in C2, which is therefore
 *    not covered here).
 * Scope "NC,C1": C2 is deliberately excluded. Each row is Tier 1; every interpretive edge is REQUIRES_VERIFICATION. Advanced only to APPROVED by the lifecycle
 * script; activation is a separate founder decision.
 */
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { DeckRuleType } from "../../src/regulatory-rules-engine/deck-types.js";
import { FenceRuleType } from "../../src/regulatory-rules-engine/fence-types.js";
import { mfRowId } from "./multifamily-candidates.js";

const BASIS = "Ordinance 127375/127376 (2025): SMC Chapter 23.47A as published on Municode Library (CURRENT) and read live 2026-10-09.";
const ZONE = "NC,C1";
const ZONING_CAVEAT = {
  category: "zone designation is general mapping",
  description: "The zone comes from Seattle's published zoning layer, which is general mapping and not a legal determination. Whether a residential zone abuts the lot comes from the same layer read within 20 ft of the lot; a failed read is UNKNOWN, never 'no neighbor'.",
  affectedConditionOrInterpretation: "Which commercial-zone standards apply and whether a residential zone abuts the lot",
  sourceReferences: ["Seattle GIS Current Land Use Zoning Detail", "SMC 23.47A.014.B"],
  resolutionStatus: "Resolved by design - the report names the designation it applied and treats an unread neighbor as unknown.",
};
const DECLARED_INPUT_CAVEAT = {
  category: "declared input, not a measurement",
  description: "Height, location and wall facts are declared by the customer; the evaluator never measures the site and every finding says it rests on the declared details.",
  affectedConditionOrInterpretation: "Whether the declared location is in fact a required setback",
  sourceReferences: ["SMC 23.47A.014"],
  resolutionStatus: "Resolved by design.",
};

type Kind = "POSITIVE" | "NEGATIVE" | "EXCEPTION" | "BOUNDARY";
const tc = (kind: Kind, description: string, project: Record<string, unknown>, finding: string, outcome: string, zoning?: string) => ({
  kind,
  description,
  input: { project, ...(zoning ? { zoning } : {}) },
  expected: { finding, outcome },
});

function accessoryRows(projectType: "shed" | "garage"): DraftedRuleInput[] {
  const who = projectType === "shed" ? "Shed" : "Detached garage";
  const rows: DraftedRuleInput[] = [
    {
      id: `${projectType}-comm-setbacks-2026`,
      subject: `${who} setbacks in Neighborhood Commercial and Commercial zones - none at ground level unless a residential zone abuts the lot (SMC 23.47A.014)`,
      applicableProjectType: projectType,
      applicableZone: ZONE,
      ruleSpecification: { ruleType: "COMM_ACC_SETBACKS", upperLevelAboveFt: 13, openingMinFromResidentialLotFt: 5, cornerTriangleFt: 15, citation: "SMC 23.47A.014" },
      citation: { smcSections: ["SMC 23.47A.014.B", "SMC 23.47A.014.I"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [
        ZONING_CAVEAT,
        {
          category: "setbacks depend on a residential zone abutting the lot",
          description:
            "SMC 23.47A.014 requires (B.1) a triangular setback where a lot abuts the corner of a residentially zoned lot, (B.2-B.3) upper-level setbacks for portions above 13 ft along lot lines that abut, or are across an alley from, a residential zone, and (B.5) no entrance, window or other opening within 5 ft of an abutting residentially zoned lot. With no residential zone abutting or across an alley, there is no zoning setback for a small structure, which is a PASS; with one, or when it could not be read, the result is REQUIRES_VERIFICATION. Chapter 23.53 street and alley widening setbacks (B.I) are never evaluated.",
          affectedConditionOrInterpretation: "SMC 23.47A.014.B, I",
          sourceReferences: ["SMC 23.47A.014"],
          resolutionStatus: "Resolved by design.",
        },
      ],
      testCases: [
        tc("POSITIVE", "No residential zone abuts the lot", { abutsResidentialZone: "NO" }, `${who} setbacks in a commercial zone`, "KNOWN/PASS"),
        tc("EXCEPTION", "A residential zone abuts the lot", { abutsResidentialZone: "YES", adjacentResidentialZones: ["NR"] }, `${who} setbacks in a commercial zone`, "REQUIRES_VERIFICATION"),
        tc("EXCEPTION", "Whether a residential zone abuts the lot could not be read", { abutsResidentialZone: "UNKNOWN" }, `${who} setbacks in a commercial zone`, "REQUIRES_VERIFICATION"),
        tc("EXCEPTION", "The neighbor fact was never supplied", { abutsResidentialZone: undefined }, `${who} setbacks in a commercial zone`, "REQUIRES_VERIFICATION"),
      ],
      isTestOnlyFixture: false,
    },
    {
      id: `${projectType}-comm-height-2026`,
      subject: "Accessory structure height limit in Neighborhood Commercial and Commercial zones - the mapped height limit (30 ft at the lowest)",
      applicableProjectType: projectType,
      applicableZone: ZONE,
      ruleSpecification: { ruleType: "COMM_ACC_HEIGHT", safeMaxFt: 30, citation: "SMC 23.47A.012" },
      citation: { smcSections: ["SMC 23.47A.012.A", "SMC 23.47A.012.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [
        ZONING_CAVEAT,
        {
          category: "mapped height limit",
          description: "The structure height limit is the height mapped for the zone, which is the number in its designation (NC2-55 is 55 ft). The lowest mapped limit in these zones is 30 ft, so a height at or under 30 ft is within the limit wherever the lot is; a taller structure is REQUIRES_VERIFICATION against the mapped limit.",
          affectedConditionOrInterpretation: "SMC 23.47A.012.A",
          sourceReferences: ["SMC 23.47A.012"],
          resolutionStatus: "Resolved by design.",
        },
      ],
      testCases: [
        tc("POSITIVE", "20 ft", { heightFt: 20 }, "Accessory structure height limit", "KNOWN/PASS"),
        tc("EXCEPTION", "35 ft against a possible 30 ft mapped limit", { heightFt: 35 }, "Accessory structure height limit", "REQUIRES_VERIFICATION"),
      ],
      isTestOnlyFixture: false,
    },
    {
      id: `${projectType}-comm-far-note-2026`,
      subject: `${who} floor area ratio in Neighborhood Commercial and Commercial zones - 2.5 to 8.25 by mapped height; no lot-coverage limit`,
      applicableProjectType: projectType,
      applicableZone: ZONE,
      ruleSpecification: { ruleType: "COMM_FAR_NOTE", minFar: 2.5, maxFar: 8.25, citation: "SMC 23.47A.013" },
      citation: { smcSections: ["SMC 23.47A.013.A", "SMC 23.47A.013.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [
        ZONING_CAVEAT,
        {
          category: "existing floor area unknown",
          description: "The FAR limit applies to the total chargeable floor area of all structures on the lot, by the zone's mapped height (Tables A and B); the finding is always REQUIRES_VERIFICATION and states the range.",
          affectedConditionOrInterpretation: "SMC 23.47A.013.A-B",
          sourceReferences: ["SMC 23.47A.013"],
          resolutionStatus: "Resolved by design.",
        },
      ],
      testCases: [tc("EXCEPTION", "Floor area of existing buildings is not known", { parcelAreaSqFt: 4000 }, "Floor area ratio", "REQUIRES_VERIFICATION")],
      isTestOnlyFixture: false,
    },
  ];
  if (projectType === "garage") {
    rows.push({
      id: "garage-comm-parking-access-2026",
      subject: "Detached garage access, driveway and parking location in Neighborhood Commercial and Commercial zones (SMC 23.47A.032)",
      applicableProjectType: "garage",
      applicableZone: ZONE,
      ruleSpecification: { ruleType: "COMM_GARAGE_PARKING_ACCESS", citation: "SMC 23.47A.032" },
      citation: { smcSections: ["SMC 23.47A.032.A", "SMC 23.47A.032.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [
        ZONING_CAVEAT,
        {
          category: "not determinable from the available data",
          description: "Parking may not be between a structure and a street lot line in NC zones; access must come from an improved alley when the lot abuts one. The alley's condition and where the garage stands relative to the house and street are not known, so the finding is always REQUIRES_VERIFICATION and states the standards.",
          affectedConditionOrInterpretation: "SMC 23.47A.032",
          sourceReferences: ["SMC 23.47A.032"],
          resolutionStatus: "Resolved by design.",
        },
      ],
      testCases: [tc("EXCEPTION", "Alley and placement facts are not known", { alleyAdjacent: true }, "Garage access", "REQUIRES_VERIFICATION")],
      isTestOnlyFixture: false,
    });
  }
  return rows;
}

export const shedCommercialCandidates: DraftedRuleInput[] = accessoryRows("shed");
export const garageCommercialCandidates: DraftedRuleInput[] = accessoryRows("garage");

const SMC_FENCES = "SMC 23.47A.014.G.5";
export const fenceCommercialCandidates: DraftedRuleInput[] = [
  {
    id: "fence-comm-f1-height-standard-2026",
    subject: "Fence height in Neighborhood Commercial and Commercial zones - required setbacks (6 ft; 8 ft absolute cap on a slope)",
    applicableProjectType: "fence",
    applicableZone: ZONE,
    ruleSpecification: { ruleType: FenceRuleType.HEIGHT_STANDARD, maxFt: 6, openFeatureAllowanceFt: 0, absoluteMaxFt: 8 },
    citation: { smcSections: [`${SMC_FENCES}.a`], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT, { category: "no arbor allowance", description: "Unlike the residential zones, the commercial-zone text gives no extra height for an open arbor or trellis, so a declared top feature counts toward the height.", affectedConditionOrInterpretation: "SMC 23.47A.014.G.5.a", sourceReferences: [`${SMC_FENCES}.a`], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "6 ft fence in a side or rear setback", { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, "Fence height (side or rear setback)", "KNOWN/PASS"),
      tc("NEGATIVE", "6.5 ft fence in a side or rear setback", { heightFt: 6.5, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, "Fence height (side or rear setback)", "KNOWN/FAIL"),
      tc("NEGATIVE", "6 ft fence with a 1 ft top feature counts as 7 ft", { heightFt: 6, openFeatureHeightFt: 1, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, "Fence height (side or rear setback)", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-comm-f2-height-front-street-side-2026",
    subject: "Fence height in Neighborhood Commercial and Commercial zones - front and street-side setbacks (6 ft; no separate front-yard limit)",
    applicableProjectType: "fence",
    applicableZone: ZONE,
    ruleSpecification: { ruleType: FenceRuleType.HEIGHT_FRONT_STREET_SIDE, maxFt: 6, absoluteMaxFt: 8 },
    citation: { smcSections: [`${SMC_FENCES}.a`], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "6 ft fence in the front setback", { heightFt: 6, locations: ["FRONT_SETBACK"] }, "Fence height (front setback)", "KNOWN/PASS"),
      tc("NEGATIVE", "7 ft fence in the front setback", { heightFt: 7, locations: ["FRONT_SETBACK"] }, "Fence height (front setback)", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-comm-f3-retaining-wall-2026",
    subject: "Fence on or near a retaining wall or bulkhead in a required setback, Neighborhood Commercial and Commercial zones (9.5 ft combined on a raising-grade wall; 6 ft wall; 3 ft from a cut wall)",
    applicableProjectType: "fence",
    applicableZone: ZONE,
    ruleSpecification: { ruleType: FenceRuleType.RETAINING_WALL, combinedMaxFt: 9.5, raisingGradeWallMaxFt: 6, cutWallFenceSetbackFt: 3 },
    citation: { smcSections: [`${SMC_FENCES}.b`, `${SMC_FENCES}.c`], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT, { category: "wall status not determinable", description: "Whether an existing wall raises grade or protects a cut, and whether a cut wall is no taller than needed, cannot be determined by Permit Preflight; those resolve REQUIRES_VERIFICATION.", affectedConditionOrInterpretation: "SMC 23.47A.014.G.5.b-c", sourceReferences: [`${SMC_FENCES}.b`, `${SMC_FENCES}.c`], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "5 ft new raising-grade wall under a 4 ft fence (9 ft combined)", { heightFt: 4, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "ON_NEW_WALL_RAISING_GRADE", wallHeightFt: 5 }, "Fence and retaining wall or bulkhead", "KNOWN/PASS"),
      tc("NEGATIVE", "6 ft raising-grade wall under a 4 ft fence (10 ft combined)", { heightFt: 4, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "ON_NEW_WALL_RAISING_GRADE", wallHeightFt: 6 }, "Fence and retaining wall or bulkhead", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-comm-f4-outside-required-setbacks-2026",
    subject: "Fence outside every required setback in Neighborhood Commercial and Commercial zones - SMC 23.47A.014.G.5 does not apply; lowest mapped structure height limit 30 ft",
    applicableProjectType: "fence",
    applicableZone: ZONE,
    ruleSpecification: { ruleType: FenceRuleType.OUTSIDE_REQUIRED_SETBACKS, generalStructureHeightLimitFt: 30 },
    citation: { smcSections: [SMC_FENCES, "SMC 23.47A.012.A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT, { category: "scoped negative finding", description: "G.5 allows fences in required setbacks up to stated heights and is silent outside them; the structure height limit is the mapped height (30 ft at the lowest, and intake caps a fence at 20 ft). The finding is worded 'no fence-specific limit identified among the provisions evaluated', never as general compliance; screening requirements along residential lot lines (SMC 23.47A.016) are not evaluated.", affectedConditionOrInterpretation: "Absence of any other limit on a fence outside setbacks", sourceReferences: [SMC_FENCES, "SMC 23.47A.012.A"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "7 ft fence outside required setbacks", { heightFt: 7, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, "Fence height (outside required setbacks)", "KNOWN/PASS"),
      tc("NEGATIVE", "31 ft structure outside required setbacks (exercises the rule logic directly)", { heightFt: 31, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, "Fence height (outside required setbacks)", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
];

export const deckCommercialCandidates: DraftedRuleInput[] = [
  {
    id: "deck-comm-d1-setback-height-allowance-2026",
    subject: "Deck in a required setback in Neighborhood Commercial and Commercial zones - allowed up to 18 in above grade within 5 ft of a residential lot",
    applicableProjectType: "deck",
    applicableZone: ZONE,
    ruleSpecification: {
      ruleType: DeckRuleType.SETBACK_HEIGHT_ALLOWANCE,
      allowedInSetbackMaxIn: 18,
      allowanceCitation: "SMC 23.47A.014.G.1.b",
      limitCitation: "SMC 23.47A.014.G.1",
      furtherAllowancesText:
        "Decks with open railings may extend into a required setback in these zones, but not within 5 ft of a lot in a residential zone, except decks accessory to residential uses that are no more than 18 inches above grade (SMC 23.47A.014.G.1.a-b). Required setbacks exist at all only where a residential zone abuts the lot or is across an alley from it.",
    },
    citation: { smcSections: ["SMC 23.47A.014.G.1.a", "SMC 23.47A.014.G.1.b"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "12 in deck in the side setback", { heightAboveGradeIn: 12, setbackLocations: ["SIDE_SETBACK"] }, "Deck setback (side setback)", "KNOWN/PASS"),
      tc("EXCEPTION", "24 in deck in the side setback: the 5 ft rule from a residential lot may apply", { heightAboveGradeIn: 24, setbackLocations: ["SIDE_SETBACK"] }, "Deck setback (side setback)", "REQUIRES_VERIFICATION"),
      tc("POSITIVE", "36 in deck outside every required setback", { heightAboveGradeIn: 36, setbackLocations: ["OUTSIDE_REQUIRED_SETBACKS"] }, "Deck setback (outside required setbacks)", "KNOWN/PASS"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "deck-comm-no-lot-coverage-limit-2026",
    subject: "Deck and lot coverage in Neighborhood Commercial and Commercial zones - there is no lot-coverage limit",
    applicableProjectType: "deck",
    applicableZone: ZONE,
    ruleSpecification: {
      ruleType: DeckRuleType.NO_LOT_COVERAGE_LIMIT,
      statement: "Neighborhood Commercial and Commercial zones have no lot-coverage percentage limit (SMC Chapter 23.47A); development is limited by height and floor area ratio instead (SMC 23.47A.012 and 23.47A.013), which Permit Preflight does not evaluate for a deck.",
    },
    citation: { smcSections: ["SMC 23.47A.012", "SMC 23.47A.013"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT, { category: "scoped statement", description: "The statement is limited to the absence of a lot-coverage limit; whether a deck is chargeable floor area for the floor area ratio is not evaluated.", affectedConditionOrInterpretation: "SMC Chapter 23.47A", sourceReferences: ["SMC 23.47A.013"], resolutionStatus: "Resolved by design - scope-limited wording." }],
    testCases: [tc("POSITIVE", "Any deck: no lot-coverage limit applies", { heightAboveGradeIn: 40, setbackLocations: ["SIDE_SETBACK"] }, "Deck and lot coverage", "KNOWN")],
    isTestOnlyFixture: false,
  },
];

export const allCommercialCandidates: DraftedRuleInput[] = [...shedCommercialCandidates, ...garageCommercialCandidates, ...fenceCommercialCandidates, ...deckCommercialCandidates];
export const COMMERCIAL_FIXED_ROW_IDS: Record<string, string> = Object.fromEntries(allCommercialCandidates.map((c) => [c.id, mfRowId(c.id)]));
