# Unit 2B: Commercial Payment & Fulfillment — Functional Design Plan

**Status: APPROVED 2026-08-24**, with 6 targeted payment-correctness amendments applied
post-generation (order-state trigger contradiction fixed, concurrency/duplicate-payment safety
added to BR-U2B-1, Order-before-Stripe-Session sequencing, atomic webhook local side effects,
refund-idempotency-key scope corrected, purchase-lock made explicit). See
`business-rules.md` BR-U2B-14/15/16 and the amended BR-U2B-1/2/5, and
`business-logic-model.md`'s resequenced Workflow 2/3. Proceeding to NFR Requirements — no further
Functional Design review held, per the founder's explicit instruction.

**Authorization**: Founder decision, 2026-08-24 — Unit 2B no longer waits on Commercial GO/Unit 0C;
Technical GO alone authorizes it. See `aidlc-docs/aidlc-state.md`'s FOUNDER DECISION section.

**Unit definition**: `unit-of-work.md` Unit 2B (split from the original Unit 2, 2026-08-19).
**Assigned stories**: `unit-of-work-story-map.md` Unit 2B — PO-0 through PO-5 (Payment & Orders, 6
stories); ACC-1 (guest checkout only, 1 story). 7 stories total. No other Account stories
(ACC-2/3/4) are in scope — those remain Unit 6.

**Delivers** (`unit-of-work.md`): real customers can pay the current server-configured report price
via Stripe Checkout and receive their report — the commercial completion of the vertical slice Unit
2 proved technically. **Stands up**: Order & Payment, Checkout & Fulfillment Service, Account
(guest mode + `authorizeReportAccess`'s guest-credential path only).

**Approved component contracts already on record** (`component-methods.md`, `services.md`,
`components.md` — not reopened here, only implemented):
- **Order & Payment** — `createCheckoutSession`, `handleVerifiedWebhook`, `getPaymentState`,
  `processRefund`. Owns payment/order state *only* — never reads or writes Report Generation Job
  state. Exact state enum explicitly deferred to this stage.
- **Checkout & Fulfillment Service** — thin coordinator: Screening Request (immutable snapshot) →
  Order & Payment (Checkout Session, webhook verification) → Report Generation Job (idempotent
  creation on verified PAID). Never touches the generation pipeline itself.
- **Account** — guest purchase support only in this unit; `authorizeReportAccess` (report reference
  + guest access credential → authorized/denied) is the boundary ACC-1's emailed link resolves
  through.

**Existing Unit 2 code this unit extends, not replaces** (already built, confirmed by direct
inspection):
- `src/screening-request/authorization.ts` — `GenerationAuthorization` is already a discriminated
  union prepared for this swap: `GenerationAuthorizationType.INTERNAL_PROTOTYPE` exists today;
  the code comment already anticipates "Unit 2B adds a sibling `VERIFIED_PAYMENT` variant without
  changing the downstream job-creation contract." `checkReadiness` already implements almost
  exactly PO-0's readiness check (parcel resolved, project type supported, validation passed, no
  known-unhealthy required source).
- `src/report-generation-job/repository.ts` — `createReportGenerationJob` is already idempotent per
  `screeningRequestId`; job state (`QUEUED`/`IN_PROGRESS`/`COMPLETE`/`FAILED`) already exists and
  must stay untouched by Order & Payment, per the approved component boundary.
- `src/report-access/credential.ts` — the 256-bit hashed bearer-token mechanism already implements
  `authorizeReportAccess`'s guest-credential path structurally; ACC-1's "secure emailed link" is
  this same token, delivered by a new channel (email) rather than a new authorization mechanism.
- `src/screening-request/types.ts` — `ScreeningRequest.snapshot`/`snapshotTakenAt` already implement
  the immutable-snapshot-at-authorization-time pattern Checkout & Fulfillment Service needs; only
  the trigger moves from internal call to verified-webhook call.

