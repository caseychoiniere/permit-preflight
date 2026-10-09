/**
 * REAL governance candidates for ADUs in MIDRISE (MR) and HIGHRISE (HR) zones (2026-10-09). Content is current Seattle code read live from Municode (version Sep 25 2026,
 * Ord. 127376): SMC 23.42.022 (applies in every zone where housing is allowed: unit count, size, conversions, attached ADUs; E: "Unless otherwise provided in the standards
 * of the underlying zone, accessory dwelling units shall be subject to the same standards as principal dwelling units") and SMC Chapter 23.45 for the zone's standards:
 *  - 23.45.518.B and Table B (MR setbacks: front and street side 7 ft average / 5 ft minimum; rear 15 ft, 10 ft at an alley; interior side 7 average / 5 minimum for portions up
 *    to 42 ft, 10 / 7 above; 23.45.518.C: HR structures of 85 ft or less follow the MR setbacks) - an ADU is outside the accessory-structure allowance of 23.45.518.H.1,
 *  - 23.45.514.B and Table B (height: MR 80 ft, 60 ft without an MHA suffix; HR 440 ft), 23.45.514.I (rooftop features 4 ft),
 *  - 23.45.519.A (5 ft between structures containing floor area: LR and MR zones ONLY - Highrise has no such requirement),
 *  - 23.45.510 (floor area ratio: MR 4.5 or 3.2 without MHA; HR base 7, more only through 23.45.516 and Chapter 23.58A; no lot-coverage limit, no density-by-lot-area limit),
 *  - 23.45.522 (amenity area: 5% of the gross floor area of a residential structure in MR and HR; private areas at least 60 sq ft and 6 ft; none for one unit added to a
 *    residential structure existing as of January 1, 1982), 23.45.524 (Green Factor 0.5 only for more than one new unit; street trees), 23.45.529 (design standards, chapter-wide).
 * Not screened (stated, never assessed): the MR structure depth limit on lots over 9,000 sq ft (23.45.528, principal structures), HR upper-level standards (23.45.520) and
 * the MR (M1) University District provisions (23.45.509). Each row is Tier 1; every interpretive edge is REQUIRES_VERIFICATION. Lifecycle script advances to APPROVED.
 */
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";
import { ATTACHED_BASE, BASIS, CONVERSION_BASE, DECLARED_CAVEAT, tc } from "./multifamily-adu-candidates.js";
import { mfRowId } from "./multifamily-candidates.js";

const ZONING_CAVEAT = {
  category: "zone designation is general mapping",
  description: "The zone comes from Seattle's published zoning layer (general mapping, not a legal determination). The MHA suffix decides the Midrise height and floor-area figures; an unrecognized suffix leaves those claims unscreened. Overlay provisions (SMC 23.45.509, for example the MR (M1) University District provisions) and the standards for larger developments (23.45.520, 23.45.528) are not applied.",
  affectedConditionOrInterpretation: "Which Midrise or Highrise standards apply",
  sourceReferences: ["Seattle GIS Current Land Use Zoning Detail", "SMC 23.45.502", "SMC 23.45.509"],
  resolutionStatus: "Resolved by design.",
};

const FAR_VARIANTS = [
  { token: "MR:MHA", example: "MR (M1)", slug: "mr-mha", far: 4.5, zoneText: "A Midrise (MR) zone with a mandatory housing affordability (MHA) suffix" },
  { token: "MR:NO_MHA", example: "MR", slug: "mr-nomha", far: 3.2, zoneText: "A Midrise (MR) zone without an MHA suffix" },
  {
    token: "HR",
    example: "HR (M)",
    slug: "hr",
    far: 7,
    zoneText: "A Highrise (HR) zone",
    conditionText: "The figure is the base FAR; extra residential floor area up to a maximum FAR of 15 can be gained only through the incentives of SMC 23.45.516 and Chapter 23.58A.",
  },
];
const HEIGHT_VARIANTS = [
  { token: "MR:MHA", example: "MR (M1)", slug: "mr-mha", maxFt: 80, higherText: "The Midrise structure height limit is 80 ft (SMC 23.45.514 Table B)" },
  { token: "MR:NO_MHA", example: "MR", slug: "mr-nomha", maxFt: 60, higherText: "The Midrise structure height limit without an MHA suffix is 60 ft (SMC 23.45.514 Table B footnote 1)" },
  { token: "HR", example: "HR (M)", slug: "hr", maxFt: 440, higherText: "The Highrise structure height limit is 440 ft (SMC 23.45.514 Table B)" },
];

