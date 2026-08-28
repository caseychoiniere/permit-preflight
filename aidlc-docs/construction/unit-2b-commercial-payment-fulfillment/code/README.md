# Unit 2B: Commercial Payment & Fulfillment — Code Summary

Implements PO-0 through PO-5 and ACC-1 (guest checkout only), per the approved Functional Design,
NFR Requirements/Design, and Infrastructure Design — including the 2026-08-24 founder-driven
platform pivot from Railway to Vercel and its Workflow-Start Idempotency correction, and the two
material corrections applied during Code Generation Part 1 review (refund resumability,
`INTERNAL_PROTOTYPE` route removal). First commercial unit: real Stripe Checkout, real guest
(no-account) purchase flow, real automatic refunds, real durable execution via Vercel Workflows.

## Running It

```bash
npm install
npm run typecheck            # tsc --noEmit
npm test                      # deterministic suite - no network/DB/credentials required
npm run build                 # production Next.js build (also compiles Workflow SDK bundles)
npm run dev                   # local dev server
npm run generate-prototype-report -- <screeningRequestId> <authorizedBy>   # INTERNAL_PROTOTYPE, CLI-only
npm run test:integration      # live Neon/Stripe-test-mode/Anthropic/King County - see below
```

**Result as of this session**: typecheck clean; `npm test` **153/153 passing** across 27 files
(includes 28 new Unit 2B deterministic tests, 12 of them added in the 2026-08-25 post-review pass
below); `npm run build` succeeds — all routes compile, static pages generate, **and the Workflow
SDK's own build-time manifest correctly registers both `reportGenerationWorkflow`/
`processRefundWorkflow` and all 5 of their step functions** (verified by inspecting
`.next/diagnostics/workflows-manifest.json` directly — see "Defects Found and Fixed" below for a
real bug this caught). A new migration, `0002_hot_colleen_wing.sql` (regenerated 2026-08-25 to
also capture the corrected `orders_screening_request_id_paid_unique` predicate), has been generated
but never applied to a live database in this sandbox — same discipline as every prior migration.
`npm run test:integration`'s new Unit 2B suites are written, typecheck-clean, and **not executed in
this sandbox** (no `DATABASE_URL`/`STRIPE_SECRET_KEY` provisioned) — same standing discipline as
every prior unit's live-integration tests.

## What's Implemented (by component)

