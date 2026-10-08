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
