# Unit 4: Detached Garages — Functional Design Plan

**Status: Part 2 APPROVED 2026-08-26 — Functional Design COMPLETE.** All 5 questions answered
(Q1=A, Q2=B, Q3=A, Q4=A, Q5=B). All 6 Part 2 artifacts produced, then revised four times across
four rounds of founder review before final approval:

**Round 1 (regulatory-completeness corrections)**: both outstanding Part 2 decisions resolved
(Founder Decision 1 — USER_SUPPLIED lot-coverage fallback, always `REQUIRES_VERIFICATION`; Founder
Decision 2 — professional review of the Tier-2 garage rule package committed to), and 4 targeted
corrections applied — (1) the height-rule inventory was incomplete, now extended with G1b (the
outside-required-setback general height regime, itself Tier 2 for the same setback-siting reason as
G1, now 4 of 5/80% Tier 2, matching Unit 0B's original finding); (2) the lot-coverage denominator
was wrongly assumed to be raw parcel area unconditionally — a new `LotCoverageFacts` concept
distinguishes raw vs. SMC-countable lot area, and a real code-level finding corrected an earlier
false claim that existing ECA integration already supports this (it does not — no production ECA
adapter is wired in, and even the one hazard type with any prior design work, steep slope, only
supports proximity/intersection facts, not area-of-overlap); (3) `GarageProjectDetails` no longer
carries trusted server-derived facts (`proposedFootprintSqFt`/`lotAreaSqFt` removed; those are now
computed server-side into `LotCoverageFacts`); (4) a new Garage Screening Coverage Readiness gate
(BR-U4-9) now separates `GARAGE` intake-support from public purchase eligibility, so the product
cannot sell a garage report whose expected normal result is "not screenable" for all three
constraint types.

**Round 2 (sequencing correction)**: the founder clarified that professional review of Tier-2
garage rules is explicitly **deferred to a post-POC "Regulatory Professional Review /
Commercialization Gate" project-level milestone** (`aidlc-state.md`) — no consultant or attorney is
engaged during Unit 4 Construction, and **Unit 4 Construction Complete no longer requires
professional review to have occurred**. It requires the garage architecture, UI, deterministic
evaluation machinery, `LotCoverageFacts`/provenance handling, honest `REQUIRES_VERIFICATION`
behavior, report disclosure behavior, the coverage-readiness gate (BR-U4-9), and comprehensive
deterministic tests to be implemented and deployable as part of the POC — a distinct, and now
reachable, milestone from Garage Commercial Regulatory Readiness (Tier-2 rules `ACTIVE`), which
stays deferred.

**Round 3 (regulatory-completeness pass, round 2 — sequencing decision from Round 2 NOT
revisited)**: the founder approved Round 2's sequencing correction outright, then caught that the
prior 5-candidate regulatory inventory (G1/G1b/G2/G3/G4) still wasn't a complete model — lot
coverage had been left as a flat 50%-of-raw-area rule when SMC 23.44.080 actually has 7 subsections
(A-G, including a minimum-coverage floor and two conditional 60% upzone provisions); height (G1/G1b)
never incorporated the roof-height bonus provisions (23.44.070.B), which turned out to genuinely
conflict with the in-setback accessory-structure provision (A.3.a) for shed/butterfly roofs; and
setback never covered the baseline Table A dimensions or the street-setback garage-placement
exception (G.1, dependent on 23.44.160.D.4/D.5). Re-read all of SMC 23.44.070.B, 23.44.080 (full
A-G), 23.44.090 (Table A + full G/I text), and 23.44.160.C-D live, and decomposed the inventory into
**13 candidates** (renamed H1/H2 for height, S1-S5 for setback, L1-L6 for lot coverage, to avoid
colliding with SMC's own subsection lettering) — 9 of 13 (69%) Tier 2, with setback and height
having *no* Tier-1 candidate at all. Also corrected the lot-coverage numerator semantics (the
USER_SUPPLIED existing-structures figure must represent SMC-*countable* area under 23.44.080.C's
exclusions, not raw/gross footprint) and expanded `LotCoverageFacts` to support an applicable
**allowed coverage** quantity (percentage selection + the D minimum floor), not a bare
percentage-of-raw-area. See `garage-rule-inventory-and-tier-triage.md` for the full candidate
inventory and `business-rules.md` BR-U4-3/BR-U4-7 (both substantially rewritten) for the corrected
business rules.

**Round 4 (final targeted correction — approved)**: the founder accepted Round 3's regulatory
research outright, then caught two remaining internal-consistency issues, both fixed without any
new SMC research, candidate addition/removal, or revisiting the post-POC sequencing decision. (1)
**Tier separated from per-parcel evidence availability**: round 3 had repeatedly cited "the project
lacks a data source for this fact" as if that alone justified Tier 2 — it doesn't, under this
project's own established model (already correctly applied to L2). Re-applying the test ("assuming
the necessary facts were reliably known, is the rule's own meaning and applicability unambiguous")
reclassified **S1 (Table A baseline) and L6 (stacked-dwelling-units bonus) to Tier 1 (governance)**
— neither has a genuine textual ambiguity, conflicting provision, or discretionary determination in
its own text, only a real evidence gap (now stated separately, still forcing
`REQUIRES_VERIFICATION` per parcel). **L5 (frequent-transit bonus) stays Tier 2, but for a
newly-identified, specific interpretation question** (whether F's "development consisting entirely
of dwelling units" trigger can ever be satisfied by a lot that also has a non-dwelling accessory
garage, given F's own purpose is to set that lot's overall coverage cap) — not for its multi-part
condition structure or missing transit-area data, both correctly recharacterized as evidence
matters. H1, H2, S2, S3, S4, S5, and L4 keep their Tier-2 classifications, each now traced to one
specific, genuine rule-level driver (A.3.a/B conflict; A.2.d ambiguity; 160.C.2 Director
determination; G.2/I.1 and G.3/I.2 overlapping provisions; dependency on S2/S3/S4; L4's own
Director-approved-amount possibility) with evidence gaps stated separately. **Recomputed: 8 of 13
(62%) Tier 2, 5 of 13 (38%) Tier 1** — not forced to match Unit 0B's 80% sample, authoritative for
this Unit on its own terms. BR-U4-4's stale "4 Tier 1 (L1, L2, L3, and L2's own governance
classification)" duplication is also corrected. (2) **`minimumCoverageFloor` and
`applicableCoveragePercentage` no longer overload `undefined`**: both were bare optional numbers
where `undefined` meant two materially different things ("confidently does not apply/50%" vs.
"genuinely unresolved") — both are now small discriminated result types
(`NOT_APPLICABLE`/`REQUIRES_VERIFICATION`/`KNOWN` for the floor; `ESTABLISHED`/
`REQUIRES_VERIFICATION` for the percentage), so the deterministic evaluator can tell these states
apart without guessing, and a confidently-single-family lot can now legitimately reach a known 50%
rather than being forced into `REQUIRES_VERIFICATION` by default. **Functional Design is APPROVED**;
proceeding directly to NFR Requirements, per explicit instruction not to hold another Functional
Design review gate absent a new regulatory contradiction.

**Story**: `SRE-GARAGE-1` (`stories.md`): *"As a Professional or Homeowner user, I want my
proposed detached garage evaluated against setback, height, and lot-coverage-percentage
constraints, so that I understand its buildability before investing further."* Acceptance: setback
and height evaluated as in `SRE-SHED-1`; lot-coverage-percentage calculated using the garage
footprint **plus any existing structures on the parcel**; same likely-buildable/conditionally-
buildable/constrained classification as sheds. `unit-of-work.md`: "the second project type,
proving the pipeline generalizes beyond sheds" — extends Regulatory Rules Engine (new rule set)
and the screening/configuration path; depends on Unit 2B and Unit 3 (both complete).

**Ground truth checked before writing this plan**:
- `ProjectType` (`src/screening-request/types.ts`) has exactly one member, `SHED` — its own comment
  already anticipates the set growing. `SUPPORTED_PROJECT_TYPES` gates persistence
  (`repository.ts`) and readiness (`authorization.ts`) off that same single-member set.
- `ShedProjectDetails` (`src/regulatory-rules-engine/types.ts`) is shed-specific, and `evaluate.ts`
  is typed against it throughout — there is no generic `ProjectDetails` shape yet.
- `report-generation-orchestrator/pipeline.ts` hardcodes `eq(regulatoryRules.applicableProjectType,
  "shed")` as a literal string in its ACTIVE-rule query.
- `regulatory-rule-governance`'s `applicableProjectType` is **already** a generic `string` field
  (repository/lifecycle/types) — no change needed there. `property-intelligence/` has no shed
  references at all — already project-type-agnostic.
- `REQUIRED_SOURCE_IDS_FOR_SHED` (`authorization.ts`) names the King County GIS + parcel-polygon
  sources — both are physical-property lookups a garage evaluation needs identically to a shed.
- **A real, load-bearing open question**: lot-coverage-percentage needs "the garage footprint plus
  any existing structures on the parcel." No Property Intelligence retriever fetches existing-
  structure/building-footprint data today — Unit 1/2 only ever fetched parcel *boundary* geometry.
  `king-county-adapter.ts`'s `PropertyInfo` layer (used at parcel-*resolution* time, not property-
  intelligence time) already returns `PREUSE_DESC`/`APPR_IMPR` ("vacant-parcel identification"
  fields) — a real, already-integrated signal, but assessed-value/land-use fields are not the same
  thing as an existing structure's footprint square footage. Whether this is sufficient, or a new
  source/layer is needed, has not been validated against a live endpoint.
