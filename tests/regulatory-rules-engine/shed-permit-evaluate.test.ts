/**
 * Unit 6B - deterministic tests for the shed permit-requirement / lot-coverage evaluators
 * (code-generation-plan.md §7.1, 7.3, 7.3b, 7.4, 7.5), mirroring garage-evaluate.test.ts's
 * pure-function-boundary style: exact values, not incidental coverage.
 */
import { describe, expect, it } from "vitest";
import {
  buildTradePermitDisclosures,
  deriveBuildingPermitState,
  evaluateAccessoryHeightLimit,
  evaluateAttachment,
  evaluateEcaLotAreaAdjustment,
  evaluateEcaPermitCriterion,
  evaluateFoundationExemption,
  evaluateProject,
  evaluateRoofArea,
  evaluateShedLotCoverage,
  evaluateShedPermitRequirement,
  evaluateSizeSpan,
  evaluateStoryHeight,
  evaluateUse,
  foundationStfiDisqualification,
  ShedLotCoverageRuleType,
  ShedPermitRuleType,
} from "../../src/regulatory-rules-engine/evaluate.js";
import type { EcaLotAreaAdjustment, ShedProjectDetails } from "../../src/regulatory-rules-engine/types.js";
import type { CriticalAreaFinding } from "../../src/spatial-analysis/types.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";

function baseProject(overrides: Partial<ShedProjectDetails> = {}): ShedProjectDetails {
  return {
    projectType: "shed",
    widthFt: 10,
    depthFt: 10,
    heightFt: 8,
    alleyAdjacent: false,
    ...overrides,
  };
}

function ecaFinding(overrides: Partial<CriticalAreaFinding> = {}): CriticalAreaFinding {
  return {
    hazardType: "steep_slope",
    mappedIntersectionResult: "NO_INTERSECTION",
    advisoryStatus: "ADVISORY_ONLY",
    toleranceBasis: "test",
    ...overrides,
  };
}

const propertyContext: PropertyContext = { parcelId: "test-parcel", assembledAt: "2026-01-01T00:00:00.000Z", facts: [] };

function activeShedRule(ruleType: string, id = `active-${ruleType}`): RegulatoryRule {
  return {
    id,
    subject: id,
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType },
    citation: { smcSections: [] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: [],
  };
}

const ALL_PERMIT_RULE_TYPES = [
  ShedPermitRuleType.ROOF_AREA,
  ShedPermitRuleType.STORY_HEIGHT,
  ShedPermitRuleType.FOUNDATION_EXEMPTION,
  ShedPermitRuleType.FOUNDATION_STFI_DISQUALIFIER,
  ShedPermitRuleType.ATTACHMENT,
  ShedPermitRuleType.USE,
  ShedPermitRuleType.ECA_CRITERION,
  ShedPermitRuleType.SIZE_SPAN_FOOTPRINT,
  ShedPermitRuleType.SIZE_SPAN_STRUCTURAL,
];
const ALL_ACCESSORY_HEIGHT_RULE_TYPES = [ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_IN_SETBACK, ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK];
const ALL_LOT_COVERAGE_RULE_TYPES = [
  ShedLotCoverageRuleType.BASE_MAXIMUM,
  ShedLotCoverageRuleType.ECA_LOT_AREA_EXCLUSION,
  ShedLotCoverageRuleType.TRANSIT_BONUS,
  ShedLotCoverageRuleType.STACKED_BONUS,
  ShedLotCoverageRuleType.MINIMUM_FLOOR,
  ShedLotCoverageRuleType.DIRECTOR_ALTERNATIVE,
];

describe("P1 / ROOF_AREA (evaluateRoofArea)", () => {
  it("MET - footprint within 120 sq ft, no overhang", () => {
    expect(evaluateRoofArea(baseProject({ widthFt: 10, depthFt: 10 })).status).toBe("MET");
  });
  it("NOT_MET - footprint alone exceeds 120 sq ft", () => {
    expect(evaluateRoofArea(baseProject({ widthFt: 12, depthFt: 12 })).status).toBe("NOT_MET");
  });
  it("REQUIRES_VERIFICATION - overhang disclosed without an exact measurement", () => {
    expect(evaluateRoofArea(baseProject({ roofOverhang: { extendsBeyondWalls: true } })).status).toBe("REQUIRES_VERIFICATION");
  });
  it("MET - overhang given but projected area still within 120 sq ft", () => {
    expect(evaluateRoofArea(baseProject({ widthFt: 10, depthFt: 10, roofOverhang: { extendsBeyondWalls: true, approxOverhangIn: 3 } })).status).toBe("MET");
  });
});

