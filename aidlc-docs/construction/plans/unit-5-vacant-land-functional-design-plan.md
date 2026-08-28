# Unit 5: Vacant Land — Functional Design Plan

**Status: Part 2 CORRECTED 2026-08-27 — bounded 6-item correction pass applied, pending founder
re-review.** All 5 questions answered (Q1=B with a discriminated-union design, Q2=C with an
explicit VacantLandScreeningIntent concept, Q3=A, Q4=A with a fail-closed evidence gate, Q5=A).
Bounded regulatory research performed live (SMC 23.44.020/.060/.070/.080/.090, plus 23.84A.024's
"Lot"/"Lot line, front" definitions fetched live for Correction 1), producing a 17-candidate
inventory (U1-U17, 3 Tier 2/14 Tier 1 — recomputed honestly after the correction pass, not
preserved to match the prior "15/20%" figures). Founder review requested 6 corrections, all
applied: (1) U1's buildability floor no longer `KNOWN` from a King County parcel alone — gated on
real SMC 23.84A.024 "lot" qualification + existence-as-of-effective-date evidence, defaulting
`REQUIRES_VERIFICATION`; (2) SMC 23.44.060.D.1 (fraction rounding)/D.6+E (density-countable-lot-
area exclusions) modeled as new candidates U16/U17 and a `DensityFacts` fact-pair, replacing every
density figure's prior silent use of raw parcel area; (3) `BuildableEnvelopeFacts` made
scenario-scoped (not one global structure), a `LotLineRoles` concept added documenting this unit's
UI has no role-establishment mechanism (honest `INSUFFICIENT` default), and side-setback averaging
modeled as a labeled conservative 3 ft-minimum approximation, not a naive buffer; (4) a generalized
`RegulatoryRuleApplicabilityScope` added so Unit 5 candidates are real governed `RegulatoryRule`
rows evaluated through the same path as every other unit — resolving a genuine self-contradiction
between the prior `business-rules.md` and `business-logic-model.md` drafts; (5) a new BR-U5-9
Vacant-Land Screening Coverage Readiness gate added, mirroring Unit 4's BR-U4-9, staying `false`
through the POC; (6) the real persistence/migration consequence of the discriminated
`ScreeningRequest` union documented (nullable columns + a DB-level `CHECK` constraint). All 4
standard Functional Design artifacts plus the research doc are updated. Professional review remains
deferred to the same post-POC milestone Unit 4 established — not revisited.

**Final correction pass applied 2026-08-27**: the 6 corrections above were approved; the founder
found 3 further localized correctness defects in that correction pass itself, all now fixed: (1)
the side-setback "conservative" approximation had been implemented backwards (a flat 3 ft minimum
does not satisfy a 5 ft average — corrected to a flat 5 ft on each averaging-governed side, labeled
"conservative fixed-5-foot approximation"); (2) the ACTIVE-only rule-governance discipline had not
been applied to U1/U2 consistently with U3-U17 (U2 was still described as "remains `KNOWN`" — now
both are explicitly split into candidate semantics vs. current POC execution, where no `ACTIVE`
Unit 5 rule means no governed U1/U2 finding either, disclosed the same way as every other
candidate); (3) `BuildableEnvelopeFacts`' ECA `KNOWN` branch lacked the actual exclusion geometry
`ST_Difference` needs — an area scalar alone cannot produce `buildablePolygon` — now carries real
`excludedGeometry`/`provenance`, with `buildableAreaSqFt`/`buildablePolygon` staying `undefined`
when geometry (not just area) is unavailable. Plus a small doc-cleanup fix (U16/U17 cross-reference
mislabeling in the density section intro). **Unit 5 Functional Design is now APPROVED/COMPLETE** —
proceeding directly to NFR Requirements, per explicit instruction, with no further Functional
Design review gate held.

**Story cluster**: VL-1 through VL-5 (`aidlc-docs/inception/user-stories/stories.md`), explicitly
**not** part of the `SRE-*` project-type family — *"Distinct customer journey per approved
Question 7 — reuses Property Resolution, Payment, Accounts, and Report Delivery epics; does NOT
use Project Configuration's proposed-structure concepts."* Real acceptance criteria (verbatim,
condensed): VL-1, enter vacant-land screening directly from a resolved parcel with no Project
Configuration step, available "whenever the resolved parcel is vacant, or the user explicitly
chooses the vacant-land screening path for a parcel with an existing structure they intend to
redevelop"; VL-2, parcel characteristics + zoning summary (zoning explicitly labeled "not an
official zoning map"); VL-3, mapped constraints (ECA/FEMA/setback envelopes) + a preliminary
buildable-area figure **only when defensibly supported**, else `REQUIRES VERIFICATION`; VL-4,
plausible supported residential-use scenarios + diligence risks, each tied to evidence; VL-5, a
**deterministic** preliminary screening assessment ("preliminary screening assessment," never
"recommendation") with the LLM limited to explaining it, never determining it — same non-
authoritative-LLM boundary this project has held since Unit 1's Report Explanation.

