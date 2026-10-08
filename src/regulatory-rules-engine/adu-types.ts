/**
 * Unit 11 (ADUs) - evaluation types. See aidlc-docs/construction/unit-11-adus/. Slice 3 covers a NEW
 * DETACHED accessory dwelling unit on an existing-property parcel. Thresholds live on each governed
 * row's own `ruleSpecification`; `evaluate-adu.ts` asserts no SMC number as a literal. An inactive or
 * malformed row simply makes its claim unavailable (fail closed).
 */

import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import type { EvidenceQuality } from "../regulatory-rule-governance/types.js";
import type { Finding } from "./types.js";

export const AduType = {
  DETACHED_NEW: "DETACHED_NEW",
  CONVERSION_EXISTING: "CONVERSION_EXISTING",
} as const;
export type AduType = (typeof AduType)[keyof typeof AduType];

/** The customer's declared facts plus the server-derived spatial measurements (same pattern as the shed's
 * ShedProjectDetails: distances come from PostGIS against the parcel polygon, never from the client). */
/** Present only for the conversion of an existing accessory structure (SMC 23.42.022.H). */
export interface AduConversionDetails {
  /** The mapped outline's area (Seattle Building Outlines), undefined when the selected building could not be matched. */
  structureAreaSqFt?: number;
  /** Set when the customer selected a building that is not among the freshly retrieved outlines (or is the main house). */
  structureNotMatchedReason?: string;
  /** Declared: did the building exist before July 23, 2023? undefined = not sure. */
  existedBeforeJuly2023?: boolean;
  /** Declared: will the conversion keep the footprint and height as they are? undefined = not sure. */
  keepsFootprintAndHeight?: boolean;
}

export interface AduProjectDetails {
  projectType: "adu";
  aduType: AduType;
  /** The new ADU's footprint and height; absent for a conversion, whose footprint is the mapped outline. */
  widthFt?: number;
  depthFt?: number;
  /** Above-ground stories; the ADU's gross floor area is estimated as footprint x stories. */
  stories: number;
  bedrooms: number;
  /** Greatest height of a new ADU, in feet. */
  heightFt?: number;
  conversion?: AduConversionDetails;
  alleyAdjacent: boolean;
  /** Principal dwelling units already on the lot (not counting ADUs). */
  existingPrincipalDwellingUnits: number;
  existingAduCount: number;
  existingHouseBuiltBefore1982?: boolean;
  /** Total chargeable floor area of all existing structures, as the customer declares it. */
  existingChargeableFloorAreaSqFt?: number;

  distanceToRearLotLineFt?: number;
  distanceToSideLotLineFt?: number;
  distanceToFrontLotLineFt?: number;
  distanceToDwellingFt?: number;
  /** Nearest mapped existing structure other than the selected dwelling. */
  nearestOtherStructure?: { distanceFt: number; areaSqFt?: number };
  spatialEvidenceQuality?: EvidenceQuality;
  setbackEvidenceGapReason?: string;
  sideEdgeDistancesFt?: Record<string, number>;
  unresolvedStreetFrontageDistancesFt?: Record<string, number>;
  frontRoleEvidenceGapReason?: string;
  rearRoleEvidenceGapReason?: string;
  sideRoleEvidenceGapReason?: string;
  dwellingSeparationEvidenceGapReason?: string;
}

/** Server-derived facts about the property that are not the customer's declarations. */
export interface AduSiteFacts {
  parcelAreaSqFt?: number;
  /** Sum of mapped existing-structure footprint area (Seattle Building Outlines), undefined if not retrieved. */
  existingMappedCoverageSqFt?: number;
  inFrequentTransitServiceArea?: boolean;
  ecaFindings: CriticalAreaFinding[];
}

/** The governed rows (aidlc-docs/construction/unit-11-adus/rule-decomposition.md). */
export const AduRuleType = {
  COUNT_AND_DENSITY: "ADU_A1_COUNT_AND_DENSITY",
  SIZE_LIMIT: "ADU_A2_SIZE_LIMIT",
  SETBACKS: "ADU_A3_SETBACKS",
  SEPARATION: "ADU_A4_SEPARATION",
  HEIGHT: "ADU_A5_HEIGHT",
  LOT_COVERAGE: "ADU_A6_LOT_COVERAGE",
  FLOOR_AREA_RATIO: "ADU_A7_FLOOR_AREA_RATIO",
  AMENITY_AREA: "ADU_A8_AMENITY_AREA",
  TREES: "ADU_A9_TREES",
  DESIGN_STANDARDS: "ADU_A10_DESIGN_STANDARDS",
  CONVERSION: "ADU_A11_CONVERSION_OF_EXISTING_ACCESSORY_STRUCTURE",
} as const;
export type AduRuleType = (typeof AduRuleType)[keyof typeof AduRuleType];

