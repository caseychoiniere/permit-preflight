import { describe, expect, it } from "vitest";
import { requestReview, requireApiKey, ReviewFailedError, type ReviewClient } from "../src/review.js";

function validApproveJson(): string {
  return JSON.stringify({
    decision: "APPROVE",
    confidence: 0.92,
    authority: "DELEGATED",
    summary: "Design satisfies approved requirements.",
    findings: [],
    requiredChanges: [],
    escalation: { required: false, reason: null, founderQuestion: null, recommendation: null },
    artifactsReviewed: ["aidlc-docs/sample.md"],
    priorDecisionsConsidered: [],
  });
}

function clientReturning(output_text: string, extra: Record<string, unknown> = {}): ReviewClient {
  return {
    responses: {
      create: async () => ({ output_text, status: "completed", ...extra }),
    },
  };
}

describe("requireApiKey", () => {
  it("returns the key when set", () => {
    expect(requireApiKey({ OPENAI_API_KEY: "sk-test-key" } as NodeJS.ProcessEnv)).toBe("sk-test-key");
  });

  it("fails closed when missing", () => {
    expect(() => requireApiKey({} as NodeJS.ProcessEnv)).toThrow(ReviewFailedError);
  });

  it("fails closed when set but empty", () => {
    expect(() => requireApiKey({ OPENAI_API_KEY: "   " } as NodeJS.ProcessEnv)).toThrow(ReviewFailedError);
  });
});

describe("requestReview", () => {
  it("returns a validated decision, with a server-generated decisionId, for a well-formed APPROVE response", async () => {
    const decision = await requestReview(clientReturning(validApproveJson()), "system prompt", "packet");
    expect(decision.decision).toBe("APPROVE");
    expect(decision.decisionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("calls the client with the exact model/reasoning/store/structured-output shape", async () => {
    let captured: Record<string, unknown> | undefined;
    const client: ReviewClient = {
      responses: {
        create: async (params) => {
          captured = params;
          return { output_text: validApproveJson(), status: "completed" };
        },
      },
    };
    await requestReview(client, "system prompt", "packet");
    expect(captured?.["model"]).toBe("gpt-5.6-sol");
    expect(captured?.["store"]).toBe(false);
    expect(captured?.["instructions"]).toBe("system prompt");
    expect(captured?.["input"]).toBe("packet");
    expect((captured?.["reasoning"] as { effort?: string })?.effort).toBe("high");
    const textConfig = captured?.["text"] as { format?: { type?: string; strict?: boolean; name?: string } };
    expect(textConfig?.format?.type).toBe("json_schema");
    expect(textConfig?.format?.strict).toBe(true);
    expect(textConfig?.format?.name).toBe("aidlc_review_decision");
  });

  it("fails closed on a network/API error - never returns a synthesized approval", async () => {
    const client: ReviewClient = {
      responses: {
        create: async () => {
          throw new Error("network timeout");
        },
      },
    };
    await expect(requestReview(client, "system", "packet")).rejects.toThrow(ReviewFailedError);
  });

  it("fails closed when the response did not complete", async () => {
    const client = clientReturning(validApproveJson(), { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    await expect(requestReview(client, "system", "packet")).rejects.toThrow(ReviewFailedError);
  });

  it("fails closed on empty output (e.g. a refusal)", async () => {
    const client = clientReturning("");
    await expect(requestReview(client, "system", "packet")).rejects.toThrow(ReviewFailedError);
  });

  it("fails closed on malformed (non-JSON) output", async () => {
    const client = clientReturning("this is not json {{{");
    await expect(requestReview(client, "system", "packet")).rejects.toThrow(ReviewFailedError);
  });

  it("fails closed when structured output violates the schema", async () => {
    const client = clientReturning(JSON.stringify({ decision: "MAYBE", confidence: 2 }));
    await expect(requestReview(client, "system", "packet")).rejects.toThrow(ReviewFailedError);
  });

  it("fails closed when the model's decision violates an invariant (APPROVE with required changes)", async () => {
    const invalid = JSON.parse(validApproveJson());
    invalid.requiredChanges = [{ id: "1", instruction: "fix it", reason: "because" }];
    const client = clientReturning(JSON.stringify(invalid));
    await expect(requestReview(client, "system", "packet")).rejects.toThrow(ReviewFailedError);
  });

  it("fails closed when authority is RESERVED_FOUNDER but decision is APPROVE", async () => {
    const invalid = JSON.parse(validApproveJson());
    invalid.authority = "RESERVED_FOUNDER";
    const client = clientReturning(JSON.stringify(invalid));
    await expect(requestReview(client, "system", "packet")).rejects.toThrow(ReviewFailedError);
  });

  it("never leaks the API key into a thrown error message", async () => {
    const client: ReviewClient = {
      responses: {
        create: async () => {
          throw new Error("Authorization failed for key sk-abcdefghijklmnopqrstuvwxyz1234567890");
        },
      },
    };
    try {
      await requestReview(client, "system", "packet");
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234567890");
    }
  });
});
