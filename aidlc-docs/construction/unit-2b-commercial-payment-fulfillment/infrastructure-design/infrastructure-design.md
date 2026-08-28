# Unit 2B: Infrastructure Design

**Amended 2026-08-24 by the founder's deployment-platform pivot** — see
`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md` for the full,
dated decision record and the current-documentation research behind it. This document was
generated once already, targeting Railway, earlier the same day; it is amended in place (not kept
as a separate historical copy) since Unit 2B had not yet left Infrastructure Design when the pivot
arrived, per the founder's explicit instruction not to restart the unit's workflow. Unit 1 and
Unit 2's own Infrastructure Design documents are untouched and remain accurate for what was
actually built and deployed for them (Railway).

Every decision below maps to an already-approved NFR Design pattern or logical component. Only the
**execution/lifecycle layer** changes from the Railway-targeted version of this document — every
domain invariant (Order/OrderState, ReportGenerationJob, GenerationAuthorization, atomic
BR-U2B-15 fulfillment, refund idempotency, webhook idempotency, report-access hashing, evidence
immutability) is unchanged.

## Component-to-Infrastructure Mapping

| Component | Infrastructure Choice | Rationale |
|---|---|---|
| Next.js application (web + API routes) | **Vercel** | Founder's canonical platform going forward — native Next.js support, simple GitHub-integrated deployment, no separate hosting relationship to maintain. |
| `order-payment` (Order, OrderState, ProcessedStripeEvent, checkout/webhook/refund logic) | Vercel Functions (API routes), same Neon database | Unchanged domain logic; the webhook route and checkout-creation route are ordinary Vercel Functions. |
| `checkout-fulfillment` (coordination, guest status-read endpoint) | Vercel Functions | Thin coordination — no new infrastructure. |
| **Report generation execution** *(materially changed — see "Execution Model" below)* | **A durable Vercel Workflow** (`reportGenerationWorkflow`), started immediately when a `ReportGenerationJob` is created | Replaces the Railway in-process poller. Durable execution (survives crashes/deploys, replays deterministically) is a Vercel-native capability, verified against current documentation — not something this application has to build itself. |
| **Commercial fulfillment reconciliation** (NFR Design Pattern 9) | *(materially changed)* Split between (a) steps embedded directly in the durable workflows themselves, which now cover most of what Pattern 9's checks existed to catch, and (b) a low-frequency **Vercel Cron** job as a backstop for the one gap workflow durability doesn't itself close (a `start()` call whose own response is lost) | See "Execution Model" — Pattern 9's original 3 checks are re-derived below, most already closed by the workflow model itself. |
| Database (all persisted entities) | **Neon PostgreSQL + PostGIS**, same dedicated branch established in Unit 2 | Unchanged provider. **Connection strategy changed** — see "Database Connection Model" below. |
| PostGIS spatial queries | Same Neon database, via the existing adapter | Unchanged; simple single-query calls, no transaction needed — uses the HTTP driver. |
| Payment provider | **Stripe** (Checkout Sessions, webhooks, refunds), official `stripe` SDK | Unchanged from the Railway-targeted version. |
| Stripe webhook endpoint | `POST /api/webhooks/stripe`, a Vercel Function (Next.js Route Handler) | No API gateway. Raw body preserved (Vercel Route Handlers support reading the raw request body before parsing, same requirement as before); 65,536-byte size bound enforced before signature verification. |
| Email provider | **Resend**, via the `email-delivery` adapter | Unchanged. Now typically invoked as a workflow step (durable, auto-retried) rather than a plain async call from a route handler. |
| Reconciliation backstop | **Vercel Cron** (`vercel.json` `crons` entry, or a scheduled Vercel Function), calling a protected route on a low-frequency schedule | Vercel-native scheduling — no separate scheduler service. Explicitly a backstop, not the primary execution mechanism (see below). |
| PDF rendering | Headless Chromium via **`@sparticuz/chromium` + `puppeteer-core`**, invoked from a Vercel Function (or a workflow step, if rendering time warrants durability) | The documented, current, Vercel-compatible replacement for the Railway-targeted containerized-Chromium approach — same underlying rendering technique (headless Chromium), different binary-provisioning mechanism required by Vercel's read-only filesystem. **Not yet proven against a real deployment** — tracked as a new external-verification item, not assumed from documentation alone. |
| `ReportPdfRendering` storage | Same Neon database, `bytea` column | Unchanged. |
| Secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`) | **Vercel environment variables**, scoped per environment (Development / Preview / Production) | Replaces Railway's native secrets facility with Vercel's equivalent — same never-logged, never-`NEXT_PUBLIC_*` discipline. |
| MapTiler browser key | Client-side configuration (public, origin-restricted) | Unchanged — still not a secret; still Free tier through Construction, still a pre-commercial-launch checkpoint (unchanged from the Railway-targeted version). |
| CI | **GitHub Actions**, unchanged blocking checks | Deployment target changes (Vercel instead of Railway); the CI checks themselves (typecheck, deterministic+component tests, build, Playwright smoke) are platform-independent and unchanged. |
| Deployment trigger | **Vercel's native GitHub integration**, deploying from protected `main` after required checks pass; Preview deployments for pull requests | Vercel's own git integration replaces Railway's. Preview deployments are a genuine new capability (Railway's model didn't have an equivalent this project used) — used for manual review, not made a dependency of deterministic CI correctness (per explicit instruction). |
| Health check | `/healthz`, unchanged endpoint | Vercel Functions don't need a platform-level health-check configuration the way Railway's persistent-Service model did (there's no long-lived process to attest is "ready") — `/healthz` is kept as an application-level diagnostic endpoint, not a deployment gate. |
| Logs | **Vercel's native log collection/drain**, receiving the existing structured JSON logger's output; Workflow runs additionally get Vercel's built-in Workflow observability (per-step traces, automatically, no extra code) | No new observability platform introduced — Workflows' own observability is a bonus this design gets for free from the platform, not something built. |

## Execution Model — Durable Workflows, Not a Persistent Poller

*(This section replaces the Railway-targeted version's polling-loop design entirely — the
domain-level requirements it satisfies are unchanged from NFR Design's Pattern 9 and Workflow 5's
approved business logic; only the mechanism changes.)*

### Report generation

```
Webhook confirms PAID (or INTERNAL_PROTOTYPE authorizes generation)
    |
    v
