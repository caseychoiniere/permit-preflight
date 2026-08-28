import { getDb } from "../../../../../src/db/client.js";
import { createResendClient } from "../../../../../src/email-delivery/resend-client.js";
import { startClaimByEmail } from "../../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../../src/account-auth/session.js";
import { checkAccountSameOrigin } from "../../../../../src/account-auth/csrf.js";
import { accountAuthLocalLimiter } from "../../../../../src/shared/rate-limiter-instance.js";
import { logger } from "../../../../../src/shared/logger.js";

/**
 * claimPurchase Path A, start (workflow 3) - the deliberately SEPARATE route from Path B
 * (Code Generation Part 1 review, correction 2), so the Vercel Firewall rule can scope to this
 * exact email-triggering endpoint without also covering Path B's ordinary, non-email-triggering
 * traffic. Requires an active AccountSession and same-origin CSRF (NFR-U6-51).
 */
export async function POST(request: Request) {
  const csrf = checkAccountSameOrigin(request);
  if (csrf.outcome !== "OK") {
    return new Response(null, { status: 403 });
  }

  const db = getDb();
  const session = await resolveAccountSession(request, db);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const sourceKey = sourceKeyFor(request);
  if (accountAuthLocalLimiter.isLimited(sourceKey)) {
    return Response.json({ ok: true }); // Indistinguishable from the generic success response.
  }

  const body = (await request.json()) as { orderId?: unknown };
  if (typeof body.orderId !== "string" || !body.orderId) {
    return Response.json({ error: "orderId is required." }, { status: 400 });
  }

  accountAuthLocalLimiter.recordFailure(sourceKey); // every-attempt-counts mode (NFR-U6-39).
  if (accountAuthLocalLimiter.isLimited(sourceKey)) {
    logger.warn("RATE_LIMIT_TRIGGERED", { sourceKeyHash: hashSourceKey(sourceKey), endpoint: "claim/email" });
  }

  const result = await startClaimByEmail(db, createResendClient(), session.accountId, body.orderId);
  if (result.outcome === "ORDER_NOT_FOUND") {
    return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
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
