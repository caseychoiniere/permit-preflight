/**
 * Same-origin CSRF core - extracted from admin-auth/csrf.ts (NFR Design Pattern 3, Unit 6
 * correction) so both admin and customer-account mutating routes can reuse the exact same
 * same-origin decision logic without either coupling to the other's credential/identity check.
 *
 * This function takes no admin- or account-specific input and makes no identity decision - it
 * establishes same-origin only. Each caller supplies its own trusted expectedOrigin and applies
 * this to its own scope of mutating routes.
 */

export type SameOriginResult = { outcome: "OK" } | { outcome: "FORBIDDEN" };

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function checkSameOrigin(request: Request, expectedOrigin: string): SameOriginResult {
  // Sec-Fetch-Site as defense-in-depth (never the sole mechanism - not every client sends Fetch
  // Metadata headers): an explicit cross-site value is rejected regardless of what Origin/Referer
  // show.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return { outcome: "FORBIDDEN" };
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    return origin === expectedOrigin ? { outcome: "OK" } : { outcome: "FORBIDDEN" };
  }

  // Referer fallback only when Origin is legitimately absent - strictly parsed to its origin
  // component (scheme + host + port) only, same exact-match rule, no substring/prefix matching.
  const referer = request.headers.get("referer");
  if (referer !== null) {
    const refererOrigin = originOf(referer);
    return refererOrigin === expectedOrigin ? { outcome: "OK" } : { outcome: "FORBIDDEN" };
  }

  // Neither header establishes same-origin - fail closed.
  return { outcome: "FORBIDDEN" };
}
