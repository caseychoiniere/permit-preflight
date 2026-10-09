/**
 * REAL governance candidates for ADUs in NEIGHBORHOOD COMMERCIAL (NC1-NC3) and COMMERCIAL 1 (C1) zones (2026-10-09). Content is current Seattle code read live from Municode
 * (version Sep 25 2026, Ord. 127376): SMC 23.42.022 (ADUs are a housing use allowed in every zone where housing uses are allowed - residential uses are permitted outright in NC1,
 * NC2, NC3 and C1 and are a conditional use in C2, which is therefore NOT covered - at most two per lot, size, conversions, attached ADUs; E: "Unless otherwise provided in the
 * standards of the underlying zone, accessory dwelling units shall be subject to the same standards as principal dwelling units") and SMC Chapter 23.47A for the zone's standards:
 *  - 23.47A.014 (no ground-level setback unless a residential zone abuts the lot or is across an alley: triangle at the corner of an abutting residential lot, upper-level setbacks above
 *    13 ft, no opening within 5 ft of an abutting residentially zoned lot),
 *  - 23.47A.012 (height: the limit mapped on the Official Land Use Map, 30 ft at the lowest; +4 or +7 ft under A.1),
 *  - 23.47A.013 Tables A and B (floor area ratio by mapped height: 2.5 at 30 ft up to 8.25; no lot-coverage limit except in the area-specific standards of 23.47A.009),
 *  - 23.47A.024 (amenity area: 5% of the gross floor area in residential use; no 1982 exemption), 23.47A.016 (Green Factor 0.3 only for more than four new dwelling units; street trees),
 *  - 23.47A.008 and 23.47A.005 (street-level standards and residential limits on street-level street-facing facades) - stated, never assessed.
 * Not screened: area-specific standards (23.47A.009), the pedestrian-designation and overlay provisions, and Chapter 23.53 street/alley widening setbacks. Each row is Tier 1; every
 * interpretive edge is REQUIRES_VERIFICATION. The lifecycle script advances to APPROVED.
 */
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";
import { ATTACHED_BASE, BASIS, CONVERSION_BASE, DECLARED_CAVEAT, tc } from "./multifamily-adu-candidates.js";
import { mfRowId } from "./multifamily-candidates.js";

const ZONING_CAVEAT = {
  category: "zone designation is general mapping",
  description: "The zone and its mapped height come from Seattle's published zoning layer (general mapping, not a legal determination). Overlay and area-specific provisions (SMC 23.47A.009, the pedestrian-designation provisions of 23.47A.005 and 23.47A.008, Station Area Overlay Districts) are not applied; zoning next to the lot is read from the same layer.",
  affectedConditionOrInterpretation: "Which Neighborhood Commercial or Commercial standards apply",
  sourceReferences: ["Seattle GIS Current Land Use Zoning Detail", "SMC 23.47A.002", "SMC 23.47A.009"],
  resolutionStatus: "Resolved by design.",
};
const NC = "NC2-40 (M)";
const C1 = "C1-65 (M)";

