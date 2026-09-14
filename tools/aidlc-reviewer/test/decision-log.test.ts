import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendDecision, loadDecisionsByIds, readAllDecisions, type LoggedDecisionRecord } from "../src/decision-log.js";

let scratchDir: string;
let logPath: string;

function record(overrides: Partial<LoggedDecisionRecord> = {}): LoggedDecisionRecord {
  return {
    decisionId: "11111111-1111-4111-8111-111111111111",
    timestamp: new Date().toISOString(),
    gateId: "SRE-GARAGE-1:functional-design:v1",
    stage: "FUNCTIONAL_DESIGN",
    gateType: "DESIGN_APPROVAL",
    unitId: "SRE-GARAGE-1",
    decision: "APPROVE",
    confidence: 0.9,
    authority: "DELEGATED",
    summary: "Looks good.",
    artifactsReviewed: [],
    priorDecisionIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  scratchDir = mkdtempSync(path.join(tmpdir(), "aidlc-reviewer-decision-log-"));
  logPath = path.join(scratchDir, "nested", "decisions.jsonl");
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("appendDecision / readAllDecisions", () => {
  it("creates the log (and its directory) on first append", () => {
    appendDecision(record(), logPath);
    expect(readAllDecisions(logPath)).toHaveLength(1);
  });

  it("appends as one JSON line without rewriting existing lines", () => {
    appendDecision(record({ decisionId: "a" }), logPath);
    const before = readFileSync(logPath, "utf8");
    appendDecision(record({ decisionId: "b" }), logPath);
    const after = readFileSync(logPath, "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(readAllDecisions(logPath).map((r) => r.decisionId)).toEqual(["a", "b"]);
  });

  it("returns an empty array when the log does not exist yet", () => {
    expect(readAllDecisions(logPath)).toEqual([]);
  });
});

describe("loadDecisionsByIds", () => {
  it("loads existing records by id", () => {
    appendDecision(record({ decisionId: "a" }), logPath);
    appendDecision(record({ decisionId: "b" }), logPath);
    const { found, missing } = loadDecisionsByIds(["a", "b"], logPath);
    expect(missing).toEqual([]);
    expect(found.get("a")?.decisionId).toBe("a");
    expect(found.get("b")?.decisionId).toBe("b");
  });

  it("reports nonexistent referenced decisions as missing rather than fabricating them", () => {
    appendDecision(record({ decisionId: "a" }), logPath);
    const { found, missing } = loadDecisionsByIds(["a", "does-not-exist"], logPath);
    expect(found.has("does-not-exist")).toBe(false);
    expect(missing).toEqual(["does-not-exist"]);
  });

  it("returns everything missing when the log does not exist yet", () => {
    const { found, missing } = loadDecisionsByIds(["a"], logPath);
    expect(found.size).toBe(0);
    expect(missing).toEqual(["a"]);
  });
});
