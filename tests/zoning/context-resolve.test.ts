import { describe, expect, it } from "vitest";
import type { ZoneCoverage, ZoningFactValue } from "../../src/property-intelligence/seattle-zoning.js";
import { buildZoningContext, singleZoneContext, splitZoneContext, unavailableZoneContext } from "../../src/zoning/context.js";
import { ambiguousClaimFindings, zoningFindings, ZONING_SUBJECT } from "../../src/zoning/findings.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import { mkRule } from "./helpers.js";

const cov = (zoning: string, fraction: number, extra: Partial<ZoneCoverage> = {}): ZoneCoverage => ({ zoning, baseZone: zoning.split(" ")[0]!, shorelineDistrict: false, historicDistrict: false, fractionOfParcel: fraction, ...extra });
const fact = (zones: ZoneCoverage[], covered = 1): ZoningFactValue => ({ zones, sampledPointCount: 5000, coveredFraction: covered });
const labelOf = (_t: string, s: string): string => s;

describe("buildZoningContext", () => {
  it("ignores a boundary sliver below 2% of the lot and keeps a zone at exactly 2%", () => {
    expect(buildZoningContext({ lot: fact([cov("NR", 0.99), cov("C2-75 (M)", 0.01)]) }).lotZones.map((z) => z.designation.raw)).toEqual(["NR"]);
    expect(buildZoningContext({ lot: fact([cov("NR", 0.98), cov("LR1", 0.02)]) }).lotZones).toHaveLength(2);
    expect(buildZoningContext({ lot: fact([cov("NR", 0.981), cov("LR1", 0.019)]) }).lotZones).toHaveLength(1);
  });
  it("a lot gap is recorded at the 0.9 coverage boundary", () => {
    expect(buildZoningContext({ lot: fact([cov("NR", 0.9)], 0.9) }).lotGap).toBeUndefined();
    expect(buildZoningContext({ lot: fact([cov("NR", 0.89)], 0.89) }).lotGap).toContain("matched no zone");
  });
  it("overlay flags come from material zones only", () => {
    const c = buildZoningContext({ lot: fact([cov("NR", 0.9, { shorelineDistrict: true }), cov("NR", 0.1)]), landmark: { isLandmarkParcel: true } });
    expect(c.overlays).toMatchObject({ shorelineDistrict: true, historicDistrict: false, landmarkParcel: true });
    expect(buildZoningContext({ lot: fact([cov("NR", 0.99), cov("NR", 0.01, { shorelineDistrict: true })]) }).overlays.shorelineDistrict).toBe(false);
  });
  it("missing or empty zoning data is unavailable", () => {
    expect(buildZoningContext({ lot: undefined }).available).toBe(false);
    expect(buildZoningContext({ lot: fact([]) }).available).toBe(false);
  });
  it("a footprint's zones use a 1% threshold; an incomplete footprint answer is recorded as a gap, never trusted", () => {
    const withFp = buildZoningContext({ lot: fact([cov("LR1", 0.6), cov("NC2-40", 0.4)]), footprint: fact([cov("LR1", 0.985), cov("NC2-40", 0.015)]) });
    expect(withFp.footprintZones).toHaveLength(2);
    const sliver = buildZoningContext({ lot: fact([cov("LR1", 0.6), cov("NC2-40", 0.4)]), footprint: fact([cov("LR1", 0.995), cov("NC2-40", 0.005)]) });
    expect(sliver.footprintZones).toHaveLength(1);
    expect(buildZoningContext({ lot: fact([cov("LR1", 1)]), footprint: fact([cov("LR1", 0.5)], 0.5) }).footprintGap).toContain("footprint");
    expect(buildZoningContext({ lot: fact([cov("LR1", 1)]), footprintError: "lookup failed" }).footprintGap).toBe("lookup failed");
  });
});

