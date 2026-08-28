/**
 * Account + AccountSession persistence. Account find-or-create uses the transaction-safe
 * INSERT ... ON CONFLICT DO NOTHING RETURNING ... + fallback SELECT strategy (NFR Design
 * Pattern 4) - never a raw caught UNIQUE violation, which would abort the enclosing transaction.
 */

import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db, TransactionalDb } from "../db/client.js";
import { accounts, accountSessions } from "../db/schema.js";
import { generateAccessCredential, hashToken, resolveByAccessToken, type AccessCredential, type CredentialStore } from "../report-access/credential.js";
import { ACCOUNT_SESSION_TTL_MS } from "./types.js";

export interface AccountRecord {
  id: string;
  email: string;
}

/** Transaction-safe find-or-create - the INSERT never raises a constraint-violation error (ON
 * CONFLICT DO NOTHING), so the enclosing transaction is never aborted by a concurrent winner; a
 * zero-row result is resolved with a follow-up SELECT for the now-authoritative existing row. */
export async function findOrCreateAccount(tx: TransactionalDb, email: string): Promise<AccountRecord> {
  const [inserted] = await tx.insert(accounts).values({ email }).onConflictDoNothing({ target: accounts.email }).returning({ id: accounts.id, email: accounts.email });
  if (inserted) return inserted;
  const [existing] = await tx.select({ id: accounts.id, email: accounts.email }).from(accounts).where(eq(accounts.email, email));
  if (!existing) {
    // Structurally unreachable under normal operation (the INSERT only returns zero rows on a
    // real conflict, which means a row with this email must exist) - defensive, not expected.
    throw new Error("findOrCreateAccount: insert conflicted but no existing row was found.");
  }
  return existing;
}

/** Captures the account's own normalized email before deletion (BR-U6-5) - needed to find
 * outstanding LOGIN tokens, which carry no accountId. */
export async function getAccountEmail(tx: TransactionalDb, accountId: string): Promise<string | undefined> {
  const [row] = await tx.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, accountId));
  return row?.email;
}

export async function deleteAccountRow(tx: TransactionalDb, accountId: string): Promise<void> {
  await tx.delete(accounts).where(eq(accounts.id, accountId));
}

/** Issues a new, separate AccountSession credential - never reuses the magic-link token's own
 * value (NFR-U6-10). */
export async function createSession(tx: TransactionalDb, accountId: string): Promise<AccessCredential> {
  const credential = generateAccessCredential();
  await tx.insert(accountSessions).values({
    accountId,
    tokenHash: credential.tokenHash,
    expiresAt: new Date(Date.now() + ACCOUNT_SESSION_TTL_MS),
  });
  return credential;
}

export interface ResolvedSession {
  id: string;
  accountId: string;
}

/** Resolves a raw session token to its accountId - re-validated server-side on every request
 * (NFR-U6-12), never trusted from cookie presence alone. Reuses the existing
 * resolveByAccessToken/CredentialStore pattern, matching report-access's own precedent exactly.
 * Always called outside a transaction (session.ts's resolveAccountSession). */
export async function resolveSession(db: Db, rawToken: string): Promise<ResolvedSession | undefined> {
  const store: CredentialStore<ResolvedSession> = {
    findActiveByHash: async (tokenHash) => {
      const [row] = await db
        .select({ id: accountSessions.id, accountId: accountSessions.accountId })
        .from(accountSessions)
        .where(and(eq(accountSessions.tokenHash, tokenHash), isNull(accountSessions.revokedAt), gt(accountSessions.expiresAt, new Date())));
      return row;
    },
  };
  const result = await resolveByAccessToken(rawToken, store);
  return result.outcome === "FOUND" ? result.report : undefined;
}

/** Logout - revokes only the specific session used to call it, not every session for the
 * account. Always called outside a transaction (workflows.ts's logout). */
export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.update(accountSessions).set({ revokedAt: new Date() }).where(eq(accountSessions.id, sessionId));
}

/** Account deletion (BR-U6-5) - revokes/deletes every session for the account (not only the one
 * used to authorize the request). The accountId FK's own ON DELETE CASCADE also covers this, but
 * the deleteAccount transaction performs it explicitly (invariant C, Code Generation Part 1
 * review). */
export async function deleteAllSessionsForAccount(tx: TransactionalDb, accountId: string): Promise<void> {
  await tx.delete(accountSessions).where(eq(accountSessions.accountId, accountId));
}
