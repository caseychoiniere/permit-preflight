import { getDb } from "../../../../../src/db/client.js";
import { getOrderById } from "../../../../../src/order-payment/repository.js";
import { toAdminOrderView } from "../../../../../src/order-payment/admin-view.js";
import { getReportGenerationJobsByScreeningRequestId } from "../../../../../src/report-generation-job/repository.js";
import { listAccessCredentialSummaries } from "../../../../../src/report-access/repository.js";

/**
 * ADM-5: order detail, correlated with its ReportGenerationJob(s) and, per completed job, its
 * access-credential operational metadata only - never raw tokens or token hashes (ADM-1 through
 * ADM-8 never require sending credential material to the browser).
 *
 * Corrected 2026-08-25: returns AdminOrderView (order-payment/admin-view.ts), never the raw
 * `Order` domain object - `checkoutCreationIdempotencyKey`, `refundIdempotencyKey`, and
 * `stripeCheckoutSessionId` must never reach the admin browser.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const db = getDb();

  const order = await getOrderById(db, orderId);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  const jobs = await getReportGenerationJobsByScreeningRequestId(db, order.screeningRequestId);
  const jobsWithCredentials = await Promise.all(
    jobs.map(async (job) => ({
      id: job.id,
      state: job.state,
      failureReasons: job.failureReasons,
      evidenceReportArtifactId: job.evidenceReportArtifactId ?? undefined,
      accessCredentials: job.evidenceReportArtifactId ? await listAccessCredentialSummaries(db, job.evidenceReportArtifactId) : [],
    }))
  );

  return Response.json({ order: toAdminOrderView(order), reportGenerationJobs: jobsWithCredentials });
}
