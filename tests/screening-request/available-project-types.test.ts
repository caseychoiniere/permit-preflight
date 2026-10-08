import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/screening-requests/available-project-types/route.js";
import { checkAduCheckoutEligibility, checkGarageCheckoutEligibility, isAduScreeningCoverageReady } from "../../src/screening-request/authorization.js";

describe("GET /api/screening-requests/available-project-types (public availability)", () => {
  it("advertises shed, fence and deck; garage stays hidden and blocked until real garage rules exist", async () => {
    const body = (await (await GET()).json()) as { availableProjectTypes: string[] };
    expect(body.availableProjectTypes).toEqual(["shed", "fence", "deck"]);
    expect(body.availableProjectTypes).not.toContain("garage");
    const blocked = checkGarageCheckoutEligibility({ projectType: "garage" });
    expect(blocked.ready).toBe(false);
  });
});

describe("ADU availability (Unit 11): not public until a founder authorizes the rules' activation", () => {
  afterEach(() => vi.unstubAllEnvs());
  const types = async () => ((await (await GET()).json()) as { availableProjectTypes: string[] }).availableProjectTypes;

  it("is not advertised in test or production builds, and checkout is blocked either way", async () => {
    expect(isAduScreeningCoverageReady()).toBe(false);
    expect(await types()).not.toContain("adu");
    vi.stubEnv("NODE_ENV", "production");
    expect(await types()).not.toContain("adu");
    expect(checkAduCheckoutEligibility({ projectType: "adu" }).ready).toBe(false);
    expect(checkAduCheckoutEligibility({ projectType: "shed" }).ready).toBe(true);
  });

  it("a local development build offers it so the unreleased flow can be exercised, but checkout is still blocked", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await types()).toContain("adu");
    expect(checkAduCheckoutEligibility({ projectType: "adu" }).ready).toBe(false);
  });
});
