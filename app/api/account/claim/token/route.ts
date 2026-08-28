import { getDb } from "../../../../../src/db/client.js";
import { claimByReportToken } from "../../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../../src/account-auth/session.js";
import { checkAccountSameOrigin } from "../../../../../src/account-auth/csrf.js";

/**
 * claimPurchase Path B (workflow 3) - the deliberately SEPARATE route from Path A's email-trigger
 * endpoint (Code Generation Part 1 review, correction 2): synchronous, not email-triggering, so
 * it is NOT scoped by the Vercel Firewall rule (that rule protects only the email-triggering
 * surfaces NFR-U6-37 names). Still requires an active AccountSession and same-origin CSRF
 * (NFR-U6-51) - it mutates account state.
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

  const body = (await request.json()) as { token?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }

  const result = await claimByReportToken(db, session.accountId, body.token);
  if (result.outcome === "INVALID_TOKEN" || result.outcome === "ORDER_NOT_FOUND") {
    return Response.json({ error: result.outcome }, { status: 404 });
  }
  if (result.outcome === "ALREADY_LINKED_TO_ANOTHER_ACCOUNT") {
    return Response.json({ error: "ALREADY_LINKED_TO_ANOTHER_ACCOUNT" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
