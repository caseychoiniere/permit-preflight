# Permit Preflight — Shared Infrastructure

Infrastructure shared across multiple Units of Work, tracked here rather than duplicated in each
unit's own infrastructure design. First entry established by Unit 1.

## Database: Neon (PostgreSQL + PostGIS)

**Established by**: Unit 1 (Deterministic Evaluation Foundation).
**Used by**: Unit 1 onward — every subsequent unit that touches persisted domain data
(`RegulatoryRule`, `InferencePolicy`, and, in later units, `ScreeningRequest`, `ReportGenerationJob`,
`Order`, `Account`, etc. per Application Design) extends this same database rather than
provisioning its own.

- **Provider**: Neon (managed PostgreSQL with PostGIS support on all plans).
- **Tier**: lowest/free tier to start; explicitly **not** pre-provisioned to a higher tier,
  replica, or scaling configuration — revisit only when actual usage demonstrates a need
  (research-findings.md §3 already modeled the cost curve at higher volumes for when that
  decision is revisited).
- **Environment separation** (concretized by Unit 2): a single dedicated Neon branch/database for
  the deployed Unit 2 prototype, with its own `DATABASE_URL`, kept separate from local development,
  disposable/test databases, and the live integration-test database. Migrations are applied
  automatically as part of deployment (the hosting platform's pre-deploy step) — a migration
  failure prevents the new application version from becoming active. No automatic destructive
  dev-reset/seed operation ever runs against the deployed branch.
- **Test isolation**: deterministic domain tests do **not** depend on Neon/network availability
  (Unit 1 NFR Requirements' fixture strategy — captured, deterministic fixtures only).
  Persistence-specific/PostGIS-specific integration tests that do need a real database are kept
  logically separate, using an isolated test-database strategy.
- **First real connection (Unit 2)**: Unit 1 never actually connected to Neon (no credentials in
  that session) — Unit 2's deployment is the first real usage, and closes Unit 1's outstanding
  external-verification checklist item once the integration suite genuinely passes against the
  deployed branch (see `aidlc-docs/operations/external-verification-tracker.md`).
- **Status**: this is a reversible infrastructure-provider decision, not a product-domain
  invariant — revisiting it later does not require reopening any approved requirements or
  architecture artifact.

## Application Hosting: Railway (HISTORICAL — SUPERSEDED 2026-08-24)

**Established by**: Unit 2 (Report Generation & Presentation Prototype) — the first unit with a
real deployed runtime; no hosting decision existed before this. **Superseded by the founder's
deployment-platform pivot** — see
`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md` and the
"Application Hosting: Vercel" section immediately below. This section is preserved unaltered as the
accurate historical record of what Unit 1 and Unit 2 actually built and deployed against — it does
not describe the current canonical platform.

- **Platform**: Railway, Hobby tier, one persistent Service (serverless/app-sleeping **disabled**).
  A traditional long-running Node.js process, not request-scoped serverless functions — required
  because the same process runs the `ReportGenerationJob` polling/execution loop in-process, which
  cannot depend on an HTTP request remaining open or survive a serverless function's execution-
  duration ceiling.
- **Replica count**: exactly one. The in-memory rate limiter (see Unit 2's `nfr-design-patterns.md`
  Pattern 2) and the in-process job poller both currently assume this. Job *correctness* does not
  depend on single-replica-ness (it comes from Postgres's atomic claim), but scaling beyond one
  replica is an explicit future infrastructure change, not a silent assumption to relax.
- **Secrets**: Railway's native environment-variable/sealed-variable facility, extending the
  existing env-var-only pattern below — `DATABASE_URL`, `ANTHROPIC_API_KEY` never exposed via
  `NEXT_PUBLIC_*`, never in browser bundles, never logged.
- **Health check**: `/healthz`, verifying process readiness only — never a deep dependency check
  that fails merely because an external source (King County, Anthropic) is temporarily
  unavailable.
- **CI/CD**: GitHub Actions on a branch-protected `main` (deterministic suite, typecheck,
  production build, Playwright smoke suite — all blocking); Railway deploys only from protected
  `main` after those checks pass. The credentialed live-integration suite stays non-blocking.
- **Status (at the time Unit 1/2 were built)**: reversible, low-risk hosting choice (per Unit 2's
  Infrastructure Design), not a product-domain invariant — this reversibility is exactly what made
  the later pivot low-risk to the domain architecture.

## Application Hosting: Vercel (CANONICAL, established 2026-08-24)

**Established by**: the founder's deployment-platform pivot, applied starting with Unit 2B (the
unit in progress when the decision arrived). Verified against current Vercel/Neon documentation
before being locked in — see the ADR's Sources section, not assumed from memory.

- **Platform**: Vercel. Next.js application deployed as Vercel Functions (on-demand, not a
  persistent process). Background report generation and Unit 2B's commercial-fulfillment side
  effects run as **durable Vercel Workflows** (`'use workflow'`/`'use step'`), not an in-process
  polling loop — see Unit 2B's `infrastructure-design.md` for the full execution model.
- **Reconciliation backstop**: a low-frequency **Vercel Cron** job (starting at ~5 minutes) covers
  the one gap workflow durability doesn't itself close (a workflow-start call whose own result was
  lost) — explicitly a backstop, never the primary execution mechanism.
- **Replica/concurrency model**: Vercel Functions scale on demand (no fixed "replica count" the way
  Railway had one) — every reconciliation and workflow-start action is conditional/idempotent by
  design specifically so this doesn't require a single-instance assumption anywhere (unlike the
  Railway design's rate limiter and poller, which did rely on one).
- **Secrets**: Vercel environment variables, scoped per environment (Development / Preview /
  Production) — same never-`NEXT_PUBLIC_*`, never-logged discipline as before.
- **Health check**: `/healthz` retained as an application-level diagnostic endpoint — Vercel
  Functions don't need a platform-level "is the persistent process still up" check the way Railway
  did, since there is no persistent process.
- **CI/CD**: GitHub Actions unchanged (deterministic suite, typecheck, production build, Playwright
  smoke — all blocking; credentialed live-integration suite non-blocking); Vercel's native GitHub
  integration deploys from protected `main` after those checks pass, and provides automatic Preview
  Deployments for every pull request (used for manual review, not a dependency of deterministic CI
  correctness).
- **Status**: reversible hosting choice, same as Railway was — not a product-domain invariant. The
  domain architecture (Order/OrderState, ReportGenerationJob, GenerationAuthorization,
  EvidenceReportArtifact immutability, the Regulatory Rules Engine, etc.) is unaffected by this or
  any future hosting-platform choice.

## Basemap/Tile Provider: MapTiler Cloud

**Established by**: Unit 2, for MapLibre GL JS's map rendering (parcel display, placement
interaction, report map).

