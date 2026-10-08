import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/screening-requests/available-project-types/route.js";
import { checkAduCheckoutEligibility, checkGarageCheckoutEligibility, isAduScreeningCoverageReady } from "../../src/screening-request/authorization.js";

describe("GET /api/screening-requests/available-project-types (public availability)", () => {
  it("advertises shed, garage, fence, deck and adu; the garage checkout gate is open (real garage rules ACTIVE since 2026-10-08)", async () => {
    const body = (await (await GET()).json()) as { availableProjectTypes: string[] };
    expect(body.availableProjectTypes).toEqual(["shed", "garage", "fence", "deck", "adu"]);
    expect(checkGarageCheckoutEligibility({ projectType: "garage" }).ready).toBe(true);
  });
});

describe("ADU availability (Unit 11): public once the founder activated the rules (2026-10-08)", () => {
  it("is advertised and checkout is allowed for ADU requests; other types are unaffected", async () => {
    expect(isAduScreeningCoverageReady()).toBe(true);
    const body = (await (await GET()).json()) as { availableProjectTypes: string[] };
    expect(body.availableProjectTypes).toEqual(["shed", "garage", "fence", "deck", "adu"]);
    expect(checkAduCheckoutEligibility({ projectType: "adu" }).ready).toBe(true);
    expect(checkAduCheckoutEligibility({ projectType: "shed" }).ready).toBe(true);
  });
});
