/**
 * Deterministic (mocked, no network) tests for the Seattle ECA retriever's internal fan-out
 * (nfr-design.md §1's explicit test list) - the one genuinely new runtime pattern Unit 6B
 * introduces (concurrent Promise.allSettled fan-out + per-request AbortController timeout, with
 * caller-owned synchronous-error isolation).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLayerWithTimeout, fetchSeattleEcaFindings, createSeattleEcaRetriever } from "../../src/property-intelligence/seattle-eca.js";
import type { FetchLayer } from "../../src/property-intelligence/seattle-eca.js";

const PARCEL_BOUNDARY_RESPONSE = {
  spatialReference: { wkid: 2926, latestWkid: 2926 },
  features: [
    {
      attributes: { PIN: "4088801470" },
      geometry: {
        rings: [
          [
            [1274000, 240900],
            [1274100, 240900],
            [1274100, 241000],
            [1274000, 241000],
            [1274000, 240900],
          ],
        ],
      },
    },
  ],
};

function jsonResponse(body: unknown, ok = true, status = 200, statusText = "OK"): Response {
  return { ok, status, statusText, json: async () => body } as unknown as Response;
}

function intersectsResponse(hit: boolean, wkid: number | undefined = 2926): Response {
  return jsonResponse({ spatialReference: wkid !== undefined ? { wkid, latestWkid: wkid } : undefined, features: hit ? [{ attributes: { OBJECTID: 1 } }] : [] });
}

function stubParcelBoundaryFetch() {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(PARCEL_BOUNDARY_RESPONSE)));
}

describe("fetchLayerWithTimeout (direct test of the mechanism itself)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the signal and rejects when the deadline elapses, clearing the timer exactly once on the abort path", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    let clearTimeoutCalls = 0;
    const realClearTimeout = globalThis.clearTimeout;
    vi.stubGlobal("clearTimeout", (...args: Parameters<typeof clearTimeout>) => {
      clearTimeoutCalls++;
      return realClearTimeout(...args);
    });

    const neverSettles = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal!.addEventListener("abort", () => reject(new Error("AbortError")));
      });
    });
    vi.stubGlobal("fetch", neverSettles);

    const promise = fetchLayerWithTimeout("https://example.test/query", 5000);
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    expect(observedSignal?.aborted).toBe(true);
    expect(clearTimeoutCalls).toBe(1);
    vi.unstubAllGlobals();
  });

  it("clears the timer exactly once on the success path (resolves before the deadline)", async () => {
    let clearTimeoutCalls = 0;
    const realClearTimeout = globalThis.clearTimeout;
    vi.stubGlobal("clearTimeout", (...args: Parameters<typeof clearTimeout>) => {
      clearTimeoutCalls++;
      return realClearTimeout(...args);
    });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));

    await fetchLayerWithTimeout("https://example.test/query", 5000);
    expect(clearTimeoutCalls).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("fetchSeattleEcaFindings - fan-out isolation (mocked, deterministic)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("all layers succeed - every hazard resolves a real CriticalAreaFinding, none unavailable", async () => {
    stubParcelBoundaryFetch();
    const fetchLayer = vi.fn(async () => intersectsResponse(false));
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    expect(findings).toHaveLength(10);
    expect(findings.every((f) => f.mappedIntersectionResult !== undefined)).toBe(true);
  });

  it("sends the parcel polygon in a POST form body, never in the URL (a large parcel makes a GET query string too long for the service)", async () => {
    stubParcelBoundaryFetch();
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchLayer = vi.fn(async (url: string, _timeoutMs: number, init?: RequestInit) => {
      calls.push({ url, init });
      return intersectsResponse(false);
    });
    await fetchSeattleEcaFindings("4088801470", fetchLayer);
    expect(calls).toHaveLength(24); // 12 per-hazard layers (known slides has three) + the same 12 in the combined service
    for (const c of calls) {
      expect(c.url).not.toContain("?");
      expect(c.url).not.toContain("geometry");
      expect(c.init?.method).toBe("POST");
      const body = new URLSearchParams(String(c.init?.body));
      expect(body.get("spatialRel")).toBe("esriSpatialRelIntersects");
      expect(body.get("inSR")).toBe("2926");
      expect(body.get("returnGeometry")).toBe("false");
      expect(JSON.parse(body.get("geometry")!).rings[0]).toHaveLength(5);
    }
  });

  it("[regression, 2026-10-08] every hazard is queried at its real layer id, and the combined fallback is that same hazard's layer - not the flood layer", async () => {
    stubParcelBoundaryFetch();
    const urls: string[] = [];
    const fetchLayer = vi.fn(async (url: string) => {
      urls.push(url);
      return intersectsResponse(false);
    });
    await fetchSeattleEcaFindings("4088801470", fetchLayer);
    const expected: Record<string, number[]> = {
      Environmentally_Critical_Areas_Steep_Slope: [9],
      Environmentally_Critical_Areas_Known_Slides: [1, 2, 3],
      Environmentally_Critical_Areas_Potential_Slide_Areas: [7],
      Environmentally_Critical_Areas_Riparian_Corridors: [8],
      Environmentally_Critical_Areas_Wetlands: [10],
      ECA_Fish_and_Wildlife_Habitat_Conservation_Area: [11],
      ECA_Flood_Prone_Areas: [0],
      ECA_Landfills_Historical: [4],
      ECA_Liquefaction_Prone_Areas: [5],
      ECA_Peat_Settlement_Prone_Areas: [6],
    };
    for (const [service, ids] of Object.entries(expected)) {
      for (const id of ids) expect(urls.some((u) => u.includes(`/${service}/FeatureServer/${id}/query`)), `${service}/${id}`).toBe(true);
    }
    // The combined service is queried at every layer 0-11 (hazard-specific), not only at layer 0.
    for (let id = 0; id <= 11; id++) expect(urls.some((u) => u.includes(`/Environmentally_Critical_Areas_ECA/FeatureServer/${id}/query`)), `combined/${id}`).toBe(true);
  });

  it("[regression] a hazard whose own layer is unavailable is never reported as 'no intersection' on the strength of a different hazard's layer", async () => {
    stubParcelBoundaryFetch();
    // Wetland's own service fails; the combined service says the flood layer (0) intersects and everything else (including combined wetland, 10) fails too.
    const fetchLayer = vi.fn(async (url: string) => {
      if (url.includes("/Environmentally_Critical_Areas_Wetlands/")) throw new Error("down");
      if (url.includes("/Environmentally_Critical_Areas_ECA/FeatureServer/10/")) throw new Error("down");
      return intersectsResponse(url.includes("/FeatureServer/0/"));
    });
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    const wetland = findings.find((f) => f.hazardType === "wetland")!;
    expect(wetland.individualLayerResult).toBeUndefined();
    expect(wetland.combinedLayerResult).toBeUndefined();
    expect(wetland.mappedIntersectionResult).toBe("INDETERMINATE");
  });

  it("every persisted finding records the services and layer ids actually queried, and whether they answered (auditable provenance)", async () => {
    stubParcelBoundaryFetch();
    const fetchLayer = vi.fn(async (url: string) => {
      if (url.includes("/Environmentally_Critical_Areas_Wetlands/")) throw new Error("down");
      return intersectsResponse(false);
    });
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    const by = (h: string) => findings.find((f) => f.hazardType === h)!;
    expect(by("priority_habitat").sourceLayers).toEqual({
      individual: { service: "ECA_Fish_and_Wildlife_Habitat_Conservation_Area", layerIds: [11], answered: true },
      combined: { service: "Environmentally_Critical_Areas_ECA", layerIds: [11], answered: true },
    });
    expect(by("peat_settlement").sourceLayers!.individual).toEqual({ service: "ECA_Peat_Settlement_Prone_Areas", layerIds: [6], answered: true });
    expect(by("known_slides").sourceLayers!.individual.layerIds).toEqual([1, 2, 3]);
    // The wetland layer failed: recorded as not answered, and its combined layer (10) is the only source of its result.
    expect(by("wetland").sourceLayers).toEqual({
      individual: { service: "Environmentally_Critical_Areas_Wetlands", layerIds: [10], answered: false },
      combined: { service: "Environmentally_Critical_Areas_ECA", layerIds: [10], answered: true },
    });
    expect(by("wetland").individualLayerResult).toBeUndefined();
    expect(by("wetland").mappedIntersectionResult).toBe("INDETERMINATE");
  });

  it("a hazard with several layers (known slides) intersects when any one does, is clear only when all answered no, and is unavailable if one failed and none hit", async () => {
    stubParcelBoundaryFetch();
    const run = async (behaviour: (id: number) => Response | Error) => {
      const fetchLayer = vi.fn(async (url: string) => {
        const m = url.match(/\/Environmentally_Critical_Areas_Known_Slides\/FeatureServer\/(\d+)\/query/);
        if (!m) return intersectsResponse(false);
        const r = behaviour(Number(m[1]));
        if (r instanceof Error) throw r;
        return r;
      });
      return (await fetchSeattleEcaFindings("4088801470", fetchLayer)).find((f) => f.hazardType === "known_slides")!;
    };
    expect((await run((id) => (id === 2 ? intersectsResponse(true) : intersectsResponse(false)))).individualLayerResult).toBe(true);
    expect((await run(() => intersectsResponse(false))).individualLayerResult).toBe(false);
    expect((await run((id) => (id === 3 ? new Error("down") : intersectsResponse(false)))).individualLayerResult).toBeUndefined();
    expect((await run((id) => (id === 3 ? new Error("down") : id === 1 ? intersectsResponse(true) : intersectsResponse(false)))).individualLayerResult).toBe(true);
  });

  it("one layer's fetchLayerWithTimeout rejects while the rest succeed - that layer alone is unavailable, the fact stays usable", async () => {
    stubParcelBoundaryFetch();
    let call = 0;
    const fetchLayer = vi.fn(async (url: string) => {
      call++;
      if (url.includes("Environmentally_Critical_Areas_Wetlands")) {
        throw new Error("simulated AbortError - timed out");
      }
      return intersectsResponse(false);
    });
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    expect(findings).toHaveLength(10);
    const wetland = findings.find((f) => f.hazardType === "wetland")!;
    // Its individual layer never resolved - the direct proof of isolation. Corrected 2026-10-08: the result is INDETERMINATE (the combined service's
    // "no" is kept as supporting evidence only), never a clean NO_INTERSECTION for a hazard whose own layer did not answer.
    expect(wetland.individualLayerResult).toBeUndefined();
    expect(wetland.combinedLayerResult).toBe(false);
    expect(wetland.mappedIntersectionResult).toBe("INDETERMINATE");
    // every other hazard is unaffected
    const others = findings.filter((f) => f.hazardType !== "wetland");
    expect(others.every((f) => f.individualLayerResult === false && f.mappedIntersectionResult === "NO_INTERSECTION")).toBe(true);
    expect(call).toBeGreaterThan(1);
  });

  it("a non-2xx response for one layer isolates only that layer", async () => {
    stubParcelBoundaryFetch();
    const fetchLayer = vi.fn(async (url: string) => {
      if (url.includes("Environmentally_Critical_Areas_Steep_Slope")) {
        return jsonResponse({}, false, 503, "Service Unavailable");
      }
      return intersectsResponse(false);
    });
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    const steepSlope = findings.find((f) => f.hazardType === "steep_slope")!;
    expect(steepSlope.individualLayerResult).toBeUndefined();
  });

  it("a declared CRS other than 2926 for one layer isolates only that layer (fails closed, mirrors seattle-building-outlines.ts)", async () => {
    stubParcelBoundaryFetch();
    const fetchLayer = vi.fn(async (url: string) => {
      if (url.includes("ECA_Peat_Settlement_Prone_Areas")) {
        return intersectsResponse(true, 3857);
      }
      return intersectsResponse(false);
    });
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    const peat = findings.find((f) => f.hazardType === "peat_settlement")!;
    expect(peat.individualLayerResult).toBeUndefined();
  });

  it("every layer rejects - the fact-producing call still resolves (never promoted to a whole-fact throw), every hazard unavailable", async () => {
    stubParcelBoundaryFetch();
    const fetchLayer = vi.fn(async () => {
      throw new Error("simulated total failure");
    });
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    expect(findings).toHaveLength(10);
    expect(findings.every((f) => f.individualLayerResult === undefined)).toBe(true);
  });

  it("a plain, non-async layer operation that throws synchronously is still isolated (proves caller-owned wrapping, not callee convention)", async () => {
    stubParcelBoundaryFetch();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchLayer: any = (url: string) => {
      if (url.includes("Environmentally_Critical_Areas_Riparian_Corridors")) {
        throw new Error("synchronous throw, no promise ever returned");
      }
      return Promise.resolve(intersectsResponse(false));
    };
    const findings = await fetchSeattleEcaFindings("4088801470", fetchLayer);
    expect(findings).toHaveLength(10);
    const riparian = findings.find((f) => f.hazardType === "riparian_corridor")!;
    expect(riparian.individualLayerResult).toBeUndefined();
    const others = findings.filter((f) => f.hazardType !== "riparian_corridor");
    expect(others.every((f) => f.individualLayerResult === false)).toBe(true);
  });

  it("a genuine total-adapter failure (parcel boundary itself unavailable) throws, never silently producing an empty/partial fact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 503, "Service Unavailable")));
    await expect(fetchSeattleEcaFindings("4088801470", vi.fn())).rejects.toThrow();
  });

  it("createSeattleEcaRetriever produces a FactRetriever with GENERAL_LOCATION_ONLY evidence quality and a disclosed quality caveat", () => {
    const retriever = createSeattleEcaRetriever();
    expect(retriever.factType).toBe("environmental-constraints");
    expect(retriever.evidenceQuality).toBe("GENERAL_LOCATION_ONLY");
    expect(retriever.qualityCaveat).toMatch(/advisory/i);
  });
});
