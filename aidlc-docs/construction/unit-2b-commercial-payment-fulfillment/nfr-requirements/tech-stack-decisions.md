# Unit 2B — Tech Stack Decisions

Product-level stack already fixed (requirements.md §9, Unit 1/2's Infrastructure Design): Next.js,
TypeScript, PostgreSQL + PostGIS via Neon, Drizzle ORM, Railway hosting. This document covers only
the genuinely open, Unit-2B-scoped tooling choices. Per the pragmatic construction standard, these
are reversible, low-risk decisions — not approval-blocking architecture, revisitable as
implementation provides evidence.

## Payment Provider Integration
**Decision**: the official `stripe` npm package (latest stable major version), used for both
Checkout Session creation and webhook signature verification (`stripe.webhooks.constructEvent`).

**Rationale**: the standard, essentially only sane integration path for Stripe from a Node/
TypeScript backend — not a genuinely open decision point. Requires reading the raw request body
(not a parsed/re-serialized one) in the webhook route handler, per Stripe's own documented
signature-verification requirement (NFR-U2B-4).

## Database Driver — Interactive Transaction Support Needed (Question 2)

**Connection-lifecycle decision superseded 2026-08-24 by the deployment-platform pivot** (Railway
-> Vercel) — see `aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`
and the amended `infrastructure-design.md`'s "Database Connection Model." The conclusion below
("BR-U2B-15 needs `neon-serverless`, not `neon-http`, for the transaction itself") still holds; the
"one consistent runtime DB driver, replacing `neon-http` entirely" framing does not — that was
specifically justified by Railway's persistent-process model. On Vercel, `neon-http` remains the
default driver for everything except the one atomic transaction, and the `neon-serverless` `Pool`
used for that transaction is opened/closed per-request, never held as a long-lived application-wide
pool. Original text preserved below for the historical record.

**Original decision**: `@neondatabase/serverless` + `drizzle-orm/neon-serverless` (pooled/WebSocket,
interactive-transaction-capable), replacing the existing `drizzle-orm/neon-http` client
(`src/db/client.ts`) as this application's one consistent runtime DB driver.

**Rationale**: BR-U2B-15 requires a genuine multi-statement, atomic, all-or-nothing local
transaction (`Order` PAID transition, `GenerationAuthorization` persistence,
`ReportGenerationJob` creation, `ProcessedStripeEvent` insertion) — the first path in this
application that cannot be satisfied by a single conditional-`UPDATE`'s own row-level atomicity
(the pattern every prior atomic operation, e.g. `claimQueuedJob`, has relied on). `neon-http`'s
`db.transaction()` support is implemented as a batched single HTTP request, not a normal
interactive multi-round-trip transaction, and does not reliably support conditional branching
mid-transaction. Rather than force BR-U2B-15's sequence into that shape, this unit switches to
Neon's pooled/WebSocket driver, which supports real interactive transactions directly.

**Scope of the change**: one consistent driver across the application (not two DB-client
abstractions maintained side by side), unless concrete Code Generation-time evidence demonstrates a
specific reason to keep both (e.g. a cold-start-latency argument for the HTTP driver on paths that
never need a transaction). `db/schema.ts` and existing Drizzle query-builder usage are expected to
carry over largely unchanged — this is a client/connection-layer swap, not a schema or query-API
change.

**Not decided here**: exact connection-pool sizing/configuration for Railway's single-persistent-
Service deployment model — an Infrastructure Design concern, informed by whatever this stage's
NFR Design settles on for the transaction boundary's shape.

## Email Delivery Provider (Question 1)
**Decision**: Resend, for ACC-1's guest report-access delivery email.

**Rationale**: proportionate to prototype/early-commercial volume (free tier sufficient for
expected Unit 2B volume), simple SDK consistent with this codebase's existing low-ceremony
external-adapter pattern (mirrors the Anthropic-client precedent — a small, focused adapter module,
not a general notification framework). Credential is environment-variable-only, server-side only
(NFR-U2B-4). Recognized explicitly as a new trust boundary (NFR-U2B-4) — only the customer's email
address and the report-access link are ever sent to it.

## Concurrency Constraints — Postgres Partial Unique Indexes
**Decision**: two partial unique indexes on `Order.screeningRequestId` — one scoped to
`state = 'PENDING'` rows (at most one open checkout attempt per screening request), one scoped to
`paidAt IS NOT NULL` rows (at most one order ever paid per screening request, durable through
every subsequent refund state).

**Rationale**: the standard, idiomatic Postgres mechanism for exactly this shape of
partial-uniqueness invariant (BR-U2B-1) — not a genuinely open decision point.

## Webhook Endpoint Hardening
**Decision**: no dedicated rate limiter on the Stripe webhook endpoint; a reasonable request-body
size bound applied before expensive processing (raw-body read, signature verification, JSON
parsing).

**Rationale**: signature verification is already the real, cheap gate against forged requests, and
the `ProcessedStripeEvent` ledger is the correct defense against Stripe's own legitimate retry
volume — a rate limiter would defend against the wrong threat model here (unlike the report-access
lookup endpoint, which does face arbitrary-client guessing and does warrant one, per NFR-U2-4). The
body-size bound is ordinary boundary validation, not a new rate-limiting system.

## Testing Tools
**Decision**: extends Unit 1/2's existing tooling — Vitest for the deterministic suite (webhook/
signature/state-machine tests, no network), the existing `npm run test:integration` non-blocking
live suite extended with a Stripe test-mode Checkout Session integration test, and the Stripe CLI
(`stripe listen --forward-to`) for the external/live end-to-end webhook smoke verification
(NFR-U2B-6) — tracked in the external-verification tracker if unavailable during Construction, not
fabricated. No new testing framework introduced.

## Deferred to Infrastructure Design (Next Stage)
Exact Stripe webhook endpoint route/URL and its Railway-level configuration, `STRIPE_SECRET_KEY`/
`STRIPE_WEBHOOK_SECRET`/Resend API key secret provisioning, Neon connection-pool configuration for
the new WebSocket driver under Railway's single-persistent-Service model, and any provider-specific
deployment configuration (e.g. Resend sending-domain verification) remain out of scope for this
document, per the same pattern Unit 1/2's NFR Requirements used.
