# Unit 3 Operations Runbook — Minimum Paid-Product Operations (Admin/Support)

## Scope of This Document

Unit 3 adds the first internal admin surface (ADM-1 through ADM-8): order lookup and
admin-initiated refund, regulatory rule disable/re-enable, data-source health override, read-only
failed-job inspection. See `aidlc-docs/operations/unit-2b-operations-runbook.md` for everything
still unchanged (Vercel/Neon/Stripe/Resend/MapTiler/Anthropic configuration, Cron reconciliation,
Workflow deployment/rollback posture) and `unit-1-operations-runbook.md`/`unit-2-operations-
runbook.md` for what's older still. This document covers only what's new. No new infrastructure is
introduced — this operates the same stack already built, per the explicit instruction governing
this stage. **One correction to a prior document's own wording**: `unit-2b-operations-runbook.md`
§12 says "no admin dashboard/UI (manual DB/script intervention remains the documented path)" — that
line is now superseded by Unit 3's actual admin UI for the specific operations it covers (§5-§9
below); that file is not edited here, since this is a documentation-only Operations pass and not
another Unit 2B correction.

**Honesty discipline, reaffirmed**: this sandbox has no real Vercel deployment, no live Neon
database, no configured `ADMIN_BASIC_AUTH_USERNAME`/`PASSWORD`/`ADMIN_OPERATOR_ID`. Every procedure
below is written to be followed by whoever actually has that access — nothing in this document
claims a live check happened when it didn't. Written tests and local deterministic evidence are
**not** live verification and are never described as such here. Items that genuinely require a
live deployment/database remain tracked as **open** in `external-verification-tracker.md` (items
12-13), not marked done in this pass.

---

## 1. Admin Deployment Configuration

### Environment Variables

| Variable | Scope | Purpose | Fail-Closed Behavior |
|---|---|---|---|
| `ADMIN_BASIC_AUTH_USERNAME` | Server secret | The Basic Auth username `proxy.ts` checks on every `/admin`/`/api/admin` request | If absent (or `ADMIN_BASIC_AUTH_PASSWORD` is absent), **every** request to the admin surface is `401` — never "no auth required" |
| `ADMIN_BASIC_AUTH_PASSWORD` | Server secret | The Basic Auth password | Same fail-closed behavior as above. **Must be high-entropy, deliberately generated** (e.g. a real password manager/generator) — never a memorable phrase. There is no in-app password-strength check; this is an operational discipline, not a code guarantee |
| `ADMIN_OPERATOR_ID` | Server config — not a credential, but not browser-exposed either | Attributes every `AdminActionLog` entry to a real operator identity (BR-U3-0a) | If absent/blank, **every mutating** admin route (`refund`, `disable`, `reenable`, override `set`/`clear`) is rejected with `401`, **independent of Basic Auth having already succeeded** — read-only `GET` routes are unaffected |

**The Basic Auth credential and the operator-attribution identity are deliberately two different
things, checked independently, for two different reasons**:
- `ADMIN_BASIC_AUTH_USERNAME`/`PASSWORD` answer *"is this request from someone who knows the admin
  credential?"* — authentication.
- `ADMIN_OPERATOR_ID` answers *"who do we durably attribute this specific mutation to in
  `AdminActionLog`?"* — attribution.

A deployment could (incorrectly) have valid Basic Auth credentials configured but a blank
`ADMIN_OPERATOR_ID` — Basic Auth would succeed, but every mutation would still fail closed with
`401`, because attribution is checked separately, inside each mutating route handler, not inside
`proxy.ts` itself. This is intentional (BR-U3-0a) — do not "fix" it by making `proxy.ts` also
require `ADMIN_OPERATOR_ID`, which would incorrectly block the read-only routes too.

### HTTPS-Only

Same posture as every credential-bearing route in this application: the admin surface must only
ever be reached over HTTPS in Production/Preview (Vercel's own platform TLS termination — no
application-level enforcement is added, matching Unit 2B's existing precedent of relying on the
platform for this). Basic Auth's own wire format sends the credential in a (base64, not encrypted)
header — HTTPS is what actually protects it in transit; do not test or use this surface over plain
HTTP against a real deployment.