- **A real, load-bearing scope tension**: Unit 0B's own pre-construction research
  (`unit-0b-findings.md`) sampled 5 real garage rules and found **4 of 5 (80%) Tier 2** — the
  opposite of `requirements.md`'s original Tier-1-dominated assumption for garages. This project has
  never brought a Tier-2 rule to ACTIVE (no professional reviewer exists) — the Tier-2 shed rule has
  stayed honestly at DRAFTED/TRIAGED through every prior unit. If garage setback/height rules are
  also mostly Tier 2, a garage evaluation may not be able to produce real setback/height
  determinations at all under the current governance model, only the one Tier-1 lot-coverage rule.
- `/configure`'s existing "TYPE" step already has exactly one button ("Screen a shed / accessory
  structure") calling `selectShedType()`, which posts `projectType: ProjectType.SHED` directly — a
  real, structurally-ready slot for a second project-type choice, not yet offering one.

## Questions

**Q1. Existing-structures data source for lot-coverage-percentage.** SRE-GARAGE-1 requires the
garage footprint *plus existing structures on the parcel*. No validated data source for
existing-structure footprints exists in this project today.
- **A**: Do a small, Unit-0B-style live-source validation pass first (confirm whether King County
  publishes a building-footprint/impervious-surface layer suitable for this, before committing to
  an approach) — same discipline Unit 0/0B used before committing to any other real integration.
