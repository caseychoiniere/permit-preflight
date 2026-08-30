"use client";

/**
 * ParcelPlacementMap (PC-2, Workflow 2, frontend-components.md). Deliberately minimal per the
 * approved correction: a single re-placeable anchor + rotation for the shed footprint, plus two
 * edge-role taps (front, rear) - no dimension handles, no polygon editing, no automatic frontage
 * detection (frontage detection was added 2026-08-28; see below).
 *
 * CRS contract (Code Generation correction, 2026-08-23): this component submits the placement
 * anchor exactly as MapLibre produces it - WGS84 (EPSG:4326) longitude/latitude, straight from
 * `e.lngLat`. It performs NO coordinate conversion for SUBMISSION (the previous local flat-earth
 * degrees-to-feet approximation used for that purpose has been removed entirely - see production-
 * boundary tests). The server is the only place this ever becomes a projected/feet coordinate, via
 * PostGIS's own ST_Transform. This component also never computes or submits a setback distance -
 * the map displays; PostGIS computes. The keyboard-nudge and footprint-preview math below is a
 * separate, clearly-scoped exception to that "no conversion" rule - see their own docstrings for
 * why a local approximation is appropriate there and never touches what's submitted.
 *
 * UX pass (2026-08-30, real-browser-testing findings) - this is the second major UX correction on
 * this component; the numbered-edge-button design from 2026-08-27/28 (see prior git history) was
 * found, in real use, to be unusable: customers were expected to mentally match numeric edge
 * indices between the map and a button list. This pass:
 *   1. removes every customer-facing numeric edge identifier - edges are now labeled FRONT/REAR by
 *      color+text only; internal edgeRef strings ("edge-0", ...) remain in state/data, never shown.
 *   2. adds a deterministic REAR-edge suggestion (app/components/parcel-placement-helpers.ts's
 *      detectRearEdge) once FRONT is established - distance-from-front AND parallelism, not a
 *      hardcoded "farthest wins" or edge-index assumption.
 *   3. replaces the numbered-button correction UI with an explicit "Edit lot lines" -> "Set
 *      front"/"Set rear"/"Done" flow - no numeric IDs anywhere in that UI either.
 *   4. adds a largest-footprint "suggested main house" starting point for multi-building parcels
 *      (parcel-placement-helpers.ts's suggestLargestStructure) - a UI suggestion ONLY; it is never
 *      persisted as classification: PRIMARY_DWELLING/classificationBasis: USER_CONFIRMED until the
 *      user explicitly confirms it (or picks a different building, or says "not sure") - see
 *      dwellingSelection's own null-until-answered contract, unchanged from the prior pass.
 *   5. fixes a real event-ordering bug: the generic (place-the-shed) map click handler was
 *      registered BEFORE the layer-scoped edge/building click handlers (it sits outside
 *      "style.load", which fires asynchronously after those layer handlers are registered) -
 *      MapLibre dispatches same-event listeners in registration order, so a click on a building
 *      polygon could set the shed anchor at that same point BEFORE the building handler's own
 *      e.preventDefault() had a chance to suppress it. Fixed by moving the generic handler's
 *      registration to occur inside "style.load", AFTER every layer-scoped handler.
 *   6. makes the shed draggable (mousedown/touchstart on the footprint -> live-updates anchor on
 *      move -> commits on release), disabling the map's own drag-pan for the gesture's duration so
 *      the two don't fight - the standard MapLibre "drag a feature" pattern (e.preventDefault() on
 *      the layer-scoped mousedown/touchstart, plus an explicit dragPan.disable()/enable() pair).
 *   7. reduces the keyboard nudge step from ~5ft to ~1ft (finer control).
 *   8. restructures into a responsive two-column layout on wide screens (sticky map on the left,
 *      controls on the right) so the map stays visible while adjusting placement/rotation - narrow
 *      screens keep the original single-column stacked flow.
 *   9. makes the movement controls a compact directional pad instead of a tall stack.
 * None of this touches the authoritative server-side computation (PostGIS remains the sole source
 * of truth for every distance/geometry a report actually relies on) or the persisted data shapes
 * (PlacementSelection/LotLineSelection/DwellingSelection are unchanged).
 *
 * Interaction/state pass (2026-08-30, real-browser-testing follow-up to the pass above):
 *   a. removed the "Edit lot lines" mode-toggle/"Done" step - the Lot lines card now ALWAYS shows
 *      independent, single-shot "Set front"/"Set rear" buttons and never unmounts while a
 *      selection is in progress (a real, reported bug - the card previously disappeared the
 *      instant a Set-front/Set-rear click started).
 *   b. dropped the largest-footprint suggestion's distinct amber map fill - it now looks
 *      identical to an ordinary unconfirmed building (plain slate), with only a subtle dashed
 *      ring on its number badge and the "(suggested)"/intro copy communicating the suggestion -
 *      never the same visual treatment as a confirmed (violet) dwelling, and never the shed's own
 *      orange. This was a real point of user confusion: the amber highlight read as "already
 *      selected" even though nothing had been confirmed yet.
 *   c. added numbered map markers for multi-building parcels, matching "Building N"'s exact
 *      position-based numbering - the map and the button list can no longer disagree about which
 *      number means which footprint.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeographicPoint, Polygon } from "../../src/spatial-analysis/types.js";
import { edgeRefsForPolygon } from "../../src/spatial-analysis/lot-line-roles.js";
import { LotLineRoleStatus } from "../../src/screening-request/types.js";
import { Button } from "./ui/Button.js";
import { detectRearEdge, suggestLargestStructure, resolveBuildingVisualState, shedFootprintGeoJson } from "./parcel-placement-helpers.js";

export interface PlacementSelection {
  anchor: GeographicPoint;
  orientationDeg: number;
}

export interface LotLineSelection {
  status: typeof LotLineRoleStatus.ASSIGNED | typeof LotLineRoleStatus.INSUFFICIENT;
  frontEdgeRef?: string;
  rearEdgeRef?: string;
  sideEdgeRefs?: string[];
}

/** Building intelligence v1 - one existing building footprint, already reduced to display-only
 * WGS84 data by the server (app/api/parcels/[pin]/boundary/route.ts). `outlineId` is Seattle
 * Building Outlines 2023's own internal id - never shown to the user directly (see
 * buildingLabel below), only round-tripped back on selection. */
