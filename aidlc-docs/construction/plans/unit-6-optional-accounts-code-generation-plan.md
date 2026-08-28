# Unit 6: Optional Accounts — Code Generation Plan

**Status: PART 1 — APPROVED 2026-08-27, three bounded corrections applied (Order.state='PAID' for
Path B; narrowed Firewall scope + split claim routes; explicit FK/delete semantics — this schema's
first). Proceeding directly to Part 2 implementation, per explicit instruction — no further Part 1
review gate.**

## Real Audit Findings (read-only, this session)

Confirmed by directly reading the current repository, not assumed from the design documents:

1. **No `src/account-auth/` (or any account/user module) exists** — `find src -iname
   "*account*"` returns zero matches, confirming the design docs' own module names are proposals,
   not existing code, per this stage's own instruction not to assume otherwise.
2. **Two existing Pool-scoped interactive-transaction helpers**, both in `src/db/client.ts`:
   `withFulfillmentTransaction` (Unit 2B, scoped to BR-U2B-15's payment fulfillment) and
   `withAdminTransaction` (Unit 3, structurally identical, scoped to 4 local admin mutations,
   deliberately *not* reused/renamed for a different purpose — the file's own comment says so
   explicitly). **New finding**: Unit 6 needs its own third instance, `withAccountTransaction`,
   mirroring the same "open Pool, run one transaction, close Pool, never held across invocations"
   shape — not a reuse of either existing one, matching this project's own established
   one-helper-per-domain-purpose convention.
3. **The exact fragment-to-POST pattern already exists in production code**, not just in a design
   document: `app/report/page.tsx` reads `location.hash`, POSTs to `/api/reports/access`
   (`app/api/reports/access/route.ts`), which validates via `findArtifactIdByAccessToken` and
   returns a `Set-Cookie` header built with `shared/cookies.ts`'s `buildSetCookieHeader`. Unit 6's
   `/account/verify` and `/account/claim/verify` pages are a direct structural copy of this
   already-working, already-reviewed flow — not a new pattern to invent.
4. **`shared/cookies.ts`'s helpers (`readCookie`, `buildSetCookieHeader`, `buildClearCookieHeader`)
   are already fully generic** — adding `ACCOUNT_SESSION_COOKIE` requires zero changes to these
   functions, only a new exported constant.
5. **The real join for Path B is already exercised in existing code**: `report-access/repository.ts`
   already joins `reportAccessCredentials` → `evidenceReportArtifacts` (for
   `listStaleGuestDeliveries`) using `evidenceReportArtifacts.screeningRequestId` — the exact
   relationship Unit 6's `getAccountReport`/claim Path B need, confirming the planned join path is
   not just correct in theory but already has a working precedent to model the new query on.
6. **`src/admin-auth/csrf.ts`'s `checkSameOrigin` has no admin-specific dependency except which
   origin-resolver function it calls** (`resolveExpectedAdminOrigin`, `shared/app-url.ts`) —
   confirmed by re-reading both files in full; the extraction NFR Design specified is mechanical,
   not a redesign.
7. **`proxy.ts` is the ONLY place admin CSRF is currently invoked**, gated by a `matcher` scoped
   exclusively to `/admin`/`/api/admin/*` — it is a single centralized pre-route gate, not a
   per-route call. **New architectural decision, made during this audit**: Unit 6's CSRF check
   will **not** extend `proxy.ts`'s matcher or branch its logic (that would couple an
   unauthenticated-by-Basic-Auth route family into the same gate file as the fully separate admin
   credential check, increasing coupling for no benefit). Instead, Unit 6 calls its own thin CSRF
   check **directly inside each mutating account route handler** — mirroring how
   `reportLookupLimiter` is already called per-route (`app/api/reports/route.ts`,
   `app/api/reports/access/route.ts`), not centrally. `proxy.ts` itself is untouched by this
   correction, satisfying "preserve Unit 3 admin behavior byte-for-byte" by construction (zero
   diff to that file).
