/**
 * Report Generation Authorization - Question 1's answer, BR-U2-1/BR-U2-2 (business-rules.md).
 * The internal trigger substituting for a verified-PAID event. `authorizeReportGeneration` is the
 * ONLY path by which a ReportGenerationJob may be created in Unit 2.
 */

import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { screeningRequests } from "../db/schema.js";
import { createReportGenerationJob } from "../report-generation-job/repository.js";
import { getSourceHealth, recordIngestionResult, SourceHealthState } from "../data-source-registry/index.js";
import { fetchParcelBoundaryPolygon } from "../property-intelligence/king-county-parcel-geometry.js";
import { SourceRecordNotFoundError } from "../property-intelligence/types.js";
import { executeWithBoundedRetry, DEFAULT_RETRY_POLICY } from "../shared/retry.js";
import { logger } from "../shared/logger.js";
import { ProjectType, SUPPORTED_PROJECT_TYPES, ValidationState, WorkflowType } from "./types.js";
import type { ExistingPropertyScreeningRequestSnapshot, VacantLandScreeningRequestSnapshot } from "./types.js";
import { hydrateScreeningRequestRow } from "./hydrate.js";

/** INTERNAL_PROTOTYPE (Unit 2) plus VERIFIED_PAYMENT (Unit 2B, BR-U2B-15) - the only two ways a
 * ReportGenerationJob may ever be created. INTERNAL_PROTOTYPE is issued exclusively by the
 * server-only CLI script (scripts/generate-prototype-report.ts) - never a deployed HTTP route
 * (2026-08-24 correction - obscurity/unlinked-from-UI is not authorization on Vercel, where every
 * Route Handler is a public endpoint). VERIFIED_PAYMENT is issued exclusively from within the
 * atomic payment-fulfillment transaction (order-payment/repository.ts's handlePaymentConfirmed),
 * never speculatively before Stripe confirmation. */
export const GenerationAuthorizationType = {
  INTERNAL_PROTOTYPE: "INTERNAL_PROTOTYPE",
  VERIFIED_PAYMENT: "VERIFIED_PAYMENT",
} as const;
export type GenerationAuthorizationType = (typeof GenerationAuthorizationType)[keyof typeof GenerationAuthorizationType];

export type GenerationAuthorization =
  | {
      type: typeof GenerationAuthorizationType.INTERNAL_PROTOTYPE;
      screeningRequestId: string;
      authorizedBy: string;
      authorizedAt: string;
    }
  | {
      type: typeof GenerationAuthorizationType.VERIFIED_PAYMENT;
      screeningRequestId: string;
      /** The Order whose confirmed payment authorizes this job - never persisted until Stripe's
       * webhook signature has been verified and the Order has actually transitioned to PAID. */
      orderId: string;
      authorizedAt: string;
    };

export type ReadinessResult = { ready: true } | { ready: false; reason: string };

/** BR-U2-1: parcel resolved (implicit - a ScreeningRequest always has a confirmedParcelId),
 * project type currently supported, request validation passed, no required source already
 * known-unhealthy. Never invokes Property Intelligence, Spatial Analysis, or the Regulatory Rules
 * Engine - a cheap check only.
 *
 * `async` since 2026-08-25 (Unit 3) - the data-source-health check now reads the persisted
 * DataSourceHealth table (db/client.ts's Db) instead of an in-memory registry instance; no
 * behavioral change to this readiness logic itself, only its storage backend.
 *
 * Maintenance correction (2026-09-15) - a real, discovered self-healing deadlock: the only path
 * that could ever restore `king-county-parcel-polygon`'s observed health to HEALTHY lived inside
 * `runReportGenerationPipeline`, which this very check prevents from ever running once that
 * source is observed UNHEALTHY. See `recoverKingCountyParcelPolygonHealth` below - a bounded,
 * real recovery probe using the actual source adapter for the CURRENT property, reusing the
 * existing bounded-retry policy rather than a new subsystem. A manual UNHEALTHY override remains
 * an absolute circuit-breaker: automatic recovery never attempts to bypass one. */
