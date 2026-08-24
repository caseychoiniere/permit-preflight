import { describe, expect, it } from "vitest";
import { draft, sourceVerify, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import { realShedCandidate } from "../fixtures/shed-candidate.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";

/**
 * Proves the user's explicit constraint #1: "Do not fabricate Tier-2 approval. ... If the real
 * shed candidate cannot legitimately reach ACTIVE without an actual professional review,
 * preserve its honest lifecycle state and surface that as an external validation dependency
 * rather than bypassing governance."
 */
describe("Real Unit 0B shed candidate - honest governance status (not fabricated)", () => {
  it("is explicitly marked as real, non-test-fixture content", () => {
    expect(realShedCandidate.isTestOnlyFixture).toBe(false);
  });

  it("triages to TIER_2, matching the honest Unit 0B assessment (genuine ambiguity found)", () => {
    const drafted = draft(realShedCandidate);
    expect(drafted.lifecycleState).toBe("DRAFTED");

    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_2");
    expect(triaged.outcome).toBe("OK");
    if (triaged.outcome === "OK") {
      expect(triaged.rule.tier).toBe("TIER_2");
      expect(triaged.rule.lifecycleState).toBe("TRIAGED");
    }
  });

  it("[hard invariant] CANNOT reach SOURCE_VERIFIED without a real escalated-professional opinion, and none has been recorded - remains blocked at TRIAGED", () => {
    const drafted = draft(realShedCandidate);
    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_2");
    if (triaged.outcome !== "OK") throw new Error("setup failed");

    // Attempting to source-verify WITHOUT an escalated professional must be rejected - there is
    // no shortcut, and this test does not supply a fabricated professional opinion.
    const attemptWithoutProfessional = sourceVerify(triaged.rule, {
      tier: "TIER_2",
      founderIdentity: "founder@permitpreflight.example",
      founderVerifiedAt: new Date().toISOString(),
    });
    expect(attemptWithoutProfessional.outcome).toBe("REJECTED");

    // The rule's honest state remains TRIAGED - an external validation dependency, not
    // silently bypassed. This is the artifact's real status as of Unit 1 completion.
    expect(triaged.rule.lifecycleState).toBe("TRIAGED");
    expect(triaged.rule.caveats.length).toBeGreaterThan(0);
    expect(triaged.rule.caveats.every((c) => c.resolutionStatus.includes("Not yet reviewed"))).toBe(true);
  });

  it("[hard invariant] the real shed candidate is never ACTIVE and therefore never consumed by production evaluation", () => {
    const drafted = draft(realShedCandidate);
    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_2");
    if (triaged.outcome !== "OK") throw new Error("setup failed");

    // triaged.rule.lifecycleState is "TRIAGED" here, not "ACTIVE" - evaluateProject's own
    // ACTIVE-only filter (evaluate.ts) would exclude it even if mistakenly passed in.
    const emptyPropertyContext: PropertyContext = { parcelId: "test", assembledAt: new Date().toISOString(), facts: [] };
    const outcome = evaluateProject({
      propertyContext: emptyPropertyContext,
      project: { widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6 },
      candidateActiveRules: [triaged.rule], // deliberately passed in to prove the filter works
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });

    // The rule was NOT ACTIVE, so evaluateProject's ACTIVE-only filter excludes it - no finding
    // references it, proving the real (non-ACTIVE) candidate cannot influence a production evaluation.
    const findingsReferencingCandidate = outcome.findings.filter((f) => f.appliedRule?.id === realShedCandidate.id);
    expect(findingsReferencingCandidate).toHaveLength(0);
  });
});
