# Unit 4 — Business Logic Model (Detached Garages)

Technology-agnostic workflows. Entities per `domain-entities.md`, decision rules per
`business-rules.md`. Extends Unit 1's Workflow 1-6 and Unit 2's configuration-flow workflows
unchanged except where noted below.

**Revised 2026-08-26 per founder review**: Workflow U4-1 step 2's garage branch now assembles
`LotCoverageFacts` server-side (Correction 2/3) instead of trusting client-supplied derived numbers;
Workflow U4-2 gains an explicit existing-structures-input step (Founder Decision 1) and a corrected
step 4 (garage support ≠ purchase eligibility, Correction 4); new Workflow U4-3 states the
purchase-eligibility gate (BR-U4-9).

**Revised again 2026-08-26 (regulatory-completeness pass, round 2)**: Workflow U4-1 step 2's
`LotCoverageFacts` assembly rewritten for the full SMC 23.44.080 A-G structure
(`garage-rule-inventory-and-tier-triage.md`'s L1-L6, `business-rules.md` BR-U4-7 revised) — an
applicable allowed-coverage quantity, not a bare percentage-of-raw-area. Field names updated to
`...CountableFootprintSqFt` throughout to reflect the corrected numerator semantics (BR-U4-3
revised). The post-POC professional-review sequencing decision is unchanged and not revisited.

**Revised a third time 2026-08-26 (final targeted correction)**: step 2(e)/(f) rewritten for
`domain-entities.md`'s discriminated `applicableCoveragePercentage`/`minimumCoverageFloor` result
types — `undefined` no longer overloaded to mean both "confidently does not apply" and "genuinely
unresolved." No new SMC research; no candidate added or removed; garage-rule-inventory-and-tier-
triage.md's Tier reclassifications (S1, L6 → Tier 1 governance) are referenced but not re-derived
here.

---

## Workflow U4-1: Project-Type-Dispatched Evaluation (replaces Unit 1 Workflow 4's shed-only framing)

1. Receive a `ProjectDetails` value (the discriminated union — `domain-entities.md`), the confirmed
   `PropertyContext`/`SpatialResult` for the parcel, and the caller-supplied `candidateActiveRules`/
   `candidateActiveInferencePolicies` (BR-U4-2 — dispatch does not change who is responsible for
   supplying candidates; `evaluateProject` still filters to `ACTIVE` itself, unchanged).
2. Switch on `project.projectType` (BR-U4-2's exhaustiveness requirement):
   - `SHED`: unchanged from Unit 1 Workflow 4 — assemble shed setback/height distance facts, evaluate
     against `ACTIVE` shed rules.
   - `GARAGE`: assemble `LotCoverageFacts` (`domain-entities.md`, revised for the full SMC
     23.44.080 A-G structure) server-side, never from client-asserted numbers (BR-U4-8):
     a. `rawParcelAreaSqFt` — from the confirmed parcel boundary already available from spatial
        analysis (not a new fetch).
     b. `proposedGarageCountableFootprintSqFt` — computed from validated `widthFt`/`depthFt` with
        L3/23.44.080.C's numerator exclusions applied (eave overhang within the first 36", etc.),
        never trusted as a pre-supplied client number.
     c. `existingStructuresCountableFootprintSqFt` — copied from `GarageProjectDetails` as-is,
        USER_SUPPLIED, asked to already reflect L3's exclusions (BR-U4-3 revised), `undefined` when
        not provided, never defaulted.
     d. `excludedLotAreaSqFt`/`countableLotAreaSqFt` — L2/23.44.080.B+E, computed only under
        BR-U4-7's two conditions (a measurable exclusion, or confident evidence no exclusion
        category applies); left `undefined` otherwise — expected to stay `undefined` for the large
        majority of real evaluations given today's real ECA-integration gap (BR-U4-7).
     e. `applicableCoveragePercentage` — `{ status: "ESTABLISHED", percent: 50, basis:
        "L1_DEFAULT" }` when L5/23.44.080.F and L6/23.44.080.G are both confidently ruled out (e.g.
        a straightforward single-dwelling lot — the common case for this product's typical
        applicant); `{ status: "ESTABLISHED", percent: 60, basis: "L5_TRANSIT_BONUS" |
        "L6_STACKED_BONUS" }` when either is confidently established as applying; otherwise `{
        status: "REQUIRES_VERIFICATION", reason }` — never defaults to 50 merely because F/G's
        applicability facts are unknown, and a confidently-*excluded* case correctly reaches
        `ESTABLISHED` rather than being forced into `REQUIRES_VERIFICATION`.
     f. `minimumCoverageFloor` — `{ status: "NOT_APPLICABLE" }` when the lot is confidently known to
        have no L2/B-listed area at all; `{ status: "REQUIRES_VERIFICATION", statutoryMinimumSqFt:
        625, reason }` whenever a B-listed area may exist, or does exist but a possibly-greater
        Director-approved amount can never be ruled out (the practical case whenever L2 indicates a
        B-listed area, since no verified-Director-approval channel exists — `{ status: "KNOWN" }` is
        never fabricated); this is a discriminated result, not a bare optional number, so
        "does not apply" and "unresolved" are never collapsed into the same `undefined`.
     g. `allowedCoverageSqFt` — `MAX(percent x countableLotAreaSqFt, floor amount)` only when
        `countableLotAreaSqFt` is defined, `applicableCoveragePercentage.status` is `ESTABLISHED`,
        and `minimumCoverageFloor.status` is `NOT_APPLICABLE` or `KNOWN`; `undefined` whenever any of
        those is itself unresolved.
3. Filter `candidateActiveRules`/`candidateActiveInferencePolicies` to `lifecycleState === ACTIVE`
   (unchanged, pre-existing behavior — BR-U4-5 notes this may now legitimately yield an empty rule
   set for a project type that has no `ACTIVE` rules yet).
4. For each `ACTIVE` rule matching `applicableProjectType`, evaluate per BR-4's existing
   KNOWN/INFERRED/REQUIRES_VERIFICATION classification (unchanged machinery — reused, not
   reimplemented per project type per BR-U4-2). A garage lot-coverage rule (any of L1-L6, if/when
   `ACTIVE`) evaluated with `LotCoverageFacts.allowedCoverageSqFt` `undefined` produces
   `REQUIRES_VERIFICATION` — any single unresolved input (numerator, denominator, applicable
   percentage, or floor applicability) is sufficient to force it, never `KNOWN`. The garage's own
   `proposedGarageCountableFootprintSqFt` may still be surfaced as plain factual geometry, but never
   labeled as the project's SMC lot-coverage result by itself
   (`lot-coverage-data-source-validation.md`'s explicit prohibition).
5. Assemble the `EvaluationOutcome`. **New step this unit introduces (BR-U4-5)**: tag the outcome
   with whether any `ACTIVE` rule for this `projectType` existed to evaluate at all — distinct from
   "rules were evaluated, none violated." This tag is what downstream report rendering (Workflow
   U4-2 step 6, and Unit 2's `ReportView`) must consume to avoid presenting an empty/near-empty
   `findings` array as a clean screening result.

## Workflow U4-2: `/configure` Garage Intake (extends Unit 2's `ProjectConfigurationFlow`, Q4)

1. `ProjectTypeSelector` (Unit 2, PC-1) receives `availableProjectTypes` from the server. Whether
   this list includes `GARAGE` for a given (public) request is governed by Workflow U4-3's
   readiness gate, **not** simply by `SUPPORTED_PROJECT_TYPES` (BR-U4-1, revised, Correction 4) — no
   component change to `ProjectTypeSelector` itself, since PC-1 was already built to render whatever
   the server advertises with no hardcoded shed-only assumption, and "absent means absent" continues
   to apply unchanged: `GARAGE` simply is not in the list until Workflow U4-3's gate passes.
2. On selecting "Detached garage" (when offered), the wizard's `"DETAILS"` step renders
   `GarageDetailsForm` (`frontend-components.md`) instead of `ShedDetailsForm` — same wizard shell,
   same `"TYPE" → "DETAILS" → "PLACEMENT" → "SUMMARY"` steps, same server-side-validation-is-
   authoritative discipline (PC-2, unchanged). `GarageDetailsForm` collects
   `existingStructuresFootprintSqFt` as an explicit input (Founder Decision 1, numerator semantics
   corrected round 2 — BR-U4-3): the form presents three distinct choices, not a single free-text
   box defaulting to blank/zero — "enter a square footage" (with plain-language guidance on the
   SMC-countable quantity being asked for, not raw/gross footprint), "assert there are no existing
   structures on this parcel" (submits explicit `0`), or leave unanswered (submits `undefined`) — so
   the type-level `0`-vs-`undefined` distinction (BR-U4-3) is never collapsed by a UI that silently
   coerces a skipped field to `0`.
3. `ParcelPlacementMap` (Unit 2) is reused unchanged for the `"PLACEMENT"` step — a garage's
   `proposedFootprint` is constructed from anchor + orientation + garage `widthFt`/`depthFt` exactly
   as a shed's is; the component has no shed-specific assumption baked in beyond the dimensions it's
   given. This constructed polygon remains a computation *input* passed to the server (unchanged
   Unit 2 pattern) — it is not itself persisted as a trusted derived-area number (BR-U4-8).
4. On `"SUMMARY"` submission, the assembled `GarageProjectDetails` — containing only genuine project
   inputs, never `proposedFootprintSqFt`/`lotAreaSqFt` (BR-U4-8) — is persisted as the
   `ScreeningRequest.projectDetails` (no schema change — `domain-entities.md`). The request may
   proceed through validation/evaluation immediately (`SUPPORTED_PROJECT_TYPES` already permits
   `GARAGE`, BR-U4-1); whether it may proceed through the **payment** step of the authorization/
   fulfillment flow (Unit 2B) is separately gated by Workflow U4-3 — a `GARAGE` `ScreeningRequest`
   existing and being evaluable does not by itself mean checkout succeeds.
5. At report-generation time, the orchestrator pipeline calls Workflow U4-1 instead of a shed-only
   evaluation call.
6. Report rendering (Unit 2's `ReportView`) consumes Workflow U4-1's "no `ACTIVE` rule coverage"
   tag (BR-U4-5): when present for one or more requested constraint types, the report visibly states
   that this constraint could not yet be automatically screened, rather than omitting it silently or
   implying a pass. This is the honest-disclosure requirement the founder's Q2/"Additional Direction"
   answer required stay visible rather than being smoothed over by the UI. Post-Workflow-U4-3-gate,
   this remains valuable for genuinely partial/degraded coverage (BR-U4-9) — it is not, by itself,
   what makes a garage report sellable in the first place.

**Explicitly not addressed by this workflow**: the actual garage rule content H1, H2, S1-S5, L1-L6
becoming `ACTIVE` (BR-U4-4 — professional review committed but explicitly deferred to the post-POC
"Regulatory Professional Review / Commercialization Gate" milestone, `aidlc-state.md`) and whether
`GARAGE` is currently offered to a paying customer (Workflow U4-3 / BR-U4-9). This workflow's steps
1-5 remain fully exercisable for internal development/testing regardless — **Unit 4 Construction
does not wait on either** (founder sequencing correction, 2026-08-26) — while Workflow U4-3's gate
stays closed to the public for the entire POC-build phase by design, the same "build the capability,
then gate its sale" sequencing this project already used for shed evaluation (Unit 1) versus shed
checkout (Unit 2B).

## Workflow U4-3: Garage Purchase-Eligibility Gate (new 2026-08-26, BR-U4-9, Correction 4)

1. At the point `availableProjectTypes` is computed for a public `/configure` request (Workflow
   U4-2 step 1), and again at `checkReadiness`/`initiateCheckout` time (`screening-request/
   authorization.ts`'s existing pattern — the same point that already checks required-source
   health for sheds), evaluate the Garage Screening Coverage Readiness predicate
   (`domain-entities.md`, BR-U4-9).
2. The predicate is `true` only when **all** of BR-U4-9's listed conditions hold (governance-gate
   completion for the constraint types needed, professional review + founder sign-off on the
   required Tier-2 rules, the USER_SUPPLIED lot-coverage input path implemented, the regulatory
   lot-area denominator logic implemented with its honest `REQUIRES_VERIFICATION` fallback, and an
   actual evaluation path present for setback, height, and lot-coverage each).
3. While `false`: `GARAGE` is omitted from the publicly-served `availableProjectTypes` (PC-1's
   "absent means absent" continues to apply — no disabled/"coming soon" state is introduced); a
   `GARAGE` order reaching `checkReadiness`/`initiateCheckout` is rejected with `{ ready: false,
   reason: ... }`, the same shape `checkReadiness` already returns for an unsupported project type
   or an unhealthy required source — no new response shape needed.
4. Once `true`: `GARAGE` appears in `availableProjectTypes` and checkout proceeds normally. This
   step does not retroactively change Workflow U4-1's per-constraint honest-disclosure behavior
   (BR-U4-5) — a garage report can still legitimately show `NoActiveRuleCoverageNotice` for a
   specific constraint afterward (e.g., an emergency `DISABLED` rule, or a parcel where
   `countableLotAreaSqFt` could not be measured), it is simply no longer the *expected normal case*
   for every submission the way it necessarily is while this gate is closed.

**Expected state during the POC-build phase (founder sequencing correction, 2026-08-26)**: this
predicate is expected to remain `false` for the entire duration of Units 4-11's construction, since
step 2's professional-review condition cannot be satisfied until the post-POC "Regulatory
Professional Review / Commercialization Gate" milestone (`aidlc-state.md`) is reached. This is not a
failure of Workflow U4-3 or of Unit 4 — the gate existing and correctly returning `false` (never
`true` by accident, never bypassed) is precisely what lets the deployed POC contain the complete
garage implementation without ever claiming unreviewed Tier-2 rules are production-approved.

Exact implementation (a static readiness flag Code Generation flips once the founder confirms all
conditions are met, vs. a fully derived live check against `RegulatoryRule` lifecycle states) is
deferred to Code Generation — this workflow states the binding sequencing and behavior only.
