# Unit 5 — Business Logic Model (Vacant Land)

Technology-agnostic workflows. Entities per `domain-entities.md`, decision rules per
`business-rules.md`. Extends Unit 1's Workflow 1 (Parcel Resolution, fully reused unchanged) and
Unit 2's Report Generation/Delivery workflows (reused unchanged past evaluation) — this document
covers only what Unit 5 adds or changes.

---

## Workflow U5-1: Vacant-Land Intake (extends nothing inside `/configure` — a parallel entry point,
BR-U5-6)

1. Address/parcel resolution — **reuses Unit 1's Workflow 1 exactly unchanged** (Property
   Resolution has no vacant-land-specific behavior; a resolved parcel is a resolved parcel
   regardless of which journey follows it).
2. **New step (Correction 5, BR-U5-9) — Vacant-Land Screening Coverage Readiness gate**: before the
   screening-intent selection is even offered, the entry point queries whether vacant-land
   screening is publicly advertised as available (`isVacantLandScreeningCoverageReady`-equivalent,
   mirroring Unit 4's `available-project-types` route) — server-exposed, never a client-side
   assumption. Stays `false` throughout the POC (BR-U5-9), so in practice the vacant-land entry
   point does not yet advertise itself as available; this step exists so the mechanism is real and
   in place, exactly as Unit 4's TYPE step now works.
3. Once a parcel is confirmed **and** the coverage-readiness gate permits it, the user is offered a
   **screening-intent selection** distinct from `/configure`'s TYPE step: "Screen this vacant lot"
   (available whenever the confirmed parcel's own `vacant` characteristic is `true`) and/or "Screen
   for potential redevelopment" (always available, regardless of the `vacant` characteristic).
4. Selecting either creates a `VacantLandScreeningRequest` with `workflowType: "VACANT_LAND"` and
   `screeningIntent` set to `VACANT_PARCEL` or `REDEVELOP_EXISTING_PARCEL` respectively
   (`domain-entities.md`) — **no Project Configuration step follows** (VL-1's own explicit
   acceptance criterion). `vacantLandDetails` is the minimal `{ screeningIntent }` shape; no
   dimension/placement/other intake is collected.
5. The request proceeds through the same authorization/payment flow Units 2/2B already built
   (`checkReadiness`, `initiateCheckout`), gated a **second, authoritative time** server-side by the
   same coverage-readiness check (BR-U5-9's two-layer discipline — public advertisement is never
   trusted alone) — `checkReadiness`'s existing `projectType: string` parameter becomes irrelevant
   for this workflow variant (a `VacantLandScreeningRequest` has none); `checkReadiness` (or an
   equivalent workflow-aware readiness check) branches on `workflowType` first, per BR-U5-1's
   discriminated union, before ever looking for a `projectType`.

## Workflow U5-2: Vacant-Land Regulatory Evaluation (new — evaluates through the same governed
`RegulatoryRule` path Units 1/4 already use, per `RegulatoryRuleApplicabilityScope` — **corrected
per founder review, Correction 4**)

**Corrected per founder review**: the prior draft evaluated SMC-derived numbers directly inside
this workflow while `business-rules.md` simultaneously claimed no Unit 5 candidate is ever
governance-drafted as a `RegulatoryRule` row — a real, self-caught contradiction (hardcoding
regulatory numbers here would have bypassed the governed-rule lifecycle every other unit respects).
This workflow now queries `ACTIVE` `RegulatoryRule` rows scoped by
`{ workflowType: "VACANT_LAND" }` (`RegulatoryRuleApplicabilityScope`, `domain-entities.md`) through
the same evaluator path Units 1/4 use — no SMC citation numbers appear as literals in this
workflow's own code; they live exclusively in governed `RegulatoryRule` content, exactly like every
prior unit.

1. Receive the confirmed parcel's `PropertyContext`/`SpatialResult` (unchanged Property
   Intelligence/Spatial Analysis pipeline — no new data source) and the request's `screeningIntent`.
