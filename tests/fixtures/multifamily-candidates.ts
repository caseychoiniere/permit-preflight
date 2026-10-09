/**
 * REAL governance candidates for the multifamily zones - Lowrise (LR1-LR3) - for the five supported project types (citywide zoning coverage,
 * 2026-10-09). Content is current Seattle code as read live from Municode on 2026-10-09 (Ord. 127376, 2025), SMC Chapter 23.45:
 *  - 23.45.518.H.1 (accessory structures in required rear and side setbacks: not between the house and a side lot line, 5 ft from the side lot line beyond
 *    25 ft of the rear lot line, 7 ft from a street lot line, 3 ft from principal structures), Table A for 23.45.518 (required setbacks),
 *  - 23.45.514.C (12 ft for an accessory structure in a required setback or separation; a garage ridge may add 3 ft) and Table A (32/40/50 ft),
 *  - 23.45.519 (5 ft between structures containing floor area), 23.45.510 (floor area ratio - there is NO lot-coverage limit), 23.45.536 (garage access),
 *  - 23.45.518.H.7-H.8 (fences, retaining walls and bulkheads in required setbacks), 23.45.518.G (deck and other projections),
 *  - 23.46.002.B (the RC designation: a development without a commercial use follows the underlying residential zone).
 * Zone scopes use src/zoning/scope.ts: "MULTIFAMILY" where the text is not zone-specific, "LR" where a figure differs by family, and "LRn:MHA" / "LRn:NO_MHA"
 * for the floor-area-ratio table. A spec never carries a per-zone table. Each row is Tier 1: a numeric or enumerated rule in the code text with no Director
 * judgment; every interpretive edge is handled by the evaluator as REQUIRES_VERIFICATION. Advanced only to APPROVED by the lifecycle script; activation is a
 * separate founder decision.
 */
import { createHash } from "node:crypto";
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { DeckRuleType } from "../../src/regulatory-rules-engine/deck-types.js";
import { FenceRuleType } from "../../src/regulatory-rules-engine/fence-types.js";

const BASIS =
  "Ordinance 127376 (2025): SMC Chapter 23.45 as published on Municode Library (CURRENT) and read live 2026-10-09; 23.46.002.B for the RC designation.";
const MAPPED = {
  category: "mapped distance, not a survey",
  description:
    "Distances are measured by PostGIS from the footprint the customer placed on King County's parcel polygon (general-location mapping) and Seattle Building Outlines (2023). A distance within the 2 ft screening tolerance of a threshold is REQUIRES_VERIFICATION; the tolerance is a product margin, not a statement about the sources' accuracy.",
  affectedConditionOrInterpretation: "Reliability of a measured distance near a threshold",
  sourceReferences: ["King County parcel polygon quality caveat", "BR-U2-10"],
  resolutionStatus: "Resolved by design.",
};
const DECLARED_INPUT_CAVEAT = {
  category: "declared input, not a measurement",
  description: "Height, location and wall facts are declared by the customer; the evaluator never measures the site and every finding says it rests on the declared details.",
  affectedConditionOrInterpretation: "Whether the declared location is in fact a required setback",
  sourceReferences: ["SMC 23.45.518 Table A"],
  resolutionStatus: "Resolved by design - the report labels every conclusion as based on the declared details.",
};
const ZONING_CAVEAT = {
  category: "zone designation is general mapping",
  description: "The zone comes from Seattle's published zoning layer, which is general mapping and not a legal determination; the MHA suffix and any older incentive suffix decide which floor-area and height figures apply, and an unrecognized suffix leaves those claims unscreened.",
  affectedConditionOrInterpretation: "Which Lowrise standards apply to the property",
  sourceReferences: ["Seattle GIS Current Land Use Zoning Detail", "SMC 23.45.502"],
  resolutionStatus: "Resolved by design - the report names the designation it applied and the claims it could not settle.",
};

