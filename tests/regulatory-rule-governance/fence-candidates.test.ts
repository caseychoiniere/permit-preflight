/**
 * Unit 7 governance candidates: structure (7 Tier-1 rows, mapped ids, never past TRIAGED in code),
 * and - the point of this file - every declared test case is EXECUTED against the real evaluator
 * using the candidates' own persisted ruleSpecification, so a declared case can never drift from
 * what the rule actually does (lesson from the Unit 6B C1b / P6 declared-case mismatches).
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateFence } from "../../src/regulatory-rules-engine/evaluate-fence.js";
import { FenceRuleType } from "../../src/regulatory-rules-engine/fence-types.js";
import type { FenceProjectDetails } from "../../src/regulatory-rules-engine/fence-types.js";
import type { CriticalAreaFinding } from "../../src/spatial-analysis/types.js";
import { FENCE_FIXED_ROW_IDS, realFenceCandidates, tierForRealFenceCandidate } from "../fixtures/fence-candidates.js";

const activeRules: RegulatoryRule[] = realFenceCandidates.map((c) => ({
  ...draft(c),
  id: FENCE_FIXED_ROW_IDS[c.id]!,
  lifecycleState: "ACTIVE", // evaluation-only: these in-memory copies are never persisted
}));

function projectFrom(input: Record<string, unknown>): FenceProjectDetails {
  return { projectType: "fence", siteSlopes: false, wallRelation: "NONE", ...input } as FenceProjectDetails;
}

describe("real fence candidates - structure", () => {
  it("exactly eight, one per FenceRuleType, unique ids, each with a fixed row UUID", () => {
    expect(realFenceCandidates).toHaveLength(8);
    const types = realFenceCandidates.map((c) => (c.ruleSpecification as { ruleType: string }).ruleType).sort();
    expect(types).toEqual(Object.values(FenceRuleType).sort());
    expect(new Set(realFenceCandidates.map((c) => c.id)).size).toBe(8);
    for (const c of realFenceCandidates) {
      expect(FENCE_FIXED_ROW_IDS[c.id]).toMatch(/^[0-9a-f-]{36}$/);
      expect(c.applicableProjectType).toBe("fence");
      expect(c.applicableZone).toBe("NR");
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(c.testCases.length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(FENCE_FIXED_ROW_IDS)).size).toBe(8);
  });

  it("each triages cleanly as Tier 1 and the code path never leaves TRIAGED (activation is a separate founder decision)", () => {
    for (const c of realFenceCandidates) {
      const result = triage(draft(c), "tester", tierForRealFenceCandidate(c.id));
      expect(result.outcome).toBe("OK");
      if (result.outcome === "OK") {
        expect(result.rule.lifecycleState).toBe("TRIAGED");
        expect(result.rule.tier).toBe("TIER_1");
      }
    }
  });

  it("every candidate's specification is accepted by the evaluator's guards (all eight usable together)", () => {
    const o = evaluateFence({ project: projectFrom({ heightFt: 5, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] }), candidateActiveRules: activeRules, ecaFindings: [] });
    expect(o.uncoveredConstraintTypes).toEqual([]);
    expect(o.findings.length).toBeGreaterThan(0);
    expect(o.permitRequirement).toBeDefined();
  });
});

describe("declared test cases executed against the evaluator", () => {
  const cases = realFenceCandidates.flatMap((c) => c.testCases.map((t) => ({ id: c.id, ...t })));
  it("covers every candidate with at least one case, and F1-F6 with positive, negative and exception cases", () => {
    for (const c of realFenceCandidates) expect(cases.some((t) => t.id === c.id)).toBe(true);
    for (const c of realFenceCandidates.filter((c) => !/-f4-|-f7-/.test(c.id))) {
      expect(new Set(c.testCases.map((t) => t.kind)), c.id).toEqual(new Set(["POSITIVE", "NEGATIVE", "EXCEPTION"]));
    }
  });

  it.each(cases.map((t) => [`${t.id} [${t.kind}] ${t.description}`, t] as const))("%s", (_name, t) => {
    const { floodMapped, ...projectInput } = t.input as Record<string, unknown> & { floodMapped?: "CLEAR" | "INTERSECTS" };
    const eca: CriticalAreaFinding[] =
      floodMapped === undefined ? [] : [{ hazardType: "flood_prone", mappedIntersectionResult: floodMapped === "INTERSECTS" ? "INTERSECTS" : "NO_INTERSECTION", advisoryStatus: "ADVISORY_ONLY", toleranceBasis: "test" }];
    const o = evaluateFence({ project: projectFrom(projectInput), candidateActiveRules: activeRules, ecaFindings: eca });
    const expected = t.expected as { subject?: string; outcome?: string; buildingPermit?: string; criterion?: string; status?: string; disclaimerPresent?: boolean };
    if (expected.subject) {
      const f = o.findings.find((x) => x.subject === expected.subject);
      expect(f, `finding "${expected.subject}" present`).toBeDefined();
      expect(`${f!.classification}${f!.complianceOutcome ? "/" + f!.complianceOutcome : ""}`).toBe(expected.outcome);
    }
    if (expected.buildingPermit) expect(o.permitRequirement?.buildingPermit).toBe(expected.buildingPermit);
    if (expected.criterion) expect(o.permitRequirement?.criteria.find((c) => c.criterionId === expected.criterion)?.status).toBe(expected.status);
    if (expected.disclaimerPresent !== undefined) expect(Boolean(o.permitRequirement?.exemptionDisclaimer)).toBe(expected.disclaimerPresent);
  });
});
