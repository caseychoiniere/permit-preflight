import { describe, expect, it } from "vitest";
import { draft, sourceVerify, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import { realGarageLotCoverageCandidate } from "../fixtures/garage-candidate.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";

/**
 * Proves the same discipline shed-candidate.test.ts proves for the (Tier 2) shed candidate,
 * adapted for L1's real, different status: Tier 1 (governance-simple - business-rules.md BR-U4-4
 * recomputed count) does NOT require an escalated-professional opinion to reach SOURCE_VERIFIED
 * (BR-7 - founder verification alone suffices for Tier 1), unlike the shed candidate. This test
 * proves that lifecycle mechanism works correctly for this real, Tier-1 candidate - it does NOT
 * claim any such founder action has actually occurred. No test in this file inserts anything into
 * a live database or makes this rule ACTIVE outside a pure-function call.
 */
describe("Real Unit 4 garage lot-coverage candidate (L1) - honest governance status (not fabricated)", () => {
  it("is explicitly marked as real, non-test-fixture content", () => {
    expect(realGarageLotCoverageCandidate.isTestOnlyFixture).toBe(false);
  });

  it("triages to TIER_1, matching garage-rule-inventory-and-tier-triage.md's re-triaged assessment", () => {
    const drafted = draft(realGarageLotCoverageCandidate);
    expect(drafted.lifecycleState).toBe("DRAFTED");

    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_1");
    expect(triaged.outcome).toBe("OK");
    if (triaged.outcome === "OK") {
      expect(triaged.rule.tier).toBe("TIER_1");
      expect(triaged.rule.lifecycleState).toBe("TRIAGED");
    }
  });

  it("[lifecycle correctness, not a governance action] TIER_1 does not require an escalated-professional opinion to reach SOURCE_VERIFIED, unlike TIER_2 (BR-7)", () => {
    const drafted = draft(realGarageLotCoverageCandidate);
    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");

    const verified = sourceVerify(triaged.rule, {
      tier: "TIER_1",
      founderIdentity: "founder@permitpreflight.example",
      founderVerifiedAt: new Date().toISOString(),
    });
    expect(verified.outcome).toBe("OK");
  });

  it("[hard invariant] this candidate is never ACTIVE in this codebase and therefore never consumed by production evaluation - staying TRIAGED is a real fact about this repository's current state, not a governance rejection", () => {
    const drafted = draft(realGarageLotCoverageCandidate);
    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");

    // triaged.rule.lifecycleState is "TRIAGED" - evaluateProject's ACTIVE-only filter (evaluate.ts)
    // excludes it even if mistakenly passed in, exactly as it does for the shed candidate.
    const emptyPropertyContext: PropertyContext = { parcelId: "test", assembledAt: new Date().toISOString(), facts: [] };
    const outcome = evaluateProject({
      propertyContext: emptyPropertyContext,
      project: { projectType: "garage", widthFt: 20, depthFt: 20, heightFt: 12, alleyAdjacent: false },
      candidateActiveRules: [triaged.rule], // deliberately passed in to prove the filter works
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });

    const findingsReferencingCandidate = outcome.findings.filter((f) => f.appliedRule?.id === realGarageLotCoverageCandidate.id);
    expect(findingsReferencingCandidate).toHaveLength(0);
  });

  it("even if this candidate were ACTIVE, evaluateLotCoverage would still produce REQUIRES_VERIFICATION for any real garage submission - Tier status is not a usability guarantee (business-rules.md BR-U4-3/BR-U4-7)", () => {
    const propertyContext: PropertyContext = { parcelId: "test", assembledAt: new Date().toISOString(), facts: [] };
    const hypotheticallyActive = { ...draft(realGarageLotCoverageCandidate), lifecycleState: "ACTIVE" as const };
    const outcome = evaluateProject({
      propertyContext,
      project: { projectType: "garage", widthFt: 20, depthFt: 20, heightFt: 12, alleyAdjacent: false },
      candidateActiveRules: [hypotheticallyActive],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
      // No lotCoverageFacts supplied - the honest default for a real production evaluation where
      // no consumer has assembled them, matching BR-U4-8's server-side-only assembly requirement.
    });
    const finding = outcome.findings.find((f) => f.appliedRule?.id === realGarageLotCoverageCandidate.id);
    expect(finding?.classification).toBe("REQUIRES_VERIFICATION");
  });
});
