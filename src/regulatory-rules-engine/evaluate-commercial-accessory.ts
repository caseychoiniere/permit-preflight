/**
 * Shed and detached-garage evaluation in the Neighborhood Commercial (NC1-NC3) and Commercial (C1) zones, SMC Chapter 23.47A (citywide zoning coverage,
 * 2026-10-09). Pure; every threshold comes from the ACTIVE rule row's own specification.
 *
 * What the code says (current Municode text read 2026-10-09; Ord. 127375/127376):
 *   - SMC 23.47A.014 Setback requirements: the Chapter requires NO ground-level setback of a small structure. It requires (B.1) a triangular setback where a lot abuts
 *     the corner of a residentially zoned lot, (B.2-B.3) upper-level setbacks for portions above 13 ft along lot lines abutting or across an alley from a residential
 *     zone, and (B.5) no entrance, window or other opening within 5 ft of an abutting residentially zoned lot. All of those depend on a residential zone abutting
 *     the lot (or across an alley from it). Chapter 23.53 can add setbacks for street and alley widening (B.I).
 *   - SMC 23.47A.012 Structure height: the limit is the height mapped on the Official Land Use Map (the number in the zone designation, 30 ft at the lowest).
 *   - SMC 23.47A.013 Floor area ratio: limits the total chargeable floor area of all structures on the lot (2.5 to 8.25 by mapped height); there is no lot-coverage limit.
 *   - SMC 23.47A.032 Parking location and access.
 * Whether a residential zone abuts the lot comes from Seattle's zoning layer (zoning within a short distance of the lot); when it could not be read the claim is
 * REQUIRES_VERIFICATION, never assumed.
 */

import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { ComplianceOutcome, FindingClassification } from "./types.js";
import type { Finding, GarageProjectDetails, ShedProjectDetails } from "./types.js";

export const CommercialAccessoryRuleType = {
  SETBACKS: "COMM_ACC_SETBACKS",
  HEIGHT: "COMM_ACC_HEIGHT",
  FLOOR_AREA_RATIO_NOTE: "COMM_FAR_NOTE",
  GARAGE_PARKING_ACCESS: "COMM_GARAGE_PARKING_ACCESS",
} as const;
export type CommercialAccessoryRuleType = (typeof CommercialAccessoryRuleType)[keyof typeof CommercialAccessoryRuleType];

export const COMMERCIAL_AGGREGATE_ONLY_RULE_TYPES: ReadonlySet<string> = new Set([CommercialAccessoryRuleType.HEIGHT]);

type Project = ShedProjectDetails | GarageProjectDetails;
const noun = (p: Project): string => (p.projectType === "garage" ? "detached garage" : "shed");
const Noun = (p: Project): string => (p.projectType === "garage" ? "Detached garage" : "Shed");

type AppliedRule = Pick<RegulatoryRule, "id" | "subject" | "citation">;
const applied = (rule: RegulatoryRule): AppliedRule => ({ id: rule.id, subject: rule.subject, citation: rule.citation });

export interface CommSetbacksSpec {
  ruleType: typeof CommercialAccessoryRuleType.SETBACKS;
  /** Portions of a structure above this height are subject to the upper-level setback (SMC 23.47A.014.B.2-B.3). */
  upperLevelAboveFt: number;
  /** No entrance, window or other opening is permitted closer than this to an abutting residentially zoned lot (B.5). */
  openingMinFromResidentialLotFt: number;
  /** The triangular corner setback extends this far along the street and side lot lines (B.1). */
  cornerTriangleFt: number;
  citation: string;
}
export interface CommHeightSpec {
  ruleType: typeof CommercialAccessoryRuleType.HEIGHT;
  /** The lowest mapped height limit of the zones the row covers (30 ft): at or under it the structure is within the limit in any of them. */
  safeMaxFt: number;
  citation: string;
}
export interface CommFarNoteSpec {
  ruleType: typeof CommercialAccessoryRuleType.FLOOR_AREA_RATIO_NOTE;
  minFar: number;
  maxFar: number;
  citation: string;
}
export interface CommGarageParkingAccessSpec {
  ruleType: typeof CommercialAccessoryRuleType.GARAGE_PARKING_ACCESS;
  citation: string;
}

