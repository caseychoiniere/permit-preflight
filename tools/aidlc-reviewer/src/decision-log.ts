/**
 * Append-only JSONL decision audit log at .ai/reviewer/decisions.jsonl.
 *
 * Every successful reviewer decision is appended as one JSON line. Existing lines are never
 * rewritten or deleted by this module - if a later decision supersedes an earlier one, the
 * caller records a NEW line referencing the previous decisionId (see ReviewGateInput's
 * priorDecisionIds), it does not edit history.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.js";

export const DECISIONS_LOG_PATH = path.join(REPO_ROOT, ".ai", "reviewer", "decisions.jsonl");

export interface LoggedFinding {
  severity: string;
  category: string;
  description: string;
  evidence: string[];
}

export interface LoggedRequiredChange {
  id: string;
  instruction: string;
  reason: string;
}

export interface LoggedEscalation {
  required: boolean;
  reason: string | null;
  founderQuestion: string | null;
  recommendation: string | null;
}

/** One line of .ai/reviewer/decisions.jsonl. */
export interface LoggedDecisionRecord {
  decisionId: string;
  timestamp: string;
  gateId: string;
  stage: string;
  gateType: string;
  unitId: string;
  decision: string;
  confidence: number;
  authority: string;
  summary: string;
  artifactsReviewed: string[];
  priorDecisionIds: string[];
  findings?: LoggedFinding[];
  requiredChanges?: LoggedRequiredChange[];
  escalation?: LoggedEscalation;
}

export class DecisionLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionLogError";
  }
}

function readLines(logPath: string): string[] {
  if (!existsSync(logPath)) {
    return [];
  }
  const raw = readFileSync(logPath, "utf8");
  return raw.split("\n").filter((line) => line.trim().length > 0);
}

/** Appends one decision record as a single JSON line. Creates .ai/reviewer/ if needed. */
export function appendDecision(record: LoggedDecisionRecord, logPath: string = DECISIONS_LOG_PATH): void {
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
}

/** Reads and parses every record currently in the log, skipping blank lines. */
export function readAllDecisions(logPath: string = DECISIONS_LOG_PATH): LoggedDecisionRecord[] {
  return readLines(logPath).map((line, index) => {
    try {
      return JSON.parse(line) as LoggedDecisionRecord;
    } catch (cause) {
      throw new DecisionLogError(`Malformed decision-log line ${index + 1} in ${logPath}: not valid JSON`);
    }
  });
}

/**
 * Loads every decision ever recorded for one gateId, in log (chronological) order. Used to
 * automatically surface a gate's own revision history to the reviewer - Claude does not have to
 * remember to pass priorDecisionIds for THIS gate's own prior REVISE cycles (see context.ts);
 * cross-gate references still go through priorDecisionIds/loadDecisionsByIds below, which fails
 * closed on a missing id, since those are explicit claims rather than a mechanical lookup.
 */
export function loadDecisionsByGateId(gateId: string, logPath: string = DECISIONS_LOG_PATH): LoggedDecisionRecord[] {
  return readAllDecisions(logPath).filter((record) => record.gateId === gateId);
}

/**
 * Loads specific prior decisions by ID. Per policy: a claimed prior decision ID that does not
 * exist in the log is a validation failure, never fabricated and never silently skipped - the
 * caller (context.ts) is expected to reject the whole review request when `missing` is non-empty.
 */
export function loadDecisionsByIds(
  ids: string[],
  logPath: string = DECISIONS_LOG_PATH
): { found: Map<string, LoggedDecisionRecord>; missing: string[] } {
  const all = readAllDecisions(logPath);
  const byId = new Map(all.map((record) => [record.decisionId, record]));
  const found = new Map<string, LoggedDecisionRecord>();
  const missing: string[] = [];
  for (const id of ids) {
    const record = byId.get(id);
    if (record) {
      found.set(id, record);
    } else {
      missing.push(id);
    }
  }
  return { found, missing };
}