**Unit definition** (`unit-of-work.md`): *"Delivers: the distinct vacant-land customer journey —
'is this parcel worth deeper investigation?' — reusing the shared pipeline without forcing
project-configuration concepts onto it... Stands up: Vacant-Land Screening Service (new). Extends:
Regulatory Rules Engine (`evaluateVacantLand`), Spatial Analysis (buildable-envelope calculation),
Report Explanation (`explainVacantLandAssessment`)."* **Depends on**: Unit 2B, Unit 3 — both
complete. `unit-of-work-dependency.md` separately confirms no technical dependency on Unit 4.

**Ground truth checked before writing this plan** (research pass, Explore agent, 2026-08-27):

- **`WorkflowType`/`ProjectDetails` schema gap is real and unresolved in code.**
  `src/screening-request/types.ts`'s `WorkflowType` const has exactly one member
  (`EXISTING_PROPERTY`), with its own comment anticipating growth ("as the set of supported types
  grows"). `ScreeningRequest.projectType`/`.projectDetails` are **required, non-optional** fields —
  there is no shape today for a screening request with no proposed structure. But Inception-level
  design docs already point toward the answer: `services.md` describes a "Vacant-Land Screening
  Service" creating "a Screening Request of workflow type 'vacant-land'... no project-configuration
  concepts"; `components.md` says Screening Request must "Own: workflow type (existing-property
  project preflight vs. vacant-land screening)... selected project type (**where applicable**)."
  None of this has been implemented — the exact schema shape is Functional Design's to decide, not
  already settled.
- **No regulatory rule content exists for the actual vacant-land question set.** Every SMC 23.44
  citation in this codebase (Units 1 and 4) is an accessory-structure provision (setback/height/
  lot-coverage for a shed or garage) — never touched for "is this an independently buildable lot,"
  minimum lot size, or density. `SMC 23.44.060` (maximum density and minimum lot size) has never
  been read or cited anywhere in `aidlc-docs/`. Unit 0B's Track 2 (the only prior Tier-1/Tier-2
  regulatory sample) covered 1 shed + 4 garage rules — zero vacant-land content. `requirements.md`
  §MVP-Boundaries explicitly excludes **subdivisions** from scope — a real, load-bearing constraint
  on how far "buildable lot" analysis can go.
- **The only prior vacant-land artifact is illustrative, not researched.**
  `unit-0-pre-construction-validation/sample-reports.md`'s "Sample Report 3 — Vacant-Land
  Screening" is a hand-built mock-up of the desired VL-5 narrative framing, built from real
  Assessor `vacant`/`PREUSE_DESC` parcel data but with **no real zoning/buildable-envelope rule
  evaluation behind it** — must not be treated as validated content.
- **"Vacant" exists in the codebase today only as a parcel *characteristic*, never a workflow.**
  `src/parcel-resolution/types.ts`'s `vacant: boolean` (populated from King County's `PREUSE_DESC`)
  is the only real "vacant" concept in `src/` — confirmed via a full-codebase grep. No
  buildable-envelope computation, no vacant-land evaluation path, nothing beyond this one flag.
- **VL-1's own text creates a real scope question** (not resolved by re-reading it more closely):
  the vacant-land path must be enterable "whenever the resolved parcel is vacant, **or** the user
  explicitly chooses the vacant-land path for a parcel with an existing structure they intend to
  redevelop" — i.e., VL-1 does not restrict the vacant-land journey to parcels the system itself
  flags `vacant: true`. Whether Unit 5 builds real support for that second case (a non-vacant
  parcel where the user wants to ask "what could I build here after redevelopment," ignoring the
  existing structure) or defers it is a real, undecided scope call.
- **Buildable-envelope computation is a genuinely new spatial capability**, not a reuse of Unit 1/4's
  setback-distance machinery. `computeSetbackDistances` measures distance from a *given proposed
  footprint* to lot lines; VL-3 needs the inverse — the actual buildable *area/polygon* remaining
  after every applicable setback/critical-area constraint is subtracted from the parcel boundary
  (a real `ST_Buffer`/`ST_Difference`-class PostGIS operation this project has never performed) —
  or, if that's out of scope for this pass, an honest `REQUIRES VERIFICATION` in its place.

## Questions

