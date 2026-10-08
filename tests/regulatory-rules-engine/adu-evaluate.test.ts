import { describe, expect, it } from "vitest";
import { draft } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateAdu, estimateAduFloorAreaSqFt, unitsAfterAdu } from "../../src/regulatory-rules-engine/evaluate-adu.js";
import { AduRuleType } from "../../src/regulatory-rules-engine/adu-types.js";
import type { AduProjectDetails, AduSiteFacts } from "../../src/regulatory-rules-engine/adu-types.js";
import type { ZoningApplicability } from "../../src/regulatory-rules-engine/zoning-applicability.js";
import { MappedIntersectionResult, AdvisoryStatus } from "../../src/spatial-analysis/types.js";
import type { CriticalAreaFinding } from "../../src/spatial-analysis/types.js";
import { ADU_FIXED_ROW_IDS, realAduCandidates } from "../fixtures/adu-candidates.js";
import { baseAduProject, baseAduSite } from "../fixtures/adu-evaluation-base.js";

const ALL: RegulatoryRule[] = realAduCandidates.map((c) => ({ ...draft(c), id: ADU_FIXED_ROW_IDS[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }));
const without = (...types: string[]) => ALL.filter((r) => !types.includes((r.ruleSpecification as { ruleType: string }).ruleType));
const overlays = { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [] as string[] };
const NR: ZoningApplicability = { status: "NR_VERIFIED", nrFraction: 1, zoningLabel: "NR", overlays };

function run(p: Partial<AduProjectDetails> = {}, s: Partial<AduSiteFacts> = {}, rules = ALL, zoning: ZoningApplicability | undefined = NR) {
  return evaluateAdu({ project: { ...baseAduProject(), ...p }, site: { ...baseAduSite(), ...s }, candidateActiveRules: rules, zoningApplicability: zoning });
}
const by = (o: ReturnType<typeof run>, subject: string) => o.findings.find((f) => f.subject === subject);
const oc = (f: { classification: string; complianceOutcome?: string } | undefined) => (f ? `${f.classification}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}` : "none");
const eca = (hazardType: string, result: string): CriticalAreaFinding => ({ hazardType, mappedIntersectionResult: result, advisoryStatus: AdvisoryStatus.ADVISORY_ONLY, toleranceBasis: "test" }) as unknown as CriticalAreaFinding;

describe("headline", () => {
  it("an ordinary NR parcel with a clear placement LOOKS_FEASIBLE, never says approved, and lists what to verify", () => {
    const o = run();
    expect(o.feasibility.headline).toBe("LOOKS_FEASIBLE");
    expect(o.feasibility.summary).toContain("not an approval");
    expect(o.feasibility.blockers).toEqual([]);
    expect(o.feasibility.verifyBeforeDesign.length).toBeGreaterThan(3);
    expect(JSON.stringify(o)).not.toMatch(/\bapproved\b/i);
  });
  it("any known failure is BLOCKED and names the number involved", () => {
    const o = run({ distanceToDwellingFt: 1.5, widthFt: 30, depthFt: 30, stories: 2, bedrooms: 2 });
    expect(o.feasibility.headline).toBe("BLOCKED");
    expect(o.feasibility.blockers.join(" ")).toContain("1.5 ft from the existing house; 5 ft is required");
    expect(o.feasibility.blockers.join(" ")).toContain("1,800 sq ft is over the 1,000 sq ft limit by 800 sq ft".replace("1,800 sq ft is", "estimated floor area of 1,800 sq ft is"));
  });
  it("a parcel verifiably not NR is CANNOT_TELL, names the zone, and produces no ADU zoning conclusion at all", () => {
    const o = run({}, {}, ALL, { status: "NOT_NR", zoningLabel: "LR1 (M)", overlays });
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
    expect(o.feasibility.summary).toContain("LR1 (M)");
    expect(o.findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
    expect(o.findings.some((f) => f.subject.startsWith("ADU "))).toBe(false);
    expect(o.uncoveredConstraintTypes.join()).toContain("not in a Neighborhood Residential zone");
  });
  it("no placement -> CANNOT_TELL with the reason, other claims still made", () => {
    const o = run({ distanceToRearLotLineFt: undefined, distanceToSideLotLineFt: undefined, distanceToFrontLotLineFt: undefined, distanceToDwellingFt: undefined });
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
    expect(oc(by(o, "ADU size limit"))).toBe("KNOWN/PASS");
    expect(oc(by(o, "ADU rear setback"))).toBe("REQUIRES_VERIFICATION");
  });
  it("a limit that appears exceeded on mapped or declared figures is LIKELY_CONSTRAINED, not BLOCKED", () => {
    const o = run({ existingChargeableFloorAreaSqFt: 4700 }, { parcelAreaSqFt: 6000 });
    expect(o.feasibility.headline).toBe("LIKELY_CONSTRAINED");
    expect(o.feasibility.constraints.join(" ")).toContain("floor area ratio limit");
  });
});

describe("outcome-dependent gating - a claim needs only its own rule", () => {
  it("with no rules active nothing is concluded and every claim is uncovered", () => {
    const o = run({}, {}, []);
    expect(o.findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
    expect(o.uncoveredConstraintTypes.length).toBeGreaterThanOrEqual(8);
  });
  it.each([
    [AduRuleType.SIZE_LIMIT, "ADU size limit"],
    [AduRuleType.HEIGHT, "ADU height"],
    [AduRuleType.SEPARATION, "Separation from the existing dwelling"],
    [AduRuleType.SETBACKS, "ADU rear setback"],
    [AduRuleType.LOT_COVERAGE, "Lot coverage"],
    [AduRuleType.AMENITY_AREA, "Amenity area"],
    [AduRuleType.TREES, "Tree requirement"],
    [AduRuleType.DESIGN_STANDARDS, "Design standards (pedestrian access, street-facing entry)"],
    [AduRuleType.FLOOR_AREA_RATIO, "Floor area ratio (FAR)"],
    [AduRuleType.COUNT_AND_DENSITY, "Number of ADUs on the lot"],
  ])("without %s only that claim disappears (%s)", (ruleType, subject) => {
    const o = run({}, {}, without(ruleType));
    expect(by(o, subject)).toBeUndefined();
    expect(o.uncoveredConstraintTypes.length).toBeGreaterThan(0);
    expect(by(o, "ADU size limit") !== undefined || ruleType === AduRuleType.SIZE_LIMIT).toBe(true);
  });
  it("FAR needs both its own rule and the density rule (the unit count drives the band)", () => {
    expect(by(run({}, {}, without(AduRuleType.COUNT_AND_DENSITY)), "Floor area ratio (FAR)")).toBeUndefined();
  });
  it("a malformed specification fails closed (claim unavailable)", () => {
    const bad = ALL.map((r) => ((r.ruleSpecification as { ruleType: string }).ruleType === AduRuleType.HEIGHT ? { ...r, ruleSpecification: { ruleType: AduRuleType.HEIGHT, maxFt: "32" } } : r)) as RegulatoryRule[];
    expect(by(run({}, {}, bad), "ADU height")).toBeUndefined();
  });
  it("an inactive rule never concludes anything", () => {
    const inactive = ALL.map((r) => ({ ...r, lifecycleState: "APPROVED" })) as RegulatoryRule[];
    expect(run({}, {}, inactive).findings.filter((f) => f.appliedRule).length).toBe(0);
  });
});

describe("units, floor area and FAR bands", () => {
  it("counts ADUs in density; the FAR limit rises with the unit count", () => {
    expect(unitsAfterAdu({ existingPrincipalDwellingUnits: 1, existingAduCount: 1 })).toBe(3);
    expect(estimateAduFloorAreaSqFt({ widthFt: 20, depthFt: 20, stories: 2 })).toBe(800);
    const limitText = (units: number) => by(run({ existingPrincipalDwellingUnits: units - 1, existingAduCount: 0, existingChargeableFloorAreaSqFt: 1000 }, { parcelAreaSqFt: 9000 }), "Floor area ratio (FAR)")!.explanationBasis;
    expect(limitText(2)).toContain("0.6 floor-area-ratio band"); // 4,500 sq ft per unit
    expect(limitText(3)).toContain("0.8 floor-area-ratio band"); // 3,000 per unit
    expect(limitText(5)).toContain("1 floor-area-ratio band"); // 1,800 per unit
    expect(limitText(6)).toContain("1.6 floor-area-ratio band"); // 1,500 per unit
  });
  it("band boundaries: exactly 4,000 / 2,200 / 1,600 sq ft per unit fall in the denser band", () => {
    const farOf = (area: number, units: number) => /in the ([\d.]+) floor-area-ratio band/.exec(by(run({ existingAduCount: units - 2 }, { parcelAreaSqFt: area }), "Floor area ratio (FAR)")!.explanationBasis)![1];
    expect(farOf(8000, 2)).toBe("0.8"); // exactly 4,000 per unit is NOT "less dense than 1/4,000"
    expect(farOf(4401, 2)).toBe("0.8"); // 2,200.5 per unit
    expect(farOf(4400, 2)).toBe("1"); // exactly 2,200 -> next band
    expect(farOf(3200, 2)).toBe("1.6"); // exactly 1,600
  });
});

describe("density (SMC 23.44.060)", () => {
  it("rounds up only a fraction OVER 0.85: exactly 0.85 does not", () => {
    const allowed = (area: number) => Number(by(run({ existingAduCount: 1 }, { parcelAreaSqFt: area }), "Dwelling units allowed on the lot (density)")!.supportingEvidence.find((e) => e.startsWith("unitsAllowedByLotArea="))!.split("=")[1]);
    expect(allowed(3562.5)).toBe(2); // 2.85 exactly
    expect(allowed(3562.6)).toBe(3);
    expect(allowed(3562.4)).toBe(2);
    expect(allowed(1250 * 4.85)).toBe(4);
    expect(allowed(1250 * 4.851)).toBe(5);
  });
  it("fractions over 0.85 round up: 3,563 sq ft allows 3 units, 3,562 does not (without the small-lot allowance)", () => {
    const d = (area: number) => oc(by(run({ existingAduCount: 1 }, { parcelAreaSqFt: area }), "Dwelling units allowed on the lot (density)"));
    expect(d(3563)).toBe("KNOWN/PASS");
    expect(d(3562)).toBe("REQUIRES_VERIFICATION"); // small-lot allowance needs no critical-area land
  });
  it("a mapped critical-area indication turns an otherwise passing density result into REQUIRES_VERIFICATION", () => {
    const f = by(run({}, { ecaFindings: [eca("steep_slope", MappedIntersectionResult.INTERSECTS)] }), "Dwelling units allowed on the lot (density)")!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("mapped critical-area layer");
  });
  it("over every allowance is a KNOWN FAIL", () => {
    expect(oc(by(run({ existingPrincipalDwellingUnits: 7 }, { parcelAreaSqFt: 9000 }), "Dwelling units allowed on the lot (density)"))).toBe("KNOWN/FAIL");
  });
});

describe("setback edge cases", () => {
  it("a rear role gap, side role gap and front role gap each turn that conclusion into REQUIRES_VERIFICATION while keeping the measurement", () => {
    const o = run({ rearRoleEvidenceGapReason: "the rear line may face a street.", sideRoleEvidenceGapReason: "you were not sure about side streets.", frontRoleEvidenceGapReason: "the front line may differ." });
    for (const s of ["ADU rear setback", "ADU side setback", "ADU front setback"]) expect(oc(by(o, s))).toBe("REQUIRES_VERIFICATION");
    expect(by(o, "ADU rear setback")!.explanationBasis).toContain("20 ft");
  });
  it("additional street frontage adds a grouped finding and never a PASS/FAIL", () => {
    const f = by(run({ unresolvedStreetFrontageDistancesFt: { "edge-1": 9 } }), "ADU setback from additional street frontage")!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("through lot");
  });
  it("geometry of a quality the rule was not approved to rely on gives no KNOWN setback conclusion", () => {
    const authoritativeOnly = ALL.map((r) => ({ ...r, acceptedEvidenceQuality: ["AUTHORITATIVE"] })) as RegulatoryRule[];
    const o = run({ spatialEvidenceQuality: "GENERAL_LOCATION_ONLY" as never }, {}, authoritativeOnly);
    expect(oc(by(o, "ADU rear setback"))).toBe("REQUIRES_VERIFICATION");
    expect(by(o, "ADU rear setback")!.explanationBasis).toContain("not been approved");
  });
  it("a distance inside the mapping margin of a threshold is never a definite result, on either side, and the text names the margin and says the mapping is not a survey", () => {
    for (const d of [3, 4.9, 5, 6.9]) {
      const f = by(run({ distanceToRearLotLineFt: d }), "ADU rear setback")!;
      expect(f.classification).toBe("REQUIRES_VERIFICATION");
      expect(f.explanationBasis).toContain("within 2 ft of the 5 ft requirement");
      expect(f.explanationBasis).toContain("not a survey");
    }
    expect(oc(by(run({ distanceToRearLotLineFt: 7 }), "ADU rear setback"))).toBe("KNOWN/PASS");
    expect(oc(by(run({ distanceToRearLotLineFt: 2.9 }), "ADU rear setback"))).toBe("KNOWN/FAIL");
    expect(oc(by(run({ alleyAdjacent: true, distanceToRearLotLineFt: 0 }), "ADU rear setback"))).toBe("KNOWN/PASS");
  });
  it("front setback on a three-unit lot: 10-15 ft is REQUIRES_VERIFICATION, under 10 ft fails at 10", () => {
    expect(oc(by(run({ existingAduCount: 1, distanceToFrontLotLineFt: 12 }), "ADU front setback"))).toBe("REQUIRES_VERIFICATION");
    const f = by(run({ existingAduCount: 1, distanceToFrontLotLineFt: 7 }), "ADU front setback")!;
    expect(oc(f)).toBe("KNOWN/FAIL");
    expect(f.explanationBasis).toContain("setback is 10 ft");
  });
  it("small lot in a frequent transit service area with unknown transit status is not treated as reduced", () => {
    const o = run({ distanceToSideLotLineFt: 6 }, { parcelAreaSqFt: 4000, inFrequentTransitServiceArea: undefined });
    expect(oc(by(o, "ADU side setback"))).toBe("REQUIRES_VERIFICATION");
    expect(by(o, "ADU side setback")!.explanationBasis).toContain("could not be determined");
  });
});

describe("lot coverage, amenity, design, ECA", () => {
  it("coverage appears-exceeded is REQUIRES_VERIFICATION with the tolerance language and a constraint (not a blocker)", () => {
    const o = run({}, { parcelAreaSqFt: 4000, existingMappedCoverageSqFt: 2300 });
    const f = by(o, "Lot coverage")!;
    expect(oc(f)).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("appears to exceed");
    expect(o.feasibility.constraints.join(" ")).toContain("lot coverage");
    expect(o.feasibility.blockers).toEqual([]);
  });
  it("lot coverage and FAR can be computed only from available site facts", () => {
    const o = run({}, { parcelAreaSqFt: undefined, existingMappedCoverageSqFt: undefined });
    expect(oc(by(o, "Lot coverage"))).toBe("REQUIRES_VERIFICATION");
    expect(oc(by(o, "Floor area ratio (FAR)"))).toBe("REQUIRES_VERIFICATION");
    expect(oc(by(o, "Dwelling units allowed on the lot (density)"))).toBe("REQUIRES_VERIFICATION");
  });
  it("within 40 ft of a street the street-facing standards are stated as applying", () => {
    const f = by(run({ distanceToFrontLotLineFt: 30 }), "Design standards (pedestrian access, street-facing entry)")!;
    expect(f.explanationBasis).toContain("within 40 ft");
    expect(f.explanationBasis).toContain("20% of that facade");
  });
  it("always emits the critical-area summary naming mapped indications; per-hazard findings use the shared subject prefix", () => {
    const o = run({}, { ecaFindings: [eca("steep_slope", MappedIntersectionResult.INTERSECTS), eca("flood_prone", MappedIntersectionResult.NO_INTERSECTION)] });
    const f = by(o, "Environmentally critical areas")!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("steep slope");
    // One summary finding on both surfaces; per-hazard "Critical area:" findings are not emitted (they printed on the PDF only).
    expect(o.findings.filter((x) => x.subject.startsWith("Critical area: ")).length).toBe(0);
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("steep slope");
  });
  it("overlay and unresolved-zoning findings are carried and added to the checklist", () => {
    const o = run({}, {}, ALL, { status: "NR_VERIFIED", nrFraction: 1, zoningLabel: "NR", overlays: { ...overlays, shorelineDistrict: true } });
    expect(by(o, "Overlay districts (shoreline, historic, landmark)")?.classification).toBe("REQUIRES_VERIFICATION");
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("overlay");
    const u = run({}, {}, ALL, { status: "UNRESOLVED", reason: "the parcel is split between zones (NR 60%, LR2 40%)" });
    expect(u.feasibility.verifyBeforeDesign.join(" ")).toContain("could not be verified as Neighborhood Residential");
    expect(by(u, "Zoning applicability (Neighborhood Residential zones)")!.explanationBasis).toContain("split between zones");
  });
  it.each([
    ["a split between zones", { status: "UNRESOLVED", reason: "the parcel is split between zones (NR 60%, LR2 40%)" } as ZoningApplicability],
    ["zoning data that was unavailable", { status: "UNRESOLVED", reason: "Seattle's zoning data was not available for this evaluation" } as ZoningApplicability],
    ["zoning that was never checked", undefined],
  ])("%s produces NO ADU conclusion (the ADU rules are NR rules): CANNOT_TELL, nothing passes or fails, the zone is on the checklist", (_name, zoning) => {
    const o = evaluateAdu({ project: baseAduProject(), site: baseAduSite(), candidateActiveRules: ALL, zoningApplicability: zoning });
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
    expect(o.findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
    expect(o.findings.some((f) => f.subject.startsWith("ADU "))).toBe(false);
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("could not be verified as Neighborhood Residential");
    expect(o.uncoveredConstraintTypes.join()).toContain("could not be verified");
    expect(o.feasibility.summary).toContain("could not verify");
  });
  it("a known failure stands as BLOCKED even when some rules are not ACTIVE, but partial coverage is never LOOKS_FEASIBLE", () => {
    const partial = without(AduRuleType.HEIGHT, AduRuleType.TREES);
    expect(run({}, {}, partial).feasibility.headline).toBe("CANNOT_TELL");
    expect(run({}, {}, partial).feasibility.summary).toContain("could not evaluate every ADU requirement");
    expect(run({ distanceToDwellingFt: 1 }, {}, partial).feasibility.headline).toBe("BLOCKED");
    expect(run({}, {}, ALL).feasibility.headline).toBe("LOOKS_FEASIBLE");
  });
  it("declared inputs echo what the customer told us, including unanswered items", () => {
    const rows = run({ existingHouseBuiltBefore1982: undefined }).declaredInputs;
    const get = (l: string) => rows.find((r) => r.label === l)?.value;
    expect(get("Footprint")).toBe("20 ft x 20 ft (400 sq ft)");
    expect(get("Existing house built before 1982")).toBe("Not answered");
    expect(get("Existing chargeable floor area (all structures)")).toBe("Not provided");
  });
});

describe("conversion of an existing accessory structure (Unit 11 Slice 4)", () => {
  const conv = (over: Partial<AduProjectDetails> = {}, c: Partial<NonNullable<AduProjectDetails["conversion"]>> = {}): Partial<AduProjectDetails> => ({
    aduType: "CONVERSION_EXISTING",
    widthFt: undefined,
    depthFt: undefined,
    heightFt: undefined,
    distanceToRearLotLineFt: 1,
    distanceToSideLotLineFt: 1,
    distanceToFrontLotLineFt: 90,
    distanceToDwellingFt: 14,
    conversion: { structureAreaSqFt: 400, existedBeforeJuly2023: true, keepsFootprintAndHeight: true, ...c },
    ...over,
  });

  it("an intact conversion of a pre-July-2023 building: no setback or lot-coverage standard is asserted, the allowance is described as REQUIRES_VERIFICATION, and nothing fails even at 1 ft from both lot lines", () => {
    const o = run(conv());
    expect(oc(by(o, "Conversion of an existing accessory structure"))).toBe("REQUIRES_VERIFICATION");
    expect(oc(by(o, "Setbacks and lot coverage (conversion)"))).toBe("REQUIRES_VERIFICATION"); // never a KNOWN fact: SDCI confirms the building legally existed
    expect(by(o, "ADU rear setback")).toBeUndefined();
    expect(by(o, "Lot coverage")).toBeUndefined();
    expect(by(o, "ADU height")).toBeUndefined();
    expect(o.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
    expect(by(o, "Setbacks and lot coverage (conversion)")!.explanationBasis).toContain("1 ft from the rear lot line");
    expect(o.feasibility.headline).toBe("LOOKS_FEASIBLE");
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("July 23, 2023");
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("SMC 22.206.020 through 22.206.140");
  });

  it("the Housing Code disclosure and the existed-on-the-date question are always REQUIRES_VERIFICATION, never assessed", () => {
    const o = run(conv());
    const h = by(o, "Minimum housing standards for the converted building")!;
    expect(h.classification).toBe("REQUIRES_VERIFICATION");
    expect(h.explanationBasis).toContain("SMC 22.206.020 through 22.206.140");
    expect(h.explanationBasis).toContain("does not assess");
    expect(by(o, "Conversion of an existing accessory structure")!.explanationBasis).toContain("for SDCI to confirm");
  });

  it("when the building did not exist before July 23, 2023 the allowance does not apply: the new-ADU setbacks are evaluated against the building", () => {
    const o = run(conv({}, { existedBeforeJuly2023: false }));
    expect(by(o, "Setbacks and lot coverage (conversion)")).toBeUndefined();
    expect(oc(by(o, "ADU rear setback"))).toBe("KNOWN/FAIL"); // 1 ft from the rear lot line
    expect(by(o, "Lot coverage")).toBeDefined();
    expect(o.feasibility.constraints.join(" ")).toContain("conversion allowances do not apply");
    expect(o.feasibility.headline).toBe("BLOCKED");
  });

  it("a planned expansion, relocation or enlargement (H.1): the existing building is covered as it stands, the changed part is unmeasured, so no setback result and no definite coverage or floor-area result", () => {
    const o = run(conv({ existingChargeableFloorAreaSqFt: 2000 }, { keepsFootprintAndHeight: false }));
    expect(by(o, "ADU rear setback")).toBeUndefined();
    expect(o.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
    expect(by(o, "Setbacks and lot coverage (conversion)")!.explanationBasis).toContain("not covered and was not measured");
    expect(oc(by(o, "Lot coverage"))).toBe("REQUIRES_VERIFICATION"); // in-limit for the existing buildings, but the addition is not measured
    expect(by(o, "Lot coverage")!.explanationBasis).toContain("would add coverage that is not measured here");
    const far = by(o, "Floor area ratio (FAR)")!;
    expect(far.classification).toBe("REQUIRES_VERIFICATION");
    expect(far.explanationBasis).toContain("Any addition's floor area was not collected");
    expect(by(o, "Conversion of an existing accessory structure")!.explanationBasis).toContain("expand, move or enlarge");
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("Describe any addition or relocation");
    expect(o.feasibility.headline).toBe("LOOKS_FEASIBLE");
  });

  it("height is never asserted for a conversion: the allowance does not mention it and none was collected", () => {
    for (const c of [{}, { existedBeforeJuly2023: false }, { keepsFootprintAndHeight: false }]) {
      const f = by(run(conv({}, c)), "Height of the converted building")!;
      expect(f.classification).toBe("REQUIRES_VERIFICATION");
      expect(f.explanationBasis).toContain("does not mention height");
    }
    expect(by(run(conv()), "ADU height")).toBeUndefined();
  });

  it("the Housing Code sentence cites only the section range - it does not characterize what those sections require", () => {
    const text = by(run(conv()), "Minimum housing standards for the converted building")!.explanationBasis;
    expect(text).toContain("SMC 22.206.020 through 22.206.140");
    expect(text).not.toMatch(/insulation|ventilation|heating|egress|plumbing|occupancy|mechanical|security/i);
  });

  it("not sure about either declaration: the allowance is not asserted (REQUIRES_VERIFICATION) and no standard setback failure is claimed", () => {
    for (const c of [{ existedBeforeJuly2023: undefined }, { keepsFootprintAndHeight: undefined }]) {
      const o = run(conv({}, c));
      expect(oc(by(o, "Setbacks and lot coverage (conversion)"))).toBe("REQUIRES_VERIFICATION");
      expect(o.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
      expect(by(o, "Conversion of an existing accessory structure")!.explanationBasis).toContain("is not known");
    }
  });

  it("separation from the house is never a KNOWN FAIL for a conversion (the allowance names setbacks and coverage; the Director may waive), but is a stated constraint", () => {
    const o = run(conv({ distanceToDwellingFt: 1.5 }));
    const f = by(o, "Separation from the existing dwelling")!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("Director may allow waivers");
    expect(o.feasibility.constraints.join(" ")).toContain("5 ft separation may need a waiver");
    expect(o.feasibility.headline).toBe("LIKELY_CONSTRAINED");
    expect(oc(by(run(conv({ distanceToDwellingFt: 20 })), "Separation from the existing dwelling"))).toBe("KNOWN/PASS");
  });

  it("size uses the mapped footprint times stories; count and density still bind; converting adds no floor area to the FAR total", () => {
    const big = run(conv({ stories: 3, bedrooms: 2 }, { structureAreaSqFt: 400 })); // 1,200 sq ft over 1,000
    expect(oc(by(big, "ADU size limit"))).toBe("KNOWN/FAIL");
    expect(by(big, "ADU size limit")!.explanationBasis).toContain("mapped 400 sq ft footprint x 3 stories");
    expect(oc(by(run(conv({ existingAduCount: 2 })), "Number of ADUs on the lot"))).toBe("KNOWN/FAIL");
    const far = by(run(conv({ existingChargeableFloorAreaSqFt: 4790 }, {}), { parcelAreaSqFt: 6000 }), "Floor area ratio (FAR)")!;
    expect(far.classification).toBe("KNOWN"); // limit 4,800: the existing 4,790 already includes the building; nothing is added
    expect(far.explanationBasis).toContain("the conversion adds none");
  });

  it("an intact conversion: design standards appear not to apply (REQUIRES_VERIFICATION); a new-ADU design finding is used otherwise", () => {
    expect(by(run(conv()), "Design standards (pedestrian access, street-facing entry)")!.explanationBasis).toContain("SMC 23.44.140.A.1");
    expect(by(run(conv({}, { existedBeforeJuly2023: false })), "Design standards (pedestrian access, street-facing entry)")!.explanationBasis).toContain("pedestrian path");
  });

  it("a building that could not be matched (not mapped, or it is the main house) yields CANNOT_TELL with the reason and NO other conclusion - no size, density, separation, FAR, amenity, tree or design finding", () => {
    const o = run(conv({}, { structureAreaSqFt: undefined, structureNotMatchedReason: "it is the building you identified as your main house." }));
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
    expect(o.findings.filter((f) => f.appliedRule).map((f) => f.subject)).toEqual(["Building to convert"]);
    expect(o.findings.some((f) => f.complianceOutcome !== undefined)).toBe(false);
    expect(o.feasibility.summary).toContain("could not be matched");
    expect(by(o, "Building to convert")!.explanationBasis).toContain("main house");
    expect(by(o, "Conversion of an existing accessory structure")).toBeUndefined();
  });

  it("conversion claims need the A11 rule: without it they are uncovered and the headline is not LOOKS_FEASIBLE", () => {
    const o = run(conv(), {}, without(AduRuleType.CONVERSION));
    expect(by(o, "Conversion of an existing accessory structure")).toBeUndefined();
    expect(o.uncoveredConstraintTypes).toContain("conversion of an existing accessory structure");
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
  });

  it("zoning that is not verified NR suppresses a conversion exactly as it does a new ADU", () => {
    const o = run(conv(), {}, ALL, { status: "NOT_NR", zoningLabel: "LR1 (M)", overlays });
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
    expect(o.findings.some((f) => f.complianceOutcome !== undefined || f.subject.startsWith("Conversion"))).toBe(false);
  });

  it("declared inputs for a conversion name the building, its mapped size and both declarations", () => {
    const rows = run(conv({}, { existedBeforeJuly2023: undefined })).declaredInputs;
    const get = (l: string) => rows.find((r) => r.label === l)?.value;
    expect(get("Type of ADU")).toBe("Conversion of an existing garage or shed");
    expect(get("Existing building's footprint")).toBe("400 sq ft (mapped outline)");
    expect(get("Building existed before July 23, 2023")).toBe("Not sure");
    expect(get("Conversion keeps the footprint and height")).toBe("Yes");
  });
});

describe("ADU inside or attached to the house (Unit 11 Slice 5)", () => {
  const att = (a: Partial<NonNullable<AduProjectDetails["attached"]>> = {}, over: Partial<AduProjectDetails> = {}): Partial<AduProjectDetails> => ({
    aduType: "ATTACHED_TO_HOUSE",
    widthFt: undefined,
    depthFt: undefined,
    heightFt: undefined,
    stories: undefined,
    distanceToRearLotLineFt: undefined,
    distanceToSideLotLineFt: undefined,
    distanceToFrontLotLineFt: undefined,
    distanceToDwellingFt: undefined,
    attached: { grossFloorAreaSqFt: 700, includesAddition: false, portionExistedBeforeJuly2023: true, ...a },
    ...over,
  });

  it("an ADU inside the existing house: count, density and size are evaluated; no setback, separation, height or lot-coverage finding exists; exterior standards are described as REQUIRES_VERIFICATION", () => {
    const o = run(att());
    expect(oc(by(o, "Number of ADUs on the lot"))).toBe("KNOWN/PASS");
    expect(oc(by(o, "Dwelling units allowed on the lot (density)"))).toBe("KNOWN/PASS");
    expect(oc(by(o, "ADU size limit"))).toBe("KNOWN/PASS");
    for (const s of ["ADU rear setback", "ADU side setback", "ADU front setback", "Separation from the existing dwelling", "ADU height", "Lot coverage"]) expect(by(o, s), s).toBeUndefined();
    const siting = by(o, "Setbacks, height and lot coverage (attached ADU)")!;
    expect(siting.classification).toBe("REQUIRES_VERIFICATION");
    expect(siting.explanationBasis).toContain("adds no exterior wall");
    expect(o.feasibility.headline).toBe("LOOKS_FEASIBLE");
    expect(o.findings.some((f) => f.complianceOutcome === "FAIL")).toBe(false);
  });

  it("size: the cap and H.4 - over-cap is a KNOWN FAIL only when the part of the house did NOT exist before July 23, 2023", () => {
    const size = (a: Partial<NonNullable<AduProjectDetails["attached"]>>, bedrooms = 2) => by(run(att({ grossFloorAreaSqFt: 1300, ...a }, { bedrooms })), "ADU size limit")!;
    expect(oc(size({ portionExistedBeforeJuly2023: false }))).toBe("KNOWN/FAIL");
    expect(oc(size({ portionExistedBeforeJuly2023: true, includesAddition: false }))).toBe("REQUIRES_VERIFICATION");
    expect(size({ portionExistedBeforeJuly2023: true, includesAddition: false }).explanationBasis).toContain("SMC 23.42.022.H.4");
    expect(oc(size({ portionExistedBeforeJuly2023: true, includesAddition: true }))).toBe("REQUIRES_VERIFICATION");
    expect(size({ portionExistedBeforeJuly2023: true, includesAddition: true }).explanationBasis).toContain("not clear that the exception covers all of it");
    expect(oc(size({ portionExistedBeforeJuly2023: undefined, includesAddition: false }))).toBe("REQUIRES_VERIFICATION");
    // three or more bedrooms: 1,200 cap
    expect(oc(by(run(att({ grossFloorAreaSqFt: 1150, portionExistedBeforeJuly2023: false }, { bedrooms: 3 })), "ADU size limit"))).toBe("KNOWN/PASS");
    expect(oc(by(run(att({ grossFloorAreaSqFt: 1150, portionExistedBeforeJuly2023: false }, { bedrooms: 2 })), "ADU size limit"))).toBe("KNOWN/FAIL");
  });

  it("over-cap attached findings cite the attached rule (A12, where H.4 decides it); an in-limit result cites the size rule (A2)", () => {
    const over = by(run(att({ grossFloorAreaSqFt: 1300, portionExistedBeforeJuly2023: true })), "ADU size limit")!;
    expect(over.appliedRule?.id).toBe(ADU_FIXED_ROW_IDS["adu-a12-attached-2026"]);
    expect(over.appliedRule?.citation.smcSections).toContain("SMC 23.42.022.H.4");
    const failing = by(run(att({ grossFloorAreaSqFt: 1300, portionExistedBeforeJuly2023: false })), "ADU size limit")!;
    expect(failing.appliedRule?.id).toBe(ADU_FIXED_ROW_IDS["adu-a12-attached-2026"]);
    expect(by(run(att()), "ADU size limit")!.appliedRule?.id).toBe(ADU_FIXED_ROW_IDS["adu-a2-size-limit-2026"]);
  });

  it("FAR is never definite for an attached ADU, in every branch: no existing area, existing area under or over the limit, with or without an addition", () => {
    // a 6,000 sq ft lot with 2 units after the ADU: 3,000 sq ft per unit -> 0.8 band -> 4,800 sq ft
    for (const addition of [false, true]) {
      for (const existing of [undefined, 2000, 4800, 6000]) {
        const f = by(run(att({ includesAddition: addition }, { existingChargeableFloorAreaSqFt: existing }), { parcelAreaSqFt: 6000 }), "Floor area ratio (FAR)")!;
        expect(f.classification, `addition=${addition} existing=${existing}`).toBe("REQUIRES_VERIFICATION");
        expect(f.complianceOutcome).toBeUndefined();
      }
    }
  });

  it("the siting finding makes no claim that the standards are 'not triggered': it says they are not measured and SDCI determines whether any exterior change brings them into play", () => {
    const t = by(run(att()), "Setbacks, height and lot coverage (attached ADU)")!.explanationBasis;
    expect(t).not.toMatch(/not triggered/i);
    expect(t).toContain("does not measure the house against");
    expect(t).toContain("for SDCI to determine");
  });

  it("with an addition: the siting finding says the addition must meet the standards and was not measured; FAR is never a definite result", () => {
    const o = run(att({ includesAddition: true }, { existingChargeableFloorAreaSqFt: 2000 }));
    expect(by(o, "Setbacks, height and lot coverage (attached ADU)")!.explanationBasis).toContain("where it would go was not collected");
    const far = by(o, "Floor area ratio (FAR)")!;
    expect(far.classification).toBe("REQUIRES_VERIFICATION");
    expect(far.explanationBasis).toContain("can add chargeable floor area that was not collected");
    expect(o.feasibility.verifyBeforeDesign.join(" ")).toContain("Describe the addition");
    expect(by(o, "Design standards (pedestrian access, street-facing entry)")!.explanationBasis).toContain("pedestrian path");
  });

  it("inside the house with no addition, design standards appear not to apply (SMC 23.44.140.A.1) as REQUIRES_VERIFICATION", () => {
    const f = by(run(att()), "Design standards (pedestrian access, street-facing entry)")!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("SMC 23.44.140.A.1");
  });

  it("the amenity exemption (one new unit on a pre-1982 house) and tree requirement still apply to an attached ADU", () => {
    expect(oc(by(run(att({}, { existingHouseBuiltBefore1982: true })), "Amenity area"))).toBe("KNOWN/PASS");
    expect(oc(by(run(att({}, { existingHouseBuiltBefore1982: false })), "Amenity area"))).toBe("REQUIRES_VERIFICATION");
    expect(by(run(att()), "Tree requirement")).toBeDefined();
  });

  it("count and density still bind (a lot may have at most two ADUs)", () => {
    expect(oc(by(run(att({}, { existingAduCount: 2 })), "Number of ADUs on the lot"))).toBe("KNOWN/FAIL");
  });

  it("attached claims need their rules: without A12 the attached size and siting are uncovered and the headline is not LOOKS_FEASIBLE; without the size rule only size disappears", () => {
    const noA12 = run(att(), {}, without(AduRuleType.ATTACHED));
    expect(by(noA12, "ADU size limit")).toBeUndefined();
    expect(by(noA12, "Setbacks, height and lot coverage (attached ADU)")).toBeUndefined();
    expect(noA12.uncoveredConstraintTypes).toEqual(expect.arrayContaining(["attached ADU size limit", "ADU attached to or inside the house"]));
    expect(noA12.feasibility.headline).toBe("CANNOT_TELL");
    expect(by(run(att(), {}, without(AduRuleType.SIZE_LIMIT)), "ADU size limit")).toBeUndefined();
  });

  it("zoning that is not verified NR suppresses an attached ADU exactly as it does the other kinds", () => {
    const o = run(att(), {}, ALL, { status: "NOT_NR", zoningLabel: "LR1 (M)", overlays });
    expect(o.feasibility.headline).toBe("CANNOT_TELL");
    expect(o.findings.some((f) => f.complianceOutcome !== undefined || f.subject.startsWith("Setbacks, height"))).toBe(false);
  });

  it("declared inputs: the floor area as the code counts it, the addition answer and the existed-before answer; no alley or footprint rows", () => {
    const rows = run(att({ portionExistedBeforeJuly2023: undefined })).declaredInputs;
    const get = (l: string) => rows.find((r) => r.label === l)?.value;
    expect(get("Type of ADU")).toBe("Inside or attached to the existing house");
    expect(get("Gross floor area (as the code counts it)")).toBe("700 sq ft");
    expect(get("Any part in a new addition")).toBe("No");
    expect(get("The part of the house it is in existed before July 23, 2023")).toBe("Not sure");
    expect(rows.some((r) => r.label === "Rear lot line is on an alley" || r.label === "Footprint")).toBe(false);
  });
});
