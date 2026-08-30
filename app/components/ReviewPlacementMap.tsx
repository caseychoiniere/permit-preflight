"use client";

/**
 * ReviewPlacementMap - a read-only recap of the parcel boundary and chosen shed placement, shown
 * on the checkout Review step (below the Parcel/Shed summary items). Deliberately not the same
 * component as ParcelPlacementMap: no click handlers, no edge selection, no nudge/rotate controls
 * - the user already made those decisions on the PLACEMENT step; this is purely "here's what you
 * chose," mirroring ReportMap.tsx's own already-established "boundary + footprint, pan/zoom only"
 * pattern for the post-purchase report.
 *
 * The footprint-preview math below is a deliberate, disclosed duplicate of the identical block in
 * ParcelPlacementMap.tsx, not a shared import - matches this codebase's existing convention of
 * duplicating small view-layer math across frontend files rather than centralizing it (see e.g.
 * report/page.tsx's own duplicated Finding/Report types), and keeps
 * tests/spatial-analysis/production-boundary.test.ts's CRS-boundary hard invariant (which scans
 * .ts files under app/ and src/ for this exact local-approximation pattern) scoped to what it
 * already covers rather than needing to special-case a new shared module. UI-ONLY: never touches
 * what's submitted to the server - the real footprint-in-projected-CRS computation remains
 * entirely server-side (buildFootprintInProjectedCrs, via real PostGIS ST_Transform).
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeographicPoint } from "../../src/spatial-analysis/types.js";
import type { ExistingStructureDisplay } from "./ParcelPlacementMap.js";
import { edgeSegments } from "./parcel-placement-helpers.js";

interface Props {
  boundaryPolygonWgs84: GeographicPoint[];
  anchor: GeographicPoint;
  orientationDeg: number;
  widthFt: number;
  depthFt: number;
  /** Regression fix (2026-08-30) - the SAME existingStructures/selection state configure/page.tsx
   * already held from the Placement step (no new fetch here - "the Review screen should show the
   * currently configured source geometry" using the same in-memory configuration, never a second,
   * potentially-diverging read). Omitted/empty renders nothing extra, matching ParcelPlacementMap's
   * own "nothing to show" behavior. */
  existingStructures?: ExistingStructureDisplay[];
  selectedDwellingOutlineId?: string;
  /** Placement-step UX pass (2026-08-30, regression item 11) - the SAME frontEdgeRef/rearEdgeRef
   * strings ParcelPlacementMap already established (again, no new computation - edge-i =
   * points[i]->points[(i+1)%n] is the same convention edgeSegments/edgeRefsForPolygon use
   * everywhere else, and point order is identical between the authoritative and WGS84
   * representations). Omitted when lot-line roles were never decided (INSUFFICIENT with no
   * specific edges, or genuinely not yet answered) - renders no front/rear lines in that case,
   * never a guess. */
  frontEdgeRef?: string;
  rearEdgeRef?: string;
}

const MAPTILER_STYLE_URL = process.env.NEXT_PUBLIC_MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
  : undefined;

const BOUNDARY_COLOR = "#2563eb"; // blue - matches ParcelPlacementMap's own boundary color
const FOOTPRINT_COLOR = "#ea580c"; // orange - matches ParcelPlacementMap's own footprint color
// Same front/rear colors as ParcelPlacementMap.tsx - a consistency requirement (item 11).
const FRONT_COLOR = "#16a34a";
const REAR_COLOR = "#dc2626";
// Same building/selected-dwelling colors as ParcelPlacementMap.tsx and ReportMap.tsx - a
// consistency requirement (the same selected dwelling must look the same across every stage).
const BUILDING_COLOR = "#64748b";
const BUILDING_SELECTED_COLOR = "#7c3aed";

const FEET_TO_METERS = 0.3048;
const METERS_PER_DEGREE_LAT = 111_320;

function metersPerDegreeLng(atLat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180);
}

function offsetByFeet(origin: GeographicPoint, eastFt: number, northFt: number): GeographicPoint {
  const dLat = (northFt * FEET_TO_METERS) / METERS_PER_DEGREE_LAT;
  const dLng = (eastFt * FEET_TO_METERS) / metersPerDegreeLng(origin.lat);
  return { lng: origin.lng + dLng, lat: origin.lat + dLat };
}