**Explicitly out of scope for this unit** (per the founder's proportionality instruction):
subscriptions, enterprise billing, pricing tiers, coupons/promotions, invoicing, multi-currency,
tax infrastructure beyond what Stripe Checkout provides out of the box, authenticated accounts
(ACC-2/3/4, Unit 6), marketing-site work, analytics infrastructure built solely for commercial
validation. Guest checkout is first-class, not a fallback path.

**Binding invariant** (explicit, non-negotiable per the founder): a browser redirect is never proof
of payment. Only a signature-verified Stripe webhook may transition an order to PAID or authorize
report generation.

---

## Design Checklist
- [x] Answer clarifying questions below
- [x] Analyze answers for ambiguity; raise follow-ups if needed — none needed; all 5 answers were detailed and unambiguous, several with explicit corrections/extensions beyond the original question scope (order-state model, payment-method scope, price, email sourcing, webhook security) — incorporated directly
- [x] Create `business-logic-model.md` — checkout initiation (PO-0 readiness → PO-1 Checkout
      Session creation), webhook-verified PAID transition (PO-3) and idempotent Report Generation
      Job creation, guest report-access delivery (ACC-1), post-payment generation-failure handling
      (PO-4), refund processing (PO-5) and its interaction with report access
- [x] Create `business-rules.md` — Order & Payment state machine and its legal transitions; the
      PO-0 readiness gate as it now applies to checkout rather than generation; webhook signature
      verification and idempotency rule; price determination rule (server-only, never
      client-supplied, per PO-2); refund-reason-to-access-policy rule (PO-5); generation-failure
      resolution rule (PO-4); the `INTERNAL_PROTOTYPE` vs `VERIFIED_PAYMENT` authorization-type
      coexistence rule
- [x] Create `domain-entities.md` — the new `Order` entity (state, Stripe references, price,
      timestamps, refund fields) and its relationship to `ScreeningRequest` (one immutable snapshot
      per order) and `ReportGenerationJob` (one job per verified-PAID order, referencing it via the
      existing `generationAuthorization` field); extend `GenerationAuthorization` with the
      `VERIFIED_PAYMENT` variant
- [x] Cross-check every artifact traces to an assigned story (PO-0..PO-5, ACC-1) and respects every
      existing invariant already proven in Unit 2 (browser-redirect-is-not-proof, job/payment state
      separation, immutable snapshot, hashed-token-only report access)

---

## Clarifying Questions

### Question 1 — Refund-to-Report-Access Policy
PO-5 explicitly does **not** hard-code whether a refund revokes the customer's access to an
already-generated report, and defers that decision here. Three realistic refund reasons exist:
generation genuinely failed (customer never got a usable report), the customer disputes the
report's accuracy (they have a report, but claim it's wrong), and goodwill (they have a report,
no dispute, refunded anyway). What should the default policy be?

A) **Access always survives a refund** — once generated, a report remains accessible regardless of
   why the order was refunded. Simplest to implement and reason about; matches RGD-4's immutability
   principle (the report is a historical record) and avoids ever needing to "claw back" something
   already delivered. **Recommended** — a refund is a payment-state event, not a report-access
   revocation event, and conflating the two reintroduces exactly the kind of cross-state coupling
   Order & Payment's boundary was designed to avoid.

B) **Access is revoked only for a generation-failure refund** (there's nothing real to access
   anyway — the report was never successfully produced) — accuracy-dispute and goodwill refunds
   keep access, since a report does exist.

C) **Access is always revoked on any refund** — simplest policy to state ("you get access only if
   you keep the report"), but see stories.md PO-5's own caution that this may not be the right
   default for a reported-inaccuracy refund the customer may still want to reference.

X) Other (describe after [Answer]: below)

[Answer]: A — refund state and report-access state remain fully separate; refund never implicitly revokes access (see BR-U2B-8).

### Question 2 — Post-Payment Generation-Failure Resolution (PO-4)
PO-4 requires an "automatic refund, retry option, or support escalation" when generation fails
after successful payment. Unit 3 (the admin refund UI, ADM-6) is not built yet — `processRefund`
will exist as a callable component method, but Unit 2B must decide the default customer-facing
behavior for this unit, before that admin UI exists.

