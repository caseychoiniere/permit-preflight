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
import type { SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import type { GeographicPoint, Geometry, MultiPolygon, Point, Polygon } from "./types.js";
import { isEmptyGeometry, isMultiPolygon } from "./types.js";
import { LotLineRoleStatus } from "../screening-request/types.js";
import type { LotLineRoleAssignment, ProposedPlacement } from "../screening-request/types.js";
import { edgeRefsForPolygon } from "./lot-line-roles.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../property-intelligence/king-county-parcel-geometry.js";

const WGS84_SRID = 4326;

/**
 * Unit 5 NFR Design §2 - `SpatialComputationResult<T>`'s COMPUTATION_FAILURE variant, implemented
 * as a thrown typed error (per NFR Design's explicitly-endorsed latitude) rather than a returned
 * third union member - matching this module's own existing throw-on-failure convention exactly
 * (`assertAuthoritativeSrid`, the missing-row checks above). Distinct from a `DATA_QUALITY_
 * UNRESOLVED` result (a successfully-evaluated-but-unusable input, returned normally, never
 * thrown) - the report-generation orchestrator routes a thrown `SpatialComputationError` into the
 * existing job failure/retry path, never into REQUIRES_VERIFICATION.
 */
export class SpatialComputationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SpatialComputationError";
  }
}

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

/**
 * Unit 4 - the parcel's own area in square feet, via PostGIS's ST_Area (never application-level
 * math, matching this module's own established convention). `boundaryPolygon` must already be
 * tagged srid=AUTHORITATIVE_PARCEL_SRID (fails closed otherwise, same as every other entry point
 * here) - the CRS is feet-based, so ST_Area's result is already in square feet with no unit
 * conversion needed. Feeds `LotCoverageFacts.rawParcelAreaSqFt` (regulatory-rules-engine/types.ts)
 * - this is the only place that value is ever computed.
 */
export async function computeParcelAreaSqFt(db: Db, boundaryPolygon: Polygon): Promise<number> {
  assertAuthoritativeSrid(boundaryPolygon);
  const wkt = polygonToWkt(boundaryPolygon);
  const result = await db.execute(sql`
    SELECT ST_Area(ST_SetSRID(ST_GeomFromText(${wkt}), ${boundaryPolygon.srid})) AS area_sq_ft
  `);
  const row = result.rows[0] as { area_sq_ft: number | string } | undefined;
  if (!row) throw new Error("ST_Area of the parcel boundary returned no rows.");
  return Number(row.area_sq_ft);
}

// ---------------------------------------------------------------------------------------------
// Unit 5 (Vacant Land) - buildable-envelope geometry. Genuinely new operations (envelope
// derivation via subtraction), distinct from computeSetbackDistances (distance-to-a-given-
// footprint measurement). Same conventions as above: parameterized sql, canonical SRID asserted
// first, ST_* only, never application-level geometry math.
// ---------------------------------------------------------------------------------------------

function ringToPoints(ring: [number, number][]): Point[] {
  // GeoJSON repeats the first point as the last (closed ring) - drop the duplicate, matching this
  // codebase's existing Polygon convention (transformPolygonToWgs84 above does the same).
  return ring.slice(0, -1).map(([x, y]) => ({ x: x!, y: y! }));
}

/** Converts a PostGIS ST_AsGeoJSON result into this codebase's own `Geometry` shape - never
 * narrowed to Polygon-only (NFR-U5-13), never drops interior rings/holes (Code Generation review
 * Correction 5E), and a genuinely empty result becomes a real `EmptyGeometry`, never `undefined`
 * or a zero-point `Polygon` (Correction 5F). */