- **Tier**: free, explicitly a prototype/R&D-appropriate choice, **not** an approved commercial-
  production licensing decision — before Commercial GO/paid public usage, review MapTiler's
  then-current commercial plan and either upgrade or deliberately choose a different provider
  (tracked as a Commercial-GO infrastructure checkpoint in Unit 2's `infrastructure-design.md`).
- **Credential treatment**: the MapTiler browser API key is intentionally public/client-visible —
  not a secret in the `DATABASE_URL`/`ANTHROPIC_API_KEY` sense. Restricted via MapTiler's Allowed
  HTTP Origins feature to the deployed application domain, with separate dev/localhost handling.
  `tile.openstreetmap.org` is explicitly not used as the deployed application's basemap backend.

## Secrets Handling Pattern (Pre-Deployment Phase)

**Established by**: Unit 1.
**Applies to**: all units until a real production deployment/runtime is introduced (expected around
Unit 2B, per the two-gate model).

- Local development: gitignored `.env`, with a committed `.env.example` listing variable names and
  placeholder values only — never real credentials.
- CI: the CI platform's native encrypted secret storage, injected only into the specific jobs that
  require them (e.g., external-source integration tests, Rule Research Assistant's Anthropic API
  calls) — deterministic fixture tests require no external credentials at all.
- Never: commit secrets, place secrets in fixtures, print secrets in logs/errors, hard-code
  credentials in scripts, embed credentials in generated artifacts.
- A managed production secrets solution (e.g., a cloud secrets manager) is explicitly deferred
  until a later unit introduces the production runtime — not provisioned speculatively now.

## Anthropic API Access

**Established by**: Unit 1 (Rule Research Assistant). **Extended by Unit 2**: Report Explanation is
a second, structurally distinct consumer of the same Anthropic credential (its own
`AiCompletionClient` instance/module — NFR Requirements Question 4) — not a second shared-
infrastructure decision, the same credential and secrets-handling pattern apply.
**Provider/model selection**: per requirements.md §5.2/research-findings.md §2 — not re-decided
here; this document only tracks that API access exists as a shared credential/integration point,
handled per the secrets pattern above. The Anthropic external-verification checklist item (live,
credentialed call) remains open — see `aidlc-docs/operations/external-verification-tracker.md` —
Unit 2's infrastructure makes that call possible but doesn't by itself satisfy it.

## Database Connection Method: Two Neon Drivers, Each Scoped to Its Use — Updated by Unit 2B

**Established by**: Unit 2B, in two passes the same day — an initial Railway-targeted decision
(preserved below as history), then corrected by the 2026-08-24 deployment-platform pivot once
Vercel replaced Railway as the target. See
`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`.

**Current decision**: two drivers, not one "consistent" client — the "one consistent runtime DB
client" preference from the first pass was specifically justified by Railway's persistent-process
model, which no longer applies.
- **`neon-http`** (`@neondatabase/serverless`'s `neon()` + `drizzle-orm/neon-http`) is the
  **default** for everything that doesn't need a genuine interactive transaction — the large
  majority of reads/writes across every unit, including most Vercel Workflow steps. Stateless HTTP,
  no connection lifecycle to manage — Neon's own documented recommendation for this shape of query
  on a serverless platform.
- **`drizzle-orm/neon-serverless` (`Pool`)** is used **only** where a genuine multi-statement,
  conditionally-branching interactive transaction is needed (currently: Unit 2B's BR-U2B-15
  payment-fulfillment transaction). The `Pool` is opened, used, and closed **entirely within the
  one request handler that needs it** — never held as a module-level singleton, never reused across
  invocations. This follows Neon's own documentation directly: a WebSocket `Pool`/`Client` cannot
  outlive a single request on a serverless platform like Vercel.
- **Endpoint**: Neon's direct database endpoint (not layered under Neon's PgBouncer pooled
  endpoint) for the transactional path, at this application's connection scale. Migrations use a
  direct connection.
- **Status**: reversible driver-level decision, not a schema or product-domain change.

**Historical, superseded first pass (Railway-targeted, same day)**: one long-lived,
application-wide `@neondatabase/serverless` `Pool` + `drizzle-orm/neon-serverless` client (`max: 5`,
`idleTimeoutMillis: 60_000`, one `Pool` instance per process, closed on graceful shutdown),
retiring `neon-http` entirely. This assumed Railway's one-persistent-process model, under which a
long-lived pool is safe and "one consistent client" is simplest. It was corrected, not carried
forward, once Vercel (a serverless platform, no persistent process) became the target.

## Payment Provider: Stripe — Established by Unit 2B

**Established by**: Unit 2B (Commercial Payment & Fulfillment) — the first real external payment
provider in this codebase.

- **Integration**: Stripe-hosted Checkout Sessions (never a custom card-collection form — raw
  cardholder data never touches this application) plus signature-verified webhooks for
  payment/refund confirmation, via the official `stripe` npm SDK.
- **PCI scope**: substantially reduced (Stripe-hosted Checkout keeps cardholder data out of this
  application's boundary entirely), not zero — the business retains its own PCI
  compliance/attestation responsibilities as a Stripe merchant.
- **Environment separation (hard requirement)**: test-mode and live-mode credentials (secret key +
  webhook secret) are never mixed within an environment. Development/CI always use test-mode
  credentials against Stripe test Checkout Sessions — no real charges possible. Production
  deployment does **not** automatically imply live credentials are present; enabling live-mode
  credentials is an explicit, separate commercial-launch action, verified (webhook
  delivery/signature checks) before real customers can be charged.
- **Webhook endpoint**: `POST /api/webhooks/stripe`, a standard Next.js Route Handler on the
  Vercel-hosted domain — no API gateway, no separate webhook service. Raw request body preserved for
  signature verification; a 65,536-byte body-size bound is enforced before expensive processing
  (matching Stripe's own documented example limit).
- **Secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Vercel environment variables (per the
  2026-08-24 platform pivot; originally Railway native secrets, same discipline either way), never
  logged, never exposed via `NEXT_PUBLIC_*`.

## Email Provider: Resend — Established by Unit 2B

**Established by**: Unit 2B, for ACC-1's guest report-access delivery — the first outbound
transactional email in this codebase.

- **Integration**: a small, narrow adapter module (`email-delivery`) around Resend's SDK, mirroring
  the existing Anthropic-client adapter pattern — not a general notification framework.
- **No test-mode/live-mode credential split** (unlike Stripe) — Resend does not have one.
  Environment isolation instead uses environment-specific API keys where practical: development/CI
  send automated-test messages **only** to Resend's documented test addresses (e.g.
  `delivered@resend.dev`), never to arbitrary real addresses; production uses a production-scoped
  key, a verified Permit Preflight sending domain, and real customer addresses sourced only from
  verified Stripe fulfillment data.
- **Scope discipline**: only the recipient's email address and the secure report-access link are
  ever sent to Resend — never report contents, findings, or other customer/property data. Recognized
  as an explicit new trust boundary/PII processor (Unit 2B's NFR Requirements), not an invisible
  implementation detail.
- **Secrets**: `RESEND_API_KEY` — Vercel environment variable, same discipline as above.

## Basemap/Tile Provider — MapTiler Commercial-Launch Checkpoint Revisited by Unit 2B

Unit 2's original Commercial-GO checkpoint (above) is **confirmed still applicable** by Unit 2B,
despite the founder's separate decision removing "Commercial GO" as a Construction-blocking
concept (`aidlc-state.md`'s FOUNDER DECISION section) — that decision changed what blocks
*Construction*, not what MapTiler's own commercial terms require once real paid public usage
begins, which is exactly what Unit 2B makes possible. MapTiler Free remains appropriate through
development/CI/demos/non-commercial testing; before enabling live Stripe charging for real
customers, review MapTiler's then-current commercial plan and upgrade or replace it — tracked as a
pre-commercial-launch item in `aidlc-docs/operations/external-verification-tracker.md`, not a
Construction blocker.

## What Is Not Yet Shared Infrastructure
No messaging/queue infrastructure, caching layer (e.g. Redis), distributed lock service,
object-storage service, dedicated GIS/PDF microservice, APM/tracing platform, load-balancer
architecture, multi-replica/autoscaling configuration, or Kubernetes exists — see Unit 2's
`infrastructure-design.md` and `deployment-architecture.md` for the explicit non-list, and each
unit's future Infrastructure Design stage for whether any of these are ever actually justified by
evidence rather than introduced speculatively. Compute/hosting (Vercel, since the 2026-08-24
pivot — originally Railway) and a basemap/tile provider (MapTiler) are now real, tracked above,
added when Unit 2 first introduced a deployed runtime — they were correctly absent through Unit 1,
which had none. Vercel Workflows (Unit 2B) is a platform-native durable-execution capability, not a
third-party queue/broker — it is deliberately not listed among the infrastructure this project has
avoided, since it is exactly the kind of managed, no-new-service capability this document's
proportionality discipline favors.
