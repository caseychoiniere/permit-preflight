import { describe, expect, it } from "vitest";
import { checkGarageCheckoutEligibility, isGarageScreeningCoverageReady } from "../../src/screening-request/authorization.js";
import { SUPPORTED_PROJECT_TYPES } from "../../src/screening-request/types.js";

describe("Unit 4 - Garage Screening Coverage Readiness (business-rules.md BR-U4-9)", () => {
  it("SUPPORTED_PROJECT_TYPES includes both shed and garage - intake/evaluability, not purchase eligibility", () => {
    expect(SUPPORTED_PROJECT_TYPES.has("shed")).toBe(true);
    expect(SUPPORTED_PROJECT_TYPES.has("garage")).toBe(true);
  });

  it("isGarageScreeningCoverageReady() is true: the five real garage rules were activated and smoke-verified on 2026-10-08", () => {
    expect(isGarageScreeningCoverageReady()).toBe(true);
  });

  it("checkGarageCheckoutEligibility allows a garage order now that the coverage gate is open", () => {
    expect(checkGarageCheckoutEligibility({ projectType: "garage" })).toEqual({ ready: true });
  });

  it("checkGarageCheckoutEligibility is a no-op ({ ready: true }) for a shed order - this gate has nothing to say about sheds", () => {
    expect(checkGarageCheckoutEligibility({ projectType: "shed" })).toEqual({ ready: true });
  });
});
