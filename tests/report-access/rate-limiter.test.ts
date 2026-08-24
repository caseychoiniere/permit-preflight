import { describe, expect, it } from "vitest";
import { FailedLookupRateLimiter } from "../../src/report-access/rate-limiter.js";

describe("Failed-Lookup Rate Limiter (NFR Design Pattern 2)", () => {
  it("does not limit a fresh source", () => {
    const limiter = new FailedLookupRateLimiter();
    expect(limiter.isLimited("source-1")).toBe(false);
  });

  it("[hard invariant] limits a source after it exceeds the failure threshold within the window", () => {
    const limiter = new FailedLookupRateLimiter({ maxFailuresPerWindow: 3, windowMs: 60_000, cooldownMs: 60_000 });
    const now = 1_000_000;
    limiter.recordFailure("source-1", now);
    limiter.recordFailure("source-1", now + 10);
    expect(limiter.isLimited("source-1", now + 20)).toBe(false);
    limiter.recordFailure("source-1", now + 20);
    expect(limiter.isLimited("source-1", now + 30)).toBe(true);
  });

  it("cooldown expires after cooldownMs, un-limiting the source", () => {
    const limiter = new FailedLookupRateLimiter({ maxFailuresPerWindow: 1, windowMs: 60_000, cooldownMs: 1_000 });
    const now = 1_000_000;
    limiter.recordFailure("source-1", now);
    expect(limiter.isLimited("source-1", now + 500)).toBe(true);
    expect(limiter.isLimited("source-1", now + 1_500)).toBe(false);
  });

  it("failures outside the rolling window do not count toward the threshold", () => {
    const limiter = new FailedLookupRateLimiter({ maxFailuresPerWindow: 2, windowMs: 1_000, cooldownMs: 60_000 });
    const now = 1_000_000;
    limiter.recordFailure("source-1", now);
    limiter.recordFailure("source-1", now + 5_000); // well outside the 1s window from the first failure
    expect(limiter.isLimited("source-1", now + 5_010)).toBe(false);
  });

  it("different sources are tracked independently", () => {
    const limiter = new FailedLookupRateLimiter({ maxFailuresPerWindow: 1, windowMs: 60_000, cooldownMs: 60_000 });
    const now = 1_000_000;
    limiter.recordFailure("source-1", now);
    expect(limiter.isLimited("source-1", now + 1)).toBe(true);
    expect(limiter.isLimited("source-2", now + 1)).toBe(false);
  });

  it("pruneStale removes sources with no recent failures and no active limit", () => {
    const limiter = new FailedLookupRateLimiter({ maxFailuresPerWindow: 5, windowMs: 100, cooldownMs: 100 });
    const now = 1_000_000;
    limiter.recordFailure("source-1", now);
    expect(limiter.size()).toBe(1);
    limiter.pruneStale(now + 10_000);
    expect(limiter.size()).toBe(0);
  });
});
