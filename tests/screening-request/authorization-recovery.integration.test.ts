/**
 * Live Neon integration test for checkReadiness's bounded self-healing recovery mechanism
 * (maintenance correction, 2026-09-15 - the real production deadlock discovered during Unit 6B
 * founder acceptance testing: once king-county-parcel-polygon observed UNHEALTHY, the only
 * success-recording path lived inside runReportGenerationPipeline, which checkReadiness itself
 * prevented from ever running again).
 *
 * Exercises the REAL "king-county-parcel-polygon" row (checkReadiness's recovery branch is
 * intentionally hardcoded to this one sourceId - see authorization.ts) - snapshotted before this
 * suite runs and restored afterward via the shared data-source-health-fixture, so this suite can
 * never leave the shared dev/staging row mutated. Only the external King County fetch is mocked
 * (never the database) - same "mock the network boundary, never the DB" discipline every other
 * integration suite in this project already follows.
 *
 * Skips cleanly when DATABASE_URL is unset, matching every other DB-gated integration suite.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withAdminTransaction, type Db } from "../../src/db/client.js";
import { dataSourceHealth } from "../../src/db/schema.js";
import { recordIngestionResult, setManualOverride, clearManualOverride, getSourceHealth, SourceHealthState } from "../../src/data-source-registry/index.js";
import { checkReadiness } from "../../src/screening-request/authorization.js";
import { snapshotDataSourceHealth, restoreDataSourceHealth, type DataSourceHealthSnapshot } from "../fixtures/data-source-health-fixture.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const SOURCE_ID = "king-county-parcel-polygon";
const KING_COUNTY_PARCEL_HOST = "gismaps.kingcounty.gov";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

/** The Neon serverless driver (getDb()) also uses global `fetch` internally - stubbing it
 * unconditionally would break every DB call this test itself needs to make. Only intercepts
 * requests to the King County parcel-polygon host; every other request (including Neon's own
 * HTTP driver traffic) passes through to the real, original fetch. */
function stubKingCountyFetch(handler: (url: string) => Promise<{ ok: boolean; status?: number; statusText?: string; json: () => Promise<unknown> }>) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(KING_COUNTY_PARCEL_HOST)) {
      return handler(url) as unknown as Promise<Response>;
    }
    return realFetch(input, init);
  }));
}