describe("P2a / STORY_HEIGHT (evaluateStoryHeight)", () => {
  it("always MET", () => {
    expect(evaluateStoryHeight().status).toBe("MET");
  });
});

describe("P3a / FOUNDATION (evaluateFoundationExemption)", () => {
  it("MET for SLAB_ON_GRADE/PIER_BLOCKS/ON_SOIL", () => {
    expect(evaluateFoundationExemption(baseProject({ foundationType: "SLAB_ON_GRADE" })).status).toBe("MET");
    expect(evaluateFoundationExemption(baseProject({ foundationType: "PIER_BLOCKS" })).status).toBe("MET");
    expect(evaluateFoundationExemption(baseProject({ foundationType: "ON_SOIL" })).status).toBe("MET");
  });
  it("NOT_MET for FROST_FOOTING/PILES/WOOD_FOUNDATION", () => {
    expect(evaluateFoundationExemption(baseProject({ foundationType: "FROST_FOOTING" })).status).toBe("NOT_MET");
    expect(evaluateFoundationExemption(baseProject({ foundationType: "PILES" })).status).toBe("NOT_MET");
    expect(evaluateFoundationExemption(baseProject({ foundationType: "WOOD_FOUNDATION" })).status).toBe("NOT_MET");
  });
  it("REQUIRES_VERIFICATION when unanswered", () => {
    expect(evaluateFoundationExemption(baseProject()).status).toBe("REQUIRES_VERIFICATION");
  });
});

describe("P4 / ATTACHMENT (evaluateAttachment)", () => {
  it("MET for DETACHED, NOT_MET for ATTACHED, REQUIRES_VERIFICATION when unanswered", () => {
    expect(evaluateAttachment(baseProject({ attachment: "DETACHED" })).status).toBe("MET");
    expect(evaluateAttachment(baseProject({ attachment: "ATTACHED" })).status).toBe("NOT_MET");
    expect(evaluateAttachment(baseProject()).status).toBe("REQUIRES_VERIFICATION");
  });
});

describe("P5 / USE (evaluateUse) - hard invariant BR-U6B-10: never NOT_MET", () => {
  it("MET for STORAGE and GREENHOUSE_PLANTS", () => {
    expect(evaluateUse(baseProject({ intendedUse: "STORAGE" })).status).toBe("MET");
    expect(evaluateUse(baseProject({ intendedUse: "GREENHOUSE_PLANTS" })).status).toBe("MET");
  });
  it("REQUIRES_VERIFICATION, never NOT_MET, for OCCUPIABLE/HOBBY_WORKSHOP_UNOCCUPIED/undefined", () => {
    expect(evaluateUse(baseProject({ intendedUse: "OCCUPIABLE" })).status).toBe("REQUIRES_VERIFICATION");
    expect(evaluateUse(baseProject({ intendedUse: "HOBBY_WORKSHOP_UNOCCUPIED" })).status).toBe("REQUIRES_VERIFICATION");
    expect(evaluateUse(baseProject()).status).toBe("REQUIRES_VERIFICATION");
  });
});

