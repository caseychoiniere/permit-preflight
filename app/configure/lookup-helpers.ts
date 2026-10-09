/**
 * Pure interpretation of the two parcel-lookup responses (address -> parcel, parcel -> boundary). Anything that is not exactly the documented shape - a non-2xx
 * status, a null or non-object body, a missing field, an unknown status - becomes a controlled outcome with customer-facing copy, never a thrown TypeError, so the
 * lookup state can always be cleared. Unit-tested without a DOM.
 */
import { CandidateParcelSource, ClarificationReason, ParcelResolutionStatus, type CandidateParcel } from "../../src/parcel-resolution/types.js";

export const LOOKUP_ERROR_COPY = {
  NO_MATCH: "We couldn't find a parcel for this address. Please check it and try again.",
  UNAVAILABLE: "We couldn't reach the parcel data source right now. Please try again in a moment.",
  BOUNDARY: "We couldn't load the parcel details right now. Please try again in a moment.",
  EMPTY: "Enter a property address to look up.",
} as const;

export type ResolveOutcome =
  | { kind: "CONFIRMED"; parcelId: string }
  | { kind: "CLARIFY"; candidates: CandidateParcel[]; reason: ClarificationReason }
  | { kind: "ERROR"; message: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const CLARIFICATION_REASONS: ReadonlySet<string> = new Set(Object.values(ClarificationReason));
const CANDIDATE_SOURCES: ReadonlySet<string> = new Set(Object.values(CandidateParcelSource));

/** A candidate exactly as the flow consumes it: an id, an optional canonical address, a known source, and (if present) an object of characteristics. */
function validCandidate(c: unknown): c is CandidateParcel {
  return (
    isObject(c) &&
    typeof c["parcelId"] === "string" &&
    c["parcelId"] !== "" &&
    (c["canonicalAddress"] === undefined || typeof c["canonicalAddress"] === "string") &&
    typeof c["source"] === "string" &&
    CANDIDATE_SOURCES.has(c["source"]) &&
    (c["characteristics"] === undefined || isObject(c["characteristics"]))
  );
}

export function interpretResolveResponse(httpOk: boolean, body: unknown): ResolveOutcome {
  const unavailable: ResolveOutcome = { kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE };
  // A non-2xx response is never interpreted as an outcome, whatever its body says.
  if (!httpOk || !isObject(body) || typeof body["status"] !== "string") return unavailable;
  const status = body["status"];
  if (status === ParcelResolutionStatus.CONFIRMED) {
    const confirmed = body["confirmedParcel"];
    return validCandidate(confirmed) ? { kind: "CONFIRMED", parcelId: confirmed.parcelId } : unavailable;
  }
  if (status === ParcelResolutionStatus.CLARIFICATION_REQUIRED) {
    const candidates = body["candidates"];
    const reason = body["clarificationReason"];
    if (!Array.isArray(candidates) || candidates.length === 0 || !candidates.every(validCandidate)) return { kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH };
    // The reason is shown to the customer; an absent or unknown one means the response is not trustworthy.
    if (typeof reason !== "string" || !CLARIFICATION_REASONS.has(reason)) return unavailable;
    return { kind: "CLARIFY", candidates, reason: reason as ClarificationReason };
  }
  if (status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE) return unavailable;
  if (status === ParcelResolutionStatus.NO_MATCH) return { kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH };
  return unavailable;
}

export interface GeoPoint {
  lng: number;
  lat: number;
}
export interface BoundaryStructure {
  outlineId: string;
  footprintWgs84: GeoPoint[];
  areaSqFt?: number;
}
export interface BoundaryData {
  /** SRID-tagged projected ring (SRID 2926), as the placement step's edge-role selection indexes it. */
  boundaryPolygon: { points: { x: number; y: number }[]; srid: number };
  /** The same ring in WGS84 for display. */
  boundaryPolygonWgs84: GeoPoint[];
  qualityCaveat: string | undefined;
  existingStructures: BoundaryStructure[];
}

export type BoundaryOutcome = { kind: "OK"; data: BoundaryData } | { kind: "ERROR"; message: string };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isGeoPoint = (p: unknown): p is GeoPoint => isObject(p) && finite(p["lng"]) && finite(p["lat"]) && Math.abs(p["lat"]) <= 90 && Math.abs(p["lng"]) <= 180;
const isRing = (r: unknown): r is GeoPoint[] => Array.isArray(r) && r.length >= 3 && r.every(isGeoPoint);

function validStructure(s: unknown): s is BoundaryStructure {
  return isObject(s) && typeof s["outlineId"] === "string" && s["outlineId"] !== "" && isRing(s["footprintWgs84"]) && (s["areaSqFt"] === undefined || finite(s["areaSqFt"]));
}

export function interpretBoundaryResponse(httpOk: boolean, body: unknown): BoundaryOutcome {
  const failed: BoundaryOutcome = { kind: "ERROR", message: LOOKUP_ERROR_COPY.BOUNDARY };
  if (!isObject(body)) return failed;
  if (typeof body["error"] === "string" && body["error"] !== "") return { kind: "ERROR", message: body["error"] };
  if (!httpOk) return failed;
  // The geometry is consumed as coordinates (edge roles index into the ring, the map draws it): validate the actual structure, not just "an object".
  const polygon = body["boundaryPolygon"];
  const points = isObject(polygon) ? polygon["points"] : undefined;
  if (!isObject(polygon) || !finite(polygon["srid"]) || !Array.isArray(points) || points.length < 3 || !points.every((p) => isObject(p) && finite(p["x"]) && finite(p["y"]))) return failed;
  if (!isRing(body["boundaryPolygonWgs84"])) return failed;
  return {
    kind: "OK",
    data: {
      boundaryPolygon: polygon as BoundaryData["boundaryPolygon"],
      boundaryPolygonWgs84: body["boundaryPolygonWgs84"],
      qualityCaveat: typeof body["qualityCaveat"] === "string" ? body["qualityCaveat"] : undefined,
      // Building outlines are optional display data: a malformed entry is dropped, the parcel itself is still usable.
      existingStructures: Array.isArray(body["existingStructures"]) ? body["existingStructures"].filter(validStructure) : [],
    },
  };
}
