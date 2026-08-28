/**
 * Report-access resolution for both the claim Path B join and Account Access (BR-U6-4 Mode B).
 * Both resolve through the SAME real relationship this project's existing
 * listStaleGuestDeliveries (report-access/repository.ts) already exercises in the other
 * direction: reportAccessCredentials.reportArtifactId -> evidenceReportArtifacts.id ->
 * evidenceReportArtifacts.screeningRequestId -> orders.screeningRequestId -> orders.id.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { evidenceReportArtifacts, orders, reportAccessCredentials } from "../db/schema.js";
import { hashToken } from "../report-access/credential.js";

export type ResolveOrderByReportTokenResult = { outcome: "FOUND"; orderId: string } | { outcome: "INVALID_TOKEN" } | { outcome: "ORDER_NOT_FOUND" };

/**
 * Claim Path B (BR-U6-3, workflow 3) - resolves a raw report-access bearer token to its canonical
 * eligible Order. Corrected per Code Generation Part 1 review: the join REQUIRES
 * orders.state = 'PAID', matching the approved Functional Design join exactly. A valid, resolvable
 * credential whose screeningRequestId has no PAID order (e.g. an INTERNAL_PROTOTYPE-authorized
 * report, or an Order still PENDING) resolves to ORDER_NOT_FOUND - it is never treated as
 * eligible merely because SOME order or artifact exists. Never modifies/rotates the guest
 * credential.
 */
export async function resolveOrderByReportToken(db: Db, rawToken: string): Promise<ResolveOrderByReportTokenResult> {
  const tokenHash = hashToken(rawToken);
  const [credential] = await db
    .select({ reportArtifactId: reportAccessCredentials.reportArtifactId })
    .from(reportAccessCredentials)
    .where(and(eq(reportAccessCredentials.tokenHash, tokenHash), eq(reportAccessCredentials.active, true)));
  if (!credential) return { outcome: "INVALID_TOKEN" };

  const [artifact] = await db.select({ screeningRequestId: evidenceReportArtifacts.screeningRequestId }).from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, credential.reportArtifactId));
  if (!artifact) return { outcome: "ORDER_NOT_FOUND" };

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.screeningRequestId, artifact.screeningRequestId), eq(orders.state, "PAID")));
  if (!order) return { outcome: "ORDER_NOT_FOUND" };

  return { outcome: "FOUND", orderId: order.id };
}

/**
 * Account Access artifact resolution (workflow 4b, BR-U6-4 Mode B) - called ONLY after
 * accountOwnsOrder (link-repository.ts) has already confirmed authorization. Resolves
 * orders.screeningRequestId -> evidenceReportArtifacts.screeningRequestId directly - never
 * reconstructs, recovers, or mints a guest reportAccessCredentials row.
 */
export async function resolveArtifactIdForOrder(db: Db, orderId: string): Promise<string | undefined> {
  const [order] = await db.select({ screeningRequestId: orders.screeningRequestId }).from(orders).where(eq(orders.id, orderId));
  if (!order) return undefined;
  const [artifact] = await db.select({ id: evidenceReportArtifacts.id }).from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.screeningRequestId, order.screeningRequestId));
  return artifact?.id;
}
