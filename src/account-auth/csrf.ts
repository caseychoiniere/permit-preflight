/**
 * Account-side same-origin CSRF check (NFR Design Pattern 3, corrected). A thin caller of the
 * shared, credential-free core - reuse of the PATTERN, never of admin credentials or admin code.
 * Applied to AccountSession-authenticated mutating routes only: claim Path A start, claim Path B,
 * completeClaimByEmail (corrected - it now depends on session state), logout, deleteAccount. NOT
 * applied to requestLoginLink (no session to mutate) or verifyLoginLink (bearer-credential-
 * authorized, not session-mutating).
 */

import { resolveExpectedAppOrigin } from "../shared/app-url.js";
import { checkSameOrigin as checkSameOriginCore, type SameOriginResult } from "../shared/same-origin.js";

export type AccountCsrfResult = SameOriginResult;

export function checkAccountSameOrigin(request: Request): AccountCsrfResult {
  let expectedOrigin: string;
  try {
    expectedOrigin = resolveExpectedAppOrigin();
  } catch {
    return { outcome: "FORBIDDEN" };
  }
  return checkSameOriginCore(request, expectedOrigin);
}
