# Unit 3: Minimum Paid-Product Operations — Code Generation Plan

**Status: Part 1 APPROVED 2026-08-25**, with 3 corrections applied before Part 2 begins — (1) the
existing `recordIngestionResult` contract is wired into the 2 already-implemented authoritative
retrieval paths (`parcel-resolution`/`report-generation-orchestrator`), not left permanently
uncalled; (2) `AdminActionLog.reason` is `NOT NULL` with boundary + DB-level non-empty validation,
and the admin refund route's body distinguishes the machine-readable `RefundReason` from the
operator's free-text `justification`, never conflating the two; (3) rule lifecycle transitions
(ADM-7) use a concurrency-safe conditional `UPDATE ... WHERE lifecycle_state = <expected>` as the
actual persistence correctness boundary, not an unconditional update following a stale read — see
Steps 2, 5, 7, and 10 below, each updated in place. Proceeding directly to Part 2 (Generation).

**Post-generation correction batch (2026-08-25)**: a full-repository review (of the actual
generated code, via the new `package:context` archive) found 5 further ADM-story/security gaps —
ADM-5 rewritten to a body-based search removing `customerEmail` from URLs plus a response-
minimization DTO, ADM-1 made report-ID-native, ADM-4 completed with Order correlation, ADM-2
completed plus a real pre-existing `approvalRecord` gap closed, ADM-3 given static cadence
metadata — applied without redesigning Unit 3. Full detail: `aidlc-state.md`'s "Full-Repository
Review Corrections" entry and the code README.

**Design consumed**: all approved Functional Design, NFR Requirements, and NFR Design artifacts for
Unit 3 (`aidlc-docs/construction/unit-3-minimum-paid-product-operations/`), corrected per the
founder's two Functional Design corrections (AdminActionLog atomicity; DataSourceHealth
observed/override/effective split) and the framework-version correction (Next.js 16, `proxy.ts`).
Infrastructure Design was skipped (approved) — no new infrastructure. Extends Unit 1/2/2B code
unchanged except where explicitly noted below.

**Assigned stories**: ADM-1 through ADM-8. ADM-9/Support Case remains deferred to Unit 9.

**Governing invariant, restated for this stage**: `AdminActionLog` is attribution/audit history
only — it never becomes, and never substitutes for, the authoritative record of `Order`/
`RegulatoryRule`/`DataSourceHealth` state. The database transaction (for the 4 local mutations) and
the audit-commit-before-`start()` sequencing (for `REFUND_INITIATED`) are what make "no unaudited
apparent success" true, not `AdminActionLog`'s mere existence.

**Ground truth checked before writing this plan** (so nothing below is speculative):
- `src/data-source-registry/index.ts`'s `DataSourceRegistry` is used via one process-wide singleton
  (`src/shared/data-source-registry-instance.ts`), consumed by exactly 2 call sites:
  `src/screening-request/authorization.ts`'s `checkReadiness` (via `isKnownUnhealthy`) and
  `src/checkout-fulfillment/index.ts`'s `initiateCheckout` (same). Both callers are already `async`
  functions, so making `isKnownUnhealthy` (and therefore `checkReadiness`) async to read from the
  database is a contained change with exactly 2 call sites to update.
