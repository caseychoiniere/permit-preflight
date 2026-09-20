/**
 * Snapshot/restore helper for the shared `data_source_health` table.
 *
 * Maintenance correction (2026-09-15): unlike every other row this project's integration suites
 * create (screeningRequests, regulatoryRules, ...), dataSourceHealth rows are keyed by a small set
 * of well-known, REAL, production-meaningful sourceId strings ("king-county-parcel-polygon",
 * "seattle-building-outlines", "seattle-eca", "king-county-gis") - never a randomized per-test-run
 * id. Any integration test that exercises a real code path touching one of these (e.g. running the
 * actual `runReportGenerationPipeline`) mutates SHARED, persistent state in the dev/staging
 * database, not a disposable fixture row. This is exactly what left `king-county-parcel-polygon`
 * stuck UNHEALTHY for 5 days after a real King County outage occurred mid-run in
 * `tests/report-generation-orchestrator/pipeline.integration.test.ts` on 2026-09-10 - that test's
 * own `afterAll` cleaned up every row it OWNED (screeningRequests/reportGenerationJobs/
 * evidenceReportArtifacts/regulatoryRules) but never touched `dataSourceHealth` at all.
 *
 * This helper snapshots the exact prior row (all fields) before a suite runs and restores it
 * afterward - never blindly resets to HEALTHY, and never erases a legitimate pre-existing manual
 * override. A sourceId with no prior row is removed entirely on restore (never left behind as a
 * test-created row). Use it in any `beforeAll`/`afterAll` pair for an integration test that
 * exercises a real pipeline/adapter path against one of these well-known source ids.
 */
import { eq } from "drizzle-orm";
import { dataSourceHealth, type DataSourceHealthRow } from "../../src/db/schema.js";
import type { Db } from "../../src/db/client.js";

export type DataSourceHealthSnapshot = Map<string, DataSourceHealthRow | undefined>;

export async function snapshotDataSourceHealth(db: Db, sourceIds: string[]): Promise<DataSourceHealthSnapshot> {
  const snapshot: DataSourceHealthSnapshot = new Map();
  for (const sourceId of sourceIds) {
    const [row] = await db.select().from(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
    snapshot.set(sourceId, row);
  }
  return snapshot;
}

/** Restores every sourceId in `snapshot` to its EXACT pre-snapshot row (every field, including
 * manualOverrideState) - or deletes it entirely if it did not exist before the snapshot was
 * taken. Safe to call from `afterAll` even if the test body threw - Vitest runs `afterAll` on
 * failure too, and this function's own per-row writes are independent (one row's restore failing
 * does not stop the others from being attempted). */
export async function restoreDataSourceHealth(db: Db, snapshot: DataSourceHealthSnapshot): Promise<void> {
  for (const [sourceId, row] of snapshot) {
    if (row) {
      await db
        .update(dataSourceHealth)
        .set({
          observedHealthState: row.observedHealthState,
          lastSuccessfulRetrieval: row.lastSuccessfulRetrieval,
          lastFailureAt: row.lastFailureAt,
          lastFailureReason: row.lastFailureReason,
          manualOverrideState: row.manualOverrideState,
          updatedAt: row.updatedAt,
        })
        .where(eq(dataSourceHealth.sourceId, sourceId));
    } else {
      await db.delete(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
    }
  }
}
