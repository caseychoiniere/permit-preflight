# Unit 2B: Commercial Payment & Fulfillment — Infrastructure Design Plan

**Artifacts generated 2026-08-24**, incorporating both Q&A decisions plus 3 founder corrections
(Resend environment terminology, Stripe environment hard-separation, the exact 65,536-byte webhook
body bound). Awaiting explicit approval before proceeding to Code Generation (normal review gate).

**Functional/NFR Design consumed**: all Unit 2B design artifacts (APPROVED 2026-08-24, including
NFR Design's Pattern 9 durable-reconciliation addition and Patterns 1/4's post-review hardening).
**Shared infrastructure already established** (`shared-infrastructure.md`): Neon Postgres+PostGIS,
Railway Hobby-tier single-persistent-Service hosting, MapTiler (prototype/free tier, flagged as a
Commercial-GO checkpoint), the env-var-only secrets pattern, GitHub Actions CI. This document maps
Unit 2B's new logical components onto that existing infrastructure and covers only what's
genuinely new.

**What's genuinely new here**: the first real external payment provider (Stripe) needing a public
webhook endpoint and live/test credential separation; the first outbound-email provider (Resend);
the first driver-level database change (to `neon-serverless`) with a real connection-pool sizing
decision under Railway's single-Service model; concrete values for Pattern 9's reconciliation-tick
interval and staleness threshold, and Pattern 6's webhook body-size bound (each deferred from NFR
Design to this stage).

---

