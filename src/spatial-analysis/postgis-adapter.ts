/**
 * Production PostGIS Spatial-Query Boundary - NFR Design Pattern 5. The sole production
 * implementation of setback-distance computation; `geometry.ts` remains the deterministic-test
 * reference implementation only (never called from here or from any other production path -
 * enforced by tests/spatial-analysis/production-boundary.test.ts).
 *
 * Ownership boundary (Infrastructure Design correction, 2026-08-22): this module receives
 * already-retrieved parcel geometry - it does NOT fetch anything from King County itself. Property
 * Intelligence owns that retrieval (see property-intelligence/king-county-parcel-geometry.ts).
 *
 * CRS contract (Code Generation correction, 2026-08-23): every coordinate this module accepts is
 * explicitly tagged with its source CRS - `boundaryPolygon.srid` (always AUTHORITATIVE_PARCEL_SRID,
 * EPSG:2926, feet-based) for the parcel boundary, and `proposedPlacement.anchor` as WGS84
 * (EPSG:4326) exactly as MapLibre produced it, with no browser-side conversion. This module is
 * the ONLY place a WGS84 coordinate is ever transformed into the projected/feet CRS, via
 * PostGIS's ST_Transform - never an application-level approximation. Every entry point fails
 * closed (throws) on a missing/mismatched SRID rather than silently computing with an unverified
 * coordinate system.
 *
 * All queries are parameterized (Drizzle's sql template with bound values) - never string-
 * concatenated SQL, per requirements.md's standing database-security requirement.
 */

import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import type { GeographicPoint, Polygon } from "./types.js";
import { LotLineRoleStatus } from "../screening-request/types.js";
import type { LotLineRoleAssignment, ProposedPlacement } from "../screening-request/types.js";
import { edgeRefsForPolygon } from "./lot-line-roles.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../property-intelligence/king-county-parcel-geometry.js";

const WGS84_SRID = 4326;

export interface SetbackDistances {
  distanceToFrontLotLineFt?: number;
  distanceToSideLotLineFt?: number;
  distanceToRearLotLineFt?: number;
}

function polygonToWkt(polygon: Polygon): string {
  const ring = [...polygon.points, polygon.points[0]!].map((p) => `${p.x} ${p.y}`).join(", ");
  return `POLYGON((${ring}))`;
}

function edgeToWkt(polygon: Polygon, edgeRef: string): string {
  const index = Number(/^edge-(\d+)$/.exec(edgeRef)?.[1]);
  const n = polygon.points.length;
  const a = polygon.points[index]!;
  const b = polygon.points[(index + 1) % n]!;
  return `LINESTRING(${a.x} ${a.y}, ${b.x} ${b.y})`;
}

/** Fails closed if `boundaryPolygon` doesn't declare exactly the expected, verified SRID - never
 * silently proceeds with an untagged or unexpected coordinate system. */
function assertAuthoritativeSrid(boundaryPolygon: Polygon): void {
  if (boundaryPolygon.srid !== AUTHORITATIVE_PARCEL_SRID) {
    throw new Error(
      `boundaryPolygon must be tagged srid=${AUTHORITATIVE_PARCEL_SRID} (got ${String(boundaryPolygon.srid)}) - ` +
        `refusing to compute setbacks against an unverified coordinate system.`
    );
  }
}

/** Transforms a WGS84 anchor point into the parcel boundary's projected CRS using PostGIS's own
 * ST_Transform - the only reprojection this codebase ever performs, and it happens here, not in
 * the browser. */
async function transformAnchorToProjectedCrs(db: Db, anchor: GeographicPoint, targetSrid: number): Promise<{ x: number; y: number }> {
  const result = await db.execute(sql`
    SELECT
      ST_X(t) AS x,
      ST_Y(t) AS y
    FROM (
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint(${anchor.lng}, ${anchor.lat}), ${WGS84_SRID}), ${targetSrid}) AS t
    ) transformed
  `);
  const row = result.rows[0] as { x: number | string; y: number | string } | undefined;
  if (!row) throw new Error("ST_Transform of the proposed anchor returned no rows.");
  return { x: Number(row.x), y: Number(row.y) };
}

/** Builds the rectangular footprint in the already-projected (feet) CRS - once anchor and
 * boundary share the same projected system, ordinary Euclidean rotation/offset math over feet is
 * exact, not an approximation (unlike doing the equivalent arithmetic directly in degrees). */
function buildFootprintInProjectedCrs(anchorProjected: { x: number; y: number }, widthFt: number, depthFt: number, orientationDeg: number): Polygon {
  const rad = (orientationDeg * Math.PI) / 180;
  const hw = widthFt / 2;
  const hd = depthFt / 2;
  const corners = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return {
    units: "FEET",
    srid: AUTHORITATIVE_PARCEL_SRID,
    points: corners.map((c) => ({
      x: anchorProjected.x + c.x * Math.cos(rad) - c.y * Math.sin(rad),
      y: anchorProjected.y + c.x * Math.sin(rad) + c.y * Math.cos(rad),
    })),
  };
}

