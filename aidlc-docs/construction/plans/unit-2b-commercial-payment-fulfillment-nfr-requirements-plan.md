# Unit 2B: Commercial Payment & Fulfillment — NFR Requirements Plan

**Functional Design consumed**: business-logic-model.md, business-rules.md, domain-entities.md
(APPROVED 2026-08-24, including the 6 post-approval payment-correctness amendments — BR-U2B-1
concurrency/duplicate-payment safety, BR-U2B-2's externally-confirmed/local-command split,
BR-U2B-14 order-before-session sequencing, BR-U2B-15 atomic webhook fulfillment, BR-U2B-5's
corrected refund-idempotency-key scope, BR-U2B-16 purchase-lock). **Product-level stack already
fixed** (requirements.md §9, Unit 1/2's Infrastructure Design): Next.js, TypeScript, PostgreSQL +
PostGIS via Neon, Drizzle ORM, Railway hosting. This document covers only Unit-2B-scoped open
choices.

**What's genuinely new here**: Unit 2B is the first unit with a real external payment provider
(Stripe), the first unit that must send outbound email, and the first unit whose correctness
depends on multi-statement atomicity and DB-level concurrency constraints stronger than anything
Unit 1/2 needed (their atomicity need was met by Postgres's single-statement conditional-UPDATE
atomicity — `claimQueuedJob`'s `WHERE state = 'QUEUED'` pattern — which is necessary but not
sufficient for BR-U2B-15's multi-table commit).

---

## NFR Assessment Checklist
- [x] Answer clarifying questions below
- [x] Analyze answers for ambiguity; raise follow-ups if needed — none needed; all 3 answers were detailed and unambiguous, with 3 additional corrections (PCI-scope framing, customer-email-as-PII, bearer-link confidentiality hardening) incorporated directly
- [x] Create `nfr-requirements.md` — scalability (prototype-scale, unchanged from Unit 2's
      framing), performance (webhook-processing latency target, refund-confirmation latency is
      Stripe-side and not this unit's to bound), availability (webhook endpoint must tolerate
      Stripe's own retry behavior gracefully — no new SLA), security (webhook signature secret
      handling, PCI-scope confirmation — none, since card data never touches this application via
      Stripe-hosted Checkout — email-provider credential handling, no new PII beyond what's already
      collected), reliability (the concurrency/atomicity mechanisms BR-U2B-1/14/15 require, mapped
      to concrete Postgres/Drizzle mechanics), maintainability/testing (deterministic test coverage
      for the Order state machine and webhook handling using fake Stripe events, scope of any live
      Stripe test-mode integration test)
- [x] Create `tech-stack-decisions.md` — Stripe SDK, email provider, the DB-transaction mechanism
      answering BR-U2B-15's atomicity requirement (real open question — see Question 2), the
      concurrency-constraint mechanism answering BR-U2B-1 (partial unique indexes — decided
      directly below, not asked as a question)
- [x] Cross-check every NFR traces to a specific Functional Design rule (BR-U2B-1 through
      BR-U2B-16) or story (PO-0 through PO-5, ACC-1) — no speculative NFR content

---

## Clarifying Questions

### Question 1 — Email Provider for Guest Report-Access Delivery (ACC-1)
Functional Design (BR-U2B-10) requires real transactional email delivery but explicitly deferred
provider selection to this stage.

A) **Resend** — developer-friendly API, generous free tier, good deliverability reputation, simple
   Node SDK, no infrastructure to manage. A common default for solo-founder/small-scale Next.js
   apps. **Recommended** given this unit's proportionality constraints (no enterprise email
   infrastructure) and the existing codebase's general preference for low-ceremony,
   well-documented SDKs (mirrors the Anthropic-client pattern already in use).

B) **Postmark** — similarly simple, historically strong deliverability reputation specifically for
   transactional (not marketing) email, slightly more mature/established than Resend.

C) **AWS SES** — cheapest at scale, but requires more setup (domain verification, sending-limit
   warm-up, more manual deliverability management) — likely disproportionate ceremony for this
   unit's current volume.

