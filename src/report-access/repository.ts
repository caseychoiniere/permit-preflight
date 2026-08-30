/**
 * Report Access Credential persistence - the Drizzle-backed half of NFR Design Pattern 1.
 * Kept separate from credential.ts (pure crypto functions) so the pure functions stay
 * deterministically testable without a database.
 */

import { eq, and, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { reportAccessCredentials, evidenceReportArtifacts } from "../db/schema.js";
import { generateAccessCredential, hashToken, type AccessCredential } from "./credential.js";
import type { ResendClient } from "../email-delivery/resend-client.js";
import { logger } from "../shared/logger.js";
import { resolveAppBaseUrl } from "../shared/app-url.js";

/** Creates the first credential for a newly-generated report. Exactly one active credential
 * should exist per report at a time - callers create this once, at report-completion time. */
export async function createAccessCredential(db: Db, reportArtifactId: string): Promise<AccessCredential> {
  const credential = generateAccessCredential();
  await db.insert(reportAccessCredentials).values({
    reportArtifactId,
    tokenHash: credential.tokenHash,
    active: true,
  });
  return credential;
}

/** Resolves a raw token to its EvidenceReportArtifact id, or undefined if not found/revoked -
 * revoked and never-existed tokens are indistinguishable at this layer (BR-U2-7). */
export async function findArtifactIdByAccessToken(db: Db, rawToken: string): Promise<string | undefined> {
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({ reportArtifactId: reportAccessCredentials.reportArtifactId })
    .from(reportAccessCredentials)
    .where(and(eq(reportAccessCredentials.tokenHash, tokenHash), eq(reportAccessCredentials.active, true)));
  return row?.reportArtifactId;
}

/** Invalidates the currently-active credential(s) for a report. The old raw token stops
 * resolving immediately after this returns. */
export async function revokeAccessCredential(db: Db, reportArtifactId: string): Promise<void> {
  await db
    .update(reportAccessCredentials)
    .set({ active: false, revokedAt: new Date() })
    .where(and(eq(reportAccessCredentials.reportArtifactId, reportArtifactId), eq(reportAccessCredentials.active, true)));
}

/** Revokes the old credential and issues a new one, returning the new raw token exactly once. A
 * leaked never-expiring URL is recoverable via this - regaining access requires distributing the
 * new token. */
export async function rotateAccessCredential(db: Db, reportArtifactId: string): Promise<AccessCredential> {
  await revokeAccessCredential(db, reportArtifactId);
  return createAccessCredential(db, reportArtifactId);
}

/** Confirms a report artifact exists at all (used to give a clean error when creating a
 * credential for a nonexistent report, distinct from the token-resolution NOT_FOUND path). */
export async function artifactExists(db: Db, reportArtifactId: string): Promise<boolean> {
  const [row] = await db.select({ id: evidenceReportArtifacts.id }).from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, reportArtifactId));
  return row !== undefined;
}

