# Unit 2B: Domain Entities

Unit 1 and Unit 2's entities are unchanged and reused as-is: `ScreeningRequest` (+ its immutable
`snapshot`), `ReportGenerationJob`, `EvidenceReportArtifact`, `ReportAccessCredential` (extended
below — the credential *mechanism* is unchanged, only new delivery-tracking fields are added).
This document defines only what Unit 2B adds: `Order`, `ProcessedStripeEvent`, the
`GenerationAuthorization.VERIFIED_PAYMENT` variant left as a placeholder in Unit 2's
`domain-entities.md`, and the delivery-tracking extension to `ReportAccessCredential`.

## OrderState

*(Functional Design decision, corrected per founder review — Stripe Checkout Session states do not
map cleanly onto a single "payment failed" terminal state, since a customer can fail a card attempt
and retry within the same still-open session; a naive `PAYMENT_FAILED` state would risk
prematurely terminalizing an `Order` a customer is still actively trying to complete.)*

```
OrderState =
  | "PENDING"         // Checkout Session created; payment not yet verified
  | "PAID"            // Authoritative, webhook-verified payment success
  | "REFUND_PENDING"  // A refund has been requested/initiated but not yet confirmed by Stripe
  | "REFUNDED"         // Stripe has confirmed the refund succeeded
  | "REFUND_FAILED"    // Stripe has confirmed the refund failed; needs resolution
  | "EXPIRED"          // The Checkout Session expired without a successful payment
```

Follows this codebase's established `const {...} as const` + derived-union-type pattern (see
`src/regulatory-rules-engine/types.ts`'s `FindingClassification` for the precedent), not a
TypeScript `enum`.

**Legal transitions only** (see `business-rules.md` BR-U2B-2 for the full state machine, and the
externally-confirmed vs. local-command distinction):
```
(created)       ------[local: order creation]-------------------> PENDING

-- externally-confirmed (signature-verified Stripe webhook required) --
PENDING         --[verified webhook: payment succeeded]---------> PAID
PENDING         --[verified webhook: session expired]------------> EXPIRED
REFUND_PENDING  --[verified webhook: refund succeeded]-----------> REFUNDED
REFUND_PENDING  --[verified webhook: refund failed]---------------> REFUND_FAILED

-- local command (server-initiated, not by any external event) --
PAID            --[local: refund initiated - PO-4 auto or PO-5 manual]--> REFUND_PENDING
REFUND_FAILED   --[local: refund re-initiated]--------------------------> REFUND_PENDING
   (Unit 2B implements no path that exercises this last transition - see business-rules.md
   BR-U2B-5's Unit 2B scope decision; the state is modeled for a later unit's use.)
```
A browser redirect or any client-supplied status field can trigger **neither** kind of transition
(`business-rules.md` BR-U2B-2).

`PAID`, `REFUNDED`, and `EXPIRED` are the only states with no further-forward transition except the
explicit refund path out of `PAID`. No transition ever moves an `Order` backward from `PAID` to
`PENDING`, or from any refund state back to a pre-refund state — a duplicate/out-of-order webhook
can only be a no-op against an already-reached state, never a regression (BR-U2B-2, BR-U2B-4).

Generation states (`QUEUED`/`IN_PROGRESS`/`COMPLETE`/`FAILED`) never appear here — those remain
`ReportGenerationJob`'s alone, per the already-approved component boundary (`components.md` #14).

## Order *(new entity, owned by Order & Payment)*