8. **CHECK constraints on brand-new tables need no staged EXPAND/ENFORCE rollout** — Unit 5's
   staged migration pattern exists specifically for adding a constraint to an *existing* table with
   existing rows that old code might violate mid-rollout. `accounts`/`magic_link_tokens`/
   `account_sessions`/`account_order_links` are new tables with zero existing rows — the
   `magic_link_tokens_purpose_shape_valid` CHECK can be created directly in the `CREATE TABLE`
   statement, in one ordinary migration (`0006`, confirmed as the next free number via
   `src/db/migrations/meta/_journal.json`), exactly matching Unit 3's own precedent
   (`admin_action_log_reason_not_blank` was created inline with `admin_action_log`, no staged
   rollout, because that table was also new at the time). **No manual-migrations entry is needed
   for Unit 6.**
9. **Repository-layer (DB-touching) functions are tested only via `*.integration.test.ts`**,
   excluded from the deterministic suite and never run in this sandbox (confirmed via
   `tests/order-payment/repository.integration.test.ts` and this project's `vitest.config.ts`
   include/exclude patterns) — pure logic/decision functions are what the deterministic suite
   covers, using injected fakes (`credential.test.ts`'s `CredentialStore` fake is the exact model
   Unit 6's own token/session logic will reuse). This governs the test plan (§15) honestly: atomic
   SQL behavior (the `UPDATE ... RETURNING` statements, `ON CONFLICT` behavior, real transaction
   rollback) is integration-test-only, tracked open like every prior unit's DB-dependent behavior —
   not fabricated as deterministically verified.
10. **Vercel Firewall configuration mechanism — real, current documentation checked (2026-08-27), not
    assumed**: there is **no `vercel.json` declarative syntax** for a WAF rate-limit rule as of
    Vercel's current docs (`/docs/vercel-firewall/vercel-waf/rate-limiting`, last updated
    2026-06-16) — the two real, current mechanisms are the dashboard UI, and the scriptable
    `vercel firewall rules add`/`vercel firewall publish` CLI (`/docs/cli/firewall`, last updated
    2026-07-15). **Firewall configuration ownership decision**: the CLI is the smallest supported,
    scriptable mechanism.

    **Corrected per Part 1 review — scope narrowed from a blanket `/api/account` prefix to exactly
    the abuse-sensitive public auth/email endpoints**, using the CLI's `inc` ("is any of")
    condition operator (confirmed real and current in the fetched CLI docs' condition-operator
    table — array/comma-separated `value`, one condition, no invented syntax) so **one rule**
    covers the exact set without over-scoping onto ordinary authenticated account routes
    (report history/access, logout, deletion):
    ```bash
    vercel firewall rules add "Account Auth Rate Limit" \
      --condition '{"type":"path","op":"inc","value":["/api/account/request-login-link","/api/account/claim/email","/api/account/verify-login","/api/account/verify-claim"]}' \
      --action rate_limit \
      --rate-limit-window 60 --rate-limit-requests 10 --rate-limit-keys ip \
      --rate-limit-action deny --yes
    vercel firewall publish --yes
    ```
    This scope requires a **routing correction** made during this same review (§ Directory/File
    Plan, updated below): Path A (email-triggering, `claimPurchase`'s start call) and Path B
    (report-token claim, synchronous, not email-triggering) are now **two separate routes**
    (`/api/account/claim/email` and `/api/account/claim/token`) rather than one shared
    `/api/account/claim/start` route — a single shared route would have made it impossible for a
    path-based Firewall condition to protect Path A without also rate-limiting Path B's ordinary,
    already-authenticated traffic, which NFR-U6-37/38 never intended to cover (Path B is not one of
    the email-triggering endpoints those requirements name). This is a routing-granularity decision
    within Code Generation's own scope, not a reopening of any earlier Unit 6 design stage — the
    dual-path claim *design* (BR-U6-3, `business-logic-model.md` workflow 3) is unchanged; only how
    many HTTP routes implement it changes.

    Still **not** application source code — not committed as a script this repository runs
    automatically; documented as an operational step (Unit 6's own Operations runbook, written
    after Build & Test) and remains genuinely unexecuted until a real Vercel project/CLI session
    performs it — `external-verification-tracker.md` item 17 stays open, not fabricated closed.
    Confirmed real facts worth carrying into that runbook: rate-limit counters are tracked
    **per-region**, and the counting window range is 10s–10min on this project's Pro plan — both
    confirmed from the fetched documentation, not assumed.
11. **This schema declares zero real foreign-key constraints anywhere today** — `grep -n
    "\.references(" src/db/schema.ts` returns no matches. Every existing relationship in this
    project (`orders.screeningRequestId`, `evidenceReportArtifacts.screeningRequestId`,
    `reportAccessCredentials.reportArtifactId`, etc.) is a plain `uuid` column with referential
    integrity enforced only at the application layer — this has been safe in practice only because
    `Order`/`EvidenceReportArtifact` are immutable and this project has never performed a real
    multi-row `DELETE` before. **`deleteAccount` is this project's first real delete operation** —
    a genuine, disclosed reason to introduce Unit 6's 4 new tables as the **first tables in this
    schema to declare real FK constraints**, a deliberate departure from the existing convention,
    not a silent one. See §1/§3's corrected plan below for the exact constraints and `onDelete`
    actions chosen, and their justification against the founder's 4 binding invariants.

## Directory/File Plan

```
src/account-auth/                        <- NEW module
  types.ts                               Account, MagicLinkToken, MagicLinkPurpose,
                                          AccountSession, AccountOrderLink, PurchaseLinkMethod
  credential-adapter.ts                  thin re-exports/wrappers around report-access/credential.ts
                                          for account-specific CredentialStore shapes (no new crypto)
  token-repository.ts                    MagicLinkToken persistence: insert, atomic consume
                                          (LOGIN + CLAIM_PURCHASE variants)
  account-repository.ts                  Account find-or-create (ON CONFLICT DO NOTHING + SELECT),
                                          AccountSession insert/resolve/revoke
  link-repository.ts                     AccountOrderLink insert (ON CONFLICT DO NOTHING + SELECT),
                                          listByAccount, findByAccountAndOrder
  report-access.ts                       getAccountReport's Order -> EvidenceReportArtifact
                                          resolution (BR-U6-4 Mode B)
  workflows.ts                           requestLoginLink, verifyLoginLink, logout, claimPurchase
                                          (Path A start/complete, Path B), listReportHistory,
                                          getAccountReport, deleteAccount - orchestrates the
                                          repository functions above, no direct DB access itself
  csrf.ts                                thin caller of shared/same-origin.ts with the account
                                          trusted-origin resolver
  session.ts                             resolveAccountSession(request) - the shared per-request
                                          resolver every mutating/authorized route calls

src/shared/
  same-origin.ts                         NEW - extracted checkSameOrigin(request, expectedOrigin)
  cookies.ts                             MODIFIED - add ACCOUNT_SESSION_COOKIE constant only
  rate-limiter-instance.ts               MODIFIED - add accountAuthLocalLimiter export
  app-url.ts                             MODIFIED - add a non-admin-named trusted-origin export
                                          (thin, same logic resolveExpectedAdminOrigin already has)

src/admin-auth/csrf.ts                   MODIFIED - delegates to shared/same-origin.ts internally;
                                          resolveExpectedAdminOrigin() call site unchanged;
                                          behavior byte-for-byte identical (covered by existing
                                          csrf.test.ts, which must stay green unmodified)

src/db/schema.ts                         MODIFIED - append accounts, magic_link_tokens,
                                          account_sessions, account_order_links + the
                                          account_order_links(account_id) index
src/db/client.ts                         MODIFIED - add withAccountTransaction (mirrors
                                          withAdminTransaction exactly)
src/db/migrations/0006_*.sql             NEW - generated via drizzle-kit, one ordinary migration
src/email-delivery/                      MODIFIED - two new template-building helpers (login-link,
                                          claim-link), same sendEmail call, no adapter change

app/account/login/page.tsx               NEW
app/account/verify/page.tsx              NEW
app/account/claim/verify/page.tsx        NEW
app/account/page.tsx                     NEW
app/account/reports/[orderId]/page.tsx   NEW - Account Access route (BR-U6-4 Mode B), reuses the
                                          existing report view's rendering logic/components
app/api/account/request-login-link/route.ts   NEW
app/api/account/verify-login/route.ts         NEW
app/api/account/verify-claim/route.ts         NEW
app/api/account/claim/email/route.ts          NEW (Path A start ONLY - email-triggering, the
                                               Firewall-scoped endpoint per finding 10's correction)
app/api/account/claim/token/route.ts          NEW (Path B ONLY - report-token claim, synchronous,
                                               NOT Firewall-scoped, not email-triggering)
app/api/account/logout/route.ts               NEW
app/api/account/delete/route.ts               NEW
app/api/account/reports/route.ts              NEW (listReportHistory)
app/api/account/reports/[orderId]/route.ts    NEW (getAccountReport)

tests/account-auth/                      NEW directory, mirrors tests/report-access/'s split:
  token-repository.test.ts               deterministic - pure consume-outcome logic against a fake
  account-repository.test.ts             deterministic - pure find-or-create-outcome logic
  link-repository.test.ts                deterministic - pure conflict-outcome logic
  csrf.test.ts                           deterministic - mirrors admin-auth/csrf.test.ts exactly
  workflows.test.ts                      deterministic - orchestration logic against fakes
  *.integration.test.ts                  real DB behavior (ON CONFLICT, real transactions, real
                                          CHECK constraint) - NOT run in this sandbox, tracked open
tests/shared/same-origin.test.ts         NEW - deterministic, same cases as admin csrf.test.ts
tests/admin-auth/csrf.test.ts            UNCHANGED - must remain green with zero edits, proving the
                                          extraction preserved admin behavior byte-for-byte
tests/db/account-schema.test.ts          NEW - structural (CHECK constraint SQL text present,
                                          matching Unit 5's own db/*-migration-staging.test.ts style)
```

## Plan (checkboxes — Part 1 planning only, nothing executed yet)

### 1. Database Schema
- [ ] Add `accounts`, `magic_link_tokens` (+ `magic_link_tokens_purpose_shape_valid` CHECK),
      `account_sessions`, `account_order_links` (+ `account_order_links(account_id)` B-tree index)
      to `src/db/schema.ts`, matching `domain-entities.md`'s Drizzle definitions exactly.
- [ ] **Added per Part 1 review — explicit FK constraints (finding 11), this schema's first**:
      - `account_sessions.accountId` → `accounts.id`, **`ON DELETE CASCADE`** — a session is
        meaningless without its account; cascading only ever removes `account_sessions` rows,
        never reaches `orders`/`evidenceReportArtifacts` (invariant B/D satisfied by construction —
        this FK's table has no other outbound reference).
      - `magic_link_tokens.accountId` (nullable) → `accounts.id`, **`ON DELETE CASCADE`** — same
        reasoning; only ever removes `magic_link_tokens` rows. The `deleteAccount` transaction's own
        explicit step still separately deletes outstanding `LOGIN` tokens **by normalized email**
        (invariant C) — `LOGIN` tokens carry no `accountId` by the CHECK constraint's own shape, so
        no FK on `accountId` can ever reach them; this remains, and must remain, an application-level
        step with no FK equivalent.
      - `magic_link_tokens.orderId` (nullable) → `orders.id`, **`ON DELETE RESTRICT`** — the
        *reverse* direction from the two above: this FK can only ever **block** an `Order` deletion
        while a token still references it, never delete anything itself. Chosen over `CASCADE`
        deliberately, as an extra, disclosed data-integrity layer reinforcing RGD-4's existing
        "`Order` is never deleted" invariant at the database level, not merely by application
        convention. This FK has no relationship to account deletion at all (`accountId` and
        `orderId` are independent columns on the same row) — satisfies invariant D trivially.
      - `account_order_links.accountId` → `accounts.id`, **`ON DELETE CASCADE`** — same reasoning as
        `account_sessions`; the `deleteAccount` transaction already deletes these rows explicitly,
        this is defense-in-depth for any future code path that might delete an `Account` outside
        that transaction (invariant A).
      - `account_order_links.orderId` → `orders.id`, **`ON DELETE RESTRICT`** — same reasoning as
        `magic_link_tokens.orderId`; this table's entire purpose is proving an Account↔Order link
        exists, so an `Order` must never be deletable while a link to it still exists.
      - **Invariant B/D confirmed explicitly**: no FK declared here has `accounts` anywhere in its
        reference chain to `orders`, `evidenceReportArtifacts`, or `reportAccessCredentials` — the
        two tables referencing `orders.id` (`magic_link_tokens`, `account_order_links`) do so via
        `RESTRICT`, which can only prevent a deletion, never cause one, and is entirely independent
        of whichever `accountId` FK also happens to live on the same row.
      - **Invariant C confirmed explicitly**: these FKs are DB-level defense-in-depth only — the
        `deleteAccount` transaction (§11) remains the actual business operation, still performs
        every explicit step in its own defined order (needed regardless of FK behavior, since the
        LOGIN-tokens-by-email step has no FK equivalent and the transaction's atomicity/ordering
        guarantee is a workflow-level property no FK provides on its own).
- [ ] Generate migration `0006_*` via `drizzle-kit generate` — one ordinary migration, no staged
      EXPAND/ENFORCE split (finding 8), including the FK constraints above (also new-table-only,
      so no staged rollout risk applies to them either).
- [ ] Confirm **no** column is added to `orders`, `screeningRequests`, `evidenceReportArtifacts`,
      or `reportAccessCredentials` (per domain-entities.md's own explicit statement).
- [ ] Add `withAccountTransaction` to `src/db/client.ts`, structurally identical to
      `withAdminTransaction` (finding 2).

### 2. Account Auth Module
- [ ] Create `src/account-auth/` per the directory plan above — types, repositories, workflows,
      session resolver, CSRF caller — no generalized identity framework, every file scoped to one
      of the 5 approved workflows.

### 3. Magic-Link Transport
- [ ] `app/account/verify/page.tsx` and `app/account/claim/verify/page.tsx`, each a direct
      structural adaptation of `app/report/page.tsx`'s already-working fragment-read →
      `history.replaceState` → POST pattern (finding 3) — copy the mechanism, not the report-
      specific content.
- [ ] Server routes read `token` from the parsed JSON body only, hash immediately, never log the
      raw value (matches `app/api/reports/access/route.ts`'s own existing discipline exactly).

### 4. Atomic LOGIN
- [ ] `token-repository.ts`: `consumeLoginToken(db, tokenHash)` — the single conditional `UPDATE
      ... WHERE purpose = 'LOGIN' AND consumed_at IS NULL AND expires_at > now() RETURNING ...`.
- [ ] `account-repository.ts`: `findOrCreateAccount(tx, email)` — `INSERT ... ON CONFLICT (email)
      DO NOTHING RETURNING ...` + fallback `SELECT` (NFR Design Pattern 4).
- [ ] `workflows.ts`: `verifyLoginLink` composes both inside one `withAccountTransaction` call,
      plus `AccountSession` creation — rollback on any failure.

### 5. Claim by Email
- [ ] Path A start: requires a resolved `AccountSession`; reads `order.customerEmail` only, never
      client input; inserts a `CLAIM_PURCHASE` token bound to `(accountId, orderId)`.
- [ ] Completion (`completeClaimByEmail`): `consumeClaimToken(db, tokenHash, sessionAccountId)` —
      the account-bound conditional `UPDATE` (NFR Design Pattern 1, corrected); composed with
      `AccountOrderLink` creation inside one `withAccountTransaction` call; CSRF-checked (finding 7
      + NFR Design correction).

### 6. Claim by Report Token
- [ ] Path B: requires a resolved `AccountSession`; resolves the raw report token via the
      **existing, unmodified** `resolveByAccessToken`/`findArtifactIdByAccessToken`-equivalent
      lookup against `reportAccessCredentials`; joins to `orders` via
      `evidenceReportArtifacts.screeningRequestId` (finding 5's already-precedented join); never
      calls `rotateAccessCredential` or any other guest-credential-mutating function.
- [ ] **Corrected per Part 1 review**: the join's final step **requires `orders.state = 'PAID'`**,
      matching the approved Functional Design join exactly (`reportAccessCredentials.reportArtifactId
      → evidenceReportArtifacts.id → evidenceReportArtifacts.screeningRequestId →
      orders.screeningRequestId WHERE orders.state = 'PAID' → orders.id`) — the plan's Part 1 draft
      correctly named this filter in its own §6/§10 domain-entities.md quotes but the checklist item
      itself omitted it. A valid report-access credential whose `screeningRequestId` has no `PAID`
      `Order` (e.g. an `INTERNAL_PROTOTYPE` report, or any non-purchase generation path) resolves to
      **no eligible order** — `ORDER_NOT_FOUND`, never falling back to a non-`PAID` order — so it can
      never become an `AccountOrderLink`. The guest `reportAccessCredentials` row itself is never
      read as an authorization signal beyond resolving which artifact/screening-request it points
      to — it does not itself imply "this was purchased."
- [ ] Add deterministic/repository test coverage (§15) proving specifically: a valid, resolvable
      report credential whose `screeningRequestId` has zero `PAID` orders (only, say, an
      `INTERNAL_PROTOTYPE`-authorized generation with no `Order` row at all, or an `Order` still
      `PENDING`) returns `ORDER_NOT_FOUND` and creates no `AccountOrderLink` — this is the concrete
      case this correction exists to close.

### 7. AccountOrderLink Concurrency
- [ ] `link-repository.ts`: `INSERT ... ON CONFLICT (order_id) DO NOTHING RETURNING ...` +
      fallback `SELECT`, same-account → idempotent success, different-account →
      `ALREADY_LINKED_TO_ANOTHER_ACCOUNT`, never a silent transfer.

### 8. Account Session
- [ ] `account-repository.ts`: `createSession`/`resolveSession`/`revokeSession` against
      `account_sessions`, reusing `report-access/credential.ts`'s `generateAccessCredential`/
      `hashToken`/`resolveByAccessToken` unchanged.
- [ ] `shared/cookies.ts`: add `ACCOUNT_SESSION_COOKIE` constant only — `readCookie`/
      `buildSetCookieHeader`/`buildClearCookieHeader` reused verbatim (finding 4).
- [ ] `session.ts`: `resolveAccountSession(request)` — called by every account-scoped route,
      mirrors `report-access`'s existing resolve-on-every-request pattern.
- [ ] Logout: revokes the current session row, clears the cookie via `buildClearCookieHeader` in
      the response — never client-side.

### 9. Same-Origin CSRF Extraction
- [ ] Create `src/shared/same-origin.ts` — `checkSameOrigin(request, expectedOrigin)`, the exact
      logic currently inline in `src/admin-auth/csrf.ts`, parameterized.
- [ ] Modify `src/admin-auth/csrf.ts` to delegate to it, calling `resolveExpectedAdminOrigin()`
      exactly as before — **zero behavioral change**; `tests/admin-auth/csrf.test.ts` must pass
      unmodified as the proof.
- [ ] `src/account-auth/csrf.ts`: thin caller with its own trusted-origin resolver, applied
      per-route (finding 7) to: claim Path A start, claim Path B, `completeClaimByEmail`, logout,
      `deleteAccount` — not to `requestLoginLink` or `verifyLoginLink`.

### 10. Account Report Access
- [ ] `report-access.ts`: `getAccountReport(db, accountId, orderId)` — checks `AccountOrderLink`
      existence (the entire authorization check), then resolves
      `orders.screeningRequestId → evidenceReportArtifacts.screeningRequestId`, then hands the
      artifact id to the **existing, unmodified** report-rendering/retrieval code path.
- [ ] `app/account/reports/[orderId]/page.tsx` reuses the existing report view's presentational
      logic/components (not a rewrite of `app/report/page.tsx`) — exact reuse boundary to be
      confirmed against `app/report/page.tsx`'s own component structure during implementation.

### 11. Account Deletion
- [ ] `workflows.ts`: `deleteAccount(accountId)` inside one `withAccountTransaction` call —
      capture normalized email first, then delete sessions, `CLAIM_PURCHASE` tokens (by
      `accountId`), outstanding `LOGIN` tokens (by captured email), `AccountOrderLink` rows, the
      `Account` row — in that order, matching `business-logic-model.md` workflow 5.
- [ ] Confirm zero statement targets `orders`, `evidenceReportArtifacts`, `reportAccessCredentials`,
      or `admin_action_log` (no `AdminActionType` addition — BR-U6-6/Q5's own explicit instruction).
- [ ] Response clears `ACCOUNT_SESSION_COOKIE` via `buildClearCookieHeader`.

### 12. Rate Limiting
- [ ] `shared/rate-limiter-instance.ts`: add `accountAuthLocalLimiter`, a second
      `FailedLookupRateLimiter` instance, kept separate from `reportLookupLimiter`.
- [ ] Apply it in existing failure-counting mode to `verify-login`/`verify-claim`; apply it in an
      every-attempt-counts mode (call `recordFailure` unconditionally) to `request-login-link` and
      claim Path A's start call.
- [ ] Document (not code) the corrected, narrowly-scoped Vercel Firewall CLI command per finding
      10 (the `inc`-operator, exact-4-path rule — not a blanket `/api/account` prefix), as an
      operational step for this unit's own Operations runbook (not part of this Code Generation
      pass — Build & Test/Operations come after, per standard stage sequencing) — no
      Redis/CAPTCHA/vendor. Split `claim/email` (Path A) and `claim/token` (Path B) into separate
      routes so the rule can protect only the email-triggering endpoint (§ Directory/File Plan).

### 13. Email Delivery
- [ ] Two new small template-building functions (login-link, claim-link subject/html/text),
      calling the existing `sendEmail` unchanged — no adapter modification.
- [ ] Preserve `SENT` (provider-accepted) vs. inbox-delivery distinction in all copy/comments,
      matching Unit 2B's own established language.

### 14. UI
- [ ] Exactly the 7 routes named in the directory plan — no profile/preferences/OAuth/password/
      save-resume UI, per `frontend-components.md`'s own explicit "not built" list.

### 15. Test Plan
- [ ] **Deterministic** (run in this sandbox, must pass): token purpose-isolation/single-use/
      expiry logic (pure functions against fakes, mirroring `credential.test.ts`); LOGIN/claim
      account-binding decision logic; `AccountOrderLink` conflict-outcome decision logic (same-
      account idempotent vs. different-account rejection, as pure functions given a simulated
      conflict); `shared/same-origin.ts` (mirrors `admin-auth/csrf.test.ts` exactly); `admin-auth/
      csrf.test.ts` unmodified and green (proves the extraction is behavior-preserving);
      `accountAuthLocalLimiter` behavior (mirrors `report-access/rate-limiter.test.ts`); cookie
      helper usage (no new logic to test — reused verbatim); generic-response/no-oracle assertions
      (`requestLoginLink`/`completeClaimByEmail` response shape identical across outcomes, as a
      structural/source-inspection test where a full request cycle isn't deterministically
      constructible); full existing Unit 1-5 suite remains green (regression).
- [ ] **Integration** (written, added to the existing excluded/non-blocking suite, **not run in
      this sandbox** — no `DATABASE_URL`, honestly tracked open exactly like every prior unit's DB-
      dependent behavior, finding 9): real atomic `UPDATE ... RETURNING` execution and concurrent-
      consumption race behavior; real `ON CONFLICT DO NOTHING RETURNING` + `SELECT` behavior for
      both `accounts.email` and `account_order_links.order_id`, including a genuine concurrent-
      insert race; real `withAccountTransaction` rollback-on-failure; real CHECK constraint
      rejection of a malformed `magic_link_tokens` row; real `account_order_links(account_id)`
      index existence (`\d` / `pg_indexes` inspection); real Account Access report resolution
      end-to-end (session → link → artifact); real deletion transaction leaving Order/
      EvidenceReportArtifact/reportAccessCredentials byte-for-byte unmodified. **Added per Part 1
      review**: a report-access credential whose `screeningRequestId` has no `PAID` `Order`
      produces `ORDER_NOT_FOUND` and creates no link (correction 1, §6); real FK integrity/delete
      behavior (correction 3, §1) — `account_sessions`/`magic_link_tokens`(`accountId`)/
      `account_order_links`(`accountId`) rows are actually removed when their `Account` row is
      deleted directly at the DB level (proving the `CASCADE` declarations, independent of the
      application `deleteAccount` transaction); attempting to delete an `Order` referenced by an
      outstanding `magic_link_tokens.orderId` or `account_order_links.orderId` row is **rejected**
      by the database (proving the `RESTRICT` declarations).
- [ ] **Not covered by any automated test in this pass, honestly disclosed** (new
      `external-verification-tracker.md` items, added at Build & Test time, not fabricated here):
      the real Vercel Firewall rule's live behavior (item 17, already open); a full browser-level
      claim-flow smoke test (this project's existing pattern of accepting this gap for new customer
      journeys pending a founder decision on component-testing infrastructure, items 4/14/16).

## Genuine Incompatibilities Found

**None.** Every mechanism this plan specifies (interactive transactions, `ON CONFLICT`, CHECK
constraints on new tables, fragment-to-POST, cookie helpers, the rate limiter class, the CSRF core)
already has a working precedent in this exact codebase on this exact stack (Next.js 16.3.3,
`drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `@neondatabase/serverless`) — confirmed by direct
version/code inspection, not assumed. No earlier Unit 6 stage is reopened; the repository audit
exposed no security/data-integrity/architectural contradiction with what Functional Design, NFR
Requirements, NFR Design, or Infrastructure Design already approved.

---

**Part 1 is APPROVED.** Proceeding directly to Part 2 implementation — see the Part 2 section below
once generation is complete.

## Part 2 — Generation COMPLETE (2026-08-27)

All 15 checkbox items above executed. **Verification**: `npm run typecheck` — 0 errors.
`npm test` — **323/323 passing** (312 pre-existing unchanged + 11 new), including
`tests/admin-auth/csrf.test.ts` passing **unmodified**, the proof the shared same-origin extraction
preserved admin behavior byte-for-byte. `npm run build` — clean production build, all 14 new
routes registered (verified directly in the build's own route table output, matching this
project's own established discipline of confirming route registration by inspection, not
assumption).

**All three Part 1 corrections implemented as specified**:
1. `account-auth/report-access.ts`'s `resolveOrderByReportToken` requires `orders.state = 'PAID'`
   in its join — a credential whose screening request has no `PAID` order resolves to
   `ORDER_NOT_FOUND`, never falls back to a non-`PAID` order. Real integration coverage added.
2. Firewall scope corrected to the exact-4-path `inc`-operator rule; `claimPurchase` split into two
   separate routes (`app/api/account/claim/email`, `app/api/account/claim/token`) so the rule can
   protect Path A without also covering Path B's ordinary traffic.
3. `src/db/schema.ts`'s 4 new tables carry real FK constraints — `CASCADE` on every `accountId`
   reference, `RESTRICT` on every `orderId` reference — this schema's first real foreign keys.
   Real integration coverage added for both directions.

**A real migration-generation defect was caught and fixed during this pass**: `drizzle-kit
generate` bundled two unrelated, already-applied CHECK constraints (Unit 5's
`regulatory_rules_applicability_scope_valid`/`screening_requests_workflow_shape_valid`, applied via
a manual out-of-journal migration and never captured by a tracked snapshot) into the generated
`0006_glamorous_firestar.sql`. Hand-corrected by removing those two statements — mirroring this
project's own established precedent for a bad `drizzle-kit` generation (Unit 5's own 0005/0006
sequencing fix) — with a full inline explanation left in the migration file itself.

**Disclosed scope limitations** — see `code/code-generation-summary.md` for the complete list; the
two worth restating here: the Vercel Firewall rule remains unconfigured against any real project
(item 17, open, not fabricated); the account-scoped report view is a deliberately minimal
standalone rendering, not a fully shared component with the guest report view.

Repository context packaged (`npm run package:context`) at the normal implementation-review
handoff. Presenting the generated implementation for founder review.
