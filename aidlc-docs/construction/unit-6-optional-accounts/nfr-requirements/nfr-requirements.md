# Unit 6 — NFR Requirements (Optional Accounts)

**Targeted, delta-only** — per explicit founder instruction, this document addresses only the
genuinely new NFR surfaces Unit 6 introduces: customer authentication/session security (including
CSRF protection for account-session mutations, §2b), magic-link bearer-token security, account
authorization/IDOR resistance, concurrency/transactional integrity, account deletion/privacy
behavior, and auth-endpoint abuse resistance. Every other NFR category inherits Units 1-5's
already-approved baseline unchanged — stated explicitly in §9, not silently assumed.

**Status: APPROVED IN SUBSTANCE, four founder-review corrections applied 2026-08-27** — (1) a new
§2b adds CSRF protection requirements for `AccountSession`-authenticated mutating routes, reusing
Unit 3's existing CSRF pattern; (2) §6 corrected from an in-process-only rate-limiting model (stale
single-replica reasoning) to a Vercel-Firewall-primary / in-process-local-defense-in-depth model;
(3) §4's `Account`/`AccountOrderLink` uniqueness-conflict handling corrected from a
catch-a-raw-violation-and-continue description to an explicit transaction-safe strategy
(`ON CONFLICT ... RETURNING` + `SELECT`, or `SAVEPOINT`); (4) §8 gained an explicit requirement for
a B-tree index on `account_order_links(account_id)`, which NFR-U6-47's own query shape assumed but
the schema didn't yet specify. One non-blocking wording correction also applied (NFR-U6-9). This
document is now **APPROVED/COMPLETE** — no further NFR Requirements review gate is held, per
explicit instruction; proceeding directly to NFR Design.

---

## 1. Magic-Link / Bearer-Token Security

Governs `MagicLinkToken` (both `LOGIN` and `CLAIM_PURCHASE` purposes) and its fragment-to-POST
transport, corrected into `business-logic-model.md`/`frontend-components.md` during Functional
Design review.

- **NFR-U6-1**: Every `MagicLinkToken`'s raw value is generated via the existing
  `generateAccessCredential()` (`src/report-access/credential.ts`) — 256-bit CSPRNG entropy,
  identical to `reportAccessCredentials`' own already-reviewed generation. No new token-generation
  routine is introduced.
- **NFR-U6-2**: Only the token's SHA-256 hash (`hashToken()`, same existing function) is ever
  persisted, in `magic_link_tokens.token_hash`. The raw value exists only in memory at issuance
  (until sent), in the email itself, and briefly in the browser's URL fragment/POST body — never
  written to any table, log line, or error message, in either the `LOGIN` or `CLAIM_PURCHASE` path.
- **NFR-U6-3**: Both `LOGIN` and `CLAIM_PURCHASE` tokens are short-lived (15-minute `expiresAt`, per
  `business-logic-model.md`) and strictly single-use — enforced by the atomic conditional
  consumption primitive (§4) rather than an ordinary read-then-write, so a token cannot be replayed
  even under concurrent verification attempts.
- **NFR-U6-4**: **Purpose separation is structural, not just a query filter.** Verifying a `LOGIN`
  token only ever queries `WHERE purpose = 'LOGIN'`; verifying a `CLAIM_PURCHASE` token only ever
  queries `WHERE purpose = 'CLAIM_PURCHASE'`. Combined with the `magic_link_tokens_purpose_shape_
  valid` CHECK constraint (`domain-entities.md`) enforcing that a `LOGIN` row can never carry an
  `accountId`/`orderId` and a `CLAIM_PURCHASE` row must always carry both, a token issued for one
  purpose cannot be presented to complete the other — there is no code path or database state where
  the two purposes' verification logic overlaps.
- **NFR-U6-5**: **The raw token is never placed in a URL query string, pathname, or redirect query
  parameter**, for either purpose — the fragment-to-POST-body exchange (`business-logic-model.md`'s
  "Magic-link transport" section) is the only transport. This matches this project's own existing
  discipline against raw bearer credentials in URLs (`reportAccessToken`, Unit 2B's confidentiality
  hardening, `Referrer-Policy: no-referrer` on token-bearing pages) — Unit 6 does not introduce a
  weaker standard than Unit 2B already established for a structurally identical risk.
- **NFR-U6-6**: The landing page's client-side script removes the fragment from the visible URL and
  browser history (`history.replaceState`) **before** issuing the verification POST — the raw token
  does not persist in browser history at all, not even transiently past the initial page load.
