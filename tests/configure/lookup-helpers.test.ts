/**
 * The parcel-lookup response interpreters (app/configure/lookup-helpers.ts): every shape that is not exactly the documented one becomes a controlled outcome with
 * customer-facing copy - never a thrown TypeError (which would leave the form permanently busy).
 */
import { describe, expect, it } from "vitest";
import { LOOKUP_ERROR_COPY, interpretBoundaryResponse, interpretResolveResponse } from "../../app/configure/lookup-helpers.js";

const BAD_BODIES: [string, unknown][] = [
  ["null", null],
  ["undefined", undefined],
  ["a string", "oops"],
  ["a number", 42],
  ["an array", []],
  ["an empty object", {}],
  ["a non-string status", { status: 7 }],
  ["an unknown status", { status: "SOMETHING_NEW" }],
];

describe("interpretResolveResponse", () => {
  it.each(BAD_BODIES)("%s -> a controlled error, no throw", (_label, body) => {
    for (const ok of [true, false]) {
      const o = interpretResolveResponse(ok, body);
      expect(o.kind).toBe("ERROR");
      if (o.kind === "ERROR") expect(o.message).toBe(LOOKUP_ERROR_COPY.UNAVAILABLE);
    }
  });
  it("a confirmed parcel needs an OK response and a parcel id", () => {
    expect(interpretResolveResponse(true, { status: "CONFIRMED", confirmedParcel: { parcelId: "123", source: "ADDRESS_GEOCODE" } })).toEqual({ kind: "CONFIRMED", parcelId: "123" });
    expect(interpretResolveResponse(false, { status: "CONFIRMED", confirmedParcel: { parcelId: "123", source: "ADDRESS_GEOCODE" } }).kind).toBe("ERROR");
    for (const bad of [{ status: "CONFIRMED" }, { status: "CONFIRMED", confirmedParcel: null }, { status: "CONFIRMED", confirmedParcel: { parcelId: "", source: "OTHER" } }, { status: "CONFIRMED", confirmedParcel: { parcelId: 5, source: "OTHER" } }, { status: "CONFIRMED", confirmedParcel: { parcelId: "1" } }, { status: "CONFIRMED", confirmedParcel: { parcelId: "1", source: "MADE_UP" } }]) {
      expect(interpretResolveResponse(true, bad).kind).toBe("ERROR");
    }
  });
  const CAND = { parcelId: "1", canonicalAddress: "9037 15TH AVE SW", source: "ADDRESS_GEOCODE", characteristics: {} };
  it("clarification needs real candidates AND a known reason; otherwise it is a controlled error", () => {
    const ok = interpretResolveResponse(true, { status: "CLARIFICATION_REQUIRED", candidates: [CAND], clarificationReason: "INSUFFICIENT_CORROBORATION" });
    expect(ok.kind).toBe("CLARIFY");
    if (ok.kind === "CLARIFY") expect(ok.reason.toLowerCase().replace(/_/g, " ")).toBe("insufficient corroboration"); // what the page renders
    for (const bad of [{ status: "CLARIFICATION_REQUIRED" }, { status: "CLARIFICATION_REQUIRED", candidates: [] }, { status: "CLARIFICATION_REQUIRED", candidates: [null] }, { status: "CLARIFICATION_REQUIRED", candidates: [{ nope: 1 }] }]) {
      expect(interpretResolveResponse(true, { ...bad, clarificationReason: "NO_PIN" })).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH });
    }
  });
  it("valid candidates with a missing, mistyped or unknown clarification reason are rejected (the page would otherwise throw rendering the reason)", () => {
    for (const reason of [undefined, null, 5, {}, "NOT_A_REASON", ""]) {
      const o = interpretResolveResponse(true, { status: "CLARIFICATION_REQUIRED", candidates: [CAND], ...(reason === undefined ? {} : { clarificationReason: reason }) });
      expect(o, String(reason)).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE });
    }
  });
  it("candidate fields the flow consumes are validated (id, optional address, known source, optional characteristics object)", () => {
    for (const bad of [{ ...CAND, parcelId: "" }, { ...CAND, parcelId: 7 }, { ...CAND, canonicalAddress: 5 }, { ...CAND, source: undefined }, { ...CAND, source: "MADE_UP" }, { ...CAND, characteristics: "x" }]) {
      expect(interpretResolveResponse(true, { status: "CLARIFICATION_REQUIRED", candidates: [CAND, bad], clarificationReason: "NO_PIN" }).kind).toBe("ERROR");
    }
    const noAddress = { parcelId: "2", source: "IDENTIFIER_LOOKUP" };
    expect(interpretResolveResponse(true, { status: "CLARIFICATION_REQUIRED", candidates: [noAddress], clarificationReason: "NO_PIN" }).kind).toBe("CLARIFY");
  });
  it("EVERY non-2xx resolve response is an error before its status is interpreted, whatever the body says", () => {
    for (const body of [
      { status: "CLARIFICATION_REQUIRED", candidates: [CAND], clarificationReason: "NO_PIN" },
      { status: "NO_MATCH" },
      { status: "CONFIRMED", confirmedParcel: CAND },
      { status: "RESOLUTION_UNAVAILABLE" },
      { error: "address is required." },
    ]) {
      expect(interpretResolveResponse(false, body)).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE });
    }
  });
  it("no match and an unavailable source have their own copy", () => {
    expect(interpretResolveResponse(true, { status: "NO_MATCH" })).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH });
    expect(interpretResolveResponse(false, { status: "RESOLUTION_UNAVAILABLE" })).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE });
  });
});

