/**
 * Deterministic (no DB) tests for the PostGIS adapter's fail-closed SRID guards. Both
 * `computeSetbackDistances` and `transformPolygonToWgs84` validate the boundary polygon's `srid`
 * BEFORE issuing any database query - testable here without a live PostGIS connection.
 */

import { describe, expect, it } from "vitest";
import { computeDistanceToDwelling, computeParcelAreaSqFt, computeSetbackDistances, transformPolygonToWgs84 } from "../../src/spatial-analysis/postgis-adapter.js";
import { deriveLotLineRoleAssignment } from "../../src/spatial-analysis/lot-line-roles.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../../src/property-intelligence/king-county-parcel-geometry.js";
import type { Db } from "../../src/db/client.js";
import type { Polygon } from "../../src/spatial-analysis/types.js";

/** Never invoked - both functions under test throw before touching `db` when the SRID guard
 * fails, so a dummy object safely proves the fail-closed behavior without a real connection. */
const neverUsedDb = {} as Db;

const authoritativeBoundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }],
};
const assignment = deriveLotLineRoleAssignment(authoritativeBoundary, "edge-0", "edge-2");

describe("PostGIS adapter - fail-closed SRID guard (deterministic, no DB)", () => {
  it("[hard invariant] computeSetbackDistances rejects a boundary polygon with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(
      computeSetbackDistances(neverUsedDb, untagged, { anchor: { lng: -122.3, lat: 47.6 }, orientationDeg: 0 }, { widthFt: 8, depthFt: 10 }, assignment)
    ).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeSetbackDistances rejects a boundary polygon tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 4326 };
    await expect(
      computeSetbackDistances(neverUsedDb, wrongSrid, { anchor: { lng: -122.3, lat: 47.6 }, orientationDeg: 0 }, { widthFt: 8, depthFt: 10 }, assignment)
    ).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] transformPolygonToWgs84 rejects a boundary polygon with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(transformPolygonToWgs84(neverUsedDb, untagged)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] transformPolygonToWgs84 rejects a boundary polygon tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 3857 };
    await expect(transformPolygonToWgs84(neverUsedDb, wrongSrid)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeParcelAreaSqFt (Unit 4) rejects a boundary polygon with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(computeParcelAreaSqFt(neverUsedDb, untagged)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeParcelAreaSqFt (Unit 4) rejects a boundary polygon tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 4326 };
    await expect(computeParcelAreaSqFt(neverUsedDb, wrongSrid)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeDistanceToDwelling (building intelligence v1) rejects a shed footprint with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(computeDistanceToDwelling(neverUsedDb, untagged, authoritativeBoundary)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeDistanceToDwelling (building intelligence v1) rejects a dwelling footprint tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 4326 };
    await expect(computeDistanceToDwelling(neverUsedDb, authoritativeBoundary, wrongSrid)).rejects.toThrow(/srid/i);
  });

  it("INSUFFICIENT lot-line assignment short-circuits before any SRID-dependent computation, returning an empty result", async () => {
    // Even with a correctly-tagged boundary, INSUFFICIENT never computes distances (BR-U2-9) -
    // this also never touches `db`, since it returns before the transform step.
    const result = await computeSetbackDistances(
      neverUsedDb,
      authoritativeBoundary,
      { anchor: { lng: -122.3, lat: 47.6 }, orientationDeg: 0 },
      { widthFt: 8, depthFt: 10 },
      { status: "INSUFFICIENT", method: "USER_INDICATED" }
    );
    expect(result).toEqual({ distances: {} });
  });
});
