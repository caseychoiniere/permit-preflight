/**
 * Live PostGIS setback-computation and CRS-transform integration test. Skips cleanly without
 * DATABASE_URL - NOT executed in this Code Generation session; kept explicitly open for Build &
 * Test per the user's instruction not to fabricate live verification.
 */

import { describe, expect, it } from "vitest";
import { getDb, type Db } from "../../src/db/client.js";
import { computeDistanceToDwelling, computeSetbackDistances, checkPostgisEnabled, transformPolygonToWgs84 } from "../../src/spatial-analysis/postgis-adapter.js";
import { deriveLotLineRoleAssignment } from "../../src/spatial-analysis/lot-line-roles.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../../src/property-intelligence/king-county-parcel-geometry.js";
import type { Polygon } from "../../src/spatial-analysis/types.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

const boundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [{ x: 1274000, y: 240900 }, { x: 1274050, y: 240900 }, { x: 1274050, y: 241000 }, { x: 1274000, y: 241000 }],
};

/**
 * Real coordinate pair for the same physical vertex, independently obtained from King County's
 * own ArcGIS server in two different spatial references (outSR=2926 and outSR=4326) during Code
 * Generation - not invented. Used to cross-check PostGIS's ST_Transform against Esri's own
 * reprojection of the identical real-world point (3216 Fuhrman Ave E's parcel, PIN 1959703080).
 */
const KNOWN_WGS84_POINT = { lng: -122.319872934, lat: 47.650800805 };
const KNOWN_PROJECTED_POINT = { x: 1274044.7379, y: 240930.785 }; // King County's own outSR=2926 reprojection of the same point.
const TOLERANCE_FT = 5; // generous - cross-checking two different reprojection implementations, not asserting bit-for-bit equality.

/** Drizzle's neon-http driver wraps a real Postgres error as `Failed query: ...` with the actual
 * underlying error (e.g. NeonDbError "transform: Invalid coordinate") on `.cause`, not in the
 * outer message - joins every message in the cause chain so a test can match against the real
 * underlying error without swallowing an unrelated one. */
function causeChainMessages(err: unknown): string {
  const messages: string[] = [];
  let current: unknown = err;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" | ");
}