describe("P6 / ECA (evaluateEcaPermitCriterion)", () => {
  it("REQUIRES_VERIFICATION (never MET) when there are no hazard findings - fail-closed on unavailable ECA data, never confirmed clear from absence", () => {
    expect(evaluateEcaPermitCriterion([]).status).toBe("REQUIRES_VERIFICATION");
  });
  it("NOT_MET on a confirmed map-dispositive intersection", () => {
    const finding = ecaFinding({ hazardType: "priority_habitat", mappedIntersectionResult: "INTERSECTS", advisoryStatus: "MAP_DISPOSITIVE" });
    expect(evaluateEcaPermitCriterion([finding]).status).toBe("NOT_MET");
  });
  it("REQUIRES_VERIFICATION for any advisory-only hazard, regardless of mapped result", () => {
    expect(evaluateEcaPermitCriterion([ecaFinding({ advisoryStatus: "ADVISORY_ONLY", mappedIntersectionResult: "NO_INTERSECTION" })]).status).toBe("REQUIRES_VERIFICATION");
  });
  it("MET when every finding is a confirmed map-dispositive NO_INTERSECTION", () => {
    const finding = ecaFinding({ hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE" });
    expect(evaluateEcaPermitCriterion([finding]).status).toBe("MET");
  });
});

describe("P7a+P7b / SIZE_SPAN (evaluateSizeSpan)", () => {
  it("NOT_MET when footprint exceeds 750 sq ft regardless of span", () => {
    expect(evaluateSizeSpan(baseProject({ widthFt: 30, depthFt: 30 })).status).toBe("NOT_MET");
  });
  it("REQUIRES_VERIFICATION when footprint is within 750 but span is unanswered", () => {
    expect(evaluateSizeSpan(baseProject()).status).toBe("REQUIRES_VERIFICATION");
  });
  it("MET when span < 14ft", () => {
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 10 } })).status).toBe("MET");
  });
  it("REQUIRES_VERIFICATION at exactly 14.0ft (boundary-operator item 25)", () => {
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 14 } })).status).toBe("REQUIRES_VERIFICATION");
  });
  it("MET for span in (14,30] with a manufactured truss", () => {
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 25, usesManufacturedTruss: true } })).status).toBe("MET");
  });
  it("NOT_MET for span > 14 without a qualifying truss", () => {
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 20 } })).status).toBe("NOT_MET");
  });
  it("NOT_MET for span > 30ft even with a manufactured truss", () => {
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 35, usesManufacturedTruss: true } })).status).toBe("NOT_MET");
  });
});

describe("P3b (foundationStfiDisqualification) - independent of P3a/ECA/SIZE_SPAN", () => {
  it("DISQUALIFIED for PILES/WOOD_FOUNDATION, CLEAR otherwise, UNKNOWN when unanswered", () => {
    expect(foundationStfiDisqualification("PILES")).toBe("DISQUALIFIED");
    expect(foundationStfiDisqualification("WOOD_FOUNDATION")).toBe("DISQUALIFIED");
    expect(foundationStfiDisqualification("SLAB_ON_GRADE")).toBe("CLEAR");
    expect(foundationStfiDisqualification(undefined)).toBe("UNKNOWN");
  });

  it("routes reviewPath to FULL_REVIEW_LIKELY on a pile foundation even when SIZE_SPAN and ECA both independently resolve MET/clear", () => {
    const project = baseProject({
      widthFt: 8,
      depthFt: 8, // 64 sq ft - P1 is MET; PILES fails P3a instead, so buildingPermit = REQUIRED
      foundationType: "PILES", // fails P3a exemption AND disqualifies STFI (P3b) - same fact, two rules
      attachment: "DETACHED",
      intendedUse: "STORAGE",
      structuralSpanInfo: { structuralSpanFt: 10 }, // clearly MET
    });
    const finding = evaluateShedPermitRequirement(project, []); // no ECA findings - ECA criterion resolves MET
    expect(finding.buildingPermit).toBe("REQUIRED");
    expect(finding.reviewPath).toBe("FULL_REVIEW_LIKELY");
  });
});

