import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { handleReviewGate } from "../src/index.js";
import { readAllDecisions, DECISIONS_LOG_PATH } from "../src/decision-log.js";
import type { ReviewClient } from "../src/review.js";

function smokeInput() {
  return {
    gateId: "SRE-GARAGE-1:functional-design:v1",
    stage: "FUNCTIONAL_DESIGN",
    gateType: "DESIGN_APPROVAL",
    unitId: "SRE-GARAGE-1",
    question: "Is this functional design sufficient to proceed?",
    claudeRecommendation: "Continue to Code Generation.",
    alternatives: [],
    artifactPaths: ["aidlc-docs/sample.md"],
    changedFiles: [],
    acceptanceCriteria: ["Garage lot coverage includes existing structures"],
    testSummary: "412/412 passing",
    evidenceSummary: null,
    priorDecisionIds: [],
    riskFlags: {
      productScope: false,
      regulatoryInterpretation: false,
      pricingOrMonetization: false,
      legalPosture: false,
      destructiveDataChange: false,
      securitySensitive: false,
      materialCostChange: false,
    },
  };
}

function mockClient(output_text: string): ReviewClient {
  return { responses: { create: async () => ({ output_text, status: "completed" }) } };
}

function approveJson() {
  return JSON.stringify({
    decision: "APPROVE",
    confidence: 0.9,
    authority: "DELEGATED",
    summary: "Design is sufficient to proceed.",
    findings: [],
    requiredChanges: [],
    escalation: { required: false, reason: null, founderQuestion: null, recommendation: null },
    artifactsReviewed: ["aidlc-docs/sample.md"],
    priorDecisionsConsidered: [],
  });
}

function reservedFounderApproveJson() {
  // Logically inconsistent: RESERVED_FOUNDER authority must always mean ESCALATE, never APPROVE.
  return JSON.stringify({
    decision: "APPROVE",
    confidence: 0.95,
    authority: "RESERVED_FOUNDER",
    summary: "This looks like a pricing change.",
    findings: [],
    requiredChanges: [],
    escalation: { required: false, reason: null, founderQuestion: null, recommendation: null },
    artifactsReviewed: [],
    priorDecisionsConsidered: [],
  });
}

beforeEach(() => {
  writeFileSync(DECISIONS_LOG_PATH, "");
});

describe("handleReviewGate - smoke scenario (§23)", () => {
  it("APPROVE passes through to Claude and is logged, without ever hitting the real OpenAI API", async () => {
    const result = await handleReviewGate(smokeInput(), { client: mockClient(approveJson()) });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { decision?: string; decisionId?: string } | undefined;
    expect(structured?.decision).toBe("APPROVE");
    expect(typeof structured?.decisionId).toBe("string");

    const logged = readAllDecisions();
    expect(logged).toHaveLength(1);
    expect(logged[0]?.decision).toBe("APPROVE");
    expect(logged[0]?.gateId).toBe("SRE-GARAGE-1:functional-design:v1");
  });

  it("authority RESERVED_FOUNDER + decision APPROVE is rejected as a failed review, not silently repaired into ESCALATE or accepted as APPROVE", async () => {
    const result = await handleReviewGate(smokeInput(), { client: mockClient(reservedFounderApproveJson()) });

    expect(result.isError).toBe(true);
    // Never logged - a failed review is not a decision.
    expect(readAllDecisions()).toHaveLength(0);
  });
});

describe("handleReviewGate - input validation", () => {
  it("rejects an invalid stage without calling OpenAI", async () => {
    let called = false;
    const client: ReviewClient = {
      responses: {
        create: async () => {
          called = true;
          return { output_text: approveJson(), status: "completed" };
        },
      },
    };
    const result = await handleReviewGate({ ...smokeInput(), stage: "NOT_A_STAGE" }, { client });
    expect(result.isError).toBe(true);
    expect(called).toBe(false);
    expect(readAllDecisions()).toHaveLength(0);
  });
});

describe("handleReviewGate - blocked/missing artifact paths", () => {
  it("rejects a blocked artifact path and never sends it to the model", async () => {
    let called = false;
    const client: ReviewClient = {
      responses: {
        create: async () => {
          called = true;
          return { output_text: approveJson(), status: "completed" };
        },
      },
    };
    const result = await handleReviewGate({ ...smokeInput(), artifactPaths: [".env"] }, { client });
    expect(result.isError).toBe(true);
    expect(called).toBe(false);
  });
});

describe("handleReviewGate - REVISE and ESCALATE flow", () => {
  it("REVISE is returned with required changes and logged", async () => {
    const revise = JSON.stringify({
      decision: "REVISE",
      confidence: 0.6,
      authority: "DELEGATED",
      summary: "Missing test coverage for the boundary case.",
      findings: [],
      requiredChanges: [{ id: "1", instruction: "Add a test for exactly 750 sq ft.", reason: "Boundary case is untested." }],
      escalation: { required: false, reason: null, founderQuestion: null, recommendation: null },
      artifactsReviewed: [],
      priorDecisionsConsidered: [],
    });
    const result = await handleReviewGate(smokeInput(), { client: mockClient(revise) });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { decision?: string };
    expect(structured?.decision).toBe("REVISE");
    expect(readAllDecisions()).toHaveLength(1);
  });

  it("ESCALATE is returned with a founder question and logged", async () => {
    const escalate = JSON.stringify({
      decision: "ESCALATE",
      confidence: 0.4,
      authority: "RESERVED_FOUNDER",
      summary: "This changes the per-report price.",
      findings: [],
      requiredChanges: [],
      escalation: {
        required: true,
        reason: "Pricing/monetization is reserved to the founder.",
        founderQuestion: "Should the shed report price increase to $12.99?",
        recommendation: "Keep the current $9.99 price.",
      },
      artifactsReviewed: [],
      priorDecisionsConsidered: [],
    });
    const result = await handleReviewGate(smokeInput(), { client: mockClient(escalate) });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { decision?: string; escalation?: { founderQuestion?: string } };
    expect(structured?.decision).toBe("ESCALATE");
    expect(structured?.escalation?.founderQuestion).toContain("$12.99");
    expect(readAllDecisions()).toHaveLength(1);
  });
});
