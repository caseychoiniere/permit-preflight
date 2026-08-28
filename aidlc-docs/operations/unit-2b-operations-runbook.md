# Unit 2B Operations Runbook — Commercial Payment & Fulfillment on Vercel

## Scope of This Document

Unit 2B is the first unit with real customer payment, a durable execution runtime (Vercel
Workflows), and a Cron backstop — see `aidlc-docs/operations/unit-2-operations-runbook.md` for
what's now historical (Railway, the in-process poller, both explicitly superseded) and
`aidlc-docs/operations/unit-1-operations-runbook.md` for what's still unchanged (general
credential/env-var discipline, running tests). This document covers only what's new because Unit
2B introduces real Stripe money, Vercel Workflows, and Cron reconciliation. No new infrastructure
is introduced here — this document operates the same Vercel/Neon/Stripe/Resend/MapTiler/Anthropic
stack already built, per the explicit instruction governing this stage.

**Honesty discipline, reaffirmed**: this sandbox has no real Vercel deployment, no live Stripe
account, no live Resend account, and no live Neon database. Every procedure below is written to be
followed by whoever actually has that access — nothing in this document claims a live check
happened when it didn't. Items that genuinely require a live deployment to verify remain tracked
as open in `external-verification-tracker.md`, not marked done here.

---

## 1. Vercel Deployment Configuration

### Environments
- **Production**: the `main` branch's deployment, the only environment where live-mode Stripe
  credentials may ever be configured (see §3/§10).
- **Preview**: one deployment per non-`main` branch/PR — always test-mode Stripe, never live.
- **Development**: `vercel dev` / `next dev` locally — always test-mode Stripe, no `DATABASE_URL`
  required to boot (lazy `getDb()`, unchanged from Unit 2).

### Environment Variables — Server-Only vs. Browser-Visible
| Variable | Scope | Environments |
|---|---|---|
| `DATABASE_URL` | Server secret | All (isolated Neon branch per environment — never share Dev/Preview/Production) |
| `ANTHROPIC_API_KEY` | Server secret | All (optional — Report Explanation degrades gracefully if absent) |
| `STRIPE_SECRET_KEY` | Server secret | test-mode (`sk_test_...`) in Development/Preview; live-mode (`sk_live_...`) in Production **only as a deliberate commercial-launch step** (§3, §10) |
| `STRIPE_WEBHOOK_SECRET` | Server secret | Must match the same mode as `STRIPE_SECRET_KEY` in that environment — a live secret paired with a test key (or vice versa) makes every webhook signature fail closed |
| `RESEND_API_KEY` | Server secret | All (Resend has no test/live split) |
| `CRON_SECRET` | Server secret | Production (and Preview if Preview Crons are enabled) — Vercel's documented mechanism for authenticating its own Cron-invoked requests |
| `APP_BASE_URL` | Server config (not secret, but not browser-exposed either) | Set explicitly per environment for a custom domain; falls back to Vercel's auto-injected `VERCEL_URL` otherwise |
| `REPORT_PRICE_CENTS` / `REPORT_CURRENCY` | Server config, optional | Only set if the $9.99 default is being deliberately changed — fails closed on a malformed value (never silently substitutes a different price) |
| `NEXT_PUBLIC_MAPTILER_KEY` | **Public, browser-visible** — unchanged from Unit 2 | All. Protected by MapTiler's Allowed HTTP Origins, not env-var secrecy. |