- **B**: Use the already-integrated `PropertyInfo` layer's existing fields (`APPR_IMPR`/
  `PREUSE_DESC`) as a proxy, accepting their real limitations (assessed value ≠ footprint area) as a
  documented caveat, rather than researching a new source.
- **C**: Scope Unit 4's lot-coverage calculation to the **new** structure only (garage footprint /
  lot area), deferring "plus existing structures" to a later, explicitly-flagged enhancement — a
  narrower reading than SRE-GARAGE-1's literal acceptance criteria, but avoids an unvalidated new
  integration.
- [Answer]: **A** — a small, bounded, Unit-4-scoped live-source validation pass (not a reopening of
  Unit 0/0B, not a new standalone Construction unit) to answer one load-bearing question: can
  sufficiently authoritative existing-structure footprint data be obtained to support SRE-GARAGE-1's
  required `(existing structures + proposed garage footprint) / parcel area` calculation? Investigate
  the already-approved/public Seattle/King County source landscape first, determining: whether
  King County/Seattle publishes building-footprint geometry, footprint area, impervious/building
  coverage, or another field actually representing the regulatory quantity needed; the authoritative
  source/layer and access method; geographic coverage; update/freshness characteristics; licensing/
  commercial-use constraints; geometry/CRS characteristics if spatial; whether detached accessory
  structures are represented reliably; whether the source represents actual building footprint
  versus another concept (assessed improvement value, gross floor area, roof area, impervious area,
  land-use classification); how missing/stale/ambiguous coverage must be classified.
  **`APPR_IMPR`/`PREUSE_DESC` must NOT be used as a numerical proxy for structure footprint** —
  those fields may help characterize a parcel, but assessed improvement value/land-use description
  cannot defensibly produce square feet of occupied lot coverage. **Do not silently narrow
  SRE-GARAGE-1 to proposed-garage-only coverage.** If no suitable automated authoritative source
  exists, stop and surface that specific finding before Functional Design chooses a fallback —
  possible fallbacks (e.g. user-supplied existing-footprint information with
  `REQUIRES_VERIFICATION` semantics) may then be considered explicitly, never invented during the
  validation pass itself.

