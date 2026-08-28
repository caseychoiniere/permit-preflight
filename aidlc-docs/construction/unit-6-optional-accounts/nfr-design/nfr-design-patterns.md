# Unit 6 — NFR Design Patterns (Optional Accounts)

**Targeted, delta-only** — per explicit founder instruction, this document defines exactly the 5
design patterns Unit 6's NFR Requirements (including its founder-review correction round) require.
Every other NFR Design category is recorded as inherited, unchanged, in §6 — not silently omitted.

---

## 1. Shared Bearer-Credential Token Pattern, Two New Consumers

Satisfies NFR-U6-1 through NFR-U6-4, NFR-U6-10, NFR-U6-26. `MagicLinkToken` and `AccountSession`
are both new *consumers* of the existing `generateAccessCredential()`/`hashToken()`/
`resolveByAccessToken()` primitives (`src/report-access/credential.ts`) — no new generation or
hashing routine is introduced.

**The canonical atomic single-use consumption statement** (satisfies NFR-U6-26, and grounds
NFR-U6-27's transaction requirement) — for `LOGIN`:

```sql
UPDATE magic_link_tokens
SET consumed_at = now()
WHERE token_hash = $1
  AND purpose = 'LOGIN'
  AND consumed_at IS NULL
  AND expires_at > now()
RETURNING id, email;
```

**Corrected per NFR Design review — `CLAIM_PURCHASE` consumption is additionally account-bound**,
not merely purpose-bound: possessing a valid `CLAIM_PURCHASE` token proves control of the purchase
email; it does **not** by itself prove control of the Account the claim was started from. Both
proofs are required before a link is created, so the statement itself enforces the second proof:

```sql
UPDATE magic_link_tokens
SET consumed_at = now()
WHERE token_hash = $1
  AND purpose = 'CLAIM_PURCHASE'
  AND account_id = $2  -- resolved from the current AccountSession; NEVER client-supplied
  AND consumed_at IS NULL
  AND expires_at > now()
RETURNING order_id, account_id;
```

A valid, unexpired, unconsumed token presented under no session, an expired/revoked session, or a
different account's session matches zero rows — indistinguishable, per NFR-U6-7's existing
principle extended here, from an unknown/expired/already-consumed token. The `$2` parameter is
always the session-resolved `accountId` (Pattern 3/NFR-U6-18's own "never client-supplied"
discipline, applied to this statement specifically); it is never read from the token's own row
before this check (that would defeat the purpose — the row's `account_id` is what this statement
*validates against*, not a value the caller asserts).

Both statements remain the **one** implementation of "single-use" for their respective purpose —
`purpose` is always bound as a query parameter, never interpolated, which is what makes NFR-U6-4's
purpose separation structural rather than incidental: there is exactly one consumption code path
per purpose, and neither can silently drop its own required conditions.

**Claim-completion transaction** (extends NFR-U6-27's transaction requirement to `CLAIM_PURCHASE`):
resolving the `AccountSession`, the account-bound consumption above, and Pattern 4's
`AccountOrderLink` creation execute inside **one database transaction**. If link creation fails for
an infrastructure reason, the token consumption rolls back — a valid, session-matched claim is
never permanently burned without its link having actually been established or deterministically
resolved (idempotent same-account success, or `ALREADY_LINKED_TO_ANOTHER_ACCOUNT` — both are valid
completions of the transaction, not failures to roll back on).

`AccountSession`'s own token is **not** consumed this way — a session token is validated
repeatedly (every request, NFR-U6-12), not single-use, so it reuses `resolveByAccessToken`'s
existing non-consuming lookup pattern (`revokedAt IS NULL AND expiresAt > now()`), identical in
shape to `reportAccessCredentials`' own existing session-like reuse pattern for report viewing.

**Component boundary**: both token kinds' generation/hashing/lookup calls
`report-access/credential.ts`'s existing exported functions directly — this file is not modified
by Unit 6, only imported from a new location (`logical-components.md`).

## 2. Fragment-to-POST Transport Pattern

Satisfies NFR-U6-5, NFR-U6-6. The concrete client/server mechanics for delivering a raw magic-link
token without ever placing it in a URL query string, pathname, or redirect parameter.

**Client** (`app/account/verify/page.tsx`, `app/account/claim/verify/page.tsx`):
1. On mount, read `window.location.hash` (stripping the leading `#` and the `token=` key).
2. Immediately call `window.history.replaceState(null, "", window.location.pathname)` — removes the
   fragment from the visible URL and the current history entry **before** any network call, so even
   a page inspected mid-load (screenshot, dev tools, a slow network) shows no token in the address
   bar for longer than unavoidable.
3. `POST` `{ token: rawToken }` (JSON body) to the corresponding verification endpoint.

**Server**: reads `token` from the parsed JSON body only — never from `request.url`'s query string,
never from a route path segment. Hashes it immediately (`hashToken`) before any further processing,
so the raw value never appears in a subsequent log statement, error object, or response body
(NFR-U6-2).

**Why not a `<form>` GET or a redirect-based exchange**: a GET request's parameters end up in
`request.url` (and are trivially loggable/cacheable at any intermediate layer) regardless of how
carefully application code avoids reading them from there — a `POST` with a JSON body is the only
transport this pattern relies on to keep the token out of URL-shaped surfaces entirely, matching
Unit 2B's own `REPORT_ACCESS_COOKIE` exchange precedent (a URL-fragment/one-time-exchange pattern
already used for the report-access token, `report-access/repository.ts`'s own docstring).

## 3. Shared Same-Origin CSRF Core, Two Callers

Satisfies NFR-U6-51/52. **Corrected/added per NFR Requirements review.**

`src/admin-auth/csrf.ts`'s existing `checkSameOrigin` function is, on inspection, already almost
entirely origin-agnostic — its only admin-specific dependency is calling
`resolveExpectedAdminOrigin()` (`src/shared/app-url.ts`) for its trusted-origin value, and that
function's own logic is itself not admin-specific either (it extends the generic
`resolveAppBaseUrl()` with a Development-only `localhost` carve-out that has nothing to do with
admin credentials).

**Design decision**: extract the origin-matching logic itself into a new, credential-free shared
function:

```ts
// src/shared/same-origin.ts
export type SameOriginResult = { outcome: "OK" } | { outcome: "FORBIDDEN" };

export function checkSameOrigin(request: Request, expectedOrigin: string): SameOriginResult {
  // Sec-Fetch-Site cross-site rejection, exact Origin match, Referer-origin fallback,
  // fail-closed when neither header establishes same-origin - identical logic to the current
  // src/admin-auth/csrf.ts, parameterized by expectedOrigin instead of calling
  // resolveExpectedAdminOrigin() internally.
}
```

`src/admin-auth/csrf.ts` becomes a thin caller: `checkSameOrigin(request, resolveExpectedAdminOrigin())`.
A new, equally thin account-side caller does the same with its own trusted-origin resolver (either
`resolveExpectedAdminOrigin()` reused directly under a less admin-specific name, or a second,
identically-behaved export from `app-url.ts` — a Code Generation naming decision, not a behavioral
one; both resolve to the exact same `APP_BASE_URL`/`VERCEL_URL`/Development-`localhost` logic).

**This is reuse of the pattern, never of admin credentials or admin code paths** (NFR-U6-52) — the
extracted `checkSameOrigin` function takes no admin-specific input, checks no admin credential, and
is called independently by each route family; a request cannot satisfy the account-side check by
presenting any admin credential, and vice versa.

**Applied to** (NFR-U6-51, **extended per this correction**): `claimPurchase` (both Path A's start
call and Path B), `logout`, `deleteAccount`, and — **new** — `completeClaimByEmail`. This addition
follows directly from Pattern 1's correction above: `completeClaimByEmail` now depends on
`AccountSession` cookie authentication and mutates account state (creates an `AccountOrderLink`),
so it is no longer purely bearer-credential-authorized and falls under the same CSRF requirement as
any other session-authenticated mutation. **The CLAIM_PURCHASE bearer token remains an additional,
independent authorization factor — CSRF protection does not replace it**; both are required
together (Pattern 1).

**Not applied to** (NFR-U6-53/54, unchanged): `requestLoginLink` (no session exists to mutate),
`verifyLoginLink` (LOGIN verification — establishes a session but does not itself depend on one
already existing, and mutates no pre-existing account state; authorized by bearer-credential
possession alone, per Pattern 1's unmodified LOGIN statement).

## 4. Transaction-Safe Conflict Resolution Pattern

Satisfies NFR-U6-27 through NFR-U6-31. **Corrected/chosen per NFR Requirements review**, which left
two acceptable strategy families open (`ON CONFLICT ... RETURNING` + `SELECT`, or `SAVEPOINT`) —
this document narrows to one concrete, chosen mechanism for both `accounts.email` and
`account_order_links.order_id`:

```sql
-- Account find-or-create (inside verifyLoginLink's transaction):
INSERT INTO accounts (email) VALUES ($1)
ON CONFLICT (email) DO NOTHING
RETURNING id, email, created_at;
-- If zero rows returned (another concurrent transaction already created it):
SELECT id, email, created_at FROM accounts WHERE email = $1;

-- AccountOrderLink creation (inside claimPurchase's link step):
INSERT INTO account_order_links (account_id, order_id, link_method)
VALUES ($1, $2, $3)
ON CONFLICT (order_id) DO NOTHING
RETURNING id, account_id, order_id, link_method, linked_at;
-- If zero rows returned:
SELECT id, account_id, order_id, link_method, linked_at FROM account_order_links WHERE order_id = $2;
-- then: same accountId as $1 -> idempotent success; different accountId -> ALREADY_LINKED_TO_ANOTHER_ACCOUNT.
```

**Why `ON CONFLICT DO NOTHING` + `SELECT` over `SAVEPOINT`**: `ON CONFLICT` never raises a
constraint-violation error in the first place — the `INSERT` simply affects zero rows — so the
enclosing transaction is **never aborted** by this path at all, which is simpler to reason about and
implement correctly than an explicit `SAVEPOINT`/rollback-to-savepoint sequence, and requires no
additional transaction-nesting support from the Drizzle/`neon-serverless` interactive-transaction
layer beyond what it already provides. A `SAVEPOINT`-based approach remains an equally-compliant
alternative per NFR Requirements' own wording, but this document specifies `ON CONFLICT` as the
concrete choice Code Generation implements, for this reason.

**Binding invariants preserved regardless of the exact statement text** (restated from
NFR-U6-28/30/31): exactly one `accounts` row per normalized email; two genuinely concurrent valid
`LOGIN` verifications for the same new address may both complete, each with its own
`AccountSession`; concurrent same-`(accountId, orderId)` claim attempts resolve to the same single
link; concurrent different-account claim attempts for the same `orderId` resolve to exactly one
owner and one `ALREADY_LINKED_TO_ANOTHER_ACCOUNT` rejection, never two links.

## 5. Two-Layer Rate Limiting Pattern

Satisfies NFR-U6-37 through NFR-U6-42 (corrected §6). **Corrected/added per NFR Requirements
review** — replaces an in-process-only model with a genuine two-layer design appropriate to
Vercel's multi-instance/cold-start execution model.

**Layer 1 — Vercel Firewall rate-limiting rule (outer, authoritative, platform-level)**: a rule
configured against this project's existing Vercel Pro plan (Project Settings → Firewall, or the
equivalent `vercel.json`/`vercel deploy` configuration surface — a **deployment configuration**
artifact, not application code), scoped to the public paths `requestLoginLink` and `claimPurchase`
Path A's start call are served from (and, where useful, the verification endpoints). Evaluated at
the edge, before a request reaches any function instance — shared across every instance and
unaffected by cold starts, which is precisely the property an in-process `Map` cannot provide on
this platform. Initial threshold: the same `10`-per-`60`-seconds shape
`DEFAULT_RATE_LIMITER_OPTIONS` already uses (NFR-U6-40), reused intentionally rather than derived
fresh, explicitly subject to retuning from real deployment evidence (tracked open,
`external-verification-tracker.md` item 17).

**Layer 2 — `FailedLookupRateLimiter`, application-local (inner, defense-in-depth only)**: the
existing class (`src/report-access/rate-limiter.ts`), used two ways, both explicitly demoted from
"the control" to "a second, local layer":
- **Unmodified, existing failure-counting mode** for the verification endpoints
  (`verifyLoginLink`/`completeClaimByEmail`) — an invalid token presentation counts as a failure,
  exactly as an invalid `reportAccessToken` lookup already does.
- **A second, independently-scoped instance** (new export, e.g. `accountAuthLocalLimiter`,
  `src/shared/rate-limiter-instance.ts`) — kept **separate** from `reportLookupLimiter` so a burst
  against one endpoint family cannot consume rate-limit budget intended for the other. Used in an
  **every-attempt-counts mode** for `requestLoginLink`/`claimPurchase` Path A's start call
  (calling the existing class's `recordFailure` unconditionally on every call, not only on a
  distinguishable failure — since these endpoints always return the same generic success response
  by design, NFR-U6-8, they have no separate "failure" signal to count instead). This is a new call
  *pattern* against the existing class, not a new class.

**Neither layer is optional** — Layer 1 alone would leave application-local defense-in-depth absent
for cases where the edge rule doesn't apply cleanly (e.g. local/preview testing without a configured
Firewall rule); Layer 2 alone is what NFR Requirements review corrected away from as insufficient on
Vercel. Both together satisfy NFR-U6-42's "no Redis/CAPTCHA/new vendor" constraint — Layer 1 is
already-available platform capability, Layer 2 is an already-existing application class.

