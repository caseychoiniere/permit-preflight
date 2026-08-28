import { describe, expect, it } from "vitest";
import { requireOperatorId, validateReason } from "../../src/admin-auth/operator.js";

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const saved = process.env[key];
  try {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    fn();
  } finally {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

describe("requireOperatorId - BR-U3-0a, fail-closed independent of Basic Auth", () => {
  it("[hard invariant] returns undefined when ADMIN_OPERATOR_ID is absent", () => {
    withEnv("ADMIN_OPERATOR_ID", undefined, () => {
      expect(requireOperatorId()).toBeUndefined();
    });
  });

  it("[hard invariant] returns undefined when ADMIN_OPERATOR_ID is blank/whitespace-only", () => {
    withEnv("ADMIN_OPERATOR_ID", "   ", () => {
      expect(requireOperatorId()).toBeUndefined();
    });
  });

  it("returns the trimmed operator id when configured", () => {
    withEnv("ADMIN_OPERATOR_ID", "  founder@example.com  ", () => {
      expect(requireOperatorId()).toBe("founder@example.com");
    });
  });
});

describe("validateReason - every Unit 3 mutating operator command requires a non-empty human justification", () => {
  it("[hard invariant] rejects undefined, empty, and whitespace-only reasons", () => {
    expect(validateReason(undefined).outcome).toBe("INVALID");
    expect(validateReason("").outcome).toBe("INVALID");
    expect(validateReason("   ").outcome).toBe("INVALID");
  });

  it("[hard invariant] rejects a non-string reason", () => {
    expect(validateReason(123).outcome).toBe("INVALID");
    expect(validateReason(null).outcome).toBe("INVALID");
  });

  it("accepts and trims a real reason", () => {
    const result = validateReason("  customer requested a refund  ");
    expect(result.outcome).toBe("VALID");
    if (result.outcome === "VALID") expect(result.data).toBe("customer requested a refund");
  });
});
