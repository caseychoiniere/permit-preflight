/**
 * Property Intelligence domain types (domain-entities.md "Property Intelligence Domain").
 * Property Intelligence NEVER assigns a regulatory classification (KNOWN/INFERRED/REQUIRES_VERIFICATION)
 * - only the Regulatory Rules Engine does (business-rules.md BR-3.3, BR-4).
 */

export const AvailabilityState = {
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  INSUFFICIENT: "INSUFFICIENT",
  STALE: "STALE",
  SOURCE_ERROR: "SOURCE_ERROR",
} as const;
export type AvailabilityState = (typeof AvailabilityState)[keyof typeof AvailabilityState];

export const EvidenceQuality = {
  AUTHORITATIVE: "AUTHORITATIVE",
  GENERAL_LOCATION_ONLY: "GENERAL_LOCATION_ONLY",
} as const;
export type EvidenceQuality = (typeof EvidenceQuality)[keyof typeof EvidenceQuality];

export interface Provenance {
  sourceAgency: string;
  dataset: string;
  sourceIdentifier?: string;
  retrievalTimestamp: string; // ISO 8601
  effectiveDate?: string;
  /** Unit 2 addition (Functional Design BR-U2-4/domain-entities.md correction). Human-readable
   * disclosure text for a known source-quality limitation - e.g. King County's parcel-polygon
   * layer is general location only, not a surveyed/legal boundary. Required whenever
   * evidenceQuality !== "AUTHORITATIVE"; must propagate unchanged through every downstream
   * artifact derived from this fact (never regenerated, re-worded, or dropped). */
  qualityCaveat?: string;
  /** Unit 2 addition (BR-U2-10) - a structurally-significant classification input, not just
   * display copy. Consumed by the Regulatory Rules Engine's KNOWN-classification gate. Defaults
   * to AUTHORITATIVE when absent (every Unit 1 fact source was already authoritative). */
  evidenceQuality?: EvidenceQuality;
}

export interface PropertyFact<TValue = unknown> {
  factType: string;
  value?: TValue;
  provenance: Provenance;
  availabilityState: AvailabilityState;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  sourceHealthAtRetrieval?: "HEALTHY" | "UNHEALTHY" | "UNKNOWN";
}

export interface PropertyContext {
  parcelId: string;
  assembledAt: string; // ISO 8601 - PropertyContext is immutable once assembled
  facts: PropertyFact[];
}

export function getFact<TValue = unknown>(context: PropertyContext, factType: string): PropertyFact<TValue> | undefined {
  return context.facts.find((f) => f.factType === factType) as PropertyFact<TValue> | undefined;
}
