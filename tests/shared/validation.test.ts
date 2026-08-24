import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateAtBoundary } from "../../src/shared/validation.js";

describe("Boundary Validator", () => {
  const schema = z.object({ addr: z.string().min(1) });

  it("returns VALID with domain-shaped data for well-formed input", () => {
    const result = validateAtBoundary(schema, { addr: "123 Main St" });
    expect(result.outcome).toBe("VALID");
  });

  it("[hard invariant] rejects invalid external data at the boundary rather than letting it reach domain logic", () => {
    const result = validateAtBoundary(schema, { addr: "" });
    expect(result.outcome).toBe("INVALID");
    if (result.outcome === "INVALID") {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects malformed/unexpected shapes rather than throwing", () => {
    const result = validateAtBoundary(schema, { unexpected: "field" });
    expect(result.outcome).toBe("INVALID");
  });

  it("never throws on garbage input", () => {
    expect(() => validateAtBoundary(schema, null)).not.toThrow();
    expect(() => validateAtBoundary(schema, undefined)).not.toThrow();
    expect(() => validateAtBoundary(schema, "not an object")).not.toThrow();
  });
});
