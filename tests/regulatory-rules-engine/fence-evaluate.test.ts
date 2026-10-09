/**
 * Unit 7 (Fences) - deterministic tests for evaluateFence: exact boundaries (limits are inclusive:
 * "no greater than"), every location x wall relation, slope cap, top features, masonry tri-state,
 * outcome-specific gating, malformed specs, and the invariants (never LIKELY_EXEMPT; no claim without
 * its rule; sight distance never asserted as satisfied).
 */
import { describe, expect, it } from "vitest";
import { singleZoneContext, splitZoneContext, unavailableZoneContext } from "../../src/zoning/context.js";
import { FENCE_OUTCOME_DEPENDENCIES, evaluateFence } from "../../src/regulatory-rules-engine/evaluate-fence.js";
import { FenceRuleType } from "../../src/regulatory-rules-engine/fence-types.js";
import type { FenceProjectDetails } from "../../src/regulatory-rules-engine/fence-types.js";
import type { Finding } from "../../src/regulatory-rules-engine/types.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import type { CriticalAreaFinding } from "../../src/spatial-analysis/types.js";
import { FenceLocation, FenceWallRelation } from "../../src/screening-request/types.js";

const SPECS: Record<string, Record<string, unknown>> = {
  [FenceRuleType.HEIGHT_STANDARD]: { maxFt: 6, openFeatureAllowanceFt: 2, absoluteMaxFt: 8 },
  [FenceRuleType.HEIGHT_FRONT_STREET_SIDE]: { maxFt: 4, absoluteMaxFt: 6 },
  [FenceRuleType.RETAINING_WALL]: { fenceOnWallMaxFt: 4, combinedMaxFt: 9.5, raisingGradeWallMaxFt: 6, cutWallFenceSetbackFt: 3 },
  [FenceRuleType.OUTSIDE_REQUIRED_SETBACKS]: { generalStructureHeightLimitFt: 32 },
  [FenceRuleType.PERMIT_HEIGHT_EXEMPTION]: { maxFt: 8 },
  [FenceRuleType.PERMIT_MASONRY_CONCRETE]: { elementsAboveFt: 6 },
  [FenceRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE]: {},
};

function rule(ruleType: string, over: Partial<RegulatoryRule> = {}, spec: Record<string, unknown> = SPECS[ruleType] ?? {}): RegulatoryRule {
  return {
    id: `rule-${ruleType}`,
    subject: `Fence rule ${ruleType}`,
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType, ...spec },
    citation: { smcSections: ["SMC 23.44.090.H.4"] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: [],
    ...over,
  };
}
const ALL_RULES = Object.values(FenceRuleType).map((t) => rule(t));
const without = (...types: string[]) => ALL_RULES.filter((r) => !types.includes((r.ruleSpecification as { ruleType: string }).ruleType));

function fence(over: Partial<FenceProjectDetails> = {}): FenceProjectDetails {
  return { projectType: "fence", heightFt: 6, locations: [FenceLocation.OTHER_SIDE_OR_REAR_SETBACK], siteSlopes: false, wallRelation: FenceWallRelation.NONE, ...over };
}
function run(over: Partial<FenceProjectDetails> = {}, rules = ALL_RULES, eca: CriticalAreaFinding[] = []) {
  return evaluateFence({ project: fence(over), candidateActiveRules: rules, ecaFindings: eca, zoningContext: singleZoneContext("NR") });
}
const ZONING = "Zoning applied to this screening";
const bySubject = (findings: Finding[], needle: string) => findings.find((f) => f.subject.includes(needle));
const outcome = (f: Finding | undefined) => (f ? `${f.classification}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}` : "none");

