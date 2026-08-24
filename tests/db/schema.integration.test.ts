/**
 * Live Neon PostgreSQL+PostGIS integration test - real database round-trips. Skipped (not
 * failed) when DATABASE_URL is unset, so this file is safe to include in `npm run test:integration`
 * runs in any environment, but only activates once real Neon credentials are provisioned (see
 * .env.example, aidlc-docs/construction/shared-infrastructure.md). NOT executed in the Build &
 * Test session that wrote this file - no DATABASE_URL was provisioned in that sandbox.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { regulatoryRules, inferencePolicies } from "../../src/db/schema.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Neon PostgreSQL + PostGIS live integration", () => {
  let db: Db;
  const insertedRuleIds: string[] = [];
  const insertedPolicyIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const id of insertedRuleIds) {
      await db.delete(regulatoryRules).where(eq(regulatoryRules.id, id));
    }
    for (const id of insertedPolicyIds) {
      await db.delete(inferencePolicies).where(eq(inferencePolicies.id, id));
    }
  });

  it("PostGIS extension is enabled (migration 0001_enable_postgis applied)", async () => {
    const result = await db.execute(sql`SELECT PostGIS_Version() as version`);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("RegulatoryRule round-trip: insert, retrieve, and isTestOnlyFixture persists correctly", async () => {
    const [inserted] = await db
      .insert(regulatoryRules)
      .values({
        subject: "Build & Test integration round-trip - TEST ONLY, safe to delete",
        applicableProjectType: "shed",
        applicableZone: "TEST-NR",
        ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
        citation: { smcSections: ["TEST.0.0"] },
        lifecycleState: "ACTIVE",
        tier: "TIER_1",
        isTestOnlyFixture: true,
      })
      .returning();

    expect(inserted).toBeDefined();
    if (!inserted) return;
    insertedRuleIds.push(inserted.id);

    const [retrieved] = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, inserted.id));
    expect(retrieved?.isTestOnlyFixture).toBe(true);
    expect(retrieved?.lifecycleState).toBe("ACTIVE");
  });

  it("[hard invariant] ACTIVE-only retrieval excludes non-ACTIVE rows", async () => {
    const [triaged] = await db
      .insert(regulatoryRules)
      .values({
        subject: "Build & Test integration TRIAGED-only round-trip - TEST ONLY",
        applicableProjectType: "shed",
        applicableZone: "TEST-NR",
        ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
        citation: { smcSections: ["TEST.0.0"] },
        lifecycleState: "TRIAGED",
        tier: "TIER_2",
        isTestOnlyFixture: true,
      })
      .returning();
    expect(triaged).toBeDefined();
    if (!triaged) return;
    insertedRuleIds.push(triaged.id);

    const activeOnly = await db.select().from(regulatoryRules).where(eq(regulatoryRules.lifecycleState, "ACTIVE"));
    expect(activeOnly.some((r) => r.id === triaged.id)).toBe(false);
  });

  it("InferencePolicy round-trip: insert and retrieve", async () => {
    const [inserted] = await db
      .insert(inferencePolicies)
      .values({
        subject: "Build & Test integration round-trip policy - TEST ONLY",
        derivationMethod: "test-derivation",
        citationOrBasis: "test-basis",
        lifecycleState: "ACTIVE",
        version: "1",
        isTestOnlyFixture: true,
      })
      .returning();

    expect(inserted).toBeDefined();
    if (!inserted) return;
    insertedPolicyIds.push(inserted.id);

    const [retrieved] = await db.select().from(inferencePolicies).where(eq(inferencePolicies.id, inserted.id));
    expect(retrieved?.isTestOnlyFixture).toBe(true);
  });
});

describe.skipIf(hasDb)("Neon PostgreSQL + PostGIS live integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasDb).toBe(false); // DATABASE_URL not provisioned in this environment.
  });
});
