import { describe, expect, it, vi, afterEach } from "vitest";
import { computeZoneCoverage, createSeattleZoningRetriever, createSeattleFrequentTransitRetriever, createSeattleLandmarkRetriever } from "../../src/property-intelligence/seattle-zoning.js";
import type { ZonePolygon } from "../../src/property-intelligence/seattle-zoning.js";

const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const key = (zoning: string, extra: Partial<ZonePolygon["key"]> = {}): ZonePolygon["key"] => ({ zoning, baseZone: zoning, shorelineDistrict: false, historicDistrict: false, ...extra });

describe("computeZoneCoverage - share of the parcel in each zone", () => {
  const parcel = square(0, 0, 100, 50);

  it("a parcel wholly inside one zone is 100% that zone", () => {
    const r = computeZoneCoverage(parcel, [{ key: key("NR"), rings: [square(-10, -10, 200, 200)] }]);
    expect(r.zones).toHaveLength(1);
    expect(r.zones[0]!.zoning).toBe("NR");
    expect(r.zones[0]!.fractionOfParcel).toBeCloseTo(1, 5);
    expect(r.coveredFraction).toBeCloseTo(1, 5);
  });

  it("a parcel split in half is reported as two zones near 50/50, ordered by share", () => {
    const r = computeZoneCoverage(parcel, [
      { key: key("NR"), rings: [square(-10, -10, 60, 200)] },
      { key: key("LR1"), rings: [square(60, -10, 200, 200)] },
    ]);
    expect(r.zones.map((z) => z.zoning)).toEqual(["NR", "LR1"]);
    expect(r.zones[0]!.fractionOfParcel).toBeCloseTo(0.6, 1);
    expect(r.zones[1]!.fractionOfParcel).toBeCloseTo(0.4, 1);
  });

  it("a neighboring zone that merely TOUCHES the parcel boundary contributes nothing (the 'NR + C2-75' false-positive case)", () => {
    const r = computeZoneCoverage(parcel, [
      { key: key("NR"), rings: [square(-10, -10, 100, 200)] },
      { key: key("C2-75 (M)"), rings: [square(100, -10, 300, 200)] },
    ]);
    expect(r.zones.map((z) => z.zoning)).toEqual(["NR"]);
    expect(r.zones[0]!.fractionOfParcel).toBeCloseTo(1, 5);
  });

  it("a gap in the zoning data lowers coveredFraction (so the caller can fail closed)", () => {
    const r = computeZoneCoverage(parcel, [{ key: key("NR"), rings: [square(-10, -10, 50, 200)] }]);
    expect(r.coveredFraction).toBeCloseTo(0.5, 1);
  });

  it("holes are honored (even-odd across a polygon's rings)", () => {
    const r = computeZoneCoverage(parcel, [{ key: key("NR"), rings: [square(-10, -10, 200, 200), square(25, 12.5, 75, 37.5)] }]);
    expect(r.zones[0]!.fractionOfParcel).toBeCloseTo(0.75, 1);
  });

  it("carries shoreline / historic / overlay attributes through, and merges polygons with the same key", () => {
    const k = key("NR", { shorelineDistrict: true, overlay: "X" });
    const r = computeZoneCoverage(parcel, [
      { key: k, rings: [square(-10, -10, 40, 200)] },
      { key: k, rings: [square(40, -10, 200, 200)] },
    ]);
    expect(r.zones).toHaveLength(1);
    expect(r.zones[0]).toMatchObject({ zoning: "NR", shorelineDistrict: true, overlay: "X" });
    expect(r.zones[0]!.fractionOfParcel).toBeCloseTo(1, 5);
  });

  it("a thin parcel and a non-rectangular (L-shaped) parcel are sampled correctly", () => {
    const thin = computeZoneCoverage(square(0, 0, 15, 100), [{ key: key("NR"), rings: [square(-5, -5, 7.5, 200)] }]);
    expect(thin.zones[0]!.fractionOfParcel).toBeCloseTo(0.5, 1);
    const l: [number, number][] = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100], [0, 0]];
    const r = computeZoneCoverage(l, [{ key: key("NR"), rings: [square(-5, -5, 50, 200)] }]);
    expect(r.zones[0]!.fractionOfParcel).toBeGreaterThan(0.5);
    expect(r.zones[0]!.fractionOfParcel).toBeLessThan(1);
  });
});

describe("retrievers (network mocked)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PIN-keyed retrievers report membership from the count, and fail (never guess) on a bad response", async () => {
    const respond = (body: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 500, statusText: ok ? "OK" : "ERR", json: async () => body }));
    vi.stubGlobal("fetch", respond({ count: 1 }));
    expect(await createSeattleFrequentTransitRetriever().retrieve({ parcelId: "1" } as never)).toEqual({ inFrequentTransitServiceArea: true });
    vi.stubGlobal("fetch", respond({ count: 0 }));
    expect(await createSeattleLandmarkRetriever().retrieve({ parcelId: "1" } as never)).toEqual({ isLandmarkParcel: false });
    vi.stubGlobal("fetch", respond({ unexpected: true }));
    await expect(createSeattleFrequentTransitRetriever().retrieve({ parcelId: "1" } as never)).rejects.toThrow(/shape validation/);
    vi.stubGlobal("fetch", respond({}, false));
    await expect(createSeattleLandmarkRetriever().retrieve({ parcelId: "1" } as never)).rejects.toThrow(/request failed/);
  });

  it("a PIN with a quote is escaped (no query injection)", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({ count: 0 }) }));
    vi.stubGlobal("fetch", f);
    await createSeattleLandmarkRetriever().retrieve({ parcelId: "1' OR '1'='1" } as never);
    const where = new URL((f.mock.calls[0] as unknown as [string])[0]).searchParams.get("where");
    expect(where).toBe("PIN='1'' OR ''1''=''1'");
  });

  it("the zoning retriever is tagged AUTHORITATIVE with the general-mapping caveat", () => {
    const r = createSeattleZoningRetriever();
    expect(r.factType).toBe("zoning");
    expect(r.evidenceQuality).toBe("AUTHORITATIVE");
    expect(r.qualityCaveat).toContain("not a legal determination");
  });
});
