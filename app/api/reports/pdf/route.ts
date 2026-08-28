import { getDb } from "../../../../src/db/client.js";
import { findArtifactIdByAccessToken } from "../../../../src/report-access/repository.js";
import { getReportById } from "../../../../src/evidence-report-artifact/index.js";
import { getOrRenderReportPdf } from "../../../../src/report-pdf-rendering/repository.js";
import { reportLookupLimiter } from "../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../src/shared/logger.js";
import { REPORT_ACCESS_COOKIE, readCookie } from "../../../../src/shared/cookies.js";

/** RGD-3: same cookie-based authorization as GET /api/reports (BR-U2-7, corrected 2026-08-25) -
 * lazy, cached PDF rendering (NFR Design Pattern 6). Never re-runs any part of the evaluation
 * pipeline. Deliberately reuses the exact same report-access mechanism/cookie rather than a
 * second, PDF-specific credential system. */
export async function GET(request: Request) {
  const sourceKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (reportLookupLimiter.isLimited(sourceKey)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const token = readCookie(request, REPORT_ACCESS_COOKIE);
  if (!token) return Response.json({ error: "Not found." }, { status: 404 });

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
