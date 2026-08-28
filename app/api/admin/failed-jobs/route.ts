import { getDb } from "../../../../src/db/client.js";
import { listFailedJobs, resolveOrderIdFromAuthorization } from "../../../../src/report-generation-job/repository.js";
import type { GenerationAuthorization } from "../../../../src/screening-request/authorization.js";

/**
 * ADM-4: read-only. No action endpoint of any kind exists anywhere under this path - no
 * FAILED-job retry mechanism is introduced anywhere in Unit 3.
 *
 * Corrected 2026-08-25: exposes retryAttempts/createdAt/updatedAt and the affected Order (when
 * one exists) so the operator never has to correlate screeningRequestId manually against another
 * screen. The order correlation reads generationAuthorization.orderId directly off the SAME job
 * row (VERIFIED_PAYMENT jobs only) - precise and unambiguous, unlike re-deriving it via
 * screeningRequestId, which could match an unrelated PENDING/EXPIRED order for the same request.
 * An INTERNAL_PROTOTYPE job truthfully has no orderId - never invented.
 */
export async function GET() {
  const db = getDb();
  const jobs = await listFailedJobs(db);

  const enriched = jobs.map((job) => {
    const authorization = job.generationAuthorization as GenerationAuthorization;
    const orderId = resolveOrderIdFromAuthorization(authorization);
    return {
      id: job.id,
      screeningRequestId: job.screeningRequestId,
      failureReasons: job.failureReasons as string[],
      retryAttempts: job.retryAttempts,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      authorizationType: authorization.type,
      orderId,
    };
  });

  return Response.json({ jobs: enriched });
}