**Q2. Garage rule Tier-1/Tier-2 scope, given the 80%-Tier-2 finding.** Given no professional
reviewer exists in this project (same limitation the Tier-2 shed rule has lived with since Unit 1):
- **A**: Proceed with Unit 4 built to evaluate whatever rules a real research pass actually
  produces — likely meaning only the Tier-1 lot-coverage rule reaches ACTIVE, with setback/height
  staying DRAFTED/TRIAGED like the shed Tier-2 rule (an honest, if limited, garage evaluation:
  lot-coverage classification only, setback/height explicitly `REQUIRES_VERIFICATION` until a real
  Tier-2 review pipeline exists).
- **B**: Treat this as a blocking finding requiring a founder decision on how Tier-2 professional
  review will actually be resourced for this project before Unit 4's rule set is finalized —
  i.e., pause rule-authoring scope specifically, not the rest of Unit 4.
- **C**: Some other resolution (describe).
- [Answer]: **B** — the 80%-Tier-2 finding is a real blocking issue for **finalizing** the garage
  regulatory rule set, not something to pretend is still Tier-1-dominated merely because the
  original requirements assumed it might be. The rest of Unit 4 Functional Design proceeds where
  independent of the legal interpretation (`ProjectType` generalization, garage `ProjectDetails`,
  screening-request support, UI/configuration flow, Property Intelligence/data-source work, the Q1
  lot-coverage data validation, deterministic-engine generalization, report/pipeline integration) —
  but before Unit 4 can claim a production garage rule set satisfying `SRE-GARAGE-1`, an explicit
  founder decision is needed on how the required Tier-2 professional review will actually be
  sourced. **Do not activate Tier-2 garage rules without the approved professional-review checkpoint
  merely to make the feature appear complete, and do not silently downgrade the story to
  "lot coverage only."** If setback/height remain unreviewed, they may truthfully stay
  `REQUIRES_VERIFICATION` during development/testing, but Unit 4 is not declared functionally
  complete against `SRE-GARAGE-1` until it's resolved whether the necessary Tier-2 rules can be
  professionally reviewed and activated. During Functional Design, identify the actual garage rules
  likely needed and triage them using the already-approved Tier-1/Tier-2 model — producing the
  concrete professional-review workload rather than extrapolating blindly from the 5-rule Unit 0B
  sample. **Stop at the appropriate gate with**: candidate rule inventory, Tier classification,
  which rules require professional review, what type of reviewer each requires — then the founder
  decides how to resource those reviews.

**Q3. `ShedProjectDetails` generalization approach.** `evaluate.ts` is typed entirely against
`ShedProjectDetails`; garages need a new fact (lot-coverage-percentage) sheds don't.
- **A**: A generic `ProjectDetails` union (`{projectType: "shed", ...} | {projectType: "garage",
  ...}`), with `evaluateProject` branching on it — the more "generalizes beyond sheds" reading of
  this unit's own stated purpose.
- **B**: A parallel `GarageProjectDetails` type and a separate `evaluateGarageProject` function,
  reusing shared pieces (setback/height logic) where they're identical — less structural change to
  already-tested shed code, at the cost of some duplication.