describe("height by location - inclusive limits", () => {
  it.each([
    [FenceLocation.OTHER_SIDE_OR_REAR_SETBACK, 6, "KNOWN/PASS"],
    [FenceLocation.OTHER_SIDE_OR_REAR_SETBACK, 6.01, "KNOWN/FAIL"],
    [FenceLocation.FRONT_SETBACK, 4, "KNOWN/PASS"],
    [FenceLocation.FRONT_SETBACK, 4.01, "KNOWN/FAIL"],
    [FenceLocation.STREET_SIDE_SETBACK, 4, "KNOWN/PASS"],
    [FenceLocation.STREET_SIDE_SETBACK, 5, "KNOWN/FAIL"],
    [FenceLocation.OUTSIDE_REQUIRED_SETBACKS, 12, "KNOWN/PASS"],
  ])("%s at %s ft -> %s", (location, heightFt, expected) => {
    const { findings } = run({ locations: [location], heightFt });
    expect(outcome(findings[0])).toBe(expected);
  });

  it("each declared location gets its own finding, front/street/side/outside in a stable order", () => {
    const { findings } = run({ locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS, FenceLocation.FRONT_SETBACK, FenceLocation.OTHER_SIDE_OR_REAR_SETBACK], heightFt: 5 });
    expect(findings.map((f) => f.subject)).toEqual([
      "Fence height (front setback)",
      "Fence height (side or rear setback)",
      "Fence height (outside required setbacks)",
      "Sight-distance requirements (corner lot, driveway, alley)",
      ZONING,
    ]);
    expect(outcome(findings[0])).toBe("KNOWN/FAIL"); // 5 ft in the 4-ft zone
    expect(outcome(findings[1])).toBe("KNOWN/PASS"); // 5 ft in the 6-ft zone
  });

  it("findings cite the applied rule and the declared basis; supporting evidence carries the declared numbers", () => {
    const f = run({ heightFt: 5 }).findings[0]!;
    expect(f.appliedRule?.id).toBe(`rule-${FenceRuleType.HEIGHT_STANDARD}`);
    expect(f.explanationBasis).toContain("Based on the fence details you entered (not measured from the site).");
    expect(f.supportingEvidence).toContain("declaredHeightFt=5");
  });
});

describe("top features (SMC 23.44.090.H.4.b)", () => {
  it("in the 6-ft zone a declared feature within its allowance is REQUIRES_VERIFICATION (predominantly open is SDCI's call), never a bare PASS", () => {
    const f = run({ heightFt: 6, openFeatureHeightFt: 2 }).findings[0]!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("predominantly open");
  });
  it("a feature above the allowance is a KNOWN FAIL", () => {
    expect(outcome(run({ heightFt: 6, openFeatureHeightFt: 2.5 }).findings[0])).toBe("KNOWN/FAIL");
  });
  it("a body above 6 ft fails even with a small feature (the allowance adds to a conforming fence only)", () => {
    expect(outcome(run({ heightFt: 6.5, openFeatureHeightFt: 1 }).findings[0])).toBe("KNOWN/FAIL");
  });
  it("in the 4-ft zones a feature gets NO allowance - it counts toward the 4 ft", () => {
    expect(outcome(run({ locations: [FenceLocation.FRONT_SETBACK], heightFt: 3, openFeatureHeightFt: 1 }).findings[0])).toBe("KNOWN/PASS");
    const over = run({ locations: [FenceLocation.FRONT_SETBACK], heightFt: 3, openFeatureHeightFt: 1.5 }).findings[0]!;
    expect(outcome(over)).toBe("KNOWN/FAIL");
    expect(over.explanationBasis).toContain("no extra height is allowed for a top feature");
  });
});

