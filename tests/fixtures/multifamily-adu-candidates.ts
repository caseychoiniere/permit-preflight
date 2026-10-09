/**
 * REAL governance candidates for ADUs in LOWRISE zones (LR1-LR3) (citywide zoning coverage, 2026-10-09). Content is current Seattle code read live from Municode on
 * 2026-10-09 (Ord. 127376, 2025): SMC 23.42.022 (ADU rules that apply in every zone: unit count, size, conversions, attached ADUs; E: "Unless otherwise provided in
 * the standards of the underlying zone, accessory dwelling units shall be subject to the same standards as principal dwelling units") and SMC Chapter 23.45 for the
 * standards of the zone: 23.45.518 Table A (setbacks - an ADU is expressly outside the accessory-structure allowance of H.1), 23.45.514 Table A and D-E (height and
 * roof allowances), 23.45.519 (5 ft between structures containing floor area), 23.45.510 (floor area ratio; there is no lot-coverage and no density-by-lot-area limit),
 * 23.45.522 (amenity area, 20% of the lot), 23.45.524 (Green Factor only for more than one new unit; street trees), 23.45.529 (design standards).
 * Midrise, Highrise and commercial zones are deliberately NOT covered for ADUs: their amenity-area, landscaping and floor-area standards differ in kind from the
 * Lowrise ones and are not built. Each row is Tier 1; every interpretive edge is REQUIRES_VERIFICATION. Advanced only to APPROVED by the lifecycle script.
 */
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";
import { mfRowId } from "./multifamily-candidates.js";

const BASIS = "Ordinance 127376 (2025): SMC 23.42.022 and SMC Chapter 23.45 as published on Municode Library (CURRENT) and read live 2026-10-09.";
const DECLARED_CAVEAT = {
  category: "declared input and mapped geometry, not a survey",
  description:
    "ADU size, height, stories, bedrooms and the existing unit counts are declared by the customer. Distances are measured from the footprint the customer placed on the map against the King County parcel polygon and Seattle Building Outlines (2023). Every finding says so; nothing is presented as surveyed.",
  affectedConditionOrInterpretation: "Accuracy of the declared and mapped inputs",
  sourceReferences: ["SMC 23.42.022", "SMC 23.45.518"],
  resolutionStatus: "Resolved by design - the report labels every conclusion as based on declared and mapped inputs.",
};
const ZONING_CAVEAT = {
  category: "zone designation is general mapping",
  description: "The zone comes from Seattle's published zoning layer (general mapping, not a legal determination). The MHA suffix decides the height and floor-area figures; an unrecognized suffix leaves those claims unscreened, and regional-center membership is not carried by the designation.",
  affectedConditionOrInterpretation: "Which Lowrise standards apply",
  sourceReferences: ["Seattle GIS Current Land Use Zoning Detail", "SMC 23.45.502"],
  resolutionStatus: "Resolved by design.",
};

export interface MfAduCase {
  kind: "POSITIVE" | "NEGATIVE" | "EXCEPTION" | "BOUNDARY";
  description: string;
  input: { project?: Record<string, unknown>; site?: Record<string, unknown>; zoning?: string };
  expected: { finding: string; outcome: string; appliedBy?: string };
}
const tc = (kind: MfAduCase["kind"], description: string, project: Record<string, unknown> | undefined, finding: string, outcome: string, opts: { site?: Record<string, unknown>; zoning?: string; appliedBy?: string } = {}): MfAduCase => ({
  kind,
  description,
  input: { ...(project ? { project } : {}), ...(opts.site ? { site: opts.site } : {}), ...(opts.zoning ? { zoning: opts.zoning } : {}) },
  expected: { finding, outcome, ...(opts.appliedBy ? { appliedBy: opts.appliedBy } : {}) },
});

const CONVERSION_BASE = { aduType: "CONVERSION_EXISTING", widthFt: undefined, depthFt: undefined, heightFt: undefined, stories: 1, bedrooms: 1, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: true } };
const ATTACHED_BASE = { aduType: "ATTACHED_TO_HOUSE", widthFt: undefined, depthFt: undefined, heightFt: undefined, stories: 1, bedrooms: 1, attached: { grossFloorAreaSqFt: 700, includesAddition: false, portionExistedBeforeJuly2023: true } };

