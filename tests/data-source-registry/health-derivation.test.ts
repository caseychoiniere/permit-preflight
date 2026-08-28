import { describe, expect, it } from "vitest";
import { computeEffectiveHealthState, SourceHealthState } from "../../src/data-source-registry/types.js";

/**
 * The founder's own correction (2026-08-25 Functional Design review): the original
 * healthState + manualOverride:boolean shape made "clear override" semantically wrong. These
 * tests reproduce the founder's exact worked example, plus the case that motivated it.
 */
describe("Data Source Registry - observed/override/effective derivation", () => {
  it("effective equals observed when no override is set", () => {
    expect(computeEffectiveHealthState(SourceHealthState.HEALTHY, undefined)).toBe(SourceHealthState.HEALTHY);
    expect(computeEffectiveHealthState(SourceHealthState.UNHEALTHY, undefined)).toBe(SourceHealthState.UNHEALTHY);
  });

  it("[founder's worked example] an override remains the effective value despite a contradicting observation", () => {
    // observed=HEALTHY, override=UNHEALTHY -> effective=UNHEALTHY (checkout stays blocked).
    expect(computeEffectiveHealthState(SourceHealthState.HEALTHY, SourceHealthState.UNHEALTHY)).toBe(SourceHealthState.UNHEALTHY);
  });

  it("[hard invariant] clearing the override immediately exposes the current observed value - never stuck at the override's last value", () => {
    // This is the exact bug the original healthState+manualOverride:boolean shape had: clearing
    // would leave healthState at UNHEALTHY (the override's last value) until an unrelated future
    // ingestion happened to overwrite it. The corrected model has no such window - clearing
    // (override=undefined) reads whatever observed already is, immediately.
    const observedAfterClear = SourceHealthState.HEALTHY; // what automated ingestion already recorded, unchanged the whole time
    expect(computeEffectiveHealthState(observedAfterClear, undefined)).toBe(SourceHealthState.HEALTHY);
  });

  it("an UNKNOWN observation with no override is effectively UNKNOWN (a never-yet-queried or not-yet-wired source)", () => {
    expect(computeEffectiveHealthState(SourceHealthState.UNKNOWN, undefined)).toBe(SourceHealthState.UNKNOWN);
  });
});
