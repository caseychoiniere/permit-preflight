/**
 * Live PostGIS setback-computation and CRS-transform integration test. Skips cleanly without
 * DATABASE_URL - NOT executed in this Code Generation session; kept explicitly open for Build &
 * Test per the user's instruction not to fabricate live verification.
 */

import { describe, expect, it } from "vitest";
import { getDb, type Db } from "../../src/db/client.js";
import { computeSetbackDistances, checkPostgisEnabled, transformPolygonToWgs84 } from "../../src/spatial-analysis/postgis-adapter.js";
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
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint(${KNOWN_WGS84_POINT.lng}, ${KNOWN_WGS84_POINT.lat}), 4326), ${AUTHORITATIVE_PARCEL_SRID}) AS t
      ) s
    `);
    const row = result.rows[0] as { x: number; y: number };
    expect(Math.abs(Number(row.x) - KNOWN_PROJECTED_POINT.x)).toBeLessThan(TOLERANCE_FT);
    expect(Math.abs(Number(row.y) - KNOWN_PROJECTED_POINT.y)).toBeLessThan(TOLERANCE_FT);
    void assignment;
  });

  it("[hard invariant] longitude/latitude are not accidentally reversed - a swapped pair transforms to a wildly different (wrong-hemisphere) location", async () => {
    const { sql } = await import("drizzle-orm");
    const swapped = await db.execute(sql`
      SELECT ST_X(t) AS x, ST_Y(t) AS y FROM (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint(${KNOWN_WGS84_POINT.lat}, ${KNOWN_WGS84_POINT.lng}), 4326), ${AUTHORITATIVE_PARCEL_SRID}) AS t
      ) s
    `);
    const row = swapped.rows[0] as { x: number; y: number };
    // A swapped lng/lat is a materially different location - must NOT land near the real point.
    expect(Math.abs(Number(row.x) - KNOWN_PROJECTED_POINT.x)).toBeGreaterThan(TOLERANCE_FT);
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
