# Unit 2B: NFR Design Patterns

Expresses NFR-U2B-1 through NFR-U2B-6 as concrete logical patterns. No new infrastructure is
introduced — every pattern below is application code against the already-approved Postgres
database, Stripe, and Resend, following the same "small, named, reusable pattern" discipline
Unit 1/2 established (Bounded-Retry Executor, Boundary Validator, `ReportAccessCredential`).

## Pattern 1: Idempotent/Resumable Checkout Session Creation (BR-U2B-14, extended per founder review)

`createCheckoutSession(screeningRequestId)` becomes a small state machine over the `Order`'s own
persisted state, not a single linear "create Order, then create Session" sequence:

```
1. Look up existing Order rows for this screeningRequestId.
2. If a PAID order exists -> return it (BR-U2B-1); no new session.
3. If a PENDING order exists:
   a. If it already has a stripeCheckoutSessionId, RETRIEVE its current state from Stripe before
      deciding what to do with it (per founder review — never blindly reuse a locally-cached
      "usable" assumption):
      - **Still open/unpaid** -> reuse it; return the existing Checkout URL.
      - **Stripe reports payment complete, but this application's own webhook has not yet
        reconciled it** -> do NOT create a second session. Return Pattern 4's `RECONCILING` status
        and let the verified webhook establish `PAID` in its own time - this is a race between the
        customer's next click and webhook delivery, not an error state.
      - **Stripe reports the session expired, but the local Order is still PENDING because the
        expiry webhook hasn't been processed yet** -> do NOT reuse the expired Checkout URL, and
        do NOT locally forge the `PENDING -> EXPIRED` transition (that remains exclusively a
        verified-webhook transition, BR-U2B-2). Return Pattern 4's `RECONCILING` status instead.
        Once the verified expiry webhook actually transitions the Order to `EXPIRED`, a new
        Order/Checkout Session is created normally on the next attempt.
      This preserves the rule that only verified Stripe events are authoritative for external
      payment/session state - this step reads Stripe's state for a *display/routing* decision, it
      never uses that read to locally mutate `Order.state`.
   b. If stripeCheckoutSessionId is absent (the exact intermediate state the founder's review
      identified as valid and expected) -> RESUME creation for this same Order using its existing
      checkoutCreationIdempotencyKey (step 4b below) - never create a second Order.
4. Otherwise (no existing order, or the prior one is EXPIRED):
   a. Create a new PENDING Order first (BR-U2B-14) with a freshly-generated
      checkoutCreationIdempotencyKey - this insert either succeeds or fails against the
      partial unique index on (screeningRequestId WHERE state = 'PENDING') (Pattern 3). A
      unique-constraint failure here means a concurrent caller won the race; re-read and follow
      branch 3 instead of surfacing an error to the customer.
   b. Call Stripe's Checkout Session creation API using orderId as client_reference_id (and/or
      metadata) and checkoutCreationIdempotencyKey as the Stripe idempotency key for this specific
      API call. A network failure, timeout, or lost response at this point leaves the Order exactly
      in the "PENDING, stripeCheckoutSessionId absent" state - safely resumable via branch 3b on
      the very next call, using the SAME idempotency key, so Stripe itself deduplicates even if the
      original call actually succeeded server-side but the response never reached this application.
   c. On a successful response, persist stripeCheckoutSessionId onto the existing Order
      (idempotent - setting the same value twice is a no-op).
5. Return the Checkout URL.
```

**Why this needs no queue, outbox, new `OrderState`, or general payment-operation framework**: the
entire pattern is expressible as ordinary conditional reads/writes against `Order`'s existing
fields, guarded by Pattern 3's database-level uniqueness constraint. The "resumability" is just
"look up what already exists and continue from there, using the same idempotency key" - not a
distinct execution model requiring new infrastructure.

## Pattern 2: Atomic Multi-Table Payment Fulfillment (BR-U2B-15)

*(Connection lifecycle amended 2026-08-24 by the deployment-platform pivot — see
`infrastructure-design.md`'s "Database Connection Model": the `neon-serverless` `Pool` this
transaction uses is opened, used, and closed entirely within the one webhook request handler that
needs it, never held as a long-lived application-wide pool — Vercel Functions are short-lived, per-
invocation contexts, unlike the Railway persistent process this pattern originally assumed. The
transaction mechanism itself, below, is unchanged.)*