/** A density band: a lot with more than `overSqFtPerUnit` of lot area per dwelling unit falls in this band. */
export interface AduDensityBand {
  overSqFtPerUnit: number;
}
export interface AduFarBand extends AduDensityBand {
  far: number;
}
export interface AduTreeBand extends AduDensityBand {
  sqFtPerPoint: number;
}

export interface AduCountAndDensitySpec {
  ruleType: typeof AduRuleType.COUNT_AND_DENSITY;
  maxAdusPerLot: number;
  lotSqFtPerUnit: number;
  roundUpFractionOver: number;
  smallLotMaxSqFt: number;
  smallLotMaxUnits: number;
  midLotMaxSqFt: number;
  midLotMaxUnits: number;
}
export interface AduSizeLimitSpec {
  ruleType: typeof AduRuleType.SIZE_LIMIT;
  maxSqFtUpToTwoBedrooms: number;
  maxSqFtThreePlusBedrooms: number;
  bikeParkingExclusionSqFt: number;
}
export interface AduSetbacksSpec {
  ruleType: typeof AduRuleType.SETBACKS;
  rearFt: number;
  rearAlleyFt: number;
  sideAverageFt: number;
  sideMinFt: number;
  smallLotSideFt: number;
  smallLotAreaSqFt: number;
  frontFt: number;
  frontThreeOrMoreUnitsFt: number;
  /** Product margin for mapped distances: a distance within this many feet of a threshold is not treated as a definite result. */
  mappingToleranceFt: number;
}
export interface AduSeparationSpec {
  ruleType: typeof AduRuleType.SEPARATION;
  minFt: number;
  mappingToleranceFt: number;
}
export interface AduHeightSpec {
  ruleType: typeof AduRuleType.HEIGHT;
  maxFt: number;
  treeRetentionMaxFt: number;
  pitchedRoofRidgeAllowanceFt: number;
}
export interface AduLotCoverageSpec {
  ruleType: typeof AduRuleType.LOT_COVERAGE;
  maxPercent: number;
}
export interface AduFarSpec {
  ruleType: typeof AduRuleType.FLOOR_AREA_RATIO;
  bands: AduFarBand[];
  denserFar: number;
  smallLotAreaSqFt: number;
  smallLotMinChargeableSqFt: number;
}
export interface AduAmenitySpec {
  ruleType: typeof AduRuleType.AMENITY_AREA;
  requiredFractionOfLot: number;
  minSqFt: number;
  minDimensionFt: number;
}
export interface AduTreesSpec {
  ruleType: typeof AduRuleType.TREES;
  bands: AduTreeBand[];
  denserSqFtPerPoint: number;
  lotSqFtPerNewTree: number;
}
export interface AduDesignStandardsSpec {
  ruleType: typeof AduRuleType.DESIGN_STANDARDS;
  pedestrianAccessMinWidthFt: number;
  streetFacingWithinFt: number;
  weatherProtectionFt: number;
  facadeOpeningsPercent: number;
}

export interface AduConversionSpec {
  ruleType: typeof AduRuleType.CONVERSION;
  /** An existing accessory structure is one that existed before this date (ISO date). */
  existingBeforeDate: string;
  /** First and last SMC 22.206 sections whose minimum standards a converted structure must meet. */
  housingCodeFirstSection: string;
  housingCodeLastSection: string;
  /** The conversion is permitted notwithstanding lot coverage and yard or setback provisions (SMC 23.42.022.H.3.b). */
  waivesSetbacksAndLotCoverage: boolean;
  /** The Director may allow waivers and modifications as a Type I decision (SMC 23.42.022.H.3.a). */
  directorMayWaiveAndModify: boolean;
}

export type AduFeasibilityHeadline = "BLOCKED" | "LIKELY_CONSTRAINED" | "LOOKS_FEASIBLE" | "CANNOT_TELL";

/** Evidence-only summary. It is derived from the findings and never states approval. */
export interface AduFeasibility {
  headline: AduFeasibilityHeadline;
  summary: string;
  /** Known failures, each naming the number involved. */
  blockers: string[];
  /** Soft constraints: the estimate appears over a limit but rests on mapped or declared figures. */
  constraints: string[];
  /** Ordered: what to verify before paying for design work. */
  verifyBeforeDesign: string[];
  /** Fixed, never-evaluated items. */
  notEvaluated: string[];
}

export interface AduDeclaredInput {
  label: string;
  value: string;
}

export interface AduEvaluationOutcome {
  findings: Finding[];
  feasibility: AduFeasibility;
  declaredInputs: AduDeclaredInput[];
  /** Claims that could not be made because a rule they depend on is not ACTIVE (or is malformed). */
  uncoveredConstraintTypes: string[];
}