- **Corrected**: `recordIngestionResult` is defined but was never called anywhere in this codebase
  before this plan. The founder's review overruled treating that as out-of-scope: the approved
  Functional/NFR Design's `observedHealthState`/`effectiveHealthState` semantics are not actually
  implemented if nothing ever calls it — `observedHealthState` would stay permanently `UNKNOWN`
  forever, which is not what was approved. **Wiring is now in scope, narrowly**: the two existing
  authoritative retrieval paths for the two ids already in `REQUIRED_SOURCE_IDS_FOR_SHED` —
  (1) `"king-county-gis"`: `src/parcel-resolution/index.ts`'s `resolveByAddress`/
  `resolveByIdentifier` already return `ParcelResolutionStatus.RESOLUTION_UNAVAILABLE` precisely
  when the underlying King County `RetryResult` was `EXHAUSTED` (confirmed by reading
  `resolve.ts`'s branches — this status is a reliable, already-computed failure signal, not
  something that needs re-deriving); recorded at `app/api/parcels/resolve/route.ts`, the existing
  boundary that already has `db` available, immediately after `resolveByAddress` returns, as a
  best-effort side effect (caught/logged, never allowed to fail or alter the actual resolution
  response — this is observability, not a correctness-critical path). (2) `"king-county-parcel-
  polygon"`: `src/report-generation-orchestrator/pipeline.ts` already computes `propertyContext`
  via `assemblePropertyContext` and already has `db` in scope; after assembly, the
  `"parcel-geometry-available"` fact's `availabilityState` (`AVAILABLE` vs `SOURCE_ERROR`) is read
  via the existing `getFact` helper and recorded, same best-effort discipline. Neither
  `src/property-intelligence/assemble.ts` nor `src/parcel-resolution/index.ts` themselves are
  modified — both stay pure/DB-free, preserving their existing deterministic testability; recording
  happens only at the two orchestration boundaries that already hold a `db` reference. (Corroborating
  evidence this wiring was always intended, not new scope: `PropertyFact` already has an unused
  optional `sourceHealthAtRetrieval` field — a forward-looking *read* hook Unit 1/2 defined but
  never populated, mirroring `recordIngestionResult`'s unused *write* hook. Populating that read
  field is **not** part of this correction — it is a separate, not-yet-approved enhancement and
  stays out of scope here.) No polling, scheduled checks, synthetic probes, or new source coverage
  (e.g. no zoning-source retriever exists to wire — only the two already-implemented ones are
  touched).
- `src/db/client.ts`'s `withFulfillmentTransaction` is explicitly commented as "the ONLY place in
  the application that should call this function... exclusively for BR-U2B-15's atomic
  payment-fulfillment sequence." Rather than rename/repurpose it (touching Unit 2B code and every
  existing call site for no functional reason), Unit 3 adds a **new**, structurally identical
  function (`withAdminTransaction`) — same Pool-open/use/close-within-one-call discipline, scoped to
  Unit 3's 4 atomic admin mutations. Unit 2B's function and its call sites are untouched.
- `src/regulatory-rule-governance/lifecycle.ts` has no DB-persistence layer today — rules are read
  via one inline `db.select().from(regulatoryRules)...` query in
  `src/report-generation-orchestrator/pipeline.ts` (untouched by this plan) and mutated only via
  pure functions operating on an in-memory `RegulatoryRule` object. The `lifecycle_state` DB enum
  **already includes `"DISABLED"`**, with an existing comment: *"Acknowledged for domain-model
  compatibility only — transition/tooling is Unit 3 (ADM-7)."* No schema/migration change needed
  for the enum itself.
- `processRefundWorkflow(orderId, reason: RefundReason)` already accepts `RefundReason.
  CUSTOMER_REQUEST`/`GOODWILL` and is already started via the exact pattern ADM-6 needs
  (`start(processRefundWorkflow, [orderId, reason])`) from 3 existing call sites
  (`checkout-fulfillment/index.ts`, `reconciliation.ts`, `app/api/webhooks/stripe/route.ts`). Its
  own docstring already anticipated "(b) an internal-only manual-refund trigger... never an HTTP
  route" as a planned-but-not-yet-built caller — ADM-6 is that caller. No change to
  `order-payment/repository.ts`'s `processRefund` or `refund-workflow.ts` themselves.
- `app/api/cron/reconcile/route.ts` establishes this codebase's existing shared-secret Bearer-header
  auth pattern — a useful **contrast**, not a template: Cron's is a single static secret with no
  attribution concept, whereas Unit 3's admin gate needs Basic Auth (interactive, browser-usable)
  plus separate `ADMIN_OPERATOR_ID` attribution (BR-U3-0a) and CSRF validation (Pattern 3) — a
  materially different mechanism, not a copy.