| Component | Files | Notes |
|---|---|---|
| Order & Payment | `src/order-payment/` | `types.ts` (`OrderState`, `RefundReason`, `GuestOrderStatus`), `stripe-client.ts` (Stripe SDK adapter), `repository.ts` (`createCheckoutSession`'s resumable state machine, `handleVerifiedWebhook`'s atomic fulfillment + duplicate-payment-anomaly path, `processRefund`'s corrected state machine via the pure `decideRefundAction`) |
| GenerationAuthorization Extension | `src/screening-request/authorization.ts` | `VERIFIED_PAYMENT` added as a discriminated-union sibling to `INTERNAL_PROTOTYPE` |
| Checkout & Fulfillment | `src/checkout-fulfillment/` | `initiateCheckout` (readiness + purchase-lock snapshot + delegates to order-payment), `getGuestStatus` (Pattern 4), `handleGenerationOutcome` (guest delivery / auto-refund dispatch), `reconciliation.ts` (Cron backstop, 4 checks) |
| Email Delivery | `src/email-delivery/resend-client.ts` | Single adapter function, mirrors `stripe-client.ts`'s shape |
| Report Access Extension | `src/report-access/repository.ts` | `deliverGuestReportAccess` (always rotates), `listStaleGuestDeliveries` (Cron backstop) |
| Vercel Workflows | `src/workflows/` | `report-generation-workflow.ts` (`reportGenerationWorkflow`), `refund-workflow.ts` (`processRefundWorkflow`) — both thin orchestrators wrapping existing domain logic in `"use step"` functions |
| PDF Rendering | `src/report-pdf-rendering/render.ts` | `renderPdfBytes` reimplemented on `puppeteer-core` + `@sparticuz/chromium` (was Playwright) — Vercel's read-only filesystem can't support Playwright's runtime browser download |
| Database | `src/db/schema.ts` | `orders`, `processed_stripe_events` tables; additive `delivery_status`/`delivery_attempts`/`last_delivery_attempt_at` on `report_access_credentials`; two partial unique indexes enforcing BR-U2B-1 |
| Database Client | `src/db/client.ts` | Two-driver strategy: `neon-http` (default, cached) + `neon-serverless` `Pool` scoped entirely within `withFulfillmentTransaction()` |
| Next.js Routes | `app/api/webhooks/stripe/`, `app/api/checkout/`, `app/api/checkout/status/[sessionId]/`, `app/api/cron/reconcile/` | Exactly the 3 public BR-U2B-9 routes plus the Cron backstop — `INTERNAL_PROTOTYPE` is **not** among them |
| INTERNAL_PROTOTYPE Trigger | `scripts/generate-prototype-report.ts` | Server-only CLI, never a deployed route — runs the pipeline directly (not via `start()`; see below) |
| Frontend | `app/configure/page.tsx`, `app/checkout/status/page.tsx` | `/configure`'s final step now redirects to a real Stripe Checkout Session; new polling status page (Workflow 4 copy) |
| Deleted (superseded) | `instrumentation.ts`, `src/report-generation-orchestrator/poller.ts`, `app/api/screening-requests/[id]/authorize/` | The Railway in-process poller and its bootstrap, and the old public authorize route — all explicitly superseded per the platform-pivot ADR, not carried forward as dead code |

## The Corrected Refund State Machine (BR-U2B-5)

`decideRefundAction(orderState)` is a pure, DB-less function isolating the single most
safety-critical fact in this unit: `REFUND_PENDING` is **resumable** (`RESUME_AND_SUBMIT`), never a
dedup-exit. `processRefund` (DB/Stripe I/O) and `refund-workflow.ts`'s `submitRefundStep` both call
into this same logic — the workflow is a thin durable wrapper, not a second implementation. This is
the exact bug the 2026-08-24 founder review caught in the original design (see the ADR and the
Code Generation plan's status banner for full detail) — `tests/order-payment/refund-decision.test.ts`
asserts it directly, and `tests/order-payment/repository.integration.test.ts` proves it end-to-end
against a real Postgres database, including a genuine concurrent-claim race
(`Promise.all` of two `processRefund` calls on the same `PAID` order) and a simulated
lost-Stripe-response resumption — both assert the exact same `refundIdempotencyKey` is reused
across every submission attempt.

## Vercel Workflows: What Runs as a Step vs. the Workflow Body

Workflow functions (`"use workflow"`) run in a sandboxed VM with no Node.js/database access — all
of this unit's actual I/O (database queries, Stripe calls, Resend calls) lives in small `"use
step"` wrapper functions inside `report-generation-workflow.ts`/`refund-workflow.ts`, each a thin
call into the already-existing, already-tested repository/pipeline functions. `createHook` +
`hook.getConflict()` are used as defense-in-depth duplicate-run detection only, exactly as the
corrected Infrastructure Design specifies — never the correctness mechanism (that's
`claimQueuedJob`'s atomic claim and `decideRefundAction`'s state machine, both pure database
conditionals).

## Defects Found and Fixed During This Session

1. **[Real, build-verified bug] The Workflow SDK's build-time workflow-discovery scanner does not
   resolve this codebase's `.js`-extension-pointing-at-a-`.ts`-file import convention** — found by
   actually inspecting `.next/diagnostics/workflows-manifest.json` after `npm run build`, not
   assumed from documentation. With `import { reportGenerationWorkflow } from
   "../workflows/report-generation-workflow.js"`, the build succeeded with **zero errors** but
   silently registered **0 workflows** (`"Compiled workflows in 367ms (15 steps, 0 workflows)"` —
   the 15 steps were entirely the SDK's own internal `Run#*`/`start`/builtin steps, none of this
   application's). This is exactly the kind of defect that produces a passing build and a broken
   production system: `start(reportGenerationWorkflow, ...)` would have silently failed or behaved
   unpredictably at runtime, since the SDK never transformed that function into a registered
   workflow. Webpack itself resolves the `.js`→`.ts` mapping fine (via this project's custom
   `next.config.mjs` `extensionAlias`), but the Workflow SDK's own discovery pass does its own,
   separate module resolution that does not go through that same webpack config. **Fixed**: every
   import of `src/workflows/report-generation-workflow.ts` / `refund-workflow.ts` (from
   `app/api/webhooks/stripe/route.ts`, `checkout-fulfillment/index.ts`,
   `checkout-fulfillment/reconciliation.ts`) now omits the `.js` suffix, with an inline comment
   explaining why this one case deviates from the codebase's otherwise-universal convention.
   Re-verified: the manifest now correctly registers both workflows and all 5 step functions with
   a fully-formed execution graph (start → `createHook` → steps → end, matching the intended
   design exactly).
2. **The CLI `INTERNAL_PROTOTYPE` trigger cannot safely call `start()` on a Vercel Workflow** —
   caught during the same investigation as (1). `start()` is designed to be called from within the
   same Next.js app build that registered the workflow (an API route, Server Action, etc.);
   `scripts/generate-prototype-report.ts` runs standalone under `tsx`, entirely outside that
   build/registration process, so calling `start()` from it would exercise an untested,
   likely-broken cross-context path. **Fixed**: the CLI script runs the pipeline directly
   (`claimQueuedJob` + `runReportGenerationPipeline`, both already-existing, already-tested
   functions) instead of going through the Workflow SDK at all — a deliberate, disclosed scope
   choice appropriate for a rare, manually-run, single-operator action that doesn't need
   Workflow-SDK-grade durability (a crash mid-pipeline leaves the job `IN_PROGRESS`, recoverable
   via the existing `reclaimStaleJob` mechanism on a later manual run).
3. **`handlePaymentConfirmed`'s original duplicate-payment-anomaly design would have aborted the
   entire atomic transaction on the very unique-violation it exists to detect** — found while
   implementing BR-U2B-1 point 4, not by the founder review. A naive `UPDATE ... SET paidAt = now()
   WHERE state = 'PENDING'` that hits the `orders_screening_request_id_paid_unique` partial index
   throws inside the surrounding Postgres transaction, which by default poisons the *entire*
   transaction (including the ledger write) until rolled back — meaning the webhook would appear
   to fail, Stripe would redeliver it, and it would fail identically forever, never reaching the
   intended duplicate-payment-anomaly handling at all. **Fixed**: the risky `UPDATE` is wrapped in
   a nested `tx.transaction()` (a Postgres `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` under the hood),
   isolating the failure so the outer transaction survives and can proceed into the
   duplicate-anomaly path (mark this Order `REFUND_PENDING` with `refundReason: DUPLICATE_PAYMENT`,
   record the ledger entry, signal the caller to start `processRefundWorkflow`). See item 5 below
   for the 2026-08-25 correction to what that duplicate-anomaly `UPDATE` actually writes to
   `paidAt`.
4. **Two `npm audit` findings in this unit's new dependencies, reviewed and judged non-blocking**:
   (a) `puppeteer-core` → `@puppeteer/browsers` → `extract-zip` symlink path traversal
   (GHSA-jmr9-qjv8-65gv) — not exercised by this application, since `@sparticuz/chromium` supplies
   the Chromium binary directly and `puppeteer-core`'s own downloader is never invoked; (b)
   `workflow` SDK → `@workflow/core` → `nanoid` non-secure-generator DoS (GHSA-28wg-ghj8-5hjv) —
   the SDK's internal ID generation is not fed attacker-controlled sizes in this application's
   usage. Neither vulnerable code path is reachable here; both are disclosed rather than silently
   ignored, matching Unit 2's established `drizzle-orm` SQL-injection precedent.
5. **[Founder-identified, 2026-08-25 post-Code-Generation review] Two corrections applied after
   the code-review pass above**: (a) the placeholder `DEFAULT_REPORT_PRICE_CENTS = 4900` ($49.00)
   was never a real pricing decision and has been corrected to the founder-approved current price,
   `999` ($9.99), with `getReportPrice()`'s `REPORT_PRICE_CENTS` override now validated by a strict
   digits-only regex rather than `Number.parseInt`/`Number()` coercion — those would have silently
   accepted malformed values like `"999abc"` (truncated) or `" 999 "`/`"9.99e2"` (coerced) instead
   of failing closed; (b) the duplicate-payment anomaly path described in item 3 originally left
   the duplicate Order's `paidAt` `NULL` forever specifically to satisfy
   `orders_screening_request_id_paid_unique` — the founder review correctly identified this as an
   auditability defect, not a clever workaround: Stripe genuinely confirmed that second payment, and
   falsifying the record to look like it never happened is worse than the constraint violation it
   was avoiding. **Fixed**: the partial unique index's predicate was narrowed from `paidAt IS NOT
   NULL` to `paidAt IS NOT NULL AND refundReason IS DISTINCT FROM 'DUPLICATE_PAYMENT'` (migration
   `0002_hot_colleen_wing.sql`), so the invariant is now precisely "at most one **canonical**
   (non-duplicate) paid Order per screeningRequestId" rather than the physically-untrue "at most one
   Order may ever have had a payment confirmed." The duplicate-anomaly `UPDATE` now sets `paidAt`
   and `stripePaymentIntentId` for real, in the same statement that classifies the row
   `refundReason: DUPLICATE_PAYMENT` — which is exactly what excludes it from the (now-narrower)
   index, so the write no longer collides with the constraint it just lost the race for.
   `getPaidOrder()` (the `ALREADY_PAID`/reuse check inside `createCheckoutSession`) was corrected to
   match — it now explicitly excludes `DUPLICATE_PAYMENT` rows, since a duplicate row having a real
   `paidAt` would otherwise let it satisfy that check too.

## Disclosed Testing-Strategy Note (Deterministic vs. Integration Split)

The approved Code Generation plan's step 16 lists several scenarios (checkout-session
concurrency/resumability, webhook ledger dedup, the atomic fulfillment transaction, the
duplicate-payment anomaly, and the refund state machine's crash-recovery behavior) under
"Deterministic Test Suite." Every one of Unit 1/2's existing `Db`-touching repository functions is,
in this codebase's own established precedent, tested exclusively via credential-gated
`*.integration.test.ts` files against a real Neon database (`tests/db/unit2-schema.integration.test.ts`
is the exact template) — no repository function has ever been tested against a hand-built fake
Drizzle `Db` here, and building one for this unit risked giving false confidence about real
Postgres partial-unique-index/transaction behavior that only a real database can actually prove.
**Resolution taken**: the single most safety-critical fact this unit corrects — that
`REFUND_PENDING` must resume, never dedup-exit — was extracted into a pure, DB-less function
(`decideRefundAction`) specifically so it could be a genuinely deterministic, blocking test
(`tests/order-payment/refund-decision.test.ts`), plus Stripe webhook-signature verification, which
is a local/offline HMAC computation and is also genuinely deterministic
(`tests/order-payment/webhook-signature.test.ts`, using Stripe's own `generateTestHeaderString`
testing utility — no network call, no real API key needed). Every other DB-shaped scenario from
step 16 was written as a live-Neon integration test instead
(`tests/order-payment/repository.integration.test.ts`), consistent with how every other
repository-layer function in this codebase is verified, and using a **fake** `StripeClient`
(`tests/fixtures/fake-stripe-client.ts`) so only `DATABASE_URL` — never `STRIPE_SECRET_KEY` — is
needed to run them. This is a disclosed, reasoned deviation from the plan's literal
test-file-placement, not a silently-skipped scenario — every scenario the plan named is written and
typecheck-clean somewhere in the suite.

## Deliberately Deferred / Not Built

- ~~A real founder pricing decision~~ — **resolved 2026-08-25**: `checkout-fulfillment/types.ts`'s
  `DEFAULT_REPORT_PRICE_CENTS` is now `999` ($9.99), the founder-approved current price — still
  overridable via `REPORT_PRICE_CENTS`/`REPORT_CURRENCY` env vars (fail-closed on a malformed
  value) without a code change if it changes again later, per BR-U2B-12.
- **Customer accounts, subscriptions, multi-currency, non-card payment methods, an Admin/Support
  UI for manual refunds** — explicitly out of scope (BR-U2B-7's manual refund path exists as a
  callable function, not a UI).
- **Live proof of PDF rendering on an actual Vercel deployment** — `@sparticuz/chromium` is
  Linux-only; `tests/report-pdf-rendering/render.integration.test.ts` now runs for real on Linux CI
  but has never been proven against a real Vercel Function's actual filesystem/memory constraints.
  Tracked as `external-verification-tracker.md` item 10, unchanged from the platform-pivot ADR.

## Remaining External Verification (carried into Build & Test, not fabricated)

- `tests/order-payment/repository.integration.test.ts` needs a real `DATABASE_URL` — written,
  typecheck-clean, not executed in this sandbox.
- `tests/order-payment/stripe-live.integration.test.ts` needs a real Stripe **test-mode**
  `STRIPE_SECRET_KEY` — written, typecheck-clean, not executed in this sandbox.
- A real deployed Vercel Workflow run (durable suspend/resume across real crashes/deploys, real
  Cron-triggered reconciliation, real Stripe webhook delivery) has never been observed — this
  session's build-time verification (the workflow-manifest bug fix above) proves the SDK
  *registers* this unit's workflows correctly, not that a real deployed run behaves as designed.
  Tracked as `external-verification-tracker.md` items 9 and 10.
- See `aidlc-docs/operations/external-verification-tracker.md` for the full, cross-unit list.
