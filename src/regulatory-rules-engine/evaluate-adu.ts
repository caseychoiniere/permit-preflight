/**
 * Unit 11 (ADUs) feasibility evaluation for a NEW DETACHED accessory dwelling unit. Pure function - no
 * I/O, a separate entry point from `evaluateProject` (like evaluate-fence.ts / evaluate-deck.ts), so the
 * shed and garage paths are untouched.
 *
 * OUTCOME-DEPENDENCY MODEL (same discipline as Units 6B/7/8): a claim is made only when every rule
 * REQUIRED FOR THAT CLAIM is ACTIVE and well-formed; an inactive rule never contributes a conclusion and
 * the claim is reported as uncovered. Every numeric threshold comes from the ACTIVE row's own
 * `ruleSpecification`; this module contains no SMC number as a literal.
 *
 * Output discipline: the headline is a feasibility READ, never an approval. A KNOWN failure names the
 * number involved; anything that rests on mapped, declared or advisory data is REQUIRES_VERIFICATION and
 * lands on the verify-before-design checklist. A parcel that is verifiably not Neighborhood Residential
 * gets no NR conclusion at all (the headline is CANNOT_TELL).
 */

import { LifecycleState } from "../regulatory-rule-governance/types.js";
import { EvidenceQuality } from "../regulatory-rule-governance/types.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { MappedIntersectionResult } from "../spatial-analysis/types.js";
import { evaluateEcaLotAreaAdjustment, evaluateShedLotCoverage } from "./evaluate.js";
import { ComplianceOutcome, FindingClassification } from "./types.js";
import type { Finding } from "./types.js";
import { resolveApplicableRules, summarizeZoningResolution } from "../zoning/resolve.js";
import type { ZoningResolution } from "../zoning/resolve.js";
import type { ZoningContext } from "../zoning/context.js";
import { ambiguousClaimFindings, zoningFindings } from "../zoning/findings.js";
import { AduRuleType } from "./adu-types.js";
import type {
  AduAmenitySpec,
  AduAttachedSpec,
  AduConversionSpec,
  AduCountAndDensitySpec,
  AduDeclaredInput,
  AduDesignStandardsSpec,
  AduEvaluationOutcome,
  AduFarSpec,
  AduFeasibility,
  AduFeasibilityHeadline,
  AduHeightSpec,
  AduLotCoverageSpec,
  AduMfCountSpec,
  AduMfFarSpec,
  AduMfLandscapingNoteSpec,
  AduMfNoLotCoverageLimitSpec,
  AduProjectDetails,
  AduSeparationSpec,
  AduCommHeightSpec,
  AduCommSetbacksSpec,
  AduSetbacksSpec,
  AduSiteFacts,
  AduSizeLimitSpec,
  AduTreesSpec,
} from "./adu-types.js";

/** Explicit outcome dependencies. Documentation made executable: each evaluator below fetches exactly
 * the rules listed for its claim. */
export const ADU_OUTCOME_DEPENDENCIES = {
  COUNT: [AduRuleType.COUNT_AND_DENSITY],
  DENSITY: [AduRuleType.COUNT_AND_DENSITY],
  SIZE: [AduRuleType.SIZE_LIMIT],
  SETBACKS: [AduRuleType.SETBACKS],
  SEPARATION: [AduRuleType.SEPARATION],
  HEIGHT: [AduRuleType.HEIGHT],
  LOT_COVERAGE: [AduRuleType.LOT_COVERAGE],
  FLOOR_AREA_RATIO: [AduRuleType.FLOOR_AREA_RATIO, AduRuleType.COUNT_AND_DENSITY],
  AMENITY: [AduRuleType.AMENITY_AREA],
  TREES: [AduRuleType.TREES],
  DESIGN: [AduRuleType.DESIGN_STANDARDS],
  /** Conversion claims (the setback and lot-coverage allowance, the eligibility finding, the Housing Code disclosure). */
  CONVERSION: [AduRuleType.CONVERSION],
  /** Attached-ADU size claims (the cap and its exemption for a portion that existed before the cutoff) and the attached finding. */
  ATTACHED: [AduRuleType.ATTACHED],
  ATTACHED_SIZE: [AduRuleType.SIZE_LIMIT, AduRuleType.ATTACHED],
} as const;

export const ADU_NOT_EVALUATED: readonly string[] = [
  "Building-code, energy-code, fire-access, emergency-escape-window and separate-heating-control requirements, and plan review, are not evaluated.",
  "Sewer and water capacity, side-sewer, stormwater and electrical service changes, and King County's sewer capacity charge are not evaluated.",
  "Title matters (recorded covenants or owner-occupancy agreements), easements, HOA rules and boundary or survey accuracy are not evaluated.",
  "Tree protection (tier 1 and tier 2 trees), the Shoreline Master Program, landmark and historic-district review, and critical-area permits and buffers are not evaluated beyond the mapped indications shown.",
  "Design standards (street-facing entry, windows and doors, pedestrian access) are listed but not assessed against your design.",
];

const DECLARED_BASIS = "Based on the ADU details you entered (not measured from the site) and, for distances, the footprint you placed on the map.";

function positiveFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
function nonNegativeFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
function bandsOk(v: unknown, field: string): boolean {
  return Array.isArray(v) && v.length > 0 && v.every((b) => nonNegativeFinite((b as Record<string, unknown>)["overSqFtPerUnit"]) && positiveFinite((b as Record<string, unknown>)[field]));
}

/** Specification guards: a malformed specification makes the rule unavailable (fail closed). */
const SPEC_GUARDS: Record<string, (s: Record<string, unknown>) => boolean> = {
  [AduRuleType.COUNT_AND_DENSITY]: (s) =>
    positiveFinite(s["maxAdusPerLot"]) &&
    positiveFinite(s["lotSqFtPerUnit"]) &&
    nonNegativeFinite(s["roundUpFractionOver"]) &&
    positiveFinite(s["smallLotMaxSqFt"]) &&
    positiveFinite(s["smallLotMaxUnits"]) &&
    positiveFinite(s["midLotMaxSqFt"]) &&
    positiveFinite(s["midLotMaxUnits"]),
  [AduRuleType.SIZE_LIMIT]: (s) => positiveFinite(s["maxSqFtUpToTwoBedrooms"]) && positiveFinite(s["maxSqFtThreePlusBedrooms"]) && nonNegativeFinite(s["bikeParkingExclusionSqFt"]),
  [AduRuleType.SETBACKS]: (s) =>
    positiveFinite(s["rearFt"]) &&
    nonNegativeFinite(s["rearAlleyFt"]) &&
    positiveFinite(s["sideAverageFt"]) &&
    positiveFinite(s["sideMinFt"]) &&
    positiveFinite(s["smallLotSideFt"]) &&
    positiveFinite(s["smallLotAreaSqFt"]) &&
    positiveFinite(s["frontFt"]) &&
    positiveFinite(s["frontThreeOrMoreUnitsFt"]) &&
    positiveFinite(s["mappingToleranceFt"]),
  [AduRuleType.SEPARATION]: (s) => (typeof s["noRequirementText"] === "string" && (s["noRequirementText"] as string).length > 0) || (positiveFinite(s["minFt"]) && positiveFinite(s["mappingToleranceFt"])),
  [AduRuleType.HEIGHT]: (s) => positiveFinite(s["maxFt"]) && positiveFinite(s["treeRetentionMaxFt"]) && nonNegativeFinite(s["pitchedRoofRidgeAllowanceFt"]),
  [AduRuleType.LOT_COVERAGE]: (s) => positiveFinite(s["maxPercent"]),
  [AduRuleType.FLOOR_AREA_RATIO]: (s) => bandsOk(s["bands"], "far") && positiveFinite(s["denserFar"]) && positiveFinite(s["smallLotAreaSqFt"]) && positiveFinite(s["smallLotMinChargeableSqFt"]),
  [AduRuleType.AMENITY_AREA]: (s) => (positiveFinite(s["requiredFractionOfLot"]) || positiveFinite(s["requiredFractionOfFloorArea"])) && positiveFinite(s["minSqFt"]) && positiveFinite(s["minDimensionFt"]),
  [AduRuleType.TREES]: (s) => bandsOk(s["bands"], "sqFtPerPoint") && positiveFinite(s["denserSqFtPerPoint"]) && positiveFinite(s["lotSqFtPerNewTree"]),
  [AduRuleType.CONVERSION]: (s) =>
    typeof s["existingBeforeDate"] === "string" &&
    !Number.isNaN(Date.parse(s["existingBeforeDate"] as string)) &&
    typeof s["housingCodeFirstSection"] === "string" &&
    typeof s["housingCodeLastSection"] === "string" &&
    typeof s["waivesSetbacksAndLotCoverage"] === "boolean" &&
    typeof s["directorMayWaiveAndModify"] === "boolean",
  [AduRuleType.ATTACHED]: (s) =>
    typeof s["capExemptionBeforeDate"] === "string" && !Number.isNaN(Date.parse(s["capExemptionBeforeDate"] as string)) && nonNegativeFinite(s["attachedGarageExclusionSqFt"]),
  [AduRuleType.COMM_SETBACKS]: (s) => positiveFinite(s["upperLevelAboveFt"]) && positiveFinite(s["openingMinFromResidentialLotFt"]) && positiveFinite(s["cornerTriangleFt"]) && typeof s["citation"] === "string",
  [AduRuleType.COMM_HEIGHT]: (s) => positiveFinite(s["safeMaxFt"]) && nonNegativeFinite(s["exceptionAllowanceFt"]) && typeof s["citation"] === "string",
  [AduRuleType.MF_COUNT]: (s) => positiveFinite(s["maxAdusPerLot"]) && typeof s["noDensityLimitText"] === "string",
  [AduRuleType.MF_NO_LOT_COVERAGE_LIMIT]: (s) => typeof s["statement"] === "string" && (s["statement"] as string).length > 0,
  [AduRuleType.MF_FLOOR_AREA_RATIO]: (s) => positiveFinite(s["far"]) && typeof s["zoneText"] === "string",
  [AduRuleType.MF_LANDSCAPING_NOTE]: (s) => typeof s["text"] === "string" && (s["text"] as string).length > 0,
  [AduRuleType.DESIGN_STANDARDS]: (s) =>
    (typeof s["noteText"] === "string" && (s["noteText"] as string).length > 0) ||
    (positiveFinite(s["pedestrianAccessMinWidthFt"]) && positiveFinite(s["streetFacingWithinFt"]) && positiveFinite(s["weatherProtectionFt"]) && positiveFinite(s["facadeOpeningsPercent"])),
};

interface ActiveRules {
  find<T>(ruleType: AduRuleType): { rule: RegulatoryRule; spec: T } | undefined;
  missing(required: readonly AduRuleType[]): AduRuleType[];
}

function ruleTypeOf(rule: RegulatoryRule): string | undefined {
  return (rule.ruleSpecification as { ruleType?: string }).ruleType;
}

function indexActiveRules(candidateActiveRules: RegulatoryRule[]): ActiveRules {
  const byType = new Map<string, RegulatoryRule>();
  for (const rule of candidateActiveRules) {
    if (rule.lifecycleState !== LifecycleState.ACTIVE) continue;
    const type = ruleTypeOf(rule);
    if (!type || !(type in SPEC_GUARDS)) continue;
    if (!SPEC_GUARDS[type]!(rule.ruleSpecification)) continue;
    if (!byType.has(type)) byType.set(type, rule);
  }
  return {
    find<T>(ruleType: AduRuleType) {
      const rule = byType.get(ruleType);
      return rule ? { rule, spec: rule.ruleSpecification as unknown as T } : undefined;
    },
    missing(required) {
      return required.filter((t) => !byType.has(t));
    },
  };
}

function applied(rule: RegulatoryRule): Finding["appliedRule"] {
  return { id: rule.id, subject: rule.subject, citation: rule.citation };
}

