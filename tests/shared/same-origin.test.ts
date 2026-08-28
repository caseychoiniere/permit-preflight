import { describe, expect, it } from "vitest";
import { checkSameOrigin } from "../../src/shared/same-origin.js";

const EXPECTED = "https://permitpreflight.example";

describe("checkSameOrigin (shared core, Unit 6 extraction)", () => {
  it("accepts an exact-match Origin header", () => {
    const request = new Request("https://permitpreflight.example/api/account/logout", {
      method: "POST",
      headers: { origin: EXPECTED },
    });
    expect(checkSameOrigin(request, EXPECTED).outcome).toBe("OK");
  });

  it("rejects a mismatched Origin header", () => {
    const request = new Request("https://permitpreflight.example/api/account/logout", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(checkSameOrigin(request, EXPECTED).outcome).toBe("FORBIDDEN");
  });

  it("[hard invariant] an explicit Sec-Fetch-Site: cross-site header is rejected even with a matching Origin", () => {
    const request = new Request("https://permitpreflight.example/api/account/logout", {
      method: "POST",
      headers: { origin: EXPECTED, "sec-fetch-site": "cross-site" },
    });
    expect(checkSameOrigin(request, EXPECTED).outcome).toBe("FORBIDDEN");
  });

  it("falls back to a matching Referer origin when Origin is absent", () => {
    const request = new Request("https://permitpreflight.example/api/account/logout", {
      method: "POST",
      headers: { referer: `${EXPECTED}/account` },
    });
    expect(checkSameOrigin(request, EXPECTED).outcome).toBe("OK");
  });

  it("rejects a mismatched Referer origin", () => {
    const request = new Request("https://permitpreflight.example/api/account/logout", {
      method: "POST",
      headers: { referer: "https://evil.example/account" },
    });
    expect(checkSameOrigin(request, EXPECTED).outcome).toBe("FORBIDDEN");
  });

  it("[hard invariant] fails closed when neither Origin nor Referer is present", () => {
    const request = new Request("https://permitpreflight.example/api/account/logout", { method: "POST" });
    expect(checkSameOrigin(request, EXPECTED).outcome).toBe("FORBIDDEN");
  });

  it("takes no admin- or account-specific input - the same function serves both callers identically for the same inputs", () => {
    const adminRequest = new Request("https://permitpreflight.example/api/admin/orders/1/refund", { method: "POST", headers: { origin: EXPECTED } });
    const accountRequest = new Request("https://permitpreflight.example/api/account/logout", { method: "POST", headers: { origin: EXPECTED } });
    expect(checkSameOrigin(adminRequest, EXPECTED)).toEqual(checkSameOrigin(accountRequest, EXPECTED));
  });
});
