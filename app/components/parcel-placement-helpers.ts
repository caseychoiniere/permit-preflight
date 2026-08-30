/**
 * Placement-step UX pass (2026-08-30, real-browser-testing follow-up) - pure, DOM-free logic
 * extracted out of ParcelPlacementMap.tsx/configure/page.tsx specifically so it's unit-testable
 * without a browser/DOM harness (this repo has no @testing-library/jsdom infrastructure - see
 * tests/components/parcel-placement-helpers.test.ts for what IS covered this way, and the
 * corresponding audit.md entry for what remains manual-browser-only).
 *
 * Nothing here computes a regulatory result or a value ever submitted to the server as an
 * authoritative fact - every function is a UI-only suggestion/validation helper. The real
 * setback/lot-line computation remains entirely server-side (PostGIS), and the real
 * ASSIGNED/INSUFFICIENT lot-line-role business rule (screening-request/types.ts /
 * spatial-analysis/lot-line-roles.ts) is untouched by anything in this file.
 */

import type { GeographicPoint } from "../../src/spatial-analysis/types.js";

const METERS_PER_DEGREE_LAT = 111_320;

export function metersPerDegreeLng(atLat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180);
}

export function toLocalMeters(p: GeographicPoint, refLat: number): { x: number; y: number } {
  return { x: p.lng * metersPerDegreeLng(refLat), y: p.lat * METERS_PER_DEGREE_LAT };
}

const FEET_TO_METERS = 0.3048;

function offsetByFeet(origin: GeographicPoint, eastFt: number, northFt: number): GeographicPoint {
  const dLat = (northFt * FEET_TO_METERS) / METERS_PER_DEGREE_LAT;
  const dLng = (eastFt * FEET_TO_METERS) / metersPerDegreeLng(origin.lat);
  return { lng: origin.lng + dLng, lat: origin.lat + dLat };
}

/** Same rotate-then-offset math as buildFootprintInProjectedCrs (postgis-adapter.ts) - applied
 * here in the approximate local-feet space above instead of the server's real projected CRS,
 * purely so the preview's shape/orientation logic matches the authoritative one, not because this
 * output is used for anything but drawing. UI-ONLY - never touches what's submitted to the server
 * (ParcelPlacementMap.tsx submits the plain anchor/orientationDeg exactly as MapLibre/the nudge
 * buttons produce them, never a value derived from this approximation). */
export function footprintPreviewRing(anchor: GeographicPoint, widthFt: number, depthFt: number, orientationDeg: number): GeographicPoint[] {
  const rad = (orientationDeg * Math.PI) / 180;
  const hw = widthFt / 2;
  const hd = depthFt / 2;
  const corners = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return corners.map((c) => offsetByFeet(anchor, c.x * Math.cos(rad) - c.y * Math.sin(rad), c.x * Math.sin(rad) + c.y * Math.cos(rad)));
}

/**
 * Real bug fix (2026-08-30, Placement-step rehydration regression): builds the exact GeoJSON the
 * shed-footprint MapLibre source should hold for a given anchor - the SINGLE implementation used
 * by BOTH the source's initial `addSource` data AND the ongoing sync effect that keeps it current
 * as anchor/orientation/dimensions change (ParcelPlacementMap.tsx). Previously the initial
 * `addSource` call was hardcoded to an empty FeatureCollection, relying entirely on a separate
 * effect to fill it in on mount - but that effect's first run raced against MapLibre's
 * asynchronous "style.load" event and lost whenever a placement already existed at mount time
 * (e.g. returning to Placement via "Previous" after visiting Review): the source didn't exist yet
 * when the effect ran, it bailed out, and never got a second chance since none of its dependencies
 * change again on their own once already correctly restored. Using this ONE function in both
 * places closes that race - the source is correct from the very first paint, with no separate
 * "restore" step required. `null` anchor (nothing placed yet) is a real, valid empty
 * FeatureCollection, not an error.
 */
export function shedFootprintGeoJson(anchor: GeographicPoint | null, widthFt: number, depthFt: number, orientationDeg: number): GeoJSON.FeatureCollection | GeoJSON.Feature {
  if (!anchor) return { type: "FeatureCollection", features: [] };
  const ring = footprintPreviewRing(anchor, widthFt, depthFt, orientationDeg);
  const closedRing = [...ring, ring[0]!].map((p): [number, number] => [p.lng, p.lat]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [closedRing] } };
}

