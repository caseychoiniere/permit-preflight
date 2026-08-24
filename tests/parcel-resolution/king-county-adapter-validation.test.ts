/**
 * Deterministic (mocked fetch, no network) proof that the King County adapter rejects a
 * malformed/schema-violating response rather than passing it through to domain logic - the
 * "schema rejection of malformed external responses" invariant, exercised here without depending
 * on King County ever actually returning malformed data (which the live integration suite
 * naturally can't provoke on demand).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "../../src/parcel-resolution/king-county-adapter.js";

describe("King County adapter - Boundary Validator enforcement (mocked, deterministic)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[hard invariant] rejects a response missing the required 'candidates' field rather than treating it as zero candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ unexpectedShape: true }),
      }))
    );

    await expect(geocodeAddress("123 Main St")).rejects.toThrow(/failed validation/i);
  });

  it("[hard invariant] rejects a response where a candidate is missing its required 'score' field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ candidates: [{ address: "123 Main St" /* score missing */ }] }),
      }))
    );

    await expect(geocodeAddress("123 Main St")).rejects.toThrow(/failed validation/i);
  });

  it("propagates a non-OK HTTP status as an error rather than silently returning no candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({}) }))
    );

    await expect(geocodeAddress("123 Main St")).rejects.toThrow(/request failed/i);
  });
});