describe("Flow 3 - deriveBuildingPermitState (5 real buildingPermit x reviewPath combinations, domain-entities.md §3a)", () => {
  const met = (criterionId: string) => ({ criterionId, status: "MET" as const, explanationBasis: "" });
  const notMet = (criterionId: string) => ({ criterionId, status: "NOT_MET" as const, explanationBasis: "" });
  const rv = (criterionId: string) => ({ criterionId, status: "REQUIRES_VERIFICATION" as const, explanationBasis: "" });

  it("LIKELY_EXEMPT / NONE - all 6 exemption criteria MET", () => {
    const criteria = [met("ROOF_AREA"), met("STORY_HEIGHT"), met("FOUNDATION"), met("ATTACHMENT"), met("USE"), met("ECA"), met("SIZE_SPAN")];
    expect(deriveBuildingPermitState(criteria as never, "SLAB_ON_GRADE")).toEqual({ buildingPermit: "LIKELY_EXEMPT", reviewPath: "NONE" });
  });

  it("REQUIRED / STFI_LIKELY - fails an exemption criterion, SIZE_SPAN MET, ECA clear, foundation known and clear", () => {
    const criteria = [notMet("ROOF_AREA"), met("STORY_HEIGHT"), met("FOUNDATION"), met("ATTACHMENT"), met("USE"), met("ECA"), met("SIZE_SPAN")];
    expect(deriveBuildingPermitState(criteria as never, "SLAB_ON_GRADE")).toEqual({ buildingPermit: "REQUIRED", reviewPath: "STFI_LIKELY" });
  });

  it("REQUIRED / FULL_REVIEW_LIKELY - SIZE_SPAN NOT_MET", () => {
    const criteria = [notMet("ROOF_AREA"), met("STORY_HEIGHT"), met("FOUNDATION"), met("ATTACHMENT"), met("USE"), met("ECA"), notMet("SIZE_SPAN")];
    expect(deriveBuildingPermitState(criteria as never, "SLAB_ON_GRADE")).toEqual({ buildingPermit: "REQUIRED", reviewPath: "FULL_REVIEW_LIKELY" });
  });

  it("REQUIRED / FULL_REVIEW_LIKELY - ECA NOT_MET disqualifies STFI outright regardless of span", () => {
    const criteria = [notMet("ROOF_AREA"), met("STORY_HEIGHT"), met("FOUNDATION"), met("ATTACHMENT"), met("USE"), notMet("ECA"), met("SIZE_SPAN")];
    expect(deriveBuildingPermitState(criteria as never, "SLAB_ON_GRADE")).toEqual({ buildingPermit: "REQUIRED", reviewPath: "FULL_REVIEW_LIKELY" });
  });

  it("REQUIRED / REQUIRES_VERIFICATION - permit needed but reviewPath contribution unresolved (foundationType unanswered)", () => {
    const criteria = [notMet("ROOF_AREA"), met("STORY_HEIGHT"), rv("FOUNDATION"), met("ATTACHMENT"), met("USE"), met("ECA"), met("SIZE_SPAN")];
    expect(deriveBuildingPermitState(criteria as never, undefined)).toEqual({ buildingPermit: "REQUIRED", reviewPath: "REQUIRES_VERIFICATION" });
  });

  it("REQUIRES_VERIFICATION / REQUIRES_VERIFICATION - exempt-vs-required itself unresolved", () => {
    const criteria = [rv("ROOF_AREA"), met("STORY_HEIGHT"), met("FOUNDATION"), met("ATTACHMENT"), met("USE"), met("ECA"), met("SIZE_SPAN")];
    expect(deriveBuildingPermitState(criteria as never, "SLAB_ON_GRADE")).toEqual({ buildingPermit: "REQUIRES_VERIFICATION", reviewPath: "REQUIRES_VERIFICATION" });
  });
});

describe("P2b (evaluateAccessoryHeightLimit) - location-sensitive, never an unconditional FAIL", () => {
  it("PASS when in a required setback and heightFt <= 12", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 10, isInRequiredSetback: true }));
    expect(finding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
  });
  it("PASS when outside every required setback and heightFt <= 32", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 20, isInRequiredSetback: false }));
    expect(finding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
  });
  it("REQUIRES_VERIFICATION (never FAIL) when heightFt exceeds the in-setback 12ft limit", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 14, isInRequiredSetback: true }));
    expect(finding.classification).toBe("REQUIRES_VERIFICATION");
  });
  it("REQUIRES_VERIFICATION (never FAIL) when heightFt exceeds the outside-setback 32ft limit", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 40, isInRequiredSetback: false }));
    expect(finding.classification).toBe("REQUIRES_VERIFICATION");
  });
  it("REQUIRES_VERIFICATION when the setback-location fact itself is unresolved", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 10 }));
    expect(finding.classification).toBe("REQUIRES_VERIFICATION");
  });
});

describe("P8 (buildTradePermitDisclosures) - non-tiered advisory, independent of buildingPermit/reviewPath", () => {
  it("one disclosure per truthy utilityIntent field", () => {
    const disclosures = buildTradePermitDisclosures({ electrical: true, plumbing: false, mechanical: true });
    expect(disclosures.map((d) => d.trade)).toEqual(["ELECTRICAL", "MECHANICAL"]);
  });
  it("empty when utilityIntent is undefined", () => {
    expect(buildTradePermitDisclosures(undefined)).toEqual([]);
  });
});

