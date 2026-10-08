import { describe, expect, it } from "vitest";
import { deriveZoningApplicability, zoningApplicabilityFindings, ZONING_SUBJECT, OVERLAY_SUBJECT } from "../../src/regulatory-rules-engine/zoning-applicability.js";
import type { ZoneCoverage, ZoningFactValue } from "../../src/property-intelligence/seattle-zoning.js";

const z = (zoning: string, fraction: number, extra: Partial<ZoneCoverage> = {}): ZoneCoverage => ({ zoning, baseZone: zoning.split(" ")[0]!, shorelineDistrict: false, historicDistrict: false, fractionOfParcel: fraction, ...extra });
const fact = (zones: ZoneCoverage[], covered = 1): ZoningFactValue => ({ zones, sampledPointCount: 5000, coveredFraction: covered });

describe("deriveZoningApplicability - fail closed", () => {
  it("plain NR (>= 95%) is NR_VERIFIED, ignoring a negligible neighboring sliver", () => {
    expect(deriveZoningApplicability(fact([z("NR", 0.99), z("C2-75 (M)", 0.01)])).status).toBe("NR_VERIFIED");
    expect(deriveZoningApplicability(fact([z("NR", 0.98), z("LR1", 0.02)])).status).toBe("UNRESOLVED"); // exactly at the sliver tolerance: material
    expect(deriveZoningApplicability(fact([z("NR", 0.981), z("LR1", 0.019)])).status).toBe("NR_VERIFIED"); // just below: boundary artifact
  });
  it("any material second zone is a split - 96/4 and 3/97 are UNRESOLVED, as is a parcel in two different non-NR zones", () => {
    expect(deriveZoningApplicability(fact([z("NR", 0.96), z("LR1", 0.04)])).status).toBe("UNRESOLVED");
    expect(deriveZoningApplicability(fact([z("LR1", 0.97), z("NR", 0.03)])).status).toBe("UNRESOLVED");
    expect(deriveZoningApplicability(fact([z("LR1", 0.6), z("LR2", 0.4)])).status).toBe("UNRESOLVED");
  });
  it("coverage boundary: 0.9 covered is accepted, just under is UNRESOLVED", () => {
    expect(deriveZoningApplicability(fact([z("NR", 0.9)], 0.9)).status).toBe("NR_VERIFIED");
    expect(deriveZoningApplicability(fact([z("NR", 0.89)], 0.89)).status).toBe("UNRESOLVED");
  });
  it("an overwhelmingly non-NR parcel is NOT_NR with its zone named (the LR1 'NR test parcel' case)", () => {
    const a = deriveZoningApplicability(fact([z("LR1 (M)", 1)]));
    expect(a).toMatchObject({ status: "NOT_NR", zoningLabel: "LR1 (M)" });
  });
  it("a genuine split, a data gap, an MIO, and missing data are UNRESOLVED - never guessed", () => {
    expect(deriveZoningApplicability(fact([z("NR", 0.6), z("LR2", 0.4)]))).toMatchObject({ status: "UNRESOLVED" });
    expect(deriveZoningApplicability(fact([z("NR", 0.5)], 0.5))).toMatchObject({ status: "UNRESOLVED", reason: expect.stringContaining("matched no zone") });
    expect(deriveZoningApplicability(fact([z("MIO-160-NR", 1, { baseZone: "MIO-160-NR" })]))).toMatchObject({ status: "UNRESOLVED", reason: expect.stringContaining("Major Institution Overlay") });
    expect(deriveZoningApplicability(undefined)).toMatchObject({ status: "UNRESOLVED" });
    expect(deriveZoningApplicability(fact([]))).toMatchObject({ status: "UNRESOLVED" });
  });
  it("overlay flags come from material zones only; shoreline NR is still NR but flagged", () => {
    const a = deriveZoningApplicability(fact([z("NR", 0.9, { shorelineDistrict: true }), z("NR", 0.1)]), { isLandmarkParcel: true });
    expect(a.status).toBe("NR_VERIFIED");
    if (a.status === "NR_VERIFIED") expect(a.overlays).toMatchObject({ shorelineDistrict: true, historicDistrict: false, landmarkParcel: true });
    const sliver = deriveZoningApplicability(fact([z("NR", 0.99), z("NR", 0.01, { shorelineDistrict: true })]));
    if (sliver.status === "NR_VERIFIED") expect(sliver.overlays.shorelineDistrict).toBe(false);
  });
});

