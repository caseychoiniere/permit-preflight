import { getDb } from "../../../../src/db/client.js";
import { deleteAccount } from "../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../src/account-auth/session.js";
import { checkAccountSameOrigin } from "../../../../src/account-auth/csrf.js";
import { ACCOUNT_SESSION_COOKIE, buildClearCookieHeader } from "../../../../src/shared/cookies.js";

/** deleteAccount (workflow 5, BR-U6-5) - immediate, no confirmation step server-side beyond
 * requiring an active session and CSRF pass (the confirmation UI itself lives client-side,
 * frontend-components.md). Clears the session cookie server-side on success (NFR-U6-16). */
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

  await deleteAccount(session.accountId);

  const clearCookie = buildClearCookieHeader(request, ACCOUNT_SESSION_COOKIE, "/");
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": clearCookie } });
}
