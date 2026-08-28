/**
 * Same-origin CSRF validation (NFR Design Pattern 3) - applies only to mutating
 * (POST/PUT/PATCH/DELETE) /api/admin/* requests. GET requests pass through Basic Auth but skip
 * this check entirely.
 *
 * Corrected (Unit 6 Code Generation, NFR Design correction): the origin-matching logic itself now
 * lives in shared/same-origin.ts, since it has no actual admin-specific dependency beyond which
 * origin-resolver function is called. This function is now a thin, behavior-preserving caller -
 * same inputs produce the same OK/FORBIDDEN outcome as before (tests/admin-auth/csrf.test.ts is
 * unmodified and must remain green as the proof). Unit 6's own account-side CSRF check
 * (account-auth/csrf.ts) is a separate, equally thin caller of the same shared core - reuse of the
 * PATTERN, never of this file's admin-specific resolveExpectedAdminOrigin() call or any admin
 * credential.
 */

import { resolveExpectedAdminOrigin } from "../shared/app-url.js";
import { checkSameOrigin as checkSameOriginCore, type SameOriginResult } from "../shared/same-origin.js";

export type CsrfResult = SameOriginResult;

export function checkSameOrigin(request: Request): CsrfResult {
  let expectedOrigin: string;
  try {
    expectedOrigin = resolveExpectedAdminOrigin();
  } catch {
    return { outcome: "FORBIDDEN" };
  }
  return checkSameOriginCore(request, expectedOrigin);
}
