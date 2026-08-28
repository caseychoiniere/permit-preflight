# Unit 5 — Business Rules (Vacant Land)

Extends Units 1-4's business rules (unchanged, reused as-is). Only new/generalized rules stated
here.

## BR-U5-1: `ScreeningRequest` Is a `workflowType`-Discriminated Union (Q1)

`ScreeningRequest`/`ScreeningRequestSnapshot` are no longer a single interface with
`projectType`/`projectDetails` treated as always-present — they are a real union
(`domain-entities.md`) on `workflowType`: `EXISTING_PROPERTY` (unchanged from Units 1-4, `projectType`/
`projectDetails` required) and `VACANT_LAND` (new — `screeningIntent`/`vacantLandDetails` required,
`projectType`/`projectDetails` structurally absent, never `ProjectType.VACANT_LAND`). Every call
site must branch on `workflowType` before accessing workflow-specific fields — the type system
enforces this, not convention. This is a real generalization of the persistence layer, following
the exact same "the sibling discriminant field, not an internal tag, governs a `jsonb` column's
actual shape" pattern Unit 4's `ProjectConfiguration` union already established, extended one level
up to the workflow itself. **Real persistence consequence (Correction 6, detailed in
`domain-entities.md`)**: this is not a TypeScript-only invariant — the actual `screening_requests`
table's `project_type`/`project_details` columns become nullable, two new nullable columns
(`screening_intent`, `vacant_land_details`) are added, and a database-level `CHECK` constraint
enforces the discriminated invariant at the schema level, not application-code discipline alone.

**Unit 5 is this project's first second-*workflow* implementation, not a third project type** —
preserved structurally: `WorkflowType.VACANT_LAND` is a new workflow; `ProjectType` gains no new
member for it. A future project type (a third accessory-structure kind) would extend `ProjectType`
within `EXISTING_PROPERTY`; a future distinct customer journey would extend `WorkflowType`. These
are two different axes of generalization, and Unit 5 is squarely on the second one.

## BR-U5-2: `REDEVELOP_EXISTING_PARCEL` Never Silently Erases Property-Specific Concerns (Q2)

`VacantLandScreeningIntent.REDEVELOP_EXISTING_PARCEL` (`domain-entities.md`) permits the
deterministic assessment to evaluate future development potential under an explicit assumption that
existing improvements can be removed where necessary. This assumption is scoped **narrowly** — it
governs only "can I disregard the existing structure's footprint/coverage/height for the purpose of
asking what could be built here" — it never silently resolves, assumes away, or omits:
- existing legal/nonconforming status of the current structure or the lot itself,
- demolition requirements,
- easements,
- vested rights,
- any other existing-condition dependency the regulatory research finds materially affects a
  specific finding.

Where any of the above materially affects a specific finding and is not known, that finding is
`REQUIRES_VERIFICATION` — never silently resolved in either direction (never assumed clear, never
assumed blocking). Per the founder's explicit instruction, Unit 5 does **not** expand into
demolition-permit analysis, easement law, or vested-rights doctrine research — `vacant-land-rule-
inventory-and-tier-triage.md`'s bounded research pass (SMC 23.44.020/.060/.070/.080/.090 only)
found no candidate where researching those topics was strictly necessary to answer VL-2 through
VL-5's stated questions; if a future finding surfaces such a necessity, that is new information
justifying reopening this scope decision, not assumed here.

## BR-U5-3: Buildable Envelope Is Fail-Closed — Building the Capability ≠ Always Reporting a Number
(Q4)

