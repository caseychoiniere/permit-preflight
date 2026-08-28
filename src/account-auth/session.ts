/**
 * resolveAccountSession(request) - the shared per-request resolver every account-scoped route
 * calls (NFR-U6-12). Mirrors report-access's own existing resolve-on-every-request pattern. The
 * cookie is a transport, never a trust boundary on its own - every call re-validates against
 * account_sessions.
 */

import type { Db } from "../db/client.js";
import { resolveSession } from "./account-repository.js";
import { ACCOUNT_SESSION_COOKIE, readCookie } from "../shared/cookies.js";

export interface ResolvedAccountSession {
  sessionId: string;
  accountId: string;
}

export async function resolveAccountSession(request: Request, db: Db): Promise<ResolvedAccountSession | undefined> {
  const rawToken = readCookie(request, ACCOUNT_SESSION_COOKIE);
  if (!rawToken) return undefined;
  const resolved = await resolveSession(db, rawToken);
  if (!resolved) return undefined;
  return { sessionId: resolved.id, accountId: resolved.accountId };
}
