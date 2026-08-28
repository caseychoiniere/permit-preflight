/**
 * Data Source Registry types. Corrected 2026-08-25 (Unit 3 Functional Design): a source's health
 * is now two independent, separately-written fields - observedHealthState (automated-only,
 * written only by recordIngestionResult) and manualOverrideState (admin-only, nullable) - rather
 * than a single healthState + manualOverride boolean, which made "clear the override" semantically
 * wrong (the override's last value would silently keep governing readiness indefinitely). See
 * repository.ts.
 */

export const SourceHealthState = {
  HEALTHY: "HEALTHY",
  UNHEALTHY: "UNHEALTHY",
  UNKNOWN: "UNKNOWN",
} as const;
export type SourceHealthState = (typeof SourceHealthState)[keyof typeof SourceHealthState];

export interface SourceHealthSnapshot {
  sourceId: string;
  observedHealthState: SourceHealthState;
  lastSuccessfulRetrieval?: string; // ISO 8601
  lastFailureAt?: string; // ISO 8601
  lastFailureReason?: string;
  manualOverrideState?: SourceHealthState;
  /** Derived, never stored: manualOverrideState ?? observedHealthState. The ONLY value
   * isKnownUnhealthy/checkReadiness's evaluation ever consumes - observedHealthState is never
   * read directly by any evaluation-affecting code path. */
  effectiveHealthState: SourceHealthState;
  updatedAt: string; // ISO 8601
}

/** Pure derivation, factored out for deterministic testability (repository.ts's toSnapshot is
 * the only caller in real use). The founder's own worked example this corrects for: observed=
 * HEALTHY, override=UNHEALTHY -> effective=UNHEALTHY; clearing the override (override=undefined)
 * immediately reverts effective to whatever observed already is, with no wait for a future
 * ingestion result. */
export function computeEffectiveHealthState(observed: SourceHealthState, override: SourceHealthState | undefined): SourceHealthState {
  return override ?? observed;
}