type Kind = "POSITIVE" | "NEGATIVE" | "EXCEPTION" | "BOUNDARY";
export interface MfCase {
  kind: Kind;
  description: string;
  input: { project: Record<string, unknown>; zoning?: string };
  expected: { finding: string; outcome: string };
}
const tc = (kind: Kind, description: string, project: Record<string, unknown>, finding: string, outcome: string, zoning?: string): MfCase => ({
  kind,
  description,
  input: { project, ...(zoning ? { zoning } : {}) },
  expected: { finding, outcome },
});

/** Deterministic row UUID from the candidate id (UUID version 5 over a fixed namespace) so the rows can be re-seeded to the same ids. */
const NAMESPACE = "6f1b8a2c-33f0-4a6e-9a43-2b5d0c6a7e11";
export function mfRowId(candidateId: string): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(candidateId).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Shed and detached garage: shared accessory-structure standards (SMC 23.45.518.H.1, 23.45.514.C, 23.45.519, 23.45.510)
// ---------------------------------------------------------------------------------------------------------------------

const SETBACKS_SPEC = {
  ruleType: "MF_ACC_SETBACKS",
  front: { minFt: 5, averageFt: 7 },
  streetLotLineMinFt: 7,
  sideMinFt: 5,
  sideBeyondRearDepthFt: 25,
  projectionMinFromLotLineFt: 3,
  placementCitation: "SMC 23.45.518.H.1",
  mappingToleranceFt: 2,
};
const SETBACK_CAVEATS = [
  MAPPED,
  ZONING_CAVEAT,
  {
    category: "accessory structures in required setbacks",
    description:
      "SMC 23.45.518.H.1 allows an accessory structure that is not an ADU in a required REAR or SIDE setback if: (a) one between a principal structure and a side lot line provides the setback required of the principal structure, (b) any portion more than 25 ft from the rear lot line is at least 5 ft from the side lot line, (c) it is at least 7 ft from any lot line that abuts a street, and (d) it is at least 3 ft from principal structures including eaves. Nothing allows one in the required FRONT setback (7 ft average, 5 ft minimum). The evaluator states a definite failure only where the footprint is clearly in the front setback, or clearly beyond 25 ft of the rear lot line and clearly inside 5 ft of a side lot line, or clearly between the house and the side lot line; everything it cannot place is REQUIRES_VERIFICATION. Roof edges may project into a setback no closer than 3 ft to a lot line (SMC 23.45.518.G.1), so a structure within 3 ft of the rear lot line is REQUIRES_VERIFICATION.",
    affectedConditionOrInterpretation: "SMC 23.45.518.H.1.a-d; 23.45.518.G.1; Table A for 23.45.518",
    sourceReferences: ["SMC 23.45.518.H.1", "SMC 23.45.518.G.1", "SMC 23.45.518 Table A"],
    resolutionStatus: "Resolved by design - every case the mapping cannot settle is REQUIRES_VERIFICATION.",
  },
  {
    category: "front setback reductions and special frontages",
    description: "A lot abutting the Queen Anne Boulevard landmark right-of-way has a larger front setback (SMC 23.45.518 Table A footnote 1), and front and rear setbacks may be reduced on lots with certain environmentally critical areas (SMC 23.45.518.F); neither is evaluated, and Chapter 23.53 can add setbacks for street and alley widening.",
    affectedConditionOrInterpretation: "Table A footnote 1; 23.45.518.E-F",
    sourceReferences: ["SMC 23.45.518 Table A", "SMC 23.45.518.E", "SMC 23.45.518.F"],
    resolutionStatus: "Disclosed - the report never says the setbacks are confirmed, and the 12 ft height claim treats the Chapter 23.53 guard as unresolved.",
  },
];

