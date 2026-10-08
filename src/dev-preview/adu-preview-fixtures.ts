/**
 * DEV/TEST-ONLY Unit 11 (ADUs) preview fixtures. Kept free of pipeline, database and other server imports.
 * Results come from the REAL evaluateAdu over in-memory, never-persisted ACTIVE rule objects; evidence is
 * built by the production assembleAduEvidence. The specifications below are asserted equal to the real
 * governance candidates' (tests/dev-preview/adu-report-preview.test.ts) so they cannot drift. Never import
 * this from customer-facing code.
 */

import { evaluateAdu } from "../regulatory-rules-engine/evaluate-adu.js";
import { AduRuleType } from "../regulatory-rules-engine/adu-types.js";
import type { AduProjectDetails, AduSiteFacts } from "../regulatory-rules-engine/adu-types.js";
import type { ZoningApplicability } from "../regulatory-rules-engine/zoning-applicability.js";
import { assembleAduEvidence } from "../report-generation-orchestrator/adu-evidence.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import type { Finding } from "../regulatory-rules-engine/types.js";

export const ADU_PREVIEW_RULE_SPECS: Record<string, Record<string, unknown>> = {
  [AduRuleType.COUNT_AND_DENSITY]: { maxAdusPerLot: 2, lotSqFtPerUnit: 1250, roundUpFractionOver: 0.85, smallLotMaxSqFt: 5000, smallLotMaxUnits: 4, midLotMaxSqFt: 7500, midLotMaxUnits: 6 },
  [AduRuleType.SIZE_LIMIT]: { maxSqFtUpToTwoBedrooms: 1000, maxSqFtThreePlusBedrooms: 1200, bikeParkingExclusionSqFt: 35 },
  [AduRuleType.SETBACKS]: { rearFt: 5, rearAlleyFt: 0, sideAverageFt: 5, sideMinFt: 3, smallLotSideFt: 3, smallLotAreaSqFt: 5000, frontFt: 15, frontThreeOrMoreUnitsFt: 10, mappingToleranceFt: 2 },
  [AduRuleType.SEPARATION]: { minFt: 5, mappingToleranceFt: 2 },
  [AduRuleType.HEIGHT]: { maxFt: 32, treeRetentionMaxFt: 42, pitchedRoofRidgeAllowanceFt: 5 },
  [AduRuleType.LOT_COVERAGE]: { maxPercent: 50 },
  [AduRuleType.FLOOR_AREA_RATIO]: {
    bands: [
      { overSqFtPerUnit: 4000, far: 0.6 },
      { overSqFtPerUnit: 2200, far: 0.8 },
      { overSqFtPerUnit: 1600, far: 1.0 },
    ],
    denserFar: 1.6,
    smallLotAreaSqFt: 5000,
    smallLotMinChargeableSqFt: 2500,
  },
  [AduRuleType.AMENITY_AREA]: { requiredFractionOfLot: 0.2, minSqFt: 120, minDimensionFt: 8 },
  [AduRuleType.TREES]: {
    bands: [
      { overSqFtPerUnit: 4000, sqFtPerPoint: 500 },
      { overSqFtPerUnit: 2200, sqFtPerPoint: 600 },
      { overSqFtPerUnit: 1600, sqFtPerPoint: 675 },
    ],
    denserSqFtPerPoint: 750,
    lotSqFtPerNewTree: 2500,
  },
  [AduRuleType.DESIGN_STANDARDS]: { pedestrianAccessMinWidthFt: 3, streetFacingWithinFt: 40, weatherProtectionFt: 3, facadeOpeningsPercent: 20 },
  [AduRuleType.ATTACHED]: { capExemptionBeforeDate: "2023-07-23", attachedGarageExclusionSqFt: 250 },
  [AduRuleType.CONVERSION]: {
    existingBeforeDate: "2023-07-23",
    housingCodeFirstSection: "SMC 22.206.020",
    housingCodeLastSection: "SMC 22.206.140",
    waivesSetbacksAndLotCoverage: true,
    directorMayWaiveAndModify: true,
  },
};

const NO_OVERLAYS = { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [] as string[] };
const NR: ZoningApplicability = { status: "NR_VERIFIED", nrFraction: 1, zoningLabel: "NR", overlays: NO_OVERLAYS };

const ECA = (steep: boolean): CriticalAreaFinding[] => [
  { hazardType: "steep_slope", mappedIntersectionResult: steep ? "INTERSECTS" : "NO_INTERSECTION", advisoryStatus: "ADVISORY_ONLY", toleranceBasis: "preview fixture" },
  { hazardType: "flood_prone", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "ADVISORY_ONLY", toleranceBasis: "preview fixture" },
] as unknown as CriticalAreaFinding[];

export interface AduPreviewReport {
  id: string;
  findings: Finding[];
  evidence: { factType: string; value?: unknown; provenance: { qualityCaveat?: string } }[];
  explanation: null;
  generatedAt: string;
}

