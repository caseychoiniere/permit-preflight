import { describe, expect, it } from "vitest";
import { distanceToEdge, lotCoveragePercentage, polygonArea, rectangle } from "../../src/spatial-analysis/geometry.js";

/**
 * NFR-4 addendum (approved 2026-08-19): "supplement the real Unit 0B fixtures with a small
 * number of simple controlled geometries whose correct answers are analytically known ... to
 * catch CRS/unit/input-handling errors." These are exactly that - hand-computable geometries,
 * not the real Unit 0B parcel data (which is used in the parcel-resolution/regulatory-rules-engine
 * suites instead).
 */
describe("Spatial geometry - analytically-known controlled cases", () => {
  it("computes the area of a simple 100ft x 50ft rectangle exactly", () => {
    const parcel = rectangle(0, 0, 100, 50);
    expect(polygonArea(parcel)).toBe(5000);
  });

  it("computes lot coverage percentage exactly for a known structure-to-parcel ratio", () => {
    const parcel = rectangle(0, 0, 100, 100); // 10,000 sqft
    const structure = rectangle(10, 10, 20, 20); // 400 sqft = 4%
    expect(lotCoveragePercentage(parcel, [structure])).toBe(4);
  });

  it("computes distance to a known horizontal edge exactly", () => {
    // Point at (5, 10); edge along y=0 from (0,0) to (100,0). Perpendicular distance = 10.
    const distance = distanceToEdge({ x: 5, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(distance).toBe(10);
  });

  it("computes distance to a known vertical edge exactly", () => {
    // Point at (5, 5); edge along x=0 from (0,0) to (0,100). Perpendicular distance = 5.
    const distance = distanceToEdge({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 100 });
    expect(distance).toBe(5);
  });

  it("computes distance to the nearest point on a segment when the perpendicular falls outside it", () => {
    // Point at (150, 0); segment from (0,0) to (100,0) - nearest point is the endpoint (100,0).
    const distance = distanceToEdge({ x: 150, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(distance).toBe(50);
  });
});
