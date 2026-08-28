import { verifyLoginLink } from "../../../../src/account-auth/workflows.js";
import { accountAuthLocalLimiter } from "../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../src/shared/logger.js";
import { ACCOUNT_SESSION_COOKIE, buildSetCookieHeader } from "../../../../src/shared/cookies.js";

const ACCOUNT_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days - matches AccountSession's own TTL (account-auth/types.ts).

/**
 * workflow 2 - fragment-to-POST verification (business-logic-model.md's "Magic-link transport").
 * Bearer-credential-authorized, not session-mutating, so NOT CSRF-protected (NFR-U6-54). Local
 * rate limiting in its existing failure-counting mode.
 */
export async function POST(request: Request) {
  const sourceKey = sourceKeyFor(request);
  if (accountAuthLocalLimiter.isLimited(sourceKey)) {
    return invalidOrExpired();
  }

  const body = (await request.json()) as { token?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }

  const result = await verifyLoginLink(body.token);
  if (result.outcome !== "OK") {
    accountAuthLocalLimiter.recordFailure(sourceKey);
    if (accountAuthLocalLimiter.isLimited(sourceKey)) {
      logger.warn("RATE_LIMIT_TRIGGERED", { sourceKeyHash: hashSourceKey(sourceKey), endpoint: "verify-login" });
    }
    return invalidOrExpired();
  }

  const setCookie = buildSetCookieHeader(request, ACCOUNT_SESSION_COOKIE, result.sessionRawToken, {
    path: "/",
    maxAgeSeconds: ACCOUNT_SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": setCookie } });
}

function invalidOrExpired(): Response {
  return Response.json({ error: "This link is invalid or has expired." }, { status: 400 });
}

function sourceKeyFor(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function hashSourceKey(sourceKey: string): string {
  let hash = 0;
  for (const ch of sourceKey) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return hash.toString(16);
}
