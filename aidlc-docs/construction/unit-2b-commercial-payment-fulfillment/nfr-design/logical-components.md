# Unit 2B: Logical Components

**Amended 2026-08-24 by the deployment-platform pivot (Railway -> Vercel)** — see
`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`. The `db/client.ts`
and `report-generation-orchestrator/poller.ts` rows below are updated to reflect Vercel Workflows;
every other row (domain logic, component boundaries) is unchanged.

Follows Unit 1/2's established `src/{component}/` organization convention. Every component below
is application code inside the same modular monolith — no new deployable service.

| Logical Component | Owns | Implements Pattern(s) | Why No New Infrastructure |
|---|---|---|---|
| `order-payment` (new) | `Order`, `OrderState`, `ProcessedStripeEvent`; `createCheckoutSession` (Pattern 1), `handleVerifiedWebhook` (Patterns 2, 6), `getPaymentState`, `processRefund` (Pattern 5); the two partial unique indexes (Pattern 3) | Pattern 1, 2, 3, 5, 6 | Application code + two new Postgres tables (`orders`, `processed_stripe_events`) + the official Stripe SDK — no new deployable service. Matches Order & Payment's already-approved component boundary (component-methods.md) exactly. |
| `checkout-fulfillment` (new) | Checkout & Fulfillment Service's coordination: readiness (delegates to existing `screening-request/authorization.ts` `checkReadiness`) → `order-payment.createCheckoutSession` → (on verified PAID, via `order-payment`) idempotent `ReportGenerationJob` creation; the guest status-read endpoint (Pattern 4); triggering refund initiation on terminal `ReportGenerationJob` failure (PO-4) | Pattern 4; orchestrates 1, 2, 5 | Thin coordination module over `order-payment`, `screening-request`, and `report-generation-job` — no new persisted state of its own beyond what it reads from those. Matches Checkout & Fulfillment Service's already-approved "deliberately thin and fast" boundary (services.md). |
| `report-access` (extended, Unit 2) | Adds a guest-delivery responsibility: on `VERIFIED_PAYMENT`-authorized job `COMPLETE`, issue/rotate a `ReportAccessCredential` and invoke `email-delivery` (below); the `deliveryStatus` fields (Pattern 7) | Pattern 7, 8 | Extends an existing, already-approved component (Unit 2) with new fields and one new function — not a new component. |
| `email-delivery` (new, small adapter) | A single function wrapping the Resend SDK call: send one transactional email (report-access link) to a given address, returning an accept/fail result — mirrors `rule-research-assistant/anthropic-client.ts`'s adapter shape (a narrow, swappable external-provider adapter, not a general notification framework) | Pattern 7 | One small adapter module around Resend's SDK — the same "narrow provider adapter" pattern already established for the Anthropic client, not a new notification subsystem. |
| `db/client.ts` (modified, not new) | **`neon-http` remains the default client**; a per-request `neon-serverless` `Pool`, opened/used/closed entirely within the webhook handler, is added specifically for BR-U2B-15's transaction — *not* a permanent replacement of `neon-http` (superseded from this row's original Railway-targeted decision, which planned to retire `neon-http` entirely and keep one long-lived pool; that assumed a persistent process Vercel doesn't have) | Pattern 2 | Two drivers, each used for what Neon's own documentation recommends for its use case — no new infrastructure, no new component. |
| `screening-request` (Unit 2, unchanged) | `ScreeningRequest.snapshot`/`snapshotTakenAt` — reused unchanged; its trigger point moves to `order-payment.createCheckoutSession` (BR-U2B-16's purchase-lock) | (no new pattern) | Existing component; Unit 2B changes only *which caller* invokes its existing, unmodified snapshot/immutability behavior. |
| `screening-request/authorization.ts` (Unit 2, unchanged) | `GenerationAuthorizationType.VERIFIED_PAYMENT` (extends the existing discriminated union), `checkReadiness` (unchanged logic, now called by `checkout-fulfillment` instead of only the internal-trigger path) | (no new pattern) | Existing module extended with one new union variant — not a new component. `INTERNAL_PROTOTYPE`'s existing code path is unchanged, only its public-route exposure is removed (BR-U2B-9, an `app/` routing change, not a new backend component). |
| `report-generation-job` (Unit 2, unchanged) | `createReportGenerationJob`'s existing idempotent-per-`screeningRequestId` behavior — reused unchanged, called from within `order-payment`'s Pattern 2 transaction as a second caller alongside Unit 2's existing internal-trigger caller | (no new pattern) | Existing component; no new fields, no new job state. |
| `report-generation-orchestrator` (Unit 2, **superseded by the platform pivot** — no longer a persistent poller) | **New**: `reportGenerationWorkflow` and `processRefundWorkflow` (durable Vercel Workflows, `'use workflow'`/`'use step'`), replacing the in-process poller entirely; a low-frequency Vercel Cron route implementing Pattern 9's 3 checks as the residual backstop for the one gap workflow durability doesn't itself close | Pattern 9 (mechanism superseded — see the pattern's own amendment note) | Vercel-native durable execution + a Cron route — no queue, no broker, no second worker service, no permanently-running process to manage a lifecycle for at all. |
| Frontend: checkout-initiation UI, guest status page (Workflow 4), refund-in-progress messaging | UI reading `order-payment`/`checkout-fulfillment` status only (Pattern 4's minimized response) — never exposes `reportAccessToken` or internal identifiers | Pattern 4, 8, 9 | Standard Next.js application code — no new backend infrastructure. |

## Explicitly Not Introduced (per the founder's proportionality instruction)

- **No queue, outbox, or event-sourcing system** — Pattern 1's resumability and Pattern 2's
  atomicity are both satisfied by conditional reads/writes and a real Postgres transaction; no
  asynchronous message-passing mechanism is needed at this unit's scale.
- **No outbox table, message broker, Redis, second worker service, or general workflow engine for
  reconciliation** (Pattern 9) — Vercel Workflows (a platform-native capability, not something this
  application builds) plus a low-frequency Cron backstop; correctness comes from each
  reconciliation action being conditional/idempotent, not from new coordination infrastructure.
- **No new `OrderState`** — `PENDING` already, correctly, covers "an Order exists and its Checkout
  Session may or may not be created yet" (Pattern 1); no `CHECKOUT_CREATION_IN_PROGRESS` or similar
  state is introduced.
- **No general payment-operation framework** — the resumability, atomicity, and refund patterns are
  each small, specific mechanisms scoped to their exact need, not a generalized "payment operation"
  abstraction layered over them.
- **No distributed lock service** — Pattern 3's partial unique indexes are Postgres's own
  concurrency control.
- **No new authentication framework** — Pattern 4's guest status-read capability reuses Stripe's own
  Checkout Session ID rather than minting and managing a new credential type.
- **No bounce/complaint-processing infrastructure** — Pattern 7's `EMAIL_SENT` is deliberately
  scoped to mean "provider-accepted," not "delivered," specifically to avoid needing this
  infrastructure; ACC-1 does not require it.
- **No dedicated webhook rate limiter** — signature verification plus the `ProcessedStripeEvent`
  ledger are the correct, sufficient defenses (NFR-U2B-4).
- **No object storage, message broker, or additional database** — everything above lives in the
  already-approved single Postgres database.

## Deferred to Infrastructure Design

*(Resolved by the amended `infrastructure-design.md` — Railway references below are historical,
from before the 2026-08-24 platform pivot; superseded, not deleted.)*

- ~~Concrete Stripe webhook endpoint URL/route configuration on Railway.~~ Resolved: `POST
  /api/webhooks/stripe` on Vercel.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the Resend API key's secret provisioning
  mechanism — resolved: Vercel environment variables, not Railway native secrets.
- ~~Neon connection-pool sizing/configuration for the new `neon-serverless` WebSocket driver under
  Railway's single-persistent-Service deployment model.~~ Resolved differently: per-request Pool
  lifecycle, `neon-http` as the default driver — see `infrastructure-design.md`'s "Database
  Connection Model."
- Resend sending-domain verification and any Resend-side configuration.
- The exact request-body size bound value for the webhook endpoint (Pattern 6) — a concrete number,
  set from reasonable defaults/evidence, not invented speculatively here.
- Pattern 9's reconciliation-tick interval and the `EMAIL_PENDING` staleness/uncertainty threshold
  — concrete values, set from reasonable defaults and later tuned from real observed latency
  (matching NFR-U2-2/Build & Test's existing "soft targets revised from evidence" discipline), not
  invented precisely here.
