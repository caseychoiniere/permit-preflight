import { describe, expect, it } from "vitest";
import { reportProductName } from "../../src/order-payment/stripe-client.js";

describe("Stripe line-item name", () => {
  it("names the project type, never calls a garage, fence, deck or ADU report a shed report", () => {
    expect(reportProductName("garage")).toBe("Permit Preflight Detached Garage Screening Report");
    expect(reportProductName("shed")).toBe("Permit Preflight Shed Screening Report");
    for (const t of ["garage", "fence", "deck", "adu"]) expect(reportProductName(t)).not.toContain("Shed");
  });

  it("falls back to a generic name for an unknown or absent project type", () => {
    expect(reportProductName(undefined)).toBe("Permit Preflight Screening Report");
    expect(reportProductName(null)).toBe("Permit Preflight Screening Report");
    expect(reportProductName("something-else")).toBe("Permit Preflight Screening Report");
  });
});
