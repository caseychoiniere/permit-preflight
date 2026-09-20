/**
 * Live Neon integration test for the data-source-health snapshot/restore fixture itself (§A's
 * required regression coverage: "an integration test failure that writes source-health state
 * cannot leave shared state mutated afterward"). Uses synthetic, randomized sourceIds - never a
 * real production sourceId - so this suite never touches king-county-parcel-polygon or any other
 * shared row. Skips cleanly when DATABASE_URL is unset, same convention as every other DB-gated
 * integration suite in this project.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withAdminTransaction, type Db } from "../../src/db/client.js";
import { dataSourceHealth } from "../../src/db/schema.js";
import { recordIngestionResult, setManualOverride, getSourceHealth } from "../../src/data-source-registry/index.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth } from "./data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("data-source-health-fixture - snapshot/restore round-trip", () => {
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
    const id = `test-health-fixture-${randomUUID()}`;
    cleanupSourceIds.push(id);
    return id;
  }

  it(
    "restores a pre-existing HEALTHY row back to its exact prior state after mutations shaped like a failing real pipeline run " +
      "(the exact 2026-09-10 king-county-parcel-polygon contamination scenario this fixes)",
    async () => {
      const sourceId = testSourceId();
      await recordIngestionResult(db, sourceId, { success: true }); // a real prior HEALTHY state, as if from an earlier successful run
      const snapshot = await snapshotDataSourceHealth(db, [sourceId]);

      // Simulate exactly what a real outage mid-test-run would write (matching the 2026-09-10
      // audit-log entry: "8 unrelated integration failures are a live King County GIS outage").
      await recordIngestionResult(db, sourceId, { success: false, reason: "simulated outage during test run" });
      expect((await getSourceHealth(db, sourceId)).observedHealthState).toBe("UNHEALTHY");

      await restoreDataSourceHealth(db, snapshot);
      const restored = await getSourceHealth(db, sourceId);
      expect(restored.observedHealthState).toBe("HEALTHY");
      expect(restored.manualOverrideState).toBeUndefined();
    }
  );

  it(
    "[RC-1A] restoration still runs when unrelated fixture cleanup throws first - the exact try/finally pattern " +
      "pipeline.integration.test.ts's own afterAll now uses, so a transient delete failure elsewhere can never leave " +
      "the shared health row unrestored",
    async () => {
      const sourceId = testSourceId();
      await recordIngestionResult(db, sourceId, { success: true });
      const snapshot = await snapshotDataSourceHealth(db, [sourceId]);
      await recordIngestionResult(db, sourceId, { success: false, reason: "simulated outage during test run" });

      let restoreRan = false;
      await expect(
        (async () => {
          try {
            throw new Error("simulated unrelated fixture-cleanup failure (e.g. a transient delete error)");
          } finally {
            await restoreDataSourceHealth(db, snapshot);
            restoreRan = true;
          }
        })()
      ).rejects.toThrow("simulated unrelated fixture-cleanup failure");

      expect(restoreRan).toBe(true);
      expect((await getSourceHealth(db, sourceId)).observedHealthState).toBe("HEALTHY");
    }
  );

  it("restores a pre-existing legitimate manual UNHEALTHY override rather than erasing it (never blindly resets to HEALTHY)", async () => {
    const sourceId = testSourceId();
    await recordIngestionResult(db, sourceId, { success: true });
    await withAdminTransaction((tx) => setManualOverride(tx, sourceId, "UNHEALTHY"));
    const snapshot = await snapshotDataSourceHealth(db, [sourceId]);

    // A failing run's own observed-state mutation, on top of the pre-existing override.
    await recordIngestionResult(db, sourceId, { success: true });

    await restoreDataSourceHealth(db, snapshot);
    const restored = await getSourceHealth(db, sourceId);
    expect(restored.manualOverrideState).toBe("UNHEALTHY");
    expect(restored.effectiveHealthState).toBe("UNHEALTHY");
  });

  it("removes a row entirely if it did not exist before the snapshot - never leaves a test-created row behind", async () => {
    const sourceId = testSourceId();
    const snapshot = await snapshotDataSourceHealth(db, [sourceId]); // no row exists yet
    await recordIngestionResult(db, sourceId, { success: true }); // the test run creates one

    await restoreDataSourceHealth(db, snapshot);
    const [row] = await db.select().from(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
    expect(row).toBeUndefined();
  });
});

describe.skipIf(hasDb)("data-source-health-fixture - live integration (skipped)", () => {
  it("documents why this suite did not run - no DATABASE_URL provisioned in this environment", () => {
    expect(hasDb).toBe(false);
  });
});
