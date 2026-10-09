/**
 * Seattle zoning, overlay and transit property facts (Unit 11 Slice 1). Property Intelligence's job:
 * retrieve and describe - never classify (BR-3.3). Templated on seattle-eca.ts (same ArcGIS org
 * `services.arcgis.com/ZOyb2t4B0UYuYNYH`, same explicit-SRID-verification before trusting
 * coordinates, same per-request timeout).
 *
 * Why this exists: no zoning fact was ever retrieved, so every NR-only rule (shed, fence, deck) was
 * applied with the parcel's zone unverified - a live check showed the long-standing "NR test parcel"
 * 3298700485 is actually zoned LR1 / LR3 RC. ADU feasibility cannot be answered without the zone.
 *
 * Boundary handling: a parcel polygon that merely TOUCHES a neighboring zone's polygon is returned by
 * an "intersects" query, and a parcel can genuinely straddle zones. So the retriever fetches the
 * intersecting zone polygons and computes each zone's SHARE of the parcel by deterministic grid
 * sampling (computeZoneCoverage), letting the Regulatory Rules Engine fail closed on a real split
 * without being fooled by a boundary sliver.
 */

import { z } from "zod";
import { fetchParcelBoundaryPolygon, AUTHORITATIVE_PARCEL_SRID } from "./king-county-parcel-geometry.js";
import { fetchLayerWithTimeout } from "./seattle-eca.js";
import { EvidenceQuality, SourceRecordNotFoundError } from "./types.js";
import type { FactRetriever } from "./assemble.js";
import type { Polygon } from "../spatial-analysis/types.js";
import { parseZoningDesignation } from "../zoning/designation.js";
import type { ZoningDesignation } from "../zoning/designation.js";

const ORG_BASE_URL = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services";
const ZONING_SERVICE = "Current_Land_Use_Zoning_Detail_2";
const FTSA_SERVICE = "Frequent_Transit_Service_Area";
const LANDMARKS_SERVICE = "Landmarks";
const TIMEOUT_MS = 8000;
/** Grid resolution for the share-of-parcel computation: GRID x GRID cell centers over the parcel's bounding box. */
export const ZONE_COVERAGE_GRID = 80;

export interface ZoneCoverage {
  /** The layer's `ZONING` value, e.g. "NR", "LR1 (M)", "MIO-160-NR". */
  zoning: string;
  baseZone: string;
  /** True when the layer's SHORELINE / HISTORIC field is non-blank for this zone polygon. */
  shorelineDistrict: boolean;
  historicDistrict: boolean;
  /** Non-blank OVERLAY field text, if any. */
  overlay?: string;
  /** Share of the parcel's area (0..1) lying in this zone, by grid sampling. */
  fractionOfParcel: number;
  /**
   * The designation read into its parts (family, zone code, MHA suffix, RC, height suffix...), parsed from `zoning` and
   * cross-checked against the layer's own ZONELUT / CATEGORY / MHA attributes. Optional only because artifacts persisted
   * before citywide zoning coverage carry just the raw strings; consumers re-parse those with `parseZoningDesignation`.
   */
  designation?: ZoningDesignation;
}

export interface ZoningFactValue {
  zones: ZoneCoverage[];
  /** What was intersected: the whole parcel, or the placed project's footprint. Absent on pre-existing artifacts (the parcel). */
  geometryBasis?: "PARCEL" | "PROJECT_FOOTPRINT";
  sampledPointCount: number;
  /** Sum of every zone's fractionOfParcel - below 1 means part of the parcel matched no zone polygon (data gap). */
  coveredFraction: number;
}

export interface FrequentTransitFactValue {
  inFrequentTransitServiceArea: boolean;
}
export interface LandmarkFactValue {
  isLandmarkParcel: boolean;
}

export const ZONING_QUALITY_CAVEAT =
  "Seattle publishes this zoning layer as general mapping; the zone shown is not a legal determination. SDCI confirms the zone and any overlay that applies to a property.";

type Ring = [number, number][];

const RingSchema = z.array(z.tuple([z.number(), z.number()]).rest(z.number()));
const ZoningFeatureSchema = z.object({
  attributes: z.object({
    ZONING: z.string().nullable().optional(),
    BASE_ZONE: z.string().nullable().optional(),
    SHORELINE: z.string().nullable().optional(),
    HISTORIC: z.string().nullable().optional(),
    OVERLAY: z.string().nullable().optional(),
    ZONELUT: z.string().nullable().optional(),
    CLASS_DESC: z.string().nullable().optional(),
    CATEGORY_DESC: z.string().nullable().optional(),
    CHAPTER: z.string().nullable().optional(),
    MHA_VALUE: z.string().nullable().optional(),
    MIO_NAME: z.string().nullable().optional(),
  }),
  geometry: z.object({ rings: z.array(RingSchema) }),
});
const ZoningResponseSchema = z.object({
  spatialReference: z.object({ wkid: z.number().optional(), latestWkid: z.number().optional() }).optional(),
  features: z.array(ZoningFeatureSchema),
  error: z.unknown().optional(),
});