export interface AduPreviewScenarioDefinition {
  id: string;
  group: "Unit 11 - ADUs";
  title: string;
  activeRuleTypes?: string[];
  project?: Partial<AduProjectDetails>;
  site?: Partial<AduSiteFacts>;
  zoning?: ZoningApplicability;
  steepSlopeMapped?: boolean;
  expected: { headline: string; subjects?: Record<string, string>; uncovered?: string[] };
}

/** Overrides that turn the base (new detached) project into the conversion of a 400 sq ft existing garage 2 ft from two lot lines. */
const CONVERSION_PROJECT: Partial<AduProjectDetails> = {
  aduType: "CONVERSION_EXISTING",
  widthFt: undefined,
  depthFt: undefined,
  heightFt: undefined,
  distanceToRearLotLineFt: 2,
  distanceToSideLotLineFt: 2,
  distanceToFrontLotLineFt: 90,
  distanceToDwellingFt: 14,
  conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: true },
};

/** Overrides that turn the base project into an ADU inside the existing house (700 sq ft, no addition, the part of the house existed before the date). */
const ATTACHED_PROJECT: Partial<AduProjectDetails> = {
  aduType: "ATTACHED_TO_HOUSE",
  widthFt: undefined,
  depthFt: undefined,
  heightFt: undefined,
  stories: undefined,
  distanceToRearLotLineFt: undefined,
  distanceToSideLotLineFt: undefined,
  distanceToFrontLotLineFt: undefined,
  distanceToDwellingFt: undefined,
  attached: { grossFloorAreaSqFt: 700, includesAddition: false, portionExistedBeforeJuly2023: true },
};

