# Unit 2B: Deployment Architecture

**Amended 2026-08-24 by the founder's deployment-platform pivot** — see
`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`. Replaces this
document's Railway-targeted version (generated earlier the same day, amended in place per explicit
instruction). Unit 1/2's own deployment-architecture.md documents are unchanged and remain accurate
for what was actually built for them.

## The Running System

```
                Browser
                   |
                   | HTTPS
                   v
          Vercel — Next.js application (Functions, on demand)
          -------------------------------------------------------
          API routes / Route Handlers (checkout, status, webhook)
          order-payment / checkout-fulfillment logic
          PostGIS adapter, Property Intelligence, Report Explanation
          email-delivery adapter
          structured logger
          -------------------------------------------------------
             |          |            |            |          |
             |          |            |            |          +--> Anthropic
             |          |            |            +--> Resend (transactional email)
             |          |            +--> Stripe (Checkout, webhooks, refunds)
             |          +--> King County / Legistar
             +--> Neon PostgreSQL + PostGIS (neon-http default; a per-request neon-serverless
                  Pool only inside the webhook's atomic fulfillment transaction)

          Vercel Workflows (durable, managed by the platform)
          -------------------------------------------------------
          reportGenerationWorkflow  -- full pipeline + guest delivery, as durable steps
          processRefundWorkflow     -- REFUND_PENDING transition + Stripe submission, as steps
          -------------------------------------------------------
             (workflow steps call back into the same application code/Neon/Stripe/Resend/
              Anthropic as above -- Vercel Functions execute the step code; Vercel manages
              the durable event log/replay)

          Vercel Cron (low-frequency backstop, ~5min)
          -------------------------------------------------------
          reconciliation route -- idempotently (re-)starts workflows for the rare case where
          a start() call's own result was lost; never the primary execution path

Browser:
  |
  +------> Stripe-hosted Checkout page (redirect, not proxied through Vercel)
  |
  +------> MapTiler vector tiles (origin-restricted public browser key, unchanged)
```

No persistent process exists anywhere in this diagram — every box is either an on-demand Vercel
Function invocation or a durable Workflow run (itself composed of Vercel Function invocations for
each step, orchestrated and made durable by the platform). This is the central structural
difference from the Railway-targeted version, where the poller, orchestrator, and PDF renderer all
lived inside one long-running process.

## Request/Execution Flows

### Synchronous (checkout initiation, status reads) — unchanged in shape from the Railway-targeted version
```
Browser -> Vercel Function -> checkout-fulfillment.createCheckoutSession
    -> order-payment: look up/create/resume Order (Pattern 1, unchanged) -> Stripe API
    -> Checkout URL returned -> browser redirects to Stripe-hosted Checkout

Browser (status page) -> Vercel Function -> checkout-fulfillment (guest status read, Pattern 4,
    unchanged) -> Order/ReportGenerationJob state -> minimized GuestOrderStatus -> response
    (Cache-Control: no-store, Referrer-Policy: no-referrer)
```

### Webhook-driven (payment confirmation) — mechanism for step 5 changes
```
Stripe -> POST /api/webhooks/stripe (Vercel Function, raw body <=65,536 bytes)
    -> signature verification -- invalid: reject, no transition
    -> ProcessedStripeEvent ledger check (neon-http) -- already seen: no-op, return success
    -> ATOMIC local transaction, via a Pool opened/used/closed within THIS request only
       (neon-serverless): Order PENDING -> PAID, verified references + customerEmail persisted,
       GenerationAuthorization{VERIFIED_PAYMENT} persisted, createReportGenerationJob (unmodified,
       called within this transaction), ProcessedStripeEvent recorded
       -- any failure: whole transaction rolls back, Order stays PENDING, Stripe's own redelivery
          safely reprocesses from scratch
    -> [NEW] immediately after commit: start(reportGenerationWorkflow, [job.id],
       { hookToken: `report-generation:${job.id}` }) -- fire-and-forget from the handler's
       perspective; the hook token is DEFENSE-IN-DEPTH ONLY (start() can still create a duplicate
       run before a conflict is discovered) -- the actual correctness guarantee is the workflow's
       own first step, below. If this call itself fails or its response is lost, the Cron backstop
       notices the still-QUEUED job and safely re-starts it later.
    -> handler returns success to Stripe (report generation proceeds durably, independent of this
       HTTP request's lifetime)
```

### Report generation — now a durable Workflow, not an in-process poller loop

**Corrected 2026-08-24, post-approval founder review**: the database claim below, not the hook
token above, is what actually prevents two workflow runs from both executing the pipeline for the
same job. Multiple runs may exist; only the one that wins the claim proceeds.

