/**
 * ADM-3's expected-refresh-cadence metadata (2026-08-25, full-repository review correction) - a
 * small authoritative definition table, not a new database table or a monitoring product. Both
 * currently-integrated sources are queried live, per request, never periodically ingested - so
 * ON_DEMAND is the accurate description of how they are actually queried, not a placeholder for a
 * future schedule that does not exist. No scheduled polling or synthetic health check is added by
 * this file - it is purely descriptive metadata merged into the ADM-3 admin view alongside the
 * real, persisted DataSourceHealth state (repository.ts).
 */

export const ExpectedRefreshCadence = {
  /** Queried live, synchronously, as part of handling one specific customer/operator request -
   * never on a schedule, never bulk-ingested ahead of time. */
  ON_DEMAND: "ON_DEMAND",
} as const;
export type ExpectedRefreshCadence = (typeof ExpectedRefreshCadence)[keyof typeof ExpectedRefreshCadence];

export interface KnownSourceDefinition {
  sourceId: string;
  expectedRefreshCadence: ExpectedRefreshCadence;
  description: string;
}

/** Keyed by the exact same stable source ids screening-request/authorization.ts's
 * REQUIRED_SOURCE_IDS_FOR_SHED already uses - not a second, drifting list. */
export const KNOWN_SOURCE_DEFINITIONS: Record<string, KnownSourceDefinition> = {
  "king-county-gis": {
    sourceId: "king-county-gis",
    expectedRefreshCadence: ExpectedRefreshCadence.ON_DEMAND,
    description: "King County address geocoding + independent parcel lookup (parcel-resolution) - queried live, per resolution request.",
  },
  "king-county-parcel-polygon": {
    sourceId: "king-county-parcel-polygon",
    expectedRefreshCadence: ExpectedRefreshCadence.ON_DEMAND,
    description: "King County parcel-polygon boundary layer (property-intelligence) - queried live, per report-generation request.",
  },
  "seattle-building-outlines": {
    sourceId: "seattle-building-outlines",
    expectedRefreshCadence: ExpectedRefreshCadence.ON_DEMAND,
    description: "City of Seattle Building Outlines 2023 (property-intelligence, building intelligence v1) - queried live, per shed report-generation request.",
  },
};
