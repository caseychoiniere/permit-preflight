/**
 * Pure planar geometry functions - the deterministic reference implementation used by the
 * fixture-based test suite (NFR-4 addendum: "simple controlled geometries whose correct
 * answers are analytically known ... to catch CRS/unit/input-handling errors").
 *
 * In production, PostGIS (ST_Distance, ST_Area, etc.) is the authoritative spatial engine
 * (Application Design; requirements.md SS4.3) - these functions are not a replacement for that,
 * they are what Unit 1's deterministic tests check against, since a live PostGIS instance isn't
 * available in every test run (Infrastructure Design's execution-environment split). The
 * (not-run-here) integration suite is expected to assert these two computation paths agree.
 *
 * All coordinates are assumed to already be in a planar, projected, foot-based coordinate
 * system - never raw lat/lon. Converting from a geographic CRS is the adapter's responsibility,
 * not this module's.
 */

import type { Point, Polygon } from "./types.js";

export function polygonArea(polygon: Polygon): number {
  const { points } = polygon;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

/** Shortest distance from `point` to the polygon's boundary (its nearest edge). */
export function distanceToPolygonBoundary(point: Point, polygon: Polygon): number {
  const { points } = polygon;
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    min = Math.min(min, distancePointToSegment(point, a, b));
  }
  return min;
}

/** Distance from `point` to the nearest edge of `polygon` in a specific direction (e.g. "rear",
 * "side", "front") is a project-configuration concern (which edge is "rear" depends on the lot's
 * orientation, decided by Screening Request in a later unit) - this function operates on a
 * specific, already-identified edge, not the whole polygon, once that edge is known. */
export function distanceToEdge(point: Point, edgeStart: Point, edgeEnd: Point): number {
  return distancePointToSegment(point, edgeStart, edgeEnd);
}

function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(p, a);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const projection: Point = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, projection);
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Lot-coverage percentage: sum of structure footprint areas / parcel area * 100. */
export function lotCoveragePercentage(parcel: Polygon, structures: Polygon[]): number {
  const parcelArea = polygonArea(parcel);
  if (parcelArea === 0) return 0;
  const structureArea = structures.reduce((sum, s) => sum + polygonArea(s), 0);
  return (structureArea / parcelArea) * 100;
}

/** Axis-aligned bounding-box style rectangle helper for fixture construction (analytically-known
 * geometries per the NFR addendum - e.g., a simple square parcel with a known area). */
export function rectangle(originX: number, originY: number, width: number, height: number): Polygon {
  return {
    units: "FEET",
    points: [
      { x: originX, y: originY },
      { x: originX + width, y: originY },
      { x: originX + width, y: originY + height },
      { x: originX, y: originY + height },
    ],
  };
}