## Steps

1. [x] **Dependencies** — none. Confirmed zero new npm packages needed (NFR Requirements'
   `tech-stack-decisions.md` headline finding, unaffected by anything discovered while writing this
   plan).

2. [x] **Database Schema Extension** (`src/db/schema.ts`, migration regenerated) —
   - `adminActionLog` table: `id` (uuid pk), `operatorId` (text, not null — `ADMIN_OPERATOR_ID` at
     the time of the action), `actionType` (new `adminActionTypeEnum`: `REFUND_INITIATED`,
     `RULE_DISABLED`, `RULE_REENABLED`, `DATA_SOURCE_MARKED_UNHEALTHY`,
     `DATA_SOURCE_OVERRIDE_CLEARED`), `targetType` (new `adminTargetTypeEnum`: `ORDER`,
     `REGULATORY_RULE`, `DATA_SOURCE`), `targetId` (text — a rule/order id is a uuid but a data
     source id is not, so this is `text` not `uuid`), **`reason` (text, `NOT NULL` — corrected: every
     Unit 3 mutating operator command requires a non-empty human justification; this is enforced at
     the application boundary via `validateAtBoundary`/a non-empty-after-trim check before any
     `recordAdminAction` call, and the column itself is `NOT NULL` so the database also refuses a
     null — a `CHECK (length(trim(reason)) > 0)` constraint is used too, matching this schema's
     existing partial-unique-index style of enforcing invariants at the DB level, not only in
     application code)**, `metadata` (jsonb, nullable — holds `{refundReason: RefundReason}` for
     `REFUND_INITIATED` rows only), `createdAt` (timestamp, not null, default now). No `updatedAt` —
     append-only, never updated after insert.
   - `dataSourceHealth` table: `sourceId` (text, primary key — matches
     `REQUIRED_SOURCE_IDS_FOR_SHED`'s string ids, not a uuid), `observedHealthState` (new
     `sourceHealthStateEnum`: `HEALTHY`/`UNHEALTHY`/`UNKNOWN`, not null, default `UNKNOWN` — written
     only by `recordIngestionResult`), `lastSuccessfulRetrieval` (timestamp, nullable),
     `lastFailureAt` (timestamp, nullable), `lastFailureReason` (text, nullable),
     `manualOverrideState` (`sourceHealthStateEnum`, nullable — written only by admin actions),
     `updatedAt` (timestamp, not null, default now, updated on every write to either half).
   - `regulatoryRules.lifecycleState`: no enum change (`DISABLED` already present, confirmed above).
   - Migration regenerated via `drizzle-kit generate`, never applied to a live DB in this sandbox
     (no `DATABASE_URL`) — same discipline as every prior unit. Reviewed by hand for compatibility
     with existing Unit 1/2/2B data (both new tables are purely additive; no existing table's shape
     changes; no backfill needed since both tables start empty).

3. [x] **Database Client — Admin Transaction Helper** (`src/db/client.ts`, additive) —
   `withAdminTransaction<T>(fn)`: opens a `neon-serverless` `Pool`, runs `fn` inside one real
   Drizzle transaction, closes the Pool before returning — structurally identical to
   `withFulfillmentTransaction`, its own separate function (Unit 2B's function and every existing
   call site untouched). Scoped in its own docstring to Unit 3's 4 atomic admin mutations
   (`RULE_DISABLED`/`RULE_REENABLED`/`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED`)
   — never `REFUND_INITIATED`, which uses Pattern 5's audit-commit-before-`start()` sequencing
   instead (a single ordinary `getDb()` write, no transaction needed for one statement).