/** Unit 2B addition (BR-U2B-10) - matches report_access_credential_delivery_status's pgEnum. */
export const DeliveryStatus = {
  EMAIL_PENDING: "EMAIL_PENDING",
  EMAIL_SENT: "EMAIL_SENT",
  EMAIL_FAILED: "EMAIL_FAILED",
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

/**
 * BR-U2B-10: delivers a completed report's access credential to the guest customer by email -
 * Unit 2B's first production call site for rotateAccessCredential. Never depends on the browser
 * reaching a success page; called exclusively from the report-generation workflow's terminal
 * COMPLETE step (checkout-fulfillment.handleGenerationOutcome). ALWAYS rotates rather than
 * conditionally creating: createEvidenceReportArtifact already issues one credential
 * unconditionally at generation-completion time (evidence-report-artifact/index.ts) that nobody
 * has ever seen - rotating revokes that one and issues the one actually emailed, preserving
 * "exactly one active credential per report" (credential.ts). Safe to call again on redelivery
 * (Cron's stale-EMAIL_PENDING/EMAIL_FAILED sweep): each call issues a fresh raw token, since a
 * credential's raw token is returned only once, at creation/rotation time - there is nothing to
 * "resend" from an already-issued row.
 */
export async function deliverGuestReportAccess(
  db: Db,
  resendClient: ResendClient,
  customerEmail: string | undefined,
  reportArtifactId: string
): Promise<void> {
  if (!customerEmail) {
    logger.error("GUEST_DELIVERY_NO_EMAIL", { reportArtifactId });
    return;
  }

  const credential = await rotateAccessCredential(db, reportArtifactId);
  // Marked EMAIL_PENDING before the send attempt so a crash between here and the status update
  // below leaves a detectable trace for Cron's stale-EMAIL_PENDING reconciliation check to retry.
  await db.update(reportAccessCredentials).set({ deliveryStatus: DeliveryStatus.EMAIL_PENDING }).where(eq(reportAccessCredentials.tokenHash, credential.tokenHash));

  // Corrected 2026-08-25: a URL FRAGMENT (`#access_token=...`), never a path segment or query
  // string - browsers never send the fragment as part of the actual HTTP request, so it never
  // reaches Vercel's platform request logs (Runtime Logs/Log Drains capture Request Path and
  // Search Params, not fragments) or this application's own server-side logging at all. See
  // app/report/page.tsx for the client-side exchange that turns this into an HttpOnly cookie.
  const reportUrl = `${resolveAppBaseUrl()}/report#access_token=${encodeURIComponent(credential.rawToken)}`;
  const result = await resendClient.sendEmail({
    to: customerEmail,
    subject: "Your Permit Preflight report is ready",
    html: `<p>Your Permit Preflight shed buildability report is ready.</p><p><a href="${reportUrl}">View your report</a></p>`,
    text: `Your Permit Preflight shed buildability report is ready: ${reportUrl}`,
  });

  await db
    .update(reportAccessCredentials)
    .set({
      deliveryStatus: result.outcome === "SENT" ? DeliveryStatus.EMAIL_SENT : DeliveryStatus.EMAIL_FAILED,
      deliveryAttempts: sql`${reportAccessCredentials.deliveryAttempts} + 1`,
      lastDeliveryAttemptAt: sql`now()`,
    })
    .where(eq(reportAccessCredentials.tokenHash, credential.tokenHash));

  if (result.outcome === "FAILED") {
    logger.error("GUEST_DELIVERY_FAILED", { reportArtifactId, reason: result.reason });
  }
}

const STALE_EMAIL_PENDING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes - a starting value, tuned from real Resend latency data, not treated as final (matches DEFAULT_STALE_CLAIM_THRESHOLD_MS's provisional-value precedent).

/** Cron reconciliation helper (Infrastructure Design Execution Model, check 4): active credentials
 * whose delivery is EMAIL_PENDING past the staleness threshold (a crash mid-send, or a redelivery
 * never attempted) or EMAIL_FAILED (Resend rejected the send) - both need a redelivery attempt via
 * deliverGuestReportAccess. Returns the screeningRequestId (via evidenceReportArtifacts) so the
 * caller can resolve the Order's customerEmail to redeliver with. */
export async function listStaleGuestDeliveries(db: Db, staleThresholdMs: number = STALE_EMAIL_PENDING_THRESHOLD_MS): Promise<{ reportArtifactId: string; screeningRequestId: string }[]> {
  const cutoff = new Date(Date.now() - staleThresholdMs);
  const rows = await db
    .select({ reportArtifactId: reportAccessCredentials.reportArtifactId, screeningRequestId: evidenceReportArtifacts.screeningRequestId, lastDeliveryAttemptAt: reportAccessCredentials.lastDeliveryAttemptAt, deliveryStatus: reportAccessCredentials.deliveryStatus })
    .from(reportAccessCredentials)
    .innerJoin(evidenceReportArtifacts, eq(evidenceReportArtifacts.id, reportAccessCredentials.reportArtifactId))
    .where(and(eq(reportAccessCredentials.active, true), sql`${reportAccessCredentials.deliveryStatus} in ('EMAIL_PENDING', 'EMAIL_FAILED')`));
  return rows
    .filter((r) => r.deliveryStatus === DeliveryStatus.EMAIL_FAILED || !r.lastDeliveryAttemptAt || r.lastDeliveryAttemptAt <= cutoff)
    .map((r) => ({ reportArtifactId: r.reportArtifactId, screeningRequestId: r.screeningRequestId }));
}

/** The delivery status of the currently-active credential for a report, if one exists yet -
 * Checkout & Fulfillment's post-purchase report page (2026-08-28 correction) uses this to show
 * "we've also emailed you a link" (or surface a failed send) alongside a report it already has
 * independent, session-cookie-based access to - this never gates or grants access on its own, and
 * never returns the credential's token/hash, only its delivery bookkeeping. */
export async function getActiveCredentialDeliveryStatus(db: Db, reportArtifactId: string): Promise<DeliveryStatus | undefined> {
  const [row] = await db
    .select({ deliveryStatus: reportAccessCredentials.deliveryStatus })
    .from(reportAccessCredentials)
    .where(and(eq(reportAccessCredentials.reportArtifactId, reportArtifactId), eq(reportAccessCredentials.active, true)));
  // The column is nullable (no delivery attempted yet, e.g. createEvidenceReportArtifact's own
  // initial credential before deliverGuestReportAccess has run) - normalized to undefined here
  // rather than an unsafe cast, so this function's own return type stays accurate.
  return row?.deliveryStatus ?? undefined;
}

export interface AccessCredentialSummary {
  active: boolean;
  createdAt: string;
  revokedAt?: string;
  deliveryStatus?: DeliveryStatus;
}

/** ADM-1 (Unit 3) - operational metadata ONLY (active/revoked status, timestamps, delivery
 * status). Deliberately never selects tokenHash - ADM-1 through ADM-8 never require sending
 * credential material to the browser. */
export async function listAccessCredentialSummaries(db: Db, reportArtifactId: string): Promise<AccessCredentialSummary[]> {
  const rows = await db
    .select({
      active: reportAccessCredentials.active,
      createdAt: reportAccessCredentials.createdAt,
      revokedAt: reportAccessCredentials.revokedAt,
      deliveryStatus: reportAccessCredentials.deliveryStatus,
    })
    .from(reportAccessCredentials)
    .where(eq(reportAccessCredentials.reportArtifactId, reportArtifactId));
  return rows.map((r) => ({
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    ...(r.revokedAt ? { revokedAt: r.revokedAt.toISOString() } : {}),
    ...(r.deliveryStatus ? { deliveryStatus: r.deliveryStatus as DeliveryStatus } : {}),
  }));
}