- [Answer]: **A** — a discriminated `ProjectDetails` union (`ShedProjectDetails |
  GarageProjectDetails`, each carrying an explicit `projectType` discriminator), not one giant bag
  of optional fields (`{projectType, width?, height?, existingCoverage?, ...}`). The discriminator
  should make invalid project-type combinations difficult to represent and allow TypeScript
  exhaustiveness checking. The deterministic evaluation entry point becomes project-type aware
  (`evaluateProject(...)`), dispatching to project-specific logic while extracting genuinely shared
  primitives where useful. Preserve already-tested shed behavior. Do not over-generalize for
  fences/decks/ADUs that haven't been designed yet — the abstraction only needs to cleanly represent
  the two project types that actually exist now. Shared setback/height primitives are reused where
  their semantics really are shared; project-specific regulatory behavior stays project-specific.

**Q4. `/configure` frontend scope.** The "TYPE" step already has exactly one button/branch.
- **A**: Unit 4 includes the actual `/configure` UI change (a second button/branch offering
  "Screen a detached garage," collecting garage-specific details) — matching how Unit 2 bundled
  frontend and backend together.
- **B**: Unit 4 is backend/evaluation-pipeline-only; frontend garage support is a separate,
  explicitly deferred follow-up.
- [Answer]: **A** — Unit 4 includes the real customer-facing configuration path for a detached
  garage; a backend-only pass would leave "proving the pipeline generalizes beyond sheds" (this
  unit's own stated purpose) incomplete. Add a second project-type choice ("Screen a detached
  garage") and collect only the garage-specific inputs actually required by the approved
  deterministic evaluation. Reuse the existing property-selection/parcel/placement flow where
  appropriate. Do not build a future generic project wizard/UI framework merely because there are
  now two project types. The UI must also preserve truthful handling of any rule/data limitation
  identified by Q1/Q2 — it must never present setback/height or lot-coverage results as known when
  the underlying rule/evidence is still `REQUIRES_VERIFICATION`.

**Q5. `REQUIRED_SOURCE_IDS_FOR_SHED` naming.** Garages need the identical King County GIS +
parcel-polygon sources sheds do (same physical parcel lookups), plus possibly a new source per Q1.
- **A**: Generalize to a shared `REQUIRED_SOURCE_IDS` (or per-project-type map) now, as part of
  Unit 4's own generalization work.
- **B**: Leave this as a Code-Generation-level implementation detail, not a Functional Design
  question — the founder doesn't need to decide the exact constant name/shape.
- [Answer]: **B** — this is not a Functional-Design-level decision. Functional Design states the
  behavioral requirement only: readiness requirements are project-type aware; sheds and garages
  currently share the existing parcel-resolution and parcel-polygon sources; Unit 4 may add another
  garage-required source if Q1 validates one; adding a garage must not accidentally change shed
  readiness requirements. Code Generation may implement that as a per-project-type map, a shared
  base set, a renamed constant, or another small typed representation — not spending a Functional
  Design approval cycle on a constant's name.

## Additional Founder Direction (recorded verbatim, applies across all of Functional Design)

Two findings in this plan are genuinely material and stay visible, not resolved by weakening
`SRE-GARAGE-1` or fabricating confidence: (1) existing-structure lot-coverage data is currently
**unvalidated**; (2) garage regulatory coverage appears materially more Tier-2-heavy than the
original requirements assumed. Proceed with the bounded Q1 source-validation work and the rest of
Functional Design that can safely proceed in parallel. For the regulatory side, perform the concrete
garage-rule research/triage needed to quantify the Tier-2 review requirement, then stop for the
founder's decision before treating the production garage rule set as finalized.

## What This Stage Produces

- [x] `aidlc-docs/construction/unit-4-detached-garages/functional-design/lot-coverage-data-source-validation.md`
      (Q1 spike — a real finding, not a design artifact; may conclude "no suitable source" as a
      valid, honest outcome)
- [x] `aidlc-docs/construction/unit-4-detached-garages/functional-design/garage-rule-inventory-and-tier-triage.md`
      (Q2 research — candidate rule inventory + Tier classification + reviewer-type breakdown; a
      founder decision point, not a finalized rule set)
- [x] `aidlc-docs/construction/unit-4-detached-garages/functional-design/domain-entities.md`
- [x] `aidlc-docs/construction/unit-4-detached-garages/functional-design/business-rules.md`
- [x] `aidlc-docs/construction/unit-4-detached-garages/functional-design/business-logic-model.md`
- [x] `aidlc-docs/construction/unit-4-detached-garages/functional-design/frontend-components.md`
