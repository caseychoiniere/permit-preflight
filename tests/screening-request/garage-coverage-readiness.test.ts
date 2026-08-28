import { describe, expect, it } from "vitest";
import { checkGarageCheckoutEligibility, isGarageScreeningCoverageReady } from "../../src/screening-request/authorization.js";
import { SUPPORTED_PROJECT_TYPES } from "../../src/screening-request/types.js";

describe("Unit 4 - Garage Screening Coverage Readiness (business-rules.md BR-U4-9)", () => {
  it("SUPPORTED_PROJECT_TYPES includes both shed and garage - intake/evaluability, not purchase eligibility", () => {
    expect(SUPPORTED_PROJECT_TYPES.has("shed")).toBe(true);
    expect(SUPPORTED_PROJECT_TYPES.has("garage")).toBe(true);
  });

  it("[hard invariant] isGarageScreeningCoverageReady() is false today - expected to stay false for the entire Units 4-11 POC-build phase", () => {
    expect(isGarageScreeningCoverageReady()).toBe(false);
  });

  it("checkGarageCheckoutEligibility rejects a garage order while the coverage gate is closed, with a reason a customer can read", () => {
    const result = checkGarageCheckoutEligibility({ projectType: "garage" });
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("checkGarageCheckoutEligibility is a no-op ({ ready: true }) for a shed order - this gate has nothing to say about sheds", () => {
    expect(checkGarageCheckoutEligibility({ projectType: "shed" })).toEqual({ ready: true });
  });
});
