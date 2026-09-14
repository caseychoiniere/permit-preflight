import { describe, expect, it } from "vitest";
import {
  GATE_STAGES,
  ModelReviewDecisionSchema,
  ReviewGateInputSchema,
  checkDecisionInvariants,
  type ModelReviewDecision,
} from "../src/schemas.js";

function validInput() {
  return {
    gateId: "SRE-GARAGE-1:functional-design:v1",
    stage: "FUNCTIONAL_DESIGN",
    gateType: "DESIGN_APPROVAL",
    unitId: "SRE-GARAGE-1",
    question: "Is this functional design sufficient to proceed?",
    claudeRecommendation: "Continue to Code Generation.",
    alternatives: [],
    artifactPaths: [],
    changedFiles: [],
    acceptanceCriteria: [],
    testSummary: null,
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

function baseDecision(overrides: Partial<ModelReviewDecision> = {}): ModelReviewDecision {
  return {
    decision: "APPROVE",
    confidence: 0.9,
    authority: "DELEGATED",
    summary: "Looks good.",
    findings: [],
    requiredChanges: [],
    escalation: { required: false, reason: null, founderQuestion: null, recommendation: null },
    artifactsReviewed: [],
    priorDecisionsConsidered: [],
    ...overrides,
  };
}

describe("ReviewGateInputSchema", () => {
  it("accepts a valid request", () => {
    const result = ReviewGateInputSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("rejects an invalid stage", () => {
    const result = ReviewGateInputSchema.safeParse({ ...validInput(), stage: "NOT_A_REAL_STAGE" });
    expect(result.success).toBe(false);
  });

  it("accepts every real AI-DLC stage this repository actually uses (2026-09-14 hardening pass)", () => {
    for (const stage of ["NFR_REQUIREMENTS", "NFR_DESIGN", "INFRASTRUCTURE_DESIGN", "CODE_GENERATION", "BUILD_AND_TEST", "OPERATIONS"] as const) {
      expect(GATE_STAGES).toContain(stage);
      const result = ReviewGateInputSchema.safeParse({ ...validInput(), stage });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a missing gateId", () => {
    const { gateId, ...rest } = validInput();
    const result = ReviewGateInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an empty gateId", () => {
    const result = ReviewGateInputSchema.safeParse({ ...validInput(), gateId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid riskFlags (non-boolean value)", () => {
    const input = validInput();
    const result = ReviewGateInputSchema.safeParse({
      ...input,
      riskFlags: { ...input.riskFlags, productScope: "yes" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects riskFlags missing a required key", () => {
    const input = validInput();
    const { productScope, ...restFlags } = input.riskFlags;
    const result = ReviewGateInputSchema.safeParse({ ...input, riskFlags: restFlags });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid gateType", () => {
    const result = ReviewGateInputSchema.safeParse({ ...validInput(), gateType: "NOPE" });
    expect(result.success).toBe(false);
  });
});

describe("ModelReviewDecisionSchema", () => {
  it("accepts a well-formed APPROVE decision", () => {
    expect(ModelReviewDecisionSchema.safeParse(baseDecision()).success).toBe(true);
  });

  it("rejects an out-of-range confidence", () => {
    expect(ModelReviewDecisionSchema.safeParse(baseDecision({ confidence: 1.5 })).success).toBe(false);
  });

  it("rejects an unknown decision value", () => {
    const raw = { ...baseDecision(), decision: "MAYBE" };
    expect(ModelReviewDecisionSchema.safeParse(raw).success).toBe(false);
  });
});

describe("checkDecisionInvariants", () => {
  it("accepts a valid APPROVE", () => {
    expect(checkDecisionInvariants(baseDecision())).toEqual([]);
  });

  it("rejects APPROVE with confidence below 0.80", () => {
    const violations = checkDecisionInvariants(baseDecision({ confidence: 0.79 }));
    expect(violations.length).toBeGreaterThan(0);
  });

  it("rejects APPROVE with required changes present", () => {
    const violations = checkDecisionInvariants(
      baseDecision({ requiredChanges: [{ id: "1", instruction: "do it", reason: "because" }] })
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("rejects APPROVE with escalation.required true", () => {
    const violations = checkDecisionInvariants(
      baseDecision({ escalation: { required: true, reason: null, founderQuestion: null, recommendation: null } })
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("accepts a valid REVISE with at least one required change", () => {
    const decision = baseDecision({
      decision: "REVISE",
      confidence: 0.5,
      requiredChanges: [{ id: "1", instruction: "fix the thing", reason: "it is broken" }],
    });
    expect(checkDecisionInvariants(decision)).toEqual([]);
  });

  it("rejects REVISE with an empty requiredChanges array", () => {
    const violations = checkDecisionInvariants(baseDecision({ decision: "REVISE", confidence: 0.5 }));
    expect(violations.length).toBeGreaterThan(0);
  });

  it("accepts a valid ESCALATE with a founderQuestion", () => {
    const decision = baseDecision({
      decision: "ESCALATE",
      authority: "RESERVED_FOUNDER",
      confidence: 0.6,
      escalation: {
        required: true,
        reason: "pricing change",
        founderQuestion: "Should the report price change from $9.99?",
        recommendation: "Keep $9.99.",
      },
    });
    expect(checkDecisionInvariants(decision)).toEqual([]);
  });

  it("rejects ESCALATE without escalation.required set", () => {
    const decision = baseDecision({
      decision: "ESCALATE",
      escalation: { required: false, reason: null, founderQuestion: "Why?", recommendation: null },
    });
    expect(checkDecisionInvariants(decision).length).toBeGreaterThan(0);
  });

  it("rejects ESCALATE with an empty founderQuestion", () => {
    const decision = baseDecision({
      decision: "ESCALATE",
      escalation: { required: true, reason: "x", founderQuestion: "", recommendation: null },
    });
    expect(checkDecisionInvariants(decision).length).toBeGreaterThan(0);
  });

  it("rejects ESCALATE with a null founderQuestion", () => {
    const decision = baseDecision({
      decision: "ESCALATE",
      escalation: { required: true, reason: "x", founderQuestion: null, recommendation: null },
    });
    expect(checkDecisionInvariants(decision).length).toBeGreaterThan(0);
  });

  it("rejects authority RESERVED_FOUNDER paired with APPROVE", () => {
    const decision = baseDecision({ authority: "RESERVED_FOUNDER" });
    const violations = checkDecisionInvariants(decision);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("rejects authority RESERVED_FOUNDER paired with REVISE", () => {
    const decision = baseDecision({
      authority: "RESERVED_FOUNDER",
      decision: "REVISE",
      confidence: 0.5,
      requiredChanges: [{ id: "1", instruction: "x", reason: "y" }],
    });
    expect(checkDecisionInvariants(decision).length).toBeGreaterThan(0);
  });

  // Tightened cross-combination invariants (2026-09-14 founder-directed hardening pass).

  it("rejects REVISE with escalation.required true", () => {
    const decision = baseDecision({
      decision: "REVISE",
      confidence: 0.5,
      requiredChanges: [{ id: "1", instruction: "x", reason: "y" }],
      escalation: { required: true, reason: "why", founderQuestion: null, recommendation: null },
    });
    expect(checkDecisionInvariants(decision).length).toBeGreaterThan(0);
  });

  it("rejects ESCALATE with a non-empty requiredChanges array", () => {
    const decision = baseDecision({
      decision: "ESCALATE",
      authority: "RESERVED_FOUNDER",
      confidence: 0.6,
      requiredChanges: [{ id: "1", instruction: "x", reason: "y" }],
      escalation: { required: true, reason: "pricing", founderQuestion: "Change the price?", recommendation: "No." },
    });
    expect(checkDecisionInvariants(decision).length).toBeGreaterThan(0);
  });

  it("accepts ESCALATE with authority DELEGATED (e.g. low confidence, not a reserved decision)", () => {
    const decision = baseDecision({
      decision: "ESCALATE",
      authority: "DELEGATED",
      confidence: 0.4,
      requiredChanges: [],
      escalation: {
        required: true,
        reason: "Confidence cannot reach 0.80 given conflicting approved requirements.",
        founderQuestion: "Requirement A and Requirement B conflict on X - which governs?",
        recommendation: "Follow Requirement A.",
      },
    });
    expect(checkDecisionInvariants(decision)).toEqual([]);
  });

  it("rejects a bare escalation.required true with everything else defaulted to APPROVE-shaped values", () => {
    // Guards against a subtle bad combination: escalation.required=true but decision left as
    // APPROVE - already covered by the APPROVE branch, restated here as an explicit
    // cross-combination case per the hardening pass.
    const decision = baseDecision({
      decision: "APPROVE",
      confidence: 0.95,
      requiredChanges: [],
      escalation: { required: true, reason: "x", founderQuestion: "y", recommendation: "z" },
    });
    expect(checkDecisionInvariants(decision).length).toBeGreaterThan(0);
  });
});
