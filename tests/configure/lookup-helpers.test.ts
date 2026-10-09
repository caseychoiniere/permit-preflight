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
    expect(interpretResolveResponse(true, { status: "CONFIRMED", confirmedParcel: { parcelId: "123" } })).toEqual({ kind: "CONFIRMED", parcelId: "123" });
    expect(interpretResolveResponse(false, { status: "CONFIRMED", confirmedParcel: { parcelId: "123" } }).kind).toBe("ERROR");
    for (const bad of [{ status: "CONFIRMED" }, { status: "CONFIRMED", confirmedParcel: null }, { status: "CONFIRMED", confirmedParcel: { parcelId: "" } }, { status: "CONFIRMED", confirmedParcel: { parcelId: 5 } }]) {
      expect(interpretResolveResponse(true, bad).kind).toBe("ERROR");
    }
  });
  it("clarification needs real candidates; otherwise it is the no-match message", () => {
    const ok = interpretResolveResponse(true, { status: "CLARIFICATION_REQUIRED", candidates: [{ parcelId: "1", canonicalAddress: "A" }], clarificationReason: "INSUFFICIENT_CORROBORATION" });
    expect(ok.kind).toBe("CLARIFY");
    for (const bad of [{ status: "CLARIFICATION_REQUIRED" }, { status: "CLARIFICATION_REQUIRED", candidates: [] }, { status: "CLARIFICATION_REQUIRED", candidates: [null] }, { status: "CLARIFICATION_REQUIRED", candidates: [{ nope: 1 }] }]) {
      const o = interpretResolveResponse(true, bad);
      expect(o).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH });
    }
  });
  it("no match and an unavailable source have their own copy", () => {
    expect(interpretResolveResponse(true, { status: "NO_MATCH" })).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH });
    expect(interpretResolveResponse(false, { status: "RESOLUTION_UNAVAILABLE" })).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE });
  });
});

describe("interpretBoundaryResponse", () => {
  const good = { boundaryPolygon: { points: [], srid: 2926 }, boundaryPolygonWgs84: [{ lng: 1, lat: 2 }], qualityCaveat: "c", existingStructures: [{ outlineId: "a" }] };
  it("accepts the documented shape", () => {
    const o = interpretBoundaryResponse(true, good);
    expect(o.kind).toBe("OK");
    if (o.kind === "OK") expect(o.data.existingStructures).toHaveLength(1);
  });
  it("tolerates a missing caveat or structure list", () => {
    const o = interpretBoundaryResponse(true, { boundaryPolygon: good.boundaryPolygon, boundaryPolygonWgs84: good.boundaryPolygonWgs84 });
    expect(o.kind).toBe("OK");
    if (o.kind === "OK") expect(o.data.existingStructures).toEqual([]);
  });
  it.each([...BAD_BODIES, ["a missing polygon", { qualityCaveat: "c" }], ["a wrongly typed polygon", { ...good, boundaryPolygonWgs84: "x" }]] as [string, unknown][])("%s -> a controlled error, no throw", (_l, body) => {
    expect(interpretBoundaryResponse(true, body)).toEqual({ kind: "ERROR", message: LOOKUP_ERROR_COPY.BOUNDARY });
  });
  it("a non-2xx response is an error even with a plausible body; a server-provided error message is kept", () => {
    expect(interpretBoundaryResponse(false, good).kind).toBe("ERROR");
    expect(interpretBoundaryResponse(false, { error: "Parcel not found." })).toEqual({ kind: "ERROR", message: "Parcel not found." });
  });
});