D) **SMTP via an existing/generic provider** (e.g. whatever the founder already has, if anything)
   — avoids adding a new vendor dependency, but loses provider-specific deliverability tooling
   (bounce/complaint webhooks, etc.) that a dedicated transactional-email API provides.

X) Other (describe after [Answer]: below)

[Answer]: A — Resend. Proportionate to prototype/early-commercial volume; provider credentials server-only; explicit trust boundary receiving only email address + report-access link, never report contents or unnecessary data.

### Question 2 — DB-Transaction Mechanism for BR-U2B-15's Atomic Fulfillment
BR-U2B-15 requires the `PAID` transition, `VERIFIED_PAYMENT` authorization, `ReportGenerationJob`
creation, and `ProcessedStripeEvent` ledger entry to commit as one atomic unit. The existing DB
client (`src/db/client.ts`) uses `@neondatabase/serverless`'s **HTTP-based** driver
(`neon-http`/`drizzle-orm/neon-http`) — every prior atomic operation in this codebase (e.g.
`claimQueuedJob`'s `WHERE state = 'QUEUED'` claim) achieves atomicity via a **single** SQL
statement's own row-level atomicity, not a multi-statement transaction. `neon-http` does support
Drizzle's `db.transaction()`, but implements it by batching all statements into one HTTP request
rather than a normal interactive multi-round-trip transaction — meaning a transaction step that
needs to branch on the result of an earlier read *within the same transaction* may not behave the
way it would over a real persistent connection.

A) **Use `neon-http`'s batch-transaction support as-is**, structuring BR-U2B-15's sequence so the
   eligibility check is expressed as part of the conditional `UPDATE ... WHERE state = 'PENDING'`
   itself (mirroring the existing `claimQueuedJob` pattern) rather than a separate SELECT-then-branch
   step, so the whole sequence can be expressed as a batch of unconditional-once-the-UPDATE-succeeds
   statements — no new driver dependency. Requires confirming (during NFR Design/Code Generation)
   that Drizzle's `neon-http` transaction batching actually preserves atomicity for this specific
   multi-table sequence, since this would be the first time this codebase relies on it for more
   than a single statement.

B) **Switch to `@neondatabase/serverless`'s pooled/WebSocket driver** (`drizzle-orm/neon-serverless`)
   for genuine interactive transactions with real multi-statement, read-your-own-writes semantics —
   a small, targeted driver change (likely scoped to this write path, or the whole app if simpler),
   at the cost of a new dependency/connection model this codebase hasn't used before.

C) **Avoid a true multi-table transaction**: perform the `PAID` transition and ledger entry as one
   atomic step (single conditional UPDATE + insert, still expressible over `neon-http`), then create
   the `ReportGenerationJob` as a *separate*, idempotent follow-up step that a lightweight
   reconciliation pass (or the existing job poller) guarantees eventually runs for every `PAID`
   order lacking a job — closer to an outbox pattern, more moving parts, but avoids the driver
   question entirely.

X) Other (describe after [Answer]: below)

[Answer]: B — switch to Neon's pooled/WebSocket driver (@neondatabase/serverless + drizzle-orm/neon-serverless) for genuine interactive transactions, rather than forcing BR-U2B-15 into neon-http batch semantics; one consistent runtime DB client going forward; Stripe API/network calls stay outside any DB transaction.

### Question 3 — Live Stripe Test-Mode Integration Test Scope
Unit 1/2 established a pattern of deterministic tests (fake data, no network) plus a separate,
non-blocking live-integration suite (real King County GIS, real Anthropic, real headless-Chromium
PDF rendering) that skips cleanly without credentials. Stripe provides its own test-mode
tooling (test API keys, the Stripe CLI's local webhook forwarding, test card numbers) that could
support an equivalent live-but-test-mode integration test for Unit 2B.

A) **Include a live Stripe test-mode integration test** in this unit's scope (activated by
   `npm run test:integration`, skipping cleanly without a `STRIPE_SECRET_KEY`, matching the
   existing pattern exactly) — exercises a real Checkout Session creation and a real
   signature-verified webhook round-trip against Stripe's actual test environment, not just fake
   event fixtures. **Recommended** for consistency with this codebase's existing "prove it against
   the real thing when credentials allow, skip cleanly otherwise" discipline, and because webhook
   signature verification specifically is exactly the kind of logic that's easy to get subtly wrong
   against fake fixtures alone.

