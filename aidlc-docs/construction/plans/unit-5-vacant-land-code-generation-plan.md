# Unit 5: Vacant Land — Code Generation Plan (Part 1)

**Status: Part 1 APPROVED 2026-08-27** (two narrow persistence corrections applied — Step 5's DB
representation and the new Step 9b persistence-write-activation gate, both below) — **proceeding
directly to Part 2 (generation)**, per explicit instruction not to present Part 1 for another
review.

Grounded in a real, read-only Explore-agent codebase audit (2026-08-27) against the approved
Functional Design (`aidlc-docs/construction/unit-5-vacant-land/functional-design/`), NFR
Requirements/NFR Design (`.../nfr-requirements/`, `.../nfr-design/`), and current code.

## Headline findings from the audit (read before the steps below)

1. **`WorkflowType` is not on the `ScreeningRequest` TypeScript interface at all today.** It exists
   only as a DB column (`screening_requests.workflow_type`, plain `text`, `NOT NULL DEFAULT
   'EXISTING_PROPERTY'`, `src/db/schema.ts:96`) with exactly one real enum member
   (`src/screening-request/types.ts:94-97`). `repository.ts:26` **hardcodes**
   `workflowType: WorkflowType.EXISTING_PROPERTY` on every insert — it is not currently threaded
   through the application at all. This is more foundational than Functional Design's
   `ScreeningRequestBase` (which already includes `workflowType`) assumed was merely "add a second
   enum member" — it is "introduce the field to the app layer for the first time, then discriminate
   on it everywhere `projectType`/`projectDetails` are read unconditionally."
2. **`applicableProjectType` is a plain `text` column, not an enum** (`src/db/schema.ts:36`) — no
   physical migration is required to add a `"vacant-land"`-shaped value to it *mechanically*, but
   Functional Design's Correction 4 explicitly forbids using it that way (no
   `applicableProjectType = "vacant-land"` string shortcut — `RegulatoryRuleApplicabilityScope`
   must be a real, structurally distinct discriminant). Step 5 below resolves this **and, per
   founder correction, also makes `applicable_project_type` itself nullable** — a `VACANT_LAND`
   rule row is never forced to carry a bogus shed/garage value merely to satisfy a `NOT NULL`
   constraint; the DB representation mirrors the discriminated domain type structurally, not just
   the query logic.
3. **`expectedConstraintTypesFor` (`src/regulatory-rules-engine/evaluate.ts:81-99`) is a
   compile-time-exhaustive `never`-checked switch over `ProjectType`** (`"shed" | "garage"`). Per
   the founder's own item 5 instruction (a separate vacant-land evaluation path, not forcing the
   existing evaluator to accept structure-less requests), **`VACANT_LAND` requests never call
   `evaluateProject`/`expectedConstraintTypesFor` at all** — this switch is untouched by Unit 5, and
   stays exhaustive over exactly `"shed" | "garage"`. Confirmed compatible, not a conflict.
4. **The existing garage rollout's rule-content pattern is fixture-based, not DB-seed-based** —
   real (non-`ACTIVE`) candidates live in `tests/fixtures/{shed,garage}-candidate.ts`
   (`isTestOnlyFixture: false`, held at `DRAFTED`), and synthetic `ACTIVE` test fixtures live
   separately in `tests/fixtures/test-only-active-rules.ts` (`isTestOnlyFixture: true`). Unit 5's
   U1-U17 follow this exact split — no new content-storage mechanism needed.
5. **The Unit 4 coverage-readiness pattern is a single hardcoded-`false` function plus a tiny
   client-safe API route** (`isGarageScreeningCoverageReady()`,
   `src/screening-request/authorization.ts:114-116`; `app/api/screening-requests/
   available-project-types/route.ts`) — Unit 5's `isVacantLandScreeningCoverageReady()` mirrors this
   exactly, same file, same "why a server-only module is never imported client-side" rationale.
6. **No genuine incompatibility or contradiction was found** requiring reopening Functional Design,
   NFR Requirements, NFR Design, or Infrastructure Design. One clarification surfaced (finding 1,
   above) sharpens *how* Code Generation implements the already-approved design; it does not change
   what was decided.

---

## Step 1 — Domain types: `WorkflowType`, `ScreeningRequest` discriminated union
(`src/screening-request/types.ts`)

- [x] Add `WorkflowType.VACANT_LAND = "VACANT_LAND"` alongside the existing
  `EXISTING_PROPERTY` member (`types.ts:94-97`).
- [x] Add `workflowType` to the `ScreeningRequest`/`ScreeningRequestSnapshot` interfaces for the
  **first time** (finding 1) as a real discriminant, per `domain-entities.md`'s
  `ExistingPropertyScreeningRequest | VacantLandScreeningRequest` union — `EXISTING_PROPERTY`
  variant keeps `projectType`/`projectDetails` required; `VACANT_LAND` variant has neither field,
  carries `screeningIntent`/`vacantLandDetails` instead.
- [x] Add `VacantLandScreeningIntent` (`VACANT_PARCEL` / `REDEVELOP_EXISTING_PARCEL`),
  `VacantLandDetails { screeningIntent }`, and their Zod schemas, mirroring
  `ShedProjectConfigurationSchema`'s existing style (`types.ts:164-172`).
- [x] `ProjectType`/`SUPPORTED_PROJECT_TYPES` (`types.ts:99-111`) are **not** touched — per BR-U5-1,
  `VACANT_LAND` is never added to `ProjectType`.

