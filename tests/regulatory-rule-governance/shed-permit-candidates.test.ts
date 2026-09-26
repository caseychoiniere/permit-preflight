import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import { realShedPermitCandidates, tierForRealShedPermitCandidate } from "../fixtures/shed-permit-candidates.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";

/**
 * code-generation-plan.md §5.2 - the hard-invariant test proving all 19 founder-confirmed Unit
 * 6B shed rules are held at DRAFTED/TRIAGED only (never SOURCE_VERIFIED/TESTED/APPROVED/ACTIVE)
 * and are therefore never consumed by production evaluation, exactly Unit 4's
 * garage-candidate.test.ts precedent for L1.
 */

// 2026-09-24: tierFor is now exported from the fixture module itself (tierForRealShedPermitCandidate)
// as this codebase's single source of truth for the real 19's founder-confirmed tiers - reused here
// and by scripts/bootstrap-unit-6b-governance.ts rather than each re-deriving it.
const tierFor = tierForRealShedPermitCandidate;

describe("Real Unit 6B shed permit/lot-coverage candidates - honest governance status (not fabricated)", () => {
  it("has exactly the 19 founder-confirmed candidate rules, all marked as real (non-test-fixture) content", () => {
    expect(realShedPermitCandidates).toHaveLength(19);
    for (const candidate of realShedPermitCandidates) {
      expect(candidate.isTestOnlyFixture).toBe(false);
    }
  });

  it("has no duplicate ids or ruleTypes", () => {
    const ids = realShedPermitCandidates.map((c) => c.id);
    const ruleTypes = realShedPermitCandidates.map((c) => (c.ruleSpecification as { ruleType?: string }).ruleType);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ruleTypes).size).toBe(ruleTypes.length);
  });

  it.each(realShedPermitCandidates)("$id triages to its founder-confirmed tier and stops at TRIAGED (no approve()/activate() call)", (candidate) => {
    const drafted = draft(candidate);
    expect(drafted.lifecycleState).toBe("DRAFTED");

    const tier = tierFor(candidate.id);
    const triaged = triage(drafted, "founder@permitpreflight.example", tier);
    expect(triaged.outcome).toBe("OK");
    if (triaged.outcome === "OK") {
      expect(triaged.rule.tier).toBe(tier);
      expect(triaged.rule.lifecycleState).toBe("TRIAGED");
    }
  });

  it("[hard invariant] none of these 19 candidates are ever ACTIVE in this codebase and therefore never consumed by production shed evaluation, even if mistakenly passed in", () => {
    const triagedRules: RegulatoryRule[] = realShedPermitCandidates.map((candidate) => {
      const drafted = draft(candidate);
      const triaged = triage(drafted, "founder@permitpreflight.example", tierFor(candidate.id));
      if (triaged.outcome !== "OK") throw new Error(`setup failed for ${candidate.id}`);
      return triaged.rule;
    });

    const propertyContext: PropertyContext = { parcelId: "test", assembledAt: new Date().toISOString(), facts: [] };
    const outcome = evaluateProject({
      propertyContext,
      project: {
        projectType: "shed",
        widthFt: 10,
        depthFt: 10,
        heightFt: 8,
        alleyAdjacent: false,
        foundationType: "SLAB_ON_GRADE",
        attachment: "DETACHED",
        intendedUse: "STORAGE",
        isInRequiredSetback: false,
      },
      candidateActiveRules: triagedRules, // deliberately passed in, still TRIAGED (never ACTIVE)
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });

    // TRIAGED rules are filtered out by evaluateProject's ACTIVE-only gate - none of the
    // aggregate Unit 6B fields should appear on the outcome.
    expect(outcome.permitRequirement).toBeUndefined();
    expect(outcome.accessoryHeightLimitFinding).toBeUndefined();
    expect(outcome.shedLotCoverage).toBeUndefined();
  });

  it("even if every candidate were hypothetically ACTIVE, the aggregate fields would now appear (proving §4.14's all-or-nothing gate works in both directions) - this does not itself activate anything in this repository", () => {
    const activeRules: RegulatoryRule[] = realShedPermitCandidates.map((candidate) => {
      const drafted = draft(candidate);
      const triaged = triage(drafted, "founder@permitpreflight.example", tierFor(candidate.id));
      if (triaged.outcome !== "OK") throw new Error(`setup failed for ${candidate.id}`);
      return { ...triaged.rule, lifecycleState: "ACTIVE" as const };
    });

    const propertyContext: PropertyContext = { parcelId: "test", assembledAt: new Date().toISOString(), facts: [] };
    const outcome = evaluateProject({
      propertyContext,
      project: {
        projectType: "shed",
        widthFt: 10,
        depthFt: 10,
        heightFt: 8,
        alleyAdjacent: false,
        foundationType: "SLAB_ON_GRADE",
        attachment: "DETACHED",
        intendedUse: "STORAGE",
        isInRequiredSetback: false,
      },
      candidateActiveRules: activeRules,
      // Only the 2 map-dispositive hazard categories, confirmed NO_INTERSECTION - a realistic
      // full 12-category fetch would always carry advisory-only entries and resolve P6 to
      // REQUIRES_VERIFICATION by design; this isolates the aggregation-gate assertion below.
      ecaFindings: [
        { hazardType: "priority_habitat", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" },
        { hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" },
      ],
      candidateActiveInferencePolicies: [],
      shedLotCoverageFacts: {
        parcelAreaSqFt: 5000,
        existingMappedCoverageSqFt: 500,
        proposedShedFootprintSqFt: 100,
        ecaAdjustment: { status: "NOT_APPLICABLE", reason: "test" },
      },
    });

    expect(outcome.permitRequirement).toBeDefined();
    expect(outcome.accessoryHeightLimitFinding).toBeDefined();
    expect(outcome.shedLotCoverage).toBeDefined();
    // All 19 rows above (including P9/C2, which have no evaluateRule dispatch case at all) are
    // ACTIVE - outcome.findings must carry zero spurious "not recognized by this evaluator"
    // entries for any of them.
    expect(outcome.findings.filter((f) => f.explanationBasis.includes("is not recognized by this evaluator"))).toHaveLength(0);
  });
});
