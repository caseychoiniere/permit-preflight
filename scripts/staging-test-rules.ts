/**
 * Shared definition AND logic for the synthetic, staging-only ACTIVE shed ruleset - the single
 * source of truth both scripts/seed-staging-rules.ts and scripts/clear-staging-test-rules.ts wrap
 * as thin CLI entry points (assertAllowed + process.exit only), so the two commands can never
 * drift apart on what "a staging test rule" is, and so the actual seed/clear/allow-check logic is
 * directly testable without spawning a subprocess or calling process.exit inside a test - see
 * tests/scripts/staging-test-rules.integration.test.ts.
 *
 * Exists ONLY to let end-to-end product testing exercise real findings (rear setback, height,
 * dwelling separation, side/front setback) against a real Seattle NR-zone test parcel, because the
 * real regulatory_rules table has zero ACTIVE rows right now (the real shed candidate is
 * intentionally held non-ACTIVE, pending an actual land-use professional's review - see
 * tests/fixtures/shed-candidate.ts's realShedCandidate, which this file never imports, reads, or
 * resembles by id/subject). These rows are never promoted, never referenced by any governance
 * workflow, and never a substitute for the real candidate's own eventual approval.
 *
 * ruleSpecification shapes below are copied verbatim from tests/fixtures/test-only-active-rules.ts
 * (rearSetbackRule/heightRule/dwellingSeparationRule/sideFrontSetbackRule) - already proven correct
 * against the real Rules Engine (regulatory-rules-engine/evaluate.ts) by the deterministic test
 * suite, reused here rather than re-derived, per the founder's own "reuse existing synthetic rule
 * specifications where practical" instruction.
 *
 * Why fixed, hardcoded UUIDs: `regulatory_rules.id` is a real Postgres `uuid` primary key, so it
 * cannot literally "begin with" the STAGING-TEST-ONLY text marker the way a string id could - a
 * human-readable name is impossible there. These 4 UUIDs are generated once (via
 * crypto.randomUUID()) and never regenerated; they are what makes upserting idempotent - re-running
 * the seed always updates these exact 4 rows in place rather than creating duplicates. The visible
 * "STAGING-TEST-ONLY" marker required by product-correctness lives in `subject` instead (a
 * free-text column, rendered as-is in /admin/rules), which every row below begins with.
 *
 * ALLOW_STAGING_TEST_RULE_SEED: both seed and clear are gated behind this one flag - a deliberate,
 * explicit opt-in, since neither script has a reliable way to distinguish a staging DATABASE_URL
 * from a production one by inspection alone.
 */

import { like } from "drizzle-orm";
import type { Db } from "../src/db/client.js";
import { regulatoryRules, type NewRegulatoryRuleRow } from "../src/db/schema.js";

export const ALLOW_FLAG_ENV_VAR = "ALLOW_STAGING_TEST_RULE_SEED";

/** True only if the explicit opt-in flag is set to exactly "true" - never inferred from
 * DATABASE_URL's shape, NODE_ENV, or any other signal. Pure/testable: no process.exit here. */
export function isStagingTestRuleSeedAllowed(): boolean {
  return process.env[ALLOW_FLAG_ENV_VAR] === "true";
}

/** Every staging test rule's `subject` begins with this - the actual, DB-queryable marker both
 * seedStagingTestRules and clearStagingTestRules key off of. Chosen to be unmistakable to a human
 * glancing at /admin/rules, and to never collide with any real rule subject, which describes real
 * regulatory content, never a literal "STAGING-TEST-ONLY" prefix. */
export const STAGING_TEST_RULE_SUBJECT_PREFIX = "STAGING-TEST-ONLY:";

/** Obviously-synthetic citation, reused on every row - never a real SMC section/ordinance number,
 * so it can never be mistaken for actual researched regulatory content even out of context (e.g.
 * copied into a PDF report, or read by an operator without first noticing isTestOnlyFixture). */
const STAGING_TEST_CITATION = {
  smcSections: ["STAGING-TEST-ONLY - synthetic fixture citation, not a real SMC section or ordinance"],
};