### Server-Only Configuration

All three variables above are server-only — never prefix any of them with `NEXT_PUBLIC_`. Unlike
`NEXT_PUBLIC_MAPTILER_KEY` (Unit 2, deliberately public), there is no browser-visible counterpart to
any admin credential.

---

## 2. Next.js 16 `proxy.ts` / Admin Route Boundary

### Protected Scope (exact matcher, from `proxy.ts`)
```
/admin
/admin/:path*
/api/admin
/api/admin/:path*
```

**Explicitly NOT part of this gate** — every customer-facing route (`/`, `/configure`, `/checkout/
status`, `/report`), `/api/webhooks/stripe`, `/api/cron/reconcile` (its own separate `CRON_SECRET`
gate — never Basic Auth), `/api/checkout*`, `/api/reports*`, `/api/parcels*`,
`/api/screening-requests*`, `/healthz`, and every static asset. The matcher is a security-relevant
piece of configuration — if it is ever edited, re-verify (locally first, then on the actual
deployment) that no customer-facing route starts requiring admin credentials, and that no
`/api/admin/*` route is left accidentally unmatched.

### First-Deployment Verification

Perform these against the actual deployed environment once `ADMIN_BASIC_AUTH_USERNAME`/`PASSWORD`/
`ADMIN_OPERATOR_ID` are configured (this is external-verification-tracker.md item 12 — record
results there, not here):

- [ ] `curl -i https://<deployment>/admin` with no `Authorization` header → `401` with
      `WWW-Authenticate: Basic realm="admin"`
- [ ] The same request through a real browser shows the native Basic Auth prompt; entering the
      correct configured username/password succeeds and loads `/admin`
- [ ] `curl -i https://<deployment>/configure` (and `/`, `/healthz`, `/checkout/status`, a real
      `/report` link) with **no** `Authorization` header at all → succeeds normally, proving the
      matcher does not leak onto customer routes
- [ ] A malformed `Authorization` header, a wrong username, a wrong password, and both wrong all
      produce the **identical** `401` response shape (status, body, headers) — no distinguishing
      detail that would let an attacker learn which part of a guess was correct (verified
      deterministically in this sandbox via `tests/admin-auth/basic-auth.test.ts`; this item
      confirms the same behavior survives a real deployment/real Node.js runtime)