A single interactive DB transaction, using the `drizzle-orm/neon-serverless` driver
(tech-stack-decisions.md), wraps:
```
BEGIN
  conditional check: Order.state = 'PENDING' for the resolved order (else no-op/duplicate path)
  UPDATE Order SET state='PAID', paidAt=now(), stripePaymentIntentId=..., customerEmail=...
  INSERT GenerationAuthorization data (VERIFIED_PAYMENT, orderId, authorizedAt)
  createReportGenerationJob(...)  -- existing function, called with this transaction's connection
  INSERT ProcessedStripeEvent (stripeEventId, eventType, stripeObjectId, processedAt)
COMMIT (or ROLLBACK on any failure - Order stays PENDING, nothing partially applied)
```
Stripe API calls are never inside this transaction - only local DB writes are. This is the first
genuine multi-table interactive transaction in this codebase; every prior atomic operation
(`claimQueuedJob`) used a single conditional `UPDATE`'s own row-level atomicity instead, which is
insufficient for four different tables committing together.

**Why this needs no new infrastructure**: a real Postgres transaction, via a driver that supports
one, is exactly the built-in mechanism this need calls for - not a reason to introduce a saga
framework, distributed transaction coordinator, or message-based eventual-consistency mechanism at
this unit's scale (one application instance, one database).

## Pattern 3: Concurrency-Safe Order Uniqueness (BR-U2B-1)

Two Postgres partial unique indexes (tech-stack-decisions.md):
```
CREATE UNIQUE INDEX ... ON orders (screening_request_id) WHERE state = 'PENDING';
CREATE UNIQUE INDEX ... ON orders (screening_request_id) WHERE paid_at IS NOT NULL;
```
Application-level handling of the resulting constraint-violation case (both indexes): a violated
insert is **not** surfaced to the customer as a generic error - it is caught and treated as "someone
else already created the row I was about to create," triggering a re-read and a fall-through to the
appropriate reuse/anomaly path (Pattern 1 step 3, or BR-U2B-1 point 4's duplicate-payment-anomaly
path for the `paid_at` index specifically, which should be structurally unreachable in normal
operation since Pattern 2's transaction only ever transitions one `PENDING` order to `PAID` - a
violation here would indicate the abnormal race BR-U2B-1 point 4 anticipates, not routine
contention).

**Why this needs no new infrastructure**: partial unique indexes are a built-in Postgres feature: no
distributed lock service, no advisory-lock-based custom concurrency control.

## Pattern 4: Guest Status-Read Capability (new, per founder review)

The customer has no authenticated Account in Unit 2B, so Workflow 4's status page needs its own
narrow authorization concept, separate from `reportAccessToken` (which authorizes the actual
completed report, not status reads):

- **The correlation/capability value is Stripe's own Checkout Session ID** (`cs_...`) - not a
  newly-minted token. It is already unguessable (Stripe-generated, high entropy), already
  customer-held (the browser has it, since Stripe's own `success_url`/`return_url` templating
  mechanism - `{CHECKOUT_SESSION_ID}` - is the standard way Stripe itself recommends surfacing it to
  a returning customer), and requires no new generation/storage/hashing mechanism (unlike
  `reportAccessToken`, which specifically needs hash-only persistence because it authorizes report
  content, not just a status read).
- **Scope: status reads only.** Possessing this value never authorizes a `PAID` transition
  (only a verified webhook does, per BR-U2B-2), never authorizes report generation, refunds, or
  report access (`reportAccessToken`, unchanged, remains the sole authorization for that). The
  status-read function is a pure read path with no side effects.
- **Minimized response shape** — the status endpoint derives a small, purpose-built status value
  from `Order`/`ReportGenerationJob` state, never the raw rows:
  ```
  GuestOrderStatus =
    | "PENDING"                 // Order PENDING
    | "PAYMENT_CONFIRMED"       // Order PAID, ReportGenerationJob not yet COMPLETE/FAILED
    | "REPORT_READY"            // ReportGenerationJob COMPLETE
    | "REFUND_PENDING"          // Order REFUND_PENDING
    | "REFUNDED"                // Order REFUNDED
    | "REFUND_REQUIRES_SUPPORT" // Order REFUND_FAILED
    | "EXPIRED"                 // Order EXPIRED
    | "RECONCILING"             // Stripe reports a newer state (paid or expired) than this
                                 // Order's local PENDING - Pattern 1's webhook-not-yet-processed
                                 // case; a transient status, never a locally-forged transition
    | "NOT_FOUND"               // no Order resolves to the given Checkout Session ID
  ```
  This enum follows the same `const {...} as const` + derived-type pattern used throughout this
  codebase's domain vocabularies.