Atomic local DB transaction (BR-U2B-15, unchanged) creates ReportGenerationJob (QUEUED)
    |
    v
Immediately after the transaction commits: start(reportGenerationWorkflow, [job.id],
    { hookToken: `report-generation:${job.id}` })  -- the hook token is DEFENSE-IN-DEPTH ONLY
    (see "Workflow-Start Idempotency" below) -- it narrows, but does not eliminate, the chance of
    a duplicate run; it is never the correctness boundary.
    |
    v
Workflow's FIRST side-effectful step: claimQueuedJob(job.id) -- the EXISTING, unmodified atomic
    QUEUED -> IN_PROGRESS claim from Unit 2, now the authoritative admission gate for this run.
    - Claim affects a row (this run won it): proceed to the pipeline below.
    - Claim affects zero rows (another run already claimed or completed it): this run exits
      immediately, WITHOUT running Property Intelligence, PostGIS, the Rules Engine, Anthropic,
      artifact creation, or customer delivery.
    |
    v  (only for the run that won the claim)
Durable workflow runs the existing pipeline as steps: Property Intelligence -> PostGIS adapter
    -> Regulatory Rules Engine -> Report Explanation -> Evidence & Report Artifact persistence
    -> mark ReportGenerationJob COMPLETE
    |
    v
If VERIFIED_PAYMENT-authorized: the SAME durable workflow's next step issues/rotates a
ReportAccessCredential and sends the guest delivery email (Resend) -- durable, so a crash between
"job COMPLETE" and "email sent" is resumed automatically by the workflow's own replay, not by a
separate poller (this closes what NFR Design's Pattern 9a existed to catch, more directly than a
polling backstop could).
    |
    v
