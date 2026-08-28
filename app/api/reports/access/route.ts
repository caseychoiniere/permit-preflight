import { getDb } from "../../../../src/db/client.js";
import { findArtifactIdByAccessToken } from "../../../../src/report-access/repository.js";
import { reportLookupLimiter } from "../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../src/shared/logger.js";
import { REPORT_ACCESS_COOKIE, buildSetCookieHeader } from "../../../../src/shared/cookies.js";

const REPORT_ACCESS_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days - convenience for revisiting the same email link later; the actual credential lifetime is governed by ReportAccessCredential.active, unchanged.

/**
 * BR-U2-7, corrected 2026-08-25: exchanges a raw reportAccessToken (received in the request BODY,
 * never a URL) for an HttpOnly session cookie. This is now the primary entry point where the raw
 * token is validated - GET /api/reports and GET /api/reports/pdf trust the cookie this sets, never
 * re-accepting a raw token from a URL again. Same rate-limiting discipline as those routes
 * (Pattern 2) - a failed exchange counts against the source exactly like a failed direct lookup did
 * previously.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { token?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }

  const sourceKey = sourceKeyFor(request);
  if (reportLookupLimiter.isLimited(sourceKey)) {
    return notFound();
  }

  const db = getDb();
  const artifactId = await findArtifactIdByAccessToken(db, body.token);
  if (!artifactId) {
    reportLookupLimiter.recordFailure(sourceKey);
    if (reportLookupLimiter.isLimited(sourceKey)) {
      logger.warn("RATE_LIMIT_TRIGGERED", { sourceKeyHash: hashSourceKey(sourceKey) });
    }
    return notFound();
  }

  const setCookie = buildSetCookieHeader(request, REPORT_ACCESS_COOKIE, body.token, {
    path: "/api/reports",
    maxAgeSeconds: REPORT_ACCESS_COOKIE_MAX_AGE_SECONDS,
  });
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": setCookie } });
}

function notFound(): Response {
  return Response.json({ error: "Not found." }, { status: 404 });
}

function sourceKeyFor(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function hashSourceKey(sourceKey: string): string {
  let hash = 0;
  for (const ch of sourceKey) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return hash.toString(16);
}