describe("sloping sites (SMC 23.44.090.H.4.c)", () => {
  it("average within the limit and tallest portion within the absolute cap -> PASS (the 8-ft cap in the 6-ft zone)", () => {
    expect(outcome(run({ siteSlopes: true, heightFt: 6, tallestPortionHeightFt: 8 }).findings[0])).toBe("KNOWN/PASS");
  });
  it("tallest portion above the absolute cap -> FAIL (8.01 in the 6-ft zone; 6.01 in the 4-ft zone)", () => {
    expect(outcome(run({ siteSlopes: true, heightFt: 6, tallestPortionHeightFt: 8.01 }).findings[0])).toBe("KNOWN/FAIL");
    expect(outcome(run({ locations: [FenceLocation.FRONT_SETBACK], siteSlopes: true, heightFt: 4, tallestPortionHeightFt: 6 }).findings[0])).toBe("KNOWN/PASS");
    expect(outcome(run({ locations: [FenceLocation.FRONT_SETBACK], siteSlopes: true, heightFt: 4, tallestPortionHeightFt: 6.01 }).findings[0])).toBe("KNOWN/FAIL");
  });
  it("sloping site with no tallest portion: within the average limit -> REQUIRES_VERIFICATION (cap cannot be checked); average over the limit -> still a definite FAIL", () => {
    const unresolved = run({ siteSlopes: true, heightFt: 6 }).findings[0]!;
    expect(unresolved.classification).toBe("REQUIRES_VERIFICATION");
    expect(unresolved.explanationBasis).toContain("tallest portion");
    expect(outcome(run({ siteSlopes: true, heightFt: 7 }).findings[0])).toBe("KNOWN/FAIL");
  });
});

describe("retaining walls and bulkheads (SMC 23.44.090.H.4.a, H.5)", () => {
  const wallFinding = (over: Partial<FenceProjectDetails>) => bySubject(run(over).findings, "retaining wall");

  it("a fence on top of any wall is limited to 4 ft even in the 6-ft zone", () => {
    expect(outcome(run({ wallRelation: FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD, wallHeightFt: 3, heightFt: 4 }).findings[0])).toBe("KNOWN/PASS");
    expect(outcome(run({ wallRelation: FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD, wallHeightFt: 3, heightFt: 4.01 }).findings[0])).toBe("KNOWN/FAIL");
  });
  it("on a new wall raising grade: combined height <= 9.5 inclusive (wall 5.5 + fence 4 PASS; 5.51 + 4 FAIL)", () => {
    expect(outcome(wallFinding({ wallRelation: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE, wallHeightFt: 5.5, heightFt: 4 }))).toBe("KNOWN/PASS");
    expect(outcome(wallFinding({ wallRelation: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE, wallHeightFt: 5.51, heightFt: 4 }))).toBe("KNOWN/FAIL");
  });
  it("a raising-grade wall over 6 ft fails on its own", () => {
    const f = wallFinding({ wallRelation: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE, wallHeightFt: 6.5, heightFt: 2 });
    expect(outcome(f)).toBe("KNOWN/FAIL");
    expect(f!.explanationBasis).toContain("exceeds the 6 ft limit for a wall that raises grade");
  });
  it("raising-grade wall on a sloping site without the tallest portion: REQUIRES_VERIFICATION for the combined height", () => {
    const f = wallFinding({ wallRelation: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE, wallHeightFt: 4, heightFt: 4, siteSlopes: true });
    expect(f!.classification).toBe("REQUIRES_VERIFICATION");
  });
  it("on another wall/bulkhead the wall's own status cannot be determined: REQUIRES_VERIFICATION", () => {
    expect(wallFinding({ wallRelation: FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD, wallHeightFt: 3, heightFt: 3 })!.classification).toBe("REQUIRES_VERIFICATION");
  });
  it("set back from a cut wall: >= 3 ft passes (3 inclusive), under fails, and the normal height limits still apply to the fence", () => {
    expect(outcome(wallFinding({ wallRelation: FenceWallRelation.SET_BACK_FROM_CUT_WALL, wallHeightFt: 5, cutWallSetbackFt: 3 }))).toBe("KNOWN/PASS");
    expect(outcome(wallFinding({ wallRelation: FenceWallRelation.SET_BACK_FROM_CUT_WALL, wallHeightFt: 5, cutWallSetbackFt: 2.99 }))).toBe("KNOWN/FAIL");
    expect(outcome(run({ wallRelation: FenceWallRelation.SET_BACK_FROM_CUT_WALL, wallHeightFt: 5, cutWallSetbackFt: 3, heightFt: 6 }).findings[0])).toBe("KNOWN/PASS"); // 6 ft allowed, not capped at 4
  });
  it("no wall finding when no wall is declared, or when every declared location is outside required setbacks (H.5 governs walls in required setbacks)", () => {
    expect(wallFinding({})).toBeUndefined();
    expect(wallFinding({ locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], wallRelation: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE, wallHeightFt: 5, heightFt: 4 })).toBeUndefined();
  });
});

