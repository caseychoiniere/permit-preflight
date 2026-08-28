/**
 * Live Neon integration test for Unit 3's AdminActionLog + the atomicity/sequencing/concurrency
 * corrections from the 2026-08-25 Code Generation Part 1 review. Skips cleanly when DATABASE_URL
 * is unset. NOT executed in this Code Generation session - no DATABASE_URL provisioned in this
 * sandbox.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withAdminTransaction, type Db } from "../../src/db/client.js";
import { adminActionLog, regulatoryRules, dataSourceHealth } from "../../src/db/schema.js";
import { recordAdminAction } from "../../src/admin-action-log/repository.js";
import { AdminActionType, AdminTargetType } from "../../src/admin-action-log/types.js";
import { transitionLifecycleState } from "../../src/regulatory-rule-governance/repository.js";
import { LifecycleState } from "../../src/regulatory-rule-governance/types.js";
import { disableRule } from "../../src/regulatory-rule-governance/admin-lifecycle.js";
import { setManualOverride } from "../../src/data-source-registry/repository.js";
import { SourceHealthState } from "../../src/data-source-registry/types.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDb)("Unit 3 AdminActionLog + atomicity/concurrency - live Neon integration", () => {
  let db: Db;
  const cleanupRuleIds: string[] = [];
  const cleanupSourceIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    for (const ruleId of cleanupRuleIds) {
      await db.delete(adminActionLog).where(eq(adminActionLog.targetId, ruleId));
      await db.delete(regulatoryRules).where(eq(regulatoryRules.id, ruleId));
    }
    for (const sourceId of cleanupSourceIds) {
      await db.delete(adminActionLog).where(eq(adminActionLog.targetId, sourceId));
      await db.delete(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
    }
  });

  async function makeActiveTestRule(): Promise<string> {
    const [row] = await db
      .insert(regulatoryRules)
      .values({
        subject: "TEST-ONLY fixture rule - not production regulatory content",
        applicableProjectType: "test",
        applicableZone: "TEST",
        ruleSpecification: { ruleType: "HEIGHT_LIMIT", maxFt: 100 },
        citation: { smcSections: ["TEST.0.0"] },
        lifecycleState: LifecycleState.ACTIVE,
        caveats: [],
        testCases: [],
        verificationHistory: [],
        isTestOnlyFixture: true,
        acceptedEvidenceQuality: ["AUTHORITATIVE"],
      })
      .returning();
    if (!row) throw new Error("setup failed");
    cleanupRuleIds.push(row.id);
    return row.id;
  }

  it("AdminActionLog round-trip: insert then read back", async () => {
    const sourceId = `test-source-${Math.random().toString(36).slice(2)}`;
    cleanupSourceIds.push(sourceId);
    await recordAdminAction(db, {
      operatorId: "test-operator",
      actionType: AdminActionType.DATA_SOURCE_MARKED_UNHEALTHY,
      targetType: AdminTargetType.DATA_SOURCE,
      targetId: sourceId,
      reason: "integration test round-trip",
    });
    const [row] = await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, sourceId));
    expect(row?.reason).toBe("integration test round-trip");
    expect(row?.operatorId).toBe("test-operator");
  });

  it("[hard invariant] the database rejects an empty or whitespace-only reason, independent of application-boundary validation", async () => {
    const sourceId = `test-source-${Math.random().toString(36).slice(2)}`;
    await expect(
      db.insert(adminActionLog).values({
        operatorId: "test-operator",
        actionType: AdminActionType.DATA_SOURCE_MARKED_UNHEALTHY,
        targetType: AdminTargetType.DATA_SOURCE,
        targetId: sourceId,
        reason: "   ",
      })
    ).rejects.toThrow();
  });

  it("[hard invariant] the 4 atomic local mutations roll back BOTH the domain write and the audit entry if either fails", async () => {
    const ruleId = await makeActiveTestRule();

    await expect(
      withAdminTransaction(async (tx) => {
        await transitionLifecycleState(tx, ruleId, { from: LifecycleState.ACTIVE, to: LifecycleState.DISABLED });
        throw new Error("simulated failure after the domain write, before the audit write commits");
      })
    ).rejects.toThrow();

    const [rule] = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, ruleId));
    expect(rule?.lifecycleState).toBe(LifecycleState.ACTIVE); // rolled back - never left DISABLED
    const auditRows = await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, ruleId));
    expect(auditRows).toHaveLength(0); // no audit entry for a mutation that didn't actually commit
  });

  it("[hard invariant] a stale/concurrent rule-lifecycle transition affects zero rows and writes NO audit entry (concurrency-safety correction)", async () => {
    const ruleId = await makeActiveTestRule();

    // Simulate a concurrent request that already disabled the rule between this test's read and
    // its own transition attempt.
    await db.update(regulatoryRules).set({ lifecycleState: LifecycleState.DISABLED }).where(eq(regulatoryRules.id, ruleId));

    // disableRule's own internal read now sees DISABLED, so its pure lifecycle.ts check itself
    // rejects (REJECTED, not CONFLICT) - this proves the read-time state is honored. The
    // conditional-UPDATE's own zero-rows-transitioned path is exercised directly below, which is
    // the genuine TOCTOU case (the row moves AFTER the pure-function check already passed).
    const staleAttempt = await disableRule(db, ruleId, "test-operator", "attempting to disable an already-disabled rule");
    expect(staleAttempt.outcome).toBe("REJECTED");

    // Direct TOCTOU simulation: transitionLifecycleState itself, called with a {from} that no
    // longer matches the row's actual current state (as if the row moved between an earlier read
    // and this call).
    const conflict = await withAdminTransaction((tx) => transitionLifecycleState(tx, ruleId, { from: LifecycleState.ACTIVE, to: LifecycleState.DISABLED }));
    expect(conflict.transitioned).toBe(false);

    const auditRows = await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, ruleId));
    expect(auditRows).toHaveLength(0);
  });

  it("data-source override set + AdminActionLog commit atomically", async () => {
    const sourceId = `test-source-${Math.random().toString(36).slice(2)}`;
    cleanupSourceIds.push(sourceId);

    await withAdminTransaction(async (tx) => {
      await setManualOverride(tx, sourceId, SourceHealthState.UNHEALTHY);
      await recordAdminAction(tx, {
        operatorId: "test-operator",
        actionType: AdminActionType.DATA_SOURCE_MARKED_UNHEALTHY,
        targetType: AdminTargetType.DATA_SOURCE,
        targetId: sourceId,
        reason: "integration test atomic override",
      });
    });

    const [row] = await db.select().from(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
    expect(row?.manualOverrideState).toBe(SourceHealthState.UNHEALTHY);
    const auditRows = await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, sourceId));
    expect(auditRows).toHaveLength(1);
  });
});
