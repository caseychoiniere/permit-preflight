# Unit 4 — Business Rules (Detached Garages)

Extends Unit 1's BR-1..BR-9 (unchanged, reused as-is) and Unit 3's admin rules (unchanged). Only new
or generalized rules are stated here.

**Revised 2026-08-26 per founder review — 5 corrections applied**: BR-U4-1 no longer conflates
intake-support with purchase eligibility (new BR-U4-9 owns purchase eligibility); BR-U4-2's example
field list corrected to match Correction 3's removal of trusted-derived fields from
`GarageProjectDetails`; BR-U4-3 rewritten for the founder's USER_SUPPLIED fallback decision;
BR-U4-4 updated with the professional-review process; new BR-U4-7 (regulatory
lot-area denominator, Correction 2) and BR-U4-8 (client-input trust boundary, Correction 3) added.

**Revised again 2026-08-26 (sequencing correction)**: professional review is committed but
explicitly deferred to a post-POC "Regulatory Professional Review / Commercialization Gate"
milestone (`aidlc-state.md`) — BR-U4-4 and BR-U4-9 updated to state that Unit 4 Construction Complete
does **not** require this review to have occurred; only Garage Commercial Regulatory Readiness does,
and that milestone is intentionally deferred until after the complete POC (Units 4-11) is built and
deployed.

