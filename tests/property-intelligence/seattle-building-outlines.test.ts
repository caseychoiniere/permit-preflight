/**
 * Deterministic (mocked fetch, no network) tests for the Seattle Building Outlines retriever - see
 * tests/property-intelligence/seattle-building-outlines.integration.test.ts for the live-endpoint
 * counterpart. Mirrors tests/parcel-resolution/king-county-adapter-validation.test.ts's
 * vi.stubGlobal("fetch", ...) convention.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBuildingFootprints, createSeattleBuildingOutlinesRetriever } from "../../src/property-intelligence/seattle-building-outlines.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../../src/property-intelligence/king-county-parcel-geometry.js";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

const ONE_BUILDING_RESPONSE = {
  spatialReference: { wkid: 2926, latestWkid: 2926 },
  features: [
    {
      attributes: { PIN: "4088801470", AREA: 1564.09514162, OUTLINE_ID: 1270131945 },
      geometry: {
        rings: [
          [
            [1274145.21, 240981.02],
            [1274163.26, 240950.05],
            [1274125.56, 240928.07],
            [1274107.51, 240959.04],
            [1274145.21, 240981.02],
          ],
        ],
      },
    },
  ],
};

const TWO_BUILDING_RESPONSE = {
  spatialReference: { wkid: 2926, latestWkid: 2926 },
  features: [
    ONE_BUILDING_RESPONSE.features[0],
    {
      attributes: { PIN: "4088801470", AREA: 120.5, OUTLINE_ID: 1270131946 },
      geometry: {
        rings: [
          [
            [1274050, 240800],
            [1274060, 240800],
            [1274060, 240810],
            [1274050, 240810],
            [1274050, 240800],
          ],
        ],
      },
    },
  ],
};

const ZERO_BUILDING_RESPONSE = { features: [] }; // real, live-verified shape - no spatialReference key at all on a zero-result response.

describe("Seattle Building Outlines retriever (mocked, deterministic)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns one normalized footprint for a single-building response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(ONE_BUILDING_RESPONSE)));
    const footprints = await fetchBuildingFootprints("4088801470");
    expect(footprints).toHaveLength(1);
    expect(footprints[0]!.outlineId).toBe("1270131945");
    expect(footprints[0]!.parcelPin).toBe("4088801470");
    expect(footprints[0]!.areaSqFt).toBeCloseTo(1564.095, 2);
    expect(footprints[0]!.footprint.srid).toBe(AUTHORITATIVE_PARCEL_SRID);
    expect(footprints[0]!.footprint.units).toBe("FEET");
    // Esri's repeated closing point is dropped - 5 ring coordinates in, 4 distinct points out.
    expect(footprints[0]!.footprint.points).toHaveLength(4);
  });

  it("returns multiple footprints, each with its own distinct outlineId, for a multi-building parcel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(TWO_BUILDING_RESPONSE)));
    const footprints = await fetchBuildingFootprints("4088801470");
    expect(footprints).toHaveLength(2);
    expect(new Set(footprints.map((f) => f.outlineId)).size).toBe(2);
  });

  it("[hard invariant] a genuine zero-footprint result is a real, valid empty array - never thrown as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(ZERO_BUILDING_RESPONSE)));
    await expect(fetchBuildingFootprints("0000000000")).resolves.toEqual([]);
  });

  it("[hard invariant] a source/network failure throws (never a fabricated empty array) - so assemblePropertyContext records SOURCE_ERROR, distinguishable from a genuine zero-footprint AVAILABLE result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({}) })));
    await expect(fetchBuildingFootprints("4088801470")).rejects.toThrow(/request failed/i);
  });

  it("[hard invariant] a malformed/schema-violating response is rejected rather than passed through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ unexpectedShape: true })));
    await expect(fetchBuildingFootprints("4088801470")).rejects.toThrow(/failed validation/i);
  });

  it("[hard invariant] a declared SRID other than the requested one is rejected rather than silently trusted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ...ONE_BUILDING_RESPONSE, spatialReference: { wkid: 3857, latestWkid: 3857 } })));
    await expect(fetchBuildingFootprints("4088801470")).rejects.toThrow(/spatial reference/i);
  });

  it("createSeattleBuildingOutlinesRetriever produces a FactRetriever with GENERAL_LOCATION_ONLY evidence quality and a disclosed quality caveat", () => {
    const retriever = createSeattleBuildingOutlinesRetriever();
    expect(retriever.factType).toBe("building-footprints-available");
    expect(retriever.evidenceQuality).toBe("GENERAL_LOCATION_ONLY");
    expect(retriever.qualityCaveat).toMatch(/building geometry/i);
  });
});