| Field | Notes |
|---|---|
| `id` | Identity, server-generated **at order-creation time**, before any Stripe object exists (BR-U2B-14). |
| `screeningRequestId` | References the `ScreeningRequest` this order is for. **Not** guaranteed one-to-one — a customer may abandon a checkout (session expires) and start a new one, producing a second `Order` for the same `screeningRequestId`. See BR-U2B-1 for the at-most-one-open-`PENDING`/at-most-one-`PAID`-order-per-request invariants this implies. |
| `state` | `OrderState`, above. |
| `priceCents`, `currency` | The exact server-determined amount used to create the Stripe Checkout Session for *this* order — immutable once set, becomes part of the immutable commercial record regardless of later price changes for future orders (BR-U2B-12). Single currency only (no multi-currency architecture). |
| `checkoutCreationIdempotencyKey` | A stable key generated at order-creation time, used as the Stripe idempotency key for *creating this order's Checkout Session* — so a retry of that specific creation call cannot produce two Stripe sessions for the same intended order (BR-U2B-14). Distinct from `refundIdempotencyKey`, below (different operation, different lifecycle). |
| `stripeCheckoutSessionId?` | **Optional / may be temporarily absent.** Set only after the Stripe Checkout Session is successfully created and persisted back onto this already-existing `Order` (BR-U2B-14) — `Order` existence never depends on this being present yet. Unique once set. |
| `stripePaymentIntentId?` | Set once payment succeeds; used to originate the refund call. |
| `customerEmail?` | Set **only** from verified Stripe-side checkout/payment data (BR-U2B-13) — never from a client-submitted value. This is the guest report-access delivery address (ACC-1). |
| `paidAt?` | Set truthfully whenever Stripe confirms payment for this Order — including a `DUPLICATE_PAYMENT`-classified duplicate (corrected 2026-08-25: a duplicate charge is a real, confirmed payment, never falsified to `NULL` to satisfy a constraint). Remains populated through every subsequent refund state. BR-U2B-1's database-level canonical-payment backstop is scoped to `paidAt IS NOT NULL AND refundReason IS DISTINCT FROM 'DUPLICATE_PAYMENT'`, not merely `paidAt IS NOT NULL`. |
| `refundReason?` | `"GENERATION_FAILURE"` (PO-4, automatic) \| `"CUSTOMER_REQUEST"` \| `"GOODWILL"` (PO-5, manual) \| `"DUPLICATE_PAYMENT"` (BR-U2B-1's anomaly backstop, automatic) — recorded at refund-initiation time. |
| `refundIdempotencyKey?` | A stable key derived from this order's identity, generated once at refund initiation and reused **only** for transport-level retries of that *same logical refund attempt* — never reused to originate a distinct new attempt after a prior one has conclusively failed (BR-U2B-5's corrected scope). Unit 2B never generates a second one for the same order (no automatic retry after `REFUND_FAILED` — BR-U2B-5). |
| `stripeRefundId?` | Set once Stripe acknowledges the refund request. |
| `refundConfirmedAt?` | Set only when Stripe confirms the refund actually succeeded — **not** when the refund request is merely submitted (BR-U2B-5). |
| `createdAt`, `updatedAt` | Standard. |

**Explicitly not on `Order`**: any `ReportGenerationJob` reference. The link is one-directional —
`ReportGenerationJob.generationAuthorization` (below) references the `Order`, not the reverse —
consistent with `ReportGenerationJob`'s existing pattern of referencing what authorized it rather
than being referenced back.

**Concurrency and duplicate-payment invariants** (BR-U2B-1, full detail there; corrected
2026-08-25): at most one `Order` with `state = PENDING` may exist per `screeningRequestId` at a
time; at most one **canonical** `Order` (`paidAt` non-null and `refundReason` not
`DUPLICATE_PAYMENT`) may ever authorize fulfillment per `screeningRequestId` — enforced at the
database level, not only by an application-level pre-query. A confirmed second payment for the
same request is a duplicate-payment anomaly: it still gets a real, truthful `paidAt`/
`stripePaymentIntentId` (Stripe really did confirm it), is classified `refundReason:
DUPLICATE_PAYMENT`, and is automatically refunded — never silently kept, and never falsified to
look like it didn't happen.

## ProcessedStripeEvent *(new entity, internal to Order & Payment's webhook handling)*

