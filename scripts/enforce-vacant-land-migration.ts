#!/usr/bin/env tsx
/**
 * Unit 5 NFR Design Migration Design Pattern - PRE-ACTIVATION ENFORCEMENT phase, applied
 * explicitly (Code Generation review correction).
 *
 * `src/db/manual-migrations/pre-activation-enforcement-vacant-land.sql` is deliberately NOT a
 * normal Drizzle migration file (it lives outside `src/db/migrations/` and has no entry in
 * `src/db/migrations/meta/_journal.json`) - `npm run db:migrate` (`drizzle-kit migrate`) applies
 * every pending journal-tracked migration unconditionally, which would apply the database-shape
 * `CHECK` constraints at the same moment as the EXPAND-phase column additions, defeating the
 * approved staged rollout (EXPAND -> application rollout -> PRE-ACTIVATION ENFORCEMENT ->
 * persistence-write activation). This script is the explicit, separate command for that one
 * later phase - run manually, only once every deployed application instance is confirmed
 * workflow-aware. No new migration framework is introduced; this is the smallest real mechanism
 * that keeps the phase genuinely separate from `db:migrate`'s own automatic chain.
 *
 * Usage: `npm run db:enforce-vacant-land`
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDb } from "../src/db/client.js";
import { sql } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = join(__dirname, "..", "src", "db", "manual-migrations", "pre-activation-enforcement-vacant-land.sql");

async function main() {
  const fileContents = readFileSync(MIGRATION_FILE, "utf8");
  const statements = fileContents
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  const db = getDb();
  console.log(`[enforce-vacant-land-migration] Applying ${statements.length} statement(s) from ${MIGRATION_FILE}`);

  for (const [i, statement] of statements.entries()) {
    try {
      await db.execute(sql.raw(statement));
      console.log(`[enforce-vacant-land-migration] Statement ${i + 1}/${statements.length} applied.`);
    } catch (err) {
      // Idempotent-safe re-run: a CHECK constraint that already exists (a previous partial run,
      // or a manual application) is reported, not fatal - a real UPDATE-statement failure or any
      // other error still stops the script.
      const message = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(message)) {
        console.warn(`[enforce-vacant-land-migration] Statement ${i + 1}/${statements.length} skipped (already applied): ${message}`);
        continue;
      }
      console.error(`[enforce-vacant-land-migration] Statement ${i + 1}/${statements.length} FAILED: ${message}`);
      throw err;
    }
  }

  console.log("[enforce-vacant-land-migration] PRE-ACTIVATION ENFORCEMENT complete. The database is now the authoritative enforcer of the workflow-shape invariant.");
  console.log("[enforce-vacant-land-migration] The persistence-write-activation gate (isVacantLandPersistenceWriteEnabled) may now be safely flipped to true, as a separate, later code change.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[enforce-vacant-land-migration] Aborted.", err);
    process.exit(1);
  });
