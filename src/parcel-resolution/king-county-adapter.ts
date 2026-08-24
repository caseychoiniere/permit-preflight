/**
 * King County GIS adapter - real integration code against the ArcGIS REST endpoints validated
 * during Unit 0/Unit 0B (aidlc-docs/construction/unit-0-pre-construction-validation/). Not
 * exercised by the deterministic test suite (see tests/parcel-resolution/*.integration.test.ts
 * for the live-source tests) - this module is what those integration tests exercise, and what
 * the orchestration layer (index.ts) calls in a real deployment.
 *
 * Endpoints (confirmed live during Unit 0B):
 * - Address_Points_locator/GeocodeServer - primary address geocoding
 * - KingCo_PropertyInfo/MapServer (layer 2) - independent parcel lookup by address/PIN, carries
 *   PREUSE_DESC/APPR_IMPR fields useful for vacant-parcel identification
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";
import { CandidateParcelSource } from "./types.js";
import type { CandidateParcel } from "./types.js";
import type { GeocodeOutcome } from "./resolve.js";

const GEOCODE_BASE_URL = "https://gismaps.kingcounty.gov/arcgis/rest/services/Address/Address_Points_locator/GeocodeServer";
const PROPERTY_INFO_BASE_URL = "https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_PropertyInfo/MapServer/2";

const GeocodeCandidateSchema = z.object({
  address: z.string(),
  score: z.number(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
const GeocodeResponseSchema = z.object({
  candidates: z.array(GeocodeCandidateSchema),
});

const PropertyInfoFeatureSchema = z.object({
  attributes: z.object({
    PIN: z.string().optional(),
    ADDR_FULL: z.string().nullable().optional(),
    PREUSE_DESC: z.string().nullable().optional(),
    APPR_IMPR: z.number().nullable().optional(),
  }),
});
const PropertyInfoResponseSchema = z.object({
  features: z.array(PropertyInfoFeatureSchema),
});

/** Score below this is treated as "no real candidate" rather than a low-confidence match -
 * NOTE: per BR-1a, this score is never sufficient FOR CONFIRMATION on its own regardless of
 * value; it is only used here to decide whether a candidate exists to feed into the (mandatory)
 * corroboration/reverse-validation pipeline in resolve.ts. */
const MIN_CANDIDATE_SCORE = 50;

async function fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`King County GIS request failed: ${response.status} ${response.statusText} (${url})`);
  }
  const raw: unknown = await response.json();
  const validated = validateAtBoundary(schema, raw);
  if (validated.outcome === "INVALID") {
    throw new Error(`King County GIS response failed validation: ${validated.issues.join("; ")}`);
  }
  return validated.data;
}

/**
 * Primary geocode. Returns approximateOnly=true when the best result is an interpolated
 * street-range location rather than a real address point (no PIN reachable) - the ~35%
 * real-world case found in Unit 0B.
 */
export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
  const url = `${GEOCODE_BASE_URL}/findAddressCandidates?SingleLine=${encodeURIComponent(address)}&outFields=*&f=json`;
  const data = await fetchJson(url, GeocodeResponseSchema);

  const viable = data.candidates.filter((c) => c.score >= MIN_CANDIDATE_SCORE);
  if (viable.length === 0) {
    return { candidates: [], approximateOnly: false };
  }

  const candidates: CandidateParcel[] = [];
  let approximateOnly = false;

  for (const c of viable) {
    const locatorType = typeof c.attributes?.["Loc_name"] === "string" ? (c.attributes["Loc_name"] as string) : "";
    const pin = typeof c.attributes?.["PIN"] === "string" ? (c.attributes["PIN"] as string) : undefined;
    if (!pin) {
      // Interpolated street-range match: a location, but no real parcel identifier.
      approximateOnly = true;
      continue;
    }
    candidates.push({
      parcelId: pin,
      canonicalAddress: c.address,
      source: CandidateParcelSource.ADDRESS_GEOCODE,
      characteristics: { addressless: false },
    });
    void locatorType;
  }

  return { candidates, approximateOnly: approximateOnly && candidates.length === 0 };
}

/** Independent parcel lookup by address text, via the Property Info layer (a different query
 * path than geocoding) - satisfies BR-1a's "independent lookup, different query path" condition. */
export async function lookupParcelByAddress(address: string): Promise<CandidateParcel[]> {
  const where = `UPPER(ADDR_FULL)=UPPER('${escapeSql(address)}')`;
  const url = `${PROPERTY_INFO_BASE_URL}/query?where=${encodeURIComponent(where)}&outFields=PIN,ADDR_FULL,PREUSE_DESC,APPR_IMPR&f=json`;
  const data = await fetchJson(url, PropertyInfoResponseSchema);

  return data.features
    .filter((f) => f.attributes.PIN)
    .map((f) => ({
      parcelId: f.attributes.PIN!,
      ...(f.attributes.ADDR_FULL ? { canonicalAddress: f.attributes.ADDR_FULL } : {}),
      source: CandidateParcelSource.INDEPENDENT_PARCEL_LOOKUP,
      characteristics: {
        vacant: (f.attributes.PREUSE_DESC ?? "").toUpperCase().includes("VACANT"),
        addressless: !f.attributes.ADDR_FULL,
      },
    }));
}

/** Authoritative lookup by parcel identifier (PIN) - the identifier-input path (BR-1b), never
 * routes through address geocoding. */
export async function lookupParcelByIdentifier(parcelId: string): Promise<CandidateParcel[]> {
  const where = `PIN='${escapeSql(parcelId)}'`;
  const url = `${PROPERTY_INFO_BASE_URL}/query?where=${encodeURIComponent(where)}&outFields=PIN,ADDR_FULL,PREUSE_DESC,APPR_IMPR&f=json`;
  const data = await fetchJson(url, PropertyInfoResponseSchema);

  return data.features
    .filter((f) => f.attributes.PIN)
    .map((f) => ({
      parcelId: f.attributes.PIN!,
      ...(f.attributes.ADDR_FULL ? { canonicalAddress: f.attributes.ADDR_FULL } : {}),
      source: CandidateParcelSource.IDENTIFIER_LOOKUP,
      characteristics: {
        vacant: (f.attributes.PREUSE_DESC ?? "").toUpperCase().includes("VACANT"),
        addressless: !f.attributes.ADDR_FULL,
      },
    }));
}

function escapeSql(value: string): string {
  // Parameterized queries aren't available on this REST/query-string API - single-quote
  // escaping is the documented Esri approach for this endpoint shape (requirements.md SS24
  // "raw SQL must use safe parameterization" concerns direct DB access; this is a third-party
  // read-only REST query string, not a query this application executes against its own database).
  return value.replace(/'/g, "''");
}