4. [x] **Admin Action Log** (`src/admin-action-log/`, new module) — `types.ts`
   (`AdminActionType`/`AdminTargetType` consts matching this codebase's `const...as const` pattern,
   mirroring the DB enums); `repository.ts` — `recordAdminAction(tx, entry)` (insert-only, takes
   either a plain `Db` for the standalone `REFUND_INITIATED` write or a `TransactionalDb` for the 4
   atomic mutations — same `Db`/`TransactionalDb` duck-typing Unit 2B's `handleVerifiedWebhook`
   already relies on). No read/update/delete function is built — append-only, and this unit has no
   "view the audit log" story (ADM-1 through ADM-8 never require reading `AdminActionLog` back).

5. [x] **Data Source Registry — Persisted Replacement** (`src/data-source-registry/`, replaced
   internals, same conceptual API) — `repository.ts` (new): `getSourceHealth(db, sourceId)`
   (get-or-default-`UNKNOWN` read, upserting a row for unknown source ids on first touch so an
   operator can override a never-yet-queried source per the known-source-initialization
   requirement), `isKnownUnhealthy(db, sourceId)` (reads `effectiveHealthState =
   manualOverrideState ?? observedHealthState`), `recordIngestionResult(db, sourceId, outcome)`
   (writes only `observedHealthState`/`lastSuccessfulRetrieval`/`lastFailureAt`/`lastFailureReason`
   — never touches `manualOverrideState`, and does **not** early-return when an override is active,
   unlike Unit 1's original in-memory version — the corrected model keeps observing even under
   override), `setManualOverride(tx, sourceId, state)`/`clearManualOverride(tx, sourceId)` (write
   only `manualOverrideState`; both called from Unit 3's admin route inside
   `withAdminTransaction`, never standalone), `listUnhealthySources(db)` (reads effective state).
   `index.ts`'s exported `SourceHealthState` const and its 3 values are unchanged (no breaking
   rename for existing importers). `src/shared/data-source-registry-instance.ts`'s module-level
   singleton is **removed** (the exact Vercel-incompatibility this replacement fixes — a
   process-local `Map` is invisible across serverless invocations). Its 1 remaining importer
   (`app/api/checkout/route.ts`) is updated to call the new `repository.ts` functions with a `Db`
   instance instead of importing a singleton instance.

   **Corrected — wire the existing `recordIngestionResult` contract into the 2 already-implemented
   authoritative retrieval paths** (founder-directed; narrowly scoped, no new source coverage, no
   polling/scheduled checks/synthetic probes):
   - `app/api/parcels/resolve/route.ts` (modified): after `const result = await
     resolveByAddress(body.address)`, record `"king-county-gis"` health — `SUCCESS` unless
     `result.status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE` (confirmed via `resolve.ts`
     that this status is returned exactly when the underlying King County `RetryResult` was
     `EXHAUSTED` — a reliable, already-computed failure signal, not re-derived), in which case
     `FAILURE` with `result.unavailabilityDetail.failureNature` as the reason. Wrapped in
     `try/catch`, logged via the existing `logger` on failure to record — a health-recording error
     never changes or blocks the actual resolution response returned to the caller (best-effort
     observability, not a correctness-critical path). `src/parcel-resolution/index.ts` itself is
     **not** modified — stays pure/DB-free, preserving its existing deterministic testability.
   - `src/report-generation-orchestrator/pipeline.ts` (modified): after `propertyContext =
     await assemblePropertyContext(...)`, read the `"parcel-geometry-available"` fact via the
     existing `getFact` helper and record `"king-county-parcel-polygon"` health — `SUCCESS` if
     `availabilityState === AvailabilityState.AVAILABLE`, `FAILURE` (generic, truthful reason —
     `assemble.ts`'s `SOURCE_ERROR` path does not carry the raw underlying error message, and
     `assemble.ts` is not modified to add one) otherwise. Same best-effort try/catch/log discipline
     — never turns a failed generation pipeline into a false "healthy" recording, and never lets a
     health-recording failure fail report generation itself. `src/property-intelligence/assemble.ts`
     is **not** modified — stays pure/DB-free.
   - Not populated by this correction: `PropertyFact.sourceHealthAtRetrieval` (an existing, unused,
     forward-looking *read* field — populating it from the registry before a retrieval attempt is a
     separate, not-yet-approved enhancement, out of scope here).

