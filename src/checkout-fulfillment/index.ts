/**
 * Checkout & Fulfillment Service - Unit 2B's thin coordination layer (business-logic-model.md
 * Workflow 2/3/4). Owns no persisted state of its own; every mutation happens through
 * order-payment, report-access, or report-generation-job's existing repositories/schema.
 */

import { eq, sql } from "drizzle-orm";
import { start } from "workflow/api";
import type { Db } from "../db/client.js";
import { screeningRequests, reportGenerationJobs, type ReportGenerationJobRow, type EvidenceReportArtifactRow } from "../db/schema.js";
import type { ExistingPropertyScreeningRequestSnapshot, VacantLandScreeningRequestSnapshot } from "../screening-request/types.js";
import { ProjectType, WorkflowType } from "../screening-request/types.js";
import { hydrateScreeningRequestRow } from "../screening-request/hydrate.js";
import {
  checkGarageCheckoutEligibility,
  checkReadiness,
  checkVacantLandCheckoutEligibility,
  GenerationAuthorizationType,
  REQUIRED_SOURCE_IDS_FOR_GARAGE,
  REQUIRED_SOURCE_IDS_FOR_SHED,
  REQUIRED_SOURCE_IDS_FOR_VACANT_LAND,
  type GenerationAuthorization,
} from "../screening-request/authorization.js";
import { ReportGenerationJobState } from "../report-generation-job/repository.js";
import { createCheckoutSession, getOrderByCheckoutSessionId, getOrderById, type CreateCheckoutSessionResult } from "../order-payment/repository.js";
import { OrderState, GuestOrderStatus, RefundReason } from "../order-payment/types.js";
import type { StripeClient } from "../order-payment/stripe-client.js";
import type { ResendClient } from "../email-delivery/resend-client.js";
import { deliverGuestReportAccess, getActiveCredentialDeliveryStatus, type DeliveryStatus } from "../report-access/repository.js";
import { getReportById } from "../evidence-report-artifact/index.js";
import { getReportPrice } from "./types.js";
// No ".js" suffix (see reconciliation.ts's comment on the same import) - required for the
// Workflow SDK's own build-time discovery to correctly resolve this file.
import { processRefundWorkflow } from "../workflows/refund-workflow";

export type { CreateCheckoutSessionResult } from "../order-payment/repository.js";

export type InitiateCheckoutResult =
  | CreateCheckoutSessionResult
  | { outcome: "NOT_READY"; reason: string }
  | { outcome: "NOT_FOUND" }
  | { outcome: "INVALID_PERSISTED_SHAPE"; issues: string[] };

/**
 * BR-U2B-16's purchase-lock trigger point (moved forward from Unit 2's `authorizeReportGeneration`
 * to here, per founder review) + BR-U2B-1's readiness check, then delegates to order-payment's
 * resumable `createCheckoutSession`.
 */