**Q1. `WorkflowType`/`ProjectDetails` schema shape for a structure-less screening request.**
`ScreeningRequest.projectType`/`.projectDetails` are currently required fields with no
accommodation for "no proposed structure." Inception's own design docs anticipate a second
`WorkflowType` value but never specified its exact shape.
- **A**: Add `WorkflowType.VACANT_LAND`. Make `projectType`/`projectDetails` **optional** on
  `ScreeningRequest`/`ScreeningRequestSnapshot` — present and required for `EXISTING_PROPERTY`,
  absent for `VACANT_LAND`. A new, separate `VacantLandDetails`-shaped type (whatever minimal
  intake facts VL-2/VL-3/VL-4 actually need — likely nothing beyond the confirmed parcel itself)
  replaces `projectDetails` conceptually for this workflow, without forcing it into the
  `ProjectDetails` union (which is specifically the shed/garage proposed-structure family).
- **B**: Something else — describe.
- [Answer]: **B** — not option A's loosely-optional-fields approach. Make `ScreeningRequest`/`ScreeningRequestSnapshot` a real `workflowType`-discriminated union: `EXISTING_PROPERTY` keeps `projectType`/`projectDetails` required; `VACANT_LAND` has neither field at all (structurally absent, not optional-and-unset) and instead carries a separate `VacantLandDetails` structure containing only genuine vacant-land-workflow inputs. Invalid workflow/field combinations must be unrepresentable where practical. Do not add `VACANT_LAND` to `ProjectType`.

