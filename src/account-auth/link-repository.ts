/**
 * AccountOrderLink persistence (BR-U6-3, BR-U6-4). Race-safe conflict resolution via
 * INSERT ... ON CONFLICT (order_id) DO NOTHING RETURNING ... + fallback SELECT (NFR Design
 * Pattern 4) - the same accountId -> idempotent success; a different accountId ->
 * ALREADY_LINKED_TO_ANOTHER_ACCOUNT. Never a SELECT-then-INSERT pre-check, which would leave a
 * real race window.
 */

import { and, eq } from "drizzle-orm";
import type { Db, TransactionalDb } from "../db/client.js";
import { accountOrderLinks, orders, screeningRequests } from "../db/schema.js";
import type { PurchaseLinkMethod } from "./types.js";

export interface LinkRecord {
  id: string;
  accountId: string;
  orderId: string;
  linkMethod: PurchaseLinkMethod;
}

export type CreateLinkResult = { outcome: "CREATED" | "ALREADY_LINKED_SAME_ACCOUNT"; link: LinkRecord } | { outcome: "ALREADY_LINKED_TO_ANOTHER_ACCOUNT" };

/** Attempts to create the link. On a real conflict (order_id already present), re-queries the
 * now-authoritative existing row rather than trusting the failed insert's own intent. */
export async function createLink(tx: TransactionalDb, accountId: string, orderId: string, linkMethod: PurchaseLinkMethod): Promise<CreateLinkResult> {
  const [inserted] = await tx
    .insert(accountOrderLinks)
    .values({ accountId, orderId, linkMethod })
    .onConflictDoNothing({ target: accountOrderLinks.orderId })
    .returning({ id: accountOrderLinks.id, accountId: accountOrderLinks.accountId, orderId: accountOrderLinks.orderId, linkMethod: accountOrderLinks.linkMethod });
  if (inserted) return { outcome: "CREATED", link: inserted };

  const [existing] = await tx
    .select({ id: accountOrderLinks.id, accountId: accountOrderLinks.accountId, orderId: accountOrderLinks.orderId, linkMethod: accountOrderLinks.linkMethod })
    .from(accountOrderLinks)
    .where(eq(accountOrderLinks.orderId, orderId));
  if (!existing) {
    throw new Error("createLink: insert conflicted but no existing row was found.");
  }
  if (existing.accountId === accountId) return { outcome: "ALREADY_LINKED_SAME_ACCOUNT", link: existing };
  return { outcome: "ALREADY_LINKED_TO_ANOTHER_ACCOUNT" };
}

export interface AccountReportHistoryEntry {
  orderId: string;
  linkedAt: string;
  linkMethod: PurchaseLinkMethod;
  orderState: string;
  screeningRequestId: string;
  /** Unit 6 Code Generation Part 2 review, correction 4 - existing fields (never a new
   * identifier/column) joined through Order -> ScreeningRequest so a repeat customer can tell one
   * past screening from another. `workflowType` is always present; `projectType` is null for a
   * VACANT_LAND screening (BR-U5-1's discriminated shape); `confirmedParcelId` is the parcel the
   * customer confirmed at the start of the flow (the best truthful property identifier persisted
   * today - no canonical customer-entered address is stored); `paidAt` is null until the Order
   * reaches PAID. */
  workflowType: string;
  projectType: string | null;
  confirmedParcelId: string;
  paidAt: string | null;
}

/** listReportHistory (workflow 4a) - scoped by the session-resolved accountId alone. Structurally
 * incapable of returning another account's rows, since no other account's id is ever available to
 * this query. Always called outside a transaction (workflows.ts's listReportHistory). */
export async function listLinksForAccount(db: Db, accountId: string): Promise<AccountReportHistoryEntry[]> {
  const rows = await db
    .select({
      orderId: accountOrderLinks.orderId,
      linkedAt: accountOrderLinks.linkedAt,
      linkMethod: accountOrderLinks.linkMethod,
      orderState: orders.state,
      screeningRequestId: orders.screeningRequestId,
      paidAt: orders.paidAt,
      workflowType: screeningRequests.workflowType,
      projectType: screeningRequests.projectType,
      confirmedParcelId: screeningRequests.confirmedParcelId,
    })
    .from(accountOrderLinks)
    .innerJoin(orders, eq(orders.id, accountOrderLinks.orderId))
    .innerJoin(screeningRequests, eq(screeningRequests.id, orders.screeningRequestId))
    .where(eq(accountOrderLinks.accountId, accountId));
  return rows.map((r) => ({
    ...r,
    linkedAt: r.linkedAt.toISOString(),
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
  }));
}

/** getAccountReport authorization check (workflow 4b, BR-U6-4 Mode B) - this row's existence for
 * the EXACT (accountId, orderId) pair IS the entire authorization decision. True only if a
 * matching link exists; false is otherwise indistinguishable regardless of the real reason (order
 * doesn't exist, belongs to no account, or belongs to a different account) - see report-access.ts
 * for the artifact-resolution step this gates. Always called outside a transaction (workflows.ts's
 * getAccountReport). */
export async function accountOwnsOrder(db: Db, accountId: string, orderId: string): Promise<boolean> {
  const [row] = await db.select({ id: accountOrderLinks.id }).from(accountOrderLinks).where(and(eq(accountOrderLinks.accountId, accountId), eq(accountOrderLinks.orderId, orderId)));
  return row !== undefined;
}

/** Account deletion (BR-U6-5) - removes every AccountOrderLink row for the account, severing
 * ownership only; the referenced Order/EvidenceReportArtifact rows are untouched (a different
 * table, no cascade back onto them - orderId's own FK is ON DELETE RESTRICT, the opposite
 * direction). The accountId FK's own ON DELETE CASCADE also covers this; the deleteAccount
 * transaction performs it explicitly (invariant C). */
export async function deleteLinksForAccount(tx: TransactionalDb, accountId: string): Promise<void> {
  await tx.delete(accountOrderLinks).where(eq(accountOrderLinks.accountId, accountId));
}
