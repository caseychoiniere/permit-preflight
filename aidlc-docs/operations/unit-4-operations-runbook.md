# Unit 4 (Detached Garages) — Operations Runbook

**Scope of this document**: delta-only, per explicit founder instruction. Unit 4 introduced **no
new infrastructure, external service, credential, Workflow, database migration, background
process, or admin subsystem** — every existing Vercel/Neon/PostGIS/report-generation operational
procedure in `unit-2b-operations-runbook.md`/`unit-3-operations-runbook.md` is inherited unchanged
and is **not** restated here. This document covers only what changed: the six items below.

---

## 1. Garage Commercial-Readiness State

`GARAGE` is fully supported internally — a `ScreeningRequest` may be created, validated, and
evaluated end-to-end (`SUPPORTED_PROJECT_TYPES`, `screening-request/types.ts`). It is **not**
currently offered to a paying customer. This is expected, deliberate, founder-directed behavior —
**not an outage or a defect to be "fixed" operationally**.

**The invariant, in two independent layers**:
- `isGarageScreeningCoverageReady()` (`screening-request/authorization.ts`) is hardcoded `false`
  today, and is expected to stay `false` for the entire Units 4-11 POC-build phase.
- Layer 1 — **public advertisement**: `GET /api/screening-requests/available-project-types`
  advertises `["shed"]` only while the gate is `false` (§4 below).
- Layer 2 — **checkout**: `checkGarageCheckoutEligibility` (`screening-request/authorization.ts`),
  consulted by `checkout-fulfillment/index.ts`'s `initiateCheckout`, independently rejects any
  `GARAGE` order with `{ ready: false, reason: "Detached garage screening is not yet available for
  purchase..." }` — this stays authoritative even if a caller bypasses layer 1 entirely (e.g. calls
  `POST /api/screening-requests`/`POST /api/checkout` directly).
- Internal/prototype evaluation (the `authorizeReportGeneration`/`INTERNAL_PROTOTYPE` path,
  server-only CLI, never a public route) is **not** gated by either layer — it may exercise
  `GARAGE` freely, matching the same "build the capability, then gate the sale" sequencing this
  project already used for shed evaluation (Unit 1) preceding shed checkout (Unit 2B).

**Do not flip `isGarageScreeningCoverageReady()` during normal operations.** It changes only after
the project-level "Regulatory Professional Review / Commercialization Gate" milestone
(`aidlc-docs/aidlc-state.md`) and explicit founder approval — never as an operational workaround,
never inferred from `RegulatoryRule` lifecycle state alone (even every Tier-1 garage candidate
reaching `ACTIVE` would still leave every genuinely Tier-2 setback/height candidate unreviewed).

**Verification procedure** (no live credentials needed — purely confirms current deployed
behavior):
1. `curl https://<deployment>/api/screening-requests/available-project-types` → expect
   `{"availableProjectTypes":["shed"]}` (no `"garage"`).
2. Load `/configure`, walk through address confirmation → TYPE step → expect only "Screen a shed /
   accessory structure" to render, not "Screen a detached garage."
3. `curl -X POST https://<deployment>/api/screening-requests -d '{"confirmedParcelId":"<any
   confirmed parcel id>","projectType":"garage"}' -H 'content-type: application/json'` → expect
   `201` (intake succeeds — this is expected, not a leak of the gate).
4. `curl -X POST https://<deployment>/api/checkout -d '{"screeningRequestId":"<the id from step
   3, after its project-details are completed>"}' -H 'content-type: application/json'` → expect
   `409` with an `error` naming garage screening as not yet available for purchase. **If this
   instead returns a `checkoutUrl`, that is a genuine regression — escalate, do not work around.**

## 2. Garage Rule Governance

An operator inspecting garage-related findings/data via the existing Unit 3 admin surface
(`/admin/rules`, `/admin/failed-jobs`) should distinguish four situations that can look superficially
similar but mean very different things:

