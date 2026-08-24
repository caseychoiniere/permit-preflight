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
  units: "FEET";
  srid?: number;
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
