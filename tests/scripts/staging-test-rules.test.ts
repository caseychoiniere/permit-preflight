/**
 * Deterministic (no DB) tests for the staging-test-rules seed definitions and fail-closed check -
 * see scripts/staging-test-rules.ts. The real insert/upsert/delete behavior against a live
 * database is covered separately in
 * tests/scripts/staging-test-rules.integration.test.ts (skips cleanly without DATABASE_URL).
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  ALLOW_FLAG_ENV_VAR,
  isStagingTestRuleSeedAllowed,
  STAGING_TEST_RULE_SUBJECT_PREFIX,
  STAGING_TEST_RULES,
  toNewRegulatoryRuleRow,
} from "../../scripts/staging-test-rules.js";
import { realShedCandidate } from "../fixtures/shed-candidate.js";

describe("isStagingTestRuleSeedAllowed (fail-closed check)", () => {
  afterEach(() => {
    delete process.env[ALLOW_FLAG_ENV_VAR];
  });

  it("[hard invariant] false when the flag is unset", () => {
    delete process.env[ALLOW_FLAG_ENV_VAR];
    expect(isStagingTestRuleSeedAllowed()).toBe(false);
  });

  it("[hard invariant] false for anything other than the exact string \"true\" (e.g. \"1\", \"yes\", \"TRUE\") - never a loose truthiness check", () => {
    for (const value of ["1", "yes", "TRUE", "True", ""]) {
      process.env[ALLOW_FLAG_ENV_VAR] = value;
      expect(isStagingTestRuleSeedAllowed()).toBe(false);
    }
  });

  it("true only when set to exactly \"true\"", () => {
    process.env[ALLOW_FLAG_ENV_VAR] = "true";
    expect(isStagingTestRuleSeedAllowed()).toBe(true);
  });
});

describe("STAGING_TEST_RULES definitions", () => {
  it("[hard invariant] covers exactly the 4 required rule types: rear setback, height, dwelling separation, side/front setback", () => {
    const ruleTypes = STAGING_TEST_RULES.map((d) => (d.ruleSpecification as { ruleType: string }).ruleType).sort();
    expect(ruleTypes).toEqual(["DWELLING_SEPARATION", "HEIGHT_LIMIT", "REAR_SETBACK", "SIDE_FRONT_SETBACK_STANDARD"]);
  });

  it("[hard invariant] every subject begins with the STAGING-TEST-ONLY marker", () => {
    for (const def of STAGING_TEST_RULES) {
      expect(def.subject.startsWith(STAGING_TEST_RULE_SUBJECT_PREFIX)).toBe(true);
    }
  });

  it("[hard invariant] every row is isTestOnlyFixture: true, ACTIVE, applicableProjectType shed, applicableZone NR, and carries an obviously-synthetic citation", () => {
    for (const def of STAGING_TEST_RULES) {
      const row = toNewRegulatoryRuleRow(def);
      expect(row.isTestOnlyFixture).toBe(true);
      expect(row.lifecycleState).toBe("ACTIVE");
      expect(row.applicableProjectType).toBe("shed");
      expect(row.applicableWorkflowType).toBe("EXISTING_PROPERTY");
      expect(row.applicableZone).toBe("NR");
      expect(JSON.stringify(row.citation)).toMatch(/STAGING-TEST-ONLY/);
      expect(JSON.stringify(row.citation)).not.toMatch(/SMC \d/); // never a real-looking SMC citation
    }
  });

  it("[hard invariant] every id is a fixed, distinct UUID (idempotency depends on this) - not defaultRandom()", () => {
    const ids = STAGING_TEST_RULES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it("[hard invariant] never references the real shed candidate's id or subject in any way", () => {
    const ids = STAGING_TEST_RULES.map((d) => d.id);
    const subjects = STAGING_TEST_RULES.map((d) => d.subject);
    expect(ids).not.toContain(realShedCandidate.id);
    expect(subjects).not.toContain(realShedCandidate.subject);
    for (const subject of subjects) {
      expect(subject).not.toBe(realShedCandidate.subject);
    }
  });
});
