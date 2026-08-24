import { describe, expect, it, vi } from "vitest";
import { executeWithBoundedRetry } from "../../src/shared/retry.js";

describe("Bounded-Retry Executor", () => {
  it("returns SUCCESS on the first attempt when the operation succeeds", async () => {
    const op = vi.fn().mockResolvedValue("data");
    const result = await executeWithBoundedRetry(op, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toEqual({ outcome: "SUCCESS", data: "data" });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries a bounded number of times before succeeding", async () => {
    const op = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce("data");
    const result = await executeWithBoundedRetry(op, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toEqual({ outcome: "SUCCESS", data: "data" });
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("[hard invariant] returns EXHAUSTED (never throws, never silently succeeds) after maxAttempts", async () => {
    const op = vi.fn().mockRejectedValue(new Error("permanent failure"));
    const result = await executeWithBoundedRetry(op, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result.outcome).toBe("EXHAUSTED");
    expect(op).toHaveBeenCalledTimes(3);
    if (result.outcome === "EXHAUSTED") {
      expect(result.attempts).toBe(3);
    }
  });

  it("respects a custom isRetryable predicate to fail fast on non-retryable errors", async () => {
    class NonRetryableError extends Error {}
    const op = vi.fn().mockRejectedValue(new NonRetryableError("bad request"));
    const result = await executeWithBoundedRetry(op, { maxAttempts: 5, baseDelayMs: 0 }, (e) => !(e instanceof NonRetryableError));
    expect(result.outcome).toBe("EXHAUSTED");
    expect(op).toHaveBeenCalledTimes(1);
  });
});
