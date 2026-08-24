"use client";

/**
 * ReportMap (RGD-2). A read-only presentation of the already-generated EvidenceReportArtifact's
 * geometry - never re-queries King County, never reruns PostGIS, never reruns the Rules Engine,
 * never independently derives a new finding. The parcel boundary and proposed footprint shown
 * here were computed once, during generation (report-generation-orchestrator/pipeline.ts), and
 * persisted as evidence entries - this component only draws what's already in the artifact.
 *
 * Deliberately minimal: no GIS controls, no editing, no commercial polish - a straightforward
 * MapLibre visualization. Every finding shown here also has the existing, fully-implemented
 * accessible non-map representation in FindingsList/RequiresVerificationCard - this component is
 * supplementary, never the only place a finding is communicated (requirements.md SS10).
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface GeographicPoint {
  lng: number;
  lat: number;
}

interface EvidenceEntry {
  factType: string;
  value?: unknown;
}

interface Props {
  evidence: EvidenceEntry[];
}

function ringToCoords(points: GeographicPoint[]): [number, number][] {
  const coords = points.map((p): [number, number] => [p.lng, p.lat]);
  return [...coords, coords[0]!];
}

export function ReportMap({ evidence }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const boundary = evidence.find((e) => e.factType === "parcel-boundary-wgs84-display")?.value as GeographicPoint[] | undefined;
  const footprint = evidence.find((e) => e.factType === "proposed-footprint-wgs84-display")?.value as GeographicPoint[] | undefined;

  useEffect(() => {
    if (!mapContainerRef.current || !boundary || boundary.length === 0) return;

    const styleUrl = process.env.NEXT_PUBLIC_MAPTILER_KEY
      ? `https://api.maptiler.com/maps/streets/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
      : undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl ?? { version: 8, sources: {}, layers: [] },
      center: [boundary[0]!.lng, boundary[0]!.lat],
      zoom: 19,
      interactive: true, // pan/zoom only - no editing controls, per the "deliberately minimal" scope
    });

    map.on("load", () => {
      map.addSource("parcel-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ringToCoords(boundary)] } } });
      map.addLayer({ id: "parcel-boundary-fill", type: "fill", source: "parcel-boundary", paint: { "fill-color": "#2563eb", "fill-opacity": 0.08 } });
      map.addLayer({ id: "parcel-boundary-line", type: "line", source: "parcel-boundary", paint: { "line-color": "#2563eb", "line-width": 2 } });

      if (footprint && footprint.length > 0) {
        map.addSource("proposed-footprint", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ringToCoords(footprint)] } } });
        map.addLayer({ id: "proposed-footprint-fill", type: "fill", source: "proposed-footprint", paint: { "fill-color": "#b45309", "fill-opacity": 0.4 } });
        map.addLayer({ id: "proposed-footprint-line", type: "line", source: "proposed-footprint", paint: { "line-color": "#b45309", "line-width": 2 } });
      }
    });

    return () => map.remove();
  }, [boundary, footprint]);

  if (!boundary) {
    return <p><em>Map view unavailable for this report (no parcel geometry was recorded).</em></p>;
  }

  return (
    <div>
      <div ref={mapContainerRef} style={{ width: "100%", height: 320 }} role="img" aria-label="Map showing the parcel boundary and proposed shed footprint" />
      <p><small>Map view is a visual summary only - see the findings list above for the complete, accessible record of every finding.</small></p>
    </div>
  );
}