describe("sight distance is retained as an unresolved finding, never asserted as satisfied (SRE-FENCE-1 / PR-5)", () => {
  it.each([[FenceLocation.FRONT_SETBACK], [FenceLocation.STREET_SIDE_SETBACK]])("%s declares -> REQUIRES_VERIFICATION sight-distance finding", (location) => {
    const f = bySubject(run({ locations: [location], heightFt: 3 }).findings, "Sight-distance");
    expect(f?.classification).toBe("REQUIRES_VERIFICATION");
    expect(f?.explanationBasis).toContain("does not evaluate it and makes no statement that it is satisfied");
  });
  it("not emitted for side/rear-only or outside-only fences", () => {
    expect(bySubject(run({ locations: [FenceLocation.OTHER_SIDE_OR_REAR_SETBACK] }).findings, "Sight-distance")).toBeUndefined();
    expect(bySubject(run({ locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS] }).findings, "Sight-distance")).toBeUndefined();
  });
  it("emitted even with no active fence rules (it is a fixed unresolved item, not a rule conclusion)", () => {
    expect(bySubject(run({ locations: [FenceLocation.FRONT_SETBACK] }, []).findings, "Sight-distance")).toBeDefined();
  });
});

describe("outside required setbacks (F4) is scoped, not a compliance claim", () => {
  it("states no fence-specific limit was identified among the provisions evaluated, names the general limit, and disclaims other requirements", () => {
    const f = run({ locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], heightFt: 7 }).findings[0]!;
    expect(f.explanationBasis).toContain("no fence-specific height limit was identified among the provisions evaluated");
    expect(f.explanationBasis).toContain("32 ft");
    expect(f.explanationBasis).toContain("does not mean the fence satisfies every other requirement");
  });
});

