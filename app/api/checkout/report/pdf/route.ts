import { getDb } from "../../../../../src/db/client.js";
import { getGuestReport } from "../../../../../src/checkout-fulfillment/index.js";
import { getOrRenderReportPdf } from "../../../../../src/report-pdf-rendering/repository.js";
import { CHECKOUT_SESSION_COOKIE, readCookie } from "../../../../../src/shared/cookies.js";
import { logger } from "../../../../../src/shared/logger.js";

/**
 * Product-correctness correction (2026-08-28) - PDF counterpart to GET /api/checkout/report, same
 * checkout-session-cookie authorization, same lazy-cached rendering GET /api/reports/pdf already
 * uses (getOrRenderReportPdf never re-runs any part of the evaluation pipeline, and never
 * re-renders once a rendering for this artifact already exists).
 */
export async function GET(request: Request) {
  const sessionId = readCookie(request, CHECKOUT_SESSION_COOKIE);
  if (!sessionId) return notFound();

  const result = await getGuestReport(getDb(), sessionId);
  if (!result) return notFound();

  try {
    const rendering = await getOrRenderReportPdf(getDb(), result.artifact);
    return new Response(new Uint8Array(rendering.bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": "inline; filename=permit-preflight-report.pdf" },
    });
  } catch (err) {
    logger.error("PDF_RENDER_FAILURE", { reportArtifactId: result.artifact.id, reason: err instanceof Error ? err.message : "Unknown error." });
    return Response.json({ error: "PDF rendering failed. The report itself is unaffected." }, { status: 500 });
  }
}

function notFound(): Response {
  return Response.json({ error: "Not found." }, { status: 404 });
}
