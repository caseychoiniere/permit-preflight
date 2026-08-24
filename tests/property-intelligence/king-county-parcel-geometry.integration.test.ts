/**
 * Live King County parcel-polygon integration test - real network call, no credentials required
 * (public endpoint). Uses the same real, Unit 0B-validated parcel (3216 Fuhrman Ave E, PIN
 * 1959703080) already exercised by tests/parcel-resolution/king-county.integration.test.ts.
 */

import { describe, expect, it } from "vitest";
import { fetchParcelBoundaryPolygon } from "../../src/property-intelligence/king-county-parcel-geometry.js";

const KNOWN_REAL_PARCEL_ID = "1959703080";

describe("King County parcel-polygon live integration", () => {
  it("fetches a real parcel boundary polygon with at least 3 points", async () => {
    const polygon = await fetchParcelBoundaryPolygon(KNOWN_REAL_PARCEL_ID);
    expect(polygon.units).toBe("FEET");
    expect(polygon.points.length).toBeGreaterThanOrEqual(3);
    for (const point of polygon.points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it("[hard invariant] a nonexistent PIN throws rather than returning a fabricated polygon", async () => {
    await expect(fetchParcelBoundaryPolygon("0000000000")).rejects.toThrow();
  });
});
