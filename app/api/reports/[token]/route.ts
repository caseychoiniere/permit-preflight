import { getDb } from "../../../../src/db/client.js";
import { findArtifactIdByAccessToken } from "../../../../src/report-access/repository.js";
import { getReportById } from "../../../../src/evidence-report-artifact/index.js";
import { reportLookupLimiter } from "../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../src/shared/logger.js";

/**
 * BR-U2-7: resolves reportAccessToken -> EvidenceReportArtifact. Never accepts or is reachable
 * by a bare reportId from a client - the [token] route param IS the credential, not an id.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sourceKey = sourceKeyFor(request);

  if (reportLookupLimiter.isLimited(sourceKey)) {
    return notFound(); // Rate-limited and NOT_FOUND are indistinguishable to the caller (Pattern 2).
  }

  const db = getDb();
  const artifactId = await findArtifactIdByAccessToken(db, token);
  if (!artifactId) {
    reportLookupLimiter.recordFailure(sourceKey);
    if (reportLookupLimiter.isLimited(sourceKey)) {
      logger.warn("RATE_LIMIT_TRIGGERED", { sourceKeyHash: hashSourceKey(sourceKey) });
    }
    return notFound();
  }

  const artifact = await getReportById(db, artifactId);
  if (!artifact) return notFound();

  return Response.json({
    id: artifact.id,
    findings: artifact.findings,
    evidence: artifact.evidence,
    explanation: artifact.explanation,
    generatedAt: artifact.generatedAt,
    ruleVersionsUsed: artifact.ruleVersionsUsed,
  });
}

function notFound(): Response {
  return Response.json({ error: "Not found." }, { status: 404 });
}

/** Server-derived source identity for rate limiting - never a raw client-supplied
 * X-Forwarded-For value taken at face value (NFR-U2-4/Infrastructure Design Q3). Railway's actual
 * trusted-proxy header must be confirmed during deployment; this reads the platform-provided
 * remote address as the practical source key for the prototype. */
function sourceKeyFor(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function hashSourceKey(sourceKey: string): string {
  // Never log a raw client identifier alongside a failed-token event - a coarse, non-reversible
  // marker is enough for operator visibility.
  let hash = 0;
  for (const ch of sourceKey) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return hash.toString(16);
}
