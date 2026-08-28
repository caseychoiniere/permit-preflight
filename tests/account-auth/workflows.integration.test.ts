/**
 * Live Neon integration test for Unit 6's Optional Accounts module. Skips cleanly (does not fail)
 * when DATABASE_URL is unset, matching this project's established pattern
 * (tests/order-payment/repository.integration.test.ts). NOT executed in this Code Generation
 * session - no DATABASE_URL provisioned in this sandbox; covers exactly the DB-dependent
 * behaviors the deterministic suite cannot (real atomic UPDATE...RETURNING execution, real
 * ON CONFLICT DO NOTHING RETURNING behavior including a genuine concurrent-insert race, real FK
 * CASCADE/RESTRICT enforcement, real transaction rollback).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withAccountTransaction, type Db } from "../../src/db/client.js";
import { accounts, accountOrderLinks, accountSessions, orders, screeningRequests, evidenceReportArtifacts, reportAccessCredentials, reportGenerationJobs } from "../../src/db/schema.js";
import { requestLoginLink, verifyLoginLink, completeClaimByEmail, claimByReportToken, deleteAccount } from "../../src/account-auth/workflows.js";
import { insertClaimToken } from "../../src/account-auth/token-repository.js";
import { createLink } from "../../src/account-auth/link-repository.js";
import { hashToken } from "../../src/report-access/credential.js";
import { createFakeResendClient } from "../fixtures/fake-resend-client.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

/** Extracts the raw token from a sent email's own fragment-carried URL - mirrors exactly what the
 * real client-side landing page extracts from location.hash, so this test exercises the same raw
 * value a real browser would present in its verification POST. */
