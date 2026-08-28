import { describe, expect, it } from "vitest";
import { draft, sourceVerify, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { toApplicabilityScope } from "../../src/regulatory-rule-governance/types.js";
import { evaluateVacantLand } from "../../src/regulatory-rules-engine/evaluate-vacant-land.js";
import { ALL_REAL_VACANT_LAND_CANDIDATES, realVacantLandBuildabilityFloorCandidate } from "../fixtures/vacant-land-candidate.js";

const TIER_2_CANDIDATE_IDS = new Set([
  "vacant-land-low-income-density-bonus-nr-2026", // U6
  "vacant-land-height-nr-2026", // U8
  "vacant-land-minimum-coverage-floor-nr-2026", // U13
]);

describe("Code Generation review Correction 1A - all 17 real candidates exist and remain honestly non-ACTIVE", () => {
  it("[hard invariant] every real candidate (U1-U17) is present, non-test-fixture content", () => {
    expect(ALL_REAL_VACANT_LAND_CANDIDATES.length).toBeGreaterThanOrEqual(17);
    for (const c of ALL_REAL_VACANT_LAND_CANDIDATES) {
      expect(c.isTestOnlyFixture).toBe(false);
    }
  });

  it("[hard invariant] every real candidate omits applicableProjectType and is scoped applicableWorkflowType='VACANT_LAND' - never a 'vacant-land' string shortcut", () => {
    for (const c of ALL_REAL_VACANT_LAND_CANDIDATES) {
      expect(c.applicableProjectType).toBeUndefined();
      expect(c.applicableWorkflowType).toBe("VACANT_LAND");
    }
  });

  it("[hard invariant] every real candidate stays at DRAFTED (or TRIAGED, once triaged) - never SOURCE_VERIFIED/TESTED/APPROVED/ACTIVE", () => {
    for (const c of ALL_REAL_VACANT_LAND_CANDIDATES) {
      const drafted = draft(c);
      expect(drafted.lifecycleState).toBe("DRAFTED");
      const tier = TIER_2_CANDIDATE_IDS.has(c.id) ? "TIER_2" : "TIER_1";
      const triaged = triage(drafted, "founder@permitpreflight.example", tier);
      expect(triaged.outcome).toBe("OK");
      if (triaged.outcome === "OK") {
        expect(triaged.rule.lifecycleState).toBe("TRIAGED");
        expect(triaged.rule.lifecycleState).not.toBe("ACTIVE");
      }
    }
  });

  it("[hard invariant] none of the 17 real candidates are ever consumed by evaluateVacantLand, even if mistakenly passed in (all remain TRIAGED, never ACTIVE)", () => {
    const triagedRules = ALL_REAL_VACANT_LAND_CANDIDATES.map((c) => {
      const drafted = draft(c);
      const tier = TIER_2_CANDIDATE_IDS.has(c.id) ? "TIER_2" : "TIER_1";
      const triaged = triage(drafted, "founder@permitpreflight.example", tier);
      if (triaged.outcome !== "OK") throw new Error("setup failed");
      return triaged.rule;
    });
    const outcome = evaluateVacantLand({
      candidateActiveRules: triagedRules,
      buildabilityApplicability: { smcLotQualificationEstablished: true, existenceAsOfEffectiveDateEstablished: true },
      densityFacts: { rawParcelAreaSqFt: 5000, densityCountableLotAreaSqFt: 5000 },
      lotLineRoles: { status: "ESTABLISHED" },
      scenarioBuildableEnvelopes: {},
    });
    expect(outcome.buildabilityFindings).toHaveLength(0);
    expect(outcome.uncoveredConstraintTypes.length).toBeGreaterThan(0);
  });
});

/**
 * Mirrors garage-candidate.test.ts's own discipline for Unit 5's real U1 candidate. No test in
 * this file inserts anything into a live database or makes this rule ACTIVE outside a pure-
 * function call.
 */
describe("Real Unit 5 vacant-land buildability-floor candidate (U1) - honest governance status (not fabricated)", () => {
  it("is explicitly marked as real, non-test-fixture content", () => {
    expect(realVacantLandBuildabilityFloorCandidate.isTestOnlyFixture).toBe(false);
  });

  it("never carries applicableProjectType - RegulatoryRuleApplicabilityScope's VACANT_LAND branch, never a 'vacant-land' string shortcut", () => {
    expect(realVacantLandBuildabilityFloorCandidate.applicableProjectType).toBeUndefined();
    expect(realVacantLandBuildabilityFloorCandidate.applicableWorkflowType).toBe("VACANT_LAND");
  });

  it("triages to TIER_1, matching vacant-land-rule-inventory-and-tier-triage.md's assessment", () => {
    const drafted = draft(realVacantLandBuildabilityFloorCandidate);
    expect(drafted.lifecycleState).toBe("DRAFTED");

    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_1");
    expect(triaged.outcome).toBe("OK");
    if (triaged.outcome === "OK") {
      expect(triaged.rule.tier).toBe("TIER_1");
      expect(triaged.rule.lifecycleState).toBe("TRIAGED");
    }
  });

  it("toApplicabilityScope resolves this candidate to { workflowType: 'VACANT_LAND' }, never reading applicableProjectType", () => {
    const drafted = draft(realVacantLandBuildabilityFloorCandidate);
    expect(toApplicabilityScope(drafted)).toEqual({ workflowType: "VACANT_LAND" });
  });

  it("[lifecycle correctness, not a governance action] TIER_1 does not require an escalated-professional opinion to reach SOURCE_VERIFIED (BR-7)", () => {
    const drafted = draft(realVacantLandBuildabilityFloorCandidate);
    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");

    const verified = sourceVerify(triaged.rule, {
      tier: "TIER_1",
      founderIdentity: "founder@permitpreflight.example",
      founderVerifiedAt: new Date().toISOString(),
    });
    expect(verified.outcome).toBe("OK");
  });

  it("[hard invariant] this candidate is never ACTIVE in this codebase and therefore never consumed by production evaluation - staying TRIAGED is a real fact about this repository's current state", () => {
    const drafted = draft(realVacantLandBuildabilityFloorCandidate);
    const triaged = triage(drafted, "founder@permitpreflight.example", "TIER_1");
    if (triaged.outcome !== "OK") throw new Error("setup failed");

    // triaged.rule.lifecycleState is "TRIAGED" - evaluateVacantLand's ACTIVE-only filter excludes
    // it even if mistakenly passed in, exactly as evaluateProject's own filter does for shed/garage.
    const outcome = evaluateVacantLand({
      candidateActiveRules: [triaged.rule],
      buildabilityApplicability: { smcLotQualificationEstablished: true, existenceAsOfEffectiveDateEstablished: true },
      densityFacts: { rawParcelAreaSqFt: 5000 },
      lotLineRoles: { status: "INSUFFICIENT" },
      scenarioBuildableEnvelopes: {},
    });

    expect(outcome.buildabilityFindings).toHaveLength(0);
    expect(outcome.uncoveredConstraintTypes).toContain("buildability");
  });

  it("even if this candidate were ACTIVE, an unestablished applicability fact still produces REQUIRES_VERIFICATION - Tier status is not an evidence guarantee", () => {
    const hypotheticallyActive = { ...draft(realVacantLandBuildabilityFloorCandidate), lifecycleState: "ACTIVE" as const };
    const outcome = evaluateVacantLand({
      candidateActiveRules: [hypotheticallyActive],
      buildabilityApplicability: {}, // the actual production default - neither fact established
      densityFacts: { rawParcelAreaSqFt: 5000 },
      lotLineRoles: { status: "INSUFFICIENT" },
      scenarioBuildableEnvelopes: {},
    });
    const finding = outcome.buildabilityFindings.find((f) => f.appliedRule?.id === realVacantLandBuildabilityFloorCandidate.id);
    expect(finding?.classification).toBe("REQUIRES_VERIFICATION");
  });

  it("if ACTIVE and both applicability facts are established, produces a KNOWN finding", () => {
    const hypotheticallyActive = { ...draft(realVacantLandBuildabilityFloorCandidate), lifecycleState: "ACTIVE" as const };
    const outcome = evaluateVacantLand({
      candidateActiveRules: [hypotheticallyActive],
      buildabilityApplicability: { smcLotQualificationEstablished: true, existenceAsOfEffectiveDateEstablished: true },
      densityFacts: { rawParcelAreaSqFt: 5000 },
      lotLineRoles: { status: "INSUFFICIENT" },
      scenarioBuildableEnvelopes: {},
    });
    const finding = outcome.buildabilityFindings.find((f) => f.appliedRule?.id === realVacantLandBuildabilityFloorCandidate.id);
    expect(finding?.classification).toBe("KNOWN");
  });
});
