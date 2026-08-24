/**
 * Parcel Resolution decision logic - BR-1a, BR-1b, BR-2 (business-rules.md), Workflow 1a/1b
 * (business-logic-model.md). Pure functions: given already-fetched source outcomes (via the
 * Bounded-Retry Executor), decide the ParcelResolutionResult. No I/O here - deterministically
 * testable with fixture data, no network/DB dependency.
 *
 * Shared safety invariant enforced throughout: a single confidence score or a single
 * uncorroborated lookup is NEVER sufficient for CONFIRMED. Material disagreement is NEVER
 * resolved by majority vote. A source failure (RetryResult EXHAUSTED) NEVER becomes NO_MATCH.
 */

import type { RetryResult } from "../shared/retry.js";
import { addressesSemanticallyEqual } from "./normalize.js";
import { ClarificationReason, ParcelResolutionStatus } from "./types.js";
import type { CandidateParcel, ParcelResolutionResult } from "./types.js";

export interface GeocodeOutcome {
  candidates: CandidateParcel[];
  /** true when the geocoder only produced an interpolated street-range location, not a real
   * address point with a PIN - Unit 0B's most common real-world failure mode (~35% of addresses). */
  approximateOnly: boolean;
}

export interface AddressResolutionSourceOutcome {
  geocode: RetryResult<GeocodeOutcome>;
  independentLookup: RetryResult<CandidateParcel[]>;
}

/** BR-1a + BR-2, address-input path (Workflow 1a). */
export function decideAddressResolution(
  inputAddress: string,
  outcome: AddressResolutionSourceOutcome
): ParcelResolutionResult {
  if (outcome.geocode.outcome === "EXHAUSTED") {
    return {
      status: ParcelResolutionStatus.RESOLUTION_UNAVAILABLE,
      unavailabilityDetail: { failedSource: "address-geocode", failureNature: describeFailure(outcome.geocode.lastError) },
    };
  }
  if (outcome.independentLookup.outcome === "EXHAUSTED") {
    return {
      status: ParcelResolutionStatus.RESOLUTION_UNAVAILABLE,
      unavailabilityDetail: {
        failedSource: "independent-parcel-lookup",
        failureNature: describeFailure(outcome.independentLookup.lastError),
      },
    };
  }

  const geocode = outcome.geocode.data;
  const independentCandidates = outcome.independentLookup.data;
  const allCandidates = [...geocode.candidates, ...independentCandidates];

  if (geocode.approximateOnly && geocode.candidates.length === 0) {
    // A location exists but no address point/PIN is reachable - the real, common Unit 0B case.
    return { status: ParcelResolutionStatus.CLARIFICATION_REQUIRED, clarificationReason: ClarificationReason.NO_PIN, candidates: allCandidates };
  }

  if (geocode.candidates.length === 0 && independentCandidates.length === 0) {
    return { status: ParcelResolutionStatus.NO_MATCH };
  }

  if (geocode.candidates.length > 1 || independentCandidates.length > 1) {
    return { status: ParcelResolutionStatus.CLARIFICATION_REQUIRED, clarificationReason: ClarificationReason.MULTIPLE_CANDIDATES, candidates: allCandidates };
  }

  const geocodeCandidate = geocode.candidates[0];
  const independentCandidate = independentCandidates[0];

  if (!geocodeCandidate || !independentCandidate) {
    // Only one of the two sources produced a candidate - cannot independently corroborate.
    return {
      status: ParcelResolutionStatus.CLARIFICATION_REQUIRED,
      clarificationReason: ClarificationReason.INSUFFICIENT_CORROBORATION,
      candidates: allCandidates,
    };
  }

  if (geocodeCandidate.parcelId !== independentCandidate.parcelId) {
    return { status: ParcelResolutionStatus.CLARIFICATION_REQUIRED, clarificationReason: ClarificationReason.CONFLICTING_SOURCES, candidates: allCandidates };
  }

  if (!geocodeCandidate.canonicalAddress) {
    // Matched parcel has no canonical address to reverse-validate against - cannot confirm via
    // the address path (a legitimate edge case; the identifier path handles addressless parcels).
    return {
      status: ParcelResolutionStatus.CLARIFICATION_REQUIRED,
      clarificationReason: ClarificationReason.INSUFFICIENT_CORROBORATION,
      candidates: allCandidates,
    };
  }

  if (!addressesSemanticallyEqual(geocodeCandidate.canonicalAddress, inputAddress)) {
    return { status: ParcelResolutionStatus.CLARIFICATION_REQUIRED, clarificationReason: ClarificationReason.ADDRESS_MISMATCH, candidates: allCandidates };
  }

  return { status: ParcelResolutionStatus.CONFIRMED, confirmedParcel: geocodeCandidate, candidates: allCandidates };
}

export interface IdentifierResolutionSourceOutcome {
  lookup: RetryResult<CandidateParcel[]>;
  /** "NOT_AVAILABLE" when no second authoritative path exists for this identifier at all -
   * distinct from a second path that was attempted and failed (EXHAUSTED). */
  corroboration: RetryResult<CandidateParcel[]> | "NOT_AVAILABLE";
}

/** BR-1b + BR-2, parcel-identifier-input path (Workflow 1b). Never routes through address geocoding. */
export function decideIdentifierResolution(outcome: IdentifierResolutionSourceOutcome): ParcelResolutionResult {
  if (outcome.lookup.outcome === "EXHAUSTED") {
    return {
      status: ParcelResolutionStatus.RESOLUTION_UNAVAILABLE,
      unavailabilityDetail: { failedSource: "identifier-lookup", failureNature: describeFailure(outcome.lookup.lastError) },
    };
  }

  const candidates = outcome.lookup.data;
  if (candidates.length === 0) {
    return { status: ParcelResolutionStatus.NO_MATCH };
  }
  if (candidates.length > 1) {
    return { status: ParcelResolutionStatus.CLARIFICATION_REQUIRED, clarificationReason: ClarificationReason.MULTIPLE_CANDIDATES, candidates };
  }
  const candidate = candidates[0]!;

  if (outcome.corroboration === "NOT_AVAILABLE") {
    return { status: ParcelResolutionStatus.CLARIFICATION_REQUIRED, clarificationReason: ClarificationReason.INSUFFICIENT_CORROBORATION, candidates: [candidate] };
  }
  if (outcome.corroboration.outcome === "EXHAUSTED") {
    return {
      status: ParcelResolutionStatus.RESOLUTION_UNAVAILABLE,
      unavailabilityDetail: {
        failedSource: "identifier-corroboration",
        failureNature: describeFailure(outcome.corroboration.lastError),
      },
    };
  }

  const corroborating = outcome.corroboration.data;
  if (corroborating.length === 0) {
    return { status: ParcelResolutionStatus.CLARIFICATION_REQUIRED, clarificationReason: ClarificationReason.INSUFFICIENT_CORROBORATION, candidates: [candidate] };
  }
  const corroboratingCandidate = corroborating[0]!;
  if (corroboratingCandidate.parcelId !== candidate.parcelId) {
    return {
      status: ParcelResolutionStatus.CLARIFICATION_REQUIRED,
      clarificationReason: ClarificationReason.CONFLICTING_SOURCES,
      candidates: [candidate, corroboratingCandidate],
    };
  }

  // Addressless/vacant parcels are fully supported here - no canonical-address check is
  // required for the identifier path (BR-1b), unlike BR-1a's reverse-validation.
  return { status: ParcelResolutionStatus.CONFIRMED, confirmedParcel: candidate, candidates: [candidate] };
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