export function geoJsonToGeometry(geojson: { type: string; coordinates?: unknown } | null, srid: number): Geometry {
  if (!geojson || geojson.type === "GeometryCollection") return { kind: "EMPTY", units: "FEET", srid };
  if (geojson.type === "Polygon") {
    const rings = geojson.coordinates as [number, number][][];
    const outerRing = rings[0];
    if (!outerRing || outerRing.length === 0) return { kind: "EMPTY", units: "FEET", srid };
    const holes = rings.slice(1).map(ringToPoints).filter((h) => h.length > 0);
    return { units: "FEET", srid, points: ringToPoints(outerRing), ...(holes.length > 0 ? { holes } : {}) };
  }
  if (geojson.type === "MultiPolygon") {
    const polys = geojson.coordinates as [number, number][][][];
    const polygons: Polygon[] = [];
    for (const rings of polys) {
      const outerRing = rings[0];
      if (!outerRing || outerRing.length === 0) continue;
      const holes = rings.slice(1).map(ringToPoints).filter((h) => h.length > 0);
      polygons.push({ units: "FEET", srid, points: ringToPoints(outerRing), ...(holes.length > 0 ? { holes } : {}) });
    }
    if (polygons.length === 0) return { kind: "EMPTY", units: "FEET", srid };
    if (polygons.length === 1) return polygons[0]!;
    return { units: "FEET", srid, polygons };
  }
  return { kind: "EMPTY", units: "FEET", srid };
}

function ringWkt(points: Point[]): string {
  return `(${[...points, points[0]!].map((p) => `${p.x} ${p.y}`).join(", ")})`;
}

/** Full WKT construction preserving holes (Correction 5E) and representing `EmptyGeometry`
 * safely as valid WKT (`POLYGON EMPTY`, Correction 5F) - `polygonToWkt` above stays the simple,
 * no-holes helper `computeSetbackDistances`/`computeParcelAreaSqFt` already relied on; this is the
 * general Unit 5 geometry-to-WKT path used wherever a `Geometry` (not just a plain `Polygon`) may
 * flow into a further PostGIS call. */
export function geometryToWkt(geom: Geometry): string {
  if (isEmptyGeometry(geom)) return "POLYGON EMPTY";
  if (isMultiPolygon(geom)) {
    if (geom.polygons.length === 0) return "MULTIPOLYGON EMPTY";
    const parts = geom.polygons.map((p) => `(${ringWkt(p.points)}${(p.holes ?? []).map((h) => `, ${ringWkt(h)}`).join("")})`);
    return `MULTIPOLYGON(${parts.join(", ")})`;
  }
  if (geom.points.length === 0) return "POLYGON EMPTY";
  return `POLYGON(${ringWkt(geom.points)}${(geom.holes ?? []).map((h) => `, ${ringWkt(h)}`).join("")})`;
}

function geometrySrid(geom: Geometry): number | undefined {
  return isMultiPolygon(geom) ? (geom.polygons[0]?.srid ?? geom.srid) : geom.srid;
}

/** Fails closed if `geom` doesn't declare exactly the expected, verified SRID - the same
 * discipline `assertAuthoritativeSrid` applies to a plain `Polygon`, extended to any `Geometry`
 * (Correction 5G - every new geometry input, not only the parcel boundary). */
function assertAuthoritativeGeometrySrid(geom: Geometry, label: string): void {
  const srid = geometrySrid(geom);
  if (srid !== AUTHORITATIVE_PARCEL_SRID) {
    throw new Error(`${label} must be tagged srid=${AUTHORITATIVE_PARCEL_SRID} (got ${String(srid)}) - refusing to compute against an unverified coordinate system.`);
  }
}