6. [x] **`checkReadiness`/`initiateCheckout` — Async Data-Source Check** (`src/screening-request/
   authorization.ts` and `src/checkout-fulfillment/index.ts`, modified) — `checkReadiness` becomes
   `async`, taking `db: Db` instead of a `DataSourceRegistry` instance, calling the new
   `isKnownUnhealthy(db, sourceId)`. Both existing call sites (`authorizeReportGeneration` in the
   same file, `initiateCheckout` in `checkout-fulfillment/index.ts`) are already `async` functions
   and already have a `db` in scope — each call site adds one `await` and passes `db` instead of a
   registry instance. No behavioral change to BR-U2-1/BR-U2B-1's readiness logic itself, only its
   storage backend, matching the Functional Design correction's own scope.

7. [x] **Regulatory Rule Governance — Persistence + Disable/Re-Enable** (`src/regulatory-rule-
   governance/`) — `lifecycle.ts` (modified, additive only): `disable(rule)`/`reenable(rule)`,
   matching `activate(rule)`'s exact shape (`LifecycleResult<RegulatoryRule>`, no reason/attribution
   parameter on the pure function itself — attribution is `AdminActionLog`'s job per Q5).
   `disable`: legal only from `ACTIVE` (rejects otherwise, matching `activate`'s own rejection
   style). `reenable`: legal only from `DISABLED`, and only for **the exact rule row being
   re-enabled** (no version substitution possible through this path — enforced structurally, since
   the function takes and returns the same `RegulatoryRule` object, never constructs a new version).
   `repository.ts` (new): `getRuleById(db, id)`, `listRules(db, filters?)` (for ADM-5's version
   history read).

   **Corrected — concurrency-safe conditional transition, not read-then-unconditional-UPDATE-by-id**
   (founder-directed): `repository.ts`'s `transitionLifecycleState(tx, id, {from, to})` issues
   `UPDATE regulatory_rules SET lifecycle_state = ${to} WHERE id = ${id} AND lifecycle_state =
   ${from}` and returns whether **exactly one row** transitioned (Drizzle's `.returning()` on the
   conditional `UPDATE`, checked for a non-empty array) — the database's own `WHERE` clause is the
   concurrency-correctness boundary, not an application-level read-then-write. The admin route's
   full sequence, all inside one `withAdminTransaction` call: (1) read the current row; (2) call the
   existing pure `lifecycle.ts` `disable(rule)`/`reenable(rule)` — kept and unit-tested as the
   domain-rule expression (legal-transition logic, still exercised exactly like `activate`'s
   existing tests); (3) if the pure function itself rejects, return the domain rejection immediately
   — no DB write attempted; (4) otherwise call `transitionLifecycleState` with the exact
   `{from, to}` pair the pure function validated; (5) if it reports zero rows transitioned (a
   concurrent/stale request already changed the row between step 1's read and this transaction —
   the pure function's step-2 check was correct for what it read, but reality moved under it), treat
   this as an invalid/stale-transition conflict: **do not** call `recordAdminAction`, and the route
   returns a `409`-style conflict response, not a `200`; (6) only if `transitionLifecycleState`
   reports exactly one row transitioned does `recordAdminAction` run, inside the same transaction —
   either both the transition and the audit entry commit, or (on any later failure in the same
   transaction) neither does. No locks, distributed coordination, or new infrastructure — Postgres's
   own `WHERE`-clause row match is the entire mechanism, the same kind of database-level guarantee
   `orders`' partial unique indexes already rely on elsewhere in this codebase.

   `src/report-generation-orchestrator/pipeline.ts`'s existing inline `regulatoryRules` query is
   untouched — it already filters `lifecycleState = 'ACTIVE'`, which correctly and automatically
   excludes any rule an admin disables, with zero code change required there.

8. [x] **Admin Read Additions** (small, additive functions on existing repositories — no new
   modules, no behavior change to existing functions):
   - `src/order-payment/repository.ts`: `findOrdersByCustomerEmail(db, email)` (ADM-1 — exact,
     normalized-case-insensitive match per Q6, no substring/wildcard).
   - `src/report-generation-job/repository.ts`: `getReportGenerationJobsByScreeningRequestId(db,
     screeningRequestId)` (ADM-1/ADM-2 correlation), `listFailedJobs(db)` (ADM-4, read-only —
     confirmed no corresponding retry function is added anywhere in this unit).
   - `src/evidence-report-artifact/index.ts`: no change needed — `getReportById` already supports
     ADM-2's provenance read.

9. [x] **Admin Authentication & CSRF Gate** (`proxy.ts`, new, project root) — `export function
   proxy(request)` per Pattern 1/Pattern 2/Pattern 3 exactly as specified in NFR Design's
   `nfr-design-patterns.md`: matcher `["/admin", "/admin/:path*", "/api/admin",
   "/api/admin/:path*"]`; fail-closed if `ADMIN_BASIC_AUTH_USERNAME`/`ADMIN_BASIC_AUTH_PASSWORD` are
   not both configured; fixed-length-digest (`crypto.createHash("sha256")`) comparison of each
   credential component via `crypto.timingSafeEqual`; uniform `401` + `WWW-Authenticate: Basic
   realm="admin"` for every failure mode; malformed headers never logged. For mutating
   (`POST`/`PUT`/`PATCH`/`DELETE`) `/api/admin/*` requests only: same-origin check via a new
   `resolveExpectedAdminOrigin()` in `src/shared/app-url.ts` (additive — extends, does not modify,
   `resolveAppBaseUrl()`), exact-match `Origin` (falling back to strictly-parsed `Referer` origin
   only when `Origin` absent), `Sec-Fetch-Site` defense-in-depth, generic `403` on failure. No
   runtime declaration needed (Next.js 16 fixes `proxy` to Node.js).

10. [x] **Admin API Routes** (`app/api/admin/`, new) — each route reads `ADMIN_OPERATOR_ID` at the
    top and fails closed (`401`) if blank/absent, independent of `proxy.ts` having already
    authenticated the request (BR-U3-0a). **Every mutating route below additionally validates a
    trimmed, non-empty `reason`/`justification` string at the request boundary before any
    `recordAdminAction` call — a missing or whitespace-only value is a `400`, never silently
    defaulted.** ADM traceability labels corrected per review:
    - `GET /api/admin/orders?email=`/`GET /api/admin/orders/[orderId]` (**ADM-5** — order
      lookup/search) — exact-match search, order detail with correlated job/artifact/access-
      credential/refund state. The access-credential correlation surfaces only operational metadata
      — whether a credential exists, its active/revoked status, creation/revocation timestamps —
      never the raw token or a token hash; ADM-1 through ADM-8 never require sending credential
      material to the browser.
    - `GET /api/admin/reports/[jobId]/provenance` (**ADM-1** — report evidence/provenance) —
      evidence/citation/data-source attribution for one report, read-only.
    - `GET /api/admin/rules`/`GET /api/admin/rules/[ruleId]` (**ADM-2** — rule/version inspection) —
      version/lifecycle history, read-only.
    - `GET /api/admin/data-sources` (ADM-3) — lists every known source's
      observed/override/effective state distinctly.
    - `GET /api/admin/failed-jobs` (ADM-4) — read-only, no action endpoint of any kind (confirmed:
      no `POST`/retry route exists anywhere under this path).
    - `POST /api/admin/orders/[orderId]/refund` (ADM-6) — **corrected body shape, distinguishing
      the machine-readable `RefundReason` from the operator's human justification**: `{refundReason:
      "CUSTOMER_REQUEST"|"GOODWILL", justification: string}` (`justification` is the required
      non-empty-after-trim reason). Sequencing (Pattern 5, exact): validate `ADMIN_OPERATOR_ID` →
      validate `justification` → `recordAdminAction(getDb(), {actionType: "REFUND_INITIATED",
      reason: justification, metadata: {refundReason}, ...})`, awaited to commit → only then
      `start(processRefundWorkflow, [orderId, refundReason])` — the free-text `justification` is
      **never** passed into Unit 2B's `RefundReason` parameter; only the closed-choice
      `refundReason` value is. Does not call `processRefund` directly, does not touch
      `order-payment`/`refund-workflow.ts`.
    - `POST /api/admin/rules/[ruleId]/disable`/`POST /api/admin/rules/[ruleId]/reenable` (ADM-7) —
      body: `{reason: string}` (non-empty after trim, validated at the boundary). Inside one
      `withAdminTransaction`, per Step 7's corrected sequence: the pure `disable`/`reenable`
      function, then the conditional `transitionLifecycleState` (`WHERE lifecycle_state =
      <expected>`), and — only if exactly one row transitioned — `recordAdminAction`. Zero rows
      transitioned → `409` conflict response, no audit entry written.
    - `POST /api/admin/data-sources/[sourceId]/override` (set) / `POST /api/admin/data-sources/
      [sourceId]/override:clear` (ADM-8) — **corrected: both require a body, neither is empty.**
      Set: `{state: "HEALTHY"|"UNHEALTHY", reason: string}`. Clear: `{reason: string}` (clearing
      still requires a non-empty justification — it is still an operator command, even though its
      effect is "revert to the current observed value" rather than setting a new one). Same
      atomic-transaction pattern as rule disable/re-enable (domain mutation + `recordAdminAction`
      inside one `withAdminTransaction`) — no conditional-transition guard needed here (unlike rule
      lifecycle, override set/clear has no "one legal prior state" to violate; any state may be
      overridden or cleared at any time, per the approved Functional Design).

11. [x] **Admin Frontend** (`app/admin/`, new) — matching `frontend-components.md`'s 4-section
    design exactly: `app/admin/orders/page.tsx` + `[orderId]/page.tsx` (`AdminOrderSearch`/
    `AdminOrderDetail`, `RefundActionForm` with the closed `CUSTOMER_REQUEST`/`GOODWILL` choice
    never a raw dropdown), `app/admin/rules/page.tsx` + `[ruleId]/page.tsx`
    (`AdminRuleList`/`AdminRuleDetail`, `RuleLifecycleActionForm` rendering Disable OR Re-Enable,
    never both, with the static "this never edits content" reminder on Re-Enable),
    `app/admin/data-sources/page.tsx` (`AdminDataSourceList`, `DataSourceOverrideForm` showing
    observed/override/effective distinctly, clearing shown as taking effect immediately),
    `app/admin/failed-jobs/page.tsx` (`FailedJobDetail` — no action control of any kind, not even a
    disabled-looking button). Plain Next.js pages/forms, no new UI dependency. Desktop-focused,
    resilient layout per NFR-U3-7 (no fixed desktop-only widths, tables scroll horizontally).

12. [x] **Environment Variables** (`.env.example`, additive) — `ADMIN_BASIC_AUTH_USERNAME`,
    `ADMIN_BASIC_AUTH_PASSWORD` (documented as requiring high-entropy generation, never a memorable
    phrase), `ADMIN_OPERATOR_ID`. No existing variable's meaning or classification changes.

13. [x] **Fixture/Test Data** — a small fixture for constructing `Authorization: Basic ...` headers
    in tests; no fake external-service client needed (Unit 3 calls no new external service).

14. [x] **Deterministic Test Suite** — `disable`/`reenable`'s legal-transition rejections (matching
    `activate`'s existing test style); `DataSourceHealth`'s observed/override/effective derivation,
    explicitly including the founder's own worked example (automated=HEALTHY, override=UNHEALTHY,
    clear override, effective immediately reverts to HEALTHY — the exact case the original design
    got wrong); `recordIngestionResult` continuing to update `observedHealthState` while an override
    is active (never early-returning); `proxy.ts`'s constant-time comparison and uniform-failure
    behavior (malformed header, wrong username, wrong password, both wrong — all identical `401`);
    CSRF same-origin validation (exact-match acceptance/rejection, including the
    `evil-example.com`-does-not-match-`example.com` case from NFR Requirements); `ADMIN_OPERATOR_ID`
    fail-closed independent of successful Basic Auth; the atomic-transaction rollback behavior for
    all 4 local mutations (fault-injected, mirroring Unit 2B's `withFulfillmentTransaction` rollback
    test style); `REFUND_INITIATED`'s audit-commit-before-`start()` sequencing (a fault injected
    between the two steps proves the audit row persists even when `start()` never runs); exact-match
    email search (no substring/case-sensitivity leakage); **corrected — the 5 founder-specified
    data-source-health-recording cases**: (1) a successful retrieval updates `observedHealthState`
    to `HEALTHY` plus `lastSuccessfulRetrieval`; (2) a failed retrieval updates it to `UNHEALTHY`
    plus `lastFailureAt`/`lastFailureReason`; (3) automated recording continues (does not
    early-return) while `manualOverrideState` is set; (4) `effectiveHealthState` stays the manual
    override's value despite a new contradicting observation; (5) clearing the override immediately
    exposes the latest already-recorded observed value (no wait for a future ingestion); **and — the
    rule-lifecycle conflict path**: a conditional `transitionLifecycleState` call against a row whose
    `lifecycle_state` no longer matches the expected `from` value (simulated stale/concurrent
    request) affects zero rows, and the test asserts no `AdminActionLog` row is written for that
    attempt; **and — `AdminActionLog.reason`**: an empty or whitespace-only `reason`/`justification`
    is rejected at the boundary before any DB write is attempted, for every one of the 4 mutating
    routes (refund, disable, re-enable, override-set, override-clear).

15. [x] **Integration Test Suite** — extend the existing `DATABASE_URL`-gated suite: `AdminActionLog`
    round-trip; `DataSourceHealth` upsert/read round-trip including the known-source-initialization
    path (overriding a source with no prior row); the 4 atomic mutations' real-transaction rollback
    against a live Neon connection (mirroring `tests/order-payment/repository.integration.test.ts`'s
    existing fault-injection style for `withFulfillmentTransaction`).

16. [x] **CI** (`.github/workflows/integration.yml`, modified if any new integration test needs its
    own gating credential — expected: none, since Unit 3 introduces no new external service; the new
    DB-backed integration tests reuse the existing `DATABASE_URL` gate already present for every
    prior unit's DB tests). `.github/workflows/ci.yml`'s blocking checks unchanged in kind, now also
    covering this unit's new deterministic tests.

17. [x] **Documentation** — `aidlc-docs/construction/unit-3-minimum-paid-product-operations/code/
    README.md`, following Unit 1/2/2B's established format (what was built, defects found and fixed
    during real testing, what remains open per the external-verification tracker — expect at least
    "live Basic Auth credential behind a real deployment" and "live CSRF same-origin check against a
    real production origin" as new tracker items, matching every prior unit's honest-open-until-
    proven discipline).

## Note on Live Execution

This sandbox has no `DATABASE_URL`, `ADMIN_BASIC_AUTH_USERNAME/PASSWORD`, `ADMIN_OPERATOR_ID`, or a
real Vercel deployment — every DB-backed integration test and every live-CSRF/live-Basic-Auth check
is written to skip cleanly without credentials/a real origin, exactly like every prior unit's
external-verification items (to be tracked as new `external-verification-tracker.md` items once
Code Generation completes). Deterministic tests exercise `proxy.ts`'s logic via direct function
calls (constructing `Request` objects in-process), not a real HTTP round-trip against a real
deployment. `npm run typecheck`, `npm test`, and `npm run build` are run and must pass before this
stage is considered complete, matching every prior unit's standard.
