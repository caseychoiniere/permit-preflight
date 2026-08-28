# Unit 2B: Business Logic Model

Technology-agnostic workflows. Reuses Unit 2's `checkReadiness`, `ScreeningRequest.snapshot`
mechanism, `createReportGenerationJob`, the full Report Generation Orchestrator pipeline, and
`report-access/credential.ts`'s hashed-token mechanism unchanged — this document describes only the
new workflows Unit 2B adds around them. Provider selection (Stripe SDK usage, email provider) is
deliberately absent here — technology-agnostic per this stage's scope; NFR Requirements decides it.

## Workflow 1: Pre-Checkout Readiness (PO-0)

**Owned by**: Checkout & Fulfillment Service, delegating the actual check to Project Preflight
Service's existing readiness logic.

```
1. User has a VALID, live ScreeningRequest (Unit 2's Workflow 1, unchanged).
2. Before offering checkout, the system runs the existing readiness check
   (screening-request/authorization.ts's checkReadiness, unchanged logic, relocated call site):
   parcel CONFIRMED, projectType currently supported, validationState VALID, no required data
   source already known-unhealthy.
3. This check does not invoke Property Intelligence, Spatial Analysis, the Regulatory Rules Engine,
   or Stripe — it is a cheap, local check only (BR-U2B carries forward BR-U2-1's "no live
   retrieval" discipline, now gating checkout instead of generation).
4. If the check fails, checkout is not offered; the user sees a clear, specific reason (never a
   generic error) and is never charged for a request already known to be unfulfillable.
5. If the check passes, this does not itself guarantee successful generation — post-payment
   failure handling (Workflow 5) still applies.
```

## Workflow 2: Checkout Initiation, Purchase-Lock, and Order-Before-Session Sequencing (PO-1, PO-2)

**Owned by**: Checkout & Fulfillment Service, coordinating Screening Request and Order & Payment.
*(Resequenced per founder review, 2026-08-24 - the internal Order now exists before any external
Stripe object, per BR-U2B-14.)*

```
1. Given a ScreeningRequest that has passed Workflow 1's readiness check, the user proceeds to
   purchase.
2. Checkout & Fulfillment Service checks BR-U2B-1's reuse rules for this screeningRequestId:
   - a PAID Order already exists -> no new order/session is created; the caller is directed to the
     existing paid order's outcome instead (never a duplicate charge).
   - a PENDING Order with a still-usable Checkout Session already exists -> that session is
     returned/reused, not duplicated (this check and the following creation are concurrency-safe -
     BR-U2B-1 point 2 - so two simultaneous requests cannot each create a separate active session).
   - otherwise (no existing order, or the prior one is EXPIRED) -> proceed to step 3.
3. The ScreeningRequest's immutable snapshot is taken now, if not already taken (reusing the exact
   existing snapshot/snapshotTakenAt mechanism from Unit 2's authorizeReportGeneration - only the
   trigger moves earlier, to this step). This purchase-locks the ScreeningRequest (BR-U2B-16) - its
   project-configuration fields become uneditable from this point on, via Unit 2's existing
   already-snapshotted-is-immutable rule, unchanged.
4. The internal Order is created FIRST, before any Stripe object exists (BR-U2B-14): a
   server-generated orderId, screeningRequestId, state: PENDING, the server-determined
   priceCents/currency (BR-U2B-12 - the client-supplied price/amount, if any is present in the
   request, is never read for this purpose per PO-2), and a checkoutCreationIdempotencyKey.
   stripeCheckoutSessionId does not exist yet at this point - that is expected, not an error state.
5. Order & Payment creates the Stripe Checkout Session using the already-durable orderId as Stripe's
   client_reference_id (and/or metadata) and the checkoutCreationIdempotencyKey for this specific
   creation call (BR-U2B-14).
6. stripeCheckoutSessionId is persisted onto the existing Order. If this persistence step fails
   after step 5 already succeeded with Stripe, the session still carries orderId via
   client_reference_id/metadata, so Workflow 3's webhook handling can still reconcile the eventual
   payment to the correct Order (BR-U2B-14) - not an orphaned payment.
7. The Checkout URL is returned; the user is redirected to Stripe-hosted Checkout to complete
   payment as a guest (or, if authenticated via a future unit's account system, linked to their
   account - not exercised by Unit 2B, which is guest-only per ACC-1's exact scope).
8. The browser is eventually redirected back to a success/return page. Per BR-U2B-2, this redirect
   is not treated as proof of anything - it exists only to show the customer a status message
   (Workflow 4) while the authoritative PAID transition happens independently, via webhook.
```

## Workflow 3: Webhook-Verified Payment Confirmation (PO-3)