2. **Buildability & use** (U1, U2), evaluated via the governed `RegulatoryRule` path — **corrected
   a second time per founder review (Correction 2 of the final pass)**: the ACTIVE-only rule query
   governs *every* regulatory candidate in this workflow, not only the density/height/coverage
   scenario figures. U1 and U2 are queried by `RegulatoryRuleApplicabilityScope` exactly like
   U3-U17; neither is hardcoded into this workflow's own code. Two separate axes, stated plainly so
   they are never conflated again:
   - **Candidate semantics** (what the rule *would* determine, once governed content exists): if
     U2's governed rule is eventually `ACTIVE` and the ordinary-residential-use applicability facts
     are established, its deterministic result can be `KNOWN`. If U1's governed rule is eventually
     `ACTIVE`, its result still defaults to `REQUIRES_VERIFICATION` for the separate, independently
     -evidenced lot-qualification/existence-date facts (Correction 1, unchanged) — being `ACTIVE`
     does not itself resolve U1's evidence gap.
   - **Current POC execution** (BR-U5-5: zero Unit 5 candidates are `ACTIVE` in this unit): no
     `ACTIVE` U1 rule ⇒ no governed U1 regulatory finding is produced — disclosed as no coverage,
     the same `uncoveredConstraintTypes`-style mechanism used for U3-U17. No `ACTIVE` U2 rule ⇒
     same treatment — U2's finding is **not** presented as `KNOWN` in the deployed POC merely
     because its candidate rule text is Tier 1 and textually unambiguous. Both reuse `Finding`'s
     existing classification vocabulary unchanged, and both flow through the same no-`ACTIVE`
     -coverage disclosure path as every other candidate in this workflow.
3. **Assemble `DensityFacts`** (`domain-entities.md`, U16 — **new, Correction 2**):
   `rawParcelAreaSqFt` from the confirmed parcel boundary (reuses `computeParcelAreaSqFt`, Unit 4's
   own addition, unchanged); `densityCountableLotAreaSqFt` computed via the same PostGIS
   ECA-area-of-overlap capability gap named at U4/U7/U11/U13 — `undefined` (fail-closed) whenever
   D.6-listed area might intersect the parcel but is not measurable, **never silently defaulted to
   `rawParcelAreaSqFt`**.