describe("building permit (SRC R105.2 item 4 + R105.1)", () => {
  const permit = (over: Partial<FenceProjectDetails> = {}, rules = ALL_RULES, eca: CriticalAreaFinding[] = []) => run(over, rules, eca).permitRequirement;

  it("height <= 8 and no masonry above 6 -> REQUIRES_VERIFICATION turning only on flood-prone status, with the exact note and the exemption disclaimer; NEVER LIKELY_EXEMPT", () => {
    const p = permit({ heightFt: 6 })!;
    expect(p.buildingPermit).toBe("REQUIRES_VERIFICATION");
    expect(p.turnsOnlyOnFloodProneStatus).toBe(true);
    expect(p.note).toBe(
      "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in a flood-prone area, where SDCI requires a construction permit. Permit Preflight cannot determine that conclusively from available mapping; SDCI makes that determination."
    );
    expect(p.exemptionDisclaimer).toContain("does not waive fence-height, setback, or other zoning compliance");
    expect(p.permitPathNote).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain("LIKELY_EXEMPT");
    expect(p.criteria.find((c) => c.criterionId === "FLOOD_PRONE")?.status).toBe("REQUIRES_VERIFICATION");
  });

  it("8 ft exactly is within the exemption (inclusive); 8.01 requires a permit with the attributed SDCI path note", () => {
    expect(permit({ heightFt: 8, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], hasMasonryOrConcreteAbove6Ft: false })!.buildingPermit).toBe("REQUIRES_VERIFICATION");
    const over = permit({ heightFt: 8.01, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], hasMasonryOrConcreteAbove6Ft: false })!;
    expect(over.buildingPermit).toBe("REQUIRED");
    expect(over.permitPathNote).toContain("subject-to-field-inspection");
    expect(over.note).toBeUndefined();
    expect(over.exemptionDisclaimer).toBeUndefined();
  });

  it("a top feature counts toward the 8 ft; sloping tallest portion counts too", () => {
    expect(permit({ heightFt: 6, openFeatureHeightFt: 2 })!.criteria[0]!.status).toBe("MET");
    expect(permit({ heightFt: 7, openFeatureHeightFt: 2, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], hasMasonryOrConcreteAbove6Ft: false })!.buildingPermit).toBe("REQUIRED");
    expect(permit({ siteSlopes: true, heightFt: 6, tallestPortionHeightFt: 8.5 })!.buildingPermit).toBe("REQUIRED");
  });

  it("sloping site without the tallest portion: unresolved, unless the lower bound is already over 8", () => {
    expect(permit({ siteSlopes: true, heightFt: 6 })!.criteria[0]!.status).toBe("REQUIRES_VERIFICATION");
    expect(permit({ siteSlopes: true, heightFt: 8.5, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS] })!.buildingPermit).toBe("REQUIRED");
  });

  it("masonry/concrete tri-state applies only when the fence can exceed 6 ft", () => {
    const base = { heightFt: 7, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS] };
    expect(permit({ ...base, hasMasonryOrConcreteAbove6Ft: true })!.buildingPermit).toBe("REQUIRED");
    expect(permit({ ...base, hasMasonryOrConcreteAbove6Ft: false })!.criteria.find((c) => c.criterionId === "MASONRY_CONCRETE")?.status).toBe("MET");
    const unanswered = permit({ ...base })!;
    expect(unanswered.criteria.find((c) => c.criterionId === "MASONRY_CONCRETE")?.status).toBe("REQUIRES_VERIFICATION");
    expect(unanswered.turnsOnlyOnFloodProneStatus).toBe(false);
    expect(unanswered.note).toBeUndefined();
    // <= 6 ft: no element can be above 6 ft, answered or not; declared "true" is not NOT_MET then.
    expect(permit({ heightFt: 6, hasMasonryOrConcreteAbove6Ft: undefined })!.criteria.find((c) => c.criterionId === "MASONRY_CONCRETE")?.status).toBe("MET");
    expect(permit({ heightFt: 6, hasMasonryOrConcreteAbove6Ft: true })!.buildingPermit).toBe("REQUIRES_VERIFICATION");
  });

  it("a mapped flood-prone intersection is disclosed as context only and never decides the criterion (no REQUIRED from advisory data)", () => {
    const eca: CriticalAreaFinding[] = [{ hazardType: "flood_prone", mappedIntersectionResult: "INTERSECTS", advisoryStatus: "ADVISORY_ONLY", toleranceBasis: "t" }];
    const p = permit({ heightFt: 6 }, ALL_RULES, eca)!;
    expect(p.buildingPermit).toBe("REQUIRES_VERIFICATION");
    const flood = p.criteria.find((c) => c.criterionId === "FLOOD_PRONE")!;
    expect(flood.status).toBe("REQUIRES_VERIFICATION");
    expect(flood.explanationBasis).toContain("context only; not used to decide this criterion");
    expect(flood.explanationBasis).not.toContain("advisory context");
  });

  it("fixed disclosures are always present and never claim anything satisfied", () => {
    const d = permit({ heightFt: 6 })!.disclosures.join(" ");
    expect(d).toContain("Sight-distance");
    expect(d).toContain("not evaluated");
  });
});