**Owned by**: Order & Payment, invoked by Checkout & Fulfillment Service's webhook endpoint.
*(Amended per founder review, 2026-08-24 - steps 6-8 now commit as a single atomic unit per
BR-U2B-15, and a duplicate-payment anomaly path is added.)*

```
1. Stripe sends a webhook event to the server.
2. The signature is verified against the exact raw request body before any event data is trusted
   (BR-U2B-4 step 1). An invalid signature produces no Order transition and is logged as a
   security-relevant event.
3. The event is checked against the ProcessedStripeEvent ledger by its Stripe event ID. Already
   seen -> return success as a no-op (BR-U2B-4 step 2).
4. The event is resolved to its Order primarily via the orderId carried in the Stripe object's
   client_reference_id/metadata (BR-U2B-14), falling back to stripeCheckoutSessionId matching if
   needed - this makes resolution robust even if step 6 of Workflow 2 didn't get to persist
   stripeCheckoutSessionId before a crash.
5. The event's actual payment-status field (not merely its type name) is inspected to confirm
   payment genuinely completed (BR-U2B-11) - this codebase accepts immediate/card payment methods
   only for Unit 2B, so this inspection is a straightforward completed-or-not check, not a
   multi-state delayed-payment reconciliation.
6. If payment is confirmed AND the resolved Order is still PENDING: steps 6a-6d below commit
   together as a single atomic local transaction (BR-U2B-15) - all or nothing:
   6a. Order transitions PENDING -> PAID; paidAt, stripePaymentIntentId, and customerEmail
       (BR-U2B-13, sourced only from the verified event data) are set.
   6b. A GenerationAuthorization { type: VERIFIED_PAYMENT, screeningRequestId, orderId,
       authorizedAt } is constructed (BR-U2B-3).
   6c. createReportGenerationJob(db, screeningRequestId, verifiedPaymentAuthorization) is called -
       the exact existing function from Unit 2, unmodified, called within the same transaction.
       Its existing idempotent-per-screeningRequestId behavior, combined with BR-U2B-1, guarantees
       at most one job per paid order with no new mechanism.
   6d. The event is recorded in ProcessedStripeEvent (BR-U2B-4 step 3).
   If any of 6a-6d fails, the entire transaction rolls back - the Order remains PENDING, no event
   is recorded as processed, and Stripe's automatic webhook redelivery will correctly reprocess the
   full sequence from scratch (BR-U2B-15) rather than finding a ledger entry for work that never
   actually completed.
7. If payment is confirmed but the resolved Order is NOT PENDING (i.e. some other Order for the
   same screeningRequestId already reached PAID - BR-U2B-1's duplicate-payment race): this event's
   payment is classified as a duplicate-payment anomaly, logged as such, and a refund is
   automatically initiated for THIS Order via BR-U2B-5's refund process (the same asynchronous,
   idempotent-Stripe-call lifecycle Workflow 5 uses for generation-failure refunds) with
   refundReason: DUPLICATE_PAYMENT - no second GenerationAuthorization or ReportGenerationJob is
   ever created for it (BR-U2B-1 point 4).
8. Once step 6 or 7 completes, the webhook handler returns success promptly to Stripe - it does not
   wait for report generation, which proceeds asynchronously via the existing Report Generation Job
   poller (Unit 2, unchanged).
9. If instead the event confirms the Checkout Session expired without payment: Order transitions
   PENDING -> EXPIRED (BR-U2B-2). No GenerationAuthorization is ever constructed for this order.
```

## Workflow 4: Customer-Facing Status (No New Data, New Presentation Only)

**Owned by**: the frontend, reading existing/new server state - no new authoritative source of
truth is introduced here, only a status view over Order + ReportGenerationJob + delivery status.

```
1. Immediately after the Stripe redirect, the success page polls or reads the Order's current
   state (never trusting the redirect itself, per BR-U2B-2).
2. While PENDING: "Confirming your payment..." (should resolve quickly in the normal case, since
   the webhook typically arrives within seconds).
3. Once PAID and a ReportGenerationJob exists: "Payment received. Your report is being generated."
4. Once the job reaches COMPLETE and delivery has been attempted: "Your report is ready - check
   your email for the secure link." The page never itself exposes the report or its access token
   (BR-U2B-10 step 2) - reaching this page is never treated as proof of purchase or as an access
   grant.
5. If the job reaches FAILED (see Workflow 5): a clear message reflecting the automatic-refund
   process already underway (BR-U2B-6), e.g. "we couldn't generate your report; a refund has been
   initiated."
```

## Workflow 5: Post-Payment Generation-Failure Handling and Automatic Refund (PO-4)

**Owned by**: Report Generation Orchestrator Service (detects terminal failure) coordinating with
Checkout & Fulfillment Service / Order & Payment (initiates refund) - unchanged pipeline internals,
one new completion/failure hook.

