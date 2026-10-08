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
 * overlay (queried separately, see COMBINED_LAYER). The 12th service
 * (`Environmentally_Critical_Area_Overlay_for_Zoned_Development_Capacity_Model_Current`) is
 * excluded entirely - the research explicitly disclaims it as "a modeling artifact - not a
 * regulatory layer." */
interface EcaHazardLayer {
  hazardType: string;
  serviceName: string;
  layerId: number;
  layerVintageNote: string;
}

const HAZARD_LAYERS: EcaHazardLayer[] = [
  { hazardType: "steep_slope", serviceName: "Environmentally_Critical_Areas_Steep_Slope", layerId: 9, layerVintageNote: "2001 PSLC LIDAR + 1993 contours; SDCI Director's Rule 12-2019." },
  { hazardType: "known_slides", serviceName: "Environmentally_Critical_Areas_Known_Slides", layerId: 0, layerVintageNote: "Mapped historic landslide areas." },
  { hazardType: "potential_slide_areas", serviceName: "Environmentally_Critical_Areas_Potential_Slide_Areas", layerId: 0, layerVintageNote: "Mapped potential landslide-prone areas." },
  { hazardType: "riparian_corridor", serviceName: "Environmentally_Critical_Areas_Riparian_Corridors", layerId: 0, layerVintageNote: "100-ft riparian management area." },
  { hazardType: "wetland", serviceName: "Environmentally_Critical_Areas_Wetlands", layerId: 0, layerVintageNote: "Category-based buffers; buffer width itself not computed here." },
  { hazardType: "priority_habitat", serviceName: "ECA_Fish_and_Wildlife_Habitat_Conservation_Area", layerId: 0, layerVintageNote: "Priority habitat, corridors, species of local importance." },
  { hazardType: "flood_prone", serviceName: "ECA_Flood_Prone_Areas", layerId: 0, layerVintageNote: "Cross-reference FEMA NFHL." },
  { hazardType: "landfill_historical", serviceName: "ECA_Landfills_Historical", layerId: 0, layerVintageNote: "Abandoned/historical landfills." },
  { hazardType: "liquefaction_prone", serviceName: "ECA_Liquefaction_Prone_Areas", layerId: 0, layerVintageNote: "1995 vintage, USGS-derived." },
  { hazardType: "peat_settlement", serviceName: "ECA_Peat_Settlement_Prone_Areas", layerId: 0, layerVintageNote: "Category 1 + new impervious surface disqualifies STFI (Tip 316)." },
];

const COMBINED_LAYER = { serviceName: "Environmentally_Critical_Areas_ECA", layerId: 0 };

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

export type FetchLayer = (url: string, timeoutMs: number) => Promise<Response>;

/**
 * Queries one ECA layer for a boolean parcel-boundary intersection only (no feature geometry
 * needed for this parcel-scope screening) - `returnGeometry=false`, minimal `outFields`. Throws
 * on any failure (non-2xx, invalid response shape, or an undeclared/mismatched CRS) - the
 * caller-owned Promise.allSettled wrapper is what turns that into per-layer isolation, never a
 * try/catch inside this function.
 */
async function queryLayerIntersects(serviceName: string, layerId: number, boundary: Polygon, fetchLayer: FetchLayer): Promise<boolean> {
  const srid = AUTHORITATIVE_PARCEL_SRID;
  const url =
    `${ECA_ORG_BASE_URL}/${serviceName}/FeatureServer/${layerId}/query?` +
    `geometry=${encodeURIComponent(toEsriRingJson(boundary))}&geometryType=esriGeometryPolygon&spatialRel=esriSpatialRelIntersects` +
    `&inSR=${srid}&outSR=${srid}&outFields=OBJECTID&returnGeometry=false&f=json`;

  const response = await fetchLayer(url, DEFAULT_LAYER_TIMEOUT_MS);
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

  const individualSettled = await Promise.allSettled(
    HAZARD_LAYERS.map((layer) => (async () => queryLayerIntersects(layer.serviceName, layer.layerId, boundary, fetchLayer))())
  );
  const combinedSettled = await (async () => {
    try {
      const intersects = await queryLayerIntersects(COMBINED_LAYER.serviceName, COMBINED_LAYER.layerId, boundary, fetchLayer);
      return { status: "fulfilled" as const, value: intersects };
    } catch (error) {
      return { status: "rejected" as const, reason: error };
    }
  })();

  const queries: LayerQueryResult[] = HAZARD_LAYERS.map((layer, i) => {
    const settled = individualSettled[i]!;
    return {
      hazardType: layer.hazardType,
      individualLayerResult: settled.status === "fulfilled" ? settled.value : undefined,
      combinedLayerResult: combinedSettled.status === "fulfilled" ? combinedSettled.value : undefined,
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
    dataset: `${HAZARD_LAYERS.length} individual ECA hazard layers + combined ECA overlay (${ECA_ORG_BASE_URL})`,
    qualityCaveat: SEATTLE_ECA_QUALITY_CAVEAT,
    evidenceQuality: EvidenceQuality.GENERAL_LOCATION_ONLY,
    retrieve: (parcel: CandidateParcel) => fetchSeattleEcaFindings(parcel.parcelId, fetchLayer),
  };
}