describe.skipIf(!hasDb)("PostGIS CRS transform and setback computation - live integration", () => {
  let db: Db;

  it("PostGIS_Version() succeeds", async () => {
    db = getDb();
    const version = await checkPostgisEnabled(db);
    expect(version.length).toBeGreaterThan(0);
  });

  it("[hard invariant] a known WGS84 point transforms to the expected projected location, within an independently-established tolerance", async () => {
    const testBoundary: Polygon = { units: "FEET", srid: AUTHORITATIVE_PARCEL_SRID, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] };
    const assignment = deriveLotLineRoleAssignment(testBoundary, "edge-0", "edge-2");
    // Use computeSetbackDistances' internal transform indirectly is awkward for a single-point
    // check - instead assert via a minimal direct query mirroring the adapter's own transform SQL.
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql`
      SELECT ST_X(t) AS x, ST_Y(t) AS y FROM (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint(${KNOWN_WGS84_POINT.lng}, ${KNOWN_WGS84_POINT.lat}), 4326), ${AUTHORITATIVE_PARCEL_SRID}::int) AS t
      ) s
    `);
    const row = result.rows[0] as { x: number; y: number };
    expect(Math.abs(Number(row.x) - KNOWN_PROJECTED_POINT.x)).toBeLessThan(TOLERANCE_FT);
    expect(Math.abs(Number(row.y) - KNOWN_PROJECTED_POINT.y)).toBeLessThan(TOLERANCE_FT);
    void assignment;
  });

  it("[hard invariant] longitude/latitude are not accidentally reversed - a swapped pair either lands far from the real point or PostGIS rejects it as an invalid coordinate", async () => {
    const { sql } = await import("drizzle-orm");
    // Corrected 2026-08-27 (first live run against real PostGIS/PROJ - this suite could not run
    // before a real DATABASE_URL existed). For THIS real Seattle point, the swapped pair
    // (x=lat=47.65, y=lng=-122.32) is not merely "a different but still-valid location" - y is
    // outside a valid latitude's [-90, 90] range, so PostGIS/PROJ correctly REJECTS it as an
    // invalid coordinate (NeonDbError "transform: Invalid coordinate") rather than silently
    // transforming it. That rejection is exactly as strong a proof lng/lat are not silently
    // swapped as landing far away would be - asserting only the "lands far away" branch was this
    // test's own incorrect assumption about what a swap always produces, never previously
    // exercised live. Both outcomes are accepted; a query that succeeds AND lands near the real
    // point still correctly fails this test either way.
    try {
      const swapped = await db.execute(sql`
        SELECT ST_X(t) AS x, ST_Y(t) AS y FROM (
          SELECT ST_Transform(ST_SetSRID(ST_MakePoint(${KNOWN_WGS84_POINT.lat}, ${KNOWN_WGS84_POINT.lng}), 4326), ${AUTHORITATIVE_PARCEL_SRID}::int) AS t
        ) s
      `);
      const row = swapped.rows[0] as { x: number; y: number };
      expect(Math.abs(Number(row.x) - KNOWN_PROJECTED_POINT.x)).toBeGreaterThan(TOLERANCE_FT);
    } catch (err) {
      // Corrected: Drizzle's neon-http driver wraps the real Postgres error as `Failed query: ...`
      // with the actual NeonDbError ("transform: Invalid coordinate") on `.cause`, not in the
      // outer message - String(err) alone never contains "invalid coordinate". Walk the cause
      // chain so this stays narrowly matched (an unrelated real regression, e.g. the SRID
      // text/integer overload bug this same file's other tests guard against, is never silently
      // swallowed here).
      expect(causeChainMessages(err)).toMatch(/invalid coordinate/i);
    }
  });

  it("computes real setback distances for a known synthetic footprint placement, with the parcel and footprint reaching PostGIS in the same CRS", async () => {
    const assignment = deriveLotLineRoleAssignment(boundary, "edge-0", "edge-2");
    expect(assignment.status).toBe("ASSIGNED");

    // Real WGS84 point that PostGIS will transform into the projected CRS before any distance
    // math runs - proves the anchor and boundary reach the distance calculation in the same CRS
    // (if they didn't, the resulting distances would be wildly wrong, not just imprecise).
    const { distances, footprintProjected } = await computeSetbackDistances(db, boundary, { anchor: KNOWN_WGS84_POINT, orientationDeg: 0 }, { widthFt: 8, depthFt: 10 }, assignment);

    expect(distances.distanceToFrontLotLineFt).toBeGreaterThanOrEqual(0);
    expect(distances.distanceToRearLotLineFt).toBeGreaterThanOrEqual(0);
    // The anchor's real-world location is nowhere near this synthetic boundary's coordinate
    // range, so both distances should be large and clearly not near-zero/NaN - a sanity check
    // that the pipeline produced a real number, not a silent failure.
    expect(Number.isFinite(distances.distanceToFrontLotLineFt)).toBe(true);
    expect(footprintProjected?.srid).toBe(AUTHORITATIVE_PARCEL_SRID);
  });

  it("[hard invariant] INSUFFICIENT lot-line assignment yields no computed distances - never a guess", async () => {
    const result = await computeSetbackDistances(
      db,
      boundary,
      { anchor: KNOWN_WGS84_POINT, orientationDeg: 0 },
      { widthFt: 8, depthFt: 10 },
      { status: "INSUFFICIENT", method: "USER_INDICATED" }
    );
    expect(result).toEqual({ distances: {} });
  });

  it("[hard invariant] a boundary polygon with a missing or incorrect SRID fails closed rather than silently calculating", async () => {
    const untaggedBoundary: Polygon = { units: "FEET", points: boundary.points }; // no srid
    const assignment = deriveLotLineRoleAssignment(boundary, "edge-0", "edge-2");
    await expect(
      computeSetbackDistances(db, untaggedBoundary, { anchor: KNOWN_WGS84_POINT, orientationDeg: 0 }, { widthFt: 8, depthFt: 10 }, assignment)
    ).rejects.toThrow(/srid/i);

    const wronglyTaggedBoundary: Polygon = { ...boundary, srid: 4326 }; // wrong SRID (WGS84, not the projected feet CRS)
    await expect(
      computeSetbackDistances(db, wronglyTaggedBoundary, { anchor: KNOWN_WGS84_POINT, orientationDeg: 0 }, { widthFt: 8, depthFt: 10 }, assignment)
    ).rejects.toThrow(/srid/i);
  });

  it("computeDistanceToDwelling (building intelligence v1) computes a real polygon-to-polygon minimum distance via ST_Distance, never centroid distance", async () => {
    // Two disjoint 10x10 squares, 20 ft apart edge-to-edge along x (dwelling spans x=[100,110],
    // shed spans x=[0,10]) - the true minimum polygon-to-polygon distance is exactly 90 ft
    // (110->? no: gap between x=10 and x=100 is 90). A centroid-distance implementation would
    // instead report the distance between (5,5) and (105,5) = 100 ft - the two values are
    // distinguishable, proving this is genuinely edge-to-edge, not centroid-to-centroid.
    const shedFootprint: Polygon = { units: "FEET", srid: AUTHORITATIVE_PARCEL_SRID, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const dwellingFootprint: Polygon = { units: "FEET", srid: AUTHORITATIVE_PARCEL_SRID, points: [{ x: 100, y: 0 }, { x: 110, y: 0 }, { x: 110, y: 10 }, { x: 100, y: 10 }] };
    const distance = await computeDistanceToDwelling(db, shedFootprint, dwellingFootprint);
    expect(distance).toBeCloseTo(90, 6);
  });

  it("[hard invariant] computeDistanceToDwelling returns 0 for overlapping footprints, never a negative or fabricated positive value", async () => {
    const shedFootprint: Polygon = { units: "FEET", srid: AUTHORITATIVE_PARCEL_SRID, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const overlapping: Polygon = { units: "FEET", srid: AUTHORITATIVE_PARCEL_SRID, points: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }] };
    const distance = await computeDistanceToDwelling(db, shedFootprint, overlapping);
    expect(distance).toBe(0);
  });

  it("transformPolygonToWgs84 produces a display polygon with the same point count as the source, and real geographic coordinates", async () => {
    const wgs84 = await transformPolygonToWgs84(db, boundary);
    expect(wgs84).toHaveLength(boundary.points.length);
    for (const point of wgs84) {
      expect(point.lng).toBeGreaterThanOrEqual(-180);
      expect(point.lng).toBeLessThanOrEqual(180);
      expect(point.lat).toBeGreaterThanOrEqual(-90);
      expect(point.lat).toBeLessThanOrEqual(90);
    }
  });
});

describe.skipIf(hasDb)("PostGIS CRS transform and setback computation - live integration (skipped)", () => {
  it("documents why this suite did not run - kept explicitly open for Build & Test, not fabricated", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
  });
});
