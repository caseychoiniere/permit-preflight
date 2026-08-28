/**
 * MagicLinkToken persistence (NFR Design Pattern 1). Insertion and the atomic conditional
 * consumption statement - the ONE implementation of "single-use" for both LOGIN and CLAIM_PURCHASE
 * purposes (NFR-U6-26, corrected per NFR Design review for CLAIM_PURCHASE's account-binding).
 */

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db, TransactionalDb } from "../db/client.js";
import { magicLinkTokens } from "../db/schema.js";
import { generateAccessCredential, hashToken, type AccessCredential } from "../report-access/credential.js";
import { MagicLinkPurpose, MAGIC_LINK_TOKEN_TTL_MS } from "./types.js";

/** Issues a new LOGIN token - no accountId/orderId (there is no account to log into yet). Always
 * called outside a transaction (requestLoginLink). */
export async function insertLoginToken(db: Db, email: string): Promise<AccessCredential> {
  const credential = generateAccessCredential();
  await db.insert(magicLinkTokens).values({
    purpose: MagicLinkPurpose.LOGIN,
    tokenHash: credential.tokenHash,
    email,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TOKEN_TTL_MS),
  });
  return credential;
}

/** Issues a new CLAIM_PURCHASE token, bound to the account that started the claim and the order
 * being claimed - email is the Order's own customerEmail, never client-supplied (BR-U6-3
 * invariant 1). Always called outside a transaction (startClaimByEmail). */
export async function insertClaimToken(db: Db, email: string, accountId: string, orderId: string): Promise<AccessCredential> {
  const credential = generateAccessCredential();
  await db.insert(magicLinkTokens).values({
    purpose: MagicLinkPurpose.CLAIM_PURCHASE,
    tokenHash: credential.tokenHash,
    email,
    accountId,
    orderId,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TOKEN_TTL_MS),
  });
  return credential;
}

export interface ConsumedLoginToken {
  id: string;
  email: string;
}

/** The atomic conditional consumption statement for LOGIN tokens - a single UPDATE ... RETURNING,
 * not a read-then-write. Exactly one concurrent caller can ever receive a returned row for a given
 * token; every other concurrent/later attempt (unknown/expired/already-consumed/lost-the-race)
 * returns undefined, mapped uniformly by the caller to INVALID_OR_EXPIRED. Always called inside
 * withAccountTransaction (verifyLoginLink). */
export async function consumeLoginToken(tx: TransactionalDb, rawToken: string): Promise<ConsumedLoginToken | undefined> {
  const tokenHash = hashToken(rawToken);
  const [row] = await tx
    .update(magicLinkTokens)
    .set({ consumedAt: sql`now()` })
    .where(and(eq(magicLinkTokens.tokenHash, tokenHash), eq(magicLinkTokens.purpose, MagicLinkPurpose.LOGIN), isNull(magicLinkTokens.consumedAt), gt(magicLinkTokens.expiresAt, sql`now()`)))
    .returning({ id: magicLinkTokens.id, email: magicLinkTokens.email });
  return row;
}

export interface ConsumedClaimToken {
  id: string;
  accountId: string;
  orderId: string;
}

/**
 * The atomic conditional consumption statement for CLAIM_PURCHASE tokens - corrected per Code
 * Generation review (originally an NFR Design correction): additionally conditioned on
 * accountId matching the CURRENT SESSION's own accountId, never trusted from the token row itself
 * before this check. A valid, unexpired, unconsumed token presented under no session, an
 * expired/revoked session, or a different account's session matches zero rows -
 * indistinguishable from unknown/expired/already-consumed (NFR-U6-7's no-oracle principle,
 * extended here). Always called inside withAccountTransaction (completeClaimByEmail).
 */
export async function consumeClaimToken(tx: TransactionalDb, rawToken: string, sessionAccountId: string): Promise<ConsumedClaimToken | undefined> {
  const tokenHash = hashToken(rawToken);
  const [row] = await tx
    .update(magicLinkTokens)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(magicLinkTokens.tokenHash, tokenHash),
        eq(magicLinkTokens.purpose, MagicLinkPurpose.CLAIM_PURCHASE),
        eq(magicLinkTokens.accountId, sessionAccountId),
        isNull(magicLinkTokens.consumedAt),
        gt(magicLinkTokens.expiresAt, sql`now()`)
      )
    )
    .returning({ id: magicLinkTokens.id, accountId: magicLinkTokens.accountId, orderId: magicLinkTokens.orderId });
  if (!row?.accountId || !row.orderId) return undefined;
  return { id: row.id, accountId: row.accountId, orderId: row.orderId };
}

/** Account deletion (BR-U6-5) - deletes outstanding CLAIM_PURCHASE tokens by accountId (the FK's
 * own ON DELETE CASCADE also covers this, but the deleteAccount transaction performs it explicitly
 * as the actual business operation, not relying on the FK alone - Code Generation Part 1 review,
 * invariant C). */
export async function deleteOutstandingClaimTokensByAccount(tx: TransactionalDb, accountId: string): Promise<void> {
  await tx.delete(magicLinkTokens).where(and(eq(magicLinkTokens.accountId, accountId), eq(magicLinkTokens.purpose, MagicLinkPurpose.CLAIM_PURCHASE)));
}

/** Account deletion (BR-U6-5) - deletes outstanding LOGIN tokens by the account's own NORMALIZED
 * EMAIL, captured before the Account row is deleted. LOGIN tokens carry no accountId by the
 * purpose-shape CHECK constraint's own design, so no FK on accountId can ever reach them - this
 * has no FK equivalent and must remain an explicit application-level step (Functional Design
 * correction 3, restated as a hard requirement in NFR-U6-33). */
export async function deleteOutstandingLoginTokensByEmail(tx: TransactionalDb, email: string): Promise<void> {
  await tx.delete(magicLinkTokens).where(and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.purpose, MagicLinkPurpose.LOGIN), isNull(magicLinkTokens.consumedAt), gt(magicLinkTokens.expiresAt, sql`now()`)));
}