function footprintPreviewRing(anchor: GeographicPoint, widthFt: number, depthFt: number, orientationDeg: number): GeographicPoint[] {
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

function ringToCoords(points: GeographicPoint[]): [number, number][] {
  const coords = points.map((p): [number, number] => [p.lng, p.lat]);
  return [...coords, coords[0]!];
}

export function ReviewPlacementMap({ boundaryPolygonWgs84, anchor, orientationDeg, widthFt, depthFt, existingStructures = [], selectedDwellingOutlineId, frontEdgeRef, rearEdgeRef }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current || boundaryPolygonWgs84.length === 0) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAPTILER_STYLE_URL ?? { version: 8, sources: {}, layers: [] },
      center: [anchor.lng, anchor.lat],
      zoom: 19,
      interactive: true, // pan/zoom only, per this component's own read-only scope
    });

    // "style.load", not "load" - see ParcelPlacementMap.tsx/ReportMap.tsx for why "load" can hang
    // indefinitely on glyph/sprite resources this component's own layers never need.
    map.on("style.load", () => {
      const boundaryRing = ringToCoords(boundaryPolygonWgs84);
      map.addSource("parcel-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [boundaryRing] } } });
      map.addLayer({ id: "parcel-boundary-fill", type: "fill", source: "parcel-boundary", paint: { "fill-color": BOUNDARY_COLOR, "fill-opacity": 0.1 } });
      map.addLayer({ id: "parcel-boundary-line", type: "line", source: "parcel-boundary", paint: { "line-color": BOUNDARY_COLOR, "line-width": 2 } });

      // Front/rear lot lines (regression item 11) - read-only recap of the SAME edges Placement
      // established, no click handlers, no numeric labels (matches Placement's own no-numbers UX).
      if (frontEdgeRef || rearEdgeRef) {
        const segments = edgeSegments(boundaryPolygonWgs84);
        const lineFeatures: GeoJSON.Feature[] = segments
          .filter((s) => s.edgeRef === frontEdgeRef || s.edgeRef === rearEdgeRef)
          .map((s) => ({
            type: "Feature",
            properties: { role: s.edgeRef === frontEdgeRef ? "front" : "rear" },
            geometry: { type: "LineString", coordinates: [[s.a.lng, s.a.lat], [s.b.lng, s.b.lat]] },
          }));
        if (lineFeatures.length > 0) {
          map.addSource("lot-lines", { type: "geojson", data: { type: "FeatureCollection", features: lineFeatures } });
          map.addLayer({
            id: "lot-lines",
            type: "line",
            source: "lot-lines",
            layout: { "line-cap": "round" },
            paint: { "line-color": ["case", ["==", ["get", "role"], "front"], FRONT_COLOR, REAR_COLOR], "line-width": 5 },
          });
        }
      }

      // Existing building footprints (regression fix, 2026-08-30) - read-only recap, no click
      // handlers (the user already made this choice on Placement); the selected dwelling is
      // highlighted the SAME way ParcelPlacementMap/ReportMap highlight it.
      if (existingStructures.length > 0) {
        const buildingFeatures: GeoJSON.Feature[] = existingStructures.map((s) => ({
          type: "Feature",
          properties: { outlineId: s.outlineId },
          geometry: { type: "Polygon", coordinates: [ringToCoords(s.footprintWgs84)] },
        }));
        map.addSource("existing-structures", { type: "geojson", data: { type: "FeatureCollection", features: buildingFeatures } });
        const colorExpr: maplibregl.ExpressionSpecification = ["case", ["==", ["get", "outlineId"], selectedDwellingOutlineId ?? ""], BUILDING_SELECTED_COLOR, BUILDING_COLOR];
        map.addLayer({ id: "existing-structures-fill", type: "fill", source: "existing-structures", paint: { "fill-color": colorExpr, "fill-opacity": 0.35 } });
        map.addLayer({ id: "existing-structures-line", type: "line", source: "existing-structures", paint: { "line-color": colorExpr, "line-width": 2 } });
      }

      const footprintRing = ringToCoords(footprintPreviewRing(anchor, widthFt, depthFt, orientationDeg));
      map.addSource("shed-footprint", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [footprintRing] } } });
      map.addLayer({ id: "shed-footprint-fill", type: "fill", source: "shed-footprint", paint: { "fill-color": FOOTPRINT_COLOR, "fill-opacity": 0.4 } });
      map.addLayer({ id: "shed-footprint-line", type: "line", source: "shed-footprint", paint: { "line-color": FOOTPRINT_COLOR, "line-width": 2 } });
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryPolygonWgs84]);

  return (
    <div ref={mapContainerRef} className="h-64 w-full" role="img" aria-label="Map showing the parcel boundary, existing buildings, and your chosen shed placement" />
  );
}
