# Unit 2B: NFR Requirements

Reuses Unit 1/2's security discipline (env-only credentials, runtime schema validation at every
trust boundary) and general reliability posture unchanged. This document adds only what Unit 2B's
new surfaces (a real external payment provider, a real email-delivery provider, a new
multi-statement-transaction requirement) need.

## NFR-U2B-1: Scalability

Unchanged from Unit 2's prototype-scale framing (NFR-U2-1) — low volume, no autoscaling, load
balancing, or multi-instance coordination introduced for this unit's expected volume. Stripe and
the email provider are themselves scaled services; nothing about accepting real payments at
prototype volume requires new scaling infrastructure on this application's side.

## NFR-U2B-2: Performance (soft targets, not SLAs)

- Checkout initiation (`createCheckoutSession`, including the new Order-then-Session sequencing —
  BR-U2B-14) should complete well within a few seconds under ordinary conditions — two sequential
  operations (one DB write, one Stripe API call), not a heavy pipeline.
- Webhook processing (BR-U2B-15's atomic fulfillment transaction) should complete quickly — this is
  local DB work only; Stripe does not wait for a slow response before considering delivery
  successful, but a slow handler risks Stripe's own retry/timeout behavior triggering redundant
  redelivery, which the existing `ProcessedStripeEvent` ledger already handles safely, but is still
  worth avoiding for latency's own sake.
- Refund *confirmation* latency (the `REFUND_PENDING -> REFUNDED`/`REFUND_FAILED` gap) is
  Stripe-side and not a target this unit controls or bounds — the customer-facing "a refund has
  been initiated" message (BR-U2B-6) exists specifically because this step is not instantaneous.
- No specific throughput target — consistent with NFR-U2-2's "soft engineering sanity check, not a
  contractual SLA" framing, especially apt here since there is genuinely no formal commercial SLA
  with customers yet.

## NFR-U2B-3: Availability

No formal uptime SLA, unchanged from Unit 2's posture. The webhook endpoint must tolerate Stripe's
own retry behavior gracefully (a transient outage on this application's side results in Stripe
retrying delivery per its own schedule, which BR-U2B-15's atomic-or-nothing design and BR-U2B-4's
ledger together handle correctly without any special-cased outage logic).

## NFR-U2B-4: Security

### PCI Scope (corrected per founder review, 2026-08-24)
Stripe-hosted Checkout keeps raw cardholder data out of this application's server/database boundary
entirely — card data is never received, processed, or stored by Permit Preflight's own code. This
**substantially reduces** this unit's PCI obligations (no application-level PCI DSS requirements
apply to code that never touches cardholder data) but does **not** eliminate the business's own PCI
compliance/attestation responsibilities as a business accepting payments through Stripe (e.g.
Stripe's own merchant-level SAQ requirements). This unit is correctly described as **minimized/
reduced PCI scope**, never as "no PCI scope" or "not applicable."

### Customer Email Is New PII (corrected per founder review, 2026-08-24)
`Order.customerEmail` (BR-U2B-13) is new personal data this application persists and processes,
where none existed for a guest customer before Unit 2B. This is genuine PII, not a neutral
implementation detail:
- **Data minimization**: only the email itself is persisted — no additional customer-identifying
  fields are collected or stored beyond what fulfillment (report delivery) and support (refund/
  dispute investigation, Unit 3's future ADM-5 scope) genuinely require.
- **No unnecessary logging**: `customerEmail` is never written to application logs, error payloads,
  or analytics — the same "never log a sensitive value" discipline this codebase already applies to
  credentials and access tokens.
- **Retention**: `customerEmail` persists for as long as the `Order` record itself does (the same
  retention as the commercial/audit record it's part of — see BR-U2B-8's "historical report/order/
  payment record remains available internally for auditability" carried forward from PO-5). No
  separate, shorter retention window is introduced without an explicit later decision; no retention
  policy is invented speculatively beyond what's already implied by keeping the Order record itself.
- **Server-side access only**: `customerEmail` is read only by the delivery step (Workflow 6) and
  any future internal/support tooling (Unit 3's ADM-5) — never exposed to the frontend beyond what
  the customer themselves already provided at Stripe Checkout.
- **Resend is a recognized processor/trust boundary** (see below) — this PII is intentionally
  disclosed to it for delivery, and to no other third party.

### Guest Report-Access Delivery: Resend (Question 1)
- **Resend** is this unit's transactional email provider — proportionate to prototype/early-
  commercial volume, a free tier sufficient for expected Unit 2B volume, a simple SDK consistent
  with this codebase's low-ceremony external-adapter pattern (mirrors the Anthropic-client
  precedent).
- Resend's API credential is environment-variable-only, server-side only — same discipline as
  `DATABASE_URL`/`ANTHROPIC_API_KEY` (NFR-U2-4, unchanged).
- **Resend is an explicit new trust boundary**, not an invisible implementation detail: it
  necessarily receives (a) the customer's email address and (b) the secure report-access link being
  emailed. **Only** these are sent to Resend — report contents, findings, evidence, or any other
  property/customer data are never transmitted through the email provider. The email body contains
  the access link and minimal orienting text only.

### Report Bearer-Link Confidentiality (expanded per founder review, 2026-08-24)
Commercial emailed report links make `reportAccessToken` a real customer credential, not just a
prototype convenience — Unit 2's existing hash-only persistence invariant
(`report-access/credential.ts`, unchanged) is preserved, and the following are **added, required**
for Unit 2B:
- The raw `reportAccessToken` never appears in application logs, under any log level.
- A full token-bearing report URL (the complete link, not just the token value in isolation) is
  never logged — logging a URL that happens to embed the token is just as much a leak as logging
  the token directly.
- Token-bearing report pages (`/report/[token]`, its PDF route) serve with `Referrer-Policy:
  no-referrer`, so navigating away from a report page (e.g. clicking an external link within it)
  cannot leak the token-bearing URL to the destination site via the `Referer` header.
- No analytics or third-party script may run on a token-bearing page in a way that could observe or
  transmit the full URL (consistent with NFR-U2-3/NFR-U2-4's existing "no speculative analytics
  infrastructure" stance — this is a hard constraint here, not just a scope-discipline preference).
- Before commercial use, deployment/proxy-level access logging (the hosting platform's own request
  logs — Vercel's, per the 2026-08-24 platform pivot; originally written against Railway's, same
  requirement either way — any CDN/proxy in front of the app) is checked to confirm raw
  token-bearing paths are not incidentally captured in infrastructure logs outside this
  application's own control — an Infrastructure Design/
  Operations verification item, not something this application's code alone can guarantee.
- Email transmission to Resend is itself a recognized, intentional exception to "never let the token
  leave the server boundary uncontrolled" — the provider necessarily processes the link being
  emailed, which is why Resend is called out as an explicit trust boundary above rather than treated
  as an implementation detail.

This does **not** require redesigning `ReportAccessCredential` — the existing hashed-bearer-token
mechanism already satisfies these requirements structurally; NFR Design/Code Generation implements
the additional operational controls (logging discipline, `Referrer-Policy` header, proxy-log
verification) around the existing, unmodified mechanism.

### Webhook Endpoint Hardening
- **No dedicated rate limiter** on the Stripe webhook endpoint — signature verification is the
  real, cheap gate against forged requests, and the `ProcessedStripeEvent` ledger (BR-U2B-4) is the
  correct defense against Stripe's own legitimate retry volume, not a rate limiter. This differs
  from the report-access-token lookup endpoint (Unit 2), which faces arbitrary-client guessing
  attempts and does warrant one.
- **A reasonable request-body size bound** is applied before any expensive processing (raw-body
  read, signature verification, JSON parsing) — ordinary boundary validation (reject
  implausibly-large request bodies outright), not a new rate-limiting system.
- Webhook signature verification uses the exact raw request body Stripe requires (BR-U2B-2,
  BR-U2B-4) — the route handler reads the raw body before any JSON parsing occurs, since parsing
  and re-serializing would not reproduce Stripe's exact byte sequence and would break signature
  verification.

### Credentials (reaffirmed, unchanged from Unit 1/2)
`DATABASE_URL`, `ANTHROPIC_API_KEY` remain environment-variable-only. Unit 2B adds
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and Resend's API key to the same discipline —
server-only environment variables, never logged, never exposed to the client bundle.

## NFR-U2B-5: Reliability

### Concurrency and Atomicity Mechanism (Question 2 — corrected driver decision)
The existing DB client (`src/db/client.ts`) uses `@neondatabase/serverless`'s **HTTP-based** driver
(`drizzle-orm/neon-http`), which every prior atomic operation in this codebase has satisfied via a
single conditional `UPDATE` statement's own row-level atomicity (`claimQueuedJob`'s pattern) — never
a true multi-statement interactive transaction. BR-U2B-15 is the first path in this application that
genuinely needs one (four different tables committing atomically: `Order`, `GenerationAuthorization`
persistence, `ReportGenerationJob`, `ProcessedStripeEvent`).

**Decision**: switch to `@neondatabase/serverless`'s pooled/WebSocket driver
(`drizzle-orm/neon-serverless`) for real interactive, multi-statement transaction semantics, rather
than forcing BR-U2B-15's sequence into `neon-http`'s HTTP-batch transaction model. One consistent
runtime DB client is used across the application going forward (the WebSocket driver), rather than
maintaining both an HTTP and a WebSocket DB abstraction side by side, unless concrete implementation
evidence during Code Generation demonstrates a real reason to keep both (e.g. a specific
serverless-execution-environment constraint that favors the HTTP driver for cold-start latency on
paths that don't need transactions). This is an Infrastructure Design/Code Generation-level driver
swap, not a schema change — `db/schema.ts` and every existing query built through Drizzle's
query-builder API are expected to keep working against the new driver essentially unchanged.

Within BR-U2B-15's transaction:
- the conditional `PENDING -> PAID` check-and-transition,
- persisting verified Stripe/customer references (`stripePaymentIntentId`, `customerEmail`),
- persisting the `GenerationAuthorization { type: VERIFIED_PAYMENT }`,
- `ReportGenerationJob` creation (the existing, unmodified `createReportGenerationJob`, called
  within this transaction's connection/context),
- `ProcessedStripeEvent` insertion,

all commit together or none do. **Stripe API/network calls are never placed inside this (or any) DB
transaction** — signature verification happens before it starts; any outbound Stripe call (e.g. the
refund API call, BR-U2B-5's refund process) happens outside any DB transaction, with its own
idempotency-key-based safety (already specified in Functional Design), not transactional safety.

### Concurrency Constraints (BR-U2B-1) — Postgres Partial Unique Indexes
Implemented as two partial unique indexes on `Order.screeningRequestId`:
1. Scoped to rows where `state = 'PENDING'` — enforces "at most one open checkout attempt per
   screening request" at the database level, closing the race window an application-level
   pre-query alone cannot close.
2. Scoped to rows where `paidAt IS NOT NULL` — enforces "at most one order ever paid per screening
   request" durably, continuing to hold through every subsequent refund state since `paidAt` is
   never cleared by a refund (BR-U2B-8's refund-does-not-alter-the-historical-record principle
   applies here too).

This is the standard, idiomatic Postgres mechanism for exactly this shape of partial-uniqueness
invariant.

### Refund Idempotency (unchanged from Functional Design, restated as an NFR)
`refundIdempotencyKey` is generated once per logical refund attempt and reused only for
transport-level retries of that attempt (BR-U2B-5's corrected scope) — Unit 2B implements no
automatic retry after a confirmed `REFUND_FAILED`; that state requires manual/support resolution,
explicitly deferred to Unit 3 or later.

### Reuses Unit 1/2's Bounded-Retry Executor Where Applicable
Unchanged pattern (NFR-U2-5) for any bounded, safe-to-retry external read this unit performs (none
beyond what Unit 2 already retries — Stripe API calls' own retry/idempotency behavior, described
above, is a distinct mechanism suited to Stripe's own API semantics, not a reason to introduce a
second general-purpose retry system).

## NFR-U2B-6: Maintainability / Testing

Three test layers, per the founder's explicit direction (Question 3):

### 1. Deterministic Tests (no Stripe network dependency)
In the existing deterministic suite (`npm test`), covering:
- Raw-body signature-verification handling (valid and invalid signatures, using Stripe's own
  signature-construction algorithm against fixture payloads/secrets — no live call).
- `Order` state-machine transitions — every legal transition in `domain-entities.md`'s `OrderState`
  table, and confirmation that illegal/backward transitions are rejected.
- Duplicate event ID handling (the same `stripeEventId` delivered twice is a no-op the second time).
- Two distinct Stripe Event IDs representing the same underlying payment condition (BR-U2B-4's
  "the ledger is defense-in-depth, not the only protection" case) — confirms the `Order`'s own
  state-machine idempotency independently catches this.
- Out-of-order event delivery (e.g. a stale/already-superseded event arriving after a newer one) —
  confirms no backward transition occurs.
- Webhook-handler transaction rollback behavior (a failure partway through BR-U2B-15's atomic unit
  leaves the `Order` `PENDING` and no `ProcessedStripeEvent` recorded, provable via a fault-injected
  test double rather than a real DB failure).
- The duplicate-payment anomaly path (BR-U2B-1 point 4 / Workflow 3 step 7) — a second `PAID`
  confirmation for an already-`PAID` `screeningRequestId` triggers the automatic
  `DUPLICATE_PAYMENT` refund path and creates no second job.
- Refund idempotency/state transitions (`PAID -> REFUND_PENDING -> REFUNDED`/`REFUND_FAILED`, and
  confirmation that `REFUND_FAILED` does not auto-retry).

### 2. Automated Live Stripe Sandbox Integration (Question 3)
Added to the existing non-blocking live-integration suite (`npm run test:integration`), activated
when `STRIPE_SECRET_KEY` is present, skipping cleanly otherwise (same pattern as the existing King
County/Anthropic live tests):
- Create a real Checkout Session against Stripe's test environment.
- Verify the server-authoritative amount/currency actually reached Stripe as intended (BR-U2B-12).
- Verify the internal `orderId` round-trips correctly via `client_reference_id`/metadata
  (BR-U2B-14).
- Retrieve the created Session from Stripe and confirm its configuration matches what was requested.

### 3. Stripe CLI End-to-End Webhook Smoke (Question 3)
Treated as **external/live verification**, not a blocking CI test — using `stripe listen
--forward-to <local webhook route>` against a real Stripe-hosted test Checkout flow and a test card,
proving the full chain: Checkout payment → Stripe sandbox event → Stripe CLI-forwarded signed
webhook → this application's raw-body signature verification → `Order` `PAID` transition →
`VERIFIED_PAYMENT` authorization → `ReportGenerationJob` creation → `ProcessedStripeEvent`
recording. If Stripe CLI/credentials are unavailable during Construction, this is recorded as an
open item in `aidlc-docs/operations/external-verification-tracker.md`, not fabricated — consistent
with how Unit 1/2 handled Neon/Anthropic live verification under the same constraint.

## Extension Compliance Summary

| Extension | Applicable Here | Status |
|---|---|---|
| Security Baseline | Yes | Compliant — NFR-U2B-4 (PCI-scope framing corrected to "reduced, not zero"; customer email treated as new PII with minimization/logging/retention/access controls; Resend and Stripe both recognized as explicit trust boundaries; report bearer-link confidentiality hardened with logging, `Referrer-Policy`, no-analytics, and proxy-log-verification requirements; webhook endpoint hardened with raw-body handling and a body-size bound instead of a rate limiter) |
| Resiliency Baseline | Yes | Compliant — NFR-U2B-5 (atomic multi-statement fulfillment via a real interactive-transaction driver, DB-level concurrency constraints via partial unique indexes, corrected/scoped refund idempotency, Stripe's own retry semantics respected rather than fought) |
| Property-Based Testing | N/A | This unit introduces no spatial/geometry/rule-evaluation primitives — its logic is state-machine and integration orchestration, which the extension's own targeted scope (spatial/geometry/rule primitives/parsers/serialization) does not cover. Fixture-based testing (NFR-U2B-6) applies instead, consistent with the extension's own scope limit. |
