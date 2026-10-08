/**
 * Zoning applicability (Unit 11 Slice 1). Pure: classifies the Property Intelligence zoning/landmark
 * facts into whether the Neighborhood Residential (NR) rules Permit Preflight evaluates apply to a
 * parcel. Property Intelligence only describes (BR-3.3); this is the Rules Engine's classification.
 *
 * Fail closed: only a parcel that is overwhelmingly plain `NR` is NR_VERIFIED; one that is
 * overwhelmingly some other zone is NOT_NR (the NR-only conclusions are then withheld, never
 * produced); anything else - a genuine split, a gap in the zoning data, a Major Institution Overlay,
 * an unavailable source - is UNRESOLVED and keeps the pre-existing "zoning not verified" behavior.
 */

import { FindingClassification } from "./types.js";
import type { Finding } from "./types.js";
import type { LandmarkFactValue, ZoneCoverage, ZoningFactValue } from "../property-intelligence/seattle-zoning.js";

/** A zone covering less than this share of the parcel is treated as a boundary artifact and ignored. */
export const NEGLIGIBLE_ZONE_FRACTION = 0.02;
const MIN_COVERED_FRACTION = 0.9;

export interface OverlayFlags {
  shorelineDistrict: boolean;
  historicDistrict: boolean;
  landmarkParcel: boolean;
  /** Non-blank OVERLAY labels from the zoning layer. */
  overlayLabels: string[];
}

export type ZoningApplicability =
  | { status: "NR_VERIFIED"; nrFraction: number; zoningLabel: string; overlays: OverlayFlags }
  | { status: "NOT_NR"; zoningLabel: string; overlays: OverlayFlags }
  | { status: "UNRESOLVED"; reason: string };

export const ZONING_DATA_UNAVAILABLE_REASON = "Seattle's zoning data was not available for this evaluation";

function isPlainNr(z: ZoneCoverage): boolean {
  return z.zoning === "NR" && z.baseZone === "NR";
}

function label(zones: ZoneCoverage[]): string {
  return zones.map((z) => z.zoning).filter((v, i, a) => a.indexOf(v) === i).join(" / ");
}

export function overlayFlagsFor(zones: ZoneCoverage[], landmark?: LandmarkFactValue): OverlayFlags {
  const material = zones.filter((z) => z.fractionOfParcel >= NEGLIGIBLE_ZONE_FRACTION);
  return {
    shorelineDistrict: material.some((z) => z.shorelineDistrict),
    historicDistrict: material.some((z) => z.historicDistrict),
    landmarkParcel: landmark?.isLandmarkParcel === true,
    overlayLabels: [...new Set(material.map((z) => z.overlay).filter((o): o is string => Boolean(o)))],
  };
}

export function hasAnyOverlay(o: OverlayFlags): boolean {
  return o.shorelineDistrict || o.historicDistrict || o.landmarkParcel || o.overlayLabels.length > 0;
}

/** `zoning` undefined means the fact was unavailable (source error / not retrieved). */
export function deriveZoningApplicability(zoning: ZoningFactValue | undefined, landmark?: LandmarkFactValue): ZoningApplicability {
  if (!zoning || zoning.zones.length === 0) return { status: "UNRESOLVED", reason: ZONING_DATA_UNAVAILABLE_REASON };
  if (zoning.coveredFraction < MIN_COVERED_FRACTION) return { status: "UNRESOLVED", reason: "part of the parcel matched no zone in Seattle's zoning data" };
  const material = zoning.zones.filter((z) => z.fractionOfParcel >= NEGLIGIBLE_ZONE_FRACTION);
  if (material.some((z) => z.zoning.startsWith("MIO"))) return { status: "UNRESOLVED", reason: "the parcel is within a Major Institution Overlay, which has its own standards" };

  // Conservative: after discarding boundary slivers (< NEGLIGIBLE_ZONE_FRACTION), ANY second zone makes the
  // parcel UNRESOLVED. Only a parcel wholly in plain NR is NR_VERIFIED; only one wholly outside it is NOT_NR.
  const nrMaterial = material.filter(isPlainNr);
  const nrFraction = nrMaterial.reduce((s, z) => s + z.fractionOfParcel, 0);
  const overlays = overlayFlagsFor(zoning.zones, landmark);
  if (nrMaterial.length === material.length) return { status: "NR_VERIFIED", nrFraction, zoningLabel: "NR", overlays };
  if (nrMaterial.length === 0) {
    // Several distinct non-NR zones is still a split (their rules differ) - unresolved, not "not NR".
    const distinct = new Set(material.map((z) => z.zoning));
    if (distinct.size === 1) return { status: "NOT_NR", zoningLabel: [...distinct][0]!, overlays };
  }
  return { status: "UNRESOLVED", reason: `the parcel is split between zones (${material.map((z) => `${z.zoning} ${Math.round(z.fractionOfParcel * 100)}%`).join(", ")})` };
}

