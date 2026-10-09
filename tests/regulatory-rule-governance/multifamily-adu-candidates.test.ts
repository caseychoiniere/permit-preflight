/**
 * Lowrise ADU candidates: structure, zone scope, and every declared case executed against the real ADU evaluator and zone resolver.
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateAdu } from "../../src/regulatory-rules-engine/evaluate-adu.js";
import type { AduProjectDetails, AduSiteFacts } from "../../src/regulatory-rules-engine/adu-types.js";
import { singleZoneContext } from "../../src/zoning/context.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { validateZoneScope } from "../../src/zoning/scope.js";
import { ADU_MF_FIXED_ROW_IDS, aduMultifamilyCandidates } from "../fixtures/multifamily-adu-candidates.js";
import { baseAduProject, baseAduSite } from "../fixtures/adu-evaluation-base.js";
import { oc } from "./candidate-harness.js";

const active: RegulatoryRule[] = aduMultifamilyCandidates.map((c) => ({ ...draft(c), id: ADU_MF_FIXED_ROW_IDS[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule);
const run = (project: Record<string, unknown> | undefined, site: Record<string, unknown> | undefined, zoning: string) =>
  evaluateAdu({
    project: { ...baseAduProject(), ...(project ?? {}) } as AduProjectDetails,
    site: { ...baseAduSite(), ...(site ?? {}) } as AduSiteFacts,
    candidateActiveRules: active,
    zoningContext: singleZoneContext(zoning),
  });

describe("Lowrise ADU candidates - structure", () => {
  it("every row is a real Tier-1 candidate with a valid zone scope, citation and fixed UUID", () => {
    expect(new Set(Object.values(ADU_MF_FIXED_ROW_IDS)).size).toBe(aduMultifamilyCandidates.length);
    for (const c of aduMultifamilyCandidates) {
      expect(validateZoneScope(c.applicableZone), c.id).toEqual([]);
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(triage(draft(c), "tester", "TIER_1").outcome).toBe("OK");
    }
  });
  it("every Lowrise designation resolves to a complete ADU rule set without conflicts, and other zones to none", () => {
    for (const z of ["LR1", "LR1 (M)", "LR2", "LR2 (M1)", "LR3 (M2)", "LR3", "LR3 RC (M1)", "LR1 RC (M)"]) {
      const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active });
      expect(r.conflictingRuleTypes, z).toEqual([]);
      const types = new Set(r.rules.map((x) => (x.ruleSpecification as { ruleType: string }).ruleType));
      for (const t of ["ADU_MF_COUNT", "ADU_A2_SIZE_LIMIT", "ADU_A3_SETBACKS", "ADU_A4_SEPARATION", "ADU_A5_HEIGHT", "ADU_MF_NO_LOT_COVERAGE_LIMIT", "ADU_MF_FAR", "ADU_A8_AMENITY_AREA", "ADU_MF_LANDSCAPING_NOTE", "ADU_A10_DESIGN_STANDARDS", "ADU_A11_CONVERSION_OF_EXISTING_ACCESSORY_STRUCTURE", "ADU_A12_ATTACHED_TO_OR_INSIDE_HOUSE"]) {
        expect(types.has(t), `${z} has ${t}`).toBe(true);
      }
    }
    for (const z of ["NR", "MR", "HR (M)", "NC2-40", "LR2 (0.75)"]) {
      const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active });
      if (z === "LR2 (0.75)") expect(r.rules.some((x) => (x.ruleSpecification as { ruleType: string }).ruleType === "ADU_A5_HEIGHT")).toBe(false);
      else expect(r.rules, z).toEqual([]);
    }
  });
});

describe("every declared test case is executed against the real evaluator using the candidate's own specification", () => {
  for (const c of aduMultifamilyCandidates) {
    for (const t of c.testCases as unknown as { kind: string; description: string; input: { project?: Record<string, unknown>; site?: Record<string, unknown>; zoning?: string }; expected: { finding: string; outcome: string; appliedBy?: string } }[]) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const o = run(t.input.project, t.input.site, t.input.zoning ?? "LR1 (M)");
        const rowId = ADU_MF_FIXED_ROW_IDS[t.expected.appliedBy ?? c.id]!;
        const f = o.findings.find((x) => x.subject.includes(t.expected.finding) && x.appliedRule?.id === rowId);
        expect(f, `finding "${t.expected.finding}"`).toBeDefined();
        expect(oc(f!)).toBe(t.expected.outcome);
      });
    }
  }
});

describe("a Lowrise ADU report is Lowrise text end to end", () => {
  it("an ordinary detached ADU is LOOKS_FEASIBLE with nothing uncovered, and no finding cites the Neighborhood Residential chapter", () => {
    const o = run({ existingChargeableFloorAreaSqFt: 1500 }, undefined, "LR2 (M)");
    expect(o.uncoveredConstraintTypes).toEqual([]);
    expect(o.feasibility.headline).toBe("LOOKS_FEASIBLE");
    for (const f of o.findings) expect(f.explanationBasis, f.subject).not.toMatch(/23\.44|Neighborhood Residential/);
    expect(o.feasibility.summary + o.feasibility.verifyBeforeDesign.join(" ")).not.toMatch(/23\.44/);
  });
  it("conversion and attached ADUs complete on the same rows", () => {
    const conv = run({ aduType: "CONVERSION_EXISTING", widthFt: undefined, depthFt: undefined, heightFt: undefined, conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: true } }, undefined, "LR3 (M)");
    expect(conv.uncoveredConstraintTypes).toEqual([]);
    const att = run({ aduType: "ATTACHED_TO_HOUSE", widthFt: undefined, depthFt: undefined, heightFt: undefined, attached: { grossFloorAreaSqFt: 700, includesAddition: false, portionExistedBeforeJuly2023: true } }, undefined, "LR1");
    expect(att.uncoveredConstraintTypes).toEqual([]);
    for (const f of [...conv.findings, ...att.findings]) expect(f.explanationBasis, f.subject).not.toMatch(/23\.44\.(0|1)/);
  });
});
