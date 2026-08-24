import { describe, expect, it } from "vitest";
import {
  activate,
  approve,
  draft,
  markTested,
  sourceVerify,
  supersede,
  triage,
} from "../../src/regulatory-rule-governance/lifecycle.js";
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";

/**
 * These tests use an explicitly TEST-ONLY fixture rule (isTestOnlyFixture: true) to prove
 * lifecycle mechanics. Per the user's explicit constraint, this must never be confused with the
 * real Unit 0B shed candidate, which is NOT advanced through this lifecycle here (see
 * tests/regulatory-rule-governance/shed-candidate.test.ts for its honest, non-ACTIVE status).
 */
function testOnlyDraft(overrides: Partial<DraftedRuleInput> = {}): DraftedRuleInput {
  return {
    id: "test-fixture-rule-001",
    subject: "TEST-ONLY fixture rule - not production regulatory content",
    applicableProjectType: "test",
    applicableZone: "TEST",
    ruleSpecification: { ruleType: "HEIGHT_LIMIT", maxFt: 100 },
    citation: { smcSections: ["TEST.0.0"] },
    caveats: [],
    testCases: [{ kind: "POSITIVE", description: "fixture case", input: {}, expected: {} }],
    isTestOnlyFixture: true,
    ...overrides,
  };
}

