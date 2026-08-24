/**
 * Workflow 2: PropertyContext Assembly (business-logic-model.md).
 *
 * Hard precondition (Functional Design correction 2, enforced STRUCTURALLY here, not just by
 * convention): this function's parameter type only accepts a CONFIRMED ParcelResolutionResult -
 * CLARIFICATION_REQUIRED / NO_MATCH / RESOLUTION_UNAVAILABLE cannot be passed in at all; this is
 * a compile-time guarantee, not a runtime check that could be forgotten at a call site.
 */

import { executeWithBoundedRetry, type RetryPolicy, DEFAULT_RETRY_POLICY } from "../shared/retry.js";
import { logger } from "../shared/logger.js";
import { ParcelResolutionStatus } from "../parcel-resolution/types.js";
import type { CandidateParcel, ParcelResolutionResult } from "../parcel-resolution/types.js";
import { AvailabilityState } from "./types.js";
import type { PropertyContext, PropertyFact, Provenance } from "./types.js";

/** The only ParcelResolutionResult shape this module will accept. */
export type ConfirmedParcelResolution = Extract<ParcelResolutionResult, { status: typeof ParcelResolutionStatus.CONFIRMED }>;

export interface FactRetriever<TValue = unknown> {
  factType: string;
  sourceAgency: string;
  dataset: string;
  /** Unit 2 addition (BR-U2-4) - a static, per-source disclosure for a known evidence-quality
   * limitation (e.g. King County's parcel-polygon layer). Omitted for authoritative sources
   * (every Unit 1 retriever). Attached to every successful fact's Provenance unchanged. */
  qualityCaveat?: string;
  evidenceQuality?: Provenance["evidenceQuality"];
  retrieve: (parcel: CandidateParcel) => Promise<TValue>;
}

export interface AssemblePropertyContextOptions {
  retryPolicy?: RetryPolicy;
  retrievers: FactRetriever[];
}

export async function assemblePropertyContext(
  confirmed: ConfirmedParcelResolution,
  options: AssemblePropertyContextOptions
): Promise<PropertyContext> {
  const policy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const facts: PropertyFact[] = [];

  for (const retriever of options.retrievers) {
    const result = await executeWithBoundedRetry(() => retriever.retrieve(confirmed.confirmedParcel), policy);
    const provenance: Provenance = {
      sourceAgency: retriever.sourceAgency,
      dataset: retriever.dataset,
      sourceIdentifier: confirmed.confirmedParcel.parcelId,
      retrievalTimestamp: new Date().toISOString(),
      ...(retriever.qualityCaveat ? { qualityCaveat: retriever.qualityCaveat } : {}),
      ...(retriever.evidenceQuality ? { evidenceQuality: retriever.evidenceQuality } : {}),
    };

    if (result.outcome === "SUCCESS") {
      facts.push({
        factType: retriever.factType,
        value: result.data,
        provenance,
        availabilityState: AvailabilityState.AVAILABLE,
      });
    } else {
      // Property Intelligence records unavailability - it NEVER assigns REQUIRES_VERIFICATION
      // itself (BR-3.3). That classification happens later, only in the Regulatory Rules Engine.
      logger.warn("SOURCE_FAILURE", { factType: retriever.factType, dataset: retriever.dataset });
      facts.push({
        factType: retriever.factType,
        provenance,
        availabilityState: AvailabilityState.SOURCE_ERROR,
      });
    }
  }

  return {
    parcelId: confirmed.confirmedParcel.parcelId,
    assembledAt: new Date().toISOString(),
    facts,
  };
}