- [ ] Grep the actual Vercel Runtime Logs for the string `Authorization` after several of the
      above requests — it must not appear (this application's own logger already never logs it —
      code-level only; this step confirms the platform's own request logs don't capture it either,
      the same distinction `unit-2b-operations-runbook.md`'s token-exposure item draws)

---

## 3. CSRF Operational Verification

`resolveExpectedAdminOrigin()` (`src/shared/app-url.ts`) extends `resolveAppBaseUrl()`:
Production/Preview use `APP_BASE_URL` if explicitly set, else Vercel's auto-injected `VERCEL_URL`
(already deployment-specific — a Preview deployment gets its own correct trusted origin for free,
with no extra configuration). Development falls back to a fixed `http://localhost:3000` only when
`NODE_ENV === "development"` **and** neither `APP_BASE_URL` nor `VERCEL_URL` is set — this fallback
is structurally unreachable in Production/Preview, since Vercel always sets `VERCEL_URL` there.

### Verification Checklist (real deployment, item 12)

- [ ] A mutating request (`POST /api/admin/orders/[orderId]/refund`, or any other mutating admin
      route) submitted from the deployed admin UI itself (same-origin) succeeds
- [ ] The identical request, re-sent with a forged `Origin: https://evil-example.com` header (e.g.
      via `curl`), receives `403` — confirms the exact-match check (no substring/suffix matching)
      that `tests/admin-auth/csrf.test.ts` already proves deterministically
- [ ] On a Preview deployment specifically, confirm the mutation succeeds using *that* deployment's
      own `VERCEL_URL`-derived origin — not the Production custom domain, and not another Preview's
      origin. This is the concrete proof that `resolveExpectedAdminOrigin()` resolves correctly per
      environment, not just in Production
- [ ] Confirm `curl`-ing a mutating route from a local machine against a **Production** deployment
      (`NODE_ENV` there is never `development`) does **not** get the `localhost` carve-out — it
      must be rejected like any other cross-origin request

**Do not weaken this mechanism for operational convenience** — no CSRF token, no session cookie, no
"trusted IP" allowlist, no wildcard origin. If a legitimate admin client is being incorrectly
rejected, the fix is to confirm `APP_BASE_URL`/`VERCEL_URL` are configured correctly for that
environment, not to loosen the check itself.

---

## 4. Database Migrations

Two new, purely-additive migrations, generated but **never applied to a live database in this
sandbox** — same discipline as every prior unit:

| Migration | Adds |
|---|---|
| `0003_heavy_wallow.sql` | `admin_action_type`/`admin_target_type`/`source_health_state` enums; `admin_action_log` table (`reason` `NOT NULL` + `CHECK(length(trim(reason)) > 0)`); `data_source_health` table |
| `0004_curly_zuras.sql` | `regulatory_rules.approval_record` — a single nullable `jsonb` column |

### Migration Order and Posture
Apply `0003_heavy_wallow.sql` before `0004_curly_zuras.sql` (numeric order, standard `drizzle-kit`
convention — no cross-dependency between them, but preserve the order regardless). **Forward-only**
— no down-migration is authored, unchanged posture from every prior unit
(`unit-2-operations-runbook.md` §14). A failed production migration **must block promotion** to
that deployment, exactly like every prior unit's migrations — do not promote application code that
expects a column/table which the migration step didn't confirm exists.

### Verifying a Migration Actually Applied
```bash
npm run db:migrate   # drizzle-kit migrate, requires DATABASE_URL
```
Then confirm directly against the database (e.g. via `psql` or Neon's SQL console):
```sql
select column_name from information_schema.columns
  where table_name = 'regulatory_rules' and column_name = 'approval_record';
select table_name from information_schema.tables
  where table_name in ('admin_action_log', 'data_source_health');
```
All three should return exactly the rows named.

### `approval_record = NULL` on Older Rows
Every `regulatory_rules` row that existed before `0004_curly_zuras.sql` applied will have
`approval_record IS NULL` — this is expected, not a defect. `getRuleById`/`listRules` surface this
as `approvalRecord: undefined`, and `AdminRuleDetail` renders "Not recorded - this rule predates
the approval-provenance field." **Never fabricate or backfill an approval identity/timestamp for
these rows** — there is no reliable source to infer it from (see §11).

---

## 5. Admin Action Auditability

`AdminActionLog` records that **an operator requested/initiated a command** — it is not, and must
never be read as, proof that the command's external effect actually completed. `Order.state`/
`stripeRefundId`/`refundConfirmedAt` (refunds), `RegulatoryRule.lifecycleState` (rule transitions),
and `DataSourceHealth`'s `manualOverrideState` (overrides) remain the sole authoritative record of
actual outcomes.

### The 4 Local Mutations — Atomic
`RULE_DISABLED`, `RULE_REENABLED`, `DATA_SOURCE_MARKED_UNHEALTHY`, `DATA_SOURCE_OVERRIDE_CLEARED`:
the domain mutation and its `AdminActionLog` entry commit inside **one** database transaction
(`withAdminTransaction`) — either both persist, or neither does. There is no state where one of
these visibly changed without a corresponding audit row, or vice versa.

### `REFUND_INITIATED` — Sequenced, Not a Shared Transaction
The audit entry commits **before** `start(processRefundWorkflow, ...)` is ever called (a single
`neon-http` write, no transaction needed for one statement) — see §6 for the full sequencing and
its recovery implications.

### Diagnosing "Command Requested" vs. "Workflow Started" vs. "Stripe Confirmed"

**Corrected 2026-08-25 (Operations review)**: the table below states only what each signal proves
on its own — resist the temptation to infer more from `Order.state` than the state machine itself
guarantees. `Order.state` proves *that* the refund state machine reached a given state; it does not
by itself identify *which* Workflow invocation caused the transition, and it does not prove or
disprove whether any particular `start()` call was ever received.

| Signal | What It Proves | What It Does NOT Prove |
|---|---|---|
| An `admin_action_log` row exists with `action_type = 'REFUND_INITIATED'` | The operator command was durably recorded **before** `start()` was attempted. | Whether `start()` was subsequently called, received, or executed. |
| `Order.state = 'REFUND_PENDING'` | The refund state machine has durably reached `REFUND_PENDING`. | Which specific Workflow invocation caused the transition, or that it maps uniquely to a particular `AdminActionLog` row. |
| `Order.state = 'REFUNDED'` with `stripeRefundId`/`refundConfirmedAt` set | Stripe's own webhook confirmed the refund — the only authoritative "it actually happened" signal. | — |

If an `AdminActionLog` row exists for a `REFUND_INITIATED` action but `Order.state` is still
`PAID`, that means only: the admin command was recorded, and **no durable `PAID` → `REFUND_PENDING`
transition has yet been observed**. It does **not** conclusively prove `start()` never reached
Vercel Workflows — possible explanations include a genuine failure before submission, a success
whose execution hasn't yet reached the DB transition, a lost/ambiguous response from `start()`, or
another transient Workflow/runtime condition. **Diagnose using the admin HTTP response, the
relevant Vercel Workflow/runtime logs, and the current authoritative `Order` state together — never
infer Workflow delivery from `Order.state` alone.** See §6's recovery guidance.

---

## 6. Refund Operations

Preserves the final ADM-6 behavior exactly (`src/order-payment/admin-refund.ts`'s
`decideAdminRefundCommand`, using the existing, unmodified `decideRefundAction(order.state)` as the
sole authority):

| Order State | Operator Action | Reason Handling |
|---|---|---|
| `PAID` | Originate a **new** refund (`CUSTOMER_REQUEST` or `GOODWILL`) | Operator selects the reason; required free-text justification |
| `REFUND_PENDING` | **Resume** the existing logical refund already in flight | Reason is read from `Order.refundReason` (may legitimately already be `GENERATION_FAILURE`/`DUPLICATE_PAYMENT` — a system-originated reason the operator is resuming, never choosing); the client can never substitute a different reason; operator supplies only a new retry justification. `Order.refundIdempotencyKey` is reused as-is inside Unit 2B's unchanged `processRefund`/`processRefundWorkflow` |
| `PENDING` / `REFUNDED` / `REFUND_FAILED` / `EXPIRED` | **No refund command available** | Rejected `409` before any `AdminActionLog` write or workflow start. `REFUND_FAILED` stays manual/support-resolution only (BR-U2B-5) — never auto-reopened by this or any Unit 3 route |

### Recovery Distinction — Phrased by Authoritative State, Not Claimed Knowledge of `start()` Delivery

**Corrected 2026-08-25 (Operations review)**: the distinction below is drawn from `Order.state`
itself — the durable, authoritative signal — not from an inferred claim about whether a particular
`start()` call "landed" or "didn't land." The database does not tell us that; it only tells us
which state the refund machine has actually reached.

**If the Order is still `PAID`** after an admin refund command has errored or its outcome remains
unresolved: `REFUND_PENDING` reconciliation cannot act on it, because the DB state has not reached
`REFUND_PENDING` — that check has nothing to find regardless of what actually happened to the
`start()` call. After checking the Workflow/runtime logs and the admin HTTP response as practical
(§5), an operator may safely retry the `PAID` (new-refund) path in the table above — Unit 2B's
existing DB state/idempotency guarantees remain the correctness boundary even if multiple Workflow
executions ultimately occur (a duplicate `start()` for the same logical attempt converges on the
same persisted `refundIdempotencyKey`, never a second logical refund).

**If the Order is `REFUND_PENDING`**: Unit 2B's existing Cron reconciliation check (unchanged,
`checkout-fulfillment/reconciliation.ts`) is the designed backstop — it re-`start()`s
`processRefundWorkflow` for stale `REFUND_PENDING` orders, which correctly *resumes* (not
re-claims) using the persisted `refundIdempotencyKey`. Expect self-healing within Cron's normal
interval; if still stuck after several cycles, treat as a genuine incident (§12).

**Do not invent a third refund state or a separate Unit-3-specific retry system** — the admin UI's
"Resume Refund Submission" action (operator-initiated, Order already `REFUND_PENDING`) and Cron's
own automatic resumption (system-initiated, same state) both converge on the exact same
`processRefund`/`processRefundWorkflow` logic, unchanged from Unit 2B.

---

## 7. Emergency Rule Disable / Re-Enable

### Procedure: `ACTIVE` → `DISABLED`
1. Navigate to `/admin/rules/[ruleId]`, confirm the rule is `ACTIVE`.
2. Enter a required reason (non-empty after trim — enforced at the API boundary and by the
   database's `admin_action_log` `CHECK` constraint).
3. Submit "Disable Rule." Server sequence: read the row → the pure `lifecycle.ts` `disable()` check
   → a **conditional** `UPDATE regulatory_rules SET lifecycle_state = 'DISABLED' WHERE id = ? AND
   lifecycle_state = 'ACTIVE'` (concurrency-safe — a stale/concurrent request that already moved
   the row affects zero rows, is rejected `409`, and writes **no** audit entry for the failed
   attempt) → only if exactly one row transitioned, `AdminActionLog` (`RULE_DISABLED`) commits in
   the same transaction.
4. A disabled rule is immediately excluded from evaluation — `report-generation-orchestrator/
   pipeline.ts`'s existing `lifecycleState = 'ACTIVE'` filter requires no code change to honor this.

### Procedure: `DISABLED` → `ACTIVE`
Same conditional-transition mechanism, reversed (`WHERE lifecycle_state = 'DISABLED'`), also
requiring a reason. Re-enabling reactivates the **exact same rule version**, unchanged content — no
version substitution is structurally possible through this path.

### When NOT to Re-Enable
**If the regulatory content, applicability, threshold, citation, evidence requirements, or
interpretation must change, do not re-enable as a shortcut.** Re-enabling only reverses an
operator's own earlier toggle of the same immutable content — it is never a content-edit mechanism.
Create a new rule version through the normal governance lifecycle (`draft` → `triage` →
`sourceVerify` → `markTested` → `approve` → `activate`) instead, and let the new version supersede
the old one.

---

## 8. Data-Source Health Operations

`observedHealthState` (automated-only, written only by `recordIngestionResult`) and
`manualOverrideState` (admin-only, nullable) are two independent fields:
```
effectiveHealthState = manualOverrideState ?? observedHealthState
```
Only `effectiveHealthState` is ever consumed by `checkReadiness`/checkout eligibility —
`observedHealthState` alone never gates anything.

### Operational Facts
- **Automated retrieval keeps updating `observedHealthState` even while an override is active** — an
  override does not pause monitoring, it only governs the effective value consumed elsewhere.
- **An operator may mark a source `UNHEALTHY`** (`POST /api/admin/data-sources/[sourceId]/
  override`) — e.g. a known outage not yet automatically detected. Requires a reason.
- **Clearing an override** (`POST .../override/clear`, also requires a reason) makes
  `effectiveHealthState` immediately reflect whatever `observedHealthState` already is — no wait
  for a future ingestion result, since it was already being tracked the whole time.
- **Unit 3 intentionally has no "force HEALTHY" admin operation** — the approved `AdminActionType`
  vocabulary names only `DATA_SOURCE_MARKED_UNHEALTHY` and `DATA_SOURCE_OVERRIDE_CLEARED`;
  overriding a source to `HEALTHY` would suppress a real automated signal and was never approved as
  an action. If a source is genuinely healthy, clear the override instead — do not ask for this
  operation to be added without a fresh design decision.
- **Both currently-integrated sources (`king-county-gis`, `king-county-parcel-polygon`) are
  `ON_DEMAND`** (`src/data-source-registry/known-sources.ts`) — queried live, per request, never on
  a schedule. **No polling loop or synthetic health check exists** — `observedHealthState` only
  changes when an actual customer-facing request happens to exercise that retrieval path.

### Diagnosing Stale `UNKNOWN` / Failed Health-Record Writes
- A source stuck at `UNKNOWN` with no `lastSuccessfulRetrieval`/`lastFailureAt` means no real
  customer request has exercised that retrieval path since the row was created (or since Unit 3
  deployed) — not necessarily a defect; `ON_DEMAND` cadence means this can be legitimate during low
  traffic.
- Health recording is deliberately **best-effort**: `app/api/parcels/resolve/route.ts` and
  `report-generation-orchestrator/pipeline.ts` both wrap their `recordIngestionResult` call in
  `try/catch`, logging `DATA_SOURCE_HEALTH_RECORDING_FAILED` on failure without ever blocking or
  altering the actual customer-facing response.
- **Corrected 2026-08-25 (Operations review) — what `DATA_SOURCE_HEALTH_RECORDING_FAILED` does and
  does NOT mean**: it means only that the application failed to *persist* the observed health
  result. The write is best-effort and does not itself alter the underlying retrieval outcome — but
  because `recordIngestionResult` is used to record **both** `HEALTHY` and `UNHEALTHY` outcomes,
  this event alone does not tell you whether the underlying authoritative source request succeeded
  or failed. **Do not write or assume** "the underlying customer request likely still succeeded" —
  that is not something this event proves either way. To diagnose: inspect the original
  retrieval/request result and its surrounding logs directly (not this event) to determine whether
  the authoritative source request itself succeeded or failed; treat
  `DATA_SOURCE_HEALTH_RECORDING_FAILED` specifically as loss of the persisted health *observation*,
  nothing more. If it appears repeatedly, fix Neon/database connectivity so future observations are
  recorded — and never change or fabricate `observedHealthState` based solely on the failed
  telemetry write itself.

---

## 9. Failed Report Inspection

`GET /api/admin/failed-jobs` / `/admin/failed-jobs` shows, per `FAILED` job: `failureReasons`,
`retryAttempts`, `createdAt`/`updatedAt`, and the affected `Order` when one exists — read directly
from `job.generationAuthorization.orderId` for a `VERIFIED_PAYMENT` job (linked to `/admin/orders/
[orderId]`); an `INTERNAL_PROTOTYPE` job truthfully shows no customer order.

**Strictly read-only.** No retry/requeue action exists anywhere under this path, and none is added
during Operations. If a paid customer's job is `FAILED`, Unit 2B's existing automatic-refund path
(BR-U2B-6) already handles it — confirm via the affected Order's `refundReason: GENERATION_FAILURE`
rather than attempting to reprocess the job.

---

## 10. Admin Search / PII

**Corrected 2026-08-25 (Operations review)** — this section previously implied `orderId`/`reportId`
may never appear in a URL at all. That overstated the actual PII concern; the distinction below is
the accurate one.

### Customer Email — Never in a URL
Customer-email search is `POST /api/admin/orders/search`, body `{kind: "email", value:
"<email>"}` — **never** a query parameter or path segment. `customerEmail` must never appear in:
- a request path or query string (structurally impossible today — the search route only accepts a
  JSON body; verified by `tests/checkout-fulfillment/admin-search-route-surface.test.ts`)
- a redirect target
- this application's own logs (`src/shared/logger.ts` is never called with a search value)

### Order ID / Report ID — Not Customer-Email PII, Legitimately Appear in Canonical Routes
`orderId` and `reportId` (`EvidenceReportArtifact.id`) are opaque internal identifiers, not
customer-email PII, and **may legitimately appear** in canonical resource/detail routes:
`/admin/orders/[orderId]` and `/api/admin/reports/[reportId]/provenance`. These are read-only
detail views reached by an already-authenticated admin operator, not a customer-PII exposure —
**do not redesign either route merely to remove the ID from its URL.**

The multi-kind **search** endpoint (`POST /api/admin/orders/search`) still uses its existing
body-based `{kind, value}` contract uniformly for all three kinds (`orderId`/`email`/`reportId`),
for consistency — not because an order or report id in a URL would itself be a PII problem.

### `AdminOrderView` — the Only Shape an `Order` Ever Reaches the Browser In
`src/order-payment/admin-view.ts`'s `toAdminOrderView()` is the **only** place an `Order` is
narrowed for the admin surface. Never returned to the browser under any circumstance:
`stripeCheckoutSessionId`, `checkoutCreationIdempotencyKey`, `refundIdempotencyKey`.
`stripePaymentIntentId` **is** included (useful for Stripe dashboard support lookups).

### External-Verification Addition
Item 12 (§ below) already covers general admin-surface deployment verification; the email-search
path specifically should be included in that same real-deployment pass:
- [ ] Perform a real `POST /api/admin/orders/search` with `kind: "email"` against a deployed
      environment, then grep Vercel's Runtime Logs for the searched email address — it must not
      appear (Search Params/Request Path capture is the same platform-logging concern
      `unit-2b-operations-runbook.md`'s token-exposure item and §2 above already established; this
      is now folded into item 12's checklist rather than tracked as a separate numbered item, since
      it is the same underlying platform-log-capture question already being verified there for
      Basic Auth).

---

## 11. Regulatory Approval Provenance

`RegulatoryRule.approvalRecord?: { founderIdentity: string; approvedAt: string }` — set only by
`lifecycle.ts`'s `approve()`, which now takes `approvedAt` as an explicit parameter (deterministic,
no internal clock call).

**Four distinct facts, never inferred from one another**:
| Fact | Field | Set By |
|---|---|---|
| Source verification | `verificationHistory[].founderIdentity`/`founderVerifiedAt` | `sourceVerify()` |
| Tier-2 professional review | `verificationHistory[].escalatedProfessional` | `sourceVerify()`, when applicable |
| Founder approval | `approvalRecord.founderIdentity`/`approvedAt` | `approve()` |
| Lifecycle state | `lifecycleState` | Every lifecycle transition function |

A rule can be `ACTIVE` (lifecycle state) with a full `verificationHistory` and still have
`approvalRecord: undefined` if it predates this field. **`AdminRuleDetail` displays "Not recorded"
in that case — never a guessed identity or date, and never `updatedAt` or `verificationHistory`'s
own timestamp substituted in its place.** If an operator needs to know who approved a specific
pre-existing rule and it isn't recorded, the honest answer is that this system cannot say — that
information was never durably captured before this field existed.

---

## 12. Incident / Diagnostic Procedures

Proportional to a solo-founder prototype — direct database/dashboard inspection and a documented
manual check, not a new admin-automation platform or APM product (none introduced here, consistent
with the explicit "no new infrastructure" instruction). Uses existing Vercel/Neon/Stripe
observability only.

| Scenario | Diagnosis | Recovery |
|---|---|---|
| **Admin auth unexpectedly rejects all requests** | Confirm `ADMIN_BASIC_AUTH_USERNAME`/`ADMIN_BASIC_AUTH_PASSWORD` are both set for this environment (§1) — a missing/misconfigured pair fails closed by design, not a bug. | Set/correct both variables and redeploy; this is a configuration fix, not a code fix. |
| **Legitimate mutations receive CSRF `403`** | Confirm `APP_BASE_URL`/`VERCEL_URL` resolve to the actual origin the admin UI is being served from (§3) — a custom-domain migration or a misconfigured `APP_BASE_URL` is the likely cause. | Correct the env var for that environment; never bypass the check itself. |
| **`AdminActionLog` transaction failure (one of the 4 local mutations)** | `withAdminTransaction` failed mid-transaction — check Neon connection health/logs around the timestamp. | The transaction rolled back both the domain write and the audit entry together (§5) — nothing to reconcile; the operator simply retries the action once the underlying DB issue clears. |
| **Rule transition conflict (`409` on disable/re-enable)** | Expected behavior when a concurrent/stale request raced another operator's action (§7) — not itself an error. | Reload the rule's current state in the UI and retry the intended action if it's still applicable. |
| **`DataSourceHealth` persistence failure** | `DATA_SOURCE_HEALTH_RECORDING_FAILED` log event (§8) — check `DATABASE_URL`/Neon health. This event proves only that the health *observation* wasn't persisted, not whether the underlying retrieval succeeded or failed — inspect the original retrieval/request result directly to determine that. | Best-effort by design; no customer-facing recovery needed regardless of the underlying retrieval's outcome. Fix the DB connectivity issue so future observations are recorded — never fabricate `observedHealthState` from this event alone. |
| **Refund command outcome unresolved, Order still `PAID`** | Check the admin HTTP response and Vercel Workflow/runtime logs (§5) — `Order.state` alone does not prove whether `start()` was received. | Operator retries from `PAID` via the normal new-refund path once checked as practical (§6) — Cron cannot act on an Order that hasn't reached `REFUND_PENDING`. |
| **Stalled `REFUND_PENDING` order** | `Order.state = 'REFUND_PENDING'` not progressing (§6). | Unit 2B's existing Cron reconciliation check is the designed backstop; if still stuck after several cycles, escalate as a genuine defect — check `STRIPE_SECRET_KEY` validity and Stripe's dashboard for the specific `refundIdempotencyKey`, same as `unit-2b-operations-runbook.md` §12's own Refund-stuck row. |
| **Failed generation affecting a paid Order** | Read `failureReasons` via `/admin/failed-jobs` (§9); the affected Order is linked directly. | Unit 2B's automatic-refund path (BR-U2B-6) already handles this — confirm `refundReason: GENERATION_FAILURE` on the Order rather than attempting to reprocess the job. |

---

## 13. Rollback / Deployment

Reuses `unit-2b-operations-runbook.md` §1's existing Vercel rollback posture in full — Vercel
deployments are immutable and retained; rolling back means **promoting a previous deployment**, not
a bespoke Unit 3 procedure.

**Migrations remain forward-only** (§4). Unit 3's two new tables (`admin_action_log`,
`data_source_health`) and the nullable `regulatory_rules.approval_record` column are additive and
expected to be compatible with prior (pre-Unit-3) application code — older code simply never
queries the new tables/column, and no existing column's type or nullability changed. **This
compatibility is a design expectation, not yet independently verified against a real rollback** —
document the actual observed behavior here once it is genuinely tested (promoting a pre-Unit-3
deployment against a post-Unit-3 database), rather than assuming it. Rolling application code
backward does **not** automatically roll the database schema back — the two new tables and the new
column persist regardless of which application code version is currently promoted.

---

## External-Verification Tracker — Items 12 and 13

Both remain **OPEN**, per `external-verification-tracker.md`'s own items 12 and 13, added during
Unit 3 Code Generation:
- **Item 12**: Admin Basic Auth / CSRF live deployment behavior — now includes §2/§3's specific
  first-deployment verification checklists above, plus §10's email-search platform-log check,
  folded into the same item since it is the same underlying platform-log-capture question.
- **Item 13**: Unit 3's 4 new `DATABASE_URL`-gated integration test files, written but not executed.

**Neither is marked complete by this Operations pass** — no real credentialed deployment/database
access was available in this sandbox. If real access becomes available during a future pass, run
the checklists above and record genuine results directly in `external-verification-tracker.md`
items 12/13, not here.

---

## Explicitly N/A / Not Introduced

Consistent with the explicit Operations-stage instruction and every prior unit's same
proportionality discipline: no queue, no Redis, no additional worker host, no APM/tracing platform,
no microservice, no scheduled source-health polling, no synthetic monitor, no admin accounts/RBAC/
OAuth, no CSRF-token framework, no "force healthy" override action, no FAILED-job retry/requeue.
None of these become justified merely because Operations as a stage exists — only a concrete
requirement demonstrating a real need would justify one, and none currently do.
