/**
 * Seattle Environmentally Critical Areas (ECA) retrieval - Property Intelligence's job
 * (functional-design/domain-entities.md §1a, business-logic-model.md Flow 1, nfr-design.md §1).
 * Templated on seattle-building-outlines.ts (same ArcGIS org `services.arcgis.com/
 * ZOyb2t4B0UYuYNYH`, same explicit-SRID-verification-before-trust, same
 * "authoritative source performs its own reprojection" convention) with one genuinely new
 * pattern layered on top: an internal concurrent fan-out across multiple layers, each under its
 * own per-request timeout, with per-layer failure isolation (NFR-U6B-1/BR-U6B-1 - one hazard
 * layer's failure must never fail the whole `environmental-constraints` fact).
 *
 * Scope of this pass (disclosed, not silent): parcel-scope screening only - the optional
 * footprint-scope refinement (`computeFootprintEcaIntersection`, populated once a placement
 * exists) is explicitly deferred per Flow 1's own text ("never required for the parcel-scope
 * screening to be usable"). `hazardGeometry` storage (for that future refinement) is likewise
 * not built in this pass.
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";
import type { CandidateParcel } from "../parcel-resolution/types.js";
import { fetchParcelBoundaryPolygon, AUTHORITATIVE_PARCEL_SRID } from "./king-county-parcel-geometry.js";
import { EvidenceQuality } from "./types.js";
import type { FactRetriever } from "./assemble.js";
import { resolveCriticalAreaFinding } from "../spatial-analysis/eca.js";
import type { LayerQueryResult } from "../spatial-analysis/eca.js";
import type { CriticalAreaFinding, Polygon } from "../spatial-analysis/types.js";

const ECA_ORG_BASE_URL = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services";

/** The approved subset of the 12 published ECA feature services actually queried here
 * (research-findings.md §3.1): the 10 individual per-hazard layers below, plus the one combined
 * service's matching layers (queried separately as the BR-5.1 fallback, see COMBINED_SERVICE_NAME). The 12th service
 * (`Environmentally_Critical_Area_Overlay_for_Zoned_Development_Capacity_Model_Current`) is
 * excluded entirely - the research explicitly disclaims it as "a modeling artifact - not a
 * regulatory layer." */
interface EcaHazardLayer {
  hazardType: string;
  /** The per-hazard feature service and the layer ids inside it (a hazard intersects when ANY of its layers does). */
  serviceName: string;
  layerIds: number[];
  /** The same hazard's layer ids inside the combined ECA service (`Environmentally_Critical_Areas_ECA`), used only as the BR-5.1 fallback. */
  combinedLayerIds: number[];
  layerVintageNote: string;
}

// Layer ids verified against each service's FeatureServer?f=json listing on 2026-10-08. They are NOT all 0: before this correction every layer but flood-prone
// and steep slope was queried at id 0 (which does not exist in those services, or is the flood layer in the combined service), so the individual queries failed
// and the combined fallback - which only ever looked at layer 0, the flood layer - reported "no intersection" for hazards that had never been checked.
const HAZARD_LAYERS: EcaHazardLayer[] = [
  { hazardType: "steep_slope", serviceName: "Environmentally_Critical_Areas_Steep_Slope", layerIds: [9], combinedLayerIds: [9], layerVintageNote: "2001 PSLC LIDAR + 1993 contours; SDCI Director's Rule 12-2019." },
  { hazardType: "known_slides", serviceName: "Environmentally_Critical_Areas_Known_Slides", layerIds: [1, 2, 3], combinedLayerIds: [1, 2, 3], layerVintageNote: "Mapped historic landslide areas (affected property, initiation points, scarps)." },
  { hazardType: "potential_slide_areas", serviceName: "Environmentally_Critical_Areas_Potential_Slide_Areas", layerIds: [7], combinedLayerIds: [7], layerVintageNote: "Mapped potential landslide-prone areas." },
  { hazardType: "riparian_corridor", serviceName: "Environmentally_Critical_Areas_Riparian_Corridors", layerIds: [8], combinedLayerIds: [8], layerVintageNote: "100-ft riparian management area." },
  { hazardType: "wetland", serviceName: "Environmentally_Critical_Areas_Wetlands", layerIds: [10], combinedLayerIds: [10], layerVintageNote: "Category-based buffers; buffer width itself not computed here." },
  { hazardType: "priority_habitat", serviceName: "ECA_Fish_and_Wildlife_Habitat_Conservation_Area", layerIds: [11], combinedLayerIds: [11], layerVintageNote: "Priority habitat, corridors, species of local importance." },
  { hazardType: "flood_prone", serviceName: "ECA_Flood_Prone_Areas", layerIds: [0], combinedLayerIds: [0], layerVintageNote: "Cross-reference FEMA NFHL." },
  { hazardType: "landfill_historical", serviceName: "ECA_Landfills_Historical", layerIds: [4], combinedLayerIds: [4], layerVintageNote: "Abandoned/historical landfills." },
  { hazardType: "liquefaction_prone", serviceName: "ECA_Liquefaction_Prone_Areas", layerIds: [5], combinedLayerIds: [5], layerVintageNote: "1995 vintage, USGS-derived." },
  { hazardType: "peat_settlement", serviceName: "ECA_Peat_Settlement_Prone_Areas", layerIds: [6], combinedLayerIds: [6], layerVintageNote: "Category 1 + new impervious surface disqualifies STFI (Tip 316)." },
];

