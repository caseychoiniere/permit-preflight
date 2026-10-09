/**
 * Midrise and Highrise ADU candidates: structure, zone scope, and every declared case executed against the real ADU evaluator and zone resolver.
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateAdu } from "../../src/regulatory-rules-engine/evaluate-adu.js";
import type { AduProjectDetails, AduSiteFacts } from "../../src/regulatory-rules-engine/adu-types.js";
import { singleZoneContext } from "../../src/zoning/context.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { validateZoneScope } from "../../src/zoning/scope.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";
import { ADU_MR_HR_FIXED_ROW_IDS, aduMrHrCandidates } from "../fixtures/multifamily-adu-mr-hr-candidates.js";
import { baseAduProject, baseAduSite } from "../fixtures/adu-evaluation-base.js";
import { oc } from "./candidate-harness.js";

const active: RegulatoryRule[] = aduMrHrCandidates.map((c) => ({ ...draft(c), id: ADU_MR_HR_FIXED_ROW_IDS[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule);
const run = (project: Record<string, unknown> | undefined, site: Record<string, unknown> | undefined, zoning: string) =>
  evaluateAdu({
    project: { ...baseAduProject(), ...(project ?? {}) } as AduProjectDetails,
    site: { ...baseAduSite(), ...(site ?? {}) } as AduSiteFacts,
    candidateActiveRules: active,
    zoningContext: singleZoneContext(zoning),
  });
const typesFor = (zone: string) => new Set(resolveApplicableRules({ zoning: singleZoneContext(zone), candidateRules: active }).rules.map((x) => (x.ruleSpecification as { ruleType: string }).ruleType));
const COMPLETE: string[] = [AduRuleType.MF_COUNT, AduRuleType.SIZE_LIMIT, AduRuleType.SETBACKS, AduRuleType.SEPARATION, AduRuleType.HEIGHT, AduRuleType.MF_NO_LOT_COVERAGE_LIMIT, AduRuleType.MF_FLOOR_AREA_RATIO, AduRuleType.AMENITY_AREA, AduRuleType.MF_LANDSCAPING_NOTE, AduRuleType.DESIGN_STANDARDS, AduRuleType.CONVERSION, AduRuleType.ATTACHED];

describe("Midrise and Highrise ADU candidates - structure", () => {
  it("every row is a real Tier-1 candidate with a valid zone scope, citation and fixed UUID", () => {
    expect(new Set(Object.values(ADU_MR_HR_FIXED_ROW_IDS)).size).toBe(aduMrHrCandidates.length);
    for (const c of aduMrHrCandidates) {
      expect(validateZoneScope(c.applicableZone), c.id).toEqual([]);
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(triage(draft(c), "tester", "TIER_1").outcome).toBe("OK");
    }
  });
  it("every Midrise and Highrise designation resolves to a complete ADU rule set without conflicts", () => {
    for (const z of ["MR", "MR (M)", "MR (M1)", "MR (M2)", "MR RC (M)", "HR", "HR (M)", "HR (M1)"]) {
      const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active });
      expect(r.conflictingRuleTypes, z).toEqual([]);
      const types = typesFor(z);
      for (const t of COMPLETE) expect(types.has(t), `${z} has ${t}`).toBe(true);
    }
  });
  it("other zones get none of these rows", () => {
    for (const z of ["NR", "LR1 (M)", "LR3", "NC2-40", "C1-65", "C2-40", "SM-UP 95", "DMC 85/75-170", "IB U/45"]) {
      expect(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active }).rules, z).toEqual([]);
    }
  });
  it("the 5 ft separation exists in Midrise only; Highrise has the no-requirement statement instead", () => {
    const sep = (z: string) => resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active }).rules.find((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "ADU_A4_SEPARATION")!;
    expect((sep("MR (M1)").ruleSpecification as { minFt: number }).minFt).toBe(5);
    expect((sep("HR (M)").ruleSpecification as { noRequirementText?: string }).noRequirementText).toBeDefined();
  });
  it("floor-area and height figures follow the MHA suffix and the family", () => {
    const far = (z: string) => (resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active }).rules.find((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "ADU_MF_FAR")!.ruleSpecification as { far: number }).far;
    expect([far("MR (M1)"), far("MR"), far("HR (M)")]).toEqual([4.5, 3.2, 7]);
    const h = (z: string) => (resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active }).rules.find((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "ADU_A5_HEIGHT")!.ruleSpecification as { maxFt: number }).maxFt;
    expect([h("MR (M1)"), h("MR"), h("HR")]).toEqual([80, 60, 440]);
    // An unrecognized suffix leaves the MHA-dependent claims unscreened rather than guessing.
    expect(typesFor("MR (0.75)").has("ADU_A5_HEIGHT")).toBe(false);
  });
});

describe("every declared test case is executed against the real evaluator using the candidate's own specification", () => {
  for (const c of aduMrHrCandidates) {
    for (const t of c.testCases as unknown as { kind: string; description: string; input: { project?: Record<string, unknown>; site?: Record<string, unknown>; zoning?: string }; expected: { finding: string; outcome: string; appliedBy?: string } }[]) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const o = run(t.input.project, t.input.site, t.input.zoning ?? "MR (M1)");
        const rowId = ADU_MR_HR_FIXED_ROW_IDS[t.expected.appliedBy ?? c.id]!;
        const f = o.findings.find((x) => x.subject.includes(t.expected.finding) && x.appliedRule?.id === rowId);
        expect(f, `finding "${t.expected.finding}"`).toBeDefined();
        expect(oc(f!)).toBe(t.expected.outcome);
      });
    }
  }
});

describe("a Midrise or Highrise ADU report is Midrise/Highrise text end to end", () => {
  for (const zone of ["MR (M1)", "HR (M)"]) {
    it(`${zone}: an ordinary detached ADU is LOOKS_FEASIBLE with nothing uncovered and cites no Neighborhood Residential or Lowrise-only text`, () => {
      const o = run({ existingChargeableFloorAreaSqFt: 1500, distanceToRearLotLineFt: 30, distanceToSideLotLineFt: 15, distanceToFrontLotLineFt: 60 }, undefined, zone);
      expect(o.uncoveredConstraintTypes).toEqual([]);
      expect(o.feasibility.headline).toBe("LOOKS_FEASIBLE");
      for (const f of o.findings) {
        expect(f.explanationBasis, f.subject).not.toMatch(/23\.44|Neighborhood Residential|Lowrise/);
        if (zone === "HR (M)") expect(f.explanationBasis, f.subject).not.toMatch(/23\.45\.519\.A; |at least 5 ft apart/);
      }
    });
  }
  it("conversion and attached ADUs complete on the same rows with nothing uncovered", () => {
    const conv = run({ aduType: "CONVERSION_EXISTING", widthFt: undefined, depthFt: undefined, heightFt: undefined, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: true } }, undefined, "HR (M)");
    expect(conv.uncoveredConstraintTypes).toEqual([]);
    const att = run({ aduType: "ATTACHED_TO_HOUSE", widthFt: undefined, depthFt: undefined, heightFt: undefined, attached: { grossFloorAreaSqFt: 700, includesAddition: false, portionExistedBeforeJuly2023: true } }, undefined, "MR");
    expect(att.uncoveredConstraintTypes).toEqual([]);
  });
  it("the Midrise side-setback message is Midrise text (7 ft average, 5 ft minimum, Table B), never the Neighborhood Residential figures", () => {
    const o = run({ distanceToSideLotLineFt: 8, distanceToRearLotLineFt: 40, distanceToFrontLotLineFt: 60 }, undefined, "MR (M1)");
    const side = o.findings.find((f) => f.subject === "ADU side setback")!;
    expect(side.explanationBasis).toMatch(/7 ft on average/);
    expect(side.explanationBasis).toContain("SMC 23.45.518 Table B");
    expect(side.explanationBasis).not.toMatch(/23\.44|small lots|frequent transit/);
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("7 ft average, 5 ft minimum");
  });
  it("the amenity requirement is stated on the floor-area basis, not as a share of the lot", () => {
    const o = run({ existingHouseBuiltBefore1982: false }, { parcelAreaSqFt: 6000 }, "MR (M1)");
    const f = o.findings.find((x) => x.subject === "Amenity area")!;
    expect(f.explanationBasis).toMatch(/5% of the total gross floor area/);
    expect(f.explanationBasis).not.toMatch(/of the lot area/);
  });
});