| Situation | What it looks like | What it means | Operator action |
|---|---|---|---|
| No `ACTIVE` garage rules | `NoActiveRuleCoverageNotice`-equivalent evidence entry (`uncovered-constraint-types`) present on every garage report, for all 3 constraint types | **Intentional, pre-commercial state** — no garage `RegulatoryRule` has been governance-approved to `ACTIVE` yet (BR-U4-4). Professional review is deferred to the post-POC commercialization gate. | None. This is expected for every garage report today. |
| A rule unexpectedly `DISABLED` | `/admin/rules` shows a garage rule in `DISABLED` state that an operator did not disable | A real admin action was taken (or a defect) — `DISABLED` only happens via the existing Unit 3 admin disable action (ADM-7), never automatically | Check `AdminActionLog` (`/admin/rules/[ruleId]`) for who disabled it and why; re-enable via the existing ADM-7 re-enable action if it was a mistake — same procedure as any shed rule. |
| `REQUIRES_VERIFICATION` from missing evidence | A garage finding with an explanation naming a specific unresolved input (e.g. "the existing-structures countable footprint was not supplied," "the SMC-applicable countable lot area could not be established") | **Expected, honest behavior** (§3 below) — not a defect | None, unless the explanation itself looks wrong/garbled (§3's diagnostics). |
| An actual evaluation/report failure | `JOB_FAILED` in logs, or `/admin/failed-jobs` shows a garage job | A real pipeline defect (e.g. a thrown error, a database failure) | Same triage as any shed job failure — inspect the failure reason in `/admin/failed-jobs`, check `JOB_FAILED` log detail. Nothing garage-specific changes this procedure. |

**No Tier-2 garage rule may be activated as an operational workaround** for any of the above — the
existing regulatory-rule governance/admin mechanisms (BR-6/BR-7, Unit 3's disable/re-enable
tooling) remain fully authoritative and unchanged by Unit 4.

## 3. Lot-Coverage Diagnostics

**Expected current behavior, not a failure mode**: garage lot-coverage findings (`LOT_COVERAGE`
ruleType, once/if any such rule is ever `ACTIVE`) are expected to **commonly produce
`REQUIRES_VERIFICATION`**, for any combination of these real, currently-unresolved reasons:
- The existing-structures countable area is `USER_SUPPLIED` and unverified by design (BR-U4-3) —
  never upgraded to `KNOWN` regardless of value.
- The SMC-countable lot-area denominator (`countableLotAreaSqFt`) is generally unresolved — no
  production critical-area (ECA) area-of-overlap capability exists (BR-U4-7).
- The frequent-transit-area 60% provision (L5)'s applicability is generally unresolved — no
  transit-frequency data source is integrated.

**This is not itself an operational failure.** An operator seeing a garage lot-coverage finding
that reads `REQUIRES_VERIFICATION` with one of the explanations above is looking at correct,
intended behavior — do not treat it as something to investigate or escalate.

**For genuine failures** (as opposed to an honest `REQUIRES_VERIFICATION`), the existing
diagnostic surfaces this project already has, unchanged by Unit 4:
- **Parcel-boundary retrieval**: `DATA_SOURCE_HEALTH_RECORDING_FAILED` (warn-level,
  `report-generation-orchestrator/pipeline.ts`) — the health-*recording* write failed; per Unit 3's
  own operations runbook, this does **not** by itself indicate the underlying King County
  parcel-polygon retrieval failed or succeeded. Check `STAGE_TIMING`
  (`PROPERTY_INTELLIGENCE` stage) and the job's own outcome for the actual retrieval result.
- **`computeParcelAreaSqFt`** (new in Unit 4, `spatial-analysis/postgis-adapter.ts`): fails closed
  (throws) on a missing/wrong SRID, same discipline as every other function in that file. A thrown
  error here propagates up through the pipeline's existing top-level `try`/`catch` and surfaces as
  `JOB_FAILED` with the thrown error's message — the same failure path a `computeSetbackDistances`
  error already takes. **Disclosed limitation**: unlike `computeSetbackDistances`,
  `computeParcelAreaSqFt`'s own call is not currently wrapped in a `withStageTiming` block, so it
  does not get its own `STAGE_TIMING` entry — its cost is folded into whatever surrounds it in the
  pipeline's overall wall time. Not a defect, just a real gap in per-call timing granularity, noted
  here rather than silently assumed covered.
- **Report-generation pipeline failures generally**: `JOB_COMPLETE`/`JOB_FAILED`
  (`report-generation-orchestrator/pipeline.ts`), `/admin/failed-jobs` — unchanged by Unit 4, same
  triage procedure as any shed job.

**No new monitoring infrastructure is introduced or required.**

## 4. `GET /api/screening-requests/available-project-types`

New in Unit 4 (`app/api/screening-requests/available-project-types/route.ts`). A tiny,
single-purpose, unauthenticated GET endpoint — no request body, `Cache-Control: no-store`.

**Response shape**: `{ "availableProjectTypes": string[] }`.

**Expected current response**: `{"availableProjectTypes":["shed"]}` — `"garage"` is included only
when `isGarageScreeningCoverageReady()` returns `true` (§1). This is computed fresh on every
request (no caching layer to invalidate).

**Client fail-closed behavior**: `app/configure/page.tsx` defaults its local state to `["shed"]`
before this fetch resolves, and on a fetch failure (network error, non-2xx, malformed body) simply
leaves that shed-only default in place — it never assumes `"garage"` is available. There is
nothing for an operator to alert on here beyond the existing general "is the app responding at
all" health check (`/healthz`, unchanged) — **no special new alerting system is required** for this
route specifically.

## 5. External Verification

`aidlc-docs/operations/external-verification-tracker.md` item 14 (the garage full-path Playwright
browser scenario) **remains OPEN and is explicitly non-blocking for Unit 4 completion**, per the
founder's own decision:
- Do **not** write or fabricate a passing browser scenario merely to close this item.
- Defer writing/executing it until the real `DATABASE_URL` + a deployed/live map-and-parcel-
  resolution environment actually exists (the same environment item 4's own shed scenario already
  needs — not a new class of blocker).
- When that environment exists, the scenario to run is: configure a garage → map placement →
  identify lot-line roles → reach summary → attempt checkout → confirm the honest
  garage-readiness rejection message renders (not a fabricated success).
- Do not mark item 14 complete until it has actually been run.

`computeParcelAreaSqFt` is **added to the existing live PostGIS/spatial verification checklist**
(item 3, "Unit 2 CRS Transform / Setback Computation Live Verification," in
`external-verification-tracker.md`) rather than tracked as a new standalone item — the same
underlying blocker (a live Neon/PostGIS connection) and the same class of check
(`ST_*` function correctness against a real database) as the setback/transform functions already
listed there. This is housekeeping only and does not block Unit 4.

## 6. No New Operations Surface

Explicitly confirmed, for the record: Unit 4 introduces **no new secrets, no new deployment
component, no new database migration, no new Workflow/Cron job, no new external provider/service,
no new backup/recovery procedure, and no new PII-handling procedure**. Every existing
Vercel/Neon/PostGIS/report-generation operational procedure documented in
`unit-2b-operations-runbook.md` and `unit-3-operations-runbook.md` continues to apply unchanged.
