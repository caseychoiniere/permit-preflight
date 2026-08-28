/**
 * Spatial Analysis domain types (domain-entities.md "Spatial Analysis Domain").
 * CriticalAreaFinding represents a spatial/map FACT ONLY - never a regulatory conclusion
 * (Functional Design correction 3). The Regulatory Rules Engine (BR-4a) is the only place a
 * regulatory implication is derived from it.
 */

import type { AvailabilityState, Provenance } from "../property-intelligence/types.js";

export interface Point {
  x: number;
  y: number;
}

/**
 * Closed polygon: first and last point are implicitly connected. Coordinates are in a planar,
 * projected coordinate system (e.g., State Plane feet) - never raw lat/lon, which would make
 * distance/area math wrong (exactly the "CRS/unit-handling error" the NFR addendum targets).
 *
 * `srid` (added 2026-08-23, Code Generation CRS correction): explicit for any Polygon that
 * originates from an external source and must be verified before use in a spatial computation
 * (currently: King County's parcel boundary, always requested and tagged as EPSG:2926 - Washington
 * State Plane North, US feet). Undefined means "already-local/planar by construction" - Unit 1's
 * pure geometry.ts test fixtures and rectangle() helper never set it, since they were never
 * sourced from an external CRS in the first place. A Polygon consumed by PostGIS computation MUST
 * have its srid checked (spatial-analysis/postgis-adapter.ts fails closed if it's missing or
 * doesn't match the expected value - never silently assumed).
 */
export interface Polygon {
  points: Point[];
  /** Unit 5 (Code Generation correction) - interior rings (holes), same closed-ring convention as
   * `points` (first/last implicitly connected). A real ST_Difference result can legitimately have
   * a hole (e.g. an ECA exclusion fully interior to the setback-constrained area) - this must be
   * representable rather than silently dropped. Undefined/empty means "no holes", the ordinary
   * case for every polygon this project produced before Unit 5. */
  holes?: Point[][];
  units: "FEET";
  srid?: number;
}

/** Unit 5 addition - a setback subtraction can legitimately split a parcel's remaining buildable
 * area into disjoint pieces (NFR-U5-13); this project's PostGIS geometry results must be able to
 * represent that honestly rather than being narrowed to `Polygon`-only downstream. Each element of
 * `polygons` is itself a single closed ring (with its own optional `holes`), same convention as
 * `Polygon.points`. */
export interface MultiPolygon {
  polygons: Polygon[];
  units: "FEET";
  srid?: number;
}

/** Unit 5 (Code Generation correction) - a genuine zero-area PostGIS result (e.g. a setback
 * envelope that fully consumes the parcel) is a real, valid SUCCESS outcome, not representable as
 * `Polygon { points: [] }` (which downstream WKT construction cannot safely handle - it assumes a
 * first point exists). This is the explicit, safe representation for that case. */
export interface EmptyGeometry {
  kind: "EMPTY";
  units: "FEET";
  srid?: number;
}

/** The full result shape any Unit 5 PostGIS geometry operation may return - never narrowed to
 * `Polygon` alone (NFR-U5-13), and empty results are never smuggled through as a zero-point
 * `Polygon` (Code Generation correction). */
export type Geometry = Polygon | MultiPolygon | EmptyGeometry;

export function isEmptyGeometry(g: Geometry): g is EmptyGeometry {
  return "kind" in g && g.kind === "EMPTY";
}
export function isMultiPolygon(g: Geometry): g is MultiPolygon {
  return "polygons" in g;
}
export function isPolygon<T extends { points: Point[] }>(g: T | MultiPolygon | EmptyGeometry): g is T {
  return "points" in g;
}

/** WGS84 (EPSG:4326) longitude/latitude - the browser/MapLibre's native coordinate system.
 * Named fields (not a positional [x,y] tuple) specifically to make a lng/lat swap structurally
 * harder to introduce by accident. Never locally reprojected in the browser or in application
 * code - PostGIS's ST_Transform is the only place this ever becomes a projected coordinate. */
export interface GeographicPoint {
  lng: number;
  lat: number;
}

export interface SpatialResult<TValue = unknown> {
  computation: string;
  value?: TValue;
  inputs: Record<string, unknown>;
  availabilityState: AvailabilityState;
  provenance: Provenance;
}

export const MappedIntersectionResult = {
  INTERSECTS: "INTERSECTS",
  NO_INTERSECTION: "NO_INTERSECTION",
  INDETERMINATE: "INDETERMINATE",
} as const;
export type MappedIntersectionResult = (typeof MappedIntersectionResult)[keyof typeof MappedIntersectionResult];

export const AdvisoryStatus = {
  ADVISORY_ONLY: "ADVISORY_ONLY",
  MAP_DISPOSITIVE: "MAP_DISPOSITIVE",
} as const;
export type AdvisoryStatus = (typeof AdvisoryStatus)[keyof typeof AdvisoryStatus];

export interface CriticalAreaFinding {
  hazardType: string;
  individualLayerResult?: boolean;
  combinedLayerResult?: boolean;
  mappedIntersectionResult: MappedIntersectionResult;
  advisoryStatus: AdvisoryStatus;
  toleranceBasis: string;
  layerVintageNote?: string;
}