**Revised a third time 2026-08-26 (regulatory-completeness pass, round 2 — sequencing decision NOT
revisited)**: BR-U4-3 corrected for numerator semantics (the USER_SUPPLIED figure must represent
SMC-countable existing-structure area, not raw/gross footprint); BR-U4-7 rewritten for the full
SMC 23.44.080 A-G decomposition (`garage-rule-inventory-and-tier-triage.md`'s L1-L6) and the
applicable-allowed-coverage-quantity model, replacing the prior single-percentage framing; BR-U4-4
and BR-U4-9 updated to reference the expanded, renamed candidate set (H1, H2, S1-S5, L1-L6).

**Revised a fourth time 2026-08-26 (final targeted correction — Tier vs. evidence separation; L4/L5
status modeling)**: BR-U4-4 recomputed — 8 of 13 Tier 2 (not 9), 5 of 13 Tier 1 (S1 and L6
reclassified from Tier 2; the round-2 draft's arithmetic and its "L1, L2, L3, and L2's own governance
classification" duplication are both corrected). BR-U4-7 rewritten so `applicableCoveragePercentage`
and the lot-coverage minimum floor are small discriminated result types, not bare optional numbers
that overloaded `undefined` with two different meanings ("confidently does not apply" vs. "genuinely
unresolved"). No new SMC research performed this round; no candidate added or removed; the post-POC
professional-review sequencing decision is unchanged and not revisited.

## BR-U4-1: `SUPPORTED_PROJECT_TYPES` Governs Intake Only, Never Purchase Eligibility (revised)

`SUPPORTED_PROJECT_TYPES` (`screening-request/repository.ts`, `screening-request/authorization.ts`)
gains `GARAGE` — a `ScreeningRequest` of type `GARAGE` may be created, validated, and evaluated
(needed for Code Generation to build and test the real `/configure` garage path, Q4=A). Per PC-1's
existing acceptance criterion (Unit 2), an unsupported type is never shown as a disabled/"coming
soon" option — absent means absent.

**Correction 4, 2026-08-26**: this alone must **not** be read as making `GARAGE` publicly
purchasable — that is a separate, additional gate. Membership in `SUPPORTED_PROJECT_TYPES` governs
only whether the system can *represent and evaluate* a garage request at all (the same way Unit 1's
shed evaluation logic was fully built, tested, and exercised long before Unit 2B's payment flow
ever made a shed report commercially purchasable — this project has already built exactly this kind
of "capability exists before it's monetized" sequencing once). Whether `GARAGE` is additionally
**offered to a paying customer** — i.e., whether the publicly-served `availableProjectTypes` list
(`ProjectTypeSelector`, PC-1) includes it, and whether `checkReadiness`/`initiateCheckout` will
proceed for a `GARAGE` order — is governed by the new, separate BR-U4-9 gate.

## BR-U4-2: `evaluateProject` Dispatch (Q3) (revised, Correction 3)

`evaluateProject` becomes a `ProjectDetails`-discriminated dispatch: a `switch` on
`project.projectType` with an exhaustiveness check (`never` branch) so that adding a future
`ProjectType` without a corresponding evaluation path is a compile-time error, not a silent runtime
gap. Each branch computes the project-type-specific geometry/quantity facts its own rules need
(e.g., shed's setback-distance facts; garage's `LotCoverageFacts` — `domain-entities.md`, assembled
server-side from validated dimensions, the confirmed parcel boundary, and any measurable ECA
exclusion, never from client-asserted derived numbers, BR-U4-8) before calling into the same shared
`evaluateRule`/finding-classification machinery already in place — the per-rule-type evaluation
logic (BR-4's KNOWN/INFERRED/REQUIRES_VERIFICATION classification) is not duplicated per project
type, only the input-assembly step is.

## BR-U4-3: Existing-Structures Footprint Is USER_SUPPLIED and Always `REQUIRES_VERIFICATION`
*(revised 2026-08-26 — founder Q1-fallback decision)*

`GarageProjectDetails.existingStructuresFootprintSqFt` is the applicant's own reported combined
square footage of existing structures on the parcel — never an authoritative/verified fact. It is:
- **Never defaulted to `0`.** `undefined` means "not supplied." An explicit `0` is accepted only as
  a deliberate user assertion ("no existing structures"), never inferred from a blank field.
- **Never presented as equivalent** to assessed improvement value, gross floor area, roof area, or
  impervious surface — those are different, real quantities this unit's own research
  (`lot-coverage-data-source-validation.md`) investigated and rejected as proxies; the intake UI
  must ask for the specific quantity, in plain language (`frontend-components.md`).
- **Always drives the combined lot-coverage finding to `REQUIRES_VERIFICATION`**, whether or not a
  value is supplied — this is stronger than BR-U4-3's original framing (which only required
  `REQUIRES_VERIFICATION` when the field was missing). A *supplied* value does not upgrade the
  finding to `KNOWN`, because the value itself remains unverified against any authoritative source.
  If the applicant cannot supply it, the combined percentage is not fabricated from a partial
  input — same `REQUIRES_VERIFICATION` outcome, only the explanation text differs.
- **Numerator semantics corrected (2026-08-26, regulatory-completeness pass round 2)**: the figure
  the applicant supplies must represent the SMC-*countable* existing-structure area — i.e., already
  reflecting SMC 23.44.080.C's numerator exclusions (`garage-rule-inventory-and-tier-triage.md`'s
  L3: underground structures; the first 36" of eave/cornice/gutter/roof projections; decks ≤36"
  above grade; unenclosed porches/steps ≤4 ft; certain unenclosed structures per 23.44.090.H) — not
  simply the gross/raw footprint of every existing structure on the parcel. The intake UI
  (`frontend-components.md`) must ask for this specific quantity in plain language, without
  requiring the applicant to personally compute C's exclusions with precision — approximate,
  good-faith self-reporting of the countable area is expected and sufficient, since the resulting
  finding is `REQUIRES_VERIFICATION` regardless (below). This correction changes *what quantity is
  being asked for*, not the field's trust level — it remains self-reported and unverified either way.
- Independent of this: the lot-coverage *denominator* has its own, separate evidence conditions — see
  BR-U4-7 (revised, now covering the full SMC 23.44.080 A-G structure, not merely a raw-vs-countable
  area distinction). Satisfying BR-U4-3 (having a user-supplied, correctly-scoped numerator) never
  substitutes for BR-U4-7's requirements, and vice versa; both — plus BR-U4-7's own
  applicable-percentage and minimum-floor conditions — must be resolvable for a `KNOWN`-quality
  combined finding, which BR-U4-3 alone already forecloses today (a supplied existing-structures
  value is still never authoritative). The garage's own proposed-footprint-only figure could still be
  `KNOWN` in isolation, and per the founder's explicit instruction it must never be labeled as the
  project's SMC lot-coverage result by itself (`lot-coverage-data-source-validation.md`).

## BR-U4-4: No Garage Rule Reaches `ACTIVE` Without Its Governance Gate (BR-7 applied, revised)

BR-7's lifecycle transition rules apply to garage `RegulatoryRule` rows exactly as they do to shed
ones — Functional Design defines the entity shape and dispatch mechanism (BR-U4-2) but creates **no**
garage `RegulatoryRule` content and advances no garage rule past a design-time placeholder.

**Recomputed (final targeted correction, 2026-08-26 — Tier separated from per-parcel evidence
availability)**: per `garage-rule-inventory-and-tier-triage.md` (revised — 13 candidates: H1, H2,
S1-S5, L1-L6), **8 of 13 (H1, H2, S2, S3, S4, S5, L4, L5)** are Tier 2, each for a genuine rule-level
reason (a real interpretation conflict, an overlapping provision with no stated precedence, or a
discretionary/administrative determination baked into the rule's own text — never merely "the
project lacks a data source" or "a user could misclassify a fact," which are evidence-availability
concerns handled by BR-4's `REQUIRES_VERIFICATION` classification, not Tier). These 8 require a
recorded professional-review opinion plus founder sign-off (BR-7's `SOURCE_VERIFIED` clause) before
they can even reach `TESTED`/`APPROVED`. **5 of 13 (S1, L1, L2, L3, L6)** are Tier 1 — S1 (setback
baseline) and L6 (stacked-dwelling-units bonus) were reclassified this pass from Tier 2, since
neither survived the "assuming the necessary facts were reliably known, is the rule's own meaning
and applicability unambiguous" test once evidence-availability reasoning was correctly excluded.
Every Tier-1 candidate is still separately blocked from being *fully usable* on many real parcels by
its own per-parcel evidence gap (BR-U4-3/BR-U4-7, and S1/L6's own required-facts sections in the
inventory) — Tier 1 governs only whether professional review is required to reach `SOURCE_VERIFIED`,
never whether a given parcel's finding reaches `KNOWN`. Setback and height still have **no**
Tier-1 candidate that is fully usable without further review (S1 is Tier 1 but everything setback/
height-related still depends on its own evidence gap and on S2-S5/H1/H2's genuine Tier-2 questions).

**Professional review is committed, but explicitly deferred to a post-POC milestone (founder
sequencing correction, 2026-08-26 — supersedes this rule's earlier "now resourced" framing)**: the
founder will not engage or pay for a land-use consultant, planner, or attorney until the complete
Permit Preflight POC (Units 4-11) is built and deployed, at which point Tier-2 candidates across
*all* project types are batch-reviewed as one commercialization-gate engagement (`aidlc-state.md`'s
"Regulatory Professional Review / Commercialization Gate" milestone), not paid for piecemeal during
Unit 4 Construction. When it does happen, the review will be a bounded, single-package engagement by
a Seattle land-use/zoning consultant/planner, escalating to a land-use attorney only if the zoning
professional finds an issue outside normal professional zoning interpretation, and must produce, per
rule: citation reviewed, interpretation, applicability/exception handling, unresolved caveats,
reviewer identity, review date, professional opinion — persisted via BR-8's existing
ambiguity/caveat-persistence mechanism (no new persistence concept). Founder source
verification/approval (`SOURCE_VERIFIED`) remains a **separate, later** checkpoint after the review
eventually lands — the professional informs, the founder still approves (RRAG-5, unchanged).

**No Tier-2 garage rule becomes `ACTIVE` before that review occurs — this constraint is unchanged by
the sequencing correction.** What changes: **Unit 4 Construction reaching "complete" does NOT
require this review to have happened.** Unit 4 Construction Complete means the garage feature's
architecture, UI, deterministic evaluation machinery, data model, rule candidates (Tier-classified,
per `garage-rule-inventory-and-tier-triage.md`), evidence/`REQUIRES_VERIFICATION` behavior, report
disclosure behavior, the coverage-readiness gate (BR-U4-9), and comprehensive deterministic tests
around the modeled rule shapes are all implemented and deployable as part of the POC — a materially
different, and reachable-now, milestone from **Garage Commercial Regulatory Readiness** (the
Tier-2 rules have completed professional review + founder sign-off and are `ACTIVE`), which stays
intentionally deferred. Code Generation for Unit 4 does not fabricate garage rule content or
artificially advance a Tier-2 rule's lifecycle state to make the feature look more complete than the
governance process has actually verified — it builds the complete, review-ready candidate rule
package and the machinery to evaluate it once activated, and stops there.

## BR-U4-5: Zero-Active-Rules Is Not "Screened Clean" (new failure mode this unit introduces)

`evaluateProject` already filters to `lifecycleState === ACTIVE` rules only
(`regulatory-rules-engine/evaluate.ts`) — a correct, pre-existing behavior. Because BR-U4-4 means a
newly-supported project type can have **zero** `ACTIVE` rules for a real operational period (from the
moment `GARAGE` becomes intake-eligible under BR-U4-1 until at least one garage rule clears BR-7),
this unit introduces a genuinely new situation Unit 1 never had to handle: an `EvaluationOutcome`
with an empty or near-empty `findings` array that must **not** be presentable to a paying customer as
equivalent to "your project was screened against applicable rules and no issues were found." The
report generation/presentation layer (RGD-4 through RGD-6, Unit 2) must be able to distinguish, and
visibly disclose, "no ACTIVE rules currently govern this project type/constraint" from "rules were
evaluated and no violations found" — these are not the same claim, and this unit's `evaluateProject`
call sites and report rendering must not conflate them. (Exact wording/UX of this disclosure is
Code Generation's to design against this constraint, not fixed here.)

## BR-U4-6: `RegulatoryRule.applicableProjectType` Requires No Schema Change

Reaffirms `domain-entities.md` — `applicableProjectType` is already a generic string field; `"garage"`
is a structurally valid value with zero migration. Included here only to make explicit that no BR-7
transition or rule-authoring tooling needs to change to accept a garage rule once one is drafted —
only its *content* is gated (BR-U4-4).

## BR-U4-7: Applicable Allowed-Coverage Quantity — the Full SMC 23.44.080 A-G Structure
*(rewritten 2026-08-26, regulatory-completeness pass round 2 — supersedes the prior
raw-vs-countable-denominator-only framing)*

Lot coverage is **not** `countableLotAreaSqFt * 0.50` unconditionally. The applicable allowed
coverage (`LotCoverageFacts.allowedCoverageSqFt`, `domain-entities.md`) is derived from the full
SMC 23.44.080 A-G structure, decomposed into candidates L1-L6
(`garage-rule-inventory-and-tier-triage.md`):

- **Denominator (L2/B+E)**: `countableLotAreaSqFt` (not `rawParcelAreaSqFt`) is the only value used,
  computed only when (a) the system has sufficient authoritative spatial evidence to measure an
  applicable exclusion's actual area, or (b) the system has sufficient evidence that no exclusion
  category applies at all. **Re-checked against the actual codebase**: condition (a) cannot be met
  today for any of the 4 exclusion categories — `spatial-analysis/eca.ts`'s
  `resolveCriticalAreaFinding` produces only a boolean/tri-state intersection fact, not an
  area-of-overlap measurement, has no production caller today, and only `"steep_slope"` has ever been
  named as a hazard type in this codebase. Whenever neither (a) nor (b) is met, `countableLotAreaSqFt`
  stays `undefined`.
- **Numerator exclusions (L3/C)**: both the garage's own countable footprint and the (USER_SUPPLIED)
  existing-structures figure must reflect C's exclusions — see BR-U4-3's revised numerator semantics.
- **Applicable percentage (L1 default 50% vs. L5/F and L6/G's conditional 60%)**: represented as a
  small result type, not a bare optional number (final targeted correction, below) — `ESTABLISHED`
  (50% when L5/L6 are confidently known *not* to apply — e.g. a single-dwelling lot with no stacked
  units and no qualifying multi-unit configuration, a real and expected-common case for this
  product's typical applicant; or 60% when L5 or L6 is confidently established as applying) or
  `REQUIRES_VERIFICATION` (L5's "entirely of dwelling units" scoping question is unreviewed, or
  either L5's transit-area status or L6's stacked-dwelling-units fact is simply unknown). **Never**
  defaulted to 50% merely because F/G's applicability facts are unknown, and never assumed to be 60%
  either — per the founder's explicit instruction, inclusion and exclusion are both real
  possibilities that must be affirmatively resolved, not assumed. Unlike the round-2 draft, a
  confidently-*excluded* case (the common single-family scenario) now correctly reaches
  `ESTABLISHED`(50%) rather than being forced into `REQUIRES_VERIFICATION` merely because F/G were
  never assumed to be inapplicable.
- **Minimum floor (L4/D)**: represented as a 3-state result, not a bare optional number (final
  targeted correction, below) — `NOT_APPLICABLE` (L2 confidently shows no B-listed area on the
  parcel — the floor genuinely does not apply, a real and different state from "unresolved"),
  `REQUIRES_VERIFICATION` (a B-listed area may exist, or does exist but an unverifiable greater
  Director-approved amount can never be ruled out — carries the 625 sq ft statutory minimum as
  context, never asserted as the final answer), or `KNOWN` (only reachable if a future capability
  can conclusively confirm no Director-approved override exists — not exercised by anything this
  unit builds today; never fabricated).

**`allowedCoverageSqFt` is producible only when the denominator (L2), numerator (BR-U4-3/L3), the
applicable-percentage result is `ESTABLISHED`, and the minimum-floor result is `NOT_APPLICABLE` or a
genuinely `KNOWN` amount — never when any of these is itself `REQUIRES_VERIFICATION` or missing.**
Given today's real evidence gaps (no production area-of-overlap ECA capability for L2; no
frequent-transit-service-area data for L5; no verifiable Director-approval channel for L4), a fully
`ESTABLISHED`/`KNOWN` combined result is expected to be uncommon but no longer impossible for the
common case (a straightforward single-family lot with no B-listed area and no stacked/multi-unit
qualification can now legitimately reach a known percentage and a `NOT_APPLICABLE` floor — it is
still blocked from a fully `KNOWN` `allowedCoverageSqFt` by BR-U4-3's numerator gate, which stays
`REQUIRES_VERIFICATION` by design). Raw parcel area is never silently substituted for the countable
area, 50% is never silently assumed over an unestablished 60% (nor is a confidently-excluded case
forced into `REQUIRES_VERIFICATION`), and the 625 sq ft floor is never silently applied, omitted, or
conflated with "unresolved."

**Final targeted correction (2026-08-26) — do not overload `undefined` for two materially different
meanings.** A bare `optional number` cannot distinguish "confidently does not apply" from "genuinely
unresolved" — the deterministic evaluator must be able to tell these apart without guessing from
absence of a value. `LotCoverageFacts.minimumCoverageFloorSqFt` (and, by the identical logic,
`applicableCoveragePercentage`) are therefore modeled as small discriminated result types
(`domain-entities.md`, revised) rather than bare optional numbers — exact TypeScript shape is
implementation-level, the binding invariant is that `NOT_APPLICABLE`/`ESTABLISHED` and
`REQUIRES_VERIFICATION` are never collapsed into the same `undefined` value.

No new data source or PostGIS capability, and no new frequent-transit-area GIS integration, is
introduced by this rule — per the founder's explicit instruction (both review rounds), closing these
evidence gaps is a separately-approved decision, not assumed here.

## BR-U4-8: `ProjectDetails` Must Never Carry Trusted, Server-Derived Facts
*(new 2026-08-26, Correction 3)*

A `ProjectDetails` value (client-submitted, persisted verbatim on `ScreeningRequest.projectDetails`)
may only ever contain genuine project/user inputs — dimensions, siting preferences, and (for
garages) the USER_SUPPLIED `existingStructuresFootprintSqFt` (BR-U4-3, itself explicitly
non-authoritative). It must **never** contain a value the server treats as authoritative simply
because the client supplied it as JSON — `proposedFootprintSqFt`/`lotAreaSqFt` were removed from
`GarageProjectDetails` for exactly this reason (`domain-entities.md`). Any authoritative,
parcel-derived, or geometry-derived quantity a rule needs (raw/countable lot area, the garage's own
countable footprint) is computed server-side, at evaluation time, into `LotCoverageFacts`
(`domain-entities.md`) — from the confirmed parcel boundary (Property Intelligence's existing
authoritative pipeline) and validated dimensions, never from a client-asserted number. This
preserves the immutable `ScreeningRequestSnapshot`'s existing semantics unchanged: user-supplied
inputs are snapshotted as inputs; trusted spatial/evaluation facts continue to come from their own
authoritative pipeline and provenance, computed fresh at evaluation time, never trusted from the
snapshot's input JSON.

## BR-U4-9: Garage Screening Coverage Readiness Gates Purchase Eligibility, Separately From Intake
*(new 2026-08-26, Correction 4)*

`SUPPORTED_PROJECT_TYPES` membership (BR-U4-1, revised) is necessary but **not sufficient** for
`GARAGE` to be publicly purchasable. A separate "Garage Screening Coverage Readiness" predicate
(`domain-entities.md`) gates two things: (1) whether the publicly-served `availableProjectTypes`
list consumed by `ProjectTypeSelector` (PC-1) includes `GARAGE` at all; (2) whether
`checkReadiness`/`initiateCheckout` (`screening-request/authorization.ts`, the existing pattern
that already gates shed checkout on required-source health) permits a `GARAGE` order to proceed to
Stripe Checkout. This predicate becomes true only once **all** of the following hold:
- The garage rule set required for SRE-GARAGE-1's three named constraint types (setback, height,
  lot-coverage) has completed its applicable BR-7 governance gates for at least the rules needed to
  give each constraint type a real evaluation path.
- The Tier-2 rules needed for that path have received the professional review (BR-U4-4 —
  explicitly deferred to the post-POC "Regulatory Professional Review / Commercialization Gate"
  milestone, `aidlc-state.md`) and founder sign-off.
- The lot-coverage USER_SUPPLIED input path (BR-U4-3) is implemented in the real intake UI.
- The regulatory lot-area denominator logic (BR-U4-7) is implemented — including its honest
  `REQUIRES_VERIFICATION` fallback where evidence is insufficient; this rule does not require the
  denominator to always resolve to a `KNOWN` value, only that the logic exists and behaves
  correctly (never silently substituting raw parcel area).
- Setback, height, and lot-coverage **each** have an actual evaluation path reachable by a real
  garage submission — none may be silently absent merely because this unit had not yet finished
  building it.

**This predicate is expected to stay `false` throughout the entire POC-build phase (Units 4-11) by
design (founder sequencing correction, 2026-08-26)** — that is not a defect or an incomplete Unit 4,
it is the deliberate, correct state until the post-POC professional-review milestone is reached.
Until this predicate is true, `GARAGE` may exist, be evaluated, and be tested internally (BR-U4-1)
— it is simply never offered to a paying customer, and the deployed POC may contain the complete
garage implementation without ever claiming unreviewed Tier-2 rules are production-approved.
`NoActiveRuleCoverageNotice` (BR-U4-5, `frontend-components.md`) remains valuable **after** this
gate eventually passes, for genuinely partial/degraded coverage situations (an emergency `DISABLED`
rule, a temporarily unavailable data source) — it is not a substitute for this readiness gate, must
not be used to justify selling a report whose expected normal result is "not screenable" for all
three constraint types, and must not be treated as a workaround for activating Tier-2 rules early.
Exact implementation (a static flag vs. a derived check) is deferred to Code Generation; this rule
states the binding behavioral invariant only.
