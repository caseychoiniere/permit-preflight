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

## Application Hosting: Railway

**Established by**: Unit 2 (Report Generation & Presentation Prototype) — the first unit with a
real deployed runtime; no hosting decision existed before this.

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
- **Status**: reversible, low-risk hosting choice (per Unit 2's Infrastructure Design), not a
  product-domain invariant.

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

## What Is Not Yet Shared Infrastructure
No messaging/queue infrastructure, caching layer (e.g. Redis), distributed lock service,
object-storage service, dedicated GIS/PDF microservice, APM/tracing platform, load-balancer
architecture, multi-replica/autoscaling configuration, or Kubernetes exists — see Unit 2's
`infrastructure-design.md` and `deployment-architecture.md` for the explicit non-list, and each
unit's future Infrastructure Design stage for whether any of these are ever actually justified by
evidence rather than introduced speculatively. Compute/hosting (Railway) and a basemap/tile
provider (MapTiler) are now real, tracked above, added when Unit 2 first introduced a deployed
runtime — they were correctly absent through Unit 1, which had none.
