# Unit 3: Minimum Paid-Product Operations — Business Logic Model

**Owned by**: Admin/Support Service (`services.md` §F) — coordinates reads/actions through each
domain's existing authoritative owner; owns only `AdminActionLog` as genuinely new state (plus the
`DataSourceHealth` persistence correction, which is Data Source Registry's own storage, not a new
service-owned entity).

## Workflow 1: Admin Access (BR-U3-0/BR-U3-0a)

```
1. Browser requests any /admin/* page or /api/admin/* route.
2. The request is checked for a valid HTTP Basic Auth Authorization header BEFORE it reaches any
   page/route handler logic.
3. If ADMIN_BASIC_AUTH_USERNAME/ADMIN_BASIC_AUTH_PASSWORD (or equivalent) are not both configured
   in this environment: reject ALL admin requests (fail closed) - this is a startup/deployment
   configuration defect, never a "no auth required" fallback.
4. If the header is missing or does not match: respond 401 with a WWW-Authenticate: Basic
   challenge - the browser's native Basic Auth prompt handles re-entry, no custom login UI needed.
5. If the header matches: the request proceeds. The verified caller is treated as THE single
   configured operator - their attribution for any subsequent AdminActionLog entry comes from the
   separately-configured ADMIN_OPERATOR_ID (step 6 below), not from the Basic Auth username itself
   (BR-U3-0a - these are deliberately two different configuration values, so operator identity can
   be changed independent of the credential, and so a future multi-operator design doesn't need to
   touch AdminActionLog's schema).
6. Every mutating admin action (Workflow 3/4/5 below) reads ADMIN_OPERATOR_ID **before** attempting
   anything else. **Corrected 2026-08-25**: if ADMIN_OPERATOR_ID is absent or blank, the action is
   rejected (fail closed) right there - passing Basic Auth proves the caller is the operator, it
   does not by itself supply a usable identity to attribute a mutation to, and a mutation must
   never proceed on authentication alone (BR-U3-0a).
```

**Never**: the admin credential is never sent to client JavaScript, never logged (the
`Authorization` header value and decoded credential both join `reportAccessToken`/`DATABASE_URL`/
`STRIPE_SECRET_KEY` on the never-logged list), never reachable via any customer-facing bearer
mechanism (`reportAccessToken`, the checkout-status cookie) — these are structurally unrelated
credential systems.

## Workflow 2: Read-Only Inspection (ADM-1/ADM-2/ADM-3/ADM-4/ADM-5)

All five inspection stories share one shape - an authenticated (Workflow 1) `GET` request that
reads through an existing domain owner's data, unmodified, with no side effects:

```
1. Operator authenticates (Workflow 1).
2. Operator supplies a lookup key appropriate to the story:
   - ADM-1: an EvidenceReportArtifact id -> getReportById (Evidence & Report Artifact, unchanged)
   - ADM-2: a RegulatoryRule id -> the rule's own record + its full supersedesRuleId/
     supersededByRuleId chain (Regulatory Rule Governance, read-only traversal)
   - ADM-3: (no key - lists all known sources, each guaranteed a row) -> DataSourceHealth's
     observedHealthState/manualOverrideState/effectiveHealthState for every known source, shown
     distinctly (BR-U3-3's corrected persisted read)
   - ADM-4: (no key, or a state=FAILED filter) -> ReportGenerationJob rows where state = FAILED,
     each with failureReasons/retryAttempts, joined to its Order via screeningRequestId for
     correlation
   - ADM-5: an order id (exact), OR a report/artifact id (exact, resolved via
     ReportGenerationJob.evidenceReportArtifactId -> its screeningRequestId -> the Order with that
     screeningRequestId), OR a normalized customer email (exact, case-insensitive, trimmed) ->
     Order(s) (BR-U3-5)
3. The response reflects the underlying domain's CURRENT state at read time - never a cached or
   duplicated copy Admin/Support Service maintains itself (Application Design's explicit
   "coordinate, don't duplicate" boundary).
4. No AdminActionLog entry is written for a read - only mutating actions (Workflow 3/4/5) are
   logged.
```

## Workflow 3: Admin-Initiated Refund (ADM-6, BR-U3-6)

```
1. Operator authenticates (Workflow 1), navigates to a specific Order (via Workflow 2/ADM-5).
2. Operator selects a refund reason - CUSTOMER_REQUEST or GOODWILL only (never
   GENERATION_FAILURE/DUPLICATE_PAYMENT, which remain exclusively system-initiated) - and supplies
   a required, non-empty free-text reason.
3. ADMIN_OPERATOR_ID is read; if absent/blank, reject the action here - nothing below runs
   (Workflow 1 step 6, corrected).
4. CORRECTED SEQUENCING (2026-08-25) - audit commits before anything money-affecting is attempted:
   an AdminActionLog entry (REFUND_INITIATED) is written and COMMITTED first, recording
   operatorId, the orderId target, and the operator's stated reason. This is a single local
   Postgres write - if it fails, the action stops here and nothing is submitted to the refund
   workflow at all.
5. Only after that commit succeeds: start(processRefundWorkflow, [orderId, reason]) - the EXACT
   same durable entry point Unit 2B's automatic refunds already use (never a direct, undurable
   order-payment.processRefund call from inside the admin route's own request/response cycle).
   This ordering guarantees an admin refund command can never appear to succeed without a durable
   audit record already existing - there is no path to a successful refund attempt that skipped
   the log.
6. If start() itself then fails or its response is lost: the operator sees an error and may retry
   (a second, honestly-duplicate AdminActionLog entry for the retry is acceptable - it records that
   the operator tried again, which is true). Independently, Unit 2B's existing Cron reconciliation
   check 3 (stale REFUND_PENDING) already recovers a lost start() response on its own, since it
   operates on Order.state alone - no Unit-3-specific recovery mechanism is needed for this case.
7. The admin UI reflects Order.state as it already exists (PAID -> REFUND_PENDING -> REFUNDED, or
   -> REFUND_FAILED) - this workflow never fabricates a "refund complete" signal itself; the
   verified Stripe webhook remains the sole source of a confirmed terminal outcome, unchanged from
   Unit 2B.
8. If the operator retries this action on an order already REFUND_PENDING (e.g. because the first
   attempt's response was lost), Unit 2B's existing corrected refund state machine
   (BR-U2B-5/decideRefundAction) resumes the same logical attempt using the same persisted
   refundIdempotencyKey - it never creates a second logical refund, regardless of how many
   AdminActionLog entries describe attempts at it.
```

