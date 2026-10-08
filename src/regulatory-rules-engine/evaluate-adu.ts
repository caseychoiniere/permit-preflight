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
import { deriveEcaRegulatoryImplication } from "./eca-implication.js";
import { CRITICAL_AREA_FINDING_SUBJECT_PREFIX, evaluateEcaLotAreaAdjustment, evaluateShedLotCoverage } from "./evaluate.js";
import { ComplianceOutcome, FindingClassification } from "./types.js";
import type { Finding } from "./types.js";
import { zoningApplicabilityFindings, type ZoningApplicability } from "./zoning-applicability.js";
import { AduRuleType } from "./adu-types.js";
import type {
  AduAmenitySpec,
  AduCountAndDensitySpec,
  AduDeclaredInput,
  AduDesignStandardsSpec,
  AduEvaluationOutcome,
  AduFarSpec,
  AduFeasibility,
  AduFeasibilityHeadline,
  AduHeightSpec,
  AduLotCoverageSpec,
  AduProjectDetails,
  AduSeparationSpec,
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
  [AduRuleType.SEPARATION]: (s) => positiveFinite(s["minFt"]) && positiveFinite(s["mappingToleranceFt"]),
  [AduRuleType.HEIGHT]: (s) => positiveFinite(s["maxFt"]) && positiveFinite(s["treeRetentionMaxFt"]) && nonNegativeFinite(s["pitchedRoofRidgeAllowanceFt"]),
  [AduRuleType.LOT_COVERAGE]: (s) => positiveFinite(s["maxPercent"]),
  [AduRuleType.FLOOR_AREA_RATIO]: (s) => bandsOk(s["bands"], "far") && positiveFinite(s["denserFar"]) && positiveFinite(s["smallLotAreaSqFt"]) && positiveFinite(s["smallLotMinChargeableSqFt"]),
  [AduRuleType.AMENITY_AREA]: (s) => positiveFinite(s["requiredFractionOfLot"]) && positiveFinite(s["minSqFt"]) && positiveFinite(s["minDimensionFt"]),
  [AduRuleType.TREES]: (s) => bandsOk(s["bands"], "sqFtPerPoint") && positiveFinite(s["denserSqFtPerPoint"]) && positiveFinite(s["lotSqFtPerNewTree"]),
  [AduRuleType.DESIGN_STANDARDS]: (s) =>
    positiveFinite(s["pedestrianAccessMinWidthFt"]) && positiveFinite(s["streetFacingWithinFt"]) && positiveFinite(s["weatherProtectionFt"]) && positiveFinite(s["facadeOpeningsPercent"]),
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
export function estimateAduFloorAreaSqFt(project: Pick<AduProjectDetails, "widthFt" | "depthFt" | "stories">): number {
  return project.widthFt * project.depthFt * project.stories;
}
export function aduFootprintSqFt(project: Pick<AduProjectDetails, "widthFt" | "depthFt">): number {
  return project.widthFt * project.depthFt;
}
export function unitsAfterAdu(project: Pick<AduProjectDetails, "existingPrincipalDwellingUnits" | "existingAduCount">): number {
  return project.existingPrincipalDwellingUnits + project.existingAduCount + 1;
}

export function describeAduDeclaredInputs(project: AduProjectDetails): AduDeclaredInput[] {
  const rows: AduDeclaredInput[] = [
    { label: "Type of ADU", value: "New detached ADU" },
    { label: "Footprint", value: `${num(project.widthFt)} ft x ${num(project.depthFt)} ft (${sf(aduFootprintSqFt(project))} sq ft)` },
    { label: "Above-ground stories", value: `${project.stories}` },
    { label: "Estimated gross floor area", value: `${sf(estimateAduFloorAreaSqFt(project))} sq ft (footprint x stories)` },
    { label: "Bedrooms", value: `${project.bedrooms}` },
    { label: "Height", value: `${num(project.heightFt)} ft` },
    { label: "Rear lot line is on an alley", value: project.alleyAdjacent ? "Yes" : "No" },
    { label: "Existing principal dwelling units on the lot", value: `${project.existingPrincipalDwellingUnits}` },
    { label: "Existing ADUs on the lot", value: `${project.existingAduCount}` },
    { label: "Existing house built before 1982", value: project.existingHouseBuiltBefore1982 === undefined ? "Not answered" : project.existingHouseBuiltBefore1982 ? "Yes" : "No" },
    {
      label: "Existing chargeable floor area (all structures)",
      value: project.existingChargeableFloorAreaSqFt === undefined ? "Not provided" : `${sf(project.existingChargeableFloorAreaSqFt)} sq ft`,
    },
  ];
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------------------------

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
  const r = rules.find<AduCountAndDensitySpec>(AduRuleType.COUNT_AND_DENSITY);
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
  const allowedByFormula = Math.floor(area / r.spec.lotSqFtPerUnit + (1 - r.spec.roundUpFractionOver));
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

function evaluateSize(project: AduProjectDetails, rules: ActiveRules): Evaluated {
  const r = rules.find<AduSizeLimitSpec>(AduRuleType.SIZE_LIMIT);
  if (!r) return { uncovered: "ADU size limit" };
  const cap = project.bedrooms >= 3 ? r.spec.maxSqFtThreePlusBedrooms : r.spec.maxSqFtUpToTwoBedrooms;
  const est = estimateAduFloorAreaSqFt(project);
  const evidence = [`estimatedGrossFloorAreaSqFt=${Math.round(est)}`, `bedrooms=${project.bedrooms}`, `capSqFt=${cap}`];
  const limitText = `${project.bedrooms >= 3 ? "An ADU with three or more bedrooms" : "An ADU with up to two bedrooms"} may have up to ${sf(cap)} sq ft of gross floor area (SMC 23.42.022.G)`;
  if (est <= cap) {
    return { finding: known(SUBJECT.SIZE, r.rule, true, evidence, `${limitText}. Your ADU's estimated gross floor area is ${sf(est)} sq ft (${num(project.widthFt)} x ${num(project.depthFt)} ft x ${project.stories} ${project.stories === 1 ? "story" : "stories"}). ${DECLARED_BASIS}`) };
  }
  if (est <= cap + r.spec.bikeParkingExclusionSqFt) {
    return {
      finding: verify(SUBJECT.SIZE, r.rule, evidence, `${limitText}. Your ADU's estimated gross floor area is ${sf(est)} sq ft, over the limit by ${sf(est - cap)} sq ft. Up to ${r.spec.bikeParkingExclusionSqFt} sq ft of long-term bicycle parking is not counted, which could bring it within the limit.`),
      verifyItem: "Confirm how the ADU's gross floor area would be measured against the size limit.",
    };
  }
  return {
    finding: known(SUBJECT.SIZE, r.rule, false, evidence, `${limitText}. Your ADU's estimated gross floor area is ${sf(est)} sq ft (${num(project.widthFt)} x ${num(project.depthFt)} ft x ${project.stories} ${project.stories === 1 ? "story" : "stories"}), over the limit by ${sf(est - cap)} sq ft. ${DECLARED_BASIS}`),
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

function evaluateSetbacks(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated[] {
  const r = rules.find<AduSetbacksSpec>(AduRuleType.SETBACKS);
  if (!r) return [{ uncovered: "ADU setbacks" }];
  const out: Evaluated[] = [];
  const gap = placementGap(project);
  const gate = spatialQualityGate(project, r.rule);
  const units = unitsAfterAdu(project);
  const area = site.parcelAreaSqFt;
  const smallFtsaLot = area !== undefined && area < r.spec.smallLotAreaSqFt && site.inFrequentTransitServiceArea === true;
  const unknownSmallLotTransit = area !== undefined && area < r.spec.smallLotAreaSqFt && site.inFrequentTransitServiceArea === undefined;

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
      out.push({ finding: known(SUBJECT.REAR, r.rule, true, [`distanceToRearLotLineFt=${d}`, `requiredFt=0`, `alleyAdjacent=true`], `The rear lot line abuts an alley, so no rear setback is required (SMC 23.44.090 Table A, footnote 3). ${DECLARED_BASIS}`) });
    } else {
      const where = againstThreshold(d, required, r.spec.mappingToleranceFt);
      if (where === "NEAR") {
        out.push({ finding: verify(SUBJECT.REAR, r.rule, [`distanceToRearLotLineFt=${d}`, `requiredFt=${required}`], `The ADU would be ${num(d)} ft from the rear lot line against a ${num(required)} ft rear setback (SMC 23.44.090 Table A, footnote 3). ${nearText(d, required, r.spec.mappingToleranceFt)}`), verifyItem: "Confirm the rear lot line with a survey; the ADU is close to the rear setback." });
      } else {
        const pass = where === "CLEARS";
        out.push({
          finding: known(SUBJECT.REAR, r.rule, pass, [`distanceToRearLotLineFt=${d}`, `requiredFt=${required}`, `alleyAdjacent=${project.alleyAdjacent}`], `The ADU would be ${num(d)} ft from the rear lot line. An ADU's rear setback is ${num(required)} ft (SMC 23.44.090 Table A, footnote 3), so it ${pass ? "meets" : "does not meet"} that setback. ${DECLARED_BASIS}`),
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
          finding: known(SUBJECT.SIDE, r.rule, false, [`distanceToSideLotLineFt=${d}`, `minimumFt=${minRequired}`], `The ADU would be ${num(d)} ft from the nearest side lot line. The side setback is never less than ${num(minRequired)} ft (SMC 23.44.090 Table A). ${DECLARED_BASIS}`),
          blocker: `The ADU is ${num(d)} ft from a side lot line; at least ${num(minRequired)} ft is required`,
        });
      } else if (minWhere === "NEAR") {
        out.push({
          finding: verify(SUBJECT.SIDE, r.rule, [`distanceToSideLotLineFt=${d}`, `minimumFt=${minRequired}`], `The ADU would be ${num(d)} ft from the nearest side lot line against a ${num(minRequired)} ft minimum side setback (SMC 23.44.090 Table A). ${nearText(d, minRequired, r.spec.mappingToleranceFt)}`),
          verifyItem: "Confirm the side lot line with a survey; the ADU is close to the side setback.",
        });
      } else if (smallFtsaLot || againstThreshold(d, r.spec.sideAverageFt, r.spec.mappingToleranceFt) === "CLEARS") {
        out.push({
          finding: known(SUBJECT.SIDE, r.rule, true, [`distanceToSideLotLineFt=${d}`, `requiredFt=${smallFtsaLot ? r.spec.smallLotSideFt : r.spec.sideAverageFt}`], `The ADU would be ${num(d)} ft from the nearest side lot line, which meets the side setback (${smallFtsaLot ? `${num(r.spec.smallLotSideFt)} ft on a lot under ${sf(r.spec.smallLotAreaSqFt)} sq ft in a frequent transit service area` : `${num(r.spec.sideAverageFt)} ft average, ${num(r.spec.sideMinFt)} ft minimum`}; SMC 23.44.090 Table A). ${DECLARED_BASIS}`),
        });
      } else {
        out.push({
          finding: verify(SUBJECT.SIDE, r.rule, [`distanceToSideLotLineFt=${d}`], `The ADU would be ${num(d)} ft from the nearest side lot line. That meets the ${num(r.spec.sideMinFt)} ft minimum, but the standard side setback is ${num(r.spec.sideAverageFt)} ft on average along the wall (SMC 23.44.090 Table A), so whether the average is met depends on the shape of the wall, and ${unknownSmallLotTransit ? "whether this lot qualifies for the reduced setback on small lots in a frequent transit service area could not be determined" : "this lot does not qualify for the reduced small-lot setback"}.`),
          verifyItem: "Confirm the side setback with the proposed wall layout (5 ft average, 3 ft minimum).",
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
      const wFront = againstThreshold(d, r.spec.frontFt, r.spec.mappingToleranceFt);
      if (wFront === "CLEARS") {
        out.push({ finding: known(SUBJECT.FRONT, r.rule, true, [`distanceToFrontLotLineFt=${d}`, `requiredFt=${r.spec.frontFt}`], `The ADU would be ${num(d)} ft from the front lot line, which meets the ${num(r.spec.frontFt)} ft front setback (SMC 23.44.090 Table A). ${DECLARED_BASIS}`) });
      } else if (units >= 3 && againstThreshold(d, requiredFront, r.spec.mappingToleranceFt) !== "SHORT") {
        out.push({
          finding: verify(SUBJECT.FRONT, r.rule, [`distanceToFrontLotLineFt=${d}`, `unitsAfterAdu=${units}`], `The ADU would be ${num(d)} ft from the front lot line. The front setback is ${num(r.spec.frontFt)} ft for lots with one or two dwelling units and ${num(r.spec.frontThreeOrMoreUnitsFt)} ft for lots with three or more (SMC 23.44.090 Table A). With this ADU the lot would have ${units}; whether ADUs count toward the three is for SDCI to confirm. ${wFront === "NEAR" ? nearText(d, r.spec.frontFt, r.spec.mappingToleranceFt) : ""}`.trim()),
          verifyItem: "Confirm the front setback that applies when the lot has three dwelling units.",
        });
      } else if (wFront === "NEAR") {
        out.push({ finding: verify(SUBJECT.FRONT, r.rule, [`distanceToFrontLotLineFt=${d}`], `The ADU would be ${num(d)} ft from the front lot line against a ${num(r.spec.frontFt)} ft front setback (SMC 23.44.090 Table A). ${nearText(d, r.spec.frontFt, r.spec.mappingToleranceFt)}`), verifyItem: "Confirm the front lot line with a survey; the ADU is close to the front setback." });
      } else {
        out.push({
          finding: known(SUBJECT.FRONT, r.rule, false, [`distanceToFrontLotLineFt=${d}`, `requiredFt=${requiredFront}`], `The ADU would be ${num(d)} ft from the front lot line; the front setback is ${num(requiredFront)} ft (SMC 23.44.090 Table A). ${DECLARED_BASIS}`),
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

function evaluateSeparation(project: AduProjectDetails, rules: ActiveRules): Evaluated[] {
  const r = rules.find<AduSeparationSpec>(AduRuleType.SEPARATION);
  if (!r) return [{ uncovered: "separation between structures" }];
  const out: Evaluated[] = [];
  const d = project.distanceToDwellingFt;
  if (d === undefined) {
    out.push({
      finding: verify(SUBJECT.SEPARATION, r.rule, [], `Cannot evaluate: ${project.dwellingSeparationEvidenceGapReason ?? "the distance to the existing dwelling is not available."} Structures containing floor area must be at least ${num(r.spec.minFt)} ft apart (SMC 23.44.100.A).`),
      verifyItem: "Identify the existing house on the map so its distance to the ADU can be measured.",
    });
  } else {
    const where = againstThreshold(d, r.spec.minFt, r.spec.mappingToleranceFt);
    const pass = where === "CLEARS";
    if (where === "NEAR") {
      out.push({
        finding: verify(SUBJECT.SEPARATION, r.rule, [`distanceToDwellingFt=${d}`, `requiredFt=${r.spec.minFt}`], `The ADU would be ${num(d)} ft from the existing dwelling; structures containing floor area must be at least ${num(r.spec.minFt)} ft apart (SMC 23.44.100.A). ${nearText(d, r.spec.minFt, r.spec.mappingToleranceFt)}`),
        verifyItem: "Measure the distance between the ADU and the house on a survey; it is close to the 5 ft separation.",
      });
    } else out.push({
      finding: known(SUBJECT.SEPARATION, r.rule, pass, [`distanceToDwellingFt=${d}`, `requiredFt=${r.spec.minFt}`], `The ADU would be ${num(d)} ft from the existing dwelling. Structures containing floor area must be at least ${num(r.spec.minFt)} ft apart (SMC 23.44.100.A; eaves may project up to 2 ft into the separation), so it ${pass ? "meets" : "does not meet"} that requirement. ${DECLARED_BASIS}`),
      ...(pass ? {} : { blocker: `The ADU is ${num(d)} ft from the existing house; ${num(r.spec.minFt)} ft is required` }),
    });
  }
  const other = project.nearestOtherStructure;
  if (other && other.distanceFt < r.spec.minFt) {
    out.push({
      finding: verify(SUBJECT.OTHER_STRUCTURES, r.rule, [`nearestOtherStructureFt=${other.distanceFt}`], `Another mapped building${other.areaSqFt ? ` (about ${sf(other.areaSqFt)} sq ft)` : ""} is ${num(other.distanceFt)} ft from the ADU. The ${num(r.spec.minFt)} ft separation applies between structures that contain floor area (SMC 23.44.100.A); whether that building contains floor area (a garage or shed may not count the same way) is for SDCI to confirm.`),
      verifyItem: "Confirm whether the nearby building counts as a structure with floor area for the 5 ft separation.",
    });
  }
  return out;
}

function evaluateHeight(project: AduProjectDetails, rules: ActiveRules): Evaluated {
  const r = rules.find<AduHeightSpec>(AduRuleType.HEIGHT);
  if (!r) return { uncovered: "ADU height" };
  const base = r.spec.maxFt;
  const evidence = [`heightFt=${project.heightFt}`, `limitFt=${base}`];
  if (project.heightFt <= base) {
    return { finding: known(SUBJECT.HEIGHT, r.rule, true, evidence, `The ADU's height of ${num(project.heightFt)} ft is within the ${num(base)} ft height limit (SMC 23.44.070.A). ${DECLARED_BASIS}`) };
  }
  const ceiling = r.spec.treeRetentionMaxFt + r.spec.pitchedRoofRidgeAllowanceFt;
  if (project.heightFt <= ceiling) {
    return {
      finding: verify(SUBJECT.HEIGHT, r.rule, evidence, `The ADU's height of ${num(project.heightFt)} ft is over the ${num(base)} ft limit. The limit is ${num(r.spec.treeRetentionMaxFt)} ft on lots that retain certain trees or earn enough tree points (SMC 23.44.070.A.2), and a pitched-roof ridge may rise up to ${num(r.spec.pitchedRoofRidgeAllowanceFt)} ft above the limit (SMC 23.44.070.B). Whether either applies is not determined here.`),
      verifyItem: "Confirm how the ADU's height is measured and whether a taller height limit applies.",
    };
  }
  return {
    finding: known(SUBJECT.HEIGHT, r.rule, false, evidence, `The ADU's height of ${num(project.heightFt)} ft is over even the tallest limit that can apply (${num(r.spec.treeRetentionMaxFt)} ft with the tree allowance, plus up to ${num(r.spec.pitchedRoofRidgeAllowanceFt)} ft for a pitched-roof ridge; SMC 23.44.070). ${DECLARED_BASIS}`),
    blocker: `The ADU is ${num(project.heightFt)} ft tall, over the tallest limit that can apply (${num(ceiling)} ft)`,
  };
}

function evaluateLotCoverage(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
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
    proposedShedFootprintSqFt: aduFootprintSqFt(project),
    ecaAdjustment: evaluateEcaLotAreaAdjustment(site.ecaFindings),
  });
  const pct = Math.round((result.estimatedCoverageSqFt / site.parcelAreaSqFt) * 100);
  const lead = `Estimated lot coverage with the ADU is ${pct}% (${sf(result.estimatedCoverageSqFt)} sq ft of ${sf(site.parcelAreaSqFt)} sq ft): ${sf(site.existingMappedCoverageSqFt)} sq ft of mapped existing buildings plus the ${sf(aduFootprintSqFt(project))} sq ft ADU footprint. The standard limit is ${num(r.spec.maxPercent)}% (SMC 23.44.080.A). The existing figure comes from Seattle's building-outline map, which can differ from what counts for lot coverage (for example, eaves under 36 inches and low decks are not counted).`;
  const evidence = [`estimatedCoverageSqFt=${Math.round(result.estimatedCoverageSqFt)}`, `parcelAreaSqFt=${Math.round(site.parcelAreaSqFt)}`];
  const verifyItem = "Confirm lot coverage (and any critical-area land excluded from the lot area) with a survey.";
  switch (result.status) {
    case "WITHIN_STANDARD_ALLOWANCE":
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

function evaluateFar(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
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
  const adu = estimateAduFloorAreaSqFt(project);
  const evidence = [`farLimit=${far}`, `limitSqFt=${Math.round(limit)}`, `unitsAfterAdu=${units}`, `aduFloorAreaSqFt=${Math.round(adu)}`];
  const limitText = `With this ADU the lot would have ${units} dwelling units on ${sf(site.parcelAreaSqFt)} sq ft (about ${sf(perUnit)} sq ft per unit), which puts it in the ${far} floor-area-ratio band (SMC 23.44.050 Table A). That allows about ${sf(limit)} sq ft of total chargeable floor area across all structures${site.parcelAreaSqFt < r.spec.smallLotAreaSqFt ? `, since lots under ${sf(r.spec.smallLotAreaSqFt)} sq ft may have at least ${sf(r.spec.smallLotMinChargeableSqFt)} sq ft` : ""}. Adding ADUs raises the unit count, which can raise this limit. Underground floors and portions of a story no more than 4 ft above grade are not counted.`;
  if (project.existingChargeableFloorAreaSqFt === undefined) {
    return {
      finding: verify(SUBJECT.FAR, r.rule, evidence, `${limitText} You did not give the existing chargeable floor area, so the ${sf(adu)} sq ft ADU could not be added to it. The room left for the ADU is the limit less your existing chargeable floor area.`),
      verifyItem: "Add up the existing chargeable floor area of all structures and compare it to the floor area ratio limit.",
    };
  }
  const total = project.existingChargeableFloorAreaSqFt + adu;
  const totalEvidence = [...evidence, `existingChargeableFloorAreaSqFt=${Math.round(project.existingChargeableFloorAreaSqFt)}`, `totalSqFt=${Math.round(total)}`];
  if (total <= limit) {
    return { finding: known(SUBJECT.FAR, r.rule, true, totalEvidence, `${limitText} Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft plus the ${sf(adu)} sq ft ADU is ${sf(total)} sq ft, within the limit, ${sf(limit - total)} sq ft to spare. This rests on the floor area you declared.`) };
  }
  return {
    finding: verify(SUBJECT.FAR, r.rule, totalEvidence, `${limitText} Your existing ${sf(project.existingChargeableFloorAreaSqFt)} sq ft plus the ${sf(adu)} sq ft ADU is ${sf(total)} sq ft, over the limit by ${sf(total - limit)} sq ft. This rests on the floor area you declared, which may include exempt areas.`),
    constraint: `Existing plus ADU floor area of ${sf(total)} sq ft appears to exceed the ${sf(limit)} sq ft floor area ratio limit`,
    verifyItem: "Confirm the chargeable floor area of all structures against the floor area ratio limit.",
  };
}

function evaluateAmenity(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
  const r = rules.find<AduAmenitySpec>(AduRuleType.AMENITY_AREA);
  if (!r) return { uncovered: "amenity area" };
  const required = site.parcelAreaSqFt !== undefined ? Math.max(site.parcelAreaSqFt * r.spec.requiredFractionOfLot, r.spec.minSqFt) : undefined;
  const requirement = `Amenity area of ${Math.round(r.spec.requiredFractionOfLot * 100)}% of the lot area${required !== undefined ? ` (about ${sf(required)} sq ft)` : ""}, at least ${sf(r.spec.minSqFt)} sq ft and ${num(r.spec.minDimensionFt)} ft in each dimension, unenclosed and free of parking and driveways (SMC 23.44.110).`;
  const exemptUnit = project.existingAduCount === 0 && project.existingPrincipalDwellingUnits === 1;
  if (project.existingHouseBuiltBefore1982 === true && exemptUnit) {
    return {
      finding: known(SUBJECT.AMENITY, r.rule, true, ["exemption=oneNewUnitOnPre1982Dwelling"], `No amenity area is required for one new dwelling unit added to a dwelling that existed as of January 1, 1982 (SMC 23.44.110.H.1). You reported a single house built before 1982 with no other ADU, so this ADU appears to qualify. This rests on what you told us.`),
    };
  }
  const why = project.existingHouseBuiltBefore1982 === undefined ? "You did not say whether the house was built before 1982, which would exempt a single added unit." : project.existingHouseBuiltBefore1982 === true ? "The pre-1982 exemption covers only one new unit added to a single dwelling." : "The house was not built before 1982, so the exemption for one added unit does not apply.";
  return {
    finding: verify(SUBJECT.AMENITY, r.rule, [`requiredSqFt=${required !== undefined ? Math.round(required) : "unknown"}`], `${requirement} ${why} Development that earns enough tree points for ten percent canopy at maturity is also exempt (SMC 23.44.110.H.2). Whether your site plan provides the area is not determined here.`),
    verifyItem: "Find where the amenity area would go on the site plan (or confirm an exemption applies).",
  };
}

function evaluateTrees(project: AduProjectDetails, site: AduSiteFacts, rules: ActiveRules): Evaluated {
  const r = rules.find<AduTreesSpec>(AduRuleType.TREES);
  if (!r) return { uncovered: "tree requirement" };
  if (site.parcelAreaSqFt === undefined) {
    return { finding: verify(SUBJECT.TREES, r.rule, [], "The tree requirement could not be calculated because the lot area was not available."), verifyItem: "Plan for planting or keeping trees to meet the tree-point requirement." };
  }
  const units = unitsAfterAdu(project);
  const band = sqFtPerUnitBand(r.spec.bands, site.parcelAreaSqFt / units);
  const sqFtPerPoint = band ? band.sqFtPerPoint : r.spec.denserSqFtPerPoint;
  const points = site.parcelAreaSqFt / sqFtPerPoint;
  const trees = site.parcelAreaSqFt / r.spec.lotSqFtPerNewTree;
  return {
    finding: verify(SUBJECT.TREES, r.rule, [`pointsRequired=${points.toFixed(1)}`, `newTreesAlternative=${trees.toFixed(1)}`], `A development with a new dwelling unit must plant or keep trees to earn ${points.toFixed(1)} tree points (one per ${sf(sqFtPerPoint)} sq ft of lot area at this density) or plant one new tree per ${sf(r.spec.lotSqFtPerNewTree)} sq ft (about ${Math.ceil(trees)}), whichever is greater (SMC 23.44.120). Existing trees on the lot count by trunk diameter. Whether your site can meet it is not determined here.`),
    verifyItem: "Take a tree inventory (existing trees count toward the points).",
  };
}

function evaluateDesign(project: AduProjectDetails, rules: ActiveRules): Evaluated {
  const r = rules.find<AduDesignStandardsSpec>(AduRuleType.DESIGN_STANDARDS);
  if (!r) return { uncovered: "design standards" };
  const distances = [project.distanceToFrontLotLineFt, ...Object.values(project.unresolvedStreetFrontageDistancesFt ?? {})].filter((v): v is number => v !== undefined);
  const nearest = distances.length > 0 ? Math.min(...distances) : undefined;
  const streetFacing =
    nearest === undefined
      ? "Whether the ADU is within the distance of a street at which the street-facing entry and window rules apply could not be determined."
      : nearest <= r.spec.streetFacingWithinFt
        ? `The ADU would be ${num(nearest)} ft from a street lot line, within ${num(r.spec.streetFacingWithinFt)} ft, so its street-facing facade needs a pedestrian entry with at least ${num(r.spec.weatherProtectionFt)} ft by ${num(r.spec.weatherProtectionFt)} ft of weather protection and at least ${r.spec.facadeOpeningsPercent}% of that facade in windows and doors (SMC 23.44.140.D and E).`
        : `The ADU would be ${num(nearest)} ft from the street lot line you indicated; the street-facing entry and window rules apply only within ${num(r.spec.streetFacingWithinFt)} ft of a street (SMC 23.44.140.A.2), but another street, or a shared driveway serving ten or more homes, could change that.`;
  return {
    finding: verify(SUBJECT.DESIGN, r.rule, nearest === undefined ? [] : [`nearestStreetLotLineFt=${nearest}`], `Each unit needs a pedestrian path at least ${num(r.spec.pedestrianAccessMinWidthFt)} ft wide to the sidewalk or front lot line, which may be shared and may cross setbacks (SMC 23.44.140.C). ${streetFacing} These depend on your design.`),
    verifyItem: "Plan a 3 ft pedestrian path from the sidewalk to the ADU entrance.",
  };
}

function evaluateEca(site: AduSiteFacts): Finding[] {
  const findings: Finding[] = [];
  for (const eca of site.ecaFindings) {
    const implication = deriveEcaRegulatoryImplication(eca);
    findings.push({
      classification: implication.classification,
      subject: `${CRITICAL_AREA_FINDING_SUBJECT_PREFIX}${eca.hazardType}`,
      supportingEvidence: [`CriticalAreaFinding(${eca.hazardType})`],
      explanationBasis: implication.reason,
    });
  }
  return findings;
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

const BASE_VERIFY_BEFORE_DESIGN: readonly string[] = [
  "Get a boundary and topographic survey so the lot lines, lot area and grades are measured, not mapped.",
  "Ask SDCI (or a land-use professional) to confirm the zone, overlays and any critical areas for this parcel.",
  "Check sewer, water and stormwater capacity and the cost of the connections, including King County's sewer capacity charge.",
  "Take a tree inventory and plan how the tree requirement would be met.",
  "Confirm with SDCI that no recorded covenant or other title matter limits an ADU.",
];

function buildFeasibility(input: {
  zoning: ZoningApplicability | undefined;
  evaluated: Evaluated[];
  uncovered: string[];
  rulesHaveCoverage: boolean;
  placementMissing: boolean;
  mappedEca: string[];
}): AduFeasibility {
  const blockers = input.evaluated.map((e) => e.blocker).filter((v): v is string => Boolean(v));
  const constraints = input.evaluated.map((e) => e.constraint).filter((v): v is string => Boolean(v));
  const verifyItems = [...new Set(input.evaluated.map((e) => e.verifyItem).filter((v): v is string => Boolean(v)))];
  const zone = input.zoning;

  let headline: AduFeasibilityHeadline;
  let summary: string;
  if (zone?.status === "NOT_NR") {
    headline = "CANNOT_TELL";
    summary = `Seattle's zoning data places this parcel in ${zone.zoningLabel}, not a Neighborhood Residential zone. Permit Preflight's ADU checks are for Neighborhood Residential zones, so it cannot tell you whether an ADU is feasible here. ADU rules differ by zone; SDCI can tell you which apply.`;
  } else if (blockers.length > 0) {
    headline = "BLOCKED";
    summary = `As entered, this ADU does not appear to be allowed: ${blockers.length === 1 ? "1 requirement is not met" : `${blockers.length} requirements are not met`}. Review the items below; changing the size, height or position may resolve them.`;
  } else if (input.uncovered.length > 0 && !input.rulesHaveCoverage) {
    headline = "CANNOT_TELL";
    summary = "Permit Preflight could not evaluate this ADU: the rules it depends on are not available in this system.";
  } else if (input.placementMissing) {
    headline = "CANNOT_TELL";
    summary = "The ADU's position on the lot was not established, so its distances to the property lines and the existing house could not be measured. Place it on the map to get a read on setbacks and separation.";
  } else if (constraints.length > 0) {
    headline = "LIKELY_CONSTRAINED";
    summary = `Nothing is known to prohibit this ADU, but ${constraints.length === 1 ? "1 limit appears to be exceeded on the figures available" : `${constraints.length} limits appear to be exceeded on the figures available`}. Verify these first.`;
  } else {
    headline = "LOOKS_FEASIBLE";
    summary = `Nothing evaluated here prohibits this ADU as entered. ${verifyItems.length} ${verifyItems.length === 1 ? "item needs" : "items need"} to be verified before design work, and this is a screening read, not an approval.`;
  }

  const zoningVerify: string[] = [];
  if (zone && zone.status !== "NR_VERIFIED") zoningVerify.push("Confirm the parcel's zone with SDCI; it could not be verified as Neighborhood Residential.");
  if (zone && zone.status !== "UNRESOLVED" && (zone.overlays.shorelineDistrict || zone.overlays.historicDistrict || zone.overlays.landmarkParcel || zone.overlays.overlayLabels.length > 0)) {
    zoningVerify.push("Confirm the overlay (shoreline, historic or landmark) rules with SDCI; they can change or add requirements for an ADU.");
  }
  const eca = input.mappedEca.length > 0 ? [`Have the mapped critical-area indications checked (${input.mappedEca.join(", ")}); they can limit where and whether you can build.`] : [];

  return {
    headline,
    summary,
    blockers,
    constraints,
    verifyBeforeDesign: [...zoningVerify, ...eca, ...verifyItems, ...BASE_VERIFY_BEFORE_DESIGN],
    notEvaluated: [...ADU_NOT_EVALUATED],
  };
}

// ---------------------------------------------------------------------------------------------

export interface EvaluateAduInput {
  project: AduProjectDetails;
  site: AduSiteFacts;
  /** Re-filtered to ACTIVE defensively; callers pre-filter by applicableProjectType = "adu". */
  candidateActiveRules: RegulatoryRule[];
  zoningApplicability?: ZoningApplicability;
}

export function evaluateAdu(input: EvaluateAduInput): AduEvaluationOutcome {
  const rules = indexActiveRules(input.candidateActiveRules);
  const { project, site } = input;
  const notNr = input.zoningApplicability?.status === "NOT_NR";
  const findings: Finding[] = [];
  const uncovered: string[] = [];
  const evaluated: Evaluated[] = [];

  if (notNr) {
    uncovered.push("ADU zoning limits (parcel is not in a Neighborhood Residential zone)");
  } else {
    evaluated.push(
      evaluateCount(project, rules),
      evaluateDensity(project, site, rules),
      evaluateSize(project, rules),
      ...evaluateSetbacks(project, site, rules),
      ...evaluateSeparation(project, rules),
      evaluateHeight(project, rules),
      evaluateLotCoverage(project, site, rules),
      evaluateFar(project, site, rules),
      evaluateAmenity(project, site, rules),
      evaluateTrees(project, site, rules),
      evaluateDesign(project, rules)
    );
    for (const e of evaluated) {
      if (e.finding) findings.push(e.finding);
      if (e.uncovered) uncovered.push(e.uncovered);
    }
  }

  const eca = ecaSummaryFinding(site);
  findings.push(eca.finding, ...evaluateEca(site));
  findings.push(...zoningApplicabilityFindings(input.zoningApplicability, "ADU rules"));

  const rulesHaveCoverage = evaluated.some((e) => e.finding !== undefined);
  const feasibility = buildFeasibility({
    zoning: input.zoningApplicability,
    evaluated,
    uncovered,
    rulesHaveCoverage,
    placementMissing: !notNr && placementGap(project) !== undefined,
    mappedEca: eca.mapped,
  });

  return {
    findings,
    feasibility,
    declaredInputs: describeAduDeclaredInputs(project),
    uncoveredConstraintTypes: [...new Set(uncovered)],
  };
}
