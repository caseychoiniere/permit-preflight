/**
 * Unit 8 governance candidates: structure, and every declared test case EXECUTED against the real
 * evaluator using the candidates' own persisted specifications.
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateDeck } from "../../src/regulatory-rules-engine/evaluate-deck.js";
import { DeckRuleType } from "../../src/regulatory-rules-engine/deck-types.js";
import type { DeckProjectDetails } from "../../src/regulatory-rules-engine/deck-types.js";
import { DECK_FIXED_ROW_IDS, realDeckCandidates, tierForRealDeckCandidate } from "../fixtures/deck-candidates.js";

const activeRules: RegulatoryRule[] = realDeckCandidates.map((c) => ({ ...draft(c), id: DECK_FIXED_ROW_IDS[c.id]!, lifecycleState: "ACTIVE" }));

function projectFrom(input: Record<string, unknown>): DeckProjectDetails {
  return {
    projectType: "deck",
    heightAboveGradeIn: 24,
    widthFt: 10,
    depthFt: 10,
    attachment: "DETACHED",
    buildingRelation: "OPEN_GROUND_BELOW",
    setbackLocations: ["OUTSIDE_REQUIRED_SETBACKS"],
    ...input,
  } as DeckProjectDetails;
}

describe("real deck candidates - structure", () => {
  it("exactly six, one per DeckRuleType, unique ids, fixed row UUIDs, NR/deck, real content", () => {
    expect(realDeckCandidates).toHaveLength(6);
    expect(realDeckCandidates.map((c) => (c.ruleSpecification as { ruleType: string }).ruleType).sort()).toEqual(Object.values(DeckRuleType).filter((t) => !t.startsWith("DECK_MF_")).sort());
    expect(new Set(realDeckCandidates.map((c) => c.id)).size).toBe(6);
    expect(new Set(Object.values(DECK_FIXED_ROW_IDS)).size).toBe(6);
    for (const c of realDeckCandidates) {
      expect(DECK_FIXED_ROW_IDS[c.id]).toMatch(/^[0-9a-f-]{36}$/);
      expect(c.applicableProjectType).toBe("deck");
      expect(c.applicableZone).toBe("NR");
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(c.testCases.length).toBeGreaterThan(0);
    }
  });

  it("each triages as Tier 1 and the code path never leaves TRIAGED", () => {
    for (const c of realDeckCandidates) {
      const r = triage(draft(c), "tester", tierForRealDeckCandidate(c.id));
      expect(r.outcome).toBe("OK");
      if (r.outcome === "OK") {
        expect(r.rule.lifecycleState).toBe("TRIAGED");
        expect(r.rule.tier).toBe("TIER_1");
      }
    }
  });

  it("every specification is accepted by the evaluator's guards (all six usable together)", () => {
    const o = evaluateDeck({ project: projectFrom({ heightAboveGradeIn: 24, setbackLocations: ["SIDE_SETBACK"] }), candidateActiveRules: activeRules });
    expect(o.uncoveredConstraintTypes).toEqual([]);
    expect(o.permitRequirement).toBeDefined();
  });
});

describe("declared test cases executed against the evaluator", () => {
  const cases = realDeckCandidates.flatMap((c) => c.testCases.map((t) => ({ id: c.id, ...t })));
  it("every candidate has cases; D1-D5 have positive, negative and exception coverage where defined", () => {
    for (const c of realDeckCandidates) expect(cases.some((t) => t.id === c.id)).toBe(true);
    for (const id of ["deck-d1-setback-height-allowance-2026", "deck-d2-lot-coverage-threshold-2026", "deck-d3-permit-exemption-2026", "deck-d4-stfi-eligibility-2026"]) {
      expect(new Set(realDeckCandidates.find((c) => c.id === id)!.testCases.map((t) => t.kind)), id).toEqual(new Set(["POSITIVE", "NEGATIVE", "EXCEPTION"]));
    }
  });

  it.each(cases.map((t) => [`${t.id} [${t.kind}] ${t.description}`, t] as const))("%s", (_name, t) => {
    const o = evaluateDeck({ project: projectFrom(t.input), candidateActiveRules: activeRules });
    const e = t.expected as { subject?: string; outcome?: string; contains?: string; buildingPermit?: string; criterion?: string; status?: string; reviewPath?: string; disclaimerPresent?: boolean };
    if (e.subject) {
      const f = o.findings.find((x) => x.subject === e.subject);
      expect(f, `finding "${e.subject}"`).toBeDefined();
      expect(`${f!.classification}${f!.complianceOutcome ? "/" + f!.complianceOutcome : ""}`).toBe(e.outcome);
      if (e.contains) expect(f!.explanationBasis).toContain(e.contains);
    }
    if (e.buildingPermit) expect(o.permitRequirement?.buildingPermit).toBe(e.buildingPermit);
    if (e.criterion) expect(o.permitRequirement?.criteria.find((c) => c.criterionId === e.criterion)?.status).toBe(e.status);
    if (e.reviewPath) expect(o.permitRequirement?.reviewPath).toBe(e.reviewPath);
    if (e.disclaimerPresent !== undefined) expect(Boolean(o.permitRequirement?.exemptionDisclaimer)).toBe(e.disclaimerPresent);
  });
});
