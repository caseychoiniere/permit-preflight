/**
 * Report Access Credential persistence - the Drizzle-backed half of NFR Design Pattern 1.
 * Kept separate from credential.ts (pure crypto functions) so the pure functions stay
 * deterministically testable without a database.
 */

import { eq, and } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { reportAccessCredentials, evidenceReportArtifacts } from "../db/schema.js";
import { generateAccessCredential, hashToken, type AccessCredential } from "./credential.js";

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
