import { describe, expect, it } from "vitest";
import {
  activate,
  approve,
  disable,
  draft,
  markTested,
  reenable,
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
    const approvedAt = new Date().toISOString();
    const approved = approve(tested.rule, "founder@example.com", ["AUTHORITATIVE"], approvedAt);
    if (approved.outcome !== "OK") throw new Error("setup failed");
    const activated = activate(approved.rule);

    expect(activated.outcome).toBe("OK");
    if (activated.outcome !== "OK") return;
    expect(activated.rule.lifecycleState).toBe("ACTIVE");
    // BR-8: caveats persist through to ACTIVE, never cleared on activation.
    expect(activated.rule.caveats).toEqual([caveat]);
    expect(activated.rule.isTestOnlyFixture).toBe(true);
    // Approval provenance (2026-08-25 correction) survives through to ACTIVE unchanged.
    expect(activated.rule.approvalRecord).toEqual({ founderIdentity: "founder@example.com", approvedAt });
  });

  it("[hard invariant] cannot activate a rule that hasn't been APPROVED", () => {
    const rule = draft(testOnlyDraft());
    const result = activate(rule);
    expect(result.outcome).toBe("REJECTED");
  });

  it("[hard invariant] cannot approve a rule that hasn't been TESTED", () => {
    const rule = draft(testOnlyDraft());
    const result = approve(rule, "founder@example.com", ["AUTHORITATIVE"], new Date().toISOString());
    expect(result.outcome).toBe("REJECTED");
  });

  it("[hard invariant] approvalRecord is never present before approve() runs, and approve() never infers founderIdentity/approvedAt from anything else", () => {
    const rule = draft(testOnlyDraft());
    expect(rule.approvalRecord).toBeUndefined();

    const triaged = triage(rule, "founder@example.com", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");
    const verified = sourceVerify(triaged.rule, { tier: "TIER_1", founderIdentity: "founder@example.com", founderVerifiedAt: "2020-01-01T00:00:00.000Z" });
    if (verified.outcome !== "OK") throw new Error("setup failed");
    // sourceVerify's founderVerifiedAt must NOT leak into approvalRecord - they are different facts.
    expect(verified.rule.approvalRecord).toBeUndefined();

    const tested = markTested(verified.rule, [{ testCaseIndex: 0, passed: true }]);
    if (tested.outcome !== "OK") throw new Error("setup failed");
    const approvedAt = "2024-06-15T12:00:00.000Z";
    const approved = approve(tested.rule, "a-different-founder@example.com", ["AUTHORITATIVE"], approvedAt);
    if (approved.outcome !== "OK") throw new Error("setup failed");
    expect(approved.rule.approvalRecord).toEqual({ founderIdentity: "a-different-founder@example.com", approvedAt });
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

  // --- Unit 3, ADM-7: disable()/reenable() - matching activate()'s own test style exactly. ---

  it("disables an ACTIVE rule (lifecycle-state-only, content untouched)", () => {
    const caveat = {
      category: "test-caveat",
      description: "example",
      affectedConditionOrInterpretation: "example condition",
      sourceReferences: ["TEST.0.0"],
      resolutionStatus: "accepted despite caveat",
    };
    const activeRule = { ...draft(testOnlyDraft({ caveats: [caveat] })), lifecycleState: "ACTIVE" as const };
    const result = disable(activeRule);
    expect(result.outcome).toBe("OK");
    if (result.outcome !== "OK") return;
    expect(result.rule.lifecycleState).toBe("DISABLED");
    // Lifecycle-state-only: published content is never touched by disable().
    expect(result.rule.ruleSpecification).toEqual(activeRule.ruleSpecification);
    expect(result.rule.caveats).toEqual([caveat]);
  });

  it("[hard invariant] cannot disable a rule that isn't ACTIVE", () => {
    const rule = draft(testOnlyDraft());
    const result = disable(rule);
    expect(result.outcome).toBe("REJECTED");
  });

  it("re-enables a DISABLED rule back to ACTIVE, the exact same rule version (no content change, no version substitution)", () => {
    const disabledRule = { ...draft(testOnlyDraft()), lifecycleState: "DISABLED" as const };
    const result = reenable(disabledRule);
    expect(result.outcome).toBe("OK");
    if (result.outcome !== "OK") return;
    expect(result.rule.lifecycleState).toBe("ACTIVE");
    expect(result.rule.id).toBe(disabledRule.id);
    expect(result.rule.ruleSpecification).toEqual(disabledRule.ruleSpecification);
  });

  it("[hard invariant] cannot re-enable a rule that isn't DISABLED", () => {
    const rule = { ...draft(testOnlyDraft()), lifecycleState: "ACTIVE" as const };
    const result = reenable(rule);
    expect(result.outcome).toBe("REJECTED");
  });
});