describe("outcome-specific gating - a claim exists only if the rules it depends on are ACTIVE", () => {
  it("dependency table only names real rule types", () => {
    const named = new Set(Object.values(FENCE_OUTCOME_DEPENDENCIES).flat());
    for (const t of named) expect(Object.values(FenceRuleType)).toContain(t);
  });

  it("with no fence rules ACTIVE: no height finding, no permit, every claim listed as uncovered", () => {
    const o = run({ locations: [FenceLocation.OTHER_SIDE_OR_REAR_SETBACK, FenceLocation.OUTSIDE_REQUIRED_SETBACKS] }, []);
    expect(o.findings.map((f) => f.subject)).toEqual([ZONING]);
    expect(o.permitRequirement).toBeUndefined();
    expect(o.uncoveredConstraintTypes).toEqual(["fence height (side or rear setback)", "fence height (outside required setbacks)", "fence building permit"]);
  });

  it("only the location's own rule is needed: F1 alone yields the side/rear finding while front stays uncovered", () => {
    const o = run({ locations: [FenceLocation.FRONT_SETBACK, FenceLocation.OTHER_SIDE_OR_REAR_SETBACK] }, [rule(FenceRuleType.HEIGHT_STANDARD)]);
    expect(o.findings.map((f) => f.subject)).toContain("Fence height (side or rear setback)");
    expect(o.findings.map((f) => f.subject)).not.toContain("Fence height (front setback)");
    expect(o.uncoveredConstraintTypes).toContain("fence height (front setback)");
  });

  it("permit REQUIRED needs only the rule for the failing criterion (F5 alone suffices for over-height); the REQUIRES_VERIFICATION result needs F5, F6 AND F8 (the flood-prone condition it states)", () => {
    const onlyHeight = [rule(FenceRuleType.PERMIT_HEIGHT_EXEMPTION)];
    expect(run({ heightFt: 9, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS] }, onlyHeight).permitRequirement?.buildingPermit).toBe("REQUIRED");
    // F5+F6 without F8: the "turns only on flood-prone status" claim cannot be made -> dormant, listed as uncovered.
    const noFlood = run({ heightFt: 6 }, without(FenceRuleType.PERMIT_FLOOD_PRONE_CONDITION));
    expect(noFlood.permitRequirement).toBeUndefined();
    expect(noFlood.uncoveredConstraintTypes).toContain("fence building permit");
    const dormant = run({ heightFt: 6 }, onlyHeight);
    expect(dormant.permitRequirement).toBeUndefined();
    expect(dormant.uncoveredConstraintTypes).toContain("fence building permit");
    const onlyMasonry = [rule(FenceRuleType.PERMIT_MASONRY_CONCRETE)];
    expect(run({ heightFt: 9, hasMasonryOrConcreteAbove6Ft: true, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS] }, onlyMasonry).permitRequirement?.buildingPermit).toBe("REQUIRED");
  });

  it("a fence on a wall needs F3 too: without it the location is uncovered rather than silently using the 6-ft limit", () => {
    const o = run({ wallRelation: FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD, wallHeightFt: 3, heightFt: 5 }, without(FenceRuleType.RETAINING_WALL));
    expect(o.findings.some((f) => f.subject === "Fence height (side or rear setback)")).toBe(false);
    expect(o.uncoveredConstraintTypes).toEqual(expect.arrayContaining(["fence height (side or rear setback)", "fence on a retaining wall or bulkhead"]));
  });

  it("non-ACTIVE rules (TRIAGED/APPROVED/DISABLED) are never consumed, even if present", () => {
    for (const state of ["TRIAGED", "APPROVED", "DISABLED", "TESTED"] as const) {
      const rules = ALL_RULES.map((r) => ({ ...r, lifecycleState: state }));
      const o = run({}, rules);
      expect(o.findings.map((f) => f.subject)).toEqual([ZONING]);
      expect(o.permitRequirement).toBeUndefined();
    }
  });

  it("a malformed specification makes the rule unavailable (fail closed) instead of comparing against NaN/undefined", () => {
    const broken = ALL_RULES.map((r) => ((r.ruleSpecification as { ruleType: string }).ruleType === FenceRuleType.HEIGHT_STANDARD ? rule(FenceRuleType.HEIGHT_STANDARD, {}, { maxFt: "six" }) : r));
    const o = run({}, broken);
    expect(o.findings.map((f) => f.subject)).toEqual([ZONING]);
    expect(o.uncoveredConstraintTypes).toContain("fence height (side or rear setback)");
  });

  it("thresholds come from the rule row, not the evaluator: a hypothetical 7-ft rule changes the result", () => {
    const changed = ALL_RULES.map((r) => ((r.ruleSpecification as { ruleType: string }).ruleType === FenceRuleType.HEIGHT_STANDARD ? rule(FenceRuleType.HEIGHT_STANDARD, {}, { maxFt: 7, openFeatureAllowanceFt: 2, absoluteMaxFt: 9 }) : r));
    expect(outcome(run({ heightFt: 7 }, changed).findings[0])).toBe("KNOWN/PASS");
    expect(outcome(run({ heightFt: 7 }).findings[0])).toBe("KNOWN/FAIL");
  });
});