export interface EdgeSegment {
  edgeRef: string;
  a: GeographicPoint;
  b: GeographicPoint;
}

/** Same edge-i = points[i]->points[(i+1)%n] naming convention edgeRefsForPolygon (spatial-analysis/
 * lot-line-roles.ts) already uses everywhere else in this codebase - never a second, drifting
 * convention. */
export function edgeSegments(points: GeographicPoint[]): EdgeSegment[] {
  const n = points.length;
  return points.map((p, i) => ({ edgeRef: `edge-${i}`, a: p, b: points[(i + 1) % n]! }));
}

function midpoint(a: GeographicPoint, b: GeographicPoint): GeographicPoint {
  return { lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 };
}

function localVector(a: GeographicPoint, b: GeographicPoint, refLat: number): { x: number; y: number } {
  const pa = toLocalMeters(a, refLat);
  const pb = toLocalMeters(b, refLat);
  return { x: pb.x - pa.x, y: pb.y - pa.y };
}

/**
 * Deterministic REAR-edge suggestion, given an already-established front edge. Scores every other
 * edge by a combination of (a) distance from the front edge's midpoint, normalized by the front
 * edge's own length so parcel scale doesn't skew the comparison, and (b) how nearly PARALLEL the
 * candidate is to the front edge (a real rear lot line is typically parallel to the front, even on
 * an irregular, more-than-4-sided parcel) - never by edge index/order alone, and never a hardcoded
 * "farthest wins" rule that a non-parallel-but-distant edge could win by accident.
 *
 * For an ordinary 4-edge rectangle this naturally selects the true opposite edge (it is both
 * farthest AND most parallel) - the same result the prior simpler "farthest edge" heuristic already
 * produced for that common case, so no regression there. For an irregular polygon it produces a
 * single, reproducible candidate rather than an arbitrary/undefined one.
 *
 * This is a UI-only SUGGESTION, exactly like autoDetectFrontRear's own front guess - it asserts
 * nothing about regulatory front/rear status; the existing isOpposite/n===4 business rule
 * (ParcelPlacementMap.tsx's onLotLineRolesChange effect) still independently decides
 * ASSIGNED vs. INSUFFICIENT from whatever edge (suggested or user-picked) ends up selected.
 */
export function detectRearEdge(points: GeographicPoint[], frontEdgeRef: string): string | null {
  if (points.length < 2) return null;
  const segments = edgeSegments(points);
  const front = segments.find((s) => s.edgeRef === frontEdgeRef);
  if (!front || segments.length < 2) return null;

  const refLat = points[0]!.lat;
  const frontMid = midpoint(front.a, front.b);
  const frontMidLocal = toLocalMeters(frontMid, refLat);
  const frontVec = localVector(front.a, front.b, refLat);
  const frontLen = Math.hypot(frontVec.x, frontVec.y);
  if (frontLen === 0) return null;

  let best: string | null = null;
  let bestScore = -Infinity;
  for (const seg of segments) {
    if (seg.edgeRef === frontEdgeRef) continue;
    const mid = midpoint(seg.a, seg.b);
    const midLocal = toLocalMeters(mid, refLat);
    const distMeters = Math.hypot(midLocal.x - frontMidLocal.x, midLocal.y - frontMidLocal.y);
    const vec = localVector(seg.a, seg.b, refLat);
    const vecLen = Math.hypot(vec.x, vec.y);
    // |cos(angle)| between the two edge direction vectors - 1 means exactly parallel (either
    // orientation), 0 means perpendicular. Never signed - a rear edge "facing the opposite way"
    // (as every real rear edge of a convex polygon does) must score exactly as well as one facing
    // the same way.
    const parallelism = vecLen === 0 ? 0 : Math.abs((vec.x * frontVec.x + vec.y * frontVec.y) / (vecLen * frontLen));
    const normalizedDistance = distMeters / frontLen;
    const score = normalizedDistance * 0.6 + parallelism * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = seg.edgeRef;
    }
  }
  return best;
}

export interface StructureAreaLike {
  outlineId: string;
  areaSqFt?: number;
}

