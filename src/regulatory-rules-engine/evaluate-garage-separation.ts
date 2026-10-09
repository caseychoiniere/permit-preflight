/**
 * Detached-garage separation from the principal structure (zone-aware; 2026-10-09). Pure; every threshold comes from the ACTIVE rule row's own specification, and
 * the row's zone scope decides which zones it governs. Current code text (Municode, version Sep 25 2026, Ord. 127376):
 *
 *   Neighborhood Residential - SMC 23.44.100.A: the minimum separation between structures containing floor area is 5 ft, except that where a driveway or parking
 *     aisle separates them it is 2 ft more than the required width of the driveway or aisle, or 24 ft, whichever is less. 23.44.100.C: eaves, gutters and other
 *     weather protection may project up to 2 ft into a required separation. A garage contains floor area (a garage's floor area is counted toward the floor area
 *     limits, SMC 23.44.050 and 23.45.510). SMC 23.44.090.I.2: an enclosed structure that is not a dwelling unit is allowed in the rear setback if it is separated
 *     from a dwelling unit by at least 3 ft, eave to eave. The earlier garage-specific 5 ft separation and its terraced-garage exception (former 23.44.016) no
 *     longer appear in the chapter.
 *   Lowrise and Midrise - SMC 23.45.519.A (same 5 ft rule, driveway/aisle variation, 2 ft eave projections in B); SMC 23.45.518.H.1.d: an accessory structure in a
 *     required rear or side setback must be separated by at least 3 ft from all principal structures, including the eaves, gutters and other projecting features
 *     of the principal structure.
 *   Highrise - 23.45.519 governs LR and MR zones only; only the setback condition (23.45.518.H.1.d, 3 ft) applies, and only to a garage that stands in a required setback.
 *   Neighborhood Commercial and Commercial - Chapter 23.47A has no separation requirement between a garage and a principal structure (its separation provisions
 *     concern structures wider than 250 ft and optional facade breaks), so the claim is not applicable there and no rule row exists for it.
 *
 * Measurement basis: the principal structure's outline is Seattle's building outline (a roof edge from aerial imagery, so it includes eaves) and the garage is the
 * footprint the customer placed. A distance clearly under the in-setback minimum fails whichever provision applies (the 5 ft between structures is measured wall to
 * wall and may be reduced by eave projections of up to 2 ft); a distance clearly past the requirement passes; between the two the result depends on where the garage
 * stands, on eaves and on any driveway between the structures, so it is REQUIRES_VERIFICATION. Never a definite result within the mapping tolerance of a threshold.
 */

import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { ComplianceOutcome, FindingClassification } from "./types.js";
import type { Finding, GarageProjectDetails } from "./types.js";
import { missingEvidenceFinding, roundToTenthFt } from "./evaluate-common.js";

/** This distance rests on the placed footprint and Seattle's building outlines (aerial roof edges), not on county parcel mapping. */
const BUILDING_OUTLINE_CAVEAT = "The distance is measured from the footprint you placed to Seattle's mapped building outline, which is not a survey.";

export const GARAGE_SEPARATION_RULE_TYPE = "GARAGE_SEPARATION" as const;
export const GARAGE_SEPARATION_SUBJECT = "Detached garage separation from the principal structure";

export interface GarageSeparationSpec {
  ruleType: typeof GARAGE_SEPARATION_RULE_TYPE;
  /** The separation an accessory structure standing in a required setback must keep from a principal structure, including eaves and gutters. */
  inSetbackMinFt: number;
  /** The separation required between structures containing floor area (5 ft). Absent where the zone has no such rule (Highrise). */
  betweenStructuresMinFt?: number;
  /** Where a driveway or parking aisle separates the structures the requirement is 2 ft more than its width, never more than this (24 ft). */
  drivewayAisleCapFt?: number;
  /** Eaves, gutters and weather protection may project this far into a required separation (2 ft). Informational; the thresholds above already allow for it. */
  eaveProjectionFt?: number;
  mappingToleranceFt: number;
  /** Where the 3 ft in-setback separation comes from, e.g. "SMC 23.45.518.H.1.d". */
  inSetbackCitation: string;
  /** Where the 5 ft separation comes from, e.g. "SMC 23.45.519.A". Present with betweenStructuresMinFt. */
  betweenCitation?: string;
  /** What the zone is called in the explanation, e.g. "a Neighborhood Residential zone". */
  zoneNoun: string;
}

type AppliedRule = Pick<RegulatoryRule, "id" | "subject" | "citation">;
const fmt = (n: number): string => `${roundToTenthFt(n)}`;

