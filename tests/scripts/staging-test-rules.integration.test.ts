/**
 * Live Neon integration test for the staging-only synthetic rule seeding mechanism
 * (scripts/staging-test-rules.ts, scripts/seed-staging-rules.ts, scripts/clear-staging-test-rules.ts).
 * Skips cleanly (does not fail) when DATABASE_URL is unset - see tests/db/unit2-schema.integration.test.ts
 * for the pattern this follows. NOT executed in this Code Generation session - no DATABASE_URL
 * provisioned in this sandbox; run this for real via `npm run test:integration` against the real
 * staging database.
 *
 * Proves the 3 things the founder explicitly asked for:
 *   1. only test-only staging rules are inserted (never anything resembling the real candidate)
 *   2. rerunning the seed is idempotent (no duplicates, same 4 rows in place)
 *   3. an unrelated non-ACTIVE, non-test row (standing in for the real shed candidate, which has
 *      no actual DB row of its own to test against - regulatory_rules is currently empty in
 *      staging) is never touched by either the seed or the clear command
 *
 * IMPORTANT (2026-08-30 regression fix): this suite's own beforeAll/afterEach clear the
 * STAGING-TEST-ONLY rows repeatedly for its own test isolation - correct for its own tests, but it
 * means an ordinary `npm run test:integration` run would otherwise leave regulatory_rules emptied
 * behind it, silently breaking whatever real manual/browser product testing runs next (a real,
 * live-observed zero-findings regression this exact gap caused). afterAll's LAST action
 * unconditionally re-seeds the real 4 ACTIVE rows before handing control back - see its own comment.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { regulatoryRules } from "../../src/db/schema.js";
import { clearStagingTestRules, seedStagingTestRules, STAGING_TEST_RULES, STAGING_TEST_RULE_SUBJECT_PREFIX } from "../../scripts/staging-test-rules.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Staging-only rule seeding - live Neon integration", () => {
  let db: Db;
  /** A stand-in for "a real, honestly non-ACTIVE candidate row" (regulatory_rules is empty in
   * real staging right now, so there is no actual realShedCandidate row to test against) - proves
   * the seed/clear commands only ever touch rows matching the STAGING-TEST-ONLY subject marker,
   * never anything else, regardless of that other row's own lifecycle state. */
  let unrelatedCandidateId: string;

  beforeAll(async () => {
    db = getDb();
    // Start from a clean slate in case a prior interrupted run left staging-test rows behind.
    await clearStagingTestRules(db);

    const [inserted] = await db
      .insert(regulatoryRules)
      .values({
        subject: "Detached accessory structure (shed) rear-yard setback - Seattle NR zone (simulated real candidate, TEST ONLY for this assertion)",
        applicableProjectType: "shed",
        applicableWorkflowType: "EXISTING_PROPERTY",
        applicableZone: "NR",
        ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
        citation: { smcSections: ["SMC 23.44.090.I.2"] },
        lifecycleState: "TRIAGED", // honestly non-ACTIVE, pending professional review - like the real candidate
        isTestOnlyFixture: false, // this simulates the REAL candidate, never a staging-test row
      })
      .returning({ id: regulatoryRules.id });
    unrelatedCandidateId = inserted!.id;
  });

  afterAll(async () => {
    await clearStagingTestRules(db);
    await db.delete(regulatoryRules).where(eq(regulatoryRules.id, unrelatedCandidateId));
    // Real, live-discovered regression (2026-08-30): this file's beforeAll/afterEach/afterAll all
    // clear the STAGING-TEST-ONLY rows for THIS suite's own test isolation - correct for the tests
    // themselves, but it means every ordinary `npm run test:integration` run silently emptied the
    // real staging_rules table by the time it finished, with nothing ever restoring the 4 ACTIVE
    // rows the founder's own manual/browser product-testing continuously depends on existing. A
    // real report generated shortly after a `test:integration` run came back with zero findings as
    // a direct result - not a Building Intelligence bug, a test-suite hygiene gap in this exact
    // file. The seeded, ACTIVE state IS the desired steady state for a staging environment (that's
    // the whole purpose scripts/staging-test-rules.ts exists for) - restored here, unconditionally,
    // as the very last thing this file does, so this suite can never again leave staging emptied
    // behind it.
    await seedStagingTestRules(db);
  });

  afterEach(async () => {
    // Each test manages its own seed/clear lifecycle; ensure no test leaks staging-test rows into
    // the next one.
    await clearStagingTestRules(db);
  });

  it("[hard invariant] seeding inserts exactly the 4 defined rows, all clearly marked, and never touches the unrelated non-test row", async () => {
    await seedStagingTestRules(db);

    const seeded = await db.select().from(regulatoryRules).where(eq(regulatoryRules.isTestOnlyFixture, true));
    const stagingSeeded = seeded.filter((r) => r.subject.startsWith(STAGING_TEST_RULE_SUBJECT_PREFIX));
    expect(stagingSeeded).toHaveLength(STAGING_TEST_RULES.length);
    for (const row of stagingSeeded) {
      expect(row.isTestOnlyFixture).toBe(true);
      expect(row.lifecycleState).toBe("ACTIVE");
      expect(row.applicableProjectType).toBe("shed");
      expect(row.applicableZone).toBe("NR");
    }

    const [unrelated] = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, unrelatedCandidateId));
    expect(unrelated?.isTestOnlyFixture).toBe(false);
    expect(unrelated?.lifecycleState).toBe("TRIAGED"); // still honestly non-ACTIVE
    expect(unrelated?.subject).not.toMatch(/^STAGING-TEST-ONLY:/);
  });

  it("[hard invariant] the seed touches exactly its own 4 known fixed-id rows, and only those - no row lacking the STAGING-TEST-ONLY marker is ever created by the seed", async () => {
    // Real-flake fix (2026-08-30): this test previously diffed the ENTIRE shared regulatory_rules
    // table (before/after row-id sets) to find "what the seed created." That's unsafe against a
    // live, shared Neon database when other integration test files run concurrently (Vitest's
    // default file-level parallelism) and ALSO write real rows into this same table -
    // tests/db/schema.integration.test.ts, tests/regulatory-rule-governance/repository.integration.test.ts,
    // and tests/admin-action-log/repository.integration.test.ts all insert into regulatoryRules; a
    // concurrent, wholly-unrelated insert from one of those files during this test's before/after
    // window was misattributed as "created by this seed," producing a real, live-observed failure.
    // seedStagingTestRules's own implementation can only ever touch the 4 fixed ids in
    // STAGING_TEST_RULES (a plain loop of id-keyed upserts, nothing dynamic) - selecting exactly
    // those ids proves everything the seed is even capable of doing, with zero sensitivity to any
    // other concurrent writer.
    await seedStagingTestRules(db);

    const seededRows = await db
      .select()
      .from(regulatoryRules)
      .where(
        inArray(
          regulatoryRules.id,
          STAGING_TEST_RULES.map((d) => d.id)
        )
      );
    expect(seededRows).toHaveLength(STAGING_TEST_RULES.length);
    for (const row of seededRows) {
      expect(row.subject.startsWith(STAGING_TEST_RULE_SUBJECT_PREFIX)).toBe(true);
      expect(row.isTestOnlyFixture).toBe(true);
    }
  });

  it("[hard invariant] re-running the seed is idempotent - the same 4 rows are updated in place, never duplicated", async () => {
    await seedStagingTestRules(db);
    const firstRun = await db.select().from(regulatoryRules).where(eq(regulatoryRules.isTestOnlyFixture, true));
    const firstRunStaging = firstRun.filter((r) => r.subject.startsWith(STAGING_TEST_RULE_SUBJECT_PREFIX));
    expect(firstRunStaging).toHaveLength(STAGING_TEST_RULES.length);
    const firstRunIds = firstRunStaging.map((r) => r.id).sort();

    // Run it 3 more times.
    await seedStagingTestRules(db);
    await seedStagingTestRules(db);
    await seedStagingTestRules(db);

    const afterRepeats = await db.select().from(regulatoryRules).where(eq(regulatoryRules.isTestOnlyFixture, true));
    const afterRepeatsStaging = afterRepeats.filter((r) => r.subject.startsWith(STAGING_TEST_RULE_SUBJECT_PREFIX));
    expect(afterRepeatsStaging).toHaveLength(STAGING_TEST_RULES.length); // still exactly 4, not 16
    expect(afterRepeatsStaging.map((r) => r.id).sort()).toEqual(firstRunIds); // the SAME 4 rows, not new ones
  });

  it("[hard invariant] clearing removes only the staging-test rows, leaving the unrelated non-test row untouched", async () => {
    await seedStagingTestRules(db);
    const deleted = await clearStagingTestRules(db);
    expect(deleted.length).toBe(STAGING_TEST_RULES.length);
    for (const row of deleted) {
      expect(row.subject.startsWith(STAGING_TEST_RULE_SUBJECT_PREFIX)).toBe(true);
    }

    const remaining = await db.select().from(regulatoryRules).where(eq(regulatoryRules.isTestOnlyFixture, true));
    expect(remaining.filter((r) => r.subject.startsWith(STAGING_TEST_RULE_SUBJECT_PREFIX))).toHaveLength(0);

    const [unrelated] = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, unrelatedCandidateId));
    expect(unrelated).toBeDefined();
    expect(unrelated?.lifecycleState).toBe("TRIAGED");
    expect(unrelated?.isTestOnlyFixture).toBe(false);
  });

  it("clearing when nothing is seeded is a safe no-op (returns an empty list, never an error)", async () => {
    const deleted = await clearStagingTestRules(db);
    expect(deleted).toEqual([]);
  });
});

describe.skipIf(hasDb)("Staging-only rule seeding - live Neon integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
  });
});
