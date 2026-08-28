# Unit 2B: Commercial Payment & Fulfillment — Code Generation Plan

**Status: Part 2 (Generation) COMPLETE 2026-08-25**, all 19 steps implemented, with 2 further
material corrections applied after generation per founder review — (1) the report price default
(`checkout-fulfillment/types.ts`'s `DEFAULT_REPORT_PRICE_CENTS`) corrected from an unapproved
$49.00 placeholder to the founder-approved $9.99 (999 cents), with fail-closed validation on the
`REPORT_PRICE_CENTS` override and new deterministic tests; (2) the duplicate-payment anomaly path
corrected to record the real `paidAt`/`stripePaymentIntentId` for a duplicate-charged Order instead
of falsifying `paidAt` to `NULL` to satisfy a uniqueness constraint — the `orders_screening_
request_id_paid_unique` partial index predicate was narrowed to exclude `refundReason =
'DUPLICATE_PAYMENT'` rows (migration `0002_hot_colleen_wing.sql`), correcting the enforced
invariant from the physically-untrue "at most one Order may ever have had a payment confirmed" to
"at most one canonical Order may ever authorize fulfillment." Full record in the code README's
"Defects Found and Fixed" item 5. See steps 4 and 6 below.

**Status: Part 1 APPROVED 2026-08-24**, with 2 material corrections applied before Part 2 begins —
(1) `processRefundWorkflow` corrected so `REFUND_PENDING` is a **resumable** state (loads and
reuses the persisted `Order.refundIdempotencyKey`), not a dedup-exit state — the original design
would have silently stranded a refund that crashed between the local claim and the Stripe call,
exactly the case reconciliation exists to catch; the Stripe idempotency key reverts to the
DB-persisted `Order.refundIdempotencyKey` (already specified in Functional Design's
`domain-entities.md`, mistakenly said to be replaceable by the Workflow step's `stepId` during NFR/
Infrastructure Design — that was wrong, since a new workflow run gets a new `stepId` even when
resuming the same logical refund attempt); (2) `INTERNAL_PROTOTYPE` is no longer a deployed Next.js
Route Handler under any circumstance — "unlinked from the UI" is not authorization on a platform
where every deployed route is a public HTTP endpoint; it becomes a server-only CLI script instead.
See steps 4 and 9 (refund) and step 12 (route surface) below, both updated in place.

**Design consumed**: all approved Functional Design, NFR Requirements/Design, and Infrastructure
Design artifacts for Unit 2B, including the deployment-platform pivot to Vercel and its
Workflow-Start Idempotency correction
(`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`). Extends Unit 1/2
code unchanged except where explicitly noted (the DB driver, `GenerationAuthorizationType`,
`ReportAccessCredential`, and PDF rendering's Chromium binary source).

**Assigned stories**: PO-0 through PO-5, ACC-1 (guest checkout only).

**Governing invariant, restated for this stage**: the database (`Order`/`OrderState`,
`ReportGenerationJob`'s existing atomic claim) is the authoritative correctness boundary for every
idempotency/dedup requirement in this unit — Stripe signatures, idempotency keys, and Vercel
Workflow hook tokens are real, used, and load-bearing for their own specific purposes, but never
substitute for a database-level conditional transition where one is required.

## Steps

1. [x] **Dependencies** — add `stripe`, `resend`, `workflow` (Vercel Workflow SDK), `puppeteer-core`,
   `@sparticuz/chromium`, `ws` (+ `@types/ws`) to `package.json`. `playwright`/`@playwright/test`
   remain unchanged (still used for the local/CI browser smoke suite — unrelated to the PDF
   render path, which moves off Playwright for the reasons in step 10).

2. [x] **Database Schema Extension** (`src/db/schema.ts`, migrations regenerated) —
   `orderStateEnum` (`PENDING`/`PAID`/`REFUND_PENDING`/`REFUNDED`/`REFUND_FAILED`/`EXPIRED`,
   `domain-entities.md`'s `OrderState`); `orders` table (all fields from Unit 2B's
   `domain-entities.md` `Order` section — `screeningRequestId`, `state`, `priceCents`, `currency`,
   `checkoutCreationIdempotencyKey`, `stripeCheckoutSessionId?`, `stripePaymentIntentId?`,
   `customerEmail?`, `paidAt?`, `refundReason?`, `refundIdempotencyKey?`, `stripeRefundId?`,
   `refundConfirmedAt?`) with the two partial unique indexes (BR-U2B-1: `state='PENDING'`,
   `paidAt IS NOT NULL`); `processed_stripe_events` table (`stripeEventId` unique,
   `eventType`, `stripeObjectId`, `processedAt`); additive `deliveryStatus`/`deliveryAttempts`/
   `lastDeliveryAttemptAt` columns on `report_access_credentials`. Migrations regenerated, never
   applied to a live DB in this sandbox (no `DATABASE_URL`) — same discipline as every prior unit.

3. [x] **Database Client — Two-Driver Strategy** (`src/db/client.ts`, modified) — `getDb()` stays
   `neon-http`-backed (default, unchanged for every existing call site); add
   `withFulfillmentTransaction<T>(fn)` — opens a `neon-serverless` `Pool`/connection, runs `fn`
   inside a real Drizzle transaction, closes the connection before returning, entirely within one
   call. No module-level singleton `Pool`.

4. [x] **Order & Payment** (`src/order-payment/`) — `types.ts` (`OrderState`, `Order`,
   `ProcessedStripeEvent`, `RefundReason` consts, matching this codebase's established
   `const...as const` pattern); `stripe-client.ts` (a narrow adapter around the official `stripe`
   SDK, mirroring `rule-research-assistant/anthropic-client.ts`'s shape — env-only credential,
   structurally distinct instance); `repository.ts` — `createCheckoutSession` (Pattern 1's full
   resumable state machine: reuse a `PAID` order, reuse/re-check a `PENDING` order's live Stripe
   state before reuse per the corrected Pattern 1, resume-not-duplicate on a session-ID-absent
   retry using the stable `checkoutCreationIdempotencyKey`, `orderId` in `client_reference_id`),
   `handleVerifiedWebhook` (BR-U2B-4's ledger check + BR-U2B-15's atomic transaction via
   `withFulfillmentTransaction`, BR-U2B-1 point 4's duplicate-payment-anomaly path, `PENDING ->
   EXPIRED`), `getPaymentState`, `processRefund` — **corrected state machine, not a single
   claim-then-submit**: load the `Order`; if `PAID`, conditionally claim `PAID -> REFUND_PENDING`
   AND generate/persist `refundIdempotencyKey` if none exists yet, then submit to Stripe; if
   already `REFUND_PENDING`, this is a **resumable** state — load the already-persisted
   `refundIdempotencyKey` and (re-)submit the same logical refund using it, never re-claim; if
   `REFUNDED`, exit successfully (nothing to do); if `REFUND_FAILED`, exit (Unit 2B creates no new
   logical attempt automatically); any other state exits/rejects per existing domain rules. The
   Stripe idempotency key is **always** `Order.refundIdempotencyKey` (DB-persisted, generated once
   per logical attempt) — never a Vercel Workflow step's `stepId`, since a reconciliation-started
   workflow run resuming the same logical attempt gets a *different* `stepId` but must submit with
   the *same* Stripe key.

5. [x] **GenerationAuthorization Extension** (`src/screening-request/authorization.ts`, modified) —
   add `VERIFIED_PAYMENT` to `GenerationAuthorizationType`; extend the `GenerationAuthorization`
   type to the discriminated union from Unit 2B's `domain-entities.md` (`INTERNAL_PROTOTYPE` with
   `authorizedBy`, `VERIFIED_PAYMENT` with `orderId`) — `createReportGenerationJob`'s signature is
   unchanged, it already accepts any `GenerationAuthorization`.

6. [x] **Checkout & Fulfillment** (`src/checkout-fulfillment/`) — `initiateCheckout` (BR-U2B-1's
   readiness check via the existing `checkReadiness`, purchase-lock via the existing snapshot
   mechanism at this earlier trigger point per BR-U2B-16, delegates to `order-payment`'s
   `createCheckoutSession`); `getGuestStatus` (Pattern 4 — resolves an `Order` by
   `stripeCheckoutSessionId`, derives the minimized `GuestOrderStatus` enum, never exposes internal
   fields); `handleGenerationOutcome` (called from the report-generation workflow's terminal steps
   — triggers guest delivery on `COMPLETE`/`VERIFIED_PAYMENT`, triggers
   `processRefundWorkflow`/`GENERATION_FAILURE` on `FAILED`/`VERIFIED_PAYMENT`).

7. [x] **Email Delivery** (`src/email-delivery/`) — `resend-client.ts`, a single adapter function
   wrapping the Resend SDK (send one transactional email, return an accept/fail result) — env-only
   credential, no general notification framework.

8. [x] **Report Access Extension** (`src/report-access/`, modified) — `deliverGuestReportAccess`
   (issues/rotates a credential via the existing `createAccessCredential`/`rotateAccessCredential`,
   calls `email-delivery`, records `deliveryStatus`) — Unit 2B's first production call site for
   these previously-unwired Unit 2 functions.

9. [x] **Vercel Workflows** (`src/workflows/`) — `report-generation-workflow.ts`
   (`reportGenerationWorkflow`, `'use workflow'`; first step is the existing, unmodified
   `claimQueuedJob` — zero-rows-affected exits the run; remaining steps wrap the existing
   `runReportGenerationPipeline` stages so `STAGE_TIMING` and every existing business-rule
   behavior (BR-U2-8 degradation, BR-U2B-8 refund/access independence, etc.) is reused, not
   reimplemented; a final step calls `checkout-fulfillment.handleGenerationOutcome`);
   `refund-workflow.ts` (`processRefundWorkflow`, `'use workflow'`) — **corrected: `REFUND_PENDING`
   is resumable, not a dedup-exit branch**. The workflow loads the `Order` and branches on its
   current state (mirrors `order-payment.processRefund`'s corrected state machine exactly — the
   workflow is a thin durable wrapper around that same logic, not a second implementation of it):
   `PAID` → claim `PAID -> REFUND_PENDING` + persist `refundIdempotencyKey` if absent, then submit;
   `REFUND_PENDING` → load the persisted `refundIdempotencyKey` and (re-)submit the same logical
   refund with it, whether this run is the original or a reconciliation-started resumption;
   `REFUNDED`/`REFUND_FAILED` → exit. The Stripe idempotency key is always
   `Order.refundIdempotencyKey`, never a Workflow step's `stepId` (a new workflow run resuming the
   same logical attempt has a *different* `stepId` but must submit with the *same* Stripe key —
   using `stepId` would silently break exactly the crash-recovery case this design exists for).
   Hook tokens (`report-generation:${jobId}`, `refund:${orderId}`) used only as defense-in-depth
   per the corrected design — never the correctness mechanism.

10. [x] **PDF Rendering — Chromium Binary Source Changed for Vercel** (`src/report-pdf-rendering/
    render.ts`, modified) — `renderPdfBytes` reimplemented using `puppeteer-core` +
    `@sparticuz/chromium` instead of `playwright`'s bundled Chromium (Vercel's read-only
    filesystem can't support Playwright's runtime browser download, per the platform-pivot ADR's
    research). Same function signature, same immutable-artifact-only contract, same lazy/cached
    `getOrRenderReportPdf` caller in `repository.ts` (unchanged) — this is a rendering-library
    swap inside one function, not a redesign of NFR Design Pattern 6. Tracked as
    `external-verification-tracker.md` item 10 until proven against a real Vercel deployment.

11. [x] **Reconciliation Route** (`src/checkout-fulfillment/reconciliation.ts` +
    `app/api/cron/reconcile/route.ts`) — the 4 Cron checks from `infrastructure-design.md`'s
    Execution Model (stuck `QUEUED` jobs, `PAID`+`FAILED` needing refund, stale `REFUND_PENDING`,
    stale `EMAIL_PENDING`), each a conditional/idempotent database-state check followed by an
    ordinary re-`start()` — for `REFUND_PENDING` specifically, this re-`start()` now correctly
    **resumes** the refund submission (step 9's corrected `processRefundWorkflow` state machine),
    not a claim attempt that would exit immediately — protected by a shared-secret header check
    against `CRON_SECRET` (Vercel's documented pattern for protecting Cron-invoked routes from
    arbitrary public calls).

12. [x] **Next.js API Routes** (`app/api/`) — **corrected: `INTERNAL_PROTOTYPE` is never a deployed
    route.** Public routes only: `POST /api/webhooks/stripe` (raw-body read, 65,536-byte bound,
    `stripe.webhooks.constructEvent`, delegates to `order-payment.handleVerifiedWebhook`, then
    `start()`s `reportGenerationWorkflow`); `POST /api/checkout` (delegates to
    `checkout-fulfillment.initiateCheckout`, returns the Checkout URL); `GET
    /api/checkout/status/[sessionId]` (delegates to `getGuestStatus`, sets `Cache-Control:
    no-store`). `INTERNAL_PROTOTYPE` triggering (BR-U2B-9) is **not** an HTTP route under any
    circumstance — "unlinked from the UI" is not authorization on a platform where every deployed
    Route Handler is a public HTTP endpoint. It becomes `scripts/generate-prototype-report.ts` (or
    equivalent), a server-only CLI entry point that imports the existing domain functions directly
    (`authorizeReportGeneration` et al.) and constructs `GenerationAuthorization { type:
    INTERNAL_PROTOTYPE, ... }` without ever going through a network-reachable endpoint. Run via
    `tsx`/`node` locally or from deploy/ops tooling only — never bundled into the Next.js app's
    deployed route surface. An HTTP-reachable version is not built speculatively; if a future
    unit's evidence ever demonstrates a genuine need for one, that requires its own explicit
    strong server-side authorization design and review.

13. [x] **`vercel.json`** — the Cron schedule entry (`/api/cron/reconcile`, every 5 minutes).

14. [x] **Frontend Changes** (`app/`) — `/configure`'s final step changes from the
    `INTERNAL_PROTOTYPE`-triggering call to `POST /api/checkout`, redirecting to the returned
    Stripe Checkout URL (BR-U2B-9's public-flow-is-`VERIFIED_PAYMENT`-only requirement); a new
    `/checkout/status` (or equivalent) page polling `GET /api/checkout/status/[sessionId]` and
    rendering Pattern 4's minimized status values with the customer-facing copy Workflow 4
    specifies (`payment received / report being generated`, `check your email`, etc.); response
    headers (`Referrer-Policy: no-referrer`) on the status page and on `/report/[token]` (NFR-U2B-4,
    extending Unit 2's existing routes).

15. [x] **Fixture/Test Data** — Stripe test-mode fixtures (fake Checkout Session/webhook-event
    payloads matching Stripe's real schema shape, for deterministic tests); a fake Resend client
    matching `AiCompletionClient`'s existing fake-adapter-for-tests pattern.

16. [x] **Deterministic Test Suite** (scope note: some scenarios listed below were implemented as
    live-Neon integration tests rather than DB-less deterministic ones — see the Code Generation
    README's disclosed testing-strategy note) — `OrderState` transition legality (externally-confirmed vs.
    local-command, BR-U2B-2); webhook raw-body signature handling (valid/invalid, per BR-U2B-4);
    duplicate/out-of-order event handling via the `ProcessedStripeEvent` ledger and via `Order`'s
    own state-machine idempotency independently; the atomic fulfillment transaction's rollback
    behavior (fault-injected); the duplicate-payment anomaly path; checkout-creation resumability
    (new `PENDING` order → session creation; retry after a pre-Stripe failure reuses the same
    order; retry after an uncertain Stripe response reuses the same
    `checkoutCreationIdempotencyKey`; an existing usable session is reused; a concurrent-initiation
    race cannot produce two `PENDING` orders — simulated via the partial-unique-index constraint
    violation path); `reportGenerationWorkflow`'s `claimJob`-affects-zero-rows exit path (a second
    "run" for an already-claimed job executes no pipeline steps); **`processRefundWorkflow`'s
    corrected resumable state machine, explicitly**: a crash simulated after `PAID ->
    REFUND_PENDING` commits but before the Stripe API call — a restarted run resumes from
    `REFUND_PENDING` (never re-claims) and submits using the persisted `refundIdempotencyKey`; the
    Stripe-response-lost case — a restarted run submits again using the exact same persisted key
    (never a new one, never a Workflow-step-local one); duplicate workflow starts while
    `REFUND_PENDING` cannot create more than one logical refund attempt; `REFUNDED` exits
    harmlessly; `REFUND_FAILED` does not automatically retry or create a new attempt (the
    manual-resolution scope limit); the duplicate-payment refund path; guest-delivery
    rotation-on-uncertain-delivery, including the stale-`EMAIL_PENDING` threshold rule; the Cron
    reconciliation checks' conditional/idempotent behavior under simulated repeated/overlapping
    invocation, including confirming a stale-`REFUND_PENDING` re-`start()` genuinely resumes the
    Stripe submission rather than exiting; `GuestOrderStatus`'s never-exposed-field guarantee;
    confirmation that `INTERNAL_PROTOTYPE` triggering has **no** corresponding deployed route at
    all (a structural/production-boundary-style test, not just "not linked from the UI").

17. [x] **Integration Test Suite** — a live Stripe test-mode integration test (Checkout Session
    creation, server-authoritative amount/currency verification, `orderId`
    metadata/`client_reference_id` correlation, session retrieval) added to
    `test:integration`, activated by `STRIPE_SECRET_KEY`, skipping cleanly otherwise — same
    pattern as every existing King County/Anthropic/Neon live-integration test.

18. [x] **CI** (`.github/workflows/integration.yml`, modified) — the new Stripe test-mode job added
    to the existing non-blocking live-integration tier; `.github/workflows/ci.yml`'s blocking
    checks (typecheck, deterministic+component tests, build, Playwright smoke) are unchanged in
    kind, now also covering this unit's new deterministic tests.

19. [x] **Documentation** — `aidlc-docs/construction/unit-2b-commercial-payment-fulfillment/code/README.md`,
    following Unit 1/2's established format (what was built, defects found and fixed during real
    testing, what remains open per the external-verification tracker).

## Note on Live Execution

This sandbox has no `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `DATABASE_URL`, or a real Vercel
deployment — every Stripe/Resend/Neon/Vercel-Workflow live-integration test is written to skip
cleanly without credentials, exactly like every prior unit's external-verification items (now
tracked as tracker items 7, 9, and 10 for this unit specifically). Deterministic tests use fake
Stripe event payloads and a fake Resend client — no network calls in the default `npm test` run.
`npm run typecheck`, `npm test`, and `npm run build` are run and must pass before this stage is
considered complete, matching every prior unit's standard.
