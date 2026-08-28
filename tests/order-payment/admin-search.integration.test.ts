/**
 * Live Neon integration test for ADM-5's corrected search transport and ADM-1/ADM-4's
 * report-id/job-based Order correlation (2026-08-25 full-repository review corrections). Skips
 * cleanly when DATABASE_URL is unset. NOT executed in this Code Generation session - no
 * DATABASE_URL provisioned in this sandbox.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, orders, reportGenerationJobs, adminActionLog } from "../../src/db/schema.js";
import { getOrderById, findOrdersByCustomerEmail } from "../../src/order-payment/repository.js";
import { OrderState } from "../../src/order-payment/types.js";
import { createReportGenerationJob, getJobByEvidenceReportArtifactId, markJobComplete } from "../../src/report-generation-job/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";
import { createEvidenceReportArtifact, getReportById } from "../../src/evidence-report-artifact/index.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("ADM-5/ADM-1/ADM-4 - live Neon integration", () => {
  let db: Db;
  const cleanupScreeningRequestIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const id of cleanupScreeningRequestIds) {
      await db.delete(orders).where(eq(orders.screeningRequestId, id));
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  });

  async function makePaidOrderWithReport(customerEmail: string): Promise<{ orderId: string; reportArtifactId: string; screeningRequestId: string }> {
    const [screeningRequest] = await db
      .insert(screeningRequests)
      .values({ confirmedParcelId: `TEST-PIN-${Math.random()}`, projectType: "shed", projectDetails: {}, validationState: "VALID" })
      .returning();
    if (!screeningRequest) throw new Error("setup failed");
    cleanupScreeningRequestIds.push(screeningRequest.id);

    const [order] = await db
      .insert(orders)
      .values({
        screeningRequestId: screeningRequest.id,
        state: OrderState.PAID,
        priceCents: 999,
        currency: "usd",
        checkoutCreationIdempotencyKey: `test-${Math.random()}`,
        customerEmail,
        paidAt: new Date(),
      })
      .returning();
    if (!order) throw new Error("setup failed");

    const authorization: GenerationAuthorization = {
      type: GenerationAuthorizationType.VERIFIED_PAYMENT,
      screeningRequestId: screeningRequest.id,
      orderId: order.id,
      authorizedAt: new Date().toISOString(),
    };
    const job = await createReportGenerationJob(db, screeningRequest.id, authorization);

    const { artifact } = await createEvidenceReportArtifact(db, {
      screeningRequestId: screeningRequest.id,
      reportGenerationJobId: job.id,
      findings: [],
      evidence: [],
      ruleVersionsUsed: [],
      dataRetrievalTimestamps: {},
    });
    await markJobComplete(db, job.id, artifact.id);

    return { orderId: order.id, reportArtifactId: artifact.id, screeningRequestId: screeningRequest.id };
  }

  it("orderId: exact lookup resolves the Order", async () => {
    const { orderId } = await makePaidOrderWithReport(`order-lookup-${Math.random()}@example.com`);
    const order = await getOrderById(db, orderId);
    expect(order?.id).toBe(orderId);
  });

  it("email: exact, normalized-case-insensitive lookup - and a partial/substring match fails", async () => {
    const email = `Mixed.Case.User+${Math.random().toString(36).slice(2)}@Example.com`;
    const { orderId } = await makePaidOrderWithReport(email);

    const exactDifferentCase = await findOrdersByCustomerEmail(db, email.toUpperCase());
    expect(exactDifferentCase.map((o) => o.id)).toContain(orderId);

    const partial = await findOrdersByCustomerEmail(db, email.slice(0, 8)); // a real substring of the real email
    expect(partial.map((o) => o.id)).not.toContain(orderId);
  });

  it("reportId: resolves reportArtifactId -> ReportGenerationJob -> generationAuthorization.orderId -> Order", async () => {
    const { orderId, reportArtifactId } = await makePaidOrderWithReport(`report-lookup-${Math.random()}@example.com`);

    const job = await getJobByEvidenceReportArtifactId(db, reportArtifactId);
    expect(job).toBeDefined();
    const authorization = job?.generationAuthorization as GenerationAuthorization;
    expect(authorization.type).toBe(GenerationAuthorizationType.VERIFIED_PAYMENT);
    if (authorization.type === GenerationAuthorizationType.VERIFIED_PAYMENT) {
      expect(authorization.orderId).toBe(orderId);
    }

    const order = await getOrderById(db, authorization.type === GenerationAuthorizationType.VERIFIED_PAYMENT ? authorization.orderId : "");
    expect(order?.id).toBe(orderId);
  });

  it("ADM-1: a report/artifact ID directly resolves its provenance - no ReportGenerationJob id indirection needed", async () => {
    const { reportArtifactId } = await makePaidOrderWithReport(`provenance-${Math.random()}@example.com`);
    // This is exactly what GET /api/admin/reports/[reportId]/provenance now does.
    const artifact = await getReportById(db, reportArtifactId);
    expect(artifact?.id).toBe(reportArtifactId);
  });

  it("[hard invariant] search reads write NO AdminActionLog entry - logically read-only", async () => {
    const { orderId } = await makePaidOrderWithReport(`readonly-${Math.random()}@example.com`);
    await getOrderById(db, orderId); // the exact read the search route performs
    const auditRows = await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, orderId));
    expect(auditRows).toHaveLength(0);
  });
});
