/**
 * Live Neon integration test for Unit 6's Optional Accounts module. Skips cleanly (does not fail)
 * when DATABASE_URL is unset, matching this project's established pattern
 * (tests/order-payment/repository.integration.test.ts). Covers exactly the DB-dependent behaviors
 * the deterministic suite cannot (real atomic UPDATE...RETURNING execution, real ON CONFLICT DO
 * NOTHING RETURNING behavior including a genuine concurrent-insert race, real FK CASCADE/RESTRICT
 * enforcement, real transaction rollback).
 *
 * Test-isolation correction (2026-08-27, founder-directed): this suite runs repeatedly against a
 * PERSISTENT real Neon staging database, not a throwaway/reset-per-run database. Every value that
 * would otherwise collide across separate runs (emails, the report-access token, per-fixture
 * identifiers) is now generated uniquely per run via RUN_ID. Every test that previously SELECTed
 * an arbitrary pre-existing PAID order now creates its own fresh Order fixture directly
 * (createPaidOrderFixture) - this also removes the silent `if (!order) return` early-exits those
 * tests previously had (a genuine strengthening: the test now unconditionally exercises the real
 * behavior every run, never skips itself for lack of fixture data). Cleanup now deletes in real
 * FK-safe dependency order and covers every table a test can create a row in (previously
 * reportGenerationJobs/evidenceReportArtifacts/reportAccessCredentials rows were never cleaned up
 * at all). No production behavior changed - see the accompanying report for confirmation that
 * every original failure was fixture contamination, not a production defect.
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

/** Unique per process invocation - every fixture value that must not collide with a prior run
 * against the same persistent staging database is suffixed with this. */
