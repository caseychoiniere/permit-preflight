/**
 * Unit 11 governance candidates: structure (11 Tier-1 rows, fixed ids, never past TRIAGED in code), and
 * every declared test case EXECUTED against the real evaluator using the candidates' own persisted
 * ruleSpecification, so a declared case can never drift from what the rule actually does.
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateAdu } from "../../src/regulatory-rules-engine/evaluate-adu.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";
import type { AduProjectDetails, AduSiteFacts } from "../../src/regulatory-rules-engine/adu-types.js";
import { ADU_FIXED_ROW_IDS, realAduCandidates, tierForRealAduCandidate } from "../fixtures/adu-candidates.js";
import type { AduTestInput } from "../fixtures/adu-candidates.js";
import { baseAduProject, baseAduSite } from "../fixtures/adu-evaluation-base.js";

const activeRules: RegulatoryRule[] = realAduCandidates.map((c) => ({
  ...draft(c),
  id: ADU_FIXED_ROW_IDS[c.id]!,
  lifecycleState: "ACTIVE", // evaluation-only: these in-memory copies are never persisted
  acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
}));

function run(input: AduTestInput) {
  const project = { ...baseAduProject(), ...(input.project ?? {}) } as AduProjectDetails;
  const site = { ...baseAduSite(), ...(input.site ?? {}) } as AduSiteFacts;
  return evaluateAdu({ project, site, candidateActiveRules: activeRules, zoningApplicability: { status: "NR_VERIFIED", nrFraction: 1, zoningLabel: "NR", overlays: { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [] } } });
}

describe("real ADU candidates - structure", () => {
  it("exactly eleven, one per AduRuleType, unique ids, each with a fixed row UUID", () => {
    expect(realAduCandidates).toHaveLength(11);
    expect(realAduCandidates.map((c) => (c.ruleSpecification as { ruleType: string }).ruleType).sort()).toEqual(Object.values(AduRuleType).sort());
    expect(new Set(realAduCandidates.map((c) => c.id)).size).toBe(11);
    expect(new Set(Object.values(ADU_FIXED_ROW_IDS)).size).toBe(11);
    for (const c of realAduCandidates) {
      expect(ADU_FIXED_ROW_IDS[c.id]).toMatch(/^[0-9a-f-]{36}$/);
      expect(c.applicableProjectType).toBe("adu");
      expect(c.applicableZone).toBe("NR");
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(c.testCases.length).toBeGreaterThan(0);
    }
  });

  it("each triages cleanly as Tier 1 and the code path never leaves TRIAGED (activation is a separate founder decision)", () => {
    for (const c of realAduCandidates) {
      const result = triage(draft(c), "tester", tierForRealAduCandidate(c.id));
      expect(result.outcome).toBe("OK");
      if (result.outcome === "OK") {
        expect(result.rule.lifecycleState).toBe("TRIAGED");
        expect(result.rule.tier).toBe("TIER_1");
      }
    }
  });

  it("all eleven specifications are accepted by the evaluator's guards (nothing is uncovered)", () => {
    expect(run({}).uncoveredConstraintTypes).toEqual([]);
  });
});

describe("every declared test case is executed against the evaluator using the candidate's own specification", () => {
  for (const c of realAduCandidates) {
    for (const t of c.testCases) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const outcome = run(t.input as AduTestInput);
        const expected = t.expected as { subject: string; outcome: string; appliedBy?: string };
        const f = outcome.findings.find((x) => x.subject === expected.subject);
        expect(f, `finding "${expected.subject}"`).toBeDefined();
        const actual = `${f!.classification}${f!.complianceOutcome ? "/" + f!.complianceOutcome : ""}`;
        expect(actual).toBe(expected.outcome);
        expect(f!.appliedRule?.id).toBe(ADU_FIXED_ROW_IDS[expected.appliedBy ?? c.id]);
      });
    }
  }
});
