# Unit 3: Minimum Paid-Product Operations — Functional Design Plan

**Status: ANSWERED 2026-08-25 — all 6 questions answered, no contradictions detected. Proceeding
to generate the functional design artifacts (Part 2).** Full verbatim answers are in
`aidlc-docs/audit.md`'s "Unit 3 - Functional Design Plan Presented" follow-up entry; this file
records the resolved decisions each answer produced, inline below each question.

## Unit Context

**Unit definition** (`unit-of-work.md`): the minimum operational capability required to safely
support real paid reports — not full Admin/Support Service coverage. Gates Units 4-11 (no
additional paid project type or account-linked customer surface goes live before this exists).

**Assigned stories** (`unit-of-work-story-map.md`, `stories.md` Epic 8): 8 of 9 ADM stories —
ADM-1 (inspect evidence/provenance), ADM-2 (inspect rule versions/citations), ADM-3 (inspect
data-source health), ADM-4 (inspect report-generation failures), ADM-5 (inspect payment/order
state), ADM-6 (issue/manage a refund), ADM-7 (disable a problematic rule), ADM-8 (mark a data
source unhealthy). **ADM-9** (end-to-end complaint investigation) and its **Support Case** entity
are explicitly deferred to Unit 9 (Retaining Walls) per the already-approved unit plan — not
reopened here.

**Stands up** (`services.md` §F): Admin/Support Service — a coordination/read layer over
**already-existing, already-owning** components, not a new data store duplicating their state:
- Evidence & Report Artifact (read — ADM-1)
- Regulatory Rule Governance (read + a new disable action — ADM-2/ADM-7)
- Data Source Registry (read + existing `setManualOverride` — ADM-3/ADM-8)
- Report Generation Job (read — ADM-4)
- Order & Payment (read + existing `processRefund` — ADM-5/ADM-6)

**What Unit 3 does NOT need to build new** (already exists, confirmed by direct inspection):
- `src/data-source-registry/index.ts`'s `getSourceHealth`, `listUnhealthySources`,
  `setManualOverride` — ADM-3/ADM-8 are exposing these, not building them.
- `src/order-payment/repository.ts`'s `processRefund` (the corrected, resumable state machine) and
  `getOrderById` — ADM-6/ADM-5 call into this unchanged; Unit 3 never re-implements refund logic.
- `src/regulatory-rule-governance/`'s existing lifecycle/`verificationHistory` — ADM-2 reads this
  directly; `lifecycleState`'s `DISABLED` enum value already exists in `db/schema.ts`, explicitly
  reserved with the comment "transition/tooling is Unit 3 (ADM-7)" — this unit is exactly where
  that gets built.
- `src/report-generation-job/repository.ts`'s `failureReasons`/state — ADM-4 reads this directly.

**Depends on**: Unit 2B (real orders must exist to inspect) — satisfied, Unit 2B is COMPLETE.

**Explicitly out of scope** (per the unit's own "right-sized" framing and the governing
proportionality instruction): ADM-9/Support Case (Unit 9), any general customer-account system
(Unit 6), enterprise-grade admin platform features (role-based permissions beyond a single
operator concept, bulk operations, scheduled reports), any new paid project type or customer-facing
surface.

## What This Stage Will Produce

- [x] `aidlc-docs/construction/unit-3-minimum-paid-product-operations/functional-design/domain-entities.md`
      — `AdminActionLog` (new) + the `DataSourceHealth` persistence correction (a genuine finding,
      documented in full in that file — Unit 1's in-memory `DataSourceRegistry` cannot satisfy
      ADM-8 on Vercel's stateless-per-invocation model)
- [x] `aidlc-docs/construction/unit-3-minimum-paid-product-operations/functional-design/business-rules.md`
      — BR-U3-0/0a (auth/attribution) plus one rule per ADM story (BR-U3-1 through BR-U3-8) plus
      BR-U3-9 (AdminActionLog's explanatory-never-authoritative invariant)
- [x] `aidlc-docs/construction/unit-3-minimum-paid-product-operations/functional-design/business-logic-model.md`
      — 5 workflows: Admin Access, Read-Only Inspection, Admin-Initiated Refund, Rule Disable/
      Re-Enable, Data-Source Override Set/Clear
- [x] `frontend-components.md` — written (Question 1 selected the web UI option)

## Questions

Please answer each question below by filling in the letter choice after `[Answer]:`. If none of the
options fit, choose the last option and describe your preference.

## Question 1
This codebase currently has **no admin authentication mechanism at all** — every existing route is
either fully public (checkout, reports-by-token) or a server-only CLI script
(`scripts/generate-prototype-report.ts`, deliberately never a public route). ADM-1 through ADM-8
all require "the operator can view/inspect/trigger X" — what should that interface actually be?

A) **CLI-only** — a set of server-only scripts (matching `generate-prototype-report.ts`'s existing
precedent exactly: run locally or from deploy/ops tooling, never a deployed public route, no new
web auth surface to secure). Simplest and lowest-risk; means checking order status or issuing a
refund requires shell access to the deployed environment, not a browser.

B) **Minimal authenticated web UI, protected by a single shared-secret HTTP Basic Auth** credential
(one `ADMIN_*` env var pair, checked on every `/admin/*` request — no login form, no session
cookie, no accounts). New public routes, but the simplest real web-auth mechanism available.

C) **Minimal authenticated web UI, protected by a login form + session cookie** backed by one
operator credential (a bit more usable day-to-day than Basic Auth prompts, still no general
account system). New public routes plus a small session mechanism.

D) Other (please describe after `[Answer]:` tag below)

