/**
 * Data Source Registry - domain-entities.md "Data Source Registry". Owns cross-cutting metadata
 * about each external authoritative source, independent of any single property lookup.
 *
 * In-memory for Unit 1 (per the approved minimal scope - a persisted, queryable registry wasn't
 * exercised by any Unit 1 story; Property Intelligence only needs a cheap "is this source already
 * known-unhealthy" check, which this satisfies without a database dependency). A later unit may
 * back this with real persistence if Admin/Support (Unit 3) needs durable history across restarts.
 */

export const SourceHealthState = {
  HEALTHY: "HEALTHY",
  UNHEALTHY: "UNHEALTHY",
  UNKNOWN: "UNKNOWN",
} as const;
export type SourceHealthState = (typeof SourceHealthState)[keyof typeof SourceHealthState];

export interface SourceHealthRecord {
  sourceId: string;
  healthState: SourceHealthState;
  lastSuccessfulRetrieval?: string; // ISO 8601
  lastFailure?: { at: string; reason: string };
  manualOverride?: boolean;
}

export class DataSourceRegistry {
  private records = new Map<string, SourceHealthRecord>();

  getSourceHealth(sourceId: string): SourceHealthRecord {
    return this.records.get(sourceId) ?? { sourceId, healthState: SourceHealthState.UNKNOWN };
  }

  /** Cheap existing-state check with no live retrieval - used by the PO-0-style readiness check
   * in a later unit, and internally to decide fact-retrieval confidence in this one. */
  isKnownUnhealthy(sourceId: string): boolean {
    const record = this.records.get(sourceId);
    return record?.healthState === SourceHealthState.UNHEALTHY;
  }

  recordIngestionResult(sourceId: string, outcome: { success: true } | { success: false; reason: string }): void {
    const existing = this.records.get(sourceId);
    if (existing?.manualOverride) {
      // A manual override (set via setManualOverride) is not silently clobbered by an automated
      // ingestion result - an operator's explicit decision persists until they change it.
      return;
    }
    if (outcome.success) {
      this.records.set(sourceId, { sourceId, healthState: SourceHealthState.HEALTHY, lastSuccessfulRetrieval: new Date().toISOString() });
    } else {
      this.records.set(sourceId, {
        sourceId,
        healthState: SourceHealthState.UNHEALTHY,
        ...(existing?.lastSuccessfulRetrieval ? { lastSuccessfulRetrieval: existing.lastSuccessfulRetrieval } : {}),
        lastFailure: { at: new Date().toISOString(), reason: outcome.reason },
      });
    }
  }

  setManualOverride(sourceId: string, healthState: SourceHealthState): void {
    this.records.set(sourceId, { ...this.getSourceHealth(sourceId), sourceId, healthState, manualOverride: true });
  }

  listUnhealthySources(): SourceHealthRecord[] {
    return [...this.records.values()].filter((r) => r.healthState === SourceHealthState.UNHEALTHY);
  }
}