describe("declared inputs are echoed so the customer sees what the result rests on", () => {
  it("lists height, locations, slope, feature, wall and masonry answers", () => {
    const labels = run({ openFeatureHeightFt: 1, siteSlopes: true, tallestPortionHeightFt: 7, wallRelation: FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD, wallHeightFt: 2 }).declaredInputs;
    const get = (l: string) => labels.find((d) => d.label === l)?.value;
    expect(get("Fence height")).toContain("greatest 6-ft-segment average");
    expect(get("Where the fence is")).toBe("side or rear setback");
    expect(get("Tallest portion")).toBe("7 ft");
    expect(get("Open arbor/trellis on top")).toBe("1 ft");
    expect(get("Retaining wall or bulkhead")).toContain("another retaining wall");
    expect(get("Masonry or concrete above 6 ft")).toBe("Not answered");
  });
});

describe("review fixes (reviewer decision 333344f2-057f-4bab-a9f8-410fa8c1660c)", () => {
  it("outside required setbacks on a sloping site with no tallest portion is REQUIRES_VERIFICATION, never a KNOWN PASS (fail closed)", () => {
    const f = run({ locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], siteSlopes: true, heightFt: 20 }).findings[0]!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("tallest portion");
    // With the tallest portion provided it resolves; a known excess is still a definite FAIL.
    expect(outcome(run({ locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], siteSlopes: true, heightFt: 20, tallestPortionHeightFt: 28 }).findings[0])).toBe("KNOWN/PASS");
    expect(outcome(run({ locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], siteSlopes: true, heightFt: 20, tallestPortionHeightFt: 30, openFeatureHeightFt: 3 }).findings[0])).toBe("KNOWN/FAIL");
  });

  it("the exemption-is-not-compliance disclaimer is a governed claim: emitted only while F7 is ACTIVE", () => {
    expect(run({ heightFt: 6 }).permitRequirement?.exemptionDisclaimer).toBeDefined();
    const noF7 = run({ heightFt: 6 }, without(FenceRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE)).permitRequirement!;
    expect(noF7.exemptionDisclaimer).toBeUndefined();
    expect(noF7.note).toBeDefined(); // the permit result itself does not depend on F7
  });

  it("the flood-prone consideration is a governed claim: listed (and the 'turns only on flood-prone status' note made) only while F8 is ACTIVE; a REQUIRED result needs no F8", () => {
    const withF8 = run({ heightFt: 6 }).permitRequirement!;
    expect(withF8.criteria.some((c) => c.criterionId === "FLOOD_PRONE")).toBe(true);
    const noF8Required = run({ heightFt: 9, locations: [FenceLocation.OUTSIDE_REQUIRED_SETBACKS], hasMasonryOrConcreteAbove6Ft: false }, without(FenceRuleType.PERMIT_FLOOD_PRONE_CONDITION)).permitRequirement!;
    expect(noF8Required.buildingPermit).toBe("REQUIRED");
    expect(noF8Required.criteria.some((c) => c.criterionId === "FLOOD_PRONE")).toBe(false);
    expect(JSON.stringify(noF8Required)).not.toContain("flood-prone");
  });

  it("an unavailable zoning is stated as an unresolved item - with or without any rule ACTIVE", () => {
    for (const rules of [ALL_RULES, []]) {
      const z = bySubject(evaluateFence({ project: fence(), candidateActiveRules: rules, ecaFindings: [], zoningContext: unavailableZoneContext() }).findings, "Zoning applied");
      expect(z?.classification).toBe("REQUIRES_VERIFICATION");
      expect(z?.explanationBasis).toContain("could not apply this property's zoning");
    }
  });
});