const HEIGHT_SPEC_LR = {
  ruleType: "MF_ACC_HEIGHT",
  inSetbackMaxFt: 12,
  garageRidgeAllowanceFt: 3,
  outsideSetbackSafeMaxFt: 32,
  required: { front: { minFt: 5, averageFt: 7 }, rear: { minFt: 5, averageFt: 7 }, rearAlley: { minFt: 0, averageFt: 0 }, side: { minFt: 5, averageFt: 5 } },
  citation: "SMC 23.45.514.C",
  structureHeightText:
    "The structure height limit in a Lowrise zone is 32 ft in LR1, 32 or 40 ft in LR2 and 32, 40 or 50 ft in LR3 depending on the zone's MHA suffix and location, with pitched- and shed-roof allowances (SMC 23.45.514 Table A and D-E).",
  mappingToleranceFt: 2,
};
const HEIGHT_CAVEATS = [
  ZONING_CAVEAT,
  {
    category: "roof and height exceptions",
    description:
      "SMC 23.45.514.C limits an accessory structure (not an ADU) in a required setback or separation to 12 ft, with a garage's pitched ridge allowed 3 ft more (4:12 or steeper, measured on the facade with the vehicle entrance). The product states a height above the limit as REQUIRES_VERIFICATION, never an unconditional FAIL; 12 ft or less is a PASS wherever the structure stands. The 32 ft figure is the lowest Lowrise structure height limit, so a height at or under it passes outside every required setback in any LR zone.",
    affectedConditionOrInterpretation: "SMC 23.45.514.A, C-E",
    sourceReferences: ["SMC 23.45.514 Table A", "SMC 23.45.514.C"],
    resolutionStatus: "Resolved by design.",
  },
];

const SEPARATION_SPEC = { ruleType: "MF_ACC_SEPARATION", inSetbackMinFt: 3, otherwiseMinFt: 5, mappingToleranceFt: 2 };

interface FarVariant {
  token: string;
  slug: string;
  far: number;
  farStacked?: number;
  zoneText: string;
  conditionText?: string;
}
const FAR_VARIANTS: FarVariant[] = [
  { token: "LR1:MHA", slug: "lr1-mha", far: 1.3, farStacked: 1.5, zoneText: "A Lowrise 1 (LR1) zone with a mandatory housing affordability (MHA) suffix" },
  { token: "LR1:NO_MHA", slug: "lr1-nomha", far: 1.0, zoneText: "A Lowrise 1 (LR1) zone without an MHA suffix" },
  {
    token: "LR2:MHA",
    slug: "lr2-mha",
    far: 1.4,
    farStacked: 1.6,
    zoneText: "A Lowrise 2 (LR2) zone with an MHA suffix",
    conditionText: "For stacked dwelling units that provide outdoor amenity area meeting SMC 23.45.522 equal to at least 35 percent of the lot area, the figure is 1.8 (SMC 23.45.510 Table A footnote 1).",
  },
  { token: "LR2:NO_MHA", slug: "lr2-nomha", far: 1.1, zoneText: "A Lowrise 2 (LR2) zone without an MHA suffix" },
  {
    token: "LR3:MHA",
    slug: "lr3-mha",
    far: 1.8,
    zoneText: "A Lowrise 3 (LR3) zone with an MHA suffix",
    conditionText: "The figure shown is for a lot outside a regional center, urban center or Station Area Overlay District; inside one the limit is 2.3 (SMC 23.45.510 Table A).",
  },
  {
    token: "LR3:NO_MHA",
    slug: "lr3-nomha",
    far: 1.2,
    farStacked: 1.3,
    zoneText: "A Lowrise 3 (LR3) zone without an MHA suffix",
    conditionText: "The stacked-dwelling-unit figure shown is for a lot outside a regional center or urban center; inside one it is 1.5 (SMC 23.45.510 Table A).",
  },
];

