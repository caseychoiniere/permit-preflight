import { getDb } from "../../../../../../src/db/client.js";
import { getAccountReport } from "../../../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../../../src/account-auth/session.js";
import { getReportById } from "../../../../../../src/evidence-report-artifact/index.js";
import { getOrRenderReportPdf } from "../../../../../../src/report-pdf-rendering/repository.js";
import { logger } from "../../../../../../src/shared/logger.js";

/**
 * Account Access PDF (BR-U6-4 Mode B) - Unit 6 Code Generation Part 2 review, correction 1. The
 * PDF counterpart to GET /api/account/reports/[orderId]: the SAME authorization chain
 * (AccountSession -> getAccountReport's AccountOrderLink check -> existing EvidenceReportArtifact)
 * and the SAME lazy-cached renderer (getOrRenderReportPdf) the guest GET /api/reports/pdf and the
 * post-checkout GET /api/checkout/report/pdf already use. It never mints, recovers, or reads a
 * guest reportAccessToken - Mode B is entirely independent of Mode A. A FORBIDDEN outcome is
 * returned as 404 identically whether the order doesn't exist, belongs to no account, or belongs
 * to a different account (NFR-U6-21).
 */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const db = getDb();

  const session = await resolveAccountSession(request, db);
  if (!session) return notFound();

  const result = await getAccountReport(db, session.accountId, orderId);
  if (result.outcome !== "FOUND") return notFound();

  const artifact = await getReportById(db, result.artifactId);
  if (!artifact) return notFound();

  try {
    const rendering = await getOrRenderReportPdf(db, artifact);
    return new Response(new Uint8Array(rendering.bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": "inline; filename=permit-preflight-report.pdf" },
    });
  } catch (err) {
    logger.error("PDF_RENDER_FAILURE", { reportArtifactId: artifact.id, reason: err instanceof Error ? err.message : "Unknown error." });
    return Response.json({ error: "PDF rendering failed. The report itself is unaffected." }, { status: 500 });
  }
}

function notFound(): Response {
  return Response.json({ error: "Not found." }, { status: 404 });
}
