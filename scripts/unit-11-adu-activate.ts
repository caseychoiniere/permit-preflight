/**
 * Unit 11 ADU activation (founder decision 2026-10-08: activate all 12 APPROVED ADU rules). Normal lifecycle
 * mechanism only (`activateRule`). Pre-checks: exactly 12 ADU rows, all APPROVED, none ACTIVE; snapshots every
 * non-ADU row's lifecycle state and verifies it is unchanged afterwards. Post-checks: all 12 ACTIVE with a
 * RULE_ACTIVATED audit entry each. Re-runnable: rows already ACTIVE are skipped (but the post-checks still run).
 */
import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { adminActionLog, regulatoryRules } from "../src/db/schema.js";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { activateRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";
import { ADU_FIXED_ROW_IDS } from "../tests/fixtures/adu-candidates.js";

process.loadEnvFile(".env.local");

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID must be supplied explicitly.");
  const db = getDb();
  const ids = Object.values(ADU_FIXED_ROW_IDS);
  if (ids.length !== 12) throw new Error(`Expected 12 ADU ids, found ${ids.length}.`);

  const adu = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (adu.length !== 12) throw new Error(`Expected 12 ADU rows, found ${adu.length}.`);
  const states = new Set(adu.map((r) => r.lifecycleState));
  console.log("ADU states before:", JSON.stringify(adu.map((r) => r.lifecycleState).reduce((a: Record<string, number>, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {})));
  for (const r of adu) if (r.lifecycleState !== "APPROVED" && r.lifecycleState !== "ACTIVE") throw new Error(`${r.subject} is ${r.lifecycleState}; refusing.`);
  if (states.has("ACTIVE") && states.has("APPROVED")) console.log("Some already ACTIVE; resuming.");

  const others = () => db.select({ id: regulatoryRules.id, s: regulatoryRules.lifecycleState }).from(regulatoryRules).where(sql`${regulatoryRules.id} NOT IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  const before = JSON.stringify((await others()).sort((a, b) => a.id.localeCompare(b.id)));

  for (const r of adu) {
    if (r.lifecycleState === "ACTIVE") continue;
    const out = await activateRule(db, r.id, operatorId, "Founder decision 2026-10-08 (relayed): activate all 12 APPROVED ADU rules; ADU readiness flag flipped after activation verification.", "ACTIVATE RULE");
    if (out.outcome !== "OK") throw new Error(`${r.subject}: ${JSON.stringify(out)}`);
    console.log("activated", r.subject.slice(0, 60));
  }

  const after = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (!after.every((r) => r.lifecycleState === "ACTIVE")) throw new Error("Not all 12 ADU rows are ACTIVE.");
  const afterOthers = JSON.stringify((await others()).sort((a, b) => a.id.localeCompare(b.id)));
  if (before !== afterOthers) throw new Error("A non-ADU rule changed state.");
  const audit = await db.select({ n: sql<number>`count(distinct ${adminActionLog.targetId})::int` }).from(adminActionLog).where(and(eq(adminActionLog.actionType, "RULE_ACTIVATED"), inArray(adminActionLog.targetId, ids)));
  console.log("ADU ACTIVE: 12; RULE_ACTIVATED audit entries for distinct ADU rules:", audit[0]?.n, "; non-ADU rows unchanged.");
  if (audit[0]?.n !== 12) throw new Error("Missing RULE_ACTIVATED audit entries.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
