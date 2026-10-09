import { describe, expect, it } from "vitest";
import { draft } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { singleZoneContext, splitZoneContext, unavailableZoneContext } from "../../src/zoning/context.js";
import { evaluatePurchaseEligibility } from "../../src/zoning/eligibility.js";
import { allAccessoryCandidates } from "../fixtures/accessory-candidates.js";
import { realShedPermitCandidates } from "../fixtures/shed-permit-candidates.js";
import { realDeckCandidates } from "../fixtures/deck-candidates.js";
import { realFenceCandidates } from "../fixtures/fence-candidates.js";
import { deckMultifamilyCandidates, fenceMultifamilyCandidates, garageMultifamilyCandidates, shedMultifamilyCandidates } from "../fixtures/multifamily-candidates.js";

let n = 0;
const active = (cands: DraftedRuleInput[]): RegulatoryRule[] => cands.map((c) => ({ ...draft(c), id: `r${n++}`, lifecycleState: "ACTIVE" }) as RegulatoryRule);
const NR_SHED = active([...allAccessoryCandidates.filter((c) => c.applicableProjectType === "shed"), ...realShedPermitCandidates]);
const NR_GARAGE = active(allAccessoryCandidates.filter((c) => c.applicableProjectType === "garage"));
const NR_FENCE = active(realFenceCandidates);
const NR_DECK = active(realDeckCandidates);
const LR_SHED = active(shedMultifamilyCandidates);
const LR_GARAGE = active(garageMultifamilyCandidates);
const LR_FENCE = active(fenceMultifamilyCandidates);
const LR_DECK = active(deckMultifamilyCandidates);

describe("purchase eligibility - the minimum useful report contract", () => {
  it("an NR parcel is eligible for each project type that has its NR rules", () => {
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext("NR"), activeRules: NR_SHED }).eligible).toBe(true);
    expect(evaluatePurchaseEligibility({ projectType: "garage", zoning: singleZoneContext("NR"), activeRules: NR_GARAGE }).eligible).toBe(true);
    expect(evaluatePurchaseEligibility({ projectType: "fence", zoning: singleZoneContext("NR"), activeRules: NR_FENCE }).eligible).toBe(true);
    expect(evaluatePurchaseEligibility({ projectType: "deck", zoning: singleZoneContext("NR"), activeRules: NR_DECK }).eligible).toBe(true);
  });

  it("the LR1 (M) garage regression: blocked while no Lowrise rule is ACTIVE, eligible once the Lowrise rules are", () => {
    const before = evaluatePurchaseEligibility({ projectType: "garage", zoning: singleZoneContext("LR1 (M)"), activeRules: NR_GARAGE });
    expect(before.eligible).toBe(false);
    if (!before.eligible) {
      expect(before.code).toBe("ZONE_NOT_YET_SUPPORTED");
      expect(before.message).toContain("LR1 (M), a Lowrise (LR1) zone");
      expect(before.message).toContain("Nothing was charged");
      expect(before.retryable).toBe(false);
    }
    const after = evaluatePurchaseEligibility({ projectType: "garage", zoning: singleZoneContext("LR1 (M)"), activeRules: [...NR_GARAGE, ...LR_GARAGE] });
    expect(after.eligible).toBe(true);
    if (after.eligible) expect(after.zoneLabels).toEqual(["LR1 (M)"]);
  });

  it("every Lowrise designation, with RC and any MHA suffix, is eligible once the Lowrise rows are active", () => {
    for (const z of ["LR1", "LR1 (M)", "LR1 (M1)", "LR2 (M)", "LR2 RC (M1)", "LR3", "LR3 (M2)", "LR3 RC"]) {
      expect(evaluatePurchaseEligibility({ projectType: "garage", zoning: singleZoneContext(z), activeRules: LR_GARAGE }).eligible, z).toBe(true);
      expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext(z), activeRules: LR_SHED }).eligible, z).toBe(true);
      expect(evaluatePurchaseEligibility({ projectType: "fence", zoning: singleZoneContext(z), activeRules: LR_FENCE }).eligible, z).toBe(true);
      expect(evaluatePurchaseEligibility({ projectType: "deck", zoning: singleZoneContext(z), activeRules: LR_DECK }).eligible, z).toBe(true);
    }
  });

  it("an NR parcel is not eligible on the strength of Lowrise rules alone, and the reverse", () => {
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext("NR"), activeRules: LR_SHED }).eligible).toBe(false);
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext("LR2"), activeRules: NR_SHED }).eligible).toBe(false);
  });

  it("a zone family with no rules yet is blocked with the zone named, never a permanent rejection of the parcel", () => {
    const e = evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext("NC2P-55 (M1)"), activeRules: [...NR_SHED, ...LR_SHED] });
    expect(e.eligible).toBe(false);
    if (!e.eligible) {
      expect(e.message).toContain("NC2P-55 (M1)");
      expect(e.message).toContain("Neighborhood Commercial");
      expect(e.missingClaims).toEqual(["setbacks", "height"]);
    }
  });

  it("unavailable zoning is a retryable block, not a rejection; an unrecognized designation or an MIO is a non-retryable block", () => {
    const u = evaluatePurchaseEligibility({ projectType: "shed", zoning: unavailableZoneContext(), activeRules: NR_SHED });
    expect(u).toMatchObject({ eligible: false, code: "ZONING_UNAVAILABLE", retryable: true });
    for (const z of ["ZZ9", "MIO-160-NR"]) {
      expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext(z), activeRules: NR_SHED })).toMatchObject({ eligible: false, code: "ZONING_UNRESOLVED", retryable: false });
    }
  });

  it("a split lot: the footprint in the supported part is eligible; crossing into an unsupported part is not; the lot-level advisory is lenient", () => {
    const rules = [...NR_SHED, ...LR_SHED];
    const inLr = splitZoneContext([["LR1 (M)", 0.6], ["NC2-40", 0.4]], { footprint: [["LR1 (M)", 1]] });
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: inLr, activeRules: rules }).eligible).toBe(true);
    const crossing = splitZoneContext([["LR1 (M)", 0.6], ["NC2-40", 0.4]], { footprint: [["LR1 (M)", 0.7], ["NC2-40", 0.3]] });
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: crossing, activeRules: rules }).eligible).toBe(false);
    const noFootprint = splitZoneContext([["LR1 (M)", 0.6], ["NC2-40", 0.4]]);
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: noFootprint, activeRules: rules }).eligible).toBe(false);
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: noFootprint, activeRules: rules, requireAllZones: false }).eligible).toBe(true);
    const bothUnsupported = splitZoneContext([["NC2-40", 0.6], ["C1-65", 0.4]]);
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: bothUnsupported, activeRules: rules, requireAllZones: false }).eligible).toBe(false);
  });

  it("a split between two zones with identical standards is eligible", () => {
    expect(evaluatePurchaseEligibility({ projectType: "garage", zoning: splitZoneContext([["LR1 (M)", 0.5], ["LR3 (M1)", 0.5]]), activeRules: LR_GARAGE }).eligible).toBe(true);
  });

  it("the permit determination alone does not make a project eligible: zone-independent rules are not a substitute for the zone-specific claims", () => {
    const permitOnly = NR_SHED.filter((r) => String((r.ruleSpecification as { ruleType: string }).ruleType).startsWith("SHED_PERMIT_P1"));
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext("LR1"), activeRules: permitOnly }).eligible).toBe(false);
  });
});

