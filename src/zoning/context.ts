/**
 * Zoning context (citywide zoning coverage, 2026-10-09). Pure: turns the Property Intelligence zoning facts into the
 * zoning picture the Regulatory Rules Engine reasons over - which designations touch the LOT, and (for a placed project)
 * which touch the proposed FOOTPRINT. Property Intelligence only describes (BR-3.3); nothing here picks a zone.
 *
 * A boundary sliver (< NEGLIGIBLE share of the lot) is ignored, as it always was: a parcel polygon that merely touches a
 * neighbor's zone polygon is returned by an "intersects" query without the parcel being in that zone.
 */

import { parseZoningDesignation } from "./designation.js";
import type { ZoningDesignation } from "./designation.js";
import type { LandmarkFactValue, ZoneCoverage, ZoningFactValue } from "../property-intelligence/seattle-zoning.js";

/** A zone covering less than this share of the parcel is treated as a boundary artifact and ignored. */
export const NEGLIGIBLE_ZONE_FRACTION = 0.02;
/** Footprints are small, so a boundary reaching only a corner still matters; below this share it is a mapping artifact. */
export const NEGLIGIBLE_FOOTPRINT_ZONE_FRACTION = 0.01;
export const MIN_COVERED_FRACTION = 0.9;

export interface OverlayFlags {
  shorelineDistrict: boolean;
  historicDistrict: boolean;
  landmarkParcel: boolean;
  /** Non-blank OVERLAY labels from the zoning layer. */
  overlayLabels: string[];
}

export interface ZoneShare {
  designation: ZoningDesignation;
  /** Share (0..1) of the lot, or of the footprint, lying in this designation. */
  fraction: number;
  shorelineDistrict: boolean;
  historicDistrict: boolean;
  overlay?: string;
}

/** A residential zone this close to a lot (or across an alley, ~16 ft wide, from it) is what the commercial-zone setback provisions (SMC 23.47A.014) key on. */
export const ADJACENCY_BUFFER_FT = 20;
/** A zone must cover at least this share of the buffered area to count as a neighbor (below it is a mapping artifact at a zone boundary). */
export const NEGLIGIBLE_NEIGHBOR_FRACTION = 0.002;

export const ZONING_DATA_UNAVAILABLE_REASON = "Seattle's zoning data was not available for this evaluation";

export interface ZoningContext {
  /** False when the lot's zoning fact was not retrieved (source error / no polygon). */
  available: boolean;
  unavailableReason?: string;
  /** Material designations on the lot, largest share first. */
  lotZones: ZoneShare[];
  /** Why the lot's zoning is not fully known (a gap in the zoning data); undefined when complete. */
  lotGap?: string;
  /** Material designations under the proposed footprint; undefined when not determined (declared project, or lookup failed). */
  footprintZones?: ZoneShare[];
  /** Why the footprint's zoning is not known when a footprint exists. */
  footprintGap?: string;
  overlays: OverlayFlags;
  /** Residential zoning within a short distance of the lot, read only for commercial zones (undefined when not read). */
  adjacentResidential?: { status: "YES" | "NO" | "UNKNOWN"; zones: string[]; reason?: string };
}

function shareOf(z: ZoneCoverage): ZoneShare {
  return {
    designation: z.designation ?? parseZoningDesignation(z.zoning, { baseZone: z.baseZone }),
    fraction: z.fractionOfParcel,
    shorelineDistrict: z.shorelineDistrict,
    historicDistrict: z.historicDistrict,
    ...(z.overlay ? { overlay: z.overlay } : {}),
  };
}

function materialShares(fact: ZoningFactValue, threshold: number): ZoneShare[] {
  return fact.zones.filter((z) => z.fractionOfParcel >= threshold).map(shareOf);
}

export function overlayFlagsFor(shares: ZoneShare[], landmark?: LandmarkFactValue): OverlayFlags {
  return {
    shorelineDistrict: shares.some((z) => z.shorelineDistrict),
    historicDistrict: shares.some((z) => z.historicDistrict),
    landmarkParcel: landmark?.isLandmarkParcel === true,
    overlayLabels: [...new Set(shares.map((z) => z.overlay).filter((o): o is string => Boolean(o)))],
  };
}

export function hasAnyOverlay(o: OverlayFlags): boolean {
  return o.shorelineDistrict || o.historicDistrict || o.landmarkParcel || o.overlayLabels.length > 0;
}

