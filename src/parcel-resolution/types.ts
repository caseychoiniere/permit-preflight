/**
 * Parcel Resolution domain types (domain-entities.md "Parcel Resolution Domain").
 * Mirrors the approved Functional Design exactly, including the second-pass corrections
 * (RESOLUTION_UNAVAILABLE; addressless/vacant-parcel support).
 */

import { z } from "zod";

export const AddressInputSchema = z.object({
  raw: z.string().min(1),
});
export type AddressInput = z.infer<typeof AddressInputSchema>;

export const ParcelIdentifierInputSchema = z.object({
  raw: z.string().min(1),
});
export type ParcelIdentifierInput = z.infer<typeof ParcelIdentifierInputSchema>;

export const CandidateParcelSource = {
  ADDRESS_GEOCODE: "ADDRESS_GEOCODE",
  INDEPENDENT_PARCEL_LOOKUP: "INDEPENDENT_PARCEL_LOOKUP",
  IDENTIFIER_LOOKUP: "IDENTIFIER_LOOKUP",
  OTHER: "OTHER",
} as const;
export type CandidateParcelSource = (typeof CandidateParcelSource)[keyof typeof CandidateParcelSource];

export interface ParcelCharacteristics {
  cornerLot: boolean;
  merged: boolean;
  split: boolean;
  condo: boolean;
  vacant: boolean;
  addressless: boolean;
}

export interface CandidateParcel {
  parcelId: string;
  /** Present only when the parcel has a recorded canonical address - vacant/addressless
   * parcels legitimately have none (business-rules.md BR-1b / domain-entities.md correction). */
  canonicalAddress?: string;
  source: CandidateParcelSource;
  characteristics: Partial<ParcelCharacteristics>;
}

export const ClarificationReason = {
  NO_PIN: "NO_PIN",
  CONFLICTING_SOURCES: "CONFLICTING_SOURCES",
  MULTIPLE_CANDIDATES: "MULTIPLE_CANDIDATES",
  INSUFFICIENT_CORROBORATION: "INSUFFICIENT_CORROBORATION",
  ADDRESS_MISMATCH: "ADDRESS_MISMATCH",
} as const;
export type ClarificationReason = (typeof ClarificationReason)[keyof typeof ClarificationReason];

export interface UnavailabilityDetail {
  failedSource: string;
  failureNature: string;
}

export const ParcelResolutionStatus = {
  CONFIRMED: "CONFIRMED",
  CLARIFICATION_REQUIRED: "CLARIFICATION_REQUIRED",
  NO_MATCH: "NO_MATCH",
  RESOLUTION_UNAVAILABLE: "RESOLUTION_UNAVAILABLE",
} as const;
export type ParcelResolutionStatus = (typeof ParcelResolutionStatus)[keyof typeof ParcelResolutionStatus];

/**
 * Product-correctness amendment (2026-08-27, "fail closed on claims, not on completion" -
 * see aidlc-docs/decisions/2026-08-27-fail-closed-on-claims-not-completion-correction.md).
 * Distinguishes HOW a CONFIRMED result was reached - never silently collapsed into one
 * undifferentiated "confirmed" the way an ALGORITHMIC (independently-corroborated) match and a
 * USER_CONFIRMED (explicit user confirmation after CLARIFICATION_REQUIRED) result would otherwise
 * be indistinguishable. "Do not pretend independent corroboration succeeded" when it didn't.
 */
export const ParcelIdentityProvenance = {
  ALGORITHMIC: "ALGORITHMIC",
  USER_CONFIRMED: "USER_CONFIRMED",
} as const;
export type ParcelIdentityProvenance = (typeof ParcelIdentityProvenance)[keyof typeof ParcelIdentityProvenance];

export type ParcelResolutionResult =
  | {
      status: typeof ParcelResolutionStatus.CONFIRMED;
      confirmedParcel: CandidateParcel;
      candidates: CandidateParcel[];
      identityProvenance: ParcelIdentityProvenance;
    }
  | {
      status: typeof ParcelResolutionStatus.CLARIFICATION_REQUIRED;
      clarificationReason: ClarificationReason;
      candidates: CandidateParcel[];
      humanReadableDetail?: string;
    }
  | { status: typeof ParcelResolutionStatus.NO_MATCH; humanReadableDetail?: string }
  | { status: typeof ParcelResolutionStatus.RESOLUTION_UNAVAILABLE; unavailabilityDetail: UnavailabilityDetail };