function toEsriRingJson(polygon: Polygon): string {
  const ring = [...polygon.points.map((p) => [p.x, p.y]), [polygon.points[0]!.x, polygon.points[0]!.y]];
  return JSON.stringify({ rings: [ring], spatialReference: { wkid: AUTHORITATIVE_PARCEL_SRID } });
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd containment across every ring of one polygon feature (handles holes). */
function pointInRings(x: number, y: number, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) if (pointInRing(x, y, ring)) inside = !inside;
  return inside;
}

export interface ZonePolygon {
  key: { zoning: string; baseZone: string; shorelineDistrict: boolean; historicDistrict: boolean; overlay?: string; designation?: ZoningDesignation };
  rings: Ring[];
}

/**
 * Pure and deterministic: the share of the parcel (even-odd interior of its ring) lying inside each
 * zone polygon, by sampling the centers of a `grid` x `grid` cell lattice over the parcel's bounding
 * box. Zone polygons with the same attribute key are merged. Exported for direct testing.
 */
export function computeZoneCoverage(parcelRing: Ring, zones: ZonePolygon[], grid: number = ZONE_COVERAGE_GRID): ZoningFactValue {
  const xs = parcelRing.map((p) => p[0]);
  const ys = parcelRing.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const counts = new Map<string, { zone: ZonePolygon["key"]; n: number }>();
  let inParcel = 0;
  let covered = 0;
  for (let i = 0; i < grid; i++) {
    const x = minX + ((i + 0.5) / grid) * (maxX - minX);
    for (let j = 0; j < grid; j++) {
      const y = minY + ((j + 0.5) / grid) * (maxY - minY);
      if (!pointInRing(x, y, parcelRing)) continue;
      inParcel++;
      for (const z of zones) {
        if (!pointInRings(x, y, z.rings)) continue;
        const k = JSON.stringify(z.key);
        const entry = counts.get(k) ?? { zone: z.key, n: 0 };
        entry.n++;
        counts.set(k, entry);
        covered++;
        break; // zone polygons do not overlap; first match owns the point
      }
    }
  }
  const zonesOut: ZoneCoverage[] = [...counts.values()]
    .map(({ zone, n }) => ({ ...zone, fractionOfParcel: inParcel === 0 ? 0 : n / inParcel }))
    .sort((a, b) => b.fractionOfParcel - a.fractionOfParcel);
  return { zones: zonesOut, sampledPointCount: inParcel, coveredFraction: inParcel === 0 ? 0 : covered / inParcel };
}

function nonBlank(v: string | null | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t === "" ? undefined : t;
}

export function createSeattleZoningRetriever(timeoutMs: number = TIMEOUT_MS): FactRetriever<ZoningFactValue> {
  return {
    factType: "zoning",
    sourceAgency: "Seattle GIS",
    dataset: "Current Land Use Zoning Detail",
    qualityCaveat: ZONING_QUALITY_CAVEAT,
    evidenceQuality: EvidenceQuality.AUTHORITATIVE,
    retrieve: async (parcel) => {
      const polygon = await fetchParcelBoundaryPolygon(parcel.parcelId);
      return queryZoningForPolygon(polygon, timeoutMs, "PARCEL");
    },
  };
}

/**
 * Zones intersecting `polygon` (SRID 2926), with each zone's share of the polygon. Used for the parcel (the retriever above)
 * and for the placed project's footprint (citywide zoning coverage): a structure is regulated by the zone it stands in, so
 * the footprint's own zoning is a separate, smaller question than the lot's.
 */
