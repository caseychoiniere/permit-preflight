/**
 * The eleven REAL Unit 11 (ADU) governance candidates (aidlc-docs/construction/unit-11-adus/). Real,
 * non-fixture content (`isTestOnlyFixture: false`), mirroring fence-candidates.ts. Every threshold the
 * evaluator uses lives on `ruleSpecification` here - `evaluate-adu.ts` contains no SMC number as a literal.
 *
 * All eleven are Tier 1: each is a numeric threshold in current code text (SMC 23.42.022 and the NR
 * development standards of chapter 23.44, as rewritten by Ordinance 127376 (2025)) with no Director
 * judgment or unresolved source conflict. The interpretive edges (averaged side setback, whether a
 * mapped building has floor area, ADUs counting toward the three-unit front setback, exclusion areas,
 * tree-based height and exemptions) are handled WITHOUT a rule claiming to resolve them: the evaluator
 * yields REQUIRES_VERIFICATION. These rows are advanced only to APPROVED by the unit's lifecycle script;
 * activation is a separate founder decision.
 *
 * Each declared test case is executed against the real evaluator by
 * tests/regulatory-rule-governance/adu-candidates.test.ts using THESE specifications.
 */

import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";

const BASIS =
  "Ordinance 127376 (2025): SMC 23.42.022 and chapter 23.44 as published on Municode Library (CURRENT) and read live 2026-10-08. SMC 23.44.041 and the pre-2025 ADU standards (3,200 sq ft lot minimum, rear-yard coverage cap, owner-occupancy) no longer exist; SDCI Tips 116A/B (2023) are outdated on zoning.";

const DECLARED_CAVEAT = {
  category: "declared input and mapped geometry, not a survey",
  description:
    "ADU size, height, stories, bedrooms and the existing unit counts are declared by the customer. Distances are measured from the footprint the customer placed on the map against the King County parcel polygon and Seattle Building Outlines (2023). Every finding says so; nothing is presented as surveyed.",
  affectedConditionOrInterpretation: "Accuracy of the declared and mapped inputs",
  sourceReferences: ["SMC 23.42.022", "SMC 23.44.090"],
  resolutionStatus: "Resolved by design - the report labels every conclusion as based on declared and mapped inputs.",
};

type ProjectOverrides = Record<string, unknown>;
type SiteOverrides = Record<string, unknown>;
export interface AduTestInput {
  project?: ProjectOverrides;
  site?: SiteOverrides;
}

/** `appliedBy` names the candidate whose rule the finding cites when it is not this row's own (a conversion case that exercises the setback or separation rule). */
function tc(kind: "POSITIVE" | "NEGATIVE" | "EXCEPTION", description: string, input: AduTestInput, subject: string, outcome: string, appliedBy?: string) {
  return { kind, description, input: input as Record<string, unknown>, expected: { subject, outcome, ...(appliedBy ? { appliedBy } : {}) } as Record<string, unknown> };
}

/** A conversion of a 400 sq ft existing building, 30 ft from the rear and 14 ft from the house: the baseline for conversion test cases. */
const CONVERSION_BASE = {
  aduType: "CONVERSION_EXISTING",
  widthFt: undefined,
  depthFt: undefined,
  heightFt: undefined,
  distanceToRearLotLineFt: 2,
  distanceToSideLotLineFt: 2,
  distanceToFrontLotLineFt: 80,
  distanceToDwellingFt: 14,
  conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: true },
};
const CONVERSION_INTACT: AduTestInput = { project: CONVERSION_BASE };