```
1. Report Generation Orchestrator Service runs the existing pipeline (Unit 2, unchanged): Property
   Intelligence -> Spatial Analysis -> Regulatory Rules Engine -> Report Explanation -> Evidence &
   Report Artifact.
2. Existing resilience mechanisms apply unchanged: per-external-call bounded retries during the
   pipeline run, and stale-IN_PROGRESS recovery if the process is interrupted (Unit 2's existing
   atomic-claim pattern). Neither of these is new; neither retries an already-terminal FAILED job.
3. If the job ultimately reaches its genuinely terminal FAILED state (existing mechanism, unchanged
   trigger conditions) AND its GenerationAuthorization.type is VERIFIED_PAYMENT: Checkout &
   Fulfillment Service is notified and initiates a refund via BR-U2B-5/BR-U2B-6 -
   { refundReason: GENERATION_FAILURE }.
4. The Order moves PAID -> REFUND_PENDING immediately (before the Stripe call), then ->
   REFUNDED only once Stripe confirms success, or -> REFUND_FAILED if Stripe confirms failure (the
   latter surfaced as a support/manual-resolution requirement, not silently retried forever).
5. If the job's GenerationAuthorization.type is INTERNAL_PROTOTYPE instead, none of this applies -
   there is no payment to refund; existing Unit 2 failure handling (failureReasons, logging) is
   unchanged.
```

## Workflow 6: Guest Report-Access Delivery (ACC-1)

**Owned by**: Account (the `authorizeReportAccess` boundary's guest-delivery counterpart),
triggered by Report Generation Orchestrator Service on job completion.

```
1. ReportGenerationJob reaches COMPLETE with an EvidenceReportArtifact reference (existing
   mechanism, unchanged).
2. If the completed job's GenerationAuthorization.type is VERIFIED_PAYMENT: Account issues a
   ReportAccessCredential for the artifact (createAccessCredential, unchanged from Unit 2 - this is
   its first production call site) and attempts to email the secure link to Order.customerEmail
   (BR-U2B-13 - sourced only from verified Stripe data, never a client-submitted value).
3. If delivery fails or its outcome is uncertain, the credential is rotated (revoked + reissued)
   before any subsequent retry - never a resend of a previously-issued raw token, and no raw token
   is ever persisted to make retries cheaper (BR-U2B-10a).
4. Delivery outcome is tracked via the credential's own deliveryStatus field and never causes the
   ReportGenerationJob itself to become FAILED (BR-U2B-10b) - a successfully generated report stays
   successfully generated even if the email step needs to be retried.
5. If the completed job's GenerationAuthorization.type is INTERNAL_PROTOTYPE instead: no email
   delivery is attempted - unchanged from how Unit 2's internal/demo path already retrieves report
   access today (out of scope for Unit 2B to formalize further).
```

## Workflow 7: Manual Refund (PO-5, Non-Generation-Failure Reasons)

**Owned by**: Order & Payment, invoked through an internal-only mechanism (no customer-facing
self-service refund UI, no Unit 3 admin UI yet).

```
1. A founder/operator determines a refund is warranted for a reason other than generation failure
   (an accuracy dispute, or goodwill) - via direct communication with the customer (support
   process, out of this unit's scope to formalize beyond what's needed to invoke the refund).
2. The refund is initiated through an internal-only mechanism (script/CLI/dev-only route) calling
   processRefund with { refundReason: CUSTOMER_REQUEST | GOODWILL } - the exact same BR-U2B-5
   idempotent/asynchronous process as the automatic path, just a different trigger.
3. Report access is never affected by this refund, regardless of reason or outcome (BR-U2B-8) - the
   EvidenceReportArtifact and the customer's existing ReportAccessCredential are untouched.
4. The refund action, reason, and (unchanged) resulting access decision (none - access is
   unaffected) are recorded on the Order for audit purposes, satisfying PO-5's "refund action,
   reason, and resulting access decision are recorded" criterion honestly - the access decision is
   simply "no change," recorded as such rather than omitted.
```

## Cross-Cutting: What This Unit Does NOT Do

- No subscriptions, pricing tiers, coupons/promotions, invoicing, or multi-currency support.
- No authenticated-account creation, login, or report-history UI (ACC-2/3/4 remain Unit 6).
- No polished admin/refund UI (ADM-6 remains Unit 3) - manual refund exists only as an internal
  mechanism, not a UI.
- No new authentication framework introduced solely to gate `INTERNAL_PROTOTYPE`'s internal-only
  access - it simply isn't exposed as a public route.
- No product-analytics infrastructure built for its own sake - Workflow 4's status page is a
  functional necessity (the customer needs to know what's happening), not an analytics surface.
- No changes to Report Generation Job's state machine, Spatial Analysis, the Regulatory Rules
  Engine, or Evidence & Report Artifact - this unit is entirely "before" and "around" that existing
  pipeline, never inside it.
