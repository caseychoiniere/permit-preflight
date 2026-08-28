import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "../../src/admin-auth/credential-check.js";

describe("constantTimeEqual (NFR Design Pattern 2)", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("correct-password", "correct-password")).toBe(true);
  });

  it("returns false for different strings, including different-length strings (never throws)", () => {
    expect(constantTimeEqual("short", "a-much-longer-string")).toBe(false);
    expect(constantTimeEqual("a-much-longer-string", "short")).toBe(false);
    expect(constantTimeEqual("", "nonempty")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(constantTimeEqual("Password", "password")).toBe(false);
  });
});