`BuildableEnvelopeFacts` (`domain-entities.md`) is a real, new PostGIS capability — Spatial
Analysis gains a genuine buildable-envelope computation (parcel boundary minus the applicable
setback envelope minus measurable ECA exclusions), not merely a distance-to-a-given-footprint
measurement. **Building this capability does not mean every evaluation produces a buildable-area
number.** `buildableAreaSqFt`/`buildablePolygon` are producible only when **both**
`setbackConstrainedArea.status === "ESTABLISHED"` and `ecaExclusionArea.status` is `NOT_APPLICABLE`
or `KNOWN` — never when either input is itself unresolved. A partial polygon (one applicable
constraint silently omitted from the subtraction) is never presented as "the buildable envelope" —
that would misrepresent an incomplete computation as an authoritative one, exactly the failure mode
this project's evidence-classification discipline exists to prevent. It is **acceptable and
expected** for many real parcels to remain `REQUIRES_VERIFICATION` for this figure under the POC's
current data coverage (the same ECA area-of-overlap gap `vacant-land-rule-inventory-and-tier-
triage.md`'s U4/U7/U11/U13 name, unchanged from Unit 4's own finding, and the "major transit
service"/"frequent transit service area" gaps named at U5/U9/U14). **No new external data provider
is added in this unit** to force a numeric result — per explicit instruction, a materially-necessary
new dataset is surfaced as a founder decision, never improvised.

**Corrected per founder review (Correction 3) — three further honesty requirements added:**
1. **Scenario-scoped, not scenario-independent**: `BuildableEnvelopeFacts` is owned per
   `ResidentialUseScenario` (`domain-entities.md`), not one global structure — Table A's setback
   envelope genuinely varies by scenario (dwelling-unit count, small-lot/transit branches), so a
   single parcel-level "buildable envelope" number was never honest.
2. **Lot-line roles have no establishment mechanism in this unit's actual UI** — Unit 5's intake
   (BR-U5-6) has no placement step, so front/rear/side roles cannot be inferred from parcel
   geometry alone (`LotLineRoles`, `domain-entities.md`, including the genuinely Director-
   determined multi-frontage case SMC 23.84A.024 itself describes). `LotLineRoles.status` is
   `INSUFFICIENT` by honest default, which means `setbackConstrainedArea` is
   `REQUIRES_VERIFICATION` for essentially every real Unit 5 evaluation today — stated plainly, not
   smoothed over.
3. **Side-setback averaging is a labeled conservative approximation, not a fixed buffer** —
   **corrected a second time per founder review**: SMC 23.44.090 Table A's "5 ft average, 3 ft
   minimum" side-setback branch cannot be represented as one compliant polygon. This design's first
   correction wrongly applied the flat **3 ft minimum** and labeled it "conservative" — that is
   backwards and is withdrawn: a flat 3 ft/3 ft condition averages to 3 ft, not 5 ft, and does not
   satisfy the rule at all; the 3 ft minimum bounds only the lowest permitted *individual* setback,
   never the average requirement independently. The corrected approach applies a flat **5 ft on
   each** averaging-governed side (a clearly compliant subset of the possible envelopes) and labels
   it explicitly as a **"conservative fixed-5-foot approximation"** — understood to potentially
   *understate* the true maximum buildable area (a real design could trade one side below 5 ft
   against the other above 5 ft while respecting both the 3 ft minimum and the 5 ft average), never
   overstate it. No optimization engine for side-setback averaging is built in this unit. Table A
   footnote exceptions (e.g. Queen Anne Boulevard) are separately `REQUIRES_VERIFICATION` when
   their specific applicability facts are unestablished, rather than silently assumed not to apply.
4. **The buildable polygon requires real ECA exclusion geometry, not an area scalar** — **new,
   founder-caught defect**: `ecaExclusionArea`'s `KNOWN` branch (`domain-entities.md`) must carry
   the actual authoritative exclusion geometry PostGIS needs for `ST_Difference`, not merely a
   known area number — an area scalar cannot produce a polygon. Binding invariants:
   `buildablePolygon` is derived only through PostGIS from real geometry, never by subtracting an
   area scalar; area and geometry share appropriate provenance; if the exclusion area is known
   numerically but the geometry required for the envelope is unavailable,
   `buildableAreaSqFt`/`buildablePolygon` remain `undefined`/`REQUIRES_VERIFICATION` rather than
   guessed. This path may remain unresolved for essentially all real parcels under the POC's
   current data coverage — the point of this correction is that the capability is structurally
   correct when exercised with synthetic/known geometry, not that it resolves more often today. No
   new ECA geometry provider is added in this unit to make this path reachable.

## BR-U5-4: Scenario-Based Density/Height/Coverage Evaluation

`ResidentialUseScenario` (`domain-entities.md`) evaluates VL-4's "plausible supported residential-
use scenarios" as multiple, independently-evidenced hypothetical configurations — not a single
number, and not the single-specific-user-proposal evaluation model Units 1/4 used for shed/garage.
Each scenario's density/height/lot-coverage figures are computed from `vacant-land-rule-inventory-
and-tier-triage.md`'s U3-U15 candidates, each figure independently `KNOWN` or
`REQUIRES_VERIFICATION` (a scenario is not all-or-nothing). A scenario's own configuration facts
(unit type, story count, amenity-area arrangement) are asserted as part of describing the
hypothetical scenario itself, not evidence-gated against the real parcel — but the *parcel's own*
physical facts feeding into that scenario's figures (ECA presence/area, transit-service-area status,
actual lot area) remain genuinely evidence-gated exactly as `BR-U4-7`/Unit 4's own discipline
established.

**A genuine, disclosed methodological difference from Unit 4, not assumed or forced**: because
scenarios are hypothetical-by-construction, several candidates that were Tier-2-driving ambiguities
for Unit 4's garage evaluation (specifically L5/U14's "does an accessory structure's presence break
'entirely of dwelling units'" question) do not arise for a vacant-land scenario genuinely
representing a qualifying multi-unit residential development — re-triaged to Tier 1 at U14
specifically, with the reasoning stated there, not applied as a blanket reclassification of the
underlying SMC citation (Unit 4's garage-context L5 finding stands unchanged).

**Corrected per founder review (Correction 2)**: every density figure now uses `DensityFacts`'
`densityCountableLotAreaSqFt` (`domain-entities.md`, U16/SMC 23.44.060.D.6+E) as its divisor, never
`rawParcelAreaSqFt` directly — the raw parcel boundary area is not the regulatory "lot area" once
D.6's ECA-area exclusions are accounted for. `maxDwellingUnits` additionally applies SMC
23.44.060.D.1's fraction-rounding rule (U17) as its final step, never ordinary floor/round
arithmetic.

## BR-U5-5: Vacant-Land Candidates Are Real, Governed `RegulatoryRule` Rows — the Same Path Every
Other Unit Uses (BR-7, BR-U4-4's discipline extended; **corrected per founder review — Correction
4**)

**Corrected per founder review**: the prior draft of this rule contradicted
`business-logic-model.md`'s own Workflow U5-2 draft, which described directly evaluating
SMC-derived numeric conclusions while this rule simultaneously claimed no Unit 5 candidate is ever
governance-drafted as a `RegulatoryRule` row — meaning those numbers would have been hardcoded
inside vacant-land evaluation code, bypassing the governed-rule lifecycle every prior unit (1, 4)
has respected. This is now resolved in favor of the project's own core invariant: Unit 5's 17
candidates (U1-U17, `vacant-land-rule-inventory-and-tier-triage.md`) **are** drafted as real
`RegulatoryRule` rows, scoped via `RegulatoryRuleApplicabilityScope` (`domain-entities.md`,
Correction 4) rather than `applicableProjectType`, and evaluated through the exact same
BR-6/BR-7 governance lifecycle and the same evaluator query path Units 1/4 already use — no second,
parallel regulatory-content system.

Identical Tier discipline to Unit 4's BR-U4-4, extended to Unit 5's 17 candidates: 3 of 17 (U6, U8,
U13) are Tier 2, each for a genuine rule-level reason (a discretionary regulatory-agreement
mechanism, a textual scoping ambiguity, a Director-approval discretionary mechanism respectively)
and require the deferred professional review before reaching
`SOURCE_VERIFIED`/`TESTED`/`APPROVED`/`ACTIVE`. The remaining 14 (Tier 1, several governance-only
per the same Tier-vs-evidence discipline Unit 4's final correction established, including the newly
-added U16/U17 and U1's corrected applicability-facts framing) still require founder verification
and are separately blocked from `KNOWN`-quality usability by real, disclosed evidence gaps
(BR-U5-3's ECA/transit-area gaps, U1's lot-qualification/existence-date gap, `LotLineRoles`'
structural `INSUFFICIENT` default) independent of Tier.

**No Unit 5 candidate reaches `ACTIVE` within this unit** — matching Unit 4's own precedent of
never marking any garage rule `ACTIVE` during Construction. This has a direct, disclosed
consequence for the deployed POC's behavior (`business-logic-model.md` Workflow U5-2): scenario
evaluation is dominated by "no `ACTIVE` rule coverage" disclosures, reusing Unit 4's own
`uncoveredConstraintTypes` mechanism (`regulatory-rules-engine/types.ts`), not by real computed
numbers.

**Professional review remains deferred to the same post-POC "Regulatory Professional Review /
Commercialization Gate" project-level milestone** established during Unit 4
(`aidlc-docs/aidlc-state.md`) — Unit 5's 17 candidates join Unit 4's 13 as one combined future
batch-review package, not a separate engagement. No professional is engaged or paid for during
Unit 5 Construction.

## BR-U5-9: Vacant-Land Screening Coverage Readiness (mirrors BR-U4-9; new — Correction 5)

Identical discipline to Unit 4's BR-U4-9, applied to the `VACANT_LAND` workflow as a whole (there
is no per-"project-type" granularity here — the whole workflow is gated as one unit, since
`VACANT_LAND` has no `ProjectType` member per BR-U5-1's own structural invariant). Two independent
layers, both required, neither substituting for the other:
1. **Public advertisement layer** — the vacant-land entry point (BR-U5-6) is offered to users only
   when vacant-land screening is publicly advertised as available; mirrors Unit 4's
   `available-project-types` route/`isGarageScreeningCoverageReady`-equivalent check
   (`isVacantLandScreeningCoverageReady`), server-exposed so the client never independently decides
   availability.
2. **Authoritative server-side checkout/authorization layer** — `checkReadiness`/
   `initiateCheckout` (or their `workflowType`-aware equivalents, Workflow U5-1 step 4) reject a
   `VacantLandScreeningRequest` server-side even if a client somehow reaches that point without the
   public-advertisement layer's gate.

**Stays `false` through the POC phase** — identical posture to Unit 4's own BR-U4-9, for the
identical reason: BR-U5-5 confirms zero Unit 5 candidates are `ACTIVE` in this unit, so there is no
governed rule coverage to sell against yet. This is a deliberate commercial-readiness gate, not an
oversight, and is not flipped to `true` as part of Unit 5 Construction.

## BR-U5-6: Vacant-Land Entry Point Is Distinct From Project Configuration (Q5)

VL-1's own acceptance criteria requires entering vacant-land screening "directly from a resolved
parcel," bypassing Project Configuration's proposed-structure concepts entirely — `VACANT_LAND` is
never offered as another option inside `/configure`'s TYPE step (which remains exclusively
`EXISTING_PROPERTY`'s shed/garage selection, unchanged). A minimal, separate customer-facing entry
point is required: address/parcel resolution → vacant-land-or-redevelopment screening-intent
selection → the vacant-land-specific flow → assessment/report — reusing existing parcel-resolution
UI/components where practical (the address-confirmation step itself is not duplicated) rather than
building a second, independent implementation of it. Exact route/component decomposition is a Code
Generation implementation detail (`frontend-components.md` states the minimal design, not a full
rebuild).

## BR-U5-7: LLM Explains, Never Determines, the Preliminary Screening Assessment (VL-5)

Reuses Unit 1's Report Explanation non-authoritative-LLM boundary unchanged — the deterministic
evidence and findings (`VacantLandEvaluationOutcome`) produce the underlying preliminary screening
assessment; the LLM's role is limited to explaining/synthesizing that assessment in plain language,
consistent with `requirements.md` §5.1's existing LLM boundary. "Preliminary screening assessment"
framing is used throughout report copy — never "recommendation" language (VL-5's own explicit
acceptance criterion). If the LLM is unavailable, the deterministic assessment and findings are
still delivered in full — the same graceful-degradation behavior RGD-5 already established, reused
without modification.

## BR-U5-8: Subdivisions Remain Out of Scope

No Unit 5 finding, scenario, or piece of UI copy treats the possibility of subdividing the parcel
as part of the evaluation — `vacant-land-rule-inventory-and-tier-triage.md`'s research deliberately
excluded `SMC 23.44.060.B` (minimum lot size for *newly created* lots) and all subdivision/platting
procedure from scope, per `requirements.md`'s own MVP boundary and the founder's explicit
instruction. A scenario's density/unit-count figures describe development potential on the
**existing** lot as-is, never a proposal to divide it into multiple lots first.
