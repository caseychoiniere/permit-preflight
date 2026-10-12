# Checkout and payment state machine

*(Added 2026-10-12 with the fix for the launch-blocking "Confirming your payment…" defect. Applies identically to every project type: one checkout route, one webhook route, one status route.)*

## What went wrong

Four Stripe test checkouts were paid (Stripe: `status=complete`, `payment_status=paid`, PaymentIntents present, `checkout.session.completed` events created) but the app's Orders stayed `PENDING` and the customer's page read "Confirming your payment…" indefinitely.

First divergence, proven: Stripe → app webhook delivery. No `stripe listen` process was running, so none of the four events reached `POST /api/webhooks/stripe` (no `processed_stripe_events` row exists for any of them). The signing secret in `.env.local` was **not** the problem (it matches the CLI's current secret).

Two code defects made that environmental gap unrecoverable:

1. `getGuestStatus` was a pure DB read and nothing ever asked Stripe about a `PENDING` order, so a missed webhook stranded a paid customer permanently.
2. One ambiguous guest status (`PENDING`) meant "never paid", "paid but webhook late" and "Stripe unreachable", so an unpaid or expired session also read "Confirming your payment…".

## Order states (database, `orders.state`)

```
PENDING ──paid──────────────▶ PAID ──generation fails──▶ REFUND_PENDING ──▶ REFUNDED
   │                            │                                   └────────▶ REFUND_FAILED
   └──session expired──▶ EXPIRED └─ (report job QUEUED → IN_PROGRESS → COMPLETE | FAILED)
```

`PENDING → PAID` happens in exactly one transaction (`handleVerifiedWebhook` / `handlePaymentConfirmed`): conditional update `WHERE state='PENDING'`, report job inserted `QUEUED`, ledger row in `processed_stripe_events`. It is reached by any of three triggers, which share that transaction:

| Trigger | When | Ledger id |
|---|---|---|
| Stripe webhook `checkout.session.completed` | normal path, seconds after payment | Stripe's `evt_…` |
| Live Stripe check on the customer's status read | whenever the browser polls and the Order is still `PENDING` | `reconcile:<checkout session id>` |
| Cron check 6 (`/api/cron/reconcile`, every 5 min) | `PENDING` orders at least 2 min old, no maximum age, least-recently-checked first (`orders.updated_at` doubles as the last-checked stamp; batch of 50), so a paid order is recoverable however old and a large unresolved backlog cannot starve later orders. The set drains by itself: paid → `PAID`, expired → `EXPIRED` | `reconcile:<checkout session id>` |

**Session binding:** every one of these confirms an order only if the paid Checkout Session is the one stored on that order (`orders.stripe_checkout_session_id`); a paid event for any other session, or for an order with no stored session id, is rejected (fail closed, not recorded in the ledger). An order whose session id was never persisted (crash between insert and persist) is recovered by the idempotent checkout resumption, which stores the id; Stripe's record then confirms it.

(The `PENDING → EXPIRED` close-out from a Stripe retrieval is a separate conditional update `WHERE state='PENDING'`, not that transaction; it returns the real current status if it loses a race.)

Whichever commits first wins; the others find the Order already `PAID` and do nothing, so the fulfillment workflow starts once. A concurrent loss is a benign no-op (`OrderNoLongerPendingError`), not a 500.

## What the customer sees (`GuestOrderStatus`, the status API)

| Guest status | Meaning | Page |
|---|---|---|
| `AWAITING_PAYMENT` | Stripe: session open and unpaid | "Your payment hasn't been completed. No charge has been made." + link to the **same** Stripe session (no second charge); order reference. With no validated same-session link: re-check + order reference + support (never a new-payment path) |
| `CONFIRMING_PAYMENT` | Stripe says complete/processing, or Stripe could not be asked | "Confirming your payment…"; after 30 s: "We're still confirming the payment with Stripe. There's no need to pay again." + order reference + **Check again**; never a request to pay, never the generation animation |
| `PAYMENT_CONFIRMED` | Order `PAID`, report job not complete | report-generation experience |
| `REPORT_READY` | job `COMPLETE` | report, PDF, email status |
| `REFUND_PENDING` / `REFUNDED` / `REFUND_REQUIRES_SUPPORT` | generation failed, order's own refund recovery | refund panel with order reference |
| `EXPIRED` | Stripe: session expired unpaid | "This checkout session has expired." |
| `NOT_FOUND` | no cookie / unknown session | start again |
| `RECONCILING` | checkout-creation retry only (never produced by the status read) | confirming wording |

Stripe is asked at most once per 2 s per Checkout Session (per instance). The status API never fabricates a status: a server failure returns 503 and the page counts it, keeps polling, and after 3 consecutive failures says it is having trouble reaching Permit Preflight.

## Page polling

Chained timeouts (never overlapping requests); 3 s, then 8 s after 90 s; stops only on a terminal status (`REPORT_READY`, `REFUNDED`, `REFUND_REQUIRES_SUPPORT`, `EXPIRED`, `NOT_FOUND`). A non-2xx response, unparseable body or unknown status is a poll **failure**, never a status.

## Local development

Run `npm run stripe:listen` next to `npm run dev`. It refuses to start with a non-test key, and refuses to forward if the CLI's signing secret differs from `STRIPE_WEBHOOK_SECRET` in `.env.local` (update the value, restart the dev server). The app no longer depends on it for correctness (the live check recovers a missed webhook), but without it every purchase waits for the next status poll instead of the webhook.

## Tests

`tests/checkout-fulfillment/payment-recovery.integration.test.ts` (live Neon, stubbed Stripe): unpaid/expired; webhook missing → status read confirms; webhook still works; cron confirms and closes out; duplicate/late/raced webhooks start fulfillment once; sequence CONFIRMING → PAYMENT_CONFIRMED → REPORT_READY; Stripe outage or foreign session never confirms or asks to pay; throttle; every project type. `tests/checkout/status-helpers.test.ts`: response interpretation, cadence, termination, recovery wording, panels.

## Resuming checkout

`createCheckoutSession` on a `PENDING` order whose Stripe session is `expired` or `complete` no longer returns "try again shortly" and waits for a webhook that may not come: it applies Stripe's record through `reconcileOrderWithStripe`. Paid → `ALREADY_PAID` (the route starts the fulfillment it queued); expired → the old order is closed and a fresh checkout is created; Stripe unreachable → an error, never a second checkout.
