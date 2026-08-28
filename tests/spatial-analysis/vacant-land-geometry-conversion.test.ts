/**
 * Deterministic (no DB, no PostGIS) tests for postgis-adapter.ts's pure GeoJSON<->Geometry/WKT
 * conversion helpers - Code Generation review Correction 5E/5F. Proves the actual bug classes the
 * founder found (an empty result crashing polygonToWkt, holes silently dropped) are fixed at the
 * conversion-function level, independent of a live database.
 */
import { describe, expect, it } from "vitest";
import { geoJsonToGeometry, geometryToWkt } from "../../src/spatial-analysis/postgis-adapter.js";
import { isEmptyGeometry, isMultiPolygon, isPolygon } from "../../src/spatial-analysis/types.js";

const SRID = 2926;

describe("geoJsonToGeometry - empty geometry (Correction 5F)", () => {
  it("a GeometryCollection EMPTY result becomes a real EmptyGeometry, never undefined or a zero-point Polygon", () => {
    const geom = geoJsonToGeometry({ type: "GeometryCollection", coordinates: [] }, SRID);
    expect(isEmptyGeometry(geom)).toBe(true);
  });

  it("a null geojson result becomes EmptyGeometry", () => {
    const geom = geoJsonToGeometry(null, SRID);
    expect(isEmptyGeometry(geom)).toBe(true);
  });

  it("a Polygon with an empty coordinates array becomes EmptyGeometry, not a zero-point Polygon", () => {
    const geom = geoJsonToGeometry({ type: "Polygon", coordinates: [] }, SRID);
    expect(isEmptyGeometry(geom)).toBe(true);
  });
});

describe("geometryToWkt - empty geometry never crashes (Correction 5F)", () => {
  it("[hard invariant] EmptyGeometry converts to valid WKT ('POLYGON EMPTY'), never throws on an assumed first point", () => {
    const empty = geoJsonToGeometry(null, SRID);
    expect(() => geometryToWkt(empty)).not.toThrow();
    expect(geometryToWkt(empty)).toBe("POLYGON EMPTY");
  });
});

describe("geoJsonToGeometry - interior rings/holes are preserved (Correction 5E)", () => {
  it("a Polygon GeoJSON result with a hole preserves the hole, not just the exterior ring", () => {
    const outer: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 0],
    ];
    const hole: [number, number][] = [
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
      [40, 40],
    ];
    const geom = geoJsonToGeometry({ type: "Polygon", coordinates: [outer, hole] }, SRID);
    expect(isPolygon(geom)).toBe(true);
    if (isPolygon(geom)) {
      expect(geom.points).toHaveLength(4); // closing point dropped
      expect(geom.holes).toBeDefined();
      expect(geom.holes).toHaveLength(1);
      expect(geom.holes![0]).toHaveLength(4);
    }
  });

  it("a Polygon with no holes leaves `holes` undefined, not an empty array (matches this codebase's existing optional-field convention)", () => {
    const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const geom = geoJsonToGeometry({ type: "Polygon", coordinates: [outer] }, SRID);
    expect(isPolygon(geom)).toBe(true);
    if (isPolygon(geom)) expect(geom.holes).toBeUndefined();
  });

  it("geometryToWkt round-trips a hole into valid multi-ring WKT", () => {
    const outer: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 0],
    ];
    const hole: [number, number][] = [
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
      [40, 40],
    ];
    const geom = geoJsonToGeometry({ type: "Polygon", coordinates: [outer, hole] }, SRID);
    const wkt = geometryToWkt(geom);
    expect(wkt).toMatch(/^POLYGON\(\(.*\), \(.*\)\)$/);
  });
});

describe("geoJsonToGeometry - MultiPolygon results preserve multiple disjoint pieces (NFR-U5-13)", () => {
  it("a MultiPolygon GeoJSON result with 2 disjoint polygons round-trips as a real MultiPolygon", () => {
    const poly1: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const poly2: [number, number][] = [
      [20, 20],
      [30, 20],
      [30, 30],
      [20, 30],
      [20, 20],
    ];
    const geom = geoJsonToGeometry({ type: "MultiPolygon", coordinates: [[poly1], [poly2]] }, SRID);
    expect(isMultiPolygon(geom)).toBe(true);
    if (isMultiPolygon(geom)) expect(geom.polygons).toHaveLength(2);
  });

  it("a MultiPolygon GeoJSON result with only 1 real polygon collapses to a plain Polygon (matches the existing single-part-vs-multi-part convention)", () => {
    const poly1: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const geom = geoJsonToGeometry({ type: "MultiPolygon", coordinates: [[poly1]] }, SRID);
    expect(isPolygon(geom)).toBe(true);
  });
});