export const ZONING_SUBJECT = "Zoning applicability (Neighborhood Residential zones)";
export const OVERLAY_SUBJECT = "Overlay districts (shoreline, historic, landmark)";

/**
 * The customer-facing zoning findings for a project that is evaluated under NR rules.
 * `noun` is the plural subject ("fence rules", "deck rules", "shed rules", "ADU rules").
 * With `applicability` undefined the unresolved wording is the pre-existing one.
 */
export function zoningApplicabilityFindings(applicability: ZoningApplicability | undefined, noun: string): Finding[] {
  const out: Finding[] = [];
  if (!applicability || applicability.status === "UNRESOLVED") {
    const why = applicability && applicability.reason !== ZONING_DATA_UNAVAILABLE_REASON ? ` (${applicability.reason})` : "";
    out.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: ZONING_SUBJECT,
      supportingEvidence: ["parcel zoning not verified"],
      explanationBasis: `These ${noun} are Seattle's Neighborhood Residential zone rules (SMC 23.44). Permit Preflight did not verify this parcel's zoning${why}, so it cannot confirm they apply to this property; a parcel in a different zone can have different limits. SDCI determines the applicable zone and rules.`,
    });
    return out;
  }
  if (applicability.status === "NR_VERIFIED") {
    out.push({
      classification: FindingClassification.KNOWN,
      subject: ZONING_SUBJECT,
      supportingEvidence: [`zoning=NR`, `nrShareOfParcel=${applicability.nrFraction.toFixed(2)}`],
      explanationBasis: `Seattle's zoning data places this parcel in a Neighborhood Residential (NR) zone, the zone these ${noun} apply to. That data is general mapping, not a legal determination; SDCI confirms the zone.`,
    });
  } else {
    out.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: ZONING_SUBJECT,
      supportingEvidence: [`zoning=${applicability.zoningLabel}`],
      explanationBasis: `These ${noun} are Seattle's Neighborhood Residential zone rules (SMC 23.44). Seattle's zoning data places this parcel in ${applicability.zoningLabel}, where different rules apply, so Permit Preflight does not evaluate zoning limits for it. SDCI determines the applicable zone and rules.`,
    });
  }
  const overlay = buildOverlayFinding(applicability.overlays);
  if (overlay) out.push(overlay);
  return out;
}

function buildOverlayFinding(o: OverlayFlags): Finding | undefined {
  if (!hasAnyOverlay(o)) return undefined;
  const parts: string[] = [];
  if (o.shorelineDistrict) parts.push("a Shoreline District (the Shoreline Master Program, SMC 23.60A, applies)");
  if (o.historicDistrict) parts.push("a historic or special review district");
  if (o.landmarkParcel) parts.push("a designated landmark (Landmarks Preservation Board review applies)");
  for (const label of o.overlayLabels) parts.push(`the "${label}" overlay`);
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: OVERLAY_SUBJECT,
    supportingEvidence: parts,
    explanationBasis: `Seattle's data shows this property is in or is: ${parts.join("; ")}. Additional or different rules can apply there; Permit Preflight does not evaluate them. SDCI determines which apply.`,
  };
}

/** Marker carried by every uncovered-constraint entry added because the parcel is verifiably not NR. */
export const NOT_NR_UNCOVERED_MARKER = "not in a Neighborhood Residential zone";
export const NOT_NR_UNCOVERED_NOTICE =
  "This project type's zoning limits are Seattle's Neighborhood Residential zone rules, and Seattle's zoning data places this parcel in a different zone, so Permit Preflight did not evaluate them. This is not the same as a compliance finding of any kind and should not be read as a pass.";
export const NO_ACTIVE_RULE_UNCOVERED_NOTICE =
  "This constraint could not yet be automatically screened for this project type - no active regulatory rule currently governs it in this system. This is not the same as a compliance finding of any kind and should not be read as a pass.";
/** The customer-facing explanation for one "Not Yet Automatically Screenable" entry (web and PDF share it). */
export function uncoveredConstraintNotice(constraintType: string): string {
  return constraintType.includes(NOT_NR_UNCOVERED_MARKER) ? NOT_NR_UNCOVERED_NOTICE : NO_ACTIVE_RULE_UNCOVERED_NOTICE;
}