export async function checkReadiness(
  db: Db,
  screeningRequest: { workflowType: string; projectType: string | null; validationState: string; confirmedParcelId: string },
  requiredSourceIds: string[]
): Promise<ReadinessResult> {
  // Unit 5: branch on workflowType FIRST, per BR-U5-1's discriminated union - never inspect
  // projectType before confirming which workflow this request actually is.
  if (screeningRequest.workflowType === WorkflowType.EXISTING_PROPERTY) {
    if (!screeningRequest.projectType || !SUPPORTED_PROJECT_TYPES.has(screeningRequest.projectType)) {
      return { ready: false, reason: `Project type "${screeningRequest.projectType}" is not currently supported.` };
    }
  } else if (screeningRequest.workflowType === WorkflowType.VACANT_LAND) {
    // No project-type concept for this workflow at all (BR-U5-1) - nothing further to check here.
  } else {
    return { ready: false, reason: `Workflow type "${screeningRequest.workflowType}" is not currently supported.` };
  }
  if (screeningRequest.validationState !== ValidationState.VALID) {
    return { ready: false, reason: "Screening request has not passed validation." };
  }
  for (const sourceId of requiredSourceIds) {
    const snapshot = await getSourceHealth(db, sourceId);
    if (snapshot.effectiveHealthState !== SourceHealthState.UNHEALTHY) continue;

    // A manual UNHEALTHY override is a deliberate operator circuit-breaker (ADM-8) - automatic
    // recovery must never bypass it, regardless of what the underlying source is actually doing
    // right now.
    if (snapshot.manualOverrideState === SourceHealthState.UNHEALTHY) {
      return { ready: false, reason: `Required data source "${sourceId}" is already known to be unhealthy.` };
    }

    // Observed-only UNHEALTHY, no override. king-county-parcel-polygon is the one required source
    // whose only success-recording path is downstream of this very check (a real, structural
    // deadlock - aidlc-docs/aidlc-state.md's dated maintenance-correction entry). king-county-gis
    // already self-heals via app/api/parcels/resolve's own, independent, frequently-exercised
    // write path (every real address search updates it, unrelated to checkout) and has never
    // exhibited this deadlock - no probe is needed for it here.
    if (sourceId === "king-county-parcel-polygon") {
      const recovered = await recoverKingCountyParcelPolygonHealth(db, snapshot.lastFailureAt, screeningRequest.confirmedParcelId);
      if (recovered) {
        // Caught on review (2026-09-15): the probe is a real, non-instantaneous network round
        // trip (with retries) - an operator could set a manual UNHEALTHY override WHILE it was in
        // flight. Re-read effective health now, after the probe, rather than trusting the
        // pre-probe snapshot - a manual override applied mid-probe must still win.
        const postRecovery = await getSourceHealth(db, sourceId);
        if (postRecovery.effectiveHealthState !== SourceHealthState.UNHEALTHY) continue;
      }
    }

    return { ready: false, reason: `Required data source "${sourceId}" is already known to be unhealthy.` };
  }
  return { ready: true };
}

/** Minimum time between real recovery probes while a source stays observed UNHEALTHY (reusing
 * the already-persisted `lastFailureAt` timestamp - no new staleness/TTL infrastructure). Bounds
 * how often a real outage can be "hammered" by repeated checkout attempts without inventing a new
 * rate-limiting subsystem - a single failed checkout retried immediately gets one bounded probe
 * (via executeWithBoundedRetry/DEFAULT_RETRY_POLICY), not a fresh one on every click. */
const RECOVERY_PROBE_COOLDOWN_MS = 60_000;