export async function initiateCheckout(
  db: Db,
  stripeClient: StripeClient,
  params: { screeningRequestId: string; successUrl: string; cancelUrl: string }
): Promise<InitiateCheckoutResult> {
  const [request] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, params.screeningRequestId));
  if (!request) return { outcome: "NOT_FOUND" };

  const requiredSourceIds =
    request.workflowType === WorkflowType.VACANT_LAND
      ? REQUIRED_SOURCE_IDS_FOR_VACANT_LAND
      : request.projectType === ProjectType.GARAGE
        ? REQUIRED_SOURCE_IDS_FOR_GARAGE
        : REQUIRED_SOURCE_IDS_FOR_SHED;
  const readiness = await checkReadiness(db, request, requiredSourceIds);
  if (!readiness.ready) return { outcome: "NOT_READY", reason: readiness.reason };

  // Garage Screening Coverage Readiness (BR-U4-9) - an ADDITIONAL gate beyond checkReadiness,
  // consulted only here (the public checkout path), never by authorizeReportGeneration's internal
  // INTERNAL_PROTOTYPE path. A no-op ({ ready: true }) for non-GARAGE requests.
  const garageEligibility = checkGarageCheckoutEligibility(request);
  if (!garageEligibility.ready) return { outcome: "NOT_READY", reason: garageEligibility.reason };

  // Vacant-Land Screening Coverage Readiness (BR-U5-9) - mirrors garageEligibility exactly, a
  // no-op ({ ready: true }) for non-VACANT_LAND requests.
  const vacantLandEligibility = checkVacantLandCheckoutEligibility(request);
  if (!vacantLandEligibility.ready) return { outcome: "NOT_READY", reason: vacantLandEligibility.reason };

  // Purchase lock (BR-U2B-16): take the immutable snapshot NOW, once, if not already taken - a
  // later Order for this same screeningRequestId (e.g. after an EXPIRED attempt) reuses this same
  // snapshot, never re-snapshots a possibly-since-edited live request. Reuses Unit 2's exact
  // mechanism (updateProjectDetails already refuses to edit a request once snapshot is set).
  if (!request.snapshot) {
    // NFR-U5-4 (Code Generation review correction) - real hydration, never a TypeScript `as` cast.
    const hydrated = hydrateScreeningRequestRow(request);
    if (hydrated.outcome === "INVALID") return { outcome: "INVALID_PERSISTED_SHAPE", issues: hydrated.issues };
    const snapshot: ExistingPropertyScreeningRequestSnapshot | VacantLandScreeningRequestSnapshot =
      hydrated.value.workflowType === WorkflowType.VACANT_LAND
        ? { workflowType: WorkflowType.VACANT_LAND, confirmedParcelId: hydrated.value.confirmedParcelId, screeningIntent: hydrated.value.screeningIntent, vacantLandDetails: hydrated.value.vacantLandDetails }
        : { workflowType: WorkflowType.EXISTING_PROPERTY, confirmedParcelId: hydrated.value.confirmedParcelId, projectType: hydrated.value.projectType, projectDetails: hydrated.value.projectDetails };
    await db.update(screeningRequests).set({ snapshot, snapshotTakenAt: sql`now()`, updatedAt: sql`now()` }).where(eq(screeningRequests.id, params.screeningRequestId));
  }

  const { priceCents, currency } = getReportPrice();
  return createCheckoutSession(db, stripeClient, {
    screeningRequestId: params.screeningRequestId,
    priceCents,
    currency,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });
}

/**
 * Pattern 4: derives the minimized GuestOrderStatus purely from server-side Order/
 * ReportGenerationJob state - no live Stripe call, no side effects. `RECONCILING` is never
 * produced here (that is Pattern 1's createCheckoutSession-retry-only signal); an Order that is
 * still locally PENDING always reads back as PENDING from this pure DB-state read.
 */
export async function getGuestStatus(db: Db, stripeCheckoutSessionId: string): Promise<GuestOrderStatus> {
  const order = await getOrderByCheckoutSessionId(db, stripeCheckoutSessionId);
  if (!order) return GuestOrderStatus.NOT_FOUND;

  switch (order.state) {
    case OrderState.PENDING:
      return GuestOrderStatus.PENDING;
    case OrderState.REFUND_PENDING:
      return GuestOrderStatus.REFUND_PENDING;
    case OrderState.REFUNDED:
      return GuestOrderStatus.REFUNDED;
    case OrderState.REFUND_FAILED:
      return GuestOrderStatus.REFUND_REQUIRES_SUPPORT;
    case OrderState.EXPIRED:
      return GuestOrderStatus.EXPIRED;
    case OrderState.PAID: {
      const [job] = await db.select({ state: reportGenerationJobs.state }).from(reportGenerationJobs).where(eq(reportGenerationJobs.screeningRequestId, order.screeningRequestId));
      return job?.state === ReportGenerationJobState.COMPLETE ? GuestOrderStatus.REPORT_READY : GuestOrderStatus.PAYMENT_CONFIRMED;
    }
  }
}