const SHARED_FIELDS = {
  applicableProjectType: "shed",
  applicableWorkflowType: "EXISTING_PROPERTY",
  // Requirement: applicableZone = NR, matching the real Seattle test parcel's real zone - the
  // whole point is to exercise the real evaluation/zone-matching path, not a fake zone value.
  applicableZone: "NR",
  citation: STAGING_TEST_CITATION,
  lifecycleState: "ACTIVE",
  tier: "TIER_1",
  caveats: [],
  testCases: [],
  verificationHistory: [
    {
      tier: "TIER_1",
      founderIdentity: "staging-test-seed@example.com",
      founderVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  isTestOnlyFixture: true,
  acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
} as const;

export interface StagingTestRuleDefinition {
  id: string;
  subject: string;
  ruleSpecification: Record<string, unknown>;
}

export const STAGING_TEST_RULES: StagingTestRuleDefinition[] = [
  {
    id: "108a5e9d-80a0-4880-84de-54343a215499",
    subject: `${STAGING_TEST_RULE_SUBJECT_PREFIX} Shed rear setback`,
    ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
  },
  {
    id: "e7413419-5335-4e35-818b-f4221bd30d24",
    subject: `${STAGING_TEST_RULE_SUBJECT_PREFIX} Shed height limit`,
    ruleSpecification: { ruleType: "HEIGHT_LIMIT", maxFt: 12 },
  },
  {
    id: "6ce8eff4-38b5-406d-b9bf-860fcf95d914",
    subject: `${STAGING_TEST_RULE_SUBJECT_PREFIX} Shed dwelling separation`,
    ruleSpecification: { ruleType: "DWELLING_SEPARATION", minFt: 3 },
  },
  {
    id: "86056ec3-f535-4dbc-934e-48c1306b44e1",
    subject: `${STAGING_TEST_RULE_SUBJECT_PREFIX} Shed side/front setback (standard, no reduction)`,
    ruleSpecification: { ruleType: "SIDE_FRONT_SETBACK_STANDARD", sideAverageFt: 5, sideMinFt: 3, frontFt: 15 },
  },
];

/** Exported for tests (tests/scripts/staging-test-rules.test.ts) to verify the full row shape
 * deterministically, without needing a real database. */
export function toNewRegulatoryRuleRow(def: StagingTestRuleDefinition): NewRegulatoryRuleRow {
  return {
    id: def.id,
    subject: def.subject,
    ruleSpecification: def.ruleSpecification,
    ...SHARED_FIELDS,
  };
}

/** Upserts all 4 rows by their fixed id (ON CONFLICT DO UPDATE) - idempotent: any number of calls
 * converges on the same 4 rows, never creating duplicates, never touching any other row (in
 * particular never the real shed candidate, whose id/subject never appear here). Does not check
 * ALLOW_STAGING_TEST_RULE_SEED itself - callers (the CLI script, or a test that has already
 * decided it's safe to do so) are responsible for that. */
export async function seedStagingTestRules(db: Db): Promise<StagingTestRuleDefinition[]> {
  for (const def of STAGING_TEST_RULES) {
    const row = toNewRegulatoryRuleRow(def);
    await db
      .insert(regulatoryRules)
      .values(row)
      .onConflictDoUpdate({
        target: regulatoryRules.id,
        set: {
          subject: row.subject,
          applicableProjectType: row.applicableProjectType,
          applicableWorkflowType: row.applicableWorkflowType,
          applicableZone: row.applicableZone,
          ruleSpecification: row.ruleSpecification,
          citation: row.citation,
          lifecycleState: row.lifecycleState,
          tier: row.tier,
          caveats: row.caveats,
          testCases: row.testCases,
          verificationHistory: row.verificationHistory,
          isTestOnlyFixture: row.isTestOnlyFixture,
          acceptedEvidenceQuality: row.acceptedEvidenceQuality,
        },
      });
  }
  return STAGING_TEST_RULES;
}

/** Deletes every row whose subject begins with STAGING_TEST_RULE_SUBJECT_PREFIX - matches by the
 * marker, not just the 4 known fixed ids, so it also cleans up any stray staging-test row (e.g.
 * from a since-edited version of this file) while remaining incapable of matching anything else,
 * in particular the real shed candidate, which never carries this marker. Does not check
 * ALLOW_STAGING_TEST_RULE_SEED itself - same contract as seedStagingTestRules above. */
export async function clearStagingTestRules(db: Db): Promise<{ id: string; subject: string }[]> {
  return db.delete(regulatoryRules).where(like(regulatoryRules.subject, `${STAGING_TEST_RULE_SUBJECT_PREFIX}%`)).returning({ id: regulatoryRules.id, subject: regulatoryRules.subject });
}
