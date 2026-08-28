# Unit 3: Minimum Paid-Product Operations — Domain Entities

Per Application Design's Admin/Support Service boundary (`services.md` §F), this unit is
**deliberately a coordination/read layer over already-existing, already-owning components** —
`Order`, `RegulatoryRule`, `ReportGenerationJob`, `EvidenceReportArtifact` are unchanged and remain
authoritative for their own domains. Only two entities are genuinely new or newly-persisted here.

## AdminActionLog *(new entity)*

Per the founder's explicit answer (Functional Design Q5): one minimal, append-only log capturing
every admin-triggered mutation, kept deliberately small — **not** a general audit/event-sourcing
framework, and **not** a replacement for any domain entity's own authoritative state.

```
AdminActionLog {
  id: string                    // uuid, primary key
  operatorId: string            // from ADMIN_OPERATOR_ID (Q2) - the single configured operator identity
  actionType: AdminActionType   // closed set, below
  targetType: AdminTargetType   // closed set, below
  targetId: string              // the mutated entity's own id/sourceId - never a guess/derived value
  reason: string                // required, non-empty - the operator's stated justification
  metadata?: Record<string, unknown>  // tightly bounded, only when genuinely useful (see below) - never a dumping ground
  createdAt: string             // ISO 8601, set once, never updated (append-only)
}
```

**`AdminActionType`** (`const {...} as const`, this codebase's established closed-set-vocabulary
pattern):
- `REFUND_INITIATED` (ADM-6)
- `RULE_DISABLED` (ADM-7)
- `RULE_REENABLED` (ADM-7)
- `DATA_SOURCE_MARKED_UNHEALTHY` (ADM-8)
- `DATA_SOURCE_OVERRIDE_CLEARED` (ADM-8)

**`AdminTargetType`**: `ORDER` | `REGULATORY_RULE` | `DATA_SOURCE`.

**What `metadata` may hold, and what it must never hold**: only small, genuinely useful structured
context that isn't already implied by `targetType`/`targetId` (e.g., for `REFUND_INITIATED`, the
`RefundReason` value passed through to `processRefundWorkflow` — this is redundant with the
domain record but useful to see without a second lookup). It must **never** hold anything that
duplicates a full domain record, any Stripe/customer secret, or any bearer credential — this field
existing at all must not become a way to route sensitive data around the logging discipline already
established for `src/shared/logger.ts`.

