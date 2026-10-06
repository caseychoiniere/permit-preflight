import { describe, expect, it } from "vitest";
import { buildEscalatedProfessional, validateProfessionalReviewInput, type PersistedProfessionalReview, type ProfessionalReviewInput } from "../../src/regulatory-rule-governance/professional-review.js";
import { sourceVerify } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";

const NOW = new Date("2026-10-06T12:00:00Z");
const valid: ProfessionalReviewInput = {
  reviewerIdentity: "Synthetic Test Reviewer",
  reviewerRole: "LAND_USE_CONSULTANT",
  reviewDate: "2026-10-01T00:00:00Z",
  sourceProvisions: ["SMC 25.09.045.E"],
  conclusion: "Synthetic test conclusion.",
  limitations: "none identified",
  evidenceRefs: ["synthetic-test-document-1"],
  suitableForDeterministicOrFailClosedUse: true,
};
const persisted: PersistedProfessionalReview = {
  id: "11111111-1111-4111-8111-111111111111",
  reviewerIdentity: "Synthetic Test Reviewer",
  reviewerRole: "LAND_USE_CONSULTANT",
  reviewDate: new Date("2026-10-01T00:00:00Z"),
  sourceProvisions: ["SMC 25.09.045.E"],
  conclusion: "Synthetic test conclusion.",
  limitations: "none identified",
  evidenceRefs: ["synthetic-test-document-1"],
  suitableForProductUse: true,
};

describe("validateProfessionalReviewInput", () => {
  it("accepts a complete review", () => expect(validateProfessionalReviewInput(valid, NOW).outcome).toBe("VALID"));
  it.each([
    ["blank identity", { reviewerIdentity: "  " }],
    ["unknown role", { reviewerRole: "WIZARD" as never }],
    ["bad date", { reviewDate: "not-a-date" }],
    ["future date", { reviewDate: "2026-12-01T00:00:00Z" }],
    ["no provisions", { sourceProvisions: [] }],
    ["blank provision", { sourceProvisions: [" "] }],
    ["blank conclusion", { conclusion: "" }],
    ["blank limitations", { limitations: "  " }],
    ["no evidence refs", { evidenceRefs: [] }],
    ["non-boolean suitability", { suitableForDeterministicOrFailClosedUse: "yes" as never }],
  ])("rejects %s", (_label, override) => {
    expect(validateProfessionalReviewInput({ ...valid, ...override }, NOW).outcome).toBe("INVALID");
  });
});

describe("buildEscalatedProfessional - fails closed", () => {
  it("rejects when no review exists", () => expect(buildEscalatedProfessional(undefined, NOW).outcome).toBe("REJECTED"));
  it("rejects a negative (unsuitable) review", () => expect(buildEscalatedProfessional({ ...persisted, suitableForProductUse: false }, NOW).outcome).toBe("REJECTED"));
  it("rejects a future-dated review", () => expect(buildEscalatedProfessional({ ...persisted, reviewDate: new Date("2027-01-01") }, NOW).outcome).toBe("REJECTED"));
  it("rejects an incomplete record", () => expect(buildEscalatedProfessional({ ...persisted, evidenceRefs: [] }, NOW).outcome).toBe("REJECTED"));
  it("builds escalatedProfessional from the persisted row, carrying the review record id", () => {
    const result = buildEscalatedProfessional(persisted, NOW);
    expect(result.outcome).toBe("OK");
    if (result.outcome === "OK") {
      expect(result.escalatedProfessional.reviewRecordId).toBe(persisted.id);
      expect(result.escalatedProfessional.opinion).toContain("Limitations: none identified");
      expect(result.escalatedProfessional.reviewedAt).toBe("2026-10-01T00:00:00.000Z");
    }
  });
});

describe("buildEscalatedProfessional - ties and malformed persisted data (reviewer QA 2026-10-06)", () => {
  it("equally-new reviews that disagree fail closed (any unsuitable review in the newest group blocks)", () => {
    const group = [persisted, { ...persisted, id: "22222222-2222-4222-8222-222222222222", suitableForProductUse: false }];
    expect(buildEscalatedProfessional(group, NOW).outcome).toBe("REJECTED");
    expect(buildEscalatedProfessional([...group].reverse(), NOW).outcome).toBe("REJECTED");
  });
  it("an agreeing tie group still verifies (deterministic: first row of the already-ordered group)", () => {
    expect(buildEscalatedProfessional([persisted, { ...persisted, id: "33333333-3333-4333-8333-333333333333" }], NOW).outcome).toBe("OK");
  });
  it.each([
    ["invalid date", { reviewDate: new Date("garbage") }],
    ["blank limitations", { limitations: "  " }],
    ["blank provision element", { sourceProvisions: ["ok", " "] }],
    ["blank evidence element", { evidenceRefs: ["ok", ""] }],
    ["unknown role", { reviewerRole: "WIZARD" }],
  ])("never throws and rejects malformed persisted data: %s", (_l, override) => {
    expect(() => buildEscalatedProfessional({ ...persisted, ...override }, NOW)).not.toThrow();
    expect(buildEscalatedProfessional({ ...persisted, ...override }, NOW).outcome).toBe("REJECTED");
  });
  it.each(["yesterday", "2026-13-45", "10/01/2026", "2026-10-01T25:00:00Z"])("input validation rejects non-ISO/invalid reviewDate %s", (d) => {
    expect(validateProfessionalReviewInput({ ...valid, reviewDate: d }, NOW).outcome).toBe("INVALID");
  });
});

describe("pure sourceVerify - a Tier-1 verification can never masquerade as professional review", () => {
  const tier2Rule = { lifecycleState: "TRIAGED", tier: "TIER_2", verificationHistory: [] } as unknown as RegulatoryRule;
  it("rejects a TIER_1 record against a Tier-2 rule (tier mismatch)", () => {
    expect(sourceVerify(tier2Rule, { tier: "TIER_1", founderIdentity: "op", founderVerifiedAt: NOW.toISOString() }).outcome).toBe("REJECTED");
  });
  it("rejects a TIER_2 record without escalatedProfessional", () => {
    expect(sourceVerify(tier2Rule, { tier: "TIER_2", founderIdentity: "op", founderVerifiedAt: NOW.toISOString() }).outcome).toBe("REJECTED");
  });
});