**Never** put `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `DATABASE_URL`, or
`CRON_SECRET` behind a `NEXT_PUBLIC_` prefix — that would expose it to every browser that loads the
app.

### Deployment / Rollback Procedure
- Vercel deployments are immutable and retained — rolling back means **promoting a previous
  deployment** (dashboard's "Promote to Production," or `vercel rollback`), not a bespoke
  procedure.
- **Migrations remain forward-only** (unchanged posture from Unit 1/2 — no down-migrations
  authored, and this Operations pass does not introduce one). A code rollback that depends on a
  schema change being reverted is **not** automatic — that requires a deliberate, manual database
  decision (a compensating migration, or accepting the newer schema alongside older code if
  compatible), exactly as documented in `unit-2-operations-runbook.md` §14.
- **Skew Protection and in-flight Workflow runs**: a workflow run that starts under one deployment
  is meant to stay pinned to that deployment (Vercel's Skew Protection) even if a new deployment
  goes live mid-run — this is a real, unverified claim in this sandbox
  (`external-verification-tracker.md` item 9's redeploy-survival checklist item covers exactly
  this).
- Before promoting any deployment that changes `src/workflows/*.ts` imports, re-run the manifest
  check from `build-instructions.md`'s troubleshooting section
  (`.next/diagnostics/workflows-manifest.json` must list both workflows) — this is a real defect
  class this project already hit once during Code Generation.

---

## 2. Neon

### Production `DATABASE_URL` Configuration
- One isolated Neon branch per Vercel environment (Development/Preview/Production) — never shared,
  per Infrastructure Design's standing rule, unchanged by this unit.
- `npm run db:migrate` applies all migrations in order, including Unit 2B's new
  `0002_hot_colleen_wing.sql` (the `orders`/`processed_stripe_events` tables, the
  `report_access_credentials` delivery-status columns, and the corrected
  `orders_screening_request_id_paid_unique` predicate). As with every prior migration in this
  project, a migration failure must prevent the new application version from becoming active — if
  wired as a Vercel pre-deploy step, confirm it actually blocks on failure rather than only
  logging.
- **This procedure remains unverified against a real Neon database** in every session of this
  project — `external-verification-tracker.md` items 1/3, now also covering Unit 2B's schema via
  item 1's checklist scope.

### Connection Strategy (as designed — two drivers, not one)
- `getDb()` (`src/db/client.ts`) — `neon-http`, stateless, cached as a module-level singleton. The
  default for essentially everything: ordinary reads/writes, most Workflow steps, both Next.js API
  routes that don't need a multi-statement transaction.
- `withFulfillmentTransaction()` — `neon-serverless`'s `Pool`, opened, used for one real Postgres
  transaction, and closed **entirely within one function call**. Used **only** inside
  `order-payment.handleVerifiedWebhook`'s atomic BR-U2B-15 fulfillment sequence (Order PAID
  transition + job creation + ledger write, all-or-nothing) — the one place this application
  genuinely needs a multi-statement, conditionally-branching transaction. Never held as a
  module-level singleton, never reused across invocations — this is a direct, deliberate
  consequence of Neon's own documented constraint that a WebSocket `Pool`/`Client` cannot outlive a
  single request on a serverless platform like Vercel.
- **Operational implication**: if `handleVerifiedWebhook` starts timing out or erroring under real
  load, the first thing to check is whether `withFulfillmentTransaction`'s `Pool` open/close
  overhead (a fresh WebSocket connection per webhook delivery) is the bottleneck — this was a
  deliberate, reasoned tradeoff (correctness over connection-reuse performance for the one
  transactional path), not an oversight, but it's real overhead worth knowing about if latency ever
  becomes a concern.

### Transaction Failure Diagnosis
- A failed `withFulfillmentTransaction` call means `handleVerifiedWebhook` throws, which means the
  webhook route's `POST` handler itself errors (uncaught) — Stripe sees a non-2xx response and
  **redelivers the same event later**, per Stripe's own retry behavior. This is safe by design: no
  partial state is ever committed (`Order` remains `PENDING`, no `ProcessedStripeEvent` row exists),
  so a redelivery correctly reprocesses the whole sequence from scratch.
- **To diagnose**: check the Vercel Function logs for the webhook route around the failure
  timestamp; check whether the failure is a genuine Postgres error (connection refused, statement
  timeout) versus the deliberate `SAVEPOINT`-isolated unique-violation path (which is NOT an error
  — that's the duplicate-payment-anomaly branch working as designed, logged as
  `DUPLICATE_PAYMENT_ANOMALY`, not a failure).
- **If Stripe's dashboard shows repeated failed deliveries for the same event with no eventual
  success**: that's the actual signal of a real, ongoing transaction failure (not a duplicate — a
  genuine repeated inability to commit) — escalate as a database-connectivity or schema-drift
  incident, not something Cron reconciliation will fix (Cron reconciles *durable database state*,
  not a webhook that has never once successfully committed).
- **Migration rollback posture**: forward-fix only, unchanged — see §1.

---

## 3. Stripe

### Test-Mode Setup (Development/Preview)
1. Use a Stripe test-mode secret key (`sk_test_...`) for `STRIPE_SECRET_KEY`.
2. Forward webhooks locally with the Stripe CLI: `stripe listen --forward-to
   <local-or-preview-url>/api/webhooks/stripe` — the CLI prints a `whsec_...` value; use that as
   `STRIPE_WEBHOOK_SECRET` for the environment it's forwarding to.
3. Complete a real test-mode Checkout using one of Stripe's [documented test card
   numbers](https://docs.stripe.com/testing) (e.g. `4242 4242 4242 4242`, any future expiry, any
   CVC) — this is `external-verification-tracker.md` item 7's full checklist, still open in this
   sandbox (no Stripe CLI session has ever run in this project).

### Production / Live-Mode Go-Live Procedure
**Enabling live Stripe credentials is a deliberate commercial-launch action, never a side effect of
an ordinary deployment.** Concretely:
1. Complete `external-verification-tracker.md` item 7 (the full test-mode CLI-forwarded webhook
   path) successfully first — do not go live on an unverified integration.
2. In the Stripe Dashboard, switch to **Live mode** and create a live webhook endpoint (see below).
3. Set `STRIPE_SECRET_KEY` to the live secret key (`sk_live_...`) **in the Production Vercel
   environment only** — never in Preview/Development.
4. Set `STRIPE_WEBHOOK_SECRET` to the *live* endpoint's signing secret, matching mode.
5. Confirm §10's full commercial-launch checklist before the first real customer can pay.
6. This step is intentionally manual and reviewable (a Vercel environment-variable change plus a
   Stripe Dashboard action) — there is no "auto-promote test to live" mechanism, by design.

### Live Webhook Endpoint Creation
- Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
- URL: `https://<production-domain>/api/webhooks/stripe`.
- Events to send: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.expired`, `refund.updated` (or `charge.refund.updated`, both are handled — see
  `order-payment/repository.ts`'s `handleVerifiedWebhook` switch). Do not subscribe to the entire
  event catalog — every unhandled event type still costs a delivery + a `recordProcessed` ledger
  write for no benefit.
- After creation, copy that specific endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET` for
  the matching Vercel environment.

### Webhook Signature / Delivery Verification
- Stripe's own Dashboard (Developers → Webhooks → the specific endpoint) shows every delivery
  attempt, its HTTP response code, and response body — this is the first place to check for a
  suspected delivery problem, before looking at this app's own logs.
- This application's own signature check (`constructWebhookEvent`) rejects anything that doesn't
  verify against the raw body + the configured secret with a `400` — a spike of `400`s in Stripe's
  delivery log almost always means `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint that's
  actually sending (e.g., a test-mode secret configured against a live endpoint, or vice versa),
  not an attack.
- A `413` response means the raw body exceeded the 65,536-byte bound — Stripe's own webhook
  payloads are not expected to reach this size for the event types this app subscribes to; a real
  `413` is worth investigating as anomalous, not routine.

### Duplicate Webhook Diagnosis
- Stripe's own retry behavior means **every** webhook handler must expect redelivery — this is
  normal, not a bug report on its own. Check `processed_stripe_events` for the `stripe_event_id` in
  question: if it's already present, the redelivery was correctly absorbed as a no-op
  (`handled: true`), by design (BR-U2B-4).
- **A genuine problem** looks like: the event is present in Stripe's delivery log dozens of times
  over a long period with this app consistently returning non-2xx (see "Transaction Failure
  Diagnosis" above) — that's an unresolved failure, not routine idempotent redelivery.

### Refund Diagnosis
- Query `orders` for the specific `Order` (by `id`, or by `screeningRequestId` if unknown):
  - `state = 'REFUND_PENDING'` and `stripeRefundId IS NULL` → the local claim happened but Stripe
    hasn't been (successfully) called yet, or the response was lost. **Expected to self-heal**: the
    Cron reconciliation backstop (§6, check 3) resubmits after `DEFAULT_REFUND_STALE_THRESHOLD_MS`
    (2 minutes) using the same persisted `refundIdempotencyKey` — this is exactly the corrected,
    resumable design (BR-U2B-5). Only escalate if this state persists for many reconciliation
    cycles (§12).
  - `state = 'REFUND_PENDING'` and `stripeRefundId` set → Stripe acknowledged the refund request;
    awaiting the `refund.updated`/`charge.refund.updated` webhook to confirm `REFUNDED` (or
    `REFUND_FAILED`). Cross-check the `stripeRefundId` directly in the Stripe Dashboard for its
    real current status if this seems stuck.
  - `state = 'REFUND_FAILED'` → Stripe explicitly reported failure (e.g., the underlying charge
    itself was disputed or already refunded outside this flow). **No automatic retry** — this is a
    deliberate BR-U2B-5 scope limit (manual/support resolution only). See §12.
  - `refundReason = 'DUPLICATE_PAYMENT'` with a real `paidAt`/`stripePaymentIntentId` → the
    corrected (2026-08-25) duplicate-payment path — this Order genuinely was charged and is being
    refunded automatically; it never authorized report generation (no `GenerationAuthorization`/
    `ReportGenerationJob` was ever created for it — confirm via `report_generation_jobs` if in
    doubt).

---

## 4. Resend

### Production Setup
- Set `RESEND_API_KEY` in the Production Vercel environment (and Preview/Development with a
  separate key or the same key — Resend has no test/live mode split, unlike Stripe).
- **Sending-domain verification**: before real customers receive email, verify a real sending
  domain in the Resend Dashboard (adds the required SPF/DKIM DNS records) and set
  `EMAIL_FROM_ADDRESS` to an address on that verified domain
  (`src/email-delivery/resend-client.ts`'s default, `reports@permitpreflight.example`, is a
  placeholder and will not actually deliver until a real domain is verified).
- **Test-address procedure** (before a domain is verified, or for safe pre-launch testing): Resend
  documents fixed test addresses (`delivered@resend.dev`, `bounced@resend.dev`,
  `complained@resend.dev`) that simulate each outcome without needing a verified domain or risking
  a real inbox — use these to exercise `deliverGuestReportAccess`'s `EMAIL_SENT`/`EMAIL_FAILED`
  paths for real before a paying customer's email is on the line.

### `EMAIL_SENT` Semantics (reaffirmed)
`EMAIL_SENT` means **Resend accepted the send** — never a guarantee of end-recipient delivery. A
customer reporting "I paid but got no email" is not automatically contradicted by
`deliveryStatus = 'EMAIL_SENT'` in the database — see §12 for the actual diagnosis path (check
Resend's own delivery/bounce data for that specific send, not just this app's own status column).

### Delivery Failure / Retry / Credential-Rotation Behavior
- A failed send sets `deliveryStatus = 'EMAIL_FAILED'` (`report-access/repository.ts`'s
  `deliverGuestReportAccess`) — never silently swallowed, never retried inline within the same
  request.
- **Automatic retry**: Cron reconciliation check 4 (§6) picks up any credential still
  `EMAIL_PENDING` past 10 minutes or `EMAIL_FAILED`, and calls `deliverGuestReportAccess` again —
  each retry **rotates** the credential (issues a fresh raw token; the previous one, which nobody
  ever received, is revoked), so a customer who eventually receives a retried email always gets a
  currently-valid link.
- **Credential rotation for `RESEND_API_KEY` itself** (e.g., routine security hygiene, or a
  suspected leak): update the env var in Vercel and redeploy — no code change needed, no in-flight
  state depends on the specific key value (unlike Stripe's idempotency-key persistence).

---

## 5. Vercel Workflows

### Inspecting Runs
- Local/CI: `npx workflow web` (observability web UI) or `npx workflow inspect runs` /
  `npx workflow inspect run <run-id>` (terminal) — both documented by the SDK, bundled with the
  `workflow` package already installed.
- On a real Vercel deployment: Vercel's own dashboard additionally surfaces Workflow observability
  (per-step traces) natively, per the SDK's Next.js integration — **this specific claim has not
  been checked against a real deployment in this project** and should be confirmed the first time
  someone with deployment access looks.
- Each workflow run has a `runId` (`wrun_...`) — useful for support/debugging correlation, but
  **never a business identity**: it is not stored on `Order`/`ReportGenerationJob`, and no domain
  decision is ever made by looking one up. If a `workflowRunId` is ever added to logs for
  correlation, it remains observability-only (per the corrected Workflow-Start Idempotency design).

### Failed-Step Diagnosis
- Steps retry automatically (3 retries by default, for up to 4 total attempts, per the Workflow
  SDK) before the failure propagates to the workflow function. A step that throws `FatalError`
  skips retry entirely.
- `reportGenerationWorkflow`'s `runPipelineStep` calls `runReportGenerationPipeline`, which already
  catches its own internal errors and calls `markJobFailed` itself (unchanged from Unit 2) — so
  this specific step essentially never propagates an exception up to the Workflow SDK's own
  retry/failure machinery under an ordinary application-level failure. A `runPipelineStep` failure
  visible in Workflow observability therefore more likely indicates something below the
  application layer (e.g., the Vercel Function itself was killed mid-execution — timeout, OOM) —
  see §7's "stranded job" note for what that leaves behind in the database.
- `submitRefundStep` (in `processRefundWorkflow`) can genuinely throw (a real Stripe API error, a
  DB error) — a failed attempt here is retried by the SDK's own step-retry, and if it still fails
  after exhausting retries, the *next* trigger of `processRefundWorkflow` (Cron reconciliation, or
  a fresh manual `start()`) resumes correctly via `decideRefundAction`'s `REFUND_PENDING` branch,
  regardless of how the prior run ended.

### Retry / Recovery Expectations — the Database Is Authoritative, Not the Workflow
- **Every workflow step is at-least-once, never exactly-once** — this was the exact correction
  applied during Infrastructure Design (2026-08-24) and is unchanged here. `claimQueuedJob`'s
  atomic `QUEUED -> IN_PROGRESS` update and `decideRefundAction`'s state-branching are what
  actually prevent duplicate work, not Workflow durability by itself.
- **Duplicate workflow runs for the same job/order are expected and harmless** — `start()`'s
  duplicate-run check (`createHook`/`getConflict()`) is defense-in-depth only, never the
  correctness boundary. If Vercel Workflow observability ever shows two runs for the same
  `jobId`/`orderId`, that is not automatically an incident — check whether the database state
  (`ReportGenerationJob.state`, `Order.state`) is correct; if it is, both runs did exactly what
  they were supposed to (one did real work, the other's claim/branch affected zero rows and it
  exited cleanly).

---

## 6. Cron Reconciliation

### Verifying the 5-Minute Job Executes in Production
- Configured in `vercel.json` (`/api/cron/reconcile`, `*/5 * * * *`) — Vercel's Cron dashboard
  (Project → Cron Jobs) shows the configured schedule and, once deployed, its execution history
  and response codes. **Confirm this after the first production deploy** — this sandbox has never
  observed a real Cron invocation.
- Each successful invocation returns a JSON summary (`restartedQueuedJobs`,
  `refundsStartedForFailedGeneration`, `resumedStaleRefunds`, `redeliveredGuestReports`) and logs
  `RECONCILIATION_COMPLETE` with those same counts — a quick way to see whether reconciliation is
  finding (and fixing) anything on a given run without querying the database directly.

### `CRON_SECRET` Handling
- The route (`app/api/cron/reconcile/route.ts`) requires `Authorization: Bearer <CRON_SECRET>` and
  returns `401` otherwise, `500` if `CRON_SECRET` itself isn't configured at all (fails closed,
  never silently runs unauthenticated).
- Vercel is documented to automatically attach this header to its own Cron-triggered invocations
  when `CRON_SECRET` is set as a project environment variable — **this exact behavior has not been
  confirmed against a real deployment in this project** and is worth a first-deploy sanity check
  (trigger the Cron manually once from the Vercel dashboard, or `curl` the route with the correct
  header, and confirm a `401` without it).
- Rotating `CRON_SECRET`: update the env var in Vercel — no code change, no in-flight state depends
  on its specific value.

### What Each Reconciliation Condition Repairs
| Check | Symptom it catches | What it does |
|---|---|---|
| 1. Stuck `QUEUED` jobs (>2 min) | The `start(reportGenerationWorkflow, ...)` call after job creation was itself lost (network blip, a crash between the atomic transaction committing and that `start()` call) | Re-`start()`s the workflow — harmless no-op if the original actually succeeded (`claimQueuedJob` affects zero rows and the reconciling run exits) |
| 2. `PAID` orders with a `FAILED` job | A generation failure's own refund-trigger (`handleGenerationOutcome`'s `start(processRefundWorkflow, ...)` call) was itself lost | Re-`start()`s `processRefundWorkflow` with `GENERATION_FAILURE` |
| 3. Stale `REFUND_PENDING` (>2 min, no `stripeRefundId`) | The refund claim committed but the Stripe submission never happened or its response was lost (the exact crash window BR-U2B-5's correction addresses) | Re-`start()`s `processRefundWorkflow` — lands directly in the resumable `REFUND_PENDING` branch, submits using the persisted `refundIdempotencyKey` |
| 4. Stale `EMAIL_PENDING`/`EMAIL_FAILED` (>10 min) | Guest delivery either crashed mid-send or Resend rejected it | Calls `deliverGuestReportAccess` again (rotates the credential, resends) |
| 5. Stranded `IN_PROGRESS` jobs (>20 min, added 2026-08-25) | The Vercel Function running the pipeline was killed outright (a real process-level failure, not an ordinary caught application error — `runReportGenerationPipeline` already self-marks `FAILED` for those) | Atomically releases the job back to `QUEUED` (`reclaimStaleJob`, corrected to target `QUEUED`) and starts a replacement `reportGenerationWorkflow` run, whose own claim step must still independently win before executing anything |

### Diagnosing Repeated / Stuck Reconciliation Cases
- If the **same row** (same `jobId`/`orderId`/`reportArtifactId`) keeps appearing in
  `RECONCILIATION_COMPLETE`'s counts across many consecutive 5-minute cycles without ever
  resolving, the underlying re-`start()` itself is failing on every attempt, not merely being
  delayed. Common causes: a misconfigured/expired `STRIPE_SECRET_KEY` or `RESEND_API_KEY` (check
  the relevant provider's own dashboard for repeated auth failures around the same timestamps), or
  a genuine application bug in the step being retried.
- **Escalate, don't just let Cron keep trying forever**: reconciliation is a backstop for the rare
  "did the trigger itself land" gap, not a substitute for fixing a root cause that makes every
  attempt fail identically.

---

## 7. Report Generation

### State Meanings (`ReportGenerationJob.state`, unchanged domain model)
- `QUEUED` — created (either by a verified Stripe webhook or the `INTERNAL_PROTOTYPE` CLI), not
  yet claimed by any workflow run.
- `IN_PROGRESS` — claimed; the pipeline (Property Intelligence → Spatial Analysis → Rules Engine →
  Report Explanation → Artifact persistence) is running or was running.
- `COMPLETE` — a real `EvidenceReportArtifact` exists (`evidenceReportArtifactId` set); for
  `VERIFIED_PAYMENT` jobs, guest delivery has been triggered (see §9 for its own independent
  status).
- `FAILED` — a genuinely terminal failure; `failureReasons` (array, every attempt appended) records
  why. For `VERIFIED_PAYMENT` jobs, this automatically triggers a refund (§3's Refund Diagnosis).

### Stranded-Job Diagnosis
- **Stuck `QUEUED`**: self-heals via Cron check 1 within ~2-7 minutes of creation. If it doesn't
  resolve within a full reconciliation cycle or two, see "Diagnosing Repeated/Stuck Cases" above.
- **Stuck `IN_PROGRESS` with no further movement — closed 2026-08-25, automatic recovery is now the
  normal path.** Unit 2's original Railway poller had a second responsibility (stale-`IN_PROGRESS`
  reclaim) that Unit 2B's Cron reconciliation initially did not port when first written — this was
  disclosed as a known gap at that time and has since been closed: Cron reconciliation's **check 5**
  (`checkout-fulfillment/reconciliation.ts`'s `reclaimStaleInProgressJobs`) now finds any
  `IN_PROGRESS` job whose claim is older than `DEFAULT_STALE_IN_PROGRESS_RECLAIM_THRESHOLD_MS` (20
  minutes, a deliberately conservative, provisional value — see that constant's own docstring),
  atomically releases it back to `QUEUED` via the corrected `reclaimStaleJob` (which now targets
  `QUEUED`, not `IN_PROGRESS` — see its docstring for exactly why the old Unit 2 poller-model target
  state was wrong for this event-driven model), and starts a replacement
  `reportGenerationWorkflow` run, whose own `claimJobStep` must still independently win the
  ordinary atomic `QUEUED -> IN_PROGRESS` claim before it executes anything — reclaiming does not,
  by itself, bypass that gate. Concurrency-safe under overlapping Cron invocations (only one caller
  can ever win `reclaimStaleJob`'s conditional UPDATE for a given job) — proven directly by
  `tests/checkout-fulfillment/reconciliation.integration.test.ts`'s 6 test cases (recent jobs not
  reclaimed, genuinely stale jobs reclaimed, the replacement workflow actually starts, overlapping
  attempts can't double-reclaim, `COMPLETE`/`FAILED` jobs are never touched, the replacement
  workflow's own claim is still required). This should remain rare in practice regardless (a
  genuinely stuck `IN_PROGRESS` job requires the Vercel Function itself to have been killed
  mid-execution, since `runReportGenerationPipeline` already catches its own errors and marks
  `FAILED` internally) — but it is no longer only a documented manual gap. **Manual database
  inspection remains available as an emergency diagnostic only** (query `report_generation_jobs`
  for `state = 'IN_PROGRESS'` rows with an old `claimedAt` to see what Cron is about to reclaim, or
  already has), not as the primary recovery path anymore.

### Workflow-Start-Loss Recovery
Covered by Cron check 1 (§6) for the common case (job creation's own `start()` was lost). The CLI
(`INTERNAL_PROTOTYPE`) path has no equivalent — see `scripts/generate-prototype-report.ts`'s own
docstring: it deliberately runs the pipeline synchronously in-process rather than via `start()`, so
"workflow-start loss" isn't a category that applies to it at all; a crashed CLI invocation instead
leaves a job `IN_PROGRESS` per the paragraph above.

### Generation-Failure → Refund Path
Already built and tested (BR-U2B-6/BR-U2B-8): `handleGenerationOutcome` starts
`processRefundWorkflow` with `GENERATION_FAILURE` the moment a `VERIFIED_PAYMENT` job reaches
`FAILED`; Cron check 2 is the backstop if that specific `start()` call itself is lost.

---

## 8. PDF Rendering (Vercel-Specific)

**Status: NOT YET VERIFIED against a real deployed Vercel Function — this Operations pass cannot
mark it verified, because no real Vercel deployment exists in this sandbox.** This is
`external-verification-tracker.md` item 10, explicitly flagged by the founder as the single
biggest unverified risk in the platform pivot, and it remains open here rather than being
fabricated as complete.

### Procedure for Whoever Has Deployment Access
1. Deploy to a real Vercel environment (Preview is sufficient for this check).
2. Trigger a real report generation end to end (Stripe test-mode Checkout, or
   `npm run generate-prototype-report` against that environment's database) so a real
   `EvidenceReportArtifact` exists.
3. Request the PDF (`GET /api/reports/pdf`, cookie-authorized per §9's corrected mechanism) against
   the deployed function.
4. Confirm: the response is a real PDF (`%PDF` header, non-trivial byte length); the Vercel
   Function's execution duration and memory usage stay within its plan's limits; no cold-start
   timeout occurs on the *first* request after a deploy (the `@sparticuz/chromium` binary
   extraction step is the likely source of first-request latency, if any).
5. Compare the rendered output against `tests/report-pdf-rendering/render.integration.test.ts`'s
   local (Linux CI) output for the same fixture data, if practical — confirms no silent rendering
   regression from the Playwright → `puppeteer-core`/`@sparticuz/chromium` binary-source change.

### Likely Failure Modes to Document If Discovered (not yet observed — listed so they're
recognized quickly, not to imply they're expected)
- Function bundle size exceeding Vercel's deployed-function-size limit (the Chromium binary is a
  real, non-trivial weight) — if hit, the SDK's `sourcemap: false` build option (already the
  production default per `next.config.mjs`'s `withWorkflow()` config) already helps; a further fix
  would need `@sparticuz/chromium`-specific bundling guidance, not invented speculatively here.
- Execution-duration limit exceeded under a large/complex report — no data point exists yet on
  real render time inside an actual Function.
- The binary-extraction step failing silently in a way this sandbox's Linux CI run (a full,
  non-serverless Linux environment) wouldn't reproduce, since Vercel Functions have their own
  filesystem/permission constraints Linux CI doesn't exactly mirror.

**If this proves genuinely infeasible on Vercel** (not merely inconvenient), that is a material
infrastructure finding to surface back to the founder directly, per the tracker item's own
instruction — not something to silently work around with an unreviewed architecture change.

---

## 9. Guest Report Delivery / Access

### Diagnosing `EMAIL_PENDING` / `EMAIL_SENT` / `EMAIL_FAILED`
Covered in §4 (Resend) — the short version: query `report_access_credentials` for the specific
`reportArtifactId`'s active row's `deliveryStatus`/`deliveryAttempts`/`lastDeliveryAttemptAt`.
`EMAIL_SENT` means Resend accepted it, not that the customer definitely received it — cross-check
Resend's own dashboard/API for the actual send (by recipient/timestamp) if a customer reports
non-receipt despite `EMAIL_SENT`.

### Access-Token Rotation / Revocation Behavior
- Unchanged mechanism from Unit 2 (`createAccessCredential`/`rotateAccessCredential`/
  `revokeAccessCredential`), now with Unit 2B as its first real production call site
  (`deliverGuestReportAccess` always rotates — see the code README for why). Exactly one active
  credential exists per report at a time; revoked and unknown tokens resolve identically (no
  signal leak).
- **If a report link is suspected leaked**: `rotateAccessCredential(db, reportArtifactId)` from a
  script/REPL — the old link stops resolving immediately; the new raw token must then be
  redelivered (e.g., by re-triggering `deliverGuestReportAccess`, which is exactly what Cron
  reconciliation check 4 already does for a stale delivery — the same primitive serves both a
  routine retry and a manual security-rotation need).

### Bearer Credentials Removed From Platform-Visible URLs (fixed 2026-08-25, not merely documented)

**Identified during the prior Operations pass, now fixed rather than left as a documented risk.**
The previous version of this runbook flagged that `/report/[token]` and
`/checkout/status?session_id=...` both carried a sensitive bearer value directly in a URL path
segment or query string — which Vercel's own platform-level request logs (Runtime Logs, Log
Drains) are documented to capture (Request Path, Search Params), independent of and outside this
application's own logging discipline. The fix was to stop putting the credential there at all,
rather than trying to configure the platform to hide it after the fact:

- **Checkout status** (`POST /api/checkout`): the Stripe Checkout Session ID is now set as an
  HttpOnly, `SameSite=Lax`, path-scoped (`/api/checkout`) cookie (`pp_checkout_session`,
  `src/shared/cookies.ts`) instead of appearing in `success_url`. Stripe's `success_url` is now the
  clean `/checkout/status` with no query string. `GET /api/checkout/status` (no longer a dynamic
  `[sessionId]` route) reads the cookie server-side.
- **Report access** (guest delivery email + `/report`): the email link is now
  `${baseUrl}/report#access_token=<token>` — a URL **fragment**, which browsers never transmit as
  part of the actual HTTP request, so it never reaches Vercel (or any server) as request data at
  all. `app/report/page.tsx` (no longer a dynamic `[token]` route) reads the fragment client-side
  on load, `POST`s the token in a request **body** to `POST /api/reports/access` (same rate-limiting
  discipline, same hash-only `findArtifactIdByAccessToken` validation as before — this is a
  transport change, not a new validation mechanism), which sets an HttpOnly, path-scoped
  (`/api/reports`) session cookie (`pp_report_access`) carrying the raw token. The page then strips
  the fragment from the visible URL via `history.replaceState` before rendering anything. `GET
  /api/reports` and `GET /api/reports/pdf` (both no longer dynamic `[token]` routes) read that same
  cookie — the PDF route was deliberately changed to reuse this exact mechanism rather than
  inventing a second, PDF-specific credential system.
