#!/usr/bin/env tsx
/**
 * Thin CLI wrapper around clearStagingTestRules (./staging-test-rules.ts) - the counterpart to
 * seed-staging-rules.ts. Deletes every row whose subject begins with STAGING-TEST-ONLY: - matches
 * by that marker, never by anything that could also match the real shed candidate.
 *
 * Same fail-closed discipline as the seed script, reusing the same flag - one simple mental model
 * ("this flag governs both staging-test-rule commands") for what is, in both directions, the same
 * safety concern (never run against a database you are not certain is staging).
 *
 * Usage: ALLOW_STAGING_TEST_RULE_SEED=true npm run db:clear-staging-test-rules
 */

import { getDb } from "../src/db/client.js";
import { ALLOW_FLAG_ENV_VAR, isStagingTestRuleSeedAllowed, clearStagingTestRules } from "./staging-test-rules.js";

async function main(): Promise<void> {
  if (!isStagingTestRuleSeedAllowed()) {
    console.error(`[clear-staging-test-rules] Refusing to run: ${ALLOW_FLAG_ENV_VAR} is not set to "true".\nRe-run as:\n\n  ${ALLOW_FLAG_ENV_VAR}=true npm run db:clear-staging-test-rules\n`);
    process.exit(1);
  }

  const db = getDb();
  const deleted = await clearStagingTestRules(db);
  if (deleted.length === 0) {
    console.log("[clear-staging-test-rules] No staging-test rules found - nothing to delete.");
    return;
  }
  for (const row of deleted) console.log(`[clear-staging-test-rules]   Deleted: ${row.subject}`);
  console.log(`[clear-staging-test-rules] Done. Deleted ${deleted.length} staging-test rule(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[clear-staging-test-rules] Aborted.", err);
    process.exit(1);
  });