const REAL_PARCEL_RESPONSE = {
  spatialReference: { wkid: 2926, latestWkid: 2926 },
  features: [{ attributes: { PIN: "1959703080" }, geometry: { rings: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }],
};

function testScreeningRequest() {
  return { workflowType: "EXISTING_PROPERTY", projectType: "shed", validationState: "VALID", confirmedParcelId: "1959703080" };
}

async function forceHealthState(db: Db, opts: { observedHealthState: "HEALTHY" | "UNHEALTHY"; lastFailureAt?: Date; manualOverrideState?: "UNHEALTHY" | null }) {
  await recordIngestionResult(db, SOURCE_ID, opts.observedHealthState === "HEALTHY" ? { success: true } : { success: false, reason: "test setup" });
  if (opts.lastFailureAt) {
    await db.update(dataSourceHealth).set({ lastFailureAt: opts.lastFailureAt }).where(eq(dataSourceHealth.sourceId, SOURCE_ID));
  }
  if (opts.manualOverrideState === "UNHEALTHY") {
    await withAdminTransaction((tx) => setManualOverride(tx, SOURCE_ID, SourceHealthState.UNHEALTHY));
  } else if (opts.manualOverrideState === null) {
    await withAdminTransaction((tx) => clearManualOverride(tx, SOURCE_ID));
  }
}

const TWO_MINUTES_AGO = () => new Date(Date.now() - 2 * 60_000); // outside the 60s recovery-probe cooldown

describe.skipIf(!hasDb)("checkReadiness - king-county-parcel-polygon bounded recovery (maintenance correction)", () => {
  let db: Db;
  let snapshot: DataSourceHealthSnapshot;

  beforeAll(async () => {
    db = getDb();
    snapshot = await snapshotDataSourceHealth(db, [SOURCE_ID]);
  });

  afterAll(async () => {
    await restoreDataSourceHealth(db, snapshot);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[req 1] observed UNHEALTHY, no manual override, real recovery succeeds -> observed becomes HEALTHY, readiness proceeds", async () => {
    await forceHealthState(db, { observedHealthState: "UNHEALTHY", lastFailureAt: TWO_MINUTES_AGO(), manualOverrideState: null });
    stubKingCountyFetch(async () => jsonResponse(REAL_PARCEL_RESPONSE));

    const result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result).toEqual({ ready: true });
    expect((await getSourceHealth(db, SOURCE_ID)).observedHealthState).toBe("HEALTHY");
  });

  it("[req 2] observed UNHEALTHY, no manual override, recovery fails -> remains UNHEALTHY, checkout remains blocked", async () => {
    await forceHealthState(db, { observedHealthState: "UNHEALTHY", lastFailureAt: TWO_MINUTES_AGO(), manualOverrideState: null });
    stubKingCountyFetch(async () => ({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({}) }));

    const result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result.ready).toBe(false);
    expect((await getSourceHealth(db, SOURCE_ID)).observedHealthState).toBe("UNHEALTHY");
  }, 10_000);

  it("[req 3] observed UNHEALTHY with an explicit manual UNHEALTHY override -> automatic recovery never bypasses it, checkout remains blocked, and no probe is even attempted", async () => {
    await forceHealthState(db, { observedHealthState: "UNHEALTHY", lastFailureAt: TWO_MINUTES_AGO(), manualOverrideState: "UNHEALTHY" });
    const kingCountyMock = vi.fn(async () => jsonResponse(REAL_PARCEL_RESPONSE));
    stubKingCountyFetch(kingCountyMock);

    const result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result.ready).toBe(false);
    expect(kingCountyMock).not.toHaveBeenCalled(); // proves recovery never attempted to bypass the override
  });

  it("[RC-2] a manual UNHEALTHY override applied WHILE the recovery probe is in flight still blocks readiness - checkReadiness re-reads effective health after the probe rather than trusting the pre-probe snapshot", async () => {
    await forceHealthState(db, { observedHealthState: "UNHEALTHY", lastFailureAt: TWO_MINUTES_AGO(), manualOverrideState: null });
    stubKingCountyFetch(async () => {
      // Simulates an operator acting during the network round trip: the probe itself succeeds
      // (King County responds normally), but a manual override lands before checkReadiness ever
      // gets to look at the result.
      await withAdminTransaction((tx) => setManualOverride(tx, SOURCE_ID, SourceHealthState.UNHEALTHY));
      return jsonResponse(REAL_PARCEL_RESPONSE);
    });

    const result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result.ready).toBe(false); // the override, applied mid-probe, still wins
    expect((await getSourceHealth(db, SOURCE_ID)).manualOverrideState).toBe("UNHEALTHY");

    // Clean up the override this test itself introduced so later tests in this file see a clean slate.
    await withAdminTransaction((tx) => clearManualOverride(tx, SOURCE_ID));
  });

  it("[req 4] clearing the manual UNHEALTHY override returns to observed-health semantics immediately", async () => {
    await forceHealthState(db, { observedHealthState: "HEALTHY", manualOverrideState: "UNHEALTHY" });
    let result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result.ready).toBe(false); // override still active despite HEALTHY observed state

    await withAdminTransaction((tx) => clearManualOverride(tx, SOURCE_ID));
    result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result).toEqual({ ready: true });
  });

  it("[req 5 + 7] a legitimate zero-result response for this specific parcel is still genuine successful source behavior - flips observed to HEALTHY without any admin assertion, and never conflates one parcel's absence of data with source failure", async () => {
    await forceHealthState(db, { observedHealthState: "UNHEALTHY", lastFailureAt: TWO_MINUTES_AGO(), manualOverrideState: null });
    stubKingCountyFetch(async () => jsonResponse({ features: [] })); // well-formed, correctly-CRS'd-irrelevant empty result

    const result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result).toEqual({ ready: true });
    expect((await getSourceHealth(db, SOURCE_ID)).observedHealthState).toBe("HEALTHY");
  });

  it("does not re-attempt a probe within the recovery cooldown window after a very recent failure (avoids hammering a real outage on every checkout click)", async () => {
    await forceHealthState(db, { observedHealthState: "UNHEALTHY", lastFailureAt: new Date(), manualOverrideState: null }); // failed just now
    const kingCountyMock = vi.fn(async () => jsonResponse(REAL_PARCEL_RESPONSE));
    stubKingCountyFetch(kingCountyMock);

    const result = await checkReadiness(db, testScreeningRequest(), [SOURCE_ID]);
    expect(result.ready).toBe(false);
    expect(kingCountyMock).not.toHaveBeenCalled();
  });
});

describe.skipIf(hasDb)("checkReadiness - king-county-parcel-polygon bounded recovery (skipped)", () => {
  it("documents why this suite did not run - no DATABASE_URL provisioned in this environment", () => {
    expect(hasDb).toBe(false);
  });
});
