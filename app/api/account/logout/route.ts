import { getDb } from "../../../../src/db/client.js";
import { logout } from "../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../src/account-auth/session.js";
import { checkAccountSameOrigin } from "../../../../src/account-auth/csrf.js";
import { ACCOUNT_SESSION_COOKIE, buildClearCookieHeader } from "../../../../src/shared/cookies.js";

/** logout (workflow 2's logout case) - revokes only the current session, clears the cookie via
 * Set-Cookie on the server response (it is HttpOnly - the client cannot clear it itself, NFR-U6-15).
 * CSRF-protected (NFR-U6-51). */
export async function POST(request: Request) {
  const csrf = checkAccountSameOrigin(request);
  if (csrf.outcome !== "OK") {
    return new Response(null, { status: 403 });
  }

  const db = getDb();
  const session = await resolveAccountSession(request, db);
  const clearCookie = buildClearCookieHeader(request, ACCOUNT_SESSION_COOKIE, "/");
  if (!session) {
    return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": clearCookie } });
  }

  await logout(db, session.sessionId);
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": clearCookie } });
}
