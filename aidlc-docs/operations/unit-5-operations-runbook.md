# Unit 5 (Vacant Land) — Operations Runbook

**Scope of this document**: delta-only, per explicit founder instruction. Unit 5 introduced **no
new infrastructure, external service, credential, Workflow, queue, monitoring system, or
deployment target** — every existing Vercel/Neon/PostGIS/report-generation operational procedure
in `unit-2b-operations-runbook.md`/`unit-3-operations-runbook.md`/`unit-4-operations-runbook.md`
is inherited unchanged and is **not** restated here. This document covers only what changed: the
seven items below.

---

## 1. Vacant-Land Operational / Commercial State

The `VACANT_LAND` implementation exists and is complete end to end (a real
`workflowType`-discriminated `ScreeningRequest`, a real `evaluateVacantLand` evaluator, real
PostGIS buildable-envelope geometry). None of it is currently reachable by a paying customer, and
no `VACANT_LAND` row can currently be written at all. This is expected, deliberate,
founder-directed behavior — **not an outage or a defect to be "fixed" operationally**.

**Three independent gates, none of which imply each other**:

| Gate | Function | Current value | Governs |
|---|---|---|---|
| Schema capability | (no function — the EXPAND-phase columns themselves) | present once `0005_expand_vacant_land_workflow.sql` is applied | Whether the database *can represent* a `VACANT_LAND` row at all |
| Persistence-write activation | `isVacantLandPersistenceWriteEnabled()` (`screening-request/authorization.ts`) | hardcoded `false` | Whether the application is *permitted to write* a `VACANT_LAND` row (`POST /api/screening-requests` refuses with `503` while `false` — `app/api/screening-requests/route.ts`) |
| Commercial readiness | `isVacantLandScreeningCoverageReady()` (`screening-request/authorization.ts`) | hardcoded `false` | Whether `/vacant-land` publicly advertises the journey (§ below) and whether checkout is authorized (`checkVacantLandCheckoutEligibility`) |

Because persistence-write activation is `false`, `/vacant-land` — even though the persistence-write
gate is a *separate* mechanism from commercial readiness — currently exposes **no journey step at
all**: the page checks `isVacantLandScreeningCoverageReady()` only and renders a plain "not yet
available" message while it is `false`, per BR-U5-9's fail-closed requirement
(`app/vacant-land/page.tsx`). Server-side checkout is independently blocked by
`checkVacantLandCheckoutEligibility` regardless of what the public page does. No Unit 5
`RegulatoryRule` is `ACTIVE` (BR-U5-5).

**Do not flip either `isVacantLandPersistenceWriteEnabled()` or
`isVacantLandScreeningCoverageReady()` during ordinary troubleshooting.** Persistence-write
activation changes only after §2's PRE-ACTIVATION ENFORCEMENT phase is confirmed applied
(Phase 5 of the staged rollout); commercial readiness changes only after the project-level
"Regulatory Professional Review / Commercialization Gate" milestone (`aidlc-docs/aidlc-state.md`)
and explicit founder approval. Neither is ever inferred from the other, and neither is ever
inferred from `RegulatoryRule` lifecycle state.

**Verification procedure** (no live credentials needed — purely confirms current deployed
behavior):
1. Load `/vacant-land` → expect only the plain "Vacant-land screening is not yet available."
   message — no address field, no screening-intent buttons.
2. `curl https://<deployment>/api/screening-requests/available-vacant-land-coverage` → expect
   `{"available":false}`.
3. `curl -X POST https://<deployment>/api/screening-requests -d
   '{"confirmedParcelId":"<any confirmed parcel id>","workflowType":"VACANT_LAND",
   "screeningIntent":"VACANT_PARCEL"}' -H 'content-type: application/json'` → expect `503` with an
   error naming vacant-land screening as not yet available (the persistence-write gate, not the
   commercial-readiness gate, is what produces this specific response — confirms the *data-layer*
   gate independently, not just the public-page copy).
