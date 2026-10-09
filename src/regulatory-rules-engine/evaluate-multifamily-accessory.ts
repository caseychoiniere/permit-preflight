/**
 * Shed and detached-garage evaluation in the multifamily zones - Lowrise (LR1-LR3), Midrise (MR) and Highrise (HR),
 * SMC Chapter 23.45 (citywide zoning coverage, 2026-10-09). Pure; every threshold comes from the ACTIVE rule row's own
 * specification, no SMC number is a literal here.
 *
 * What the code says (current Municode text read 2026-10-09; Ord. 127376):
 *   - SMC 23.45.518.H.1: detached garages, carports and other accessory structures that are not ADUs are allowed in required
 *     REAR or SIDE setbacks, provided (a) one between a principal structure and a side lot line provides the setback required
 *     of the principal structure, (b) any portion more than 25 ft from the rear lot line is at least 5 ft from the side lot
 *     line, (c) it is at least 7 ft from any lot line abutting a street, (d) it is at least 3 ft from every principal structure
 *     including eaves. Nothing in H.1 lets an accessory structure stand in the required FRONT setback.
 *   - SMC 23.45.514.C: an accessory structure other than an ADU in a required setback or separation is limited to 12 ft
 *     (a garage's pitched ridge may add 3 ft); elsewhere the zone's structure height limit applies.
 *   - SMC 23.45.519: 5 ft between structures containing floor area.
 *   - SMC 23.45.510: floor area ratio limits the total chargeable floor area of all structures; the multifamily zones have NO
 *     lot-coverage percentage limit.
 *   - SMC 23.45.536: parking access, location and garage-door standards.
 * The mapped distances are screening measurements (not a survey), so each comparison keeps the platform's mapping tolerance:
 * only a distance clearly beyond a threshold is a definite result, anything within the tolerance is REQUIRES_VERIFICATION.
 */