export interface ExistingStructureDisplay {
  outlineId: string;
  footprintWgs84: GeographicPoint[];
  areaSqFt?: number;
}

export interface DwellingSelection {
  status: "SELECTED" | "UNKNOWN";
  outlineId?: string;
}

interface Props {
  /** Already in WGS84 (EPSG:4326) - the server transforms this for display before the frontend
   * ever sees it (spatial-analysis/postgis-adapter.ts's transformPolygonToWgs84), so this
   * component never needs its own reprojection logic. */
  boundaryPolygonWgs84: GeographicPoint[];
  /** The authoritative-CRS polygon, used only to determine edge count/refs for role selection -
   * never for coordinate math (point order is identical between the two representations, since
   * reprojection preserves vertex order/count). */
  boundaryPolygon: Polygon;
  /** Display only - the shed-footprint preview outline. Never sent to the server by this
   * component; configure/page.tsx already collects and submits these separately as part of
   * project-details. */
  widthFt: number;
  depthFt: number;
  onPlacementChange: (placement: PlacementSelection) => void;
  onLotLineRolesChange: (selection: LotLineSelection) => void;
  /** Building intelligence v1 - real building footprints on this parcel (Seattle Building Outlines
   * 2023), already WGS84-transformed server-side. Omitted/empty means "none available" - no
   * dwelling-confirmation UI is shown at all in that case (never a dead-end prompt for nothing to
   * choose from). */
  existingStructures?: ExistingStructureDisplay[];
  /** Fires only once the user has actually answered (SELECTED a footprint, or explicitly said they
   * can't tell/none apply) - mirrors onPlacementChange/onLotLineRolesChange's own "only fire on a
   * real answer" convention. Absent entirely when existingStructures is empty. The initial
   * largest-footprint SUGGESTION alone never fires this - only an explicit click does. */
  onDwellingSelectionChange?: (selection: DwellingSelection) => void;
  initialDwellingSelection?: DwellingSelection;
  /** Seeds this component's own internal state (anchor/orientation/front-rear edges) when it
   * remounts already knowing a prior answer - e.g. the user used a "Previous" step-navigation
   * button to leave PLACEMENT and came back to it. Without this, the parent's own placement/
   * lotLineSelection state is still correct and would still be submitted unchanged if the user
   * simply continued, but the map itself would misleadingly show an unplaced/unselected state.
   * Optional and only ever used to compute this component's initial useState values - never
   * re-applied on a later prop change, matching how every other "seed once" pattern in this app
   * already behaves. */
  initialPlacement?: PlacementSelection;
  initialLotLineSelection?: LotLineSelection;
}

const MAPTILER_STYLE_URL = process.env.NEXT_PUBLIC_MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
  : undefined;

const FRONT_COLOR = "#16a34a"; // green
const REAR_COLOR = "#dc2626"; // red
const DEFAULT_EDGE_COLOR = "#2563eb"; // blue - matches the existing parcel-boundary color
const FOOTPRINT_COLOR = "#ea580c"; // orange - visually distinct from the parcel boundary/edges
// Color semantics correction (2026-08-30, real-browser-testing follow-up): a SUGGESTED-but-
// unconfirmed building previously got its own amber fill, which read as "already selected" to
// real users (too close to the shed's own orange, and a distinct highlight color at all implied
// more certainty than a plain UI suggestion warrants). Now there are only two map fill states:
// confirmed (violet) and everything else, including the suggestion, which is visually identical to
// an ordinary unconfirmed building (slate) - "suggested" is communicated ONLY via the button label
// ("Building N (suggested)"), the intro copy, and a subtle dashed ring on that building's number
// badge (buildingLabelPositions below) - never a distinct map fill/line color, so it can never be
// mistaken for a confirmed classification.
const BUILDING_COLOR = "#64748b"; // slate - ordinary AND suggested-but-unconfirmed (same fill)
const BUILDING_SELECTED_COLOR = "#7c3aed"; // violet - the user-confirmed primary dwelling ONLY

function buildingColorExpression(selectedOutlineId: string | null): maplibregl.ExpressionSpecification {
  return ["case", ["==", ["get", "outlineId"], selectedOutlineId ?? ""], BUILDING_SELECTED_COLOR, BUILDING_COLOR];
}

/** Same expression, reused for both the edge-line layer's paint and the label layer's text color -
 * keeps the map highlight and the on-map badges visually consistent. */
function edgeColorExpression(frontEdgeRef: string | null, rearEdgeRef: string | null): maplibregl.ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "edgeRef"], frontEdgeRef ?? ""],
    FRONT_COLOR,
    ["==", ["get", "edgeRef"], rearEdgeRef ?? ""],
    REAR_COLOR,
    DEFAULT_EDGE_COLOR,
  ];
}

function edgeWidthExpression(frontEdgeRef: string | null, rearEdgeRef: string | null): maplibregl.ExpressionSpecification {
  return [
    "case",
    ["any", ["==", ["get", "edgeRef"], frontEdgeRef ?? ""], ["==", ["get", "edgeRef"], rearEdgeRef ?? ""]],
    6,
    4,
  ];
}

// --- Local flat-earth approximation, UI-ONLY ---------------------------------------------------
// Used exclusively for display/input-affordance purposes: (1) how far a keyboard "move" button
// nudges the placement point, (2) where to draw the shed-footprint PREVIEW outline, and (3) live
// drag feedback. Neither of these ever produces a value this component submits - onPlacementChange
// still receives the anchor/orientationDeg exactly as MapLibre itself reports it (either straight
// from e.lngLat on a map click/drag, or as computed by the nudge function below, itself just a
// small delta applied to that same anchor - never a value derived by transforming through a
// different CRS). The authoritative footprint-in-projected-CRS computation remains entirely
// server-side (buildFootprintInProjectedCrs, via real PostGIS ST_Transform) and is completely
// untouched. At residential-lot scale (tens of feet), the equirectangular approximation used here
// is visually exact for a "does the shed look approximately right" preview - it is never asserted
// as, or used as, a survey-grade calculation.
const FEET_TO_METERS = 0.3048;
const METERS_PER_DEGREE_LAT = 111_320;
const NUDGE_STEP_FT = 1;

function metersPerDegreeLng(atLat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180);
}

function offsetByFeet(origin: GeographicPoint, eastFt: number, northFt: number): GeographicPoint {
  const dLat = (northFt * FEET_TO_METERS) / METERS_PER_DEGREE_LAT;
  const dLng = (eastFt * FEET_TO_METERS) / metersPerDegreeLng(origin.lat);
  return { lng: origin.lng + dLng, lat: origin.lat + dLat };
}

