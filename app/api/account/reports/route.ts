import { getDb } from "../../../../src/db/client.js";
import { listReportHistory } from "../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../src/account-auth/session.js";

/** listReportHistory (workflow 4a) - accountId comes only from the resolved AccountSession, never
 * a request parameter (NFR-U6-18). Not a mutation - no CSRF check needed. */
export async function GET(request: Request) {
  const db = getDb();
  const session = await resolveAccountSession(request, db);
  if (!session) {
    return new Response(null, { status: 401 });
  }
  const entries = await listReportHistory(db, session.accountId);
  return Response.json({ reports: entries });
}