- **NFR-U6-7**: **Unknown, expired, already-consumed, and lost-the-race outcomes are externally
  indistinguishable** — every one of these cases returns the same generic `INVALID_OR_EXPIRED`
  result with no differentiating status code, message, or timing signature deliberately introduced
  to leak which case occurred (matches this project's existing `resolveByAccessToken`
  not-found-vs-revoked-indistinguishable precedent, `report-access/credential.ts`).
- **NFR-U6-8**: `requestLoginLink`'s response is identical (a generic "check your email"
  confirmation) whether or not an `Account` already exists for the submitted address — this is not
  an incidental UX choice but a hard requirement: the endpoint must never become an
  account-existence oracle. The same applies to `claimPurchase`'s Path A response with respect to
  whether the target `Order` exists or is already linked (see §3/§5 for how existing-link state is
  disclosed only to the authenticated, already-linked caller, never to an unauthenticated probe).
- **NFR-U6-9**: **Corrected per founder review** — the requirement is behavioral, not a timing
  guarantee: verification of an unknown, expired, already-consumed, or lost-the-race token must
  produce **one common externally-visible failure result** (`INVALID_OR_EXPIRED`, NFR-U6-7) with
  **no deliberately different control-flow response** based on which case occurred, and **no
  intentionally introduced timing oracle** (e.g. no early-return short-circuit that skips work for
  one case but not another). This does **not** promise exact timing uniformity from Postgres/
  connection-pool/cache/index execution — no claim is made that the atomic `UPDATE` is
  constant-time in the cryptographic sense. Exact timing equalization is not required unless
  evidence (Build & Test or real deployment observation) later demonstrates a practical, exploitable
  side channel; the atomic single-statement primitive (§4) is what is required, not a stronger
  timing-safety property beyond it.

## 2. Customer Session Security

Governs `AccountSession` and `ACCOUNT_SESSION_COOKIE`, extending `shared/cookies.ts`'s existing
cookie conventions to a third cookie.

- **NFR-U6-10**: The account session token is **structurally separate** from the magic-link token
  that established it — generated via a fresh `generateAccessCredential()` call, its own table
  (`account_sessions`), its own hash, never derived from or equal to the consumed `MagicLinkToken`'s
  own value (`business-logic-model.md` workflow 2, step 2b).
- **NFR-U6-11**: `ACCOUNT_SESSION_COOKIE` carries `HttpOnly`, `Secure` (in every deployed
  environment — Vercel Production/Preview), and `SameSite=Lax`, matching `CHECKOUT_SESSION_COOKIE`/
  `REPORT_ACCESS_COOKIE`'s own already-approved attributes exactly (`shared/cookies.ts`). No new
  cookie-attribute policy is introduced.
