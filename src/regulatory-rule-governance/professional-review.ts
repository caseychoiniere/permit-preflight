/**
 * Tier-2 professional-review evidence - the smallest auditable mechanism that lets a Tier-2 rule
 * be source-verified (2026-10-06). Governance plumbing, not a product capability: no customer UI,
 * no new identity system (the existing single-operator admin identity records the review), and the
 * lifecycle can verify the evidence exists before a Tier-2 rule reaches SOURCE_VERIFIED.
 *
 * This module never obtains or fabricates an opinion. It only validates the shape of a review that a
 * human professional actually produced, and turns a persisted review into the VerificationRecord's
 * `escalatedProfessional`. A Tier-1 source-verification request can never masquerade as professional
 * review: sourceVerify() (lifecycle.ts) still requires verification.tier === rule.tier, and the
 * escalatedProfessional content is built here from a persisted row, never from a request body.
 */

import { ProfessionType } from "./types.js";
import type { VerificationRecord } from "./types.js";

export const RECORD_PROFESSIONAL_REVIEW_CONFIRMATION = "RECORD PROFESSIONAL REVIEW";

export interface ProfessionalReviewInput {
  reviewerIdentity: string;
  reviewerRole: ProfessionType;
  /** ISO-8601 date/time the review was completed. Must not be in the future. */
  reviewDate: string;
  /** The source provisions the professional actually reviewed (e.g. "SMC 25.09.045.E"). */
  sourceProvisions: string[];
  /** The professional's conclusion about the rule's interpretation. */
  conclusion: string;
  /** Ambiguities / limitations the professional identified. Required - write "none identified" explicitly if so. */
  limitations: string;
  /** References to the review artifact(s) - document title/date/location. At least one. */
  evidenceRefs: string[];
  /** The reviewer's explicit confirmation that the interpretation is suitable for deterministic
   * or fail-closed product use. */
  suitableForDeterministicOrFailClosedUse: boolean;
}

export type ProfessionalReviewValidation = { outcome: "VALID"; reviewDate: Date } | { outcome: "INVALID"; issues: string[] };

const PROFESSION_TYPES = new Set<string>(Object.values(ProfessionType));

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Pure validation, independent of the HTTP boundary and the database (and of the DB CHECKs). */
export function validateProfessionalReviewInput(input: ProfessionalReviewInput, now: Date = new Date()): ProfessionalReviewValidation {
  const issues: string[] = [];
  if (!nonBlank(input.reviewerIdentity)) issues.push("reviewerIdentity is required.");
  if (!PROFESSION_TYPES.has(input.reviewerRole)) issues.push(`reviewerRole must be one of ${[...PROFESSION_TYPES].join(", ")}.`);
  const reviewDate = new Date(input.reviewDate);
  if (!nonBlank(input.reviewDate) || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(input.reviewDate.trim()) || Number.isNaN(reviewDate.getTime())) issues.push("reviewDate must be a valid ISO-8601 date.");
  else if (reviewDate.getTime() > now.getTime()) issues.push("reviewDate must not be in the future.");
  if (!Array.isArray(input.sourceProvisions) || input.sourceProvisions.length === 0 || !input.sourceProvisions.every(nonBlank)) {
    issues.push("sourceProvisions must list at least one reviewed provision.");
  }
  if (!nonBlank(input.conclusion)) issues.push("conclusion is required.");
  if (!nonBlank(input.limitations)) issues.push("limitations is required (state 'none identified' explicitly if so).");
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0 || !input.evidenceRefs.every(nonBlank)) {
    issues.push("evidenceRefs must reference at least one review artifact.");
  }
  if (typeof input.suitableForDeterministicOrFailClosedUse !== "boolean") {
    issues.push("suitableForDeterministicOrFailClosedUse must be an explicit boolean.");
  }
  return issues.length > 0 ? { outcome: "INVALID", issues } : { outcome: "VALID", reviewDate };
}

/** A persisted review row, as the lifecycle needs it. */
export interface PersistedProfessionalReview {
  id: string;
  reviewerIdentity: string;
  reviewerRole: string;
  reviewDate: Date;
  sourceProvisions: string[];
  conclusion: string;
  limitations: string;
  evidenceRefs: string[];
  suitableForProductUse: boolean;
}

export type EscalatedProfessionalResult =
  | { outcome: "OK"; escalatedProfessional: NonNullable<VerificationRecord["escalatedProfessional"]> }
  | { outcome: "REJECTED"; reason: string };

/** Builds `escalatedProfessional` from the newest group of persisted reviews (normally one row), or
 * explains why it cannot. Fails closed on: no review; ANY unsuitable review in the newest group
 * (equal timestamps cannot be ordered, so a disagreement blocks); and a missing, future-dated,
 * invalid-date or incomplete record. Never throws on malformed persisted data. */
export function buildEscalatedProfessional(newest: PersistedProfessionalReview[] | PersistedProfessionalReview | undefined, now: Date = new Date()): EscalatedProfessionalResult {
  const group = newest === undefined ? [] : Array.isArray(newest) ? newest : [newest];
  const latest = group[0];
  if (!latest) {
    return { outcome: "REJECTED", reason: "No professional review is recorded for this rule. Tier-2 source verification requires recorded professional-review evidence." };
  }
  if (group.some((r) => !r.suitableForProductUse)) {
    return { outcome: "REJECTED", reason: "The newest professional review does not confirm the interpretation is suitable for deterministic or fail-closed product use (or equally-new reviews disagree)." };
  }
  const time = latest.reviewDate instanceof Date ? latest.reviewDate.getTime() : Number.NaN;
  if (Number.isNaN(time)) return { outcome: "REJECTED", reason: "The newest professional review has an invalid review date." };
  if (time > now.getTime()) return { outcome: "REJECTED", reason: "The newest professional review is dated in the future." };
  const arraysOk = (values: unknown) => Array.isArray(values) && values.length > 0 && values.every(nonBlank);
  if (!PROFESSION_TYPES.has(latest.reviewerRole) || !nonBlank(latest.reviewerIdentity) || !nonBlank(latest.conclusion) || !nonBlank(latest.limitations) || !arraysOk(latest.sourceProvisions) || !arraysOk(latest.evidenceRefs)) {
    return { outcome: "REJECTED", reason: "The newest professional review record is incomplete." };
  }
  return {
    outcome: "OK",
    escalatedProfessional: {
      identity: latest.reviewerIdentity,
      professionType: latest.reviewerRole as ProfessionType,
      opinion: `${latest.conclusion}\nLimitations: ${latest.limitations}\nProvisions reviewed: ${latest.sourceProvisions.join("; ")}\nEvidence: ${latest.evidenceRefs.join("; ")}`,
      reviewedAt: latest.reviewDate.toISOString(),
      reviewRecordId: latest.id,
    },
  };
}
