# Unit 3: Minimum Paid-Product Operations — Business Rules

## BR-U3-0: Every Admin Route Fails Closed

*(Founder-directed, Functional Design Q1)*

Every `/admin/*` page and every `/api/admin/*` route requires HTTP Basic Auth against a
server-side-only credential (`ADMIN_BASIC_AUTH_USERNAME`/`ADMIN_BASIC_AUTH_PASSWORD`, or an
equivalent single credential pair — exact env var naming is an Infrastructure Design/Code
Generation detail). If the credential is not configured in the running environment, **every**
admin route must reject all requests (fail closed) — it must never silently become unauthenticated
or fall back to some default. The credential is a server secret only: never sent to client
JavaScript, never logged (the `Authorization` header value itself, and the decoded credential, are
both on this codebase's "never logged" list alongside `reportAccessToken`/`DATABASE_URL`/
`STRIPE_SECRET_KEY`). Deployed environments require HTTPS for this surface — Basic Auth sends the
credential in a way that is only safe over TLS.

This is explicitly **not** a general authentication framework: no accounts, no RBAC, no
password-reset flow, no OAuth, no database-backed admin-user table (Q1). It is a single
operational control gating a small internal tool, proportionate to solo-operator scale.

**Carried forward to NFR Requirements (not designed here, per this document's own technology-
agnostic scope)**: HTTP Basic Auth's own well-known limitation is that browsers cache and
automatically re-attach the credential to same-origin requests, including ones a malicious
third-party page could induce — meaning Basic Auth alone is not a CSRF defense for mutating
`/api/admin/*` routes (`REFUND_INITIATED`/`RULE_DISABLED`/`RULE_REENABLED`/
`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED`). NFR Requirements must explicitly
size: HTTPS-only enforcement in deployed environments, a strong high-entropy admin password, the
never-logged `Authorization`-header discipline already stated above, the fail-closed-if-
unconfigured behavior already stated above, a proportional same-origin/CSRF control for mutating
admin routes specifically, and whether any brute-force protection is warranted at this unit's
actual scale — evaluated on evidence, not built speculatively.

## BR-U3-0a: Operator Attribution Is Separate From Authentication

*(Founder-directed, Functional Design Q2)*

The Basic Auth credential proves the caller is *the* authorized operator; it does not by itself
supply an identity string suitable for `AdminActionLog.operatorId`. A single, separately-configured
`ADMIN_OPERATOR_ID` value (e.g. a name or email, server-side env var) supplies that attribution.
Unit 3 supports exactly one configured operator — no per-operator credential/identity management.
The design must not make replacing this later (e.g. with multiple named operators) require
rewriting the underlying domain actions or `AdminActionLog`'s own schema — `operatorId` is already
a plain string field for exactly this reason.

**Corrected 2026-08-25 (founder review): passing Basic Auth is not sufficient authorization for a
mutating action.** Every mutating admin action (BR-U3-6/7/8) must independently check that
`ADMIN_OPERATOR_ID` is configured and non-blank *before* attempting anything, and fail closed
(reject the action) if it is absent or blank — exactly as BR-U3-0 fails closed on a missing Basic
Auth credential. Authentication succeeding proves the caller is the operator; it says nothing about
whether there is a usable identity to attribute the mutation to, and a mutation must never proceed
on the strength of authentication alone.

## BR-U3-1 (ADM-1): Report Evidence/Provenance Inspection Is Read-Only

Given a report (`EvidenceReportArtifact`) id, the operator can view every finding, its evidence
sources, retrieval timestamps, and the rule version(s) applied — reading the existing, unmodified
`EvidenceReportArtifact` record exactly as `getReportById` already returns it (Unit 2, unchanged).
No mutation capability. No new authorization concept beyond BR-U3-0's admin-session gate — admin
access is not customer-facing `reportAccessToken` access and must never be confused with it or
reachable via it.

## BR-U3-2 (ADM-2): Rule Version History Inspection Is Read-Only

The operator can view a rule's full lifecycle history (RESEARCHED through its current state,
including `DISABLED` once BR-U3-7 exists) and, via `supersedesRuleId`/`supersededByRuleId`, the
full chain of versions for the same subject/zone — superseded and disabled versions remain fully
inspectable, never deleted or hidden (RGD-4, unchanged). Read-only; this unit adds no new rule
*content* mutation capability (governance's existing `draft`/`triage`/`sourceVerify`/`markTested`/
`approve`/`activate`/`supersede` pipeline is entirely unchanged and untouched by Unit 3 — BR-U3-7
adds only the `ACTIVE <-> DISABLED` operational toggle, never a content edit).

## BR-U3-3 (ADM-3): Data-Source Health Inspection Reads Persisted State, Observed and Override
Shown Separately

The operator can view, per source: `observedHealthState` (automated, from
`recordIngestionResult`), `manualOverrideState` (if any operator override is in effect), and the
**effective** health value each actually being consumed elsewhere
(`effectiveHealthState = manualOverrideState ?? observedHealthState` — corrected 2026-08-25, see
`domain-entities.md`), plus last-successful-retrieval time and most recent failure/reason. This
reads a real Postgres table, not process-local memory — the previous in-memory design could never
make an override visible outside the one process that set it, on Vercel's stateless-per-invocation
model. **All three values (observed, override, effective) are shown distinctly whenever an override
is in effect** — never collapsed into one ambiguous value — so an operator can see both what
automation is actually observing and what is currently overriding it.