import type { InferencePolicy, RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { ComplianceOutcome, FindingClassification } from "./types.js";
import type { Finding, GarageProjectDetails, ShedProjectDetails } from "./types.js";
import { NOT_A_SURVEY, againstMinimum, classifySpatialFinding, missingEvidenceFinding, roundToTenthFt } from "./evaluate-common.js";
import type { MappingTolerance } from "./evaluate-common.js";

export const MultifamilyAccessoryRuleType = {
  SETBACKS: "MF_ACC_SETBACKS",
  HEIGHT: "MF_ACC_HEIGHT",
  SEPARATION: "MF_ACC_SEPARATION",
  FLOOR_AREA_RATIO: "MF_FAR",
  GARAGE_PARKING_ACCESS: "MF_GARAGE_PARKING_ACCESS",
} as const;
export type MultifamilyAccessoryRuleType = (typeof MultifamilyAccessoryRuleType)[keyof typeof MultifamilyAccessoryRuleType];

/** Rule types consumed by an aggregate computation (not the generic per-rule dispatch). */
export const MF_AGGREGATE_ONLY_RULE_TYPES: ReadonlySet<string> = new Set([MultifamilyAccessoryRuleType.HEIGHT]);

type MfProject = ShedProjectDetails | GarageProjectDetails;

/** A required setback, as the zone's table states it: an average with a minimum (equal when the table gives one figure). */
export interface MfRequiredSetback {
  minFt: number;
  averageFt: number;
}

export interface MfAccessorySetbacksSpec extends MappingTolerance {
  ruleType: typeof MultifamilyAccessoryRuleType.SETBACKS;
  /** The zone's required front setback (a structure may not stand in it; H.1 allows only rear and side setbacks). */
  front: MfRequiredSetback;
  /** H.1.c: minimum distance from any lot line that abuts a street. */
  streetLotLineMinFt: number;
  /** The side setback an accessory structure must keep where H.1.a or H.1.b applies. */
  sideMinFt: number;
  /** H.1.b: a portion of the structure farther than this from the rear lot line must keep sideMinFt from the side lot line. */
  sideBeyondRearDepthFt: number;
  /** Roof-edge projections (eaves, gutters) must stay at least this far from a lot line (SMC 23.45.518.G.1). */
  projectionMinFromLotLineFt: number;
  /** Customer-facing citation text for the placement allowance, e.g. "SMC 23.45.518.H.1". */
  placementCitation: string;
}

export interface MfAccessoryHeightSpec extends MappingTolerance {
  ruleType: typeof MultifamilyAccessoryRuleType.HEIGHT;
  /** SMC 23.45.514.C: the limit for an accessory structure in a required setback or separation. */
  inSetbackMaxFt: number;
  /** SMC 23.45.514.C.1: a garage's pitched ridge may rise this much above the limit. */
  garageRidgeAllowanceFt: number;
  /** The lowest structure height limit of the zones this row covers; at or below it the structure is within the limit wherever it stands. */
  outsideSetbackSafeMaxFt: number;
  /** The zone's required setbacks, used only to decide whether a placement is clearly inside one (the 12-ft limit). */
  required: { front: MfRequiredSetback; rear: MfRequiredSetback; rearAlley: MfRequiredSetback; side: MfRequiredSetback };
  /** Customer-facing citation text, e.g. "SMC 23.45.514.C". */
  citation: string;
  /** Customer-facing statement of the zone's structure height limits (for the not-clearly-within case). */
  structureHeightText: string;
}

export interface MfAccessorySeparationSpec extends MappingTolerance {
  ruleType: typeof MultifamilyAccessoryRuleType.SEPARATION;
  /** SMC 23.45.518.H.1.d: minimum separation from a principal structure for an accessory structure in a required setback. */
  inSetbackMinFt: number;
  /** SMC 23.45.519.A: minimum separation between structures containing floor area elsewhere. Absent in Highrise zones, where 23.45.519 does not apply: only the in-setback figure exists. */
  otherwiseMinFt?: number;
}

export interface MfFloorAreaRatioSpec {
  ruleType: typeof MultifamilyAccessoryRuleType.FLOOR_AREA_RATIO;
  far: number;
  /** Where the table gives a different figure for stacked dwelling units. */
  farStacked?: number;
  /** Customer-facing statement of the zone and the table cell, e.g. "LR1 with an MHA suffix". */
  zoneText: string;
  /** Any further condition in the table for this zone (regional-center figure, footnote), stated plainly. */
  conditionText?: string;
}

export interface MfGarageParkingAccessSpec {
  ruleType: typeof MultifamilyAccessoryRuleType.GARAGE_PARKING_ACCESS;
  /** SMC 23.45.536.E: garage doors facing the street in LR and MR zones. Absent in Highrise zones, where that provision does not apply. */
  garageDoorMinFromStreetLotLineFt?: number;
  surfaceParkingMinFromStreetLotLineFt: number;
  citation: string;
}

const NOUN = (p: MfProject): string => (p.projectType === "garage" ? "Detached garage" : "Shed");
const noun = (p: MfProject): string => (p.projectType === "garage" ? "detached garage" : "shed");
const fmt = (n: number): string => `${roundToTenthFt(n)}`;

type AppliedRule = Pick<RegulatoryRule, "id" | "subject" | "citation">;
const applied = (rule: RegulatoryRule): AppliedRule => ({ id: rule.id, subject: rule.subject, citation: rule.citation });

// ---------------------------------------------------------------------------------------------
// Setbacks
// ---------------------------------------------------------------------------------------------

/** Evidence that the structure stands clear of a lot line under every reading of the line's role (front, street, side). */
function clearsStreetReadings(distanceFt: number, spec: MfAccessorySetbacksSpec, tol: number): boolean {
  return distanceFt >= Math.max(spec.streetLotLineMinFt, spec.front.averageFt) + tol;
}

export function evaluateMfAccessorySetbacks(rule: RegulatoryRule, spec: MfAccessorySetbacksSpec, project: MfProject, activePolicies: InferencePolicy[]): Finding[] {
  const out: Finding[] = [];
  const ruleApplied = applied(rule);
  const tol = spec.mappingToleranceFt ?? 0;
  const label = NOUN(project);
  const place = spec.placementCitation;
  const streetNeed = Math.max(spec.streetLotLineMinFt, spec.front.averageFt);

  // ---- front ------------------------------------------------------------------------------------------------------
  const subjectFront = `${label} front setback`;
  if (project.distanceToFrontLotLineFt === undefined) {
    out.push(missingEvidenceFinding(subjectFront, ruleApplied, project.setbackEvidenceGapReason ?? "distanceToFrontLotLineFt is not available."));
  } else if (project.frontRoleEvidenceGapReason !== undefined) {
    const d = project.distanceToFrontLotLineFt;
    if (clearsStreetReadings(d, spec, tol)) {
      out.push(
        classifySpatialFinding({
          rule,
          appliedRule: ruleApplied,
          subject: subjectFront,
          pass: true,
          spatialEvidenceQuality: project.spatialEvidenceQuality,
          activePolicies,
          supportingEvidence: [`distanceToFrontLotLineFt=${d}`],
          explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the property line you indicated as the front. Whether that line is the code-defined front or a street lot line is not settled (${project.frontRoleEvidenceGapReason}), but ${fmt(d)} ft clears the ${fmt(spec.front.averageFt)} ft front setback and the ${fmt(spec.streetLotLineMinFt)} ft distance from a street lot line either way.`,
        })
      );
    } else {
      out.push({
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject: subjectFront,
        appliedRule: ruleApplied,
        supportingEvidence: [`distanceToFrontLotLineFt=${d}`],
        explanationBasis: `The distance to your indicated front property line is a known ${fmt(d)}ft, but ${project.frontRoleEvidenceGapReason}`,
      });
    }
  } else {
    const d = project.distanceToFrontLotLineFt;
    const where = againstMinimum(d, spec.front.averageFt, tol);
    const clearlyInside = d < spec.front.minFt - tol;
    if (where === "CLEARS") {
      out.push(
        classifySpatialFinding({
          rule,
          appliedRule: ruleApplied,
          subject: subjectFront,
          pass: true,
          spatialEvidenceQuality: project.spatialEvidenceQuality,
          activePolicies,
          supportingEvidence: [`distanceToFrontLotLineFt=${d}`, `frontSetbackFt=${spec.front.averageFt} average, ${spec.front.minFt} minimum`],
          explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the front property line, outside the required front setback (${fmt(spec.front.averageFt)} ft average, ${fmt(spec.front.minFt)} ft minimum). ${NOT_A_SURVEY}`,
        })
      );
    } else if (clearlyInside) {
      out.push(
        classifySpatialFinding({
          rule,
          appliedRule: ruleApplied,
          subject: subjectFront,
          pass: false,
          spatialEvidenceQuality: project.spatialEvidenceQuality,
          activePolicies,
          supportingEvidence: [`distanceToFrontLotLineFt=${d}`, `frontSetbackFt=${spec.front.averageFt} average, ${spec.front.minFt} minimum`],
          explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the front property line, inside the required front setback (${fmt(spec.front.averageFt)} ft average, ${fmt(spec.front.minFt)} ft minimum). ${place} lets an accessory structure stand in a required rear or side setback, not the front setback. ${NOT_A_SURVEY}`,
        })
      );
    } else {
      out.push({
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject: subjectFront,
        appliedRule: ruleApplied,
        supportingEvidence: [`distanceToFrontLotLineFt=${d}`],
        explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the front property line against a front setback of ${fmt(spec.front.averageFt)} ft on average with a ${fmt(spec.front.minFt)} ft minimum. That is not clearly outside the setback or clearly inside it, so it is not treated as a definite result. ${NOT_A_SURVEY}`,
      });
    }
  }

  // ---- rear -------------------------------------------------------------------------------------------------------
  const subjectRear = `${label} rear setback`;
  if (project.distanceToRearLotLineFt === undefined) {
    out.push(missingEvidenceFinding(subjectRear, ruleApplied, project.setbackEvidenceGapReason ?? "distanceToRearLotLineFt is not available."));
  } else if (project.rearRoleEvidenceGapReason !== undefined) {
    const d = project.distanceToRearLotLineFt;
    if (d >= streetNeed + tol) {
      out.push({
        classification: FindingClassification.KNOWN,
        subject: subjectRear,
        complianceOutcome: ComplianceOutcome.PASS,
        appliedRule: ruleApplied,
        supportingEvidence: [`distanceToRearLotLineFt=${d}`],
        explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the property line you indicated as the rear. Whether that line also faces a street is not settled (${project.rearRoleEvidenceGapReason}), but ${fmt(d)} ft clears the ${fmt(spec.streetLotLineMinFt)} ft distance required from a street lot line either way.`,
      });
    } else {
      out.push({
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject: subjectRear,
        appliedRule: ruleApplied,
        supportingEvidence: [`distanceToRearLotLineFt=${d}`],
        explanationBasis: `The distance to your indicated rear property line is a known ${fmt(d)}ft, but ${project.rearRoleEvidenceGapReason}`,
      });
    }
  } else {
    const d = project.distanceToRearLotLineFt;
    if (d >= spec.projectionMinFromLotLineFt + tol) {
      out.push(
        classifySpatialFinding({
          rule,
          appliedRule: ruleApplied,
          subject: subjectRear,
          pass: true,
          spatialEvidenceQuality: project.spatialEvidenceQuality,
          activePolicies,
          supportingEvidence: [`distanceToRearLotLineFt=${d}`, `alleyAdjacent=${project.alleyAdjacent}`],
          explanationBasis: `${place} allows an accessory structure in the required rear setback, so no minimum distance from the rear property line applies to the ${noun(project)}${project.alleyAdjacent ? " (the rear line abuts an alley)" : ""}; it is ${fmt(d)} ft from it. ${NOT_A_SURVEY}`,
        })
      );
    } else {
      out.push({
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject: subjectRear,
        appliedRule: ruleApplied,
        supportingEvidence: [`distanceToRearLotLineFt=${d}`],
        explanationBasis: `${place} allows an accessory structure in the required rear setback, so no minimum distance from the rear property line applies, but the ${noun(project)} is only ${fmt(d)} ft from it. Roof edges, eaves and gutters may project no closer than ${fmt(spec.projectionMinFromLotLineFt)} ft to a lot line (SMC 23.45.518.G.1), and the roof overhang is not known, so this is left for SDCI to confirm. ${NOT_A_SURVEY}`,
      });
    }
  }

  // ---- side -------------------------------------------------------------------------------------------------------
  const subjectSide = `${label} side setback`;
  if (project.distanceToSideLotLineFt === undefined) {
    out.push(missingEvidenceFinding(subjectSide, ruleApplied, project.setbackEvidenceGapReason ?? "distanceToSideLotLineFt is not available."));
  } else {
    out.push(evaluateMfSide(rule, ruleApplied, spec, project, activePolicies, subjectSide, tol));
  }

  // ---- other street frontage ----------------------------------------------------------------------------------------
  if (project.unresolvedStreetFrontageDistancesFt && Object.keys(project.unresolvedStreetFrontageDistancesFt).length > 0) {
    const entries = Object.entries(project.unresolvedStreetFrontageDistancesFt);
    const minDistanceFt = Math.min(...entries.map(([, d]) => d));
    const supportingEvidence = entries.map(([edgeRef, d]) => `${edgeRef}=${d}`);
    const subject = `${label} setback from additional street frontage`;
    if (clearsStreetReadings(minDistanceFt, spec, tol)) {
      out.push(
        classifySpatialFinding({
          rule,
          appliedRule: ruleApplied,
          subject,
          pass: true,
          spatialEvidenceQuality: project.spatialEvidenceQuality,
          activePolicies,
          supportingEvidence,
          explanationBasis: `This property has additional street frontage; the ${noun(project)} is at least ${fmt(minDistanceFt)} ft from it. Whether that line is a side street line (${fmt(spec.streetLotLineMinFt)} ft minimum for an accessory structure) or, on a through lot, a front line (${fmt(spec.front.averageFt)} ft average), ${fmt(minDistanceFt)} ft clears it either way. ${NOT_A_SURVEY}`,
        })
      );
    } else {
      out.push({
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject,
        appliedRule: ruleApplied,
        supportingEvidence,
        explanationBasis: `This property has additional street frontage (closest measured distance ${fmt(minDistanceFt)}ft). An accessory structure must be at least ${fmt(spec.streetLotLineMinFt)} ft from any lot line that abuts a street (${place}), and on a through lot every setback along a street is a front setback (SMC 23.45.518.D); on a corner lot SDCI determines the front line (SMC 23.84A.024). None of that can be established from this property's own boundary shape, so this cannot be confirmed pass or fail.`,
      });
    }
  }
  return out;
}

function evaluateMfSide(
  rule: RegulatoryRule,
  ruleApplied: AppliedRule,
  spec: MfAccessorySetbacksSpec,
  project: MfProject,
  activePolicies: InferencePolicy[],
  subject: string,
  tol: number
): Finding {
  const d = project.distanceToSideLotLineFt!;
  const place = spec.placementCitation;
  const evidence = [`distanceToSideLotLineFt=${d}`, ...(project.distanceToRearLotLineFt !== undefined ? [`distanceToRearLotLineFt=${project.distanceToRearLotLineFt}`] : [])];

  // Role gap on the side lines (the customer was not sure any side faces a street): a street line needs 7 ft for an accessory structure.
  if (project.sideRoleEvidenceGapReason !== undefined) {
    if (d >= Math.max(spec.streetLotLineMinFt, spec.sideMinFt) + tol) {
      return classifySpatialFinding({
        rule,
        appliedRule: ruleApplied,
        subject,
        pass: true,
        spatialEvidenceQuality: project.spatialEvidenceQuality,
        activePolicies,
        supportingEvidence: evidence,
        explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the nearest side property line. Whether a side line also faces a street is not settled (${project.sideRoleEvidenceGapReason}), but ${fmt(d)} ft clears the ${fmt(spec.sideMinFt)} ft side setback and the ${fmt(spec.streetLotLineMinFt)} ft distance from a street lot line either way.`,
      });
    }
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject,
      appliedRule: ruleApplied,
      supportingEvidence: evidence,
      explanationBasis: `The distance to your nearest indicated side property line is a known ${fmt(d)}ft, but ${project.sideRoleEvidenceGapReason}`,
    };
  }

  if (d >= spec.sideMinFt + tol) {
    return classifySpatialFinding({
      rule,
      appliedRule: ruleApplied,
      subject,
      pass: true,
      spatialEvidenceQuality: project.spatialEvidenceQuality,
      activePolicies,
      supportingEvidence: evidence,
      explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the nearest side property line, which meets the ${fmt(spec.sideMinFt)} ft side setback. ${NOT_A_SURVEY}`,
    });
  }

  // Inside (or within tolerance of) the side setback: an accessory structure may stand there only under H.1.a and H.1.b.
  const rearD = project.distanceToRearLotLineFt;
  const rearUsable = rearD !== undefined && project.rearRoleEvidenceGapReason === undefined;
  const clearlyShort = d < spec.sideMinFt - tol;
  const farthestRear = project.farthestFromRearLotLineFt ?? (rearD !== undefined ? rearD + Math.hypot(project.widthFt, project.depthFt) : undefined);
  const wholeBeyondRearDepth = rearUsable && rearD! > spec.sideBeyondRearDepthFt + tol;
  const wholeWithinRearDepth = rearUsable && farthestRear !== undefined && farthestRear <= spec.sideBeyondRearDepthFt - tol;

  if (wholeBeyondRearDepth) {
    if (clearlyShort) {
      return classifySpatialFinding({
        rule,
        appliedRule: ruleApplied,
        subject,
        pass: false,
        spatialEvidenceQuality: project.spatialEvidenceQuality,
        activePolicies,
        supportingEvidence: evidence,
        explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the nearest side property line and every part of it is more than ${fmt(spec.sideBeyondRearDepthFt)} ft from the rear property line (at least ${fmt(rearD!)} ft). ${place} requires any portion of an accessory structure more than ${fmt(spec.sideBeyondRearDepthFt)} ft from the rear lot line to be at least ${fmt(spec.sideMinFt)} ft from the side lot line. ${NOT_A_SURVEY}`,
      });
    }
  } else if (wholeWithinRearDepth) {
    if (project.besideDwelling === "NOT_BESIDE") {
      return classifySpatialFinding({
        rule,
        appliedRule: ruleApplied,
        subject,
        pass: true,
        spatialEvidenceQuality: project.spatialEvidenceQuality,
        activePolicies,
        supportingEvidence: [...evidence, "besideDwelling=false"],
        explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the nearest side property line, inside the ${fmt(spec.sideMinFt)} ft side setback. ${place} allows that because every part of it is within ${fmt(spec.sideBeyondRearDepthFt)} ft of the rear property line and it does not stand between the house and the side property line. ${NOT_A_SURVEY}`,
      });
    }
    if (project.besideDwelling === "BESIDE" && clearlyShort) {
      return classifySpatialFinding({
        rule,
        appliedRule: ruleApplied,
        subject,
        pass: false,
        spatialEvidenceQuality: project.spatialEvidenceQuality,
        activePolicies,
        supportingEvidence: [...evidence, "besideDwelling=true"],
        explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the nearest side property line and stands between the house and that line. ${place} requires an accessory structure there to provide the side setback required of the house (${fmt(spec.sideMinFt)} ft). ${NOT_A_SURVEY}`,
      });
    }
  }

  const missing: string[] = [];
  if (!wholeBeyondRearDepth && !wholeWithinRearDepth) missing.push(`how much of it is more than ${fmt(spec.sideBeyondRearDepthFt)} ft from the rear property line`);
  if (project.besideDwelling !== "NOT_BESIDE" && !wholeBeyondRearDepth) missing.push("whether it stands between the house and the side property line");
  if (!clearlyShort) missing.push(`whether ${fmt(d)} ft is clear of the ${fmt(spec.sideMinFt)} ft side setback given the mapping margin`);
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule: ruleApplied,
    supportingEvidence: evidence,
    explanationBasis: `The ${noun(project)} is ${fmt(d)} ft from the nearest side property line, inside or near the ${fmt(spec.sideMinFt)} ft side setback. ${place} allows an accessory structure in a required side setback only if it does not stand between the house and the side lot line and no part of it is more than ${fmt(spec.sideBeyondRearDepthFt)} ft from the rear lot line unless that part keeps ${fmt(spec.sideMinFt)} ft. Not determined: ${missing.join("; ")}. ${NOT_A_SURVEY}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Height (aggregate: one finding)
// ---------------------------------------------------------------------------------------------

/**
 * Bounded-band derivation of "is the placement inside a required setback", for the zone's own required setbacks. A placement is
 * DEFINITELY inside only when clearly short of a required minimum; it is never DEFINITELY outside, because Chapter 23.53 can
 * add setbacks for street and alley widening that the mapping cannot rule out (SMC 23.45.518.E).
 */
export function deriveIsInRequiredSetbackMf(
  ctx: {
    distanceToFrontLotLineFt: number | undefined;
    distanceToRearLotLineFt: number | undefined;
    distanceToSideLotLineFt: number | undefined;
    alleyAdjacent: boolean;
    frontRoleEvidenceGapReason: string | undefined;
    rearRoleEvidenceGapReason: string | undefined;
    sideRoleEvidenceGapReason: string | undefined;
  },
  required: MfAccessoryHeightSpec["required"],
  toleranceFt: number
): { isInRequiredSetback: boolean | undefined; requiredSetbackEvidenceGapReasons: string[] | undefined } {
  const reasons: string[] = [];
  let inside = false;
  const check = (d: number | undefined, gap: string | undefined, minFt: number, roleName: string): void => {
    if (d === undefined || gap !== undefined) {
      reasons.push(`${roleName} lot-line regulatory role unresolved`);
      return;
    }
    if (minFt > 0 && d < minFt - toleranceFt) inside = true;
    else reasons.push("additional Chapter 23.53 setback applicability unresolved");
  };
  check(ctx.distanceToFrontLotLineFt, ctx.frontRoleEvidenceGapReason, required.front.minFt, "front");
  check(ctx.distanceToRearLotLineFt, ctx.rearRoleEvidenceGapReason, (ctx.alleyAdjacent ? required.rearAlley : required.rear).minFt, "rear");
  check(ctx.distanceToSideLotLineFt, ctx.sideRoleEvidenceGapReason, required.side.minFt, "side");
  if (inside) return { isInRequiredSetback: true, requiredSetbackEvidenceGapReasons: undefined };
  return { isInRequiredSetback: undefined, requiredSetbackEvidenceGapReasons: [...new Set(reasons)] };
}

export function evaluateMfAccessoryHeight(rule: RegulatoryRule, spec: MfAccessoryHeightSpec, project: MfProject): Finding {
  const subject = "Accessory structure height limit";
  const ruleApplied = applied(rule);
  const garage = project.projectType === "garage";
  const inLimit = spec.inSetbackMaxFt;
  const inLimitWithRidge = inLimit + (garage ? spec.garageRidgeAllowanceFt : 0);
  const h = project.heightFt;
  const evidence = [`heightFt=${h}`, `inSetbackLimitFt=${inLimit}`, `outsideSetbackSafeFt=${spec.outsideSetbackSafeMaxFt}`];

  if (h <= inLimit) {
    return {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.PASS,
      appliedRule: ruleApplied,
      supportingEvidence: evidence,
      explanationBasis: `Height ${h} ft is within the ${inLimit} ft limit for an accessory structure in a required setback or separation (${spec.citation}), which is the lowest limit that can apply, so it is within the limit wherever on the lot it stands.`,
    };
  }
  if (project.isInRequiredSetback === true) {
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject,
      appliedRule: ruleApplied,
      supportingEvidence: evidence,
      explanationBasis: `The ${noun(project)} is in a required setback, where an accessory structure is limited to ${inLimit} ft (${spec.citation}); its height is ${h} ft.${garage ? ` A garage's pitched roof ridge may rise ${spec.garageRidgeAllowanceFt} ft above the limit (to ${inLimitWithRidge} ft) if the roof is pitched at least 4:12 and the facade with the vehicle entrance is within ${inLimit} ft.` : ""} Other roof and height exceptions exist and are not enumerated here, so a definite failure is not stated; SDCI confirms.`,
    };
  }
  if (project.isInRequiredSetback === false) {
    if (h <= spec.outsideSetbackSafeMaxFt) {
      return {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ComplianceOutcome.PASS,
        appliedRule: ruleApplied,
        supportingEvidence: evidence,
        explanationBasis: `The ${noun(project)} is outside every required setback, where the zone's structure height limit applies; ${h} ft is within the lowest such limit (${spec.outsideSetbackSafeMaxFt} ft). ${spec.structureHeightText}`,
      };
    }
  }
  const reasons = project.requiredSetbackEvidenceGapReasons;
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule: ruleApplied,
    supportingEvidence: evidence,
    explanationBasis: `Height ${h} ft is above the ${inLimit} ft limit for an accessory structure in a required setback or separation (${spec.citation}). Whether the ${noun(project)}'s placement is inside a required setback is unresolved${reasons && reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}, and outside one the zone's structure height limit applies. ${spec.structureHeightText}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Separation from the house (shed)
// ---------------------------------------------------------------------------------------------

export function evaluateMfSeparation(rule: RegulatoryRule, spec: MfAccessorySeparationSpec, project: ShedProjectDetails): Finding {
  const ruleApplied = applied(rule);
  const subject = "Shed separation from the house";
  const tol = spec.mappingToleranceFt ?? 0;
  if (project.distanceToDwellingFt === undefined) {
    return missingEvidenceFinding(subject, ruleApplied, project.dwellingSeparationEvidenceGapReason ?? "distanceToDwellingFt is not available.");
  }
  const d = project.distanceToDwellingFt;
  const evidence = [`distanceToDwellingFt=${d}`];
  if (spec.otherwiseMinFt === undefined) {
    // Highrise: 23.45.519 does not apply, so the only separation is the in-setback 3 ft (SMC 23.45.518.H.1.d), and only for a structure standing in a required setback.
    if (d >= spec.inSetbackMinFt + tol) {
      return {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ComplianceOutcome.PASS,
        appliedRule: ruleApplied,
        supportingEvidence: evidence,
        explanationBasis: `The shed is ${fmt(d)} ft from the house, which meets the ${fmt(spec.inSetbackMinFt)} ft separation of an accessory structure from a principal structure in a required setback (SMC 23.45.518.H.1.d); a Highrise zone has no larger separation between a shed and a house. ${NOT_A_SURVEY}`,
      };
    }
    if (d < spec.inSetbackMinFt - tol && project.isInRequiredSetback === true) {
      return {
        classification: FindingClassification.KNOWN,
        subject,
        complianceOutcome: ComplianceOutcome.FAIL,
        appliedRule: ruleApplied,
        supportingEvidence: evidence,
        explanationBasis: `The shed is ${fmt(d)} ft from the house, closer than the ${fmt(spec.inSetbackMinFt)} ft separation required of an accessory structure in a required setback from a principal structure, measured including eaves and gutters (SMC 23.45.518.H.1.d). ${NOT_A_SURVEY}`,
      };
    }
    return {
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject,
      appliedRule: ruleApplied,
      supportingEvidence: evidence,
      explanationBasis: `The shed is ${fmt(d)} ft from the house. In a Highrise zone the only separation is ${fmt(spec.inSetbackMinFt)} ft from a principal structure for an accessory structure standing in a required setback, including eaves and gutters (SMC 23.45.518.H.1.d). ${d < spec.inSetbackMinFt - tol ? (project.isInRequiredSetback === false ? "The shed is not in a required setback, so that requirement does not apply by itself; this is left for SDCI to confirm." : "Whether the shed stands in a required setback could not be established, so this is left for SDCI to confirm.") : `The distance is within ${fmt(tol)} ft of that figure, so it is not treated as a definite result.`} ${NOT_A_SURVEY}`,
    };
  }
  if (d >= spec.otherwiseMinFt + tol) {
    return {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.PASS,
      appliedRule: ruleApplied,
      supportingEvidence: evidence,
      explanationBasis: `The shed is ${fmt(d)} ft from the house, which meets both the ${fmt(spec.inSetbackMinFt)} ft separation for an accessory structure in a required setback and the ${fmt(spec.otherwiseMinFt)} ft separation between structures containing floor area. ${NOT_A_SURVEY}`,
    };
  }
  if (d < spec.inSetbackMinFt - tol) {
    return {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.FAIL,
      appliedRule: ruleApplied,
      supportingEvidence: evidence,
      explanationBasis: `The shed is ${fmt(d)} ft from the house, closer than the ${fmt(spec.inSetbackMinFt)} ft separation required of an accessory structure from a principal structure, measured including eaves and gutters. ${NOT_A_SURVEY}`,
    };
  }
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule: ruleApplied,
    supportingEvidence: evidence,
    explanationBasis: `The shed is ${fmt(d)} ft from the house. An accessory structure in a required setback must be ${fmt(spec.inSetbackMinFt)} ft from a principal structure including eaves and gutters (SMC 23.45.518.H.1.d); structures containing floor area elsewhere must be ${fmt(spec.otherwiseMinFt)} ft apart (SMC 23.45.519.A). Which applies depends on where the shed stands relative to the required setbacks, and the distance is near the ${fmt(spec.inSetbackMinFt)} ft figure, so this is not treated as a definite result. ${NOT_A_SURVEY}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Floor area ratio and parking access: always verification (the inputs are not known to the platform)
// ---------------------------------------------------------------------------------------------

export function evaluateMfFloorAreaRatio(rule: RegulatoryRule, spec: MfFloorAreaRatioSpec, project: MfProject): Finding {
  const subject = "Floor area ratio (no lot-coverage limit in this zone)";
  const area = project.parcelAreaSqFt;
  const limit = area !== undefined ? Math.round(spec.far * area) : undefined;
  const proposed = Math.round(project.widthFt * project.depthFt);
  const stacked = spec.farStacked !== undefined ? ` (${spec.farStacked} for stacked dwelling units)` : "";
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule: applied(rule),
    supportingEvidence: [`far=${spec.far}`, ...(area !== undefined ? [`parcelAreaSqFt=${Math.round(area)}`] : []), `proposedFootprintSqFt=${proposed}`],
    explanationBasis: `${spec.zoneText} has no lot-coverage percentage limit. Instead, the total chargeable floor area of all structures on the lot is limited to ${spec.far} times the lot area${stacked}${limit !== undefined ? `, about ${limit.toLocaleString("en-US")} sq ft on this ${Math.round(area!).toLocaleString("en-US")} sq ft lot` : ""} (SMC 23.45.510).${spec.conditionText ? ` ${spec.conditionText}` : ""} The proposed ${noun(project)} (about ${proposed.toLocaleString("en-US")} sq ft) counts toward that total. Permit Preflight does not have the floor area of the existing buildings, so it cannot tell whether the limit is met; that is left for SDCI to confirm.`,
  };
}

export function evaluateMfGarageParkingAccess(rule: RegulatoryRule, spec: MfGarageParkingAccessSpec, project: MfProject): Finding {
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: "Garage access, driveway and garage-door standards",
    appliedRule: applied(rule),
    supportingEvidence: [`alleyAdjacent=${project.alleyAdjacent}`],
    explanationBasis: `${spec.citation} governs parking location and access. Access to parking must come from the alley when the lot abuts an alley that is improved to City standards or that the Director determines is feasible and desirable${project.alleyAdjacent ? " (you indicated the lot abuts an alley)" : ""}; ${spec.garageDoorMinFromStreetLotLineFt !== undefined ? `a garage door facing a street must be at least ${fmt(spec.garageDoorMinFromStreetLotLineFt)} ft from the street lot line and no closer to it than the street-facing facade of the principal structure; ` : ""}parking in a structure may not be closer to a street lot line than the street-facing facade of the structure it is in; surface parking may not be within ${fmt(spec.surfaceParkingMinFromStreetLotLineFt)} ft of a street lot line (7 ft when access is from the alley). The alley's condition, the garage-door orientation and the driveway are not known to Permit Preflight, so these are left for SDCI to confirm.`,
  };
}