/**
 * Real, bounded recovery probe for `king-county-parcel-polygon` - reuses the actual source
 * adapter (`fetchParcelBoundaryPolygon`) for the CURRENT screening request's own confirmed
 * parcel, never a fake administrative assertion. Reuses the existing bounded-retry policy
 * (`executeWithBoundedRetry`/`DEFAULT_RETRY_POLICY`, `shared/retry.ts`) rather than inventing new
 * resilience infrastructure - a `SourceRecordNotFoundError` (this specific parcel legitimately has
 * no boundary) is never retried (retrying an immutable PIN cannot change the outcome) but is still
 * treated as proof the source itself is reachable and healthy, matching the same
 * source-vs-record distinction `assemblePropertyContext`/`pipeline.ts` now apply. Only a genuine
 * successful source interaction (a real fetch, or a real "not found" response) ever writes
 * `success: true` - this never fabricates health.
 *
 * Returns `false` without attempting a probe at all if the last failure was too recent
 * (`RECOVERY_PROBE_COOLDOWN_MS`) - avoids hammering a genuinely down upstream service on every
 * checkout attempt.
 */
async function recoverKingCountyParcelPolygonHealth(db: Db, lastFailureAt: string | undefined, confirmedParcelId: string): Promise<boolean> {
  if (lastFailureAt && Date.now() - new Date(lastFailureAt).getTime() < RECOVERY_PROBE_COOLDOWN_MS) {
    return false;
  }

  const result = await executeWithBoundedRetry(
    () => fetchParcelBoundaryPolygon(confirmedParcelId),
    DEFAULT_RETRY_POLICY,
    (error) => !(error instanceof SourceRecordNotFoundError)
  );

  try {
    if (result.outcome === "SUCCESS" || result.lastError instanceof SourceRecordNotFoundError) {
      await recordIngestionResult(db, "king-county-parcel-polygon", { success: true });
      return true;
    }
    await recordIngestionResult(db, "king-county-parcel-polygon", {
      success: false,
      reason: result.lastError instanceof Error ? result.lastError.message : "King County parcel-polygon recovery probe failed.",
    });
    return false;
  } catch (err) {
    // A health-recording failure must never itself be read as "recovery succeeded" - fail closed.
    logger.warn("DATA_SOURCE_HEALTH_RECORDING_FAILED", { sourceId: "king-county-parcel-polygon", error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export type AuthorizeResult =
  | { outcome: "AUTHORIZED"; authorization: GenerationAuthorization; reportGenerationJobId: string }
  | { outcome: "NOT_READY"; reason: string }
  | { outcome: "NOT_FOUND" }
  /** NFR-U5-4 - the live row's own fields failed real shape hydration (hydrate.ts) before a
   * snapshot could be constructed from them. Defense-in-depth: this project's own repository
   * functions should never write an invalid shape, but this boundary never trusts that via a
   * cast alone. */
  | { outcome: "INVALID_PERSISTED_SHAPE"; issues: string[] };

/** Exported so checkout-fulfillment's initiateCheckout (Unit 2B) can run the identical readiness
 * check at its own, earlier trigger point - not a new list, the same one this module already used. */
export const REQUIRED_SOURCE_IDS_FOR_SHED = ["king-county-gis", "king-county-parcel-polygon"];

/** Unit 4 - identical to REQUIRED_SOURCE_IDS_FOR_SHED, not a new list. A garage needs the same
 * confirmed-parcel-boundary data a shed does (`domain-entities.md`) - no new data source is
 * introduced anywhere in Unit 4 (business-rules.md BR-U4-9). */
export const REQUIRED_SOURCE_IDS_FOR_GARAGE = REQUIRED_SOURCE_IDS_FOR_SHED;

/** Unit 5 - identical to REQUIRED_SOURCE_IDS_FOR_SHED/GARAGE, not a new list. Vacant-land
 * screening needs the same confirmed-parcel-boundary data every other workflow does
 * (domain-entities.md) - no new data source is introduced anywhere in Unit 5 (per Q3/Q4's own
 * explicit instruction). */
export const REQUIRED_SOURCE_IDS_FOR_VACANT_LAND = REQUIRED_SOURCE_IDS_FOR_SHED;

/** Unit 7 - identical to REQUIRED_SOURCE_IDS_FOR_SHED, not a new list. A fence evaluation reads only
 * the declared inputs plus the same parcel confirmation every workflow needs (and, best-effort, the
 * ECA layer for flood-prone context); no new data source is introduced anywhere in Unit 7. */
export const REQUIRED_SOURCE_IDS_FOR_FENCE = REQUIRED_SOURCE_IDS_FOR_SHED;

/** Unit 8 - identical to REQUIRED_SOURCE_IDS_FOR_SHED; no new data source (ECA is best-effort context only). */
export const REQUIRED_SOURCE_IDS_FOR_DECK = REQUIRED_SOURCE_IDS_FOR_SHED;

function requiredSourceIdsFor(workflowType: string, projectType: string | null): string[] {
  if (workflowType === WorkflowType.VACANT_LAND) return REQUIRED_SOURCE_IDS_FOR_VACANT_LAND;
  if (projectType === ProjectType.GARAGE) return REQUIRED_SOURCE_IDS_FOR_GARAGE;
  if (projectType === ProjectType.FENCE) return REQUIRED_SOURCE_IDS_FOR_FENCE;
  if (projectType === ProjectType.DECK) return REQUIRED_SOURCE_IDS_FOR_DECK;
  return REQUIRED_SOURCE_IDS_FOR_SHED;
}

/**
 * Garage Screening Coverage Readiness (domain-entities.md, business-rules.md BR-U4-9). A gate
 * SEPARATE FROM AND ADDITIONAL TO `checkReadiness`/`SUPPORTED_PROJECT_TYPES` - membership in
 * SUPPORTED_PROJECT_TYPES only means a GARAGE ScreeningRequest can be created/validated/evaluated
 * (needed for internal development/testing and for exercising the real `/configure` garage path);
 * it does NOT mean GARAGE is offered to a paying customer. This predicate governs (1) whether
 * `GARAGE` appears in the publicly-served available-project-types list, and (2) whether a public
 * checkout may proceed for a GARAGE order (via `checkGarageCheckoutEligibility` below) - it is
 * intentionally NOT consulted by `authorizeReportGeneration` (the internal/CLI-only
 * INTERNAL_PROTOTYPE path), since internal development/testing of garage screening is explicitly
 * allowed to proceed regardless of public commercial readiness (BR-U4-9's own "the same
 * 'build the capability, then gate its sale' sequencing" precedent).
 *
 * Hardcoded `false` today, per business-logic-model.md Workflow U4-3's explicitly-accepted "a
 * static readiness flag Code Generation flips once the founder confirms all conditions are met" -
 * not a shortcut. It is expected to stay `false` for the entire Units 4-11 POC-build phase, since
 * one of its own conditions (professional review of the Tier-2 garage rule package) is explicitly
 * deferred to the post-POC "Regulatory Professional Review / Commercialization Gate" milestone
 * (aidlc-docs/aidlc-state.md). Flipping it to `true` is a founder decision, never inferred from
 * code state - do not derive it from `RegulatoryRule` lifecycle rows without that explicit
 * decision, since even all-Tier-1-candidates-ACTIVE would still leave every genuinely Tier-2
 * setback/height candidate (H1, H2, S2, S3, S4, S5, L4, L5) unreviewed.
 */
export function isGarageScreeningCoverageReady(): boolean {
  return false;
}

/** The additional checkout-time half of the Garage Screening Coverage Readiness gate
 * (business-logic-model.md Workflow U4-3 step 1/3) - called by checkout-fulfillment's
 * initiateCheckout ALONGSIDE (not instead of) checkReadiness, for GARAGE orders only. Returns the
 * same ReadinessResult shape checkReadiness already uses (no new response shape). Non-GARAGE
 * requests are always `{ ready: true }` here - this gate has nothing to say about sheds. */
export function checkGarageCheckoutEligibility(screeningRequest: { projectType: string | null }): ReadinessResult {
  if (screeningRequest.projectType !== ProjectType.GARAGE) return { ready: true };
  if (!isGarageScreeningCoverageReady()) {
    return {
      ready: false,
      reason: "Detached garage screening is not yet available for purchase - the required regulatory rule coverage has not been activated.",
    };
  }
  return { ready: true };
}

/**
 * Fence Screening Coverage Readiness (Unit 7) - mirrors Garage Screening Coverage Readiness exactly
 * (same two-layer discipline: intake/evaluation support via SUPPORTED_PROJECT_TYPES is separate from
 * public advertisement and public checkout, which this predicate governs). Hardcoded `false`:
 * flipping it - like activating the eight fence rules - is a founder decision, never inferred from
 * rule lifecycle state. Fences are therefore creatable, validatable and internally generatable
 * (INTERNAL_PROTOTYPE) but not publicly offered or purchasable.
 */
export function isFenceScreeningCoverageReady(): boolean {
  return false;
}

/** Checkout-time half of Fence Screening Coverage Readiness; `{ ready: true }` for non-fence requests. */
export function checkFenceCheckoutEligibility(screeningRequest: { projectType: string | null }): ReadinessResult {
  if (screeningRequest.projectType !== ProjectType.FENCE) return { ready: true };
  if (!isFenceScreeningCoverageReady()) {
    return {
      ready: false,
      reason: "Fence screening is not yet available for purchase - the required regulatory rule coverage has not been activated.",
    };
  }
  return { ready: true };
}

/**
 * Deck Screening Coverage Readiness (Unit 8) - identical two-layer discipline to garage and fence.
 * Hardcoded `false`: activating the six deck rules and flipping this are founder decisions.
 */
export function isDeckScreeningCoverageReady(): boolean {
  return false;
}

/** Checkout-time half of Deck Screening Coverage Readiness; `{ ready: true }` for non-deck requests. */
export function checkDeckCheckoutEligibility(screeningRequest: { projectType: string | null }): ReadinessResult {
  if (screeningRequest.projectType !== ProjectType.DECK) return { ready: true };
  if (!isDeckScreeningCoverageReady()) {
    return {
      ready: false,
      reason: "Deck screening is not yet available for purchase - the required regulatory rule coverage has not been activated.",
    };
  }
  return { ready: true };
}

/**
 * Vacant-Land Screening Coverage Readiness (Unit 5, BR-U5-9 - mirrors Garage Screening Coverage
 * Readiness above exactly, same two-layer discipline). Governs (1) whether the vacant-land entry
 * point is publicly advertised, and (2) whether public checkout may proceed for a VACANT_LAND
 * order (via `checkVacantLandCheckoutEligibility` below). Hardcoded `false` today - expected to
 * stay `false` for the entire Units 5-11 POC-build phase (BR-U5-5 confirms zero Unit 5 candidates
 * reach ACTIVE within this unit). This is COMMERCIAL-AVAILABILITY enforcement, structurally
 * distinct from `isVacantLandPersistenceWriteEnabled` below (data-integrity/persistence-layer
 * enforcement) - neither substitutes for the other, per NFR Design's corrected migration pattern.
 */
export function isVacantLandScreeningCoverageReady(): boolean {
  return false;
}

/** The additional checkout-time half of Vacant-Land Screening Coverage Readiness - called by
 * checkout-fulfillment's initiateCheckout alongside checkReadiness, for VACANT_LAND requests
 * only. Mirrors checkGarageCheckoutEligibility's shape exactly. */
export function checkVacantLandCheckoutEligibility(screeningRequest: { workflowType: string }): ReadinessResult {
  if (screeningRequest.workflowType !== WorkflowType.VACANT_LAND) return { ready: true };
  if (!isVacantLandScreeningCoverageReady()) {
    return {
      ready: false,
      reason: "Vacant-land screening is not yet available for purchase - the required regulatory rule coverage has not been activated.",
    };
  }
  return { ready: true };
}

/**
 * Persistence-Write Activation Gate (Unit 5, NFR Design Migration Design Pattern Phase 5 -
 * corrected per founder review). A narrow, purpose-built, hardcoded-boolean gate - NOT a general
 * feature-flag framework, NOT the same thing as `isVacantLandScreeningCoverageReady` above.
 * Governs ONLY whether the application may persist a VACANT_LAND row at all (a data-layer
 * capability decision) - entirely independent of commercial readiness. Defaults `false`: no
 * VACANT_LAND row may be written until PRE-ACTIVATION ENFORCEMENT (the database-level
 * `screening_requests_workflow_shape_valid`/`regulatory_rules_applicability_scope_valid` CHECK
 * constraints, `src/db/migrations/0006_pre_activation_enforcement_vacant_land.sql`) is confirmed
 * applied and every deployed application instance is workflow-aware. Flipping this to `true` is
 * an operational/deployment decision, made independently of and never substituting for
 * `isVacantLandScreeningCoverageReady`'s own, separate, later commercial decision.
 */
export function isVacantLandPersistenceWriteEnabled(): boolean {
  return false;
}

/**
 * BR-U2-2: the only path by which a ReportGenerationJob may be created. `authorizedBy` is
 * required and must identify a real human/internal-operator identity - never defaulted. Takes
 * the ScreeningRequest's immutable snapshot NOW, at this exact moment (RGD-4) - a later edit to a
 * different live request can never retroactively change this snapshot.
 */
export async function authorizeReportGeneration(
  db: Db,
  screeningRequestId: string,
  authorizedBy: string
): Promise<AuthorizeResult> {
  if (!authorizedBy.trim()) {
    throw new Error("authorizedBy is required to authorize report generation - no code path may omit it.");
  }

  const [request] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, screeningRequestId));
  if (!request) return { outcome: "NOT_FOUND" };

  const readiness = await checkReadiness(db, request, requiredSourceIdsFor(request.workflowType, request.projectType));
  if (!readiness.ready) return { outcome: "NOT_READY", reason: readiness.reason };

  const authorizedAt = new Date().toISOString();
  const authorization: GenerationAuthorization = {
    type: GenerationAuthorizationType.INTERNAL_PROTOTYPE,
    screeningRequestId,
    authorizedBy,
    authorizedAt,
  };

  // Snapshot is taken here, once, and never overwritten again (enforced by only ever setting it
  // when currently null - re-authorizing an already-snapshotted request reuses the existing
  // snapshot via createReportGenerationJob's idempotent job creation, not a new snapshot).
  if (!request.snapshot) {
    // NFR-U5-4 (Code Generation review correction) - real hydration of the live row's own fields,
    // never a TypeScript `as` cast, before they become a trusted snapshot.
    const hydrated = hydrateScreeningRequestRow(request);
    if (hydrated.outcome === "INVALID") return { outcome: "INVALID_PERSISTED_SHAPE", issues: hydrated.issues };
    const snapshot: ExistingPropertyScreeningRequestSnapshot | VacantLandScreeningRequestSnapshot =
      hydrated.value.workflowType === WorkflowType.VACANT_LAND
        ? { workflowType: WorkflowType.VACANT_LAND, confirmedParcelId: hydrated.value.confirmedParcelId, screeningIntent: hydrated.value.screeningIntent, vacantLandDetails: hydrated.value.vacantLandDetails }
        : { workflowType: WorkflowType.EXISTING_PROPERTY, confirmedParcelId: hydrated.value.confirmedParcelId, projectType: hydrated.value.projectType, projectDetails: hydrated.value.projectDetails };
    await db
      .update(screeningRequests)
      .set({ snapshot, snapshotTakenAt: new Date(authorizedAt), updatedAt: sql`now()` })
      .where(eq(screeningRequests.id, screeningRequestId));
  }

  const job = await createReportGenerationJob(db, screeningRequestId, authorization);
  return { outcome: "AUTHORIZED", authorization, reportGenerationJobId: job.id };
}