const FAR_VARIANTS = [
  { token: "LR1:MHA", example: "LR1 (M)", slug: "lr1-mha", far: 1.3, zoneText: "A Lowrise 1 (LR1) zone with a mandatory housing affordability (MHA) suffix", conditionText: "The figure is 1.5 for stacked dwelling units (SMC 23.45.510 Table A)." },
  { token: "LR1:NO_MHA", example: "LR1", slug: "lr1-nomha", far: 1.0, zoneText: "A Lowrise 1 (LR1) zone without an MHA suffix" },
  { token: "LR2:MHA", example: "LR2 (M1)", slug: "lr2-mha", far: 1.4, zoneText: "A Lowrise 2 (LR2) zone with an MHA suffix", conditionText: "The figure is 1.6 for stacked dwelling units, or 1.8 for stacked units that provide the outdoor amenity area described in SMC 23.45.510 Table A footnote 1." },
  { token: "LR2:NO_MHA", example: "LR2", slug: "lr2-nomha", far: 1.1, zoneText: "A Lowrise 2 (LR2) zone without an MHA suffix" },
  { token: "LR3:MHA", example: "LR3 (M)", slug: "lr3-mha", far: 1.8, zoneText: "A Lowrise 3 (LR3) zone with an MHA suffix", conditionText: "The figure shown is for a lot outside a regional center, urban center or Station Area Overlay District; inside one the limit is 2.3 (SMC 23.45.510 Table A)." },
  { token: "LR3:NO_MHA", example: "LR3", slug: "lr3-nomha", far: 1.2, zoneText: "A Lowrise 3 (LR3) zone without an MHA suffix", conditionText: "The figure is 1.3 for stacked dwelling units outside a regional center or urban center, and 1.5 inside one (SMC 23.45.510 Table A)." },
];

const HEIGHT_VARIANTS = [
  { token: "LR1", example: "LR1 (M)", slug: "lr1", maxFt: 32, higherFt: 32, higherText: "The Lowrise 1 structure height limit is 32 ft (SMC 23.45.514 Table A)" },
  { token: "LR2:MHA", example: "LR2 (M)", slug: "lr2-mha", maxFt: 40, higherFt: 40, higherText: "The Lowrise 2 structure height limit with an MHA suffix is 40 ft (SMC 23.45.514 Table A)" },
  { token: "LR3:MHA", example: "LR3 (M)", slug: "lr3-mha", maxFt: 40, higherFt: 50, higherText: "The Lowrise 3 structure height limit with an MHA suffix is 40 ft, or 50 ft in a regional center, urban center or Station Area Overlay District (SMC 23.45.514 Table A)" },
  { token: "LR2:NO_MHA,LR3:NO_MHA", example: "LR2", slug: "lr2-lr3-nomha", maxFt: 32, higherFt: 32, higherText: "The structure height limit in a Lowrise 2 or 3 zone without an MHA suffix is 32 ft (SMC 23.45.514 Table A footnote 1)" },
];

