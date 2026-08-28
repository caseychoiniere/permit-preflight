# Unit 3 — Tech Stack Decisions

Product-level stack already fixed: Next.js, TypeScript, Neon PostgreSQL + PostGIS, Drizzle ORM,
Vercel hosting, Vercel Workflows. This document covers only the genuinely open, Unit-3-scoped
tooling choices. **Headline decision: Unit 3 needs zero new npm dependencies** — every mechanism
below is either a plain Next.js/Web-standard capability or a direct reuse of an existing Unit 2B
pattern.

## Admin Authentication — HTTP Basic Auth, No New Dependency

**Decision**: implement the Basic Auth check directly against the incoming `Authorization` header
(`Basic <base64(username:password)>`) in a shared server-side check applied to every `/admin/*`
page and `/api/admin/*` route — no third-party auth library.

**Rationale**: Basic Auth's wire format is simple enough (decode base64, split on the first `:`,
constant-time-compare both parts) that a small dependency-free helper is both simpler and more
auditable than pulling in a general auth package for a single shared credential with no accounts,
sessions, or tokens (BR-U3-0's explicit exclusions). **Placement**: Next.js's pre-route
interception convention (runs before any matched request reaches a page/route handler, satisfying
"fail closed before any handler logic runs") is the natural fit — it can match both
`/admin/:path*` and `/api/admin/:path*` in one config. **Superseded 2026-08-25**: this project
upgraded from Next.js 15 to Next.js 16 mid-Unit-3 (see the framework-version-correction audit
entry); the file/export name is therefore `proxy.ts`/`export function proxy`, not
`middleware.ts`/`export function middleware` as originally written here — see NFR Design's Pattern
1 for the corrected, binding specification. No prior code existed for either convention; this is
still the first genuine need for a pre-route gate in this project.
**Constant-time comparison**: Node's built-in `crypto.timingSafeEqual` (already available, no new
dependency) — both compared buffers must be equal length first (comparing on a hash of each side,
or padding, avoids leaking length information itself).

## CSRF Protection — Same-Origin Header Validation, No New Dependency

**Decision** (Question 1 = A): a small, stateless same-origin check applied only to mutating
(`POST`/`PUT`/`PATCH`/`DELETE`) `/api/admin/*` requests, implemented alongside the Basic Auth check
(same `proxy.ts` — see 2026-08-25 supersession note above — or a shared helper called from each
mutating route — an Infrastructure Design/Code Generation placement detail). Reads `Origin` (falling back to a strictly-parsed
`Referer` only when `Origin` is absent) and compares it, exact-match only, against an expected
origin sourced from server-side deployment configuration (e.g. `VERCEL_URL`/`APP_BASE_URL`, the
same pattern `src/shared/app-url.ts` already established for a different purpose in Unit 2B — reused
here for its value, not its function, since this needs a comparison target rather than a URL to
build). `Sec-Fetch-Site` is checked as defense-in-depth alongside it, never as the sole mechanism.

**Rationale**: no CSRF-token library, no session-cookie mechanism, no new dependency — this is a
header comparison, and Web-standard `Request`/`Headers` APIs (already used throughout this
codebase's plain `Request`/`Response`-based route handlers, e.g. Unit 2B's webhook/checkout routes)
are sufficient. Origin/Referer validation is a well-established, platform-recommended CSRF defense
for exactly this shape of problem (a stateless, credential-bearing request with no CSRF-token
infrastructure elsewhere in the app) — introducing a token-based scheme here would mean building
session/cookie plumbing this design otherwise has none of, solely to protect a single shared
Basic-Auth-gated internal tool.

## Atomic Local Mutations — Reuses Unit 2B's Existing Two-Driver Neon Strategy, Generalized

**Decision**: the four purely-local admin mutations (`RULE_DISABLED`/`RULE_REENABLED`/
`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED`, each needing one domain write plus
one `AdminActionLog` write to commit atomically — BR-U3-9) use the same `neon-serverless`
`Pool`-scoped-to-one-call transaction pattern Unit 2B's `withFulfillmentTransaction`
(`src/db/client.ts`) already established for BR-U2B-15 — generalized into a shared, reusable
helper (e.g. `withAdminTransaction` or a small generic `withTransaction` both fulfillment and admin
code call) rather than either duplicating the Pool-open/use/close logic or awkwardly reusing a
function whose name and doc comment are specifically scoped to BR-U2B-15. `getDb()`'s existing
`neon-http` client remains the default for every plain read (all of Workflow 2's inspection
queries) and for `REFUND_INITIATED`'s single, non-transactional `AdminActionLog` write (which
precedes `start()`, not paired with any other local write needing atomicity with it).

**Rationale**: this is the exact same underlying constraint Unit 2B already solved (a genuine
multi-statement, conditionally-branching, atomic Postgres transaction, needed because Neon's
`neon-http` driver cannot provide one) — reusing and generalizing that proven pattern is strictly
simpler and lower-risk than introducing a second transaction mechanism or a distributed-
transaction/outbox library, which the founder's own review explicitly ruled out.

## Frontend — Plain Next.js App Router Pages/Forms, No New UI Library

**Decision**: the admin UI (`frontend-components.md`'s 4 sections) is built with plain Next.js App
Router pages and ordinary HTML form elements, matching the existing customer-facing pages'
established style (`app/configure/page.tsx`, `app/checkout/status/page.tsx`) — no admin-specific
component library, no CSS framework beyond whatever plain styling approach those existing pages
already use.

**Rationale**: NFR-U3-7's desktop-focused, no-dedicated-mobile-design scope, at a solo-operator's
low page count (roughly 4 list views + a handful of detail/action forms), does not justify a new
UI dependency. Ordinary resilient layout (no fixed widths, horizontally-scrolling tables, reachable
controls) is achievable with plain CSS, consistent with this codebase's existing minimal-dependency
frontend discipline.

## Known-Source-Initialization Mechanism — Idempotent Upsert, No New Service

**Decision**: every `DataSourceHealth` write path (`recordIngestionResult`, set-override,
clear-override) uses `INSERT ... ON CONFLICT (sourceId) DO UPDATE` upsert semantics (Drizzle's
`.onConflictDoUpdate()`), and the ADM-3 list read performs a get-or-default over the existing,
already-established known-source-id list (the same ids `REQUIRED_SOURCE_IDS_FOR_SHED` and Property
Intelligence's retrievers already reference) rather than depending on a separate seed
migration/script.

**Rationale**: satisfies `domain-entities.md`'s requirement (a row must exist for a never-yet-
queried known source, so an operator can override it proactively) using a pattern already native to
Drizzle/Postgres, with no new source-catalog service and no new migration-time seeding step to keep
in sync as source ids evolve.