export function evaluateGarageSeparation(rule: RegulatoryRule, spec: GarageSeparationSpec, project: GarageProjectDetails): Finding {
  const appliedRule: AppliedRule = { id: rule.id, subject: rule.subject, citation: rule.citation };
  const subject = GARAGE_SEPARATION_SUBJECT;
  if (project.distanceToDwellingFt === undefined) {
    return missingEvidenceFinding(subject, appliedRule, project.dwellingSeparationEvidenceGapReason ?? "The distance from the garage to the principal structure is not available.");
  }
  const d = project.distanceToDwellingFt;
  const tol = spec.mappingToleranceFt;
  const floor = spec.inSetbackMinFt;
  const between = spec.betweenStructuresMinFt;
  const cap = spec.drivewayAisleCapFt ?? between;
  const driveway = project.drivewayOrAisleBetween;
  const evidence = [
    `distanceToDwellingFt=${d}`,
    ...(driveway !== undefined ? [`drivewayOrAisleBetween=${driveway}`] : []),
    ...(project.isInRequiredSetback !== undefined ? [`isInRequiredSetback=${project.isInRequiredSetback}`] : []),
  ];
  const verify = (explanationBasis: string): Finding => ({ classification: FindingClassification.REQUIRES_VERIFICATION, subject, appliedRule, supportingEvidence: evidence, explanationBasis });
  const known = (outcome: ComplianceOutcome, explanationBasis: string): Finding => ({ classification: FindingClassification.KNOWN, subject, complianceOutcome: outcome, appliedRule, supportingEvidence: evidence, explanationBasis });
  const measured = `The garage you placed is ${fmt(d)} ft from the principal structure (the building you confirmed as your main house, from Seattle's building outline, which shows its roof edge). ${BUILDING_OUTLINE_CAVEAT}`;
  const eaveNote = spec.eaveProjectionFt !== undefined ? ` Eaves and gutters may project up to ${fmt(spec.eaveProjectionFt)} ft into a required separation.` : "";
  const drivewayNote =
    between !== undefined && cap !== undefined
      ? ` Where a driveway or parking aisle lies between the structures, ${spec.betweenCitation ?? spec.inSetbackCitation} instead requires 2 ft more than its required width, up to ${fmt(cap)} ft.`
      : "";

  // Clearly closer than the smallest separation any provision allows.
  if (d < floor - tol) {
    if (between !== undefined) {
      return known(
        ComplianceOutcome.FAIL,
        `${measured} That is closer than the ${fmt(floor)} ft minimum separation of an accessory structure from a principal structure (${spec.inSetbackCitation}) and than the ${fmt(between)} ft required between structures containing floor area (${spec.betweenCitation ?? spec.inSetbackCitation}), which is the smaller figure that can apply to a garage in ${spec.zoneNoun}.${eaveNote}`
      );
    }
    if (project.isInRequiredSetback === true) {
      return known(ComplianceOutcome.FAIL, `${measured} A garage in a required setback must be at least ${fmt(floor)} ft from every principal structure, including eaves and gutters (${spec.inSetbackCitation}); this is closer.`);
    }
    return verify(
      `${measured} In ${spec.zoneNoun} the only separation requirement for a garage is ${fmt(floor)} ft from a principal structure when the garage stands in a required setback (${spec.inSetbackCitation}). ${project.isInRequiredSetback === false ? "The garage is not in a required setback, so that requirement does not apply by itself." : "Whether the garage stands in a required setback could not be established."} This is left for SDCI to confirm.`
    );
  }

  // Zones whose only separation rule is the in-setback 3 ft (Highrise).
  if (between === undefined) {
    if (d >= floor + tol) {
      return known(ComplianceOutcome.PASS, `${measured} That meets the ${fmt(floor)} ft separation of an accessory structure from a principal structure (${spec.inSetbackCitation}); ${spec.zoneNoun} has no larger separation between a garage and a principal structure.`);
    }
    return verify(`${measured} That is within ${fmt(tol)} ft of the ${fmt(floor)} ft separation of an accessory structure from a principal structure (${spec.inSetbackCitation}), so it is not treated as a definite result.`);
  }

  // The 5 ft between structures containing floor area, with the driveway/aisle variation.
  const farEnough = cap ?? between;
  if (d >= farEnough + tol) {
    return known(ComplianceOutcome.PASS, `${measured} That is beyond every separation that can apply to a garage in ${spec.zoneNoun} - the ${fmt(between)} ft between structures containing floor area (${spec.betweenCitation ?? spec.inSetbackCitation}), even with a driveway or parking aisle between them (at most ${fmt(farEnough)} ft) - and the ${fmt(floor)} ft from a principal structure in a required setback (${spec.inSetbackCitation}).`);
  }
  if (d >= between + tol) {
    if (driveway === false) {
      return known(ComplianceOutcome.PASS, `${measured} You indicated no driveway or parking aisle lies between the garage and the principal structure, so the required separation is ${fmt(between)} ft between structures containing floor area (${spec.betweenCitation ?? spec.inSetbackCitation}) and ${fmt(floor)} ft in a required setback (${spec.inSetbackCitation}); this meets both.${eaveNote}`);
    }
    return verify(
      `${measured} That meets the ${fmt(between)} ft required between structures containing floor area (${spec.betweenCitation ?? spec.inSetbackCitation}), but ${driveway === true ? "you indicated a driveway or parking aisle lies between the garage and the principal structure" : "whether a driveway or parking aisle lies between the garage and the principal structure is not known"},${drivewayNote} The width involved is not known to Permit Preflight, so this is left for SDCI to confirm.`
    );
  }
  return verify(
    `${measured} A garage must be ${fmt(between)} ft from other structures containing floor area (${spec.betweenCitation ?? spec.inSetbackCitation}) - measured wall to wall, so eave projections can reduce the distance measured to the roof edge - and, where it stands in a required setback, at least ${fmt(floor)} ft from a principal structure including eaves and gutters (${spec.inSetbackCitation}). This distance is between those figures or within ${fmt(tol)} ft of one of them, so whether it is enough depends on where the garage stands, on the eaves and on any driveway between the structures; it is not treated as a definite result.${eaveNote}${drivewayNote}`
  );
}
