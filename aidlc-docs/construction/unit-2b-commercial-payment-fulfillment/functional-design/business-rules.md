# Unit 2B: Business Rules

All Unit 1 and Unit 2 business rules are unchanged and unaffected — this document defines only the
new rules Unit 2B introduces. Where a Unit 2 rule is directly superseded (BR-U2-2, generation
authorization), that supersession is called out explicitly rather than left implicit.

## BR-U2B-1: At Most One PAID Order Per ScreeningRequest — Concurrency and Duplicate-Payment Safety

*(Amended per founder review, 2026-08-24 — the original pre-query check was necessary but not
sufficient; concurrency and a hard duplicate-payment backstop are now explicit.)*

A `ScreeningRequest` may have multiple `Order` rows over time (an abandoned/expired checkout
followed by a later successful one), but **at most one** may ever reach `PAID`, and **at most one
open/active checkout attempt** may normally exist at a time:

1. **Reuse over duplication**: before creating a new Checkout Session for a `screeningRequestId`,
   `createCheckoutSession` checks for an existing usable order for that request:
   - an existing `PAID` order → no new session is created; the caller is directed to the existing
     paid order (and its resulting report, once generated) instead. Never charge twice for the same
     configured project.
   - an existing `PENDING` order whose Checkout Session is still open/usable → that existing session
     is returned/reused, not duplicated.
   - an `EXPIRED` order, or one whose session has been deliberately expired/canceled server-side →
     does not block a new attempt; this is the normal abandoned-cart-retry path.
2. **Concurrency-safe**: concurrent checkout-initiation calls for the same `screeningRequestId` must
   not be able to race past this check and each create a separate active session. Functional
   Design's requirement is the invariant itself — at most one open `PENDING` order per
   `screeningRequestId` at any moment — not the specific locking/constraint mechanism, which is a
   Code Generation/database concern. A DB-level uniqueness constraint scoped to "at most one row
   with `state = PENDING` per `screeningRequestId`" (or equivalent conditional/partial-unique
   constraint) is the expected shape of that mechanism, not merely an application-level pre-query
   (which cannot, by itself, close the race).
