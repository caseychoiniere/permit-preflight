/**
 * Activation of an APPROVED citywide-zoning rule set (prepared 2026-10-09). Activation is a founder-authorized decision per CLAUDE.md: each set is run only against an
 * explicit authorization recorded in ACTIVATION_AUTHORIZATION (and in every RULE_ACTIVATED audit entry). Authorized and run so far, in chat: lowrise, commercial,
 * lowrise-adu (2026-10-09, "ACTIVATE THE APPROVED CITYWIDE-ZONING RULE SETS"); garage-separation and the two Highrise rows of lowrise (garage coverage directive);
 * midrise-highrise-adu and commercial-adu ("CONTINUE BUILDING" directive, priority 3: lifecycle progression to ACTIVE without a further routine approval). Normal lifecycle mechanism only (`activateRule`). Pre-checks: every row of the set exists and is APPROVED (or
 * already ACTIVE); snapshots every other row's lifecycle state and verifies it is unchanged afterwards; post-checks: all rows ACTIVE with a RULE_ACTIVATED audit
 * entry each. Re-runnable.
 *
 * Usage: ADMIN_OPERATOR_ID=<operator> ACTIVATION_AUTHORIZATION="<who authorized, when, for which set>" npx tsx scripts/zoning-rules-activate.ts <set...>
 *   set: lowrise (multifamily shed/garage/fence/deck) | lowrise-adu | commercial | garage-separation | midrise-highrise-adu | commercial-adu
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { requireOperatorId } from "../src/admin-auth/operator.js";
import { adminActionLog, regulatoryRules } from "../src/db/schema.js";
import { activateRule } from "../src/regulatory-rule-governance/admin-lifecycle.js";
import { COMMERCIAL_FIXED_ROW_IDS } from "../tests/fixtures/commercial-candidates.js";
import { MULTIFAMILY_FIXED_ROW_IDS } from "../tests/fixtures/multifamily-candidates.js";
import { ADU_MF_FIXED_ROW_IDS } from "../tests/fixtures/multifamily-adu-candidates.js";
import { ADU_MR_HR_FIXED_ROW_IDS } from "../tests/fixtures/multifamily-adu-mr-hr-candidates.js";
import { ADU_COMM_FIXED_ROW_IDS } from "../tests/fixtures/commercial-adu-candidates.js";
import { GARAGE_SEPARATION_FIXED_ROW_IDS } from "../tests/fixtures/garage-separation-candidates.js";

process.loadEnvFile(".env.local");

const SETS: Record<string, Record<string, string>> = { lowrise: MULTIFAMILY_FIXED_ROW_IDS, "lowrise-adu": ADU_MF_FIXED_ROW_IDS, commercial: COMMERCIAL_FIXED_ROW_IDS, "garage-separation": GARAGE_SEPARATION_FIXED_ROW_IDS, "midrise-highrise-adu": ADU_MR_HR_FIXED_ROW_IDS, "commercial-adu": ADU_COMM_FIXED_ROW_IDS };

async function main() {
  const operatorId = requireOperatorId();
  if (!operatorId) throw new Error("ADMIN_OPERATOR_ID must be supplied explicitly.");
  const authorization = process.env["ACTIVATION_AUTHORIZATION"]?.trim();
  if (!authorization) throw new Error("ACTIVATION_AUTHORIZATION must state who authorized this activation, when, and for which set. Activation is a founder decision.");
  const names = process.argv.slice(2);
  if (names.length === 0 || names.some((n) => !SETS[n])) throw new Error(`Name one or more sets: ${Object.keys(SETS).join(", ")}`);
  const ids = names.flatMap((n) => Object.values(SETS[n]!));
  const db = getDb();

  const rows = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (rows.length !== ids.length) throw new Error(`Expected ${ids.length} rows, found ${rows.length}.`);
  for (const r of rows) if (r.lifecycleState !== "APPROVED" && r.lifecycleState !== "ACTIVE") throw new Error(`${r.subject} is ${r.lifecycleState}; refusing.`);

  const others = () => db.select({ id: regulatoryRules.id, s: regulatoryRules.lifecycleState }).from(regulatoryRules).where(sql`${regulatoryRules.id} NOT IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  const before = JSON.stringify((await others()).sort((a, b) => a.id.localeCompare(b.id)));
  for (const r of rows) {
    if (r.lifecycleState === "ACTIVE") continue;
    const out = await activateRule(db, r.id, operatorId, `Activation of the ${names.join(" + ")} citywide-zoning rule set. Authorization: ${authorization}`, "ACTIVATE RULE");
    if (out.outcome !== "OK") throw new Error(`${r.subject}: ${JSON.stringify(out)}`);
  }
  const after = await db.select().from(regulatoryRules).where(inArray(regulatoryRules.id, ids));
  if (!after.every((r) => r.lifecycleState === "ACTIVE")) throw new Error("Not every row is ACTIVE.");
  if (before !== JSON.stringify((await others()).sort((a, b) => a.id.localeCompare(b.id)))) throw new Error("An unrelated rule changed state.");
  const audit = await db.select({ n: sql<number>`count(distinct ${adminActionLog.targetId})::int` }).from(adminActionLog).where(and(eq(adminActionLog.actionType, "RULE_ACTIVATED"), inArray(adminActionLog.targetId, ids)));
  if (audit[0]?.n !== ids.length) throw new Error("Missing RULE_ACTIVATED audit entries.");
  console.log(`${ids.length} rows ACTIVE with audit entries; other rows unchanged.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
