/**
 * Neighborhood Commercial / Commercial (C1) candidates: structure, zone scope, and every declared test case executed against the real evaluators and the
 * real zone resolver (citywide zoning coverage).
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { singleZoneContext } from "../../src/zoning/context.js";
import { isRegisteredRuleType } from "../../src/zoning/claim-kinds.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { validateZoneScope } from "../../src/zoning/scope.js";
import { COMMERCIAL_FIXED_ROW_IDS, allCommercialCandidates, deckCommercialCandidates, fenceCommercialCandidates, garageCommercialCandidates, shedCommercialCandidates } from "../fixtures/commercial-candidates.js";
import { asActive, evaluateCandidateCase, findCaseFinding, oc } from "./candidate-harness.js";

const setFor = (type: string) => (type === "shed" ? shedCommercialCandidates : type === "garage" ? garageCommercialCandidates : type === "fence" ? fenceCommercialCandidates : deckCommercialCandidates);
const ZONE = "NC2-40 (M)";

describe("commercial candidates - structure", () => {
  it("every row is a real Tier-1 candidate with a valid zone scope, a citation, a registered rule type and a fixed UUID", () => {
    expect(new Set(Object.values(COMMERCIAL_FIXED_ROW_IDS)).size).toBe(allCommercialCandidates.length);
    for (const c of allCommercialCandidates) {
      expect(validateZoneScope(c.applicableZone), c.id).toEqual([]);
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(isRegisteredRuleType((c.ruleSpecification as { ruleType: string }).ruleType), c.id).toBe(true);
      const t = triage(draft(c), "tester", "TIER_1");
      expect(t.outcome).toBe("OK");
    }
  });
  it("covers NC1-NC3 and C1 in every designation form and never C2 (residential use there is a conditional use)", () => {
    for (const type of ["shed", "garage", "fence", "deck"]) {
      const rules = asActive(setFor(type), COMMERCIAL_FIXED_ROW_IDS);
      for (const z of ["NC1-40", "NC1P-40 (M)", "NC2-55 (M1)", "NC2P-75 (M2)", "NC3-75", "NC3P-200 (M)", "C1-55 (M)", "C1P-75"]) {
        const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: rules });
        expect(r.conflictingRuleTypes, `${type} @ ${z}`).toEqual([]);
        expect(r.rules.length, `${type} @ ${z}`).toBeGreaterThan(0);
      }
      for (const z of ["C2-55 (M)", "C2P-55 (M)", "NR", "LR2 (M)", "MR", "SM-UP 85"]) {
        expect(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: rules }).rules, `${type} @ ${z}`).toEqual([]);
      }
    }
  });
});

describe("every declared test case is executed against the real evaluator using the candidate's own specification", () => {
  for (const c of allCommercialCandidates) {
    for (const t of c.testCases as unknown as { kind: string; description: string; input: { project: Record<string, unknown>; zoning?: string }; expected: { finding: string; outcome: string } }[]) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const rules = asActive(setFor(c.applicableProjectType!), COMMERCIAL_FIXED_ROW_IDS);
        const o = evaluateCandidateCase(c.applicableProjectType!, rules, t.input.project, t.input.zoning ?? ZONE);
        const found = findCaseFinding(o, t.expected.finding, COMMERCIAL_FIXED_ROW_IDS[c.id]!);
        expect(found, `finding "${t.expected.finding}"`).toBeDefined();
        expect(oc(found!)).toBe(t.expected.outcome);
      });
    }
  }
});

describe("customer-facing text in commercial reports is commercial-zone text", () => {
  it("no finding cites the residential chapters", () => {
    const shed = evaluateCandidateCase("shed", asActive(shedCommercialCandidates, COMMERCIAL_FIXED_ROW_IDS), { abutsResidentialZone: "YES", adjacentResidentialZones: ["LR1 (M)"], heightFt: 35 }, ZONE);
    const garage = evaluateCandidateCase("garage", asActive(garageCommercialCandidates, COMMERCIAL_FIXED_ROW_IDS), { abutsResidentialZone: "NO" }, ZONE);
    const fence = evaluateCandidateCase("fence", asActive(fenceCommercialCandidates, COMMERCIAL_FIXED_ROW_IDS), { heightFt: 7, locations: ["OUTSIDE_REQUIRED_SETBACKS", "FRONT_SETBACK"] }, ZONE);
    const deck = evaluateCandidateCase("deck", asActive(deckCommercialCandidates, COMMERCIAL_FIXED_ROW_IDS), { heightAboveGradeIn: 30, setbackLocations: ["SIDE_SETBACK"] }, ZONE);
    const all = [...shed.findings, ...garage.findings, ...fence.findings, ...deck.findings] as { explanationBasis: string; subject: string }[];
    expect(all.length).toBeGreaterThan(8);
    for (const f of all) {
      expect(f.explanationBasis, f.subject).not.toMatch(/23\.44|23\.45|Neighborhood Residential|Lowrise/);
    }
  });
});