/**
 * The initial "suggested main house" - the single largest returned footprint by area, purely a UI
 * starting point (requirement 4's own "IMPORTANT PROVENANCE RULE"). Callers MUST NOT persist this
 * as classification: PRIMARY_DWELLING/classificationBasis: USER_CONFIRMED on its own - only an
 * explicit user confirmation (selecting it, or any other footprint, or "I'm not sure") produces a
 * real DwellingSelection; this function never does. Returns null when there is nothing to suggest
 * (zero footprints) or exactly one (nothing to "suggest" over - the existing single-building Yes/No
 * flow already covers that case identically, so this only meaningfully changes behavior for 2+).
 */
export function suggestLargestStructure(structures: StructureAreaLike[]): string | null {
  if (structures.length < 2) return null;
  return structures.reduce((max, s) => ((s.areaSqFt ?? 0) > (max.areaSqFt ?? 0) ? s : max)).outlineId;
}

/**
 * Color-semantics correction (2026-08-30, real-browser-testing follow-up) - the single source of
 * truth both the number-badge overlay and the MapLibre paint expression (buildingColorExpression,
 * ParcelPlacementMap.tsx) derive from, so they can never disagree about which of the three visual
 * states a given footprint is in. CONFIRMED always wins over SUGGESTED even for the same
 * outlineId - the founder's own explicit rule ("the largest-building heuristic may still choose
 * the initially suggested building, but it must NOT use the same visual treatment as a confirmed
 * primary dwelling" is satisfied precisely because the caller only ever passes a non-null
 * suggestedOutlineId while dwellingSelection is still null - see suggestLargestStructure's own
 * "cleared the instant the user answers" contract in ParcelPlacementMap.tsx - so in practice a
 * single outlineId is never simultaneously "the suggestion" and "the confirmed selection," but this
 * function's own precedence order is the actual guarantee, not an assumption about caller
 * discipline.
 */
export type BuildingVisualState = "confirmed" | "suggested" | "ordinary";

export function resolveBuildingVisualState(outlineId: string, selectedOutlineId: string | null, suggestedOutlineId: string | null): BuildingVisualState {
  if (selectedOutlineId !== null && outlineId === selectedOutlineId) return "confirmed";
  if (suggestedOutlineId !== null && outlineId === suggestedOutlineId) return "suggested";
  return "ordinary";
}

export interface PlacementCompletenessInput {
  /** null = the front/rear picking process has not concluded yet (still mid-selection, or never
   * started). Once the user reaches a definite outcome - ASSIGNED (opposite-edge rule satisfied) OR
   * INSUFFICIENT (a real, honest "cannot establish" outcome, e.g. an irregular parcel) - this is the
   * non-null LotLineSelection the existing onLotLineRolesChange effect already produces. Both
   * outcomes count as "decided": INSUFFICIENT is not a blocker (BR-U2-9 fail-closed-on-claims), it's
   * a legitimate, disclosed result the report already handles (REQUIRES_VERIFICATION for
   * lot-line-dependent findings) - conflating "decided but INSUFFICIENT" with "not yet decided"
   * would make Next impossible to ever enable for any non-4-sided parcel, which is not the intent. */
  lotLineDecided: boolean;
  hasPlacement: boolean;
  /** existingStructures.length > 0 - if there was never anything to ask about, the dwelling
   * question is vacuously answered and never blocks Next. */
  hasBuildingsToAskAbout: boolean;
  /** dwellingSelection !== null - true for BOTH a real footprint pick AND an explicit "I'm not
   * sure/none of these." The initial largest-footprint SUGGESTION alone (never confirmed) must NOT
   * count as answered - callers must pass false here until the user actually interacts. */
  dwellingAnswered: boolean;
}

export interface PlacementCompletenessResult {
  complete: boolean;
  /** Human-readable, in a stable, sensible order - only the items still missing, never the ones
   * already satisfied (item 10's "only show whichever items remain incomplete"). */
  missing: string[];
}

/** The single source of truth for "is the Placement step actually done" - both the Next-button's
 * disabled state and the "Before continuing:" checklist read from this SAME function, so they can
 * never disagree with each other. */
export function checkPlacementCompleteness(input: PlacementCompletenessInput): PlacementCompletenessResult {
  const missing: string[] = [];
  if (!input.lotLineDecided) missing.push("Confirm the front and rear lot lines");
  if (!input.hasPlacement) missing.push("Place the shed on the map");
  if (input.hasBuildingsToAskAbout && !input.dwellingAnswered) missing.push('Confirm your main house, or choose "I\'m not sure"');
  return { complete: missing.length === 0, missing };
}