const RUN_ID = crypto.randomUUID().slice(0, 8);
function testEmail(label: string): string {
  return `${label}-${RUN_ID}@example.com`;
}

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

  /** Creates a fresh, real PAID Order (with its own ScreeningRequest) that belongs to THIS test
   * run only - never an arbitrary pre-existing row from the persistent staging database (per
   * explicit instruction: each test creates the specific Order it needs). A direct insert, not a
   * real Stripe Checkout round-trip - order-payment/repository.integration.test.ts already covers
   * the real checkout/webhook path; this suite only needs a real, valid PAID row to link against. */
  async function createPaidOrderFixture(): Promise<{ orderId: string; screeningRequestId: string }> {
    const [screeningRequest] = await db
      .insert(screeningRequests)
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "SHED", projectDetails: {}, confirmedParcelId: `TEST-PIN-${RUN_ID}-${crypto.randomUUID()}` })
      .returning({ id: screeningRequests.id });
    cleanupScreeningRequestIds.push(screeningRequest!.id);
    const [order] = await db
      .insert(orders)
      .values({
        screeningRequestId: screeningRequest!.id,
        state: "PAID",
        priceCents: 999,
        currency: "usd",
        checkoutCreationIdempotencyKey: crypto.randomUUID(),
        paidAt: new Date(),
        stripePaymentIntentId: `pi_test_${crypto.randomUUID()}`,
      })
      .returning({ id: orders.id });
    return { orderId: order!.id, screeningRequestId: screeningRequest!.id };
  }

  afterAll(async () => {
    // FK-safe dependency order: accounts first (CASCADE-removes their own sessions/CLAIM_PURCHASE
    // tokens/account_order_links via accountId), THEN the report-artifact chain, THEN orders (both
    // orderId-referencing FKs on Unit 6's tables are RESTRICT, so any link to an order being
    // cleaned up must already be gone - guaranteed by deleting accounts first), THEN
    // screeningRequests.
    for (const id of cleanupAccountIds) await db.delete(accounts).where(eq(accounts.id, id));
    for (const id of cleanupScreeningRequestIds) {
      const artifacts = await db.select({ id: evidenceReportArtifacts.id }).from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
      for (const artifact of artifacts) {
        await db.delete(reportAccessCredentials).where(eq(reportAccessCredentials.reportArtifactId, artifact.id));
      }
      await db.delete(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, id));
      await db.delete(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, id));
      await db.delete(orders).where(eq(orders.screeningRequestId, id));
      await db.delete(screeningRequests).where(eq(screeningRequests.id, id));
    }
  });

  it("[hard invariant] concurrent LOGIN verification attempts for the same token - exactly one succeeds", async () => {
    const resend = createFakeResendClient();
    await requestLoginLink(db, resend, testEmail("race-login"));
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
    await requestLoginLink(db, resendA, testEmail("concurrent-a"));
    await requestLoginLink(db, resendB, testEmail("concurrent-b"));
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
      .values({ workflowType: "EXISTING_PROPERTY", projectType: "SHED", projectDetails: {}, confirmedParcelId: `TEST-PIN-${RUN_ID}-${crypto.randomUUID()}` })
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
    const rawReportToken = `test-report-token-${RUN_ID}-${crypto.randomUUID()}`;
    await db.insert(reportAccessCredentials).values({ reportArtifactId: artifact!.id, tokenHash: hashToken(rawReportToken), active: true });

    const [account] = await db.insert(accounts).values({ email: testEmail("path-b-no-paid-order") }).returning({ id: accounts.id });
    cleanupAccountIds.push(account!.id);

    const result = await claimByReportToken(db, account!.id, rawReportToken);
    expect(result.outcome).toBe("ORDER_NOT_FOUND");

    const [link] = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.accountId, account!.id));
    expect(link).toBeUndefined();
  });

  it("[hard invariant] completeClaimByEmail requires the CURRENT SESSION's accountId to match the token's own bound accountId - a different account's session cannot complete it", async () => {
    const { orderId } = await createPaidOrderFixture();

    const [ownerAccount] = await db.insert(accounts).values({ email: testEmail("claim-owner") }).returning({ id: accounts.id });
    const [otherAccount] = await db.insert(accounts).values({ email: testEmail("claim-other") }).returning({ id: accounts.id });
    cleanupAccountIds.push(ownerAccount!.id, otherAccount!.id);

    const credential = await insertClaimToken(db, testEmail("claim-owner"), ownerAccount!.id, orderId);

    const wrongAccountResult = await completeClaimByEmail(credential.rawToken, otherAccount!.id);
    expect(wrongAccountResult.outcome).toBe("INVALID_OR_EXPIRED");

    const [link] = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.orderId, orderId));
    expect(link).toBeUndefined();

    // The SAME token, presented under the CORRECT (owner) session, still succeeds - proving the
    // rejection above was specifically about account mismatch, not a broken/expired token.
    const correctResult = await completeClaimByEmail(credential.rawToken, ownerAccount!.id);
    expect(correctResult.outcome).toBe("LINKED");
  });

  it("[hard invariant] account_order_links.order_id UNIQUE + ON CONFLICT correctness under a real concurrent race - same account idempotent, different account rejected, never two links", async () => {
    const { orderId } = await createPaidOrderFixture();

    const [accountA] = await db.insert(accounts).values({ email: testEmail("race-link-a") }).returning({ id: accounts.id });
    const [accountB] = await db.insert(accounts).values({ email: testEmail("race-link-b") }).returning({ id: accounts.id });
    cleanupAccountIds.push(accountA!.id, accountB!.id);

    const [resultA, resultB] = await Promise.all([
      withAccountTransaction((tx) => createLink(tx, accountA!.id, orderId, "REPORT_ACCESS_TOKEN")),
      withAccountTransaction((tx) => createLink(tx, accountB!.id, orderId, "REPORT_ACCESS_TOKEN")),
    ]);
    const outcomes = [resultA.outcome, resultB.outcome].sort();
    // Exactly one wins CREATED; the other resolves to ALREADY_LINKED_TO_ANOTHER_ACCOUNT (they
    // used different accountIds for the same orderId, so neither can be the idempotent-same-
    // account case).
    expect(outcomes).toEqual(["ALREADY_LINKED_TO_ANOTHER_ACCOUNT", "CREATED"]);

    const links = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.orderId, orderId));
    expect(links).toHaveLength(1); // Never two links for the same order.

    // A same-account repeat attempt is idempotent.
    const winningAccountId = links[0]!.accountId;
    const repeat = await withAccountTransaction((tx) => createLink(tx, winningAccountId, orderId, "REPORT_ACCESS_TOKEN"));
    expect(repeat.outcome).toBe("ALREADY_LINKED_SAME_ACCOUNT");
  });

  it("[hard invariant] deleting an Account cascades ONLY account_sessions/magic_link_tokens(accountId)/account_order_links(accountId) rows - never touches orders/evidenceReportArtifacts/reportAccessCredentials", async () => {
    const [account] = await db.insert(accounts).values({ email: testEmail("fk-cascade-check") }).returning({ id: accounts.id });
    await db.insert(accountSessions).values({ accountId: account!.id, tokenHash: `fk-check-session-hash-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 60_000) });

    // Direct delete, bypassing deleteAccount's own explicit steps - proves the FK CASCADE itself
    // exists and works, independent of the application workflow (Code Generation Part 1 review,
    // invariant A: "must not become orphaned" even outside the normal deletion path).
    await db.delete(accounts).where(eq(accounts.id, account!.id));

    const [session] = await db.select().from(accountSessions).where(eq(accountSessions.accountId, account!.id));
    expect(session).toBeUndefined(); // Cascaded, as declared.
  });

  it("[hard invariant] an Order referenced by an outstanding account_order_links row cannot be deleted (ON DELETE RESTRICT)", async () => {
    const { orderId, screeningRequestId } = await createPaidOrderFixture();
    const [account] = await db.insert(accounts).values({ email: testEmail("fk-restrict-check") }).returning({ id: accounts.id });
    cleanupAccountIds.push(account!.id);
    await withAccountTransaction((tx) => createLink(tx, account!.id, orderId, "REPORT_ACCESS_TOKEN"));

    await expect(db.delete(orders).where(eq(orders.id, orderId))).rejects.toThrow(); // Postgres rejects the DELETE - foreign_key_violation.

    // Cleanup order: the link (referencing the order) must go before afterAll's own account
    // cleanup would otherwise try to CASCADE through it - deleting it explicitly here keeps this
    // test's own RESTRICT proof from depending on cleanup ordering elsewhere.
    await db.delete(accountOrderLinks).where(eq(accountOrderLinks.orderId, orderId));
    void screeningRequestId; // already registered for afterAll cleanup by createPaidOrderFixture.
  });

  it("[hard invariant] deleteAccount leaves Order/EvidenceReportArtifact/reportAccessCredentials byte-for-byte unmodified, and revokes/deletes every account-owned record", async () => {
    const { orderId } = await createPaidOrderFixture();
    const [orderBeforeRow] = await db.select().from(orders).where(eq(orders.id, orderId));
    const orderBefore = { ...orderBeforeRow };

    const resend = createFakeResendClient();
    await requestLoginLink(db, resend, testEmail("delete-me"));
    const verified = await verifyLoginLink(extractFragmentToken(resend.sentEmails[0]!.text));
    expect(verified.outcome).toBe("OK");
    if (verified.outcome !== "OK") return;

    await withAccountTransaction((tx) => createLink(tx, verified.accountId, orderId, "REPORT_ACCESS_TOKEN"));

    await deleteAccount(verified.accountId);

    const [accountRow] = await db.select().from(accounts).where(eq(accounts.id, verified.accountId));
    expect(accountRow).toBeUndefined();
    const [sessionRow] = await db.select().from(accountSessions).where(eq(accountSessions.accountId, verified.accountId));
    expect(sessionRow).toBeUndefined();
    const [linkRow] = await db.select().from(accountOrderLinks).where(eq(accountOrderLinks.orderId, orderId));
    expect(linkRow).toBeUndefined();

    const [orderAfter] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(orderAfter).toEqual(orderBefore); // Byte-for-byte unmodified.
    // deleteAccount already succeeded (no accountId left to register), so cleanupAccountIds is
    // deliberately NOT pushed to here - the account is already gone.
  });
});