export const aduCommercialCandidates: DraftedRuleInput[] = [
  {
    id: "adu-comm-count-2026",
    subject: "ADU count in Neighborhood Commercial and Commercial 1 zones - at most two ADUs per lot; no dwelling-unit density limit by lot area",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: {
      ruleType: AduRuleType.MF_COUNT,
      maxAdusPerLot: 2,
      noDensityLimitText:
        "Neighborhood Commercial and Commercial zones have no limit on the number of dwelling units by lot area; the floor area ratio limit (SMC 23.47A.013) governs how much can be built instead, and ADUs count with the principal dwelling units when density is calculated (SMC 23.42.022.J). Residential uses are permitted outright in these zones (SMC 23.47A.004 Table A).",
    },
    citation: { smcSections: ["SMC 23.42.022.A", "SMC 23.42.022.C", "SMC 23.42.022.J", "SMC 23.47A.004 Table A", "SMC 23.47A.013"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "No ADU yet: this would be the first", undefined, "Number of ADUs on the lot", "KNOWN/PASS", { zoning: NC }),
      tc("NEGATIVE", "Two ADUs already: this would be the third", { existingAduCount: 2 }, "Number of ADUs on the lot", "KNOWN/FAIL", { zoning: C1 }),
      tc("POSITIVE", "No density limit by lot area is stated", undefined, "Dwelling units allowed on the lot (density)", "KNOWN/PASS", { zoning: "NC3-55" }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-size-limit-2026",
    subject: "ADU gross floor area in Neighborhood Commercial and Commercial 1 zones - 1,000 sq ft (up to two bedrooms) or 1,200 sq ft (three or more); the 1,500 sq ft cap applies only in Lowrise zones",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: { ruleType: AduRuleType.SIZE_LIMIT, maxSqFtUpToTwoBedrooms: 1000, maxSqFtThreePlusBedrooms: 1200, bikeParkingExclusionSqFt: 35 },
    citation: { smcSections: ["SMC 23.42.022.G.1", "SMC 23.42.022.G.2"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "20 x 20 ft one-story ADU, 400 sq ft", undefined, "ADU size limit", "KNOWN/PASS", { zoning: NC }),
      tc("NEGATIVE", "A 1,300 sq ft two-bedroom ADU is over 1,000 sq ft", { widthFt: 30, depthFt: 22, stories: 2, bedrooms: 2 }, "ADU size limit", "KNOWN/FAIL", { zoning: C1 }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-setbacks-2026",
    subject: "ADU setbacks in Neighborhood Commercial and Commercial 1 zones - none, except where a residential zone abuts the lot or is across an alley (SMC 23.47A.014)",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: { ruleType: AduRuleType.COMM_SETBACKS, upperLevelAboveFt: 13, openingMinFromResidentialLotFt: 5, cornerTriangleFt: 15, citation: "SMC 23.47A.014.B" },
    citation: { smcSections: ["SMC 23.47A.014.B", "SMC 23.47A.014.G", "SMC 23.42.022.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      ZONING_CAVEAT,
      { category: "abutting residential zone", description: "Whether a residential zone abuts the lot or is across an alley from it comes from Seattle's zoning layer (zoning within a short distance of the lot); when it could not be read the claim is REQUIRES_VERIFICATION, never assumed. Where one does, the corner triangle, upper-level setbacks (above 13 ft along lot lines abutting residential zones) and the 5 ft opening rule apply and are stated, not measured. Chapter 23.53 setbacks for street and alley widening are not evaluated.", affectedConditionOrInterpretation: "SMC 23.47A.014.B", sourceReferences: ["SMC 23.47A.014"], resolutionStatus: "Resolved by design." },
    ],
    testCases: [
      tc("POSITIVE", "No residential zone abuts the lot: no setback requirement", { abutsResidentialZone: "NO" }, "ADU setbacks in a commercial zone", "KNOWN/PASS", { zoning: NC }),
      tc("EXCEPTION", "A Lowrise zone abuts the lot: the abutting-zone setbacks are stated, not measured", { abutsResidentialZone: "YES", adjacentResidentialZones: ["LR2 (M)"] }, "ADU setbacks in a commercial zone", "REQUIRES_VERIFICATION", { zoning: C1 }),
      tc("EXCEPTION", "The adjacent zoning could not be read: never assumed to be none", { abutsResidentialZone: "UNKNOWN" }, "ADU setbacks in a commercial zone", "REQUIRES_VERIFICATION", { zoning: NC }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-height-2026",
    subject: "ADU height in Neighborhood Commercial and Commercial 1 zones - the height mapped for the zone (30 ft at the lowest); up to 4 or 7 ft more under SMC 23.47A.012.A.1",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: { ruleType: AduRuleType.COMM_HEIGHT, safeMaxFt: 30, exceptionAllowanceFt: 7, citation: "SMC 23.47A.012.A" },
    citation: { smcSections: ["SMC 23.47A.012.A", "SMC 23.47A.012.A.1"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "mapped height and exceptions", description: "The limit is the number in the zone designation. At or under 30 ft the ADU is within the limit in every NC and C zone; with a single mapped height known, at or under it passes, over it by more than the 7 ft the exceptions can add fails, and in between is REQUIRES_VERIFICATION. Rooftop features and the other exceptions of 23.47A.012 are not evaluated.", affectedConditionOrInterpretation: "SMC 23.47A.012", sourceReferences: ["SMC 23.47A.012"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "16 ft: within the lowest mapped limit in any zone", undefined, "ADU height", "KNOWN/PASS", { zoning: NC }),
      tc("POSITIVE", "35 ft in a 40 ft zone", { heightFt: 35 }, "ADU height", "KNOWN/PASS", { zoning: NC, site: { mappedHeightFt: 40 } }),
      tc("EXCEPTION", "43 ft in a 40 ft zone: over the limit, within what the exceptions can add", { heightFt: 43 }, "ADU height", "REQUIRES_VERIFICATION", { zoning: NC, site: { mappedHeightFt: 40 } }),
      tc("NEGATIVE", "50 ft in a 40 ft zone: over even the exceptions", { heightFt: 50 }, "ADU height", "KNOWN/FAIL", { zoning: NC, site: { mappedHeightFt: 40 } }),
      tc("EXCEPTION", "35 ft with no single mapped height known", { heightFt: 35 }, "ADU height", "REQUIRES_VERIFICATION", { zoning: C1 }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-no-separation-2026",
    subject: "Separation between structures in Neighborhood Commercial and Commercial 1 zones - no separation requirement between an ADU and another structure",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: {
      ruleType: AduRuleType.SEPARATION,
      minFt: 0,
      mappingToleranceFt: 0,
      citation: "SMC Chapter 23.47A",
      noRequirementText:
        "Neighborhood Commercial and Commercial zones have no required separation between structures on a lot: SMC Chapter 23.47A's only separation provisions concern structures wider than 250 feet and optional facade breaks. Building Code fire-separation and egress rules are separate and are not evaluated here.",
    },
    citation: { smcSections: ["SMC 23.47A.014.D", "SMC 23.47A.012"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("POSITIVE", "Any distance: no zoning separation requirement applies", { distanceToDwellingFt: 0.5 }, "Separation from the existing dwelling", "KNOWN/PASS", { zoning: NC })],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-no-lot-coverage-limit-2026",
    subject: "Lot coverage in Neighborhood Commercial and Commercial 1 zones - there is no general lot-coverage limit",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: { ruleType: AduRuleType.MF_NO_LOT_COVERAGE_LIMIT, statement: "Neighborhood Commercial and Commercial zones have no general lot-coverage percentage limit (SMC Chapter 23.47A; lot-coverage limits appear only in the area-specific standards of SMC 23.47A.009, which are not applied here); the floor area ratio limit (SMC 23.47A.013) governs how much can be built instead." },
    citation: { smcSections: ["SMC 23.47A.013", "SMC 23.47A.009"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("POSITIVE", "Any ADU: no general lot-coverage limit applies", undefined, "Lot coverage", "KNOWN/PASS", { zoning: NC })],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-far-2026",
    subject: "ADU floor area ratio in Neighborhood Commercial and Commercial 1 zones - by mapped height, never less than 2.5",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: {
      ruleType: AduRuleType.MF_FLOOR_AREA_RATIO,
      far: 2.5,
      zoneText: "A Neighborhood Commercial or Commercial (C1) zone",
      floorPhrase: "sets a limit on the total chargeable floor area of all structures that depends on the zone's mapped height limit and is never less than",
      citation: "SMC 23.47A.013",
      conditionText: "The figure is 2.5 where the mapped height limit is 30 ft and rises with the height (3.0 at 40 ft, 3.75 at 55 ft, 4.5 at 65 ft, 5.5 at 75 ft, up to 8.25 at 200 ft; a Station Area Overlay District has its own Table B), so the limit for this property is higher unless it is mapped at 30 ft.",
    },
    citation: { smcSections: ["SMC 23.47A.013.A", "SMC 23.47A.013 Table A", "SMC 23.47A.013 Table B", "SMC 23.47A.013.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "lowest figure only", description: "The ratio depends on the mapped height (and Station Area Overlay membership, which the zone designation does not carry), so only the lowest figure (2.5) is used: a total at or under it is within the limit in every NC and C zone; a larger total is REQUIRES_VERIFICATION, never a failure. Exempt floor area (underground, portions of a story up to 4 ft above grade, and others in 23.47A.013.B) is not determined.", affectedConditionOrInterpretation: "SMC 23.47A.013", sourceReferences: ["SMC 23.47A.013"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("EXCEPTION", "The existing floor area was not given", undefined, "Floor area ratio", "REQUIRES_VERIFICATION", { zoning: NC }),
      tc("POSITIVE", "Existing 1,500 sq ft plus a 400 sq ft ADU is within the lowest figure", { existingChargeableFloorAreaSqFt: 1500 }, "Floor area ratio", "KNOWN/PASS", { zoning: NC, site: { parcelAreaSqFt: 6000 } }),
      tc("EXCEPTION", "Existing 20,000 sq ft plus the ADU is above the lowest figure: never a definite failure", { existingChargeableFloorAreaSqFt: 20000 }, "Floor area ratio", "REQUIRES_VERIFICATION", { zoning: C1, site: { parcelAreaSqFt: 6000 } }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-amenity-2026",
    subject: "Amenity area in Neighborhood Commercial and Commercial 1 zones - 5% of the gross floor area in residential use; no exemption for a unit added to an older house",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: { ruleType: AduRuleType.AMENITY_AREA, requiredFractionOfFloorArea: 0.05, minSqFt: 60, minDimensionFt: 6, citation: "SMC 23.47A.024", canopyExemption: false, noPre1982Exemption: true },
    citation: { smcSections: ["SMC 23.47A.024.A", "SMC 23.47A.024.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "site plan not known", description: "Whether the site provides the amenity area is not determined; the finding states the requirement (5% of the gross floor area in residential use; private balconies and decks at least 60 sq ft and 6 ft in each dimension; common areas 250 sq ft and 10 ft; unenclosed; no parking or driveways). SMC 23.47A.024 has no exemption for one unit added to a 1982 structure.", affectedConditionOrInterpretation: "SMC 23.47A.024", sourceReferences: ["SMC 23.47A.024"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("EXCEPTION", "The requirement is stated, not assessed", undefined, "Amenity area", "REQUIRES_VERIFICATION", { zoning: NC }),
      tc("EXCEPTION", "A house declared built before 1982 does not exempt the ADU here", { existingHouseBuiltBefore1982: true }, "Amenity area", "REQUIRES_VERIFICATION", { zoning: C1 }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-landscaping-note-2026",
    subject: "Landscaping and street trees for an ADU in Neighborhood Commercial and Commercial 1 zones (SMC 23.47A.016)",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: {
      ruleType: AduRuleType.MF_LANDSCAPING_NOTE,
      text: "In a Neighborhood Commercial or Commercial zone a Green Factor score of 0.3 is required only for development with more than four new dwelling units (or more than 4,000 new square feet of non-residential use, or more than 20 new parking spaces), so one or two ADUs do not trigger it; street trees are required when any development is proposed, with exceptions (SMC 23.47A.016.A-B). Existing trees, the site plan and the street are not known to Permit Preflight, so whether street trees are required is left for SDCI to confirm.",
    },
    citation: { smcSections: ["SMC 23.47A.016.A.2", "SMC 23.47A.016.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("EXCEPTION", "Always stated, never assessed", undefined, "Tree requirement", "REQUIRES_VERIFICATION", { zoning: NC })],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-street-level-note-2026",
    subject: "Street-level standards for a dwelling in Neighborhood Commercial and Commercial 1 zones (SMC 23.47A.005 and 23.47A.008)",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: {
      ruleType: AduRuleType.DESIGN_STANDARDS,
      noteText:
        "In Neighborhood Commercial zones (and in Commercial zones for a structure with a residential use) SMC 23.47A.008 sets street-level standards for a structure's street-facing facade: windows, doors or other openings so that blank segments stay within limits, and a street-level, street-facing facade located within 10 ft of the street lot line unless wider sidewalks or other approved spaces are provided; SMC 23.47A.005 limits residential uses to 20 percent of a street-level, street-facing facade in pedestrian-designated zones, NC1 zones and some other locations. Whether these apply to an ADU that sits behind another building, or to an attached ADU, depends on its design and location, which Permit Preflight cannot assess, so this is left for SDCI to confirm.",
    },
    citation: { smcSections: ["SMC 23.47A.005.C", "SMC 23.47A.008.A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [tc("EXCEPTION", "Depends on the design and location; stated, never assessed", undefined, "Design standards", "REQUIRES_VERIFICATION", { zoning: NC })],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-conversion-2026",
    subject: "Conversion of an existing accessory structure to a detached ADU in Neighborhood Commercial and Commercial 1 zones - permitted notwithstanding lot coverage and yard or setback provisions; structure existing before July 23, 2023; Housing Code minimum standards",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: {
      ruleType: AduRuleType.CONVERSION,
      existingBeforeDate: "2023-07-23",
      housingCodeFirstSection: "SMC 22.206.020",
      housingCodeLastSection: "SMC 22.206.140",
      waivesSetbacksAndLotCoverage: true,
      directorMayWaiveAndModify: true,
      heightNote: "the height mapped for the zone, SMC 23.47A.012",
    },
    citation: { smcSections: ["SMC 23.42.022.H.1", "SMC 23.42.022.H.2", "SMC 23.42.022.H.3.a", "SMC 23.42.022.H.3.b"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "what counts as an existing structure and an intact conversion", description: "Same treatment as the Neighborhood Residential and Lowrise conversion rules: the allowance is described only on the customer's declarations and always as REQUIRES_VERIFICATION; the height of the building is not collected; the Housing Code standards are cited and never assessed.", affectedConditionOrInterpretation: "SMC 23.42.022.H", sourceReferences: ["SMC 23.42.022.H"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "An intact conversion: siting is described, never asserted", CONVERSION_BASE, "Setbacks and lot coverage (conversion)", "REQUIRES_VERIFICATION", { zoning: NC }),
      tc("EXCEPTION", "Height of the converted building is left to SDCI, naming the mapped height", CONVERSION_BASE, "Height of the converted building", "REQUIRES_VERIFICATION", { zoning: C1 }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-comm-attached-2026",
    subject: "ADU inside or attached to the house in Neighborhood Commercial and Commercial 1 zones - may exceed 1,000 sq ft in a portion that existed before July 23, 2023; up to 250 sq ft of attached garage not counted",
    applicableProjectType: "adu",
    applicableZone: "NC,C1",
    ruleSpecification: { ruleType: AduRuleType.ATTACHED, capExemptionBeforeDate: "2023-07-23", attachedGarageExclusionSqFt: 250 },
    citation: { smcSections: ["SMC 23.42.022.D", "SMC 23.42.022.E", "SMC 23.42.022.G.2", "SMC 23.42.022.H.4"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "A 700 sq ft basement ADU: within the cap", ATTACHED_BASE, "ADU size limit", "KNOWN/PASS", { zoning: NC, appliedBy: "adu-comm-size-limit-2026" }),
      tc("EXCEPTION", "A 1,700 sq ft ADU in the part of the house declared to exist before the date: the cap may not apply (H.4)", { ...ATTACHED_BASE, attached: { grossFloorAreaSqFt: 1700, includesAddition: false, portionExistedBeforeJuly2023: true } }, "ADU size limit", "REQUIRES_VERIFICATION", { zoning: C1 }),
    ],
    isTestOnlyFixture: false,
  },
];

export const ADU_COMM_FIXED_ROW_IDS: Record<string, string> = Object.fromEntries(aduCommercialCandidates.map((c) => [c.id, mfRowId(c.id)]));