---

## 6. Inherited — No New Pattern

Per explicit instruction, the following NFR Design categories are recorded as **inherited
unchanged** — no new pattern, component, service, or mechanism is introduced for any of them:

- **Report-generation reliability / job state machine** — unchanged; Unit 6 adds no step to
  `report-generation-orchestrator`, no new `ReportGenerationJobState`.
- **Payment/refund system** — unchanged; no interaction with Stripe or `Order` state transitions.
- **PDF rendering** — unchanged; Account Access (§ logical-components.md) reaches the same existing
  report-rendering code Guest Access already uses.
- **Database/hosting** — unchanged; Neon/Postgres, the same `neon-http`-default/
  `neon-serverless`-scoped-transaction strategy (Unit 2B's pivot) covers Pattern 4's transactions.
- **Email provider** — unchanged; `email-delivery/resend-client.ts` reused as-is for two new
  templates.
- **Deployment topology** — unchanged in kind (still Vercel); Pattern 5's Firewall rule is new
  *configuration* on the existing platform, not a new platform or service.
- **Backup/recovery** — unchanged; the new tables are ordinary rows in the same already-backed-up
  database.
- **Accessibility** — unchanged; `frontend-components.md`'s existing baseline is followed.
- **Admin authentication itself** — unchanged and untouched; Pattern 3 extracts a shared *helper*
  `admin-auth/csrf.ts` calls into, but does not modify `basic-auth.ts` or any admin credential
  check, and the extraction is behavior-preserving for the admin route (same inputs produce the
  same `OK`/`FORBIDDEN` outcome as before).

**No new infrastructure product (Redis, distributed lock, APM, identity provider), no new external
vendor, and no general-purpose auth/session-management framework is introduced anywhere in this
document** — Pattern 5's Vercel Firewall rule is existing platform capability configured, not a new
product, and every other pattern reuses an existing primitive from this project's own codebase.