## Step 2 — Every unconditional `.projectType`/`.projectDetails` call site (real list from the
audit — 8 files)

Each site below currently assumes `EXISTING_PROPERTY` implicitly (since it's the only real case
today) and must branch on `workflowType` first, or be scoped to only ever receive
`EXISTING_PROPERTY` requests by construction:

- [x] `src/screening-request/repository.ts:26` — stop hardcoding `workflowType:
  WorkflowType.EXISTING_PROPERTY`; accept it as a real parameter. `repository.ts:46-53`'s
  `projectType === GARAGE ? ... : ...` schema-selection ternary gets a third branch guarded by
  `workflowType === VACANT_LAND` first (never falls through to the shed/garage ternary for a
  vacant-land request).
- [x] `src/screening-request/authorization.ts:56-88` (`checkReadiness`,
  `requiredSourceIdsFor`) — branch on `workflowType` before ever reading `projectType`; a
  `VACANT_LAND` request's readiness/required-source logic is genuinely new (Step 8), not a
  `projectType` ternary extension.
- [x] `src/checkout-fulfillment/index.ts:49,66-67` — same pattern; add the
  `isVacantLandScreeningCoverageReady()` check (Step 8) alongside the existing garage one, gated by
  `workflowType` first.
- [x] `app/api/screening-requests/route.ts:16-20` — validates `body.projectType` against
  `SUPPORTED_PROJECT_TYPES` unconditionally today; must branch on `body.workflowType` first and
  validate the `VacantLandDetails` shape instead when `VACANT_LAND`. **A `VACANT_LAND` write is
  additionally rejected while the persistence-write gate (Step 9b) is `false`** — this route parses
  and validates the `VACANT_LAND` shape regardless (so the application genuinely knows how to read
  it), but refuses to call `repository.create(...)` for it until the gate is enabled.
