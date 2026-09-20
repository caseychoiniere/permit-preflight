/**
 * King County parcel-polygon retrieval - Property Intelligence's job (ownership boundary
 * corrected in Infrastructure Design, 2026-08-22): this module fetches and validates the parcel
 * boundary geometry; spatial-analysis/postgis-adapter.ts only ever receives it, never fetches it.
 *
 * Fetched on demand, per parcel, by the already-confirmed PIN - never bulk-ingested (same
 * "permitted access, no bulk scraping" pattern as Unit 1's other King County integrations).
 *
 * Evidence-quality disclosure (Functional Design Question 2/BR-U2-4): King County publishes these
 * tax-parcel boundaries as general parcel location, explicitly not a surveyed/legal boundary. This
 * is attached as a FactRetriever-level qualityCaveat/evidenceQuality (see assemble.ts), not
 * something this module decides per-call.
 *
 * CRS correction (2026-08-23, Code Generation): live inspection of this endpoint found it defaults
 * to EPSG:3857 (Web Mercator) when no output spatial reference is requested - the original
 * hardcoded "assume EPSG:2926" in postgis-adapter.ts would have silently mistagged that default
 * response, producing wrong distances. Fixed by requesting an explicit, known `outSR` on every
 * call (King County's ArcGIS server reprojects server-side - this is the authoritative source
 * system's own transform, not an application-level approximation) and verifying the response's
 * declared `spatialReference.wkid` actually matches what was requested before trusting it.
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";
import type { CandidateParcel } from "../parcel-resolution/types.js";
import type { Polygon } from "../spatial-analysis/types.js";
import { EvidenceQuality, SourceRecordNotFoundError } from "./types.js";
import type { FactRetriever } from "./assemble.js";

const PARCEL_POLYGON_BASE_URL = "https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_Parcels/MapServer/0";

/** Washington State Plane North, NAD83(HARN), US Survey Feet - the one, only CRS this module ever
 * fetches or returns. A WGS84 version for browser/MapLibre display is derived later, if needed,
 * via PostGIS's own ST_Transform (spatial-analysis/postgis-adapter.ts's transformToWgs84) - never
 * by requesting a second copy from King County or by any application-level math. */
export const AUTHORITATIVE_PARCEL_SRID = 2926;

const RingSchema = z.array(z.tuple([z.number(), z.number()]).rest(z.number()));
const EsriPolygonGeometrySchema = z.object({
  rings: z.array(RingSchema).min(1),
});
const ParcelFeatureSchema = z.object({
  attributes: z.object({ PIN: z.string().optional() }),
  geometry: EsriPolygonGeometrySchema,
});
const ParcelPolygonResponseSchema = z.object({
  spatialReference: z.object({ wkid: z.number().optional(), latestWkid: z.number().optional() }).optional(),
  features: z.array(ParcelFeatureSchema),
});

export const KING_COUNTY_PARCEL_BOUNDARY_QUALITY_CAVEAT =
  "King County publishes this parcel boundary as general parcel location for tax-assessment purposes - " +
  "it is not a surveyed or legal boundary and should not be relied on for exact measurements.";

/**
 * Fetches the real parcel boundary polygon by PIN, in the requested spatial reference (King
 * County's ArcGIS server performs the reprojection - this is the authoritative source doing its
 * own transform, not an application-level approximation). Verifies the response actually
 * declares the requested SRID before trusting the coordinates - fails closed (throws) rather than
 * silently tagging mismatched or undeclared coordinates with the wrong `srid`.
 *
 * Uses only the first ring of the first feature returned - King County parcels are simple
 * polygons for this use case; a multi-ring/multi-feature result (rare, e.g. a genuinely disjoint
 * parcel) is treated as not safely representable by this simple retriever and rejected rather
 * than guessed at.
 */
