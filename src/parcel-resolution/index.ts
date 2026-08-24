/**
 * Parcel Resolution component - public orchestration (Workflow 1a/1b, business-logic-model.md).
 * Wires: Boundary Validator -> Bounded-Retry Executor -> live adapter -> decision logic.
 *
 * This is the only file in this component that performs I/O orchestration; decision logic
 * (resolve.ts) stays pure and independently testable, per Functional Design's design intent.
 */

import { executeWithBoundedRetry, type RetryPolicy, DEFAULT_RETRY_POLICY } from "../shared/retry.js";
import { validateAtBoundary } from "../shared/validation.js";
import { logger } from "../shared/logger.js";
import * as kingCounty from "./king-county-adapter.js";
import { normalizeAddress, normalizeParcelIdentifier } from "./normalize.js";
import { decideAddressResolution, decideIdentifierResolution } from "./resolve.js";
import { AddressInputSchema, ParcelIdentifierInputSchema, ParcelResolutionStatus, type ParcelResolutionResult } from "./types.js";

export * from "./types.js";
export * from "./resolve.js";
export * from "./normalize.js";

export interface ParcelResolutionDeps {
  retryPolicy?: RetryPolicy;
  geocodeAddress?: typeof kingCounty.geocodeAddress;
  lookupParcelByAddress?: typeof kingCounty.lookupParcelByAddress;
  lookupParcelByIdentifier?: typeof kingCounty.lookupParcelByIdentifier;
}

/** Workflow 1a: address-input resolution path. */
export async function resolveByAddress(raw: string, deps: ParcelResolutionDeps = {}): Promise<ParcelResolutionResult> {
  const validated = validateAtBoundary(AddressInputSchema, { raw });
  if (validated.outcome === "INVALID") {
    logger.warn("VALIDATION_FAILURE", { component: "parcel-resolution", issues: validated.issues.join("; ") });
    return { status: ParcelResolutionStatus.NO_MATCH, humanReadableDetail: `Invalid address input: ${validated.issues.join("; ")}` };
  }

  const normalized = normalizeAddress(validated.data.raw);
  const policy = deps.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const geocode = deps.geocodeAddress ?? kingCounty.geocodeAddress;
  const independentLookup = deps.lookupParcelByAddress ?? kingCounty.lookupParcelByAddress;

  const geocodeResult = await executeWithBoundedRetry(() => geocode(normalized), policy);
  const independentResult = await executeWithBoundedRetry(() => independentLookup(normalized), policy);

  if (geocodeResult.outcome === "EXHAUSTED" || independentResult.outcome === "EXHAUSTED") {
    logger.warn("RETRY_EXHAUSTED", { component: "parcel-resolution", inputType: "address" });
  }

  const result = decideAddressResolution(normalized, { geocode: geocodeResult, independentLookup: independentResult });
  if (result.status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE) {
    logger.error("RESOLUTION_UNAVAILABLE", { failedSource: result.unavailabilityDetail.failedSource });
  }
  return result;
}

/** Workflow 1b: parcel-identifier-input resolution path. Never routes through address geocoding. */
export async function resolveByIdentifier(raw: string, deps: ParcelResolutionDeps = {}): Promise<ParcelResolutionResult> {
  const validated = validateAtBoundary(ParcelIdentifierInputSchema, { raw });
  if (validated.outcome === "INVALID") {
    logger.warn("VALIDATION_FAILURE", { component: "parcel-resolution", issues: validated.issues.join("; ") });
    return { status: ParcelResolutionStatus.NO_MATCH, humanReadableDetail: `Invalid parcel identifier input: ${validated.issues.join("; ")}` };
  }

  const normalized = normalizeParcelIdentifier(validated.data.raw);
  const policy = deps.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const lookupByIdentifier = deps.lookupParcelByIdentifier ?? kingCounty.lookupParcelByIdentifier;

  const lookupResult = await executeWithBoundedRetry(() => lookupByIdentifier(normalized), policy);

  // Independent corroboration "where available" - King County's own PIN lookup is currently the
  // only authoritative identifier-lookup path this codebase integrates with, so a second,
  // genuinely independent source is not yet available (NOT_AVAILABLE, per BR-1b) rather than a
  // simulated/duplicated call to the same source, which would not actually corroborate anything.
  const corroboration = "NOT_AVAILABLE" as const;

  if (lookupResult.outcome === "EXHAUSTED") {
    logger.warn("RETRY_EXHAUSTED", { component: "parcel-resolution", inputType: "identifier" });
  }

  const result = decideIdentifierResolution({ lookup: lookupResult, corroboration });
  if (result.status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE) {
    logger.error("RESOLUTION_UNAVAILABLE", { failedSource: result.unavailabilityDetail.failedSource });
  }
  return result;
}
