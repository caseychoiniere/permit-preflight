/**
 * Live Seattle Building Outlines 2023 integration test - real network call, no credentials
 * required (public endpoint). Mirrors
 * tests/property-intelligence/king-county-parcel-geometry.integration.test.ts's convention: real,
 * already-verified test parcels, not fabricated PINs. Always attempted (not DATABASE_URL-gated -
 * this is a public unauthenticated ArcGIS endpoint with no credential to gate on); a genuine
 * network failure in this sandbox fails the specific assertion, not the whole suite silently.
 */

import { describe, expect, it } from "vitest";
import { fetchBuildingFootprints } from "../../src/property-intelligence/seattle-building-outlines.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../../src/property-intelligence/king-county-parcel-geometry.js";

// Real, live-verified (2026-08-29) parcel with exactly one drawn building outline - same parcel
// already used elsewhere in this project's test fixtures (3218 Portage Bay Pl E, Seattle).
const KNOWN_PARCEL_WITH_BUILDING = "4088801470";
// A PIN with no King County parcel at all (same sentinel king-county-parcel-geometry's own
// integration test uses for "nothing exists here") - Building Outlines returns zero features for
// this, a genuine empty-array success, not an error.
const KNOWN_PARCEL_WITH_NO_BUILDING = "0000000000";

describe("Seattle Building Outlines live integration", () => {
  it("fetches at least one real building footprint for a known parcel, in the authoritative CRS", async () => {
    const footprints = await fetchBuildingFootprints(KNOWN_PARCEL_WITH_BUILDING);
    expect(footprints.length).toBeGreaterThanOrEqual(1);
    for (const f of footprints) {
      expect(f.footprint.srid).toBe(AUTHORITATIVE_PARCEL_SRID);
      expect(f.footprint.units).toBe("FEET");
      expect(f.footprint.points.length).toBeGreaterThanOrEqual(3);
      expect(f.outlineId.length).toBeGreaterThan(0);
      for (const point of f.footprint.points) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });

  it("[hard invariant] a PIN with no drawn building returns a real empty array, never a fabricated footprint", async () => {
    await expect(fetchBuildingFootprints(KNOWN_PARCEL_WITH_NO_BUILDING)).resolves.toEqual([]);
  });
});