export async function queryZoningForPolygon(polygon: Polygon, timeoutMs: number, basis: "PARCEL" | "PROJECT_FOOTPRINT"): Promise<ZoningFactValue> {
  const params = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: "ZONING,BASE_ZONE,SHORELINE,HISTORIC,OVERLAY,ZONELUT,CLASS_DESC,CATEGORY_DESC,CHAPTER,MHA_VALUE,MIO_NAME",
    returnGeometry: "true",
    outSR: String(AUTHORITATIVE_PARCEL_SRID),
    geometry: toEsriRingJson(polygon),
    geometryType: "esriGeometryPolygon",
    inSR: String(AUTHORITATIVE_PARCEL_SRID),
    spatialRel: "esriSpatialRelIntersects",
  });
  // POST, not GET: a large or complex parcel polygon makes the query string too long for the service (a campus parcel returned 404 as a GET).
  const response = await fetchLayerWithTimeout(`${ORG_BASE_URL}/${ZONING_SERVICE}/FeatureServer/0/query`, timeoutMs, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Seattle zoning request failed: ${response.status} ${response.statusText}`);
  const parsed = ZoningResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.error) throw new Error("Seattle zoning response failed shape validation.");
  const wkid = parsed.data.spatialReference?.latestWkid ?? parsed.data.spatialReference?.wkid;
  if (wkid !== AUTHORITATIVE_PARCEL_SRID && parsed.data.features.length > 0) {
    throw new Error(`Seattle zoning response declared SRID ${String(wkid)}, expected ${AUTHORITATIVE_PARCEL_SRID}; refusing to trust its coordinates.`);
  }
  if (parsed.data.features.length === 0) throw new SourceRecordNotFoundError(basis === "PARCEL" ? "No Seattle zoning polygon intersects this parcel." : "No Seattle zoning polygon intersects the project footprint.");
  const zonePolygons: ZonePolygon[] = parsed.data.features.map((f) => {
    const zoning = nonBlank(f.attributes.ZONING) ?? "UNKNOWN";
    return {
      key: {
        zoning,
        baseZone: nonBlank(f.attributes.BASE_ZONE) ?? "UNKNOWN",
        shorelineDistrict: nonBlank(f.attributes.SHORELINE) !== undefined,
        historicDistrict: nonBlank(f.attributes.HISTORIC) !== undefined,
        ...(nonBlank(f.attributes.OVERLAY) ? { overlay: nonBlank(f.attributes.OVERLAY)! } : {}),
        designation: parseZoningDesignation(zoning, {
          zonelut: f.attributes.ZONELUT,
          baseZone: f.attributes.BASE_ZONE,
          classDesc: f.attributes.CLASS_DESC,
          categoryDesc: f.attributes.CATEGORY_DESC,
          chapter: f.attributes.CHAPTER,
          mhaValue: f.attributes.MHA_VALUE,
          mioName: f.attributes.MIO_NAME,
        }),
      },
      rings: f.geometry.rings as Ring[],
    };
  });
  return { ...computeZoneCoverage(polygon.points.map((p) => [p.x, p.y] as [number, number]), zonePolygons), geometryBasis: basis };
}

async function pinMembershipQuery(service: string, pin: string, timeoutMs: number): Promise<boolean> {
  const params = new URLSearchParams({ f: "json", where: `PIN='${pin.replace(/'/g, "''")}'`, outFields: "PIN", returnGeometry: "false", returnCountOnly: "true" });
  const response = await fetchLayerWithTimeout(`${ORG_BASE_URL}/${service}/FeatureServer/0/query?${params.toString()}`, timeoutMs);
  if (!response.ok) throw new Error(`Seattle ${service} request failed: ${response.status} ${response.statusText}`);
  const parsed = z.object({ count: z.number() }).safeParse(await response.json());
  if (!parsed.success) throw new Error(`Seattle ${service} response failed shape validation.`);
  return parsed.data.count > 0;
}

/** Frequent transit service area membership (SMC 23.84A.038 "T"): a parcel-keyed layer, so membership is exact by PIN. */
export function createSeattleFrequentTransitRetriever(timeoutMs: number = TIMEOUT_MS): FactRetriever<FrequentTransitFactValue> {
  return {
    factType: "frequent-transit-service-area",
    sourceAgency: "Seattle GIS",
    dataset: "Frequent Transit Service Area",
    evidenceQuality: EvidenceQuality.AUTHORITATIVE,
    retrieve: async (parcel) => ({ inFrequentTransitServiceArea: await pinMembershipQuery(FTSA_SERVICE, parcel.parcelId, timeoutMs) }),
  };
}

/** Designated landmark parcel (PIN-keyed point layer). */
export function createSeattleLandmarkRetriever(timeoutMs: number = TIMEOUT_MS): FactRetriever<LandmarkFactValue> {
  return {
    factType: "landmark-designation",
    sourceAgency: "Seattle GIS",
    dataset: "Landmarks",
    evidenceQuality: EvidenceQuality.AUTHORITATIVE,
    retrieve: async (parcel) => ({ isLandmarkParcel: await pinMembershipQuery(LANDMARKS_SERVICE, parcel.parcelId, timeoutMs) }),
  };
}