[Answer]: B — minimal authenticated web admin UI, HTTP Basic Auth, server-side env-var credentials only, fail-closed if unconfigured, HTTPS-only in deployed environments, no accounts/RBAC/OAuth/password-reset/DB-backed admin users.

## Question 2
Tied to Question 1: how many distinct **operator identities** does this unit need to support for
attribution (e.g., "who disabled this rule," "who issued this refund")?

A) **Exactly one, fixed** — a single configured operator identity (e.g., a name/email set in an
env var), matching this project's solo-founder scale throughout. No per-operator credentials.

B) **Multiple named operators from day one** — even though only one person uses this today, support
distinct credentials/identities per operator now rather than retrofitting later.

C) Other (please describe after `[Answer]:` tag below)

[Answer]: A — exactly one configured operator identity (`ADMIN_OPERATOR_ID` env var) supplies audit attribution; the Basic Auth credential only gates access. No multi-operator identity management in Unit 3.

## Question 3
ADM-7 ("disable a problematic rule... while I investigate and correct it") — is `DISABLED`
**reversible** back to `ACTIVE` on the same rule version, or strictly terminal (a corrected rule
must go through the normal RESEARCHED→...→ACTIVE pipeline as a *new* version, per RGD-4's existing
"supersede, never mutate a published version" philosophy)?

A) **Terminal (one-way emergency stop)** — `DISABLED` is never reversed on the same version; the
only path back to an active rule for that subject/zone is a new corrected version through the
normal pipeline. Matches RGD-4's existing supersede-don't-mutate discipline exactly.

B) **Reversible** — add an explicit re-enable action (`DISABLED` → `ACTIVE`) for cases where
disabling turns out to have been precautionary and the existing version was fine after all.

C) **Time-boxed reversibility** — reversible for a short window (e.g., same day), terminal after
that.

D) Other (please describe after `[Answer]:` tag below)

[Answer]: B — `DISABLED -> ACTIVE` is reversible on the SAME immutable version (a lifecycle-state move, never a content edit), with a required operator+reason for both disable and re-enable. Any substantive content correction still requires a brand-new version through the normal RESEARCHED->...->ACTIVE pipeline — published rule content stays immutable either way. No time-boxed reversibility.

## Question 4
ADM-4's acceptance criteria say "inspect... with enough detail to diagnose the cause" — read-only.
Should Unit 3 also add an operator-triggered **retry action** for a `FAILED`
`ReportGenerationJob` (re-queuing the same job for the existing pipeline to attempt again), closing
the gap Unit 2's own operations runbook already flagged ("no automatic re-queue from FAILED... a
real, small test-coverage/capability gap")?

A) **Read-only inspection only**, exactly as ADM-4's acceptance criteria state — a retry means
creating a new order/screening request (Unit 2's existing, unchanged limitation). No new mutation
action in this unit.

B) **Add a manual retry action** (`FAILED` → `QUEUED`, reusing the existing claim/workflow
machinery unmodified) — a small, natural extension of "operational capability required to safely
support real paid reports."

C) Other (please describe after `[Answer]:` tag below)

[Answer]: A — ADM-4 stays strictly read-only. No `FAILED -> QUEUED` retry action in Unit 3, specifically because a VERIFIED_PAYMENT job's automatic generation-failure refund path already fires on FAILED, and re-queuing risks refund/regeneration ambiguity that is out of this unit's scope to solve.

## Question 5
ADM-6/ADM-7/ADM-8 all say an admin action must be "recorded for audit purposes" (ADM-6 states this
explicitly; the same expectation reasonably extends to disabling a rule and marking a source
unhealthy). `Order.refundReason` already records *why* a refund happened, but there is currently no
"who/why" field for a rule-disable or a source-health override. What should record that?

A) **Extend the existing entities with minimal attribution fields** — e.g., `RegulatoryRule` gains
`disabledBy`/`disabledAt`/`disabledReason`; `DataSourceRegistry`'s existing `manualOverride` gains
an operator/reason field. Matches `RegulatoryRule`'s existing `verificationHistory`-on-the-entity
pattern; no new table.

B) **One new, minimal `AdminActionLog` entity** capturing every admin-triggered mutation generically
(operator, action type, target, reason, timestamp) — a single small new table, reusable across all
current and future ADM actions rather than one-off fields per entity.

C) **Structured application logs only** (`src/shared/logger.ts`) — no new persisted, queryable DB
record beyond what already exists (`Order.refundReason`).

D) Other (please describe after `[Answer]:` tag below)

[Answer]: B — one new, minimal, append-only `AdminActionLog` entity (operatorId, actionType, targetType, targetId, reason, optional bounded metadata, createdAt) records every admin-triggered mutation. It is attribution/audit history only — Order/Stripe state, RegulatoryRule.lifecycleState, and Data Source Registry remain the sole authoritative domain state. No event sourcing, no generic audit framework beyond this one table.

## Question 6
ADM-5 ("search by order ID, customer email, or report ID") — what's the actual matching behavior
needed?

A) **Exact match only** per identifier (order ID exact; customer email exact string match,
returning all of that customer's orders; report/artifact ID exact) — simplest, and each of these
identifiers is already precise enough that partial matching adds risk (email substring matching
could over-expose other customers' orders) without clear benefit at this scale.

B) **Partial/fuzzy matching** needed (e.g., case-insensitive partial email match).

C) Other (please describe after `[Answer]:` tag below)

[Answer]: A — exact-match only. Order ID exact; report/artifact ID exact; customer email normalized (trimmed, case-insensitive) exact match returning all of that customer's orders. No substring/prefix/fuzzy search.
