# Unit 1 — Infrastructure Design Plan

**Grounding**: Unit 1 has no customer-facing UI, no payment, and no live web-serving requirement —
its regulatory rule governance is exercised via internal tooling/scripts (Functional Design Q6),
and its evaluation logic is exercised via fixture-based tests and internal tooling. This
substantially narrows this stage's real scope: **the only genuinely new infrastructure need is a
database** (PostgreSQL+PostGIS, to store `RegulatoryRule`/`InferencePolicy` records and support
spatial queries) plus secrets handling for the external API keys Unit 1's tooling/tests use
(Anthropic API for Rule Research Assistant; most King County/Seattle/FEMA endpoints used during
Inception research required no key). No compute/hosting/networking/load-balancer/queue
infrastructure is needed yet — there is no live server to deploy.

Since the database will be **shared infrastructure** across all future units (per
unit-of-work.md — every subsequent unit extends the same Regulatory Rules Engine/data layer),
`shared-infrastructure.md` will be created alongside the unit-specific artifacts.

## Category Assessment
- **Deployment Environment**: applicable, narrowly — see Question 1 (no live app deployment yet)
- **Compute Infrastructure**: **N/A** — no server/compute to provision; Unit 1 runs as
  local/CI-executed TypeScript (scripts, tests, internal tooling), consistent with Functional
  Design's explicit no-UI/no-built-service scope
- **Storage Infrastructure**: applicable — see Question 2 (database provider)
- **Messaging Infrastructure**: **N/A** — no queues (NFR Design already excluded this)
- **Networking Infrastructure**: **N/A** — no load balancer/API gateway; nothing is served over the
  network yet in this unit
- **Monitoring Infrastructure**: **N/A as a hard requirement** (NFR Requirements marked this a
  desirable target, not a gate) — see Question 3 for the minimal dev-time logging expectation
- **Shared Infrastructure**: applicable — see Question 2 (the database is explicitly shared going
  forward)

## Design Checklist
- [ ] Answer clarifying questions below
- [ ] Generate `infrastructure-design.md` — the concrete (but minimal) infrastructure map
- [ ] Generate `deployment-architecture.md` — how Unit 1's code actually runs (local/CI, no live
      deployment)
- [ ] Generate `shared-infrastructure.md` — the database, since later units depend on it
- [ ] Confirm no infrastructure is provisioned beyond what Unit 1 concretely needs

---

## Clarifying Questions

### Question 1 — Deployment Environment Scope
Confirm: Unit 1 requires **no live application deployment**. Its code runs as local development
and CI-executed tests/scripts (exercising the RRAG governance workflow and the deterministic
evaluation logic via internal tooling, per Functional Design). The first real *deployed* runtime
requirement arrives with Unit 2 (report generation) and Unit 2B (live payment), not this unit.

A) **Confirmed** — no deployment environment needed for Unit 1 itself; defer that decision to when Unit 2/2B actually need to serve traffic — recommended

B) A deployed environment is wanted for Unit 1 anyway (describe why after [Answer]: below)

[Answer]: A

Confirmed. Unit 1 does not require a live deployed application environment. Runtime surfaces
limited to: local development, CI-executed deterministic tests, external-source integration/health
tests, internal scripts/tooling for rule governance and deterministic evaluation. No web runtime,
application server, load balancer, API gateway, queue, or other live-serving infrastructure for
Unit 1. Production/deployed compute decisions remain deferred until a later unit actually
introduces a live runtime.

### Question 2 — Database Provider (Shared Infrastructure)
research-findings.md §3 (Inception research) evaluated managed Postgres+PostGIS options and named
Neon as a fit (PostGIS supported on all plans, free tier covers early volume, no monthly minimum).
This is the first unit that actually needs the database provisioned.

A) **Use Neon** as researched — free tier for now, confirmed PostGIS support, revisit tier only if/when real volume demands it — recommended, avoids re-researching an already-answered question

B) Different provider preferred (describe after [Answer]: below)

X) Not ready to commit — describe fallback approach after [Answer]: below (e.g., local-only Postgres+PostGIS via a dev container until this decision is firmer)

[Answer]: A

Use Neon as the shared managed PostgreSQL/PostGIS provider already evaluated during Inception.
Start with the lowest appropriate/free tier and enable PostGIS as required. Treat this as shared
infrastructure for Unit 1 and later units rather than creating unit-specific databases. Preserve
environment separation conceptually so development/test data cannot silently become production
data later. Do not prematurely provision higher tiers, replicas, scaling features, or other
production infrastructure until actual usage demonstrates a need. This is a reversible
infrastructure-provider decision, not a product-domain invariant.

Non-blocking implementation note: deterministic domain tests should not become dependent on
Neon/network availability. Where persistence-specific or PostGIS-specific integration tests
require a real database, keep those logically separate from pure deterministic domain tests and
use an appropriate isolated test database strategy.

### Question 3 — Minimal Dev-Time Logging
NFR Requirements marked full observability/monitoring a desirable target, not a hard gate. For
Unit 1 specifically (internal tooling, not live traffic), is basic structured console/log output
during test runs and script execution sufficient, with real observability infrastructure
(dashboards, alerting) deferred entirely to when there's live traffic to observe?

A) **Yes — structured console/log output only for now**, no monitoring infrastructure provisioned — recommended

B) More is wanted now (describe after [Answer]: below)

[Answer]: A

Structured console/log output is sufficient for Unit 1. Logging should be useful for diagnosing:
external-source failures/retry exhaustion, RESOLUTION_UNAVAILABLE outcomes, schema-validation
failures, rule-governance transitions, deterministic evaluation failures, live integration-test
failures. No dashboards, alerting, APM, centralized logging, or monitoring stack for Unit 1.
Secrets and sensitive credential material must never be written to logs (unchanged requirement).

### Question 4 — Secrets Handling for This Phase
Unit 1's tooling/tests need at least an Anthropic API key (Rule Research Assistant). NFR-5 already
requires credentials are never logged/committed. For this pre-deployment phase, is local
environment-variable-based secret handling (e.g., a gitignored `.env` for local dev, CI secret
storage for automated test runs) sufficient, with a real managed secrets solution deferred to when
production deployment (Unit 2B+) actually happens?

A) **Yes — environment variables (local .env, gitignored; CI secret store for automated runs) for now**, real secrets-manager infrastructure deferred to production deployment — recommended, avoids provisioning production-grade secret infrastructure for a phase with no production

B) A more robust secrets solution is wanted now (describe after [Answer]: below)

[Answer]: A

For Unit 1's pre-deployment phase: local dev uses gitignored .env/local environment variables,
with a committed .env.example containing names/placeholders only, never real credentials. CI uses
the CI platform's encrypted secret storage, injecting credentials only into jobs that actually
require them; deterministic fixture tests should not require external API credentials. Never:
commit secrets, place secrets in fixtures, print secrets in logs/errors, hard-code credentials in
scripts, embed credentials in generated artifacts. A managed production secrets solution is
deferred until a unit introduces an actual production deployment/runtime.
