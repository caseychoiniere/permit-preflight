# Unit 6B — Capability C (Lot Coverage Estimate) — Code Generation Plan Part 1

**Status**: Plan APPROVED (`aidlc-reviewer.review_gate` v1, decision `a933b40a-240a-4630-
b41a-79c6b689dfcd`, bounded override applied on the first submission — every finding was the
already-litigated authentication-only pattern, no genuine engineering/regulatory objection).
**Implementation COMPLETE** — `npm test` 634/634 passing (+10 new), `tsc --noEmit` clean, `npm run
build` clean, the full live integration suite (23 files, 116 tests) passing against the real Neon
DB including 5 new live PostGIS tests for `computeExistingStructureCoverageSqFt`, and a real
INTERNAL_PROTOTYPE report generation against a live Seattle parcel confirming the
`existing-structure-coverage` evidence entry appears correctly with a real PostGIS-computed area.
No rule activated, no commit made yet. Founder-directed 2026-09-23, after accepting Capability B
in dormant state: "move to Unit 6B Capability C — lot coverage. Do not start Unit 7." Same
governance constraint as Capability B: do NOT activate any of the 19 TRIAGED regulatory rules (6
of which are Capability C's own C1a/b/c/d/e/C2 rows).

## 0. What already exists vs. what is genuinely new (verified by direct code inspection)

**Already exists, unit-tested, unmodified by Capability B**:
- Types: `EcaLotAreaAdjustment`, `CoverageExcludedEcaCategory`, `LotCoverageAllowanceFacts`,
  `ShedLotCoverageFacts`, `ShedLotCoverageResult` (`regulatory-rules-engine/types.ts`).
- Evaluators: `evaluateEcaLotAreaAdjustment(ecaFindings)`, `evaluateShedLotCoverage(input)`
  (`evaluate.ts`, both pure, exported).
- The dormancy gate: `evaluateProject` already computes `outcome.shedLotCoverage` iff
  `input.shedLotCoverageFacts` is supplied **and** every `SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES`
  row is ACTIVE (`SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM` etc. — 6 rows, all TRIAGED today). **This
  plan does not touch this gate.**

**Genuinely new work this plan requires** (unlike Capability B, which only needed wiring —
Capability C needs one new geometry computation and one new fact):
- `ExistingStructureCoverageFact` (domain-entities.md §1b) does not exist anywhere — grepped
  `existing-structure-coverage`/`ExistingStructureCoverageFact`/`computeExistingStructureCoverageSqFt`
  across `src/`: zero real implementations, only two forward-referencing comments in `evaluate.ts`.
  Needs: (1) a new PostGIS helper mirroring `computeEcaExclusionGeometry`'s existing
  `ST_Intersection`/`ST_Area` pattern exactly - no new geometry engine; (2) a new pure
  "derive from already-fetched facts" function mirroring `buildLotCoverageFacts`'s existing
  convention - reusing pipeline.ts's own already-computed `existingStructuresForEvidence:
  ExistingStructure[]` (Building Intelligence v1's classified footprints, already fetched for the
  dwelling-separation finding - **never a second fetch**, per domain-entities.md §1b's explicit
  instruction).
- Nothing calls `evaluateShedLotCoverage`/`evaluateEcaLotAreaAdjustment` from `pipeline.ts` - no
  `shedLotCoverageFacts` is ever assembled or passed to `evaluateProject`.
- No report/PDF presentation exists for `ShedLotCoverageResult` (frontend-components.md §4's
  Case A/B/C copy).
- No new customer intake question is needed (business-logic-model.md Flow 4 / BR-U6B-13: "never
  asks a customer question or fetches new data to resolve the 50%-vs-60% question" — every input
  is either already collected (dimensions) or Property-Intelligence-derived).

## 1. Scope

In scope: the full Capability C vertical slice — `existing-structure-coverage` fact assembly →
`evaluateEcaLotAreaAdjustment`/`evaluateShedLotCoverage` wiring → `outcome.shedLotCoverage` →
report/PDF "Estimated lot coverage" section, per the founder-approved (2026-09-13)
business-logic-model.md Flow 4 / domain-entities.md §3b-§3c / business-rules.md BR-U6B-11/12/13 /
frontend-components.md §4 design — no re-litigation of that design in this plan.

Out of scope, explicitly: rule activation; any change to Capability A/B; automatic C1c/C1d
60%-allowance applicability detection (founder already deferred this in the approved design, not
reopened here); the still-open NR side-setback-averaging methodology gap (unrelated, pre-existing,
disclosed in the 2026-09-17 research doc); a real `SUBMERGED_LAND_OR_SHORELINE_SETBACK`/
`WETLAND_AND_BUFFER` excluded-area computation (research-findings.md/business-rules.md BR-U6B-12
already document these are expected to resolve `REQUIRES_VERIFICATION` in practice given real data
gaps - `evaluateEcaLotAreaAdjustment` already implements exactly that, unmodified here).

## 2. Implementation plan

### 2.1 New PostGIS helper — `src/spatial-analysis/postgis-adapter.ts`

- [x] `computeExistingStructureCoverageSqFt(db, parcelBoundary: Polygon, footprints: Polygon[]):
      Promise<{ areaSqFt: number; footprintCount: number }>` — mirrors `computeEcaExclusionGeometry`'s
      existing pattern exactly: assert authoritative SRID on the boundary and every footprint,
      `ST_Union` the per-footprint `ST_Intersection(footprint, boundary)` results (never a plain
      `ST_Union` of raw footprints, which could double-count overlapping/adjacent building parts,
      and never assumes footprints are already parcel-clipped), then `ST_Area` of the union. Empty
      `footprints` array → `{ areaSqFt: 0, footprintCount: 0 }` (a real, valid "no mapped
      structures" answer, never `REQUIRES_VERIFICATION` - absence of footprints is not evidence
      unavailability, matching `existingStructuresForEvidence`'s own established semantics).

### 2.2 New fact-derivation — `src/property-intelligence/` (new small module or alongside
      `existing-structures.ts`)

- [x] `buildExistingStructureCoverageFact(coverage: { areaSqFt, footprintCount }):
      ExistingStructureCoverageFact` - pure, no I/O (matches `buildLotCoverageFacts`'s "derive from
      already-fetched facts" convention exactly). Always populates the mandatory
      `overCountCaveat` (domain-entities.md §1b: roof-edge-vs-wall-line over-count + capture-date/
      feature-completeness limitation, research-findings.md §2.2's existing citation - reworded,
      not re-researched, since research-findings.md already covers this ground).

### 2.3 Pipeline wiring — `src/report-generation-orchestrator/pipeline.ts`

- [x] After `existingStructuresForEvidence` is computed (shed branch, building-intelligence
      section): call `computeExistingStructureCoverageSqFt(db, geometryFact.value, existingStructuresForEvidence.map(s => s.footprint))`
      when parcel geometry is available (gated the same way `rawParcelAreaSqFt` already is), then
      `buildExistingStructureCoverageFact(...)`.
- [x] `evaluateEcaLotAreaAdjustment(environmentalConstraintsFact?.value ?? [])` - reuses the SAME
      `ecaFindings` array already passed to `evaluateProject` for P6 (BR-U6B-12/Flow 5: "both
      consumers read the same single environmental-constraints fact... never a second fetch").
- [x] Assemble `shedLotCoverageFacts: Omit<ShedLotCoverageFacts, "allowanceFacts">` (`allowanceFacts`
      is computed internally by `evaluateShedLotCoverage` itself, per its own docstring - never
      supplied): `{ parcelAreaSqFt: rawParcelAreaSqFt, existingMappedCoverageSqFt:
      existingStructureCoverageFact.mappedFootprintAreaSqFt, proposedShedFootprintSqFt: widthFt *
      depthFt, ecaAdjustment }`. Pass as `evaluateProject`'s existing `shedLotCoverageFacts`
      parameter - already typed and accepted, unused by any caller today.
- [x] Evidence entry: `{ factType: "existing-structure-coverage", value: existingStructureCoverageFact,
      provenance: { qualityCaveat: existingStructureCoverageFact.overCountCaveat } }` (always
      present once geometry/footprints are available, independent of lot-coverage rule ACTIVE
      status - this is a descriptive Property Intelligence fact, not a regulatory result, per
      domain-entities.md §1's "Property Intelligence NEVER assigns a regulatory classification").
- [x] `{ factType: "shed-lot-coverage", value: outcome.shedLotCoverage, provenance: {} }` - only
      when `outcome.shedLotCoverage` is present (same established convention as
      `shed-permit-requirement`).

### 2.4 Report presentation — `app/components/ReportView.tsx`

- [x] New "Estimated lot coverage" section, frontend-components.md §4's exact Case A/B/C/
      Director-relevant/`LOT_AREA_ADJUSTMENT_UNRESOLVED` copy (5 real result shapes on
      `ShedLotCoverageResult`) - reads the new `shed-lot-coverage` evidence entry. Case A never
      mentions the 60% allowance at all (founder's explicit UX principle, 2026-09-13); Cases
      B/C/Director-relevant do. `existingMappedCoverageSqFt` always shown with its `overCountCaveat`
      adjacent (BR-U6B-11).

### 2.5 PDF consistency — `src/report-pdf-rendering/render.ts`

- [x] Matching "Estimated lot coverage" block, same Case A/B/C copy, same evidence-entry lookup -
      mirrors §3.4's Capability B precedent (complete block, not just a number).

### 2.6 Testing

- [x] `computeExistingStructureCoverageSqFt` - real PostGIS integration test (mirrors
      `computeEcaExclusionGeometry`'s/`computeParcelAreaSqFt`'s existing integration-test
      convention): overlapping footprints don't double-count; a footprint partially outside the
      parcel is correctly clipped; zero footprints → zero area, not an error.
- [x] `buildExistingStructureCoverageFact` - pure unit test (caveat always present, area/count
      passed through unchanged).
- [x] Pipeline wiring - live-verified via `pipeline.integration.test.ts` (real DB) rather than a
      new deterministic test, matching Capability B's own precedent for this DB-dependent surface.
- [x] Report/PDF - extend `render.test.ts` with the same pattern as Capability B's Building-permit
      block tests (all 5 `ShedLotCoverageResult` shapes, Case A never mentions 60%, dormancy when
      the evidence entry is absent).
- [x] Re-confirm existing `evaluateShedLotCoverage`/`evaluateEcaLotAreaAdjustment` test coverage
      (already exists in `shed-permit-evaluate.test.ts`) continues passing unchanged.

## 3. Stop conditions (unchanged pattern from Capability B)

Stop and ask the founder only if: a genuinely new regulatory interpretation is needed; a rule-tier
decision changes; rule activation is required; a substantive architecture/security/provenance issue
appears; or Capability C reaches the founder hands-on-acceptance point. A reviewer `ESCALATE`
limited to the already-litigated authentication pattern is resolved via the existing bounded
override, not re-raised to the founder.
