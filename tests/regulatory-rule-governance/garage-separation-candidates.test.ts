/**
 * Garage separation candidates (zone-aware expected-constraint fix, 2026-10-09): structure, zone scope, every declared case EXECUTED against the real evaluator with
 * the row's own persisted specification and the real zone resolver, and the zone-aware expectations (a commercial zone expects no such constraint).
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import { singleZoneContext, splitZoneContext } from "../../src/zoning/context.js";
import { isRegisteredRuleType } from "../../src/zoning/claim-kinds.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { validateZoneScope } from "../../src/zoning/scope.js";
import { GARAGE_SEPARATION_FIXED_ROW_IDS, garageSeparationCandidates } from "../fixtures/garage-separation-candidates.js";
import { allCommercialCandidates, COMMERCIAL_FIXED_ROW_IDS } from "../fixtures/commercial-candidates.js";
import { asActive, evaluateCandidateCase, findCaseFinding, oc } from "./candidate-harness.js";

const rules = () => asActive(garageSeparationCandidates, GARAGE_SEPARATION_FIXED_ROW_IDS);
const SEP = (r: { ruleSpecification: unknown }) => (r.ruleSpecification as { ruleType?: string }).ruleType === "GARAGE_SEPARATION";

describe("garage separation candidates - structure", () => {
  it("every row is a real Tier-1 candidate with a valid zone scope, a citation, a registered rule type and a fixed UUID", () => {
    expect(garageSeparationCandidates).toHaveLength(3);
    for (const c of garageSeparationCandidates) {
      expect(GARAGE_SEPARATION_FIXED_ROW_IDS[c.id], c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(validateZoneScope(c.applicableZone), c.id).toEqual([]);
      expect(c.applicableProjectType).toBe("garage");
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(isRegisteredRuleType("GARAGE_SEPARATION")).toBe(true);
      const t = triage(draft(c), "tester", "TIER_1");
      expect(t.outcome).toBe("OK");
    }
  });
  it("exactly one row governs each of NR, LR, MR and HR, and none governs a commercial zone", () => {
    for (const z of ["NR", "LR1 (M)", "LR2", "LR3 (M2)", "LR2 RC (M)", "MR (M1)", "HR (M)"]) {
      const r = resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: rules() });
      expect(r.conflictingRuleTypes, z).toEqual([]);
      expect(r.rules.filter(SEP), z).toHaveLength(1);
    }
    for (const z of ["NC1-30 (M)", "NC2-40 (M)", "NC3-55", "C1-65 (M)"]) {
      expect(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: rules() }).rules.filter(SEP), z).toHaveLength(0);
    }
  });
  it("Highrise gets the in-setback-only row, Lowrise and Midrise the between-structures row, NR its own row", () => {
    const rowFor = (z: string) => resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: rules() }).rules.find(SEP)!.id;
    expect(rowFor("NR")).toBe(GARAGE_SEPARATION_FIXED_ROW_IDS["garage-nr-separation-2026"]);
    expect(rowFor("LR2 (M)")).toBe(GARAGE_SEPARATION_FIXED_ROW_IDS["garage-mf-separation-lr-mr-2026"]);
    expect(rowFor("MR")).toBe(GARAGE_SEPARATION_FIXED_ROW_IDS["garage-mf-separation-lr-mr-2026"]);
    expect(rowFor("HR")).toBe(GARAGE_SEPARATION_FIXED_ROW_IDS["garage-mf-separation-hr-2026"]);
  });
  it("the commercial candidate set carries no garage separation row (the claim is not applicable in those zones)", () => {
    expect(allCommercialCandidates.some((c) => (c.ruleSpecification as { ruleType?: string }).ruleType === "GARAGE_SEPARATION")).toBe(false);
    expect(Object.keys(COMMERCIAL_FIXED_ROW_IDS).some((id) => /separation/i.test(id))).toBe(false);
  });
});

describe("garage separation candidates - every declared case executed", () => {
  for (const c of garageSeparationCandidates) {
    for (const [i, t] of c.testCases.entries()) {
      it(`${c.id} #${i} [${t.kind}] ${t.description}`, () => {
        const zoning = (t.input as { zoning: string }).zoning;
        const o = evaluateCandidateCase("garage", rules(), (t.input as { project: Record<string, unknown> }).project, zoning);
        const f = findCaseFinding(o as never, t.expected.finding as string, GARAGE_SEPARATION_FIXED_ROW_IDS[c.id]!);
        expect(f, `${c.id} #${i}: finding present`).toBeDefined();
        expect(oc(f as never)).toBe(t.expected.outcome);
        // Whatever the outcome, a garage report never lists the separation as "not yet screenable" while the zone's row is active.
        expect(o.uncoveredConstraintTypes.join(" | ")).not.toMatch(/separation/);
      });
    }
  }
});

describe("zone-aware expectations", () => {
  const withRules = (zone: string, cands = garageSeparationCandidates, ids = GARAGE_SEPARATION_FIXED_ROW_IDS) => evaluateCandidateCase("garage", asActive(cands, ids), { distanceToDwellingFt: 12, drivewayOrAisleBetween: false }, zone);

  it("a Lowrise garage with the row ACTIVE is screened and lists no separation gap; with the row missing it is the one real implementation gap", () => {
    expect(withRules("LR1 (M)").uncoveredConstraintTypes.join("|")).not.toContain("separation");
    const noRows = withRules("LR1 (M)", [], {});
    expect(noRows.uncoveredConstraintTypes.some((u) => /separation from the principal structure/.test(u))).toBe(true);
  });
  it("a commercial-zone garage never lists a separation notice, with or without any separation rows", () => {
    const withCommercial = evaluateCandidateCase("garage", asActive(allCommercialCandidates.filter((c) => c.applicableProjectType === "garage"), COMMERCIAL_FIXED_ROW_IDS), { distanceToDwellingFt: 2 }, "NC2-40 (M)");
    expect(withCommercial.uncoveredConstraintTypes.join("|")).not.toMatch(/separation/);
    expect(withCommercial.findings.some((f) => f.subject.includes("principal structure"))).toBe(false);
    const none = evaluateCandidateCase("garage", [], { distanceToDwellingFt: 2 }, "C1-65 (M)");
    expect(none.uncoveredConstraintTypes.join("|")).not.toMatch(/separation/);
  });
  it("a lot split between NR and Lowrise: the separation claim is settled only when the garage's own zone is known; otherwise it is a verification item", () => {
    const split = splitZoneContext([["NR", 0.5], ["LR2 (M)", 0.5]]);
    const lotWide = evaluateCandidateCase("garage", rules(), { distanceToDwellingFt: 30 }, "NR");
    expect(lotWide.findings.some((f) => f.subject === "Detached garage separation from the principal structure" && f.complianceOutcome === "PASS")).toBe(true);
    // Resolver level: with both zones in play and no footprint zone, the claim is ambiguous (never a majority-zone answer).
    const r = resolveApplicableRules({ zoning: split, candidateRules: rules() });
    expect(r.rules.some(SEP)).toBe(false);
    expect(r.ambiguousClaims.some((a) => a.ruleType === "GARAGE_SEPARATION")).toBe(true);
  });
});
