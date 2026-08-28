# Unit 6: Infrastructure Design (Optional Accounts)

**Targeted, delta-only.** Every logical component NFR Design named (`nfr-design/logical-components
.md`) except one deploys as ordinary application code onto infrastructure this project already has
— no new decision. The one genuine new infrastructure decision is the Vercel Firewall
rate-limiting rule (NFR Design Pattern 5, Layer 1).

## Component-to-Infrastructure Mapping

| Component | Infrastructure Choice | Rationale |
|---|---|---|
| `src/account-auth/` (Account/MagicLinkToken/AccountSession/AccountOrderLink logic, all 5 workflows) | **Vercel Functions** (API routes), same Next.js application, same Vercel project | Ordinary application code — no different from any existing Unit 2B/3 route family. No new compute service. |
| `accounts`, `magic_link_tokens`, `account_sessions`, `account_order_links` tables + the `account_order_links(account_id)` index | **Neon PostgreSQL**, same database, same dedicated branch, via the existing Drizzle migration tooling | Unchanged provider/connection model — 4 new tables in the same database every other table already lives in. |
| Claim-completion transaction (NFR Design Pattern 1/4) | Same `neon-serverless`-`Pool`-scoped-per-request interactive-transaction mechanism Unit 2B introduced | No new database driver or transaction abstraction — an additional *use* of an already-provisioned capability. |
| `src/shared/same-origin.ts` (CSRF core extraction) | Vercel Functions (same application) | Pure application code — no infrastructure implication. |
| `accountAuthLocalLimiter` (in-process, `src/shared/rate-limiter-instance.ts`) | Vercel Functions' own process memory (Layer 2, defense-in-depth only) | Unchanged mechanism from Unit 2's `reportLookupLimiter` — no new service; explicitly *not* the authoritative control (that's the Firewall rule, below). |
| Two new email templates (login-link, claim-link) | **Resend**, same provider, same `email-delivery/resend-client.ts` adapter | Unchanged provider — two new templates through the existing send path. |
| `ACCOUNT_SESSION_COOKIE` | Set via the existing Next.js Route Handler `Set-Cookie` mechanism, same as `CHECKOUT_SESSION_COOKIE`/`REPORT_ACCESS_COOKIE` | No new cookie infrastructure. |
| **Auth/email-triggering endpoint rate limiting (Layer 1 — outer, authoritative)** — `requestLoginLink`, `claimPurchase` Path A's start call, and the verification endpoints | **Vercel Firewall custom rate-limiting rule** — see "Firewall Rule Configuration" below | **The one new infrastructure decision this document makes.** Existing Vercel Pro platform capability (confirmed available on this project's current plan), configured — not a new vendor, service, or product. |

## Firewall Rule Configuration

Configured via the Vercel dashboard (Project → Firewall → Rate Limiting) or the equivalent
`vercel.json`/project-configuration surface — a deployment-configuration artifact, not application
source in this repository.

- **Scope**: the public, email-triggering account-auth paths —
  `/api/account/request-login-link`, `/api/account/claim/*` (the Path A start call), and, where
  useful, `/api/account/verify-login`/`/api/account/verify-claim` (the verification endpoints) —
  matched by path prefix, not applied project-wide (every other route, including the existing
  Unit 2B/3 payment/admin/report endpoints, is unaffected).
- **Threshold**: initial value reuses the same shape as `DEFAULT_RATE_LIMITER_OPTIONS`
  (`10` requests per `60` seconds, source-keyed) — intentionally reused rather than derived fresh
  (NFR-U6-40), explicitly subject to retuning once real deployment evidence exists
  (`external-verification-tracker.md` item 17, tracked open, not fabricated as verified).
- **Action on limit**: **corrected per founder review** — the Firewall's own normal `429` response
  is acceptable and does not need to be byte-for-byte identical to the application's own generic
  successful-auth responses (NFR-U6-8). The actual binding invariant is narrower: rate limiting
  must not disclose Account/Order existence — a distinct `429` triggered purely by request-volume/
  IP state discloses nothing about any specific Account or Order, so it does not violate that
  invariant. A custom Firewall response, if ever configured, is deployment configuration, not
  application-domain behavior.
- **Source key**: Vercel's own platform-derived client identifier (the same underlying signal
  `external-verification-tracker.md` item 6 already tracks as unverified for the application-local
  layer) — the Firewall rule uses Vercel's own edge-level client-IP determination, which is
  independent of, and does not depend on, this application's own `x-forwarded-for`-based
  `sourceKeyFor` helper (that helper remains relevant only to Layer 2, the in-process
  `accountAuthLocalLimiter`).

**Not configured in this document**: the exact numeric threshold is stated as a starting point,
not a final tuning (per explicit instruction not to invent precise limits without deployment
evidence); the precise dashboard/`vercel.json` mechanics of rule creation are a Code Generation
execution detail, not a design decision requiring further specification here.

## Everything Else — Confirmed Reused, Unchanged

Every infrastructure choice Unit 2B's Infrastructure Design already made remains exactly as it was
— restated here explicitly, not silently assumed:

- **Vercel** — same project, same Production/Preview/Development environments, same GitHub-integrated
  deployment, same CI gate (typecheck, deterministic+component tests, build, Playwright smoke).
- **Neon PostgreSQL + PostGIS** — same database, same connection strategy (`neon-http` default,
  `neon-serverless` `Pool` scoped per-request for interactive transactions).
- **Resend** — same provider, same adapter, no new environment variable beyond what's already
  configured (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`).
- **Secrets** — Unit 6 introduces **zero new secrets**; every new mechanism (token generation,
  session cookies, CSRF origin resolution) reuses existing environment configuration
  (`APP_BASE_URL`/`VERCEL_URL`, already-present).
- **Logs** — Unit 6 emits through the existing structured JSON logger, no new logging product;
  Firewall rule triggers are visible through Vercel's own existing Firewall/Firewall-analytics
  surface, not a new observability integration this application builds.
- **CI** — no new blocking check category is introduced; Unit 6's new tests run through the
  existing `npm test`/`npm run typecheck`/`npm run build` gates unchanged.
