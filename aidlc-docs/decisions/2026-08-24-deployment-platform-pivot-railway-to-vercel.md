# 2026-08-24 — Deployment Platform Pivot: Railway → Vercel

**Status**: Decided (founder decision), **APPROVED 2026-08-24 with two rounds of targeted
correction** applied post-review — see "Correction: Workflow-Start Idempotency" and "Correction:
Refund Resumability and INTERNAL_PROTOTYPE Route Exposure" below. Historical Railway decision
preserved, not rewritten — see
`aidlc-docs/construction/unit-2-report-generation-presentation-prototype/infrastructure-design/`
and `aidlc-docs/construction/shared-infrastructure.md`'s "Established by Unit 2" Railway section
for the original, unaltered record.

## Previous

Railway Hobby-tier, one persistent Node.js/Next.js Service (serverless/app-sleeping disabled), with
an in-process `ReportGenerationJob` poller running a `setInterval`-style loop for the lifetime of
the process, started once in `instrumentation.ts`, with `SIGTERM`/`SIGINT`-driven graceful shutdown
as the poller's lifecycle control.

## New

Vercel-hosted Next.js application. Background report generation and Unit 2B's commercial
fulfillment side effects run as **durable Vercel Workflows** (the `workflow` SDK's `'use workflow'`/
`'use step'` model), not an application-lifetime polling loop. Neon remains the durable
domain-state source of truth; Stripe, Resend, MapTiler, and Anthropic are unchanged as providers.
A low-frequency Vercel Cron job is retained as a correctness safety net for the one gap durable
workflow execution does not itself cover (see "Why a reconciliation backstop is still needed"
below) — it is explicitly not the primary execution mechanism.

## Reason

The founder already operates applications on Vercel, prioritizes simple/well-supported
infrastructure, and specifically wants to avoid adopting Railway (a second hosting platform)
*solely* to preserve an in-process polling implementation that was itself only a means to an end
(reliable background job execution), not a goal in itself. Vercel's now-current Workflows product
provides genuine durable execution — the actual property the polling loop was approximating — as a
first-class, Vercel-native capability.

## What Was Verified (against current Vercel/Neon documentation, not memory, per explicit
instruction — see Sources)

- **Vercel Workflows is a real, documented, generally-available-shaped product** (not
  speculative): `'use workflow'` marks a function as durable — it records every step's input/output
  in an event log and replays deterministically after a crash or deployment, resuming exactly where
  it left off. `'use step'` marks a unit of work with built-in retries. `sleep()` pauses a workflow
  for minutes to months with zero compute consumed while paused. Hooks let a workflow wait for an
  external event (e.g. a webhook-driven resume).