describe("not applicable is a code conclusion, not a missing feature", () => {
  it("an ADU in the Industrial Buffer zone is NOT_APPLICABLE with its citation; a shed there is merely not yet supported", () => {
    const adu = evaluatePurchaseEligibility({ projectType: "adu", zoning: singleZoneContext("IB U/45"), activeRules: [] });
    expect(adu).toMatchObject({ eligible: false, code: "NOT_APPLICABLE_TO_ZONE" });
    if (!adu.eligible) expect(adu.message).toContain("SMC 23.50.012");
    expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext("IB U/45"), activeRules: [] })).toMatchObject({ code: "ZONE_NOT_YET_SUPPORTED" });
  });
});

describe("Industrial and Commercial 2 - what is inapplicable, what is conditional, what is simply not built", () => {
  it("an ADU in MML, II and IC (residential uses prohibited, SMC 23.50A.040 Table A) is NOT_APPLICABLE with its citation, and so is a shed there only 'not yet supported'", () => {
    for (const z of ["MML U/85", "II U/125", "II 85-240", "IC-65 (M)"]) {
      const adu = evaluatePurchaseEligibility({ projectType: "adu", zoning: singleZoneContext(z), activeRules: [] });
      expect(adu, z).toMatchObject({ eligible: false, code: "NOT_APPLICABLE_TO_ZONE" });
      if (!adu.eligible) expect(adu.message).toContain("SMC 23.50A.040 Table A");
      expect(evaluatePurchaseEligibility({ projectType: "shed", zoning: singleZoneContext(z), activeRules: [] }), z).toMatchObject({ code: "ZONE_NOT_YET_SUPPORTED" });
    }
  });
  it("Urban Industrial (residential is a CONDITIONAL use there) is not declared inapplicable: an ADU is merely not yet supported", () => {
    expect(evaluatePurchaseEligibility({ projectType: "adu", zoning: singleZoneContext("UI U/45"), activeRules: [] })).toMatchObject({ code: "ZONE_NOT_YET_SUPPORTED" });
  });
  it("an ADU in C2 is not yet supported and says why (residential is a conditional use there); it is not declared inapplicable", () => {
    const e = evaluatePurchaseEligibility({ projectType: "adu", zoning: singleZoneContext("C2-55 (M)"), activeRules: [] });
    expect(e).toMatchObject({ eligible: false, code: "ZONE_NOT_YET_SUPPORTED" });
    if (!e.eligible) {
      expect(e.message).toContain("conditional uses");
      expect(e.message).toContain("SMC 23.47A.004");
      expect(e.message).toContain("Nothing was charged");
    }
  });
});