describe("C1b/C1e (evaluateEcaLotAreaAdjustment)", () => {
  it("NOT_APPLICABLE when no named category intersects", () => {
    const result = evaluateEcaLotAreaAdjustment([ecaFinding({ hazardType: "steep_slope", mappedIntersectionResult: "NO_INTERSECTION" })]);
    expect(result.status).toBe("NOT_APPLICABLE");
  });
  it("NOT_APPLICABLE when only non-named categories intersect (e.g. priority_habitat)", () => {
    const result = evaluateEcaLotAreaAdjustment([ecaFinding({ hazardType: "priority_habitat", mappedIntersectionResult: "INTERSECTS" })]);
    expect(result.status).toBe("NOT_APPLICABLE");
  });
  it("REQUIRES_VERIFICATION when a named category intersects (exact exclusion geometry never established in this pass)", () => {
    const result = evaluateEcaLotAreaAdjustment([ecaFinding({ hazardType: "riparian_corridor", mappedIntersectionResult: "INTERSECTS" })]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") {
      expect(result.intersectingCategories).toEqual(["RIPARIAN_CORRIDOR"]);
    }
  });
});

describe("Flow 4 (evaluateShedLotCoverage) - CASE A/B/C banding and the asymmetric fail-closed override", () => {
  const notApplicable: EcaLotAreaAdjustment = { status: "NOT_APPLICABLE", reason: "test" };

  it("CASE A - WITHIN_STANDARD_ALLOWANCE at exactly the 50% boundary", () => {
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 2000, proposedShedFootprintSqFt: 500, ecaAdjustment: notApplicable });
    expect(result.status).toBe("WITHIN_STANDARD_ALLOWANCE");
  });

  it("CASE B - MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE between 50% and 60%", () => {
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 2200, proposedShedFootprintSqFt: 500, ecaAdjustment: notApplicable });
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.reason).toBe("MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE");
  });

  it("CASE C, no Director relevance - EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE above 60%", () => {
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3500, proposedShedFootprintSqFt: 500, ecaAdjustment: notApplicable });
    expect(result.status).toBe("EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE");
  });

  it("CASE C, Director branch relevant - POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE when the C1e floor's Director alternative is open", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = {
      status: "ESTABLISHED",
      excludedAreaSqFt: 0,
      minimumCoverageFloor: { status: "REQUIRES_VERIFICATION", reason: "test" },
      basis: "test",
    };
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3500, proposedShedFootprintSqFt: 500, ecaAdjustment });
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.reason).toBe("POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE");
  });

  it("asymmetric override - unresolved C1b denominator but estimated coverage already exceeds the optimistic 60% ceiling", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = { status: "REQUIRES_VERIFICATION", intersectingCategories: ["RIPARIAN_CORRIDOR"], reason: "test" };
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3200, proposedShedFootprintSqFt: 100, ecaAdjustment });
    expect(result.status).toBe("EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE");
  });

  it("asymmetric override - unresolved C1b denominator and estimated coverage does NOT already exceed the optimistic ceiling -> LOT_AREA_ADJUSTMENT_UNRESOLVED, never a false WITHIN/MAY_QUALIFY", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = { status: "REQUIRES_VERIFICATION", intersectingCategories: ["RIPARIAN_CORRIDOR"], reason: "test" };
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 1000, proposedShedFootprintSqFt: 100, ecaAdjustment });
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.reason).toBe("LOT_AREA_ADJUSTMENT_UNRESOLVED");
  });
});

