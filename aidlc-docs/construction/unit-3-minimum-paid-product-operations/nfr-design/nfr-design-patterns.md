# Unit 3: NFR Design Patterns

Expresses NFR-U3-1 through NFR-U3-7 as concrete logical patterns, per the founder's own precise
NFR Requirements approval direction — no new infrastructure introduced, matching every prior
unit's "small, named, reusable pattern" discipline (Bounded-Retry Executor, Boundary Validator,
`ReportAccessCredential`, Unit 2B's Pattern 1-9).

## Pattern 1: Pre-Route Admin Authentication Gate (`proxy.ts`)

**Corrected convention (2026-08-25 framework-version correction)**: this project has been upgraded
from Next.js 15.5.23 to Next.js **16.3.3** (Active LTS — see the framework-version-correction audit
entry; Next.js 15 is Maintenance LTS, support ending 2026-10-21). Next.js 16 renames the pre-route
interception file/export from `middleware.ts`/`export function middleware(request)` to
`proxy.ts`/`export function proxy(request)` — the earlier `middleware.ts` name is deprecated (still
functions in 16.x but is not the supported-going-forward convention) per the official Next.js 15→16
upgrade guide. This is the **first** pre-route interception file this project has ever needed, so
there is no legacy `middleware.ts` to rename — it is written directly as `proxy.ts`.