export const aduMrHrCandidates: DraftedRuleInput[] = [
  {
    id: "adu-mrhr-count-2026",
    subject: "ADU count in Midrise and Highrise zones - at most two ADUs per lot; no dwelling-unit density limit by lot area",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: {
      ruleType: AduRuleType.MF_COUNT,
      maxAdusPerLot: 2,
      noDensityLimitText:
        "Midrise and Highrise zones have no limit on the number of dwelling units by lot area; the floor area ratio limit (SMC 23.45.510) governs how much can be built instead, and ADUs count with the principal dwelling units when density is calculated (SMC 23.42.022.J).",
    },
    citation: { smcSections: ["SMC 23.42.022.C", "SMC 23.42.022.J", "SMC 23.45.510"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "No ADU yet: this would be the first", undefined, "Number of ADUs on the lot", "KNOWN/PASS", { zoning: "MR (M1)" }),
      tc("NEGATIVE", "Two ADUs already: this would be the third", { existingAduCount: 2 }, "Number of ADUs on the lot", "KNOWN/FAIL", { zoning: "HR (M)" }),
      tc("POSITIVE", "No density limit by lot area is stated", undefined, "Dwelling units allowed on the lot (density)", "KNOWN/PASS", { zoning: "MR" }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mrhr-size-limit-2026",
    subject: "ADU gross floor area in Midrise and Highrise zones - 1,000 sq ft (up to two bedrooms) or 1,200 sq ft (three or more); the 1,500 sq ft cap applies only in Lowrise zones",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: { ruleType: AduRuleType.SIZE_LIMIT, maxSqFtUpToTwoBedrooms: 1000, maxSqFtThreePlusBedrooms: 1200, bikeParkingExclusionSqFt: 35 },
    citation: { smcSections: ["SMC 23.42.022.G.1", "SMC 23.42.022.G.2"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "20 x 20 ft one-story ADU, 400 sq ft", undefined, "ADU size limit", "KNOWN/PASS", { zoning: "MR (M1)" }),
      tc("NEGATIVE", "A 1,300 sq ft two-bedroom ADU is over 1,000 sq ft (no extended cap outside Lowrise)", { widthFt: 30, depthFt: 22, stories: 2, bedrooms: 2 }, "ADU size limit", "KNOWN/FAIL", { zoning: "HR (M)" }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mrhr-setbacks-2026",
    subject: "ADU setbacks in Midrise and Highrise zones - the principal-structure setbacks: front 7 ft average / 5 ft minimum, rear 15 ft (10 ft at an alley), interior side 7 ft average / 5 ft minimum (structures up to 42 ft)",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: {
      ruleType: AduRuleType.SETBACKS,
      rearFt: 15,
      rearAlleyFt: 10,
      sideAverageFt: 7,
      sideMinFt: 5,
      smallLotSideFt: 5,
      smallLotAreaSqFt: 1,
      frontFt: 7,
      frontMinFt: 5,
      frontThreeOrMoreUnitsFt: 7,
      mappingToleranceFt: 2,
      citation: "SMC 23.45.518 Table B",
      rearAlleyCitation: "SMC 23.45.518 Table B",
      tableMaxHeightFt: 42,
      tallerStructureText:
        "The Midrise setback table (SMC 23.45.518.B, which Highrise structures of 85 ft or less also follow) requires a larger side setback for portions of a structure above 42 ft (10 ft average, 7 ft minimum), upper-level setbacks apply on narrow streets, and Highrise structures over 85 ft follow a different table, so the setbacks of an ADU taller than 42 ft are not given a definite result.",
    },
    citation: { smcSections: ["SMC 23.45.518.B", "SMC 23.45.518 Table B", "SMC 23.45.518.C", "SMC 23.45.518.D", "SMC 23.42.022.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      DECLARED_CAVEAT,
      ZONING_CAVEAT,
      { category: "courtyard and average setbacks", description: "A front or street-side setback of 7 ft average / 5 ft minimum, and no setback at all if an at-grade courtyard meeting Exhibit A is provided; the courtyard is not known, so a distance between 5 ft and 7 ft (or within the 2 ft mapping margin) is REQUIRES_VERIFICATION and only a distance clearly short of 5 ft fails. The 15 ft rear setback (10 ft at an alley) is a single figure: clearly short fails, clearly beyond passes. Accessory-structure allowances in setbacks (SMC 23.45.518.H.1) do not extend to ADUs.", affectedConditionOrInterpretation: "SMC 23.45.518 Table B", sourceReferences: ["SMC 23.45.518"], resolutionStatus: "Resolved by design." },
    ],
    testCases: [
      tc("POSITIVE", "30 ft from the rear lot line", { distanceToRearLotLineFt: 30 }, "ADU rear setback", "KNOWN/PASS", { zoning: "MR (M1)" }),
      tc("NEGATIVE", "6 ft from the rear lot line: under the 15 ft rear setback", { distanceToRearLotLineFt: 6 }, "ADU rear setback", "KNOWN/FAIL", { zoning: "MR" }),
      tc("BOUNDARY", "14 ft from the rear lot line: inside the 2 ft margin of 15 ft", { distanceToRearLotLineFt: 14 }, "ADU rear setback", "REQUIRES_VERIFICATION", { zoning: "MR" }),
      tc("EXCEPTION", "11 ft at an alley (10 ft required)", { alleyAdjacent: true, distanceToRearLotLineFt: 11 }, "ADU rear setback", "REQUIRES_VERIFICATION", { zoning: "MR" }),
      tc("POSITIVE", "12 ft from the nearest side lot line", { distanceToSideLotLineFt: 12 }, "ADU side setback", "KNOWN/PASS", { zoning: "HR (M)" }),
      tc("NEGATIVE", "2 ft from the nearest side lot line", { distanceToSideLotLineFt: 2 }, "ADU side setback", "KNOWN/FAIL", { zoning: "HR (M)" }),
      tc("BOUNDARY", "6 ft from the side lot line: above the 5 ft minimum, under the 7 ft average", { distanceToSideLotLineFt: 6 }, "ADU side setback", "REQUIRES_VERIFICATION", { zoning: "MR" }),
      tc("POSITIVE", "70 ft from the front lot line", { distanceToFrontLotLineFt: 70 }, "ADU front setback", "KNOWN/PASS", { zoning: "MR (M1)" }),
      tc("NEGATIVE", "1 ft from the front lot line", { distanceToFrontLotLineFt: 1 }, "ADU front setback", "KNOWN/FAIL", { zoning: "MR (M1)" }),
      tc("EXCEPTION", "An ADU taller than 42 ft gets no definite setback result", { heightFt: 55, distanceToSideLotLineFt: 20, distanceToRearLotLineFt: 40, distanceToFrontLotLineFt: 40 }, "ADU rear setback", "REQUIRES_VERIFICATION", { zoning: "HR (M)" }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mr-separation-2026",
    subject: "Separation between structures containing floor area in Midrise zones - 5 ft (SMC 23.45.519.A)",
    applicableProjectType: "adu",
    applicableZone: "MR",
    ruleSpecification: { ruleType: AduRuleType.SEPARATION, minFt: 5, mappingToleranceFt: 2, citation: "SMC 23.45.519.A" },
    citation: { smcSections: ["SMC 23.45.519.A", "SMC 23.45.519.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "14 ft from the house", undefined, "Separation from the existing dwelling", "KNOWN/PASS", { zoning: "MR (M1)" }),
      tc("NEGATIVE", "1 ft from the house", { distanceToDwellingFt: 1 }, "Separation from the existing dwelling", "KNOWN/FAIL", { zoning: "MR" }),
      tc("BOUNDARY", "6 ft from the house: inside the 2 ft margin of 5 ft", { distanceToDwellingFt: 6 }, "Separation from the existing dwelling", "REQUIRES_VERIFICATION", { zoning: "MR" }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-hr-no-separation-2026",
    subject: "Separation between structures in Highrise zones - no separation requirement (SMC 23.45.519 applies in LR and MR zones only)",
    applicableProjectType: "adu",
    applicableZone: "HR",
    ruleSpecification: {
      ruleType: AduRuleType.SEPARATION,
      minFt: 0,
      mappingToleranceFt: 0,
      citation: "SMC 23.45.519",
      noRequirementText:
        "Highrise zones have no required separation between structures: SMC 23.45.519 applies in LR and MR zones only, and the 3 ft separation of SMC 23.45.518.H.1.d concerns accessory structures other than ADUs standing in a required setback. Building Code fire-separation and egress rules are separate and are not evaluated here.",
    },
    citation: { smcSections: ["SMC 23.45.519.A", "SMC 23.45.518.H.1"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("POSITIVE", "Any distance: no zoning separation requirement applies", { distanceToDwellingFt: 0.5 }, "Separation from the existing dwelling", "KNOWN/PASS", { zoning: "HR (M)" })],
    isTestOnlyFixture: false,
  },
  ...HEIGHT_VARIANTS.map(
    (v): DraftedRuleInput => ({
      id: `adu-mrhr-height-${v.slug}-2026`,
      subject: `ADU height in a ${v.token === "HR" ? "Highrise" : "Midrise"} zone (${v.token.replace(/_/g, " ")}) - ${v.maxFt} ft; rooftop-feature allowance`,
      applicableProjectType: "adu",
      applicableZone: v.token,
      ruleSpecification: {
        ruleType: AduRuleType.HEIGHT,
        maxFt: v.maxFt,
        treeRetentionMaxFt: v.maxFt,
        pitchedRoofRidgeAllowanceFt: 4,
        citation: "SMC 23.45.514 Table B",
        higherLimitText: v.higherText,
        pitchedRoofText: "open railings, planters, parapets and similar rooftop features may extend up to 4 ft above the limit (SMC 23.45.514.I.2), and a roof surrounded by a parapet may exceed it to allow for a slope (23.45.514.G)",
      },
      citation: { smcSections: ["SMC 23.45.514.B", "SMC 23.45.514 Table B", "SMC 23.45.514.G", "SMC 23.45.514.I"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "rooftop features", description: "A height over the limit but within the limit plus the 4 ft rooftop-feature allowance is REQUIRES_VERIFICATION; only a height over even that ceiling is a failure. The 12 ft limit for accessory structures in a setback (SMC 23.45.514.C) expressly excludes ADUs.", affectedConditionOrInterpretation: "SMC 23.45.514", sourceReferences: ["SMC 23.45.514"], resolutionStatus: "Resolved by design." }],
      testCases: [
        tc("POSITIVE", "16 ft", undefined, "ADU height", "KNOWN/PASS", { zoning: v.example }),
        tc("EXCEPTION", `${v.maxFt + 2} ft is over the limit but within the rooftop-feature allowance`, { heightFt: v.maxFt + 2 }, "ADU height", "REQUIRES_VERIFICATION", { zoning: v.example }),
        tc("NEGATIVE", `${v.maxFt + 8} ft is over even the allowance`, { heightFt: v.maxFt + 8 }, "ADU height", "KNOWN/FAIL", { zoning: v.example }),
      ],
      isTestOnlyFixture: false,
    })
  ),
  {
    id: "adu-mrhr-no-lot-coverage-limit-2026",
    subject: "Lot coverage in Midrise and Highrise zones - there is no lot-coverage limit",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: { ruleType: AduRuleType.MF_NO_LOT_COVERAGE_LIMIT, statement: "Midrise and Highrise zones have no lot-coverage percentage limit (SMC Chapter 23.45); the floor area ratio limit (SMC 23.45.510) and the setbacks govern how much can be built instead." },
    citation: { smcSections: ["SMC 23.45.510", "SMC 23.45.518"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("POSITIVE", "Any ADU: no lot-coverage limit applies", undefined, "Lot coverage", "KNOWN/PASS", { zoning: "MR (M1)" })],
    isTestOnlyFixture: false,
  },
  ...FAR_VARIANTS.map(
    (v): DraftedRuleInput => ({
      id: `adu-mrhr-far-${v.slug}-2026`,
      subject: `ADU floor area ratio - ${v.zoneText.replace(/^A /, "")}: ${v.far}`,
      applicableProjectType: "adu",
      applicableZone: v.token,
      ruleSpecification: { ruleType: AduRuleType.MF_FLOOR_AREA_RATIO, far: v.far, zoneText: v.zoneText, ...(v.conditionText ? { conditionText: v.conditionText } : {}) },
      citation: { smcSections: ["SMC 23.45.510.B", "SMC 23.45.510.C", "SMC 23.45.510.D", "SMC 23.45.510 Table A", "SMC 23.45.510 Table B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
      caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "exemptions", description: "The limit applies to total chargeable floor area; exemptions (underground floors, portions of a story up to 4 ft above grade, pre-1982 detached dwellings, common walls, and others in SMC 23.45.510.D) are not determined, so an apparent excess is REQUIRES_VERIFICATION, never a failure.", affectedConditionOrInterpretation: "SMC 23.45.510.D", sourceReferences: ["SMC 23.45.510"], resolutionStatus: "Resolved by design." }],
      testCases: [
        tc("EXCEPTION", "The existing floor area was not given", undefined, "Floor area ratio", "REQUIRES_VERIFICATION", { zoning: v.example }),
        tc("POSITIVE", "Existing 1,500 sq ft plus a 400 sq ft ADU is within the limit", { existingChargeableFloorAreaSqFt: 1500 }, "Floor area ratio", "KNOWN/PASS", { zoning: v.example, site: { parcelAreaSqFt: 6000 } }),
        tc("EXCEPTION", "Existing 60,000 sq ft plus the ADU is over the limit but never a definite failure", { existingChargeableFloorAreaSqFt: 60000 }, "Floor area ratio", "REQUIRES_VERIFICATION", { zoning: v.example, site: { parcelAreaSqFt: 6000 } }),
      ],
      isTestOnlyFixture: false,
    })
  ),
  {
    id: "adu-mrhr-amenity-2026",
    subject: "Amenity area in Midrise and Highrise zones - 5% of the gross floor area of the residential structure; none for one unit added to a residential structure that existed in 1982",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: { ruleType: AduRuleType.AMENITY_AREA, requiredFractionOfFloorArea: 0.05, minSqFt: 60, minDimensionFt: 6, citation: "SMC 23.45.522", exemptionCitation: "SMC 23.45.522.H", canopyExemption: false },
    citation: { smcSections: ["SMC 23.45.522.A.2", "SMC 23.45.522.D", "SMC 23.45.522.H"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "site plan not known", description: "Whether the site provides the amenity area is not determined; the finding states the requirement (private amenity areas of at least 60 sq ft and 6 ft in each dimension; common areas 250 sq ft and 10 ft) and the 1982 exemption. Environmentally critical area land may count toward it (SMC 23.45.522.G).", affectedConditionOrInterpretation: "SMC 23.45.522", sourceReferences: ["SMC 23.45.522"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "One new unit on a house declared built before 1982", { existingHouseBuiltBefore1982: true }, "Amenity area", "KNOWN/PASS", { zoning: "MR (M1)" }),
      tc("EXCEPTION", "House built after 1982: the requirement is stated, not assessed", { existingHouseBuiltBefore1982: false }, "Amenity area", "REQUIRES_VERIFICATION", { zoning: "HR (M)" }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mrhr-landscaping-note-2026",
    subject: "Landscaping and street trees for an ADU in Midrise and Highrise zones (SMC 23.45.524)",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: {
      ruleType: AduRuleType.MF_LANDSCAPING_NOTE,
      text: "In a Midrise or Highrise zone a Green Factor score of 0.5 is required only when more than one new dwelling unit is built on the site, and a new dwelling unit that does not increase floor area is exempt; street trees are required when any development is proposed, with exceptions (SMC 23.45.524.A-B). Existing trees, the site plan and the number of new units are not known to Permit Preflight, so whether and how this applies is left for SDCI to confirm.",
    },
    citation: { smcSections: ["SMC 23.45.524.A.2.b", "SMC 23.45.524.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [ZONING_CAVEAT],
    testCases: [tc("EXCEPTION", "Always stated, never assessed", undefined, "Tree requirement", "REQUIRES_VERIFICATION", { zoning: "MR (M1)" })],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mrhr-design-standards-2026",
    subject: "Design standards for a new dwelling unit in Midrise and Highrise zones - 3 ft pedestrian path; street-facing entry with 3 x 3 ft weather protection and 20% windows within 40 ft of a street",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: { ruleType: AduRuleType.DESIGN_STANDARDS, pedestrianAccessMinWidthFt: 3, streetFacingWithinFt: 40, weatherProtectionFt: 3, facadeOpeningsPercent: 20, citation: "SMC 23.45.529" },
    citation: { smcSections: ["SMC 23.45.529.A", "SMC 23.45.529.C", "SMC 23.45.529.D", "SMC 23.45.529.E"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [tc("EXCEPTION", "Depends on the design; stated, never assessed", undefined, "Design standards", "REQUIRES_VERIFICATION", { zoning: "HR (M)" })],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mrhr-conversion-2026",
    subject: "Conversion of an existing accessory structure to a detached ADU in Midrise and Highrise zones - permitted notwithstanding lot coverage and yard or setback provisions; structure existing before July 23, 2023; Housing Code minimum standards",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: {
      ruleType: AduRuleType.CONVERSION,
      existingBeforeDate: "2023-07-23",
      housingCodeFirstSection: "SMC 22.206.020",
      housingCodeLastSection: "SMC 22.206.140",
      waivesSetbacksAndLotCoverage: true,
      directorMayWaiveAndModify: true,
      heightNote: "the Midrise and Highrise structure height limits, SMC 23.45.514",
    },
    citation: { smcSections: ["SMC 23.42.022.H.1", "SMC 23.42.022.H.2", "SMC 23.42.022.H.3.a", "SMC 23.42.022.H.3.b"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT, { category: "what counts as an existing structure and an intact conversion", description: "Same treatment as the Neighborhood Residential and Lowrise conversion rules: the allowance is described only on the customer's declarations and always as REQUIRES_VERIFICATION; the height of the building is not collected; the Housing Code standards are cited and never assessed.", affectedConditionOrInterpretation: "SMC 23.42.022.H", sourceReferences: ["SMC 23.42.022.H"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "An intact conversion: siting is described, never asserted", CONVERSION_BASE, "Setbacks and lot coverage (conversion)", "REQUIRES_VERIFICATION", { zoning: "MR (M1)" }),
      tc("EXCEPTION", "Height of the converted building is left to SDCI, naming the Midrise and Highrise limits", CONVERSION_BASE, "Height of the converted building", "REQUIRES_VERIFICATION", { zoning: "HR (M)" }),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "adu-mrhr-attached-2026",
    subject: "ADU inside or attached to the house in Midrise and Highrise zones - may exceed 1,000 sq ft in a portion that existed before July 23, 2023; up to 250 sq ft of attached garage not counted",
    applicableProjectType: "adu",
    applicableZone: "MR,HR",
    ruleSpecification: { ruleType: AduRuleType.ATTACHED, capExemptionBeforeDate: "2023-07-23", attachedGarageExclusionSqFt: 250 },
    citation: { smcSections: ["SMC 23.42.022.D", "SMC 23.42.022.E", "SMC 23.42.022.G.2", "SMC 23.42.022.H.4"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [DECLARED_CAVEAT, ZONING_CAVEAT],
    testCases: [
      tc("POSITIVE", "A 700 sq ft basement ADU: within the cap", ATTACHED_BASE, "ADU size limit", "KNOWN/PASS", { zoning: "MR (M1)", appliedBy: "adu-mrhr-size-limit-2026" }),
      tc("EXCEPTION", "A 1,700 sq ft ADU in the part of the house declared to exist before the date: the cap may not apply (H.4)", { ...ATTACHED_BASE, attached: { grossFloorAreaSqFt: 1700, includesAddition: false, portionExistedBeforeJuly2023: true } }, "ADU size limit", "REQUIRES_VERIFICATION", { zoning: "HR (M)" }),
    ],
    isTestOnlyFixture: false,
  },
];

export const ADU_MR_HR_FIXED_ROW_IDS: Record<string, string> = Object.fromEntries(aduMrHrCandidates.map((c) => [c.id, mfRowId(c.id)]));
