/** Resolves this deployment's own public base URL - used to build the guest report-access email
 * link (report-access/repository.ts) and Stripe's success/cancel URLs (app/api/checkout). Prefers
 * an explicit APP_BASE_URL (set this for a custom domain); falls back to Vercel's auto-injected
 * VERCEL_URL (host only, no scheme) for preview/default deployments. */
export function resolveAppBaseUrl(): string {
  const explicit = process.env["APP_BASE_URL"];
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelUrl = process.env["VERCEL_URL"];
  if (vercelUrl) return `https://${vercelUrl}`;
  throw new Error("Neither APP_BASE_URL nor VERCEL_URL is set - cannot build an absolute application URL.");
}

/** Unit 3, NFR Design Pattern 3 - the trusted expected-origin source for same-origin CSRF checks.
 * Extends (never duplicates) resolveAppBaseUrl(): Production/Preview use identical logic
 * (APP_BASE_URL if set, else Vercel's auto-injected VERCEL_URL - already deployment-specific, so a
 * Preview deployment naturally gets its own correct trusted origin for free). Development adds one
 * narrow, explicit carve-out on top: resolveAppBaseUrl() alone throws when neither env var is set,
 * correct for its own original use (building a real request URL) but not for local admin-UI/
 * account-auth development - falls back to a fixed localhost origin, structurally unreachable in
 * Production/Preview since VERCEL_URL is always platform-set there.
 *
 * Renamed generically (Unit 6 Code Generation, NFR Design correction) - this logic was never
 * actually admin-specific (confirmed by inspection before extraction: no admin credential, no
 * admin-scoped env var, nothing here couples to Basic Auth). resolveExpectedAdminOrigin below is
 * kept as an exact alias for admin-auth/csrf.ts's own existing call site - zero behavior change,
 * not a rename of that file's own call. Unit 6's account-auth/csrf.ts calls this function directly
 * under its real name. */
export function resolveExpectedAppOrigin(): string {
  if (process.env["NODE_ENV"] === "development") {
    const explicit = process.env["APP_BASE_URL"];
    if (explicit) return explicit.replace(/\/+$/, "");
    const vercelUrl = process.env["VERCEL_URL"];
    if (vercelUrl) return `https://${vercelUrl}`;
    return "http://localhost:3000";
  }
  return resolveAppBaseUrl();
}

/** Alias preserved for admin-auth/csrf.ts's existing call site - identical behavior, see
 * resolveExpectedAppOrigin's own docstring above for the full rationale. */
export const resolveExpectedAdminOrigin = resolveExpectedAppOrigin;
