/**
 * Live Neon integration test for the Unit 6B governance bootstrap mechanism (2026-09-24 plan,
 * §5/§6). Corrected per reviewer decision d380b4dd-211d-410d-9289-94d2f3f17491's CRITICAL testing
 * finding: this file calls `bootstrapUnit6bGovernance` directly with synthetic, disposable
 * candidates and freshly-generated test-only UUIDs (`crypto.randomUUID()`, generated at test-run
 * time) - the real 19 `realShedPermitCandidates`/real fixed UUIDs are never referenced anywhere in
 * this file. The real bootstrap script's actual execution against the real 19 UUIDs is a separate,
 * one-time, manually-run action (`scripts/bootstrap-unit-6b-governance.ts`), never part of any
 * automated test.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../src/db/client.js";
import { regulatoryRules, adminActionLog } from "../../src/db/schema.js";
import { bootstrapUnit6bGovernance, BOOTSTRAP_REASON, type BootstrapCandidate } from "../../src/regulatory-rule-governance/bootstrap-unit-6b.js";
import { sourceVerify } from "../../src/regulatory-rule-governance/lifecycle.js";
import { getRuleById, transitionLifecycleState } from "../../src/regulatory-rule-governance/repository.js";
import { withAdminTransaction } from "../../src/db/client.js";
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";

const hasDb = Boolean(process.env["DATABASE_URL"]);
const OPERATOR_ID = "test-operator@permitpreflight.example";

function syntheticCandidate(label: string): BootstrapCandidate {
  const input: DraftedRuleInput = {
    id: `synthetic-bootstrap-candidate-${label}-${randomUUID()}`,
    subject: `SYNTHETIC TEST FIXTURE - bootstrap-unit-6b.integration.test.ts - ${label}`,
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: "TEST_ONLY" },
    citation: { smcSections: ["SYNTHETIC TEST FIXTURE - not a real SMC section"] },
    caveats: [],
    testCases: [],
    isTestOnlyFixture: true,
  };
  return { input, tier: "TIER_1", fixedRowId: randomUUID() };
}

describe.skipIf(!hasDb)("bootstrapUnit6bGovernance - live Neon integration (synthetic candidates only, never the real 19)", () => {
  let db: Db;
  const cleanupRuleIds: string[] = [];

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    if (cleanupRuleIds.length === 0) return;
    await db.delete(adminActionLog).where(inArray(adminActionLog.targetId, cleanupRuleIds));
    await db.delete(regulatoryRules).where(inArray(regulatoryRules.id, cleanupRuleIds));
  });

  it("creates exactly the supplied candidates at TRIAGED, zero ACTIVE, with disclosed non-fabricated provenance", async () => {
    const candidates = [syntheticCandidate("a"), syntheticCandidate("b"), syntheticCandidate("c")];
    candidates.forEach((c) => cleanupRuleIds.push(c.fixedRowId));

    const result = await bootstrapUnit6bGovernance(db, candidates, OPERATOR_ID);
    expect(result.created.sort()).toEqual(candidates.map((c) => c.fixedRowId).sort());
    expect(result.alreadyPresent).toEqual([]);

    for (const candidate of candidates) {
      const [row] = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, candidate.fixedRowId));
      expect(row).toBeDefined();
      expect(row?.lifecycleState).toBe("TRIAGED");
      expect(row?.tier).toBe("TIER_1");
      expect(row?.isTestOnlyFixture).toBe(true);

      const [auditEntry] = await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, candidate.fixedRowId));
      expect(auditEntry?.actionType).toBe("RULE_BOOTSTRAPPED");
      expect(auditEntry?.operatorId).toBe(OPERATOR_ID);
      expect(auditEntry?.reason).toBe(BOOTSTRAP_REASON);
    }
  });

  it("is idempotent - running twice against the same fixed ids creates zero new rows and zero new audit entries", async () => {
    const candidate = syntheticCandidate("idempotent");
    cleanupRuleIds.push(candidate.fixedRowId);

    const first = await bootstrapUnit6bGovernance(db, [candidate], OPERATOR_ID);
    expect(first.created).toEqual([candidate.fixedRowId]);

    const second = await bootstrapUnit6bGovernance(db, [candidate], OPERATOR_ID);
    expect(second.created).toEqual([]);
    expect(second.alreadyPresent).toEqual([candidate.fixedRowId]);

    const rows = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, candidate.fixedRowId));
    expect(rows).toHaveLength(1);
    const auditEntries = await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, candidate.fixedRowId));
    expect(auditEntries).toHaveLength(1);
  });

  it("never overwrites a row that has already progressed past TRIAGED via a separate sourceVerify() call", async () => {
    const candidate = syntheticCandidate("progressed");
    cleanupRuleIds.push(candidate.fixedRowId);

    const first = await bootstrapUnit6bGovernance(db, [candidate], OPERATOR_ID);
    expect(first.created).toEqual([candidate.fixedRowId]);

    const rule = await getRuleById(db, candidate.fixedRowId);
    if (!rule) throw new Error("setup failed");
    const verified = sourceVerify(rule, { tier: "TIER_1", founderIdentity: OPERATOR_ID, founderVerifiedAt: new Date().toISOString() });
    if (verified.outcome !== "OK") throw new Error("setup failed");
    await withAdminTransaction((tx) =>
      transitionLifecycleState(tx, candidate.fixedRowId, { from: "TRIAGED", to: "SOURCE_VERIFIED" }, { verificationHistory: verified.rule.verificationHistory })
    );

    const second = await bootstrapUnit6bGovernance(db, [candidate], OPERATOR_ID);
    expect(second.created).toEqual([]);
    expect(second.alreadyPresent).toEqual([candidate.fixedRowId]);

    const [row] = await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, candidate.fixedRowId));
    expect(row?.lifecycleState).toBe("SOURCE_VERIFIED");
  });

  it("insert + RULE_BOOTSTRAPPED audit write are atomic: no orphaned row without an audit entry, or vice versa, across multiple candidates", async () => {
    const candidates = [syntheticCandidate("atomic-1"), syntheticCandidate("atomic-2")];
    candidates.forEach((c) => cleanupRuleIds.push(c.fixedRowId));

    await bootstrapUnit6bGovernance(db, candidates, OPERATOR_ID);

    for (const candidate of candidates) {
      const rowExists = (await db.select().from(regulatoryRules).where(eq(regulatoryRules.id, candidate.fixedRowId))).length > 0;
      const auditExists = (await db.select().from(adminActionLog).where(eq(adminActionLog.targetId, candidate.fixedRowId))).length > 0;
      expect(rowExists).toBe(auditExists);
      expect(rowExists).toBe(true);
    }
  });
});