```
reportGenerationWorkflow(jobId)  'use workflow'
    |
    +--> claimJob  'use step'  -- the EXISTING, unmodified atomic QUEUED -> IN_PROGRESS claim
    |        (Unit 2's claimQueuedJob) -- THIS is the authoritative admission gate, not the hook
    |        token used to start() this run.
    |        - Claim affected a row (this run won it) -> continue below.
    |        - Claim affected zero rows (another run already claimed/completed this job) -> exit
    |          immediately. No further steps run.
    |
    v  (only for the run that won the claim)
    +--> loadJobContext  'use step'  (neon-http read)
    +--> retrieveParcelGeometry  'use step'  (Property Intelligence / King County)
    +--> computeSpatialAnalysis  'use step'  (PostGIS adapter, neon-http, single query)
    +--> evaluateRegulatoryRules  'use step'  (pure, in-memory -- unchanged Rules Engine)
    +--> synthesizeExplanation  'use step'  (Report Explanation / Anthropic, degrades per BR-U2-8)
    +--> persistArtifact  'use step'  (Evidence & Report Artifact, neon-http write)
    +--> markJobComplete  'use step'
    +--> [if VERIFIED_PAYMENT] deliverGuestReportAccess  'use step'
              (issue/rotate ReportAccessCredential, send via Resend)
    |
    on any step exhausting its built-in retries:
    +--> markJobFailed  'use step'
    +--> [if VERIFIED_PAYMENT] start(processRefundWorkflow, [orderId, "GENERATION_FAILURE"],
              { hookToken: `refund:${orderId}` })
```
Never depends on an HTTP request remaining open, never depends on a process staying alive between
ticks — the platform's own durable-execution guarantee (deterministic replay after a crash or
deployment) is what makes this safe, verified against current Vercel documentation, not assumed.

### Refund lifecycle — now a durable Workflow for the local-transition-plus-Stripe-call pair

**Corrected (Code Generation Part 1 review)**: the conditional DB transition below, not the hook
token used to `start()` the run, is what prevents duplicate Stripe calls — but `REFUND_PENDING`
must be treated as **resumable**, not a dedup-exit branch, or a reconciliation-started second run
would silently strand a refund interrupted between the local claim and the Stripe call.

```
processRefundWorkflow(orderId, reason)  'use workflow', started via hookToken `refund:${orderId}`
    (defense-in-depth only)
    |
    +--> loadOrder  'use step'  -- branch on the Order's CURRENT state:
    |
    |    PAID: conditionally claim via UPDATE ... WHERE state = 'PAID', generating/persisting
    |          Order.refundIdempotencyKey if absent.
    |          - Affected a row (this run won the claim) -> proceed to submit, below.
    |          - Affected zero rows (another run already claimed it) -> fall through to the
    |            REFUND_PENDING branch instead of exiting -- still ensure Stripe gets called.
    |
    |    REFUND_PENDING: RESUMABLE. Load the already-persisted refundIdempotencyKey (never
    |          regenerate it) -> proceed to submit, below. This is the branch a
    |          reconciliation-started run lands in when the original start()'s response was lost.
    |
    |    REFUNDED / REFUND_FAILED: exit. No submission, no new logical attempt.
    |
    v  (only via the PAID or REFUND_PENDING branches)
    +--> submitStripeRefund  'use step'  (Stripe API call using Order.refundIdempotencyKey -- the
              DB-PERSISTED key, NEVER this step's own stepId, since a resuming run gets a
              different stepId but must submit with the same Stripe key; records stripeRefundId)

[separate, unchanged, ordinary webhook path]
Stripe confirms refund result -> POST /api/webhooks/stripe -> verified event ->
    REFUND_PENDING -> REFUNDED or REFUND_FAILED (only from a verified event, never from the
    workflow's own steps)
```

### PDF (lazy, derived) — rendering technique unchanged, provisioning mechanism changed
```
Browser requests PDF via reportAccessToken
        |
        v
resolveByAccessToken -> EvidenceReportArtifact (already COMPLETE, immutable)
        |
        v
Existing ReportPdfRendering for this artifact/version? -> yes: return it
   -> no: render (headless Chromium via @sparticuz/chromium + puppeteer-core, in a Vercel
          Function) -> persist ReportPdfRendering (bytea, Neon, via neon-http) -> return it
```
Same immutable-snapshot-only guarantee as before (never re-runs GIS/rules/AI) — only the Chromium
binary-provisioning mechanism changes for Vercel's read-only filesystem, not the rendering approach
or the domain guarantee.

