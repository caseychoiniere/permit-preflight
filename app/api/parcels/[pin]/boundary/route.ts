import { getDb } from "../../../../../src/db/client.js";
import { fetchParcelBoundaryPolygon, KING_COUNTY_PARCEL_BOUNDARY_QUALITY_CAVEAT } from "../../../../../src/property-intelligence/king-county-parcel-geometry.js";
import { transformPolygonToWgs84 } from "../../../../../src/spatial-analysis/postgis-adapter.js";

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
 */
export async function GET(_request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  try {
    const boundaryPolygon = await fetchParcelBoundaryPolygon(pin);
    const boundaryPolygonWgs84 = await transformPolygonToWgs84(getDb(), boundaryPolygon);
    return Response.json({ boundaryPolygon, boundaryPolygonWgs84, qualityCaveat: KING_COUNTY_PARCEL_BOUNDARY_QUALITY_CAVEAT });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to fetch parcel boundary." }, { status: 502 });
  }
}
