/**
 * Unit 8 (Decks) - deterministic tests for evaluateDeck: exact boundaries (inclusive thresholds),
 * every setback location, the rear-setback allowance (H.8) assessment, lot-coverage threshold,
 * permit determination and review path, outcome-specific gating, malformed specs, and the invariants
 * (never LIKELY_EXEMPT; a tall deck in a setback is never a FAIL; zoning scope always stated).
 */
import { describe, expect, it } from "vitest";
import { DECK_OUTCOME_DEPENDENCIES, evaluateDeck } from "../../src/regulatory-rules-engine/evaluate-deck.js";
import { DeckRuleType } from "../../src/regulatory-rules-engine/deck-types.js";
import type { DeckProjectDetails } from "../../src/regulatory-rules-engine/deck-types.js";
import type { Finding } from "../../src/regulatory-rules-engine/types.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";

const SPECS: Record<string, Record<string, unknown>> = {
  [DeckRuleType.SETBACK_HEIGHT_ALLOWANCE]: { allowedInSetbackMaxIn: 18, rearSetbackAllowance: { minDistanceFromRearLotLineFt: 5, maxHeightFt: 12, minSeparationFromDwellingFt: 3 } },
  [DeckRuleType.LOT_COVERAGE_THRESHOLD]: { notCountedMaxHeightIn: 36 },
  [DeckRuleType.PERMIT_EXEMPTION]: { maxHeightIn: 18 },
  [DeckRuleType.STFI_ELIGIBILITY]: { maxHeightAboveGroundFt: 8, beamLengthDisqualifyingFt: 14, maxAreaSqFt: 750 },
  [DeckRuleType.ECA_CONDITION]: {},
  [DeckRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE]: {},
};
function rule(ruleType: string, over: Partial<RegulatoryRule> = {}, spec: Record<string, unknown> = SPECS[ruleType] ?? {}): RegulatoryRule {
  return {
    id: `rule-${ruleType}`,
    subject: `Deck rule ${ruleType}`,
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: { ruleType, ...spec },
    citation: { smcSections: ["SMC 23.44.090.H.1"] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: [],
    ...over,
  };
}
const ALL = Object.values(DeckRuleType).map((t) => rule(t));
const without = (...types: string[]) => ALL.filter((r) => !types.includes((r.ruleSpecification as { ruleType: string }).ruleType));
const deck = (over: Partial<DeckProjectDetails> = {}): DeckProjectDetails => ({
  projectType: "deck",
  heightAboveGradeIn: 24,
  widthFt: 10,
  depthFt: 10,
  attachment: "DETACHED",
  buildingRelation: "OPEN_GROUND_BELOW",
  setbackLocations: ["SIDE_SETBACK"],
  ...over,
});
const run = (over: Partial<DeckProjectDetails> = {}, rules = ALL) => evaluateDeck({ project: deck(over), candidateActiveRules: rules });
const ZONING = "Zoning applicability (Neighborhood Residential zones)";
const sub = (fs: Finding[], needle: string) => fs.find((f) => f.subject.includes(needle));
const oc = (f: Finding | undefined) => (f ? `${f.classification}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}` : "none");

describe("setback by height (SMC 23.44.090.H.1)", () => {
  it.each([
    ["FRONT_SETBACK", 18, "KNOWN/PASS"],
    ["STREET_SIDE_SETBACK", 18, "KNOWN/PASS"],
    ["SIDE_SETBACK", 18, "KNOWN/PASS"],
    ["REAR_SETBACK", 18, "KNOWN/PASS"],
    ["FRONT_SETBACK", 18.01, "REQUIRES_VERIFICATION"],
    ["STREET_SIDE_SETBACK", 30, "REQUIRES_VERIFICATION"],
    ["SIDE_SETBACK", 30, "REQUIRES_VERIFICATION"],
    ["REAR_SETBACK", 30, "REQUIRES_VERIFICATION"],
    ["OUTSIDE_REQUIRED_SETBACKS", 120, "KNOWN/PASS"],
  ] as const)("%s at %s in -> %s", (location, heightAboveGradeIn, expected) => {
    expect(oc(run({ setbackLocations: [location], heightAboveGradeIn }).findings[0])).toBe(expected);
  });

  it("a tall deck in a setback is NEVER a KNOWN FAIL, whatever the declared facts (other allowances may exist)", () => {
    for (const attachment of ["DETACHED", "ATTACHED_TO_DWELLING"] as const) {
      for (const location of ["FRONT_SETBACK", "STREET_SIDE_SETBACK", "SIDE_SETBACK", "REAR_SETBACK"] as const) {
        const f = run({ setbackLocations: [location], heightAboveGradeIn: 200, attachment, distanceFromRearLotLineFt: location === "REAR_SETBACK" ? 1 : undefined }).findings[0]!;
        expect(f.complianceOutcome).toBeUndefined();
        expect(f.classification).toBe("REQUIRES_VERIFICATION");
      }
    }
  });

  it("front/street/side above 18 in: attributes the prohibition to SDCI, names the porch/step allowance, makes no interpretation of its own, and leaves it to SDCI", () => {
    const f = run({ setbackLocations: ["FRONT_SETBACK"], heightAboveGradeIn: 30 }).findings[0]!;
    expect(f.explanationBasis).toContain("SMC 23.44.090.H.1");
    expect(f.explanationBasis).toContain("SDCI's published guidance says a deck more than 18 inches above the ground cannot be placed within the required setbacks, while the code text lists further allowances");
    expect(f.explanationBasis).toContain("SMC 23.44.090.E.4");
    expect(f.explanationBasis).toContain("Whether this deck qualifies for it, or for any other allowance, is for SDCI to determine");
    // The product never characterizes the deck (e.g. "is not a porch", "appears not allowed").
    expect(f.explanationBasis).not.toMatch(/generally is not|appears not to be allowed/);
  });

  it("each declared location gets its own finding in a stable order, then lot coverage, then the zoning scope", () => {
    const { findings } = run({ setbackLocations: ["OUTSIDE_REQUIRED_SETBACKS", "REAR_SETBACK", "FRONT_SETBACK"], heightAboveGradeIn: 12 });
    expect(findings.map((f) => f.subject)).toEqual(["Deck setback (front setback)", "Deck setback (rear setback)", "Deck setback (outside required setbacks)", "Deck and lot coverage", ZONING]);
  });
});

describe("rear-setback allowance (SMC 23.44.090.H.8) is assessed, never assumed", () => {
  const rear = (over: Partial<DeckProjectDetails>) => run({ setbackLocations: ["REAR_SETBACK"], heightAboveGradeIn: 30, ...over }).findings[0]!;

  it("all conditions declared and met -> 'appears to meet', still REQUIRES_VERIFICATION (SDCI confirms)", () => {
    const f = rear({ attachment: "DETACHED", distanceFromRearLotLineFt: 5, distanceFromDwellingFt: 3 });
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("appears to meet the rear-setback allowance");
    expect(f.explanationBasis).toContain("SDCI confirms");
  });
  it("attached -> cannot be separated from the dwelling", () => {
    expect(rear({ attachment: "ATTACHED_TO_DWELLING", distanceFromRearLotLineFt: 8 }).explanationBasis).toContain("attached to the dwelling");
  });
  it("closer than 5 ft to the rear lot line (4.99) fails that condition and says it does not apply to an alley lot line; 5 ft is inclusive", () => {
    const near = rear({ attachment: "DETACHED", distanceFromRearLotLineFt: 4.99, distanceFromDwellingFt: 6 });
    expect(near.explanationBasis).toContain("does not appear to meet the rear-setback allowance");
    expect(near.explanationBasis).toContain("does not apply to an alley lot line");
    expect(rear({ attachment: "DETACHED", distanceFromRearLotLineFt: 5, distanceFromDwellingFt: 6 }).explanationBasis).toContain("appears to meet");
  });
  it("height over 12 ft fails the allowance (144 in ok, 145 in not); under 3 ft from the dwelling fails", () => {
    expect(rear({ attachment: "DETACHED", heightAboveGradeIn: 144, distanceFromRearLotLineFt: 6, distanceFromDwellingFt: 4 }).explanationBasis).toContain("appears to meet");
    expect(rear({ attachment: "DETACHED", heightAboveGradeIn: 145, distanceFromRearLotLineFt: 6, distanceFromDwellingFt: 4 }).explanationBasis).toContain("above the 12 ft limit");
    expect(rear({ attachment: "DETACHED", distanceFromRearLotLineFt: 6, distanceFromDwellingFt: 2.9 }).explanationBasis).toContain("less than the 3 ft required");
  });
  it("missing distances are unknowns, not assumptions", () => {
    const f = rear({ attachment: "DETACHED" });
    expect(f.explanationBasis).toContain("cannot be confirmed");
    expect(f.explanationBasis).toContain("distance from the dwelling");
    expect(f.explanationBasis).toContain("distance from the rear lot line");
  });
});

describe("lot coverage threshold (SMC 23.44.080.C.3)", () => {
  it("36 in inclusive is KNOWN (not counted); 36.01 is REQUIRES_VERIFICATION and never claims a figure", () => {
    expect(oc(sub(run({ heightAboveGradeIn: 36 }).findings, "lot coverage"))).toBe("KNOWN");
    const over = sub(run({ heightAboveGradeIn: 36.01 }).findings, "lot coverage")!;
    expect(over.classification).toBe("REQUIRES_VERIFICATION");
    expect(over.explanationBasis).toContain("does not estimate lot coverage for decks");
    // Part-specific: only the part of a deck above 36 in counts, and only the greatest height is known.
    expect(over.explanationBasis).toContain("any part of a deck above 36 in counts toward lot coverage");
    expect(over.explanationBasis).toContain("at least part of this deck counts; how much depends on how much of it is above 36 in");
    expect(over.explanationBasis).not.toMatch(/\d+%/);
  });
});

describe("building permit (SRC R105.1 / R105.2 item 7)", () => {
  const permit = (over: Partial<DeckProjectDetails> = {}, rules = ALL) => run(over, rules).permitRequirement;

  it("<= 18 in over open ground: REQUIRES_VERIFICATION turning only on ECA status, exact note + disclaimer; NEVER LIKELY_EXEMPT", () => {
    const p = permit({ heightAboveGradeIn: 18 })!;
    expect(p.buildingPermit).toBe("REQUIRES_VERIFICATION");
    expect(p.turnsOnlyOnEcaStatus).toBe(true);
    expect(p.note).toBe(
      "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in or near an environmentally critical area (ECA): SDCI requires a permit for a deck in an ECA and a pre-application site visit for one in or near an ECA. Permit Preflight cannot determine that conclusively from available mapping; SDCI makes that determination."
    );
    expect(p.exemptionDisclaimer).toContain("does not waive setback, lot-coverage, or other zoning compliance");
    expect(p.reviewPath).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain("LIKELY_EXEMPT");
  });
  it("19 in requires a permit; a low deck over a basement/story, and a roof deck, require a permit", () => {
    expect(permit({ heightAboveGradeIn: 18.01 })!.buildingPermit).toBe("REQUIRED");
    expect(permit({ heightAboveGradeIn: 6, buildingRelation: "OVER_BASEMENT_OR_STORY_BELOW", attachment: "ATTACHED_TO_DWELLING" })!.criteria.find((c) => c.criterionId === "STRUCTURE_BELOW")?.status).toBe("NOT_MET");
    const roof = permit({ heightAboveGradeIn: 6, buildingRelation: "ROOF_DECK", attachment: "ATTACHED_TO_DWELLING" })!;
    expect(roof.buildingPermit).toBe("REQUIRED");
    expect(roof.reviewPath).toBe("FULL_REVIEW_LIKELY");
  });
  it("a REQUIRED result has no ECA-only note or disclaimer", () => {
    const p = permit({ heightAboveGradeIn: 30 })!;
    expect(p.note).toBeUndefined();
    expect(p.exemptionDisclaimer).toBeUndefined();
  });

  describe("review path (SDCI STFI criteria)", () => {
    const path = (over: Partial<DeckProjectDetails>) => permit({ heightAboveGradeIn: 30, solidFlooring: false, longestBeamFt: 10, widthFt: 10, depthFt: 10, ...over })!.reviewPath;
    const reasons = (over: Partial<DeckProjectDetails>) => permit({ heightAboveGradeIn: 30, solidFlooring: false, longestBeamFt: 10, widthFt: 10, depthFt: 10, ...over })!.reviewPathReasons!.join(" ");
    it("every screened criterion met: the path is NEVER STFI-likely (ECA is a full-review trigger and is undeterminable) - it stays REQUIRES_VERIFICATION and says why", () => {
      expect(path({})).toBe("REQUIRES_VERIFICATION");
      expect(reasons({})).toContain("whether the site is in an environmentally critical area, where SDCI requires a full review");
      expect(JSON.stringify(permit({ heightAboveGradeIn: 30, solidFlooring: false, longestBeamFt: 10 }))).not.toContain("STFI_LIKELY");
    });
    it("height: 8 ft (96 in) inclusive is not a trigger, over it full review", () => {
      expect(reasons({ heightAboveGradeIn: 96 })).not.toContain("more than 8 ft above the ground");
      expect(path({ heightAboveGradeIn: 96 })).toBe("REQUIRES_VERIFICATION");
      expect(path({ heightAboveGradeIn: 96.01 })).toBe("FULL_REVIEW_LIKELY");
    });
    it("beams: 13.99 ft is not a trigger, 14 ft or longer full review, unanswered unresolved", () => {
      expect(reasons({ longestBeamFt: 13.99 })).not.toContain("beam");
      expect(path({ longestBeamFt: 14 })).toBe("FULL_REVIEW_LIKELY");
      expect(reasons({ longestBeamFt: undefined })).toContain("whether any beam is 14 ft or longer");
    });
    it("area: 750 sq ft inclusive is not a trigger, 751 full review", () => {
      expect(path({ widthFt: 25, depthFt: 30 })).toBe("REQUIRES_VERIFICATION");
      expect(path({ widthFt: 25, depthFt: 30.04 })).toBe("FULL_REVIEW_LIKELY");
    });
    it("solid flooring full review; unanswered unresolved", () => {
      expect(path({ solidFlooring: true })).toBe("FULL_REVIEW_LIKELY");
      expect(path({ solidFlooring: undefined })).toBe("REQUIRES_VERIFICATION");
    });
    it("a known disqualifier outranks an unanswered question", () => {
      expect(path({ heightAboveGradeIn: 120, longestBeamFt: undefined, solidFlooring: undefined })).toBe("FULL_REVIEW_LIKELY");
    });
    it("reasons are plain-language and each names what drives the path", () => {
      const p = permit({ heightAboveGradeIn: 120, solidFlooring: true, longestBeamFt: 15 })!;
      expect(p.reviewPathReasons).toEqual([
        "A full review is likely because the deck is more than 8 ft above the ground.",
        "A full review is likely because it has a beam 14 ft or longer.",
        "A full review is likely because the flooring is solid (no gaps between boards).",
      ]);
    });
  });
});

describe("outcome-specific gating", () => {
  it("dependency table names only real rule types", () => {
    for (const t of Object.values(DECK_OUTCOME_DEPENDENCIES).flat()) expect(Object.values(DeckRuleType)).toContain(t);
  });
  it("no rules ACTIVE: only the zoning scope finding, no permit, every claim uncovered", () => {
    const o = run({ setbackLocations: ["SIDE_SETBACK", "OUTSIDE_REQUIRED_SETBACKS"] }, []);
    expect(o.findings.map((f) => f.subject)).toEqual([ZONING]);
    expect(o.permitRequirement).toBeUndefined();
    expect(o.uncoveredConstraintTypes).toEqual(["deck setback (side setback)", "deck setback (outside required setbacks)", "deck lot coverage", "deck building permit"]);
  });
  it("permit REQUIRED needs only D3; the REQUIRES_VERIFICATION result needs D3 AND D5; the review path needs D4", () => {
    const onlyD3 = [rule(DeckRuleType.PERMIT_EXEMPTION)];
    const required = run({ heightAboveGradeIn: 30 }, onlyD3).permitRequirement!;
    expect(required.buildingPermit).toBe("REQUIRED");
    expect(required.reviewPath).toBeUndefined(); // D4 not active
    expect(required.criteria.some((c) => c.criterionId === "ECA")).toBe(false); // D5 not active
    const dormant = run({ heightAboveGradeIn: 12 }, onlyD3);
    expect(dormant.permitRequirement).toBeUndefined();
    expect(dormant.uncoveredConstraintTypes).toContain("deck building permit");
    expect(run({ heightAboveGradeIn: 12 }, without(DeckRuleType.ECA_CONDITION)).permitRequirement).toBeUndefined();
  });
  it("the exemption disclaimer is a governed claim (D6)", () => {
    expect(run({ heightAboveGradeIn: 12 }).permitRequirement?.exemptionDisclaimer).toBeDefined();
    const noD6 = run({ heightAboveGradeIn: 12 }, without(DeckRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE)).permitRequirement!;
    expect(noD6.exemptionDisclaimer).toBeUndefined();
    expect(noD6.note).toBeDefined();
  });
  it("non-ACTIVE rules are never consumed", () => {
    for (const state of ["TRIAGED", "APPROVED", "DISABLED", "TESTED"] as const) {
      const o = run({}, ALL.map((r) => ({ ...r, lifecycleState: state })));
      expect(o.findings.map((f) => f.subject)).toEqual([ZONING]);
      expect(o.permitRequirement).toBeUndefined();
    }
  });
  it("a malformed specification makes the rule unavailable (fail closed)", () => {
    const broken = ALL.map((r) => ((r.ruleSpecification as { ruleType: string }).ruleType === DeckRuleType.SETBACK_HEIGHT_ALLOWANCE ? rule(DeckRuleType.SETBACK_HEIGHT_ALLOWANCE, {}, { allowedInSetbackMaxIn: 18 }) : r));
    const o = run({}, broken);
    expect(o.findings.some((f) => f.subject.startsWith("Deck setback"))).toBe(false);
    expect(o.uncoveredConstraintTypes).toContain("deck setback (side setback)");
  });
  it("thresholds come from the rule row: a hypothetical 24-in allowance changes the result", () => {
    const changed = ALL.map((r) => ((r.ruleSpecification as { ruleType: string }).ruleType === DeckRuleType.SETBACK_HEIGHT_ALLOWANCE ? rule(DeckRuleType.SETBACK_HEIGHT_ALLOWANCE, {}, { ...SPECS[DeckRuleType.SETBACK_HEIGHT_ALLOWANCE], allowedInSetbackMaxIn: 24 }) : r));
    expect(oc(run({ heightAboveGradeIn: 24 }, changed).findings[0])).toBe("KNOWN/PASS");
    expect(oc(run({ heightAboveGradeIn: 24 }).findings[0])).toBe("REQUIRES_VERIFICATION");
  });
});

describe("every deck report states, as an unresolved item, that zoning was not verified", () => {
  it.each([[ALL], [[]]])("with or without rules", (rules) => {
    const z = sub(run({}, rules as RegulatoryRule[]).findings, "Zoning applicability");
    expect(z?.classification).toBe("REQUIRES_VERIFICATION");
    expect(z?.explanationBasis).toContain("did not verify this parcel's zoning");
  });
});

describe("declared inputs are echoed", () => {
  it("lists height, size, attachment, what is below, location, flooring, beam and conditional distances", () => {
    const rows = run({ setbackLocations: ["REAR_SETBACK"], distanceFromRearLotLineFt: 6, distanceFromDwellingFt: 4, solidFlooring: false, longestBeamFt: 12 }).declaredInputs;
    const get = (l: string) => rows.find((r) => r.label === l)?.value;
    expect(get("Height above ground")).toBe("24 in");
    expect(get("Size")).toBe("10 ft x 10 ft (100 sq ft)");
    expect(get("Attached to the house")).toBe("No (detached)");
    expect(get("Where the deck is")).toBe("rear setback");
    expect(get("Solid flooring (no gaps)")).toBe("No (gaps between boards)");
    expect(get("Longest beam")).toBe("12 ft");
    expect(get("Distance from the rear lot line")).toBe("6 ft");
    expect(get("Distance from the dwelling")).toBe("4 ft");
    expect(run({}).declaredInputs.find((r) => r.label === "Longest beam")?.value).toBe("Not answered");
  });
});
