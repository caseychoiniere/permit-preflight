# Unit 4 — Domain Entities (Detached Garages)

**Revised 2026-08-26 per founder review — 2 corrections applied**: (1) `GarageProjectDetails` no
longer contains `proposedFootprintSqFt`/`lotAreaSqFt` — those were trusted, server-derived facts
that had been placed, wrongly, inside the client-submitted project-input contract; they are now
computed server-side into a new `LotCoverageFacts` structure instead (Correction 3); (2) that new
structure also formalizes the raw-parcel-area-vs-countable-lot-area distinction Correction 2 found
missing, and its `existingStructuresFootprintSqFt` origin is now explicit `USER_SUPPLIED` per the
founder's Q1-fallback decision.

**Revised again 2026-08-26 (regulatory-completeness pass, round 2)**: `LotCoverageFacts` is
expanded from a single percentage-of-raw-area model to the full SMC 23.44.080 A-G structure
(`garage-rule-inventory-and-tier-triage.md`'s L1-L6) — it now supports an applicable **allowed
coverage** quantity (percentage selection + the D minimum floor), not merely
`countableLotAreaSqFt * 0.50`. `existingStructuresFootprintSqFt`'s semantics are corrected to ask
for the SMC-*countable* existing-structure area (per C's numerator exclusions), not raw/gross
footprint.

**Revised a third time 2026-08-26 (final targeted correction)**: `applicableCoveragePercentage` and
`minimumCoverageFloorSqFt` were bare optional numbers that overloaded `undefined` with two
materially different meanings ("confidently does not apply" vs. "genuinely unresolved"). Both are
now small discriminated result types instead, so the deterministic evaluator can tell these apart
without guessing.

Extends Unit 1/2's domain model. Only what's new or changed is documented here — everything else
(`PropertyContext`, `SpatialResult`, `CriticalAreaFinding`, `RegulatoryRule`, `InferencePolicy`,
`Order`, `ReportGenerationJob`, `AdminActionLog`, `DataSourceHealth`, etc.) is unchanged.

## `ProjectType` — extended, not replaced

```ts
export const ProjectType = {
  SHED: "shed",
  GARAGE: "garage",
} as const;
```
`SUPPORTED_PROJECT_TYPES` (`screening-request/repository.ts`, `screening-request/authorization.ts`)
gains `GARAGE` alongside `SHED` — both are now real, persistable, evaluable project types.

## `ProjectDetails` — new discriminated union (Q3=A)

Replaces `evaluate.ts`'s exclusive dependency on `ShedProjectDetails` with a discriminated union,
per the founder's explicit answer: not a bag of optional fields, an exhaustiveness-checkable union.

```ts
export type ProjectDetails = ShedProjectDetails | GarageProjectDetails;

export interface ShedProjectDetails {
  projectType: typeof ProjectType.SHED;
  widthFt: number;
  depthFt: number;
  heightFt: number;
  alleyAdjacent: boolean;
  distanceToRearLotLineFt?: number;
  distanceToSideLotLineFt?: number;
  distanceToFrontLotLineFt?: number;
  spatialEvidenceQuality?: EvidenceQuality;
}

export interface GarageProjectDetails {
  projectType: typeof ProjectType.GARAGE;
  widthFt: number;
  depthFt: number;
  heightFt: number;
  alleyAdjacent: boolean;
  distanceToRearLotLineFt?: number;
  distanceToSideLotLineFt?: number;
  distanceToFrontLotLineFt?: number;
  spatialEvidenceQuality?: EvidenceQuality;
  /** New fact this project type alone needs (SRE-GARAGE-1). USER_SUPPLIED by explicit founder
   * decision (2026-08-26, resolving lot-coverage-data-source-validation.md's Q1 finding that no
   * automated authoritative source exists) - never a verified fact, always drives the resulting
   * lot-coverage finding to REQUIRES_VERIFICATION (business-rules.md BR-U4-3) regardless of value.
   * Absent/undefined when the applicant does not supply it - never defaulted to 0. An explicit `0`
   * is accepted only as a deliberate user assertion ("no existing structures"), never inferred.
   * SEMANTICS CORRECTED 2026-08-26 (regulatory-completeness pass, round 2): asks for the COUNTABLE
   * existing-structure area under SMC 23.44.080.C's numerator exclusions (excludes underground
   * structures, the first 36" of eave/cornice/gutter/roof projections, decks <=36" above grade,
   * unenclosed porches/steps <=4ft, certain unenclosed structures per 23.44.090.H) - NOT simply the
   * gross/raw footprint of every existing structure. Intake wording must ask for this specific
   * quantity (frontend-components.md); still always REQUIRES_VERIFICATION regardless of value,
   * since it remains self-reported and unverified - the correction is about WHAT is being asked
   * for, not about upgrading its trust level. */
  existingStructuresFootprintSqFt?: number;
}
```

**Correction 3 (2026-08-26)**: `GarageProjectDetails` intentionally does **not** contain
`proposedFootprintSqFt` or `lotAreaSqFt`. An earlier version of this document put both fields
directly on the client-submitted project-details contract — wrong, because both are trusted,
server-derived facts (the garage's own footprint area, computed from validated dimensions/
placement; the parcel's area, from the confirmed authoritative parcel boundary), and
`ScreeningRequest.projectDetails` is exactly the client-submitted input JSON a later step could, in
principle, tamper with if it were allowed to assert a parcel-derived number directly. Per this
project's already-established pattern (sheds' setback *distances* are likewise never trusted from
the client — PostGIS computes them; `ParcelPlacementMap`'s own `proposedFootprint` polygon is
client-constructed geometry passed as a computation *input*, not a persisted authoritative area
number), the garage's footprint area and the parcel's area are computed server-side at evaluation
time into `LotCoverageFacts` (below) — never persisted as claimed values inside
`GarageProjectDetails` itself.

`ShedProjectDetails`'s field set is **unchanged in shape** (only the wrapping type moved from a
single interface to one member of a union) — no existing shed test or evaluation behavior changes.

## `LotCoverageFacts` — new internal, server-derived evaluation-facts structure (revised round 2)

Not part of `ProjectDetails`, not persisted on `ScreeningRequest`, never client-supplied. Assembled
by Workflow U4-1 at evaluation time from trusted inputs only, and consumed by the full L1-L6
lot-coverage candidate set (`garage-rule-inventory-and-tier-triage.md`). **Revised this pass to
support an applicable ALLOWED COVERAGE quantity** (percentage selection + the D floor), not merely
`countableLotAreaSqFt * 0.50` — the founder's explicit correction to the prior single-percentage
model:

```ts
export interface LotCoverageFacts {
  /** From the confirmed parcel boundary polygon (Property Intelligence / spatial analysis's
   * existing authoritative pipeline - never client-asserted). L1's starting point. */
  rawParcelAreaSqFt: number;

  /** The garage's own COUNTABLE footprint (L3/23.44.080.C's numerator exclusions applied - e.g.
   * eave overhang within the first 36" is not counted), computed from validated
   * GarageProjectDetails.widthFt x depthFt, never client-asserted as a pre-computed number. */
  proposedGarageCountableFootprintSqFt: number;

  /** Copied directly from GarageProjectDetails.existingStructuresFootprintSqFt - USER_SUPPLIED,
   * unverified (BR-U4-3), and now explicitly asked to already reflect L3/23.44.080.C's numerator
   * exclusions (not raw/gross footprint - see GarageProjectDetails's own field comment). undefined
   * when not supplied - never defaulted. */
  existingStructuresCountableFootprintSqFt?: number;

  /** L2/23.44.080.B+E's area excluded from the DENOMINATOR (riparian corridors, wetlands/buffers,
   * submerged lands/shoreline setback, designated steep-slope non-disturbance area per E's own
   * relief/waiver/variance carve-outs). Populated ONLY when the system has sufficient authoritative
   * spatial evidence to measure it - per lot-coverage-data-source-validation.md's finding, this
   * condition is essentially never met today (no area-of-intersection computation exists for any of
   * the 4 categories, and E's carve-outs are themselves administrative determinations this project
   * cannot query), so this field is expected to stay undefined for real evaluations. */
  excludedLotAreaSqFt?: number;

  /** rawParcelAreaSqFt - excludedLotAreaSqFt (L2's applicable denominator). Computed ONLY when
   * either (a) excludedLotAreaSqFt was successfully measured, or (b) the system has sufficient
   * evidence that NO exclusion category applies to this parcel at all. undefined otherwise -
   * downstream evaluation MUST produce REQUIRES_VERIFICATION, never silently reuse
   * rawParcelAreaSqFt as if it were already the countable area (business-rules.md BR-U4-7). */
  countableLotAreaSqFt?: number;

  /** L1 (50%) unless L5 (23.44.080.F, frequent-transit multi-unit) or L6 (23.44.080.G, stacked
   * dwelling units) is confidently established as applicable (60%). A discriminated result, NOT a
   * bare optional number (final targeted correction, 2026-08-26) - a bare `number | undefined`
   * cannot distinguish "confidently 50%, F/G checked and ruled out" from "F/G's applicability is
   * simply unknown," and those are materially different states the evaluator must be able to tell
   * apart. NEVER ESTABLISHED at 50 merely because F/G's applicability facts are unknown - per
   * explicit instruction, F/G's applicability is never assumed either included or excluded; a
   * confidently-excluded case (e.g. a single-dwelling lot with no stacked units, no qualifying
   * multi-unit configuration) legitimately reaches ESTABLISHED(50), the common case for this
   * product's typical applicant - it is not forced into REQUIRES_VERIFICATION just because 60% was
   * never assumed. */
  applicableCoveragePercentage:
    | { status: "ESTABLISHED"; percent: 50 | 60; basis: "L1_DEFAULT" | "L5_TRANSIT_BONUS" | "L6_STACKED_BONUS" }
    | { status: "REQUIRES_VERIFICATION"; reason: string };

  /** L4/23.44.080.D's minimum floor - 625 sq ft, or a greater Director-approved ECA-reduction
   * amount this project can never verify. A discriminated result, NOT a bare optional number (final
   * targeted correction, 2026-08-26) - the round-2 draft used `minimumCoverageFloorSqFt?: number`
   * and let `undefined` mean two different things ("L4 confidently does not apply because no
   * subsection-B area exists" vs. "L4 applicability/amount is unresolved because a subsection-B
   * area may exist and a greater Director-approved amount may also exist") - those are not
   * equivalent states and must not be inferred from mere absence of a number. */
  minimumCoverageFloor:
    | { status: "NOT_APPLICABLE" }
    | { status: "REQUIRES_VERIFICATION"; statutoryMinimumSqFt: 625; reason: string }
    | { status: "KNOWN"; amountSqFt: number; provenance: string };

  /** The final applicable allowed-coverage quantity - MAX(percent x countableLotAreaSqFt,
   * minimumCoverageFloor's amount) when minimumCoverageFloor is NOT_APPLICABLE or KNOWN; simply
   * percent x countableLotAreaSqFt when minimumCoverageFloor is NOT_APPLICABLE. Producible ONLY when
   * countableLotAreaSqFt is defined, applicableCoveragePercentage.status is ESTABLISHED, AND
   * minimumCoverageFloor.status is NOT_APPLICABLE or KNOWN - undefined whenever ANY of those is
   * itself unresolved/REQUIRES_VERIFICATION. The combined lot-coverage finding is
   * REQUIRES_VERIFICATION whenever this field is undefined, per
   * garage-rule-inventory-and-tier-triage.md's L1-L6 candidate set. minimumCoverageFloor.status
   * "KNOWN" is never fabricated - it is only reachable if a future capability can conclusively
   * confirm no Director-approved override exists, which nothing this unit builds today provides;
   * for now, any lot with a possible L2/B-listed area routes through minimumCoverageFloor's
   * REQUIRES_VERIFICATION state and this field stays undefined. */
  allowedCoverageSqFt?: number;
}
```

Naming matches the founder's own sketches across all three review rounds; the trust/semantic
distinctions (raw vs. countable, gross vs. SMC-countable, an allowed-coverage quantity rather than a
bare percentage, "does not apply" vs. "unresolved" rather than a single overloaded `undefined`,
user-supplied vs. server-derived) are the binding part, not the exact field/type names.

## `RegulatoryRule.applicableProjectType` — no change

Already a generic `string` field (`regulatory-rule-governance/types.ts`) — `"garage"` is a valid
value today with zero schema/type change. A garage `RegulatoryRule` row is structurally
indistinguishable from a shed one except for this field's value and its `ruleSpecification`
content.

## Garage rule content — NOT modeled here

Per Q2's answer, the actual garage `ruleSpecification`/`citation`/`caveats` content for the 13
candidates H1, H2, S1-S5, L1-L6 (`garage-rule-inventory-and-tier-triage.md`, revised 2026-08-26 —
round 2 decomposed lot coverage into 6 candidates and setback into 5, per the founder's
regulatory-completeness correction) is **not** defined as production candidate content in this
document —
it stays gated on professional review (`garage-rule-inventory-and-tier-triage.md` "Professional
Review — Committed, Explicitly Deferred to Post-POC") before any garage rule advances past
`DRAFTED`/`TRIAGED`, mirroring exactly how the real shed candidate (`tests/fixtures/shed-candidate.ts`)
is defined and honestly held at `TRIAGED` today. **That review is explicitly deferred to a post-POC
commercialization-gate milestone (founder sequencing correction, 2026-08-26)** — Unit 4 Construction
does not wait for it; a `garage-candidate.ts` fixture matching the shed pattern (held honestly at
`TRIAGED`, never fabricated as further along) is still the expected Code Generation artifact for
this unit, and remains at `TRIAGED` until the review eventually lands and the founder signs off,
whenever that turns out to be.

## Garage Screening Coverage Readiness — new concept, shape only (Correction 4)

A boolean-valued readiness predicate, distinct from `SUPPORTED_PROJECT_TYPES` (BR-U4-1, revised) —
see `business-rules.md` BR-U4-9 for its full definition and `business-logic-model.md` Workflow
U4-3 for where it's consulted. Not a new persisted entity; conceptually similar to
`checkReadiness`'s existing `ReadinessResult` (`screening-request/authorization.ts`) but answering
a governance/coverage question ("does GARAGE have the minimum real rule coverage to sell a report
today?") rather than a data-source-health question. Exact computation (a static flag vs. a derived
check against `RegulatoryRule` lifecycle states) is deferred to Code Generation.

## `ScreeningRequest` — no shape change, new valid values

`ScreeningRequest.projectType`/`projectDetails` (`screening-request/types.ts`) already store
`ProjectType`/(implicitly)`ProjectDetails`-shaped data as `jsonb` — no schema/migration change.
`ScreeningRequestSnapshot` (the RGD-4 immutable snapshot taken at authorization/purchase-lock time)
likewise needs no shape change — it already snapshots whatever `projectDetails` shape was submitted.
