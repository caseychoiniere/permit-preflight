/**
 * Live Neon integration test for Unit 3's regulatory-rule-governance repository additions,
 * including the 2026-08-25 full-repository review's approvalRecord correction. Skips cleanly when
 * DATABASE_URL is unset. NOT executed in this Code Generation session.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { regulatoryRules } from "../../src/db/schema.js";
import { getRuleById, listRules } from "../../src/regulatory-rule-governance/repository.js";
import { LifecycleState } from "../../src/regulatory-rule-governance/types.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Regulatory Rule Governance repository - live Neon integration", () => {
  let db: Db;
  const cleanupRuleIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const id of cleanupRuleIds) {
      await db.delete(regulatoryRules).where(eq(regulatoryRules.id, id));
    }
  });

  async function insertTestRule(overrides: Partial<typeof regulatoryRules.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(regulatoryRules)
      .values({
        subject: "TEST-ONLY fixture rule - not production regulatory content",
        applicableProjectType: "test",
        applicableZone: "TEST",
        ruleSpecification: { ruleType: "HEIGHT_LIMIT", maxFt: 100 },
        citation: { smcSections: ["TEST.0.0"], ordinanceNumber: "TEST-ORD-1", effectiveDate: "2026-01-01" },
        lifecycleState: LifecycleState.ACTIVE,
        caveats: [],
        testCases: [],
        verificationHistory: [{ tier: "TIER_1", founderIdentity: "founder@example.com", founderVerifiedAt: "2026-01-01T00:00:00.000Z" }],
        isTestOnlyFixture: true,
        acceptedEvidenceQuality: ["AUTHORITATIVE"],
        ...overrides,
      })
      .returning();
    if (!row) throw new Error("setup failed");
    cleanupRuleIds.push(row.id);
    return row.id;
  }

  it("[hard invariant] approvalRecord survives persistence/round-trip and is never inferred from verificationHistory/updatedAt/lifecycleState", async () => {
    const approvedAt = "2026-02-01T00:00:00.000Z";
    const ruleId = await insertTestRule({ approvalRecord: { founderIdentity: "founder@example.com", approvedAt } });

    const rule = await getRuleById(db, ruleId);
    expect(rule?.approvalRecord).toEqual({ founderIdentity: "founder@example.com", approvedAt });
  });

  it("a rule with no approvalRecord (predates the field) round-trips as undefined, not a fabricated value", async () => {
    const ruleId = await insertTestRule(); // no approvalRecord override - column stays NULL
    const rule = await getRuleById(db, ruleId);
    expect(rule?.approvalRecord).toBeUndefined();
  });

  it("SUPERSEDED and DISABLED versions remain inspectable via getRuleById/listRules, distinctly from each other", async () => {
    const disabledId = await insertTestRule({ lifecycleState: LifecycleState.DISABLED });
    const supersededId = await insertTestRule({ lifecycleState: LifecycleState.SUPERSEDED });

    const disabled = await getRuleById(db, disabledId);
    const superseded = await getRuleById(db, supersededId);
    expect(disabled?.lifecycleState).toBe(LifecycleState.DISABLED);
    expect(superseded?.lifecycleState).toBe(LifecycleState.SUPERSEDED);
    expect(disabled?.lifecycleState).not.toBe(superseded?.lifecycleState);

    const all = await listRules(db, { applicableProjectType: "test" });
    const ids = all.map((r) => r.id);
    expect(ids).toContain(disabledId);
    expect(ids).toContain(supersededId);
  });

  it("citation and verificationHistory are exposed unchanged through getRuleById", async () => {
    const ruleId = await insertTestRule();
    const rule = await getRuleById(db, ruleId);
    expect(rule?.citation.smcSections).toEqual(["TEST.0.0"]);
    expect(rule?.citation.ordinanceNumber).toBe("TEST-ORD-1");
    expect(rule?.verificationHistory).toHaveLength(1);
    expect(rule?.verificationHistory[0]?.founderIdentity).toBe("founder@example.com");
  });
});
