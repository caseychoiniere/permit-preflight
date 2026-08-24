/**
 * Live Neon integration test for Unit 2's persisted entities. Skips cleanly (does not fail) when
 * DATABASE_URL is unset - see tests/db/schema.integration.test.ts for the pattern this follows.
 * NOT executed in this Code Generation session - no DATABASE_URL provisioned in this sandbox.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, reportGenerationJobs, evidenceReportArtifacts, reportPdfRenderings, reportAccessCredentials } from "../../src/db/schema.js";
import { createReportGenerationJob, claimQueuedJob, reclaimStaleJob } from "../../src/report-generation-job/repository.js";
import { createEvidenceReportArtifact } from "../../src/evidence-report-artifact/index.js";
import { createAccessCredential, findArtifactIdByAccessToken, revokeAccessCredential } from "../../src/report-access/repository.js";
import type { GenerationAuthorization } from "../../src/screening-request/authorization.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Unit 2 persisted entities - live Neon integration", () => {
  let db: Db;
  const cleanupScreeningRequestIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const id of cleanupScreeningRequestIds) {
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  });

  it("[hard invariant] ReportGenerationJob claim is atomic - a second claim attempt on an already-claimed job returns nothing", async () => {
    const [request] = await db
      .insert(screeningRequests)
      .values({ confirmedParcelId: "TEST-PIN", projectType: "shed", projectDetails: {}, validationState: "VALID" })
      .returning();
    if (!request) throw new Error("setup failed");
    cleanupScreeningRequestIds.push(request.id);

    const authorization: GenerationAuthorization = { type: "INTERNAL_PROTOTYPE", screeningRequestId: request.id, authorizedBy: "test@example.com", authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, request.id, authorization);

    const firstClaim = await claimQueuedJob(db, job.id);
    const secondClaim = await claimQueuedJob(db, job.id);

    expect(firstClaim?.state).toBe("IN_PROGRESS");
    expect(secondClaim).toBeUndefined();
  });

  it("stale-claim recovery only reclaims a job past the configured threshold", async () => {
    const [request] = await db
      .insert(screeningRequests)
      .values({ confirmedParcelId: "TEST-PIN-2", projectType: "shed", projectDetails: {}, validationState: "VALID" })
      .returning();
    if (!request) throw new Error("setup failed");
    cleanupScreeningRequestIds.push(request.id);

    const authorization: GenerationAuthorization = { type: "INTERNAL_PROTOTYPE", screeningRequestId: request.id, authorizedBy: "test@example.com", authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, request.id, authorization);
    await claimQueuedJob(db, job.id);

    const tooSoon = await reclaimStaleJob(db, job.id, 60_000); // not stale yet
    expect(tooSoon).toBeUndefined();

    const reclaimed = await reclaimStaleJob(db, job.id, 0); // any claim age counts as stale
    expect(reclaimed?.retryAttempts).toBeGreaterThanOrEqual(2);
  });

  it("EvidenceReportArtifact + ReportAccessCredential: create, resolve by token, revoke", async () => {
    const [request] = await db
      .insert(screeningRequests)
      .values({ confirmedParcelId: "TEST-PIN-3", projectType: "shed", projectDetails: {}, validationState: "VALID" })
      .returning();
    if (!request) throw new Error("setup failed");
    cleanupScreeningRequestIds.push(request.id);

    const authorization: GenerationAuthorization = { type: "INTERNAL_PROTOTYPE", screeningRequestId: request.id, authorizedBy: "test@example.com", authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, request.id, authorization);

    const { artifact, credential } = await createEvidenceReportArtifact(db, {
      screeningRequestId: request.id,
      reportGenerationJobId: job.id,
      findings: [],
      evidence: [],
      ruleVersionsUsed: [],
      dataRetrievalTimestamps: {},
    });

    const resolved = await findArtifactIdByAccessToken(db, credential.rawToken);
    expect(resolved).toBe(artifact.id);

    await revokeAccessCredential(db, artifact.id);
    const afterRevoke = await findArtifactIdByAccessToken(db, credential.rawToken);
    expect(afterRevoke).toBeUndefined();

    await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, artifact.id));
    await db.delete(reportAccessCredentials).where(eq(reportAccessCredentials.reportArtifactId, artifact.id));
    await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.id, job.id));
  });

  it("ReportPdfRendering bytea round-trip", async () => {
    const [row] = await db
      .insert(reportPdfRenderings)
      .values({ reportArtifactId: crypto.randomUUID(), renderingVersion: "1", bytes: Buffer.from("test-pdf-bytes") })
      .returning();
    expect(row?.bytes.toString()).toBe("test-pdf-bytes");
    if (row) await db.delete(reportPdfRenderings).where(eq(reportPdfRenderings.id, row.id));
  });
});

describe.skipIf(hasDb)("Unit 2 persisted entities - live Neon integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
  });
});