On failure (a step exhausts its built-in retries): a final step marks the job FAILED and, if
VERIFIED_PAYMENT-authorized, starts processRefundWorkflow (below) with reason GENERATION_FAILURE.
```

Report generation is **event/command-driven** — the workflow starts the moment a job exists, not on
the next poll tick. This directly satisfies the explicit instruction that primary execution must
not be "poll every minute for normal work." **Multiple workflow runs may exist for the same job —
this is expected and harmless. Only one may ever claim and execute it** (see "Workflow-Start
Idempotency" below for why this, not hook-token conflict detection, is the actual guarantee).

### Refund initiation and submission (BR-U2B-5/6/7, Pattern 9b/9c re-derived)

**Corrected 2026-08-24, post-approval founder review (Code Generation Part 1 review)**: the
original design below treated `REFUND_PENDING` as a dedup-exit state — a *second* workflow run
(e.g. one Cron starts because the *first* run's own `start()` response was lost, not because the
first run is still alive) would see the claim affect zero rows and exit without ever calling
Stripe, permanently stranding the refund. `REFUND_PENDING` must be treated as a **resumable**
state, not a claim-failure state:

```
processRefundWorkflow(orderId, reason) -- 'use workflow', started with a hookToken
    (`refund:${orderId}`, defense-in-depth only) from: (a) the report-generation workflow's failure
    path (automatic, GENERATION_FAILURE), (b) an internal-only manual-refund trigger
    (CUSTOMER_REQUEST / GOODWILL, invoked outside any HTTP route -- see BR-U2B-9's route-surface
    correction), or (c) the Cron backstop (below)
    |
    v
