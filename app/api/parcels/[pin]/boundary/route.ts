import { getDb } from "../../../../../src/db/client.js";
import { fetchParcelBoundaryPolygon, KING_COUNTY_PARCEL_BOUNDARY_QUALITY_CAVEAT } from "../../../../../src/property-intelligence/king-county-parcel-geometry.js";
import { fetchBuildingFootprints } from "../../../../../src/property-intelligence/seattle-building-outlines.js";
import { transformPolygonToWgs84 } from "../../../../../src/spatial-analysis/postgis-adapter.js";
import { logger } from "../../../../../src/shared/logger.js";

/**
 * Parcel boundary lookup for the frontend's map display (Workflow 2). Fetches the authoritative
 * (EPSG:2926) boundary from King County via Property Intelligence, then derives a WGS84 copy for
 * MapLibre display via PostGIS's own ST_Transform (Code Generation CRS correction) - never an
 * application-level approximation. Both are returned: `boundaryPolygon` (authoritative, used for
 * edge-role selection's index/count) and `boundaryPolygonWgs84` (display only).
 *
 * The authoritative fetch happens again, independently, inside Property Intelligence during the
 * generation pipeline (Report Generation Orchestrator, post-authorization) - this endpoint is not
 * on that path and does not persist anything.
 *
 * Building intelligence v1 (2026-08-29): also returns any Seattle Building Outlines 2023
 * footprints on this parcel, WGS84-only (`outlineId` + display polygon + area) - just enough for
 * ParcelPlacementMap to render them and let the user confirm which one is the primary dwelling.
 * Deliberately best-effort and independent of the parcel-boundary fetch above: a building-outlines
 * failure never fails this whole request (`existingStructures: []`, `existingStructuresError` set)
 * - "fail closed on claims, not on customer journey," same discipline the rest of this project
 * already applies. The report-generation pipeline re-fetches these footprints itself, fresh, from
 * Property Intelligence at generation time (seattle-building-outlines.ts) - this endpoint's copy
 * is presentation-only and never trusted for the real distanceToDwellingFt computation.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  try {
    const boundaryPolygon = await fetchParcelBoundaryPolygon(pin);
    const boundaryPolygonWgs84 = await transformPolygonToWgs84(getDb(), boundaryPolygon);

    let existingStructures: { outlineId: string; footprintWgs84: { lng: number; lat: number }[]; areaSqFt?: number }[] = [];
    let existingStructuresError: string | undefined;
    try {
      const footprints = await fetchBuildingFootprints(pin);
      existingStructures = await Promise.all(
        footprints.map(async (f) => ({
          outlineId: f.outlineId,
          footprintWgs84: await transformPolygonToWgs84(getDb(), f.footprint),
          areaSqFt: f.areaSqFt,
        }))
      );
    } catch (err) {
      // Best-effort: the parcel boundary itself is still fully usable without building outlines.
      existingStructuresError = err instanceof Error ? err.message : "Failed to fetch building outlines.";
      logger.warn("BUILDING_OUTLINES_DISPLAY_FETCH_FAILED", { pin, error: existingStructuresError });
    }

    return Response.json({
      boundaryPolygon,
      boundaryPolygonWgs84,
      qualityCaveat: KING_COUNTY_PARCEL_BOUNDARY_QUALITY_CAVEAT,
      existingStructures,
      ...(existingStructuresError ? { existingStructuresError } : {}),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to fetch parcel boundary." }, { status: 502 });
  }
}