export async function fetchParcelBoundaryPolygon(parcelId: string): Promise<Polygon> {
  const srid = AUTHORITATIVE_PARCEL_SRID;
  const where = `PIN='${parcelId.replace(/'/g, "''")}'`;
  const url = `${PARCEL_POLYGON_BASE_URL}/query?where=${encodeURIComponent(where)}&outFields=PIN&outSR=${srid}&geometryPrecision=2&f=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`King County parcel-polygon request failed: ${response.status} ${response.statusText}`);
  }
  const raw: unknown = await response.json();
  const validated = validateAtBoundary(ParcelPolygonResponseSchema, raw);
  if (validated.outcome === "INVALID") {
    throw new Error(`King County parcel-polygon response failed validation: ${validated.issues.join("; ")}`);
  }

  // Maintenance correction (2026-09-15): checked BEFORE the SRID check, matching
  // seattle-building-outlines.ts's own established precedent - a genuine zero-feature response
  // may omit `spatialReference` entirely (nothing to verify the CRS of), and must never be
  // misclassified as a CRS-mismatch failure. A zero-match or unusable-geometry result for THIS
  // SPECIFIC PIN is not a source/transport failure at all - thrown as SourceRecordNotFoundError,
  // never a plain Error, so assemblePropertyContext can record AvailabilityState.UNAVAILABLE (a
  // legitimate per-parcel absence) rather than SOURCE_ERROR (a source-health signal) - see
  // property-intelligence/types.ts's docstring on that error class for the full reasoning.
  const feature = validated.data.features[0];
  if (!feature) {
    throw new SourceRecordNotFoundError(`No parcel boundary found for PIN "${parcelId}".`);
  }

  const returnedWkid = validated.data.spatialReference?.latestWkid ?? validated.data.spatialReference?.wkid;
  if (returnedWkid !== srid) {
    throw new Error(
      `King County parcel-polygon response declared spatial reference ${String(returnedWkid)}, but ${srid} was requested - ` +
        `refusing to tag these coordinates with an unverified SRID.`
    );
  }

  // Maintenance correction (2026-09-15, caught on review): a valid closed Esri ring needs at
  // least 4 raw coordinate entries (3 distinct vertices + the repeated closing point) - matching
  // seattle-building-outlines.ts's own identical check exactly (this module had incorrectly used
  // `< 3`, which could pass a genuinely degenerate 2-distinct-point "ring" through). The closing
  // duplicate is verified, never assumed, before being dropped - an Esri ring that isn't actually
  // closed is untrustworthy data for this specific record, not a shape this module should guess
  // at completing. After dropping the verified duplicate, consecutive repeated points are
  // collapsed and the remaining ring must have both >= 3 distinct vertices and non-zero area
  // (the shoelace formula) - a ring that is fully closed/well-formed but degenerate (e.g. every
  // vertex collinear or coincident) still cannot be used as a real shed/garage/setback boundary.
  const ring = feature.geometry.rings[0];
  if (!ring || ring.length < 4 || !isClosedRing(ring)) {
    throw new SourceRecordNotFoundError(`Parcel boundary for PIN "${parcelId}" did not return a usable (closed) ring.`);
  }
  const rawPoints = ring.slice(0, -1).map(([x, y]) => ({ x, y }));
  const points = dedupeConsecutivePoints(rawPoints);
  if (points.length < 3 || shoelaceAreaAbs(points) === 0) {
    throw new SourceRecordNotFoundError(`Parcel boundary for PIN "${parcelId}" did not return a usable (non-degenerate) ring.`);
  }
  return { units: "FEET", points, srid };
}

function isClosedRing(ring: readonly (readonly number[])[]): boolean {
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  return first[0] === last[0] && first[1] === last[1];
}

function dedupeConsecutivePoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
}

/** Twice the signed polygon area (shoelace formula), absolute value - zero exactly when every
 * point is collinear (including the fully-coincident case). Pure geometry, no PostGIS round trip
 * needed for this narrow validity check on raw, not-yet-persisted coordinates. */
function shoelaceAreaAbs(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

export function createKingCountyParcelGeometryRetriever(): FactRetriever<Polygon> {
  return {
    factType: "parcel-geometry-available",
    sourceAgency: "King County GIS",
    dataset: "KingCo_Parcels (parcel boundary polygon)",
    qualityCaveat: KING_COUNTY_PARCEL_BOUNDARY_QUALITY_CAVEAT,
    evidenceQuality: EvidenceQuality.GENERAL_LOCATION_ONLY,
    retrieve: (parcel: CandidateParcel) => fetchParcelBoundaryPolygon(parcel.parcelId),
  };
}