async function distanceToEdge(db: Db, footprintWkt: string, edgeWkt: string, srid: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT ST_Distance(
      ST_SetSRID(ST_GeomFromText(${footprintWkt}), ${srid}),
      ST_SetSRID(ST_GeomFromText(${edgeWkt}), ${srid})
    ) AS distance_ft
  `);
  const row = result.rows[0] as { distance_ft: number | string } | undefined;
  if (row === undefined) throw new Error("PostGIS distance query returned no rows.");
  return Number(row.distance_ft);
}

/**
 * Computes setback distances for a proposed structure placement against a parcel boundary.
 *
 * CRS: `boundaryPolygon` must already be tagged srid=AUTHORITATIVE_PARCEL_SRID (fails closed
 * otherwise). `proposedPlacement.anchor` is WGS84 exactly as submitted by the browser - this
 * function transforms it into the boundary's projected CRS via ST_Transform before any distance
 * math runs.
 *
 * BR-U2-9 (hard invariant): only computes role-dependent distances when `lotLineRoleAssignment.
 * status === "ASSIGNED"` - never infers front/rear/side from the polygon's shape itself. When
 * INSUFFICIENT, returns an empty result (all fields undefined) so the Regulatory Rules Engine's
 * existing missing-evidence path produces REQUIRES_VERIFICATION, exactly as it already does for
 * any other missing spatial input.
 */
export interface SetbackComputationResult {
  distances: SetbackDistances;
  /** The proposed footprint as actually constructed and measured, in the boundary's projected
   * CRS - undefined when INSUFFICIENT/missing-role short-circuited before it was built. Exposed
   * so callers (the orchestrator) can persist it once, for ReportMap's later display use, without
   * a second PostGIS round-trip. */
  footprintProjected?: Polygon;
}

export async function computeSetbackDistances(
  db: Db,
  boundaryPolygon: Polygon,
  proposedPlacement: ProposedPlacement,
  shedDimensions: { widthFt: number; depthFt: number },
  lotLineRoleAssignment: LotLineRoleAssignment
): Promise<SetbackComputationResult> {
  assertAuthoritativeSrid(boundaryPolygon);

  if (lotLineRoleAssignment.status === LotLineRoleStatus.INSUFFICIENT) {
    return { distances: {} };
  }

  const validRefs = new Set(edgeRefsForPolygon(boundaryPolygon));
  const { frontEdgeRef, rearEdgeRef, sideEdgeRefs } = lotLineRoleAssignment;
  if (!frontEdgeRef || !validRefs.has(frontEdgeRef) || !rearEdgeRef || !validRefs.has(rearEdgeRef)) {
    // Defensive - Boundary Validator should already have rejected this upstream. Never guess.
    return { distances: {} };
  }

  const anchorProjected = await transformAnchorToProjectedCrs(db, proposedPlacement.anchor, boundaryPolygon.srid!);
  const footprint = buildFootprintInProjectedCrs(anchorProjected, shedDimensions.widthFt, shedDimensions.depthFt, proposedPlacement.orientationDeg);

  const footprintWkt = polygonToWkt(footprint);
  const srid = boundaryPolygon.srid!;
  const distances: SetbackDistances = {};

  distances.distanceToFrontLotLineFt = await distanceToEdge(db, footprintWkt, edgeToWkt(boundaryPolygon, frontEdgeRef), srid);
  distances.distanceToRearLotLineFt = await distanceToEdge(db, footprintWkt, edgeToWkt(boundaryPolygon, rearEdgeRef), srid);

  if (sideEdgeRefs && sideEdgeRefs.length > 0) {
    const sideDistances = await Promise.all(
      sideEdgeRefs.filter((ref) => validRefs.has(ref)).map((ref) => distanceToEdge(db, footprintWkt, edgeToWkt(boundaryPolygon, ref), srid))
    );
    if (sideDistances.length > 0) distances.distanceToSideLotLineFt = Math.min(...sideDistances);
  }

  return { distances, footprintProjected: footprint };
}

/**
 * Transforms a parcel boundary from its authoritative projected CRS into WGS84, for browser/
 * MapLibre display only - never used for computation. The only other place this codebase ever
 * touches WGS84/projected conversion (alongside `computeSetbackDistances`'s anchor transform),
 * both via PostGIS's ST_Transform, never application-level math.
 */
export async function transformPolygonToWgs84(db: Db, polygon: Polygon): Promise<GeographicPoint[]> {
  assertAuthoritativeSrid(polygon);
  const wkt = polygonToWkt(polygon);
  const result = await db.execute(sql`
    SELECT ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_GeomFromText(${wkt}), ${polygon.srid}), ${WGS84_SRID})) AS geojson
  `);
  const row = result.rows[0] as { geojson: string } | undefined;
  if (!row) throw new Error("ST_Transform to WGS84 returned no rows.");
  const geojson = JSON.parse(row.geojson) as { coordinates: [number, number][][] };
  const ring = geojson.coordinates[0];
  if (!ring) throw new Error("ST_Transform to WGS84 produced no ring.");
  // GeoJSON repeats the first point as the last (closed ring) - drop the duplicate to match this
  // codebase's polygon convention.
  return ring.slice(0, -1).map(([lng, lat]) => ({ lng: lng!, lat: lat! }));
}

/** Verifies the PostGIS extension is actually enabled - used by the integration test and
 * optionally by a startup check. Not called from any request-serving path. */
export async function checkPostgisEnabled(db: Db): Promise<string> {
  const result = await db.execute(sql`SELECT PostGIS_Version() AS version`);
  const row = result.rows[0] as { version: string } | undefined;
  if (!row) throw new Error("PostGIS_Version() returned no rows - is the extension enabled?");
  return row.version;
}