type NudgeDirection = "N" | "S" | "E" | "W";
function nudge(origin: GeographicPoint, direction: NudgeDirection, stepFt: number): GeographicPoint {
  switch (direction) {
    case "N":
      return offsetByFeet(origin, 0, stepFt);
    case "S":
      return offsetByFeet(origin, 0, -stepFt);
    case "E":
      return offsetByFeet(origin, stepFt, 0);
    case "W":
      return offsetByFeet(origin, -stepFt, 0);
  }
}

// footprintPreviewRing/shedFootprintGeoJson moved to parcel-placement-helpers.ts (2026-08-30,
// Placement-step rehydration bug fix) so shedFootprintGeoJson - the actual regression-relevant
// logic - is directly unit-testable and has exactly ONE implementation (imported above), never a
// second copy that could silently drift from what's used at addSource time vs. sync-effect time.

function centroid(points: GeographicPoint[]): GeographicPoint {
  const sum = points.reduce((acc, p) => ({ lng: acc.lng + p.lng, lat: acc.lat + p.lat }), { lng: 0, lat: 0 });
  return { lng: sum.lng / points.length, lat: sum.lat / points.length };
}
// -------------------------------------------------------------------------------------------

// --- Nearest-street FRONT auto-detection, UI-ONLY (2026-08-28; REAR delegated to
// parcel-placement-helpers.ts's detectRearEdge as of the 2026-08-30 UX pass) --------------------
// A starting guess only - never a substitute for the user's own confirmation. Uses the basemap's
// own already-rendered road geometry (queried live via MapLibre's queryRenderedFeatures, real
// OpenStreetMap-derived linework from the MapTiler vector tiles already loaded for display) as the
// "nearest street" signal, since this app has no dedicated street-centerline data source and no
// geocoded address point to compare against - fabricating a guess with no geometric basis at all
// would violate this app's own fail-closed discipline, so if no road geometry is currently
// rendered (blank fallback style, or genuinely no nearby road on the tiles queried), this
// intentionally does nothing and leaves the existing fully-manual selection flow untouched.
// Restricted to vehicle-street layers (arterials/collectors/local streets) - deliberately excludes
// road_service_track (driveways/alleys - already a distinct concept via the "alley-adjacent"
// checkbox) and road_path_pedestrian (footpaths, not street frontage).
const ROAD_LAYER_IDS = ["road_motorway", "road_motorway_link", "road_trunk_primary", "road_trunk_primary_link", "road_secondary_tertiary", "road_minor", "road_link"];

interface EdgeMidpoint {
  edgeRef: string;
  lng: number;
  lat: number;
}

function toLocalMeters(p: GeographicPoint, refLat: number): { x: number; y: number } {
  return { x: p.lng * metersPerDegreeLng(refLat), y: p.lat * METERS_PER_DEGREE_LAT };
}

function pointToSegmentDistanceMeters(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
  const dx = p.x - (a.x + t * abx);
  const dy = p.y - (a.y + t * aby);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Every vertex-to-vertex segment of every queried road feature, in plain lng/lat pairs -
 * LineString and MultiLineString are the only geometry types these road layers ever render. */
function roadSegments(features: maplibregl.MapGeoJSONFeature[]): [GeographicPoint, GeographicPoint][] {
  const segments: [GeographicPoint, GeographicPoint][] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    const lines: [number, number][][] =
      geometry.type === "LineString" ? [geometry.coordinates as [number, number][]] : geometry.type === "MultiLineString" ? (geometry.coordinates as [number, number][][]) : [];
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        segments.push([{ lng: line[i]![0]!, lat: line[i]![1]! }, { lng: line[i + 1]![0]!, lat: line[i + 1]![1]! }]);
      }
    }
  }
  return segments;
}

/** Returns the best-guess FRONT edge (closest to the nearest rendered street segment) - REAR is no
 * longer decided here; the caller runs parcel-placement-helpers.ts's detectRearEdge against the
 * resulting front, a single shared heuristic used for both auto-detection and any later "Set rear"
 * correction. Returns null whenever there is nothing reliable to go on - never returns a guess with
 * no geometric basis. */
function autoDetectFront(map: maplibregl.Map, edgeMidpoints: EdgeMidpoint[]): string | null {
  const availableLayers = ROAD_LAYER_IDS.filter((id) => map.getLayer(id));
  if (availableLayers.length === 0 || edgeMidpoints.length === 0) return null;

  const features = map.queryRenderedFeatures(undefined, { layers: availableLayers });
  const segments = roadSegments(features);
  if (segments.length === 0) return null;

  const refLat = edgeMidpoints[0]!.lat;
  const localSegments = segments.map(([a, b]): [{ x: number; y: number }, { x: number; y: number }] => [toLocalMeters(a, refLat), toLocalMeters(b, refLat)]);

  let front: string | null = null;
  let frontDistance = Infinity;
  for (const m of edgeMidpoints) {
    const localPoint = toLocalMeters({ lng: m.lng, lat: m.lat }, refLat);
    let nearest = Infinity;
    for (const [a, b] of localSegments) {
      const d = pointToSegmentDistanceMeters(localPoint, a, b);
      if (d < nearest) nearest = d;
    }
    if (nearest < frontDistance) {
      frontDistance = nearest;
      front = m.edgeRef;
    }
  }
  return front;
}
// -------------------------------------------------------------------------------------------

