#!/usr/bin/env tsx
/**
 * Thin CLI wrapper around seedStagingTestRules (./staging-test-rules.ts) - see that file's
 * docstring for the full rationale, the shared rule definitions, and why real production rule
 * loading/evaluation is completely unaffected (this is a plain data seed via the SAME
 * regulatory_rules table and SAME query path every real ACTIVE rule already uses).
 *
 * FAILS CLOSED: refuses to run at all unless ALLOW_STAGING_TEST_RULE_SEED=true is set in the
 * environment. This script has no reliable way to distinguish a staging DATABASE_URL from a
 * production one by inspection alone, so the safety boundary is this explicit, deliberate opt-in
 * flag - never a guess based on the connection string's shape.
 *
 * Idempotent: re-running any number of times converges on the same 4 rows (fixed ids, upserted),
 * never duplicating, never touching any other row - in particular, never the real shed candidate,
 * whose id/subject are never referenced anywhere in this file or staging-test-rules.ts.
 *
 * Usage: ALLOW_STAGING_TEST_RULE_SEED=true npm run db:seed-staging-rules
 */

import { getDb } from "../src/db/client.js";
import { ALLOW_FLAG_ENV_VAR, isStagingTestRuleSeedAllowed, seedStagingTestRules, STAGING_TEST_RULE_SUBJECT_PREFIX } from "./staging-test-rules.js";

async function main(): Promise<void> {
  if (!isStagingTestRuleSeedAllowed()) {
    console.error(
      `[seed-staging-rules] Refusing to run: ${ALLOW_FLAG_ENV_VAR} is not set to "true".\n` +
        "This script inserts synthetic ACTIVE regulatory rules - it must never run against a database\n" +
        "you are not certain is a staging/testing database. Re-run as:\n\n" +
        `  ${ALLOW_FLAG_ENV_VAR}=true npm run db:seed-staging-rules\n`
    );
    process.exit(1);
  }

  const db = getDb();
  const defs = await seedStagingTestRules(db);
  console.log(`[seed-staging-rules] Upserted ${defs.length} synthetic ACTIVE staging-test rule(s):`);
  for (const def of defs) console.log(`[seed-staging-rules]   OK: ${def.subject}`);
  console.log(
    `[seed-staging-rules] Done. These rules are clearly marked isTestOnlyFixture: true and visible in /admin/rules ` +
      `with subjects beginning "${STAGING_TEST_RULE_SUBJECT_PREFIX}". ` +
      `Run \`${ALLOW_FLAG_ENV_VAR}=true npm run db:clear-staging-test-rules\` to remove them again.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-staging-rules] Aborted.", err);
    process.exit(1);
  });