- **Never included in the response**: `customerEmail`, `stripePaymentIntentId`, `stripeRefundId`,
  `reportAccessToken`, internal failure detail/stack traces, `ProcessedStripeEvent` or any other
  internal audit/event data. The response is exactly the enum above, nothing more (a `reportId`/
  reference the frontend needs to construct the "check your email" messaging is acceptable, but no
  raw internal identifiers beyond what's needed for that copy).
- **Browser redirect remains non-authoritative** — reaching the success page (and thus obtaining
  the Checkout Session ID from the URL) proves nothing about payment; it merely gives the frontend
  something to poll status *with*. The status value itself is only ever derived from
  server-side, webhook-confirmed `Order`/`ReportGenerationJob` state (reaffirms BR-U2B-2).

**Hardening for its bearer-capability nature (added per founder review, 2026-08-24)**: the Checkout
Session ID is now explicitly a low-scope bearer capability for status reads, not just an opaque
lookup key, and is handled with corresponding care:
- Never logged unnecessarily, in full — same discipline as `reportAccessToken` (Pattern 8), scaled
  to this value's narrower (status-read-only) sensitivity.
- A full success/status URL containing it is never logged, for the same reason.
- The status endpoint responds with `Cache-Control: no-store` — a status response is exactly the
  kind of value that must never be cached by an intermediary or the browser itself.
- The success/status page serves with `Referrer-Policy: no-referrer` (same as `/report/[token]`,
  Pattern 8).
- No third-party analytics script runs on the status/success page if it could observe the full
  URL/session ID.
- The response stays enum-only/minimized (above) — possessing the Checkout Session ID never
  authorizes report access or any mutation, only this narrow read.

These are operational controls around the existing design, not a reason to replace the Checkout
Session ID with a custom-minted credential — its deliberately narrow, read-only scope is already
appropriate to its sensitivity level; a bespoke credential would add mechanism without closing a
real gap these controls don't already close.

**Why this needs no new infrastructure**: reusing Stripe's own Checkout Session ID avoids minting,
storing, or hashing a new credential type - it's a lookup key against the already-unique
`stripeCheckoutSessionId` column, nothing more.

## Pattern 5: Refund's Idempotent, Asynchronous Lifecycle (BR-U2B-5/6/7)

Unchanged from Functional Design, restated as an implementation pattern: `refundIdempotencyKey`
generated once per logical attempt, reused only for transport-level retries of that attempt; the
Stripe refund API call is made outside any DB transaction (Pattern 2's scope is local-only); local
state (`REFUND_PENDING`) is written *before* the Stripe call, confirmation state
(`REFUNDED`/`REFUND_FAILED`) is written only from a verified webhook event, never from the initial
API response. No automatic retry after `REFUND_FAILED` in Unit 2B (manual/support resolution,
deferred to Unit 3).

## Pattern 6: Webhook Ledger + Raw-Body Signature Verification (BR-U2B-2/4)

The Next.js route handler for the Stripe webhook reads the raw request body (before any JSON
parsing) and passes it, together with the `Stripe-Signature` header and `STRIPE_WEBHOOK_SECRET`, to
`stripe.webhooks.constructEvent` — an invalid signature throws, produces no `Order` transition, and
is logged as a security-relevant event. A reasonable request-body size bound (NFR-U2B-4) is checked
before this expensive work. Once verified, event resolution and Pattern 2's atomic transaction
proceed as already specified.

## Pattern 7: Guest Report-Access Delivery With Rotation-on-Uncertain-Delivery (BR-U2B-10)

Unchanged sequence from Functional Design (Workflow 6), with `EMAIL_SENT` semantics now precisely
defined per the founder's review:

- `deliveryStatus` on `ReportAccessCredential` uses the following, precisely-scoped meanings:
  ```
  DeliveryStatus =
    | "EMAIL_PENDING"  // delivery attempt not yet made or in flight
    | "EMAIL_SENT"      // ACCEPTED by the configured transactional-email provider (Resend) for
                         // delivery - NOT a guarantee the message reached the recipient's inbox
    | "EMAIL_FAILED"    // the provider rejected the send, or the attempt errored before
                         // acceptance
  ```
  `EMAIL_SENT` is explicitly **not** described or treated anywhere as proof of end-recipient
  delivery — it means Resend's API returned a successful acceptance response for the send request,
  nothing stronger. No provider delivery-webhook (bounce/complaint) tracking is introduced in Unit
  2B, since ACC-1 does not require it — this is a deliberate scope limit, not an oversight.
- On `EMAIL_FAILED` or an uncertain outcome (e.g. a timeout where the provider's response was never
  received), the credential is rotated (`rotateAccessCredential`, unchanged) before any retry —
  never a resend of a previously-issued raw token.
- **Stale `EMAIL_PENDING` is also an uncertain outcome** (added per founder review — a process can
  die while an email send is in flight, leaving a credential permanently `EMAIL_PENDING`): once an
  `EMAIL_PENDING` attempt's `lastDeliveryAttemptAt` (`domain-entities.md`, existing field) exceeds a
  configured uncertainty threshold, it is treated exactly like `EMAIL_FAILED` — the credential is
  rotated and a new attempt made (Pattern 9 is what actually notices and acts on this, on a
  schedule; this bullet states the *rule* for what "stale" means and what to do about it). This
  deliberately accepts that a customer could still receive an earlier email whose token has since
  been revoked, if the provider had actually accepted the first send before its response was lost
  to this application — judged safer than ever allowing two simultaneously-live credentials for the
  same report.
- Delivery outcome never affects `ReportGenerationJob.state` (BR-U2B-10b, unchanged).

**Why this needs no new infrastructure**: this is a `deliveryStatus` field and a retry-via-rotation
policy on an already-existing entity — not a message queue, not a bounce-processing pipeline.

## Pattern 8: Bearer-Link Confidentiality Hardening (extends Unit 2's Pattern 1)

Reaffirms Unit 2's existing `ReportAccessCredential` hash-only mechanism unmodified, adding
operational controls around it (NFR-U2B-4): raw token and full token-bearing URLs are never logged
at any log level (a logger-configuration/call-site discipline, not a new component);
`/report/[token]` and its PDF route respond with `Referrer-Policy: no-referrer` (a response-header
addition to existing route handlers); no analytics/third-party script executes on those pages
(a frontend constraint, not new infrastructure); a pre-commercial-use check of Railway/proxy-level
access logs for incidental raw-path capture is an Operations verification item (tracked in the
external-verification tracker, not a code change). Resend's necessary handling of the emailed link
is the one explicit, intentional exception to "the token never leaves the server boundary
uncontrolled" (NFR-U2B-4, unchanged).

## Pattern 9: Durable Commercial Fulfillment Reconciliation (added per founder review, 2026-08-24)

**Execution mechanism amended, 2026-08-24, by the deployment-platform pivot (Railway -> Vercel)** —
see `aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md` and the
amended `infrastructure-design.md`/`deployment-architecture.md`. The gap this pattern identifies
and the specific 3 conditions it names (below) are unchanged and still the governing requirement;
only "Execution model," further down, is superseded — it originally said this extends the
Railway in-process poller, which no longer exists. On Vercel, most of what this pattern's 3
conditions exist to catch is now closed more directly by Vercel Workflows' own durable-execution
guarantee (each side effect becomes a step inside a durable workflow, so a crash between steps is
resumed by the platform's own replay, not by a separate poll); a low-frequency Vercel Cron backstop
covers the one residual gap workflow durability doesn't itself close (a `start()` call whose own
result was lost) — see the Infrastructure Design documents for the concrete mechanism. The
business-level requirement stated in this pattern (the gap, the 3 conditions, the idempotency
guarantees) remains the correct specification either way.

**The gap this closes**: several post-transition side effects cross a durable-state/external-effect
boundary and were, until this pattern, triggered only at the moment their triggering transition
happened - a process crash between the durable local transition and its follow-up side effect could
silently strand it:
```
ReportGenerationJob COMPLETE  -> issue ReportAccessCredential -> send email
ReportGenerationJob FAILED    -> initiate automatic refund (PAID -> REFUND_PENDING)
Order REFUND_PENDING          -> call the Stripe refund API
```
A paying customer must not depend on the exact process invocation that first observed the terminal
transition surviving long enough to also perform the follow-up. This pattern makes each of these
follow-ups **reconcilable from durable state alone**, on a recurring schedule, rather than relying
solely on the transition-time hook (which remains in place as the *fast path* - reconciliation is
the backstop for when it doesn't complete).

**Execution model — SUPERSEDED 2026-08-24, see the amendment note above.** *(Original text
preserved for the historical record; this description assumed the Railway persistent-process
poller, which the platform pivot removed. See `infrastructure-design.md`'s "Execution Model —
Durable Workflows, Not a Persistent Poller" for the current, correct mechanism.)* Original text:
extends the existing in-process Report Generation Job poller
(`report-generation-orchestrator/poller.ts`, already started once per process in
`instrumentation.ts` with its own module-level start guard and graceful `SIGTERM`/`SIGINT`
shutdown) with an additional reconciliation phase per tick - not a second independent poller, not a
new infrastructure primitive. The existing poller's lifecycle guarantees (exactly-once startup per
process, graceful shutdown) extend to this phase unchanged. Correctness comes from the database-
driven idempotency of each reconciliation check below, not from "only one replica is running" -
this must hold even though Unit 2B still deploys a single Railway replica, the same discipline the
existing job-claim pattern already follows.

**No new infrastructure**: explicitly, no queue, outbox table, message broker, Redis, second worker
service, or general workflow engine. Every check below is a conditional read-then-act against
already-persisted state (`Order`, `ReportGenerationJob`, `ReportAccessCredential`), the same shape
as the existing stale-`IN_PROGRESS`-job recovery this poller already performs.

### 9a. Completed Report Needs Delivery
Find `VERIFIED_PAYMENT`-authorized jobs where `ReportGenerationJob.state = COMPLETE` and the
resulting report does not yet have a successfully-accepted delivery:
- no `ReportAccessCredential` exists yet -> issue one and attempt delivery.
- the latest credential is `EMAIL_PENDING` and stale (Pattern 7's uncertainty-threshold rule) ->
  rotate and retry.
- the latest credential is `EMAIL_FAILED` -> rotate and retry.
`EMAIL_SENT` is set only when Resend actually accepts the send (Pattern 7, unchanged meaning). This
check surviving application restarts is exactly what turns "crashed after `COMPLETE`, before
delivery" into eventual delivery rather than a permanently lost customer report.

### 9b. Failed Paid Job Needs Refund
Find `VERIFIED_PAYMENT`-authorized jobs where `ReportGenerationJob.state = FAILED` AND
`Order.state = PAID` -> initiate the existing `GENERATION_FAILURE` refund process (BR-U2B-6). The
`PAID -> REFUND_PENDING` transition this triggers remains conditional on the `Order` currently
being `PAID` (the same conditional-transition discipline as every other `Order` transition), so
multiple reconciliation passes finding the same job cannot create multiple logical refunds - the
second and subsequent passes simply find the `Order` already `REFUND_PENDING` and move on.

### 9c. REFUND_PENDING Needs Stripe Submission or Resumption
Find `Order`s where `state = REFUND_PENDING` and the logical refund has not yet been successfully
submitted to (or identified with) Stripe -> retry the **same logical refund operation** using the
**same** `refundIdempotencyKey` (BR-U2B-5's corrected scope - this is a transport-level retry of
the one logical attempt, never a new one). This handles both:
- `PAID -> REFUND_PENDING` committed locally, then the process crashed before the Stripe API call
  was ever made, and
- Stripe actually accepted the refund but the response was lost before this application recorded
  `stripeRefundId`.

The stable idempotency key makes both cases safe - Stripe deduplicates a repeated call with the
same key rather than creating a second refund. If `stripeRefundId` is already known for this order,
no new logical Refund is created; the reconciliation pass is a no-op (the wait is now purely for
the confirming webhook). Final `REFUNDED`/`REFUND_FAILED` state continues to come **only** from a
verified Stripe webhook, exactly as already designed - reconciliation resubmits the request, it
never locally declares the outcome.

### Concurrency
Every reconciliation action is a conditional DB transition/claim, safe under repeated or
overlapping runs: `PAID -> REFUND_PENDING` only if currently `PAID`; a delivery
retry/rotation only acts on the credential's *current* persisted state (an already-`EMAIL_SENT`
credential found on a later pass is left alone). This is what makes "safe repeated reconciliation
passes" true regardless of tick frequency or overlap, not an assumption that only one process/tick
ever runs at a time.

### Testing (added per founder review)
Deterministic crash/reconciliation tests, using fault-injected test doubles (no real Stripe/Resend
calls, no real crashes) to prove:
1. Job `COMPLETE` -> simulated crash before credential creation -> reconciliation later delivers.
2. Credential `EMAIL_PENDING` -> simulated process loss -> stale reconciliation rotates and retries.
3. Job `FAILED` + `PAID` order -> simulated crash before refund initiation -> reconciliation
   transitions to `REFUND_PENDING` and initiates the refund.
4. Order `REFUND_PENDING` -> simulated crash before the Stripe API call -> reconciliation resubmits
   using the same `refundIdempotencyKey`.
5. Stripe accepted a refund but the response was lost -> reconciliation repeats the same
   idempotency key -> confirmed no duplicate refund is created.
6. Repeated reconciliation ticks over already-resolved state produce no duplicate
   `ReportGenerationJob`, no duplicate logical refund, and never two simultaneously-valid delivery
   credentials for the same report.
