/**
 * Guards the invariant the founder required explicitly (2026-09-14): smoke/unit/integration
 * tests must never write into the project's real, authoritative .ai/reviewer/decisions.jsonl -
 * only the isolated test fixture repo's copy. Two real smoke-test entries reached the real
 * production log once (via a live, manually-invoked MCP call, not the automated suite) and had
 * to be cleaned up by hand; this file exists so a regression in that isolation is caught by
 * `npm test`, not discovered again after the fact.
 *
 * The isolation itself is not new: vitest.config.ts's `test.env.AIDLC_REVIEWER_REPO_ROOT` already
 * points every test at the fixture repo before any test file's imports run, and every test file
 * already goes through DECISIONS_LOG_PATH (derived from that) rather than a hardcoded path. This
 * file makes that guarantee explicit, independently re-derived, and continuously checked -
 * rather than an implicit consequence of a config file nobody is specifically testing.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/paths.js";
import { appendDecision, readAllDecisions, DECISIONS_LOG_PATH } from "../src/decision-log.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO_ROOT = path.join(TEST_DIR, "fixtures", "repo");
// tools/aidlc-reviewer/test -> tools/aidlc-reviewer -> tools -> the real repository root.
// Deliberately re-derived independently of paths.ts/REPO_ROOT, so a bug in that module can't
// make this test agree with itself.
const REAL_REPO_ROOT = path.resolve(TEST_DIR, "..", "..", "..");
const REAL_PRODUCTION_LOG_PATH = path.join(REAL_REPO_ROOT, ".ai", "reviewer", "decisions.jsonl");

describe("test isolation from the production decision log", () => {
  it("sanity check: the real repo root is not the test fixture repo (proves the two paths below are genuinely different locations)", () => {
    expect(REAL_REPO_ROOT).not.toBe(FIXTURE_REPO_ROOT);
    expect(existsSync(path.join(REAL_REPO_ROOT, "CLAUDE.md"))).toBe(true);
  });

  it("resolves REPO_ROOT to the test fixture repo under this test run, never the real project root", () => {
    expect(REPO_ROOT).toBe(FIXTURE_REPO_ROOT);
    expect(REPO_ROOT).not.toBe(REAL_REPO_ROOT);
  });

  it("resolves the default decisions log path to the fixture repo, never the real production log", () => {
    expect(DECISIONS_LOG_PATH).not.toBe(REAL_PRODUCTION_LOG_PATH);
    expect(DECISIONS_LOG_PATH.startsWith(FIXTURE_REPO_ROOT + path.sep)).toBe(true);
  });

  it("appendDecision() with no explicit logPath override never writes to the real production decisions.jsonl", () => {
    const beforeExists = existsSync(REAL_PRODUCTION_LOG_PATH);
    const before = beforeExists ? readFileSync(REAL_PRODUCTION_LOG_PATH, "utf8") : null;

    const marker = "TEST-ISOLATION-GUARD-MUST-NEVER-REACH-PRODUCTION-LOG";
    // Deliberately exercises the real default (no `logPath` argument) - this is exactly the code
    // path index.ts's handleReviewGate uses for a real review.
    appendDecision({
      decisionId: marker,
      timestamp: new Date().toISOString(),
      gateId: marker,
      stage: "OTHER",
      gateType: "DECISION",
      unitId: "test-isolation-guard",
      decision: "APPROVE",
      confidence: 1,
      authority: "DELEGATED",
      summary: "Isolation guard - proves appendDecision()'s default path targets only the fixture repo.",
      artifactsReviewed: [],
      priorDecisionIds: [],
    });

    // The real production log must be byte-for-byte unchanged - not merely "still valid JSONL".
    const afterExists = existsSync(REAL_PRODUCTION_LOG_PATH);
    expect(afterExists).toBe(beforeExists);
    const after = afterExists ? readFileSync(REAL_PRODUCTION_LOG_PATH, "utf8") : null;
    expect(after).toBe(before);
    if (after !== null) {
      expect(after).not.toContain(marker);
    }

    // And it must have actually landed somewhere real (the fixture log), so this test is
    // exercising genuine behavior rather than vacuously passing because nothing wrote anywhere.
    const fixtureDecisions = readAllDecisions(DECISIONS_LOG_PATH);
    expect(fixtureDecisions.some((record) => record.decisionId === marker)).toBe(true);
  });
});