## Workflow 4: Rule Disable / Re-Enable (ADM-7, BR-U3-7)

```
DISABLE:
1. Operator authenticates, selects an ACTIVE RegulatoryRule (via Workflow 2/ADM-2), supplies a
   required reason.
2. ADMIN_OPERATOR_ID is read; if absent/blank, reject here (Workflow 1 step 6, corrected).
3. lifecycle.ts's disable(rule) is called (legal only from ACTIVE; REJECTED otherwise, e.g. an
   already-DISABLED or SUPERSEDED rule).
4. CORRECTED ATOMICITY (2026-08-25): on OK, RegulatoryRule.lifecycleState persisting as DISABLED
   AND the AdminActionLog entry (RULE_DISABLED, recording operatorId/rule id/reason) commit in ONE
   database transaction. If either write fails, BOTH roll back - the rule's lifecycleState must
   never actually change while leaving no durable record of who did it and why.
5. The Regulatory Rules Engine's existing ACTIVE-only candidate filtering (unchanged) now excludes
   this rule from every subsequent evaluation - no separate "propagate the disable" step needed,
   since that filter already keys strictly on lifecycleState = ACTIVE.
6. No historical EvidenceReportArtifact that already used this rule version is altered (RGD-4).

RE-ENABLE:
7. Operator selects a DISABLED rule, supplies a required reason (e.g. "investigation found no
   defect - re-enabling"). ADMIN_OPERATOR_ID check as above.
8. lifecycle.ts's reenable(rule) is called (legal only from DISABLED). This is a lifecycle-state
   move ONLY - the operator cannot edit ruleSpecification/citation/caveats/any published content
   through this action; there is no such field in this flow at all.
9. On OK: RegulatoryRule.lifecycleState persisting as ACTIVE (same rule id, byte-for-byte unchanged
   content) AND the AdminActionLog entry (RULE_REENABLED) commit atomically, same as DISABLE above.
10. If the actual regulatory content needs correction (not merely "was this disable a mistake"),
    this workflow is NOT used - the correction goes through the complete, unmodified
    RESEARCHED -> ... -> APPROVED -> ACTIVE pipeline as a new rule version (Rule Research Assistant
    -> Regulatory Rule Governance's existing triage/verify/test/approve chain), entirely outside
    Admin/Support Service's scope.
```

## Workflow 5: Data-Source Override Set / Clear (ADM-8, BR-U3-8)

```
SET:
1. Operator authenticates, selects a source (via Workflow 2/ADM-3 - a DataSourceHealth row is
   guaranteed to exist for every known source id even if never yet queried, per
   domain-entities.md's known-source-initialization correction), supplies a healthState
   (ordinarily UNHEALTHY) and a required reason. ADMIN_OPERATOR_ID check (Workflow 1 step 6).
2. CORRECTED SHAPE (2026-08-25): DataSourceHealth.manualOverrideState is set to the supplied
   value - observedHealthState is left untouched (automated ingestion's own field, never written
   by an admin action). effectiveHealthState (= manualOverrideState ?? observedHealthState)
   becomes that value immediately.
3. CORRECTED ATOMICITY: the DataSourceHealth write AND the AdminActionLog entry
   (DATA_SOURCE_MARKED_UNHEALTHY, recording operatorId/sourceId/reason) commit in ONE database
   transaction - either both succeed or neither does.
4. The very next checkReadiness call (any customer's POST /api/checkout, any environment/process)
   consumes effectiveHealthState via isKnownUnhealthy and correctly returns NOT_READY for a
   project depending on that source (BR-U2-1, unchanged logic, now correctly fed by durable,
   correctly-separated state).

CLEAR:
5. Operator clears an existing override, supplies a required reason. ADMIN_OPERATOR_ID check.
6. DataSourceHealth.manualOverrideState is set to null. effectiveHealthState IMMEDIATELY reverts
   to the current observedHealthState (never waits for a future ingestion result - the observed
   value was already being tracked the entire time the override was active, since
   recordIngestionResult never stops writing observedHealthState just because an override exists).
7. The DataSourceHealth write AND the AdminActionLog entry (DATA_SOURCE_OVERRIDE_CLEARED,
   recording operatorId/sourceId/reason) commit atomically, same as SET above.
8. No further step is needed for the clear to take effect - unlike the original (incorrect) design,
   this workflow does not depend on a future recordIngestionResult call to make clearing an
   override actually change evaluation behavior.
```