describe("resolveApplicableRules", () => {
  const NR_SETBACK = mkRule("REAR_SETBACK", "NR");
  const LR_SETBACK = mkRule("MF_ACC_SETBACKS", "LR");
  const MR_SETBACK = mkRule("MF_ACC_SETBACKS", "MR,HR", { id: "mf-mr" });
  const PERMIT = mkRule("SHED_PERMIT_P1_ROOF_AREA", "NR");
  const NR_LOT = mkRule("SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM", "NR");
  const FAR_LR1 = mkRule("MF_FAR", "LR1:MHA", { id: "far-lr1-m" });
  const FAR_LR2 = mkRule("MF_FAR", "LR2:MHA", { id: "far-lr2-m" });
  const ALL = [NR_SETBACK, LR_SETBACK, MR_SETBACK, PERMIT, NR_LOT, FAR_LR1, FAR_LR2];
  const ids = (r: ReturnType<typeof resolveApplicableRules>) => r.rules.map((x) => x.id).sort();

  it("an NR lot gets the NR rules and the zone-independent permit rules, nothing from other zones", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("NR"), candidateRules: ALL });
    expect(r.status).toBe("RESOLVED");
    expect(r.governing?.family).toBe("NR");
    expect(ids(r)).toEqual([NR_LOT.id, NR_SETBACK.id, PERMIT.id].sort());
  });
  it("an LR1 (M) lot gets the Lowrise rows, including the MHA-qualified FAR row, and no NR row", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("LR1 (M)"), candidateRules: ALL });
    expect(r.status).toBe("RESOLVED");
    expect(ids(r)).toEqual([FAR_LR1.id, LR_SETBACK.id, PERMIT.id].sort());
  });
  it("the same Lowrise row serves LR1, LR2 and LR3 (reuse, not duplication); MR gets its own row", () => {
    for (const z of ["LR1", "LR2 (M1)", "LR3 RC"]) expect(ids(resolveApplicableRules({ zoning: singleZoneContext(z), candidateRules: ALL }))).toContain(LR_SETBACK.id);
    expect(ids(resolveApplicableRules({ zoning: singleZoneContext("MR (M1)"), candidateRules: ALL }))).toContain("mf-mr");
    expect(ids(resolveApplicableRules({ zoning: singleZoneContext("MR (M1)"), candidateRules: ALL }))).not.toContain(LR_SETBACK.id);
  });
  it("a zone family without rules yields only the zone-independent rules (nothing is assumed from NR)", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("NC2P-55 (M1)"), candidateRules: ALL });
    expect(r.status).toBe("RESOLVED");
    expect(ids(r)).toEqual([PERMIT.id]);
  });
  it("an inactive row never governs", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("NR"), candidateRules: [{ ...NR_SETBACK, lifecycleState: "APPROVED" }] as never });
    expect(r.rules).toEqual([]);
  });
  it("an NR/LR split lot is AMBIGUOUS: the claims the two zones answer differently are listed, never resolved by majority", () => {
    const r = resolveApplicableRules({ zoning: splitZoneContext([["NR", 0.9], ["LR1 (M)", 0.1]]), candidateRules: ALL });
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.governing).toBeUndefined();
    expect(r.ambiguousClaims.map((c) => c.ruleType).sort()).toEqual(["MF_ACC_SETBACKS", "MF_FAR", "REAR_SETBACK", "SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM"].sort());
    expect(ids(r)).toEqual([PERMIT.id]);
  });
  it("two designations with identical standards are settled together (LR1 (M) and LR1 (M1), LR1 and LR3 for a shared row)", () => {
    const r = resolveApplicableRules({ zoning: splitZoneContext([["LR1 (M)", 0.7], ["LR1 (M1)", 0.3]]), candidateRules: ALL });
    expect(r.status).toBe("RESOLVED");
    expect(ids(r)).toEqual([FAR_LR1.id, LR_SETBACK.id, PERMIT.id].sort());
    const mixed = resolveApplicableRules({ zoning: splitZoneContext([["LR1 (M)", 0.5], ["LR2 (M)", 0.5]]), candidateRules: ALL });
    // the setback row is shared, the FAR rows differ
    expect(mixed.rules.map((x) => x.id)).toContain(LR_SETBACK.id);
    expect(mixed.ambiguousClaims.map((c) => c.ruleType)).toEqual(["MF_FAR"]);
    expect(mixed.ambiguousClaims[0]!.kind).toBe("LOT");
  });
  it("a footprint wholly in one side of a split lot settles the location claims; lot-wide claims stay ambiguous", () => {
    const r = resolveApplicableRules({ zoning: splitZoneContext([["LR1 (M)", 0.6], ["NR", 0.4]], { footprint: [["LR1 (M)", 1]] }), candidateRules: ALL });
    expect(r.basis).toBe("PROJECT_FOOTPRINT");
    expect(r.footprintCrossesZones).toBe(false);
    expect(r.governing?.raw).toBe("LR1 (M)");
    expect(r.rules.map((x) => x.id)).toContain(LR_SETBACK.id);
    expect(r.ambiguousClaims.map((c) => c.ruleType).sort()).toEqual(["MF_FAR", "SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM"].sort());
    expect(r.ambiguousClaims.every((c) => c.kind === "LOT")).toBe(true);
    expect(r.status).toBe("AMBIGUOUS");
  });
  it("a footprint that crosses the boundary leaves the location claims ambiguous", () => {
    const r = resolveApplicableRules({ zoning: splitZoneContext([["LR1 (M)", 0.6], ["NR", 0.4]], { footprint: [["LR1 (M)", 0.7], ["NR", 0.3]] }), candidateRules: ALL });
    expect(r.footprintCrossesZones).toBe(true);
    expect(r.governing).toBeUndefined();
    expect(r.ambiguousClaims.some((c) => c.ruleType === "REAR_SETBACK" && c.kind === "LOCATION")).toBe(true);
    expect(r.status).toBe("AMBIGUOUS");
  });
  it("with an unusable footprint answer the location claims fall back to the lot's zones", () => {
    const r = resolveApplicableRules({ zoning: splitZoneContext([["LR1 (M)", 0.6], ["NR", 0.4]], { footprintGap: "lookup failed" }), candidateRules: ALL });
    expect(r.basis).toBe("LOT");
    expect(r.ambiguousClaims.some((c) => c.kind === "LOCATION")).toBe(true);
  });
  it("unavailable zoning, a data gap, an unrecognized designation and a Major Institution Overlay are UNRESOLVED with only zone-independent rules", () => {
    for (const ctx of [unavailableZoneContext(), buildZoningContext({ lot: fact([cov("NR", 0.5)], 0.5) }), singleZoneContext("ZZ9"), singleZoneContext("MIO-160-LR1 (M)")]) {
      const r = resolveApplicableRules({ zoning: ctx, candidateRules: ALL });
      expect(r.status).toBe("UNRESOLVED");
      expect(ids(r)).toEqual([PERMIT.id]);
      expect(r.reason).toBeTruthy();
    }
  });
  it("a footprint in a settled zone still works when the lot has a gap (location claims only)", () => {
    const base = splitZoneContext([["LR1 (M)", 1]], { footprint: [["LR1 (M)", 1]] });
    const gappy = { ...base, lotGap: "part of the parcel matched no zone in Seattle's zoning data" };
    const r = resolveApplicableRules({ zoning: gappy, candidateRules: ALL });
    expect(r.rules.map((x) => x.id)).toContain(LR_SETBACK.id);
    expect(r.ambiguousClaims.every((c) => c.kind === "LOT")).toBe(true);
  });
  it("two rows claiming the same rule type in the same zone are an authoring defect: excluded, fail closed", () => {
    const dup = mkRule("MF_ACC_SETBACKS", "LR1", { id: "dup" });
    const r = resolveApplicableRules({ zoning: singleZoneContext("LR1"), candidateRules: [LR_SETBACK, dup] });
    expect(r.conflictingRuleTypes).toEqual(["MF_ACC_SETBACKS"]);
    expect(r.rules).toEqual([]);
    // never silently RESOLVED: the conflicted claim is reported as unresolved
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.ambiguousClaims[0]).toMatchObject({ ruleType: "MF_ACC_SETBACKS", conflict: true });
    const f = ambiguousClaimFindings(r, { projectNoun: "shed", claimLabel: labelOf })[0]!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("could not apply its own rules");
  });
  it("a neighbor residential polygon is found even when it carries the same designation text as a polygon on the lot", () => {
    const ctx = buildZoningContext({ lot: fact([cov("NC2-40 (M)", 1)]), neighbors: fact([cov("NC2-40 (M)", 0.7), cov("NR", 0.3)]) });
    expect(ctx.adjacentResidential).toMatchObject({ status: "YES", zones: ["NR"] });
    const split = buildZoningContext({ lot: fact([cov("NC2-40 (M)", 0.6), cov("NR", 0.4)]), neighbors: fact([cov("NC2-40 (M)", 0.5), cov("NR", 0.5)]) });
    expect(split.adjacentResidential?.status).toBe("YES");
    expect(buildZoningContext({ lot: fact([cov("NC2-40 (M)", 1)]), neighbors: fact([cov("NC2-40 (M)", 0.9), cov("C1-55 (M)", 0.1)]) }).adjacentResidential).toMatchObject({ status: "NO" });
    expect(buildZoningContext({ lot: fact([cov("NC2-40 (M)", 1)]), neighborsError: "x" }).adjacentResidential?.status).toBe("UNKNOWN");
  });
  it("an MHA-qualified row cannot be decided for a designation with an unrecognized suffix: no rule, never the wrong one", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("LR2 (0.75)"), candidateRules: ALL });
    expect(r.status).toBe("RESOLVED");
    expect(r.rules.map((x) => x.id)).not.toContain(FAR_LR2.id);
    expect(r.rules.map((x) => x.id)).toContain(LR_SETBACK.id);
  });
});