describe("Regulatory Rule Governance lifecycle - BR-6/BR-7/BR-8", () => {
  it("[hard invariant] triage() is a required TypeScript parameter AND runtime-rejects a blank founder identity - no automated path can supply an empty/absent human identity", () => {
    const rule = draft(testOnlyDraft());
    // TypeScript enforces founderIdentity/tier as required, non-optional parameters at compile
    // time (see the function signature in lifecycle.ts) - there is no overload omitting them.
    // At runtime, an empty string is also explicitly rejected, so even a caller that passes an
    // empty placeholder cannot silently reach TRIAGED.
    const result = triage(rule, "", "TIER_1");
    expect(result.outcome).toBe("REJECTED");
  });

  it("rejects triage when the rule is not in DRAFTED state", () => {
    const rule = draft(testOnlyDraft());
    const triaged = triage(rule, "founder@example.com", "TIER_1");
    expect(triaged.outcome).toBe("OK");
    if (triaged.outcome !== "OK") return;
    const secondTriage = triage(triaged.rule, "founder@example.com", "TIER_1");
    expect(secondTriage.outcome).toBe("REJECTED");
  });

  it("[hard invariant] TIER_2 rules cannot reach SOURCE_VERIFIED without a recorded escalated-professional opinion", () => {
    const rule = draft(testOnlyDraft());
    const triaged = triage(rule, "founder@example.com", "TIER_2");
    expect(triaged.outcome).toBe("OK");
    if (triaged.outcome !== "OK") return;

    const withoutProfessional = sourceVerify(triaged.rule, {
      tier: "TIER_2",
      founderIdentity: "founder@example.com",
      founderVerifiedAt: new Date().toISOString(),
    });
    expect(withoutProfessional.outcome).toBe("REJECTED");

    const withProfessional = sourceVerify(triaged.rule, {
      tier: "TIER_2",
      founderIdentity: "founder@example.com",
      founderVerifiedAt: new Date().toISOString(),
      escalatedProfessional: {
        identity: "jane.doe@example-landuse.com",
        professionType: "LAND_USE_CONSULTANT",
        opinion: "Confirmed the derivation is consistent with the cited SMC section.",
        reviewedAt: new Date().toISOString(),
      },
    });
    expect(withProfessional.outcome).toBe("OK");
  });

  it("TIER_1 rules can reach SOURCE_VERIFIED with only founder verification", () => {
    const rule = draft(testOnlyDraft());
    const triaged = triage(rule, "founder@example.com", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");
    const verified = sourceVerify(triaged.rule, {
      tier: "TIER_1",
      founderIdentity: "founder@example.com",
      founderVerifiedAt: new Date().toISOString(),
    });
    expect(verified.outcome).toBe("OK");
  });

  it("rejects markTested unless every declared test case passed", () => {
    const rule = draft(testOnlyDraft());
    const triaged = triage(rule, "founder@example.com", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");
    const verified = sourceVerify(triaged.rule, { tier: "TIER_1", founderIdentity: "founder@example.com", founderVerifiedAt: new Date().toISOString() });
    if (verified.outcome !== "OK") throw new Error("setup failed");

    const failing = markTested(verified.rule, [{ testCaseIndex: 0, passed: false }]);
    expect(failing.outcome).toBe("REJECTED");

    const passing = markTested(verified.rule, [{ testCaseIndex: 0, passed: true }]);
    expect(passing.outcome).toBe("OK");
  });

  it("takes a rule through the full lifecycle to ACTIVE, preserving caveats unchanged", () => {
    const caveat = {
      category: "test-caveat",
      description: "example",
      affectedConditionOrInterpretation: "example condition",
      sourceReferences: ["TEST.0.0"],
      resolutionStatus: "accepted despite caveat",
    };
    const rule = draft(testOnlyDraft({ caveats: [caveat] }));
    const triaged = triage(rule, "founder@example.com", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");
    const verified = sourceVerify(triaged.rule, { tier: "TIER_1", founderIdentity: "founder@example.com", founderVerifiedAt: new Date().toISOString() });
    if (verified.outcome !== "OK") throw new Error("setup failed");
    const tested = markTested(verified.rule, [{ testCaseIndex: 0, passed: true }]);
    if (tested.outcome !== "OK") throw new Error("setup failed");
    const approved = approve(tested.rule, "founder@example.com", ["AUTHORITATIVE"]);
    if (approved.outcome !== "OK") throw new Error("setup failed");
    const activated = activate(approved.rule);

    expect(activated.outcome).toBe("OK");
    if (activated.outcome !== "OK") return;
    expect(activated.rule.lifecycleState).toBe("ACTIVE");
    // BR-8: caveats persist through to ACTIVE, never cleared on activation.
    expect(activated.rule.caveats).toEqual([caveat]);
    expect(activated.rule.isTestOnlyFixture).toBe(true);
  });

  it("[hard invariant] cannot activate a rule that hasn't been APPROVED", () => {
    const rule = draft(testOnlyDraft());
    const result = activate(rule);
    expect(result.outcome).toBe("REJECTED");
  });

  it("[hard invariant] cannot approve a rule that hasn't been TESTED", () => {
    const rule = draft(testOnlyDraft());
    const result = approve(rule, "founder@example.com", ["AUTHORITATIVE"]);
    expect(result.outcome).toBe("REJECTED");
  });

  it("[hard invariant] draft() starts with no accepted evidence quality - approve() is the only place a human decides this", () => {
    const rule = draft(testOnlyDraft());
    expect(rule.acceptedEvidenceQuality).toEqual([]);
  });

  it("supersedes an old ACTIVE rule only once the replacement is itself ACTIVE", () => {
    const oldRule = { ...draft(testOnlyDraft({ id: "old-001" })), lifecycleState: "ACTIVE" as const };
    const notYetActiveReplacement = { ...draft(testOnlyDraft({ id: "new-001" })), lifecycleState: "APPROVED" as const };
    const prematureSupersede = supersede(oldRule, notYetActiveReplacement);
    expect(prematureSupersede.outcome).toBe("REJECTED");

    const activeReplacement = { ...draft(testOnlyDraft({ id: "new-001" })), lifecycleState: "ACTIVE" as const };
    const validSupersede = supersede(oldRule, activeReplacement);
    expect(validSupersede.outcome).toBe("OK");
    if (validSupersede.outcome === "OK") {
      expect(validSupersede.rule.old.lifecycleState).toBe("SUPERSEDED");
      expect(validSupersede.rule.new_.supersedesRuleId).toBe("old-001");
    }
  });
});
