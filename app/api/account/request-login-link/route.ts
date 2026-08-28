import { getDb } from "../../../../src/db/client.js";
import { createResendClient } from "../../../../src/email-delivery/resend-client.js";
import { requestLoginLink } from "../../../../src/account-auth/workflows.js";
import { accountAuthLocalLimiter } from "../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../src/shared/logger.js";

/**
 * workflow 1 - unauthenticated, no session to mutate, so NOT CSRF-protected (NFR-U6-53). Local
 * rate limiting in every-attempt-counts mode (Layer 2 defense-in-depth only - the authoritative
 * deployment-wide control is the Vercel Firewall rule, infrastructure-design.md, not code). Always
 * returns the same generic response regardless of whether an Account already exists for the
 * address (NFR-U6-8 - no account-enumeration oracle).
 */
export async function POST(request: Request) {
  const sourceKey = sourceKeyFor(request);
  if (accountAuthLocalLimiter.isLimited(sourceKey)) {
    return Response.json({ ok: true }); // Indistinguishable from the generic success response.
  }

  const body = (await request.json()) as { email?: unknown };
  if (typeof body.email !== "string" || !body.email) {
    return Response.json({ error: "email is required." }, { status: 400 });
  }

  accountAuthLocalLimiter.recordFailure(sourceKey); // every-attempt-counts mode - no separate failure signal exists for this endpoint (NFR-U6-39).
  if (accountAuthLocalLimiter.isLimited(sourceKey)) {
    logger.warn("RATE_LIMIT_TRIGGERED", { sourceKeyHash: hashSourceKey(sourceKey), endpoint: "request-login-link" });
  }

  try {
    await requestLoginLink(getDb(), createResendClient(), body.email);
  } catch (error) {
    logger.error("LOGIN_LINK_REQUEST_FAILED", { reason: error instanceof Error ? error.message : String(error) });
  }

  return Response.json({ ok: true });
}

function sourceKeyFor(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function hashSourceKey(sourceKey: string): string {
  let hash = 0;
  for (const ch of sourceKey) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return hash.toString(16);
}
