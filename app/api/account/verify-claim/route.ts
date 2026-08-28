import { getDb } from "../../../../src/db/client.js";
import { completeClaimByEmail } from "../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../src/account-auth/session.js";
import { checkAccountSameOrigin } from "../../../../src/account-auth/csrf.js";
import { accountAuthLocalLimiter } from "../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../src/shared/logger.js";

/**
 * completeClaimByEmail - CORRECTED (NFR Design review): requires BOTH the CLAIM_PURCHASE bearer
 * token AND a matching AccountSession, so this endpoint IS CSRF-protected (NFR-U6-51, extended)
 * despite also depending on a bearer token - it mutates account state (creates an
 * AccountOrderLink) once session-authenticated. A missing/expired/mismatched session and an
 * invalid token both collapse to the same generic response (workflow 3's own no-oracle
 * requirement) - the frontend's own fail-closed messaging (frontend-components.md 2b) does not
 * distinguish which condition occurred.
 */
export async function POST(request: Request) {
  const csrf = checkAccountSameOrigin(request);
  if (csrf.outcome !== "OK") {
    return new Response(null, { status: 403 });
  }

  const db = getDb();
  const session = await resolveAccountSession(request, db);
  if (!session) {
    return invalidOrExpired();
  }

  const sourceKey = sourceKeyFor(request);
  if (accountAuthLocalLimiter.isLimited(sourceKey)) {
    return invalidOrExpired();
  }

  const body = (await request.json()) as { token?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }

  const result = await completeClaimByEmail(body.token, session.accountId);
  if (result.outcome === "INVALID_OR_EXPIRED") {
    accountAuthLocalLimiter.recordFailure(sourceKey);
    if (accountAuthLocalLimiter.isLimited(sourceKey)) {
      logger.warn("RATE_LIMIT_TRIGGERED", { sourceKeyHash: hashSourceKey(sourceKey), endpoint: "verify-claim" });
    }
    return invalidOrExpired();
  }
  if (result.outcome === "ALREADY_LINKED_TO_ANOTHER_ACCOUNT") {
    // A real, actionable outcome, not an auth-oracle risk (frontend-components.md's own
    // reasoning) - the caller already has an active session and a valid token, so this
    // disclosure doesn't help probe anything they don't already know.
    return Response.json({ error: "ALREADY_LINKED_TO_ANOTHER_ACCOUNT" }, { status: 409 });
  }
  return Response.json({ ok: true });
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
