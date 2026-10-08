import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/screening-requests/available-project-types/route.js";
import { checkGarageCheckoutEligibility } from "../../src/screening-request/authorization.js";

describe("GET /api/screening-requests/available-project-types (public availability)", () => {
  it("advertises shed, fence and deck; garage stays hidden and blocked until real garage rules exist", async () => {
    const body = (await (await GET()).json()) as { availableProjectTypes: string[] };
    expect(body.availableProjectTypes).toEqual(["shed", "fence", "deck"]);
    expect(body.availableProjectTypes).not.toContain("garage");
    const blocked = checkGarageCheckoutEligibility({ projectType: "garage" });
    expect(blocked.ready).toBe(false);
  });
});