describe("zoning findings", () => {
  const opts = { projectNoun: "detached garage", claimLabel: labelOf };
  it("a resolved zone names the real designation, the standards family and the chapter", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("LR1 (M)"), candidateRules: [mkRule("MF_ACC_SETBACKS", "LR")] });
    const [f] = zoningFindings(r, opts);
    expect(f!.subject).toBe(ZONING_SUBJECT);
    expect(f!.classification).toBe("KNOWN");
    expect(f!.explanationBasis).toContain("Seattle zoning data maps this property as LR1 (M)");
    expect(f!.explanationBasis).toContain("Lowrise (LR1) standards relevant to the proposed detached garage");
    expect(f!.explanationBasis).toContain("23.45");
    expect(f!.explanationBasis).toContain("general mapping, not a legal determination");
    expect(f!.explanationBasis).not.toContain("Neighborhood Residential");
  });
  it("an NR lot is described as Neighborhood Residential", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("NR"), candidateRules: [] });
    expect(zoningFindings(r, { ...opts, projectNoun: "shed" })[0]!.explanationBasis).toContain("Neighborhood Residential (NR) standards");
  });
  it("RC and an unrecognized suffix are stated, not hidden", () => {
    const rc = zoningFindings(resolveApplicableRules({ zoning: singleZoneContext("LR3 RC (M1)"), candidateRules: [] }), opts)[0]!;
    expect(rc.explanationBasis).toContain("RC (Residential-Commercial) designation concerns commercial uses");
    const suffix = zoningFindings(resolveApplicableRules({ zoning: singleZoneContext("LR2 (0.75)"), candidateRules: [] }), opts)[0]!;
    expect(suffix.explanationBasis).toContain('suffix ("0.75")');
  });
  it("an unresolved zoning is REQUIRES_VERIFICATION with the reason, and says zone-independent questions are still answered", () => {
    const r = resolveApplicableRules({ zoning: unavailableZoneContext(), candidateRules: [] });
    const [f] = zoningFindings(r, opts);
    expect(f!.classification).toBe("REQUIRES_VERIFICATION");
    expect(f!.explanationBasis).toContain("could not apply this property's zoning");
    expect(f!.explanationBasis).toContain("building-permit exemptions");
  });
  it("an ambiguous split names both zones and the claims that differ, and each claim is its own verification item", () => {
    const r = resolveApplicableRules({ zoning: splitZoneContext([["LR1 (M)", 0.6], ["NR", 0.4]]), candidateRules: [mkRule("MF_ACC_SETBACKS", "LR"), mkRule("REAR_SETBACK", "NR")] });
    const [f] = zoningFindings(r, opts);
    expect(f!.classification).toBe("REQUIRES_VERIFICATION");
    expect(f!.explanationBasis).toContain("LR1 (M)");
    expect(f!.explanationBasis).toContain("NR");
    expect(f!.explanationBasis).toContain("does not choose between zones");
    const claims = ambiguousClaimFindings(r, opts);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.classification === "REQUIRES_VERIFICATION")).toBe(true);
  });
  it("overlays add a separate finding", () => {
    const r = resolveApplicableRules({ zoning: singleZoneContext("NR", { overlays: { shorelineDistrict: true, overlayLabels: ["X"] } }), candidateRules: [] });
    const out = zoningFindings(r, opts);
    const overlay = out.find((x) => x.subject.startsWith("Overlay districts"))!;
    expect(overlay.classification).toBe("REQUIRES_VERIFICATION");
    for (const s of ["Shoreline District", "SMC 23.60A", '"X" overlay']) expect(overlay.explanationBasis).toContain(s);
  });
});
