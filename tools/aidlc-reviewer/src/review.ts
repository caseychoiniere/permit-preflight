/**
 * Calls the OpenAI Responses API for one AIDLC gate review, validates the structured output, and
 * enforces the decision invariants. A ReviewFailedError from this module must NEVER be
 * interpreted as APPROVE anywhere downstream - see index.ts, which converts it into an MCP tool
 * error rather than a decision.
 */

import { randomUUID } from "node:crypto";
import { ModelReviewDecisionSchema, REVIEW_DECISION_JSON_SCHEMA, checkDecisionInvariants, type ReviewDecision } from "./schemas.js";

export class ReviewFailedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ReviewFailedError";
  }
}

const MODEL = "gpt-5.6-sol";

/**
 * The minimal shape this module depends on from the OpenAI SDK's `responses` resource. Kept
 * narrow and structural (rather than importing the SDK's own types) so tests can inject a mock
 * client without constructing a real OpenAI instance or making a network call - per the explicit
 * requirement that unit tests never call the real API.
 */
export interface ReviewClient {
  responses: {
    create(params: Record<string, unknown>): Promise<{
      status?: string;
      incomplete_details?: { reason?: string | null } | null;
      output_text?: string;
    }>;
  };
}

/** Reads OPENAI_API_KEY from the environment. Never logs it, never returns a default. */
export function requireApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env["OPENAI_API_KEY"];
  if (!key || key.trim().length === 0) {
    throw new ReviewFailedError(
      "OPENAI_API_KEY is not set. The reviewer cannot run without it. This is a fail-closed error, not an approval."
    );
  }
  return key;
}

/** Strips anything that looks like an OpenAI API key out of error text before it can be logged. */
function redactApiKey(text: string): string {
  return text.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "sk-***REDACTED***");
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    return redactApiKey(cause.message);
  }
  return redactApiKey(String(cause));
}

/**
 * Runs one review. Throws ReviewFailedError - never returns a synthesized/default decision - if
 * the request fails, times out, is refused, returns malformed output, or violates a decision
 * invariant. Fail closed at every one of those points.
 */
export async function requestReview(client: ReviewClient, instructions: string, input: string): Promise<ReviewDecision> {
  let response: Awaited<ReturnType<ReviewClient["responses"]["create"]>>;
  try {
    response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: "high" },
      store: false,
      instructions,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "aidlc_review_decision",
          strict: true,
          schema: REVIEW_DECISION_JSON_SCHEMA,
        },
      },
    });
  } catch (cause) {
    throw new ReviewFailedError(`OpenAI request failed - failing closed, not approved: ${describeError(cause)}`, cause);
  }

  if (response.status && response.status !== "completed") {
    const reason = response.incomplete_details?.reason ? `, reason=${response.incomplete_details.reason}` : "";
    throw new ReviewFailedError(`OpenAI response did not complete (status=${response.status}${reason}) - failing closed, not approved.`);
  }

  const rawText = response.output_text;
  if (!rawText || rawText.trim().length === 0) {
    throw new ReviewFailedError("OpenAI returned no output text (possibly a refusal or empty response) - failing closed, not approved.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (cause) {
    throw new ReviewFailedError("OpenAI's structured output was not valid JSON - failing closed, not approved.", cause);
  }

  const zodResult = ModelReviewDecisionSchema.safeParse(parsed);
  if (!zodResult.success) {
    throw new ReviewFailedError(
      `OpenAI's structured output did not match the required schema - failing closed, not approved: ${zodResult.error.message}`
    );
  }

  // Logically inconsistent model output is a failed review, never silently repaired.
  const violations = checkDecisionInvariants(zodResult.data);
  if (violations.length > 0) {
    throw new ReviewFailedError(
      `OpenAI's decision violated required invariants - failing closed, not approved: ${violations.join("; ")}`
    );
  }

  return { ...zodResult.data, decisionId: randomUUID() };
}
