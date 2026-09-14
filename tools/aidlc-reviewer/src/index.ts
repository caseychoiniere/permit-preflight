#!/usr/bin/env node
/**
 * aidlc-reviewer MCP server.
 *
 * Exposes one tool, `review_gate` (Claude-visible as `aidlc-reviewer.review_gate`), backed by an
 * independent OpenAI reviewer with bounded delegated authority over routine AIDLC workflow gates.
 * See .ai/reviewer/decision-policy.md for the authority boundary and CLAUDE.md's "Delegated
 * AIDLC Approval" section for how Claude Code is expected to use this tool.
 *
 * Tool failure (missing API key, network failure, malformed model output, an invariant
 * violation) is always surfaced as an MCP tool error (isError: true) - never as a decision, and
 * never appended to the audit log. A failed review must never be interpreted as approval.
 */

import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import OpenAI from "openai";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ReviewGateInputShape, ReviewGateInputSchema } from "./schemas.js";
import { buildReviewContext, ContextBuildError } from "./context.js";
import { requestReview, requireApiKey, ReviewFailedError, type ReviewClient } from "./review.js";
import { appendDecision } from "./decision-log.js";

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function describeFailure(cause: unknown): string {
  if (cause instanceof ReviewFailedError || cause instanceof ContextBuildError || cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

export interface HandleReviewGateDeps {
  /** Injected in tests to avoid real OpenAI calls. Defaults to a real client using OPENAI_API_KEY. */
  client?: ReviewClient;
}

/**
 * The full review_gate handler, factored out of the MCP tool registration so it can be called
 * directly in tests without spinning up a stdio transport or making a real OpenAI request.
 */
export async function handleReviewGate(rawArgs: unknown, deps: HandleReviewGateDeps = {}): Promise<CallToolResult> {
  const parseResult = ReviewGateInputSchema.safeParse(rawArgs);
  if (!parseResult.success) {
    return errorResult(`Invalid review_gate input - failing closed, not approved: ${parseResult.error.message}`);
  }
  const input = parseResult.data;

  let client = deps.client;
  if (!client) {
    let apiKey: string;
    try {
      apiKey = requireApiKey();
    } catch (cause) {
      return errorResult(describeFailure(cause));
    }
    client = new OpenAI({ apiKey });
  }

  // buildReviewContext also loads the trusted instructions (system prompt + the full governing
  // policy) - see context.ts's trust-boundary note. There is no separate system-prompt load
  // here; instructions never come from anywhere but that one, server-controlled path.
  let context;
  try {
    context = buildReviewContext(input);
  } catch (cause) {
    if (cause instanceof ContextBuildError) {
      return errorResult(`Could not build review context - failing closed, not approved: ${cause.message}`);
    }
    return errorResult(describeFailure(cause));
  }

  let decision;
  try {
    decision = await requestReview(client, context.instructions, context.input);
  } catch (cause) {
    return errorResult(describeFailure(cause));
  }

  appendDecision({
    decisionId: decision.decisionId,
    timestamp: new Date().toISOString(),
    gateId: input.gateId,
    stage: input.stage,
    gateType: input.gateType,
    unitId: input.unitId,
    decision: decision.decision,
    confidence: decision.confidence,
    authority: decision.authority,
    summary: decision.summary,
    artifactsReviewed: context.artifactsRead,
    // The full set of prior decisions actually surfaced to the reviewer - this gate's own
    // history (auto-included, see context.ts) plus whatever Claude explicitly referenced -
    // not merely whatever Claude happened to pass in input.priorDecisionIds.
    priorDecisionIds: context.priorDecisions.map((record) => record.decisionId),
    findings: decision.findings,
    requiredChanges: decision.requiredChanges,
    escalation: decision.escalation,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(decision, null, 2) }],
    structuredContent: decision as unknown as Record<string, unknown>,
  };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "aidlc-reviewer", version: "0.1.0" });

  server.registerTool(
    "review_gate",
    {
      title: "AIDLC Delegated Gate Reviewer",
      description:
        "Mandatory delegated AIDLC reviewer for Permit Preflight. Call this BEFORE asking the founder to approve a " +
        "routine AIDLC workflow gate: plan approval, design approval, implementation approval, test approval, a " +
        "stage transition, presenting technical alternatives, or any other routine technical/workflow decision. " +
        "An independent OpenAI reviewer evaluates the gate against .ai/reviewer/decision-policy.md and returns " +
        "one of APPROVE (continue automatically, do not ask the founder to reconfirm), REVISE (make the required " +
        "changes and resubmit the same gate, do not ask the founder whether to make them), or ESCALATE (stop " +
        "progression of the affected decision and ask the founder - only then). The reviewer independently " +
        "identifies decisions reserved to the founder (product scope, pricing/monetization, regulatory/legal " +
        "ground truth, classification semantics, legal posture, core business assumptions, material economics) " +
        "regardless of what Claude's own riskFlags say. Tool failure (missing API key, network error, malformed " +
        "or logically inconsistent model output) is returned as an MCP error and must NEVER be treated as " +
        "approval.",
      inputSchema: ReviewGateInputShape,
    },
    async (args) => handleReviewGate(args)
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    process.stderr.write(`aidlc-reviewer: fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
