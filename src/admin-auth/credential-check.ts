/**
 * Constant-time credential comparison (NFR Design Pattern 2). Comparing the supplied and
 * configured strings directly with crypto.timingSafeEqual is unsafe on its own - timingSafeEqual
 * THROWS if its two buffers differ in length, and checking length first (calling timingSafeEqual
 * only when lengths already match) reintroduces a timing signal: a length mismatch returns
 * near-instantly, a length match takes measurably longer, leaking whether a guess was even the
 * right length.
 *
 * Fix: hash both sides to a fixed-length digest (SHA-256) BEFORE comparing - every comparison now
 * operates on two 32-byte buffers regardless of the input's actual length, so there is no
 * length-based branch and no early return to exploit.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export function constantTimeEqual(supplied: string, configured: string): boolean {
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const configuredDigest = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(suppliedDigest, configuredDigest);
}
