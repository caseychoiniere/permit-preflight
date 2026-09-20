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
    // Its individual layer never resolved - the direct proof of isolation. resolveCriticalAreaFinding
    // (existing, unmodified) still derives a real classification from the combined-layer fallback
    // (BR-5.1: individualLayerResult undefined + combinedLayerResult false -> NO_INTERSECTION) -
    // it is not thrown away or left blank.
    expect(wetland.individualLayerResult).toBeUndefined();
    expect(wetland.mappedIntersectionResult).toBe("NO_INTERSECTION");
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