**Runtime (re-evaluated, not carried forward blindly)**: Next.js 16 does not merely default `proxy`
to the Node.js runtime — the `edge` runtime is **not supported** in `proxy` at all, and the runtime
cannot be configured (per the official upgrade guide: "The `proxy` runtime is `nodejs`, and it
cannot be configured"). This makes the question moot rather than merely resolved in our favor:
`node:crypto`'s `timingSafeEqual`/`createHash` (Pattern 2) are guaranteed available with no
fallback-mechanism ever needed, and no Next.js 15-specific `export const runtime = "nodejs"`
declaration is required or meaningful in `proxy.ts` (that declaration was never present in this
project either, since `proxy.ts`/`middleware.ts` did not exist before this Unit).

**Matcher scope** (founder-directed, exact — unchanged by the framework upgrade):
```
matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"]
```
Must **not** match: any customer-facing route (`/`, `/configure`, `/checkout/*`, `/report`),
`/api/webhooks/stripe`, `/api/cron/reconcile` (its own, separate `CRON_SECRET` gate — never Basic
Auth), `/api/checkout*`, `/api/reports*`, or any static asset (`_next/*`, favicon, etc.). A matcher
this broad-by-accident would either break the public app (if admin auth wrongly gated it) or,
worse, leave an admin route wrongly *unmatched* — the matcher itself is a security-relevant piece
of configuration, reviewed as carefully as the auth check it enables. (The `config.matcher` export
shape itself is unchanged by the `middleware`→`proxy` rename — only the file name and the function
name change; Next.js 16's codemod renames a project's own `skipMiddlewareUrlNormalize`-style config
flags too, but this project uses none of those.)

**Behavior**:
1. For any matched request, read the `Authorization` header.
2. Missing or malformed (`Basic` prefix wrong, unparseable base64) → respond `401` with
   `WWW-Authenticate: Basic realm="admin"`. A malformed header is treated identically to a
   missing/wrong one — never logged, never given a distinguishing error (see Pattern 2).
3. `ADMIN_BASIC_AUTH_USERNAME`/`ADMIN_BASIC_AUTH_PASSWORD` not both configured → `401` for every
   request, unconditionally (fail closed — a deployment/configuration defect must never silently
   become "no auth required").
4. Otherwise, verify via Pattern 2's constant-time comparison; on success, the request proceeds to
   its actual page/route handler (which then applies Pattern 3's CSRF check for mutating methods,
   and Pattern 5's `ADMIN_OPERATOR_ID` check for the specific mutations that need it).
5. **Never**: the credential is never forwarded to client JavaScript, never appears in any redirect
   URL, never logged (the raw header value and decoded credential both join this codebase's
   existing never-logged list).

## Pattern 2: Constant-Time Credential Comparison

**Corrected technique (founder-directed)**: comparing the supplied and configured
username/password directly with `crypto.timingSafeEqual` is unsafe on its own, because
`timingSafeEqual` **throws** if its two buffers differ in length — an implementation that checks
length first and only calls `timingSafeEqual` when lengths already match reintroduces a timing
signal (a length mismatch returns near-instantly; a length match takes measurably longer, leaking
whether the guess was even the right length).

**Fix**: hash both sides to a **fixed-length digest** (e.g. SHA-256 via `crypto.createHash`)
*before* comparing — `timingSafeEqual(hash(supplied), hash(configured))`. Every comparison now
operates on two 32-byte buffers regardless of the input's actual length, so there is no
length-based branch and no early return to exploit. Apply this to both the username and the
password component of the decoded credential (compare each independently, both as fixed-length
digests — never concatenate them into one comparison, which would leak a boundary signal).

**Uniform failure response** (founder-directed): whether the username was wrong, the password was
wrong, both were wrong, or the header was simply malformed, the response is identical — status,
body, and headers all the same `401` shape. No code path may return a different message, status,
or timing profile that would let an attacker learn *which* part of a guess was correct.

**Malformed headers are never logged** — a malformed `Authorization` header could itself contain
attacker-supplied data not meant for a log line (or, in the ordinary case, a real credential
guess); this codebase's logger never receives it.

## Pattern 3: Same-Origin CSRF Validation

Applies **only** to mutating (`POST`/`PUT`/`PATCH`/`DELETE`) `/api/admin/*` requests — `GET`
requests (all of Workflow 2's inspection reads) pass through Pattern 1's auth gate but skip this
check entirely.

**One trusted helper, `resolveExpectedAdminOrigin()`**, extends (never duplicates) Unit 2B's
existing `src/shared/app-url.ts`'s `resolveAppBaseUrl()`:
- **Production/Preview**: identical to `resolveAppBaseUrl()`'s existing logic — `APP_BASE_URL` if
  explicitly configured (the stable custom domain, Production's normal case), else Vercel's
  auto-injected `VERCEL_URL` (which is already deployment-specific, so a Preview deployment
  naturally gets *its own* correct trusted origin without any extra configuration — satisfying
  "Preview must use the actual trusted Preview deployment origin" for free, from a mechanism that
  already exists).
- **Development**: `resolveAppBaseUrl()` alone throws when neither env var is set (correct for
  Unit 2B's original use — building an absolute URL for a real request). Pattern 3's helper adds
  one narrow, explicit carve-out on top: if neither is configured, fall back to a fixed
  `http://localhost:3000` (or the actually-configured local dev port) — **only** reachable in
  Development, never silently available in a real deployment (Production/Preview always have
  `VERCEL_URL` set by the platform itself, so this branch is structurally unreachable there).

**Validation, per request**:
1. Read `Origin`. If present, it must **exactly** equal `resolveExpectedAdminOrigin()`'s value —
   no substring, prefix, or suffix matching under any circumstance.
2. If `Origin` is absent, read `Referer`, parse **only its origin component** (scheme + host +
   port), and apply the same exact-match rule.
3. If neither header establishes an exact match, **reject the request (fail closed)** — a generic
   `403`, no distinguishing detail about which check failed.
4. **`Sec-Fetch-Site`** is checked as **defense-in-depth**, never the sole mechanism (not every
   client sends Fetch Metadata headers): if present and explicitly `cross-site`, reject regardless
   of what Origin/Referer showed; `same-origin` or `none` (where legitimately applicable, e.g. a
   typed URL/bookmark) are accepted.
5. **No new state**: no CSRF token, no session cookie, no server-side store of "seen" tokens — this
   is a pure request-header check, consistent with Basic Auth's own stateless design and this
   codebase's existing plain `Request`/`Response`-based route handlers.

## Pattern 4: Atomic Local Admin Mutation + Audit

**Generalizes** (does not duplicate) Unit 2B's `withFulfillmentTransaction` — a new, similarly-
shaped helper (e.g. `withAdminTransaction`, or a shared generic `withTransaction` both Unit 2B's
fulfillment code and Unit 3's admin code call) opens a `neon-serverless` `Pool`-backed transaction
scoped entirely to one function call, runs the domain mutation and the `AdminActionLog` insert
inside it, and closes the Pool before returning — exactly Unit 2B's established two-driver
discipline (`neon-http` remains the default for every plain read; the Pool-scoped transaction is
reserved for the specific operations that genuinely need one).

**Applies to**: `RULE_DISABLED`, `RULE_REENABLED`, `DATA_SOURCE_MARKED_UNHEALTHY`,
`DATA_SOURCE_OVERRIDE_CLEARED`. For each: the domain write (`RegulatoryRule.lifecycleState` or
`DataSourceHealth`'s relevant field) and the `AdminActionLog` insert are two statements inside one
`withAdminTransaction` call — **if either statement fails, the whole transaction rolls back and
neither persists**, per BR-U3-9/NFR-U3-5's binding requirement.

**Does not apply to `REFUND_INITIATED`** — see Pattern 5.

## Pattern 5: Audit-Before-Workflow-Start Refund Sequencing

`REFUND_INITIATED` crosses this application's own database and the separately-durable Vercel
Workflow runtime — no distributed transaction, outbox, or generic event system is introduced to
force atomicity across that boundary (founder-directed, explicitly ruled out).

**Sequencing** (the correctness mechanism, in place of a shared transaction):
1. Validate `ADMIN_OPERATOR_ID` is configured/non-blank (Pattern 1's gate proved authentication;
   this is the separate, independent attribution check — fails closed on its own if absent/blank).
2. Insert and **commit** the `AdminActionLog` entry (`REFUND_INITIATED`) — a single, ordinary
   `neon-http` write, no transaction needed since it's one statement.
3. **Only after that commit succeeds**: call `start(processRefundWorkflow, [orderId, reason])`.

**Precise meaning of the `AdminActionLog` entry** (founder-directed, binding): it records that
**"the operator requested/initiated this refund command"** — it does **not** record, and must
never be read as recording, that "the Stripe refund succeeded." `Order.state`/`stripeRefundId`/
`refundConfirmedAt` remain the sole authoritative record of the actual outcome, confirmed only by
a verified Stripe webhook, unchanged from Unit 2B.

**If `start()` fails or its response is lost** after the audit entry already committed: the
operator-facing response is an error (the command did not complete), while the audit record
remains — truthfully describing an attempted command, not a lie about what happened. A retry may
produce a second, honestly-duplicate `AdminActionLog` entry; it still converges on Unit 2B's same
single logical refund attempt via `Order.state` and the persisted `refundIdempotencyKey`
(`decideRefundAction`, unchanged) — never a second logical refund, regardless of how many
`AdminActionLog` entries describe attempts at it. A response lost entirely (network failure after
Stripe/the Workflow layer actually received the start) is independently covered by Unit 2B's
existing Cron reconciliation check 3, with no Unit-3-specific recovery mechanism needed.

## Pattern 6: Observed / Override / Effective Data-Source Health

`DataSourceHealth` persists `observedHealthState` (written **only** by automated
`recordIngestionResult` calls) and `manualOverrideState` (written **only** by ADM-8's admin
actions, nullable) as two independent fields — never one field plus a boolean, per the Functional
Design correction this pattern carries forward unchanged.

- `effectiveHealthState = manualOverrideState ?? observedHealthState` — this is the **only** value
  `isKnownUnhealthy`/`checkReadiness`'s BR-U2-1 evaluation consumes; `observedHealthState` is never
  read directly by any evaluation-affecting code path.
- Automated ingestion **keeps updating `observedHealthState`** even while a manual override is in
  effect — the override governs the *effective* value, it does not pause or blind automated
  monitoring.
- Clearing an override (`manualOverrideState := null`) makes `effectiveHealthState` **immediately**
  reflect whatever `observedHealthState` already is — no wait for a future ingestion result, since
  the observed value was already being tracked the entire time.
- A `DataSourceHealth` row exists for every known source id before any touch (Pattern 4's
  `withAdminTransaction`-or-plain-upsert `INSERT ... ON CONFLICT` semantics, per
  `tech-stack-decisions.md`), so an operator can override a source that has never yet produced an
  ingestion result.