const COMBINED_SERVICE_NAME = "Environmentally_Critical_Areas_ECA";

/** Per-request timeout (nfr-design.md §1) - `AbortController`-based, scoped to this file only.
 * Not retrofitted onto any other existing retriever. */
export async function fetchLayerWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const DEFAULT_LAYER_TIMEOUT_MS = 5000;

const EsriIntersectQueryResponseSchema = z.object({
  spatialReference: z.object({ wkid: z.number().optional(), latestWkid: z.number().optional() }).optional(),
  features: z.array(z.unknown()),
});

/** Esri JSON ring convention repeats the first point as the last (closed ring) - the opposite of
 * this codebase's own Polygon convention (points.ts elsewhere never repeats it). */
function toEsriRingJson(polygon: Polygon): string {
  const ring = [...polygon.points.map((p) => [p.x, p.y]), [polygon.points[0]!.x, polygon.points[0]!.y]];
  return JSON.stringify({ rings: [ring] });
}

export type FetchLayer = (url: string, timeoutMs: number, init?: RequestInit) => Promise<Response>;

/**
 * Queries one ECA layer for a boolean parcel-boundary intersection only (no feature geometry
 * needed for this parcel-scope screening) - `returnGeometry=false`, minimal `outFields`. Throws
 * on any failure (non-2xx, invalid response shape, or an undeclared/mismatched CRS) - the
 * caller-owned Promise.allSettled wrapper is what turns that into per-layer isolation, never a
 * try/catch inside this function.
 */
async function queryLayerIntersects(serviceName: string, layerId: number, boundary: Polygon, fetchLayer: FetchLayer): Promise<boolean> {
  const srid = AUTHORITATIVE_PARCEL_SRID;
  const url = `${ECA_ORG_BASE_URL}/${serviceName}/FeatureServer/${layerId}/query`;
  const params = new URLSearchParams({
    geometry: toEsriRingJson(boundary),
    geometryType: "esriGeometryPolygon",
    spatialRel: "esriSpatialRelIntersects",
    inSR: String(srid),
    outSR: String(srid),
    outFields: "OBJECTID",
    returnGeometry: "false",
    f: "json",
  });

  // POST, not GET: a large or complex parcel polygon makes the query string too long for the service (the zoning layer returned 404 as a GET for a campus parcel).
  const response = await fetchLayer(url, DEFAULT_LAYER_TIMEOUT_MS, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    throw new Error(`ECA layer "${serviceName}" request failed: ${response.status} ${response.statusText}`);
  }
  const raw: unknown = await response.json();
  const validated = validateAtBoundary(EsriIntersectQueryResponseSchema, raw);
  if (validated.outcome === "INVALID") {
    throw new Error(`ECA layer "${serviceName}" response failed validation: ${validated.issues.join("; ")}`);
  }

  // A zero-feature result still requires a verified CRS on layers that return one; some ArcGIS
  // servers omit spatialReference entirely on a zero-feature, non-geometry response - treated as
  // a valid "no intersection" only when explicitly absent (identical convention to
  // seattle-building-outlines.ts's zero-feature handling), never when present and mismatched.
  const returnedWkid = validated.data.spatialReference?.latestWkid ?? validated.data.spatialReference?.wkid;
  if (validated.data.spatialReference !== undefined && returnedWkid !== srid) {
    throw new Error(`ECA layer "${serviceName}" response declared spatial reference ${String(returnedWkid)}, but ${srid} was requested - refusing to trust this result.`);
  }

  return validated.data.features.length > 0;
}