export function evaluateCommSetbacks(rule: RegulatoryRule, spec: CommSetbacksSpec, project: Project): Finding {
  const subject = `${Noun(project)} setbacks in a commercial zone`;
  const ruleApplied = applied(rule);
  const status = project.abutsResidentialZone ?? "UNKNOWN";
  const evidence = [`abutsResidentialZone=${status}`, ...(project.adjacentResidentialZones?.length ? [`adjacentResidentialZones=${project.adjacentResidentialZones.join(",")}`] : [])];
  if (status === "NO") {
    return {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.PASS,
      appliedRule: ruleApplied,
      supportingEvidence: evidence,
      explanationBasis: `${spec.citation} requires a setback in a Neighborhood Commercial or Commercial zone only where a lot abuts, or is across an alley from, a residential zone. Seattle's zoning data shows no residential zone abutting or across an alley from this property, so the ${noun(project)} has no zoning setback requirement from this section. Chapter 23.53 can still require a setback for street or alley widening, which is not evaluated.`,
    };
  }
  const why =
    status === "YES"
      ? `Seattle's zoning data shows residential zoning abutting or across an alley from this property (${project.adjacentResidentialZones?.join(", ") ?? "residential zone"}).`
      : "Whether a residential zone abuts this property could not be read from Seattle's zoning data.";
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule: ruleApplied,
    supportingEvidence: evidence,
    explanationBasis: `${why} Where a lot abuts a residential zone, ${spec.citation} requires a triangular setback at the corner of an abutting residential lot (${spec.cornerTriangleFt} ft along the street and side lot lines), an upper-level setback for any portion of a structure above ${spec.upperLevelAboveFt} ft${project.heightFt > spec.upperLevelAboveFt ? ` (the ${noun(project)} is ${project.heightFt} ft tall)` : ` (the ${noun(project)} is ${project.heightFt} ft tall, so it is not above that height)`}, and no entrance, window or other opening closer than ${spec.openingMinFromResidentialLotFt} ft to an abutting residentially zoned lot. Which lot line abuts the residential lot, where its corner is and where the openings would be are not known to Permit Preflight, so this is left for SDCI to confirm.`,
  };
}

export function evaluateCommHeight(rule: RegulatoryRule, spec: CommHeightSpec, project: Project): Finding {
  const subject = "Accessory structure height limit";
  const h = project.heightFt;
  const evidence = [`heightFt=${h}`, `safeMaxFt=${spec.safeMaxFt}`];
  if (h <= spec.safeMaxFt) {
    return {
      classification: FindingClassification.KNOWN,
      subject,
      complianceOutcome: ComplianceOutcome.PASS,
      appliedRule: applied(rule),
      supportingEvidence: evidence,
      explanationBasis: `The height limit in a Neighborhood Commercial or Commercial zone is the height mapped for the zone (the number in its designation, ${spec.safeMaxFt} ft at the lowest; ${spec.citation}). Height ${h} ft is within the lowest mapped limit, so it is within this zone's limit.`,
    };
  }
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject,
    appliedRule: applied(rule),
    supportingEvidence: evidence,
    explanationBasis: `The height limit in this zone is the height mapped for it (the number in its designation; ${spec.citation}), which can be as low as ${spec.safeMaxFt} ft. The ${noun(project)} is ${h} ft tall, above that lowest limit, and the exceptions in the section are not evaluated, so it is left for SDCI to confirm against the mapped limit.`,
  };
}

export function evaluateCommFarNote(rule: RegulatoryRule, spec: CommFarNoteSpec, project: Project): Finding {
  const area = project.parcelAreaSqFt;
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: "Floor area ratio (no lot-coverage limit in this zone)",
    appliedRule: applied(rule),
    supportingEvidence: [`farRange=${spec.minFar}-${spec.maxFar}`, ...(area !== undefined ? [`parcelAreaSqFt=${Math.round(area)}`] : [])],
    explanationBasis: `Neighborhood Commercial and Commercial zones have no lot-coverage percentage limit. Instead, the total chargeable floor area of all structures on the lot is limited by a floor area ratio that depends on the zone's mapped height limit, from ${spec.minFar} to ${spec.maxFar} times the lot area${area !== undefined ? ` (${Math.round(area * spec.minFar).toLocaleString("en-US")} sq ft or more on this ${Math.round(area).toLocaleString("en-US")} sq ft lot)` : ""} (${spec.citation}). The proposed ${noun(project)} (about ${Math.round(project.widthFt * project.depthFt).toLocaleString("en-US")} sq ft) counts toward the total. Permit Preflight does not have the floor area of the existing buildings or the exemptions that apply, so it cannot tell whether the limit is met; that is left for SDCI to confirm.`,
  };
}

export function evaluateCommGarageParkingAccess(rule: RegulatoryRule, spec: CommGarageParkingAccessSpec, project: Project): Finding {
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: "Garage access, driveway and garage-door standards",
    appliedRule: applied(rule),
    supportingEvidence: [`alleyAdjacent=${project.alleyAdjacent}`],
    explanationBasis: `${spec.citation} governs parking location and access. In a Neighborhood Commercial zone (and a Commercial zone with residential uses) parking may not be located between a structure and a street lot line, access must come from the alley when the lot abuts an alley improved to City standards or one the Director finds feasible${project.alleyAdjacent ? " (you indicated the lot abuts an alley)" : ""}, and otherwise one curb cut is allowed with one garage door per curb cut. The alley's condition, where the garage stands relative to the house and the street, and the driveway are not known to Permit Preflight, so these are left for SDCI to confirm.`,
  };
}