4. **For each scenario** the rule inventory's U3-U7/U16-U17 (density)/U8 (height)/U10-U15 (lot
   coverage) candidates support:
   a. **Assemble that scenario's own `BuildableEnvelopeFacts`** (**corrected — Correction 3**, now
      per-scenario, not assembled once globally):
      i. `rawParcelAreaSqFt` — same source as step 3.
      ii. `setbackConstrainedArea` — `ESTABLISHED` only when **both** `LotLineRoles.status` is
          `ESTABLISHED` for this parcel (`domain-entities.md` — expected to be `INSUFFICIENT` for
          essentially every real evaluation in this unit's current UI, since no placement step
          exists to establish it) **and** this scenario's own Table A setback branch (U9) is
          resolved; `REQUIRES_VERIFICATION` otherwise. Where the side-setback-averaging branch
          governs, a flat **5 ft on each** averaging-governed side is applied — **corrected a
          second time, per founder review**: the prior draft's flat 3 ft minimum was backwards (a
          3 ft/3 ft condition averages to 3 ft, not 5 ft, and does not satisfy the rule) — labeled
          explicitly as a "conservative fixed-5-foot approximation"
          (`isConservativeSideSetbackApproximation: true`), never presented as the precise
          achievable envelope, and understood to potentially understate (never overstate) the true
          maximum buildable area. Table A footnote exceptions are independently
          `REQUIRES_VERIFICATION` when unestablished.
      iii. `ecaExclusionArea` — `KNOWN` only when a measurable ECA-area intersection exists **and**
           its actual authoritative exclusion geometry (not merely an area number) is available for
           `ST_Difference` — **corrected, new requirement**: an area scalar alone can never produce
           `buildablePolygon`; `NOT_APPLICABLE` only when confidently no such area exists — same
           gap as step 3, now further gated on geometry availability specifically.
      iv. `buildableAreaSqFt`/`buildablePolygon` — computed only when (ii) is `ESTABLISHED` and
          (iii) is `NOT_APPLICABLE` or `KNOWN` **with real exclusion geometry**; `undefined`
          otherwise (including when an exclusion area is known numerically but its geometry is
          not — never guessed by subtracting a scalar), per BR-U5-3's fail-closed gate — expected
          to be `undefined` for essentially every real evaluation today, given (ii)'s
          `LotLineRoles` dependency alone. No new ECA geometry provider is added in this unit to
          make this path reachable — the point of this correction is structural correctness when
          exercised with synthetic/known geometry, not more frequent resolution today.
   b. Compute `maxDwellingUnits` (from `densityCountableLotAreaSqFt`, never `rawParcelAreaSqFt`
      directly, with SMC 23.44.060.D.1's fraction-rounding rule (U17) applied as the final step —
      **new, Correction 2**) / `maxHeightFt` / `maxLotCoveragePercent`, each independently `KNOWN`
      or `REQUIRES_VERIFICATION` per that specific candidate's own required facts, evidence
      availability, and (per this correction) whether the governing `RegulatoryRule` row is itself
      `ACTIVE` — since BR-U5-5 confirms none are within this unit, every scenario figure whose
      supporting candidate has no `ACTIVE` row is reported via the **same
      `uncoveredConstraintTypes`-style disclosure mechanism Unit 4 established**
      (`regulatory-rules-engine/types.ts`, reused unchanged — **reinstated, correcting the prior
      draft's claim that no such mechanism was needed**), not silently omitted. A scenario's own
      configuration (unit type/story count/amenity arrangement) is treated as an assumption of that
      hypothetical scenario, not evidence-gated; the parcel's own physical facts feeding into it
      are.
5. **Diligence risks** (VL-4): any `REQUIRES_VERIFICATION` finding produced above (U1's
   lot-qualification/existence-date gap, missing ECA measurement, missing transit-area data,
   `LotLineRoles.status === "INSUFFICIENT"`, an unresolved U6/U8/U13 Tier-2 question, no-`ACTIVE`-
   coverage, or — for `REDEVELOP_EXISTING_PARCEL` — a materially-affecting existing-condition
   unknown per BR-U5-2) is surfaced explicitly as a diligence risk, not buried inside a scenario's
   own figures alone.
6. Assemble `VacantLandEvaluationOutcome` (`domain-entities.md`) from steps 2-5 — `densityFacts`
   populated from step 3; each scenario in `scenarios` carries its own `buildableEnvelope` from
   step 4a, not a shared top-level field.

**Stated plainly, not smoothed over**: given BR-U5-5 (no Unit 5 `RegulatoryRule` reaches `ACTIVE`
in this unit) and `LotLineRoles`' structural `INSUFFICIENT` default (Correction 3), this workflow's
actual behavior in the deployed POC is dominated by `REQUIRES_VERIFICATION`/no-coverage results
across nearly every finding and scenario figure — a materially more comprehensive
`REQUIRES_VERIFICATION` posture than the prior draft implied. Code Generation must build the
`REQUIRES_VERIFICATION`/no-coverage disclosure path as the **common** case, not a rare branch.

## Workflow U5-3: Report Assembly and Explanation (VL-5)

1. The deterministic `VacantLandEvaluationOutcome` (Workflow U5-2) is the sole source of the
   preliminary screening assessment — reuses Unit 2's Evidence & Report Artifact immutability
   discipline unchanged (a fresh, immutable snapshot at generation time).
2. Report Explanation (BR-U5-7) is invoked with the deterministic findings/scenarios/diligence
   risks — the LLM explains and synthesizes them in plain language, using "preliminary screening
   assessment" framing throughout, and recommends next diligence steps **only** as an explanation
   of the deterministic `REQUIRES_VERIFICATION` findings already present (e.g. "confirm utility
   availability," "consult a geotechnical engineer if the steep-slope exclusion status matters for
   this scenario") — never as independent LLM-originated advice untethered from a specific
   deterministic finding.
3. If Report Explanation is unavailable, the deterministic assessment (findings, scenarios,
   buildable envelope, diligence risks) is still delivered in full — RGD-5's existing degradation
   behavior, unchanged.
4. Report rendering/delivery (access credential issuance, PDF rendering, payment/delivery
   infrastructure) reuses Units 2/2B's existing machinery entirely unchanged — nothing about
   report-artifact immutability, access-credential issuance, or delivery differs by workflow type.

**Explicitly not addressed by this document**: the actual U1-U17 candidate content reaching
`ACTIVE` (BR-U5-5 — deferred, same post-POC milestone as Unit 4); any new external data
integration for the ECA-area-of-overlap or transit-service-area gaps (BR-U5-3 — not added in this
unit); any new lot-line-role-establishment UI (`LotLineRoles`, `domain-entities.md` — a future,
not-yet-built minimal reuse of `ParcelPlacementMap`'s edge-tap sub-behavior, per Correction 3).
Workflow U5-2's steps 2-4 are expected to produce `REQUIRES_VERIFICATION` (or no-`ACTIVE`-coverage)
for the large majority of real parcels' buildability finding, buildable-area figure, and several
scenario figures, by design — this is stated plainly so Code Generation does not under-build the
`REQUIRES_VERIFICATION`/no-coverage disclosure path as a rare branch.
