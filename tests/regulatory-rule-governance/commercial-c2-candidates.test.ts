/**
 * Commercial 2 candidates: structure, zone scope (C2 only, never NC/C1/other), every declared case executed against the real evaluators and resolver, and the C2-specific
 * use finding (residential use is a conditional use in C2) that every C2 report carries.
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { singleZoneContext } from "../../src/zoning/context.js";
import { isRegisteredRuleType } from "../../src/zoning/claim-kinds.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { validateZoneScope } from "../../src/zoning/scope.js";
import { C2_USE_SUBJECT } from "../../src/zoning/findings.js";
import { COMMERCIAL_FIXED_ROW_IDS, allCommercialCandidates } from "../fixtures/commercial-candidates.js";
import { COMMERCIAL_C2_FIXED_ROW_IDS, allCommercialC2Candidates, deckCommercialC2Candidates, fenceCommercialC2Candidates, garageCommercialC2Candidates, shedCommercialC2Candidates } from "../fixtures/commercial-c2-candidates.js";
import { asActive, evaluateCandidateCase, findCaseFinding, oc } from "./candidate-harness.js";

const setFor = (type: string) => (type === "shed" ? shedCommercialC2Candidates : type === "garage" ? garageCommercialC2Candidates : type === "fence" ? fenceCommercialC2Candidates : deckCommercialC2Candidates);

describe("commercial C2 candidates - structure", () => {
  it("one C2 row per commercial row, each a real Tier-1 candidate scoped to C2 only, with its own fixed UUID distinct from the NC/C1 row", () => {
    expect(allCommercialC2Candidates).toHaveLength(allCommercialCandidates.length);
    expect(new Set(Object.values(COMMERCIAL_C2_FIXED_ROW_IDS)).size).toBe(allCommercialC2Candidates.length);
    for (const c of allCommercialC2Candidates) {
      expect(c.applicableZone).toBe("C2");
      expect(validateZoneScope(c.applicableZone), c.id).toEqual([]);
      expect(c.id.endsWith("-c2")).toBe(true);
      expect(isRegisteredRuleType((c.ruleSpecification as { ruleType: string }).ruleType), c.id).toBe(true);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(c.caveats.some((x) => /conditional use in C2/.test(x.category))).toBe(true);
      expect(triage(draft(c), "tester", "TIER_1").outcome).toBe("OK");
    }
    for (const id of Object.values(COMMERCIAL_C2_FIXED_ROW_IDS)) expect(Object.values(COMMERCIAL_FIXED_ROW_IDS)).not.toContain(id);
  });
  it("C2 designations resolve to exactly one row per claim, and NC1-3, C1 and every other family get none of the C2 rows", () => {
    for (const type of ["shed", "garage", "fence", "deck"]) {
      const rules = asActive(setFor(type), COMMERCIAL_C2_FIXED_ROW_IDS);
      for (const z of ["C2-40", "C2-55 (M)", "C2P-55 (M1)", "C2-75 (M2)"]) {
        const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: rules });
        expect(r.conflictingRuleTypes, `${type} @ ${z}`).toEqual([]);
        expect(r.rules.length, `${type} @ ${z}`).toBeGreaterThan(0);
      }
      for (const z of ["NC2-40 (M)", "NC3-65", "C1-55 (M)", "NR", "LR2 (M)", "MR", "SM-UP 85"]) {
        expect(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: rules }).rules, `${type} @ ${z}`).toEqual([]);
      }
    }
  });
  it("the NC/C1 and C2 sets together never conflict in any commercial designation (two rows for one claim would)", () => {
    for (const type of ["shed", "garage", "fence", "deck"]) {
      const both = [...asActive(allCommercialCandidates.filter((c) => c.applicableProjectType === type), COMMERCIAL_FIXED_ROW_IDS), ...asActive(setFor(type), COMMERCIAL_C2_FIXED_ROW_IDS)];
      for (const z of ["NC1-30", "NC2-40 (M)", "NC3-65", "C1-55 (M)", "C2-40", "C2P-55 (M)"]) expect(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: both }).conflictingRuleTypes, `${type} @ ${z}`).toEqual([]);
    }
  });
});

describe("every declared test case is executed against the real evaluator using the candidate's own specification", () => {
  for (const c of allCommercialC2Candidates) {
    for (const t of c.testCases as unknown as { kind: string; description: string; input: { project: Record<string, unknown>; zoning?: string }; expected: { finding: string; outcome: string } }[]) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const rules = asActive(setFor(c.applicableProjectType!), COMMERCIAL_C2_FIXED_ROW_IDS);
        const o = evaluateCandidateCase(c.applicableProjectType!, rules, t.input.project, t.input.zoning ?? "C2-40 (M)");
        const found = findCaseFinding(o, t.expected.finding, COMMERCIAL_C2_FIXED_ROW_IDS[c.id]!);
        expect(found, `finding "${t.expected.finding}"`).toBeDefined();
        expect(oc(found!)).toBe(t.expected.outcome);
      });
    }
  }
});

describe("a C2 report states what is different about C2", () => {
  it("shed, garage, fence and deck reports in C2 carry the REQUIRES_VERIFICATION residential-use finding, and NC/C1 reports do not", () => {
    for (const type of ["shed", "garage", "fence", "deck"]) {
      const c2 = evaluateCandidateCase(type, asActive(setFor(type), COMMERCIAL_C2_FIXED_ROW_IDS), { abutsResidentialZone: "NO" }, "C2-40 (M)");
      const use = c2.findings.find((f) => f.subject === C2_USE_SUBJECT);
      expect(use, type).toBeDefined();
      expect(use!.classification).toBe("REQUIRES_VERIFICATION");
      expect(use!.explanationBasis).toMatch(/conditional uses/);
      expect(use!.explanationBasis).toMatch(/23\.42\.100/);
      const nc = evaluateCandidateCase(type, asActive(allCommercialCandidates.filter((c) => c.applicableProjectType === type), COMMERCIAL_FIXED_ROW_IDS), { abutsResidentialZone: "NO" }, "NC2-40 (M)");
      expect(nc.findings.some((f) => f.subject === C2_USE_SUBJECT), `${type} NC`).toBe(false);
    }
  });
  it("C2 reports cite Chapter 23.47A and no residential chapter", () => {
    const shed = evaluateCandidateCase("shed", asActive(shedCommercialC2Candidates, COMMERCIAL_C2_FIXED_ROW_IDS), { abutsResidentialZone: "YES", adjacentResidentialZones: ["LR1 (M)"], heightFt: 35 }, "C2-40 (M)");
    for (const f of shed.findings) expect(f.explanationBasis, f.subject).not.toMatch(/23\.44\.|23\.45\./);
  });
});