4. `curl -X POST https://<deployment>/api/checkout -d '{"screeningRequestId":"<any id>"}'
   -H 'content-type: application/json'` against a hypothetical `VACANT_LAND` request → expect a
   `409`-class rejection naming vacant-land as not yet available for purchase. **If either step 3
   or step 4 instead succeeds, that is a genuine regression — escalate, do not work around.**

## 2. Staged Database Rollout

The actual, executable sequence — **not merely documented, verified executable by
`tests/db/vacant-land-migration-staging.test.ts`**:

**A. EXPAND**
```bash
npm run db:migrate
```
Applies every migration in the normal journal-tracked chain, currently through
`0005_expand_vacant_land_workflow.sql` (nullable `project_type`/`project_details`/
`applicable_project_type` columns; new nullable `screening_intent`/`vacant_land_details`/
`applicable_workflow_type` columns). This command **does not and cannot** apply the
PRE-ACTIVATION ENFORCEMENT `CHECK` constraints — that migration was deliberately removed from
`src/db/migrations/` and its journal entry, so it is structurally outside `db:migrate`'s own
pending-migration set.

**B. Application Rollout**
Deploy the workflow-aware application build (this Unit 5 Code Generation's own output). Verify
normal `EXISTING_PROPERTY` (shed/garage) functionality remains healthy — every existing
`/configure`/`/api/screening-requests`/checkout/report-generation path is unaffected by the EXPAND
phase's additive-only schema change.

**C. PRE-ACTIVATION Enforcement**
```bash
npm run db:enforce-vacant-land
```
Runs `scripts/enforce-vacant-land-migration.ts`, which applies
`src/db/manual-migrations/pre-activation-enforcement-vacant-land.sql` explicitly: the MIGRATE-phase
backfill (`applicable_workflow_type = 'EXISTING_PROPERTY'` for every existing `regulatory_rules`
row — idempotent, a no-op if already backfilled) followed by both `CHECK` constraints
(`screening_requests_workflow_shape_valid`, `regulatory_rules_applicability_scope_valid`). **Run
this only after step B is confirmed fully deployed** (every serving application instance is
workflow-aware) — running it earlier is safe in principle (no `VACANT_LAND` row exists yet to
violate the constraint) but is not the approved sequencing. The script is idempotent-safe to
re-run — an "already exists" constraint error is logged as a warning, not treated as fatal.

**D. Verify**
Confirm both constraints exist (e.g. `\d screening_requests` / `\d regulatory_rules` in `psql`, or
an information-schema query for `screening_requests_workflow_shape_valid`/
`regulatory_rules_applicability_scope_valid`) and that the script's own final log line
("PRE-ACTIVATION ENFORCEMENT complete...") was reached without error.

**E. Persistence-Write Activation**
Only after C/D are confirmed may `isVacantLandPersistenceWriteEnabled()` ever be changed to
`true` — a code change (not a database operation), deployed as its own release.

**F. Commercial Activation**
A separate, later event (flipping `isVacantLandScreeningCoverageReady()`) — **outside Unit 5
Operations' scope entirely**, gated by the project-level commercialization milestone, never
triggered by completing A-E.

**Rollback/recovery**: Phase A (EXPAND) is purely additive (new nullable columns, relaxed `NOT
NULL`) — reversible via a standard Drizzle down-migration if ever needed, with zero data-loss risk
to existing rows. Phase C (ENFORCEMENT) adds `CHECK` constraints only — reversible via `ALTER TABLE
... DROP CONSTRAINT` if a genuine rollback is required, though this should not be necessary in
ordinary operation since no `VACANT_LAND` row can exist to violate anything at Phase E is reached
correctly. No data migration/rewrite occurs at any phase beyond the explicit, idempotent backfill
in Phase C. No new migration framework or feature-flag system was introduced for any of this — the
mechanism is exactly the two SQL files plus one explicit npm script already described.

## 3. Vacant-Land Rule Governance

An operator inspecting vacant-land-related findings/data via the existing Unit 3 admin surface
should distinguish four situations:

| Situation | What it looks like | What it means | Operator action |
|---|---|---|---|
| No `ACTIVE` vacant-land rules | `uncoveredConstraintTypes` non-empty on every vacant-land report (up to all 6: buildability, permitted use, density, height, lot coverage, setback) | **Intentional, pre-commercial state** (BR-U5-5) — no vacant-land `RegulatoryRule` has been governance-approved to `ACTIVE` yet | None. Expected for every vacant-land report today. |
| A rule unexpectedly `DISABLED` | `/admin/rules` shows a vacant-land rule in `DISABLED` state an operator did not disable | A real admin action (or a defect) — `DISABLED` only happens via the existing ADM-7 disable action, never automatically | Check `AdminActionLog` for who/why; re-enable via the existing ADM-7 action if a mistake — same procedure as any shed/garage rule. |
| `REQUIRES_VERIFICATION` from missing evidence | A finding/scenario figure with an explanation naming a specific unresolved input (e.g. lot-line roles unestablished, density-countable lot area unresolved) | **Expected, honest behavior** (§4/§5 below) | None, unless the explanation itself looks garbled. |
| An actual evaluation/computation failure | `JOB_FAILED` in logs, or `/admin/failed-jobs` shows a vacant-land job | A real pipeline/PostGIS defect | Same triage as any shed/garage job failure (§4). |

**No Tier-2 vacant-land rule (U6, U8, U13) may be activated as an operational workaround** for any
of the above. Professional regulatory review remains a later commercialization activity, deferred
to the same post-POC milestone Unit 4 established — **never an incident-response procedure**.

## 4. Spatial Failure Diagnostics

The approved three-way operational distinction, enforced by design (`logical-components.md`'s own
responsibility boundaries — the evaluator never receives a raw infrastructure failure as data):

| Category | Examples | Expected result |
|---|---|---|
| **Data quality / evidence issue** | `ST_IsValid` successfully evaluates and rejects the parcel boundary or supplied ECA geometry; `LotLineRoles.status === "INSUFFICIENT"`; no ACTIVE setback rule for a scenario is a *coverage* absence, not this category | `REQUIRES_VERIFICATION` (or `NO_ACTIVE_COVERAGE`, see below) — the report-generation job does **not** fail merely for this reason; report generation completes normally with the appropriate finding/figure classification. |
| **No `ACTIVE` rule coverage** | No `VACANT_LAND_*`-scoped rule is `ACTIVE` for a given constraint type/scenario (the real, current production state — §3) | `uncoveredConstraintTypes` disclosure / a `NO_ACTIVE_COVERAGE` scenario figure — **never** `REQUIRES_VERIFICATION`, **never** an infrastructure failure. |
| **Computation failure** | A `SpatialComputationError` thrown by `postgis-adapter.ts` (a genuine PostGIS exception, topology-execution error, DB/runtime error, or timeout) | The existing `ReportGenerationJob` failure/retry path (`JOB_FAILED`, `/admin/failed-jobs`) — **never** converted into a regulatory `Finding` of any classification. |

**Diagnosing which category occurred**: use the existing logs/diagnostics only, no new monitoring
infrastructure —
- `JOB_FAILED` (`report-generation-orchestrator/pipeline.ts`'s existing top-level `catch`) with the
  thrown error's own message names a computation failure. A `SpatialComputationError`'s message is
  prefixed with which operation failed (e.g. "PostGIS setback-constrained-area computation
  failed...") — read it directly, no separate lookup needed.
- A completed report (no `JOB_FAILED`) whose findings/scenario figures show `REQUIRES_VERIFICATION`
  with a named reason, or `NO_ACTIVE_COVERAGE`/an `uncoveredConstraintTypes` entry, is data-quality
  or no-coverage — expected, not an incident.
- `STAGE_TIMING`'s existing `RULES_ENGINE` stage entry covers the vacant-land evaluation's overall
  duration, same instrumentation as every other unit — no new stage tag was added in this pass
  (a real, disclosed scope-narrowing decision, not an oversight: the plan anticipated one but
  Code Generation's actual `runVacantLandPipeline` reuses `RULES_ENGINE` directly).

## 5. Buildable-Envelope Expected Behavior

**State explicitly, for operator awareness**: real customer requests today have
`LotLineRoles.status === "INSUFFICIENT"` by construction (this unit's UI has no role-establishment
interaction) — therefore a scenario's `setbackConstrainedArea`, and by extension its
`buildableAreaSqFt`/`buildablePolygon`, will **commonly stay unavailable**
(`REQUIRES_VERIFICATION` or gated by `footnoteExceptionStatus`, which is also always
`REQUIRES_VERIFICATION` today since no footnote-exception data source exists). **This is expected
evidence behavior, not an outage or a partial-capability bug.**

The real, role-aware PostGIS per-edge differential setback subtraction (`computeSetbackConstrainedArea`)
exists and is exercised by synthetic `ESTABLISHED`-role test fixtures
(`tests/spatial-analysis/vacant-land-postgis-adapter.test.ts`), but the actual `ST_Buffer`/
`ST_Difference` execution against a live PostGIS connection has not been verified in this
environment (external-verification-tracker.md item 15, kept OPEN — §6 below).

**Conservative fixed-5-foot approximation labeling invariant**: whenever a scenario's side setback
is governed by U9's "5 ft average, 3 ft minimum" branch, `isConservativeSideSetbackApproximation`
is `true` on that scenario's `setbackConstrainedArea`, and `app/report/page.tsx` renders the
"conservative fixed-5-foot approximation" label alongside the figure. **This label must remain
attached through the report and PDF rendering** — if a future change to `report-pdf-rendering`
drops this label while carrying the underlying number forward, that is a real regression (the
figure would silently read as precise when it is not), not a cosmetic omission.

**Do not instruct operators to infer lot-line roles manually from parcel geometry** to work around
the `INSUFFICIENT` default — front/rear/side roles are never inferred from polygon shape by design
(the same BR-U2-9 discipline this project has held since Unit 2), and there is no supported manual
override path.

## 6. External Verification

`aidlc-docs/operations/external-verification-tracker.md` items **15 and 16 remain OPEN and
non-blocking**, per the founder's own explicit instruction — neither is fabricated as passing, and
no new testing infrastructure is added solely to close either:

- **Item 15 (live PostGIS vacant-land geometry execution)**: when a suitable isolated Neon/PostGIS
  environment exists, verify the real `ST_IsValid` rejection path, the real role-aware per-edge
  setback subtraction, `ST_Intersection` (ECA exclusion), `ST_Difference` (final envelope),
  `Polygon`/`MultiPolygon`/hole round-tripping through actual PostGIS output, a genuine zero-area/
  empty result, and area/geometry consistency (`buildableAreaSqFt` actually matching
  `buildablePolygon`'s own `ST_Area`). Do not mark complete until this is actually run against a
  live connection.
- **Item 16 (vacant-land public fail-closed UI/browser behavior)**: verify in the eventual real
  browser/deployment environment that `isVacantLandScreeningCoverageReady() === false` exposes no
  address/intake/request/checkout flow on `/vacant-land` — matching what §1's verification
  procedure already confirms structurally via `curl`, but not yet confirmed via an actual rendered
  browser session. Do not add a new React component-testing framework solely to close this item —
  a future Playwright scenario (mirroring items 4/14's own deferred shed/garage scenarios) is the
  more natural fit, itself deferred alongside those.

## 7. No New Operations Surface

Explicitly confirmed, for the record: Unit 5 introduces **no new secret, no new external provider,
no new Vercel Workflow, no new cron job, no new service, no new backup/recovery system, no new
admin subsystem, and no new PII category**. Every existing Unit 2/2B/3 operational procedure
(report generation, payments, refunds, access credentials, admin auth/actions) documented in
`unit-2b-operations-runbook.md`/`unit-3-operations-runbook.md` continues to apply unchanged and
remains authoritative.