describe("zoning applicability (citywide zoning coverage)", () => {
  const runZ = (z: Parameters<typeof evaluateFence>[0]["zoningContext"], over: Partial<FenceProjectDetails> = {}) =>
    evaluateFence({ project: fence(over), candidateActiveRules: ALL_RULES, ecaFindings: [], zoningContext: z });

  it("a verified NR parcel keeps every NR fence finding and states zoning as a KNOWN fact", () => {
    const { findings } = runZ(singleZoneContext("NR"));
    expect(outcome(findings[0])).toBe("KNOWN/PASS");
    expect(bySubject(findings, "Zoning applied")?.classification).toBe("KNOWN");
  });

  it("a zone with no active fence rules withholds the height findings (never a PASS/FAIL), names the zone, keeps the permit determination, and records the uncovered limits", () => {
    const out = runZ(singleZoneContext("NC2P-55 (M1)"), { heightFt: 8.5, locations: [FenceLocation.FRONT_SETBACK], hasMasonryOrConcreteAbove6Ft: false });
    expect(out.findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
    expect(out.findings.some((f) => f.subject.startsWith("Fence height"))).toBe(false);
    const z = bySubject(out.findings, "Zoning applied")!;
    expect(z.explanationBasis).toContain("NC2P-55 (M1)");
    expect(out.permitRequirement?.buildingPermit).toBe("REQUIRED");
    expect(out.uncoveredConstraintTypes).toContain("fence height (front setback)");
  });

  it("an overlay adds a REQUIRES_VERIFICATION overlay finding while NR findings stay", () => {
    const out = runZ(singleZoneContext("NR", { overlays: { shorelineDistrict: true } }));
    expect(bySubject(out.findings, "Overlay districts")?.classification).toBe("REQUIRES_VERIFICATION");
    expect(outcome(out.findings[0])).toBe("KNOWN/PASS");
  });

  it("a split between NR and another zone is ambiguous: the height claim is a verification item, never an NR answer", () => {
    const out = runZ(splitZoneContext([["NR", 0.6], ["NC2-40", 0.4]]));
    expect(out.findings.some((f) => f.complianceOutcome !== undefined && f.subject.startsWith("Fence height"))).toBe(false);
    expect(bySubject(out.findings, "Zoning applied")?.explanationBasis).toContain("more than one zone");
    expect(out.permitRequirement).toBeDefined();
  });

  it("unavailable zoning withholds the zone-specific fence limits and keeps the permit determination", () => {
    const out = runZ(unavailableZoneContext(), { heightFt: 8.5, locations: [FenceLocation.FRONT_SETBACK], hasMasonryOrConcreteAbove6Ft: false });
    expect(out.findings.some((f) => f.subject.startsWith("Fence height"))).toBe(false);
    expect(out.uncoveredConstraintTypes.join()).toContain("could not be applied");
    expect(out.permitRequirement?.buildingPermit).toBe("REQUIRED");
  });
});