A) **Automatic refund on terminal generation failure** — once the existing retry/stale-claim
   mechanism (`retryAttempts`, already in the schema) exhausts and the job reaches `FAILED`, the
   system automatically calls `processRefund` and shows the customer a clear "your payment was
   refunded because we couldn't generate your report" message. **Recommended** — directly satisfies
   the hard requirement ("a successful payment must never leave a customer in an undefined state")
   without depending on Unit 3's admin tooling existing yet.

B) **Manual-only refund** — a `FAILED` job surfaces a clear customer-facing message and a support
   contact, but no refund is issued until a founder manually invokes `processRefund` (via a script
   or minimal internal-only route, mirroring how Unit 2's internal generation-trigger works today) —
   defers the "who initiates it" decision to Unit 3's real admin UI.

C) **Automatic refund, but only after a single automatic retry of the full pipeline fails** (not
   just the existing per-stage retry policy) — closest to "give it a genuine second chance before
   giving up," at the cost of a longer worst-case customer wait before resolution.

X) Other (describe after [Answer]: below)

[Answer]: X — automatic refund INITIATION on terminal FAILED, modeled as its own async lifecycle (REFUND_PENDING -> REFUNDED/REFUND_FAILED via verified webhook confirmation, never declared complete on request-submission alone), with a stable per-order Stripe idempotency key (see BR-U2B-5, BR-U2B-6).

### Question 3 — Guest Report-Access Delivery Mechanism (ACC-1)
ACC-1's acceptance criteria specifically say "I receive report access via a secure emailed link."
No email-sending capability exists in this codebase yet — it would be new infrastructure (a
transactional email provider), not just new business logic.

A) **Build real email delivery in Unit 2B** — required to satisfy ACC-1 as written; the report
   link is sent to the email address collected at Stripe Checkout. Provider selection deferred to
   NFR Requirements (this question is about business scope, not which vendor).

B) **Defer email delivery; the success page displays the report link/access directly in-browser**
   for Unit 2B, with real email delivery as an explicit fast-follow before this is called
   commercially complete — lower build cost now, but technically leaves ACC-1 not fully satisfied
   as written (the browser tab is not "secure" the way an emailed, out-of-band link is if the
   customer closes it or is on a shared device).

C) **Both** — display the link on the success page immediately (so payment never depends on email
   deliverability succeeding) **and** email it as a durable backup — slightly more build cost, but
   removes email-provider uptime as a single point of failure for report access.

X) Other (describe after [Answer]: below)

[Answer]: A — build real transactional email delivery in Unit 2B; the success page shows status only, never exposes access directly (see BR-U2B-10, Workflow 6).

### Question 4 — Coexistence of the Existing Internal-Trigger Path
Unit 2's `authorizeReportGeneration`/`GenerationAuthorizationType.INTERNAL_PROTOTYPE` path (a
founder-triggered mechanism standing in for real payment) already exists and is exercised by the
current `/configure` flow. Now that `VERIFIED_PAYMENT` is real, should the internal-prototype path
be kept?

A) **Keep both, coexisting** — `VERIFIED_PAYMENT` becomes the real customer path; `INTERNAL_PROTOTYPE`
   remains available for founder-triggered test/demo/comp'd reports (e.g. showing a real generated
   report to someone without charging them) — matches the discriminated-union design already in
   place, no removal required. **Recommended** — lower risk (nothing working today is removed) and
   the two paths are already structurally distinguished by `GenerationAuthorization.type`.

B) **Retire `INTERNAL_PROTOTYPE` now** — once real payment exists, remove the internal-trigger path
   and its `/configure`-flow entry point entirely, so there is exactly one way to create a
   `ReportGenerationJob` in production.

X) Other (describe after [Answer]: below)