describe("interpretBoundaryResponse", () => {
  const ring = [{ lng: -122.35, lat: 47.52 }, { lng: -122.349, lat: 47.52 }, { lng: -122.349, lat: 47.521 }, { lng: -122.35, lat: 47.521 }];
  const good = {
    boundaryPolygon: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], srid: 2926 },
    boundaryPolygonWgs84: ring,
    qualityCaveat: "c",
    existingStructures: [{ outlineId: "a", footprintWgs84: ring, areaSqFt: 1200 }],
  };
  it("accepts the documented shape", () => {
    const o = interpretBoundaryResponse(true, good);
    expect(o.kind).toBe("OK");
    if (o.kind === "OK") expect(o.data.existingStructures).toHaveLength(1);
  });
  it("tolerates a missing caveat or structure list, and drops only a malformed building outline (optional display data)", () => {
    const o = interpretBoundaryResponse(true, { boundaryPolygon: good.boundaryPolygon, boundaryPolygonWgs84: ring });
    expect(o.kind).toBe("OK");
    if (o.kind === "OK") expect(o.data.existingStructures).toEqual([]);
    const mixed = interpretBoundaryResponse(true, { ...good, existingStructures: [good.existingStructures[0], { outlineId: "b", footprintWgs84: [{ lng: "x", lat: 1 }] }, null, { outlineId: "", footprintWgs84: ring }] });
    expect(mixed.kind === "OK" && mixed.data.existingStructures.map((x) => x.outlineId)).toEqual(["a"]);
  });
  it.each([...BAD_BODIES, ["a missing polygon", { qualityCaveat: "c" }]] as [string, unknown][])("%s -> a controlled error, no throw", (_l, body) => {
    expect(interpretBoundaryResponse(true, body)).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.BOUNDARY });
  });
  it("superficially plausible but structurally malformed geometry is rejected (the placement map and edge-role selection index into these rings)", () => {
    const badPolygons: unknown[] = [
      { points: [], srid: 2926 },
      { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], srid: 2926 }, // fewer than 3 points
      { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: "2", y: 3 }], srid: 2926 },
      { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: Number.NaN }], srid: 2926 },
      { points: good.boundaryPolygon.points }, // no srid
      { points: "not an array", srid: 2926 },
      [],
    ];
    for (const boundaryPolygon of badPolygons) expect(interpretBoundaryResponse(true, { ...good, boundaryPolygon }).kind, JSON.stringify(boundaryPolygon)).toBe("ERROR");
    const badRings: unknown[] = [[], [{ lng: 1, lat: 2 }], [{ lng: 1 }, { lng: 2 }, { lng: 3 }], [{ lng: -122, lat: 95 }, { lng: -122, lat: 1 }, { lng: -121, lat: 1 }], ["a", "b", "c"], [null, null, null], { 0: 1 }];
    for (const boundaryPolygonWgs84 of badRings) expect(interpretBoundaryResponse(true, { ...good, boundaryPolygonWgs84 }).kind, JSON.stringify(boundaryPolygonWgs84)).toBe("ERROR");
  });
  it("a non-2xx response is an error even with a plausible body; a server-provided error message is kept", () => {
    expect(interpretBoundaryResponse(false, good)).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.BOUNDARY });
    expect(interpretBoundaryResponse(false, { error: "Parcel not found." })).toEqual({ kind: "ERROR", message: "Parcel not found." });
  });
});
