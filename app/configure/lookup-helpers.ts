/**
 * Pure interpretation of the two parcel-lookup responses (address -> parcel, parcel -> boundary). Anything that is not exactly the documented shape - a non-2xx
 * status, a null or non-object body, a missing field, an unknown status - becomes a controlled outcome with customer-facing copy, never a thrown TypeError, so the
 * lookup state can always be cleared. Unit-tested without a DOM.
 */
import { ParcelResolutionStatus, type CandidateParcel, type ClarificationReason } from "../../src/parcel-resolution/types.js";

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

export function interpretResolveResponse(httpOk: boolean, body: unknown): ResolveOutcome {
  if (!isObject(body) || typeof body["status"] !== "string") return { kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE };
  const status = body["status"];
  if (status === ParcelResolutionStatus.CONFIRMED) {
    const confirmed = body["confirmedParcel"];
    const parcelId = isObject(confirmed) ? confirmed["parcelId"] : undefined;
    return httpOk && typeof parcelId === "string" && parcelId !== "" ? { kind: "CONFIRMED", parcelId } : { kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE };
  }
  if (status === ParcelResolutionStatus.CLARIFICATION_REQUIRED) {
    const candidates = body["candidates"];
    if (Array.isArray(candidates) && candidates.length > 0 && candidates.every((c) => isObject(c) && typeof c["parcelId"] === "string")) {
      return { kind: "CLARIFY", candidates: candidates as CandidateParcel[], reason: body["clarificationReason"] as ClarificationReason };
    }
    return { kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH };
  }
  if (status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE) return { kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE };
  if (status === ParcelResolutionStatus.NO_MATCH) return { kind: "ERROR", message: LOOKUP_ERROR_COPY.NO_MATCH };
  return { kind: "ERROR", message: LOOKUP_ERROR_COPY.UNAVAILABLE };
}

export interface BoundaryData {
  boundaryPolygon: unknown;
  boundaryPolygonWgs84: unknown;
  qualityCaveat: string | undefined;
  existingStructures: unknown[];
}

export type BoundaryOutcome = { kind: "OK"; data: BoundaryData } | { kind: "ERROR"; message: string };

export function interpretBoundaryResponse(httpOk: boolean, body: unknown): BoundaryOutcome {
  if (!isObject(body)) return { kind: "ERROR", message: LOOKUP_ERROR_COPY.BOUNDARY };
  if (typeof body["error"] === "string" && body["error"] !== "") return { kind: "ERROR", message: body["error"] };
  if (!httpOk || !isObject(body["boundaryPolygon"]) || !Array.isArray(body["boundaryPolygonWgs84"])) return { kind: "ERROR", message: LOOKUP_ERROR_COPY.BOUNDARY };
  return {
    kind: "OK",
    data: {
      boundaryPolygon: body["boundaryPolygon"],
      boundaryPolygonWgs84: body["boundaryPolygonWgs84"],
      qualityCaveat: typeof body["qualityCaveat"] === "string" ? body["qualityCaveat"] : undefined,
      existingStructures: Array.isArray(body["existingStructures"]) ? body["existingStructures"] : [],
    },
  };
}
