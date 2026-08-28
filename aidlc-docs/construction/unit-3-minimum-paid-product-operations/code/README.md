# Unit 3: Minimum Paid-Product Operations — Code Summary

ADM-1 through ADM-8, built exactly per the approved Functional Design / NFR Requirements /
NFR Design, the 3 founder corrections applied during Code Generation's Part 1 review, and the
full-repository review correction batch applied afterward (see below). No new infrastructure, no
new npm dependencies.

**Corrected wording (2026-08-25 full-repository review)**: this README previously claimed "zero
Unit 2B files touched," which was inaccurate — Unit 3 DID add small, additive read helpers to
existing Unit 2B files (`order-payment/repository.ts`'s `findOrdersByCustomerEmail`,
`report-access/repository.ts`'s `listAccessCredentialSummaries`). The accurate claim is: **Unit 2B
payment/refund correctness machinery and workflows were not changed** —
`order-payment/repository.ts`'s `createCheckoutSession`/`handleVerifiedWebhook`/`processRefund`,
`refund-workflow.ts`, and `db/client.ts`'s `withFulfillmentTransaction` are all unmodified, along
with every existing call site of those functions.

## Running It

Requires (in addition to every prior unit's env vars): `ADMIN_BASIC_AUTH_USERNAME`,
`ADMIN_BASIC_AUTH_PASSWORD`, `ADMIN_OPERATOR_ID` (see `.env.example`). None of these are required
for `npm run typecheck`, `npm test`, or `npm run build`. The admin UI lives at `/admin` behind
`proxy.ts`'s Basic Auth gate — a browser will show its native credential prompt.

## ADM-6 — Admin Refund Preserves REFUND_PENDING Resumability (2026-08-25 correction)

A final full-repository review caught a real regression against the approved Unit 3 Functional
Design and Unit 2B's existing refund state machine: the admin order-detail page originally gated
the refund action on `order.state === "PAID"` only, which would have silently blocked an operator
from resuming an already-in-flight refund. Corrected:

- **Sole state-validation authority**: `src/order-payment/admin-refund.ts`'s
  `decideAdminRefundCommand` calls the existing, unmodified `decideRefundAction(order.state)` —
  never a duplicated copy of Unit 2B's state machine. `PAID` → `CLAIM_AND_SUBMIT` (a genuinely new
  refund command); `REFUND_PENDING` → `RESUME_AND_SUBMIT` (resuming the SAME logical refund
  already in flight, using the Order's own already-persisted `refundReason`/
  `refundIdempotencyKey` — the client can never substitute a different reason); every other state →
  rejected with `409`, before any `AdminActionLog` write or `start()` call.
- **Precise recovery-path distinction** (documentation precision, founder-directed): if `start()`
  genuinely fails *before* the Workflow ever receives the command, the Order remains `PAID` and the
  operator can simply retry from the `PAID` (new-refund) path shown above — Cron plays no role
  here. If execution actually reached `REFUND_PENDING` and the submission/resumption subsequently
  stalls, Unit 2B's *existing* Cron reconciliation check (unchanged) can recover it. The
  `REFUND_PENDING` Cron check never recovers an Order that never left `PAID` — those are two
  different failure modes with two different recovery paths, and this document does not conflate
  them.
- **No fabricated terminal state**: after a successful `start()`, the admin UI reloads the
  authoritative Order rather than claiming `REFUNDED` — only a verified Stripe webhook produces
  that. The UI copy is "Refund command accepted; confirmation is pending."

## What's Implemented (by component)

- **`src/admin-auth/`** (new) — `credential-check.ts` (constant-time comparison),
  `basic-auth.ts` (Pattern 1/2), `csrf.ts` (Pattern 3), `operator.ts` (`ADMIN_OPERATOR_ID`
  attribution + `reason`/`justification` non-empty validation). Factored out of `proxy.ts` so it's
  exercised via direct function calls in deterministic tests, not only a real HTTP round-trip.
- **`proxy.ts`** (new, project root) — this project's first pre-route interception file. Next.js
  16 convention (`export function proxy`, not the deprecated `middleware.ts`). Matcher: `/admin`,
  `/admin/:path*`, `/api/admin`, `/api/admin/:path*` only.
- **`src/admin-action-log/`** (new) — `types.ts`, `repository.ts`'s insert-only `recordAdminAction`.
  `reason` is `NOT NULL` with a DB-level `CHECK(length(trim(reason)) > 0)` in addition to
  application-boundary validation (2026-08-25 correction — the original plan had this nullable).
- **`src/data-source-registry/`** (replaced internals, same conceptual API) — persisted via a new
  `dataSourceHealth` table instead of the old process-local `Map` singleton
  (`src/shared/data-source-registry-instance.ts`, removed). `observedHealthState`/
  `manualOverrideState` are two independent fields; `effectiveHealthState` is derived, never
  stored. `src/screening-request/authorization.ts`'s `checkReadiness` and
  `src/checkout-fulfillment/index.ts`'s `initiateCheckout` are now `async` to read it.
- **Data-source health recording, wired in** (2026-08-25 correction — the original plan left
  `recordIngestionResult` permanently uncalled): `app/api/parcels/resolve/route.ts` records
  `"king-county-gis"` health after each resolution attempt; `src/report-generation-orchestrator/
  pipeline.ts` records `"king-county-parcel-polygon"` health after property intelligence assembly.
  Both are best-effort (caught/logged, never block the actual response) and neither modifies
  `src/parcel-resolution/index.ts` or `src/property-intelligence/assemble.ts`, which stay
  pure/DB-free.
- **`src/regulatory-rule-governance/`** — `lifecycle.ts` gains `disable()`/`reenable()`, matching
  `activate()`'s exact shape. `repository.ts` (new) adds `getRuleById`/`listRules` plus the
  concurrency-safe `transitionLifecycleState` (conditional `UPDATE ... WHERE lifecycle_state =
  <expected>`, 2026-08-25 correction — the original plan was read-then-unconditional-write, which
  permitted a stale/concurrent request to appear to succeed). `admin-lifecycle.ts` (new) ties the
  pure function, the conditional transition, and `recordAdminAction` together inside one
  `withAdminTransaction` call.
- **Admin read additions** — `order-payment/repository.ts`'s `findOrdersByCustomerEmail`
  (exact-match only), `report-generation-job/repository.ts`'s
  `getReportGenerationJobsByScreeningRequestId`/`listFailedJobs`/`getJobByEvidenceReportArtifactId`/
  `resolveOrderIdFromAuthorization` (pure), `report-access/repository.ts`'s
  `listAccessCredentialSummaries` (operational metadata only — never a raw token or token hash).
- **`src/order-payment/admin-view.ts`** (new, 2026-08-25 full-repository-review correction) — the
  *only* place an `Order` is narrowed to `AdminOrderView` for the admin browser. Every
  `app/api/admin/orders/*` route returns this DTO, never a raw `Order` —
  `checkoutCreationIdempotencyKey`, `refundIdempotencyKey`, and `stripeCheckoutSessionId` (a
  low-scope bearer capability elsewhere in this app) never reach the admin browser.
- **`src/data-source-registry/known-sources.ts`** (new, 2026-08-25 correction) — a small static
  `expectedRefreshCadence` definition per known source (`ON_DEMAND` for both currently-integrated
  sources) for ADM-3. Not a new table, not scheduled polling.
- **`app/api/admin/*`** (12 routes) — see `app/api/admin/**/route.ts`. Every mutating route
  validates a non-empty `reason`/`justification` at the boundary and requires `ADMIN_OPERATOR_ID`,
  independent of `proxy.ts`'s Basic Auth having already succeeded (BR-U3-0a). The refund route's
  body is `{refundReason, justification}` — the free-text justification is never passed into
  Unit 2B's `RefundReason` parameter. Data-source override "set" only accepts `UNHEALTHY` (the
  `AdminActionType` vocabulary the founder approved in Functional Design never named a "mark
  healthy" override action). **Corrected 2026-08-25**: order search is now `POST
  /api/admin/orders/search` (`{kind: "orderId"|"email"|"reportId", value}`) — the old `GET
  /api/admin/orders?email=` is gone, since `customerEmail` is PII that must never sit in a URL;
  the provenance route is now `GET /api/admin/reports/[reportId]/provenance`, keyed by
  `EvidenceReportArtifact.id` directly — the old `[jobId]`-keyed route is gone.
- **`app/admin/*`** (4-section UI) — plain Next.js pages/forms per `frontend-components.md`.
  **Corrected 2026-08-25**: `AdminOrdersPage` now has a kind selector (order ID / email / report
  ID) and POSTs to the search endpoint, never building a URL with the searched value;
  `AdminRuleDetail` now renders citation/SMC sections/ordinance number/effective date/tier/
  verification history (including Tier-2 professional review detail)/approval provenance/lifecycle
  state (DISABLED vs SUPERSEDED explicitly distinguished)/version chain; `AdminFailedJobsPage` now
  shows `retryAttempts`/timestamps and links to the affected Order (or truthfully shows none for
  an `INTERNAL_PROTOTYPE` job); `AdminDataSourcesPage` now shows each source's expected cadence.

## `RegulatoryRule.approvalRecord` — a real pre-existing gap closed (2026-08-25)

Found during the full-repository review, not part of any prior stage's approved design:
`approve(rule, founderIdentity, acceptedEvidenceQuality)` required a `founderIdentity` parameter
but never persisted it, and no approval timestamp was persisted either — so ADM-2 could not
truthfully answer "who approved this rule, and when?" Added
`RegulatoryRule.approvalRecord?: { founderIdentity: string; approvedAt: string }` (schema column +
migration `0004_curly_zuras.sql`, purely additive/nullable). `approve()` now takes `approvedAt` as
an explicit parameter (kept deterministic — no internal clock call) and sets `approvalRecord`.
Deliberately never inferred from `verificationHistory`, `updatedAt`, or `lifecycleState` — those
are different facts; a pre-existing rule with no `approvalRecord` shows "not recorded," never a
fabricated value. No general event-sourcing/audit framework was introduced; published regulatory
content immutability is unchanged.

## Corrections Applied During Code Generation Part 1 Review (2026-08-25)

See `aidlc-docs/audit.md`'s "Code Generation Part 1 APPROVED With 3 Corrections" entry for the
founder's full message. Summary: (1) wired the previously-uncalled `recordIngestionResult`
contract into the 2 already-implemented retrieval paths; (2) made `AdminActionLog.reason` `NOT
NULL` and split the refund route's machine-readable `refundReason` from the operator's free-text
`justification`; (3) made rule-lifecycle transitions concurrency-safe via a conditional DB `UPDATE`
rather than a read-then-unconditional-write.

## Corrections Applied During Full-Repository Review (2026-08-25)

See `aidlc-docs/audit.md`'s corresponding entry for the founder's full message (reviewed the actual
generated repository via the `package:context` archive, not only the Code Generation summary).
Summary: (1) ADM-5 rewritten to a body-based `POST /api/admin/orders/search`, removing
`customerEmail` from any URL, plus the new `AdminOrderView` response-minimization DTO; (2) ADM-1
made report-ID-native; (3) ADM-4 completed with `retryAttempts`/timestamps/Order correlation; (4)
ADM-2 completed (citation/verification/version-chain UI) and the `approvalRecord` gap closed; (5)
ADM-3 given static expected-cadence metadata, no new infrastructure. Plus 2 documentation
corrections (the "zero Unit 2B files touched" and "22 new tests" claims — both wrong, corrected
above and in `aidlc-state.md`).

## Final Correction: ADM-6 Refund Resumability (2026-08-25)

A second, narrower full-repository review (of the archive regenerated after the batch above) found
one more regression: `AdminOrderDetailPage` only permitted a refund command from `PAID`, silently
dropping Unit 2B's existing `REFUND_PENDING` resumability. See the dedicated "ADM-6" section near
the top of this document for the fix (`decideAdminRefundCommand`, using the existing
`decideRefundAction` as the sole authority) and the precise Cron-vs-retry-from-PAID recovery-path
distinction the founder required. This was the last outstanding issue — Unit 3 Code Generation is
now **APPROVED**.

## Deliberately Not Built (explicit scope exclusions, reaffirmed)

Admin accounts, RBAC, OAuth, session auth, a new queue, Redis, outbox/event sourcing, new refund
states, FAILED-job retry, fuzzy customer search, a mobile-specific admin UI, any new npm
dependency, scheduled source polling or synthetic health checks, a general event-sourcing/audit
framework. `ADM-9`/Support Case remains deferred to Unit 9. `PropertyFact.sourceHealthAtRetrieval`
(an existing, unused, forward-looking *read* field) is not populated by this unit — that is a
separate, not-yet-approved enhancement.

## Remaining External Verification (carried into Build & Test, not fabricated)

This sandbox has no `DATABASE_URL`, `ADMIN_BASIC_AUTH_USERNAME`/`PASSWORD`, `ADMIN_OPERATOR_ID`, or
a real Vercel deployment. New items for `aidlc-docs/operations/external-verification-tracker.md`:

- Live Basic Auth credential behavior against a real deployment (uniform-failure timing, header
  handling) confirmed only by deterministic function-call tests here, not a real HTTP round-trip.
- Live same-origin CSRF check against a real production origin (`VERCEL_URL`/`APP_BASE_URL`
  resolution in an actual deployed environment).
- Every `*.integration.test.ts` file added this unit (`data-source-registry`, `admin-action-log`,
  `regulatory-rule-governance/repository`, `order-payment/admin-search`) — written, never
  executed, gated on `DATABASE_URL` like every prior unit's DB-backed suite.
- The two `recordIngestionResult` wiring points, exercised against real King County traffic in a
  real deployment (this sandbox's deterministic/integration tests cover the logic, not a live
  network round-trip through the actual deployed route).
