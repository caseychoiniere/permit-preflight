# Unit 3: Frontend Components

A minimal internal admin surface (Functional Design Q1) — real and usable for one operator, not a
commercial admin platform. Every page below sits under `/admin` and is gated by Workflow 1's
HTTP Basic Auth check before any component ever renders (enforced server-side; components
themselves assume they are already behind that gate and never re-implement access control).
Concrete framework mechanics (exactly how the Basic Auth check is wired into Next.js's routing) are
an Infrastructure Design/Code Generation decision — this document defines page structure, props/
state, and interaction flow, technology-agnostically enough to survive that choice.

## Page/Component Hierarchy

```
AdminLayout (shared nav across every /admin page - Orders, Rules, Data Sources, Failed Reports)
├── AdminOrderSearch (ADM-5) — /admin/orders
│   └── AdminOrderDetail (ADM-5, ADM-1, ADM-6) — /admin/orders/[orderId]
│       ├── OrderStateSummary (Order.state/paidAt/refundReason/stripeRefundId, read-only)
│       ├── ReportEvidencePanel (ADM-1 — only rendered if the order's job reached COMPLETE)
│       └── RefundActionForm (ADM-6)
├── AdminRuleList (ADM-2) — /admin/rules
│   └── AdminRuleDetail (ADM-2, ADM-7) — /admin/rules/[ruleId]
│       ├── RuleVersionHistory (lifecycle timeline + supersession chain, read-only)
│       └── RuleLifecycleActionForm (ADM-7 — Disable / Re-Enable, shown only when legal)
├── AdminDataSourceList (ADM-3, ADM-8) — /admin/data-sources
│   └── DataSourceOverrideForm (ADM-8, inline per row — no separate detail page needed)
└── AdminFailedJobsList (ADM-4) — /admin/failed-reports
    └── FailedJobDetail (ADM-4 — failureReasons/retryAttempts/correlated Order, READ-ONLY, no
        action form at all — Q4 explicitly excludes any mutation here)
```

## AdminLayout

**Props**: none (server-rendered per-request; no client-side auth state to hold, since Basic Auth
is stateless and re-checked by the server on every request — there is deliberately no "logged in"
client state to manage, no logout button to build, matching Q1's "no session cookie" framing for
the Basic Auth option specifically).

**Behavior**: a simple nav linking the four sections above. No dashboard/landing widgets beyond
navigation — this unit builds exactly the 8 ADM stories' surfaces, nothing more.

## AdminOrderSearch (ADM-5)

**State**: `query: { kind: "orderId" | "email" | "reportId"; value: string }`, `results: Order[] |
"NOT_FOUND" | "IDLE"`.

**Behavior**: one search form with an explicit kind selector (not a single ambiguous free-text box
that tries to guess the identifier type) — submits to the exact-match lookup (BR-U3-5). Email
input is trimmed/lowercased client-side for UX, but the server performs the authoritative
normalization and matching — the client-side step is convenience only, never the source of truth
for what "matches." No result ever appears from a partial/fuzzy match; a non-matching query shows
a plain "no results," never a fuzzy suggestion.

## AdminOrderDetail (ADM-5, ADM-1, ADM-6)

**Props**: `orderId: string`.

**Renders**: `OrderStateSummary` (read-only — `Order.state`, `priceCents`/`currency`, `paidAt`,
`customerEmail`, `refundReason`, `stripeRefundId`, `refundConfirmedAt`; the full state, since this
is an internal operator view, not the minimized customer-facing `GuestOrderStatus`); if the
correlated `ReportGenerationJob.state === COMPLETE`, `ReportEvidencePanel` (ADM-1, reads the same
underlying data `/report` shows a customer, laid out for operator diagnosis rather than customer
presentation — e.g. always-visible `REQUIRES_VERIFICATION` findings, full evidence/provenance,
never hidden behind customer-facing framing); `RefundActionForm` (ADM-6, rendered whenever
`Order.state` is a state a refund can legally be triggered from — mirrors `decideRefundAction`'s
own `PAID`/`REFUND_PENDING` legality, never rendered as an available action for
`REFUNDED`/`REFUND_FAILED`/`PENDING`/`EXPIRED`).

### RefundActionForm (ADM-6)
**Props**: `orderId`, `currentState: OrderState`.
**Fields**: reason kind (`CUSTOMER_REQUEST` | `GOODWILL` only — never a raw free-choice of every
`RefundReason` value, since `GENERATION_FAILURE`/`DUPLICATE_PAYMENT` must stay system-only per
BR-U3-6), a required free-text justification.
**On submit**: calls the admin refund action (Workflow 3) and shows the resulting `Order.state`
immediately after `start()` returns (which is `REFUND_PENDING`, not yet `REFUNDED` — the form must
say "refund initiated, pending confirmation," never "refund complete," since only a verified Stripe
webhook can ever say that).

## AdminRuleList / AdminRuleDetail (ADM-2, ADM-7)

**AdminRuleList state**: `rules: RegulatoryRule[]`, filterable by `lifecycleState` (a plain
client-side filter over an already-fetched read-only list — no new search infrastructure).

**AdminRuleDetail props**: `ruleId`. **Renders**: `RuleVersionHistory` (the rule's own
`verificationHistory` plus the full `supersedesRuleId`/`supersededByRuleId` chain, rendered as a
simple timeline — every version inspectable, disabled/superseded versions visually marked but never
hidden); `RuleLifecycleActionForm`, which renders **either** a Disable form (only when
`lifecycleState === ACTIVE`) **or** a Re-Enable form (only when `lifecycleState === DISABLED`) —
never both, never a raw dropdown of every theoretically-possible lifecycle value, since BR-U3-7
only permits these two specific transitions from this surface.

### RuleLifecycleActionForm (ADM-7)
**Fields**: a required free-text reason (identical field for both Disable and Re-Enable — the
distinction is which action is being taken, not the field shape).
**Re-Enable form includes a visible reminder** (static copy, not a dynamic check): "This
re-activates the existing rule version unchanged. If the underlying regulatory content needs
correction, do not use this — publish a new rule version through the normal research/verification
pipeline instead." (Reinforces BR-U3-7's content-immutability invariant at the point of action,
since this UI has no mechanism to edit rule content at all — the reminder exists so an operator
doesn't go looking for one.)

## AdminDataSourceList (ADM-3, ADM-8)

**State**: `sources: DataSourceHealth[]` — one row per **known** source id, always present (per
`domain-entities.md`'s known-source-initialization correction — a source an operator has never seen
an ingestion result for is still listed, with `observedHealthState: UNKNOWN`).

**Corrected 2026-08-25 — renders three values distinctly, not one**: `observedHealthState`
(automated), `manualOverrideState` (only shown when an override is in effect), and
`effectiveHealthState` (what actually governs `checkReadiness`), e.g.:

```
king-county-parcel-polygon    Observed: HEALTHY    Override: UNHEALTHY    Effective: UNHEALTHY  [Clear override]
king-county-gis               Observed: HEALTHY    (no override)          Effective: HEALTHY    [Mark unhealthy]
```

plus `lastSuccessfulRetrieval`/`lastFailureAt`/`lastFailureReason` (observed-side metadata,
unaffected by any override). Each row includes `DataSourceOverrideForm` inline — no separate detail
page, since a source's health is a single small record, not a rich sub-resource like an order or a
rule.

### DataSourceOverrideForm (ADM-8)
**Fields**: when no override is active — a health-state choice (ordinarily `UNHEALTHY`) plus a
required reason; when an override IS active — a "Clear override" action plus a required reason.
Never both controls shown at once (mirrors the Rule form's either/or pattern above). **Clearing
takes effect immediately** in the row's own displayed `effectiveHealthState` (reverts to whatever
`observedHealthState` already shows) — the UI must not imply a wait for "the next check" the way
the original (corrected) design would have required.

## AdminFailedJobsList / FailedJobDetail (ADM-4)

**AdminFailedJobsList state**: `jobs: ReportGenerationJob[]` where `state === FAILED`.

**FailedJobDetail props**: `jobId`. **Renders**: `failureReasons` (full array, every attempt),
`retryAttempts`, `createdAt`/`updatedAt`, and the correlated `Order` (via `screeningRequestId`) for
context. **Deliberately no action control of any kind on this page** — not even a disabled-looking
button — per Q4's explicit "no mutation of terminal FAILED jobs" rule; there is nothing here for an
operator to click beyond navigating to the correlated Order (which may itself surface a refund
action, per `AdminOrderDetail` above, entirely through the existing, unmodified automatic-refund
path — this page itself triggers nothing).
