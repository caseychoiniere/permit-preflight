/**
 * Live Neon integration test for the product-correctness correction (2026-08-28): a guest
 * customer's post-checkout status page must be able to render their actual generated report
 * directly, authorized by the same HttpOnly Stripe Checkout Session cookie already gating
 * GET /api/checkout/status - never the emailed report-access token, and never a second
 * report-generation/rendering path. Skips cleanly (does not fail) when DATABASE_URL is unset -
 * see tests/db/unit2-schema.integration.test.ts for the pattern this follows. NOT executed in this
 * Code Generation session - no DATABASE_URL provisioned in this sandbox; run this for real via
 * `npm run test:integration` against a real staging database.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { screeningRequests, orders, reportGenerationJobs, evidenceReportArtifacts, reportAccessCredentials } from "../../src/db/schema.js";
import { getGuestReport } from "../../src/checkout-fulfillment/index.js";
import { createReportGenerationJob, claimQueuedJob, markJobComplete } from "../../src/report-generation-job/repository.js";
import { createEvidenceReportArtifact } from "../../src/evidence-report-artifact/index.js";
import { getReportById } from "../../src/evidence-report-artifact/index.js";
import { deliverGuestReportAccess } from "../../src/report-access/repository.js";
import { GenerationAuthorizationType, type GenerationAuthorization } from "../../src/screening-request/authorization.js";
import { createFakeResendClient } from "../fixtures/fake-resend-client.js";
import { CHECKOUT_SESSION_COOKIE } from "../../src/shared/cookies.js";
// The real deployed Route Handler, called directly - a plain async function taking/returning the
// standard Web Request/Response, so no Next.js server needs to be running. Added 2026-08-28 after
// a real browser test found that testing getGuestReport alone (the earlier version of this file)
// was not enough to catch a bug that only manifested in the actual HTTP round trip's consuming
// client, not the repository layer - this exercises the exact same code path a real browser hits.
import { GET as getCheckoutReport } from "../../app/api/checkout/report/route.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Guest post-checkout report access (2026-08-28 correction) - live Neon integration", () => {
  let db: Db;
  const cleanupScreeningRequestIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    // FK-safe order: report_access_credentials -> evidence_report_artifacts -> report_generation_jobs
    // -> orders -> screening_requests, mirroring tests/account-auth/workflows.integration.test.ts's
    // own established cleanup order for the same table set.
    for (const id of cleanupScreeningRequestIds) {
      const artifacts = await db.select({ id: evidenceReportArtifacts.id }).from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
      for (const artifact of artifacts) {
        await db.delete(reportAccessCredentials).where(eq(reportAccessCredentials.reportArtifactId, artifact.id));
      }
      await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(orders).where(eq(orders.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  });

  /** Creates a fresh screeningRequest + Order in the given state, with a unique
   * stripeCheckoutSessionId this test can then look the order up by - exactly the identity
   * GET /api/checkout/report resolves through in production. */
  async function createOrderFixture(state: "PENDING" | "PAID"): Promise<{ screeningRequestId: string; orderId: string; checkoutSessionId: string }> {
    const [screeningRequest] = await db
      .insert(screeningRequests)
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "SHED", projectDetails: {}, confirmedParcelId: `TEST-PIN-${crypto.randomUUID()}` })
      .returning({ id: screeningRequests.id });
    cleanupScreeningRequestIds.push(screeningRequest!.id);
    const checkoutSessionId = `cs_test_${crypto.randomUUID()}`;
    const [order] = await db
      .insert(orders)
      .values({
        screeningRequestId: screeningRequest!.id,
        state,
        priceCents: 999,
        currency: "usd",
        checkoutCreationIdempotencyKey: crypto.randomUUID(),
        stripeCheckoutSessionId: checkoutSessionId,
        ...(state === "PAID" ? { paidAt: new Date(), stripePaymentIntentId: `pi_test_${crypto.randomUUID()}` } : {}),
      })
      .returning({ id: orders.id });
    return { screeningRequestId: screeningRequest!.id, orderId: order!.id, checkoutSessionId };
  }

  /** Takes a PAID order's fixture all the way to a COMPLETE job with a real EvidenceReportArtifact
   * - the exact terminal state getGuestStatus reports as REPORT_READY. */
  async function completeReportGeneration(screeningRequestId: string, orderId: string): Promise<string> {
    const authorization: GenerationAuthorization = { type: GenerationAuthorizationType.VERIFIED_PAYMENT, screeningRequestId, orderId, authorizedAt: new Date().toISOString() };
    const job = await createReportGenerationJob(db, screeningRequestId, authorization);
    await claimQueuedJob(db, job.id);
    const { artifact } = await createEvidenceReportArtifact(db, {
      screeningRequestId,
      reportGenerationJobId: job.id,
      findings: [{ subject: "Rear Setback", classification: "KNOWN", complianceOutcome: "PASS", explanationBasis: "test", supportingEvidence: [] }],
      evidence: [{ factType: "test-fact", value: 42, provenance: {} }],
      ruleVersionsUsed: [],
      dataRetrievalTimestamps: {},
    });
    await markJobComplete(db, job.id, artifact.id);
    return artifact.id;
  }

  it("[hard invariant] getGuestReport resolves the SAME artifact GET /api/reports would (identical getReportById result), authorized purely by the checkout session id", async () => {
    const { screeningRequestId, orderId, checkoutSessionId } = await createOrderFixture("PAID");
    const artifactId = await completeReportGeneration(screeningRequestId, orderId);

    const result = await getGuestReport(db, checkoutSessionId);
    expect(result).toBeDefined();
    expect(result?.artifact.id).toBe(artifactId);

    const directRead = await getReportById(db, artifactId);
    expect(result?.artifact.findings).toEqual(directRead?.findings);
    expect(result?.artifact.evidence).toEqual(directRead?.evidence);
    expect(result?.artifact.generatedAt).toEqual(directRead?.generatedAt);
  });

  it("getGuestReport returns undefined for a PAID order whose report job is not yet COMPLETE (no report to show yet - never a partial/fabricated one)", async () => {
    const { checkoutSessionId } = await createOrderFixture("PAID");
    // No job created at all yet - mirrors the real PAYMENT_CONFIRMED window between webhook
    // confirmation and the report-generation workflow actually finishing.
    const result = await getGuestReport(db, checkoutSessionId);
    expect(result).toBeUndefined();
  });

  it("getGuestReport returns undefined for a PENDING (unpaid) order - never shows a report before payment is confirmed", async () => {
    const { checkoutSessionId } = await createOrderFixture("PENDING");
    const result = await getGuestReport(db, checkoutSessionId);
    expect(result).toBeUndefined();
  });

  it("getGuestReport returns undefined for an unknown checkout session id", async () => {
    const result = await getGuestReport(db, `cs_test_never_existed_${crypto.randomUUID()}`);
    expect(result).toBeUndefined();
  });

  it("[hard invariant] email delivery failing does not affect getGuestReport's ability to return the report - it only reflects the failure in emailDeliveryStatus", async () => {
    const { screeningRequestId, orderId, checkoutSessionId } = await createOrderFixture("PAID");
    const artifactId = await completeReportGeneration(screeningRequestId, orderId);

    const failingResend = createFakeResendClient({ failWithReason: "simulated send failure" });
    await deliverGuestReportAccess(db, failingResend, "guest@example.com", artifactId);

    const result = await getGuestReport(db, checkoutSessionId);
    expect(result).toBeDefined(); // the report itself is still fully available
    expect(result?.artifact.id).toBe(artifactId);
    expect(result?.emailDeliveryStatus).toBe("EMAIL_FAILED");
  });

  it("email delivery succeeding is reflected in emailDeliveryStatus", async () => {
    const { screeningRequestId, orderId, checkoutSessionId } = await createOrderFixture("PAID");
    const artifactId = await completeReportGeneration(screeningRequestId, orderId);

    const resend = createFakeResendClient();
    await deliverGuestReportAccess(db, resend, "guest@example.com", artifactId);

    const result = await getGuestReport(db, checkoutSessionId);
    expect(result?.emailDeliveryStatus).toBe("EMAIL_SENT");
  });

  /** Constructs the exact Request shape a real browser sends: the checkout-session cookie as an
   * HTTP `Cookie` header, nothing else - matches readCookie's own parsing (a semicolon-separated
   * "name=value" header), not just calling the service function directly. */
  function requestWithCheckoutSession(checkoutSessionId: string): Request {
    return new Request("http://localhost/api/checkout/report", {
      headers: { cookie: `${CHECKOUT_SESSION_COOKIE}=${checkoutSessionId}` },
    });
  }

  describe("GET /api/checkout/report - the actual HTTP route, not just getGuestReport", () => {
    it("[hard invariant] returns a 200 with a complete, non-empty JSON body matching exactly what the checkout-status page's isReportPayload guard requires", async () => {
      const { screeningRequestId, orderId, checkoutSessionId } = await createOrderFixture("PAID");
      const artifactId = await completeReportGeneration(screeningRequestId, orderId);

      const response = await getCheckoutReport(requestWithCheckoutSession(checkoutSessionId));
      expect(response.status).toBe(200);

      // Read the body as text first, not .json() directly - this is the exact class of bug this
      // test exists to catch: an empty/truncated body throws on .json() rather than silently
      // returning something falsy, so asserting on the raw text first gives an unambiguous
      // failure message instead of a generic JSON-parse SyntaxError.
      const rawBody = await response.text();
      expect(rawBody.length).toBeGreaterThan(0);

      const body = JSON.parse(rawBody) as Record<string, unknown>;
      // Exactly the shape app/checkout/status/page.tsx's isReportPayload() requires before it will
      // ever treat a response as a real report - see that function's own docstring.
      expect(typeof body["id"]).toBe("string");
      expect(body["id"]).toBe(artifactId);
      expect(Array.isArray(body["findings"])).toBe(true);
      expect((body["findings"] as unknown[]).length).toBeGreaterThan(0);
      expect(Array.isArray(body["evidence"])).toBe(true);
      expect((body["evidence"] as unknown[]).length).toBeGreaterThan(0);
      expect(typeof body["generatedAt"]).toBe("string");
    });

    it("returns 404 (never a 200 with an unusable body) when there is no checkout-session cookie at all", async () => {
      const response = await getCheckoutReport(new Request("http://localhost/api/checkout/report"));
      expect(response.status).toBe(404);
    });

    it("returns 404 for a PAID order whose report is not yet COMPLETE - never a 200 with a partial/empty body", async () => {
      const { checkoutSessionId } = await createOrderFixture("PAID");
      const response = await getCheckoutReport(requestWithCheckoutSession(checkoutSessionId));
      expect(response.status).toBe(404);
    });
  });
});

describe.skipIf(hasDb)("Guest post-checkout report access - live Neon integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
  });
});
