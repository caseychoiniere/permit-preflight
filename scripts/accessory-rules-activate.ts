/**
 * Shed/garage accessory-rule activation (founder decision 2026-10-08, relayed: activate the eight APPROVED real shed S1-S3 and garage G1-G5 rules). Normal lifecycle
 * mechanism only (`activateRule`). Pre-checks: exactly 8 rows, all APPROVED, none ACTIVE; snapshots every
 * other row's lifecycle state and verifies it is unchanged afterwards. Post-checks: all 8 ACTIVE with a
 * RULE_ACTIVATED audit entry each. Re-runnable: rows already ACTIVE are skipped (but the post-checks still run).
 */
import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { adminActionLog, regulatoryRules } from "../src/db/schema.js";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { activateRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";
import { ACCESSORY_FIXED_ROW_IDS } from "../tests/fixtures/accessory-candidates.js";

process.loadEnvFile(".env.local");

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID must be supplied explicitly.");
  const db = getDb();
  const ids = Object.values(ACCESSORY_FIXED_ROW_IDS);
  if (ids.length !== 8) throw new Error(`Expected 8 accessory ids, found ${ids.length}.`);

  const adu = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (adu.length !== 8) throw new Error(`Expected 8 accessory rows, found ${adu.length}.`);
  const states = new Set(adu.map((r) => r.lifecycleState));
  console.log("Accessory states before:", JSON.stringify(adu.map((r) => r.lifecycleState).reduce((a: Record<string, number>, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {})));
  for (const r of adu) if (r.lifecycleState !== "APPROVED" && r.lifecycleState !== "ACTIVE") throw new Error(`${r.subject} is ${r.lifecycleState}; refusing.`);
  if (states.has("ACTIVE") && states.has("APPROVED")) console.log("Some already ACTIVE; resuming.");

  const others = () => db.select({ id: regulatoryRules.id, s: regulatoryRules.lifecycleState }).from(regulatoryRules).where(sql`${regulatoryRules.id} NOT IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  const before = JSON.stringify((await others()).sort((a, b) => a.id.localeCompare(b.id)));

  for (const r of adu) {
    if (r.lifecycleState === "ACTIVE") continue;
    const out = await activateRule(db, r.id, operatorId, "Founder decision 2026-10-08 (relayed): activate the eight APPROVED real shed and garage rules (replacing the removed STAGING-TEST-ONLY shed fixtures); garage readiness flag follows smoke verification.", "ACTIVATE RULE");
    if (out.outcome !== "OK") throw new Error(`${r.subject}: ${JSON.stringify(out)}`);
    console.log("activated", r.subject.slice(0, 60));
  }

  const after = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (!after.every((r) => r.lifecycleState === "ACTIVE")) throw new Error("Not all 8 accessory rows are ACTIVE.");
  const afterOthers = JSON.stringify((await others()).sort((a, b) => a.id.localeCompare(b.id)));
  if (before !== afterOthers) throw new Error("An unrelated rule changed state.");
  const audit = await db.select({ n: sql<number>`count(distinct ${adminActionLog.targetId})::int` }).from(adminActionLog).where(and(eq(adminActionLog.actionType, "RULE_ACTIVATED"), inArray(adminActionLog.targetId, ids)));
  console.log("Accessory ACTIVE: 8; RULE_ACTIVATED audit entries for distinct accessory rules:", audit[0]?.n, "; other rows unchanged.");
  if (audit[0]?.n !== 8) throw new Error("Missing RULE_ACTIVATED audit entries.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
