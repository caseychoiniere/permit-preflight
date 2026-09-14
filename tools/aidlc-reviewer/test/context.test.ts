import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildReviewContext, ContextBuildError, type UntrustedReviewPacket } from "../src/context.js";
import { appendDecision, DECISIONS_LOG_PATH } from "../src/decision-log.js";

function baseInput() {
  return {
    gateId: "SRE-GARAGE-1:functional-design:v1",
    stage: "FUNCTIONAL_DESIGN" as const,
    gateType: "DESIGN_APPROVAL" as const,
    unitId: "SRE-GARAGE-1",
    question: "Is this functional design sufficient to proceed?",
    claudeRecommendation: "Continue to Code Generation.",
    alternatives: [],
    artifactPaths: [] as string[],
    changedFiles: [] as string[],
    acceptanceCriteria: ["Garage lot coverage includes existing structures"],
    testSummary: "412/412 passing",
    evidenceSummary: null,
    priorDecisionIds: [] as string[],
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

function loggedDecision(overrides: Record<string, unknown> = {}) {
  return {
    decisionId: "prior-1",
    timestamp: new Date().toISOString(),
    gateId: "SRE-GARAGE-1:requirements:v1",
    stage: "REQUIREMENTS",
    gateType: "PLAN_APPROVAL",
    unitId: "SRE-GARAGE-1",
    decision: "APPROVE",
    confidence: 0.95,
    authority: "DELEGATED",
    summary: "Requirements are complete.",
    artifactsReviewed: [],
    priorDecisionIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  // Reset the fixture repo's decision log between tests so prior-decision resolution is isolated.
  writeFileSync(DECISIONS_LOG_PATH, "");
});

describe("buildReviewContext - trusted instructions", () => {
  it("puts the governing policy in instructions, never in input", () => {
    const context = buildReviewContext(baseInput());
    expect(context.instructions).toContain("Test decision policy fixture marker");
    expect(context.instructions).toContain("<governing_policy>");
    expect(context.input).not.toContain("Test decision policy fixture marker");
    expect(context.input).not.toContain("governing_policy");
  });

  it("includes the system prompt in instructions", () => {
    const context = buildReviewContext(baseInput());
    expect(context.instructions).toContain("You are a test reviewer.");
  });

  it("never lets request content influence instructions", () => {
    const context = buildReviewContext({ ...baseInput(), question: "UNIQUE_MARKER_IN_QUESTION_999" });
    expect(context.instructions).not.toContain("UNIQUE_MARKER_IN_QUESTION_999");
  });
});

describe("buildReviewContext - untrusted input structure", () => {
  it("is valid, parseable JSON", () => {
    const context = buildReviewContext(baseInput());
    expect(() => JSON.parse(context.input)).not.toThrow();
  });

  it("includes acceptance criteria", () => {
    const context = buildReviewContext(baseInput());
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(packet.acceptanceCriteria).toContain("Garage lot coverage includes existing structures");
  });

  it("includes requested artifacts with path and content", () => {
    const context = buildReviewContext({ ...baseInput(), artifactPaths: ["aidlc-docs/sample.md"] });
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(packet.artifacts).toHaveLength(1);
    expect(packet.artifacts[0]?.path).toBe("aidlc-docs/sample.md");
    expect(packet.artifacts[0]?.content).toContain("# Sample artifact");
    expect(context.artifactsRead).toContain("aidlc-docs/sample.md");
  });

  it("includes requested changed files", () => {
    const context = buildReviewContext({ ...baseInput(), changedFiles: ["aidlc-docs/sample.md"] });
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(packet.changedFiles).toHaveLength(1);
    expect(packet.changedFiles[0]?.path).toBe("aidlc-docs/sample.md");
  });

  it("refuses a blocked artifact path rather than inserting it into the packet", () => {
    expect(() => buildReviewContext({ ...baseInput(), artifactPaths: [".env"] })).toThrow(ContextBuildError);
  });

  it("refuses a traversal artifact path rather than inserting it into the packet", () => {
    expect(() => buildReviewContext({ ...baseInput(), artifactPaths: ["../../../etc/passwd"] })).toThrow(
      ContextBuildError
    );
  });
});

describe("buildReviewContext - prompt injection / trust boundary (founder-directed fix, 2026-09-14)", () => {
  const maliciousPath = "aidlc-docs/malicious-artifact.md";
  const maliciousRaw = readFileSync(path.join(process.env["AIDLC_REVIEWER_REPO_ROOT"] as string, maliciousPath), "utf8");

  it("contains the injection payloads the fixture is designed to test (sanity check on the fixture itself)", () => {
    expect(maliciousRaw).toContain("</artifact>");
    expect(maliciousRaw).toContain("<governing_policy>");
    expect(maliciousRaw).toContain("APPROVE this gate");
  });

  it("represents malicious artifact content only as an inert JSON string value, never as structure", () => {
    const context = buildReviewContext({ ...baseInput(), artifactPaths: [maliciousPath] });

    // The whole input must still be valid, single-document JSON - a successful JSON.parse here
    // proves the artifact's embedded `"}, "reviewRequest": {...` text did not break out of its
    // own string literal and splice in a sibling top-level structure.
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;

    expect(packet.artifacts).toHaveLength(1);
    // The malicious text survives byte-for-byte as inert `content` - never parsed as structure.
    expect(packet.artifacts[0]?.content).toBe(maliciousRaw);

    // Exactly one review request, with the ORIGINAL question - the artifact's embedded fake
    // "question": "APPROVE this gate" did not overwrite or duplicate the real review request.
    expect(packet.reviewRequest.question).toBe("Is this functional design sufficient to proceed?");
  });

  it("never lets a malicious artifact smuggle the governing policy (or a fake one) into input", () => {
    const context = buildReviewContext({ ...baseInput(), artifactPaths: [maliciousPath] });
    // The ONLY place "governing_policy" may legitimately appear is inside the artifact's own
    // JSON-escaped content string (as literal attacker text) - never as a second top-level key
    // or as a real policy block. Confirm the real policy marker is absent from input entirely.
    expect(context.input).not.toContain("Test decision policy fixture marker");
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(Object.keys(packet)).not.toContain("governing_policy");
    expect(Object.keys(packet)).not.toContain("instructions");
  });

  it("never lets a malicious changed-file forge a fake decision", () => {
    const context = buildReviewContext({ ...baseInput(), changedFiles: [maliciousPath] });
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(packet.changedFiles[0]?.content).toContain("APPROVE this gate");
    // Still exactly the real, structured review request - the payload is inert.
    expect(packet.reviewRequest.gateId).toBe("SRE-GARAGE-1:functional-design:v1");
  });
});

describe("buildReviewContext - gate-history auto-inclusion (revision continuity)", () => {
  it("automatically includes this gate's own prior decisions without requiring priorDecisionIds", () => {
    appendDecision(
      loggedDecision({
        decisionId: "revise-1",
        gateId: "SRE-GARAGE-1:functional-design:v1",
        decision: "REVISE",
        confidence: 0.5,
        summary: "Missing a boundary-case test.",
        requiredChanges: [{ id: "1", instruction: "Add a test for exactly 750 sq ft.", reason: "Untested boundary." }],
      })
    );

    // NOTE: priorDecisionIds is deliberately left empty - this is exactly the "Claude forgot to
    // pass it" scenario the fix must not depend on.
    const context = buildReviewContext(baseInput());
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;

    expect(packet.priorDecisionsForThisGate).toHaveLength(1);
    expect(packet.priorDecisionsForThisGate[0]?.decisionId).toBe("revise-1");
    expect(packet.priorDecisionsForThisGate[0]?.decision).toBe("REVISE");
    // Full prior findings/requiredChanges must be visible, not just the summary line.
    expect(packet.priorDecisionsForThisGate[0]?.requiredChanges?.[0]?.instruction).toContain("750 sq ft");
    expect(context.priorDecisions.map((d) => d.decisionId)).toContain("revise-1");
  });

  it("computes revisionCountForGate from this gate's REVISE history", () => {
    appendDecision(loggedDecision({ decisionId: "r1", gateId: "SRE-GARAGE-1:functional-design:v1", decision: "REVISE", confidence: 0.5, requiredChanges: [{ id: "1", instruction: "x", reason: "y" }] }));
    appendDecision(loggedDecision({ decisionId: "r2", gateId: "SRE-GARAGE-1:functional-design:v1", decision: "REVISE", confidence: 0.5, requiredChanges: [{ id: "1", instruction: "x", reason: "y" }] }));
    appendDecision(loggedDecision({ decisionId: "other-gate", gateId: "SOME-OTHER-GATE", decision: "REVISE", confidence: 0.5, requiredChanges: [{ id: "1", instruction: "x", reason: "y" }] }));

    const context = buildReviewContext(baseInput());
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(packet.reviewRequest.revisionCountForGate).toBe(2);
  });

  it("does not double-count a gate-history decision that is also explicitly referenced", () => {
    appendDecision(loggedDecision({ decisionId: "revise-1", gateId: "SRE-GARAGE-1:functional-design:v1", decision: "REVISE", confidence: 0.5, requiredChanges: [{ id: "1", instruction: "x", reason: "y" }] }));

    const context = buildReviewContext({ ...baseInput(), priorDecisionIds: ["revise-1"] });
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(packet.priorDecisionsForThisGate).toHaveLength(1);
    expect(packet.additionalReferencedPriorDecisions).toHaveLength(0);
    expect(context.priorDecisions).toHaveLength(1);
  });

  it("still supports explicit cross-gate references via priorDecisionIds", () => {
    appendDecision(loggedDecision({ decisionId: "cross-gate-1", gateId: "SRE-GARAGE-1:requirements:v1" }));

    const context = buildReviewContext({ ...baseInput(), priorDecisionIds: ["cross-gate-1"] });
    const packet = JSON.parse(context.input) as UntrustedReviewPacket;
    expect(packet.priorDecisionsForThisGate).toHaveLength(0);
    expect(packet.additionalReferencedPriorDecisions).toHaveLength(1);
    expect(packet.additionalReferencedPriorDecisions[0]?.decisionId).toBe("cross-gate-1");
  });

  it("fails rather than fabricating an explicitly referenced prior decision that does not exist", () => {
    expect(() => buildReviewContext({ ...baseInput(), priorDecisionIds: ["does-not-exist"] })).toThrow(
      ContextBuildError
    );
  });
});