- **Deterministic hook tokens exist and provide in-flight duplicate detection** (`hook.getConflict()`
  resolves with an owning run's ID if another active run already holds the same token) — **this is
  defense-in-depth, not an atomic admission-control guarantee** (corrected per founder review, see
  below). `start()` can create a duplicate run before that duplicate discovers the conflict; this
  mechanism narrows the duplicate-execution window, it does not close it.
- **Step-level idempotency for external calls is first-class**: each step has a stable `stepId`
  that persists across retries, usable as an idempotency key for APIs that accept one (Stripe
  explicitly supported by name in the SDK's own documentation) — but this only makes a given *step*
  safe to retry, it says nothing about whether two separate workflow *runs* might both attempt that
  step; that is a separate concern, addressed by the domain-level correctness mechanism below.
- **Limits/plan requirements** (this project runs on **Vercel Pro**, confirmed by the founder — not
  Hobby, corrected from this document's initial draft): on Pro, Workflow Data Retained (state kept
  after a run completes) is available for **7 days**; run creation is rate-limited at
  1,000,000 requests/minute (vs. 100,000 on Hobby); Workflow Events/Data Written are billed
  on-demand beyond whatever included allowance applies to the actual plan/contract in place — exact
  current included amounts should be re-checked against the live Vercel dashboard for this specific
  team/plan rather than assumed from public Hobby-tier figures, which this ADR's first draft
  incorrectly treated as the relevant baseline. 10,000 steps/run, 25,000 events/run, no limit on
  total run duration or `sleep` duration; individual step runtime is governed by ordinary Vercel
  Function execution limits (Fluid Compute is Vercel's own recommendation for cost/performance
  here). A rate-limited `start()` call auto-retries with backoff rather than failing outright.
- **One caveat surfaced honestly, not glossed over**: multi-region pinning specifically requires
  `workflow` SDK version `5.0.0-beta.33` or later — i.e., at least this one documented feature of
  the SDK is still versioned pre-1.0/beta, even though the product itself (pricing page, GA-shaped
  documentation, no beta banner on the core docs) is not presented as an early-access feature
  overall. This project runs single-region, so multi-region pinning is not itself a blocker — noted
  here so it is not silently treated as more mature than it is.
- **Neon's connection model on Vercel is materially different from Railway's**, and this design
  does *not* mechanically port the just-designed Railway pool configuration (per explicit
  instruction — see the Database Connection Model section below): Neon's own documentation states
  a WebSocket `Pool`/`Client` **cannot outlive a single request** on a serverless platform like
  Vercel — it must be opened, used, and closed entirely within one function invocation, never
  reused across invocations or held as a module-level singleton. Genuine interactive (conditionally
  branching) multi-statement transactions still require the WebSocket driver — the HTTP driver's
  `transaction()` only supports non-interactive batched queries — but the *lifecycle* is per-request,
  not per-process.
- **PDF/headless-Chromium compatibility requires an adapter, not a rewrite**: standard Puppeteer
  tries to download Chromium at runtime, which fails on Vercel's read-only filesystem. The
  documented, current fix is `@sparticuz/chromium` (a Vercel/Lambda-compatible prebuilt Chromium)
  paired with `puppeteer-core`, which is exactly the same Playwright/headless-Chromium *rendering
  approach* this codebase already uses — only the binary-provisioning mechanism changes.

## What Was NOT Found to Be a Blocker

No genuine, blocking technical incompatibility was found. Report-generation execution, the atomic
BR-U2B-15 fulfillment transaction, Unit 2B's commercial-reconciliation requirements, and PDF
rendering all have documented, current, supported paths on Vercel. Per the explicit instruction,
this pivot does **not** result in a recommendation to stay on Railway or to introduce a third
platform.

## Consequences

- The execution/lifecycle layer changes materially (see the amended Unit 2B Infrastructure Design
  artifacts). The domain architecture — `ScreeningRequest` immutable snapshots, `Order`/`OrderState`,
  `ReportGenerationJob` and its durable states, `GenerationAuthorization` (`VERIFIED_PAYMENT` and
  `INTERNAL_PROTOTYPE`), `EvidenceReportArtifact` immutability, `ReportAccessCredential`
  hashing/revocation, `ProcessedStripeEvent`, payment/job state separation, webhook idempotency,
  the Postgres uniqueness constraints, the atomic PAID-fulfillment transaction, refund idempotency,
  every evidence/provenance invariant, PostGIS as the sole spatial source of truth, the
  deterministic Regulatory Rules Engine, and the LLM-never-determines-regulatory-conclusions
  invariant — is **unchanged**. Vercel Workflows replaces the runtime orchestration mechanism, not
  these business/domain invariants (per explicit instruction, section 3).
- The Railway-specific poller (`instrumentation.ts`'s startup call, `poller.ts`'s `setInterval`
  loop, its module-level start guard, and its `SIGTERM`/`SIGINT` shutdown wiring) is superseded —
  its *responsibilities* (claim a job, run the pipeline, mark COMPLETE/FAILED, and — per Unit 2B's
  NFR Design — reconcile stuck delivery/refund state) move to a durable workflow plus a much
  lower-frequency Cron backstop, not to a like-for-like ported poller.
- The Neon connection strategy changes from "one long-lived process-wide Pool" (the Railway design
  this same session had just finished approving) to "one Pool/Client opened and closed within each
  request/step invocation" — a real correction, not a preference, since the Railway design's
  central assumption (a Pool can safely live for the process's lifetime) does not hold on Vercel's
  serverless execution model.
- PDF/Chromium deployment on Vercel is a real, concrete item that must be proven against an actual
  deployment before being called verified — tracked as a new external-verification item, not
  assumed from documentation alone (consistent with this project's standing "do not fabricate live
  verification" discipline).
- Unit 1 and Unit 2 remain formally COMPLETE and are not reopened — their own Infrastructure Design
  documents keep describing, accurately, the Railway architecture that was actually built and
  deployed for them to date. This pivot governs *going forward*, starting with Unit 2B, which had
  not yet left Infrastructure Design when this decision arrived.

## Correction: Workflow-Start Idempotency (2026-08-24, post-approval founder review)

This ADR's first draft described deterministic hook tokens/`hook.getConflict()` as providing
run-level idempotent starts — effectively an exactly-once admission guarantee. **That was wrong.**
Vercel Workflow's documented behavior allows `start()` to create a duplicate run before that
duplicate discovers the hook conflict — the hook check is not atomic with run creation. Treating it
as the correctness boundary would have made a real customer-facing guarantee (at most one report
generated, at most one refund submitted) depend on a mechanism that doesn't actually provide it.

**The corrected authoritative boundary is the Permit Preflight database, not the Workflow
platform**:
- **Report generation**: `ReportGenerationJob`'s existing atomic `QUEUED -> IN_PROGRESS` claim
  (`claimQueuedJob`, already built in Unit 2, unchanged) becomes the **first side-effectful step**
  inside `reportGenerationWorkflow`. Multiple workflow runs may exist for the same job (Vercel does
  not prevent this) — only the run whose claim actually affects a row may proceed to execute the
  pipeline; every other run's claim affects zero rows, and that run exits immediately without
  touching Property Intelligence, PostGIS, the Rules Engine, Anthropic, artifact creation, or
  customer delivery. **Multiple workflow runs may exist; only one may ever own the domain job** —
  this is the correct, accepted shape of the boundary, not a residual risk to eliminate.
- **Refunds** (corrected once more during Code Generation Part 1 review — see below): the workflow
  branches on the `Order`'s *current* state rather than attempting a single claim-then-exit.
  `PAID` conditionally claims `PAID -> REFUND_PENDING` and persists `refundIdempotencyKey` if one
  doesn't exist yet; `REFUND_PENDING` is treated as **resumable**, not a dedup-exit — it loads the
  already-persisted key and (re-)submits. This is what actually closes the gap where a
  reconciliation-started run needs to *finish* a refund a crashed run only half-completed, not just
  detect that "someone already claimed it" and give up. Stripe's own idempotency key — always
  `Order.refundIdempotencyKey`, the DB-persisted field, never a Workflow step's `stepId` (a
  resuming run gets a different `stepId` for the same logical attempt) — remains the second,
  independent layer of protection against a duplicate charge/refund at the provider level.
- **Hook tokens are retained, but only as defense-in-depth** — narrowing the window in which a
  duplicate run is even attempted, never relied upon as the source of correctness. Documented
  explicitly wherever this design is described: `start()` may still create another run; the hook
  does not provide atomic admission; database claiming is authoritative.
- **`workflowRunId` (if persisted) is for observability/support/debugging only** — never required
  for job correctness, never a precondition for the domain state machine to proceed.
- **Cron reconciliation** re-`start()`s a workflow for any `ReportGenerationJob` still `QUEUED`
  past a grace window, without needing to know whether the original `start()` call actually
  succeeded — if it did, the reconciling run's claim affects zero rows and it exits harmlessly; if
  it didn't, the reconciling run is the one that actually gets the job claimed and executed. The
  same principle applies to `Order` rows needing refund initiation/resubmission.
- **Workflow steps are assumed at-least-once, not exactly-once** — every side-effectful step must
  be independently idempotent via an existing mechanism (a DB conditional transition/uniqueness
  constraint, a Stripe idempotency key, `ReportAccessCredential` rotation rules), never merely
  because a workflow "is durable." Durability guarantees a step's *output* is remembered across a
  replay; it does not guarantee a step's underlying side effect only ever happens once on its own.

This correction does not change *whether* Vercel Workflows are used, does not reopen the platform
decision, and does not add any new infrastructure — it corrects which existing mechanism is
actually load-bearing, in favor of a mechanism (Postgres atomic claims) this codebase already
trusts completely and had already built for exactly this purpose in Unit 2.

## Correction: Refund Resumability and INTERNAL_PROTOTYPE Route Exposure (2026-08-24, Code Generation Part 1 review)

Two further, targeted corrections surfaced during Code Generation planning, before any code was
written:

**1. `processRefundWorkflow`'s `REFUND_PENDING` state was still mistreated as a dedup-exit branch.**
The previous correction fixed the *starting* mechanism (database claims, not hook tokens) but left
a second bug: the design had the workflow attempt only `PAID -> REFUND_PENDING` and exit if that
claim affected zero rows — which is exactly what happens when a *different* run (e.g. one Cron
starts because the *original* `start()` call's own response was lost) finds the order already
`REFUND_PENDING` from a crash that happened between the local claim and the Stripe call. That run
would exit without ever calling Stripe, permanently stranding the refund — precisely the failure
mode reconciliation exists to prevent. **Fixed**: the workflow now branches on the order's current
state — `PAID` claims and persists `refundIdempotencyKey`; `REFUND_PENDING` is **resumable**, not
exit-worthy, and loads the already-persisted key to (re-)submit; `REFUNDED`/`REFUND_FAILED` exit.
The Stripe idempotency key is `Order.refundIdempotencyKey` (DB-persisted, one per logical attempt)
— **never** a Workflow step's `stepId`, since a resuming run's step gets a different `stepId` for
the same logical attempt, which would have silently defeated Stripe's own deduplication. See
`infrastructure-design.md`'s "Refund initiation and submission" section for the corrected design in
full.

**2. `INTERNAL_PROTOTYPE` must not be a deployed HTTP route at all.** The prior design described it
as an "internal-only, non-public route... never linked from the UI." On Vercel, every deployed
Next.js Route Handler is a public HTTP endpoint regardless of whether anything links to it —
"unlinked" is not authorization, and `INTERNAL_PROTOTYPE` bypasses `VERIFIED_PAYMENT`, making this
a real paywall/authorization boundary, not a cosmetic one. **Fixed**: `INTERNAL_PROTOTYPE` becomes
a server-only CLI script (`scripts/generate-prototype-report.ts` or equivalent) that imports the
existing domain functions directly and is never bundled into the deployed route surface. If a
genuine future need for an HTTP-reachable version ever arises, it requires its own explicit,
reviewed, strong server-side authorization design — not something assumed or built speculatively
now.

Neither correction changes the platform decision, the domain architecture, or any other
already-approved element of this pivot.

## Sources

- [Vercel Workflows](https://vercel.com/docs/workflows)
- [Workflow Concepts (workflows/steps/sleep/hooks)](https://vercel.com/docs/workflows/concepts)
- [Workflow Pricing and Limits](https://vercel.com/docs/workflows/pricing)
- [Workflow SDK — Idempotency](https://workflow-sdk.dev/docs/foundations/idempotency)
- [Neon Serverless Driver docs](https://neon.com/docs/serverless/serverless-driver)
- [Vercel + Puppeteer/Chromium compatibility discussion](https://github.com/vercel/next.js/discussions/91204)