export const aduMultifamilyCandidates: DraftedRuleInput[] = [
  {
    id: "adu-mf-count-lr-2026",
    subject: "ADU count in Lowrise zones - at most two ADUs per lot; no dwelling-unit density limit by lot area",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: {
      ruleType: AduRuleType.MF_COUNT,
      maxAdusPerLot: 2,
      noDensityLimitText:
        "Lowrise zones have no limit on the number of dwelling units by lot area; the floor area ratio limit (SMC 23.45.510) governs how much can be built instead, and ADUs count with the principal dwelling units when density is calculated (SMC 23.42.022.J).",
    },
    citation: { smcSections: ["SMC 23.42.022.C", "SMC 23.42.022.J", "SMC 23.45.510"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "No ADU yet: this would be the first", undefined, "Number of ADUs on the lot", "KNOWN/PASS"),
      tc("NEGATIVE", "Two ADUs already: this would be the third", { existingAduCount: 2 }, "Number of ADUs on the lot", "KNOWN/FAIL"),
      tc("POSITIVE", "No density limit by lot area is stated", undefined, "Dwelling units allowed on the lot (density)", "KNOWN/PASS"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mf-size-limit-lr-2026",
    subject: "ADU gross floor area in Lowrise zones - 1,000 sq ft (up to two bedrooms) or 1,200 sq ft; 1,500 sq ft only in a frequent transit service area on a lot not purchased for more than $1,000 in 20 years",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: {
      ruleType: AduRuleType.SIZE_LIMIT,
      maxSqFtUpToTwoBedrooms: 1000,
      maxSqFtThreePlusBedrooms: 1200,
      bikeParkingExclusionSqFt: 35,
      conditionalExtendedCapSqFt: 1500,
      conditionalExtendedCapText:
        "In a Lowrise zone the limit is 1,500 sq ft regardless of bedrooms if the lot is in a frequent transit service area and has not been purchased for more than $1,000 in the past 20 years (SMC 23.42.022.G.1.c).",
    },
    citation: { smcSections: ["SMC 23.42.022.G.1", "SMC 23.42.022.G.2"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "conditional 1,500 sq ft cap", description: "Whether the lot qualifies for the 1,500 sq ft cap depends on its purchase history, which Permit Preflight does not have; an ADU between the ordinary cap and 1,500 sq ft is REQUIRES_VERIFICATION, never a failure.", affectedConditionOrInterpretation: "SMC 23.42.022.G.1.c", sourceReferences: ["SMC 23.42.022.G.1.c"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "20 x 20 ft one-story ADU, 400 sq ft", undefined, "ADU size limit", "KNOWN/PASS"),
      tc("EXCEPTION", "A 1,200 sq ft ADU is over 1,000 sq ft but within the conditional 1,500 sq ft cap", { widthFt: 30, depthFt: 20, stories: 2, bedrooms: 2 }, "ADU size limit", "REQUIRES_VERIFICATION"),
      tc("NEGATIVE", "A 1,800 sq ft ADU is over even the conditional cap", { widthFt: 30, depthFt: 30, stories: 2, bedrooms: 2 }, "ADU size limit", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mf-setbacks-lr-2026",
    subject: "ADU setbacks in Lowrise zones - the principal-structure setbacks: front 7 ft average / 5 ft minimum, rear 7 ft average / 5 ft minimum (none at an alley), side 5 ft",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: {
      ruleType: AduRuleType.SETBACKS,
      rearFt: 7,
      rearMinFt: 5,
      rearAlleyFt: 0,
      sideAverageFt: 5,
      sideMinFt: 5,
      smallLotSideFt: 5,
      smallLotAreaSqFt: 1,
      frontFt: 7,
      frontMinFt: 5,
      frontThreeOrMoreUnitsFt: 7,
      mappingToleranceFt: 2,
      citation: "SMC 23.45.518 Table A",
    },
    citation: { smcSections: ["SMC 23.45.518.A.1", "SMC 23.45.518 Table A", "SMC 23.45.518.D", "SMC 23.42.022.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      ZONING_CAVEAT,
      { category: "average setbacks", description: "Front and rear setbacks are 7 ft on average with a 5 ft minimum; a distance clearly short of 5 ft fails, one clearly beyond 7 ft passes, anything between (or within the 2 ft mapping margin) is REQUIRES_VERIFICATION. Accessory-structure allowances in setbacks (SMC 23.45.518.H.1) do not apply to an ADU. Corner and through lots are never resolved from the parcel shape alone.", affectedConditionOrInterpretation: "SMC 23.45.518 Table A, H.1, D", sourceReferences: ["SMC 23.45.518"], resolutionStatus: "Resolved by design." },
    ],
    testCases: [
      tc("POSITIVE", "20 ft from the rear lot line", undefined, "ADU rear setback", "KNOWN/PASS"),
      tc("NEGATIVE", "1 ft from the rear lot line", { distanceToRearLotLineFt: 1 }, "ADU rear setback", "KNOWN/FAIL"),
      tc("BOUNDARY", "6 ft from the rear lot line: between the 5 ft minimum and the 7 ft average", { distanceToRearLotLineFt: 6 }, "ADU rear setback", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "0 ft at an alley", { alleyAdjacent: true, distanceToRearLotLineFt: 0 }, "ADU rear setback", "KNOWN/PASS"),
      tc("POSITIVE", "8 ft from the nearest side lot line", undefined, "ADU side setback", "KNOWN/PASS"),
      tc("NEGATIVE", "1 ft from the nearest side lot line", { distanceToSideLotLineFt: 1 }, "ADU side setback", "KNOWN/FAIL"),
      tc("POSITIVE", "70 ft from the front lot line", undefined, "ADU front setback", "KNOWN/PASS"),
      tc("NEGATIVE", "1 ft from the front lot line", { distanceToFrontLotLineFt: 1 }, "ADU front setback", "KNOWN/FAIL"),
      tc("BOUNDARY", "6 ft from the front lot line", { distanceToFrontLotLineFt: 6 }, "ADU front setback", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mf-separation-lr-2026",
    subject: "Separation between structures containing floor area in Lowrise zones - 5 ft",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: { ruleType: AduRuleType.SEPARATION, minFt: 5, mappingToleranceFt: 2, citation: "SMC 23.45.519.A" },
    citation: { smcSections: ["SMC 23.45.519.A", "SMC 23.45.519.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "14 ft from the house", undefined, "Separation from the existing dwelling", "KNOWN/PASS"),
      tc("NEGATIVE", "1 ft from the house", { distanceToDwellingFt: 1 }, "Separation from the existing dwelling", "KNOWN/FAIL"),
      tc("BOUNDARY", "6 ft from the house: inside the 2 ft margin of 5 ft", { distanceToDwellingFt: 6 }, "Separation from the existing dwelling", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  ...HEIGHT_VARIANTS.map(
    (v): DraftedRuleInput => ({
      id: `adu-mf-height-${v.slug}-2026`,
      subject: `ADU height in a Lowrise zone (${v.token.replace(/_/g, " ")}) - ${v.maxFt} ft${v.higherFt !== v.maxFt ? ` (${v.higherFt} ft in a regional or urban center)` : ""}; pitched-roof allowances`,
      applicableProjectType: "adu",
      applicableZone: v.token,
      ruleSpecification: {
        ruleType: AduRuleType.HEIGHT,
        maxFt: v.maxFt,
        treeRetentionMaxFt: v.higherFt,
        pitchedRoofRidgeAllowanceFt: 5,
        citation: "SMC 23.45.514 Table A",
        higherLimitText: v.higherText,
        pitchedRoofText: "a pitched roof other than a shed or butterfly roof may rise up to 5 ft above the limit if all of it above the limit is pitched at least 3:12, and the high side of a shed or butterfly roof up to 3 ft (SMC 23.45.514.D and E)",
      },
      citation: { smcSections: ["SMC 23.45.514.A", "SMC 23.45.514 Table A", "SMC 23.45.514.D", "SMC 23.45.514.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "roof allowances and regional centers", description: "A height over the limit but within the limit plus the roof allowance (or the regional-center figure) is REQUIRES_VERIFICATION; only a height over even that ceiling is a failure. Regional-center membership is not carried by the zone designation.", affectedConditionOrInterpretation: "SMC 23.45.514", sourceReferences: ["SMC 23.45.514"], resolutionStatus: "Resolved by design." }],
      testCases: [
        tc("POSITIVE", "16 ft", undefined, "ADU height", "KNOWN/PASS", { zoning: v.example }),
        tc("EXCEPTION", `${v.higherFt + 2} ft is over the limit but within the roof allowance`, { heightFt: v.higherFt + 2 }, "ADU height", "REQUIRES_VERIFICATION", { zoning: v.example }),
        tc("NEGATIVE", `${v.higherFt + 8} ft is over even the roof allowance`, { heightFt: v.higherFt + 8 }, "ADU height", "KNOWN/FAIL", { zoning: v.example }),
      ],
      isTestOnlyFixture: false,
    })
  ),
  {
    id: "adu-mf-no-lot-coverage-limit-lr-2026",
    subject: "Lot coverage in Lowrise zones - there is no lot-coverage limit",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: { ruleType: AduRuleType.MF_NO_LOT_COVERAGE_LIMIT, statement: "Lowrise zones have no lot-coverage percentage limit (SMC Chapter 23.45); the floor area ratio limit (SMC 23.45.510) and the setbacks govern how much can be built instead." },
    citation: { smcSections: ["SMC 23.45.510", "SMC 23.45.518"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("POSITIVE", "Any ADU: no lot-coverage limit applies", undefined, "Lot coverage", "KNOWN/PASS")],
    isTestOnlyFixture: false,
  },
  ...FAR_VARIANTS.map(
    (v): DraftedRuleInput => ({
      id: `adu-mf-far-${v.slug}-2026`,
      subject: `ADU floor area ratio - ${v.zoneText.replace(/^A /, "")}: ${v.far}`,
      applicableProjectType: "adu",
      applicableZone: v.token,
      ruleSpecification: { ruleType: AduRuleType.MF_FLOOR_AREA_RATIO, far: v.far, zoneText: v.zoneText, ...(v.conditionText ? { conditionText: v.conditionText } : {}) },
      citation: { smcSections: ["SMC 23.45.510.A", "SMC 23.45.510.B", "SMC 23.45.510.D", "SMC 23.45.510 Table A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "exemptions and higher figures", description: "The limit applies to total chargeable floor area; exemptions (underground floors, portions of a story up to 4 ft above grade, pre-1982 detached dwellings, common walls) and the stacked-dwelling-unit and regional-center figures are not determined, so an apparent excess is REQUIRES_VERIFICATION, never a failure.", affectedConditionOrInterpretation: "SMC 23.45.510.B, D", sourceReferences: ["SMC 23.45.510"], resolutionStatus: "Resolved by design." }],
      testCases: [
        tc("EXCEPTION", "The existing floor area was not given", undefined, "Floor area ratio", "REQUIRES_VERIFICATION", { zoning: v.example }),
        tc("POSITIVE", "Existing 1,500 sq ft plus a 400 sq ft ADU is within the limit", { existingChargeableFloorAreaSqFt: 1500 }, "Floor area ratio", "KNOWN/PASS", { zoning: v.example, site: { parcelAreaSqFt: 6000 } }),
        tc("EXCEPTION", "Existing 12,000 sq ft plus the ADU is over the limit but never a definite failure", { existingChargeableFloorAreaSqFt: 12000 }, "Floor area ratio", "REQUIRES_VERIFICATION", { zoning: v.example, site: { parcelAreaSqFt: 6000 } }),
      ],
      isTestOnlyFixture: false,
    })
  ),
  {
    id: "adu-mf-amenity-lr-2026",
    subject: "Amenity area in Lowrise zones - 20% of the lot area; none for one unit added to a dwelling that existed in 1982",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: { ruleType: AduRuleType.AMENITY_AREA, requiredFractionOfLot: 0.2, minSqFt: 60, minDimensionFt: 6, citation: "SMC 23.45.522", exemptionCitation: "SMC 23.45.522.H", canopyExemption: false },
    citation: { smcSections: ["SMC 23.45.522.A", "SMC 23.45.522.D", "SMC 23.45.522.H"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "site plan not known", description: "Whether the site provides the amenity area is not determined; the finding states the requirement (a private amenity area is at least 60 sq ft and 6 ft in each dimension; a common one 250 sq ft and 10 ft) and the 1982 exemption. Environmentally critical area land may count toward it (SMC 23.45.522.G).", affectedConditionOrInterpretation: "SMC 23.45.522", sourceReferences: ["SMC 23.45.522"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "One new unit on a house declared built before 1982", { existingHouseBuiltBefore1982: true }, "Amenity area", "KNOWN/PASS"),
      tc("EXCEPTION", "House built after 1982: the requirement is stated, not assessed", { existingHouseBuiltBefore1982: false }, "Amenity area", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mf-landscaping-note-lr-2026",
    subject: "Landscaping and street trees for an ADU in Lowrise zones (SMC 23.45.524)",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: {
      ruleType: AduRuleType.MF_LANDSCAPING_NOTE,
      text: "In a Lowrise zone a Green Factor score of 0.6 is required only when more than one new dwelling unit is built on the site, and a new dwelling unit that does not increase floor area is exempt; street trees are required when any development is proposed, with exceptions (SMC 23.45.524.A-B). Existing trees, the site plan and the number of new units are not known to Permit Preflight, so whether and how this applies is left for SDCI to confirm.",
    },
    citation: { smcSections: ["SMC 23.45.524.A", "SMC 23.45.524.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("EXCEPTION", "Always stated, never assessed", undefined, "Tree requirement", "REQUIRES_VERIFICATION")],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mf-design-standards-lr-2026",
    subject: "Design standards for a new dwelling unit in Lowrise zones - 3 ft pedestrian path; street-facing entry with 3 x 3 ft weather protection and 20% windows within 40 ft of a street",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: { ruleType: AduRuleType.DESIGN_STANDARDS, pedestrianAccessMinWidthFt: 3, streetFacingWithinFt: 40, weatherProtectionFt: 3, facadeOpeningsPercent: 20, citation: "SMC 23.45.529" },
    citation: { smcSections: ["SMC 23.45.529.A", "SMC 23.45.529.C", "SMC 23.45.529.D", "SMC 23.45.529.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [tc("EXCEPTION", "Depends on the design; stated, never assessed", undefined, "Design standards", "REQUIRES_VERIFICATION")],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mf-conversion-lr-2026",
    subject: "Conversion of an existing accessory structure to a detached ADU in Lowrise zones - permitted notwithstanding lot coverage and yard or setback provisions; structure existing before July 23, 2023; Housing Code minimum standards",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: {
      ruleType: AduRuleType.CONVERSION,
      existingBeforeDate: "2023-07-23",
      housingCodeFirstSection: "SMC 22.206.020",
      housingCodeLastSection: "SMC 22.206.140",
      waivesSetbacksAndLotCoverage: true,
      directorMayWaiveAndModify: true,
      heightNote: "the Lowrise structure height limits, SMC 23.45.514",
    },
    citation: { smcSections: ["SMC 23.42.022.H.1", "SMC 23.42.022.H.2", "SMC 23.42.022.H.3.a", "SMC 23.42.022.H.3.b"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "what counts as an existing structure and an intact conversion", description: "Same treatment as the Neighborhood Residential conversion rule: the allowance is described only on the customer's declarations and always as REQUIRES_VERIFICATION; the height of the building is not collected; the Housing Code standards are cited and never assessed.", affectedConditionOrInterpretation: "SMC 23.42.022.H", sourceReferences: ["SMC 23.42.022.H"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "An intact conversion: siting is described, never asserted", CONVERSION_BASE, "Setbacks and lot coverage (conversion)", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "Height of the converted building is left to SDCI, naming the Lowrise limits", CONVERSION_BASE, "Height of the converted building", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mf-attached-lr-2026",
    subject: "ADU inside or attached to the house in Lowrise zones - may exceed 1,000 sq ft in a portion that existed before July 23, 2023; up to 250 sq ft of attached garage not counted",
    applicableProjectType: "adu",
    applicableZone: "LR",
    ruleSpecification: { ruleType: AduRuleType.ATTACHED, capExemptionBeforeDate: "2023-07-23", attachedGarageExclusionSqFt: 250 },
    citation: { smcSections: ["SMC 23.42.022.D", "SMC 23.42.022.E", "SMC 23.42.022.G.2", "SMC 23.42.022.H.4"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "A 700 sq ft basement ADU: within the cap", ATTACHED_BASE, "ADU size limit", "KNOWN/PASS", { appliedBy: "adu-mf-size-limit-lr-2026" }),
      tc("EXCEPTION", "A 1,300 sq ft ADU is over 1,000 sq ft but within the conditional 1,500 sq ft cap (cites the size rule)", { ...ATTACHED_BASE, attached: { grossFloorAreaSqFt: 1300, includesAddition: false, portionExistedBeforeJuly2023: true } }, "ADU size limit", "REQUIRES_VERIFICATION", { appliedBy: "adu-mf-size-limit-lr-2026" }),
      tc("EXCEPTION", "A 1,700 sq ft ADU in the part of the house declared to exist before the date: the cap may not apply (H.4)", { ...ATTACHED_BASE, attached: { grossFloorAreaSqFt: 1700, includesAddition: false, portionExistedBeforeJuly2023: true } }, "ADU size limit", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
];

export const ADU_MF_FIXED_ROW_IDS: Record<string, string> = Object.fromEntries(aduMultifamilyCandidates.map((c) => [c.id, mfRowId(c.id)]));