**Hard invariant (per Q5's explicit framing)**: `AdminActionLog` answers WHO/WHAT/WHY/WHEN/WHICH —
it never becomes the source of truth for whether a rule is active, a source is healthy, or an
order was refunded. Those remain exactly where they already are:
- `Order.state`/`Order.refundReason`/`Order.stripeRefundId` — refund/payment truth (Order & Payment,
  unchanged, Unit 2B's existing corrected state machine).
- `RegulatoryRule.lifecycleState` — whether a rule is currently applied to new evaluations
  (Regulatory Rule Governance).
- `DataSourceHealth` (below) — whether a source is currently treated as unhealthy.

**Corrected 2026-08-25 (founder review) — atomicity, not best-effort, for local mutations**: the
original version of this section allowed a domain mutation to succeed even if its `AdminActionLog`
write failed, reasoning that the log is "explanatory, not authoritative." That conflated two
different questions — *which record determines rule/source/order state* (still, unchanged,
`RegulatoryRule.lifecycleState`/`DataSourceHealth`/`Order.state` — see below) versus *whether a
privileged mutation may ever succeed unaudited* (it may not). For the four actions where both the
domain write and the log write are local Postgres statements —
`RULE_DISABLED`/`RULE_REENABLED`/`DATA_SOURCE_MARKED_UNHEALTHY`/`DATA_SOURCE_OVERRIDE_CLEARED` —
**the domain mutation and its `AdminActionLog` entry commit in one database transaction. If either
write fails, both roll back** — an operator must never successfully change regulatory or
evaluation behavior while leaving no WHO/WHAT/WHY/WHEN record of it. `AdminActionLog` remaining
"explanatory, not authoritative" means only that it never itself *determines* rule applicability or
source health (that's still `lifecycleState`/`effectiveHealthState`, unchanged) — it does not mean
its own persistence is optional for these four actions.

`REFUND_INITIATED` (ADM-6) is different in kind: it crosses a real boundary between this
application's own database and the separately-durable Vercel Workflow runtime — the audit write and
`start(processRefundWorkflow, ...)` cannot form one distributed transaction, and this unit
introduces no distributed-transaction/outbox/generic-event mechanism to fake one. Instead, the
**sequencing itself** guarantees the required property: the `AdminActionLog` entry is written and
**committed first**; `start(processRefundWorkflow, [orderId, reason])` is only ever called after
that commit succeeds. If the log write fails, the workflow is never started at all — there is no
path to an "apparently successful" refund command that lacks a durable audit record, because
nothing money-affecting is attempted until the audit record already exists. If the log write
succeeds but `start()` itself then fails or its response is lost, the operator sees a clear error
and may retry (a second, honestly-duplicate `AdminActionLog` entry for the retry, matching Workflow
3's existing note) — and even an entirely lost `start()` response is already covered by Unit 2B's
existing Cron reconciliation check 3 (stale `REFUND_PENDING`), which requires no Unit-3-specific
mechanism, since it operates on `Order.state` alone, regardless of what triggered the original
claim. Money-state truth is exactly as it always was: `Order`/Stripe webhook, unchanged.

**`ADMIN_OPERATOR_ID` fails closed, independent of authentication**: every mutating admin action
(all five `AdminActionType`s) must check that `ADMIN_OPERATOR_ID` is configured and non-blank
*before* attempting anything — successfully passing HTTP Basic Auth (Workflow 1) proves the caller
is authenticated, it does not by itself prove there is a usable identity to attribute the mutation
to. A configured-but-blank or entirely-missing `ADMIN_OPERATOR_ID` must reject the mutation
(fail closed), exactly like a missing Basic Auth credential rejects the request in the first place
— this is a second, independent fail-closed check, not a fallback to an "unknown operator" record.

## DataSourceHealth *(architectural correction — Unit 1's in-memory `DataSourceRegistry` must
become persisted, starting in this unit)*

**This is a genuine finding from this Functional Design pass, not a decision handed down —
documented here in full rather than silently applied**, matching this project's established
disclosure discipline (the same discipline that produced the Unit 2 CRS correction, Unit 2B's
two-driver Neon strategy, and several corrections already on record for this project).

Unit 1's `DataSourceRegistry` (`src/data-source-registry/index.ts`) is explicitly in-memory, scoped
to one process, with its own code comment anticipating exactly this: *"A later unit may back this
with real persistence if Admin/Support (Unit 3) needs durable history across restarts."* That
comment was written under Unit 1/2's original Railway single-persistent-process assumption. The
actual constraint turns out to be stricter than "restarts": **Vercel Functions are stateless,
independent invocations** — there is no shared process memory between the Vercel Function handling
an admin's `POST /api/admin/data-sources/:id/unhealthy` request and the Vercel Function handling a
customer's `POST /api/checkout` (which calls `checkReadiness` → `dataSourceRegistry.isKnownUnhealthy`)
five seconds later. **As built today, an admin marking a source unhealthy would have literally no
effect on any other request** — ADM-8's own acceptance criterion ("this status is visible to ADM-3
**and factored into new evaluations**") is not achievable with the current in-memory design on
Vercel, full stop, independent of any UI Unit 3 builds on top of it.

**Correction**: `DataSourceRegistry`'s storage moves to Postgres, starting in this unit. Its
*functional* contract (the operations it exposes: get one source's health, check if a source is
known-unhealthy, record an automated ingestion result, set/clear a manual override, list unhealthy
sources) is **unchanged** — every existing caller (`checkReadiness` in
`screening-request/authorization.ts`, the Property Intelligence retrievers that call
`recordIngestionResult`) keeps calling the same conceptual operations; only the storage backing
changes from an in-memory `Map` to a real table, exactly mirroring the two-driver `neon-http`
pattern already established for every other read/write in this application since the Vercel pivot.
This is **in-scope, anticipated work**, not scope creep — Unit 1's own documentation predicted a
later unit would need to do exactly this, and ADM-3/ADM-8 are precisely that later need.

**Corrected 2026-08-25 (founder review) — observed health and manual override are separate fields,
not one field plus a boolean.** The original shape (one `healthState` plus a `manualOverride: boolean`
flag) made "clear override" semantically wrong: clearing the flag while leaving `healthState` at
whatever value the override had last written would leave the *override's own value* governing
readiness indefinitely, until some unrelated future ingestion happened to overwrite it — exactly
backwards from what "clear the override, let automation govern again" is supposed to mean.

```
DataSourceHealth {
  sourceId: string                    // primary key, e.g. "king-county-gis", "king-county-parcel-polygon"
  observedHealthState: SourceHealthState  // "HEALTHY" | "UNHEALTHY" | "UNKNOWN" - written ONLY by
                                           // automated recordIngestionResult calls, never by an
                                           // admin action
  lastSuccessfulRetrieval?: string    // ISO 8601 - observed-side metadata only
  lastFailureAt?: string              // ISO 8601
  lastFailureReason?: string
  manualOverrideState?: SourceHealthState | null  // set only by ADM-8; null/absent = no override
                                                   // in effect
  updatedAt: string                   // ISO 8601
}
```

**Effective health** (what `isKnownUnhealthy`/`checkReadiness`'s BR-U2-1 evaluation actually
consumes, never `observedHealthState` directly): `effectiveHealthState = manualOverrideState ??
observedHealthState`.

- **`recordIngestionResult`** (automated, unchanged call sites in Property Intelligence) **always**
  updates `observedHealthState` and its associated metadata (`lastSuccessfulRetrieval`/
  `lastFailureAt`/`lastFailureReason`) — regardless of whether a manual override is currently in
  effect. Automated monitoring keeps recording reality even while an operator's override is
  governing evaluation behavior; it simply doesn't determine the *effective* value while an
  override exists.
- **Set override (ADM-8)**: `manualOverrideState := <operator-selected value>`. Effective health
  becomes that value immediately.
- **Clear override (ADM-8)**: `manualOverrideState := null`. Effective health **immediately**
  reverts to the current `observedHealthState` — never waits for a future ingestion result to take
  effect; the observed value was already being tracked the whole time the override was active.

**ADM-3's inspection view must show all three values distinctly** when an override is in effect
(e.g. "Observed: HEALTHY · Manual override: UNHEALTHY · Effective: UNHEALTHY") — never collapse
this to a single ambiguous value, per the founder's explicit diagnostic-usefulness requirement.

**Known-source initialization**: ADM-8 requires an operator to be able to proactively mark a
**known** source unhealthy before any automated check has ever run against it — this must not
depend on "the row is created lazily by whichever touches it first" (a source nobody has ever
queried yet would then be invisible to ADM-3/ADM-8 entirely). The existing, already-established set
of source IDs this application actually uses (e.g. `REQUIRED_SOURCE_IDS_FOR_SHED`'s
`"king-county-gis"`/`"king-county-parcel-polygon"`, and any other source ID a Property Intelligence
retriever is already coded against) is the canonical known-source list — no new source-catalog
service. A `DataSourceHealth` row for every known source ID exists with `observedHealthState:
UNKNOWN` and no override before any ingestion or admin action ever touches it (an idempotent
get-or-seed step, safe to run repeatedly — the exact mechanism, e.g. an upsert-on-read for ADM-3's
list view versus a one-time seed, is an Infrastructure Design/Code Generation choice, not fixed
here). Every write (`recordIngestionResult`, set/clear override) uses `INSERT ... ON CONFLICT`
upsert semantics so a row is never *missing* by the time any of these operations runs, whichever
touches it first.

**Not part of this correction**: the `FailedLookupRateLimiter`
(`src/report-access/rate-limiter.ts`) has the identical in-memory-on-serverless problem, already
flagged as a known, accepted limitation in Unit 2B's own operations runbook — it is **not** one of
Unit 3's 8 ADM stories and is explicitly not touched here, per the governing "no later-unit/
unrelated functionality pulled forward" instruction.

## Entities Explicitly Unchanged (read-only from this unit's perspective)

- **`Order`** (`order-payment`) — ADM-5/ADM-6 read/act through the existing, unmodified
  `getOrderById`/`processRefund`/`processRefundWorkflow`. No new fields.
- **`RegulatoryRule`** (`regulatory-rule-governance`) — ADM-2 reads it unmodified (including its
  existing `verificationHistory`). ADM-7 exercises its **already-existing** `DISABLED` lifecycle
  enum value (present in `db/schema.ts` since Unit 1, explicitly reserved "transition/tooling is
  Unit 3") via two new small pure functions in `lifecycle.ts` (`disable`/`reenable` — see
  `business-logic-model.md`) — no new fields on the entity itself, per the founder's explicit Q5
  answer that attribution belongs in `AdminActionLog`, not scattered per-entity fields.
- **`ReportGenerationJob`** (`report-generation-job`) — ADM-4 reads `state`/`failureReasons`/
  `retryAttempts` unmodified. No mutation capability added (Q4 — explicitly read-only in this unit).
- **`EvidenceReportArtifact`** (`evidence-report-artifact`) — ADM-1 reads it unmodified via the
  existing `getReportById`.

## Explicitly Deferred (per the approved unit plan, not reopened here)

- **`SupportCase`** — ADM-9's own entity, deferred to Unit 9 alongside ADM-9 itself.