## BR-U3-4 (ADM-4): Failed-Generation Inspection Is Strictly Read-Only — No Retry

*(Founder-directed, Functional Design Q4)*

The operator can view any `FAILED` `ReportGenerationJob`'s `failureReasons` (full history, every
attempt appended, unchanged from Unit 2) and `retryAttempts`, plus its associated `Order` (via
`screeningRequestId`) for correlation. **This unit adds no mutation of a terminal `FAILED` job** —
specifically, no `FAILED -> QUEUED` re-queue action. Rationale (founder-stated, binding): a
`VERIFIED_PAYMENT` job reaching `FAILED` already automatically initiates a refund
(BR-U2B-6/BR-U2B-8, unchanged) — re-queuing that same job for another generation attempt would
create genuinely ambiguous states (a customer already refunded while generation restarts; a refund
`REFUND_PENDING` while the same paid job is retried) that would require designing new payment/
refund/retry semantics outside this unit's approved scope. If a future unit needs
complimentary-regeneration/retry, it must design that explicitly, including its payment
interaction — never casually reopened here.

## BR-U3-5 (ADM-5): Order/Customer/Report Lookup Is Exact-Match Only

*(Founder-directed, Functional Design Q6)*

The operator can look up orders by:
- **Order ID** — exact match.
- **Report/artifact ID** — exact match (resolves via `ReportGenerationJob.evidenceReportArtifactId`
  → its `screeningRequestId` → the `Order` with that `screeningRequestId`).
- **Customer email** — normalized (trimmed, case-insensitive) exact match, returning **all** orders
  for that exact normalized email, never a partial/substring/prefix/wildcard match. This is a
  support lookup tool, not a customer-discovery search product — fuzzy matching on email
  specifically risks surfacing an unrelated customer's commercial records for a near-miss query,
  which this unit must not permit.

## BR-U3-6 (ADM-6): Admin-Initiated Refunds Reuse the Existing Refund Machinery Unmodified

The operator can trigger a refund for a specific `Order`, supplying a required, non-empty reason.
This **never** re-implements refund logic: it starts the exact same durable
`processRefundWorkflow` (`start(processRefundWorkflow, [orderId, reason])`) that Unit 2B's
automatic generation-failure refunds already use — never a direct, undurable call to
`order-payment.processRefund` from within the request/response cycle of an admin API route. The
refund reason must be one of the existing `RefundReason` values already meaningful for an
operator-initiated refund — `CUSTOMER_REQUEST` or `GOODWILL` (BR-U2B-5/BR-U2B-7's existing
scope; `GENERATION_FAILURE` and `DUPLICATE_PAYMENT` remain exclusively system-initiated, never
selectable by an operator through this action). Every trigger writes an `AdminActionLog` entry
(`REFUND_INITIATED`) recording the operator, the order, and the stated reason — the log entry
records that a refund was *initiated*; `Order.state`/`stripeRefundId`/`refundConfirmedAt` remain
the sole authoritative record of whether it actually succeeded (unchanged from Unit 2B — a
verified Stripe webhook is still the only source of a confirmed `REFUNDED`/`REFUND_FAILED`
outcome). This action is subject to Unit 2B's existing, unmodified idempotency/resumability
guarantees (BR-U2B-1/BR-U2B-5) — an operator retrying the same trigger on an order already
`REFUND_PENDING` resumes the same logical attempt, it never creates a second one.