[Answer]: X — keep INTERNAL_PROTOTYPE as a supported internal-only capability (demos/tests/comp'd reports), but remove it entirely from the public customer-facing flow; VERIFIED_PAYMENT becomes the only customer path (see BR-U2B-9).

### Question 5 — Webhook Idempotency Mechanism
PO-3 requires duplicate/replayed Stripe webhook events to produce no duplicate side effects
(no double-generation, no double-fulfillment).

A) **Order-state-transition idempotency only** — `handleVerifiedWebhook` checks the order's current
   state before transitioning; if already `PAID`, a duplicate payment-confirmation event is a
   no-op. No new persisted structure required. Mirrors `createReportGenerationJob`'s existing
   idempotent-per-`screeningRequestId` pattern already in the codebase. **Recommended** — simplest
   mechanism that is still genuinely correct for this event type, and consistent with the existing
   codebase's preference for state-machine idempotency over event-ledger idempotency (e.g. the
   `ReportGenerationJob` atomic-claim pattern).

B) **A dedicated processed-webhook-event-ID ledger** (persist every handled Stripe event ID,
   reject/no-op on replay of an already-seen ID) — more defensive (covers cases beyond just the
   PAID transition, e.g. two different event types about the same order arriving out of order),
   at the cost of a new persisted table this unit would own.

X) Other (describe after [Answer]: below)

[Answer]: X — both a small ProcessedStripeEvent ledger AND existing domain/state-machine idempotency as defense-in-depth, not a general event-sourcing architecture (see BR-U2B-4).
---

*Design decisions made directly (not asked as questions) because they are either already settled
by existing approved artifacts or are purely technical modeling choices within this unit's own
discretion, consistent with "Functional Design decides the exact enum" per `component-methods.md`:*
- **Order & Payment state enum**: ~~`PENDING → PAID → REFUNDED`, plus `PAYMENT_FAILED` and
  `CANCELED`~~ — **corrected by the founder** (submitted alongside the Q1-Q5 answers): a Stripe
  Checkout Session has no clean terminal "payment failed" state (a customer can fail a card attempt
  and retry within the same still-open session), so a naive `PAYMENT_FAILED` risked prematurely
  terminalizing an order the customer was still actively completing. Final model:
  `PENDING → PAID → REFUND_PENDING → REFUNDED`, plus `REFUND_FAILED` and `EXPIRED` — see
  `domain-entities.md`'s `OrderState` and `business-rules.md` BR-U2B-2 for the full, corrected state
  machine. Stays strictly payment-scoped (no `GENERATING`/`COMPLETE`); uses the same
  `const ... as const` + derived-type pattern as the rest of this codebase's domain vocabularies.
- **Report price**: server-side configurable, defaulting to $9.99 per requirements.md §9.4's
  explicit recommendation ("keep a single ~$9.99-$14.99 report price for launch simplicity");
  never client-supplied (PO-2); not a pricing-tier system. Founder-reaffirmed with the additional
  instruction to keep documenting it as a pricing hypothesis, not validated demand (BR-U2B-12).
- **PO-0 readiness check**: reuses/extends the existing `checkReadiness` logic in
  `screening-request/authorization.ts`, now gating "offer Checkout" instead of "authorize
  generation directly" — the same check, moved one step earlier in the flow, not a new mechanism.

**Additional founder corrections/extensions received alongside the Q1-Q5 answers** (incorporated
directly into the generated artifacts, not re-asked as questions since each was a specific,
unambiguous instruction, not an open choice):
- Payment-method scope: immediate/card-based Stripe payment only for Unit 2B; no delayed/async
  payment methods (BR-U2B-11).
- Webhook handling must inspect the actual payment-status field, never transition state merely
  because an event of a given type name arrived (BR-U2B-2, BR-U2B-11).
- `Order.customerEmail` sourced only from verified Stripe-side data, never a client-submitted value
  (BR-U2B-13).
- Refund Stripe API calls must use a stable, order-derived idempotency key reused across retries,
  never regenerated per attempt (BR-U2B-5, `domain-entities.md`'s `refundIdempotencyKey`).
- Webhook security restated explicitly: signature verified against the exact raw request body;
  invalid signatures produce no transition; Stripe identifiers mapped back to an existing internal
  `Order`; price/amount reconciled against the `Order` before fulfillment (BR-U2B-2, BR-U2B-4).