export const ADU_PREVIEW_SCENARIOS: AduPreviewScenarioDefinition[] = [
  {
    id: "adu-looks-feasible",
    group: "Unit 11 - ADUs",
    title: "Backyard cottage, clear placement (looks feasible - items to verify)",
    expected: { headline: "LOOKS_FEASIBLE", subjects: { "ADU rear setback": "KNOWN/PASS", "Separation from the existing dwelling": "KNOWN/PASS", "ADU size limit": "KNOWN/PASS" } },
  },
  {
    id: "adu-blocked",
    group: "Unit 11 - ADUs",
    title: "Too close to the house and oversize (blocked as entered)",
    project: { distanceToDwellingFt: 1.5, widthFt: 28, depthFt: 24, stories: 2, bedrooms: 2 },
    expected: { headline: "BLOCKED", subjects: { "Separation from the existing dwelling": "KNOWN/FAIL", "ADU size limit": "KNOWN/FAIL" } },
  },
  {
    id: "adu-constrained",
    group: "Unit 11 - ADUs",
    title: "High lot coverage and floor area (likely constrained)",
    project: { existingChargeableFloorAreaSqFt: 4700 },
    site: { parcelAreaSqFt: 4000, existingMappedCoverageSqFt: 2300 },
    expected: { headline: "LIKELY_CONSTRAINED", subjects: { "Lot coverage": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-not-nr",
    group: "Unit 11 - ADUs",
    title: "Parcel zoned LR1 (cannot tell - not Neighborhood Residential)",
    zoning: { status: "NOT_NR", zoningLabel: "LR1 (M)", overlays: NO_OVERLAYS },
    expected: { headline: "CANNOT_TELL", subjects: { "Zoning applicability (Neighborhood Residential zones)": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-overlay-and-steep-slope",
    group: "Unit 11 - ADUs",
    title: "Shoreline district and mapped steep slope (verify first)",
    zoning: { status: "NR_VERIFIED", nrFraction: 1, zoningLabel: "NR", overlays: { ...NO_OVERLAYS, shorelineDistrict: true } },
    steepSlopeMapped: true,
    expected: { headline: "LOOKS_FEASIBLE", subjects: { "Overlay districts (shoreline, historic, landmark)": "REQUIRES_VERIFICATION", "Environmentally critical areas": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-conversion-intact",
    group: "Unit 11 - ADUs",
    title: "Convert an existing garage, kept as is (allowance applies)",
    project: { ...CONVERSION_PROJECT },
    expected: { headline: "LOOKS_FEASIBLE", subjects: { "Setbacks and lot coverage (conversion)": "REQUIRES_VERIFICATION", "Conversion of an existing accessory structure": "REQUIRES_VERIFICATION", "Minimum housing standards for the converted building": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-conversion-no-allowance",
    group: "Unit 11 - ADUs",
    title: "Convert a building built after July 2023 (allowance does not apply)",
    project: { ...CONVERSION_PROJECT, distanceToRearLotLineFt: 20, distanceToSideLotLineFt: 12, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: false, keepsFootprintAndHeight: true } },
    expected: { headline: "LIKELY_CONSTRAINED", subjects: { "Conversion of an existing accessory structure": "REQUIRES_VERIFICATION", "ADU rear setback": "KNOWN/PASS" } },
  },
  {
    id: "adu-conversion-near-house",
    group: "Unit 11 - ADUs",
    title: "Convert a garage 3 ft from the house (separation may need a waiver)",
    project: { ...CONVERSION_PROJECT, distanceToDwellingFt: 3 },
    expected: { headline: "LIKELY_CONSTRAINED", subjects: { "Separation from the existing dwelling": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-conversion-not-matched",
    group: "Unit 11 - ADUs",
    title: "Building to convert could not be matched (cannot tell)",
    project: { ...CONVERSION_PROJECT, conversion: { structureNotMatchedReason: "it is no longer among the mapped buildings on this parcel.", existedBeforeJuly2023: true, keepsFootprintAndHeight: true } },
    expected: { headline: "CANNOT_TELL", subjects: { "Building to convert": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-attached-inside",
    group: "Unit 11 - ADUs",
    title: "ADU inside the existing house, no addition (looks feasible)",
    project: { ...ATTACHED_PROJECT },
    expected: { headline: "LOOKS_FEASIBLE", subjects: { "ADU size limit": "KNOWN/PASS", "Setbacks, height and lot coverage (attached ADU)": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-attached-over-cap-existing",
    group: "Unit 11 - ADUs",
    title: "Large attached ADU in the existing part of the house (size cap may not apply)",
    project: { ...ATTACHED_PROJECT, attached: { grossFloorAreaSqFt: 1300, includesAddition: false, portionExistedBeforeJuly2023: true } },
    expected: { headline: "LOOKS_FEASIBLE", subjects: { "ADU size limit": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "adu-attached-blocked-size",
    group: "Unit 11 - ADUs",
    title: "Attached ADU in a new part of the house, over the size cap (blocked)",
    project: { ...ATTACHED_PROJECT, attached: { grossFloorAreaSqFt: 1300, includesAddition: true, portionExistedBeforeJuly2023: false } },
    expected: { headline: "BLOCKED", subjects: { "ADU size limit": "KNOWN/FAIL" } },
  },
  {
    id: "adu-uncovered-claims",
    group: "Unit 11 - ADUs",
    title: "Only the size rule is ACTIVE (other claims not screened)",
    activeRuleTypes: [AduRuleType.SIZE_LIMIT],
    expected: { headline: "CANNOT_TELL", subjects: { "ADU size limit": "KNOWN/PASS" }, uncovered: ["ADU setbacks", "lot coverage"] },
  },
];

export function baseAduPreviewProject(): AduProjectDetails {
  return {
    projectType: "adu",
    aduType: "DETACHED_NEW",
    widthFt: 16,
    depthFt: 20,
    stories: 1,
    bedrooms: 1,
    heightFt: 15,
    alleyAdjacent: false,
    existingPrincipalDwellingUnits: 1,
    existingAduCount: 0,
    distanceToRearLotLineFt: 31,
    distanceToSideLotLineFt: 14,
    distanceToFrontLotLineFt: 72,
    distanceToDwellingFt: 36,
  };
}

export function buildAduPreviewReport(scenario: AduPreviewScenarioDefinition): AduPreviewReport {
  const project: AduProjectDetails = { ...baseAduPreviewProject(), ...(scenario.project ?? {}) };
  const site: AduSiteFacts = { parcelAreaSqFt: 6000, existingMappedCoverageSqFt: 1104, inFrequentTransitServiceArea: true, ecaFindings: ECA(scenario.steepSlopeMapped === true), ...(scenario.site ?? {}) };
  const types = scenario.activeRuleTypes ?? Object.keys(ADU_PREVIEW_RULE_SPECS);
  const rules: RegulatoryRule[] = types.map((ruleType) => ({
    id: `preview-only-${ruleType}`,
    subject: `PREVIEW-ONLY (never persisted): ${ruleType}`,
    applicableProjectType: "adu",
    applicableZone: "NR",
    ruleSpecification: { ruleType, ...ADU_PREVIEW_RULE_SPECS[ruleType] },
    citation: { smcSections: [] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
  }));
  const outcome = evaluateAdu({ project, site, candidateActiveRules: rules, zoningApplicability: scenario.zoning ?? NR });
  return {
    id: `preview-${scenario.id}`,
    findings: outcome.findings,
    evidence: [{ factType: "environmental-constraints", value: site.ecaFindings, provenance: {} }, ...assembleAduEvidence(outcome)] as AduPreviewReport["evidence"],
    explanation: null,
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Shape `renderReportHtml` reads (EvidenceReportArtifactRow), built from the same preview report so web and PDF render identical data. */
export function toAduPreviewArtifactRow(report: AduPreviewReport) {
  return {
    id: report.id,
    screeningRequestId: "preview",
    reportGenerationJobId: "preview",
    findings: report.findings,
    evidence: report.evidence,
    explanation: report.explanation,
    ruleVersionsUsed: [],
    dataRetrievalTimestamps: {},
    generatedAt: new Date(report.generatedAt),
  };
}