**Corrected 2026-08-25 (founder review) — audit-before-action sequencing, since this cannot be one
atomic transaction.** The `AdminActionLog` entry must be written and **committed before**
`start(processRefundWorkflow, ...)` is ever called — this action crosses this application's own
database and the separately-durable Vercel Workflow runtime, so a true distributed transaction
across both is not attempted (no outbox, no generic event system introduced for this). By
sequencing the durable audit write first, an admin refund command can never *appear* to succeed
while lacking a durable attribution record: nothing that affects money is attempted until the audit
entry already exists. If the log write itself fails, the workflow is never started. If the log
write succeeds but the subsequent `start()` call fails or its response is lost, the operator sees
an error and may retry (an honestly-duplicate log entry for the retry is acceptable, matching
`business-logic-model.md`'s Workflow 3) — and Unit 2B's existing Cron reconciliation check 3
(stale `REFUND_PENDING`) already recovers a genuinely lost `start()` response on its own, since it
operates on `Order.state` alone, independent of what triggered the original claim.

## BR-U3-7 (ADM-7): Rule Disable/Re-Enable Is a Reversible Lifecycle Toggle, Never a Content Edit

*(Founder-directed, Functional Design Q3)*

Two new operations extend `regulatory-rule-governance/lifecycle.ts`'s existing pure lifecycle-
transition pattern (matching `activate()`'s exact shape):

- **`disable`**: legal only from `ACTIVE`. Transitions to `DISABLED`. A `DISABLED` rule is
  immediately excluded from new evaluations (the Regulatory Rules Engine's existing
  `ACTIVE`-only candidate-rule filtering, unchanged — `DISABLED` was always excluded by that same
  filter, it was simply never reachable before this unit). Does **not** alter any historical
  report that already used this rule version (RGD-4, unchanged — evidence/findings already
  persisted on an `EvidenceReportArtifact` are immutable regardless of what happens to the rule
  afterward).
- **`reenable`**: legal only from `DISABLED`. Transitions back to `ACTIVE` **on the same,
  byte-for-byte unchanged rule version** — this is a lifecycle-state move only, never an
  opportunity to edit `ruleSpecification`, `citation`, `caveats`, or any other published content.
  Appropriate when investigation determines the disable was precautionary, the suspected defect
  did not actually exist, or an external/data-source problem (not the rule itself) was the real
  cause and has since been resolved.
- **If correcting the actual problem requires changing any substantive rule content**
  (`ruleSpecification`, applicability, threshold, citation/evidence), the disabled version is
  **never** edited and re-enabled — it stays `DISABLED` (or is explicitly `SUPERSEDED` if a
  replacement is published), and the correction goes through the entire existing
  `RESEARCHED -> ... -> APPROVED -> ACTIVE` pipeline as a genuinely new rule version, exactly like
  any other rule change (RGD-4's supersede-don't-mutate discipline, unchanged, extended to cover
  this new entry point).
- Both `disable` and `reenable` require an operator-supplied reason and produce an
  `AdminActionLog` entry (`RULE_DISABLED`/`RULE_REENABLED` respectively) — this codebase's
  established audit trail for this new action, not a field added to `RegulatoryRule` itself (Q5).
  **Corrected 2026-08-25 (BR-U3-9)**: the `lifecycleState` write and the `AdminActionLog` entry
  commit in one database transaction — a rule's active/disabled state must never actually change
  while leaving no durable record of who did it and why.

## BR-U3-8 (ADM-8): Data-Source Override Set/Clear — Corrected 2026-08-25, Separate From Observed
Health

The operator can **set** a source's `manualOverrideState` to an explicit `SourceHealthState`
(ordinarily `UNHEALTHY`, matching ADM-8's stated purpose — "before automated health checks would
catch a problem") — effective health becomes that value immediately — or **clear** an existing
override (`manualOverrideState := null`) — effective health **immediately** reverts to whatever
`observedHealthState` currently is, never waiting for a future ingestion result (see
`domain-entities.md`'s corrected `DataSourceHealth` shape: observed and override are now separate
fields, not one field plus a boolean, precisely because the prior "clear override, health value
persists" design was semantically backwards). Both actions require a reason and produce an
`AdminActionLog` entry (`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED`), and — per
this unit's corrected atomicity rule (BR-U3-9) — the `DataSourceHealth` write and its
`AdminActionLog` entry commit in one transaction. Per BR-U3-3's correction, this write goes to the
same persisted `DataSourceHealth` table every read (ADM-3) and every automated
`recordIngestionResult` call already reads/writes — the override is now genuinely visible to, and
factored into, `checkReadiness`'s BR-U2-1 evaluation (which consumes `effectiveHealthState`,
corrected 2026-08-25) on the very next request, regardless of which Vercel Function instance
handles it. A `DataSourceHealth` row exists for every known source id before any admin or
automated action ever touches it (`domain-entities.md`'s known-source-initialization correction) —
an operator can mark a never-yet-queried known source unhealthy, not only one that has already
produced at least one ingestion result.

## BR-U3-9: AdminActionLog's Atomicity — Corrected 2026-08-25

**Corrected**: the original version of this rule allowed a domain mutation to succeed even if its
`AdminActionLog` write failed. That is no longer the rule for the four purely-local actions —
`RULE_DISABLED`/`RULE_REENABLED`/`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED`
(BR-U3-7/BR-U3-8): the domain mutation and its `AdminActionLog` entry **commit in one database
transaction — if either write fails, both roll back**. An operator must never successfully change
regulatory or evaluation behavior while leaving no durable WHO/WHAT/WHY/WHEN record of it.

`REFUND_INITIATED` (BR-U3-6) remains structurally different (it crosses the database/Vercel
Workflow boundary and cannot form one transaction with `start()`) — its corrected rule is
audit-write-committed-before-`start()`-is-ever-called, per BR-U3-6's own correction above, which
achieves the equivalent guarantee (no unaudited apparent success) without a distributed
transaction.

**"Explanatory, never authoritative" is unchanged and remains true**: `AdminActionLog` still never
*determines* whether a rule is active, a source is healthy, or a refund succeeded —
`RegulatoryRule.lifecycleState`/`DataSourceHealth`'s `effectiveHealthState`/`Order.state` remain
exactly where each domain already keeps that truth. What changed is narrower: "explanatory" no
longer means "optional to persist" for the four local actions where atomicity is achievable, and
"sequenced-first" replaces "best-effort" for the one action where it isn't.
