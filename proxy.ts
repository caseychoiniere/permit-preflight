/**
 * Unit 3 admin pre-route gate (NFR Design Patterns 1-3) - this project's first pre-route
 * interception file. Next.js 16 convention (confirmed against this project's actual installed
 * version, 16.3.3): `proxy.ts`/`export function proxy`, not the deprecated Next.js 15
 * `middleware.ts`/`export function middleware`.
 *
 * A thin wrapper only - the actual Basic Auth / CSRF logic lives in src/admin-auth/ so it can be
 * exercised via direct function calls in deterministic tests, not just a real HTTP round-trip.
 *
 * No runtime declaration needed or possible: Next.js 16 fixes proxy's runtime to Node.js (the
 * `edge` runtime is not supported in proxy at all, and the runtime cannot be configured) - so
 * node:crypto's timingSafeEqual/createHash (src/admin-auth/credential-check.ts) are guaranteed
 * available.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkBasicAuth } from "./src/admin-auth/basic-auth.js";
import { checkSameOrigin } from "./src/admin-auth/csrf.js";

export const config = {
  // Must NOT match: any customer-facing route (/, /configure, /checkout/*, /report),
  // /api/webhooks/stripe, /api/cron/reconcile (its own, separate CRON_SECRET gate - never Basic
  // Auth), /api/checkout*, /api/reports*, or any static asset - this matcher is itself a
  // security-relevant piece of configuration, as carefully reviewed as the auth check it enables.
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest): Response {
  const auth = checkBasicAuth(request);
  if (auth.outcome !== "OK") {
    return new Response(null, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="admin"' } });
  }

  const isAdminApiRoute = request.nextUrl.pathname.startsWith("/api/admin");
  if (isAdminApiRoute && MUTATING_METHODS.has(request.method)) {
    const csrf = checkSameOrigin(request);
    if (csrf.outcome !== "OK") {
      return new Response(null, { status: 403 });
    }
  }

  return NextResponse.next();
}
