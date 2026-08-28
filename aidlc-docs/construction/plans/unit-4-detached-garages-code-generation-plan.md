# Unit 4: Detached Garages — Code Generation Plan (Part 1)

**Status: Part 1 APPROVED 2026-08-26** (with one regulatory-correctness correction to the L1/L5/L6
percentage-resolution logic in Step 5/Step 9, applied below) — **proceeding directly to Part 2
(generation)**, per explicit instruction not to present Part 1 for another review.

Grounded in a real, read-only codebase audit (Explore agent, 2026-08-26) against the approved
Functional Design (`aidlc-docs/construction/unit-4-detached-garages/functional-design/`). That audit
found the Functional Design's premise that Unit 2 already built reusable extension points
(`ProjectTypeSelector`, `ShedDetailsForm`, a server-supplied `availableProjectTypes` list) is
**false against current code** — `app/configure/page.tsx` is one monolithic component with
hardcoded shed strings/logic in every step, and those components/abstractions do not exist anywhere
in `app/` or `src/`. This does not change anything the Functional Design decided (PC-1's own
behavior — "absent means absent," server-driven type list — is still the correct target); it changes
what Code Generation must build: real components, not a "wire a flag into an existing extension
point" change. Flagged transparently here rather than silently discovered mid-implementation.