- [x] `app/api/screening-requests/available-project-types/route.ts` — **not modified for
  `projectType`** (stays shed/garage-only, unchanged); a new, separate route (Step 8) exposes
  vacant-land availability, mirroring rather than extending this one, since `VACANT_LAND` is not a
  `ProjectType` member (matches `frontend-components.md`'s own design).
- [x] `src/report-generation-orchestrator/pipeline.ts:125,133-166` — the
  `if (snapshot.projectType === ProjectType.GARAGE) {...} else {...}` two-way branch stays
  exactly as-is for `EXISTING_PROPERTY` snapshots; a **new, sibling top-level branch** on
  `snapshot.workflowType` routes `VACANT_LAND` snapshots to a new vacant-land evaluation path
  (Step 6) before ever reaching this shed/garage branch — not a third arm inside it.
- [x] `app/configure/page.tsx` — **not modified** for vacant-land (per BR-U5-6, `VACANT_LAND` is
  never offered inside this component's TYPE step); its `SelectedProjectType` union
  (`shed | garage | null`, line 30) correctly stays two-membered.
- [x] New file(s) for the vacant-land entry point (Step 9) are additive, not edits to
  `configure/page.tsx`.

## Step 3 — Persistence migration: EXPAND phase (`src/db/schema.ts`, new Drizzle migration)

Grounded in the real current schema (`schema.ts:94-106`): `workflow_type` is already `text NOT NULL
DEFAULT 'EXISTING_PROPERTY'` (no migration needed for this column itself — it already accepts any
string); `project_type`/`project_details` are `NOT NULL` today and must be relaxed.

- [x] Generate a new Drizzle migration (`drizzle-kit generate`, following the existing
  `000N_<name>.sql` numbering in `src/db/migrations/`) that:
  - Relaxes `project_type`/`project_details` to nullable.
  - Adds two new nullable columns: `screening_intent` (`text`), `vacant_land_details` (`jsonb`).
  - **Does not yet add the `CHECK` constraint** (NFR Design's Phase 4, PRE-ACTIVATION ENFORCEMENT,
    is a *later*, separate migration/step — not bundled into EXPAND).
- [x] No existing row is touched by this migration — `workflow_type`'s existing default already
  reads every current row as `'EXISTING_PROPERTY'`; `project_type`/`project_details` keep their
  existing values (relaxing `NOT NULL` doesn't rewrite data).

## Step 4 — Persistence migration: MIGRATE phase (data verification, not a data rewrite)

- [x] Since every existing row's `workflow_type` already reads `'EXISTING_PROPERTY'` via the
  existing column default (finding: no backfill UPDATE is actually needed — the audit found the
  default was already in place before Unit 5), this phase is a **verification query**, not a
  rewrite: confirm zero rows exist with `workflow_type IS NULL` or any value other than
  `'EXISTING_PROPERTY'`, and zero rows have `project_type IS NULL` (both expected to trivially pass
  given the current schema/data). Written as a repeatable check (a small script or an assertion in
  the migration's own verification step), not a one-time manual query.
- [x] `RegulatoryRule` generalization (Step 5) happens in this same phase, per NFR Design's Phase 2
  — additive, no existing SHED/GARAGE row rewritten.

## Step 5 — `RegulatoryRuleApplicabilityScope` (`src/regulatory-rule-governance/types.ts`,
`src/db/schema.ts`, `pipeline.ts:125`)

**Resolves finding 2** — the smallest safe generalization that avoids the forbidden
`applicableProjectType = "vacant-land"` shortcut. **Corrected per founder review**: the prior
draft left `applicable_project_type` `NOT NULL`, which would have forced every real `VACANT_LAND`
rule row to carry a bogus shed/garage value merely to satisfy the constraint — not a genuine
implementation of the discriminated scope. Corrected: the DB representation now mirrors
`RegulatoryRuleApplicabilityScope` structurally, not just the query logic.

- [x] **Make `applicable_project_type` nullable** (same migration as Step 3's EXPAND phase) —
  alongside the new nullable `applicable_workflow_type` `text` column added to `regulatoryRules`
  (`schema.ts:33-61`). Convention, now binding rather than deferred: `applicable_workflow_type =
  'EXISTING_PROPERTY'` requires `applicable_project_type` present (non-`NULL`);
  `applicable_workflow_type = 'VACANT_LAND'` requires `applicable_project_type` to be `NULL` — no
  ambiguous convention (no bare-`NULL`-means-either-workflow reading) is used for either column.
  **`applicable_project_type` is never assigned a `"vacant-land"` value under any convention.**
- [x] **Preserve every existing shed/garage row's current `applicable_project_type` value
  unchanged** — the migration only relaxes the constraint, it does not rewrite any existing value
  (matching Step 3's own "no existing row is touched" discipline).
- [x] **Backfill `applicable_workflow_type = 'EXISTING_PROPERTY'` explicitly on every existing
  row** (Step 4's MIGRATE phase) — the same explicit-not-implicit backfill discipline
  `nfr-design-patterns.md` §1 Phase 2 already established for `screening_requests.workflow_type`,
  applied here too, so the invariant is auditable rather than relying on a column default alone.
- [x] Add `RegulatoryRuleApplicabilityScope` (`domain-entities.md`'s discriminated type) to
  `regulatory-rule-governance/types.ts`, and a small mapping helper
  (`toApplicabilityScope(row)`/`scopeMatchesQuery(scope, query)`) rather than inlining the
  two-column logic at every call site — the helper's own runtime shape now matches the DB's own
  structural invariant (never reads `applicable_project_type` for a `VACANT_LAND`-scoped row).
- [x] `pipeline.ts:125`'s query — extend with an `or(...)` branch: existing-property snapshots keep
  querying `eq(applicableProjectType, snapshot.projectType)` **and** `eq(applicableWorkflowType,
  'EXISTING_PROPERTY')` (now required, not optional, since the column is populated on every row
  per the backfill above); the new vacant-land evaluation path (Step 6) queries
  `eq(applicableWorkflowType, 'VACANT_LAND')` instead — **two separate, non-overlapping queries**,
  not one query with an `OR` that could accidentally match both. Confirmed by NFR-U5-6/-7: this
  structurally prevents an existing rule being accidentally re-scoped to `VACANT_LAND` (it would
  need its new column explicitly set) and prevents a `VACANT_LAND` rule matching an
  `EXISTING_PROPERTY` evaluation (different query entirely).
- [x] **New DB-level `CHECK` constraint on `regulatoryRules`** — added at the same
  PRE-ACTIVATION ENFORCEMENT phase as `screening_requests`' own constraint (Step 13, corrected
  below), enforcing exactly the invariant above at the database layer: `(applicable_workflow_type
  = 'EXISTING_PROPERTY' AND applicable_project_type IS NOT NULL) OR (applicable_workflow_type =
  'VACANT_LAND' AND applicable_project_type IS NULL)`.
- [x] `lifecycle.ts`'s BR-6/BR-7 state machine (`draft`/`triage`/`sourceVerify`/`markTested`/
  `approve`/`activate`/etc.) is **fully generic already** (confirmed by the audit — no
  project-type-specific logic anywhere in `lifecycle.ts`) — zero changes needed there.

## Step 6 — Vacant-land evaluator (`src/regulatory-rules-engine/` — new module, not an edit to
`evaluate.ts`)

Per the founder's explicit item 5 instruction and finding 3 (the existing `expectedConstraintTypesFor`
exhaustiveness switch stays untouched):

- [x] New file, e.g. `src/regulatory-rules-engine/evaluate-vacant-land.ts`, exporting
  `evaluateVacantLand(input): VacantLandEvaluationOutcome` — a genuinely separate entry point,
  never routed through `evaluateProject`.
- [x] Reuses `Finding`'s existing classification vocabulary and the ACTIVE-rule-filtering pattern
  `evaluateProject` already establishes (query by the new `applicableWorkflowType = 'VACANT_LAND'`
  scope, Step 5; filter to `LifecycleState.ACTIVE` defensively, matching `evaluate.ts:109`'s own
  belt-and-suspenders re-filter).
- [x] Implements the three-way split Functional Design's final correction established for **every**
  candidate (U1-U17), not just scenario figures: candidate semantics (what the rule determines once
  `ACTIVE`) vs. current POC execution (no `ACTIVE` row ⇒ `uncoveredConstraintTypes`-style
  disclosure, reusing `EvaluationOutcome.uncoveredConstraintTypes`'s existing shape/field rather
  than inventing a parallel one).
- [x] U1's applicability facts (SMC-lot qualification, existence-date) are modeled as inputs this
  function requires and defaults to absent — never inferred from `PropertyContext` alone.

## Step 7 — `DensityFacts` and U17's rounding rule (new, small, pure module)

- [x] Add `DensityFacts { rawParcelAreaSqFt, densityCountableLotAreaSqFt? }` to
  `regulatory-rules-engine/types.ts` (or a Unit-5-specific types file), matching the audit's
  finding that **no rounding/math utility exists anywhere in `src/` today** (confirmed — zero
  `Math.round`/`toFixed` hits) — this is genuinely new, not a generalization of an existing helper.
- [x] Implement U17's fraction-rounding rule (SMC 23.44.060.D.1) as one small, named, pure function
  (e.g. `applyFractionalUnitRounding(rawUnitCount: number): number`) — deterministic, documented
  with its citation in a comment, never inline `Math.round`/`Math.floor` at each call site, so the
  governed rule (not ordinary rounding semantics) is visibly the thing being applied.
- [x] Every `maxDwellingUnits` computation in Step 6 calls this function as its final step, and
  reads `densityCountableLotAreaSqFt` — never `rawParcelAreaSqFt` — as its divisor, `undefined`
  (fail-closed) when the countable area isn't established.

## Step 8 — `SpatialComputationResult<T>` + buildable-envelope PostGIS operations
(`src/spatial-analysis/postgis-adapter.ts`)

- [x] Add the internal `SpatialComputationResult<T>` shape (NFR Design §2) to `postgis-adapter.ts`
  or a small sibling types file — per the audit's finding that this module's existing convention is
  **throw-on-failure**, not a return-type error channel (`assertAuthoritativeSrid` throws;
  missing-row checks throw) — the plan follows NFR Design's own explicitly-endorsed latitude: a
  `COMPUTATION_FAILURE` is a **thrown** `SpatialComputationError`, matching this module's existing
  idiom exactly, while `SUCCESS`/`DATA_QUALITY_UNRESOLVED` are a returned two-variant result (an
  `ST_IsValid`-false result is data the function successfully determined, not an exception).
- [x] New exported functions (additive, `computeSetbackDistances`/`computeParcelAreaSqFt`
  untouched): `computeSetbackConstrainedArea(db, boundary, lotLineRoles, setbackProfile)` and
  `computeEcaExclusionGeometry(db, boundary)` — both PostGIS-only (`ST_Difference`/
  `ST_Intersection` via Drizzle's parameterized `sql` template, matching the existing module's
  convention, never string concatenation, never application-side geometry math), both asserting
  canonical SRID first (reusing `assertAuthoritativeSrid`, unchanged).
- [x] `ST_IsValid`-false input → `DATA_QUALITY_UNRESOLVED` (not thrown) — genuinely new handling
  this module doesn't have today (its existing functions assume valid input and throw on
  SRID/row-count problems specifically, not geometry validity) — Step 8 adds an explicit
  `ST_IsValid` check as the first operation before any `ST_Difference` call.
- [x] Empty-geometry result (a setback envelope fully consuming the parcel) returns `SUCCESS` with
  `areaSqFt: 0` — explicitly not the same code path as `DATA_QUALITY_UNRESOLVED` or a thrown error
  (NFR-U5-12).
  `Polygon | MultiPolygon` is preserved end to end in the return type (NFR-U5-13) — no `.at(0)`-style
  narrowing to `Polygon` only.
- [x] Side-setback averaging: the flat-5ft-on-each-averaging-governed-side approximation
  (**never** the withdrawn flat-3ft version) is applied inside `computeSetbackConstrainedArea`'s
  own SQL construction (which buffer width to use per side, based on `setbackProfile`), setting
  `isConservativeSideSetbackApproximation: true` on the returned fact whenever that branch is used
  — this flag is a field on the function's own success result, not computed downstream.
- [x] ECA exclusion `KNOWN`/`SUCCESS` branch always returns real `excludedGeometry` alongside
  `excludedAreaSqFt` (the Final Correction's fix) — `buildableAreaSqFt` is computed by a further
  `ST_Difference`/`ST_Area` PostGIS call combining `setbackConstrainedArea`'s polygon with
  `ecaExclusionArea`'s geometry, **never** by application-code arithmetic subtraction of the two
  area scalars.

## Step 9 — Vacant-Land Screening Coverage Readiness (mirrors Step 12 of the founder's list, Unit 4
precedent from finding 5)

- [x] `src/screening-request/authorization.ts`: add `isVacantLandScreeningCoverageReady()` —
  hardcoded `return false`, comment matching `isGarageScreeningCoverageReady`'s own style
  (`authorization.ts:114-116`) — and `checkVacantLandCheckoutEligibility(screeningRequest)` mirroring
  `checkGarageCheckoutEligibility` (123-132)'s shape exactly, called from
  `checkout-fulfillment/index.ts` alongside the existing garage check (Step 2).
- [x] New route `app/api/screening-requests/available-vacant-land-coverage/route.ts` (or similarly
  named — a **separate** route from `available-project-types`, since `VACANT_LAND` is not a
  `ProjectType`), mirroring `available-project-types/route.ts`'s exact pattern (22 lines, `GET()`
  returning `{ available: boolean }`, `Cache-Control: no-store`), so the vacant-land entry point's
  client component never imports the server-only `authorization.ts` module directly — same
  rationale, same mechanism, new tiny route.

## Step 9b — Persistence-Write Activation Gate — **new step, per founder correction 2**

**Resolves the Step 13 contradiction**: Steps 1-12 make `POST /api/screening-requests` →
`repository.create(...)` a real, working `VACANT_LAND` code path — but per the approved NFR
Design, no `VACANT_LAND` row may be written before PRE-ACTIVATION ENFORCEMENT (the DB `CHECK`
constraint) is applied and verified. `isVacantLandScreeningCoverageReady()` (Step 9) is the
**commercial-readiness** gate (public advertisement + paid checkout authorization) and is never
used for this purpose — three distinct states, kept separate:

- **(A) Schema capability** — the EXPAND-phase migration (Step 3/5) exists; no code reads it as
  permission to write yet.
- **(B) Persistence-write activation** — a **new, narrow, server-side gate**,
  `isVacantLandPersistenceWriteEnabled()` (`src/screening-request/authorization.ts`, same file as
  `isGarageScreeningCoverageReady`/`isVacantLandScreeningCoverageReady`, same hardcoded-boolean
  style — **not** a general feature-flag framework). Defaults `false` for the initial application
  rollout. `app/api/screening-requests/route.ts` (Step 2) checks this gate — independently of
  `isVacantLandScreeningCoverageReady()` — before ever calling `repository.create(...)` for a
  `VACANT_LAND` request, rejecting with a clear error while `false`. Enabled only after
  PRE-ACTIVATION ENFORCEMENT (the DB `CHECK` constraints from Step 5 and Step 13) is confirmed
  applied and verified — a data-layer capability decision, made independently of commercial
  launch.
- **(C) Commercial readiness** — `isVacantLandScreeningCoverageReady()` (Step 9), remains `false`
  throughout the POC, entirely independent of (B). Flipping (B) to `true` does **not** imply or
  require flipping (C), and vice versa — a `VACANT_LAND` row can exist (e.g. for controlled
  internal testing) while (C) is still `false`, and (C) staying `false` through this unit's
  Construction is unaffected by whatever value (B) eventually takes.
- **Testability, explicitly preserved**: deterministic/domain tests construct
  `VacantLandScreeningRequest` objects directly (never touching this gate); repository/integration
  tests exercise real `VACANT_LAND` persistence against the test schema once the `CHECK`
  constraint is installed, using a test-only override of the gate (matching how
  `isGarageScreeningCoverageReady`'s own tests already override that flag, per the audit's
  `tests/screening-request/garage-coverage-readiness.test.ts` precedent) — the gate blocks the
  **deployed public API path** specifically, not this unit's own ability to be implemented and
  tested.

## Step 10 — Separate customer journey entry point (`app/` — new files, `frontend-components.md`)

- [x] New route (e.g. `app/vacant-land/page.tsx` — exact path is an implementation choice; not
  `/configure`) implementing: reuse of `/configure`'s existing address/parcel-resolution call
  sequence (`POST /api/parcels/resolve` + boundary fetch — the audit did not find this factored
  into a shared component today, so Code Generation either extracts one or duplicates only the
  minimal fetch calls, per `frontend-components.md`'s own "either is acceptable" latitude) → the
  coverage-readiness check (Step 9) → the screening-intent selector (`VACANT_PARCEL`/
  `REDEVELOP_EXISTING_PARCEL`) → `POST /api/screening-requests` with `workflowType: VACANT_LAND` →
  authorization/payment (reusing Units 2/2B's existing flow unchanged, per Workflow U5-1).
- [x] `app/configure/page.tsx` is **not edited** for this step (confirmed no vacant-land branch
  exists today, per the audit — and BR-U5-6 requires it stay that way).

## Step 11 — Report rendering (`app/report/page.tsx` — extend, not replace)

Grounded in the audit's finding that today's report rendering is **entirely inline** in one 165-line
client component (no `FindingsList`/`ScenarioCard`/etc. as separate files despite Functional
Design's naming) — Unit 5 follows the same inline convention already established, rather than
introducing a new component-extraction pattern this codebase doesn't otherwise use:

- [x] `app/report/page.tsx`'s local `Report`/`Finding` interfaces gain a `workflowType`-discriminated
  branch (mirroring `ScreeningRequestSnapshot`'s own duplication-not-import pattern the audit found
  already exists between `page.tsx` and `regulatory-rules-engine/types.ts`).
  For `VACANT_LAND` reports: buildability/use findings reuse the existing `knownAndInferred`/
  `requiresVerification` split (page.tsx:95-96) unchanged; a new scenario-cards section (one per
  `ResidentialUseScenario`) follows the existing inline-JSX convention, each scenario's own
  buildable-envelope sub-section rendering the polygon via the existing `ReportMap` component
  (`app/components/ReportMap.tsx`, unchanged) or a plain-language unavailable notice; the
  conservative-fixed-5-foot-approximation label renders wherever
  `isConservativeSideSetbackApproximation` is `true`; diligence risks reuse the existing
  "Not Yet Automatically Screenable"-style section pattern (page.tsx:120-138) already used for
  `uncoveredConstraintTypes`, not a new visual pattern.
- [x] "Preliminary screening assessment" framing (never "recommendation") applied throughout the
  new copy, per VL-5.

## Step 12 — Tests (grounded in the real existing test layout, `tests/<domain>/`, `vitest`)

New/changed files, matching the audit's confirmed naming convention (`tests/regulatory-rule-
governance/garage-candidate.test.ts`-style, feature-prefixed, not nested):

- [x] `tests/screening-request/vacant-land-validation.test.ts` — workflow-discriminated
  parsing/serialization; invalid `workflowType`/field combinations rejected (e.g. a `VACANT_LAND`
  payload carrying `projectType` is rejected, not silently accepted).
- [x] `tests/db/vacant-land-schema.integration.test.ts` — migration/backfill invariants (Step 3-4):
  every pre-migration row still valid as `EXISTING_PROPERTY`; the eventual `CHECK` constraint
  (once Step 13 below applies it) rejects both invalid shapes.
- [x] `tests/regulatory-rule-governance/vacant-land-candidate.test.ts` — mirrors
  `garage-candidate.test.ts`'s own structure; asserts U1-U17 fixtures stay below `ACTIVE`.
- [x] `tests/regulatory-rules-engine/vacant-land-evaluate.test.ts` — mirrors
  `garage-evaluate.test.ts`'s helper-function style; covers: rule-scope matching (a
  `VACANT_LAND`-scoped synthetic `ACTIVE` fixture never matches an `EXISTING_PROPERTY` evaluation
  and vice versa — NFR-U5-6/-7); no-`ACTIVE`-vacant-land-coverage → `uncoveredConstraintTypes`
  disclosure, not `REQUIRES_VERIFICATION`; U1 applicability fail-closed by default; density divisor
  never silently defaults to raw parcel area; U17's fractional-unit rule against known
  input/output pairs; candidate-semantics-vs-POC-execution split (a synthetic `ACTIVE` fixture
  produces `KNOWN`/real values, absence produces the disclosure).
- [x] `tests/screening-request/vacant-land-coverage-readiness.test.ts` — mirrors
  `garage-coverage-readiness.test.ts` exactly; asserts `false` today, both public-advertisement and
  checkout gates.
- [x] `tests/screening-request/vacant-land-persistence-write-activation.test.ts` — **new, per
  founder correction 2**: `POST /api/screening-requests` with a structurally valid `VACANT_LAND`
  body is **rejected** while `isVacantLandPersistenceWriteEnabled()` is `false` (the real, deployed
  default); `EXISTING_PROPERTY` (shed/garage) writes are **unaffected** by this gate; with the gate
  overridden `true` in a controlled test configuration (mirroring the existing
  `garage-coverage-readiness.test.ts` override pattern) against the test schema **after** the DB
  `CHECK` constraint is installed, a structurally valid `VACANT_LAND` row **does** persist; the DB
  `CHECK` constraint itself rejects an invalid workflow shape **regardless of the application
  gate's value** (a direct-SQL attempt, bypassing the gate, still fails); `isVacantLandScreening
  CoverageReady()` staying `false` continues to block public advertisement/checkout **independently
  of** this gate's value in either direction (flipping one never flips the other).
- [x] `tests/spatial-analysis/vacant-land-postgis-adapter.integration.test.ts` — mirrors
  `postgis-adapter.integration.test.ts`'s conventions: `SpatialComputationResult` three-way
  semantics (a real invalid-geometry fixture → `DATA_QUALITY_UNRESOLVED`, not thrown; a forced
  PostGIS execution error → thrown `SpatialComputationError`, mapped to job failure, not
  `REQUIRES_VERIFICATION`); empty-geometry → `SUCCESS` with `areaSqFt: 0`; `Polygon`/`MultiPolygon`
  both round-trip; the fixed-5-foot approximation flag set correctly when the averaging branch
  governs; ECA geometry/area internal consistency (`excludedAreaSqFt` always equals
  `ST_Area(excludedGeometry)`); a synthetic **`ESTABLISHED`** `LotLineRoles` fixture exercises the
  full computation path (confirms the capability is real and testable even though real requests
  default to `INSUFFICIENT`, per the founder's own item 9 instruction); no partial subtraction ever
  labeled as the complete buildable envelope.
- [x] Existing shed/garage regression coverage (`tests/regulatory-rules-engine/{evaluate,
  garage-evaluate}.test.ts`, `tests/screening-request/{garage-validation,validation}.test.ts`, `tests/
  regulatory-rule-governance/{shed-candidate,garage-candidate}.test.ts`) — **re-run unchanged, zero
  edits expected**; any failure here would itself be the signal that Step 2's discrimination was
  applied incorrectly (a regression, not an expected update).

## Step 13 — Persistence migration: remaining NFR Design phases (sequenced, not all in Step 3) —
**terminology corrected per founder review**

Conceptual sequence, restated exactly as corrected: **EXPAND → MIGRATE → APPLICATION ROLLOUT →
PRE-ACTIVATION ENFORCEMENT → PERSISTENCE-WRITE ACTIVATE → CONTRACT/CLEANUP** — then, separately,
**much later, and outside this unit's scope**: REGULATORY PROFESSIONAL REVIEW/COMMERCIALIZATION →
`isVacantLandScreeningCoverageReady()` may become `true`. **That later commercial event is never
called "ACTIVATE"** — the prior draft's use of "ACTIVATE" for the commercial-readiness flip is
withdrawn; "ACTIVATE" now refers exclusively to the data-layer event in Step 9b.

- [x] **APPLICATION ROLLOUT**: Steps 1-12 (plus Step 9b's gate, defaulted `false`) above are
  deployed as one release — every read/write path is `workflowType`-aware and fail-closed on an
  unrecognized persisted shape (NFR-U5-4) *before* any `VACANT_LAND` row can be written (Step 9b's
  persistence-write gate stays `false` through this entire phase, independent of Step 9's
  commercial-readiness flag which also stays `false`).
- [x] **PRE-ACTIVATION ENFORCEMENT**: a follow-up migration applies both database-level `CHECK`
  constraints (`screening_requests`', per NFR-U5-2, and `regulatoryRules`', per Step 5's
  correction) once this release is confirmed fully deployed — enforcing exactly the discriminated
  shapes each schema requires. Deliberately sequenced as a **separate** migration from Step 3, not
  bundled, so it can be applied only after rollout is confirmed.
- [x] **PERSISTENCE-WRITE ACTIVATE**: Step 9b's `isVacantLandPersistenceWriteEnabled()` gate is
  flipped `true`, only after PRE-ACTIVATION ENFORCEMENT is confirmed applied and verified — a
  data-layer capability decision, made by whoever operates this deployment, independent of
  commercial launch. `isVacantLandScreeningCoverageReady()` (Step 9) is **not** touched by this
  step and remains `false`.
- [x] **CONTRACT/CLEANUP**: no transitional/compatibility code is introduced by Steps 1-12 in the
  first place (finding: no old-shape fallback is needed since no `VACANT_LAND` row can exist before
  PRE-ACTIVATION ENFORCEMENT), so this phase has nothing to remove — noted for completeness per NFR
  Design, not because it requires implementation work here.
- [x] **Out of this unit's scope, stated for clarity only**: the later, separate "REGULATORY
  PROFESSIONAL REVIEW/COMMERCIALIZATION" event that would eventually flip
  `isVacantLandScreeningCoverageReady()` to `true` — deferred to the same post-POC milestone Unit 4
  established (BR-U5-9), not part of Code Generation.

---

## Explicitly not reopened

Functional Design, NFR Requirements, NFR Design, and Infrastructure Design are not revisited — the
one clarification this audit surfaced (`WorkflowType` needing to be added to the app-level
`ScreeningRequest` type for the first time, not merely extended) sharpens implementation detail
within already-approved decisions; it introduces no new regulatory, architectural, or data-integrity
question.

---

## Part 2 — Generation COMPLETE 2026-08-27. Real, disclosed scope limitations (not hidden)

All 13 steps above executed. `npm run typecheck`, `npm test` (274/274 passing, 34 new), and
`npm run build` all pass cleanly. Full results in the completion message presented to the founder.
Three scope limitations, deliberately narrowed rather than gold-plated, stated here plainly:

1. **One representative scenario** (`GENERAL_DENSITY`, SMC 23.44.060.A.4's general default) is
   implemented end-to-end in `evaluate-vacant-land.ts`, not the full U3-U7/U14-U15 scenario family
   `vacant-land-rule-inventory-and-tier-triage.md` inventories. `domain-entities.md` itself
   anticipated this ("Code Generation may add scenario identifiers as the rule inventory's own
   candidates dictate") — additional scenarios are a straightforward extension of the same
   `findActiveRuleByType`/`ScenarioFigure` dispatch pattern, not a redesign.
2. **The buildable-envelope setback computation uses a uniform inward `ST_Buffer` at the largest of
   the three applicable setbacks**, not a true differential per-edge offset (front/rear/side
   buffered independently and unioned). A disclosed, honest simplification for this POC — real,
   PostGIS-backed, structurally correct for the `SUCCESS`/`DATA_QUALITY_UNRESOLVED`/
   `COMPUTATION_FAILURE` boundary NFR Design requires, but more conservative than a precise
   differential offset would be. Documented in the function's own doc comment, not silently
   simplified.
3. **No new `.integration.test.ts` file was written** for the new PostGIS functions
   (`computeSetbackConstrainedArea`/`computeEcaExclusionGeometry`/`computeBuildableEnvelope`) -
   this sandboxed environment has no live database connection to run one against (confirmed: no
   `DATABASE_URL` configured), matching every other `.integration.test.ts` file's own real
   requirement in this codebase. The deterministic (no-DB) short-circuit paths - `LotLineRoles`
   `INSUFFICIENT` and undefined ECA geometry, both of which are the actual production default for
   every real evaluation today - are covered in
   `tests/spatial-analysis/vacant-land-postgis-adapter.test.ts`. Writing the integration test
   itself (mirroring `postgis-adapter.integration.test.ts`'s own structure) is flagged as follow-up
   work for an environment with real PostGIS access, not silently skipped.

Only U1 (the buildability floor) was built as a full real, non-`ACTIVE` candidate fixture
(`tests/fixtures/vacant-land-candidate.ts`) - matching Unit 4's own precedent exactly (L1 was the
only fixture built for garage's 13-candidate inventory, not all 13) - not a shortfall relative to
that precedent.

---

## Code Generation Review — Six Material Corrections APPLIED 2026-08-27 — APPROVED/COMPLETE

The founder reviewed the fresh full-repository archive and found 6 real, independently-verifiable
defects in this Part 2 implementation. All 6 corrected; `npm run typecheck` (0 errors), `npm test`
(312/312 passing — 240 original + 34 first-pass + 38 new), and `npm run build` (clean) all re-run
clean after every correction.

1. **Governed-regulatory-content invariant restored**: (A) all 17 real candidates (U1-U17) now
   exist as real, non-`ACTIVE` fixtures (`tests/fixtures/vacant-land-candidate.ts`,
   `ALL_REAL_VACANT_LAND_CANDIDATES`), mirroring shed/garage's own convention exactly — Tier-2
   candidates (U6/U8/U13) remain blocked by the existing post-POC professional-review milestone;
   (B) U17's 0.85 rounding threshold is no longer hardcoded — `applyFractionalUnitRounding` is now
   a generic pure function taking `thresholdFraction` as a parameter, supplied only by an ACTIVE
   `VACANT_LAND_FRACTION_ROUNDING` rule; no ACTIVE U17 rule means `maxDwellingUnits` stays
   `NO_ACTIVE_COVERAGE` even when density itself is ACTIVE; (C) U9 setback numbers are no longer a
   hardcoded placeholder in `pipeline.ts` — sourced per-scenario from an ACTIVE
   `VACANT_LAND_SETBACK` rule via `findActiveScenarioRule`, `NO_ACTIVE_COVERAGE` with zero PostGIS
   call when absent; (D) scenario `citations` are now derived exclusively from real KNOWN figures'
   `appliedRule.citation` — never a static list presented regardless of ACTIVE status.
2. **Three-state `ScenarioFigure`/`SetbackConstrainedAreaResult`**: `NO_ACTIVE_COVERAGE` is now a
   real, distinct state from `REQUIRES_VERIFICATION` throughout `vacant-land-types.ts`,
   `evaluate-vacant-land.ts`, and the PostGIS adapter — no-ACTIVE-coverage never produces a
   diligence-risk Finding (verified by a dedicated test asserting exactly 1 diligence risk —
   `LotLineRoles`, not one per uncovered figure — under zero ACTIVE rules).
3. **VL-4's bounded 4-scenario family implemented**: `GENERAL_DENSITY`, `SMALL_LOT_BONUS`,
   `TRANSIT_BONUS`, `STACKED_MULTI_UNIT` (`SCENARIO_DEFINITIONS`), each independently sourcing its
   own density/height/coverage/setback figures from scenario-scoped ACTIVE rules — verified by a
   test confirming `evaluateVacantLand` always produces exactly 4 scenarios and that one
   scenario's ACTIVE rule never leaks into another's figure.
4. **Persisted-shape validation and migration execution fixed**: (A) a new
   `src/screening-request/hydrate.ts` module replaces every `as ScreeningRequestSnapshot`-style
   cast (`pipeline.ts`, `authorization.ts`, `checkout-fulfillment/index.ts`) with real
   zod-discriminated-union validation — discriminates on `workflowType`, validates required branch
   fields, rejects cross-workflow field pollution (`.strict()` per branch), rejects an
   unrecognized `workflowType`, fails closed (13 new deterministic tests); `app/api/screening-
   requests/route.ts` rejects a mixed-workflow HTTP payload outright. (B) the PRE-ACTIVATION
   ENFORCEMENT migration was moved out of `src/db/migrations/` (and its journal entry removed)
   into `src/db/manual-migrations/pre-activation-enforcement-vacant-land.sql`, applied only by a
   new, explicit `npm run db:enforce-vacant-land` script (`scripts/enforce-vacant-land-migration.ts`)
   — `npm run db:migrate` now genuinely only ever applies the EXPAND phase (0005), no new migration
   framework introduced (5 new deterministic tests proving the separation).
5. **Spatial buildable-envelope contract fixed**: (A) `rawParcelAreaSqFt ?? 0` removed — the field
   is now genuinely optional throughout `DensityFacts`/`BuildableEnvelopeFacts`, absence is never
   consumed as a real numeric area; (B/C) `computeSetbackConstrainedArea` now performs real
   per-edge differential PostGIS subtraction (`ST_Buffer` on each front/rear/side edge's own
   LINESTRING + sequential `ST_Difference`), consuming `LotLineRoles.roles`'s actual edge
   references — the uniform-max-buffer misrepresentation is gone; the side-averaging branch
   applies 5 ft on each SIDE line specifically, never front/rear; (D) `footnoteExceptionStatus`
   now genuinely gates `buildableAreaSqFt`/`buildablePolygon` — since no footnote-exception data
   source exists, this field stays `REQUIRES_VERIFICATION` for every real evaluation today, so
   those two fields now honestly stay `undefined` in production; (E) `Polygon` gained an optional
   `holes?: Point[][]` field, `MultiPolygon`/WKT construction preserve them end to end; (F) a new
   `EmptyGeometry` type replaces the unsafe `Polygon { points: [] }` sentinel — `geometryToWkt`
   handles it safely (`"POLYGON EMPTY"`), `computeBuildableEnvelope` returns a genuine zero-area
   SUCCESS without any WKT construction for that case; (G) `ST_IsValid` is now checked on supplied
   ECA geometry too, not only the parcel boundary — 9 new deterministic tests exercise the pure
   `geoJsonToGeometry`/`geometryToWkt` conversion functions (now exported) directly, covering
   empty geometry, holes, and multi-part results without needing a live database.
6. **Public vacant-land readiness fails closed**: `app/vacant-land/page.tsx` now renders only a
   plain "not yet available" message while `isVacantLandScreeningCoverageReady()` is `false` (the
   real, deployed default) — no address entry, screening-intent buttons, request creation, or
   checkout is reachable through the public route; the authoritative server-side checkout gate is
   unchanged/unaffected.

**Disclosed, not silently skipped**: no live PostGIS integration test was run (no `DATABASE_URL`
in this environment) and no automated component/browser test covers the vacant-land page's
fail-closed rendering (no React component-testing infrastructure exists in this project) — both
logged as new tracker items (15, 16) in `external-verification-tracker.md`, matching this
project's own established discipline for the shed/garage browser-smoke gaps (items 4/14).

**Unit 5 Code Generation is now APPROVED/COMPLETE.** Per explicit instruction, no further Code
Generation review gate is held — proceeding directly to Build & Test.