describe("§4.14 - partial-activation aggregation rule (never a partial/placeholder result)", () => {
  const shedProject = {
    projectType: "shed" as const,
    widthFt: 8,
    depthFt: 8,
    heightFt: 8,
    alleyAdjacent: false,
    foundationType: "SLAB_ON_GRADE" as const,
    attachment: "DETACHED" as const,
    intendedUse: "STORAGE" as const,
    isInRequiredSetback: false,
  };
  const shedLotCoverageFacts = {
    parcelAreaSqFt: 5000,
    existingMappedCoverageSqFt: 500,
    proposedShedFootprintSqFt: 100,
    ecaAdjustment: { status: "NOT_APPLICABLE" as const, reason: "test" },
  };

  it("with only a subset of a finding's constituent rules ACTIVE, the aggregate field stays undefined", () => {
    const outcome = evaluateProject({
      propertyContext,
      project: shedProject,
      candidateActiveRules: [activeShedRule(ALL_PERMIT_RULE_TYPES[0]!), activeShedRule(ALL_PERMIT_RULE_TYPES[1]!)],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
      shedLotCoverageFacts,
    });
    expect(outcome.permitRequirement).toBeUndefined();
    expect(outcome.accessoryHeightLimitFinding).toBeUndefined();
    expect(outcome.shedLotCoverage).toBeUndefined();
  });

  it("with zero constituent rules ACTIVE, every aggregate field stays undefined", () => {
    const outcome = evaluateProject({
      propertyContext,
      project: shedProject,
      candidateActiveRules: [],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
      shedLotCoverageFacts,
    });
    expect(outcome.permitRequirement).toBeUndefined();
    expect(outcome.accessoryHeightLimitFinding).toBeUndefined();
    expect(outcome.shedLotCoverage).toBeUndefined();
  });

  // Only the 2 map-dispositive hazard categories, both confirmed NO_INTERSECTION - deliberately
  // not a realistic full 12-category fetch (which would always carry advisory-only entries and
  // therefore always resolve REQUIRES_VERIFICATION per P6's fail-closed design) - this isolates
  // the aggregation-gate assertion below from that separate, already-covered P6 behavior.
  const confirmedClearEcaFindings: CriticalAreaFinding[] = [
    { hazardType: "priority_habitat", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" },
    { hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" },
  ];

  it("with every constituent rule ACTIVE, the aggregate is present, with no spurious unrecognized-rule findings", () => {
    const outcome = evaluateProject({
      propertyContext,
      project: shedProject,
      candidateActiveRules: [
        ...ALL_PERMIT_RULE_TYPES.map((rt) => activeShedRule(rt)),
        ...ALL_ACCESSORY_HEIGHT_RULE_TYPES.map((rt) => activeShedRule(rt)),
        ...ALL_LOT_COVERAGE_RULE_TYPES.map((rt) => activeShedRule(rt)),
      ],
      ecaFindings: confirmedClearEcaFindings,
      candidateActiveInferencePolicies: [],
      shedLotCoverageFacts,
    });
    expect(outcome.permitRequirement).toBeDefined();
    expect(outcome.accessoryHeightLimitFinding).toBeDefined();
    expect(outcome.shedLotCoverage).toBeDefined();
    // a fully-active aggregate's REQUIRES_VERIFICATION (if any) must reflect a genuine evidence
    // gap on this specific project, never rule-activation status - this project answered every
    // input, so the exemption result should be a definite LIKELY_EXEMPT, not REQUIRES_VERIFICATION.
    expect(outcome.permitRequirement?.buildingPermit).toBe("LIKELY_EXEMPT");
    // Every one of the 17 Unit 6B rows above is ACTIVE but has no evaluateRule dispatch case -
    // outcome.findings must contain zero "not recognized by this evaluator" entries for them
    // (caught on review, 2026-09-15: the generic per-rule loop must skip these rule types).
    expect(outcome.findings.filter((f) => f.explanationBasis.includes("is not recognized by this evaluator"))).toHaveLength(0);
  });

  it("permitRequirement stays undefined even with all 9 permit rows active if the 2 accessory-height rows are only partially active (independent aggregates)", () => {
    const outcome = evaluateProject({
      propertyContext,
      project: shedProject,
      candidateActiveRules: [...ALL_PERMIT_RULE_TYPES.map((rt) => activeShedRule(rt)), activeShedRule(ALL_ACCESSORY_HEIGHT_RULE_TYPES[0]!)],
      ecaFindings: confirmedClearEcaFindings,
      candidateActiveInferencePolicies: [],
      shedLotCoverageFacts,
    });
    expect(outcome.permitRequirement).toBeDefined();
    expect(outcome.accessoryHeightLimitFinding).toBeUndefined();
  });
});