Load the Order and branch on its CURRENT state (mirrors order-payment.processRefund's own state
    machine exactly -- the workflow is a thin durable wrapper around that logic, not a second
    implementation of it):
    |
    +-- PAID: conditionally claim PAID -> REFUND_PENDING via `UPDATE ... WHERE state = 'PAID'`
    |         AND generate + persist Order.refundIdempotencyKey if one does not already exist.
    |         - Affects a row (this run won the claim): proceed to submit, below.
    |         - Affects zero rows (another run already claimed it): fall through to the
    |           REFUND_PENDING branch instead -- another run's claim just landed, and this run
    |           should still help ensure the Stripe submission happens, not simply exit.
    |
    +-- REFUND_PENDING: RESUMABLE, not a dedup-exit. Load the already-persisted
    |         refundIdempotencyKey (never regenerate it) and (re-)submit the Stripe refund using
    |         it -- this is the branch that actually closes the "start() response was lost" gap:
    |         whichever run reaches this branch, first or a later reconciliation-started one,
    |         submits with the SAME key, so Stripe's own deduplication makes a repeat submission
    |         safe regardless of how many runs reach this point.
    |
    +-- REFUNDED: exit successfully -- nothing to do.
    |
    +-- REFUND_FAILED: exit -- Unit 2B creates no new logical refund attempt automatically
    |         (manual/support resolution only, BR-U2B-5's scope decision, unchanged).
    |
    +-- any other state (PENDING, EXPIRED, ...): exit/reject -- not a valid refund-workflow
              starting state per the existing domain rules.

[submit step, reached only via the PAID or REFUND_PENDING branches above]
Submit the Stripe refund API call using Order.refundIdempotencyKey (the DB-PERSISTED key,
    generated once per logical refund attempt) as the Stripe idempotency key -- NEVER a Workflow
    step's own stepId. A reconciliation-started run resuming the same logical attempt gets a
    DIFFERENT stepId but must submit with the SAME Stripe key, which only the DB-persisted field
    guarantees; record stripeRefundId once Stripe acknowledges.
```

This correctly handles both crash windows named during review: (A) `PAID -> REFUND_PENDING`
commits, then the process/workflow dies before the Stripe call — a later run lands in the
`REFUND_PENDING` branch and submits using the persisted key; (B) Stripe accepts the refund but the
response is lost before `stripeRefundId` is recorded — a later run's `REFUND_PENDING` branch
submits again with the *same* key, and Stripe's own deduplication prevents a second real refund.
Final `REFUNDED`/`REFUND_FAILED` state continues to come **only** from a verified Stripe webhook
(an ordinary route handler, unchanged) — the workflow's job is only to ensure the local claim
happened and the Stripe call was actually (re-)made, never to declare the outcome itself. **No
duplicate refund may ever depend on the hook token preventing a second run** — the state-branching
logic above, keyed to the DB-persisted `refundIdempotencyKey`, is what actually prevents it; Stripe's
own idempotency-key deduplication is the independent second layer at the provider level.

### Workflow-Start Idempotency — Corrected 2026-08-24, Post-Approval Founder Review

**The database is the authoritative idempotency boundary, not Vercel Workflow's hook-token
mechanism.** This document's first draft described deterministic hook tokens (`hook.getConflict()`)
as providing run-level idempotent starts. That overstated what the platform actually guarantees:
`start()` can create a duplicate workflow run before that duplicate discovers a hook conflict — the
check is not atomic with run creation. Corrected design, binding on Code Generation:

- Hook tokens are **retained as defense-in-depth / in-flight-duplicate detection only** — never
  described or relied upon as providing exactly-once or atomic admission.
- **`ReportGenerationJob`'s existing atomic `QUEUED -> IN_PROGRESS` claim** (already built, Unit 2,
  unmodified) is the authoritative execution-idempotency mechanism for report generation — it is
  the workflow's first side-effectful step, not a separate concern layered on top.
- **The corrected refund state machine (`PAID` claims + persists `refundIdempotencyKey`;
  `REFUND_PENDING` resumes using that persisted key, never re-claims)** is the equivalent
  authoritative mechanism for refunds — see "Refund initiation and submission," above, for the
  full corrected design (itself amended post-review to fix exactly this: an earlier draft
  incorrectly treated `REFUND_PENDING` as a dedup-exit branch, which would have stranded a refund
  interrupted between the local claim and the Stripe call). Stripe's own idempotency key
  (`Order.refundIdempotencyKey`, DB-persisted, never a Workflow step's `stepId`) is the
  independent second layer at the provider level.
- **`workflowRunId`, if persisted, is for observability/support/debugging only** — never a
  precondition for job or refund correctness, never required to be successfully recorded for the
  domain state machine to proceed correctly.
- **Every workflow step is assumed at-least-once, not exactly-once.** Durability guarantees a
  step's already-recorded output survives a replay; it does not by itself guarantee the step's
  underlying side effect only ever executes once. Every side-effectful step must be independently
  idempotent through an existing mechanism (a DB conditional transition/uniqueness constraint, a
  Stripe idempotency key, `ReportAccessCredential`'s rotation rules) — never merely because it runs
  inside a "durable" workflow.
- This correction changes no infrastructure and does not reopen the platform decision — it
  redirects which existing, already-trusted mechanism (Postgres atomic claims, already built for
  exactly this purpose in Unit 2) is actually load-bearing.

### The Cron backstop (what workflow durability does *not* itself cover)

Workflow durability covers crashes *after* a workflow has actually started. It does not cover the
one hop before that: the `start()` call itself failing, timing out, or its response being lost —
exactly the case the founder's instruction called out explicitly. Cron's job is to inspect
**durable database state**, never to reason about whether a Workflow run exists (per the
Workflow-Start Idempotency correction above — Cron does not need to know). A low-frequency
**Vercel Cron** job (every 5 minutes, confirmed supported on the project's Vercel Pro plan — much
lower frequency than the Railway design's 60-second poller, since it now exists purely as a
backstop for this one rare case, not as the primary discovery mechanism) checks:

1. `ReportGenerationJob` rows `QUEUED` older than a short grace period (~2 minutes) — re-`start()`
   the report-generation workflow. Correctness does not depend on knowing whether the original
   `start()` succeeded: if it did, the reconciling run's `claimQueuedJob` step affects zero rows and
   it exits harmlessly; if it didn't, the reconciling run is the one that actually gets the job
   claimed and executed. Cron never inspects `IN_PROGRESS`/`COMPLETE`/`FAILED` jobs this way — an
   ordinary report-generation execution is never re-started for those states.
2. `Order` rows `PAID` with an associated `ReportGenerationJob.state = FAILED` — re-`start()`
   `processRefundWorkflow`. The reconciling run lands in the `PAID` branch: if a refund is already
   underway (another run already claimed it), the reconciling run's claim affects zero rows and it
   falls through to the `REFUND_PENDING` branch instead of exiting — ensuring the Stripe submission
   still gets attempted rather than being silently skipped.
3. `Order` rows `REFUND_PENDING` older than a short grace period with no `stripeRefundId` recorded
   — re-`start()`/resume `processRefundWorkflow`. This is the case the corrected `REFUND_PENDING`
   branch (above) exists for: the reconciling run lands directly in that branch, loads the
   already-persisted `refundIdempotencyKey`, and (re-)submits to Stripe — it does **not** attempt
   the `PAID` claim first and does **not** exit merely because the order is already
   `REFUND_PENDING`.
4. `ReportAccessCredential` rows still `EMAIL_PENDING` past the 5-minute staleness threshold
   (unchanged from NFR Design) — a genuinely rare residual case now, since the delivery step's own
   built-in step-retry already absorbs most transient failures; Cron rotates and retries as a final
   backstop.

Every Cron check is itself idempotent — overlapping/repeated invocations are harmless, for the same
reason the underlying workflow claims are (a conditional DB action, never a "have I already
handled this" flag Cron has to track itself). This satisfies the original Pattern 9 requirement via
a combination of workflow durability (for most cases) and this much-lighter Cron backstop (for the
residual "did the trigger itself land" gap).

## Database Connection Model — Revisited for Vercel

*(The Railway-targeted version of this document specified one long-lived, application-wide
`neon-serverless` `Pool`. That configuration is **not** carried forward — Vercel Functions are
short-lived, per-invocation execution contexts, and Neon's own documentation is explicit that a
WebSocket `Pool`/`Client` cannot outlive a single request on a platform like Vercel; it must be
opened, used, and closed entirely within one invocation.)*

**Decision**: two drivers, each used for what it's actually suited to — not "one consistent client"
(that preference was specifically justified by Railway's persistent-process model, which no longer
applies):

- **`neon-http` (`@neondatabase/serverless`'s `neon()` + `drizzle-orm/neon-http`) for everything
  that doesn't need a genuine interactive transaction** — the large majority of this application's
  reads/writes (ordinary CRUD, PostGIS single-query calls, job-state reads, most workflow steps).
  Stateless HTTP, no connection lifecycle to manage at all — a natural fit for short-lived
  serverless/workflow-step invocations, and Neon's own documented recommendation for this shape of
  query.
- **`drizzle-orm/neon-serverless` (`Pool`) scoped entirely within one request handler** — used
  **only** inside the Stripe webhook route's atomic BR-U2B-15 fulfillment sequence (the one place
  this application genuinely needs a multi-statement, conditionally-branching transaction). The
  `Pool` is created, used for the transaction, and closed — all before that single request handler
  returns. Never held as a module-level singleton, never reused across invocations.

Migrations continue to use a direct connection (unchanged in spirit from the Railway-targeted
version — the mechanics of *how* that connection is made are a Code Generation/CI detail, not
re-decided here).

## Secrets Inventory (Deployed Environment)

| Name | Classification | Notes |
|---|---|---|
| `DATABASE_URL` | Server secret | Vercel environment variable, scoped per environment (Development/Preview/Production); never logged. |
| `ANTHROPIC_API_KEY` | Server secret | Same, unchanged from Unit 1/2. |
| `STRIPE_SECRET_KEY` | Server secret | Same hard test/live separation as the Railway-targeted version — test-mode for Development/Preview, live-mode provisioned to Production only as an explicit commercial-launch step, never automatically. |
| `STRIPE_WEBHOOK_SECRET` | Server secret | Must match the same mode (test/live) as `STRIPE_SECRET_KEY` in that environment. |
| `RESEND_API_KEY` | Server secret | Environment-specific (not "test-mode" — Resend has no such split, per the corrected framing already established). |
| MapTiler browser API key | Public client configuration, **not a secret** | Unchanged — origin-restricted, not hidden via env-var secrecy. |

## Commercial-Launch Infrastructure Checkpoint (MapTiler — unchanged)

Unchanged from the Railway-targeted version of this document: MapTiler Free continues through
development/CI/demos/non-commercial testing; before enabling real public paid usage (live Stripe
charging), review MapTiler's then-current commercial plan and upgrade or replace it — tracked as
`external-verification-tracker.md` item 8, a pre-commercial-launch item, not a Construction
blocker. The platform pivot does not remove this requirement.

## Carry-Forward Implementation Requirements (binding on Code Generation)

1. Report generation is triggered by an explicit `start()` call immediately after the atomic
   fulfillment transaction commits — never by a polling loop discovering `QUEUED` rows as the
   primary mechanism.
2. **The database is the authoritative idempotency boundary, never Vercel Workflow's hook-token
   mechanism** (corrected — see "Workflow-Start Idempotency" above). `reportGenerationWorkflow`'s
   first side-effectful step must be the existing `claimQueuedJob` atomic claim; a claim affecting
   zero rows must exit the run immediately without executing the pipeline.
   `processRefundWorkflow` must branch on the `Order`'s *current* state, not attempt a single
   claim-then-exit: `PAID` claims and persists `refundIdempotencyKey` if absent, then falls through
   to submit (or falls through to the `REFUND_PENDING` branch if the claim lost a race);
   `REFUND_PENDING` is **resumable** — it loads the already-persisted key and (re-)submits, it
   never exits merely because the state is already `REFUND_PENDING`; `REFUNDED`/`REFUND_FAILED`
   exit. Deterministic hook tokens (`report-generation:${jobId}`, `refund:${orderId}`) may still be
   used, but only as defense-in-depth/in-flight-duplicate detection — code, comments, and any
   future documentation must not describe them as providing exactly-once or atomic admission.
3. **The Stripe refund idempotency key is `Order.refundIdempotencyKey` (DB-persisted, generated
   once per logical refund attempt) — never a Vercel Workflow step's `stepId`.** A
   reconciliation-started run resuming the same logical refund attempt receives a *different*
   `stepId` on every run but must submit with the *same* Stripe key; only the DB-persisted field
   guarantees that. Workflow step `stepId`s remain useful for other retry-safe external calls where
   the *step itself* (not a cross-run logical attempt) is the unit of idempotency, and for
   observability/tracing — but never as a substitute for requirement 2's database-level state
   machine.
4. The Cron reconciliation backstop runs at a genuinely low frequency (starting at 5 minutes,
   confirmed supported on the project's Vercel Pro plan) and performs **only** conditional,
   idempotent actions, relying on requirement 2's database claims to make repeated/duplicate
   `start()` calls safe — it must never be able to create a duplicate `ReportGenerationJob`, a
   duplicate logical refund, or two simultaneously-valid delivery credentials for the same report.
5. The Neon WebSocket `Pool` used for the atomic fulfillment transaction is created, used, and
   closed entirely within that one request handler's execution — never held across invocations,
   never used outside that specific transaction's scope.
6. Stripe/Resend environment separation rules (hard test/live separation for Stripe; environment-
   specific, non-"test-mode" keys for Resend, CI restricted to Resend's documented test addresses)
   carry forward unchanged from the Railway-targeted version of this document.
7. PDF rendering via `@sparticuz/chromium` + `puppeteer-core` must be proven against a real Vercel
   deployment before being treated as verified — tracked as a new external-verification item (see
   `external-verification-tracker.md` item 9), not assumed from documentation.
8. Vercel's multi-region workflow pinning is **not** used — this application runs single-region;
   noting this explicitly so a future session doesn't accidentally opt into a still-beta-versioned
   SDK feature without a deliberate reason to.
9. MapTiler Free remains a prototype/pre-commercial-launch choice — unchanged checkpoint.
10. Every workflow step is treated as **at-least-once**, never exactly-once, execution — a step
    being inside a "durable" workflow is never, by itself, grounds to skip idempotency handling for
    that step's side effect. `workflowRunId`, if persisted anywhere, is for
    observability/debugging only and must never be a precondition for `ReportGenerationJob`/`Order`
    state-machine correctness.

## Explicitly Not Present

Kubernetes, a second backend framework, a separate API server, a generic event bus, Kafka, Redis,
an external workflow provider outside Vercel's own, a separate worker-hosting platform, a payment
microservice, a GIS microservice, a dedicated PDF microservice (the headless-Chromium approach
stays in-process/in-function, adapted for Vercel's filesystem constraints — not extracted to a
separate service), an API gateway, an APM/tracing platform beyond what Vercel's own Workflow
observability already provides. None of these are introduced by this pivot — Vercel's own native
capabilities (Functions, Workflows, Queues under the hood, Cron) plus the existing Neon-backed
domain model are sufficient for everything this unit's approved requirements actually demonstrate a
need for.