export interface BuildZoningContextInput {
  /** The lot's zoning fact; undefined = unavailable (source error / not retrieved). */
  lot: ZoningFactValue | undefined;
  landmark?: LandmarkFactValue;
  /** The proposed footprint's zoning fact; undefined with `footprintError` unset means no footprint exists (declared project). */
  footprint?: ZoningFactValue;
  /** Set when a footprint exists but its zoning lookup failed or returned an incomplete answer. */
  footprintError?: string;
  /** The zoning within ADJACENCY_BUFFER_FT of the lot (commercial zones only). */
  neighbors?: ZoningFactValue;
  /** Set when the neighbor lookup was needed but failed or was incomplete. */
  neighborsError?: string;
}

const RESIDENTIAL_FAMILIES = new Set<string>(["NR", "LR", "MR", "HR"]);

export function buildZoningContext(input: BuildZoningContextInput): ZoningContext {
  const { lot } = input;
  if (!lot || lot.zones.length === 0) {
    return { available: false, unavailableReason: ZONING_DATA_UNAVAILABLE_REASON, lotZones: [], overlays: overlayFlagsFor([], input.landmark) };
  }
  const lotZones = materialShares(lot, NEGLIGIBLE_ZONE_FRACTION);
  const lotGap = lot.coveredFraction < MIN_COVERED_FRACTION ? "part of the parcel matched no zone in Seattle's zoning data" : undefined;
  const ctx: ZoningContext = { available: true, lotZones, ...(lotGap ? { lotGap } : {}), overlays: overlayFlagsFor(lotZones, input.landmark) };
  if (input.footprint) {
    if (input.footprint.coveredFraction < MIN_COVERED_FRACTION) {
      ctx.footprintGap = "part of the proposed footprint matched no zone in Seattle's zoning data";
    } else {
      ctx.footprintZones = materialShares(input.footprint, NEGLIGIBLE_FOOTPRINT_ZONE_FRACTION);
    }
  } else if (input.footprintError) {
    ctx.footprintGap = input.footprintError;
  }
  if (input.neighbors) {
    const lotRaw = new Set(lotZones.map((z) => z.designation.raw));
    const residential = materialShares(input.neighbors, NEGLIGIBLE_NEIGHBOR_FRACTION)
      .filter((z) => RESIDENTIAL_FAMILIES.has(z.designation.family) && !lotRaw.has(z.designation.raw))
      .map((z) => z.designation.raw);
    ctx.adjacentResidential = residential.length > 0 ? { status: "YES", zones: [...new Set(residential)] } : { status: "NO", zones: [] };
  } else if (input.neighborsError) {
    ctx.adjacentResidential = { status: "UNKNOWN", zones: [], reason: input.neighborsError };
  }
  return ctx;
}

/** Test and preview helper: a context for a lot wholly in one designation. */
export function singleZoneContext(zoning: string, opts: { overlays?: Partial<OverlayFlags>; footprintZoning?: string } = {}): ZoningContext {
  const share = (raw: string): ZoneShare => ({ designation: parseZoningDesignation(raw), fraction: 1, shorelineDistrict: false, historicDistrict: false });
  return {
    available: true,
    lotZones: [share(zoning)],
    ...(opts.footprintZoning ? { footprintZones: [share(opts.footprintZoning)] } : {}),
    overlays: { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [], ...opts.overlays },
  };
}

/** Test and preview helper: a lot split between the given designations (fractions in order; remainder spread evenly if omitted). */
export function splitZoneContext(parts: [string, number][], opts: { footprint?: [string, number][]; overlays?: Partial<OverlayFlags>; footprintGap?: string } = {}): ZoningContext {
  const share = ([raw, fraction]: [string, number]): ZoneShare => ({ designation: parseZoningDesignation(raw), fraction, shorelineDistrict: false, historicDistrict: false });
  return {
    available: true,
    lotZones: parts.map(share),
    ...(opts.footprint ? { footprintZones: opts.footprint.map(share) } : {}),
    ...(opts.footprintGap ? { footprintGap: opts.footprintGap } : {}),
    overlays: { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [], ...opts.overlays },
  };
}

/** Test and preview helper: the lot's zoning fact could not be retrieved. */
export function unavailableZoneContext(): ZoningContext {
  return { available: false, unavailableReason: ZONING_DATA_UNAVAILABLE_REASON, lotZones: [], overlays: { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [] } };
}