export interface GuestReportView {
  artifact: EvidenceReportArtifactRow;
  /** Undefined until deliverGuestReportAccess has run at least once for this report (a brief
   * window right after generation completes) - the frontend should treat that the same as
   * EMAIL_PENDING (delivery is in progress, not failed), never as a failure. */
  emailDeliveryStatus?: DeliveryStatus;
}

/**
 * Product-correctness correction (2026-08-28, real end-to-end browser test): a guest customer's
 * post-checkout status page previously told them their report was ready and to "check your email"
 * with no way to see it in the browser at all - email delivery was a hard dependency for a
 * successful purchase to actually be usable. This resolves the SAME already-generated
 * EvidenceReportArtifact GET /api/reports serves (via the identical getReportById - never a
 * second report-rendering/generation path), authorized by the SAME HttpOnly Stripe Checkout
 * Session cookie already gating GET /api/checkout/status (Pattern 4) - not the emailed report-
 * access token, which this guest's browser has no way to have yet at this point in the flow, and
 * not a new/weaker credential: the checkout-session cookie is exactly as unguessable and already
 * proves this is the purchasing browser, immediately post-purchase. Reuses getGuestStatus as the
 * sole authority on "is this ready" rather than re-deriving that decision here.
 */
export async function getGuestReport(db: Db, stripeCheckoutSessionId: string): Promise<GuestReportView | undefined> {
  const status = await getGuestStatus(db, stripeCheckoutSessionId);
  if (status !== GuestOrderStatus.REPORT_READY) return undefined;

  const order = await getOrderByCheckoutSessionId(db, stripeCheckoutSessionId);
  if (!order) return undefined; // Defensive only - getGuestStatus already confirmed an order exists.

  const [job] = await db
    .select({ evidenceReportArtifactId: reportGenerationJobs.evidenceReportArtifactId })
    .from(reportGenerationJobs)
    .where(eq(reportGenerationJobs.screeningRequestId, order.screeningRequestId));
  if (!job?.evidenceReportArtifactId) return undefined;

  const artifact = await getReportById(db, job.evidenceReportArtifactId);
  if (!artifact) return undefined;

  const emailDeliveryStatus = await getActiveCredentialDeliveryStatus(db, artifact.id);
  return { artifact, emailDeliveryStatus };
}

/**
 * Called from the report-generation workflow's terminal step, once `runReportGenerationPipeline`
 * has returned and `job` has been re-read to see its resulting state. INTERNAL_PROTOTYPE-
 * authorized jobs have no guest-facing delivery/refund wiring in Unit 2B and are ignored here
 * (BR-U2B-9's authorized-CLI-only scope) - only VERIFIED_PAYMENT jobs reach either branch below.
 */
export async function handleGenerationOutcome(db: Db, getResendClient: () => ResendClient, job: ReportGenerationJobRow): Promise<void> {
  const authorization = job.generationAuthorization as GenerationAuthorization;
  if (authorization.type !== GenerationAuthorizationType.VERIFIED_PAYMENT) return;

  if (job.state === ReportGenerationJobState.COMPLETE && job.evidenceReportArtifactId) {
    const order = await getOrderById(db, authorization.orderId);
    // Constructed lazily, only on this branch - the FAILED/refund branch below needs no Resend
    // credential at all, and must not fail because one happens to be missing.
    await deliverGuestReportAccess(db, getResendClient(), order?.customerEmail, job.evidenceReportArtifactId);
  } else if (job.state === ReportGenerationJobState.FAILED) {
    // BR-U2B-6/BR-U2B-8: automatic refund on terminal generation failure, independent of the
    // (never-issued, since generation failed) report-access state. Started as a durable Vercel
    // Workflow run rather than calling order-payment.processRefund directly, so it gets the same
    // retry/hook-token defense-in-depth as every other refund path.
    await start(processRefundWorkflow, [authorization.orderId, RefundReason.GENERATION_FAILURE]);
  }
  // QUEUED/IN_PROGRESS is not a terminal outcome - the caller should not invoke this yet;
  // defensively a no-op rather than an error.
}
