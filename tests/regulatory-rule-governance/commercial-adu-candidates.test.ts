/**
 * Neighborhood Commercial and Commercial 1 ADU candidates: structure, zone scope, and every declared case executed against the real ADU evaluator and zone resolver.
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateAdu } from "../../src/regulatory-rules-engine/evaluate-adu.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";
import type { AduProjectDetails, AduSiteFacts } from "../../src/regulatory-rules-engine/adu-types.js";
import { singleZoneContext } from "../../src/zoning/context.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { validateZoneScope } from "../../src/zoning/scope.js";
import { ADU_COMM_FIXED_ROW_IDS, aduCommercialCandidates } from "../fixtures/commercial-adu-candidates.js";
import { baseAduProject, baseAduSite } from "../fixtures/adu-evaluation-base.js";
import { oc } from "./candidate-harness.js";

const active: RegulatoryRule[] = aduCommercialCandidates.map((c) => ({ ...draft(c), id: ADU_COMM_FIXED_ROW_IDS[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }) as RegulatoryRule);
const run = (project: Record<string, unknown> | undefined, site: Record<string, unknown> | undefined, zoning: string) =>
  evaluateAdu({
    project: { ...baseAduProject(), ...(project ?? {}) } as AduProjectDetails,
    site: { ...baseAduSite(), ...(site ?? {}) } as AduSiteFacts,
    candidateActiveRules: active,
    zoningContext: singleZoneContext(zoning),
  });
const typesFor = (zone: string) => new Set(resolveApplicableRules({ zoning: singleZoneContext(zone), candidateRules: active }).rules.map((x) => (x.ruleSpecification as { ruleType: string }).ruleType));
const COMPLETE: string[] = [AduRuleType.MF_COUNT, AduRuleType.SIZE_LIMIT, AduRuleType.COMM_SETBACKS, AduRuleType.SEPARATION, AduRuleType.COMM_HEIGHT, AduRuleType.MF_NO_LOT_COVERAGE_LIMIT, AduRuleType.MF_FLOOR_AREA_RATIO, AduRuleType.AMENITY_AREA, AduRuleType.MF_LANDSCAPING_NOTE, AduRuleType.DESIGN_STANDARDS, AduRuleType.CONVERSION, AduRuleType.ATTACHED];

describe("Neighborhood Commercial and C1 ADU candidates - structure", () => {
  it("every row is a real Tier-1 candidate with a valid zone scope, citation and fixed UUID", () => {
    expect(new Set(Object.values(ADU_COMM_FIXED_ROW_IDS)).size).toBe(aduCommercialCandidates.length);
    for (const c of aduCommercialCandidates) {
      expect(validateZoneScope(c.applicableZone), c.id).toEqual([]);
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(triage(draft(c), "tester", "TIER_1").outcome).toBe("OK");
    }
  });
  it("every NC1-NC3 and C1 designation resolves to a complete ADU rule set without conflicts", () => {
    for (const z of ["NC1-30 (M)", "NC1P-30", "NC2-40 (M)", "NC2P-55 (M1)", "NC3-65", "NC3P-85 (M2)", "C1-55 (M)", "C1-75"]) {
      expect(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active }).conflictingRuleTypes, z).toEqual([]);
      const types = typesFor(z);
      for (const t of COMPLETE) expect(types.has(t), `${z} has ${t}`).toBe(true);
    }
  });
  it("C2 (residential is a conditional use there), the multifamily, residential, mixed, downtown and industrial zones get none of these rows", () => {
    for (const z of ["C2-40 (M)", "NR", "LR1 (M)", "MR (M1)", "HR (M)", "SM-UP 95", "DMC 85/75-170", "IB U/45", "IC-65"]) {
      expect(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: active }).rules, z).toEqual([]);
    }
  });
});

describe("every declared test case is executed against the real evaluator using the candidate's own specification", () => {
  for (const c of aduCommercialCandidates) {
    for (const t of c.testCases as unknown as { kind: string; description: string; input: { project?: Record<string, unknown>; site?: Record<string, unknown>; zoning?: string }; expected: { finding: string; outcome: string; appliedBy?: string } }[]) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const o = run(t.input.project, t.input.site, t.input.zoning ?? "NC2-40 (M)");
        const rowId = ADU_COMM_FIXED_ROW_IDS[t.expected.appliedBy ?? c.id]!;
        const f = o.findings.find((x) => x.subject.includes(t.expected.finding) && x.appliedRule?.id === rowId);
        expect(f, `finding "${t.expected.finding}"`).toBeDefined();
        expect(oc(f!)).toBe(t.expected.outcome);
      });
    }
  }
});

describe("a commercial-zone ADU report is Chapter 23.47A text end to end", () => {
  for (const zone of ["NC2-40 (M)", "C1-65 (M)"]) {
    it(`${zone}: an ordinary detached ADU with no residential neighbor is LOOKS_FEASIBLE, nothing uncovered, no NR/Lowrise/Midrise text`, () => {
      const o = run({ existingChargeableFloorAreaSqFt: 1500, abutsResidentialZone: "NO" }, { mappedHeightFt: zone.startsWith("NC2") ? 40 : 65 }, zone);
      expect(o.uncoveredConstraintTypes).toEqual([]);
      expect(o.feasibility.headline).toBe("LOOKS_FEASIBLE");
      for (const f of o.findings) expect(f.explanationBasis, f.subject).not.toMatch(/23\.44|23\.45|Neighborhood Residential|Lowrise|Midrise|Highrise/);
      expect(o.findings.find((f) => f.subject === "Zoning applied to this screening")?.explanationBasis).toMatch(/Neighborhood Commercial|Commercial/);
    });
  }
  it("a residential neighbor (or an unread one) turns the setback claim into a verification item that names the abutting-zone rules, and the headline is not LOOKS_FEASIBLE", () => {
    for (const abuts of ["YES", "UNKNOWN"] as const) {
      const o = run({ existingChargeableFloorAreaSqFt: 1500, abutsResidentialZone: abuts, adjacentResidentialZones: abuts === "YES" ? ["NR"] : undefined }, undefined, "NC2-40 (M)");
      const f = o.findings.find((x) => x.subject === "ADU setbacks in a commercial zone")!;
      expect(f.classification).toBe("REQUIRES_VERIFICATION");
      expect(f.explanationBasis).toMatch(/upper-level setback/);
      expect(f.explanationBasis).toContain("SMC 23.47A.014.B");
    }
  });
  it("the floor-area-ratio sentence says the figure is a lowest figure that depends on the mapped height, and the amenity requirement is on the floor-area basis with no 1982 exemption", () => {
    const o = run({ existingChargeableFloorAreaSqFt: 1500, existingHouseBuiltBefore1982: true, abutsResidentialZone: "NO" }, { parcelAreaSqFt: 6000 }, "NC2-40 (M)");
    const far = o.findings.find((x) => x.subject === "Floor area ratio (FAR)")!;
    expect(far.explanationBasis).toMatch(/never less than 2\.5 times the lot area/);
    expect(far.explanationBasis).toContain("SMC 23.47A.013");
    const amenity = o.findings.find((x) => x.subject === "Amenity area")!;
    expect(amenity.classification).toBe("REQUIRES_VERIFICATION");
    expect(amenity.explanationBasis).toMatch(/5% of the total gross floor area/);
    expect(amenity.explanationBasis).not.toMatch(/1982/);
  });
  it("conversion and attached ADUs complete on the same rows with nothing uncovered", () => {
    const conv = run({ aduType: "CONVERSION_EXISTING", widthFt: undefined, depthFt: undefined, heightFt: undefined, abutsResidentialZone: "NO", conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: true } }, undefined, "NC3-55");
    expect(conv.uncoveredConstraintTypes).toEqual([]);
    const att = run({ aduType: "ATTACHED_TO_HOUSE", widthFt: undefined, depthFt: undefined, heightFt: undefined, abutsResidentialZone: "NO", attached: { grossFloorAreaSqFt: 700, includesAddition: false, portionExistedBeforeJuly2023: true } }, undefined, "C1-55");
    expect(att.uncoveredConstraintTypes).toEqual([]);
  });
});
