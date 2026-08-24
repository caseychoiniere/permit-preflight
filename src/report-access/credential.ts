/**
 * Report Access Credential - NFR Design Pattern 1 (nfr-design-patterns.md). The only mechanism
 * by which a client can retrieve a generated report. `reportId` alone is never sufficient
 * (BR-U2-7) - every client-facing retrieval path must go through resolveByAccessToken.
 *
 * Security invariants (all enforced here, not left to callers):
 * - the raw token is 256 bits of cryptographically random data, generated via Node's crypto
 * - only a SHA-256 hash of the token is ever persisted; the raw value exists only long enough to
 *   be returned once, at creation/rotation time
 * - revoked and unknown tokens resolve identically (NOT_FOUND) - no signal about which
 * - no function here logs a raw token
 */

import { randomBytes, createHash } from "node:crypto";

export interface AccessCredential {
  rawToken: string;
  tokenHash: string;
}

export type ResolveResult<T> = { outcome: "FOUND"; report: T } | { outcome: "NOT_FOUND" };

/** Generates a new 256-bit random bearer token and its SHA-256 hash. Never persists rawToken. */
export function generateAccessCredential(): AccessCredential {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashToken(rawToken) };
}

/** SHA-256 is sufficient here - the input already has 256 bits of entropy from a CSPRNG; this is
 * not a human password requiring a slow KDF (argon2/bcrypt/scrypt). */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export interface CredentialStore<T> {
  /** Looks up an active credential by its hash and returns the associated report, or undefined. */
  findActiveByHash(tokenHash: string): Promise<T | undefined>;
}

/** Hashes the presented raw token and resolves by hash only - there is no code path here that
 * looks up by raw token value. */
export async function resolveByAccessToken<T>(rawToken: string, store: CredentialStore<T>): Promise<ResolveResult<T>> {
  const tokenHash = hashToken(rawToken);
  const report = await store.findActiveByHash(tokenHash);
  if (!report) return { outcome: "NOT_FOUND" };
  return { outcome: "FOUND", report };
}