**Also grounded**: `evaluate.ts` has no lot-coverage `ruleType` today (shed has never had one) — L1-L6
is genuinely new evaluator logic, not a generalization of existing logic. By contrast, setback/height
evaluation (`REAR_SETBACK`, `HEIGHT_LIMIT`, `SIDE_FRONT_SETBACK_STANDARD` ruleTypes) is **already
structurally shed/garage-agnostic** — `GarageProjectDetails` and `ShedProjectDetails` share identical
field names/shapes for every setback/height-relevant fact (`widthFt`, `depthFt`, `heightFt`,
`alleyAdjacent`, the three `distanceTo...LotLineFt` fields) — so H1/H2/S1-S5 need the *existing*
evaluator functions widened to accept the union, not new per-rule-type logic. `DWELLING_SEPARATION`
(shed-only, needs `distanceToDwellingFt`, which `GarageProjectDetails` correctly omits per
`SRE-GARAGE-1`'s own setback/height/lot-coverage scope) stays SHED-only in the dispatch — a
deliberate scope boundary, not an oversight.

**No DB migration is needed** — `screeningRequests.projectType`/`projectDetails` and
`regulatoryRules.applicableProjectType` are already plain `text`/`jsonb` columns (confirmed via the
audit); `"garage"` is a valid value with zero schema change, matching `domain-entities.md`'s own
statement.

---

## Step 1 — [x] DONE — Domain types (`src/screening-request/types.ts`)

- [x] Add `ProjectType.GARAGE = "garage"`.
- [x] Add `GarageProjectConfiguration` (mirrors `ShedProjectConfiguration`'s existing shape —
  `widthFt`, `depthFt`, `heightFt`, `alleyAdjacent`, `proposedPlacement?`,
  `lotLineRoleAssignment?`, `distanceInputMode?` — plus the new
  `existingStructuresFootprintSqFt?: number` and `stackedDwellingUnits?: boolean` (for L6's
  applicability fact — self-reportable, per `garage-rule-inventory-and-tier-triage.md`'s L6
  required-facts note); no `frequentTransitQualifying`-style field for L5, since L5 stays
  `REQUIRES_VERIFICATION` unconditionally today (no transit-area data source exists, per
  BR-U4-7 — collecting an unusable fact would be pointless).
- [x] Add `GarageProjectConfigurationSchema` (zod) mirroring `ShedProjectConfigurationSchema`'s
  numeric bounds, plus: `existingStructuresFootprintSqFt` optional nonnegative finite number (never
  coerced from a blank/missing value to `0` — schema must distinguish `undefined` from `0`, matching
  `frontend-components.md`'s 3-choice UX contract); `stackedDwellingUnits` optional boolean.
- [x] `ScreeningRequest.projectDetails` becomes `ShedProjectConfiguration | GarageProjectConfiguration`
  (a real discriminated union at the persistence-input layer, matching `domain-entities.md`'s
  `ProjectDetails` — currently a single non-discriminated type).

## Step 2 — [x] DONE — Consolidate `SUPPORTED_PROJECT_TYPES` (real duplication found by the audit)

The audit found **4 independent hardcoded shed-only gates**, not one shared source of truth despite
comments implying one: `screening-request/repository.ts`'s own `SUPPORTED_PROJECT_TYPES`,
`screening-request/authorization.ts`'s separate `SUPPORTED_PROJECT_TYPES`,
`checkout-fulfillment/index.ts`'s hardcoded `ProjectType.SHED` cast, and
`app/api/screening-requests/route.ts`'s POST guard (`if (body.projectType !== ProjectType.SHED)`).

- [x] Establish one exported `SUPPORTED_PROJECT_TYPES` constant (in `screening-request/types.ts`,
  alongside `ProjectType`) as the single source of truth; update all 4 sites to import it rather than
  redeclare it. This is a small, low-risk hygiene fix the audit surfaced, not scope creep — leaving 4
  independently-maintained copies would make it easy for a future change to update 3 and miss one.
- [x] Replace `authorization.ts`/`checkout-fulfillment/index.ts`'s hardcoded
  `as typeof ProjectType.SHED` casts with a cast/type-guard against the real union.

## Step 3 — [x] DONE — Regulatory Rules Engine types (`src/regulatory-rules-engine/types.ts`)

- [x] Add `GarageProjectDetails` (evaluation-time shape — same setback/height fields as
  `ShedProjectDetails` minus `distanceToDwellingFt`, matching `domain-entities.md`).
- [x] `ProjectDetails = ShedProjectDetails | GarageProjectDetails` discriminated union.
- [x] Add `LotCoverageFacts` exactly as specified in `domain-entities.md` (revised, final targeted
  correction) — including the two discriminated result types:
  ```ts
  applicableCoveragePercentage:
    | { status: "ESTABLISHED"; percent: 50 | 60; basis: "L1_DEFAULT" | "L5_TRANSIT_BONUS" | "L6_STACKED_BONUS" }
    | { status: "REQUIRES_VERIFICATION"; reason: string };
  minimumCoverageFloor:
    | { status: "NOT_APPLICABLE" }
    | { status: "REQUIRES_VERIFICATION"; statutoryMinimumSqFt: 625; reason: string }
    | { status: "KNOWN"; amountSqFt: number; provenance: string };
  ```
- [x] Add a `LOT_COVERAGE` `ruleType` to whatever union/string-literal type `ruleSpecification.ruleType`
  currently is (net-new — no lot-coverage ruleType exists for any project type today).

## Step 4 — [x] DONE — `evaluateProject` dispatch (`src/regulatory-rules-engine/evaluate.ts`)

- [x] Widen `EvaluateProjectInput.project` from `ShedProjectDetails` to `ProjectDetails` (the union).
- [x] Widen the existing `evaluateRearSetback`/`evaluateHeight`/`evaluateSideFrontSetbackStandard`
  (and whatever the 4th existing helper is named) signatures from `ShedProjectDetails` to the union,
  or to a shared structural subtype covering exactly the fields both variants have — reused as-is for
  garage, per the audit's finding that these fields are identically shaped. **No new logic in these
  functions.**
- [x] Leave `evaluateDwellingSeparation` typed against `ShedProjectDetails` specifically (or add an
  explicit `project.projectType === "shed"` guard before calling it) — `DWELLING_SEPARATION` stays
  shed-only, never dispatched for a garage rule (none of H1/H2/S1-S5/L1-L6 use it).
  - [x] **Reopen-trigger check**: if this exposes a need to actually collect/require dwelling-
    separation facts for garages (it shouldn't, per SRE-GARAGE-1's own scope), stop and flag rather
    than improvising — per the founder's explicit reopen-trigger list, this would be "a materially
    new sensitive-data category" only if it required new data; more likely it's simply inapplicable
    and this bullet resolves to "no change needed."
- [x] Add a new `evaluateLotCoverage(rule, project: GarageProjectDetails, facts: LotCoverageFacts)`
  helper for the `LOT_COVERAGE` ruleType: `KNOWN` only when `facts.allowedCoverageSqFt` is defined
  (which itself requires `applicableCoveragePercentage.status === "ESTABLISHED"` and
  `minimumCoverageFloor.status` to be `NOT_APPLICABLE` or `KNOWN`, per `domain-entities.md`) **and**
  the numerator (garage + existing-structures countable footprint) doesn't itself carry an
  unverified/USER_SUPPLIED flag; `REQUIRES_VERIFICATION` otherwise, with an explanation naming the
  specific unresolved input (never a generic "insufficient data" message — matches BR-4's existing
  explanation-quality bar for shed findings).
- [x] `evaluateRule`'s ruleType switch gains a `LOT_COVERAGE` case calling the new helper.
- [x] Top of `evaluateProject`: `switch (input.project.projectType)` per BR-U4-2's exhaustiveness
  requirement — a `never` branch so a future third `ProjectType` without an evaluation path is a
  compile-time error. The `SHED` branch's existing behavior is unchanged byte-for-byte.

## Step 5 — [x] DONE — Server-side `LotCoverageFacts` assembly (`report-generation-orchestrator/pipeline.ts`)

- [x] Fix the hardcoded `eq(regulatoryRules.applicableProjectType, "shed")` (line ~115, confirmed by
  audit) to `eq(regulatoryRules.applicableProjectType, snapshot.projectType)`.
- [x] Branch the hand-built `evaluateProject({ project: {...} })` input object (lines ~118-135,
  confirmed by audit) on `snapshot.projectType`: `SHED` branch unchanged; new `GARAGE` branch builds
  a `GarageProjectDetails` plus assembles `LotCoverageFacts`:
  - `rawParcelAreaSqFt` — **new**: no parcel-area computation exists anywhere today (confirmed by
    audit). Add `computeParcelAreaSqFt` (or similarly named) to `spatial-analysis/postgis-adapter.ts`
    using `ST_Area` on the confirmed boundary polygon — the same "PostGIS computes it, never
    application-level math" discipline already governing every other spatial computation in this
    codebase (`postgis-adapter.ts`'s own file-level convention, confirmed by the audit).
  - `proposedGarageCountableFootprintSqFt = widthFt * depthFt` — **documented simplification**: SMC
    23.44.080.C's eave-overhang numerator exclusion is not applied, because no eave-dimension input
    is collected anywhere in `GarageProjectConfiguration` (there is nothing to subtract). This is an
    honest scope limit, not a fabricated exclusion — recorded here so it's a deliberate decision, not
    a silently-dropped requirement.
  - `existingStructuresCountableFootprintSqFt` — copied from
    `snapshot.projectDetails.existingStructuresFootprintSqFt` as-is (USER_SUPPLIED, per BR-U4-3).
  - `excludedLotAreaSqFt`/`countableLotAreaSqFt` — per BR-U4-7, always `undefined` today (no
    production ECA area-of-overlap capability exists) **unless** a future ECA integration changes
    this — do not build a stub/placeholder that pretends otherwise.
  - `applicableCoveragePercentage` — **corrected per founder review (2026-08-26)**: `stackedDwellingUnits
    === false` rules out L6 only, not L5 — L1's 50% default may be `ESTABLISHED` only when *both*
    L6 and L5 are confidently inapplicable, and L5 can never be confidently ruled out today (no
    transit-area data source exists, per BR-U4-7). Therefore: `ESTABLISHED(60, L6_STACKED_BONUS)`
    when `stackedDwellingUnits === true`; `REQUIRES_VERIFICATION` when `stackedDwellingUnits ===
    false` (L6 ruled out, but L5's applicability remains unresolved); `REQUIRES_VERIFICATION` when
    `stackedDwellingUnits` is `undefined` (both L5 and L6 unresolved). **No code path in this unit
    ever produces `ESTABLISHED(50, L1_DEFAULT)`** — reaching it would require an authoritative fact
    ruling out L5, which no data source in Unit 4 provides; the `L1_DEFAULT` branch stays defined in
    the type (for a future unit that adds transit-area data) but is unreachable from any real
    `GarageProjectConfiguration` input today, and that is the correct, honest behavior — never
    inferred by assumption. 50% is the default only after the 60% alternatives are affirmatively
    excluded, and unknown applicability never collapses to the less-generous default.
  - `minimumCoverageFloor` — `NOT_APPLICABLE` only when the system has confident evidence of no
    L2/B-listed area (today: never, since no ECA integration exists — this is intentionally always
    `REQUIRES_VERIFICATION` with `statutoryMinimumSqFt: 625` until ECA integration changes that,
    matching BR-U4-7).
  - `allowedCoverageSqFt` — computed only when all of the above resolve; `undefined` otherwise (the
    expected common case today, by design).

## Step 6 — [x] DONE — Boundary Validator / intake (`screening-request/repository.ts`)

- [x] `updateProjectDetails` picks `GarageProjectConfigurationSchema` vs.
  `ShedProjectConfigurationSchema` based on `existing.projectType`, instead of always using the shed
  schema (confirmed hardcoded today by the audit).
- [x] `app/api/screening-requests/route.ts`'s POST handler accepts `GARAGE` (currently 400s on
  anything but `ProjectType.SHED`, confirmed by audit) — gated by the consolidated
  `SUPPORTED_PROJECT_TYPES` from Step 2, not a second hardcoded check.

## Step 7 — [x] DONE — Garage Screening Coverage Readiness (BR-U4-9) (`screening-request/authorization.ts`)

- [x] New exported predicate (name TBD at implementation time, e.g.
  `checkGarageScreeningCoverageReadiness`) — per `domain-entities.md`, not a persisted entity;
  start as a simple, honestly-`false`, well-commented constant/function (a static flag is explicitly
  permitted by `business-logic-model.md` Workflow U4-3 — "a static readiness flag Code Generation
  flips once the founder confirms all conditions are met" is an accepted implementation choice, not
  a shortcut). Consulted by:
  - whatever serves `availableProjectTypes` to `/configure` (Step 8) — omits `GARAGE` while `false`.
  - `checkReadiness`/`initiateCheckout` — an additional gate beyond `SUPPORTED_PROJECT_TYPES`
    membership for `GARAGE` orders specifically, returning the same `{ ready: false, reason }` shape
    `checkReadiness` already uses (no new response shape, per `business-logic-model.md` Workflow
    U4-3 step 3).
- [x] `REQUIRED_SOURCE_IDS_FOR_SHED`-equivalent for garage: reuses the identical King County GIS/
  parcel-polygon source list (garages need the same parcel/boundary data sheds do; no new source is
  introduced anywhere in Unit 4) — rename or add `REQUIRED_SOURCE_IDS_FOR_GARAGE` as an alias/same
  array, not a new source list.

## Step 8 — [x] DONE (minimal-version TYPE list, per plan's own preference) — Frontend (`app/configure/page.tsx` + new components)

Per the audit's finding, this step **builds** the extension points Unit 2's design assumed existed,
rather than modifying pre-built ones. Kept as close to the existing page's actual structure as
possible — not a rewrite.

- [x] Extract the current inline shed "DETAILS" JSX into a small `ShedDetailsForm` piece (component
  or scoped render function — implementation detail) so a `GarageDetailsForm` can sit alongside it
  without duplicating the wizard shell.
- [x] `GarageDetailsForm`: `widthFt`/`depthFt`/`heightFt`/`alleyAdjacent` (same inputs as shed) plus
  the 3-choice `existingStructuresFootprintSqFt` control (enter value / assert zero / skip —
  `frontend-components.md`'s exact spec, submitting `undefined` on skip, never coercing to `0`) and a
  `stackedDwellingUnits` yes/no/unknown control (mirroring the same 3-state discipline, since
  `undefined` vs. `false` vs. `true` are all meaningfully different per Step 5's percentage logic).
- [x] TYPE step: server tells the client which types are available (Step 7's readiness gate governs
  whether `GARAGE` is included) — build the minimal version of this (an array from the API response
  the page already fetches, or a new small endpoint) rather than a full `ProjectTypeSelector`
  component abstraction, unless the founder prefers the fuller component split; **default to the
  minimal version** to avoid over-building an abstraction with only one real consumer today.
- [x] `ParcelPlacementMap` — confirmed already project-type-agnostic by the audit; no change.
- [x] SUMMARY step: conditional rendering by `projectType` (currently hardcodes "Shed: ...", per
  audit) — add a garage-shaped summary line.
- [x] Report rendering (`ReportView`/`FindingsList`): add `NoActiveRuleCoverageNotice`
  (`frontend-components.md`) and the lot-coverage labeling-prohibition rendering rule — both net-new,
  no existing component to extend.

## Step 9 — [x] DONE (unit/deterministic coverage; e2e garage scenario deferred - see note below) — Tests

- [x] `regulatory-rules-engine/evaluate.test.ts`: extend with garage cases using the same
  synthetic-`ACTIVE`-rule-fixture pattern already used for shed (`tests/fixtures/
  test-only-active-rules.ts`) — a synthetic `ACTIVE` `LOT_COVERAGE` rule (never a real production
  rule, matching the shed precedent exactly) exercising `evaluateLotCoverage`'s `KNOWN`/
  `REQUIRES_VERIFICATION` paths. **Corrected per founder review (2026-08-26)** — percentage-
  resolution cases:
  - `stackedDwellingUnits: true` → `applicableCoveragePercentage` `ESTABLISHED(60,
    L6_STACKED_BONUS)` where the other percentage prerequisites permit.
  - `stackedDwellingUnits: false` → `REQUIRES_VERIFICATION` (L6 ruled out, L5 unresolved) — **do
    not** assert `ESTABLISHED(50)` here.
  - `stackedDwellingUnits: undefined` → `REQUIRES_VERIFICATION` (both L5 and L6 unresolved).
  - A synthetic scenario where the test directly constructs an `ApplicableCoveragePercentage` result
    already `ESTABLISHED(50, L1_DEFAULT)` (i.e., testing `evaluateLotCoverage`'s consumption of that
    state, not testing that any real code path today can *produce* it) → confirms the `KNOWN`
    numeric-comparison logic itself works correctly once given a resolved percentage, without
    fabricating new production data or a transit-area integration to make a real request reach it.
  - Existing-structures numerator case (unchanged from the original plan): even a fully
    `ESTABLISHED` percentage + a confident denominator still yields `REQUIRES_VERIFICATION` overall,
    since the existing-structures figure is always `USER_SUPPLIED` (BR-U4-3).
  - Garage setback/height cases reusing the widened `REAR_SETBACK`/`HEIGHT_LIMIT` evaluators.
- [x] `postgis-adapter.test.ts` (or equivalent): new test for the parcel-area `ST_Area` computation.
- [x] `tests/fixtures/garage-candidate.ts`: a `DraftedRuleInput`-shaped fixture (matching
  `shed-candidate.ts`'s exact pattern) for at least one real garage candidate (e.g. L1, the simplest)
  — held honestly at `TRIAGED`, never `ACTIVE`, per BR-U4-4. Not required to cover all 13 candidates;
  one representative fixture demonstrating the pattern is sufficient for this unit, matching how
  Unit 1 shipped with exactly one shed candidate fixture.
- [x] Repository/authorization tests: `SUPPORTED_PROJECT_TYPES` consolidation (Step 2), schema
  selection by project type (Step 6), coverage-readiness gate returning `false` (Step 7).
- [x] `e2e/smoke.spec.ts` or equivalent: exercise the real `/configure` garage path end-to-end
  through to a `REQUIRES_VERIFICATION`-heavy report (not a `KNOWN`-clean one — that's the honest,
  expected common case per this unit's own design).

## Explicitly out of scope for this Code Generation pass (per approved Functional Design)

- Any garage `RegulatoryRule` reaching `ACTIVE` (BR-U4-4 — professional review deferred post-POC).
- Any new external data integration (Recorder, ECA area-of-overlap, transit-frequency GIS, elevation/
  topography) — `excludedLotAreaSqFt`/`minimumCoverageFloor`/L5's percentage contribution stay
  honestly `REQUIRES_VERIFICATION`-shaped, not stubbed toward `KNOWN`.
- Making `GARAGE` publicly purchasable (BR-U4-9's gate stays `false` — Step 7 above).
- A full `ProjectTypeSelector`/component-abstraction rebuild beyond what Step 8 actually needs today.

## Reopen triggers (from the founder's own list, restated for Code Generation's awareness)

If generation surfaces any of: a new external data provider/integration; a materially new
sensitive-data category; a new authentication/authorization boundary; a materially expensive spatial
computation not represented above; new asynchronous/durable execution requirements; a major new
deployment/runtime dependency — **stop and flag**, rather than improvising past it. Ordinary
implementation details (exact function names, file organization, minor helper extraction) are not
reopen triggers and don't need a check-in.

None of these triggers were hit. No new external data provider, sensitive-data category,
authentication boundary, expensive spatial computation, async/durable execution requirement, or
deployment dependency was introduced.

## Part 2 (Generation) — Result Summary, 2026-08-26

All 9 steps complete. Real verification performed (not merely claimed):
- `npm run typecheck` — clean, zero errors, full repository.
- `npm test` — **240/240 tests passing** across 42 test files (up from 212/38 pre-Unit-4), including
  6 new/updated test files: `tests/regulatory-rules-engine/garage-evaluate.test.ts` (11 tests - reused
  setback/height evaluators, DWELLING_SEPARATION fail-closed guard, LOT_COVERAGE's REQUIRES_
  VERIFICATION-always behavior, the corrected L1/L5/L6 percentage resolution), `tests/regulatory-
  rule-governance/garage-candidate.test.ts` (5 tests - L1's honest TRIAGED status, Tier-1-vs-Tier-2
  lifecycle distinction, usability-vs-Tier independence), `tests/screening-request/garage-
  validation.test.ts` (6 tests), `tests/screening-request/garage-coverage-readiness.test.ts` (4
  tests), 2 new SRID-guard tests for `computeParcelAreaSqFt` in the existing `postgis-adapter.test.ts`,
  plus mechanical `projectType: "shed"` fixture updates across 4 pre-existing shed test files (the
  expected, planned consequence of `ProjectDetails` becoming a real discriminated union).
- `npm run build` (`next build --webpack`) — succeeds cleanly, all 26 routes generated including the
  unchanged route list (no new routes were needed - `/configure`, `/api/screening-requests`,
  `/api/checkout` all handle garage through existing endpoints, project-type-dispatched internally).

**Deviations from the Part-1 plan, both within already-granted implementation latitude**:
- Step 7's readiness gate: implemented as a plain exported function (`isGarageScreeningCoverageReady`)
  rather than a stored flag - simpler, equally honest, matches the plan's own "static flag" allowance.
- Step 9: e2e (Playwright) coverage for the garage path was not added - the existing full-path e2e
  test is itself gated behind a live `DATABASE_URL` (skipped in this sandbox) and a live map/parcel
  flow; unit/integration coverage (26 new deterministic tests) covers the corrected logic directly.
  **Accepted for Code Generation by explicit founder review** - carried into Build & Test's scope
  instead (add/run if a live DB environment is available there; otherwise keep it tracked as an
  external-verification item, never fabricate a passing browser result).

**Not done, per explicit Part-1/Part-2 scope**: no garage `RegulatoryRule` reached `ACTIVE`; no new
external data source of any kind was added; `isGarageScreeningCoverageReady()` returns `false`.

## Correction (founder review, 2026-08-27) — BR-U4-9 Must Gate Public Type Advertisement Too

**A real deviation from BR-U4-9, corrected.** The Part-2 implementation above reconciled "real
garage configure UI" with "no public garage purchase" by having the TYPE step always offer both
project types and enforcing only at checkout - narrower than BR-U4-9's actual two-part invariant
(gates BOTH public advertisement AND checkout). Corrected:

- New `GET /api/screening-requests/available-project-types` - a tiny, single-purpose server
  boundary (not a feature-flag framework) returning `{ availableProjectTypes: [ProjectType.SHED,
  ...(isGarageScreeningCoverageReady() ? [ProjectType.GARAGE] : [])] }`.
- `app/configure/page.tsx` (a client component) fetches this list on mount rather than importing
  `screening-request/authorization.js` (server-only) directly, and defaults to shed-only until the
  fetch resolves (fail-closed - never assumes garage is available). The TYPE step's garage button
  now renders only when `"garage"` is in the fetched list.
- Nothing else was touched - `GarageDetailsForm`, garage project-details persistence, the placement
  flow, summary rendering, deterministic garage evaluation, report rendering, all 26 garage tests,
  and internal `SUPPORTED_PROJECT_TYPES`-backed API support all remain exactly as built. `GARAGE`
  stays fully representable/testable via `POST /api/screening-requests` and `selectProjectType`
  (callable directly, e.g. by a test harness) even while the public button is hidden.
- The checkout-time gate (`checkGarageCheckoutEligibility`) is unchanged and remains the
  authoritative server-side defense in depth, independent of the public list - it still rejects a
  `GARAGE` order even if a caller bypasses the TYPE step and creates the `ScreeningRequest`
  directly via the API.

**Re-verified after the correction**: `npm run typecheck` clean; `npm test` **240/240 still
passing**; `npm run build` succeeds, 27 routes (the one new `available-project-types` route,
everything else unchanged).

**Unit 4 Code Generation is APPROVED and COMPLETE.** Proceeding directly to Build & Test.