- **No new authentication/account framework was introduced** — every cookie's value is still
  re-validated against the existing hash-only `ReportAccessCredential` lookup (or `Order` lookup,
  for the checkout-status cookie) on every request; the cookie is a transport for the same
  existing bearer credential, not a new trust boundary or session-signing scheme.

### Bearer-Token / URL Logging Protections (reaffirmed, unchanged)
- Never log a raw `reportAccessToken`, `tokenHash`, or a full Checkout Session ID in this
  application's own structured logger — `src/shared/logger.ts`'s `LogEvent`/`LogDetail` types don't
  prevent this at the type level (deliberately — the discipline is "don't put secrets in `detail`,"
  not silent redaction, per that module's own documented rationale), so this remains a code-review
  discipline, not an automated guarantee. Also now true structurally for cookie VALUES, which never
  appear in any URL this application constructs or logs.

### `Referrer-Policy` and `Cache-Control: no-store` on Deployed Routes
- `next.config.mjs`'s `headers()` sets `Referrer-Policy: no-referrer` for the (now static-path)
  `/report` and `/checkout/status` pages; `GET /api/checkout/status` sets `Cache-Control: no-store`
  in its own response headers directly.
- **Both are structurally tested** (`tests/checkout-fulfillment/guest-status-minimization.test.ts`
  for the `no-store` header) but **neither has been confirmed against actual deployed response
  headers** — `curl -I` the real deployed URLs once available and confirm both headers are
  genuinely present (a Next.js `headers()` config misconfiguration, or an intermediary stripping
  headers, would not be caught by this sandbox's tests).

### Vercel/Platform Request Logs — Verification Target Changed From "Investigate a Risk" to "Confirm the Fix"
With the raw credentials no longer placed in any request path or query string, the concern
originally raised here (Vercel's platform-level Runtime Logs/Log Drains capturing full URLs) is
addressed by construction, not by hoping the platform's logging happens to be configured kindly.
**What remains genuinely open** — and is exactly `external-verification-tracker.md` item 11's
now-updated scope — is confirming this against a real deployment: that `/report` and
`/checkout/status` requests show only clean route paths in Vercel's logs, that no raw
`reportAccessToken`/Checkout Session ID appears anywhere in Request Path or Search Params for any
route, and that this application's own logs remain clean too. **Not yet confirmed in this
sandbox** — no real Vercel deployment exists here.

---

## 10. Commercial-Launch Checklist

**Three genuinely different claims — do not conflate them:**
1. **Application deployed** — code is live on Vercel, in *some* environment, possibly still
   test-mode Stripe.
2. **Technically verified** — the specific mechanism in question has been proven against a real
   dependency (a real Neon database, a real Stripe test-mode charge, a real Resend send, a real
   deployed Workflow run, a real deployed PDF render).
3. **Commercially enabled** — live-mode Stripe credentials are active in Production and a real
   paying customer could complete a purchase right now.

**Before commercially enabling (switching `STRIPE_SECRET_KEY` to live-mode in Production), all of
the following must be true — not merely "deployed," genuinely verified:**
- [ ] Stripe live-mode credentials configured (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, §3)
- [ ] The live Stripe webhook endpoint verified receiving and correctly processing a real event
      (§3's Webhook Signature/Delivery Verification, done against the *live* endpoint specifically,
      not only test-mode)
- [ ] Resend production sending domain verified (§4) — not sending from the placeholder/testing
      domain
- [ ] A real deployed Vercel Workflow run observed completing successfully end to end (§5,
      `external-verification-tracker.md` item 9)
- [ ] A real deployed PDF generation observed succeeding (§8, item 10) — this is explicitly the
      single biggest unverified risk in this project as of this writing
- [ ] Neon/PostGIS live integration verified (`external-verification-tracker.md` items 1/3)
- [ ] Relevant Anthropic live verification completed (item 2b at minimum — Report Explanation is
      user-facing in a paid report; item 2a/RRAG-1 is a separate, non-blocking concern)
- [ ] MapTiler commercial-use plan/license requirement resolved (item 8) — the Free tier is
      explicitly not an approved commercial-production licensing decision
- [ ] The $9.99 production price explicitly confirmed as still correct at go-live time (a quick
      re-check, not a re-derivation — `checkout-fulfillment/types.ts`'s `DEFAULT_REPORT_PRICE_CENTS`
      or the `REPORT_PRICE_CENTS` override, whichever is actually configured in Production)
- [ ] All required secrets present and correctly production-scoped (§1's table) — specifically
      confirm no test-mode Stripe key or placeholder Resend/email-from value survives into the
      live-enabled Production environment

**As of this writing, none of the boxes above are checked** — this checklist exists so that fact is
explicit and visible, not implied by "the code is written and the build passes."

---

## 11. External-Verification Tracker

Updated in this pass **only from evidence this Operations session actually has** (i.e., none of
the credentialed/live items were run — nothing new was checked off). One new item was added
because a genuinely new, real, currently-unverified concern was identified while writing this
runbook (§9's Vercel platform-log finding) — see
`aidlc-docs/operations/external-verification-tracker.md` item 11. Items 1, 2a/2b, 3, 4, 5, 6, 7, 8,
9, 10 all remain exactly as they were: real, open, not fabricated as complete because a document
was written about them. **Do not check off a credentialed/live item without actually running it**
— this remains the standing discipline of this entire project, unchanged by reaching the
Operations stage.

---

## 12. Incident / Support Procedures

Proportional to a solo-founder prototype — direct database/dashboard inspection and a documented
manual action, not an admin UI or an on-call runbook automation platform (none of that is
introduced here, consistent with the explicit "no new infrastructure" instruction).

| Scenario | Diagnosis | Recovery |
|---|---|---|
| **Paid customer stuck "generating"** | Check `Order.state` (should be `PAID`) and the associated `ReportGenerationJob.state`. `QUEUED` past a few minutes → Cron should self-heal (§6 check 1); `IN_PROGRESS` and not moving → see §7's stranded-`IN_PROGRESS` procedure. | Manual `reclaimStaleJob` + re-`start()` if genuinely stuck `IN_PROGRESS`; otherwise wait for the next Cron cycle. |
| **Paid customer's generation `FAILED`** | Read `failure_reasons` on the job; cross-reference `JOB_FAILED` logs. | Automatic refund already triggered (BR-U2B-6) — confirm `Order.state` moved to `REFUND_PENDING` with `refundReason: GENERATION_FAILURE`. If the customer needs the report and the failure is now fixable (e.g., a transient upstream outage), a real retry requires a new `ScreeningRequest`/checkout — no automatic re-queue from `FAILED`, unchanged scope limit from Unit 2. |
| **Refund stuck `REFUND_PENDING`** | See §3's Refund Diagnosis. | Expected to self-heal via Cron check 3 within ~2-7 minutes; if not, check `STRIPE_SECRET_KEY` validity and Stripe's own dashboard for the specific `refundIdempotencyKey`/payment intent. |
| **`REFUND_FAILED`** | Stripe explicitly reported failure — check the Stripe Dashboard for the specific reason (already-refunded charge, disputed charge, etc.). | Manual, human resolution only (BR-U2B-5's explicit scope) — this is exactly the case BR-U2B-7's "manual refund path exists without Unit 3's admin UI" was built for: a direct callable function (`order-payment.processRefund`), not an automatic retry. |
| **Report `COMPLETE` but email not "successfully accepted"** | Check `deliveryStatus` on the active credential (§9). `EMAIL_PENDING`/`EMAIL_FAILED` past 10 min → Cron check 4 should retry. | If still failing after several retries, check `RESEND_API_KEY` validity and Resend's own dashboard for the specific rejection reason (invalid recipient, domain reputation, etc.) — a real, non-transient Resend-side problem needs a human decision, not more automatic retries. |
| **Stripe webhook not arriving at all** | Check Stripe Dashboard's delivery log for the endpoint — if Stripe shows zero delivery attempts, the problem is on Stripe's configuration side (wrong URL, endpoint disabled) or a DNS/routing issue, not this application's code. | Fix the endpoint configuration in Stripe first. **Corrected 2026-08-25 — Stripe's actual missed/failed-delivery recovery is broader than "gone forever," do not state otherwise**: live-mode automatic retries can continue for up to 3 days; sandbox/test-mode deliveries retry several times over a few hours; an individual event can be **manually resent from the Stripe Dashboard for up to 15 days** after it occurred; the **Stripe CLI can manually resend an event for up to 30 days**. A disabled/deleted endpoint destination does stop *future* automatic retries, but manual reconciliation via the Dashboard or CLI remains available well after that window closes — check for a specific missed event by ID there before assuming it's unrecoverable. Cron check 1/2 remain the backstop only for the separate, local `start()`-loss case (Stripe *did* deliver, this app's own follow-up trigger was lost), not for "Stripe never tried to call us at all." |
| **Workflow failed / never started** | Check `.next` build's workflow manifest was correct at deploy time (§1); check Workflow observability (§5) for the specific run; check whether the triggering `start()` call's own log line exists. | Cron checks 1, 2, 3, and 5 are the designed backstop for "the trigger itself was lost" (or the process running it was killed outright, check 5) — if reconciliation also isn't resolving it, escalate as a genuine defect, not routine. |
| **PDF rendering failure** | `PDF_RENDER_FAILURE` log event (unchanged from Unit 2), never corrupts the underlying artifact. | Retryable on next request (`getOrRenderReportPdf` re-attempts whenever no cached rendering exists) — if consistently failing on Vercel specifically, see §8's likely-failure-modes list. |
| **Duplicate charge automatically entering refund path** | This is the corrected (2026-08-25), *intended* behavior for BR-U2B-1 point 4 — confirm via `refundReason: DUPLICATE_PAYMENT` and a real, truthful `paidAt` on the second Order (§3's Refund Diagnosis). | No recovery action needed beyond the automatic refund already in flight — this is the system working as designed, not an incident, unless the refund itself then also gets stuck (see the `REFUND_PENDING`/`REFUND_FAILED` rows above). |

---

## Explicitly N/A / Not Introduced

Consistent with the explicit Operations-stage instruction and Infrastructure Design's unchanged
scope: no queue, no Redis, no additional worker host, no APM/tracing platform, no microservice, no
admin dashboard/UI (manual DB/script intervention remains the documented path for everything in
§12, same posture as Unit 2). None of these become justified merely because Operations as a stage
exists — only a concrete requirement demonstrating a real need would justify one, and none
currently do.