/**
 * Fetches every approved-subset ECA layer's parcel-boundary intersection and resolves each into
 * a `CriticalAreaFinding` via the existing, unmodified `resolveCriticalAreaFinding` (BR-5/BR-5a).
 * Internal fan-out is `Promise.allSettled` with caller-owned async wrapping (nfr-design.md §1) -
 * one layer's failure records that layer as unavailable (`individualLayerResult: undefined`,
 * feeding the existing INDETERMINATE/combined-only path) and never fails the whole fact. This
 * function only throws for a genuine total-adapter failure (e.g. the parcel boundary itself
 * cannot be fetched) - never for an individual layer's failure.
 */
export async function fetchSeattleEcaFindings(parcelId: string, fetchLayer: FetchLayer = fetchLayerWithTimeout): Promise<CriticalAreaFinding[]> {
  const boundary = await fetchParcelBoundaryPolygon(parcelId);

  // Each hazard's result is the OR over its layers: true as soon as any layer intersects; false only when every layer answered; otherwise unavailable
  // (the query throws, which the settled wrapper below turns into `undefined` - never a guessed "no intersection").
  const anyLayerIntersects = async (serviceName: string, layerIds: number[]): Promise<boolean> => {
    const settled = await Promise.allSettled(layerIds.map((layerId) => (async () => queryLayerIntersects(serviceName, layerId, boundary, fetchLayer))()));
    if (settled.some((r) => r.status === "fulfilled" && r.value)) return true;
    const failed = settled.find((r) => r.status === "rejected");
    if (failed && failed.status === "rejected") throw failed.reason;
    return false;
  };

  const settledPairs = await Promise.all(
    HAZARD_LAYERS.map(async (layer) => {
      const [individual, combined] = await Promise.allSettled([anyLayerIntersects(layer.serviceName, layer.layerIds), anyLayerIntersects(COMBINED_SERVICE_NAME, layer.combinedLayerIds)]);
      return { individual, combined };
    })
  );

  const queries: LayerQueryResult[] = HAZARD_LAYERS.map((layer, i) => {
    const { individual, combined } = settledPairs[i]!;
    return {
      hazardType: layer.hazardType,
      individualLayerResult: individual.status === "fulfilled" ? individual.value : undefined,
      combinedLayerResult: combined.status === "fulfilled" ? combined.value : undefined,
      layerVintageNote: layer.layerVintageNote,
    };
  });

  return queries.map((query) => resolveCriticalAreaFinding(query));
}

export const SEATTLE_ECA_QUALITY_CAVEAT =
  "City of Seattle Environmentally Critical Areas layers are mapped for general planning/screening purposes, per-layer vintage varies " +
  "(some sources are decades old), and several layers are advisory-only, not map-dispositive - a clean mapped result is never a substitute " +
  "for SDCI's own determination.";

export function createSeattleEcaRetriever(fetchLayer: FetchLayer = fetchLayerWithTimeout): FactRetriever<CriticalAreaFinding[]> {
  return {
    factType: "environmental-constraints",
    sourceAgency: "City of Seattle Enterprise GIS / SDCI",
    dataset: `${HAZARD_LAYERS.length} individual ECA hazard layers + the combined ECA service's matching layers (${ECA_ORG_BASE_URL})`,
    qualityCaveat: SEATTLE_ECA_QUALITY_CAVEAT,
    evidenceQuality: EvidenceQuality.GENERAL_LOCATION_ONLY,
    retrieve: (parcel: CandidateParcel) => fetchSeattleEcaFindings(parcel.parcelId, fetchLayer),
  };
}
