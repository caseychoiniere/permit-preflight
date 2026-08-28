/**
 * Live Neon integration test for Unit 3's persisted Data Source Registry - skips cleanly when
 * DATABASE_URL is unset (same pattern as every prior unit's DB-backed integration suite). NOT
 * executed in this Code Generation session - no DATABASE_URL provisioned in this sandbox.
 *
 * Proves the 5 founder-specified cases (2026-08-25 Code Generation Part 1 review, correction 1)
 * end-to-end against the real dataSourceHealth table.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { dataSourceHealth } from "../../src/db/schema.js";
import { getSourceHealth, isKnownUnhealthy, recordIngestionResult, setManualOverride, clearManualOverride } from "../../src/data-source-registry/repository.js";
import { SourceHealthState } from "../../src/data-source-registry/types.js";
import { withAdminTransaction } from "../../src/db/client.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Unit 3 Data Source Registry - live Neon integration", () => {
  let db: Db;
  const cleanupSourceIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const sourceId of cleanupSourceIds) {
      await db.delete(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
    }
  });

  function testSourceId(): string {
    const id = `test-source-${Math.random().toString(36).slice(2)}`;
    cleanupSourceIds.push(id);
    return id;
  }

  it("known-source-initialization: getSourceHealth upserts a default UNKNOWN row for a never-before-seen source id", async () => {
    const sourceId = testSourceId();
    const snapshot = await getSourceHealth(db, sourceId);
    expect(snapshot.observedHealthState).toBe(SourceHealthState.UNKNOWN);
    expect(snapshot.effectiveHealthState).toBe(SourceHealthState.UNKNOWN);
  });

  it("(1) a successful retrieval updates observedHealthState to HEALTHY plus a success timestamp", async () => {
    const sourceId = testSourceId();
    await recordIngestionResult(db, sourceId, { success: true });
    const snapshot = await getSourceHealth(db, sourceId);
    expect(snapshot.observedHealthState).toBe(SourceHealthState.HEALTHY);
    expect(snapshot.lastSuccessfulRetrieval).toBeDefined();
  });

  it("(2) a failed retrieval updates observedHealthState to UNHEALTHY plus failure data", async () => {
    const sourceId = testSourceId();
    await recordIngestionResult(db, sourceId, { success: false, reason: "simulated source timeout" });
    const snapshot = await getSourceHealth(db, sourceId);
    expect(snapshot.observedHealthState).toBe(SourceHealthState.UNHEALTHY);
    expect(snapshot.lastFailureAt).toBeDefined();
    expect(snapshot.lastFailureReason).toBe("simulated source timeout");
  });

  it("(3)+(4)+(5) automated recording continues under an active override; override remains effective despite it; clearing exposes the latest observed value immediately", async () => {
    const sourceId = testSourceId();

    // Automated ingestion observes HEALTHY.
    await recordIngestionResult(db, sourceId, { success: true });
    expect((await getSourceHealth(db, sourceId)).observedHealthState).toBe(SourceHealthState.HEALTHY);

    // Admin overrides to UNHEALTHY (e.g. a known outage not yet automatically detected).
    await withAdminTransaction((tx) => setManualOverride(tx, sourceId, SourceHealthState.UNHEALTHY));
    let snapshot = await getSourceHealth(db, sourceId);
    expect(snapshot.manualOverrideState).toBe(SourceHealthState.UNHEALTHY);
    expect(snapshot.effectiveHealthState).toBe(SourceHealthState.UNHEALTHY);
    expect(await isKnownUnhealthy(db, sourceId)).toBe(true);

    // (3) Automated ingestion keeps observing, even while the override is active - never early-returns.
    await recordIngestionResult(db, sourceId, { success: false, reason: "still failing during the outage" });
    snapshot = await getSourceHealth(db, sourceId);
    expect(snapshot.observedHealthState).toBe(SourceHealthState.UNHEALTHY); // observed updated

    // A later automated success arrives WHILE the override is still active.
    await recordIngestionResult(db, sourceId, { success: true });
    snapshot = await getSourceHealth(db, sourceId);
    // (4) observedHealthState reflects the new success...
    expect(snapshot.observedHealthState).toBe(SourceHealthState.HEALTHY);
    // ...but effective stays the override's value (checkout stays blocked) - the founder's worked example.
    expect(snapshot.effectiveHealthState).toBe(SourceHealthState.UNHEALTHY);

    // (5) Clearing the override immediately exposes the latest observed value (HEALTHY) - no wait
    // for a future ingestion result, since it was already being tracked the entire time.
    await withAdminTransaction((tx) => clearManualOverride(tx, sourceId));
    snapshot = await getSourceHealth(db, sourceId);
    expect(snapshot.manualOverrideState).toBeUndefined();
    expect(snapshot.effectiveHealthState).toBe(SourceHealthState.HEALTHY);
    expect(await isKnownUnhealthy(db, sourceId)).toBe(false);
  });
});
