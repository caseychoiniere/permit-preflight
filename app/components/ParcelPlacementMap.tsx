"use client";

/**
 * ParcelPlacementMap (PC-2, Workflow 2, frontend-components.md). Deliberately minimal per the
 * approved correction: a single re-placeable anchor + rotation for the shed footprint, plus two
 * edge-role taps (front, rear) - no snapping, no dimension handles, no polygon editing, no
 * automatic frontage detection.
 *
 * CRS contract (Code Generation correction, 2026-08-23): this component submits the placement
 * anchor exactly as MapLibre produces it - WGS84 (EPSG:4326) longitude/latitude, straight from
 * `e.lngLat`. It performs NO coordinate conversion of any kind (the previous local flat-earth
 * degrees-to-feet approximation has been removed entirely - see production-boundary tests). The
 * server is the only place this ever becomes a projected/feet coordinate, via PostGIS's own
 * ST_Transform. This component also never computes or submits a setback distance - the map
 * displays; PostGIS computes.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeographicPoint, Polygon } from "../../src/spatial-analysis/types.js";
import { edgeRefsForPolygon } from "../../src/spatial-analysis/lot-line-roles.js";
import { LotLineRoleStatus } from "../../src/screening-request/types.js";

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

interface Props {
  /** Already in WGS84 (EPSG:4326) - the server transforms this for display before the frontend
   * ever sees it (spatial-analysis/postgis-adapter.ts's transformPolygonToWgs84), so this
   * component never needs its own reprojection logic. */
  boundaryPolygonWgs84: GeographicPoint[];
  /** The authoritative-CRS polygon, used only to determine edge count/refs for role selection -
   * never for coordinate math (point order is identical between the two representations, since
   * reprojection preserves vertex order/count). */
  boundaryPolygon: Polygon;
  onPlacementChange: (placement: PlacementSelection) => void;
  onLotLineRolesChange: (selection: LotLineSelection) => void;
}

const MAPTILER_STYLE_URL = process.env.NEXT_PUBLIC_MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
  : undefined;

export function ParcelPlacementMap({ boundaryPolygonWgs84, boundaryPolygon, onPlacementChange, onLotLineRolesChange }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<GeographicPoint | null>(null);
  const [orientationDeg, setOrientationDeg] = useState(0);
  const [frontEdgeRef, setFrontEdgeRef] = useState<string | null>(null);
  const [rearEdgeRef, setRearEdgeRef] = useState<string | null>(null);
  const [selectingRole, setSelectingRole] = useState<"front" | "rear" | null>("front");

  const edgeRefs = edgeRefsForPolygon(boundaryPolygon);

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

  useEffect(() => {
    if (!mapContainerRef.current || boundaryPolygonWgs84.length === 0) return;
    const center = boundaryPolygonWgs84[0]!;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAPTILER_STYLE_URL ?? { version: 8, sources: {}, layers: [] },
      center: [center.lng, center.lat],
      zoom: 19,
    });

    map.on("load", () => {
      const ring = [...boundaryPolygonWgs84.map((p) => [p.lng, p.lat]), [boundaryPolygonWgs84[0]!.lng, boundaryPolygonWgs84[0]!.lat]];
      map.addSource("parcel-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } } });
      map.addLayer({ id: "parcel-boundary-fill", type: "fill", source: "parcel-boundary", paint: { "fill-color": "#2563eb", "fill-opacity": 0.1 } });
      map.addLayer({ id: "parcel-boundary-line", type: "line", source: "parcel-boundary", paint: { "line-color": "#2563eb", "line-width": 2 } });
    });

    // The anchor is submitted exactly as MapLibre reports it (WGS84 lng/lat) - no conversion of
    // any kind happens here. See PlacementSelection/onPlacementChange.
    map.on("click", (e) => {
      setAnchor({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    return () => map.remove();
  }, [boundaryPolygonWgs84]);

  return (
    <div>
      <p role="status">
        {selectingRole === "front" && "Tap the parcel edge that is the FRONT lot line (facing the street)."}
        {selectingRole === "rear" && "Tap the parcel edge that is the REAR lot line."}
        {!selectingRole && !anchor && "Now tap on the map to place the shed's approximate location."}
        {!selectingRole && anchor && "Approximate placement - not a survey or construction plan."}
      </p>
      <div ref={mapContainerRef} style={{ width: "100%", height: 400 }} role="application" aria-label="Parcel map for shed placement" />
      <fieldset>
        <legend>Lot-line edges (tap an edge on the diagram above, or select by number here for keyboard/non-pointer access)</legend>
        {edgeRefs.map((ref) => (
          <button
            key={ref}
            type="button"
            aria-pressed={ref === frontEdgeRef || ref === rearEdgeRef}
            onClick={() => {
              if (selectingRole === "front") {
                setFrontEdgeRef(ref);
                setSelectingRole("rear");
              } else if (selectingRole === "rear") {
                setRearEdgeRef(ref);
                setSelectingRole(null);
              }
            }}
          >
            {ref}
            {ref === frontEdgeRef ? " (front)" : ""}
            {ref === rearEdgeRef ? " (rear)" : ""}
          </button>
        ))}
      </fieldset>
      <label>
        Approximate placement (accessible keyboard alternative to a map tap) - Longitude:
        <input
          type="number"
          step="0.000001"
          aria-label="Shed placement longitude"
          onChange={(e) => setAnchor((prev) => ({ lng: Number(e.target.value), lat: prev?.lat ?? boundaryPolygonWgs84[0]?.lat ?? 0 }))}
        />
        Latitude:
        <input
          type="number"
          step="0.000001"
          aria-label="Shed placement latitude"
          onChange={(e) => setAnchor((prev) => ({ lng: prev?.lng ?? boundaryPolygonWgs84[0]?.lng ?? 0, lat: Number(e.target.value) }))}
        />
      </label>
      <label>
        Rotation (degrees):
        <input
          type="range"
          min={0}
          max={359}
          value={orientationDeg}
          aria-label="Shed orientation (degrees)"
          onChange={(e) => setOrientationDeg(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
