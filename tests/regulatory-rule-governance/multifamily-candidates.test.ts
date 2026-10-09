/**
 * Multifamily (Lowrise) candidates: structure, zone scope, and every declared test case EXECUTED against the real evaluators with the candidate's own
 * persisted specification and the real zone resolver (citywide zoning coverage).
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { singleZoneContext } from "../../src/zoning/context.js";
import { claimKindOf, isRegisteredRuleType } from "../../src/zoning/claim-kinds.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { parseZoneScope, validateZoneScope } from "../../src/zoning/scope.js";
import {
  MULTIFAMILY_FIXED_ROW_IDS,
  allMultifamilyCandidates,
  deckMultifamilyCandidates,
  fenceMultifamilyCandidates,
  garageMultifamilyCandidates,
  shedMultifamilyCandidates,
} from "../fixtures/multifamily-candidates.js";
import { asActive as asActiveShared, evaluateCandidateCase, findCaseFinding, oc } from "./candidate-harness.js";

type Candidate = (typeof allMultifamilyCandidates)[number];
const asActive = (cands: Candidate[]) => asActiveShared(cands, MULTIFAMILY_FIXED_ROW_IDS);

const ZONE = "LR1 (M)";

function evaluate(c: Candidate, project: Record<string, unknown>, zoning: string) {
  const rules = asActive(
    c.applicableProjectType === "shed" ? shedMultifamilyCandidates : c.applicableProjectType === "garage" ? garageMultifamilyCandidates : c.applicableProjectType === "fence" ? fenceMultifamilyCandidates : deckMultifamilyCandidates
  );
  return evaluateCandidateCase(c.applicableProjectType!, rules, project, zoning);
}

describe("multifamily candidates - structure", () => {
  it("every row is a real Tier-1 candidate with a valid zone scope, a citation, a registered rule type and a fixed UUID", () => {
    expect(new Set(allMultifamilyCandidates.map((c) => c.id)).size).toBe(allMultifamilyCandidates.length);
    expect(new Set(Object.values(MULTIFAMILY_FIXED_ROW_IDS)).size).toBe(allMultifamilyCandidates.length);
    for (const c of allMultifamilyCandidates) {
      expect(MULTIFAMILY_FIXED_ROW_IDS[c.id], c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(validateZoneScope(c.applicableZone), c.id).toEqual([]);
      expect(c.applicableZone).not.toBe("NR");
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(c.testCases.length).toBeGreaterThan(0);
      const ruleType = (c.ruleSpecification as { ruleType: string }).ruleType;
      expect(isRegisteredRuleType(ruleType), `${c.id}: ${ruleType} is registered in claim-kinds`).toBe(true);
      const t = triage(draft(c), "tester", "TIER_1");
      expect(t.outcome).toBe("OK");
      if (t.outcome === "OK") expect(t.rule.lifecycleState).toBe("TRIAGED");
    }
  });
  it("no two rows of one project type claim the same rule type in the same zone (the resolver would reject them as conflicting)", () => {
    const zones = ["LR1", "LR1 (M)", "LR1 (M1)", "LR2", "LR2 (M)", "LR2 (M1)", "LR3", "LR3 (M)", "LR3 (M2)", "LR1 RC (M)", "LR3 RC", "MR", "MR (M1)", "MR RC (M)", "HR (M)"];
    for (const [type, cands] of [["shed", shedMultifamilyCandidates], ["garage", garageMultifamilyCandidates], ["fence", fenceMultifamilyCandidates], ["deck", deckMultifamilyCandidates]] as const) {
      for (const z of zones) {
        const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: asActive(cands) });
        expect(r.conflictingRuleTypes, `${type} @ ${z}`).toEqual([]);
        expect(r.status).toBe("RESOLVED");
      }
    }
  });
  it("every multifamily designation (with and without an MHA suffix) is covered by exactly one floor-area-ratio row; an unrecognized suffix by none", () => {
    for (const type of ["shed", "garage"] as const) {
      const cands = type === "shed" ? shedMultifamilyCandidates : garageMultifamilyCandidates;
      for (const z of ["LR1", "LR1 (M)", "LR2", "LR2 (M1)", "LR3", "LR3 (M2)", "LR3 RC (M1)", "MR", "MR (M2)", "MR RC (M)", "HR", "HR (M)"]) {
        const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: asActive(cands) });
        expect(r.rules.filter((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "MF_FAR"), `${type} ${z}`).toHaveLength(1);
      }
      const odd = resolveApplicableRules({ zoning: singleZoneContext("LR2 (0.75)"), candidateRules: asActive(cands) });
      expect(odd.rules.filter((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "MF_FAR")).toHaveLength(0);
    }
  });
  it("the multifamily rows never resolve in a Neighborhood Residential, commercial or other zone", () => {
    for (const z of ["NR", "NC2-40", "C1-65", "SM-UP 85", "DMC 85/75-170", "IC-65"]) {
      const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: asActive(allMultifamilyCandidates.filter((c) => c.applicableProjectType === "shed")) });
      expect(r.rules.filter((x) => claimKindOf((x.ruleSpecification as { ruleType: string }).ruleType) !== "ZONE_INDEPENDENT"), z).toEqual([]);
    }
  });
  it("Lowrise rows serve LR and Midrise/Highrise rows serve MR and HR for the zone-specific height rule; the setback rule serves all three", () => {
    const heightFor = (z: string) => resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: asActive(shedMultifamilyCandidates) }).rules.filter((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "MF_ACC_HEIGHT").map((x) => x.id);
    expect(heightFor("LR2 (M)")).toEqual([MULTIFAMILY_FIXED_ROW_IDS["shed-mf-height-lr-2026"]]);
    expect(heightFor("MR (M1)")).toEqual([MULTIFAMILY_FIXED_ROW_IDS["shed-mf-height-mr-hr-2026"]]);
    expect(heightFor("HR")).toEqual([MULTIFAMILY_FIXED_ROW_IDS["shed-mf-height-mr-hr-2026"]]);
    // Highrise has no 23.45.519 separation: the separation claim is simply not governed there.
    const sep = (z: string) => resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: asActive(shedMultifamilyCandidates) }).rules.some((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "MF_ACC_SEPARATION");
    expect([sep("LR1"), sep("MR"), sep("HR")]).toEqual([true, true, false]);
  });
  it("scope tokens are parsed", () => {
    expect(parseZoneScope("MULTIFAMILY").tokens).toHaveLength(1);
  });
});

describe("every declared test case is executed against the real evaluator using the candidate's own specification", () => {
  for (const c of allMultifamilyCandidates) {
    for (const t of c.testCases as unknown as { kind: string; description: string; input: { project: Record<string, unknown>; zoning?: string }; expected: { finding: string; outcome: string } }[]) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const o = evaluate(c, t.input.project, t.input.zoning ?? ZONE);
        const found = findCaseFinding(o, t.expected.finding, MULTIFAMILY_FIXED_ROW_IDS[c.id]!);
        expect(found, `finding "${t.expected.finding}"`).toBeDefined();
        expect(oc(found!)).toBe(t.expected.outcome);
      });
    }
  }
});

describe("customer-facing text in Lowrise reports is Lowrise text", () => {
  it("no finding from the Lowrise rows mentions the Neighborhood Residential chapter", () => {
    const shed = evaluate(shedMultifamilyCandidates[0]!, { distanceToSideLotLineFt: 2, distanceToRearLotLineFt: 6, farthestFromRearLotLineFt: 16, heightFt: 14, isInRequiredSetback: true }, ZONE);
    const garage = evaluate(garageMultifamilyCandidates[0]!, { distanceToSideLotLineFt: 2, heightFt: 14, isInRequiredSetback: true }, ZONE);
    const fence = evaluate(fenceMultifamilyCandidates[3]!, { heightFt: 7, locations: ["OUTSIDE_REQUIRED_SETBACKS"] }, ZONE);
    const deck = evaluate(deckMultifamilyCandidates[0]!, { heightAboveGradeIn: 30, setbackLocations: ["SIDE_SETBACK", "REAR_SETBACK", "OUTSIDE_REQUIRED_SETBACKS"] }, ZONE);
    const all = [...shed.findings, ...garage.findings, ...fence.findings, ...deck.findings, ...[(shed as { accessoryHeightLimitFinding?: unknown }).accessoryHeightLimitFinding].filter(Boolean)] as { explanationBasis: string; subject: string }[];
    expect(all.length).toBeGreaterThan(8);
    for (const f of all) {
      expect(f.explanationBasis, f.subject).not.toMatch(/23\.44/);
      expect(f.explanationBasis, f.subject).not.toMatch(/Neighborhood Residential/);
    }
  });
});