B) **Deterministic tests only** (fake Stripe events/responses) — defers live verification to manual
   testing via the Stripe CLI during Code Generation/Build & Test, tracked as an open
   external-verification item (mirroring how Unit 2 tracked Neon/Anthropic live verification) rather
   than an automated test. Lower build cost now.

X) Other (describe after [Answer]: below)

[Answer]: X — three test layers: (1) deterministic webhook/payment tests (signature handling, state transitions, duplicate/out-of-order events, rollback, duplicate-payment anomaly, refund idempotency), (2) automated live Stripe sandbox integration in the existing non-blocking suite, (3) Stripe CLI end-to-end webhook smoke treated as external/live verification, tracked in the external-verification tracker if unavailable during Construction.
---

*Design decisions made directly (not asked as questions) because they are standard, low-ambiguity
technical choices within this unit's own discretion:*
- **Stripe SDK**: the official `stripe` npm package (latest stable major version), used for both
  Checkout Session creation and webhook signature verification
  (`stripe.webhooks.constructEvent`) — the standard, essentially only sane choice; not a real
  decision point.
- **Webhook raw-body handling**: Stripe's signature verification requires the exact raw request
  body, not a parsed/re-serialized one — the webhook route handler must read the raw body before
  any JSON parsing, per Stripe's own documented requirement (BR-U2B-2/BR-U2B-4). This is a
  correctness constraint dictated by Stripe's API, not a choice.
- **BR-U2B-1's concurrency/duplicate-payment constraints**: implemented as Postgres partial unique
  indexes — one on `screeningRequestId` scoped to rows where `state = 'PENDING'` (at most one open
  checkout attempt), and one on `screeningRequestId` scoped to rows where `paidAt IS NOT NULL` (at
  most one order ever paid) — the standard, idiomatic Postgres mechanism for exactly this kind of
  partial-uniqueness invariant; not a real decision point requiring founder input.
- **No new rate-limiting on the webhook endpoint itself**: Stripe's signature verification is
  already the real, cheap gate against forged requests; the existing `ProcessedStripeEvent`
  ledger/idempotency design is the correct defense against Stripe's own legitimate retries, not a
  rate limiter. This differs from the report-access-token lookup endpoint (Unit 2), which faces
  guessing attempts from arbitrary clients and does warrant rate-limiting. **Founder-confirmed as
  written**, with one addition: a reasonable request-body size bound is still applied before
  expensive processing (ordinary boundary validation, not a new rate-limiting system).

**Artifacts generated 2026-08-24**, incorporating the 3 Q&A decisions above plus 3 additional
founder corrections applied directly to `nfr-requirements.md` (not re-asked as questions, each a
specific, unambiguous instruction):
- **PCI scope corrected**: Stripe-hosted Checkout substantially *reduces*, but does not eliminate,
  PCI obligations — the business retains its own compliance/attestation responsibilities. Never
  described as "no PCI scope." See NFR-U2B-4's PCI Scope section.
- **Customer email recognized as new PII**: `Order.customerEmail` requires data minimization, no
  unnecessary logging, explicit retention framing, server-side-only access, and Resend recognized
  as a processor/trust boundary — never described as introducing no new PII. See NFR-U2B-4's
  Customer Email Is New PII section.
- **Report bearer-link confidentiality expanded**: raw token and full token-bearing URLs never
  logged, `Referrer-Policy: no-referrer` on token-bearing pages, no analytics/third-party scripts
  on those pages, a pre-commercial-use proxy/deployment-log verification item, and Resend's
  transmission of the link recognized as an intentional exception — all layered on top of, not
  replacing, Unit 2's existing hash-only `ReportAccessCredential` mechanism (no redesign). See
  NFR-U2B-4's Report Bearer-Link Confidentiality section.

Awaiting explicit approval before proceeding to NFR Design (normal review gate).