A minimal receipt ledger, not a general event-sourcing store (explicitly scoped down per the
founder's answer to Question 5).

| Field | Notes |
|---|---|
| `stripeEventId` | Unique. Stripe's own event ID — the sole idempotency key for "have I handled this exact webhook delivery before." |
| `eventType` | e.g. the Stripe event's `type` field — recorded for diagnosability, not branched on for idempotency (see BR-U2B-4: idempotency is per-event-ID, not per-type). |
| `stripeObjectId` | The Stripe object the event concerns (Checkout Session, PaymentIntent, or Refund ID, depending on `eventType`) — lets a processed event be traced back to the `Order` it affected. |
| `processedAt` | When this event's domain transition was applied. |

This ledger is a **defense-in-depth** layer, not the only idempotency protection — `Order`'s own
state-machine transitions (above) remain independently idempotent regardless of whether the ledger
check ran, per BR-U2B-4.

## GenerationAuthorization — `VERIFIED_PAYMENT` variant *(fills the placeholder left in Unit 2's domain-entities.md)*

```
GenerationAuthorization =
  | { type: "INTERNAL_PROTOTYPE"; screeningRequestId; authorizedBy: string; authorizedAt: string }
  | { type: "VERIFIED_PAYMENT"; screeningRequestId; orderId: string; authorizedAt: string }
```

- `VERIFIED_PAYMENT` is produced **only** as the direct consequence of an `Order` reaching `PAID`
  via a verified webhook, as part of the same atomic local-effects unit (BR-U2B-15) — never
  constructed speculatively, never constructed from an unverified client signal (BR-U2B-3).
- Carries `orderId`, not a human `authorizedBy` identity — there is no human decision-maker in this
  path, the authorization *is* the verified payment.
- Consumed by the exact same, unchanged `createReportGenerationJob(db, screeningRequestId,
  authorization)` contract Unit 2 already built — Checkout & Fulfillment Service becomes a second
  caller of an existing function, not a reason to change its signature. Job creation's existing
  idempotency (one job per `screeningRequestId`) is reused unchanged; combined with BR-U2B-1's
  at-most-one-`PAID`-order-per-request invariant, this is sufficient to guarantee at most one
  `ReportGenerationJob` per `Order` without any new idempotency mechanism at the job-creation layer
  (see `business-rules.md` BR-U2B-1).
- `INTERNAL_PROTOTYPE` is unchanged and remains available, but per the founder's answer to Question
  4, is no longer reachable from any public/customer-facing route — only from an internal-only
  mechanism (script/CLI/dev-only entry point). See BR-U2B-9.

## ReportAccessCredential *(extended — mechanism unchanged, delivery-tracking fields added)*

Unit 2 already built the hashed-bearer-token mechanism (`src/report-access/credential.ts`,
`repository.ts` — `generateAccessCredential`, `rotateAccessCredential`, `findArtifactIdByAccessToken`)
but it was never wired into any production code path (`createAccessCredential` has zero production
call sites today — confirmed by direct inspection). Unit 2B is the unit that actually wires it up,
for the first time, as ACC-1's real guest-delivery mechanism.

New fields on the existing entity:

| Field | Notes |
|---|---|
| `deliveryStatus` | `"EMAIL_PENDING"` \| `"EMAIL_SENT"` \| `"EMAIL_FAILED"` — tracks the email-delivery attempt for *this* credential, not the report's lifecycle. |
| `deliveryAttempts` | Count, for diagnosability. |
| `lastDeliveryAttemptAt?` | Standard. |

**No raw token is ever persisted** to support later retries (unchanged invariant, reaffirmed per
the founder's explicit instruction). A delivery retry after an uncertain or failed send **rotates**
the credential (`rotateAccessCredential` — already exists, unmodified) rather than re-sending a
persisted raw value: the old credential is revoked, a new one is issued, and only the
newly-delivered link is intended to remain valid (BR-U2B-10).

## Reused Unchanged

- **`ScreeningRequest`** (`screening-request/types.ts`) — its existing `snapshot`/`snapshotTakenAt`
  fields are reused exactly as-is; only the *trigger* that takes the snapshot moves from
  `authorizeReportGeneration` (Unit 2's internal path) to `createCheckoutSession` (Unit 2B's real
  path, at `PO-1` time) — see `business-logic-model.md` Workflow 2. Unit 2's existing
  once-snapshotted-immutable rule (`updateProjectDetails` already refuses edits once `snapshot` is
  set) now activates at this earlier trigger point, purchase-locking the request (BR-U2B-16) — no
  new mechanism.
- **`ReportGenerationJob`** (`report-generation-job/repository.ts`) — `QUEUED → IN_PROGRESS →
  COMPLETE | FAILED` is unchanged; Unit 2B adds no new job state and does not touch job-state
  transitions directly (Checkout & Fulfillment Service only *creates* jobs, per its existing
  approved boundary — it does not claim, complete, or fail them).
- **`EvidenceReportArtifact`** — unchanged; Unit 2B adds no fields.