## Infrastructure Design Checklist
- [x] Answer clarifying questions below
- [x] Analyze answers for ambiguity; raise follow-ups if needed — none needed; both answers were fully specified with concrete configuration values, plus 3 additional corrections (Resend environment terminology, concrete infrastructure values, Stripe environment separation) incorporated directly
- [x] Create `infrastructure-design.md` — component-to-infrastructure mapping (order-payment,
      checkout-fulfillment, report-access extension, email-delivery, the extended poller), secrets
      inventory (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`), the Stripe
      webhook endpoint's public exposure, live-vs-test credential handling per environment, the
      MapTiler Commercial-GO checkpoint status now that real payment exists, carry-forward
      implementation requirements for Code Generation
- [x] Create `deployment-architecture.md` — updated running-system diagram/flows including the
      Stripe webhook path and the extended reconciliation-poller tick, CI/CD additions (Stripe
      test-mode live-integration job, Stripe CLI smoke as non-blocking/external)
- [x] Update `shared-infrastructure.md` with Unit 2B's additions (Stripe, Resend, the driver
      change) — this is genuinely shared going forward (any later unit touching payment/email
      reuses it), not Unit-2B-scoped-only infrastructure

---

## Clarifying Questions

### Question 1 — Neon Connection-Pool Sizing for the New WebSocket Driver
NFR Design decided to switch to `drizzle-orm/neon-serverless` (pooled/WebSocket) for BR-U2B-15's
interactive transaction, deferring exact pool sizing to this stage. Railway runs exactly one
persistent Node.js process (`shared-infrastructure.md`) — unlike a serverless/edge deployment,
there's no per-request cold-start pressure, but the pool still needs a concrete shape.

A) **A single shared connection pool for the entire application** (replacing `neon-http` everywhere,
   not just for BR-U2B-15's transaction), sized modestly (e.g. a small fixed pool, on the order of
   single-digit connections) appropriate to Railway Hobby-tier's one-replica, low-concurrency
   reality — simplest mental model (one driver, one pool, used everywhere), matches
   `tech-stack-decisions.md`'s stated preference for "one consistent runtime DB client" over
   maintaining two abstractions. **Recommended.**

B) **Two separate clients**: keep `neon-http` for simple, non-transactional reads/writes (the
   majority of existing Unit 1/2 query call sites, potentially with marginally lower latency per
   call) and add a small `neon-serverless` pool used *only* for BR-U2B-15's transaction and any
   other future genuinely-transactional path — more moving parts (two DB client modules to
   understand/maintain), but avoids touching every existing call site's import.

X) Other (describe after [Answer]: below)

[Answer]: A — one shared application-wide Neon WebSocket Pool (@neondatabase/serverless Pool + drizzle-orm/neon-serverless), max:5, idleTimeoutMillis:60_000, one Pool per process, closed on graceful shutdown, direct Neon endpoint (not PgBouncer-pooled) at this scale; neon-http retired entirely, not maintained alongside.

### Question 2 — MapTiler Commercial-GO Infrastructure Checkpoint
Unit 2's `infrastructure-design.md` flagged MapTiler's free tier as explicitly "not an approved
commercial-production licensing decision — before Commercial GO/paid public usage, review
MapTiler's then-current commercial plan." Unit 2B is the unit that makes paid public usage real,
but the founder's earlier decision separately removed "Commercial GO" as a Construction-blocking
concept. Does that MapTiler checkpoint apply now?

A) **Yes — review MapTiler's commercial terms as part of this unit** (or explicitly as a tracked
   follow-up item before this unit's own commercial launch, not before Construction continues) —
   the checkpoint's original trigger ("paid public usage begins") is genuinely happening in this
   unit, independent of whether "Commercial GO" still exists as a gate-naming concept; the founder
   decision changed what blocks *Construction*, not what a map-tile provider's own commercial terms
   require once real paying traffic exists. **Recommended** — treat as a real, concrete operational
   checklist item (verify MapTiler's free-tier request volume actually covers realistic early
   traffic, or upgrade) tracked in the external-verification tracker, not a Construction blocker.

B) **No — defer entirely**, treating "Commercial GO no longer gates Construction" as also meaning
   this specific checkpoint no longer needs revisiting until some other, later trigger.

X) Other (describe after [Answer]: below)

[Answer]: A — the MapTiler commercial-use checkpoint still applies; Free tier permitted through development/CI/demos/non-commercial prototype testing, but is a pre-commercial-launch verification/action item (not a Construction blocker) before enabling real public paid usage / Stripe live-mode charging.
---

*Design decisions made directly (not asked as questions) because they extend already-established
patterns or are concrete-value choices within this unit's own discretion, revisable from evidence
per this project's standing practice (e.g. `staleClaimThreshold`'s precedent) — all confirmed by
the founder's approval message, with corrections noted:*
- **Secrets handling**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` follow the
  exact existing pattern (`shared-infrastructure.md`) — Railway native secrets in production, CI
  platform secret storage for the live-integration job, gitignored local `.env` for development,
  never logged/exposed via `NEXT_PUBLIC_*`. No new secrets-manager service introduced.
- **Stripe webhook endpoint**: `POST /api/webhooks/stripe`, a standard Next.js API route on the
  existing Railway-hosted domain — no new public endpoint infrastructure, no API gateway.
  **Confirmed.**
- **Stripe environments — corrected/hardened per founder review**: hard separation, never mixed —
  dev/CI use `STRIPE_SECRET_KEY`=test-mode key with its corresponding test/CLI endpoint secret,
  Checkout Sessions must be Stripe test mode, no real charges possible; production deployment does
  **not** automatically imply live credentials; commercial launch is an explicit, separate step
  (provision live `STRIPE_SECRET_KEY`, configure a live-mode webhook endpoint, provision the
  corresponding live `STRIPE_WEBHOOK_SECRET`, verify webhook delivery/signatures before exposing
  live checkout).
- **Resend environment terminology — corrected per founder review**: Resend has **no** Stripe-like
  test-mode/live-mode credential distinction (originally mis-described as "test-mode keys" in this
  plan's own initial draft). Corrected framing: dev/CI may use a dedicated, environment-isolated
  Resend API key, sending automated-test messages **only** to Resend's documented test addresses
  (e.g. `delivered@resend.dev`) — never to arbitrary real addresses; production uses a
  production-scoped Resend API key, a verified Permit Preflight sending domain, and real customer
  addresses sourced only from verified Stripe fulfillment data. Described as "environment-specific
  Resend credentials," never "test-mode credentials."
- **Neon connection pool** (Question 1's confirmed concrete shape): `@neondatabase/serverless`
  `Pool` + `drizzle-orm/neon-serverless`, `max: 5`, `idleTimeoutMillis: 60_000`, one `Pool` instance
  per application process (never per-request, never accumulating across Next.js dev hot reload),
  one Drizzle client over that Pool, closed as part of graceful shutdown, direct Neon endpoint (not
  layered under Neon's PgBouncer pooled endpoint) at this scale; migrations also use a direct
  connection; `neon-http` retired entirely, not kept alongside.
- **Pattern 9's reconciliation-tick interval**: 60 seconds. **Confirmed**, explicitly still an
  initial/tunable prototype value.
- **Pattern 7/9's `EMAIL_PENDING` staleness threshold**: 5 minutes. **Confirmed**, explicitly still
  an initial/tunable prototype value.
- **Pattern 6's webhook request-body size bound**: 64 KiB / 65,536 bytes — **corrected to this
  exact figure per founder review**, matching Stripe's own webhook documentation's example limit
  (this plan's initial draft used an approximate "64 KB," now pinned to Stripe's own stated bound).
