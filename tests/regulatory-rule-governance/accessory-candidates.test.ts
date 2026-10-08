/**
 * Accessory-structure candidates (shed S1-S3, garage G1-G5): structure, and every declared test case EXECUTED against the real evaluator using
 * the candidate's own persisted specification. Also proves that the shed rows replace the staging fixtures' coverage (nothing uncovered).
 */
import { describe, expect, it } from "vitest";
import { draft, triage } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import type { ProjectDetails } from "../../src/regulatory-rules-engine/types.js";
import { ACCESSORY_FIXED_ROW_IDS, allAccessoryCandidates, garageAccessoryCandidates, shedAccessoryCandidates } from "../fixtures/accessory-candidates.js";

const asActive = (cands: typeof allAccessoryCandidates): RegulatoryRule[] =>
  cands.map((c) => ({ ...draft(c), id: ACCESSORY_FIXED_ROW_IDS[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }));
const shedRules = asActive(shedAccessoryCandidates);
// The garage height rows only matter together with their P2b siblings, so the garage set is evaluated as a whole.
const garageRules = asActive(garageAccessoryCandidates);

const SHED_BASE = { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, distanceToRearLotLineFt: 30, distanceToSideLotLineFt: 15, distanceToFrontLotLineFt: 50, distanceToDwellingFt: 20 };
const GARAGE_BASE = { projectType: "garage", widthFt: 12, depthFt: 20, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 30, distanceToSideLotLineFt: 15, distanceToFrontLotLineFt: 50, isInRequiredSetback: false };

function run(base: Record<string, unknown>, rules: RegulatoryRule[], over: Record<string, unknown>) {
  const { lotCoverageFacts, ...project } = { ...base, ...over } as Record<string, unknown>;
  return evaluateProject({
    propertyContext: { parcelId: "t", assembledAt: "2026-01-01T00:00:00.000Z", facts: [] },
    project: project as unknown as ProjectDetails,
    candidateActiveRules: rules,
    ecaFindings: [],
    candidateActiveInferencePolicies: [],
    ...(lotCoverageFacts === "UNSUPPLIED" ? { lotCoverageFacts: { rawParcelAreaSqFt: 5000, proposedGarageCountableFootprintSqFt: 240, applicableCoveragePercentage: { status: "REQUIRES_VERIFICATION", reason: "test" }, minimumCoverageFloor: { status: "REQUIRES_VERIFICATION", statutoryMinimumSqFt: 625, reason: "test" } } } : {}),
  });
}
const oc = (f: { classification: string; complianceOutcome?: string }) => `${f.classification}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}`;

describe("accessory candidates - structure", () => {
  it("3 shed + 5 garage, unique fixed ids, real (non-fixture) Tier-1 rows with citations and cases that triage cleanly and stay TRIAGED in code", () => {
    expect(shedAccessoryCandidates).toHaveLength(3);
    expect(garageAccessoryCandidates).toHaveLength(5);
    expect(new Set(Object.values(ACCESSORY_FIXED_ROW_IDS)).size).toBe(8);
    for (const c of allAccessoryCandidates) {
      expect(ACCESSORY_FIXED_ROW_IDS[c.id]).toMatch(/^[0-9a-f-]{36}$/);
      expect(c.isTestOnlyFixture).toBe(false);
      expect(c.citation.smcSections.length).toBeGreaterThan(0);
      expect(c.testCases.length).toBeGreaterThan(0);
      expect(c.subject).not.toContain("STAGING-TEST-ONLY");
      const t = triage(draft(c), "tester", "TIER_1");
      expect(t.outcome).toBe("OK");
      if (t.outcome === "OK") expect(t.rule.lifecycleState).toBe("TRIAGED");
    }
  });

  it("with the three shed rows ACTIVE nothing position-dependent is uncovered once the Unit 6B height rows are also in place; without them only height is", () => {
    const o = run(SHED_BASE, shedRules, {});
    expect(o.uncoveredConstraintTypes).toEqual(["height"]);
    expect(o.findings.filter((f) => f.appliedRule).length).toBe(4); // rear, separation, side, front
  });
});

describe("every declared test case is executed against the evaluator using the candidate's own specification", () => {
  for (const c of allAccessoryCandidates) {
    const isGarage = c.applicableProjectType === "garage";
    for (const t of c.testCases) {
      it(`${c.id} [${t.kind}] ${t.description}`, () => {
        const o = run(isGarage ? GARAGE_BASE : SHED_BASE, isGarage ? garageRules : shedRules, (t.input as { project: Record<string, unknown> }).project);
        const { finding, outcome } = t.expected as { finding: string; outcome: string };
        const found = finding === "Accessory structure height limit" ? o.accessoryHeightLimitFinding : o.findings.find((f) => f.subject.includes(finding) && f.appliedRule?.id === ACCESSORY_FIXED_ROW_IDS[c.id]);
        expect(found, `finding "${finding}"`).toBeDefined();
        expect(oc(found!)).toBe(outcome);
      });
    }
  }
});

describe("garage: the whole set covers setback, height and lot coverage; a footprint over a lot line yields no position-dependent claim upstream", () => {
  it("nothing uncovered with all five rows ACTIVE", () => {
    expect(run(GARAGE_BASE, garageRules, {}).uncoveredConstraintTypes).toEqual([]);
  });
  it("without the height rows the garage reports height as not screened", () => {
    expect(run(GARAGE_BASE, garageRules.filter((r) => !String((r.ruleSpecification as { ruleType: string }).ruleType).startsWith("SHED_PERMIT")), {}).uncoveredConstraintTypes).toEqual(["height"]);
  });
});