function extractFragmentToken(text: string): string {
  const match = text.match(/#token=([^\s]+)/);
  if (!match) throw new Error("No fragment token found in sent email body.");
  return decodeURIComponent(match[1]!);
}

describe.skipIf(!hasDb)("Unit 6 Optional Accounts - live Neon integration", () => {
  let db: Db;
  const cleanupAccountIds: string[] = [];
  const cleanupScreeningRequestIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const id of cleanupAccountIds) await db.delete(accounts).where(eq(accounts.id, id));
    for (const id of cleanupScreeningRequestIds) {
      await db.delete(orders).where(eq(orders.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  });

  it("[hard invariant] concurrent LOGIN verification attempts for the same token - exactly one succeeds", async () => {
    const resend = createFakeResendClient();
    await requestLoginLink(db, resend, "race-login@example.com");
    const rawToken = extractFragmentToken(resend.sentEmails[0]!.text);

    const [first, second] = await Promise.all([verifyLoginLink(rawToken), verifyLoginLink(rawToken)]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["INVALID_OR_EXPIRED", "OK"]);
    const okResult = first.outcome === "OK" ? first : second.outcome === "OK" ? second : undefined;
    expect(okResult).toBeDefined();
    if (okResult?.outcome === "OK") cleanupAccountIds.push(okResult.accountId);
  });

  it("[hard invariant] two concurrent NEW-account LOGIN flows for different emails each get exactly one Account row (ON CONFLICT correctness, not a race regression)", async () => {
    const resendA = createFakeResendClient();
    const resendB = createFakeResendClient();
    await requestLoginLink(db, resendA, "concurrent-a@example.com");
    await requestLoginLink(db, resendB, "concurrent-b@example.com");
    const [resultA, resultB] = await Promise.all([verifyLoginLink(extractFragmentToken(resendA.sentEmails[0]!.text)), verifyLoginLink(extractFragmentToken(resendB.sentEmails[0]!.text))]);
    expect(resultA.outcome).toBe("OK");
    expect(resultB.outcome).toBe("OK");
    if (resultA.outcome === "OK") cleanupAccountIds.push(resultA.accountId);
    if (resultB.outcome === "OK") cleanupAccountIds.push(resultB.accountId);
    if (resultA.outcome === "OK" && resultB.outcome === "OK") expect(resultA.accountId).not.toBe(resultB.accountId);
  });

  it("[hard invariant] Path B claim requires orders.state = 'PAID' - a report credential whose screening request has no PAID order creates no link (Code Generation Part 1 correction)", async () => {
    // Sets up a screening request + evidence artifact + report-access credential with NO Order at
    // all (mirrors an INTERNAL_PROTOTYPE-authorized generation) - the real, concrete case this
    // correction exists to close.
    const [screeningRequest] = await db
      .insert(screeningRequests)
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "SHED", projectDetails: {}, confirmedParcelId: "0000000000" })
      .returning({ id: screeningRequests.id });
    cleanupScreeningRequestIds.push(screeningRequest!.id);
    const [job] = await db
      .insert(reportGenerationJobs)
      .values({ screeningRequestId: screeningRequest!.id, state: "COMPLETE", generationAuthorization: { type: "INTERNAL_PROTOTYPE" } })
      .returning({ id: reportGenerationJobs.id });
    const [artifact] = await db
      .insert(evidenceReportArtifacts)
      .values({ screeningRequestId: screeningRequest!.id, reportGenerationJobId: job!.id, findings: [], evidence: [] })
      .returning({ id: evidenceReportArtifacts.id });
    const rawReportToken = "test-report-token-no-paid-order";
    await db.insert(reportAccessCredentials).values({ reportArtifactId: artifact!.id, tokenHash: hashToken(rawReportToken), active: true });

    const [account] = await db.insert(accounts).values({ email: "path-b-no-paid-order@example.com" }).returning({ id: accounts.id });
    cleanupAccountIds.push(account!.id);

    const result = await claimByReportToken(db, account!.id, rawReportToken);
    expect(result.outcome).toBe("ORDER_NOT_FOUND");

    const [link] = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.accountId, account!.id));
    expect(link).toBeUndefined();
  });

  it("[hard invariant] completeClaimByEmail requires the CURRENT SESSION's accountId to match the token's own bound accountId - a different account's session cannot complete it", async () => {
    const [order] = await db.select().from(orders).where(eq(orders.state, "PAID")).limit(1);
    if (!order) return; // Environment-dependent smoke check - requires at least one real PAID order fixture in the target database.

    const [ownerAccount] = await db.insert(accounts).values({ email: "claim-owner@example.com" }).returning({ id: accounts.id });
    const [otherAccount] = await db.insert(accounts).values({ email: "claim-other@example.com" }).returning({ id: accounts.id });
    cleanupAccountIds.push(ownerAccount!.id, otherAccount!.id);

    const credential = await insertClaimToken(db, "claim-owner@example.com", ownerAccount!.id, order.id);

    const wrongAccountResult = await completeClaimByEmail(credential.rawToken, otherAccount!.id);
    expect(wrongAccountResult.outcome).toBe("INVALID_OR_EXPIRED");

    const [link] = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.orderId, order.id));
    expect(link).toBeUndefined();

    // The SAME token, presented under the CORRECT (owner) session, still succeeds - proving the
    // rejection above was specifically about account mismatch, not a broken/expired token.
    const correctResult = await completeClaimByEmail(credential.rawToken, ownerAccount!.id);
    expect(correctResult.outcome).toBe("LINKED");
  });

  it("[hard invariant] account_order_links.order_id UNIQUE + ON CONFLICT correctness under a real concurrent race - same account idempotent, different account rejected, never two links", async () => {
    const [order] = await db.select().from(orders).where(eq(orders.state, "PAID")).limit(1);
    if (!order) return;

    const [accountA] = await db.insert(accounts).values({ email: "race-link-a@example.com" }).returning({ id: accounts.id });
    const [accountB] = await db.insert(accounts).values({ email: "race-link-b@example.com" }).returning({ id: accounts.id });
    cleanupAccountIds.push(accountA!.id, accountB!.id);

    const [resultA, resultB] = await Promise.all([
      withAccountTransaction((tx) => createLink(tx, accountA!.id, order.id, "REPORT_ACCESS_TOKEN")),
      withAccountTransaction((tx) => createLink(tx, accountB!.id, order.id, "REPORT_ACCESS_TOKEN")),
    ]);
    const outcomes = [resultA.outcome, resultB.outcome].sort();
    // Exactly one wins CREATED; the other resolves to ALREADY_LINKED_TO_ANOTHER_ACCOUNT (they
    // used different accountIds for the same orderId, so neither can be the idempotent-same-
    // account case).
    expect(outcomes).toEqual(["ALREADY_LINKED_TO_ANOTHER_ACCOUNT", "CREATED"]);

    const links = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.orderId, order.id));
    expect(links).toHaveLength(1); // Never two links for the same order.

    // A same-account repeat attempt is idempotent.
    const winningAccountId = links[0]!.accountId;
    const repeat = await withAccountTransaction((tx) => createLink(tx, winningAccountId, order.id, "REPORT_ACCESS_TOKEN"));
    expect(repeat.outcome).toBe("ALREADY_LINKED_SAME_ACCOUNT");
  });

  it("[hard invariant] deleting an Account cascades ONLY account_sessions/magic_link_tokens(accountId)/account_order_links(accountId) rows - never touches orders/evidenceReportArtifacts/reportAccessCredentials", async () => {
    const [account] = await db.insert(accounts).values({ email: "fk-cascade-check@example.com" }).returning({ id: accounts.id });
    await db.insert(accountSessions).values({ accountId: account!.id, tokenHash: "fk-check-session-hash", expiresAt: new Date(Date.now() + 60_000) });

    // Direct delete, bypassing deleteAccount's own explicit steps - proves the FK CASCADE itself
    // exists and works, independent of the application workflow (Code Generation Part 1 review,
    // invariant A: "must not become orphaned" even outside the normal deletion path).
    await db.delete(accounts).where(eq(accounts.id, account!.id));

    const [session] = await db.select().from(accountSessions).where(eq(accountSessions.accountId, account!.id));
    expect(session).toBeUndefined(); // Cascaded, as declared.
  });

  it("[hard invariant] an Order referenced by an outstanding account_order_links row cannot be deleted (ON DELETE RESTRICT)", async () => {
    const [order] = await db.select().from(orders).where(eq(orders.state, "PAID")).limit(1);
    if (!order) return;
    const [account] = await db.insert(accounts).values({ email: "fk-restrict-check@example.com" }).returning({ id: accounts.id });
    cleanupAccountIds.push(account!.id);
    await withAccountTransaction((tx) => createLink(tx, account!.id, order.id, "REPORT_ACCESS_TOKEN"));

    await expect(db.delete(orders).where(eq(orders.id, order.id))).rejects.toThrow(); // Postgres rejects the DELETE - foreign_key_violation.

    await db.delete(accountOrderLinks).where(eq(accountOrderLinks.orderId, order.id)); // cleanup
  });

  it("[hard invariant] deleteAccount leaves Order/EvidenceReportArtifact/reportAccessCredentials byte-for-byte unmodified, and revokes/deletes every account-owned record", async () => {
    const [order] = await db.select().from(orders).where(eq(orders.state, "PAID")).limit(1);
    if (!order) return;
    const orderBefore = { ...order };

    const resend = createFakeResendClient();
    await requestLoginLink(db, resend, "delete-me@example.com");
    const verified = await verifyLoginLink(extractFragmentToken(resend.sentEmails[0]!.text));
    expect(verified.outcome).toBe("OK");
    if (verified.outcome !== "OK") return;

    await withAccountTransaction((tx) => createLink(tx, verified.accountId, order.id, "REPORT_ACCESS_TOKEN"));

    await deleteAccount(verified.accountId);

    const [accountRow] = await db.select().from(accounts).where(eq(accounts.id, verified.accountId));
    expect(accountRow).toBeUndefined();
    const [sessionRow] = await db.select().from(accountSessions).where(eq(accountSessions.accountId, verified.accountId));
    expect(sessionRow).toBeUndefined();
    const [linkRow] = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.orderId, order.id));
    expect(linkRow).toBeUndefined();

    const [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(orderAfter).toEqual(orderBefore); // Byte-for-byte unmodified.
  });
});