export function ParcelPlacementMap({
  boundaryPolygonWgs84,
  boundaryPolygon,
  widthFt,
  depthFt,
  onPlacementChange,
  onLotLineRolesChange,
  initialPlacement,
  initialLotLineSelection,
  existingStructures = [],
  onDwellingSelectionChange,
  initialDwellingSelection,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [anchor, setAnchor] = useState<GeographicPoint | null>(initialPlacement?.anchor ?? null);
  const [orientationDeg, setOrientationDeg] = useState(initialPlacement?.orientationDeg ?? 0);
  const [frontEdgeRef, setFrontEdgeRef] = useState<string | null>(initialLotLineSelection?.frontEdgeRef ?? null);
  const [rearEdgeRef, setRearEdgeRef] = useState<string | null>(initialLotLineSelection?.rearEdgeRef ?? null);
  // Interaction pass (2026-08-30, real-browser-testing follow-up): "Set front"/"Set rear" are now
  // always-visible, independent, single-shot actions (no more "Edit lot lines" mode-toggle/"Done"
  // step, and no more "picking front auto-advances to rear" chaining) - selectingRole is simply
  // "which one is the NEXT click for," starting at null (nothing pending) regardless of whether an
  // initial selection was seeded, since the user can always just press one of the two buttons.
  const [selectingRole, setSelectingRole] = useState<"front" | "rear" | null>(null);
  // Mirror refs for state read inside the STABLE MapLibre click handlers registered once when the
  // map is created (see the boundaryPolygonWgs84-keyed effect below) - a plain closure over this
  // state there would go stale after the first change, since that effect does not re-run on every
  // state change the way this component's own re-renders (and therefore a button's onClick) do.
  const selectingRoleRef = useRef(selectingRole);
  const frontEdgeRefRef = useRef(frontEdgeRef);
  const rearEdgeRefRef = useRef(rearEdgeRef);

  // Building intelligence v1 - dwellingSelection.outlineId is Seattle Building Outlines 2023's own
  // internal id (never shown to the user - see buildingLabel below); null means "not yet answered."
  const [dwellingSelection, setDwellingSelection] = useState<DwellingSelection | null>(initialDwellingSelection ?? null);
  const buildingLabel = (outlineId: string) => `Building ${existingStructures.findIndex((s) => s.outlineId === outlineId) + 1}`;
  // The largest-footprint starting SUGGESTION (requirement 4) - a UI hint only, computed fresh
  // whenever the candidate set or the user's own answer changes, and cleared the instant the user
  // answers (confirms it, picks another, or says "not sure") since there is nothing left to
  // suggest once a real answer exists. Never itself written into dwellingSelection.
  const suggestedOutlineId = useMemo(() => (dwellingSelection === null ? suggestLargestStructure(existingStructures) : null), [existingStructures, dwellingSelection]);

  function selectDwelling(selection: DwellingSelection) {
    setDwellingSelection(selection);
  }

  useEffect(() => {
    if (!dwellingSelection) return;
    onDwellingSelectionChange?.(dwellingSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dwellingSelection]);

  const edgeRefs = edgeRefsForPolygon(boundaryPolygon);
  // Screen-pixel positions for the plain-HTML edge-badge overlay (see below for why this isn't a
  // MapLibre symbol/text layer) - recomputed on every map move/zoom via map.project().
  const [labelPositions, setLabelPositions] = useState<{ edgeRef: string; x: number; y: number }[]>([]);
  // Same pattern, for the numbered building-marker overlay (requirement 4, 2026-08-30).
  const [buildingLabelPositions, setBuildingLabelPositions] = useState<{ outlineId: string; number: number; x: number; y: number }[]>([]);

  useEffect(() => {
    selectingRoleRef.current = selectingRole;
  }, [selectingRole]);

  useEffect(() => {
    frontEdgeRefRef.current = frontEdgeRef;
  }, [frontEdgeRef]);

  useEffect(() => {
    rearEdgeRefRef.current = rearEdgeRef;
  }, [rearEdgeRef]);

  useEffect(() => {
    if (!anchor) return;
    onPlacementChange({ anchor, orientationDeg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, orientationDeg]);

  useEffect(() => {
    if (!frontEdgeRef || !rearEdgeRef) return;
    if (frontEdgeRef === rearEdgeRef) {
      onLotLineRolesChange({ status: LotLineRoleStatus.INSUFFICIENT });
      return;
    }
    const n = boundaryPolygon.points.length;
    const frontIdx = Number(frontEdgeRef.split("-")[1]);
    const rearIdx = Number(rearEdgeRef.split("-")[1]);
    const isOpposite = n === 4 && Math.abs(frontIdx - rearIdx) === 2;
    if (!isOpposite) {
      onLotLineRolesChange({ status: LotLineRoleStatus.INSUFFICIENT });
      return;
    }
    const sideEdgeRefs = edgeRefs.filter((r) => r !== frontEdgeRef && r !== rearEdgeRef);
    onLotLineRolesChange({ status: LotLineRoleStatus.ASSIGNED, frontEdgeRef, rearEdgeRef, sideEdgeRefs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontEdgeRef, rearEdgeRef]);

  /** Shared by both the on-map edge click and the badge-button click (either input method selects
   * the same edge). Only assigns a role while one is actively being picked (selectingRole !== null,
   * started by pressing "Set front"/"Set rear" in the always-visible Lot lines card). Each pick is
   * single-shot and independent - selecting front never auto-advances into picking rear, and
   * clicking an edge with nothing active does nothing (interaction pass, 2026-08-30: the founder's
   * own real-browser testing found the previous "Edit lot lines" mode-toggle/"Done" step, and the
   * auto-advance-to-rear chaining, both added unnecessary friction). */
  function selectEdge(ref: string) {
    if (selectingRoleRef.current === "front") {
      setFrontEdgeRef(ref);
      setSelectingRole(null);
    } else if (selectingRoleRef.current === "rear") {
      setRearEdgeRef(ref);
      setSelectingRole(null);
    }
  }

  /** Shared by the keyboard nudge buttons - identical `setAnchor` call a map click/drag already
   * makes, just computing the new point from a small feet-based offset instead of reading it from
   * MapLibre's own pointer event. If nothing is placed yet, nudging starts from the parcel centroid
   * (same fallback the "Place shed at parcel center" button below uses) so the keyboard-only path
   * never requires a map tap first. */
  function nudgeAnchor(direction: NudgeDirection) {
    setAnchor((prev) => nudge(prev ?? centroid(boundaryPolygonWgs84), direction, NUDGE_STEP_FT));
  }

  function rotateBy(deltaDeg: number) {
    setOrientationDeg((prev) => (prev + deltaDeg + 360) % 360);
  }

  useEffect(() => {
    if (!mapContainerRef.current || boundaryPolygonWgs84.length === 0) return;
    let cancelled = false;
    // Fits the WHOLE parcel in frame (with margin for street context around it) instead of
    // centering on a single boundary vertex at a fixed zoom - an elongated parcel (e.g.
    // street-to-waterfront) could otherwise crop the actual street-facing side out of the visible
    // viewport, and queryRenderedFeatures can only ever see what's currently rendered on screen.
    const bounds = boundaryPolygonWgs84.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new maplibregl.LngLatBounds([boundaryPolygonWgs84[0]!.lng, boundaryPolygonWgs84[0]!.lat], [boundaryPolygonWgs84[0]!.lng, boundaryPolygonWgs84[0]!.lat]),
    );
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAPTILER_STYLE_URL ?? { version: 8, sources: {}, layers: [] },
      bounds,
      fitBoundsOptions: { padding: 80, maxZoom: 19 },
    });
    mapRef.current = map;

    // "style.load", not "load" - "load" additionally waits on glyph/sprite resources for the base
    // style's own symbol layers (e.g. road/POI/housenumber labels), which can hang indefinitely
    // even once the style/tiles are otherwise ready (real, live-observed bug). None of this
    // component's own setup needs glyphs (edge/building labels are plain HTML overlays
    // specifically to avoid a glyph dependency), so "style.load" - which fires once the style
    // definition itself is parsed and ready for addSource/addLayer - is the correct, reliable
    // trigger.
    map.on("style.load", () => {
      const ring = [...boundaryPolygonWgs84.map((p) => [p.lng, p.lat]), [boundaryPolygonWgs84[0]!.lng, boundaryPolygonWgs84[0]!.lat]];
      map.addSource("parcel-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } } });
      map.addLayer({ id: "parcel-boundary-fill", type: "fill", source: "parcel-boundary", paint: { "fill-color": "#2563eb", "fill-opacity": 0.1 } });

      // Per-edge lines - each edge is its own GeoJSON Feature tagged with the SAME edgeRef string
      // edgeRefsForPolygon already uses, so a click here and a click on the corresponding overlay
      // badge both call the identical selectEdge(). No numeric label is ever exposed to the user -
      // edgeRef stays an internal identifier (requirement 1).
      const n = boundaryPolygonWgs84.length;
      const edgeMidpoints = boundaryPolygonWgs84.map((p, i) => {
        const next = boundaryPolygonWgs84[(i + 1) % n]!;
        return { edgeRef: `edge-${i}`, lng: (p.lng + next.lng) / 2, lat: (p.lat + next.lat) / 2 };
      });
      const edgeFeatures: GeoJSON.Feature[] = boundaryPolygonWgs84.map((p, i) => {
        const next = boundaryPolygonWgs84[(i + 1) % n]!;
        return {
          type: "Feature",
          properties: { edgeRef: `edge-${i}` },
          geometry: { type: "LineString", coordinates: [[p.lng, p.lat], [next.lng, next.lat]] },
        };
      });
      map.addSource("parcel-edges", { type: "geojson", data: { type: "FeatureCollection", features: edgeFeatures } });

      map.addLayer({
        id: "parcel-edge-lines",
        type: "line",
        source: "parcel-edges",
        layout: { "line-cap": "round" },
        // Seeded from frontEdgeRef/rearEdgeRef as they stood when this "style.load" callback was
        // registered (this effect runs once, keyed on [boundaryPolygonWgs84]) - normally null/null
        // on a fresh mount, but already correct on a remount seeded via initialLotLineSelection (a
        // "Previous" step-navigation button bringing the user back to an already-answered
        // PLACEMENT step). The paint-sync effect below still takes over for every live change
        // after this initial paint.
        paint: { "line-color": edgeColorExpression(frontEdgeRef, rearEdgeRef), "line-width": edgeWidthExpression(frontEdgeRef, rearEdgeRef) },
      });

      map.addLayer({ id: "parcel-boundary-line", type: "line", source: "parcel-boundary", paint: { "line-color": "#2563eb", "line-width": 1 } });

      // Building intelligence v1 - real building footprints on this parcel (Seattle Building
      // Outlines 2023, WGS84-transformed server-side), each tagged with its own outlineId so a
      // click here and a click on the corresponding button both select the same structure - same
      // shared-selection convention as parcel-edge-lines/selectEdge above.
      const buildingFeatures: GeoJSON.Feature[] = existingStructures.map((s) => ({
        type: "Feature",
        properties: { outlineId: s.outlineId },
        geometry: { type: "Polygon", coordinates: [[...s.footprintWgs84, s.footprintWgs84[0]!].map((p) => [p.lng, p.lat])] },
      }));
      map.addSource("existing-structures", { type: "geojson", data: { type: "FeatureCollection", features: buildingFeatures } });
      map.addLayer({
        id: "existing-structures-fill",
        type: "fill",
        source: "existing-structures",
        paint: { "fill-color": buildingColorExpression(dwellingSelection?.outlineId ?? null), "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "existing-structures-line",
        type: "line",
        source: "existing-structures",
        paint: { "line-color": buildingColorExpression(dwellingSelection?.outlineId ?? null), "line-width": 2 },
      });
      // Numbered markers (requirement 4, 2026-08-30) - one per building, matching "Building N"'s
      // exact position-based numbering (buildingLabel below), so the map and the button list can
      // never disagree about which number means which footprint. Centroid of each footprint's own
      // ring - reuses the same plain average `centroid` helper already used for the parcel
      // boundary's "place at center" fallback. Only meaningful for 2+ buildings (requirement 4's
      // own "for a single-building parcel, do not add unnecessary '1' labeling") - the JSX below
      // only renders these when existingStructures.length > 1, but they're computed here
      // unconditionally since that's cheap and keeps this block simple.
      const buildingMidpoints = existingStructures.map((s, i) => ({ outlineId: s.outlineId, number: i + 1, ...centroid(s.footprintWgs84) }));
      // e.preventDefault() here (and on parcel-edge-lines below) is what stops this same physical
      // click from ALSO falling through to the generic map-click handler (which would otherwise
      // move the shed anchor to that same point) - see this component's own docstring item 5 for
      // the real registration-order bug this depends on being fixed for.
      map.on("click", "existing-structures-fill", (e) => {
        const outlineId = e.features?.[0]?.properties?.["outlineId"] as string | undefined;
        if (!outlineId) return;
        e.preventDefault();
        selectDwelling({ status: "SELECTED", outlineId });
      });
      map.on("mouseenter", "existing-structures-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "existing-structures-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "parcel-edge-lines", (e) => {
        const ref = e.features?.[0]?.properties?.["edgeRef"] as string | undefined;
        if (!ref) return;
        e.preventDefault();
        selectEdge(ref);
      });
      map.on("mouseenter", "parcel-edge-lines", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "parcel-edge-lines", () => {
        map.getCanvas().style.cursor = "";
      });

      // Shed-footprint preview - seeded from whatever anchor/orientation this component ALREADY
      // has at style.load time (real bug fix, 2026-08-30: previously always hardcoded to an empty
      // FeatureCollection here, relying entirely on the separate sync effect below to fill it in -
      // that effect runs once on mount too, but "style.load" fires asynchronously, so on a REMOUNT
      // with an already-existing placement (e.g. Placement -> Review -> Previous -> Placement),
      // the sync effect's first run found no "shed-footprint" source yet (style.load hadn't fired),
      // bailed out via its own `if (!source) return`, and never got a second chance - none of its
      // dependencies (anchor/orientationDeg/widthFt/depthFt) change again on their own once they're
      // already correctly restored from initialPlacement, so the shed silently stayed invisible
      // even though the real anchor/orientation were correct in React state the whole time. Using
      // the SAME shedFootprintGeoJson() the sync effect uses (never a second, duplicated
      // implementation) closes that race: the source is correct from the very first paint, and the
      // sync effect below still takes over for every subsequent live change exactly as before.
      map.addSource("shed-footprint", { type: "geojson", data: shedFootprintGeoJson(anchor, widthFt, depthFt, orientationDeg) });
      map.addLayer({ id: "shed-footprint-fill", type: "fill", source: "shed-footprint", paint: { "fill-color": FOOTPRINT_COLOR, "fill-opacity": 0.35 } });
      map.addLayer({ id: "shed-footprint-line", type: "line", source: "shed-footprint", paint: { "line-color": FOOTPRINT_COLOR, "line-width": 2 } });

      // Draggable shed (requirement 6). Real bug found in live browser testing (2026-08-30): the
      // "standard" pattern of calling e.preventDefault()/dragPan.disable() INSIDE the mousedown
      // handler is too late - MapLibre's own DragPanHandler is wired up at Map construction time
      // and begins tracking the SAME native mousedown before a later-registered, layer-scoped
      // map.on("mousedown", ...) listener runs; disabling dragPan afterward does not abort a pan
      // gesture that already started. Confirmed by direct testing: with only that pattern, dragging
      // the shed instead panned the whole map. Fixed by disabling dragPan PREEMPTIVELY, the instant
      // the pointer enters the shed polygon (mouseenter) - by the time an actual mousedown occurs
      // while hovering, dragPan is already off, so DragPanHandler never engages for that gesture at
      // all; re-enabled on mouseleave (only when not actively dragging, so leaving the polygon
      // mid-drag - dragging is never constrained to staying over the original feature - doesn't
      // cut the gesture short). Touch has no hover signal, so touchstart keeps the
      // preventDefault()+disable() pattern (single-finger touch-pan gesture recognition has its own
      // small movement threshold before engaging, unlike mouse, making the same race far less
      // likely there). Never computes or submits anything but the plain anchor MapLibre itself
      // reports (same CRS contract as a click) - PostGIS remains the sole authority for every real
      // calculation.
      let dragging = false;
      let hoveringShed = false;
      function beginDrag(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) {
        e.preventDefault();
        dragging = true;
        map.dragPan.disable();
        map.getCanvas().style.cursor = "grabbing";
      }
      function continueDrag(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) {
        if (!dragging) return;
        setAnchor({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      }
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        map.getCanvas().style.cursor = hoveringShed ? "grab" : "";
        if (!hoveringShed) map.dragPan.enable();
      }
      map.on("mouseenter", "shed-footprint-fill", () => {
        hoveringShed = true;
        map.dragPan.disable(); // preemptive - see comment above for why mousedown-time alone is too late
        if (!dragging) map.getCanvas().style.cursor = "grab";
      });
      map.on("mouseleave", "shed-footprint-fill", () => {
        hoveringShed = false;
        if (!dragging) {
          map.dragPan.enable();
          map.getCanvas().style.cursor = "";
        }
      });
      map.on("mousedown", "shed-footprint-fill", beginDrag);
      map.on("touchstart", "shed-footprint-fill", beginDrag);
      map.on("mousemove", continueDrag);
      map.on("touchmove", continueDrag);
      map.on("mouseup", endDrag);
      map.on("touchend", endDrag);

      // Edge/building badges are plain HTML overlays (position: absolute, driven by
      // map.project()), NOT a MapLibre symbol/text layer - a symbol layer's text-field only
      // renders using glyphs the ACTIVE basemap style itself provides, under font-stack names that
      // vary by style/provider - a real, silently-failing bug found during live browser
      // verification (no console error, no glyph network request, no visible label). Plain HTML
      // text has no such dependency and is unconditionally legible.
      function updateLabelPositions() {
        setLabelPositions(edgeMidpoints.map((m) => ({ edgeRef: m.edgeRef, ...map.project([m.lng, m.lat]) })));
        setBuildingLabelPositions(buildingMidpoints.map((m) => ({ outlineId: m.outlineId, number: m.number, ...map.project([m.lng, m.lat]) })));
      }
      updateLabelPositions();
      map.on("move", updateLabelPositions);
      map.on("resize", updateLabelPositions);

      // Nearest-street FRONT auto-detection, then a deterministic REAR suggestion from the shared
      // heuristic - only ever runs while NEITHER edge has been established yet (checked via
      // frontEdgeRefRef/rearEdgeRefRef, always current, unlike a plain closure over that state -
      // these callbacks are registered once at mount). Checking the edges themselves rather than
      // selectingRole means this correctly stops the moment the user manually picks either edge
      // via "Set front"/"Set rear" (interaction pass, 2026-08-30 - selectingRole no longer defaults
      // to "front" on mount, so it can't be used as the gate anymore). The road basemap tiles this
      // depends on load asynchronously and may not have arrived by the moment "style.load" fires,
      // so this retries a bounded number of times with a short delay rather than querying only
      // once and giving up - each attempt re-checks the refs so a retry never clobbers a selection
      // the user already made by hand in the meantime.
      function attemptAutoDetect(attemptsLeft: number) {
        if (cancelled || frontEdgeRefRef.current !== null || rearEdgeRefRef.current !== null) return;
        const front = autoDetectFront(map, edgeMidpoints);
        if (front) {
          const rear = detectRearEdge(boundaryPolygonWgs84, front);
          if (rear) {
            setFrontEdgeRef(front);
            setRearEdgeRef(rear);
            setSelectingRole(null);
            return;
          }
        }
        if (attemptsLeft > 0) setTimeout(() => attemptAutoDetect(attemptsLeft - 1), 500);
      }
      attemptAutoDetect(4);

      // The anchor is submitted exactly as MapLibre reports it (WGS84 lng/lat) - no conversion of
      // any kind happens here. See PlacementSelection/onPlacementChange. Registered LAST, inside
      // style.load (real bug fix, item 5 in this file's own docstring) - MapLibre dispatches
      // same-event listeners in registration order, so this must run AFTER every layer-scoped
      // handler above for their e.preventDefault() calls to actually suppress it.
      map.on("click", (e) => {
        if (e.defaultPrevented) return; // an edge/building click already handled this (see above).
        setAnchor({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
      map.remove();
    };
  }, [boundaryPolygonWgs84]);

  // Keeps the on-map highlight in sync with the current front/rear selection - re-applies the
  // same color/width expressions whenever the selection changes, so the map and the badges never
  // disagree about which edge is currently assigned which role.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("parcel-edge-lines")) return;
    map.setPaintProperty("parcel-edge-lines", "line-color", edgeColorExpression(frontEdgeRef, rearEdgeRef));
    map.setPaintProperty("parcel-edge-lines", "line-width", edgeWidthExpression(frontEdgeRef, rearEdgeRef));
  }, [frontEdgeRef, rearEdgeRef]);

  // Keeps the existing-building highlight in sync with the current dwelling selection - same
  // "re-apply the paint expression on every change" convention as the edge highlight above. The
  // suggestion (suggestedOutlineId) deliberately never appears here - it has no map fill/line
  // treatment at all (color semantics correction, 2026-08-30 - see buildingColorExpression's own
  // comment); it only ever affects the plain-HTML number badge below and the button copy.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("existing-structures-fill")) return;
    const expr = buildingColorExpression(dwellingSelection?.outlineId ?? null);
    map.setPaintProperty("existing-structures-fill", "fill-color", expr);
    map.setPaintProperty("existing-structures-line", "line-color", expr);
  }, [dwellingSelection]);

  // Keeps the shed-footprint preview in sync with anchor/orientation/dimensions for every LIVE
  // change after the initial paint (the initial paint itself is now handled directly inside
  // style.load above, via the same shedFootprintGeoJson() helper - see its own comment for the
  // real remount bug this split fixes). Both a map tap/drag AND the keyboard nudge/rotate controls
  // update the same anchor/orientationDeg state, so this single effect is what makes any input
  // method visibly move the footprint.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("shed-footprint") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(shedFootprintGeoJson(anchor, widthFt, depthFt, orientationDeg));
  }, [anchor, orientationDeg, widthFt, depthFt]);

  return (
    <div className="mx-auto w-full lg:grid lg:max-w-[1000px] lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-6">
      <div className="lg:sticky lg:top-4">
        {/* Layout pass (2026-08-30) - instructional copy that used to sit above the map moved into
         * the relevant right-column section (Lot lines / Shed placement) so the map itself isn't
         * surrounded by paragraphs; only the in-the-moment "which edge to tap" prompts stay here,
         * since they describe an interaction happening directly on the map. */}
        <p role="status" className="mb-3 text-sm text-slate-600">
          {selectingRole === "front" && "Tap the parcel edge that is the FRONT lot line (facing the street) - either on the map or below."}
          {selectingRole === "rear" && "Tap the parcel edge that is the REAR lot line."}
        </p>
        <div className="relative h-[400px] w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <div ref={mapContainerRef} className="h-full w-full" role="application" aria-label="Parcel map for shed placement" />
          {labelPositions
            .filter((m) => selectingRole !== null || m.edgeRef === frontEdgeRef || m.edgeRef === rearEdgeRef)
            .map((m) => {
              const isFront = m.edgeRef === frontEdgeRef;
              const isRear = m.edgeRef === rearEdgeRef;
              const editable = selectingRole !== null;
              const text = isFront ? "FRONT" : isRear ? "REAR" : "";
              const toneClass = isFront ? "bg-emerald-600" : isRear ? "bg-red-600" : "bg-indigo-600";
              return (
                <button
                  key={m.edgeRef}
                  type="button"
                  disabled={!editable}
                  aria-label={editable ? `Set this parcel edge as the ${selectingRole} lot line` : isFront ? "Front lot line" : "Rear lot line"}
                  onClick={() => editable && selectEdge(m.edgeRef)}
                  style={{ left: m.x, top: m.y }}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-md ${toneClass} ${
                    text ? "px-2 py-1 text-[10px]" : "h-4 w-4"
                  } ${editable ? "cursor-pointer" : "pointer-events-none"}`}
                >
                  {text}
                </button>
              );
            })}
          {/* Numbered building markers (requirement 4, 2026-08-30) - only for 2+ buildings, per
           * requirement 4's own "for a single-building parcel, do not add unnecessary '1'
           * labeling." Numbers correspond exactly to buildingLabel()'s "Building N" numbering.
           * Clickable, same as the edge badges - a click here calls selectDwelling() directly
           * (this HTML overlay sits above the MapLibre canvas, so it needs its own handler; the
           * underlying footprint's own MapLibre click handler independently does the same thing
           * for a click that lands elsewhere on the polygon). The suggested-but-unconfirmed
           * building gets a dashed ring instead of a distinct fill color - a subtle cue that never
           * risks being mistaken for the solid violet "confirmed" treatment. */}
          {existingStructures.length > 1 &&
            buildingLabelPositions.map((m) => {
              const state = resolveBuildingVisualState(m.outlineId, dwellingSelection?.status === "SELECTED" ? dwellingSelection.outlineId ?? null : null, suggestedOutlineId);
              return (
                <button
                  key={m.outlineId}
                  type="button"
                  aria-label={`Select Building ${m.number} as your primary dwelling${state === "suggested" ? " (suggested based on building size)" : ""}`}
                  onClick={() => selectDwelling({ status: "SELECTED", outlineId: m.outlineId })}
                  style={{ left: m.x, top: m.y }}
                  className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white shadow-md ${
                    state === "confirmed"
                      ? "border-2 border-white bg-violet-600"
                      : state === "suggested"
                        ? "border-2 border-dashed border-amber-400 bg-slate-500"
                        : "border-2 border-white bg-slate-500"
                  }`}
                >
                  {m.number}
                </button>
              );
            })}
        </div>
      </div>

      <div className="mt-4 space-y-4 lg:mt-0">
        {/* Lot lines - always visible (interaction pass, 2026-08-30: the previous "Edit lot
         * lines" mode-toggle/"Done" step added unnecessary friction, and the card used to
         * disappear entirely while a selection was in progress - a real, reported bug). "Set
         * front"/"Set rear" are always-present, independent, single-shot actions - pressing one
         * puts the map into that specific picking mode; tapping an edge (on the map or via the
         * badges above) immediately assigns it and returns to the idle state, with this card never
         * unmounting in between. No numeric edge identifiers anywhere in this UI. */}
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Lot lines</legend>
          <p role="status" className="text-sm text-slate-600">
            {selectingRole === "front" && "Select the front lot line on the map."}
            {selectingRole === "rear" && "Select the rear lot line on the map."}
            {!selectingRole &&
              frontEdgeRef &&
              rearEdgeRef &&
              "We selected the likely front and rear lot lines based on the nearby street. If they don't look right, use the buttons below to change them."}
            {!selectingRole && (!frontEdgeRef || !rearEdgeRef) && "Select the front and rear lot lines on the map, or use the buttons below."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={selectingRole === "front" ? "primary" : "secondary"} aria-pressed={selectingRole === "front"} onClick={() => setSelectingRole("front")}>
              Set front
            </Button>
            <Button variant={selectingRole === "rear" ? "primary" : "secondary"} aria-pressed={selectingRole === "rear"} onClick={() => setSelectingRole("rear")}>
              Set rear
            </Button>
          </div>
        </fieldset>
        {/* Building intelligence v1 - only rendered when there's something to ask about (never a
         * dead-end prompt when existingStructures is empty, e.g. a vacant lot or no data). Never
         * exposes outlineId/coordinates/SRID/classification terminology - "Building N" and plain
         * language only. */}
        {existingStructures.length === 1 && (
          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-900">Existing building on this parcel</legend>
            <p role="status" className="text-sm text-slate-600">Is the highlighted building your primary dwelling / main house?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={dwellingSelection?.status === "SELECTED" ? "primary" : "secondary"}
                onClick={() => selectDwelling({ status: "SELECTED", outlineId: existingStructures[0]!.outlineId })}
              >
                Yes, that&apos;s the main house
              </Button>
              <Button variant={dwellingSelection?.status === "UNKNOWN" ? "primary" : "secondary"} onClick={() => selectDwelling({ status: "UNKNOWN" })}>
                No / not sure
              </Button>
            </div>
          </fieldset>
        )}
        {existingStructures.length > 1 && (
          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-900">Which building is your primary dwelling / main house?</legend>
            {/* Suggestion/confirmation copy (2026-08-30, real-browser-testing follow-up) - the
             * three states are made explicit rather than implied by map color alone, since the
             * suggested building deliberately has no distinct map fill anymore (see
             * buildingColorExpression's own comment). */}
            <p role="status" className="text-sm text-slate-600">
              {dwellingSelection?.status === "SELECTED"
                ? "Main house selected."
                : suggestedOutlineId
                  ? "Suggested main house based on building size. Confirm it or select another building."
                  : `We found ${existingStructures.length} buildings on this parcel - tap the one that's your main house, either on the map above or below.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {existingStructures.map((s) => (
                <Button
                  key={s.outlineId}
                  variant={dwellingSelection?.status === "SELECTED" && dwellingSelection.outlineId === s.outlineId ? "primary" : "secondary"}
                  aria-pressed={dwellingSelection?.status === "SELECTED" && dwellingSelection.outlineId === s.outlineId}
                  onClick={() => selectDwelling({ status: "SELECTED", outlineId: s.outlineId })}
                >
                  {buildingLabel(s.outlineId)}
                  {s.outlineId === suggestedOutlineId ? " (suggested)" : ""}
                </Button>
              ))}
              <Button variant={dwellingSelection?.status === "UNKNOWN" ? "primary" : "secondary"} onClick={() => selectDwelling({ status: "UNKNOWN" })}>
                I&apos;m not sure / none of these
              </Button>
            </div>
          </fieldset>
        )}
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Shed placement</legend>
          <p className="text-sm text-slate-600">
            Click the map to place the shed, drag it to fine-tune the location, or use the controls below. This is an approximate placement, not a survey or construction plan.
          </p>
          {!anchor && (
            <Button variant="primary" className="mt-3" onClick={() => setAnchor(centroid(boundaryPolygonWgs84))}>
              Place shed at parcel center
            </Button>
          )}
          {/* Compact directional pad (requirement 9) - replaces the previous tall N/S/E/W stack. */}
          <div className="mt-3 grid w-fit grid-cols-3 grid-rows-2 gap-1">
            <span />
            <Button variant="secondary" className="px-2.5 py-1.5" onClick={() => nudgeAnchor("N")} disabled={!anchor} aria-label="Move shed north">
              &uarr;
            </Button>
            <span />
            <Button variant="secondary" className="px-2.5 py-1.5" onClick={() => nudgeAnchor("W")} disabled={!anchor} aria-label="Move shed west">
              &larr;
            </Button>
            <Button variant="secondary" className="px-2.5 py-1.5" onClick={() => nudgeAnchor("S")} disabled={!anchor} aria-label="Move shed south">
              &darr;
            </Button>
            <Button variant="secondary" className="px-2.5 py-1.5" onClick={() => nudgeAnchor("E")} disabled={!anchor} aria-label="Move shed east">
              &rarr;
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Each press moves the shed about {NUDGE_STEP_FT} ft. {anchor ? "Shed is placed - you can also drag it directly on the map." : "Shed is not yet placed."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" className="px-2.5 py-1.5" onClick={() => rotateBy(-15)} aria-label="Rotate shed left 15 degrees">
              &#8630;
            </Button>
            <Button variant="secondary" className="px-2.5 py-1.5" onClick={() => rotateBy(15)} aria-label="Rotate shed right 15 degrees">
              &#8631;
            </Button>
            <span className="text-xs text-slate-600">{orientationDeg}&deg; from north</span>
          </div>
          <label className="mt-2 block text-xs text-slate-700">
            Fine rotation:
            <input
              type="range"
              min={0}
              max={359}
              value={orientationDeg}
              aria-label="Shed rotation, fine adjustment in degrees"
              onChange={(e) => setOrientationDeg(Number(e.target.value))}
              className="mt-1 block w-full accent-indigo-600"
            />
          </label>
        </fieldset>
      </div>
    </div>
  );
}