async function checkIsValidWkt(db: Db, wkt: string, srid: number, label: string): Promise<boolean> {
  let row: { is_valid: boolean } | undefined;
  try {
    const result = await db.execute(sql`SELECT ST_IsValid(ST_SetSRID(ST_GeomFromText(${wkt}), ${srid})) AS is_valid`);
    row = result.rows[0] as typeof row;
  } catch (err) {
    throw new SpatialComputationError(`PostGIS ST_IsValid check failed for ${label}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  return row?.is_valid === true;
}

export interface SetbackProfile {
  /** Governed values - sourced by the caller (the report-generation orchestrator) from an ACTIVE
   * `VACANT_LAND_SETBACK` RegulatoryRule's own `ruleSpecification`, never hardcoded here or in the
   * caller (Code Generation review Correction 1C). This function itself asserts no regulatory
   * number of its own. */
  frontFt: number;
  rearFt: number;
  /** The side setback actually governing this scenario's configuration (per U9's branch
   * selection - small-lot/transit 3 ft, or the 5 ft average/3 ft minimum default). */
  sideFt: number;
  /** true when `sideFt` is governed by U9's "5 ft average, 3 ft minimum" branch specifically -
   * triggers the conservative fixed-5-foot approximation (never the withdrawn flat-3ft version). */
  sideIsAveragingGoverned: boolean;
}

export type SetbackConstrainedAreaGeometryResult =
  | { status: "ESTABLISHED"; areaSqFt: number; polygon: Geometry; isConservativeSideSetbackApproximation: boolean }
  | { status: "NO_ACTIVE_COVERAGE" }
  | { status: "REQUIRES_VERIFICATION"; reason: string };

/**
 * Unit 5 (Correction 3, Final Correction, Code Generation review Correction 5B/C) - derives the
 * buildable envelope remaining after subtracting the applicable Table A setback envelope from the
 * parcel boundary, via real PostGIS per-edge differential subtraction - the front, rear, and each
 * side edge are each buffered by their OWN required distance and subtracted independently
 * (`ST_Buffer` on the edge LINESTRING, then `ST_Difference`), never a single uniform inward offset
 * applied to every edge alike. The inverse of `computeSetbackDistances` (which measures distance
 * from a *given* footprint to lot lines; this instead derives the *remaining area*).
 *
 * `setbackProfile === undefined` means no ACTIVE `VACANT_LAND_SETBACK` rule exists for this
 * scenario - `NO_ACTIVE_COVERAGE`, no PostGIS call is made, never a hardcoded placeholder profile
 * (Correction 1C).
 *
 * `lotLineRoles.status !== "ESTABLISHED"` (or roles are missing) is a DATA_QUALITY_UNRESOLVED
 * condition (this unit's current UI has no role-establishment interaction, so this is the honest,
 * expected result for every real evaluation today) - returned normally as
 * `REQUIRES_VERIFICATION`, never thrown; the PostGIS call is never made. A real
 * `SpatialComputationError` is thrown only for a genuine execution failure.
 *
 * Side setback: applies a flat 5 ft on each averaging-governed SIDE line specifically (never
 * front/rear, and never a uniform-max buffer) when `setbackProfile.sideIsAveragingGoverned` - a
 * "conservative fixed-5-foot approximation," the true achievable envelope may be understated,
 * never overstated.
 */
export async function computeSetbackConstrainedArea(
  db: Db,
  boundaryPolygon: Polygon,
  lotLineRoles: { status: "ESTABLISHED" | "INSUFFICIENT"; roles?: { frontEdgeRef: string; rearEdgeRef: string; sideEdgeRefs: string[] } },
  setbackProfile: SetbackProfile | undefined
): Promise<SetbackConstrainedAreaGeometryResult> {
  if (setbackProfile === undefined) {
    return { status: "NO_ACTIVE_COVERAGE" };
  }
  if (lotLineRoles.status !== "ESTABLISHED" || !lotLineRoles.roles) {
    return {
      status: "REQUIRES_VERIFICATION",
      reason: "Lot-line roles (front/rear/side) are not established for this parcel - required to compute a setback-constrained buildable area.",
    };
  }
  assertAuthoritativeSrid(boundaryPolygon);

  const wkt = polygonToWkt(boundaryPolygon);
  const srid = boundaryPolygon.srid!;

  // DATA_QUALITY_UNRESOLVED, not a thrown COMPUTATION_FAILURE (NFR-U5-11) - PostGIS successfully
  // evaluates the input and determines it is invalid/unusable; returned normally.
  if (!(await checkIsValidWkt(db, wkt, srid, "parcel boundary"))) {
    return { status: "REQUIRES_VERIFICATION", reason: "The parcel boundary geometry is invalid (ST_IsValid) and cannot support a buildable-envelope computation." };
  }

  const { frontEdgeRef, rearEdgeRef, sideEdgeRefs } = lotLineRoles.roles;
  const edgeSetbacks: { edgeWkt: string; setbackFt: number }[] = [
    { edgeWkt: edgeToWkt(boundaryPolygon, frontEdgeRef), setbackFt: setbackProfile.frontFt },
    { edgeWkt: edgeToWkt(boundaryPolygon, rearEdgeRef), setbackFt: setbackProfile.rearFt },
    ...sideEdgeRefs.map((ref) => ({ edgeWkt: edgeToWkt(boundaryPolygon, ref), setbackFt: setbackProfile.sideIsAveragingGoverned ? 5 : setbackProfile.sideFt })),
  ];

  // Real, role-aware differential subtraction: each edge's own required setback buffers ONLY that
  // edge's LINESTRING, subtracted from the running geometry in sequence - never a single uniform
  // inward offset applied to every edge alike.
  let geomExpr: SQL = sql`ST_SetSRID(ST_GeomFromText(${wkt}), ${srid})`;
  for (const { edgeWkt, setbackFt } of edgeSetbacks) {
    geomExpr = sql`ST_Difference(${geomExpr}, ST_Buffer(ST_SetSRID(ST_GeomFromText(${edgeWkt}), ${srid}), ${setbackFt}, 'endcap=flat join=round'))`;
  }

  let row: { geojson: string | null; area_sq_ft: number | string } | undefined;
  try {
    const result = await db.execute(sql`SELECT ST_AsGeoJSON(subtracted.geom) AS geojson, ST_Area(subtracted.geom) AS area_sq_ft FROM (SELECT (${geomExpr}) AS geom) subtracted`);
    row = result.rows[0] as typeof row;
  } catch (err) {
    throw new SpatialComputationError(`PostGIS setback-constrained-area computation failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (!row) throw new SpatialComputationError("Per-edge setback subtraction returned no rows.");

  const geojson = row.geojson ? (JSON.parse(row.geojson) as { type: string; coordinates?: unknown }) : null;
  const polygon = geoJsonToGeometry(geojson, srid);
  const areaSqFt = Number(row.area_sq_ft);

  // Empty geometry (the setback envelope fully consumes the parcel) is a genuine zero-area
  // SUCCESS, explicitly distinct from a failure or an unresolved-evidence result.
  return { status: "ESTABLISHED", areaSqFt, polygon, isConservativeSideSetbackApproximation: setbackProfile.sideIsAveragingGoverned };
}

export type EcaExclusionGeometryResult =
  | { status: "NOT_APPLICABLE" }
  | { status: "REQUIRES_VERIFICATION"; reason: string }
  | { status: "KNOWN"; excludedAreaSqFt: number; excludedGeometry: Geometry; provenance: string };

/**
 * Unit 5 - measures the actual ECA (critical-area) exclusion geometry intersecting the parcel, via
 * PostGIS (ST_Intersection), returning real geometry alongside the area (Final Correction - an
 * area scalar alone can never produce `buildablePolygon`). No production ECA-area-of-overlap data
 * source is integrated in this unit - `knownEcaGeometry` is the caller-supplied, already-retrieved
 * ECA geometry (undefined for the overwhelming majority of real evaluations today).
 *
 * The supplied ECA geometry is itself `ST_IsValid`-checked (Code Generation review Correction 5G -
 * every new geometry input, not only the parcel boundary) - an invalid supplied geometry is
 * DATA_QUALITY_UNRESOLVED, returned normally, never thrown.
 */
export async function computeEcaExclusionGeometry(db: Db, boundaryPolygon: Polygon, knownEcaGeometry: Polygon | undefined): Promise<EcaExclusionGeometryResult> {
  if (knownEcaGeometry === undefined) {
    return {
      status: "REQUIRES_VERIFICATION",
      reason: "No ECA (critical-area) geometry is available for this parcel - no production area-of-overlap capability is integrated in this unit.",
    };
  }
  assertAuthoritativeSrid(boundaryPolygon);
  assertAuthoritativeSrid(knownEcaGeometry);

  const boundaryWkt = polygonToWkt(boundaryPolygon);
  const ecaWkt = polygonToWkt(knownEcaGeometry);
  const srid = boundaryPolygon.srid!;

  if (!(await checkIsValidWkt(db, ecaWkt, srid, "supplied ECA geometry"))) {
    return { status: "REQUIRES_VERIFICATION", reason: "The supplied ECA (critical-area) geometry is invalid (ST_IsValid) and cannot be used to compute an exclusion." };
  }

  let row: { geojson: string | null; area_sq_ft: number | string } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        ST_AsGeoJSON(intersected.geom) AS geojson,
        ST_Area(intersected.geom) AS area_sq_ft
      FROM (
        SELECT ST_Intersection(
          ST_SetSRID(ST_GeomFromText(${boundaryWkt}), ${srid}),
          ST_SetSRID(ST_GeomFromText(${ecaWkt}), ${srid})
        ) AS geom
      ) intersected
    `);
    row = result.rows[0] as typeof row;
  } catch (err) {
    throw new SpatialComputationError(`PostGIS ECA-exclusion-geometry computation failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (!row) throw new SpatialComputationError("ST_Intersection for ECA exclusion geometry returned no rows.");

  const areaSqFt = Number(row.area_sq_ft);
  const geojson = row.geojson ? (JSON.parse(row.geojson) as { type: string; coordinates?: unknown }) : null;
  const excludedGeometry = geoJsonToGeometry(geojson, srid);
  if (areaSqFt === 0 || isEmptyGeometry(excludedGeometry)) {
    return { status: "NOT_APPLICABLE" };
  }

  return { status: "KNOWN", excludedAreaSqFt: areaSqFt, excludedGeometry, provenance: "PostGIS ST_Intersection of parcel boundary and supplied ECA geometry" };
}

/**
 * Unit 5 - the final candidate buildable area/polygon, combining a resolved
 * setback-constrained area with a resolved ECA exclusion via PostGIS ST_Difference - NEVER by
 * subtracting area scalars in application code (Final Correction's own binding invariant, NFR-
 * U5-16). Callers must have already confirmed both inputs are resolved (ESTABLISHED/
 * NOT_APPLICABLE-or-KNOWN) before calling this - it does not itself re-check evidence status.
 * Handles a genuinely `EmptyGeometry` setback-constrained input safely (Correction 5F) and
 * preserves holes/multi-part results end to end (Correction 5E).
 */
export async function computeBuildableEnvelope(db: Db, setbackConstrainedGeometry: Geometry, ecaExclusionGeometry: Geometry | undefined): Promise<{ areaSqFt: number; polygon: Geometry }> {
  assertAuthoritativeGeometrySrid(setbackConstrainedGeometry, "setback-constrained geometry");
  const srid = geometrySrid(setbackConstrainedGeometry)!;

  if (isEmptyGeometry(setbackConstrainedGeometry)) {
    // A genuine zero-area SUCCESS - no PostGIS call needed, and none of the subsequent WKT
    // construction (which assumes a real ring) is ever exercised for this case.
    return { areaSqFt: 0, polygon: setbackConstrainedGeometry };
  }

  if (ecaExclusionGeometry === undefined || isEmptyGeometry(ecaExclusionGeometry)) {
    const wkt = geometryToWkt(setbackConstrainedGeometry);
    let row: { area_sq_ft: number | string } | undefined;
    try {
      const result = await db.execute(sql`SELECT ST_Area(ST_SetSRID(ST_GeomFromText(${wkt}), ${srid})) AS area_sq_ft`);
      row = result.rows[0] as typeof row;
    } catch (err) {
      throw new SpatialComputationError(`PostGIS buildable-envelope area computation failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    if (!row) throw new SpatialComputationError("ST_Area for the buildable envelope returned no rows.");
    return { areaSqFt: Number(row.area_sq_ft), polygon: setbackConstrainedGeometry };
  }

  const setbackWkt = geometryToWkt(setbackConstrainedGeometry);
  const ecaWkt = geometryToWkt(ecaExclusionGeometry);
  let row: { geojson: string | null; area_sq_ft: number | string } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        ST_AsGeoJSON(diffed.geom) AS geojson,
        ST_Area(diffed.geom) AS area_sq_ft
      FROM (
        SELECT ST_Difference(
          ST_SetSRID(ST_GeomFromText(${setbackWkt}), ${srid}),
          ST_SetSRID(ST_GeomFromText(${ecaWkt}), ${srid})
        ) AS geom
      ) diffed
    `);
    row = result.rows[0] as typeof row;
  } catch (err) {
    throw new SpatialComputationError(`PostGIS buildable-envelope ST_Difference failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (!row) throw new SpatialComputationError("ST_Difference for the buildable envelope returned no rows.");

  const geojson = row.geojson ? (JSON.parse(row.geojson) as { type: string; coordinates?: unknown }) : null;
  const polygon = geoJsonToGeometry(geojson, srid);
  return { areaSqFt: Number(row.area_sq_ft), polygon };
}

/** Verifies the PostGIS extension is actually enabled - used by the integration test and
 * optionally by a startup check. Not called from any request-serving path. */
export async function checkPostgisEnabled(db: Db): Promise<string> {
  const result = await db.execute(sql`SELECT PostGIS_Version() AS version`);
  const row = result.rows[0] as { version: string } | undefined;
  if (!row) throw new Error("PostGIS_Version() returned no rows - is the extension enabled?");
  return row.version;
}