export const realAduCandidates: DraftedRuleInput[] = [
  {
    id: "adu-a1-count-and-density-2026",
    subject: "ADU count and density - at most 2 ADUs per lot; 1 dwelling unit per 1,250 sq ft of lot area (fractions over 0.85 round up); small-lot allowances; ADUs count",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: {
      ruleType: AduRuleType.COUNT_AND_DENSITY,
      maxAdusPerLot: 2,
      lotSqFtPerUnit: 1250,
      roundUpFractionOver: 0.85,
      smallLotMaxSqFt: 5000,
      smallLotMaxUnits: 4,
      midLotMaxSqFt: 7500,
      midLotMaxUnits: 6,
    },
    citation: { smcSections: ["SMC 23.42.022.C", "SMC 23.44.060.A.4", "SMC 23.44.060.C.1-C.3", "SMC 23.44.060.D.1", "SMC 23.44.060.D.5"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "excluded critical-area land",
        description:
          "Riparian corridors, wetlands and buffers, shoreline setbacks and steep-slope non-disturbance areas are not counted in the lot area for density, and the small-lot allowances require that the lot contain none of them. Seattle's critical-area maps are advisory and cannot show absence, so a result that depends on those allowances is REQUIRES_VERIFICATION; the lot area used is the whole parcel.",
        affectedConditionOrInterpretation: "SMC 23.44.060.C and D.6",
        sourceReferences: ["SMC 23.44.060.C.1", "SMC 23.44.060.D.6", "SMC 25.09.030.A"],
        resolutionStatus: "Resolved by design - REQUIRES_VERIFICATION whenever the result depends on the absence of excluded land.",
      },
    ],
    testCases: [
      tc("POSITIVE", "Existing house, no ADU, 6,000 sq ft lot: ADU number 1 is within the cap", { project: { existingAduCount: 0 } }, "Number of ADUs on the lot", "KNOWN/PASS"),
      tc("NEGATIVE", "Two ADUs already: a third exceeds the cap of 2", { project: { existingAduCount: 2 } }, "Number of ADUs on the lot", "KNOWN/FAIL"),
      tc("EXCEPTION", "A 3,000 sq ft lot with a house and one ADU makes 3 units: over 3,000/1,250 = 2.4 -> 2 allowed, but a lot under 5,000 sq ft may have 4 only if it holds no critical-area land", { project: { existingAduCount: 1 }, site: { parcelAreaSqFt: 3000 } }, "Dwelling units allowed on the lot (density)", "REQUIRES_VERIFICATION"),
      tc("POSITIVE", "6,000 sq ft lot, house plus ADU: 2 units, 4 allowed by area", { site: { parcelAreaSqFt: 6000 } }, "Dwelling units allowed on the lot (density)", "KNOWN/PASS"),
      tc("NEGATIVE", "8,000 sq ft lot already holding 6 units: a seventh is over the formula and over every allowance", { project: { existingPrincipalDwellingUnits: 6, existingAduCount: 0 }, site: { parcelAreaSqFt: 8000 } }, "Dwelling units allowed on the lot (density)", "KNOWN/FAIL"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a2-size-limit-2026",
    subject: "ADU gross floor area - 1,000 sq ft (up to two bedrooms) or 1,200 sq ft (three or more); up to 35 sq ft of long-term bicycle parking not counted",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType: AduRuleType.SIZE_LIMIT, maxSqFtUpToTwoBedrooms: 1000, maxSqFtThreePlusBedrooms: 1200, bikeParkingExclusionSqFt: 35 },
    citation: { smcSections: ["SMC 23.42.022.G.1.a", "SMC 23.42.022.G.1.b", "SMC 23.42.022.G.2.c"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "floor-area estimate",
        description:
          "Gross floor area is estimated as the declared footprint times the declared above-ground stories. Underground stories, which the code does not count, are not part of the estimate. The 1,500 sq ft allowance for income-restricted lots in a frequent transit service area, and the allowance for an existing attached portion, are not evaluated.",
        affectedConditionOrInterpretation: "SMC 23.42.022.G.1.c and H.4",
        sourceReferences: ["SMC 23.42.022.G", "SMC 23.42.022.H.4"],
        resolutionStatus: "Resolved by design - the estimate is stated as an estimate; a result within 35 sq ft over the cap is REQUIRES_VERIFICATION.",
      },
    ],
    testCases: [
      tc("POSITIVE", "20 x 25 ft, one story, one bedroom = 500 sq ft", { project: { widthFt: 20, depthFt: 25, stories: 1, bedrooms: 1 } }, "ADU size limit", "KNOWN/PASS"),
      tc("NEGATIVE", "25 x 25 ft, two stories, two bedrooms = 1,250 sq ft over 1,000", { project: { widthFt: 25, depthFt: 25, stories: 2, bedrooms: 2 } }, "ADU size limit", "KNOWN/FAIL"),
      tc("EXCEPTION", "1,030 sq ft: within the 35 sq ft bicycle-parking exclusion of the cap", { project: { widthFt: 20, depthFt: 51.5, stories: 1, bedrooms: 2 } }, "ADU size limit", "REQUIRES_VERIFICATION"),
      tc("POSITIVE", "Three bedrooms: 1,100 sq ft is within the 1,200 cap", { project: { widthFt: 25, depthFt: 22, stories: 2, bedrooms: 3 } }, "ADU size limit", "KNOWN/PASS"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a3-setbacks-2026",
    subject: "ADU setbacks - rear 5 ft (none at an alley); side 5 ft average / 3 ft minimum (3 ft on lots under 5,000 sq ft in a frequent transit service area); front 15 ft (10 ft for 3+ units)",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType: AduRuleType.SETBACKS, rearFt: 5, rearAlleyFt: 0, sideAverageFt: 5, sideMinFt: 3, smallLotSideFt: 3, smallLotAreaSqFt: 5000, frontFt: 15, frontThreeOrMoreUnitsFt: 10, mappingToleranceFt: 2 },
    citation: { smcSections: ["SMC 23.44.090.A (Table A and footnote 3)", "SMC 23.44.090.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "mapping accuracy margin",
        description:
          "Distances are measured from King County's parcel polygon, which Seattle and the County describe as general mapping, not a survey. This rule is therefore approved to accept GENERAL_LOCATION_ONLY geometry only together with a product margin (mappingToleranceFt, 2 ft): a distance within the margin of a threshold is REQUIRES_VERIFICATION, and only a distance clearly beyond it is a definite PASS or FAIL. The margin is a conservative product choice, not a statement about the accuracy of the source.",
        affectedConditionOrInterpretation: "How close to a line a mapped distance can be before it stops being definite",
        sourceReferences: ["King County parcel polygon quality caveat (property-intelligence)", "BR-U2-10"],
        resolutionStatus: "Resolved by design - REQUIRES_VERIFICATION inside the margin; the report names the margin.",
      },
      {
        category: "averaged side setback; role of lot lines; unit count",
        description:
          "The 5 ft side setback is an average, with a 3 ft minimum; a nearest-distance measurement meeting 5 ft satisfies both, one between 3 and 5 ft is REQUIRES_VERIFICATION, and one under 3 ft fails. The front setback is 10 ft when the lot has three or more dwelling units; whether ADUs count toward the three is SDCI's call, so a distance between 10 and 15 ft on a three-unit lot is REQUIRES_VERIFICATION. Corner and through lots (SMC 23.44.090.B, SMC 23.84A.024) are never resolved from the parcel shape alone and are REQUIRES_VERIFICATION. A rear lot line abutting an alley has no setback.",
        affectedConditionOrInterpretation: "Table A side average; front units; through and corner lots",
        sourceReferences: ["SMC 23.44.090 Table A", "SMC 23.44.090.B", "SMC 23.84A.024"],
        resolutionStatus: "Resolved by design - every uncertain case is REQUIRES_VERIFICATION; no PASS or FAIL rests on the unresolved reading.",
      },
    ],
    testCases: [
      tc("POSITIVE", "20 ft from the rear lot line", { project: { distanceToRearLotLineFt: 20 } }, "ADU rear setback", "KNOWN/PASS"),
      tc("NEGATIVE", "1 ft from the rear lot line", { project: { distanceToRearLotLineFt: 1 } }, "ADU rear setback", "KNOWN/FAIL"),
      tc("EXCEPTION", "6 ft from the rear lot line is within the 2 ft mapping margin of the 5 ft setback", { project: { distanceToRearLotLineFt: 6 } }, "ADU rear setback", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "0 ft from an alley rear lot line meets the alley exception", { project: { alleyAdjacent: true, distanceToRearLotLineFt: 0 } }, "ADU rear setback", "KNOWN/PASS"),
      tc("POSITIVE", "8 ft from the nearest side lot line", { project: { distanceToSideLotLineFt: 8 } }, "ADU side setback", "KNOWN/PASS"),
      tc("NEGATIVE", "0.5 ft from the nearest side lot line", { project: { distanceToSideLotLineFt: 0.5 } }, "ADU side setback", "KNOWN/FAIL"),
      tc("EXCEPTION", "4 ft from a side lot line: meets the 3 ft minimum, but the 5 ft average depends on the wall", { project: { distanceToSideLotLineFt: 4 } }, "ADU side setback", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "6 ft from a side lot line on a small lot in a frequent transit service area: only the 3 ft minimum applies", { project: { distanceToSideLotLineFt: 6 }, site: { parcelAreaSqFt: 4000, inFrequentTransitServiceArea: true } }, "ADU side setback", "KNOWN/PASS"),
      tc("POSITIVE", "60 ft from the front lot line", { project: { distanceToFrontLotLineFt: 60 } }, "ADU front setback", "KNOWN/PASS"),
      tc("NEGATIVE", "8 ft from the front lot line", { project: { distanceToFrontLotLineFt: 8 } }, "ADU front setback", "KNOWN/FAIL"),
      tc("EXCEPTION", "12 ft from the front lot line with three dwelling units on the lot", { project: { existingAduCount: 1, distanceToFrontLotLineFt: 12 } }, "ADU front setback", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a4-separation-2026",
    subject: "Separation between structures containing floor area - 5 ft minimum",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType: AduRuleType.SEPARATION, minFt: 5, mappingToleranceFt: 2 },
    citation: { smcSections: ["SMC 23.44.100.A", "SMC 23.44.100.C"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "mapping accuracy margin",
        description: "Same margin as the setbacks rule (mappingToleranceFt, 2 ft): a separation within 2 ft of 5 ft is REQUIRES_VERIFICATION because it is measured between a mapped building outline and the customer's placed footprint.",
        affectedConditionOrInterpretation: "Reliability of a measured separation near the threshold",
        sourceReferences: ["Seattle Building Outlines 2023 quality caveat (property-intelligence)", "BR-U2-10"],
        resolutionStatus: "Resolved by design.",
      },
      {
        category: "structures containing floor area",
        description:
          "The 5 ft separation applies between structures containing floor area. The existing house the customer selects on the map is measured as a dwelling; another mapped building (a garage or shed) may or may not contain floor area, so a nearby one is REQUIRES_VERIFICATION. Eaves may project 2 ft into the separation (not modeled; the footprint is the wall footprint).",
        affectedConditionOrInterpretation: "Which mapped buildings contain floor area",
        sourceReferences: ["SMC 23.44.100.A", "SMC 23.44.100.C"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "12 ft from the existing house", { project: { distanceToDwellingFt: 12 } }, "Separation from the existing dwelling", "KNOWN/PASS"),
      tc("NEGATIVE", "1.5 ft from the existing house", { project: { distanceToDwellingFt: 1.5 } }, "Separation from the existing dwelling", "KNOWN/FAIL"),
      tc("EXCEPTION", "Exactly 5 ft from the existing house is inside the 2 ft mapping margin", { project: { distanceToDwellingFt: 5 } }, "Separation from the existing dwelling", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "7 ft from the existing house clears the margin", { project: { distanceToDwellingFt: 7 } }, "Separation from the existing dwelling", "KNOWN/PASS"),
      tc("EXCEPTION", "A nearby mapped building 2 ft from the ADU", { project: { distanceToDwellingFt: 12, nearestOtherStructure: { distanceFt: 2, areaSqFt: 200 } } }, "Separation from other mapped structures", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a5-height-2026",
    subject: "ADU height - 32 ft (42 ft with tree retention); pitched-roof ridge may rise 5 ft above",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType: AduRuleType.HEIGHT, maxFt: 32, treeRetentionMaxFt: 42, pitchedRoofRidgeAllowanceFt: 5 },
    citation: { smcSections: ["SMC 23.44.070.A.1", "SMC 23.44.070.A.2.d", "SMC 23.44.070.B.1"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "height measurement and exceptions",
        description:
          "Height is declared and not measured; the 42 ft tree-based limit and the pitched-roof ridge allowance depend on facts the product does not determine, so a declared height over 32 ft and within 47 ft is REQUIRES_VERIFICATION. The separate 12 ft limit for accessory structures in required setbacks does not bind an ADU placed at or beyond its required setbacks.",
        affectedConditionOrInterpretation: "SMC 23.44.070.A.2, A.3, B",
        sourceReferences: ["SMC 23.44.070.A", "SMC 23.44.070.B"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "16 ft tall", { project: { heightFt: 16 } }, "ADU height", "KNOWN/PASS"),
      tc("NEGATIVE", "50 ft tall: over even 42 + 5", { project: { heightFt: 50 } }, "ADU height", "KNOWN/FAIL"),
      tc("EXCEPTION", "35 ft tall: over 32, within what tree retention or a pitched roof could allow", { project: { heightFt: 35 } }, "ADU height", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a6-lot-coverage-2026",
    subject: "Lot coverage - 50% of the lot area (critical-area land excluded from the lot area)",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType: AduRuleType.LOT_COVERAGE, maxPercent: 50 },
    citation: { smcSections: ["SMC 23.44.080.A", "SMC 23.44.080.B", "SMC 23.44.080.C", "SMC 23.44.080.D"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "mapped existing coverage and unresolved denominator",
        description:
          "Existing coverage is the sum of Seattle Building Outlines (2023) footprints, which can differ from what counts (eaves under 36 inches and decks 36 inches or lower are not counted; outlines may include non-counting roofs). Excluded critical-area land (SMC 23.44.080.B) can only shrink the denominator and cannot be established from advisory maps, so the calculation is the same bounded tolerance model used for sheds (Unit 6B): a result that appears over the limit is REQUIRES_VERIFICATION, never a KNOWN FAIL.",
        affectedConditionOrInterpretation: "Existing coverage accuracy; excluded lot area",
        sourceReferences: ["SMC 23.44.080.B", "SMC 23.44.080.C", "SMC 25.09.030.A"],
        resolutionStatus: "Resolved by design - only an in-limit result is KNOWN; everything else is REQUIRES_VERIFICATION with the tolerance stated.",
      },
    ],
    testCases: [
      tc("POSITIVE", "6,000 sq ft lot, 1,500 sq ft existing, 400 sq ft ADU = 32%", { site: { parcelAreaSqFt: 6000, existingMappedCoverageSqFt: 1500 } }, "Lot coverage", "REQUIRES_VERIFICATION"),
      tc("NEGATIVE", "4,000 sq ft lot, 2,300 sq ft existing, 400 sq ft ADU = 67%: over even the most generous reading, still REQUIRES_VERIFICATION because the denominator is unresolved", { site: { parcelAreaSqFt: 4000, existingMappedCoverageSqFt: 2300 } }, "Lot coverage", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "Existing coverage unavailable", { site: { parcelAreaSqFt: 6000, existingMappedCoverageSqFt: undefined } }, "Lot coverage", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a7-floor-area-ratio-2026",
    subject: "Floor area ratio - 0.6 / 0.8 / 1.0 / 1.6 by density including ADUs; lots under 5,000 sq ft may have at least 2,500 sq ft",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: {
      ruleType: AduRuleType.FLOOR_AREA_RATIO,
      bands: [
        { overSqFtPerUnit: 4000, far: 0.6 },
        { overSqFtPerUnit: 2200, far: 0.8 },
        { overSqFtPerUnit: 1600, far: 1.0 },
      ],
      denserFar: 1.6,
      smallLotAreaSqFt: 5000,
      smallLotMinChargeableSqFt: 2500,
    },
    citation: { smcSections: ["SMC 23.44.050.B (Table A)", "SMC 23.44.050.C", "SMC 23.44.060.D.5"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "declared existing floor area; higher limits for stacked or school-adjacent development",
        description:
          "The existing chargeable floor area of all structures is declared by the customer (exempt underground floors and portions of a story no more than 4 ft above grade should be excluded) and is never inferred. The higher limits for stacked dwelling units and the 1.0/1.2 option for developments near schools (SMC 23.44.050.D, E) do not apply to a detached ADU and are not evaluated. A result over the limit rests on the declared figure and is therefore REQUIRES_VERIFICATION, never a KNOWN FAIL.",
        affectedConditionOrInterpretation: "Existing chargeable floor area",
        sourceReferences: ["SMC 23.44.050.B", "SMC 23.44.050.C"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "6,000 sq ft lot, 2 units (3,000 sq ft per unit: 0.8 band, 4,800 sq ft), 2,000 existing + 400 ADU", { site: { parcelAreaSqFt: 6000 }, project: { existingChargeableFloorAreaSqFt: 2000 } }, "Floor area ratio (FAR)", "KNOWN/PASS"),
      tc("NEGATIVE", "6,000 sq ft lot, 4,700 existing + 400 ADU over the 4,800 limit", { site: { parcelAreaSqFt: 6000 }, project: { existingChargeableFloorAreaSqFt: 4700 } }, "Floor area ratio (FAR)", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "Existing floor area not provided", { site: { parcelAreaSqFt: 6000 }, project: { existingChargeableFloorAreaSqFt: undefined } }, "Floor area ratio (FAR)", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "3,000 sq ft lot (small-lot 2,500 sq ft floor beats 0.8 x 3,000 / the 1.0 band)", { site: { parcelAreaSqFt: 3000 }, project: { existingChargeableFloorAreaSqFt: 1800 } }, "Floor area ratio (FAR)", "KNOWN/PASS"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a8-amenity-area-2026",
    subject: "Amenity area - 20% of the lot area (at least 120 sq ft, 8 ft); none for one new unit added to a dwelling that existed on Jan 1, 1982",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType: AduRuleType.AMENITY_AREA, requiredFractionOfLot: 0.2, minSqFt: 120, minDimensionFt: 8 },
    citation: { smcSections: ["SMC 23.44.110.A", "SMC 23.44.110.E", "SMC 23.44.110.H"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "site-plan dependent",
        description:
          "Whether a site plan provides the amenity area cannot be known at screening, so the requirement is always REQUIRES_VERIFICATION unless the pre-1982 exemption applies on the customer's declaration (a single house built before 1982 with no other ADU). The tree-based exemption (SMC 23.44.110.H.2) is named but not evaluated.",
        affectedConditionOrInterpretation: "SMC 23.44.110.H",
        sourceReferences: ["SMC 23.44.110.H.1", "SMC 23.44.110.H.2"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "Single house built before 1982, no ADU yet: exempt", { project: { existingHouseBuiltBefore1982: true, existingAduCount: 0, existingPrincipalDwellingUnits: 1 } }, "Amenity area", "KNOWN/PASS"),
      tc("NEGATIVE", "House built in 1995: the requirement applies and depends on the site plan", { project: { existingHouseBuiltBefore1982: false } }, "Amenity area", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "Pre-1982 house that already has an ADU: the exemption covers only one added unit", { project: { existingHouseBuiltBefore1982: true, existingAduCount: 1 } }, "Amenity area", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a9-trees-2026",
    subject: "Trees - tree points by density (1 point per 500 / 600 / 675 / 750 sq ft) or one new tree per 2,500 sq ft, whichever is greater",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: {
      ruleType: AduRuleType.TREES,
      bands: [
        { overSqFtPerUnit: 4000, sqFtPerPoint: 500 },
        { overSqFtPerUnit: 2200, sqFtPerPoint: 600 },
        { overSqFtPerUnit: 1600, sqFtPerPoint: 675 },
      ],
      denserSqFtPerPoint: 750,
      lotSqFtPerNewTree: 2500,
    },
    citation: { smcSections: ["SMC 23.44.120.A (Table A)", "SMC 23.44.120.B (Table B)"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "site-dependent",
        description: "Whether existing and planned trees reach the required points cannot be known at screening. The requirement is stated with its computed number and is always REQUIRES_VERIFICATION. Lot area for this standard excludes submerged lands (not modeled).",
        affectedConditionOrInterpretation: "SMC 23.44.120 point totals",
        sourceReferences: ["SMC 23.44.120.A", "SMC 23.44.120.B"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "6,000 sq ft lot with 2 units: 3,000 sq ft per unit (600 sq ft per point) = 10 points", { site: { parcelAreaSqFt: 6000 } }, "Tree requirement", "REQUIRES_VERIFICATION"),
      tc("NEGATIVE", "No lot area available", { site: { parcelAreaSqFt: undefined } }, "Tree requirement", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "Dense lot with 3 units on 4,000 sq ft (1,333 sq ft per unit = 750 sq ft per point)", { project: { existingAduCount: 1 }, site: { parcelAreaSqFt: 4000 } }, "Tree requirement", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a10-design-standards-2026",
    subject: "Design standards - 3 ft pedestrian path; within 40 ft of a street: street-facing entry with 3 x 3 ft weather protection and 20% windows and doors",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType: AduRuleType.DESIGN_STANDARDS, pedestrianAccessMinWidthFt: 3, streetFacingWithinFt: 40, weatherProtectionFt: 3, facadeOpeningsPercent: 20 },
    citation: { smcSections: ["SMC 23.44.140.A.2", "SMC 23.44.140.C", "SMC 23.44.140.D", "SMC 23.44.140.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "design dependent",
        description: "These standards depend on the customer's design and are listed with whether the distance trigger applies; they are always REQUIRES_VERIFICATION. A shared access easement serving ten or more homes, and streets other than the indicated front line, can change the trigger and are not evaluated.",
        affectedConditionOrInterpretation: "SMC 23.44.140",
        sourceReferences: ["SMC 23.44.140"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "ADU 60 ft from the front lot line: the street-facing rules do not apply on that basis", { project: { distanceToFrontLotLineFt: 60 } }, "Design standards (pedestrian access, street-facing entry)", "REQUIRES_VERIFICATION"),
      tc("NEGATIVE", "ADU 25 ft from the street: the street-facing entry and window rules apply", { project: { distanceToFrontLotLineFt: 25 } }, "Design standards (pedestrian access, street-facing entry)", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "No front distance available", { project: { distanceToFrontLotLineFt: undefined } }, "Design standards (pedestrian access, street-facing entry)", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-a11-conversion-2026",
    subject: "Conversion of an existing accessory structure to a detached ADU - permitted notwithstanding lot coverage and yard or setback provisions; structure existing before July 23, 2023; Housing Code minimum standards (SMC 22.206.020-.140)",
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: {
      ruleType: AduRuleType.CONVERSION,
      existingBeforeDate: "2023-07-23",
      housingCodeFirstSection: "SMC 22.206.020",
      housingCodeLastSection: "SMC 22.206.140",
      waivesSetbacksAndLotCoverage: true,
      directorMayWaiveAndModify: true,
    },
    citation: { smcSections: ["SMC 23.42.022.H.1", "SMC 23.42.022.H.2", "SMC 23.42.022.H.3.a", "SMC 23.42.022.H.3.b", "SMC 23.44.140.A.1"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      {
        category: "what counts as an existing structure and an intact conversion",
        description:
          "The allowance covers an accessory structure that existed before July 23, 2023 (or was replaced to the same configuration) and a conversion that keeps, adds to, alters or rebuilds it, provided any expansion or relocation meets the ADU and zone standards (H.1). Permit Preflight cannot verify when a building was built (Seattle's building outlines are a 2023 map, not a permit history) or what the conversion would change, so the allowance is described only on the customer's declaration that the building existed before the date and the footprint and height are kept, and always as REQUIRES_VERIFICATION (never a KNOWN fact). A declaration that it did not exist before the date applies the new-ADU standards to the building; a planned expansion or relocation leaves the existing building covered as it stands and the changed part unmeasured (no future geometry is collected), so coverage and floor-area results are never definite; rebuilding in place at the same footprint and height counts as keeping it (H.1).",
        affectedConditionOrInterpretation: "SMC 23.42.022.H.1-H.3",
        sourceReferences: ["SMC 23.42.022.H.1", "SMC 23.42.022.H.2", "SMC 23.42.022.H.3.b"],
        resolutionStatus: "Resolved by design - the allowance is never asserted without both declarations, and existence on the date is always left to SDCI.",
      },
      {
        category: "separation, design standards and the Housing Code",
        description:
          "H.3.b names lot coverage and yard or setback provisions only, so the 5 ft separation between structures (SMC 23.44.100) is never reported as a known failure for a conversion (REQUIRES_VERIFICATION, noting the Director's Type I waiver authority in H.3.a). SMC 23.44.140.A.1 excludes new dwelling units added within existing structures from the design standards, which an intact conversion appears to fall under (REQUIRES_VERIFICATION). The allowance names lot coverage and yard or setback provisions, not height, so the converted building's height is left to SDCI (REQUIRES_VERIFICATION). The Housing Code minimum standards (SMC 22.206.020 through 22.206.140) are cited and never assessed or characterized.",
        affectedConditionOrInterpretation: "Separation; design standards; habitability",
        sourceReferences: ["SMC 23.42.022.H.3.a", "SMC 23.44.100.A", "SMC 23.44.140.A.1", "SMC 22.206.020-22.206.140"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: [
      tc("POSITIVE", "An intact conversion of a building declared to exist before the date: siting is described as outside the setbacks and coverage limit, but only ever as REQUIRES_VERIFICATION (SDCI confirms the building legally existed)", CONVERSION_INTACT, "Setbacks and lot coverage (conversion)", "REQUIRES_VERIFICATION"),
      tc("NEGATIVE", "A building declared not to exist before the date: the allowance does not apply and the new-ADU standards are applied to it (1 ft from the rear lot line is clearly short of 5 ft)", { project: { ...CONVERSION_BASE, distanceToRearLotLineFt: 1, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: false, keepsFootprintAndHeight: true } } }, "ADU rear setback", "KNOWN/FAIL", "adu-a3-setbacks-2026"),
      tc("NEGATIVE", "The same building: the eligibility finding itself says the allowance does not apply", { project: { ...CONVERSION_BASE, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: false, keepsFootprintAndHeight: true } } }, "Conversion of an existing accessory structure", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "Unsure whether the building existed: the allowance is not asserted and no standard setback is applied", { project: { ...CONVERSION_BASE, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: undefined, keepsFootprintAndHeight: true } } }, "Setbacks and lot coverage (conversion)", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "An addition or relocation is planned: the existing building is covered as it stands, the added part is not measured, and the lot-coverage figure is never a definite result", { project: { ...CONVERSION_BASE, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: false } } }, "Lot coverage", "REQUIRES_VERIFICATION", "adu-a6-lot-coverage-2026"),
      tc("EXCEPTION", "The allowance names lot coverage and setbacks, not height: the converted building's height is always left to SDCI", CONVERSION_INTACT, "Height of the converted building", "REQUIRES_VERIFICATION"),
      tc("POSITIVE", "The Housing Code minimum standards are always disclosed, never assessed", CONVERSION_INTACT, "Minimum housing standards for the converted building", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "A building next to the house (1.5 ft) is not a known separation failure for a conversion", { project: { ...CONVERSION_BASE, distanceToDwellingFt: 1.5 } }, "Separation from the existing dwelling", "REQUIRES_VERIFICATION", "adu-a4-separation-2026"),
      tc("EXCEPTION", "A selected building that cannot be matched to a mapped building cannot be evaluated", { project: { ...CONVERSION_BASE, conversion: { structureNotMatchedReason: "it is not among the mapped buildings on this parcel.", existedBeforeJuly2023: true, keepsFootprintAndHeight: true } } }, "Building to convert", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
];

export function tierForRealAduCandidate(_candidateId: string): "TIER_1" {
  return "TIER_1";
}

/** Fixed row UUIDs (generated once, committed, never regenerated). */
export const ADU_FIXED_ROW_IDS: Record<string, string> = {
  "adu-a1-count-and-density-2026": "fc10135a-4f56-43bc-88d4-1ad9f86c57ab",
  "adu-a2-size-limit-2026": "423a4551-3298-41a8-bcd7-bf013b1c7e2b",
  "adu-a3-setbacks-2026": "4275a4ae-0061-44a7-aa50-a1079858db15",
  "adu-a4-separation-2026": "57e9d486-ff97-41d4-9dda-eb1d69069b4c",
  "adu-a5-height-2026": "96428f02-ccdb-4a4f-9295-6021340b245c",
  "adu-a6-lot-coverage-2026": "ac7e89ba-08b9-42c5-875d-d6235f539e7f",
  "adu-a7-floor-area-ratio-2026": "d08e8dc3-f870-4922-a90d-c9d8c7efb14a",
  "adu-a8-amenity-area-2026": "02b91d3b-ce12-442a-b41e-48126b5c31c7",
  "adu-a9-trees-2026": "668700bc-5096-4130-b01f-867cacebefb4",
  "adu-a10-design-standards-2026": "de3dc5b6-81fc-449b-966a-4176f2858d1d",
  "adu-a11-conversion-2026": "364c39eb-6cea-4398-80ee-c0a867d88de7",
};