3. **Hard backstop, enforced at the database level, not only by pre-query** *(corrected 2026-08-25,
   post-Code-Generation founder review — the original wording below was physically untrue and
   would have required falsifying a real payment record to satisfy it; see BR-U2B-1 point 4 and
   Code Generation's `orders_screening_request_id_paid_unique` for the corrected implementation)*:
   the actual invariant is **"at most one `Order` may ever authorize fulfillment for a given
   `screeningRequestId`"** — not "at most one `Order` may ever have had a payment confirmed." A
   `refundReason: DUPLICATE_PAYMENT` order genuinely was paid (Stripe really did confirm it) and
   must record that truthfully (`paidAt`, `stripePaymentIntentId` both set for real), while never
   counting toward this constraint and never authorizing generation. The equivalent database shape
   is a uniqueness constraint on `screeningRequestId` scoped to rows where `paidAt` is non-null
   **and `refundReason` is not `DUPLICATE_PAYMENT`** — `paidAt` remains populated through every
   subsequent refund state (canonical or duplicate) once set, so the constraint continues to hold
   after a refund, not just at the moment of payment. Exact database mechanics (partial index,
   application-level serialized check, etc.) are deferred to later stages; Functional Design fixes
   the invariant, not the implementation.
4. **Duplicate-payment anomaly handling**: if an abnormal race nonetheless results in Stripe
   confirming payment on a *second* `Order` for the same `screeningRequestId` (e.g. two sessions were
   both completed by the customer before either webhook was processed), the second `PAID` transition
   is **not** treated as an ordinary success:
   - it does **not** create a second `ReportGenerationJob` (BR-U2B-1's job-idempotency point, below,
     still holds — job creation stays keyed to `screeningRequestId`),
   - it is **not** silently ignored — money was genuinely captured twice, and that fact is not
     allowed to disappear,
   - it is classified as a **duplicate-payment anomaly** and logged as such,
   - a refund/resolution of the duplicate payment is **automatically initiated** for the second
     order, via the same BR-U2B-5 refund process (`refundReason: "DUPLICATE_PAYMENT"`).
   "At most one report per paid request" must never silently degrade into "we kept the second charge
   but ignored it."
5. This invariant, combined with `ReportGenerationJob`'s existing idempotent-per-`screeningRequestId`
   creation (unchanged from Unit 2), is sufficient to guarantee at most one `ReportGenerationJob` is
   ever created per screening request — **no new job-level idempotency mechanism is introduced**, the
   existing one is simply reused by a second caller (Checkout & Fulfillment Service, alongside Unit
   2's existing internal-trigger caller).

## BR-U2B-2: Order State Machine — Externally-Confirmed Transitions vs. Local Command Transitions

*(Amended per founder review, 2026-08-24 — the original "every transition requires a verified
webhook" statement directly contradicted BR-U2B-5, where `PAID -> REFUND_PENDING` is a local
transition that happens *before* the Stripe API call. Normalized below.)*

`Order` transitions (see `domain-entities.md`'s `OrderState`) fall into two kinds:

**Externally-confirmed transitions** — require a signature-verified Stripe webhook event, and
**only** that:
```
PENDING         -> PAID
PENDING         -> EXPIRED
REFUND_PENDING  -> REFUNDED
REFUND_PENDING  -> REFUND_FAILED
```
`PENDING -> PAID` additionally requires the verified event to confirm the underlying payment was
actually completed (e.g. inspecting the Checkout Session's own payment-completion signal), not
merely that an event of a given type arrived — an event type name alone is never sufficient grounds
to transition state (reaffirmed by BR-U2B-11's payment-method-scope discussion). `PENDING ->
EXPIRED` requires the verified event confirming the Checkout Session expired without a successful
payment.

**Local command transitions** — initiated server-side, by this system's own logic, not by an
external event:
```
(order creation)  -> PENDING
PAID               -> REFUND_PENDING     (refund initiated: BR-U2B-6 automatic, or BR-U2B-7 manual)
REFUND_FAILED      -> REFUND_PENDING     (a deliberate re-initiation, if the refund-retry design in
                                           effect permits one — see BR-U2B-5's Unit 2B scope note,
                                           which does not enable this automatically)
```

**In both cases**, a browser redirect to a success/return URL and any client-supplied status field
are incapable of causing *any* transition, authoritative or otherwise (the binding invariant
carried forward from requirements.md §9.1: **browser redirect is never proof of payment**). Local
command transitions are triggered by verified server-side conditions and internal decisions, never
by anything the browser or client asserts.

`EXPIRED` is terminal for that specific `Order` — a customer who wants to try again gets a **new**
`Order` and a new Checkout Session (BR-U2B-1's multiple-orders-per-request case), never a
resurrected expired one.

No transition ever moves an `Order` backward (`PAID` cannot return to `PENDING`; no refund state
returns to a pre-refund state). A webhook event that would imply a backward transition is treated
as already-handled (a no-op), never applied.

## BR-U2B-3: Generation Authorization Follows Payment, Never Precedes or Substitutes For It

`GenerationAuthorization { type: "VERIFIED_PAYMENT" }` may be constructed **only** as the direct
consequence of an `Order`'s `PENDING -> PAID` transition succeeding (BR-U2B-2) — same atomic local
transaction (BR-U2B-15), not a separately-triggerable action. There is no code path that constructs
a `VERIFIED_PAYMENT` authorization from anything other than a verified webhook having just moved the
referenced order to `PAID`.

This directly satisfies PO-3's "report generation is authorized only once the order is PAID" and
supersedes BR-U2-2 as the production authorization path — see BR-U2B-9 for `INTERNAL_PROTOTYPE`'s
continued, now internal-only, existence.

## BR-U2B-4: Webhook Idempotency — Ledger Plus State-Machine Defense, Not Event Sourcing

Every incoming Stripe webhook is handled as:
1. Verify the signature against the raw request body. An invalid signature produces **no** `Order`
   transition and is logged as a security-relevant event, never silently dropped without a trace.
2. Check the `ProcessedStripeEvent` ledger by `stripeEventId`. If already present, return success
   as a no-op — the event has already been fully handled.
3. Otherwise, apply the domain transition (BR-U2B-2) and record the event in the ledger, together,
   such that a crash between the two cannot leave the ledger and the `Order`'s actual state
   inconsistent in a way that causes a *second* delivery of the *same* event to be mis-handled.
4. The ledger is **defense-in-depth**, not the sole protection — `Order`'s own state-machine
   transitions (BR-U2B-2) are independently idempotent (a `PAID` order receiving another
   payment-success event is a no-op regardless of ledger state), because Stripe may occasionally
   deliver two distinct `Event` objects describing the same underlying condition.

This is deliberately **not** a general event-sourcing architecture — the ledger exists to answer
one question ("have I seen this exact event ID before"), nothing more.

## BR-U2B-5: Refunds Are Idempotent, Asynchronous, and Never Declared Successful Prematurely

Refund processing (`processRefund`) has its own real lifecycle (`REFUND_PENDING ->
REFUNDED`/`REFUND_FAILED`), not an instantaneous state flip:

1. On refund initiation (automatic per BR-U2B-6, or manual per BR-U2B-7), the order moves
   `PAID -> REFUND_PENDING` **before** the Stripe API call is made (a local command transition —
   BR-U2B-2), using a `refundIdempotencyKey` derived from the order's own identity and generated
   once, at initiation.
2. The Stripe refund API call is made using that same idempotency key on every **transport-level**
   retry of that same logical refund attempt (e.g. our server crashes or times out after calling
   Stripe but before durably recording the result, and must safely retry the exact same request) —
   a crash or retry around the call can never create a duplicate refund, because Stripe itself
   deduplicates by idempotency key **for repeats of the same key**.
3. `REFUND_PENDING -> REFUNDED` happens **only** when a verified Stripe event confirms the refund
   actually succeeded — never merely because the refund request was accepted/submitted. The
   customer-facing message during this window says a refund "has been initiated," never "has been
   completed," until that confirmation arrives.
4. `REFUND_PENDING -> REFUND_FAILED` happens on verified confirmation that the refund failed. This
   state is explicitly surfaced (not silently retried forever, not silently abandoned) as a
   condition requiring resolution.

**Idempotency-key scope correction (per founder review, 2026-08-24)**: `refundIdempotencyKey` is
scoped to *one logical refund attempt*, reused only for transport-level retries of that same
attempt (point 2, above) — it is **not** a permanent per-`Order` key to be reused for creating a
new, distinct logical refund attempt after a prior one has conclusively failed. Stripe's own
idempotency semantics return the *saved result* — including a saved error — when a key is reused,
so blindly re-calling Stripe with the same key after a confirmed `REFUND_FAILED` would not actually
attempt a new refund; it would just replay the failure.

**Unit 2B scope decision**: once an `Order` reaches `REFUND_FAILED`, Unit 2B does **not**
automatically (or even provide a mechanism to) initiate a second Stripe Refund attempt for it.
`REFUND_FAILED` requires manual/support resolution — `REFUND_FAILED -> REFUND_PENDING` is a legal
state in the model (`domain-entities.md`) but Unit 2B implements no path that exercises it; that is
explicitly deferred to Unit 3 or a later unit, which can introduce a distinct attempt concept (a new
idempotency key per deliberate new logical attempt, prior attempts/results preserved for audit) if
and when real retry/alternative-reimbursement behavior is needed. This keeps Unit 2B's refund model
to a single logical attempt per order — no general payments ledger or event-sourcing system is
introduced to support multiple attempts prematurely.

## BR-U2B-6: Automatic Refund on Terminal Generation Failure (PO-4)

When a `VERIFIED_PAYMENT`-authorized `ReportGenerationJob` reaches its genuinely terminal `FAILED`
state — i.e., **after** the job's existing resilience mechanisms have already run their course
(per-external-call bounded retries, and stale-`IN_PROGRESS` recovery after a process interruption;
neither of those is a retry of a terminal `FAILED` job, and neither is altered by this unit) —
Checkout & Fulfillment Service is notified and automatically initiates a refund for the associated
`Order` via BR-U2B-5's process, with `refundReason: "GENERATION_FAILURE"`.

The customer sees a clear, honest status through this process (e.g. "we couldn't generate your
report; a full refund has been initiated" while `REFUND_PENDING`, "your refund is complete" only
once `REFUNDED`). If the refund itself fails (`REFUND_FAILED`), this is surfaced as an explicit
support/manual-resolution requirement — Unit 3's operator tooling (ADM-6) is the eventual home for
resolving it, but Unit 2B does not depend on that tooling existing to satisfy PO-4's hard
requirement that a successful payment never leaves a customer in an undefined state.

## BR-U2B-7: Manual Refund Path Exists Without Unit 3's Admin UI (PO-5)

For refund reasons other than generation failure (a reported-accuracy dispute, or a goodwill
refund), `processRefund` is invoked through an internal-only mechanism (a script or dev-only route,
mirroring how `INTERNAL_PROTOTYPE` authorization is now exposed per BR-U2B-9) — **not** a
customer-facing self-service refund button, and **not** a polished admin UI (that remains Unit 3's
ADM-6 scope). The underlying `processRefund` capability and its BR-U2B-5 idempotency/asynchrony
guarantees are identical regardless of which path initiates it.

## BR-U2B-8: Refund State Is Independent of Report-Access State

A refund, of any reason and in any resulting state (`REFUND_PENDING`/`REFUNDED`/`REFUND_FAILED`),
**never** implicitly revokes report access and **never** deletes or alters the
`EvidenceReportArtifact`. Refund != report deletion. Refund != access revocation.

- `EvidenceReportArtifact` remains an immutable historical artifact regardless of `Order` state
  (reaffirms RGD-4, now explicitly extended to cover the refund case).
- `ReportAccessCredential` / the Account component's `authorizeReportAccess` boundary is the *sole*
  owner of access decisions. If a future requirement (e.g. fraud/security) ever needs a refund to
  affect access, that must be implemented as an **explicit, separate Report Access action** invoked
  because of a refund, never as an implicit side effect of `OrderState` becoming `REFUNDED`.
- This applies uniformly to accuracy-dispute and goodwill refunds. A generation-failure refund
  (BR-U2B-6) is not a counterexample to this rule — it simply has no completed
  `EvidenceReportArtifact` / access credential to revoke in the first place, since generation never
  succeeded.

## BR-U2B-9: `INTERNAL_PROTOTYPE` Remains Internal-Only, Never Customer-Facing

`GenerationAuthorizationType.INTERNAL_PROTOTYPE` (Unit 2) continues to exist and remains a valid way
to create a `ReportGenerationJob`, for founder demos, test reports, comp'd reports, and
development/integration testing. As of Unit 2B:

- It is **removed from the public customer-facing flow entirely** — the `/configure` flow's
  golden path no longer offers or reaches it. The only production customer path to paid report
  generation is `VERIFIED_PAYMENT` (BR-U2B-3).
- It remains reachable **only** through an explicitly internal mechanism (script/CLI/dev-only entry
  point) — no public route or UI control may call `authorizeReportGeneration` with
  `INTERNAL_PROTOTYPE`, since that would be a direct paywall bypass. No new authentication framework
  is introduced solely to gate this; "internal-only" is satisfied by the mechanism simply not being
  exposed as a public route, consistent with this unit's proportionality constraints.
- The two authorization types remain structurally distinguishable everywhere they appear (unchanged
  invariant from Unit 2) — `INTERNAL_PROTOTYPE` must never be presented, logged, or stored in a way
  that could be mistaken for a real payment event.

## BR-U2B-10: Guest Report-Access Delivery Never Depends on the Browser Reaching a Success Page

ACC-1's "secure emailed link" is delivered through this sequence, triggered by
`ReportGenerationJob` completion for a `VERIFIED_PAYMENT`-authorized job (not by the payment webhook
directly, since generation has not happened yet at that point):

1. On `ReportGenerationJob` reaching `COMPLETE`, if its `GenerationAuthorization.type` is
   `VERIFIED_PAYMENT`, the Account component's guest-delivery responsibility issues a
   `ReportAccessCredential` for the resulting artifact (`createAccessCredential`, unchanged from
   Unit 2) and attempts delivery to `Order.customerEmail`.
2. The success/return page the browser lands on after Stripe Checkout **never** itself exposes
   report access — it displays payment/generation status only (e.g. "payment received, your report
   is being generated," then "your report is ready — check your email for the secure link"). The
   server-side order and job state remain the sole authority on what has actually happened; reaching
   a URL is never treated as proof of anything.
3. If email delivery fails or its outcome is uncertain, the credential is **rotated** (revoked +
   reissued, `rotateAccessCredential`, unchanged from Unit 2) before a retry, so that only the
   newest attempted link is ever valid — never a resend of a previously-issued raw token, and never
   a persisted raw token kept around to make retries cheaper (BR-U2B-10a).
4. Email delivery failure or uncertainty is tracked on the `ReportAccessCredential`'s own
   `deliveryStatus` (`domain-entities.md`) and is **never** allowed to mark the
   `ReportGenerationJob` itself `FAILED` — report generation succeeded; only the delivery channel
   failed, and those are different failures with different resolutions (BR-U2B-10b).

### BR-U2B-10a: No Raw Token Persistence for Delivery Convenience
Reaffirms Unit 2's existing invariant (`report-access/credential.ts`): only a hash of the access
token is ever persisted. This is not relaxed to make retries simpler — a retry rotates the
credential instead.

### BR-U2B-10b: Delivery Failure Is Not Generation Failure
A `ReportGenerationJob` that successfully reached `COMPLETE` stays `COMPLETE` even if the
subsequent email-delivery step fails — `COMPLETE` describes whether a valid report was produced,
not whether the customer has yet received a link to it.

## BR-U2B-11: Payment-Method Scope and Fulfillment-Guidance Compliance

Unit 2B accepts **immediate, card-based payment only** — no delayed/asynchronous Stripe payment
methods are enabled. This keeps the fulfillment contract simple: a Checkout Session that reaches a
completed state can be expected to resolve to a payment outcome without a separate
delayed-notification path, without ruling out adding such methods in a later unit.

Even with immediate methods only, `handleVerifiedWebhook` must inspect the Checkout Session/payment
object's own payment-status field before transitioning to `PAID` — an event *type* name (e.g.
`checkout.session.completed`) is never, by itself, sufficient grounds to transition state (reaffirms
BR-U2B-2). This follows Stripe's own fulfillment guidance: fulfillment logic must be idempotent and
must inspect the actual payment status, not just react to an event's name.

## BR-U2B-12: Price and Currency Are Server-Determined and Immutable Per Order

- The report price is server-configured, defaulting to $9.99 (requirements.md §9.4's launch
  recommendation) — documented as the current pricing hypothesis, not validated demand (per the
  founder decision recorded in `aidlc-state.md`), and never client-supplied or client-modifiable
  (reaffirms PO-2).
- No client-supplied price/amount field is ever read for this purpose, even if present in a
  request — it is ignored or the request is rejected outright.
- The `priceCents`/`currency` persisted on an `Order` is the exact amount used to create that
  order's Checkout Session, and does not change even if the server-configured price changes before
  or after this order completes — each `Order` is its own immutable commercial record.
- No pricing-tier system, coupons, promotions, or multi-currency support is introduced.

## BR-U2B-13: Customer Email Is Sourced From Verified Stripe Data Only

`Order.customerEmail` is set only from the email Stripe itself collected and confirms as part of
the verified checkout/payment webhook data — never from a client-submitted form field trusted at
face value. This is the same "server-side authority over client-observable state" discipline this
codebase already applies elsewhere (e.g. price, order status) — email is a fulfillment/support
identity here, not a display convenience, so it must be as trustworthy as the payment data itself.

## BR-U2B-14: The Internal Order Is Created Before the External Stripe Checkout Session

*(Added per founder review, 2026-08-24 — corrects the original sequencing, which created the
Stripe Checkout Session first and only afterward attempted to create the internal `Order`, risking
an orphaned external payment with no durable internal record to reconcile it against.)*

Checkout initiation (`createCheckoutSession`) proceeds in this order:

1. The internal `PENDING` `Order` is created **first** — server-generated `orderId`,
   `screeningRequestId`, the immutable `priceCents`/`currency` (BR-U2B-12), and a stable
   `checkoutCreationIdempotencyKey` for this operation. At this point `stripeCheckoutSessionId` does
   not yet exist and is legitimately absent — `Order` existence never depends on the external Stripe
   reference existing yet.
2. The Stripe Checkout Session is created **using the already-durable `orderId`** as Stripe's
   `client_reference_id` (and/or in `metadata`) — Stripe's own mechanism for reconciling a Checkout
   Session back to an internal system — and using the stable `checkoutCreationIdempotencyKey` so a
   retry of *this specific creation call* cannot create two Stripe sessions for the same intended
   order.
3. `stripeCheckoutSessionId` is persisted onto the already-existing `Order`.
4. The Checkout URL is returned to the caller.

If step 2 succeeds but step 3's local persistence fails, the Stripe session still carries the
internal `orderId` (via `client_reference_id`/`metadata`), so a subsequent verified webhook can
still be reconciled to the correct `Order` by that reference rather than becoming an orphaned
payment with no internal record — webhook-resolution logic must therefore resolve an event's
`Order` by `orderId` (from `client_reference_id`/metadata) as a valid path, not exclusively by
`stripeCheckoutSessionId`, and must backfill `stripeCheckoutSessionId` onto the `Order` if it was
not already persisted. No new `OrderState` is introduced solely to represent "checkout creation in
progress" — `PENDING` already covers "an `Order` exists and checkout is being (or has been) set up
for it."

## BR-U2B-15: Local Fulfillment Side Effects of a Verified Payment Commit Atomically

*(Added per founder review, 2026-08-24 — closes a real crash-window: recording the `PAID`
transition and the processed-event receipt without also durably creating the `ReportGenerationJob`
in the same operation could strand a paying customer, since the webhook-idempotency ledger
[BR-U2B-4] would correctly treat any retried delivery as a no-op and never attempt job creation
again.)*

Once a webhook event's signature has been verified (external step, unchanged) and confirms a
successful payment, every one of these **local** effects commits together, as a single atomic unit,
or none of them do:

- confirm the `Order` is currently in a state eligible for `PENDING -> PAID` (BR-U2B-2),
- transition it to `PAID` and set `paidAt`,
- populate the verified `stripePaymentIntentId` and `customerEmail` (BR-U2B-13),
- construct and persist the `GenerationAuthorization { type: VERIFIED_PAYMENT }` (BR-U2B-3),
- idempotently create the `ReportGenerationJob` (reusing the existing, unchanged
  `createReportGenerationJob` — BR-U2B-1 point 5),
- record the `ProcessedStripeEvent` (BR-U2B-4).

If any part fails, the whole set rolls back — the `Order` remains `PENDING`, no event is recorded as
processed, and a subsequent redelivery of the same webhook (Stripe's own retry behavior) correctly
reprocesses the entire sequence from scratch rather than encountering a ledger entry for an event
whose fulfillment never actually completed. Signature verification itself happens before this
atomic unit, and report *generation* (the orchestrator's asynchronous pipeline execution) happens
strictly after it, outside the transaction — only the job's *creation* (a row insert) is inside it.

## BR-U2B-16: A ScreeningRequest Is Purchase-Locked Once Its Snapshot Is Taken

*(Added per founder review, 2026-08-24 — makes explicit what "take the snapshot at checkout
initiation" (Workflow 2) implies for the live, editable request afterward.)*

Once a `ScreeningRequest`'s immutable snapshot has been taken for checkout (BR-U2B carries this
trigger forward from Unit 2's `authorizeReportGeneration` to `createCheckoutSession`, per
`business-logic-model.md` Workflow 2), that `ScreeningRequest` is **purchase-locked** for that exact
configuration:

- A later `Order` created against the same `screeningRequestId` (e.g. after an earlier attempt
  `EXPIRED` — BR-U2B-1) reuses the **same** already-taken immutable snapshot; it never re-snapshots
  a possibly-since-edited live request.
- The live `ScreeningRequest`'s project-configuration fields must **not** be editable after its
  snapshot has been taken. This reuses Unit 2's existing rule unchanged — `updateProjectDetails`
  already refuses to update a `ScreeningRequest` once its `snapshot` is set ("this screening request
  has already been authorized for generation and is now immutable") — Unit 2B introduces no new
  mechanism here, it simply activates at the earlier trigger point (checkout initiation instead of
  generation authorization).
- If a customer wants to change their project configuration after checkout has been initiated, the
  correct path is a **new** `ScreeningRequest` (a new immutable purchase snapshot), never an edit
  to the locked one.

This preserves the invariant: what the customer configured = what they paid for = what the report
evaluates.