describe("zoningApplicabilityFindings", () => {
  it("undefined / UNRESOLVED keep the 'not verified' wording and include the reason when known", () => {
    const f = zoningApplicabilityFindings(undefined, "fence rules")[0]!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.subject).toBe(ZONING_SUBJECT);
    expect(f.explanationBasis).toContain("did not verify this parcel's zoning");
    const split = zoningApplicabilityFindings({ status: "UNRESOLVED", reason: "the parcel is split between zones (NR 60%, LR2 40%)" }, "deck rules")[0]!;
    expect(split.explanationBasis).toContain("split between zones");
  });
  it("NR_VERIFIED is a KNOWN fact (no compliance outcome) that still says the data is general mapping", () => {
    const f = zoningApplicabilityFindings({ status: "NR_VERIFIED", nrFraction: 1, zoningLabel: "NR", overlays: { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [] } }, "fence rules");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ classification: "KNOWN" });
    expect(f[0]!.complianceOutcome).toBeUndefined();
    expect(f[0]!.explanationBasis).toContain("general mapping, not a legal determination");
  });
  it("NOT_NR is REQUIRES_VERIFICATION naming the zone and saying zoning limits are not evaluated", () => {
    const f = zoningApplicabilityFindings({ status: "NOT_NR", zoningLabel: "LR1 (M)", overlays: { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [] } }, "deck rules")[0]!;
    expect(f.classification).toBe("REQUIRES_VERIFICATION");
    expect(f.explanationBasis).toContain("LR1 (M)");
    expect(f.explanationBasis).toContain("does not evaluate zoning limits");
  });
  it("overlays add a separate REQUIRES_VERIFICATION finding listing each flag and naming the Shoreline Master Program", () => {
    const f = zoningApplicabilityFindings({ status: "NR_VERIFIED", nrFraction: 1, zoningLabel: "NR", overlays: { shorelineDistrict: true, historicDistrict: true, landmarkParcel: true, overlayLabels: ["X"] } }, "ADU rules");
    const o = f.find((x) => x.subject === OVERLAY_SUBJECT)!;
    expect(o.classification).toBe("REQUIRES_VERIFICATION");
    for (const s of ["Shoreline District", "SMC 23.60A", "historic or special review district", "designated landmark", '"X" overlay']) expect(o.explanationBasis).toContain(s);
  });
});

describe("uncoveredConstraintNotice", () => {
  it("uses the not-NR wording for the not-NR entries each evaluator emits, and the no-active-rule wording otherwise", async () => {
    const { uncoveredConstraintNotice, NOT_NR_UNCOVERED_NOTICE, NO_ACTIVE_RULE_UNCOVERED_NOTICE } = await import("../../src/regulatory-rules-engine/zoning-applicability.js");
    const { evaluateProject } = await import("../../src/regulatory-rules-engine/evaluate.js");
    const { evaluateFence } = await import("../../src/regulatory-rules-engine/evaluate-fence.js");
    const { evaluateDeck } = await import("../../src/regulatory-rules-engine/evaluate-deck.js");
    const overlays = { shorelineDistrict: false, historicDistrict: false, landmarkParcel: false, overlayLabels: [] };
    const notNr = { status: "NOT_NR", zoningLabel: "LR1", overlays } as const;
    const fence = evaluateFence({ project: { projectType: "fence", heightFt: 5, locations: ["FRONT_SETBACK"], siteSlopes: false, wallRelation: "NONE" } as never, candidateActiveRules: [], ecaFindings: [], zoningApplicability: notNr });
    const deck = evaluateDeck({ project: { projectType: "deck", heightAboveGradeIn: 20, widthFt: 5, depthFt: 5, attachment: "DETACHED", buildingRelation: "OPEN_GROUND_BELOW", setbackLocations: ["SIDE_SETBACK"] } as never, candidateActiveRules: [], zoningApplicability: notNr });
    const shed = evaluateProject({ propertyContext: { facts: [] } as never, project: { projectType: "shed" } as never, candidateActiveRules: [], ecaFindings: [], candidateActiveInferencePolicies: [], zoningApplicability: notNr });
    for (const o of [fence, deck, shed]) {
      const zoningEntries = o.uncoveredConstraintTypes.filter((t) => t.includes("Neighborhood Residential"));
      expect(zoningEntries).toHaveLength(1);
      expect(uncoveredConstraintNotice(zoningEntries[0]!)).toBe(NOT_NR_UNCOVERED_NOTICE);
    }
    expect(uncoveredConstraintNotice("setback")).toBe(NO_ACTIVE_RULE_UNCOVERED_NOTICE);
  });
});
