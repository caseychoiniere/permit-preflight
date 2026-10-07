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
  it("[boundary] exactly 120 sq ft footprint is MET (inclusive), 121 sq ft is NOT_MET", () => {
    expect(evaluateRoofArea(baseProject({ widthFt: 12, depthFt: 10 })).status).toBe("MET");
    expect(evaluateRoofArea(baseProject({ widthFt: 11, depthFt: 11 })).status).toBe("NOT_MET");
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
  it("[P7a boundary] exactly 750 sq ft footprint is not disqualified (inclusive, 'up to 750'); 751 sq ft is NOT_MET", () => {
    expect(evaluateSizeSpan(baseProject({ widthFt: 25, depthFt: 30, structuralSpanInfo: { structuralSpanFt: 10 } })).status).toBe("MET");
    expect(evaluateSizeSpan(baseProject({ widthFt: 751, depthFt: 1, structuralSpanInfo: { structuralSpanFt: 10 } })).status).toBe("NOT_MET");
  });
  it("[P7b boundary] with a manufactured truss, exactly 30ft is MET (inclusive) and 30.01ft is NOT_MET", () => {
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 30, usesManufacturedTruss: true } })).status).toBe("MET");
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 30.01, usesManufacturedTruss: true } })).status).toBe("NOT_MET");
  });
  it("[P7b boundary] just under 14ft (13.99) is MET and just over (14.01) without a truss is NOT_MET - only exactly 14.0 is unresolved", () => {
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 13.99 } })).status).toBe("MET");
    expect(evaluateSizeSpan(baseProject({ structuralSpanInfo: { structuralSpanFt: 14.01 } })).status).toBe("NOT_MET");
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
  it("cites the specific requiredSetbackEvidenceGapReasons when present (2026-09-23 correction) - never the generic fallback when a specific cause is known", () => {
    const finding = evaluateAccessoryHeightLimit(
      baseProject({ heightFt: 10, requiredSetbackEvidenceGapReasons: ["dwelling-unit count needed to select the 10ft vs 15ft front setback"] })
    );
    expect(finding.classification).toBe("REQUIRES_VERIFICATION");
    expect(finding.explanationBasis).toContain("dwelling-unit count needed to select the 10ft vs 15ft front setback");
  });
  // Exact regulatory thresholds (2026-09-26, P2b TESTED-readiness): the limit is inclusive (<=).
  // Above-limit result semantics are the existing ones - REQUIRES_VERIFICATION (never FAIL), since
  // SMC 23.44.070 carries roof/height exceptions not enumerated here.
  it("[boundary] in a required setback: exactly 12.0 ft PASSES (inclusive limit)", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 12.0, isInRequiredSetback: true }));
    expect(finding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
    expect(finding.supportingEvidence).toContain("limitFt=12");
  });
  it("[boundary] in a required setback: 12.01 ft exceeds the limit (REQUIRES_VERIFICATION, never a definite PASS)", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 12.01, isInRequiredSetback: true }));
    expect(finding.classification).toBe("REQUIRES_VERIFICATION");
    expect(finding.complianceOutcome).toBeUndefined();
    expect(finding.explanationBasis).toContain("exceeds the 12ft limit");
  });
  it("[boundary] outside every required setback: exactly 32.0 ft PASSES (inclusive limit)", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 32.0, isInRequiredSetback: false }));
    expect(finding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
    expect(finding.supportingEvidence).toContain("limitFt=32");
  });
  it("[boundary] outside every required setback: 32.01 ft exceeds the limit (REQUIRES_VERIFICATION, never a definite PASS)", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 32.01, isInRequiredSetback: false }));
    expect(finding.classification).toBe("REQUIRES_VERIFICATION");
    expect(finding.complianceOutcome).toBeUndefined();
    expect(finding.explanationBasis).toContain("exceeds the 32ft limit");
  });
  it("falls back to the generic explanation when isInRequiredSetback is undefined but no specific reasons were supplied", () => {
    const finding = evaluateAccessoryHeightLimit(baseProject({ heightFt: 10, requiredSetbackEvidenceGapReasons: [] }));
    expect(finding.classification).toBe("REQUIRES_VERIFICATION");
    expect(finding.explanationBasis).toBe("Whether the shed's proposed placement falls inside a required setback is unresolved.");
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

describe("C1b/C1e (evaluateEcaLotAreaAdjustment) - fail-closed on unmodeled regulatory buffers/setbacks (2026-09-27 correction)", () => {
  const clear = (hazardType: string) => ecaFinding({ hazardType, mappedIntersectionResult: "NO_INTERSECTION" });

  it("[fail-closed] a wetland polygon that does NOT intersect the parcel is REQUIRES_VERIFICATION - its regulatory buffer could still reach the parcel", () => {
    const result = evaluateEcaLotAreaAdjustment([clear("steep_slope"), clear("wetland"), clear("riparian_corridor")]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.intersectingCategories).toEqual(expect.arrayContaining(["WETLAND_AND_BUFFER", "RIPARIAN_CORRIDOR", "SUBMERGED_LAND_OR_SHORELINE_SETBACK"]));
  });
  it("[fail-closed] a riparian-corridor polygon that does not intersect is not treated as ruling out the corridor's regulated area", () => {
    const result = evaluateEcaLotAreaAdjustment([clear("riparian_corridor")]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.intersectingCategories).toContain("RIPARIAN_CORRIDOR");
  });
  it("[fail-closed] shoreline/submerged-land is never fetched - its absence from the findings can never rule it out", () => {
    const result = evaluateEcaLotAreaAdjustment([clear("steep_slope"), clear("wetland"), clear("riparian_corridor")]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.intersectingCategories).toContain("SUBMERGED_LAND_OR_SHORELINE_SETBACK");
  });
  it("[fail-closed] an empty findings list (ECA data unavailable) is never read as 'no exclusion applies'", () => {
    expect(evaluateEcaLotAreaAdjustment([]).status).toBe("REQUIRES_VERIFICATION");
  });
  it("only non-named categories (e.g. priority_habitat) never rule out the four named categories", () => {
    expect(evaluateEcaLotAreaAdjustment([clear("priority_habitat")]).status).toBe("REQUIRES_VERIFICATION");
  });
  it("REQUIRES_VERIFICATION when a named category polygon intersects, listing that category", () => {
    const result = evaluateEcaLotAreaAdjustment([ecaFinding({ hazardType: "riparian_corridor", mappedIntersectionResult: "INTERSECTS" })]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.intersectingCategories).toContain("RIPARIAN_CORRIDOR");
  });
  it("[steep slope] a generic steep_slope INTERSECTS never establishes the designated non-disturbance area - it stays REQUIRES_VERIFICATION, never ESTABLISHED/NOT_APPLICABLE", () => {
    const result = evaluateEcaLotAreaAdjustment([ecaFinding({ hazardType: "steep_slope", mappedIntersectionResult: "INTERSECTS" })]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
  });
  it("[advisory maps] SMC 25.09.030.A: a parcel clear of the advisory steep-slope layer does NOT rule out the designated non-disturbance area - no category can be ruled out by map silence", () => {
    const result = evaluateEcaLotAreaAdjustment([clear("steep_slope")]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.intersectingCategories).toContain("STEEP_SLOPE_NON_DISTURBANCE_AREA");
  });
  it("[advisory maps] even with EVERY real hazard layer clear, the denominator is never NOT_APPLICABLE (no dispositive source exists for any 23.44.080.B category)", () => {
    const all = ["steep_slope", "known_slides", "potential_slide_areas", "riparian_corridor", "wetland", "priority_habitat", "flood_prone", "landfill_historical", "liquefaction_prone", "peat_settlement"].map(clear);
    const result = evaluateEcaLotAreaAdjustment(all);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") {
      expect(result.intersectingCategories).toHaveLength(4);
      expect(result.mapIndicatedCategories).toEqual([]);
    }
  });
  it("[rule logic, declared case 0] IF dispositive evidence ruled out every named category, the adjustment is NOT_APPLICABLE; one still-unresolved or intersecting category prevents it (production evidence never reaches this: see the advisory-map tests)", () => {
    const allRuledOut = { RIPARIAN_CORRIDOR: true, WETLAND_AND_BUFFER: true, SUBMERGED_LAND_OR_SHORELINE_SETBACK: true, STEEP_SLOPE_NON_DISTURBANCE_AREA: true } as const;
    const clearAll = [clear("riparian_corridor"), clear("wetland"), clear("shoreline_setback"), clear("steep_slope")];
    expect(evaluateEcaLotAreaAdjustment(clearAll, allRuledOut).status).toBe("NOT_APPLICABLE");
    expect(evaluateEcaLotAreaAdjustment([...clearAll.slice(0, 3), ecaFinding({ hazardType: "steep_slope", mappedIntersectionResult: "INTERSECTS" })], allRuledOut).status).toBe("REQUIRES_VERIFICATION");
    expect(evaluateEcaLotAreaAdjustment(clearAll.slice(0, 3), allRuledOut).status).toBe("REQUIRES_VERIFICATION");
  });
  it.each([
    ["riparian_corridor", "RIPARIAN_CORRIDOR"],
    ["wetland", "WETLAND_AND_BUFFER"],
    ["wetland_buffer", "WETLAND_AND_BUFFER"],
    ["shoreline_setback", "SUBMERGED_LAND_OR_SHORELINE_SETBACK"],
    ["submerged_land", "SUBMERGED_LAND_OR_SHORELINE_SETBACK"],
    ["steep_slope", "STEEP_SLOPE_NON_DISTURBANCE_AREA"],
  ])("[per category] a mapped %s INTERSECTS indicates exactly %s; every category stays unresolved", (hazardType, category) => {
    const result = evaluateEcaLotAreaAdjustment([ecaFinding({ hazardType, mappedIntersectionResult: "INTERSECTS" })]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") {
      expect(result.mapIndicatedCategories).toEqual([category]);
      expect(result.intersectingCategories).toHaveLength(4);
    }
  });
  it("[mixed findings] INDETERMINATE counts as a map indication and a clear sibling layer rules nothing out", () => {
    const result = evaluateEcaLotAreaAdjustment([clear("wetland"), ecaFinding({ hazardType: "riparian_corridor", mappedIntersectionResult: "INDETERMINATE" })]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.mapIndicatedCategories).toEqual(["RIPARIAN_CORRIDOR"]);
  });
  it("[map indication] an INTERSECTS result is recorded as an indication (mapIndicatedCategories), never as an established exclusion", () => {
    const result = evaluateEcaLotAreaAdjustment([ecaFinding({ hazardType: "wetland", mappedIntersectionResult: "INTERSECTS" })]);
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.mapIndicatedCategories).toEqual(["WETLAND_AND_BUFFER"]);
  });
  it("[end to end] with today's real evidence shape, an unresolved adjustment can never yield ordinary Case A/B/C banding (no false WITHIN_STANDARD_ALLOWANCE)", () => {
    const ecaAdjustment = evaluateEcaLotAreaAdjustment([clear("steep_slope"), clear("wetland"), clear("riparian_corridor")]);
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 1000, proposedShedFootprintSqFt: 100, ecaAdjustment });
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.reason).toBe("LOT_AREA_ADJUSTMENT_UNRESOLVED");
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
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3500, proposedShedFootprintSqFt: 500, ecaAdjustment }, { directorAlternativeRuleActive: true });
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.reason).toBe("POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE");
  });

  it("[C1a boundary] 2500.01 of 5000 sq ft (just over 50%) leaves the base allowance and becomes MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE", () => {
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 2000, proposedShedFootprintSqFt: 500.01, ecaAdjustment: notApplicable });
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION") expect(result.reason).toBe("MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE");
  });
  it("[C1c/C1d boundary] exactly 60% (3000 of 5000) is still MAY_QUALIFY (inclusive); 3000.01 is EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE", () => {
    const at60 = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 2500, proposedShedFootprintSqFt: 500, ecaAdjustment: notApplicable });
    expect(at60.status).toBe("REQUIRES_VERIFICATION");
    if (at60.status === "REQUIRES_VERIFICATION") expect(at60.reason).toBe("MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE");
    const over60 = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 2500, proposedShedFootprintSqFt: 500.01, ecaAdjustment: notApplicable });
    expect(over60.status).toBe("EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE");
  });
  it("[C1c/C1d] 60% is never auto-applied: coverage between 50% and 60% is never reported as WITHIN_STANDARD_ALLOWANCE", () => {
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 10000, existingMappedCoverageSqFt: 5500, proposedShedFootprintSqFt: 100, ecaAdjustment: notApplicable });
    expect(result.status).not.toBe("WITHIN_STANDARD_ALLOWANCE");
  });
  it("[C1b denominator + C1a] an ESTABLISHED excluded area is subtracted from the lot area before the 50% test", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = { status: "ESTABLISHED", excludedAreaSqFt: 2000, minimumCoverageFloor: { status: "KNOWN" }, basis: "test" } as EcaLotAreaAdjustment;
    // adjusted lot = 8000 - 2000 = 6000 -> 50% = 3000 (floor 625 lower); 3000 is within, 3000.01 is not.
    const within = evaluateShedLotCoverage({ parcelAreaSqFt: 8000, existingMappedCoverageSqFt: 2500, proposedShedFootprintSqFt: 500, ecaAdjustment });
    expect(within.status).toBe("WITHIN_STANDARD_ALLOWANCE");
    const over = evaluateShedLotCoverage({ parcelAreaSqFt: 8000, existingMappedCoverageSqFt: 2500, proposedShedFootprintSqFt: 500.01, ecaAdjustment });
    expect(over.status).toBe("REQUIRES_VERIFICATION");
  });
  it("[C1e floor] on a small lot with a C1b area present, the 625 sq ft floor replaces a lower 50% allowance", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = { status: "ESTABLISHED", excludedAreaSqFt: 200, minimumCoverageFloor: { status: "KNOWN" }, basis: "test" } as EcaLotAreaAdjustment;
    // adjusted lot = 1000 - 200 = 800 -> 50% = 400 < 625 floor -> base allowance 625.
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 1000, existingMappedCoverageSqFt: 400, proposedShedFootprintSqFt: 200, ecaAdjustment });
    expect(result.status).toBe("WITHIN_STANDARD_ALLOWANCE");
    if (result.status === "WITHIN_STANDARD_ALLOWANCE") {
      expect(result.baseAllowanceSqFt).toBe(625);
      expect(result.facts.allowanceFacts.c1eFloorSqFt).toBe(625);
    }
    // The floor also lifts the 60% special allowance (480 < 625), so 626 exceeds both.
    const over = evaluateShedLotCoverage({ parcelAreaSqFt: 1000, existingMappedCoverageSqFt: 400, proposedShedFootprintSqFt: 226, ecaAdjustment });
    expect(over.status).toBe("EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE");
  });
  it("[Director relevance, C1e-director ACTIVE] unresolved denominator, coverage above the optimistic ceiling, and a mapped layer positively indicates a 23.44.080.B area -> POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE (may be relevant, never 'applies')", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: ["WETLAND_AND_BUFFER"], reason: "test" };
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3200, proposedShedFootprintSqFt: 100, ecaAdjustment }, { directorAlternativeRuleActive: true });
    expect(result.status).toBe("REQUIRES_VERIFICATION");
    if (result.status === "REQUIRES_VERIFICATION" && result.reason === "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE") {
      expect(result.facts.allowanceFacts.c1eDirectorAlternativeRelevant).toBe(true);
    } else throw new Error("expected POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE");
  });
  it("[Director relevance] no mapped indication of any 23.44.080.B area keeps the hedged EXCEEDS result (no Director-alternative claim)", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: [], reason: "test" };
    const result = evaluateShedLotCoverage({ parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 3200, proposedShedFootprintSqFt: 100, ecaAdjustment });
    expect(result.status).toBe("EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE");
  });
  it("[625 floor] on a tiny parcel the optimistic ceiling is at least 625 sq ft (23.44.080.D), so 600 sq ft is never reported as exceeding", () => {
    const ecaAdjustment: EcaLotAreaAdjustment = { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: [], reason: "test" };
    const within = evaluateShedLotCoverage({ parcelAreaSqFt: 900, existingMappedCoverageSqFt: 500, proposedShedFootprintSqFt: 100, ecaAdjustment });
    expect(within.status).toBe("REQUIRES_VERIFICATION");
    if (within.status === "REQUIRES_VERIFICATION") expect(within.reason).toBe("LOT_AREA_ADJUSTMENT_UNRESOLVED");
    const over = evaluateShedLotCoverage({ parcelAreaSqFt: 900, existingMappedCoverageSqFt: 500, proposedShedFootprintSqFt: 126, ecaAdjustment });
    expect(over.status).toBe("EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE");
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

// ---------------------------------------------------------------------------------------------
// Outcome-specific gating (2026-10-07 founder decision): discretionary Tier-2 rules (P6,
// C1e-director) no longer gate deterministic value that does not depend on resolving them. The
// general lifecycle rule is unchanged: an inactive rule never contributes a conclusion.
// ---------------------------------------------------------------------------------------------
describe("Outcome-specific gating - Capability B (P6 inactive)", () => {
  const MVP_PERMIT_RULE_TYPES = ALL_PERMIT_RULE_TYPES.filter((rt) => rt !== ShedPermitRuleType.ECA_CRITERION);
  const mvpRules = MVP_PERMIT_RULE_TYPES.map((rt) => activeShedRule(rt));
  const cleanShed = {
    projectType: "shed" as const,
    widthFt: 8,
    depthFt: 8,
    heightFt: 8,
    alleyAdjacent: false,
    foundationType: "SLAB_ON_GRADE" as const,
    attachment: "DETACHED" as const,
    intendedUse: "STORAGE" as const,
    isInRequiredSetback: false,
    structuralSpanInfo: { structuralSpanFt: 10 },
  };
  // Production-realistic: map-dispositive layers clear plus advisory layers.
  const ecaFindings: CriticalAreaFinding[] = [
    { hazardType: "priority_habitat", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" },
    { hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" },
    ecaFinding({ hazardType: "wetland" }),
  ];
  function run(project: Partial<ShedProjectDetails>, rules = mvpRules, findings = ecaFindings) {
    return evaluateProject({
      propertyContext,
      project: { ...cleanShed, ...project } as ShedProjectDetails,
      candidateActiveRules: rules,
      ecaFindings: findings,
      candidateActiveInferencePolicies: [],
    });
  }

  it("the outcome-dependency declaration excludes P6 from the deterministic set but keeps it in the constituent set", () => {
    // Behavioral proof rather than reaching into module internals: with the 8 deterministic rules the
    // aggregate renders; with P6 added and everything else identical it ALSO renders (P6 only adds
    // the ability to reach LIKELY_EXEMPT).
    expect(run({}).permitRequirement).toBeDefined();
    expect(run({}, [...mvpRules, activeShedRule(ShedPermitRuleType.ECA_CRITERION)]).permitRequirement).toBeDefined();
  });

  it.each([
    ["roof area above the exemption threshold", { widthFt: 12, depthFt: 12 }],
    ["attachment", { attachment: "ATTACHED" as const }],
    ["disqualifying foundation", { foundationType: "PILES" as const }],
    ["structural span", { widthFt: 12, depthFt: 12, structuralSpanInfo: { structuralSpanFt: 20 } }],
  ])("a conclusive deterministic disqualifier (%s) + inactive P6 -> permit-required still renders", (_label, override) => {
    const outcome = run(override as Partial<ShedProjectDetails>);
    expect(outcome.permitRequirement?.buildingPermit).toBe("REQUIRED");
  });

  it("a single active disqualifier is sufficient even if every OTHER permit rule is inactive (REQUIRED needs only the rules for that claim)", () => {
    const outcome = run({ widthFt: 12, depthFt: 12 }, [activeShedRule(ShedPermitRuleType.ROOF_AREA)]);
    expect(outcome.permitRequirement?.buildingPermit).toBe("REQUIRED");
    // Only the roof criterion and the deferred ECA consideration are listed - nothing is claimed for unevaluated criteria.
    expect(outcome.permitRequirement?.criteria.map((c) => c.criterionId).sort()).toEqual(["ECA", "ROOF_AREA"]);
    expect(outcome.permitRequirement?.reviewPath).toBe("REQUIRES_VERIFICATION");
  });

  it("all Tier-1 exemption criteria met + inactive P6 -> REQUIRES_VERIFICATION, never LIKELY_EXEMPT, with the ECA-only explanation", () => {
    const outcome = run({});
    expect(outcome.permitRequirement?.buildingPermit).toBe("REQUIRES_VERIFICATION");
    expect(outcome.permitRequirement?.buildingPermit).not.toBe("LIKELY_EXEMPT");
    expect(outcome.permitRequirement?.reviewPath).toBe("REQUIRES_VERIFICATION");
    expect(outcome.permitRequirement?.ecaDeferral?.allOtherExemptionCriteriaMet).toBe(true);
    expect(outcome.permitRequirement?.ecaDeferral?.note).toBe(
      "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in or near an environmentally critical area. Permit Preflight cannot determine that conclusively from Seattle's advisory mapping; SDCI makes that determination."
    );
    const eca = outcome.permitRequirement?.criteria.find((c) => c.criterionId === "ECA");
    expect(eca?.status).toBe("REQUIRES_VERIFICATION");
  });

  it("LIKELY_EXEMPT is never reachable without P6, even when every ECA layer is map-dispositive and clear", () => {
    const outcome = run({}, mvpRules, ecaFindings.slice(0, 2));
    expect(outcome.permitRequirement?.buildingPermit).toBe("REQUIRES_VERIFICATION");
  });

  it("P6 inactive is not evaluated as if ACTIVE: a dispositive priority-habitat intersection does NOT manufacture NOT_MET / FULL_REVIEW (disclosed as context only)", () => {
    const habitat: CriticalAreaFinding[] = [{ hazardType: "priority_habitat", mappedIntersectionResult: "INTERSECTS", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" }];
    const outcome = run({}, mvpRules, habitat);
    expect(outcome.permitRequirement?.buildingPermit).toBe("REQUIRES_VERIFICATION");
    const eca = outcome.permitRequirement?.criteria.find((c) => c.criterionId === "ECA");
    expect(eca?.status).toBe("REQUIRES_VERIFICATION");
    expect(eca?.explanationBasis).toContain("priority habitat");
    expect(eca?.explanationBasis).toContain("context only; not used to decide this criterion");
  });

  it("with P6 ACTIVE the exact previous behavior is preserved (LIKELY_EXEMPT reachable; dispositive intersection -> REQUIRED / FULL_REVIEW)", () => {
    const withP6 = [...mvpRules, activeShedRule(ShedPermitRuleType.ECA_CRITERION)];
    const clear = run({}, withP6, ecaFindings.slice(0, 2));
    expect(clear.permitRequirement?.buildingPermit).toBe("LIKELY_EXEMPT");
    expect(clear.permitRequirement?.ecaDeferral).toBeUndefined();
    const habitat: CriticalAreaFinding[] = [{ hazardType: "priority_habitat", mappedIntersectionResult: "INTERSECTS", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" }];
    const hit = run({}, withP6, habitat);
    expect(hit.permitRequirement?.buildingPermit).toBe("REQUIRED");
    expect(hit.permitRequirement?.reviewPath).toBe("FULL_REVIEW_LIKELY");
  });

  it("deterministic review path remains available where independently supported, with P6 inactive (STFI and FULL)", () => {
    expect(run({ widthFt: 12, depthFt: 12 }).permitRequirement?.reviewPath).toBe("STFI_LIKELY");
    expect(run({ widthFt: 12, depthFt: 12, foundationType: "WOOD_FOUNDATION" }).permitRequirement?.reviewPath).toBe("FULL_REVIEW_LIKELY");
    expect(run({ widthFt: 30, depthFt: 30 }).permitRequirement?.reviewPath).toBe("FULL_REVIEW_LIKELY");
  });

  it("a review-path conclusion resting on P3b needs P3b ACTIVE: without it the disqualifying foundation still makes the permit REQUIRED (P3a) but the review path is not claimed", () => {
    const withoutP3b = MVP_PERMIT_RULE_TYPES.filter((rt) => rt !== ShedPermitRuleType.FOUNDATION_STFI_DISQUALIFIER).map((rt) => activeShedRule(rt));
    const outcome = run({ widthFt: 12, depthFt: 12, foundationType: "PILES" }, withoutP3b);
    expect(outcome.permitRequirement?.buildingPermit).toBe("REQUIRED");
    expect(outcome.permitRequirement?.reviewPath).toBe("REQUIRES_VERIFICATION");
  });

  it("without a conclusive disqualifier, any inactive deterministic permit rule keeps the aggregate dormant (inactive rules never generate conclusions)", () => {
    const missingUse = MVP_PERMIT_RULE_TYPES.filter((rt) => rt !== ShedPermitRuleType.USE).map((rt) => activeShedRule(rt));
    expect(run({}, missingUse).permitRequirement).toBeUndefined();
  });

  it("a non-ECA REQUIRES_VERIFICATION keeps the ECA consideration but does not claim all other criteria are met", () => {
    const outcome = run({ intendedUse: "OCCUPIABLE" });
    expect(outcome.permitRequirement?.buildingPermit).toBe("REQUIRES_VERIFICATION");
    expect(outcome.permitRequirement?.ecaDeferral?.allOtherExemptionCriteriaMet).toBe(false);
    expect(outcome.permitRequirement?.ecaDeferral?.note).toBeUndefined();
  });
});

describe("Outcome-specific gating - Capability C (C1e-director inactive)", () => {
  const FIVE = ALL_LOT_COVERAGE_RULE_TYPES.filter((rt) => rt !== ShedLotCoverageRuleType.DIRECTOR_ALTERNATIVE);
  const shedProject = { projectType: "shed" as const, widthFt: 8, depthFt: 8, heightFt: 8, alleyAdjacent: false };
  const unresolved: EcaLotAreaAdjustment = { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: [], reason: "test" };
  function run(rules: RegulatoryRule[], overrides: { parcelAreaSqFt?: number; existing?: number; adjustment?: EcaLotAreaAdjustment } = {}) {
    return evaluateProject({
      propertyContext,
      project: shedProject,
      candidateActiveRules: rules,
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
      shedLotCoverageFacts: {
        parcelAreaSqFt: overrides.parcelAreaSqFt ?? 5000,
        existingMappedCoverageSqFt: overrides.existing ?? 1500,
        proposedShedFootprintSqFt: 64,
        ecaAdjustment: overrides.adjustment ?? unresolved,
      },
    });
  }

  it("C1e-director inactive does not suppress estimated coverage", () => {
    const outcome = run(FIVE.map((rt) => activeShedRule(rt)));
    expect(outcome.shedLotCoverage).toBeDefined();
    expect(outcome.shedLotCoverage?.estimatedCoverageSqFt).toBe(1564);
  });

  it("each of the five deterministic rules is still required: any one missing keeps Capability C dormant", () => {
    for (const missing of FIVE) {
      const outcome = run(FIVE.filter((rt) => rt !== missing).map((rt) => activeShedRule(rt)));
      expect(outcome.shedLotCoverage).toBeUndefined();
    }
  });

  it("no result claims a Director alternative applies while C1e-director is inactive, even with a mapped indication and coverage above the ceiling", () => {
    const outcome = run(FIVE.map((rt) => activeShedRule(rt)), {
      existing: 3100,
      adjustment: { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: ["WETLAND_AND_BUFFER"], reason: "test" },
    });
    expect(outcome.shedLotCoverage?.status).toBe("EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE");
    expect(JSON.stringify(outcome.shedLotCoverage)).not.toMatch(/DIRECTOR_APPROVED_ALTERNATIVE/);
    expect(outcome.shedLotCoverage?.facts.allowanceFacts.c1eDirectorAlternativeRelevant).toBe(false);
  });

  it("a Director-alternative claim IS available once C1e-director is ACTIVE (the claim, not the calculation, depends on it)", () => {
    const outcome = run(ALL_LOT_COVERAGE_RULE_TYPES.map((rt) => activeShedRule(rt)), {
      existing: 3100,
      adjustment: { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: ["WETLAND_AND_BUFFER"], reason: "test" },
    });
    const result = outcome.shedLotCoverage;
    expect(result?.status).toBe("REQUIRES_VERIFICATION");
    if (result?.status === "REQUIRES_VERIFICATION") expect(result.reason).toBe("POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE");
  });

  it("the generic parcel-specific-approval disclosure appears on unresolved results without C1e-director being active", () => {
    const outcome = run(FIVE.map((rt) => activeShedRule(rt)));
    const result = outcome.shedLotCoverage;
    if (result?.status !== "REQUIRES_VERIFICATION" || result.reason !== "LOT_AREA_ADJUSTMENT_UNRESOLVED") throw new Error("expected unresolved");
    expect(result.parcelSpecificApprovalDisclosure).toBe(
      "Parcel-specific SDCI approvals, reductions, waivers, or modifications are not evaluated by Permit Preflight and could affect the final allowable coverage."
    );
  });

  it("the unresolved result carries the tolerance for the 5,000 sq ft / 1,564 sq ft example (50%: 1,872 sq ft exact)", () => {
    const result = run(FIVE.map((rt) => activeShedRule(rt))).shedLotCoverage;
    if (result?.status !== "REQUIRES_VERIFICATION" || result.reason !== "LOT_AREA_ADJUSTMENT_UNRESOLVED") throw new Error("expected unresolved");
    expect(result.exclusionTolerance.at50).toMatchObject({ kind: "WITHIN_UNLESS_EXCLUDED_AREA_EXCEEDS", maxExcludedAreaSqFt: 1872 });
  });
});
