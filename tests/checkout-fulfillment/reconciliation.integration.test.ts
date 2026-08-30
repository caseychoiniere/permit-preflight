/**
 * Live Neon integration test for Cron reconciliation's check 5 (Operations correction,
 * 2026-08-25): recovering a ReportGenerationJob genuinely stranded IN_PROGRESS - the
 * responsibility Unit 2's Railway poller had (stale-claim reclaim) that Unit 2B's Cron
 * reconciliation had not ported until this correction. Skips cleanly (does not fail) when
 * DATABASE_URL is unset - see tests/db/unit2-schema.integration.test.ts for the pattern this
 * follows. Uses an injected fake `startWorkflow` spy throughout (never the real Vercel Workflow
 * runtime - see reclaimStaleInProgressJobs's own docstring for why calling the real start() from a
 * plain vitest test would throw), so only DATABASE_URL is required. NOT executed in this Code
 * Generation session - no DATABASE_URL provisioned in this sandbox.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, reportGenerationJobs } from "../../src/db/schema.js";
import { createReportGenerationJob, claimQueuedJob, markJobComplete, markJobFailed } from "../../src/report-generation-job/repository.js";
import { reclaimStaleInProgressJobs } from "../../src/checkout-fulfillment/reconciliation.js";
import type { GenerationAuthorization } from "../../src/screening-request/authorization.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Cron reconciliation check 5: stale IN_PROGRESS job reclaim - live Neon integration", () => {
  let db: Db;
  const cleanupScreeningRequestIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const id of cleanupScreeningRequestIds) {
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  });

  function fakeStartWorkflow(): { spy: (jobId: string) => Promise<void>; calls: string[] } {
    const calls: string[] = [];
    return { calls, spy: async (jobId: string) => void calls.push(jobId) };
  }

  async function makeClaimedJob(): Promise<string> {
    const [request] = await db
      .insert(screeningRequests)
      .values({ confirmedParcelId: `TEST-PIN-${Math.random()}`, projectType: "shed", projectDetails: {}, validationState: "VALID" })
      .returning();
    if (!request) throw new Error("setup failed");
    cleanupScreeningRequestIds.push(request.id);
    const authorization: GenerationAuthorization = { type: "INTERNAL_PROTOTYPE", screeningRequestId: request.id, authorizedBy: "test@example.com", authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, request.id, authorization);
    await claimQueuedJob(db, job.id);
    return job.id;
  }

  async function backdateClaimedAt(jobId: string, msAgo: number): Promise<void> {
    await db.update(reportGenerationJobs).set({ claimedAt: new Date(Date.now() - msAgo) }).where(eq(reportGenerationJobs.id, jobId));
  }

  it("a recently-claimed IN_PROGRESS job is NOT reclaimed", async () => {
    // Test-isolation correction (2026-08-27, founder-directed): reclaimStaleInProgressJobs is a
    // genuinely GLOBAL, system-wide sweep by design (that's the whole point of a Cron
    // reconciliation check) - it is not, and should not be, scoped to one test's own fixtures.
    // Against a persistent staging database, other genuinely-stale IN_PROGRESS rows can exist
    // independently of this test (e.g. residue from an earlier interrupted run elsewhere) and a
    // reclaim call correctly sweeping THOSE up is real, desired production behavior, not a defect
    // this test should fail on. The original `expect(count).toBe(0)`/`expect(calls).toHaveLength
    // (0)` assertions conflated "nothing stale exists anywhere in the table" (environment-
    // dependent, not this test's job to guarantee) with the real invariant under test - "MY
    // recently-claimed job specifically is not reclaimed" - which is what the assertions below now
    // check directly, scoped to jobId, regardless of what else may legitimately exist elsewhere in
    // a shared persistent database.
    const jobId = await makeClaimedJob(); // claimedAt ~= now
    const { spy, calls } = fakeStartWorkflow();

    await reclaimStaleInProgressJobs(db, 20 * 60 * 1000, spy);

    expect(calls).not.toContain(jobId);
    const [row] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, jobId));
    expect(row?.state).toBe("IN_PROGRESS");
  });

  it("[hard invariant] a genuinely stale IN_PROGRESS job is atomically reclaimed back to QUEUED", async () => {
    const jobId = await makeClaimedJob();
    await backdateClaimedAt(jobId, 30 * 60 * 1000); // 30 minutes ago
    const { spy } = fakeStartWorkflow();

    const count = await reclaimStaleInProgressJobs(db, 20 * 60 * 1000, spy);

    expect(count).toBe(1);
    const [row] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, jobId));
    expect(row?.state).toBe("QUEUED");
  });

  it("a successful reclaim starts a replacement report workflow for exactly that job", async () => {
    const jobId = await makeClaimedJob();
    await backdateClaimedAt(jobId, 30 * 60 * 1000);
    const { spy, calls } = fakeStartWorkflow();

    await reclaimStaleInProgressJobs(db, 20 * 60 * 1000, spy);

    expect(calls).toEqual([jobId]);
  });

  it("[hard invariant] overlapping reconciliation attempts cannot both reclaim the same stale job", async () => {
    // Test-isolation correction (2026-08-27): scoped to jobId specifically, not a raw sum of
    // counts/calls, which an unrelated pre-existing stale row elsewhere in a shared persistent
    // database could otherwise inflate past 1 without actually indicating a race-safety failure
    // for THIS job.
    const jobId = await makeClaimedJob();
    await backdateClaimedAt(jobId, 30 * 60 * 1000);
    const a = fakeStartWorkflow();
    const b = fakeStartWorkflow();

    await Promise.all([reclaimStaleInProgressJobs(db, 20 * 60 * 1000, a.spy), reclaimStaleInProgressJobs(db, 20 * 60 * 1000, b.spy)]);

    const totalCallsForThisJob = a.calls.filter((id) => id === jobId).length + b.calls.filter((id) => id === jobId).length;
    expect(totalCallsForThisJob).toBe(1); // exactly one of the two overlapping calls won the race for THIS job
  });

  it("COMPLETE and FAILED jobs are never reclaimed, even with a very old claimedAt", async () => {
    // Same test-isolation correction as above - scoped to the two specific jobs under test, not a
    // global count that a legitimate, independent stale row elsewhere could inflate.
    const completeJobId = await makeClaimedJob();
    await markJobComplete(db, completeJobId, crypto.randomUUID());
    await backdateClaimedAt(completeJobId, 60 * 60 * 1000);

    const failedJobId = await makeClaimedJob();
    await markJobFailed(db, failedJobId, "test failure");
    await backdateClaimedAt(failedJobId, 60 * 60 * 1000);

    const { spy, calls } = fakeStartWorkflow();
    await reclaimStaleInProgressJobs(db, 20 * 60 * 1000, spy);

    expect(calls).not.toContain(completeJobId);
    expect(calls).not.toContain(failedJobId);
    const [completeRow] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, completeJobId));
    const [failedRow] = await db.select().from(reportGenerationJobs).where(eq(reportGenerationJobs.id, failedJobId));
    expect(completeRow?.state).toBe("COMPLETE");
    expect(failedRow?.state).toBe("FAILED");
  });

  it("[hard invariant] a replacement workflow still must win the normal atomic DB claim before it would execute the pipeline", async () => {
    const jobId = await makeClaimedJob();
    await backdateClaimedAt(jobId, 30 * 60 * 1000);
    const { spy } = fakeStartWorkflow();

    await reclaimStaleInProgressJobs(db, 20 * 60 * 1000, spy);

    // Reclaim alone does not grant execution rights - the replacement workflow's own claimJobStep
    // (claimQueuedJob, unmodified) must independently succeed, exactly as it would for a brand-new
    // job. Confirm it does (the reclaim genuinely released it back to a claimable state), and that
    // a SECOND claim attempt (simulating a duplicate/overlapping workflow run) correctly fails.
    const firstClaim = await claimQueuedJob(db, jobId);
    expect(firstClaim?.state).toBe("IN_PROGRESS");
    const secondClaim = await claimQueuedJob(db, jobId);
    expect(secondClaim).toBeUndefined();
  });
});

describe.skipIf(hasDb)("Cron reconciliation check 5 - live Neon integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
  });
});
