/**
 * Minimal HttpOnly cookie read/write helpers for the two low-scope bearer capabilities that must
 * never appear in a platform-visible request path/query string (Operations correction,
 * 2026-08-25): the guest checkout-status Stripe Checkout Session ID and the report-access raw
 * token. Deliberately not a general session/auth framework - each caller still re-validates the
 * cookie's value against the existing server-side mechanism (Order lookup, hash-only credential
 * lookup) on every request; the cookie is a transport, not a new trust boundary.
 */

export const CHECKOUT_SESSION_COOKIE = "pp_checkout_session";
export const REPORT_ACCESS_COOKIE = "pp_report_access";
/** Unit 6 addition - same HttpOnly/Secure/SameSite=Lax transport, same re-validate-on-every-
 * request discipline as the two above (account-auth/session.ts resolves this against
 * account_sessions on every authenticated request; the cookie proves nothing by itself). */
export const ACCOUNT_SESSION_COOKIE = "pp_account_session";

export interface SetCookieOptions {
  path: string;
  maxAgeSeconds: number;
  sameSite?: "Strict" | "Lax";
}

/** Reads a single cookie value from a Route Handler's raw `Request`. */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** Builds a `Set-Cookie` header value. `secure` is derived from the actual incoming request's
 * scheme (never assumed from NODE_ENV, which is "production" for local `next build`/`next start`
 * too) - a plain http:// origin (local dev) never gets Secure, since browsers silently drop such
 * cookies otherwise. */
export function buildSetCookieHeader(request: Request, name: string, value: string, options: SetCookieOptions): string {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.sameSite ?? "Lax"}`,
    "HttpOnly",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookieHeader(request: Request, name: string, path: string): string {
  return buildSetCookieHeader(request, name, "", { path, maxAgeSeconds: 0 });
}