**Q2. VL-1's "redevelop an existing structure" edge case.**
- **A**: In scope for Unit 5 — a user may explicitly choose the vacant-land path for a parcel
  `vacant: false` flags as having an existing structure; Unit 5 builds real support for this
  (the evaluation simply proceeds as if the parcel were vacant, ignoring the existing structure,
  per VL-1's own "intend to redevelop" framing).
- **B**: Out of scope for Unit 5 — restrict the vacant-land path to parcels the system itself
  flags `vacant: true`; the "redevelop" case is a real story gap to flag for a later unit, not
  silently dropped.
- **C**: Something else — describe.
- [Answer]: **C** — the VL-1 redevelopment case IS in scope for Unit 5, but do not model a non-vacant parcel as though the system believes it is literally vacant. Add an explicit vacant-land screening intent concept (`VACANT_PARCEL` / `REDEVELOP_EXISTING_PARCEL`). For `REDEVELOP_EXISTING_PARCEL`, the deterministic assessment may evaluate future development potential under an explicit assumption that existing improvements can be removed where necessary, but must NOT silently erase property-specific issues such as existing legal/nonconforming status, demolition requirements, easements, vested rights, or other existing-condition dependencies the rule research uncovers — if those materially affect an assessment and are not known, use `REQUIRES_VERIFICATION`. Do not expand Unit 5 into demolition-permit analysis unless the regulatory research shows a fact is strictly necessary for VL-2 through VL-5.

**Q3. Vacant-land regulatory rule research — do now, as its own bounded pass, or scope down first.**
No Tier-1/Tier-2 regulatory content exists yet for "is this an independently buildable lot"
(minimum lot size/density, SMC 23.44.060 and whatever else actually governs it — unread so far).
- **A**: Do a bounded, Unit-4-style live research + Tier-1/Tier-2 triage pass now, scoped
  specifically to what VL-2/VL-3/VL-4 actually need (parcel/zoning characteristics, mapped
  constraints, buildable-lot-status, plausible residential-use scenarios) — real citations, real
  triage, explicit `REQUIRES VERIFICATION` where evidence doesn't support a defensible answer, same
  discipline as Unit 4's own inventory. Do not assume this will be simpler than Unit 4's — surface
  whatever the real research finds, including if it's Tier-2-heavy again.
- **B**: Scope the first Functional Design pass to VL-1/VL-2 (parcel-characteristics/zoning summary
  + the workflow/schema plumbing) only, deferring VL-3/VL-4's actual regulatory buildable-area/
  scenario content to a follow-up pass once the schema foundation is in place.
- **C**: Something else — describe.
- [Answer]: **A** — perform the bounded live vacant-land regulatory research + Tier-1/Tier-2 triage now, scoped to what VL-2 through VL-5 actually require. Start with the current relevant SMC provisions including 23.44.060, but do not assume in advance it is the only relevant section — read actual current cross-references required to resolve those questions. Produce a rule inventory with current citation, rule meaning, applicability, required facts, evidence availability, Tier 1/Tier 2, unavailable-fact behavior, and eventual reviewer type where Tier 2. Subdivisions remain explicitly OUT OF SCOPE. Professional review remains deferred to the existing post-POC Regulatory Professional Review/Commercialization Gate — research/triage now, do not hire or engage a professional.

**Q4. Buildable-envelope computation — real geometry now, or `REQUIRES_VERIFICATION`-only for this
pass.**
- **A**: Build the real PostGIS buildable-envelope computation (parcel boundary minus applicable
  setbacks minus critical-area intersections) as new Spatial Analysis capability in this unit —
  a real, load-bearing new spatial operation, not a small addition.
- **B**: Do not build real buildable-envelope geometry in Unit 5 — VL-3's buildable-area figure is
  `REQUIRES_VERIFICATION` by design for this pass (mapped constraints are still evaluated and
  presented; only the specific "here is N square feet buildable" computation is deferred), matching
  VL-3's own acceptance criteria's explicit allowance ("a preliminary buildable-area figure is
  presented ONLY when defensibly supported... else REQUIRES VERIFICATION").
- **C**: Something else — describe.
- [Answer]: **A**, with a fail-closed evidence gate. Build the real PostGIS buildable-envelope capability in Unit 5 — a genuine new Spatial Analysis capability and part of Unit 5's purpose. Implement the geometry needed to derive a candidate buildable polygon/area from the parcel boundary and applicable known setback/exclusion geometry, using PostGIS as the spatial source of truth. However, building the capability does not mean always reporting a buildable-area number — a preliminary buildable-area figure may be presented only when all regulatory and spatial inputs necessary for that figure are sufficiently established; if an applicable setback, ECA exclusion, mapped constraint, discretionary condition, or other required geometry cannot be defensibly resolved, do not silently omit it, do not report a partial polygon as "the buildable envelope," produce `REQUIRES_VERIFICATION` instead. It is acceptable and expected for many real parcels to remain `REQUIRES_VERIFICATION` under the POC's current data coverage. Do not add new external providers simply to force a numeric result — if the research discovers a new external dataset is materially necessary, surface it for founder decision rather than improvising an integration.

**Q5. Frontend scope — a real, separate customer-facing entry point, or defer the UI.**
VL-1 requires entering vacant-land screening "directly from a resolved parcel," bypassing Project
Configuration (`/configure`'s existing TYPE step) entirely — a parallel intake path, not a branch
inside the existing wizard.
- **A**: Include the real customer-facing UI in Unit 5 — a new entry point (e.g. a
  `/screen-vacant-land`-style route, or a choice presented earlier than `/configure`'s TYPE step)
  that skips straight from address/parcel confirmation to the vacant-land report, matching Unit 4's
  own precedent of including the real UI change rather than deferring it.
- **B**: Defer the real UI to a later pass — Unit 5 builds the domain/schema/regulatory-evaluation
  machinery and proves it via tests + an internal/API-level path only, no new customer-facing route
  yet.
- **C**: Something else — describe.
- [Answer]: **A** — include the real customer-facing vacant-land journey in Unit 5. It must remain distinct from Project Configuration. Do NOT add `VACANT_LAND` as another option inside `/configure`'s shed/garage `ProjectType` step. Create the minimal separate workflow needed so that address/parcel resolution → vacant-land or redevelopment screening selection → vacant-land-specific flow → assessment/report can occur without proposed-structure configuration. Reuse existing parcel-resolution UI/components where practical rather than duplicating the entire address-resolution implementation. Exact route/component decomposition is an implementation detail — prefer the smallest clean design that establishes the distinct workflow.

**Additional design invariant (founder, verbatim)**: Unit 5 is the first second-WORKFLOW implementation, not merely the third project type — preserve that distinction throughout Functional Design. `WorkflowType`: `EXISTING_PROPERTY`, `VACANT_LAND`. Existing-property `ProjectType`: `SHED`, `GARAGE`, future project types. Vacant-land screening: no proposed `ProjectType`, no proposed-structure `ProjectDetails`, its own evaluation/service path, reuses shared parcel intelligence, spatial analysis, evidence/report, payment/delivery infrastructure where appropriate.

## What This Stage Produces

Once answered, Part 2 will (subject to the answers above): perform Q3's research pass (if `A`),
producing `vacant-land-rule-inventory-and-tier-triage.md` matching `garage-rule-inventory-and-tier-
triage.md`'s exact format; then the standard 4 Functional Design artifacts
(`domain-entities.md`, `business-rules.md`, `business-logic-model.md`, `frontend-components.md`)
scoped per Q1/Q2/Q4/Q5's answers.

- [x] `aidlc-docs/construction/unit-5-vacant-land/functional-design/vacant-land-rule-inventory-and-tier-triage.md` (if Q3=A)
- [x] `aidlc-docs/construction/unit-5-vacant-land/functional-design/domain-entities.md`
- [x] `aidlc-docs/construction/unit-5-vacant-land/functional-design/business-rules.md`
- [x] `aidlc-docs/construction/unit-5-vacant-land/functional-design/business-logic-model.md`
- [x] `aidlc-docs/construction/unit-5-vacant-land/functional-design/frontend-components.md`
