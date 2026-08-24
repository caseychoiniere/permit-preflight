/**
 * Captured, deterministic fixtures from Unit 0B's real-world validation
 * (aidlc-docs/construction/unit-0-pre-construction-validation/unit-0b-findings.md, Track 1).
 * No network access - these are snapshots of what the real King County APIs returned during
 * that validation session, used to prove the resolution decision logic (resolve.ts) without
 * depending on live source availability, per NFR Requirements' fixture strategy.
 */

import type { AddressResolutionSourceOutcome } from "../../src/parcel-resolution/resolve.js";
import type { CandidateParcel } from "../../src/parcel-resolution/types.js";

function success<T>(data: T) {
  return { outcome: "SUCCESS" as const, data };
}
function exhausted(lastError: string) {
  return { outcome: "EXHAUSTED" as const, attempts: 3, lastError: new Error(lastError) };
}

// Case: 3216 Fuhrman Ave E - clean match, both sources agree, reverse-validation passes.
export const cleanMatch: { input: string; outcome: AddressResolutionSourceOutcome } = {
  input: "3216 Fuhrman Ave E, Seattle, WA 98102",
  outcome: {
    geocode: success({
      candidates: [
        {
          parcelId: "1959703080",
          canonicalAddress: "3216 Fuhrman Ave E",
          source: "ADDRESS_GEOCODE",
          characteristics: { addressless: false },
        } satisfies CandidateParcel,
      ],
      approximateOnly: false,
    }),
    independentLookup: success([
      { parcelId: "1959703080", canonicalAddress: "3216 Fuhrman Ave E", source: "INDEPENDENT_PARCEL_LOOKUP", characteristics: {} },
    ]),
  },
};

// Case: 7550 15th Ave NW - real Unit 0B finding: no address point exists, only interpolated
// street-range location. Must resolve to CLARIFICATION_REQUIRED/NO_PIN, never CONFIRMED.
export const noPinGap: { input: string; outcome: AddressResolutionSourceOutcome } = {
  input: "7550 15th Ave NW, Seattle, WA 98117",
  outcome: {
    geocode: success({ candidates: [], approximateOnly: true }),
    independentLookup: success([]),
  },
};

// Case: 5215 S Genesee St - real Unit 0B finding: the address does not exist on that street at
// any offset. Both sources completed and found nothing -> honest NO_MATCH.
export const genuineNoMatch: { input: string; outcome: AddressResolutionSourceOutcome } = {
  input: "5215 S Genesee St, Seattle, WA 98118",
  outcome: {
    geocode: success({ candidates: [], approximateOnly: false }),
    independentLookup: success([]),
  },
};

// Case: "123 Main St, Seattle, WA" - the ADVERSARIAL case. Unit 0B found a naive single-geocoder
// approach would return a high-confidence match to the WRONG parcel (canonical address "119 S
// Main St", not 123) and a second, independent source finds a completely different candidate in
// a different city (Algona, WA). This MUST resolve to CLARIFICATION_REQUIRED, never CONFIRMED -
// this is the exact failure mode the multi-source strategy exists to catch.
export const adversarialFalseConfidence: { input: string; outcome: AddressResolutionSourceOutcome } = {
  input: "123 Main St, Seattle, WA",
  outcome: {
    geocode: success({
      candidates: [
        {
          // Geocoder returned this PIN at high confidence, but its OWN canonical address is
          // "119 S Main St" - the reverse-validation check must catch this mismatch.
          parcelId: "5247800360",
          canonicalAddress: "119 S Main St",
          source: "ADDRESS_GEOCODE",
          characteristics: { addressless: false },
        },
      ],
      approximateOnly: false,
    }),
    independentLookup: success([
      // A completely different, wrong-city parcel - proves cross-source disagreement too.
      { parcelId: "3356406895", canonicalAddress: "123 Main St, Algona, WA", source: "INDEPENDENT_PARCEL_LOOKUP", characteristics: {} },
    ]),
  },
};

// Case: source outage - both King County endpoints time out after retries. Must resolve to
// RESOLUTION_UNAVAILABLE, never NO_MATCH (the distinction the user's second correction pass added).
export const sourceOutage: { input: string; outcome: AddressResolutionSourceOutcome } = {
  input: "9004 36th Ave SW, Seattle, WA 98126",
  outcome: {
    geocode: exhausted("King County GIS request timed out after 3 attempts"),
    independentLookup: success({ candidates: [], approximateOnly: false } as never), // not reached - geocode fails first
  },
};

// Case: a genuine vacant parcel - Unit 0B found this via the Assessor's own PREUSE_DESC field,
// resolvable via the identifier path (not address geocoding, since it has no canonical address).
export const vacantParcelByIdentifier = {
  input: "9830200356",
  candidate: {
    parcelId: "9830200356",
    source: "IDENTIFIER_LOOKUP" as const,
    characteristics: { vacant: true, addressless: true },
  } satisfies CandidateParcel,
};