function farRow(projectType: "shed" | "garage", v: FarVariant): DraftedRuleInput {
  const who = projectType === "shed" ? "Shed" : "Detached garage";
  return {
    id: `${projectType}-mf-far-${v.slug}-2026`,
    subject: `${who} floor area ratio - ${v.zoneText.replace(/^A /, "")}: ${v.far}${v.farStacked ? ` (${v.farStacked} stacked)` : ""}; no lot-coverage limit`,
    applicableProjectType: projectType,
    applicableZone: v.token,
    ruleSpecification: { ruleType: "MF_FAR", far: v.far, ...(v.farStacked ? { farStacked: v.farStacked } : {}), zoneText: v.zoneText, ...(v.conditionText ? { conditionText: v.conditionText } : {}) },
    citation: { smcSections: ["SMC 23.45.510.A", "SMC 23.45.510.B", "SMC 23.45.510 Table A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      ZONING_CAVEAT,
      {
        category: "existing floor area unknown",
        description: "The FAR limit applies to the total chargeable floor area of all structures on the lot (underground floors and other items are exempt, SMC 23.45.510.D). Permit Preflight does not know the floor area of the existing buildings, so the finding is always REQUIRES_VERIFICATION; it states the limit and the proposed structure's footprint so the customer can check.",
        affectedConditionOrInterpretation: "SMC 23.45.510.B, D",
        sourceReferences: ["SMC 23.45.510"],
        resolutionStatus: "Resolved by design - the rule exists so the claim is governed and the absence of a lot-coverage limit is stated.",
      },
    ],
    testCases: [tc("EXCEPTION", "Floor area of existing buildings is not known", { parcelAreaSqFt: 4000 }, "Floor area ratio", "REQUIRES_VERIFICATION", v.token.startsWith("LR1") ? (v.token.endsWith("NO_MHA") ? "LR1" : "LR1 (M)") : v.token.startsWith("LR2") ? (v.token.endsWith("NO_MHA") ? "LR2" : "LR2 (M1)") : v.token.endsWith("NO_MHA") ? "LR3" : "LR3 (M)")],
    isTestOnlyFixture: false,
  };
}

function accessoryRows(projectType: "shed" | "garage"): DraftedRuleInput[] {
  const who = projectType === "shed" ? "Shed" : "Detached garage";
  const rows: DraftedRuleInput[] = [
    {
      id: `${projectType}-mf-setbacks-2026`,
      subject: `${who} setbacks in multifamily zones - allowed in a required rear or side setback within SMC 23.45.518.H.1; not in the front setback`,
      applicableProjectType: projectType,
      applicableZone: "MULTIFAMILY",
      ruleSpecification: SETBACKS_SPEC,
      citation: { smcSections: ["SMC 23.45.518.H.1", "SMC 23.45.518 Table A", "SMC 23.45.518.D"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: SETBACK_CAVEATS,
      testCases: [
        tc("POSITIVE", "20 ft from the front lot line, outside the required front setback", { distanceToFrontLotLineFt: 20 }, `${who} front setback`, "KNOWN/PASS"),
        tc("NEGATIVE", "1 ft from the front lot line, inside the required front setback", { distanceToFrontLotLineFt: 1 }, `${who} front setback`, "KNOWN/FAIL"),
        tc("BOUNDARY", "6 ft from the front lot line: between the 5 ft minimum and the 7 ft average", { distanceToFrontLotLineFt: 6 }, `${who} front setback`, "REQUIRES_VERIFICATION"),
        tc("POSITIVE", "6 ft from the rear lot line: allowed in the required rear setback, roof edges clear of the 3 ft projection limit", { distanceToRearLotLineFt: 6 }, `${who} rear setback`, "KNOWN/PASS"),
        tc("EXCEPTION", "1 ft from the rear lot line: roof edges may not project within 3 ft of a lot line", { distanceToRearLotLineFt: 1 }, `${who} rear setback`, "REQUIRES_VERIFICATION"),
        tc("POSITIVE", "12 ft from the nearest side lot line", { distanceToSideLotLineFt: 12 }, `${who} side setback`, "KNOWN/PASS"),
        tc("NEGATIVE", "2 ft from the side lot line with every part more than 25 ft from the rear lot line", { distanceToSideLotLineFt: 2, distanceToRearLotLineFt: 40, farthestFromRearLotLineFt: 55 }, `${who} side setback`, "KNOWN/FAIL"),
        tc("EXCEPTION", "2 ft from the side lot line within 25 ft of the rear, behind the house: allowed in the required side setback", { distanceToSideLotLineFt: 2, distanceToRearLotLineFt: 6, farthestFromRearLotLineFt: 16, besideDwelling: "NOT_BESIDE" }, `${who} side setback`, "KNOWN/PASS"),
        tc("EXCEPTION", "2 ft from the side lot line within 25 ft of the rear, house position not established", { distanceToSideLotLineFt: 2, distanceToRearLotLineFt: 6, farthestFromRearLotLineFt: 16 }, `${who} side setback`, "REQUIRES_VERIFICATION"),
        tc("NEGATIVE", "2 ft from the side lot line, between the house and the side lot line", { distanceToSideLotLineFt: 2, distanceToRearLotLineFt: 6, farthestFromRearLotLineFt: 16, besideDwelling: "BESIDE" }, `${who} side setback`, "KNOWN/FAIL"),
        tc("BOUNDARY", "6 ft from the side lot line: inside the 2 ft tolerance of 5 ft", { distanceToSideLotLineFt: 6, distanceToRearLotLineFt: 40, farthestFromRearLotLineFt: 55 }, `${who} side setback`, "REQUIRES_VERIFICATION"),
      ],
      isTestOnlyFixture: false,
    },
    {
      id: `${projectType}-mf-height-lr-2026`,
      subject: "Accessory structure height limit in Lowrise zones - 12 ft in a required setback or separation; the zone's structure height limit elsewhere",
      applicableProjectType: projectType,
      applicableZone: "LR",
      ruleSpecification: HEIGHT_SPEC_LR,
      citation: { smcSections: ["SMC 23.45.514.C", "SMC 23.45.514.A", "SMC 23.45.514 Table A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: HEIGHT_CAVEATS,
      testCases: [
        tc("POSITIVE", "10 ft: within the 12 ft limit wherever it stands", { heightFt: 10 }, "Accessory structure height limit", "KNOWN/PASS"),
        tc("POSITIVE", "20 ft outside every required setback", { heightFt: 20, isInRequiredSetback: false }, "Accessory structure height limit", "KNOWN/PASS"),
        tc("EXCEPTION", "14 ft in a required setback", { heightFt: 14, isInRequiredSetback: true }, "Accessory structure height limit", "REQUIRES_VERIFICATION"),
        tc("EXCEPTION", "14 ft with the setback question unresolved", { heightFt: 14, isInRequiredSetback: undefined, requiredSetbackEvidenceGapReasons: ["test gap"] }, "Accessory structure height limit", "REQUIRES_VERIFICATION"),
        tc("EXCEPTION", "35 ft outside every required setback", { heightFt: 35, isInRequiredSetback: false }, "Accessory structure height limit", "REQUIRES_VERIFICATION"),
      ],
      isTestOnlyFixture: false,
    },
  ];
  if (projectType === "shed") {
    rows.push({
      id: "shed-mf-separation-lr-2026",
      subject: "Shed separation from the house in Lowrise zones - 3 ft in a required setback (SMC 23.45.518.H.1.d); 5 ft between structures containing floor area elsewhere",
      applicableProjectType: "shed",
      applicableZone: "LR",
      ruleSpecification: SEPARATION_SPEC,
      citation: { smcSections: ["SMC 23.45.518.H.1.d", "SMC 23.45.519.A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [
        MAPPED,
        ZONING_CAVEAT,
        {
          category: "where the shed stands",
          description: "The 3 ft separation (including eaves and gutters) is the allowance for an accessory structure in a required setback; elsewhere a structure containing floor area must be 5 ft from another. Without the shed's position relative to the required setbacks, a distance between 3 and 5 ft (plus tolerance) is REQUIRES_VERIFICATION; clearly under 3 ft fails either way.",
          affectedConditionOrInterpretation: "SMC 23.45.518.H.1.d vs 23.45.519.A",
          sourceReferences: ["SMC 23.45.518.H.1.d", "SMC 23.45.519.A"],
          resolutionStatus: "Resolved by design.",
        },
      ],
      testCases: [
        tc("POSITIVE", "12 ft from the house", { distanceToDwellingFt: 12 }, "Shed separation from the house", "KNOWN/PASS"),
        tc("NEGATIVE", "0.5 ft from the house", { distanceToDwellingFt: 0.5 }, "Shed separation from the house", "KNOWN/FAIL"),
        tc("EXCEPTION", "4 ft: enough in a setback, not the 5 ft that applies elsewhere", { distanceToDwellingFt: 4 }, "Shed separation from the house", "REQUIRES_VERIFICATION"),
      ],
      isTestOnlyFixture: false,
    });
  } else {
    rows.push({
      id: "garage-mf-parking-access-lr-2026",
      subject: "Detached garage access, driveway and garage-door standards in Lowrise zones (SMC 23.45.536)",
      applicableProjectType: "garage",
      applicableZone: "LR",
      ruleSpecification: { ruleType: "MF_GARAGE_PARKING_ACCESS", garageDoorMinFromStreetLotLineFt: 18, surfaceParkingMinFromStreetLotLineFt: 20, citation: "SMC 23.45.536" },
      citation: { smcSections: ["SMC 23.45.536.B", "SMC 23.45.536.C", "SMC 23.45.536.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [
        ZONING_CAVEAT,
        {
          category: "not determinable from the available data",
          description: "Alley access is required when the lot abuts an alley improved to the City standard or one the Director finds feasible; a street-facing garage door must be 18 ft from the street lot line; surface parking may not be within 20 ft of a street lot line. The alley's condition, the door's orientation and the driveway are not known, so the finding is always REQUIRES_VERIFICATION and states the standards.",
          affectedConditionOrInterpretation: "SMC 23.45.536",
          sourceReferences: ["SMC 23.45.536"],
          resolutionStatus: "Resolved by design - the rule exists so the claim is governed and never silently skipped.",
        },
      ],
      testCases: [tc("EXCEPTION", "Alley and door facts are not known", { alleyAdjacent: true }, "Garage access", "REQUIRES_VERIFICATION")],
      isTestOnlyFixture: false,
    });
  }
  for (const v of FAR_VARIANTS) rows.push(farRow(projectType, v));
  return rows;
}

export const shedMultifamilyCandidates: DraftedRuleInput[] = accessoryRows("shed");
export const garageMultifamilyCandidates: DraftedRuleInput[] = accessoryRows("garage");

// ---------------------------------------------------------------------------------------------------------------------
// Fences (SMC 23.45.518.H.7 and H.8)
// ---------------------------------------------------------------------------------------------------------------------

const SMC_FENCES = "SMC 23.45.518.H.7";
const SMC_WALLS = "SMC 23.45.518.H.8";

export const fenceMultifamilyCandidates: DraftedRuleInput[] = [
  {
    id: "fence-mf-f1-height-standard-2026",
    subject: "Fence height in multifamily zones - required side/rear setbacks (6 ft; +2 ft predominantly open feature; 8 ft absolute cap)",
    applicableProjectType: "fence",
    applicableZone: "MULTIFAMILY",
    ruleSpecification: { ruleType: FenceRuleType.HEIGHT_STANDARD, maxFt: 6, openFeatureAllowanceFt: 2, absoluteMaxFt: 8 },
    citation: { smcSections: [`${SMC_FENCES}.a`, `${SMC_FENCES}.b`, `${SMC_FENCES}.c`], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "6 ft fence in a side or rear setback", { heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, "Fence height (side or rear setback)", "KNOWN/PASS"),
      tc("NEGATIVE", "6.5 ft fence in a side or rear setback", { heightFt: 6.5, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, "Fence height (side or rear setback)", "KNOWN/FAIL"),
      tc("EXCEPTION", "6 ft fence with a 2 ft top feature", { heightFt: 6, openFeatureHeightFt: 2, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }, "Fence height (side or rear setback)", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-mf-f2-height-front-street-side-2026",
    subject: "Fence height in multifamily zones - front setback and street-side setback (4 ft; no feature allowance; 6 ft absolute cap)",
    applicableProjectType: "fence",
    applicableZone: "MULTIFAMILY",
    ruleSpecification: { ruleType: FenceRuleType.HEIGHT_FRONT_STREET_SIDE, maxFt: 4, absoluteMaxFt: 6 },
    citation: { smcSections: [`${SMC_FENCES}.a`, `${SMC_FENCES}.c`], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "4 ft fence in the front setback", { heightFt: 4, locations: ["FRONT_SETBACK"] }, "Fence height (front setback)", "KNOWN/PASS"),
      tc("NEGATIVE", "5 ft fence in the front setback", { heightFt: 5, locations: ["FRONT_SETBACK"] }, "Fence height (front setback)", "KNOWN/FAIL"),
      tc("EXCEPTION", "4 ft average on a slope with the tallest portion at 6 ft", { heightFt: 4, siteSlopes: true, tallestPortionHeightFt: 6, locations: ["STREET_SIDE_SETBACK"] }, "Fence height (street-side setback)", "KNOWN/PASS"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-mf-f3-retaining-wall-2026",
    subject: "Fence on or near a retaining wall or bulkhead in a required setback, multifamily zones (4 ft on a wall; 9.5 ft combined; 6 ft raising-grade wall; 3 ft from a cut wall)",
    applicableProjectType: "fence",
    applicableZone: "MULTIFAMILY",
    ruleSpecification: { ruleType: FenceRuleType.RETAINING_WALL, fenceOnWallMaxFt: 4, combinedMaxFt: 9.5, raisingGradeWallMaxFt: 6, cutWallFenceSetbackFt: 3 },
    citation: { smcSections: [`${SMC_FENCES}.a`, `${SMC_WALLS}.a`, `${SMC_WALLS}.b`], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_INPUT_CAVEAT,
      ZONING_CAVEAT,
      {
        category: "wall status not determinable",
        description: "Whether an existing wall 'raises grade' or 'protects a cut', and whether a cut wall is no taller than needed (a geotechnical matter), cannot be determined by Permit Preflight; those resolve REQUIRES_VERIFICATION or are disclosed as not evaluated.",
        affectedConditionOrInterpretation: "H.8 wall classification and necessity",
        sourceReferences: [`${SMC_WALLS}.a`, `${SMC_WALLS}.b`],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "5 ft new raising-grade wall under a 4 ft fence (9 ft combined)", { heightFt: 4, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "ON_NEW_WALL_RAISING_GRADE", wallHeightFt: 5 }, "Fence and retaining wall or bulkhead", "KNOWN/PASS"),
      tc("NEGATIVE", "6 ft raising-grade wall under a 4 ft fence (10 ft combined)", { heightFt: 4, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "ON_NEW_WALL_RAISING_GRADE", wallHeightFt: 6 }, "Fence and retaining wall or bulkhead", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "fence-mf-f4-outside-required-setbacks-lr-2026",
    subject: "Fence outside every required setback in Lowrise zones - SMC 23.45.518.H.7 does not apply; lowest structure height limit 32 ft",
    applicableProjectType: "fence",
    applicableZone: "LR",
    ruleSpecification: { ruleType: FenceRuleType.OUTSIDE_REQUIRED_SETBACKS, generalStructureHeightLimitFt: 32 },
    citation: { smcSections: [SMC_FENCES, "SMC 23.45.514.A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_INPUT_CAVEAT,
      ZONING_CAVEAT,
      {
        category: "scoped negative finding",
        description: "H.7 allows fences in required setbacks up to stated heights and is silent outside them; Table A of 23.45.514 sets 32 ft for structures in LR1 and 32, 40 or 50 ft elsewhere (the lowest, 32 ft, is used and intake caps a fence at 20 ft). The finding is worded 'no fence-specific limit identified among the provisions evaluated', never as general compliance.",
        affectedConditionOrInterpretation: "Absence of any other limit on a fence outside setbacks",
        sourceReferences: [SMC_FENCES, "SMC 23.45.514 Table A"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "7 ft fence outside required setbacks", { heightFt: 7, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, "Fence height (outside required setbacks)", "KNOWN/PASS"),
      tc("NEGATIVE", "33 ft structure outside required setbacks (exercises the rule logic directly)", { heightFt: 33, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, "Fence height (outside required setbacks)", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// Decks (SMC 23.45.518.G projections; no lot-coverage limit)
// ---------------------------------------------------------------------------------------------------------------------

export const deckMultifamilyCandidates: DraftedRuleInput[] = [
  {
    id: "deck-mf-d1-setback-height-allowance-2026",
    subject: "Deck in a required setback in multifamily zones - allowed up to 18 in above grade; further allowances for projecting decks and accessory structures",
    applicableProjectType: "deck",
    applicableZone: "MULTIFAMILY",
    ruleSpecification: {
      ruleType: DeckRuleType.SETBACK_HEIGHT_ALLOWANCE,
      allowedInSetbackMaxIn: 18,
      allowanceCitation: "SMC 23.45.518.G.4",
      limitCitation: "SMC 23.45.518.G",
      furtherAllowancesText:
        "The code lists further allowances that could apply: unenclosed decks and balconies may project up to 4 ft into a required setback if each is at least 5 ft from any lot line, no more than 20 ft wide, and separated from other decks or balconies on the same facade by at least half its width (SMC 23.45.518.G.7); unenclosed porches or steps up to 4 ft above grade have their own allowances (SMC 23.45.518.G.5); and a deck that is a detached accessory structure may stand in a required rear or side setback within the limits of SMC 23.45.518.H.1.",
    },
    citation: { smcSections: ["SMC 23.45.518.G.4", "SMC 23.45.518.G.5", "SMC 23.45.518.G.7", "SMC 23.45.518.H.1"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_INPUT_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "12 in deck in the side setback", { heightAboveGradeIn: 12, setbackLocations: ["SIDE_SETBACK"] }, "Deck setback (side setback)", "KNOWN/PASS"),
      tc("EXCEPTION", "24 in deck in the side setback: further allowances may apply", { heightAboveGradeIn: 24, setbackLocations: ["SIDE_SETBACK"] }, "Deck setback (side setback)", "REQUIRES_VERIFICATION"),
      tc("POSITIVE", "36 in deck outside every required setback", { heightAboveGradeIn: 36, setbackLocations: ["OUTSIDE_REQUIRED_SETBACKS"] }, "Deck setback (outside required setbacks)", "KNOWN/PASS"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "deck-mf-no-lot-coverage-limit-2026",
    subject: "Deck and lot coverage in multifamily zones - there is no lot-coverage limit; a deck is not gross floor area",
    applicableProjectType: "deck",
    applicableZone: "MULTIFAMILY",
    ruleSpecification: {
      ruleType: DeckRuleType.NO_LOT_COVERAGE_LIMIT,
      statement:
        "Lowrise, Midrise and Highrise zones have no lot-coverage percentage limit (SMC Chapter 23.45 limits floor area ratio instead, SMC 23.45.510), and a deck associated with a single dwelling unit is not gross floor area (SMC 23.45.510.A), so a deck does not count against either.",
    },
    citation: { smcSections: ["SMC 23.45.510.A", "SMC 23.45.510.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      ZONING_CAVEAT,
      {
        category: "scoped statement",
        description: "The statement is limited to the lot-coverage and floor-area-ratio limits: a deck associated with a single unit is not gross floor area, but a deck used for common circulation, a covered or enclosed deck that is floor area, and other standards (amenity area, landscaping) are not evaluated.",
        affectedConditionOrInterpretation: "SMC 23.45.510.A",
        sourceReferences: ["SMC 23.45.510.A"],
        resolutionStatus: "Resolved by design - scope-limited wording.",
      },
    ],
    testCases: [tc("POSITIVE", "Any deck: no lot-coverage limit applies", { heightAboveGradeIn: 40, setbackLocations: ["SIDE_SETBACK"] }, "Deck and lot coverage", "KNOWN")],
    isTestOnlyFixture: false,
  },
];

export const allMultifamilyCandidates: DraftedRuleInput[] = [...shedMultifamilyCandidates, ...garageMultifamilyCandidates, ...fenceMultifamilyCandidates, ...deckMultifamilyCandidates];
export const MULTIFAMILY_FIXED_ROW_IDS: Record<string, string> = Object.fromEntries(allMultifamilyCandidates.map((c) => [c.id, mfRowId(c.id)]));