### Reconciliation Cron — new, backstop only

Cron reasons about **database state only** — it never needs to know whether a Vercel Workflow run
exists for a given job/order (that's exactly the point of the Workflow-Start Idempotency
correction: the database claim, not run-existence, is authoritative).

```
Vercel Cron (every ~5 minutes, Pro plan confirmed) -> GET /api/cron/reconcile (protected route)
    -> ReportGenerationJob rows QUEUED older than ~2min -> start(reportGenerationWorkflow)
       (safe regardless of whether the original start() succeeded: claimQueuedJob affects zero
       rows if a run already claimed it, or actually claims/executes it if none did)
    -> Order rows PAID with an associated FAILED job -> start(processRefundWorkflow)
       (lands in the PAID branch; if a refund is already underway the claim affects zero rows and
       this run falls through to the REFUND_PENDING branch instead of exiting)
    -> Order rows REFUND_PENDING with no stripeRefundId, older than a grace period ->
       start(processRefundWorkflow) (lands DIRECTLY in the resumable REFUND_PENDING branch --
       loads the persisted refundIdempotencyKey and (re-)submits; never attempts the PAID claim
       first, never exits merely because the state is already REFUND_PENDING)
    -> stale EMAIL_PENDING credentials (past the 5min threshold) -> rotate and retry
```
Every action here is conditional and idempotent at the database level; this route is explicitly a
backstop for the "the `start()` call's own result was lost" gap, never the primary way normal-path
work gets discovered, and never dependent on Workflow hook-token behavior for its safety.

## External Dependencies

| Dependency | Called From | Auth |
|---|---|---|
| Neon PostgreSQL + PostGIS | Vercel Functions and Workflow steps (all components) | `DATABASE_URL` (server secret); `neon-http` by default, a per-request `neon-serverless` Pool only inside the webhook's atomic transaction |
| King County GIS, Seattle Legistar | Unchanged from Unit 1/2 | Unchanged |
| Anthropic | Rule Research Assistant, Report Explanation (now typically invoked as a workflow step) | `ANTHROPIC_API_KEY` (server secret) |
| Stripe | `order-payment` (Checkout Session creation, refund submission step); the webhook route (inbound, signature-verified) | `STRIPE_SECRET_KEY` (server secret, outbound); `STRIPE_WEBHOOK_SECRET` (server secret, inbound verification); hard test/live separation |
| Resend | `email-delivery` adapter, invoked from the guest-delivery workflow step | `RESEND_API_KEY` (server secret, environment-specific) |
| MapTiler Cloud | The **browser**, directly — not proxied through Vercel | Origin-restricted public browser key, unchanged |

## Explicitly Not Present

Kubernetes, a second backend framework, a separate API server, a generic event bus, Kafka, Redis,
an external workflow provider (Vercel Workflows is used, not a third-party one), a separate
worker-hosting platform, a payment microservice, a GIS microservice, a dedicated PDF microservice,
an API gateway, an APM/tracing platform beyond Vercel's own built-in Workflow observability. If
future evidence demonstrates a genuine need for something beyond Vercel's native capabilities, that
becomes a reviewed infrastructure change at that time, not something introduced speculatively here.

## CI/CD Flow

```
Pull request
    |
    v
GitHub Actions (dependency install, typecheck, npm test [deterministic + component, including the
                Order/webhook/workflow-step tests], production Next.js build, Playwright smoke)
    |
    v
required checks pass  ---->  merge blocked if any check fails
    |
    v
merge to protected main
    |
    v
Vercel's native GitHub integration observes main
    |
    v
Vercel production deployment (Functions + Workflow definitions deployed together;
                               migrations applied to the dedicated Neon branch as a build/deploy
                               step -- failure blocks activation, same requirement as before)
    |
    v
new deployment becomes active (Stripe/Resend credentials for this environment already provisioned
per the Stripe Environment Separation / Resend Environment Handling rules -- never auto-enabled;
Vercel Skew Protection keeps in-flight Workflow runs on the deployment version they started on)
```

**New**: Vercel Preview Deployments exist for every pull request automatically — used for manual
review of a change before merge, not made a dependency of deterministic CI correctness (the
blocking checks above run independently of whether a preview deployment succeeds).

**Unchanged**: the live Stripe test-mode integration job and the Stripe CLI end-to-end webhook
smoke remain non-blocking/external verification, exactly as designed before the platform pivot —
only the deployment target they eventually run against changes (Vercel instead of Railway).
