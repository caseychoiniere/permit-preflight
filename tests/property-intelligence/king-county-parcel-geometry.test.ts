/**
 * Deterministic (mocked fetch, no network) tests for the King County parcel-polygon retriever -
 * see king-county-parcel-geometry.integration.test.ts for the live-endpoint counterpart. Added
 * 2026-09-15 (maintenance correction) alongside the SourceRecordNotFoundError distinction: proves
 * a legitimate "no parcel here" / "unusable geometry for this parcel" result throws a
 * SourceRecordNotFoundError specifically, while every genuine source/transport/validation/CRS
 * failure still throws a plain Error - the exact distinction assemble.ts/pipeline.ts now depend on
 * to avoid conflating one parcel's own absence of data with the source's own health.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchParcelBoundaryPolygon } from "../../src/property-intelligence/king-county-parcel-geometry.js";
import { SourceRecordNotFoundError } from "../../src/property-intelligence/types.js";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

const REAL_PARCEL_RESPONSE = {
  spatialReference: { wkid: 2926, latestWkid: 2926 },
  features: [
    {
      attributes: { PIN: "1959703080" },
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

describe("King County parcel-polygon retriever - source-failure vs record-not-found distinction (mocked, deterministic)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a real Polygon for a matched feature", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(REAL_PARCEL_RESPONSE)));
    const polygon = await fetchParcelBoundaryPolygon("1959703080");
    expect(polygon.points).toHaveLength(4);
  });

  it("[maintenance correction] zero features for this PIN throws SourceRecordNotFoundError, not a plain Error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ features: [] })));
    await expect(fetchParcelBoundaryPolygon("0000000000")).rejects.toBeInstanceOf(SourceRecordNotFoundError);
  });

  it("[maintenance correction] a matched feature with a degenerate ring (< 3 points) throws SourceRecordNotFoundError, not a plain Error", async () => {
    const degenerate = { ...REAL_PARCEL_RESPONSE, features: [{ attributes: { PIN: "1" }, geometry: { rings: [[[0, 0], [1, 1]]] } }] };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(degenerate)));
    await expect(fetchParcelBoundaryPolygon("1")).rejects.toBeInstanceOf(SourceRecordNotFoundError);
  });

  it("[maintenance correction, RC-3] a 3-entry 'closed' ring with only 2 distinct vertices ([0,0],[5,5],[0,0]) throws SourceRecordNotFoundError (below the 4-entry minimum)", async () => {
    const twoDistinct = { ...REAL_PARCEL_RESPONSE, features: [{ attributes: { PIN: "1" }, geometry: { rings: [[[0, 0], [5, 5], [0, 0]]] } }] };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(twoDistinct)));
    await expect(fetchParcelBoundaryPolygon("1")).rejects.toBeInstanceOf(SourceRecordNotFoundError);
  });

  it("[maintenance correction, RC-3] a 4-entry ring whose last point does NOT duplicate the first (not actually closed) throws SourceRecordNotFoundError, never silently trusted", async () => {
    const notClosed = { ...REAL_PARCEL_RESPONSE, features: [{ attributes: { PIN: "1" }, geometry: { rings: [[[0, 0], [5, 0], [5, 5], [0, 5]]] } }] };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(notClosed)));
    await expect(fetchParcelBoundaryPolygon("1")).rejects.toBeInstanceOf(SourceRecordNotFoundError);
  });

  it("[maintenance correction, RC-3] a properly-closed ring whose vertices are all collinear (zero area) throws SourceRecordNotFoundError - well-formed but geometrically unusable", async () => {
    const collinear = { ...REAL_PARCEL_RESPONSE, features: [{ attributes: { PIN: "1" }, geometry: { rings: [[[0, 0], [5, 0], [10, 0], [0, 0]]] } }] };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(collinear)));
    await expect(fetchParcelBoundaryPolygon("1")).rejects.toBeInstanceOf(SourceRecordNotFoundError);
  });

  it("[maintenance correction, RC-3] a properly-closed ring padded with a repeated interior vertex still resolves a real, non-degenerate Polygon (repeats collapsed, not rejected)", async () => {
    const repeatedInterior = { ...REAL_PARCEL_RESPONSE, features: [{ attributes: { PIN: "1" }, geometry: { rings: [[[0, 0], [5, 0], [5, 0], [5, 5], [0, 5], [0, 0]]] } }] };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(repeatedInterior)));
    const polygon = await fetchParcelBoundaryPolygon("1");
    expect(polygon.points).toHaveLength(4); // the duplicated [5,0] entry is collapsed, not counted twice
  });

  it("a non-2xx response throws a plain Error (genuine transport failure), never SourceRecordNotFoundError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({}) })));
    const promise = fetchParcelBoundaryPolygon("1959703080");
    await expect(promise).rejects.toThrow(/request failed/i);
    await expect(promise).rejects.not.toBeInstanceOf(SourceRecordNotFoundError);
  });

  it("a declared SRID other than the requested one throws a plain Error (genuine CRS/validation failure), never SourceRecordNotFoundError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ...REAL_PARCEL_RESPONSE, spatialReference: { wkid: 3857, latestWkid: 3857 } })));
    const promise = fetchParcelBoundaryPolygon("1959703080");
    await expect(promise).rejects.toThrow(/spatial reference/i);
    await expect(promise).rejects.not.toBeInstanceOf(SourceRecordNotFoundError);
  });

  it("a malformed/schema-violating response throws a plain Error, never SourceRecordNotFoundError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ unexpectedShape: true })));
    const promise = fetchParcelBoundaryPolygon("1959703080");
    await expect(promise).rejects.toThrow(/failed validation/i);
    await expect(promise).rejects.not.toBeInstanceOf(SourceRecordNotFoundError);
  });
});