- **NFR-U6-12**: **Every authenticated request re-resolves the session server-side** via
  `resolveByAccessToken(rawSessionToken, accountSessionStore)`, checking `revokedAt IS NULL AND
  expiresAt > now()`, on every request — never cached, never trusted merely because the cookie is
  present. This is this project's own established "cookie is a transport, not a trust boundary"
  principle (`shared/cookies.ts`'s own design comment), extended to a third cookie rather than
  weakened for it.
- **NFR-U6-13**: **Authentication state is never inferred from cookie presence alone** — a request
  bearing `ACCOUNT_SESSION_COOKIE` with no matching, unrevoked, unexpired `account_sessions` row is
  treated identically to a request with no cookie at all (unauthenticated), at every layer.
- **NFR-U6-14**: Session expiry is enforced server-side on every resolution (NFR-U6-12) — an
  expired session cannot be used merely because the cookie has not yet been cleared client-side (a
  client clock skew or a stale cached cookie does not extend a session past its real `expiresAt`).
- **NFR-U6-15**: Explicit logout revokes the specific session used to call it (`revokedAt =
  now()`), and the server response clears `ACCOUNT_SESSION_COOKIE` via `Set-Cookie` — never via
  client-side JavaScript, since the cookie is `HttpOnly` and cannot be read or mutated by page
  script (Functional Design correction 3). The client only reacts to the successful response and
  redirects.
- **NFR-U6-16**: Account deletion revokes/deletes **every** session for that account (not only the
  one used to authorize the deletion request) in the same transaction as the rest of BR-U6-5's
  deletion steps — no session for a deleted account can resolve as valid again after the
  transaction commits. The response likewise clears `ACCOUNT_SESSION_COOKIE` server-side.
- **NFR-U6-17**: **Session fixation is structurally prevented** — a session token is only ever
  minted as the direct, server-generated output of a successful `verifyLoginLink` call (NFR-U6-10);
  there is no code path that accepts a client-supplied or pre-existing session-token value and
  "activates" it. A new login always produces a newly generated session, never adopts one a client
  presented in advance.

## 2b. CSRF Protection for Account-Session Mutations — added per founder review

`SameSite=Lax` (NFR-U6-11) is defense-in-depth, not the complete authorization boundary — a
`SameSite=Lax` cookie is still attached to a top-level cross-site navigation using a "safe" method,
and browser `SameSite` behavior is not a substitute for an explicit server-side same-origin check.
Unit 6 is this project's first customer-facing cookie-authenticated **mutation** surface, so it
requires the same discipline Unit 3 already established for admin mutations.

- **NFR-U6-51**: Every `AccountSession`-authenticated **mutating** route (POST/PUT/PATCH/DELETE) —
  at minimum `claimPurchase` (both Path A's start call and Path B), `logout`, `deleteAccount`, and
  any other `AccountSession`-authenticated mutating route Unit 6 introduces — validates same-origin
  before executing, reusing the **pattern** Unit 3's admin CSRF check already established
  (`src/admin-auth/csrf.ts`'s `checkSameOrigin`): an explicit `Sec-Fetch-Site: cross-site` header
  is rejected outright as defense-in-depth; otherwise an exact-match check against a trusted
  expected origin, using `Origin` when present, falling back to `Referer`'s parsed origin
  component only when `Origin` is legitimately absent; the request is rejected (fails closed) when
  neither header establishes same-origin.
- **NFR-U6-52**: **This is reuse of the CSRF pattern, not reuse of admin credentials or admin
  code.** Customer-session CSRF validation is structurally independent of Unit 3's admin Basic
  Auth/`ADMIN_OPERATOR_ID` — it uses its own trusted-expected-origin resolution, sharing only the
  same underlying, non-admin-specific origin-resolution logic `resolveExpectedAdminOrigin()`
  (`src/shared/app-url.ts`) already generalizes beyond its own name (it extends `resolveAppBaseUrl()`
  with a Development-only localhost carve-out and no admin-specific behavior otherwise) — reused
  directly or given a second, identically-behaved entry point at Code Generation's discretion, never
  by routing a customer request through admin auth. Deployed Preview/Production environments use the
  real trusted origin (`APP_BASE_URL`/Vercel's `VERCEL_URL`) exactly as the admin check already
  does; Development retains the same explicit `localhost` carve-out.
- **NFR-U6-53**: `requestLoginLink` (unauthenticated — no `AccountSession` exists yet, mutates no
  session state) is **not** subject to this CSRF requirement — sending an email as the side effect
  of an unauthenticated request is not a session-mutation risk this check exists to prevent (it
  remains subject to §6's abuse-resistance requirements instead, which govern a different risk).
- **NFR-U6-54**: Magic-link verification (`verifyLoginLink`, `completeClaimByEmail`) is **not**
  subject to this CSRF requirement — it is authorized by possession of a single-use bearer
  credential presented in the POST body (§1's fragment-to-POST exchange), not by an already-
  authenticated session being acted upon; requiring a same-origin check on top would misattribute a
  bearer-credential-authorized action as the kind of session-mutation risk it isn't. This posture
  applies only because neither verification endpoint additionally mutates an already-authenticated
  `AccountSession` as a side effect in this design — if a future change ever made one do so, that
  specific mutation would then fall under NFR-U6-51.
- **NFR-U6-55**: `claimPurchase`'s Path A "start" call (send a `CLAIM_PURCHASE` email) **is**
  subject to this CSRF requirement despite triggering an email, because — unlike
  `requestLoginLink` — it requires and acts upon an active `AccountSession` (`accountId` is read
  from the session, and a `MagicLinkToken` row bound to that `accountId` is created); it is
  explicitly included in NFR-U6-51's enumerated list, not exempted alongside NFR-U6-53.

## 3. Authorization / Data Isolation (IDOR Resistance)

Governs the two-mode report-access model (BR-U6-4) and every account-scoped read.

- **NFR-U6-18**: `accountId` is resolved **only** from the current request's validated
  `AccountSession` (NFR-U6-12) for every account-scoped operation (`claimPurchase`,
  `listReportHistory`, `getAccountReport`, `deleteAccount`) — never accepted as a request body/query
  parameter, and never trusted from any client-supplied value under any circumstance.
- **NFR-U6-19**: `AccountOrderLink` is the **sole** authorization record for Account Access
  (BR-U6-4 Mode B) — a report is served to an authenticated account if and only if a matching
  `accountOrderLinks` row exists for that exact `(accountId, orderId)` pair. No other signal
  (session validity alone, `Order.customerEmail` text, request origin) substitutes for this check.
- **NFR-U6-20**: `Order.customerEmail` is **never** used as an authorization input anywhere in Unit
  6 — not for linking (BR-U6-3 invariant 1), not for report access (BR-U6-4), not for any account
  operation. It remains commercial metadata only, exactly as Unit 2B established it.
- **NFR-U6-21**: A request for an `orderId` the caller's account does not hold a link for returns
  the **same** `FORBIDDEN` response whether that order does not exist, belongs to no account, or
  belongs to a different account — no code path differentiates these cases in the response,
  preventing an authenticated account from enumerating which orders exist or which are claimed by
  probing `orderId` values (matches NFR-U6-7's no-oracle principle, applied to authorization rather
  than token validity).
- **NFR-U6-22**: `listReportHistory` (workflow 4a) scopes its query by the session-resolved
  `accountId` alone (`WHERE accountId = $1`) — it is structurally incapable of returning a row for
  any other account, since no other account's `accountId` value is ever available to the query.
- **NFR-U6-23**: **Guest Access (`reportAccessCredentials` bearer tokens) remains fully independent
  and unmodified** — Unit 6 introduces no change to `report-access/repository.ts`,
  `resolveByAccessToken`'s existing behavior, or any existing guest-facing route. A report reachable
  via Account Access is reachable via its original guest token exactly as before, and vice versa;
  the two modes never interact.
- **NFR-U6-24**: Account Access **never reconstructs, recovers, or re-derives** a lost original
  guest bearer token, and **never mints a new guest `reportAccessCredentials` row** merely to serve
  an account-authorized request — `getAccountReport` (workflow 4b) resolves the artifact via the
  `orders → evidenceReportArtifacts` relationship directly, never by producing or consuming a guest
  token as an intermediate step.
- **NFR-U6-25**: Deleting an Account (BR-U6-5) has **zero effect** on Guest Access authorization
  semantics for any previously linked order — no statement in the deletion transaction targets
  `reportAccessCredentials`, and no code elsewhere revokes or alters a guest credential as a
  consequence of account deletion (BR-U6-5 point 6, restated here as a hard authorization
  requirement, not only a retention one).

## 4. Concurrency / Transactional Integrity

Governs the atomic token-consumption primitive, the LOGIN transaction, and the two database-level
uniqueness invariants (`accounts.email`, `account_order_links.order_id`).

- **NFR-U6-26**: Token consumption (either purpose) is a **single atomic conditional statement**,
  not a read-then-write: `UPDATE magic_link_tokens SET consumed_at = now() WHERE token_hash = ? AND
  purpose = ? AND consumed_at IS NULL AND expires_at > now() RETURNING ...`. **Opportunistic
  consistency correction, applied during NFR Design review (not a new NFR Requirements review
  gate)**: for `purpose = 'CLAIM_PURCHASE'`, this statement is additionally conditioned on
  `account_id = <session-resolved accountId>` — see `nfr-design/nfr-design-patterns.md` Pattern 1
  for the full corrected statement and rationale (a valid `CLAIM_PURCHASE` token alone proves
  control of the purchase email, not control of the Account the claim was started from; both are
  required). Under concurrent verification attempts for the same token (and, for `CLAIM_PURCHASE`,
  the same session), the database guarantees exactly one statement observes a matching row and
  returns it; every other concurrent attempt observes zero rows.
- **NFR-U6-27**: `verifyLoginLink`'s three effects — token consumption, `Account` find-or-create,
  `AccountSession` creation — execute inside **one database transaction**. If the session-insert
  step fails for any reason, the entire transaction (including the token consumption itself) rolls
  back — a valid, presented `LOGIN` token is never left permanently burned without a session having
  actually been established. **Corrected per founder review**: the `Account` find-or-create step
  itself must use a **transaction-safe conflict strategy** (NFR-U6-28), not a catch-and-continue
  around a raw constraint violation, precisely so this transaction can reach the session-insert step
  and commit successfully even when it raced another equally-valid login attempt for the same new
  address.
- **NFR-U6-28**: **Corrected per founder review** — `accounts.email`'s uniqueness (`UNIQUE`
  constraint) remains the **authoritative**, database-level enforcement (never application-code
  discipline alone), but the concurrent-insert case must be handled with a **transaction-safe
  conflict strategy**, not by catching a raw `UNIQUE` violation and continuing to use the same
  (now-aborted) transaction — a standard Postgres `UNIQUE` violation aborts the enclosing
  transaction until rollback or a savepoint releases it, so "catch the error and proceed" as
  originally worded cannot be relied upon literally. Acceptable strategies (a Code Generation
  decision among these, not prescribed further here): an `INSERT ... ON CONFLICT (email) DO NOTHING
  RETURNING ...` followed by a `SELECT` for the authoritative existing row when the `INSERT` affects
  zero rows (no violation ever raised, so no abort); or an explicit `SAVEPOINT` wrapping the `INSERT`
  attempt, released/rolled-back-to on conflict without aborting the outer transaction. Binding
  invariants regardless of mechanism: exactly one `Account` row exists per normalized email; two
  genuinely concurrent, otherwise-valid `verifyLoginLink` calls for the same new address may both
  complete successfully, each establishing its own independent `AccountSession` against the single
  resulting `Account` row; the losing side of the `Account`-creation race does not abort or fail its
  own legitimate `LOGIN` transaction merely because another transaction won the race to create the
  row first.
- **NFR-U6-29**: `account_order_links.order_id`'s `UNIQUE` constraint is the **authoritative**
  enforcement of "at most one account per order" (BR-U6-3 invariant 3) — the application always
  attempts the link creation directly rather than relying on a `SELECT`-then-`INSERT` pre-check,
  which would leave a real race window between two concurrent claim attempts for the same order.
  **Corrected per founder review**: whenever this operation runs inside a transaction, it must use
  the **same class of transaction-safe conflict strategy** as NFR-U6-28 (`ON CONFLICT (order_id) DO
  NOTHING RETURNING ...` + a follow-up `SELECT`, or an explicit `SAVEPOINT`) — application code must
  never assume it can catch a raw `UNIQUE` violation on `order_id` and continue using an
  already-aborted transaction to proceed with idempotency/conflict resolution.
- **NFR-U6-30**: Concurrent claim attempts for the **same** `(accountId, orderId)` pair resolve
  idempotently — both (or all) concurrent callers ultimately observe the same, single
  `AccountOrderLink` row as the successful result, whether their own conflict-safe insert attempt
  (NFR-U6-29) won or lost the race — the losing attempt's `SELECT` (in the `ON CONFLICT`/`SAVEPOINT`
  strategy) finds its own `accountId` already matches the existing row, per BR-U6-3 invariant 2.
- **NFR-U6-31**: Concurrent claim attempts for the **same** `orderId` from **different** accounts
  resolve deterministically to exactly one outcome pair: one attempt's conflict-safe insert succeeds
  and becomes the authoritative link; every other concurrent attempt's insert is rejected by the
  constraint (handled without aborting its own transaction, NFR-U6-29) and its follow-up `SELECT`
  finds a different `accountId` already holds the link, resolving to
  `ALREADY_LINKED_TO_ANOTHER_ACCOUNT` — never two links, never a silently overwritten link, never an
  unresolved/ambiguous state, and never an aborted transaction left unhandled.
- **NFR-U6-32**: `deleteAccount` (BR-U6-5, workflow 5) executes as **one database transaction**
  covering every one of its delete statements (sessions, both token categories, links, the account
  row) — a mid-sequence failure (e.g. a transient connection error) rolls back the entire operation,
  never leaving a partially-deleted account (e.g. sessions revoked but the account row and its links
  still present, or vice versa).

## 5. Privacy / Deletion

Restates BR-U6-5's delete/retain split as explicit NFR-level requirements, since Unit 6 is this
project's first unit handling account-scoped personal-data deletion.

- **NFR-U6-33**: Confirmed account deletion deletes, in the same transaction (NFR-U6-32): the
  `Account` row; every `AccountSession` row for that account (NFR-U6-16); every outstanding
  `CLAIM_PURCHASE` `MagicLinkToken` row referencing that `accountId`; every outstanding `LOGIN`
  `MagicLinkToken` row for that account's own normalized email, captured **before** the `Account`
  row is deleted (Functional Design correction 3 — `LOGIN` tokens carry no `accountId` by design,
  so they must be located by email); every `AccountOrderLink` row for that account.
- **NFR-U6-34**: Confirmed account deletion **does not mutate** the `Order` row(s) previously
  linked, **does not mutate** the `EvidenceReportArtifact` row(s) or any report content/provenance,
  and **does not revoke or alter** any `reportAccessCredentials` row (NFR-U6-25) — no statement in
  the deletion transaction targets any of these tables, matching RGD-4's immutability discipline by
  construction, not merely by intent.
- **NFR-U6-35**: Account deletion makes **no claim about, and takes no action on,**
  `Order.customerEmail` — that field's retention remains governed entirely by Unit 2B's own,
  already-established commercial/audit retention posture, unaffected by whether any Account was
  ever linked to the order or has since been deleted.
- **NFR-U6-36**: After confirmed deletion, **no account-specific authentication material remains
  usable** — no session, no outstanding token of either purpose tied to that account or its email,
  can subsequently authenticate as that account or recreate it implicitly (NFR-U6-33 closes the
  specific "outstanding LOGIN link recreates the deleted account" gap Functional Design review
  identified). A future account for the same email address must be established via a **fresh**
  `requestLoginLink`/`verifyLoginLink` cycle, and re-linking any previously-associated order
  requires satisfying BR-U6-3's proof-of-control mechanisms again from scratch — deletion carries
  forward no residual trust.

## 6. Auth-Endpoint Abuse Resistance

Unit 6 introduces three new publicly reachable, email-triggering endpoints that did not exist
before this unit: `requestLoginLink`, the verification endpoints (`verifyLoginLink`/
`completeClaimByEmail`), and `claimPurchase` Path A's email-trigger step. Each is a real target for
automated abuse (email-bombing a victim address, brute-forcing token guesses, enumerating orders).

**Corrected per founder review** — the original version of this section treated the in-process
`FailedLookupRateLimiter` as the authoritative deployment-wide control, reasoning from a stale
Railway/single-replica assumption. This project deploys to **Vercel**, where a Serverless/Edge
Function's in-process memory (a plain `Map`, as `FailedLookupRateLimiter` uses) is **not shared
across function instances** and is **reset by cold starts** — it cannot, by itself, provide
deployment-wide enforcement against an attacker whose requests land on different instances or
survive a cold start. This is a correction to the requirement model, not a newly discovered
Vercel limitation — it was true throughout Unit 2B's own pivot to Vercel and simply hadn't been
applied to this specific new abuse surface until now.

- **NFR-U6-37**: **Primary/outer abuse control**: the public, email-triggering endpoints —
  `requestLoginLink`, `claimPurchase` Path A's start call, and (where useful) the verification
  endpoints — are protected by a **Vercel Firewall rate-limiting rule** configured at the platform
  level (already available on this project's existing Vercel Pro plan — confirmed at
  `aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`'s Workflow-Start
  Idempotency correction). This is edge/platform-level enforcement, evaluated before a request
  reaches any function instance — it is shared across all instances and unaffected by cold starts,
  correctly closing the gap an in-process limiter cannot. **No new vendor, Redis instance, database,
  or application service is introduced** — this is existing Vercel platform capability, configured,
  not a new dependency.
- **NFR-U6-38**: **Application-local defense-in-depth (demoted, not removed)**: `FailedLookupRateLimiter`
  (`src/report-access/rate-limiter.ts`) remains in use for **invalid bearer-token attempts** on the
  verification endpoints (`verifyLoginLink`, `completeClaimByEmail`) in its existing, unmodified
  failure-counting mode, using the same source-key derivation (`x-forwarded-for`-based,
  `sourceKeyFor`) already established in `app/api/reports/route.ts`, and remains suitable for
  deterministic tests. It must **not** be described or relied upon as the authoritative
  deployment-wide email-abuse control on Vercel — that role belongs to NFR-U6-37's platform-level
  rule. Its role here is a second, local, defense-in-depth layer only.
- **NFR-U6-39**: `requestLoginLink` and `claimPurchase` Path A's every-attempt-counts local
  generalization of `FailedLookupRateLimiter` (as previously specified) **may still be implemented**
  as an additional local layer alongside NFR-U6-37's platform rule, but is explicitly **not** a
  substitute for it — both may coexist (platform rule as the authoritative outer control, the local
  variant as inner defense-in-depth), but the local variant alone does not satisfy this section.
- **NFR-U6-40**: Numeric limits are **not invented new** for either layer. The existing, already-
  approved `DEFAULT_RATE_LIMITER_OPTIONS` (`maxFailuresPerWindow: 10`, `windowMs: 60_000`,
  `cooldownMs: 60_000`) is reused as-is for the application-local layer (NFR-U6-38/39). The Vercel
  Firewall rule's own threshold (NFR-U6-37) is recorded as **initial tuning subject to real
  deployment evidence** — intentionally reusing the same 10-per-60-seconds shape as a starting
  point rather than deriving a new number, with explicit room to retune from real Build & Test or
  production evidence rather than treating either number as precisely correct today.
- **NFR-U6-41**: Per Unit 2B's own established precedent (item 6, `external-verification-tracker
  .md`), the deployment's actual client-IP source-key behavior on Vercel remains **explicitly
  unverified** — this requirement inherits that same open, non-blocking item rather than
  re-opening or duplicating it, and is now joined by a **new** open item for the Vercel Firewall
  rule's own live configuration/behavior (`external-verification-tracker.md` item 17, added by this
  correction) — neither is fabricated as verified.
- **NFR-U6-56**: **No Redis, distributed rate-limiting service, CAPTCHA, or new security vendor is
  introduced** — the Vercel Firewall rule (NFR-U6-37) is existing platform capability already
  included in this project's Vercel Pro plan, not a new product; `FailedLookupRateLimiter` remains
  the existing in-process class, used as local defense-in-depth only (NFR-U6-38), never described as
  sufficient on its own for deployment-wide enforcement.

*(Numbering note: this correction rewrites §6's requirements in place — NFR-U6-37 through NFR-U6-41
keep their original numbers with corrected content, since they replace, rather than add to, what
those numbers originally meant. New items with no prior equivalent (this section's NFR-U6-56; §2b's
NFR-U6-51 through NFR-U6-55; §8's NFR-U6-57 below) are assigned the next unused numbers in sequence
rather than renumbering §7/§8, which keep their original numbers — NFR-U6-42 through NFR-U6-50 —
unchanged below, to avoid an error-prone full renumbering of this document's cross-references.)*

## 7. Email Delivery / Failure Behavior

Governs the reuse of `email-delivery/resend-client.ts` (Unit 2B) for a new, security-sensitive
purpose — authentication and purchase-claim proof, not merely report-ready notification.

- **NFR-U6-42**: Three states are kept explicitly distinct at every layer, never conflated:
  (1) the `MagicLinkToken` row is **persisted** (durable, queryable, capable of being verified);
  (2) `resend-client.ts`'s `sendEmail` returns `{ outcome: "SENT", id }`, meaning **Resend accepted
  the message for delivery** — this is not, and must never be represented as, proof the message
  reached the recipient's inbox (matches Unit 2B's own already-established `EMAIL_SENT` semantics,
  NFR Design Pattern 7); (3) actual **inbox delivery** is never verified or claimed by this system —
  no bounce/complaint-webhook infrastructure is introduced in Unit 6, matching Unit 2B's own
  explicit non-scope decision for the same reason.
- **NFR-U6-43**: A `sendEmail` failure (`{ outcome: "FAILED", reason }`) for `requestLoginLink` or
  `claimPurchase` Path A **does not expose whether an Account or Order exists** — the caller-facing
  response remains the same generic confirmation (NFR-U6-8) regardless of whether the underlying
  send succeeded or failed; a send failure is recorded/logged server-side for operator diagnosis
  only, never surfaced to the caller in a way that differs from the success case.
- **NFR-U6-44**: A `sendEmail` failure **does not leave authentication-corrupting state** — the
  `MagicLinkToken` row is inserted (or not) independently of the send outcome, and a failed send
  does not need to be reversed for correctness (an unconsumed, never-received token simply expires
  at its normal `expiresAt` like any other unused token; no manual cleanup is required for
  correctness, only for the ordinary retention posture in §8).
- **NFR-U6-45**: **Expected retry/re-request behavior**: a customer who does not receive a magic
  link (send failure, spam-filtered, or simply never checked) re-requests one via the same
  `requestLoginLink`/`claimPurchase` Path A entry point — no separate "resend" mechanism is built;
  requesting again is the resend mechanism, and each request issues a genuinely new token (the
  previous one, if still outstanding, simply expires unused or is superseded functionally, never
  explicitly invalidated by the new request — there is no requirement to revoke a still-valid prior
  token merely because a new one was requested, matching the existing report-access credential
  rotation precedent's "rotate on retry, don't need to actively revoke the old one" posture, Unit
  2B BR-U2B-*).

## 8. Performance / Retention

Kept modest per explicit instruction — no large-scale identity architecture.

- **NFR-U6-46**: Session resolution (`resolveByAccessToken` against `account_sessions`, NFR-U6-12,
  invoked on every authenticated request) uses an **indexed** lookup — `account_sessions
  .token_hash` carries a `UNIQUE` constraint (an index by construction in Postgres), matching
  `reportAccessCredentials`' own existing indexed-hash-lookup pattern. No sequential scan is
  required for the single most frequently executed query this unit introduces.
- **NFR-U6-47**: `listReportHistory` (workflow 4a) is a single indexed-`WHERE`-scoped query
  (`account_order_links.account_id`) joined to `orders`/`evidenceReportArtifacts` via their own
  already-indexed primary keys — it is bounded by the number of orders one account has actually
  linked (expected to be small, consistent with this product's per-property-screening purchase
  pattern), never an unbounded or application-side-filtered scan across all orders.
- **NFR-U6-57**: **Added per founder review** — `account_order_links.account_id` requires an
  **explicit standard B-tree index**, distinct from `order_id`'s own `UNIQUE` constraint/index.
  Postgres does not automatically index a merely foreign-key-shaped column — a `UNIQUE` constraint
  on `order_id` provides no lookup path for a query filtered by `account_id`, which is exactly
  NFR-U6-47's own query shape. This is a binding requirement on the schema Code Generation produces
  from `domain-entities.md`'s `accountOrderLinks` table, additive to (never replacing) the existing
  `order_id UNIQUE` constraint, `magic_link_tokens.token_hash UNIQUE`, `account_sessions.token_hash
  UNIQUE`, and `accounts.email UNIQUE` — all four of which remain unchanged.
- **NFR-U6-48**: `magic_link_tokens.token_hash` and `account_order_links.order_id` both carry
  `UNIQUE` constraints (domain-entities.md) — each is an indexed lookup path by construction, not an
  additional index to design separately.
- **NFR-U6-49**: Expired/consumed `MagicLinkToken` rows and revoked/expired `AccountSession` rows
  are **not required to be actively purged for correctness** (an expired/consumed row already fails
  every query's `WHERE` clause, NFR-U6-26/NFR-U6-12) — but an **operationally manageable retention
  posture** is expected: these are naturally small, bounded-lifetime rows (15-minute token expiry,
  a longer but still bounded session expiry) accumulating at a rate proportional to real login/claim
  activity, not an unbounded growth risk at this project's current scale. A periodic cleanup
  job/query for old expired/consumed rows is a reasonable **future** operational task (recorded here
  as a posture, not designed or scheduled in this unit — no new cron/worker is introduced to perform
  it).
- **NFR-U6-50**: No large-scale identity architecture (a dedicated identity provider, a
  claims/token-introspection service, a separate auth database/service boundary) is introduced —
  every new table lives in the same Postgres database, via the same Drizzle ORM and migration
  tooling, as every other table in this project.

## 9. Explicit Baseline Inheritance — No New Requirements

Per explicit instruction, the following categories are **unaffected by Unit 6** and inherit the
project's already-approved posture entirely unchanged — restated here explicitly so this targeted
document is not mistaken for silently omitting them:

- **Deployment topology** — unchanged; Vercel remains the platform, no new service/region/replica
  model is introduced for account auth.
- **Database/hosting** — unchanged; Neon/Postgres remains the sole data store; the same
  `neon-http`-default/`neon-serverless`-scoped-transaction connection strategy (Unit 2B's pivot)
  covers Unit 6's new transactional operations (NFR-U6-27, NFR-U6-32) without any new driver.
- **Email provider** — unchanged; Resend remains the sole email provider, via the same
  `email-delivery/resend-client.ts` adapter (§7), no new provider or second adapter.
- **Report-generation reliability** — unchanged; Unit 6 adds no new step to
  `report-generation-orchestrator`, no new job state, no new retry/failure mechanism (Account
  Access, NFR-U6-24, only adds an authorization gate in front of already-generated reports).
- **Payment/refund system** — unchanged; Unit 6 introduces no interaction with Stripe, `Order`
  state transitions, or the refund lifecycle whatsoever (BR-U6-3/BR-U6-4 read `Order`/`orderId`
  only, never write to `orders`).
- **Report immutability/provenance** — unchanged; reaffirmed explicitly by NFR-U6-34, not merely
  assumed.
- **Admin authentication/CSRF** — unchanged and **structurally separate**: Unit 3's single-operator
  HTTP Basic Auth (`src/admin-auth/basic-auth.ts`) plus same-origin CSRF check (`csrf.ts`) governs
  `/admin`/`/api/admin/*` routes only; Unit 6's customer `AccountSession` mechanism is an entirely
  independent system with no shared code, cookie, or credential — an admin operator and a customer
  Account are never the same authentication concept, and neither can authenticate as the other.
- **Backup/recovery** — unchanged; no new backup/recovery posture beyond the existing Neon/Postgres
  posture; the four new tables are ordinary rows in the same already-backed-up database.
- **Accessibility baseline** — unchanged; Unit 6's new UI (`frontend-components.md`) follows the
  existing baseline this project has held since Unit 2, no new accessibility exception is
  introduced or required.
