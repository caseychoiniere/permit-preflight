/**
 * Live King County GIS integration/health test - real network calls to the ArcGIS REST
 * endpoints validated during Unit 0B. No credentials required (public endpoints), but real
 * network access is required, which is why this is excluded from the deterministic `npm test`
 * gate (vitest.config.ts) and only runs via `npm run test:integration`.
 *
 * Exercises the adapter (src/parcel-resolution/king-county-adapter.ts), not the deterministic
 * decision logic (resolve.ts) - resolve.test.ts already proves the decision logic against
 * captured Unit 0B response shapes.
 */

import { describe, expect, it } from "vitest";
import { geocodeAddress, lookupParcelByAddress, lookupParcelByIdentifier } from "../../src/parcel-resolution/king-county-adapter.js";

const KNOWN_REAL_ADDRESS = "3216 Fuhrman Ave E, Seattle, WA 98102";
const KNOWN_REAL_PARCEL_ID = "1959703080";

describe("King County GIS live integration", () => {
  it("geocodeAddress resolves a known real Seattle address to a candidate with a parcel ID", async () => {
    const outcome = await geocodeAddress(KNOWN_REAL_ADDRESS);
    expect(outcome.candidates.length).toBeGreaterThan(0);
    expect(outcome.candidates.some((c) => c.parcelId === KNOWN_REAL_PARCEL_ID)).toBe(true);
  });

  it("lookupParcelByAddress (independent query path) resolves the same known address", async () => {
    const candidates = await lookupParcelByAddress(KNOWN_REAL_ADDRESS.replace(", Seattle, WA 98102", ""));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.parcelId === KNOWN_REAL_PARCEL_ID)).toBe(true);
  });

  it("lookupParcelByIdentifier resolves the known PIN back to a parcel with a matching address", async () => {
    const candidates = await lookupParcelByIdentifier(KNOWN_REAL_PARCEL_ID);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.canonicalAddress?.toUpperCase()).toContain("FUHRMAN");
  });

  it("[hard invariant] a nonsense address produces no viable candidates, never a fabricated match", async () => {
    const outcome = await geocodeAddress("ZZZZZ NONEXISTENT STREET 999999, NOWHERE");
    expect(outcome.candidates.length).toBe(0);
  });
});
