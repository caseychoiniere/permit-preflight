/**
 * Unit 6 workflows (business-logic-model.md) - orchestrates the repository functions; no direct
 * DB access of its own beyond what withAccountTransaction/getDb-style Executors provide.
 */

import type { Db } from "../db/client.js";
import { withAccountTransaction } from "../db/client.js";
import type { ResendClient } from "../email-delivery/resend-client.js";
import { sendClaimLinkEmail, sendLoginLinkEmail } from "../email-delivery/account-templates.js";
import { orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { consumeClaimToken, consumeLoginToken, deleteOutstandingClaimTokensByAccount, deleteOutstandingLoginTokensByEmail, insertClaimToken, insertLoginToken } from "./token-repository.js";
import { createSession, deleteAccountRow, deleteAllSessionsForAccount, findOrCreateAccount, getAccountEmail, revokeSession } from "./account-repository.js";
import { accountOwnsOrder, createLink, deleteLinksForAccount, listLinksForAccount, type AccountReportHistoryEntry } from "./link-repository.js";
import { resolveArtifactIdForOrder, resolveOrderByReportToken } from "./report-access.js";
import type { PurchaseLinkMethod } from "./types.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** requestLoginLink (workflow 1) - always returns the same generic outcome regardless of whether
 * an Account already exists for the address (BR-U6-1/NFR-U6-8's no-account-enumeration-oracle
 * requirement). */
export async function requestLoginLink(db: Db, resendClient: ResendClient, email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const credential = await insertLoginToken(db, normalized);
  await sendLoginLinkEmail(resendClient, normalized, credential.rawToken);
}

export type VerifyLoginLinkResult = { outcome: "OK"; accountId: string; sessionRawToken: string } | { outcome: "INVALID_OR_EXPIRED" };

/** verifyLoginLink (workflow 2) - atomic consumption + Account find-or-create + AccountSession
 * creation inside one transaction; rolls back entirely if any step fails. */
export async function verifyLoginLink(rawToken: string): Promise<VerifyLoginLinkResult> {
  return withAccountTransaction(async (tx) => {
    const consumed = await consumeLoginToken(tx, rawToken);
    if (!consumed) return { outcome: "INVALID_OR_EXPIRED" };
    const account = await findOrCreateAccount(tx, consumed.email);
    const sessionCredential = await createSession(tx, account.id);
    return { outcome: "OK", accountId: account.id, sessionRawToken: sessionCredential.rawToken };
  });
}

/** logout - revokes only the specific session used to call it. */
export async function logout(db: Db, sessionId: string): Promise<void> {
  await revokeSession(db, sessionId);
}

export type StartClaimByEmailResult = { outcome: "SENT" } | { outcome: "ORDER_NOT_FOUND" };

/** claimPurchase Path A, start (workflow 3) - the email target is read from the Order's own
 * customerEmail, NEVER client-supplied (BR-U6-3 invariant 1). Requires an already-authenticated
 * sessionAccountId. */
export async function startClaimByEmail(db: Db, resendClient: ResendClient, sessionAccountId: string, orderId: string): Promise<StartClaimByEmailResult> {
  const [order] = await db.select({ customerEmail: orders.customerEmail }).from(orders).where(eq(orders.id, orderId));
  if (!order?.customerEmail) return { outcome: "ORDER_NOT_FOUND" };
  const credential = await insertClaimToken(db, order.customerEmail, sessionAccountId, orderId);
  await sendClaimLinkEmail(resendClient, order.customerEmail, credential.rawToken);
  return { outcome: "SENT" };
}

export type CompleteClaimResult = { outcome: "LINKED" | "ALREADY_LINKED_SAME_ACCOUNT" } | { outcome: "ALREADY_LINKED_TO_ANOTHER_ACCOUNT" } | { outcome: "INVALID_OR_EXPIRED" };

/**
 * claimPurchase Path A, completion (workflow 3, corrected) - requires BOTH a valid
 * CLAIM_PURCHASE token AND a matching AccountSession (token.accountId === sessionAccountId,
 * enforced inside the atomic consumption statement itself, never checked-then-trusted
 * separately). Session resolution -> account-bound consumption -> link creation execute inside one
 * transaction; rolls back the token consumption on an infrastructure failure in link creation
 * (ALREADY_LINKED_TO_ANOTHER_ACCOUNT / idempotent success are valid completions, never rolled
 * back).
 */
export async function completeClaimByEmail(rawToken: string, sessionAccountId: string): Promise<CompleteClaimResult> {
  return withAccountTransaction(async (tx) => {
    const consumed = await consumeClaimToken(tx, rawToken, sessionAccountId);
    if (!consumed) return { outcome: "INVALID_OR_EXPIRED" };
    const result = await createLink(tx, consumed.accountId, consumed.orderId, "EMAIL_VERIFICATION");
    if (result.outcome === "ALREADY_LINKED_TO_ANOTHER_ACCOUNT") return result;
    return { outcome: result.outcome === "CREATED" ? "LINKED" : "ALREADY_LINKED_SAME_ACCOUNT" };
  });
}

export type ClaimByReportTokenResult = { outcome: "LINKED" | "ALREADY_LINKED_SAME_ACCOUNT" } | { outcome: "ALREADY_LINKED_TO_ANOTHER_ACCOUNT" } | { outcome: "INVALID_TOKEN" } | { outcome: "ORDER_NOT_FOUND" };

/** claimPurchase Path B (workflow 3) - possession of a valid, PAID-order-eligible report-access
 * bearer token is the proof; no further email check. Never modifies/rotates the guest
 * credential. */
export async function claimByReportToken(db: Db, sessionAccountId: string, rawReportToken: string): Promise<ClaimByReportTokenResult> {
  const resolved = await resolveOrderByReportToken(db, rawReportToken);
  if (resolved.outcome !== "FOUND") return resolved;
  // createLink runs inside a (single-statement) transaction purely for type consistency with its
  // other call site (completeClaimByEmail) - the conflict-safe ON CONFLICT insert is already
  // race-safe on its own without this wrapper; no additional atomicity is required here.
  const result = await withAccountTransaction((tx) => createLink(tx, sessionAccountId, resolved.orderId, "REPORT_ACCESS_TOKEN" satisfies PurchaseLinkMethod));
  if (result.outcome === "ALREADY_LINKED_TO_ANOTHER_ACCOUNT") return result;
  return { outcome: result.outcome === "CREATED" ? "LINKED" : "ALREADY_LINKED_SAME_ACCOUNT" };
}

/** listReportHistory (workflow 4a). */
export async function listReportHistory(db: Db, accountId: string): Promise<AccountReportHistoryEntry[]> {
  return listLinksForAccount(db, accountId);
}

export type GetAccountReportResult = { outcome: "FOUND"; artifactId: string } | { outcome: "FORBIDDEN" };

/** getAccountReport (workflow 4b, BR-U6-4 Mode B) - accountId comes only from the resolved
 * session (enforced by the caller, never by this function accepting one from elsewhere). */
export async function getAccountReport(db: Db, accountId: string, orderId: string): Promise<GetAccountReportResult> {
  const owns = await accountOwnsOrder(db, accountId, orderId);
  if (!owns) return { outcome: "FORBIDDEN" };
  const artifactId = await resolveArtifactIdForOrder(db, orderId);
  if (!artifactId) return { outcome: "FORBIDDEN" };
  return { outcome: "FOUND", artifactId };
}

/** deleteAccount (workflow 5, BR-U6-5) - one transaction. Captures the normalized email BEFORE
 * deleting the Account row, since outstanding LOGIN tokens must be found by email (they carry no
 * accountId). No statement in this transaction targets orders/evidenceReportArtifacts/
 * reportAccessCredentials/adminActionLog. */
export async function deleteAccount(accountId: string): Promise<void> {
  await withAccountTransaction(async (tx) => {
    const email = await getAccountEmail(tx, accountId);
    await deleteAllSessionsForAccount(tx, accountId);
    await deleteOutstandingClaimTokensByAccount(tx, accountId);
    if (email) await deleteOutstandingLoginTokensByEmail(tx, email);
    await deleteLinksForAccount(tx, accountId);
    await deleteAccountRow(tx, accountId);
  });
}