function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? `${r}` : `${r}`;
}
function sf(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

/** Gross floor area estimate: footprint x above-ground stories (underground floors are not counted). */
export function estimateAduFloorAreaSqFt(project: Pick<AduProjectDetails, "widthFt" | "depthFt" | "stories" | "conversion" | "attached">): number {
  if (project.attached) return project.attached.grossFloorAreaSqFt; // declared as the code counts it
  return aduFootprintSqFt(project) * (project.stories ?? 1);
}
/** A new ADU's footprint is declared; a conversion's is the mapped outline of the existing building (0 when it could not be matched). */
export function aduFootprintSqFt(project: Pick<AduProjectDetails, "widthFt" | "depthFt" | "conversion">): number {
  if (project.conversion) return project.conversion.structureAreaSqFt ?? 0;
  return (project.widthFt ?? 0) * (project.depthFt ?? 0);
}
export function isConversion(project: Pick<AduProjectDetails, "aduType">): boolean {
  return project.aduType === "CONVERSION_EXISTING";
}
export function isAttached(project: Pick<AduProjectDetails, "aduType">): boolean {
  return project.aduType === "ATTACHED_TO_HOUSE";
}
/**
 * Whether the conversion allowance (SMC 23.42.022.H.3.b) can be relied on:
 *  - YES: the building existed before the cutoff AND the conversion keeps its footprint and height (rebuilding in place at the same size counts);
 *  - NO: the building did not exist before the cutoff, so it is not an "existing accessory structure" (H.2);
 *  - PARTIAL: it existed but will be expanded, moved or enlarged: the existing building is covered as it stands, while the expansion or relocation must
 *    meet the ADU and zone standards (H.1) and where that would be was not collected, so nothing about it is measured;
 *  - UNSURE: either declaration is unknown.
 */
export type ConversionAllowance = "YES" | "NO" | "PARTIAL" | "UNSURE" | "NOT_A_CONVERSION";
export function conversionAllowance(project: Pick<AduProjectDetails, "aduType" | "conversion">): ConversionAllowance {
  if (project.aduType !== "CONVERSION_EXISTING" || !project.conversion) return "NOT_A_CONVERSION";
  const c = project.conversion;
  if (c.existedBeforeJuly2023 === false) return "NO";
  if (c.keepsFootprintAndHeight === false) return "PARTIAL";
  if (c.existedBeforeJuly2023 === true && c.keepsFootprintAndHeight === true) return "YES";
  return "UNSURE";
}
export function unitsAfterAdu(project: Pick<AduProjectDetails, "existingPrincipalDwellingUnits" | "existingAduCount">): number {
  return project.existingPrincipalDwellingUnits + project.existingAduCount + 1;
}

export function describeAduDeclaredInputs(project: AduProjectDetails): AduDeclaredInput[] {
  const yesNo = (v: boolean | undefined, yes = "Yes", no = "No") => (v === undefined ? "Not sure" : v ? yes : no);
  const rows: AduDeclaredInput[] = [];
  if (isAttached(project)) {
    const a = project.attached;
    rows.push(
      { label: "Type of ADU", value: "Inside or attached to the existing house" },
      { label: "Gross floor area (as the code counts it)", value: a ? `${sf(a.grossFloorAreaSqFt)} sq ft` : "Not provided" },
      { label: "Bedrooms", value: `${project.bedrooms}` },
      { label: "Any part in a new addition", value: a ? (a.includesAddition ? "Yes" : "No") : "Not provided" },
      { label: "The part of the house it is in existed before July 23, 2023", value: yesNo(a?.portionExistedBeforeJuly2023) }
    );
  } else if (isConversion(project)) {
    const c = project.conversion;
    rows.push(
      { label: "Type of ADU", value: "Conversion of an existing garage or shed" },
      { label: "Existing building's footprint", value: c?.structureAreaSqFt !== undefined ? `${sf(c.structureAreaSqFt)} sq ft (mapped outline)` : "Not matched to a mapped building" },
      { label: "Building existed before July 23, 2023", value: yesNo(c?.existedBeforeJuly2023) },
      { label: "Conversion keeps the footprint and height", value: yesNo(c?.keepsFootprintAndHeight) },
      { label: "Above-ground stories", value: `${project.stories}` },
      { label: "Estimated gross floor area", value: `${sf(estimateAduFloorAreaSqFt(project))} sq ft (footprint x stories)` },
      { label: "Bedrooms", value: `${project.bedrooms}` }
    );
  } else {
    rows.push(
      { label: "Type of ADU", value: "New detached ADU" },
      { label: "Footprint", value: `${num(project.widthFt ?? 0)} ft x ${num(project.depthFt ?? 0)} ft (${sf(aduFootprintSqFt(project))} sq ft)` },
      { label: "Above-ground stories", value: `${project.stories}` },
      { label: "Estimated gross floor area", value: `${sf(estimateAduFloorAreaSqFt(project))} sq ft (footprint x stories)` },
      { label: "Bedrooms", value: `${project.bedrooms}` },
      { label: "Height", value: `${num(project.heightFt ?? 0)} ft` }
    );
  }
  if (!isAttached(project)) rows.push({ label: "Rear lot line is on an alley", value: project.alleyAdjacent ? "Yes" : "No" });
  rows.push(
    { label: "Existing principal dwelling units on the lot", value: `${project.existingPrincipalDwellingUnits}` },
    { label: "Existing ADUs on the lot", value: `${project.existingAduCount}` },
    { label: "Existing house built before 1982", value: project.existingHouseBuiltBefore1982 === undefined ? "Not answered" : project.existingHouseBuiltBefore1982 ? "Yes" : "No" },
    {
      label: "Existing chargeable floor area (all structures)",
      value: project.existingChargeableFloorAreaSqFt === undefined ? "Not provided" : `${sf(project.existingChargeableFloorAreaSqFt)} sq ft`,
    }
  );
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------------------------

/** A placed footprint with less than this share inside the parcel boundary is treated as mis-placed (the small slack absorbs mapping error at a lot line). */
export const MIN_FOOTPRINT_INSIDE_FRACTION = 0.97;

function footprintOutsideParcel(project: AduProjectDetails): boolean {
  return project.aduType === "DETACHED_NEW" && project.footprintInsideParcelFraction !== undefined && project.footprintInsideParcelFraction < MIN_FOOTPRINT_INSIDE_FRACTION;
}

const SUBJECT = {
  COUNT: "Number of ADUs on the lot",
  DENSITY: "Dwelling units allowed on the lot (density)",
  SIZE: "ADU size limit",
  REAR: "ADU rear setback",
  SIDE: "ADU side setback",
  FRONT: "ADU front setback",
  STREET: "ADU setback from additional street frontage",
  SEPARATION: "Separation from the existing dwelling",
  OTHER_STRUCTURES: "Separation from other mapped structures",
  HEIGHT: "ADU height",
  LOT_COVERAGE: "Lot coverage",
  FAR: "Floor area ratio (FAR)",
  AMENITY: "Amenity area",
  TREES: "Tree requirement",
  DESIGN: "Design standards (pedestrian access, street-facing entry)",
  ECA: "Environmentally critical areas",
  POSITION: "ADU position on the lot",
  CONVERSION: "Conversion of an existing accessory structure",
  CONVERSION_SITING: "Setbacks and lot coverage (conversion)",
  CONVERSION_STRUCTURE: "Building to convert",
  CONVERSION_HEIGHT: "Height of the converted building",
  ATTACHED_SITING: "Setbacks, height and lot coverage (attached ADU)",
  HOUSING_CODE: "Minimum housing standards for the converted building",
} as const;

function known(subject: string, rule: RegulatoryRule, pass: boolean, supportingEvidence: string[], explanationBasis: string): Finding {
  return {
    classification: FindingClassification.KNOWN,
    subject,
    complianceOutcome: pass ? ComplianceOutcome.PASS : ComplianceOutcome.FAIL,
    appliedRule: applied(rule),
    supportingEvidence,
    explanationBasis,
  };
}
function verify(subject: string, rule: RegulatoryRule | undefined, supportingEvidence: string[], explanationBasis: string): Finding {
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    ...(rule ? { appliedRule: applied(rule) } : {}),
    supportingEvidence,
    explanationBasis,
  };
}

interface Evaluated {
  finding?: Finding;
  uncovered?: string;
  /** A short phrase for the headline when this finding is a known failure. */
  blocker?: string;
  /** A short phrase for the headline when this finding is a soft constraint (appears over a limit). */
  constraint?: string;
  /** What to verify first (added to the checklist when set). */
  verifyItem?: string;
}

function evaluateCount(project: AduProjectDetails, rules: ActiveRules): Evaluated {
  const mf = rules.find<AduMfCountSpec>(AduRuleType.MF_COUNT);
  const r = rules.find<AduCountAndDensitySpec>(AduRuleType.COUNT_AND_DENSITY) ?? (mf ? { rule: mf.rule, spec: { maxAdusPerLot: mf.spec.maxAdusPerLot } as AduCountAndDensitySpec } : undefined);
  if (!r) return { uncovered: "ADU count and density" };
  const after = project.existingAduCount + 1;
  const pass = after <= r.spec.maxAdusPerLot;
  const finding = known(
    SUBJECT.COUNT,
    r.rule,
    pass,
    [`existingAduCount=${project.existingAduCount}`, `maxAdusPerLot=${r.spec.maxAdusPerLot}`],
    `A lot may have no more than ${r.spec.maxAdusPerLot} ADUs (SMC 23.42.022.C). With the ${project.existingAduCount} you reported, this would be ADU number ${after}, which ${pass ? "is within" : "exceeds"} that limit. ${DECLARED_BASIS}`
  );
  return { finding, ...(pass ? {} : { blocker: `A lot may have no more than ${r.spec.maxAdusPerLot} ADUs and this would be number ${after}` }) };
}

function evaluateDensity(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
  const mf = rules.find<AduMfCountSpec>(AduRuleType.MF_COUNT);
  if (mf) {
    return { finding: known(SUBJECT.DENSITY, mf.rule, true, ["densityLimit=none"], `${mf.spec.noDensityLimitText} ${DECLARED_BASIS}`) };
  }
  const r = rules.find<AduCountAndDensitySpec>(AduRuleType.COUNT_AND_DENSITY);
  if (!r) return { uncovered: "dwelling-unit density" };
  const units = unitsAfterAdu(project);
  if (site.parcelAreaSqFt === undefined) {
    return {
      finding: verify(SUBJECT.DENSITY, r.rule, [`unitsAfterAdu=${units}`], `With this ADU the lot would have ${units} dwelling units, counting ADUs (SMC 23.44.060.D.5). The lot area was not available, so the density limit could not be calculated.`),
      verifyItem: "Confirm the lot area and the number of dwelling units allowed (SDCI or a survey).",
    };
  }
  const area = site.parcelAreaSqFt;
  const exactUnits = area / r.spec.lotSqFtPerUnit;
  const wholeUnits = Math.floor(exactUnits);
  // A fraction OVER the threshold (0.85) rounds up; exactly the threshold does not (SMC 23.44.060.D.1).
  const allowedByFormula = wholeUnits + (exactUnits - wholeUnits > r.spec.roundUpFractionOver + 1e-9 ? 1 : 0);
  const adjustment = evaluateEcaLotAreaAdjustment(site.ecaFindings);
  const mapIndicated = adjustment.status === "REQUIRES_VERIFICATION" ? (adjustment.mapIndicatedCategories?.length ?? 0) > 0 : false;
  const exclusionsNote =
    " Areas such as riparian corridors, wetlands and their buffers, shoreline setbacks and steep-slope non-disturbance areas are not counted in the lot area for density (SMC 23.44.060.D.6); Seattle's advisory maps cannot show whether any apply, so the lot area used is the whole parcel.";
  const evidence = [`parcelAreaSqFt=${Math.round(area)}`, `unitsAfterAdu=${units}`, `unitsAllowedByLotArea=${allowedByFormula}`];

  if (units <= allowedByFormula) {
    if (mapIndicated) {
      return {
        finding: verify(SUBJECT.DENSITY, r.rule, evidence, `This lot's area (${sf(area)} sq ft) allows ${allowedByFormula} dwelling units at one per ${sf(r.spec.lotSqFtPerUnit)} sq ft, and this project would make ${units}. A mapped critical-area layer indicates a possible excluded area, which would reduce the lot area counted.${exclusionsNote}`),
        verifyItem: "Confirm with SDCI that no excluded critical-area land reduces the lot area counted for density.",
      };
    }
    return { finding: known(SUBJECT.DENSITY, r.rule, true, evidence, `This lot's area (${sf(area)} sq ft) allows ${allowedByFormula} dwelling units at one per ${sf(r.spec.lotSqFtPerUnit)} sq ft (fractions over ${r.spec.roundUpFractionOver} round up), and this project would make ${units}, counting ADUs.${exclusionsNote}`) };
  }
  if (area < r.spec.smallLotMaxSqFt && units <= r.spec.smallLotMaxUnits) {
    return {
      finding: verify(SUBJECT.DENSITY, r.rule, evidence, `At one unit per ${sf(r.spec.lotSqFtPerUnit)} sq ft this lot allows ${allowedByFormula}, but a lot under ${sf(r.spec.smallLotMaxSqFt)} sq ft may have up to ${r.spec.smallLotMaxUnits} dwelling units if it contains no riparian corridor, wetland or buffer, shoreline setback or submerged land, or steep-slope non-disturbance area (SMC 23.44.060.C.1). This project would make ${units}. ${mapIndicated ? "A mapped critical-area layer indicates one of these may be present." : "Advisory maps cannot rule those areas out."}`),
      verifyItem: "Confirm with SDCI that the lot contains no critical-area land, which the small-lot unit allowance requires.",
    };
  }
  if (area < r.spec.midLotMaxSqFt && units <= r.spec.midLotMaxUnits) {
    return {
      finding: verify(SUBJECT.DENSITY, r.rule, evidence, `At one unit per ${sf(r.spec.lotSqFtPerUnit)} sq ft this lot allows ${allowedByFormula}; this project would make ${units}. A lot under ${sf(r.spec.midLotMaxSqFt)} sq ft may have up to ${r.spec.midLotMaxUnits} dwelling units in some circumstances (SMC 23.44.060.C.2 and C.3, which depend on distance to major transit service or on income-restricted units). Permit Preflight does not evaluate those.`),
      verifyItem: "Confirm with SDCI whether a higher unit allowance applies to this lot.",
    };
  }
  return {
    finding: known(SUBJECT.DENSITY, r.rule, false, evidence, `This lot's area (${sf(area)} sq ft) allows ${allowedByFormula} dwelling units at one per ${sf(r.spec.lotSqFtPerUnit)} sq ft, and this project would make ${units}, counting ADUs (SMC 23.44.060). No unit-count allowance for smaller lots applies.${exclusionsNote}`),
    blocker: `The lot allows ${allowedByFormula} dwelling units by area and this project would make ${units}`,
  };
}

function sizeBasis(project: AduProjectDetails): string {
  const stories = `${project.stories} ${project.stories === 1 ? "story" : "stories"}`;
  return isConversion(project) ? `the existing building's mapped ${sf(aduFootprintSqFt(project))} sq ft footprint x ${stories}` : `${num(project.widthFt ?? 0)} x ${num(project.depthFt ?? 0)} ft x ${stories}`;
}

/** Attached ADU size (SMC 23.42.022.G and H.4): the cap applies unless the ADU is in a portion of the structure that existed before the cutoff. */
function evaluateAttachedSize(project: AduProjectDetails, rules: ActiveRules): Evaluated {
  const r = rules.find<AduSizeLimitSpec>(AduRuleType.SIZE_LIMIT);
  const a = rules.find<AduAttachedSpec>(AduRuleType.ATTACHED);
  if (!r || !a) return { uncovered: "attached ADU size limit" };
  const att = project.attached!;
  const date = longDate(a.spec.capExemptionBeforeDate);
  const cap = project.bedrooms >= 3 ? r.spec.maxSqFtThreePlusBedrooms : r.spec.maxSqFtUpToTwoBedrooms;
  const est = att.grossFloorAreaSqFt;
  const evidence = [`grossFloorAreaSqFt=${Math.round(est)}`, `bedrooms=${project.bedrooms}`, `capSqFt=${cap}`];
  const limitText = `${project.bedrooms >= 3 ? "An ADU with three or more bedrooms" : "An ADU with up to two bedrooms"} may have up to ${sf(cap)} sq ft of gross floor area; underground floors, up to ${sf(a.spec.attachedGarageExclusionSqFt)} sq ft in an attached garage and up to ${r.spec.bikeParkingExclusionSqFt} sq ft of long-term bicycle parking are not counted (SMC 23.42.022.G)`;
  const declared = `The floor area is the figure you entered, ${sf(est)} sq ft.`;
  if (est <= cap) return { finding: known(SUBJECT.SIZE, r.rule, true, evidence, `${limitText}. ${declared} That is within the limit.`) };
  if (r.spec.conditionalExtendedCapSqFt !== undefined && est <= r.spec.conditionalExtendedCapSqFt) {
    return {
      finding: verify(SUBJECT.SIZE, r.rule, [...evidence, `conditionalExtendedCapSqFt=${r.spec.conditionalExtendedCapSqFt}`], `${limitText}. ${declared} That is over the limit by ${sf(est - cap)} sq ft. ${r.spec.conditionalExtendedCapText ?? `A larger cap of ${sf(r.spec.conditionalExtendedCapSqFt)} sq ft applies in some circumstances`} Whether those conditions are met is not determined here, so this is not a definite result.`),
      verifyItem: "Confirm with SDCI whether the larger size cap applies to this lot.",
    };
  }
  const status = att.portionExistedBeforeJuly2023 === false ? "APPLIES" : att.includesAddition ? "UNCLEAR" : att.portionExistedBeforeJuly2023 === true ? "EXEMPT" : "UNCLEAR";
  const exemption = `An attached ADU may exceed 1,000 square feet if the portion of the structure it is in existed before ${date} (SMC 23.42.022.H.4).`;
  if (status === "EXEMPT") {
    return {
      finding: verify(SUBJECT.SIZE, a.rule, evidence, `${limitText}. ${declared} That is over the limit by ${sf(est - cap)} sq ft, but ${exemption} You said the part of the house it is in existed before that date and no part is in an addition, so the limit may not apply; SDCI confirms that.`),
      verifyItem: `Confirm the part of the house existed before ${date} and how its floor area is counted.`,
    };
  }
  if (status === "UNCLEAR") {
    return {
      finding: verify(SUBJECT.SIZE, a.rule, evidence, `${limitText}. ${declared} That is over the limit by ${sf(est - cap)} sq ft. ${exemption} ${att.includesAddition ? "Part of the ADU is in an addition, so it is not clear that the exception covers all of it" : "You did not say whether the part of the house existed before that date"}; SDCI determines whether the limit applies.`),
      verifyItem: `Confirm with SDCI whether the size limit applies, given what existed before ${date}.`,
    };
  }
  if (est <= cap + r.spec.bikeParkingExclusionSqFt) {
    return { finding: verify(SUBJECT.SIZE, r.rule, evidence, `${limitText}. ${declared} That is over the limit by ${sf(est - cap)} sq ft, within the bicycle-parking allowance that is not counted.`), verifyItem: "Confirm how the ADU's gross floor area would be measured against the size limit." };
  }
  return {
    finding: known(SUBJECT.SIZE, a.rule, false, evidence, `${limitText}. ${declared} You said the part of the house it is in did not exist before ${date}, so the exception for existing portions does not apply, and it is over the limit by ${sf(est - cap)} sq ft.`),
    blocker: `The floor area of ${sf(est)} sq ft is over the ${sf(cap)} sq ft limit by ${sf(est - cap)} sq ft`,
  };
}

function evaluateSize(project: AduProjectDetails, rules: ActiveRules): Evaluated {
  if (isAttached(project)) return evaluateAttachedSize(project, rules);
  const r = rules.find<AduSizeLimitSpec>(AduRuleType.SIZE_LIMIT);
  if (!r) return { uncovered: "ADU size limit" };
  const cap = project.bedrooms >= 3 ? r.spec.maxSqFtThreePlusBedrooms : r.spec.maxSqFtUpToTwoBedrooms;
  const est = estimateAduFloorAreaSqFt(project);
  const evidence = [`estimatedGrossFloorAreaSqFt=${Math.round(est)}`, `bedrooms=${project.bedrooms}`, `capSqFt=${cap}`];
  const limitText = `${project.bedrooms >= 3 ? "An ADU with three or more bedrooms" : "An ADU with up to two bedrooms"} may have up to ${sf(cap)} sq ft of gross floor area (SMC 23.42.022.G)`;
  const basis = sizeBasis(project);
  if (est <= cap) {
    return { finding: known(SUBJECT.SIZE, r.rule, true, evidence, `${limitText}. Your ADU's estimated gross floor area is ${sf(est)} sq ft (${basis}). ${DECLARED_BASIS}`) };
  }
  if (r.spec.conditionalExtendedCapSqFt !== undefined && est <= r.spec.conditionalExtendedCapSqFt) {
    return {
      finding: verify(SUBJECT.SIZE, r.rule, [...evidence, `conditionalExtendedCapSqFt=${r.spec.conditionalExtendedCapSqFt}`], `${limitText}. Your ADU's estimated gross floor area is ${sf(est)} sq ft, over that limit by ${sf(est - cap)} sq ft. ${r.spec.conditionalExtendedCapText ?? `A larger cap of ${sf(r.spec.conditionalExtendedCapSqFt)} sq ft applies in some circumstances`} Whether those conditions are met is not determined here, so this is not a definite result.`),
      verifyItem: "Confirm with SDCI whether the larger size cap applies to this lot.",
    };
  }
  if (est <= cap + r.spec.bikeParkingExclusionSqFt) {
    return {
      finding: verify(SUBJECT.SIZE, r.rule, evidence, `${limitText}. Your ADU's estimated gross floor area is ${sf(est)} sq ft, over the limit by ${sf(est - cap)} sq ft. Up to ${r.spec.bikeParkingExclusionSqFt} sq ft of long-term bicycle parking is not counted, which could bring it within the limit.`),
      verifyItem: "Confirm how the ADU's gross floor area would be measured against the size limit.",
    };
  }
  return {
    finding: known(SUBJECT.SIZE, r.rule, false, evidence, `${limitText}. Your ADU's estimated gross floor area is ${sf(est)} sq ft (${basis}), over the limit by ${sf(est - cap)} sq ft. ${DECLARED_BASIS}`),
    blocker: `The estimated floor area of ${sf(est)} sq ft is over the ${sf(cap)} sq ft limit by ${sf(est - cap)} sq ft`,
  };
}

/** Where a mapped distance lies relative to a minimum threshold, with a margin for mapping accuracy: a result is
 * definite only when the distance clears the threshold, or falls short of it, by more than the margin. */
function againstThreshold(distanceFt: number, thresholdFt: number, toleranceFt: number): "CLEARS" | "SHORT" | "NEAR" {
  if (distanceFt >= thresholdFt + toleranceFt) return "CLEARS";
  if (distanceFt < thresholdFt - toleranceFt) return "SHORT";
  return "NEAR";
}
function nearText(distanceFt: number, thresholdFt: number, toleranceFt: number): string {
  return `${num(distanceFt)} ft is within ${num(toleranceFt)} ft of the ${num(thresholdFt)} ft requirement, which is closer than distances measured from county parcel mapping can be relied on (that mapping is not a survey), so it is not treated as a definite result.`;
}

const NO_PLACEMENT = "The ADU's position on the lot was not established, so its distance to the property lines could not be measured.";

function placementGap(project: AduProjectDetails): string | undefined {
  if (project.distanceToRearLotLineFt === undefined && project.distanceToSideLotLineFt === undefined && project.distanceToFrontLotLineFt === undefined) {
    return project.setbackEvidenceGapReason ?? NO_PLACEMENT;
  }
  return undefined;
}

/** True when the spatial measurements come from a source the rule has not been approved to rely on. */
function spatialQualityGate(project: AduProjectDetails, rule: RegulatoryRule): string | undefined {
  const q = project.spatialEvidenceQuality;
  if (q === undefined || q === EvidenceQuality.AUTHORITATIVE) return undefined;
  if (rule.acceptedEvidenceQuality.includes(q)) return undefined;
  return `The distance rests on ${q} parcel geometry, which this rule has not been approved to rely on, so it is not treated as a definite result.`;
}

/** Neighborhood Commercial and Commercial zones (SMC 23.47A.014): no setback unless a residential zone abuts the lot or is across an alley from it. */
function evaluateCommSetbacks(project: AduProjectDetails, rules: ActiveRules): Evaluated[] | undefined {
  const r = rules.find<AduCommSetbacksSpec>(AduRuleType.COMM_SETBACKS);
  if (!r) return undefined;
  const status = project.abutsResidentialZone ?? "UNKNOWN";
  const evidence = [`abutsResidentialZone=${status}`, ...(project.adjacentResidentialZones?.length ? [`adjacentResidentialZones=${project.adjacentResidentialZones.join(",")}`] : [])];
  if (status === "NO") {
    return [{ finding: known("ADU setbacks in a commercial zone", r.rule, true, evidence, `${r.spec.citation} requires a setback in a Neighborhood Commercial or Commercial zone only where a lot abuts, or is across an alley from, a residential zone. Seattle's zoning data shows no residential zone abutting or across an alley from this property, so the ADU has no zoning setback requirement from this section. Chapter 23.53 can still require a setback for street or alley widening, which is not evaluated. ${DECLARED_BASIS}`) }];
  }
  const why = status === "YES" ? `Seattle's zoning data shows residential zoning abutting or across an alley from this property (${project.adjacentResidentialZones?.join(", ") ?? "residential zone"}).` : "Whether a residential zone abuts this property could not be read from Seattle's zoning data.";
  return [{
    finding: verify("ADU setbacks in a commercial zone", r.rule, evidence, `${why} Where a lot abuts a residential zone, ${r.spec.citation} requires a triangular setback at the corner of an abutting residential lot (${num(r.spec.cornerTriangleFt)} ft along the street and side lot lines), an upper-level setback for any portion of a structure above ${num(r.spec.upperLevelAboveFt)} ft${project.heightFt !== undefined ? (project.heightFt > r.spec.upperLevelAboveFt ? ` (the ADU is ${num(project.heightFt)} ft tall)` : ` (the ADU is ${num(project.heightFt)} ft tall, so it is not above that height)`) : ""}, and no entrance, window or other opening closer than ${num(r.spec.openingMinFromResidentialLotFt)} ft to an abutting residentially zoned lot. Which lot line abuts the residential lot and where the openings would be are not known to Permit Preflight, so this is left for SDCI to confirm.`),
    verifyItem: "Confirm with SDCI whether a residential zone abuts the lot and which setbacks follow.",
  }];
}

function evaluateSetbacks(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated[] {
  const comm = evaluateCommSetbacks(project, rules);
  if (comm) return comm;
  const r = rules.find<AduSetbacksSpec>(AduRuleType.SETBACKS);
  if (!r) return [{ uncovered: "ADU setbacks" }];
  const out: Evaluated[] = [];
  // Midrise and Highrise: the side setback grows for portions above 42 ft (and a Highrise structure over 85 ft follows another table), so a taller ADU gets no definite result.
  if (r.spec.tableMaxHeightFt !== undefined && project.heightFt !== undefined && project.heightFt > r.spec.tableMaxHeightFt) {
    return [{
      finding: verify(SUBJECT.REAR, r.rule, [`heightFt=${project.heightFt}`, `tableMaxHeightFt=${r.spec.tableMaxHeightFt}`], r.spec.tallerStructureText ?? `The ADU is ${num(project.heightFt)} ft tall, above the ${num(r.spec.tableMaxHeightFt)} ft the setback table is written for, so its setbacks are not given a definite result.`),
      verifyItem: "Confirm the setbacks for the taller portions of the structure with SDCI.",
    }];
  }
  const gap = placementGap(project);
  const gate = spatialQualityGate(project, r.rule);
  const units = unitsAfterAdu(project);
  const area = site.parcelAreaSqFt;
  const smallFtsaLot = area !== undefined && area < r.spec.smallLotAreaSqFt && site.inFrequentTransitServiceArea === true;
  const unknownSmallLotTransit = area !== undefined && area < r.spec.smallLotAreaSqFt && site.inFrequentTransitServiceArea === undefined;
  // The reduced small-lot side setback exists only in Neighborhood Residential (smallLotAreaSqFt is 1 where a zone has none, so it can never apply).
  const smallLotRuleApplies = r.spec.smallLotAreaSqFt > 1;

  // Rear
  {
    const required = project.alleyAdjacent ? r.spec.rearAlleyFt : r.spec.rearFt;
    const d = project.distanceToRearLotLineFt;
    if (d === undefined) {
      out.push({ finding: verify(SUBJECT.REAR, r.rule, [], `Cannot evaluate: ${gap ?? project.setbackEvidenceGapReason ?? "the distance to the rear lot line is not available."}`), verifyItem: "Confirm the lot lines with a survey and place the ADU on them." });
    } else if (project.rearRoleEvidenceGapReason !== undefined) {
      out.push({
        finding: verify(SUBJECT.REAR, r.rule, [`distanceToRearLotLineFt=${d}`], `The distance to your indicated rear property line is ${num(d)} ft, but ${project.rearRoleEvidenceGapReason}`),
        verifyItem: "Confirm which property line is the rear line (a corner or through lot changes the setbacks).",
      });
    } else if (gate) {
      out.push({ finding: verify(SUBJECT.REAR, r.rule, [`distanceToRearLotLineFt=${d}`], `${num(d)} ft to the rear lot line against a ${num(required)} ft setback. ${gate}`) });
    } else if (required === 0) {
      out.push({ finding: known(SUBJECT.REAR, r.rule, true, [`distanceToRearLotLineFt=${d}`, `requiredFt=0`, `alleyAdjacent=true`], `The rear lot line abuts an alley, so no rear setback is required (${r.spec.rearAlleyCitation ?? r.spec.citation ?? "SMC 23.44.090 Table A, footnote 3"}). ${DECLARED_BASIS}`) });
    } else {
      const rearCite = r.spec.citation ?? "SMC 23.44.090 Table A, footnote 3";
      const rearMin = project.alleyAdjacent ? undefined : r.spec.rearMinFt;
      const where = rearMin !== undefined ? (d >= required + r.spec.mappingToleranceFt ? "CLEARS" : d < rearMin - r.spec.mappingToleranceFt ? "SHORT" : "NEAR") : againstThreshold(d, required, r.spec.mappingToleranceFt);
      if (where === "NEAR") {
        out.push({ finding: verify(SUBJECT.REAR, r.rule, [`distanceToRearLotLineFt=${d}`, `requiredFt=${required}`], `The ADU would be ${num(d)} ft from the rear lot line against a ${num(required)} ft rear setback${rearMin !== undefined ? ` (${num(rearMin)} ft minimum)` : ""} (${rearCite}). ${nearText(d, rearMin !== undefined && d < required ? required : required, r.spec.mappingToleranceFt)}`), verifyItem: "Confirm the rear lot line with a survey; the ADU is close to the rear setback." });
      } else {
        const pass = where === "CLEARS";
        out.push({
          finding: known(SUBJECT.REAR, r.rule, pass, [`distanceToRearLotLineFt=${d}`, `requiredFt=${required}`, `alleyAdjacent=${project.alleyAdjacent}`], `The ADU would be ${num(d)} ft from the rear lot line. An ADU's rear setback is ${num(required)} ft (${rearCite}), so it ${pass ? "meets" : "does not meet"} that setback. ${DECLARED_BASIS}`),
          ...(pass ? {} : { blocker: `The ADU is ${num(d)} ft from the rear lot line; ${num(required)} ft is required` }),
        });
      }
    }
  }

  // Side
  {
    const d = project.distanceToSideLotLineFt;
    const minRequired = smallFtsaLot ? r.spec.smallLotSideFt : r.spec.sideMinFt;
    if (d === undefined) {
      out.push({ finding: verify(SUBJECT.SIDE, r.rule, [], `Cannot evaluate: ${gap ?? project.setbackEvidenceGapReason ?? "the distance to the side lot line is not available."}`) });
    } else if (project.sideRoleEvidenceGapReason !== undefined) {
      out.push({ finding: verify(SUBJECT.SIDE, r.rule, [`distanceToSideLotLineFt=${d}`], `The distance to your nearest indicated side property line is ${num(d)} ft, but ${project.sideRoleEvidenceGapReason}`) });
    } else if (gate) {
      out.push({ finding: verify(SUBJECT.SIDE, r.rule, [`distanceToSideLotLineFt=${d}`], `${num(d)} ft to the nearest side lot line. ${gate}`) });
    } else {
      const minWhere = againstThreshold(d, minRequired, r.spec.mappingToleranceFt);
      if (minWhere === "SHORT") {
        out.push({
          finding: known(SUBJECT.SIDE, r.rule, false, [`distanceToSideLotLineFt=${d}`, `minimumFt=${minRequired}`], `The ADU would be ${num(d)} ft from the nearest side lot line. The side setback is never less than ${num(minRequired)} ft (${r.spec.citation ?? "SMC 23.44.090 Table A"}). ${DECLARED_BASIS}`),
          blocker: `The ADU is ${num(d)} ft from a side lot line; at least ${num(minRequired)} ft is required`,
        });
      } else if (minWhere === "NEAR") {
        out.push({
          finding: verify(SUBJECT.SIDE, r.rule, [`distanceToSideLotLineFt=${d}`, `minimumFt=${minRequired}`], `The ADU would be ${num(d)} ft from the nearest side lot line against a ${num(minRequired)} ft minimum side setback (${r.spec.citation ?? "SMC 23.44.090 Table A"}). ${nearText(d, minRequired, r.spec.mappingToleranceFt)}`),
          verifyItem: "Confirm the side lot line with a survey; the ADU is close to the side setback.",
        });
      } else if (smallFtsaLot || againstThreshold(d, r.spec.sideAverageFt, r.spec.mappingToleranceFt) === "CLEARS") {
        out.push({
          finding: known(SUBJECT.SIDE, r.rule, true, [`distanceToSideLotLineFt=${d}`, `requiredFt=${smallFtsaLot ? r.spec.smallLotSideFt : r.spec.sideAverageFt}`], `The ADU would be ${num(d)} ft from the nearest side lot line, which meets the side setback (${smallFtsaLot ? `${num(r.spec.smallLotSideFt)} ft on a lot under ${sf(r.spec.smallLotAreaSqFt)} sq ft in a frequent transit service area` : `${num(r.spec.sideAverageFt)} ft average, ${num(r.spec.sideMinFt)} ft minimum`}; ${r.spec.citation ?? "SMC 23.44.090 Table A"}). ${DECLARED_BASIS}`),
        });
      } else {
        out.push({
          finding: verify(SUBJECT.SIDE, r.rule, [`distanceToSideLotLineFt=${d}`], `The ADU would be ${num(d)} ft from the nearest side lot line. That meets the ${num(r.spec.sideMinFt)} ft minimum, but the standard side setback is ${num(r.spec.sideAverageFt)} ft on average along the wall (${r.spec.citation ?? "SMC 23.44.090 Table A"}), so whether the average is met depends on the shape of the wall${smallLotRuleApplies ? `, and ${unknownSmallLotTransit ? "whether this lot qualifies for the reduced setback on small lots in a frequent transit service area could not be determined" : "this lot does not qualify for the reduced small-lot setback"}` : ""}.`),
          verifyItem: `Confirm the side setback with the proposed wall layout (${num(r.spec.sideAverageFt)} ft average, ${num(r.spec.sideMinFt)} ft minimum).`,
        });
      }
    }
  }

  // Front
  {
    const d = project.distanceToFrontLotLineFt;
    if (d === undefined) {
      out.push({ finding: verify(SUBJECT.FRONT, r.rule, [], `Cannot evaluate: ${gap ?? project.setbackEvidenceGapReason ?? "the distance to the front lot line is not available."}`) });
    } else if (project.frontRoleEvidenceGapReason !== undefined) {
      out.push({
        finding: verify(SUBJECT.FRONT, r.rule, [`distanceToFrontLotLineFt=${d}`], `The distance to your indicated front property line is ${num(d)} ft, but ${project.frontRoleEvidenceGapReason}`),
        verifyItem: "Confirm which property line is the front line (corner and through lots change the setbacks).",
      });
    } else if (gate) {
      out.push({ finding: verify(SUBJECT.FRONT, r.rule, [`distanceToFrontLotLineFt=${d}`], `${num(d)} ft to the front lot line. ${gate}`) });
    } else {
      const requiredFront = units >= 3 ? r.spec.frontThreeOrMoreUnitsFt : r.spec.frontFt;
      const frontCite = r.spec.citation ?? "SMC 23.44.090 Table A";
      // Where the zone states a minimum below the average (Lowrise 7 ft average, 5 ft minimum), only a distance clearly short of the minimum fails.
      const wFront = r.spec.frontMinFt !== undefined ? (d >= r.spec.frontFt + r.spec.mappingToleranceFt ? "CLEARS" : d < r.spec.frontMinFt - r.spec.mappingToleranceFt ? "SHORT" : "NEAR") : againstThreshold(d, r.spec.frontFt, r.spec.mappingToleranceFt);
      if (wFront === "CLEARS") {
        out.push({ finding: known(SUBJECT.FRONT, r.rule, true, [`distanceToFrontLotLineFt=${d}`, `requiredFt=${r.spec.frontFt}`], `The ADU would be ${num(d)} ft from the front lot line, which meets the ${num(r.spec.frontFt)} ft front setback (${frontCite}). ${DECLARED_BASIS}`) });
      } else if (units >= 3 && againstThreshold(d, requiredFront, r.spec.mappingToleranceFt) !== "SHORT") {
        out.push({
          finding: verify(SUBJECT.FRONT, r.rule, [`distanceToFrontLotLineFt=${d}`, `unitsAfterAdu=${units}`], `The ADU would be ${num(d)} ft from the front lot line. The front setback is ${num(r.spec.frontFt)} ft for lots with one or two dwelling units and ${num(r.spec.frontThreeOrMoreUnitsFt)} ft for lots with three or more (SMC 23.44.090 Table A). With this ADU the lot would have ${units}; whether ADUs count toward the three is for SDCI to confirm. ${wFront === "NEAR" ? nearText(d, r.spec.frontFt, r.spec.mappingToleranceFt) : ""}`.trim()),
          verifyItem: "Confirm the front setback that applies when the lot has three dwelling units.",
        });
      } else if (wFront === "NEAR") {
        out.push({ finding: verify(SUBJECT.FRONT, r.rule, [`distanceToFrontLotLineFt=${d}`], `The ADU would be ${num(d)} ft from the front lot line against a ${num(r.spec.frontFt)} ft front setback (${frontCite}). ${nearText(d, r.spec.frontFt, r.spec.mappingToleranceFt)}`), verifyItem: "Confirm the front lot line with a survey; the ADU is close to the front setback." });
      } else {
        out.push({
          finding: known(SUBJECT.FRONT, r.rule, false, [`distanceToFrontLotLineFt=${d}`, `requiredFt=${requiredFront}`], `The ADU would be ${num(d)} ft from the front lot line; the front setback is ${num(requiredFront)} ft (${frontCite}). ${DECLARED_BASIS}`),
          blocker: `The ADU is ${num(d)} ft from the front lot line; ${num(requiredFront)} ft is required`,
        });
      }
    }
  }

  // Additional street frontage (corner / through lot): never resolved from the parcel shape alone.
  if (project.unresolvedStreetFrontageDistancesFt && Object.keys(project.unresolvedStreetFrontageDistancesFt).length > 0) {
    const min = Math.min(...Object.values(project.unresolvedStreetFrontageDistancesFt));
    out.push({
      finding: verify(SUBJECT.STREET, r.rule, Object.entries(project.unresolvedStreetFrontageDistancesFt).map(([edge, dist]) => `${edge}=${dist}`), `This property has additional street frontage (closest measured distance ${num(min)} ft). On a through lot every setback along a street is a front setback (SMC 23.44.090.B), and on a corner lot SDCI determines the front line (SMC 23.84A.024); neither can be established from the lot's own boundary shape.`),
      verifyItem: "Confirm with SDCI which lot lines are front lines (corner or through lot).",
    });
  }
  return out;
}

function evaluateSeparation(project: AduProjectDetails, rules: ActiveRules, conversionRule?: { spec: AduConversionSpec }): Evaluated[] {
  const r = rules.find<AduSeparationSpec>(AduRuleType.SEPARATION);
  if (!r) return [{ uncovered: "separation between structures" }];
  if (r.spec.noRequirementText !== undefined) {
    return [{ finding: { classification: FindingClassification.KNOWN, subject: SUBJECT.SEPARATION, complianceOutcome: ComplianceOutcome.PASS, appliedRule: { id: r.rule.id, subject: r.rule.subject, citation: r.rule.citation }, supportingEvidence: ["noSeparationRequirementInZone=true"], explanationBasis: r.spec.noRequirementText } }];
  }
  const out: Evaluated[] = [];
  const d = project.distanceToDwellingFt;
  if (d === undefined) {
    out.push({
      finding: verify(SUBJECT.SEPARATION, r.rule, [], `Cannot evaluate: ${project.dwellingSeparationEvidenceGapReason ?? "the distance to the existing dwelling is not available."} Structures containing floor area must be at least ${num(r.spec.minFt)} ft apart (${r.spec.citation ?? "SMC 23.44.100.A"}).`),
      verifyItem: "Identify the existing house on the map so its distance to the ADU can be measured.",
    });
  } else {
    const where = againstThreshold(d, r.spec.minFt, r.spec.mappingToleranceFt);
    const pass = where === "CLEARS";
    if (isConversion(project) && where !== "CLEARS") {
      // The conversion allowance names lot coverage and yard or setback provisions, not the separation between structures, and the
      // Director may waive or modify standards to facilitate a conversion: so a short separation is never a known failure here.
      out.push({
        finding: verify(SUBJECT.SEPARATION, r.rule, [`distanceToDwellingFt=${d}`, `requiredFt=${r.spec.minFt}`], `The building to convert is ${num(d)} ft from the existing dwelling; structures containing floor area must be at least ${num(r.spec.minFt)} ft apart (${r.spec.citation ?? "SMC 23.44.100.A"}). The conversion allowance covers lot coverage and setbacks, not this separation${conversionRule?.spec.directorMayWaiveAndModify ? ", though the Director may allow waivers and modifications to facilitate a conversion (SMC 23.42.022.H.3.a)" : ""}, so this is for SDCI to resolve.${where === "NEAR" ? ` ${nearText(d, r.spec.minFt, r.spec.mappingToleranceFt)}` : ""}`),
        constraint: `The building to convert is ${num(d)} ft from the house; the 5 ft separation may need a waiver`,
        verifyItem: "Ask SDCI whether the 5 ft separation applies to this conversion or can be waived.",
      });
    } else if (where === "NEAR") {
      out.push({
        finding: verify(SUBJECT.SEPARATION, r.rule, [`distanceToDwellingFt=${d}`, `requiredFt=${r.spec.minFt}`], `The ADU would be ${num(d)} ft from the existing dwelling; structures containing floor area must be at least ${num(r.spec.minFt)} ft apart (${r.spec.citation ?? "SMC 23.44.100.A"}). ${nearText(d, r.spec.minFt, r.spec.mappingToleranceFt)}`),
        verifyItem: "Measure the distance between the ADU and the house on a survey; it is close to the 5 ft separation.",
      });
    } else out.push({
      finding: known(SUBJECT.SEPARATION, r.rule, pass, [`distanceToDwellingFt=${d}`, `requiredFt=${r.spec.minFt}`], `The ADU would be ${num(d)} ft from the existing dwelling. Structures containing floor area must be at least ${num(r.spec.minFt)} ft apart (${r.spec.citation ?? "SMC 23.44.100.A"}; eaves may project up to 2 ft into the separation), so it ${pass ? "meets" : "does not meet"} that requirement. ${DECLARED_BASIS}`),
      ...(pass ? {} : { blocker: `The ADU is ${num(d)} ft from the existing house; ${num(r.spec.minFt)} ft is required` }),
    });
  }
  const other = project.nearestOtherStructure;
  if (other && other.distanceFt < r.spec.minFt) {
    out.push({
      finding: verify(SUBJECT.OTHER_STRUCTURES, r.rule, [`nearestOtherStructureFt=${other.distanceFt}`], `Another mapped building${other.areaSqFt ? ` (about ${sf(other.areaSqFt)} sq ft)` : ""} is ${num(other.distanceFt)} ft from the ADU. The ${num(r.spec.minFt)} ft separation applies between structures that contain floor area (${r.spec.citation ?? "SMC 23.44.100.A"}); whether that building contains floor area (a garage or shed may not count the same way) is for SDCI to confirm.`),
      verifyItem: "Confirm whether the nearby building counts as a structure with floor area for the 5 ft separation.",
    });
  }
  return out;
}

/** Neighborhood Commercial and Commercial zones (SMC 23.47A.012): the height limit is the one mapped on the Official Land Use Map (the number in the zone designation). */
function evaluateCommHeight(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated | undefined {
  const r = rules.find<AduCommHeightSpec>(AduRuleType.COMM_HEIGHT);
  if (!r) return undefined;
  const height = project.heightFt ?? 0;
  const mapped = site.mappedHeightFt;
  const evidence = [`heightFt=${height}`, `safeMaxFt=${r.spec.safeMaxFt}`, ...(mapped !== undefined ? [`mappedHeightFt=${mapped}`] : [])];
  if (height <= r.spec.safeMaxFt) {
    return { finding: known(SUBJECT.HEIGHT, r.rule, true, evidence, `The height limit in a Neighborhood Commercial or Commercial zone is the height mapped for the zone (the number in its designation, ${num(r.spec.safeMaxFt)} ft at the lowest; ${r.spec.citation}). The ADU's height of ${num(height)} ft is within even the lowest mapped limit, so it is within this zone's limit. ${DECLARED_BASIS}`) };
  }
  if (mapped !== undefined) {
    if (height <= mapped) return { finding: known(SUBJECT.HEIGHT, r.rule, true, evidence, `The height limit here is the ${num(mapped)} ft mapped for this zone (${r.spec.citation}). The ADU's height of ${num(height)} ft is within it. ${DECLARED_BASIS}`) };
    return { finding: verify(SUBJECT.HEIGHT, r.rule, evidence, `The ADU's height of ${num(height)} ft is over the ${num(mapped)} ft limit mapped for this zone (${r.spec.citation}) ${height > mapped + r.spec.exceptionAllowanceFt ? `and well above the most that the height exceptions in that section add (${num(r.spec.exceptionAllowanceFt)} ft), though the full set of exceptions is not evaluated here, so this is not given as a definite failure` : `but within the most that the height exceptions in that section can add (${num(r.spec.exceptionAllowanceFt)} ft), which depend on street-level uses and other conditions not known here`}.`), verifyItem: "Confirm with SDCI whether a height exception applies." };
  }
  return { finding: verify(SUBJECT.HEIGHT, r.rule, evidence, `The height limit in a Neighborhood Commercial or Commercial zone is the height mapped for the zone (the number in its designation; ${r.spec.citation}), which can be as low as ${num(r.spec.safeMaxFt)} ft. The ADU is ${num(height)} ft tall, above that lowest limit, and the mapped limit for this property could not be read from a single designation, so it is left for SDCI to confirm.`), verifyItem: "Confirm the mapped height limit for the property." };
}

function evaluateHeight(project: AduProjectDetails, rules: ActiveRules, site: AduSiteFacts = { ecaFindings: [] }): Evaluated {
  const comm = evaluateCommHeight(project, site, rules);
  if (comm) return comm;
  const r = rules.find<AduHeightSpec>(AduRuleType.HEIGHT);
  if (!r) return { uncovered: "ADU height" };
  const height = project.heightFt ?? 0;
  const base = r.spec.maxFt;
  const evidence = [`heightFt=${height}`, `limitFt=${base}`];
  if (height <= base) {
    return { finding: known(SUBJECT.HEIGHT, r.rule, true, evidence, `The ADU's height of ${num(height)} ft is within the ${num(base)} ft height limit (${r.spec.citation ?? "SMC 23.44.070.A"}). ${DECLARED_BASIS}`) };
  }
  const ceiling = r.spec.treeRetentionMaxFt + r.spec.pitchedRoofRidgeAllowanceFt;
  if (height <= ceiling) {
    return {
      finding: verify(SUBJECT.HEIGHT, r.rule, evidence, `The ADU's height of ${num(height)} ft is over the ${num(base)} ft limit. ${r.spec.higherLimitText ?? `The limit is ${num(r.spec.treeRetentionMaxFt)} ft on lots that retain certain trees or earn enough tree points (SMC 23.44.070.A.2)`}, and ${r.spec.pitchedRoofText ?? `a pitched-roof ridge may rise up to ${num(r.spec.pitchedRoofRidgeAllowanceFt)} ft above the limit (SMC 23.44.070.B)`}. Whether either applies is not determined here.`),
      verifyItem: "Confirm how the ADU's height is measured and whether a taller height limit applies.",
    };
  }
  return {
    finding: known(SUBJECT.HEIGHT, r.rule, false, evidence, `The ADU's height of ${num(height)} ft is over even the tallest limit that can apply (${num(r.spec.treeRetentionMaxFt)} ft${r.spec.higherLimitText ? " where the higher limit applies" : " with the tree allowance"}, plus up to ${num(r.spec.pitchedRoofRidgeAllowanceFt)} ft for a pitched-roof ridge; ${r.spec.citation ?? "SMC 23.44.070"}). ${DECLARED_BASIS}`),
    blocker: `The ADU is ${num(height)} ft tall, over the tallest limit that can apply (${num(ceiling)} ft)`,
  };
}

function evaluateLotCoverage(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
  const noLimit = rules.find<AduMfNoLotCoverageLimitSpec>(AduRuleType.MF_NO_LOT_COVERAGE_LIMIT);
  if (noLimit) return { finding: known(SUBJECT.LOT_COVERAGE, noLimit.rule, true, ["lotCoverageLimit=none"], `${noLimit.spec.statement} ${DECLARED_BASIS}`) };
  const r = rules.find<AduLotCoverageSpec>(AduRuleType.LOT_COVERAGE);
  if (!r) return { uncovered: "lot coverage" };
  if (site.parcelAreaSqFt === undefined || site.existingMappedCoverageSqFt === undefined) {
    return {
      finding: verify(SUBJECT.LOT_COVERAGE, r.rule, [], `Lot coverage could not be estimated because ${site.parcelAreaSqFt === undefined ? "the lot area" : "the footprints of the existing buildings"} was not available. The limit is ${num(r.spec.maxPercent)}% of the lot area (SMC 23.44.080.A).`),
      verifyItem: "Confirm lot coverage with a survey and the footprints of all structures.",
    };
  }
  const result = evaluateShedLotCoverage({
    parcelAreaSqFt: site.parcelAreaSqFt,
    existingMappedCoverageSqFt: site.existingMappedCoverageSqFt,
    // A conversion that keeps the building's footprint adds no coverage (it is already in the mapped existing
    // buildings); an addition, relocation or rebuild is not measured and is stated as such below.
    proposedShedFootprintSqFt: isConversion(project) ? 0 : aduFootprintSqFt(project),
    ecaAdjustment: evaluateEcaLotAreaAdjustment(site.ecaFindings),
  });
  const pct = Math.round((result.estimatedCoverageSqFt / site.parcelAreaSqFt) * 100);
  const existingPart = `${sf(site.existingMappedCoverageSqFt)} sq ft of mapped existing buildings`;
  const addedPart = isConversion(project)
    ? `${existingPart}. The building to convert is already among them${project.conversion?.keepsFootprintAndHeight === true ? "" : "; any addition, relocation or rebuild would add coverage that is not measured here"}.`
    : `${existingPart} plus the ${sf(aduFootprintSqFt(project))} sq ft ADU footprint.`;
  const lead = `Estimated lot coverage with the ADU is ${pct}% (${sf(result.estimatedCoverageSqFt)} sq ft of ${sf(site.parcelAreaSqFt)} sq ft): ${addedPart} The standard limit is ${num(r.spec.maxPercent)}% (SMC 23.44.080.A). The existing figure comes from Seattle's building-outline map, which can differ from what counts for lot coverage (for example, eaves under 36 inches and low decks are not counted).`;
  const evidence = [`estimatedCoverageSqFt=${Math.round(result.estimatedCoverageSqFt)}`, `parcelAreaSqFt=${Math.round(site.parcelAreaSqFt)}`];
  const verifyItem = "Confirm lot coverage (and any critical-area land excluded from the lot area) with a survey.";
  switch (result.status) {
    case "WITHIN_STANDARD_ALLOWANCE":
      // A planned addition, relocation or enlargement of a converted building is not measured, so an in-limit existing figure is never a definite result.
      if (isConversion(project) && project.conversion?.keepsFootprintAndHeight !== true) {
        return { finding: verify(SUBJECT.LOT_COVERAGE, r.rule, evidence, `${lead} This is within the standard limit for the existing buildings, but any addition or relocation is not included and would count.`), verifyItem };
      }
      return { finding: known(SUBJECT.LOT_COVERAGE, r.rule, true, evidence, `${lead} This is within the standard limit.`) };
    case "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE": {
      const tol = result.exclusionTolerance?.explanation.join(" ");
      return {
        finding: verify(SUBJECT.LOT_COVERAGE, r.rule, evidence, `${lead} This appears to exceed the limit${tol ? `. ${tol}` : ""}${result.parcelSpecificApprovalDisclosure ? ` ${result.parcelSpecificApprovalDisclosure}` : ""}`),
        constraint: `Estimated lot coverage of ${pct}% appears to exceed the ${num(r.spec.maxPercent)}% limit`,
        verifyItem,
      };
    }
    case "REQUIRES_VERIFICATION": {
      let tail = "";
      if (result.reason === "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE") tail = " This is over the standard limit; a higher limit applies only to certain developments and Permit Preflight does not determine whether this one qualifies.";
      else if (result.reason === "LOT_AREA_ADJUSTMENT_UNRESOLVED") tail = ` ${result.exclusionTolerance?.explanation.join(" ") ?? ""} ${result.parcelSpecificApprovalDisclosure ?? ""}`;
      else if (result.reason === "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE") tail = " This appears over the limit; SDCI can approve a different amount on some lots with critical areas.";
      return { finding: verify(SUBJECT.LOT_COVERAGE, r.rule, evidence, `${lead}${tail}`.trim()), verifyItem };
    }
    default: {
      const exhaustive: never = result;
      throw new Error(`Unhandled lot coverage status ${JSON.stringify(exhaustive)}`);
    }
  }
}

function sqFtPerUnitBand<T extends { overSqFtPerUnit: number }>(bands: T[], sqFtPerUnit: number): T | undefined {
  return [...bands].sort((a, b) => b.overSqFtPerUnit - a.overSqFtPerUnit).find((b) => sqFtPerUnit > b.overSqFtPerUnit);
}

/** Floor area ratio in a multifamily zone: the zone's table figure applied to the declared existing floor area. Over the limit is never a definite failure (exemptions
 * and the stacked-unit and regional-center figures are not determined here). */
function evaluateMfFar(project: AduProjectDetails, site: AduSiteFacts, mf: { rule: RegulatoryRule; spec: AduMfFarSpec }): Evaluated {
  const { rule, spec } = mf;
  const cond = spec.conditionText ? ` ${spec.conditionText}` : "";
  const farCite = spec.citation ?? "SMC 23.45.510";
  if (site.parcelAreaSqFt === undefined) {
    return { finding: verify(SUBJECT.FAR, rule, [], `${spec.zoneText} ${spec.floorPhrase ?? "limits total chargeable floor area to"} ${spec.far} times the lot area (${farCite}).${cond} The lot area was not available, so the limit could not be calculated.`), verifyItem: "Confirm the lot area and the floor area ratio limit." };
  }
  const limit = spec.far * site.parcelAreaSqFt;
  const attached = isAttached(project);
  const intactConversion = isConversion(project) && project.conversion?.keepsFootprintAndHeight === true;
  const unmeasuredAddition = (isConversion(project) && !intactConversion) || attached;
  const adu = isConversion(project) || attached ? 0 : estimateAduFloorAreaSqFt(project);
  const evidence = [`farLimit=${spec.far}`, `limitSqFt=${Math.round(limit)}`, `aduFloorAreaSqFt=${Math.round(adu)}`];
  const lead = `${spec.zoneText} ${spec.floorPhrase ?? "limits the total chargeable floor area of all structures to"} ${spec.far} times the lot area, about ${sf(limit)} sq ft on ${sf(site.parcelAreaSqFt)} sq ft (${farCite}).${cond} Underground floors and portions of a story no more than 4 ft above grade are not counted.`;
  if (project.existingChargeableFloorAreaSqFt === undefined) {
    return { finding: verify(SUBJECT.FAR, rule, evidence, `${lead} You did not give the existing chargeable floor area, so how much room is left for the ADU could not be determined.`), verifyItem: "Add up the existing chargeable floor area of all structures and compare it to the floor area ratio limit." };
  }
  const total = project.existingChargeableFloorAreaSqFt + adu;
  const totalEvidence = [...evidence, `existingChargeableFloorAreaSqFt=${Math.round(project.existingChargeableFloorAreaSqFt)}`, `totalSqFt=${Math.round(total)}`];
  if (total <= limit && unmeasuredAddition) {
    return { finding: verify(SUBJECT.FAR, rule, totalEvidence, `${lead} Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft is ${sf(limit - total)} sq ft under the limit, but turning space inside the house into an ADU, or building an addition, can add chargeable floor area that was not collected and would count against that room.`), verifyItem: "Add the floor area of any addition to the existing chargeable floor area and compare it to the floor area ratio limit." };
  }
  if (total <= limit) {
    return { finding: known(SUBJECT.FAR, rule, true, totalEvidence, `${lead} Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft plus the ${sf(adu)} sq ft ADU is ${sf(total)} sq ft, within the limit, ${sf(limit - total)} sq ft to spare. This rests on the floor area you declared.`) };
  }
  return {
    finding: verify(SUBJECT.FAR, rule, totalEvidence, `${lead} Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft plus the ${sf(adu)} sq ft ADU is ${sf(total)} sq ft, ${spec.floorPhrase ? `over that lowest figure by ${sf(total - limit)} sq ft; the limit for this property's mapped height is higher, so whether it is exceeded cannot be told here` : `over the limit by ${sf(total - limit)} sq ft`}. This rests on the floor area you declared, which may include exempt areas, and a higher figure applies in some circumstances.`),
    constraint: spec.floorPhrase ? `Existing plus ADU floor area of ${sf(total)} sq ft is above the lowest floor area ratio figure (${sf(limit)} sq ft); the mapped-height limit may be higher` : `Existing plus ADU floor area of ${sf(total)} sq ft appears to exceed the ${sf(limit)} sq ft floor area ratio limit`,
    verifyItem: "Confirm the chargeable floor area of all structures against the floor area ratio limit.",
  };
}

function evaluateFar(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
  const mfFar = rules.find<AduMfFarSpec>(AduRuleType.MF_FLOOR_AREA_RATIO);
  if (mfFar) return evaluateMfFar(project, site, mfFar);
  const r = rules.find<AduFarSpec>(AduRuleType.FLOOR_AREA_RATIO);
  const d = rules.find<AduCountAndDensitySpec>(AduRuleType.COUNT_AND_DENSITY);
  if (!r || !d) return { uncovered: "floor area ratio" };
  if (site.parcelAreaSqFt === undefined) {
    return { finding: verify(SUBJECT.FAR, r.rule, [], "The floor area ratio limit could not be calculated because the lot area was not available."), verifyItem: "Confirm the lot area and the floor area ratio limit." };
  }
  const units = unitsAfterAdu(project);
  const perUnit = site.parcelAreaSqFt / units;
  const band = sqFtPerUnitBand(r.spec.bands, perUnit);
  const far = band ? band.far : r.spec.denserFar;
  const byRatio = far * site.parcelAreaSqFt;
  const limit = site.parcelAreaSqFt < r.spec.smallLotAreaSqFt ? Math.max(byRatio, r.spec.smallLotMinChargeableSqFt) : byRatio;
  // Converting an existing building adds no new floor area when its footprint is kept, and the declared existing floor area already includes it.
  const intactConversion = isConversion(project) && project.conversion?.keepsFootprintAndHeight === true;
  // A conversion that is not known to be intact may add floor area that was not collected: its total is never a definite result.
  const attached = isAttached(project);
  // An ADU made inside the existing house may turn space (a garage or attic, say) that was not chargeable into chargeable floor area, and an addition
  // adds floor area that was not collected: neither is ever a definite result.
  const unmeasuredAddition = (isConversion(project) && !intactConversion) || attached;
  const adu = isConversion(project) || attached ? 0 : estimateAduFloorAreaSqFt(project);
  const evidence = [`farLimit=${far}`, `limitSqFt=${Math.round(limit)}`, `unitsAfterAdu=${units}`, `aduFloorAreaSqFt=${Math.round(adu)}`];
  const limitText = `With this ADU the lot would have ${units} dwelling units on ${sf(site.parcelAreaSqFt)} sq ft (about ${sf(perUnit)} sq ft per unit), which puts it in the ${far} floor-area-ratio band (SMC 23.44.050 Table A). That allows about ${sf(limit)} sq ft of total chargeable floor area across all structures${site.parcelAreaSqFt < r.spec.smallLotAreaSqFt ? `, since lots under ${sf(r.spec.smallLotAreaSqFt)} sq ft may have at least ${sf(r.spec.smallLotMinChargeableSqFt)} sq ft` : ""}. Adding ADUs raises the unit count, which can raise this limit. Underground floors and portions of a story no more than 4 ft above grade are not counted.`;
  if (project.existingChargeableFloorAreaSqFt === undefined) {
    return {
      finding: verify(SUBJECT.FAR, r.rule, evidence, `${limitText} You did not give the existing chargeable floor area, so ${attached ? "how much room is left under it could not be determined; an ADU made inside the house can add chargeable floor area that was not counted before." : intactConversion ? "it could not be compared with the limit; converting the building adds no floor area, so only the extra dwelling unit's effect on the limit matters." : `the ${sf(adu)} sq ft ADU could not be added to it. The room left for the ADU is the limit less your existing chargeable floor area.`}`),
      verifyItem: "Add up the existing chargeable floor area of all structures and compare it to the floor area ratio limit.",
    };
  }
  const total = project.existingChargeableFloorAreaSqFt + adu;
  const totalEvidence = [...evidence, `existingChargeableFloorAreaSqFt=${Math.round(project.existingChargeableFloorAreaSqFt)}`, `totalSqFt=${Math.round(total)}`];
  if (total <= limit && unmeasuredAddition) {
    return {
      finding: verify(SUBJECT.FAR, r.rule, totalEvidence, `${limitText} Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft (which already includes ${attached ? "the house you would put the ADU in" : "the building you would convert"}) is ${sf(total)} sq ft, ${sf(limit - total)} sq ft under the limit. ${attached ? "Turning space inside the house into an ADU, or building an addition, can add chargeable floor area that was not collected" : "Any addition's floor area was not collected"} and would count against that room.`),
      verifyItem: "Add the floor area of any addition to the existing chargeable floor area and compare it to the floor area ratio limit.",
    };
  }
  if (total <= limit) {
    return { finding: known(SUBJECT.FAR, r.rule, true, totalEvidence, `${limitText} ${intactConversion ? `Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft (which already includes the building you would convert; the conversion adds none) is` : `Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft plus the ${sf(adu)} sq ft ADU is`} ${sf(total)} sq ft, within the limit, ${sf(limit - total)} sq ft to spare. This rests on the floor area you declared.`) };
  }
  return {
    finding: verify(SUBJECT.FAR, r.rule, totalEvidence, `${limitText} ${intactConversion ? `Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft (which already includes the building you would convert; the conversion adds none) is` : `Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft plus the ${sf(adu)} sq ft ADU is`} ${sf(total)} sq ft, over the limit by ${sf(total - limit)} sq ft. This rests on the floor area you declared, which may include exempt areas.`),
    constraint: `Existing plus ADU floor area of ${sf(total)} sq ft appears to exceed the ${sf(limit)} sq ft floor area ratio limit`,
    verifyItem: "Confirm the chargeable floor area of all structures against the floor area ratio limit.",
  };
}

function evaluateAmenity(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
  const r = rules.find<AduAmenitySpec>(AduRuleType.AMENITY_AREA);
  if (!r) return { uncovered: "amenity area" };
  const adu = estimateAduFloorAreaSqFt(project);
  const byFloorArea = r.spec.requiredFractionOfFloorArea !== undefined;
  const required = byFloorArea
    ? Math.max(adu * r.spec.requiredFractionOfFloorArea!, r.spec.minSqFt)
    : site.parcelAreaSqFt !== undefined && r.spec.requiredFractionOfLot !== undefined
      ? Math.max(site.parcelAreaSqFt * r.spec.requiredFractionOfLot, r.spec.minSqFt)
      : undefined;
  const requirement = byFloorArea
    ? `Amenity area of ${Math.round(r.spec.requiredFractionOfFloorArea! * 100)}% of the total gross floor area of the residential structure (for this ADU alone about ${sf(adu * r.spec.requiredFractionOfFloorArea!)} sq ft, but each private amenity area must be at least ${sf(r.spec.minSqFt)} sq ft and ${num(r.spec.minDimensionFt)} ft in each dimension, so at least ${sf(r.spec.minSqFt)} sq ft), unenclosed and free of parking and driveways (${r.spec.citation ?? "SMC 23.44.110"}). Which structure's floor area counts, and whether existing amenity area already satisfies it, is not known to Permit Preflight.`
    : `Amenity area of ${Math.round((r.spec.requiredFractionOfLot ?? 0) * 100)}% of the lot area${required !== undefined ? ` (about ${sf(required)} sq ft)` : ""}, at least ${sf(r.spec.minSqFt)} sq ft and ${num(r.spec.minDimensionFt)} ft in each dimension, unenclosed and free of parking and driveways (${r.spec.citation ?? "SMC 23.44.110"}).`;
  const exemptUnit = project.existingAduCount === 0 && project.existingPrincipalDwellingUnits === 1;
  if (!r.spec.noPre1982Exemption && project.existingHouseBuiltBefore1982 === true && exemptUnit) {
    return {
      finding: known(SUBJECT.AMENITY, r.rule, true, ["exemption=oneNewUnitOnPre1982Dwelling"], `No amenity area is required for one new dwelling unit added to a dwelling that existed as of January 1, 1982 (${r.spec.exemptionCitation ?? "SMC 23.44.110.H.1"}). You reported a single house built before 1982 with no other ADU, so this ADU appears to qualify. This rests on what you told us.`),
    };
  }
  const why = r.spec.noPre1982Exemption ? "" : project.existingHouseBuiltBefore1982 === undefined ? "You did not say whether the house was built before 1982, which would exempt a single added unit." : project.existingHouseBuiltBefore1982 === true ? "The pre-1982 exemption covers only one new unit added to a single dwelling." : "The house was not built before 1982, so the exemption for one added unit does not apply.";
  return {
    finding: verify(SUBJECT.AMENITY, r.rule, [`requiredSqFt=${required !== undefined ? Math.round(required) : "unknown"}`], `${requirement} ${why} ${r.spec.canopyExemption === false ? "" : "Development that earns enough tree points for ten percent canopy at maturity is also exempt (SMC 23.44.110.H.2). "}Whether your site plan provides the area is not determined here.`),
    verifyItem: "Find where the amenity area would go on the site plan (or confirm an exemption applies).",
  };
}

function evaluateTrees(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
  const note = rules.find<AduMfLandscapingNoteSpec>(AduRuleType.MF_LANDSCAPING_NOTE);
  if (note) return { finding: verify(SUBJECT.TREES, note.rule, [], note.spec.text), verifyItem: TREE_INVENTORY_ITEM };
  const r = rules.find<AduTreesSpec>(AduRuleType.TREES);
  if (!r) return { uncovered: "tree requirement" };
  if (site.parcelAreaSqFt === undefined) {
    return { finding: verify(SUBJECT.TREES, r.rule, [], "The tree requirement could not be calculated because the lot area was not available."), verifyItem: TREE_INVENTORY_ITEM };
  }
  const units = unitsAfterAdu(project);
  const band = sqFtPerUnitBand(r.spec.bands, site.parcelAreaSqFt / units);
  const sqFtPerPoint = band ? band.sqFtPerPoint : r.spec.denserSqFtPerPoint;
  const points = site.parcelAreaSqFt / sqFtPerPoint;
  const trees = site.parcelAreaSqFt / r.spec.lotSqFtPerNewTree;
  return {
    finding: verify(SUBJECT.TREES, r.rule, [`pointsRequired=${points.toFixed(1)}`, `newTreesAlternative=${trees.toFixed(1)}`], `A development with a new dwelling unit must plant or keep trees to earn ${points.toFixed(1)} tree points (one per ${sf(sqFtPerPoint)} sq ft of lot area at this density) or plant one new tree per ${sf(r.spec.lotSqFtPerNewTree)} sq ft (about ${Math.ceil(trees)}), whichever is greater (SMC 23.44.120). Existing trees on the lot count by trunk diameter. Whether your site can meet it is not determined here.`),
    verifyItem: TREE_INVENTORY_ITEM,
  };
}

function evaluateDesign(project: AduProjectDetails, rules: ActiveRules): Evaluated {
  const r = rules.find<AduDesignStandardsSpec>(AduRuleType.DESIGN_STANDARDS);
  if (!r) return { uncovered: "design standards" };
  const cite = r.spec.citation ?? "SMC 23.44.140";
  if (r.spec.noteText !== undefined) return { finding: verify(SUBJECT.DESIGN, r.rule, [], r.spec.noteText), verifyItem: "Ask SDCI whether the street-level standards apply to the ADU." };
  if (isAttached(project) && project.attached && !project.attached.includesAddition) {
    return {
      finding: verify(
        SUBJECT.DESIGN,
        r.rule,
        ["newDwellingUnitWithinExistingStructure=true"],
        `The design standards (pedestrian path, street-facing entry, windows and doors) apply to new dwelling units except those added within existing structures (${cite}.A.1). An ADU made inside the existing house with no addition appears to fall outside them; whether SDCI treats it that way is for SDCI to confirm.`
      ),
      verifyItem: "Confirm with SDCI that the design standards do not apply to this ADU.",
    };
  }
  if (conversionAllowance(project) === "YES") {
    return {
      finding: verify(
        SUBJECT.DESIGN,
        r.rule,
        ["newDwellingUnitWithinExistingStructure=true"],
        `The design standards (pedestrian path, street-facing entry, windows and doors) apply to new dwelling units except those added within existing structures (${cite}.A.1). A conversion that keeps the existing building appears to fall outside them; whether SDCI treats it that way, and how any addition is treated, is for SDCI to confirm.`
      ),
      verifyItem: "Confirm with SDCI that the design standards do not apply to this conversion.",
    };
  }
  const distances = [project.distanceToFrontLotLineFt, ...Object.values(project.unresolvedStreetFrontageDistancesFt ?? {})].filter((v): v is number => v !== undefined);
  const nearest = distances.length > 0 ? Math.min(...distances) : undefined;
  const streetFacing =
    nearest === undefined
      ? "Whether the ADU is within the distance of a street at which the street-facing entry and window rules apply could not be determined."
      : nearest <= r.spec.streetFacingWithinFt
        ? `The ADU would be ${num(nearest)} ft from a street lot line, within ${num(r.spec.streetFacingWithinFt)} ft, so its street-facing facade needs a pedestrian entry with at least ${num(r.spec.weatherProtectionFt)} ft by ${num(r.spec.weatherProtectionFt)} ft of weather protection and at least ${r.spec.facadeOpeningsPercent}% of that facade in windows and doors (${cite}.D and E).`
        : `The ADU would be ${num(nearest)} ft from the street lot line you indicated; the street-facing entry and window rules apply only within ${num(r.spec.streetFacingWithinFt)} ft of a street (${cite}.A.2), but another street, or a shared driveway serving ten or more homes, could change that.`;
  return {
    finding: verify(SUBJECT.DESIGN, r.rule, nearest === undefined ? [] : [`nearestStreetLotLineFt=${nearest}`], `Each unit needs a pedestrian path at least ${num(r.spec.pedestrianAccessMinWidthFt)} ft wide to the sidewalk or front lot line, which may be shared and may cross setbacks (${cite}.C). ${streetFacing} These depend on your design.`),
    verifyItem: "Plan a 3 ft pedestrian path from the sidewalk to the ADU entrance.",
  };
}

function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** Conversion of an existing accessory structure (SMC 23.42.022.H): eligibility, the setback and lot-coverage allowance, height, and the Housing Code
 * disclosure. All of it rests on the A11 rule; without it every conversion claim is uncovered. Nothing here is a KNOWN conclusion: the allowance rests on
 * the customer's declarations about when the building was built and what the conversion changes, and SDCI confirms both. */
function evaluateConversion(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules, allowance: ConversionAllowance): Evaluated[] {
  const r = rules.find<AduConversionSpec>(AduRuleType.CONVERSION);
  if (!r) return [{ uncovered: "conversion of an existing accessory structure" }];
  const c = project.conversion!;
  const date = longDate(r.spec.existingBeforeDate);
  const housing = `${r.spec.housingCodeFirstSection} through ${r.spec.housingCodeLastSection.replace(/^SMC /, "")}`;
  const out: Evaluated[] = [];

  if (c.structureNotMatchedReason !== undefined || c.structureAreaSqFt === undefined) {
    out.push({
      finding: verify(SUBJECT.CONVERSION_STRUCTURE, r.rule, [], `The building you chose to convert could not be used: ${c.structureNotMatchedReason ?? "it is not among the mapped buildings on this parcel."} Its size and position could not be measured, so no part of the conversion was evaluated.`),
      verifyItem: "Choose the building to convert from the mapped buildings on your parcel.",
    });
    return out;
  }

  const evidence = [`existedBeforeJuly2023=${c.existedBeforeJuly2023}`, `keepsFootprintAndHeight=${c.keepsFootprintAndHeight}`];
  const director = r.spec.directorMayWaiveAndModify ? " The Director may also allow waivers and modifications to facilitate a conversion (SMC 23.42.022.H.3.a)." : "";
  const base = `An existing accessory structure (one that existed before ${date}) may be converted into a detached ADU notwithstanding the lot coverage and yard or setback provisions of SMC 23.42.022 and the zone (SMC 23.42.022.H.3.b), and must comply with the Housing Code minimum standards (SMC ${housing}). A conversion may keep the building, add to or alter it, or remove and rebuild it, provided any expansion or relocation meets the ADU and zone standards (SMC 23.42.022.H.1).`;

  // Eligibility
  if (allowance === "NO") {
    out.push({
      finding: verify(SUBJECT.CONVERSION, r.rule, evidence, `${base} You said the building did not exist before ${date}, so it is not an "existing accessory structure" (SMC 23.42.022.H.2) and the allowances do not apply as entered. The setback and lot-coverage standards for a new detached ADU are therefore applied to this building below.`),
      constraint: "The conversion allowances do not apply as entered, so the new-ADU setback and lot-coverage standards apply",
      verifyItem: "Confirm with SDCI how a building built after July 23, 2023 can become an ADU.",
    });
  } else {
    const unknowns: string[] = [];
    if (c.existedBeforeJuly2023 === undefined) unknowns.push(`whether the building existed before ${date}`);
    if (c.keepsFootprintAndHeight === undefined) unknowns.push("whether the conversion keeps the building's footprint and height");
    const status =
      allowance === "YES"
        ? " You said the building existed before that date and the conversion keeps its footprint and height, so this appears to apply. Seattle's building outlines map the building as of 2023; whether it legally existed on the date is for SDCI to confirm."
        : allowance === "PARTIAL"
          ? " You said the conversion would expand, move or enlarge the building: the existing building appears covered as it stands, but the expansion or relocation must meet the standards for a new ADU, and where it would go was not collected, so it is not measured here."
          : ` It is not clear that this applies because ${unknowns.join(" and ")} is not known.`;
    out.push({
      finding: verify(SUBJECT.CONVERSION, r.rule, evidence, `${base}${status}${director}`),
      verifyItem: `Confirm the building legally existed before ${date} (permit records, dated aerial photos) and what the conversion would change.`,
    });
    // Siting: informational distances, never a pass or fail, because the allowance removes those standards for the existing building.
    const d = (v: number | undefined) => (v === undefined ? "not measured" : `${num(v)} ft`);
    const siting = `The building is ${d(project.distanceToRearLotLineFt)} from the rear lot line, ${d(project.distanceToSideLotLineFt)} from the nearest side lot line and ${d(project.distanceToFrontLotLineFt)} from the front lot line. A new detached ADU would need to meet the rear, side and front setbacks and the lot-coverage limit; if the allowance applies, a conversion of this building as it stands does not have to (SMC 23.42.022.H.3.b).${allowance === "YES" ? " This rests on what you told us about the building and is for SDCI to confirm." : allowance === "PARTIAL" ? " The part that would be added or moved is not covered and was not measured." : ""}`;
    out.push({
      finding: verify(SUBJECT.CONVERSION_SITING, r.rule, [`conversionAllowance=${allowance}`], siting),
      ...(allowance === "PARTIAL" ? { verifyItem: "Describe any addition or relocation to SDCI: it must meet the new-ADU setbacks and lot-coverage limit." } : {}),
    });
  }

  // Height: the allowance names lot coverage and yard or setback provisions, not height; the existing building's height was not collected.
  out.push({
    finding: verify(
      SUBJECT.CONVERSION_HEIGHT,
      r.rule,
      ["heightCollected=false"],
      `The conversion allowance names lot coverage and yard or setback provisions; it does not mention height (SMC 23.42.022.H.3.b). The building's height was not collected, so whether the height standards (${r.spec.heightNote ?? "32 ft, and 12 ft for an accessory structure in a required setback; SMC 23.44.070.A"}) are met is not determined; the Director may allow waivers and modifications to facilitate a conversion (SMC 23.42.022.H.3.a).`
    ),
    verifyItem: "Confirm with SDCI whether the height standards apply to the building as it stands.",
  });

  // Housing Code minimum standards
  out.push({
    finding: verify(
      SUBJECT.HOUSING_CODE,
      r.rule,
      [`${r.spec.housingCodeFirstSection}-${r.spec.housingCodeLastSection.replace(/^SMC /, "")}`],
      `A converted accessory structure must comply with the minimum standards in ${r.spec.housingCodeFirstSection} through ${r.spec.housingCodeLastSection.replace(/^SMC /, "")} (SMC 23.42.022.H.3.b). Permit Preflight does not assess the building against them; a garage or shed can need work to meet them.`
    ),
    verifyItem: "Have the building assessed against the minimum standards in SMC 22.206.020 through 22.206.140 before committing to the conversion.",
  });
  return out;
}

/** The exterior standards for an ADU inside or attached to the house. Nothing is measured (no position is collected), so nothing here is a definite result. */
function evaluateAttachedSiting(project: AduProjectDetails, rules: ActiveRules): Evaluated[] {
  const r = rules.find<AduAttachedSpec>(AduRuleType.ATTACHED);
  if (!r) return [{ uncovered: "ADU attached to or inside the house" }];
  const a = project.attached!;
  const base = "Accessory dwelling units may be attached, detached or stacked (SMC 23.42.022.D) and, unless a zone standard says otherwise, meet the same standards as the principal dwelling (SMC 23.42.022.E).";
  const text = a.includesAddition
    ? `${base} You said part of the ADU would be in a new addition. An addition (or any expansion of the house) must meet the setback, height and lot-coverage standards, and where it would go was not collected, so none of that is measured here.`
    : `${base} You said the ADU would be inside the existing house with no addition, so the unit itself adds no exterior wall. Permit Preflight does not measure the house against the setback, height and lot-coverage standards; whether any exterior change (a new entrance, stairs or windows) brings them into play is for SDCI to determine, and any addition would be measured against them.`;
  return [
    {
      finding: verify(SUBJECT.ATTACHED_SITING, r.rule, [`includesAddition=${a.includesAddition}`], text),
      verifyItem: a.includesAddition ? "Describe the addition to SDCI: it must meet the setbacks, height and lot-coverage limit." : "Confirm with SDCI that no exterior change (windows, stairs, entrances) triggers the setback standards.",
    },
  ];
}

function ecaSummaryFinding(site: AduSiteFacts): { finding: Finding; mapped: string[] } {
  const mapped = site.ecaFindings.filter((f) => f.mappedIntersectionResult !== MappedIntersectionResult.NO_INTERSECTION).map((f) => f.hazardType.replace(/_/g, " "));
  const text =
    site.ecaFindings.length === 0
      ? "Seattle's critical-area maps were not available for this evaluation, so any environmentally critical area (steep slope, landslide, liquefaction, flood-prone, riparian, wetland) is unknown. Critical areas can limit or prevent building, reduce the lot area counted for density and lot coverage, and require extra permits."
      : mapped.length > 0
        ? `Seattle's advisory critical-area maps indicate this parcel may include: ${mapped.join(", ")}. Critical areas can limit or prevent building, reduce the lot area counted for density and lot coverage, and require extra permits. The maps are advisory; SDCI and a site investigation determine what applies.`
        : "Seattle's advisory critical-area maps show none of the mapped categories on this parcel. The maps are advisory and cannot rule a critical area out, and critical areas can limit or prevent building, reduce the lot area counted for density and lot coverage, and require extra permits.";
  return { finding: verify(SUBJECT.ECA, undefined, ["environmental-constraints"], text), mapped };
}

// ---------------------------------------------------------------------------------------------
// Feasibility headline and checklist
// ---------------------------------------------------------------------------------------------

const TREE_INVENTORY_ITEM = "Take a tree inventory and plan how the tree requirement would be met.";
const BASE_VERIFY_BEFORE_DESIGN: readonly string[] = [
  "Get a boundary and topographic survey so the lot lines, lot area and grades are measured, not mapped.",
  "Ask SDCI (or a land-use professional) to confirm the zone, overlays and any critical areas for this parcel.",
  "Check sewer, water and stormwater capacity and the cost of the connections, including King County's sewer capacity charge.",
  TREE_INVENTORY_ITEM,
  "Confirm with SDCI that no recorded covenant or other title matter limits an ADU.",
];

function buildFeasibility(input: {
  /** The resolved zoning, or undefined when the caller supplied none. */
  zoning: ZoningResolution | undefined;
  /** Whether ADU rules for the zone(s) the lot is in were available to evaluate. */
  zoneSupported: boolean;
  evaluated: Evaluated[];
  uncovered: string[];
  placementMissing: boolean;
  conversion: boolean;
  outsideParcel: boolean;
  mappedEca: string[];
}): AduFeasibility {
  const blockers = input.evaluated.map((e) => e.blocker).filter((v): v is string => Boolean(v));
  const constraints = input.evaluated.map((e) => e.constraint).filter((v): v is string => Boolean(v));
  const verifyItems = [...new Set(input.evaluated.map((e) => e.verifyItem).filter((v): v is string => Boolean(v)))];
  const zone = input.zoning;

  let headline: AduFeasibilityHeadline;
  let summary: string;
  if (!input.zoneSupported) {
    headline = "CANNOT_TELL";
    summary =
      zone === undefined
        ? "Permit Preflight did not check this parcel's zoning, so it cannot tell you whether an ADU is feasible here. ADU rules differ by zone; SDCI can tell you which apply."
        : zone.status === "UNRESOLVED"
          ? `Permit Preflight could not apply this parcel's zoning (${zone.reason ?? "the zoning could not be determined"}), so it cannot tell you whether an ADU is feasible here. ADU rules differ by zone; SDCI can tell you which apply.`
          : zone.status === "AMBIGUOUS"
            ? `Seattle's zoning data places this property in more than one zone (${[...new Set([...zone.locationZones, ...zone.lotZones].map((z) => z.raw))].join(", ")}) whose ADU standards differ, so Permit Preflight cannot tell you whether an ADU is feasible here. SDCI can tell you which apply.`
            : `Seattle's zoning data places this parcel in ${zone.locationZones.map((z) => z.raw).join(", ")}. Permit Preflight does not yet have active ADU rules for that zone, so it cannot tell you whether an ADU is feasible here. ADU rules differ by zone; SDCI can tell you which apply.`;
  } else if (blockers.length > 0) {
    headline = "BLOCKED";
    summary = `As entered, this ADU does not appear to be allowed: ${blockers.length === 1 ? "1 requirement is not met" : `${blockers.length} requirements are not met`}. Review the items below; changing the size, height or position may resolve them.`;
  } else if (input.uncovered.length > 0) {
    // A known failure above stands even with partial coverage, but "looks feasible" is a cross-constraint read
    // and is never offered while any governed claim could not be evaluated.
    headline = "CANNOT_TELL";
    summary = `Permit Preflight could not evaluate every ADU requirement (${input.uncovered.join("; ")}), so it cannot give a feasibility read. What it did evaluate is listed below.`;
  } else if (input.placementMissing) {
    headline = "CANNOT_TELL";
    summary = input.outsideParcel
      ? "The ADU footprint you placed reaches outside the property boundary, so its distances to the property lines and the house could not be evaluated. Move it fully inside the parcel to get a read on setbacks and separation."
      : input.conversion
      ? "The building to convert could not be matched to a mapped building on the parcel (or its distances could not be measured), so its size and position could not be evaluated. Choose it on the map to get a read on the conversion."
      : "The ADU's position on the lot was not established, so its distances to the property lines and the existing house could not be measured. Place it on the map to get a read on setbacks and separation.";
  } else if (constraints.length > 0) {
    headline = "LIKELY_CONSTRAINED";
    summary = `Nothing is known to prohibit this ADU, but ${constraints.length === 1 ? "1 limit appears to be exceeded on the figures available" : `${constraints.length} limits appear to be exceeded on the figures available`}. Verify these first.`;
  } else {
    headline = "LOOKS_FEASIBLE";
    summary = `Nothing evaluated here prohibits this ADU as entered. ${verifyItems.length} ${verifyItems.length === 1 ? "item needs" : "items need"} to be verified before design work, and this is a screening read, not an approval.`;
  }

  const zoningVerify: string[] = [];
  if (!input.zoneSupported) zoningVerify.push("Confirm the parcel's zone and its ADU standards with SDCI; Permit Preflight could not apply them.");
  if (zone && zone.status !== "UNRESOLVED" && (zone.overlays.shorelineDistrict || zone.overlays.historicDistrict || zone.overlays.landmarkParcel || zone.overlays.overlayLabels.length > 0)) {
    zoningVerify.push("Confirm the overlay (shoreline, historic or landmark) rules with SDCI; they can change or add requirements for an ADU.");
  }
  const eca = input.mappedEca.length > 0 ? [`Have the mapped critical-area indications checked (${input.mappedEca.join(", ")}); they can limit where and whether you can build.`] : [];

  return {
    headline,
    summary,
    blockers,
    constraints,
    verifyBeforeDesign: [...new Set([...zoningVerify, ...eca, ...verifyItems, ...BASE_VERIFY_BEFORE_DESIGN])],
    notEvaluated: [...ADU_NOT_EVALUATED],
  };
}

// ---------------------------------------------------------------------------------------------

export interface EvaluateAduInput {
  project: AduProjectDetails;
  site: AduSiteFacts;
  /** Re-filtered to ACTIVE defensively; callers pre-filter by applicableProjectType = "adu". */
  candidateActiveRules: RegulatoryRule[];
  /** Citywide zoning coverage: the lot's zoning (and, for a placed ADU, its footprint's). The rules that govern each claim in that zone are resolved
   * (zoning/resolve.ts). An ADU's feasibility is not meaningful without the zone, so with no usable zoning, or no active ADU rules for the zone, the
   * read is "cannot tell". Undefined (direct unit tests) evaluates every candidate rule as given. */
  zoningContext?: ZoningContext;
}

const ADU_CLAIM_LABEL = (_ruleType: string, fallbackSubject: string): string => fallbackSubject;

export function evaluateAdu(input: EvaluateAduInput): AduEvaluationOutcome {
  const resolution = input.zoningContext ? resolveApplicableRules({ zoning: input.zoningContext, candidateRules: input.candidateActiveRules }) : undefined;
  const rules = indexActiveRules(resolution ? resolution.rules : input.candidateActiveRules);
  const { project, site } = input;
  // An ADU needs the zone's own standards (density or floor area, setbacks, height, ...). The conclusion is made only when the zoning resolves
  // and at least one zone-specific ADU rule governs it; anything else (an unresolved or split zoning, or a zone without active ADU rules yet)
  // produces no ADU conclusion at all.
  const aduZoneRuleTypes: string[] = [AduRuleType.COUNT_AND_DENSITY, AduRuleType.SETBACKS, AduRuleType.HEIGHT, AduRuleType.FLOOR_AREA_RATIO, AduRuleType.LOT_COVERAGE, AduRuleType.MF_COUNT, AduRuleType.COMM_SETBACKS, AduRuleType.COMM_HEIGHT];
  const ruleTypeOfRow = (r: RegulatoryRule): string => (r.ruleSpecification as { ruleType?: string }).ruleType ?? "";
  // Rules exist for ADUs, but none of the zone-specific ones governs the zone this property is in: say so, rather than listing every claim as unscreened.
  const zoneHasNoAduRules =
    resolution?.status === "RESOLVED" &&
    input.candidateActiveRules.some((r) => aduZoneRuleTypes.includes(ruleTypeOfRow(r))) &&
    !resolution.rules.some((r) => aduZoneRuleTypes.includes(ruleTypeOfRow(r)));
  const zoneSupported = resolution === undefined || (resolution.status === "RESOLVED" && !zoneHasNoAduRules);
  const notNr = !zoneSupported;
  const findings: Finding[] = [];
  const uncovered: string[] = [];
  const evaluated: Evaluated[] = [];

  if (notNr) {
    uncovered.push(
      resolution?.status === "UNRESOLVED"
        ? "ADU zoning limits (Seattle zoning could not be applied to this property)"
        : zoneHasNoAduRules
          ? "ADU zoning limits (no active ADU rules for this zone yet)"
          : "ADU zoning limits (the zones on this property have different ADU standards)"
    );
  } else {
    if (isAttached(project)) {
      evaluated.push(
        evaluateCount(project, rules),
        evaluateDensity(project, site, rules),
        evaluateSize(project, rules),
        ...evaluateAttachedSiting(project, rules),
        evaluateFar(project, site, rules),
        evaluateAmenity(project, site, rules),
        evaluateTrees(project, site, rules),
        evaluateDesign(project, rules)
      );
    } else if (isConversion(project)) {
      const allowance = conversionAllowance(project);
      const matched = project.conversion !== undefined && project.conversion.structureNotMatchedReason === undefined && project.conversion.structureAreaSqFt !== undefined;
      if (!matched) {
        // The building to convert is unknown: no claim that depends on it is made (its size, position and separation are unknown).
        if (project.conversion) evaluated.push(...evaluateConversion(project, site, rules, allowance));
      } else {
        evaluated.push(evaluateCount(project, rules), evaluateDensity(project, site, rules), evaluateSize(project, rules), ...evaluateConversion(project, site, rules, allowance));
        // Without the allowance the new-ADU standards govern the building's position and coverage. With a planned expansion or relocation only the
        // coverage is shown (never a definite result, the addition is unmeasured). With the allowance, or while it is unresolved, neither is asserted.
        if (allowance === "NO") evaluated.push(...evaluateSetbacks(project, site, rules), evaluateLotCoverage(project, site, rules));
        else if (allowance === "PARTIAL") evaluated.push(evaluateLotCoverage(project, site, rules));
        evaluated.push(
          ...evaluateSeparation(project, rules, rules.find<AduConversionSpec>(AduRuleType.CONVERSION)),
          evaluateFar(project, site, rules),
          evaluateAmenity(project, site, rules),
          evaluateTrees(project, site, rules),
          evaluateDesign(project, rules)
        );
      }
    } else if (footprintOutsideParcel(project)) {
      // The footprint reaches over a lot line: its distances to the lot lines and the house are not meaningful (a 0 ft distance is a mis-placement, not a
      // setback result), so no position-dependent claim is made. Everything that does not depend on where it is placed is still evaluated.
      const pct = Math.round((1 - (project.footprintInsideParcelFraction ?? 0)) * 100);
      evaluated.push({
        finding: verify(SUBJECT.POSITION, undefined, [`footprintInsideParcelFraction=${(project.footprintInsideParcelFraction ?? 0).toFixed(2)}`], `About ${pct}% of the ADU footprint you placed lies outside the property boundary shown, so its distances to the property lines and the house are not meaningful and were not evaluated. Move the footprint fully inside the parcel to get a read on setbacks, separation and lot coverage.`),
        verifyItem: "Place the ADU fully inside the parcel to evaluate setbacks, separation and lot coverage.",
      });
      evaluated.push(evaluateCount(project, rules), evaluateDensity(project, site, rules), evaluateSize(project, rules), evaluateHeight(project, rules, site), evaluateFar(project, site, rules), evaluateAmenity(project, site, rules), evaluateTrees(project, site, rules), evaluateDesign(project, rules));
    } else {
      evaluated.push(
        evaluateCount(project, rules),
        evaluateDensity(project, site, rules),
        evaluateSize(project, rules),
        ...evaluateSetbacks(project, site, rules),
        ...evaluateSeparation(project, rules),
        evaluateHeight(project, rules, site),
        evaluateLotCoverage(project, site, rules),
        evaluateFar(project, site, rules),
        evaluateAmenity(project, site, rules),
        evaluateTrees(project, site, rules),
        evaluateDesign(project, rules)
      );
    }
    for (const e of evaluated) {
      if (e.finding) findings.push(e.finding);
      if (e.uncovered) uncovered.push(e.uncovered);
    }
  }

  const eca = ecaSummaryFinding(site);
  findings.push(eca.finding);
  if (resolution) {
    findings.push(...zoningFindings(resolution, { projectNoun: "accessory dwelling unit", claimLabel: ADU_CLAIM_LABEL, noRulesForZone: zoneHasNoAduRules }));
    findings.push(...ambiguousClaimFindings(resolution, { projectNoun: "accessory dwelling unit", claimLabel: ADU_CLAIM_LABEL }));
  }

  const feasibility = buildFeasibility({
    zoning: resolution,
    zoneSupported,
    evaluated,
    uncovered,
    placementMissing: !notNr && !isAttached(project) && (footprintOutsideParcel(project) || (isConversion(project) ? project.conversion?.structureAreaSqFt === undefined || (conversionAllowance(project) === "NO" && placementGap(project) !== undefined) : placementGap(project) !== undefined)),
    conversion: isConversion(project),
    outsideParcel: footprintOutsideParcel(project),
    mappedEca: eca.mapped,
  });

  return {
    findings,
    feasibility,
    declaredInputs: describeAduDeclaredInputs(project),
    uncoveredConstraintTypes: [...new Set(uncovered)],
    ...(resolution ? { zoningApplied: summarizeZoningResolution(resolution) } : {}),
  };
}
