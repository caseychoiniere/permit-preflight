/**
 * Seattle Building Outlines 2023 retrieval - Property Intelligence's job, mirroring
 * king-county-parcel-geometry.ts's retrieval pattern exactly (same Boundary Validator discipline,
 * same explicit-SRID-verification-before-trust, same "authoritative source performs its own
 * reprojection" convention).
 *
 * Live-verified endpoint fields (2026-08-29): PIN (string, join key - same as the existing King
 * County parcel retriever), AREA (double, sq ft), OUTLINE_ID (double). spatialReference wkid 2926
 * on every real response with 1+ features - matches AUTHORITATIVE_PARCEL_SRID exactly (no
 * reprojection needed, but the response is still verified, never assumed). A zero-feature response
 * (e.g. a vacant lot) omits `spatialReference`/`fields` entirely - a genuine, valid SUCCESS with
 * nothing to verify the CRS of, handled explicitly below rather than tripping the SRID check.
 *
 * Structure-identity disclosure (research finding, 2026-08-29): this dataset carries NO
 * building-use or type attribute of any kind - it cannot say which footprint (if any) is a
 * dwelling. This module returns geometry ONLY; classification is a separate, explicit-user-
 * confirmation step (see existing-structures.ts) - never inferred here, never inferred from a
 * footprint's size or from being the only one present.
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";
import type { CandidateParcel } from "../parcel-resolution/types.js";
import { AUTHORITATIVE_PARCEL_SRID } from "./king-county-parcel-geometry.js";
import { EvidenceQuality } from "./types.js";
import type { FactRetriever } from "./assemble.js";
import type { RawBuildingFootprint } from "./existing-structures.js";

const BUILDING_OUTLINES_BASE_URL = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Building_Outlines_2023/FeatureServer/0";

const RingSchema = z.array(z.tuple([z.number(), z.number()]).rest(z.number()));
const EsriPolygonGeometrySchema = z.object({ rings: z.array(RingSchema).min(1) });
const BuildingFeatureSchema = z.object({
  attributes: z.object({
    PIN: z.string().optional(),
    AREA: z.number().optional(),
    OUTLINE_ID: z.number(),
  }),
  geometry: EsriPolygonGeometrySchema,
});
const BuildingOutlinesResponseSchema = z.object({
  spatialReference: z.object({ wkid: z.number().optional(), latestWkid: z.number().optional() }).optional(),
  features: z.array(BuildingFeatureSchema),
});

export const SEATTLE_BUILDING_OUTLINES_QUALITY_CAVEAT =
  "City of Seattle Building Outlines 2023 are hand-drawn building footprints derived from aerial imagery, for general " +
  "reference only - they identify building GEOMETRY, not building use or type. Which footprint (if any) is the " +
  "primary dwelling is never determined by this dataset; it is confirmed by the property owner during configuration.";

/**
 * Fetches every building footprint on the given parcel PIN, in the authoritative projected CRS
 * (this endpoint performs its own reprojection - the authoritative source doing its own transform,
 * not an application-level approximation, same convention as fetchParcelBoundaryPolygon). Verifies
 * the response actually declares the requested SRID before trusting any returned coordinates -
 * fails closed (throws) rather than silently tagging mismatched or undeclared coordinates, except
 * when zero features are returned (a genuine, valid empty result with no spatial reference to
 * verify at all).
 *
 * Unlike the single-feature parcel-boundary retriever, a parcel may legitimately have zero, one,
 * or several building footprints - all are returned; this module never picks one or guesses which
 * is a dwelling. A feature whose ring cannot be represented (fewer than 3 usable points) is
 * dropped rather than guessed at.
 */
export async function fetchBuildingFootprints(parcelPin: string): Promise<RawBuildingFootprint[]> {
  const srid = AUTHORITATIVE_PARCEL_SRID;
  const where = `PIN='${parcelPin.replace(/'/g, "''")}'`;
  const url = `${BUILDING_OUTLINES_BASE_URL}/query?where=${encodeURIComponent(where)}&outFields=PIN,AREA,OUTLINE_ID&outSR=${srid}&geometryPrecision=2&f=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Seattle Building Outlines request failed: ${response.status} ${response.statusText}`);
  }
  const raw: unknown = await response.json();
  const validated = validateAtBoundary(BuildingOutlinesResponseSchema, raw);
  if (validated.outcome === "INVALID") {
    throw new Error(`Seattle Building Outlines response failed validation: ${validated.issues.join("; ")}`);
  }

  // A genuine zero-footprint result (e.g. a vacant lot, or a parcel this dataset simply hasn't
  // drawn) is a real, valid SUCCESS - distinct from a source failure (thrown above). This endpoint
  // omits spatialReference entirely on a zero-feature response, so the SRID check below never runs
  // for this case - there is no geometry to mistrust the CRS of.
  if (validated.data.features.length === 0) {
    return [];
  }

  const returnedWkid = validated.data.spatialReference?.latestWkid ?? validated.data.spatialReference?.wkid;
  if (returnedWkid !== srid) {
    throw new Error(
      `Seattle Building Outlines response declared spatial reference ${String(returnedWkid)}, but ${srid} was requested - ` +
        `refusing to tag these coordinates with an unverified SRID.`
    );
  }

  return validated.data.features
    .map((feature): RawBuildingFootprint | undefined => {
      const ring = feature.geometry.rings[0];
      if (!ring || ring.length < 4) return undefined; // fewer than 3 real vertices (closed ring) - never guess a structure from a degenerate ring.
      // Esri rings repeat the first point as the last point (closed ring) - drop the duplicate to
      // match this codebase's Polygon convention (first/last implicitly connected, not repeated).
      const points = ring.slice(0, -1).map(([x, y]) => ({ x, y }));
      return {
        outlineId: String(feature.attributes.OUTLINE_ID),
        parcelPin: feature.attributes.PIN ?? parcelPin,
        footprint: { units: "FEET" as const, points, srid },
        areaSqFt: feature.attributes.AREA,
      };
    })
    .filter((f): f is RawBuildingFootprint => f !== undefined);
}

export function createSeattleBuildingOutlinesRetriever(): FactRetriever<RawBuildingFootprint[]> {
  return {
    factType: "building-footprints-available",
    sourceAgency: "City of Seattle Enterprise GIS",
    dataset: "Building_Outlines_2023 (hand-drawn building outline geometry - no building-use attribute)",
    qualityCaveat: SEATTLE_BUILDING_OUTLINES_QUALITY_CAVEAT,
    evidenceQuality: EvidenceQuality.GENERAL_LOCATION_ONLY,
    retrieve: (parcel: CandidateParcel) => fetchBuildingFootprints(parcel.parcelId),
  };
}
