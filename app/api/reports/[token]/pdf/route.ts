import { getDb } from "../../../../../src/db/client.js";
import { findArtifactIdByAccessToken } from "../../../../../src/report-access/repository.js";
import { getReportById } from "../../../../../src/evidence-report-artifact/index.js";
import { getOrRenderReportPdf } from "../../../../../src/report-pdf-rendering/repository.js";
import { reportLookupLimiter } from "../../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../../src/shared/logger.js";

/** RGD-3: same token-based authorization as the report route (BR-U2-7) - lazy, cached PDF
 * rendering (NFR Design Pattern 6). Never re-runs any part of the evaluation pipeline. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sourceKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (reportLookupLimiter.isLimited(sourceKey)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getDb();
  const artifactId = await findArtifactIdByAccessToken(db, token);
  if (!artifactId) {
    reportLookupLimiter.recordFailure(sourceKey);
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const artifact = await getReportById(db, artifactId);
  if (!artifact) return Response.json({ error: "Not found." }, { status: 404 });

  try {
    const rendering = await getOrRenderReportPdf(db, artifact);
    return new Response(new Uint8Array(rendering.bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": "inline; filename=permit-preflight-report.pdf" },
    });
  } catch (err) {
    logger.error("PDF_RENDER_FAILURE", { reportArtifactId: artifactId, reason: err instanceof Error ? err.message : "Unknown error." });
    return Response.json({ error: "PDF rendering failed. The report itself is unaffected." }, { status: 500 });
  }
}
