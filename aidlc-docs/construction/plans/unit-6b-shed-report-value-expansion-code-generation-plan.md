# Unit 6B — Code Generation Plan (Shed Report Value Expansion)

**Status**: Part 1 — **APPROVED 2026-09-15** (founder direct confirmation after six reviewer
cycles; three genuine defects found and fixed — see `aidlc-state.md`). **Part 2 — Generation, in
progress.** Functional Design, NFR Requirements, NFR Design, and Infrastructure
Design are all complete and approved (see `aidlc-state.md`'s Unit 6B section for the full record,
including two founder direct-overrides of procedural reviewer escalations — no substantive
finding was overridden). Approved scope: **(A)** ECA screening, **(B)** shed permit-requirement
determination, **(C)** estimated lot-coverage analysis. Track 4 (feasible placement) remains
deferred — no code for it below.

**Governing constraint (verified, not assumed, before writing this plan)**: this codebase's
existing Regulatory Rules Engine (`src/regulatory-rules-engine/evaluate.ts`) implements every
criterion as a plain, unconditional, deterministic TypeScript function (e.g. `evaluateRearSetback`,
`evaluateHeight`, `evaluateLotCoverage`) — there is **no** in-function lifecycle/ACTIVE check. The
**sole** gate keeping a new rule inert in production is `evaluateProject`'s one-time filter,
`input.candidateActiveRules.filter((r) => r.lifecycleState === LifecycleState.ACTIVE)`
(`evaluate.ts:109`), mirrored by the identical `WHERE lifecycleState = ACTIVE` query in
`report-generation-orchestrator/pipeline.ts:220-234`. Unit 4's own precedent
(`tests/fixtures/garage-candidate.ts`, `tests/regulatory-rule-governance/garage-candidate.test.ts`)
is exact: ship the full evaluator function, insert the corresponding `RegulatoryRule` row at
**DRAFTED or TRIAGED only**, and add a hard-invariant test proving it is never ACTIVE / never
consumed by production evaluation. **Unit 6B follows this identical pattern for every new rule.
No `approve()`/`activate()` call is made for any Unit 6B rule in this Code Generation pass.**

---

## 1. Property Intelligence

- [ ] 1.1 `src/property-intelligence/seattle-eca.ts` (new) — `FactRetriever` for
      `factType: "environmental-constraints"`. Queries the approved-subset ECA FeatureServer
      layers on `services.arcgis.com/ZOyb2t4B0UYuYNYH` (same org/CRS as Building Outlines).
      Internal fan-out: `Promise.allSettled(layers.map((layer) => (async () =>
      queryLayer(layer, fetchLayerWithTimeout))()))` — caller-owned async wrapping per NFR
      Design §1 (isolates synchronous throws, not just rejections). New
      `fetchLayerWithTimeout(url, timeoutMs)` helper, `AbortController`-based, scoped to this
      file only. Per-layer CRS verification mirrors `seattle-building-outlines.ts`'s existing
      fail-closed check (declared `spatialReference.wkid !== 2926` → that layer unavailable).
      Every settled result feeds the **existing, unmodified** `resolveCriticalAreaFinding`
      (`src/spatial-analysis/eca.ts`, BR-5/BR-5a) — never re-implemented here.
- [ ] 1.2 `src/spatial-analysis/postgis-adapter.ts` — add `computeExistingStructureCoverageSqFt`
      (sibling to the existing `computeEcaExclusionGeometry`): `ST_Area(ST_Union(<mapped
      building-outline footprints> ∩ parcel boundary))`.
- [ ] 1.3 `src/spatial-analysis/` — add `computeFootprintEcaIntersection` (sibling to the existing
      `computeDistanceToDwelling`): `ST_Intersects`/`ST_Distance` between the proposed shed
      footprint and a fetched hazard geometry, both already-projected polygons, same SRID.
- [ ] 1.4 New pure derive function (e.g. `src/property-intelligence/existing-structure-coverage.ts`)
      producing the `existing-structure-coverage` fact from the **already-fetched**
      `existing-structure-footprints` fact + 1.2's helper — no second network fetch. Always
      attaches the mandatory `overCountCaveat` (roof-edge-vs-wall-line + capture-date
      limitation) into the fact's `provenance.qualityCaveat`.
- [ ] 1.5 Wire `seattle-eca.ts` into the shed branch of `assemblePropertyContext`'s retriever list
      (`report-generation-orchestrator/pipeline.ts` or wherever the shed retriever list is
      assembled) — parcel-scope pass at assembly time. Add the optional footprint-scope
      refinement call (1.3) once a placement/footprint exists, per Flow 1.

## 2. Screening Request / Intake

- [ ] 2.1 `src/screening-request/types.ts` — add to `ShedProjectConfiguration` (all optional,
      `undefined` by default, matching every existing shed field's convention):
      `foundationType?: FoundationType`, `attachment?: ShedAttachment`,
      `intendedUse?: ShedIntendedUse`, `roofOverhang?: RoofOverhang`,
      `structuralSpanInfo?: StructuralSpanInfo`, `utilityIntent?: UtilityIntent`. New exported
      enums/interfaces per `functional-design/domain-entities.md` §2 exactly (6 `FoundationType`
      values; `ShedAttachment`; `ShedIntendedUse` 4 values; `RoofOverhang{extendsBeyondWalls,
      approxOverhangIn?}`; `StructuralSpanInfo{structuralSpanFt, usesManufacturedTruss?}`;
      `UtilityIntent{electrical?, plumbing?, mechanical?}`). Extend
      `ShedProjectConfigurationSchema` (zod) with the same fields — real runtime validation, not
      TypeScript-typing-only.
- [ ] 2.2 `app/configure/page.tsx` (shed DETAILS step) — add the 3 always-asked questions
      (foundation, attachment, intended use) and the 3 progressive questions (roof overhang,
      gated on `wallFootprintSqFt <= 120`; structural span, gated on the Flow-2 conceptual order;
      utility intent, always optional) per `functional-design/frontend-components.md` §1. Exact
      copy is confirmed against the live page during this step, not fixed by the design doc.

## 3. Regulatory Rules Engine — new types

- [ ] 3.1 New file `src/regulatory-rules-engine/shed-permit-types.ts` (or extend
      `regulatory-rules-engine/types.ts` if smaller than expected): `BuildingPermitStatus`,
      `PermitReviewPath`, `PermitCriterionId` (7 values, P2b deliberately excluded),
      `PermitCriterionResult`, `TradePermitDisclosure`, `PermitRequirementFinding`.
- [ ] 3.2 Same file/module — `AccessoryStructureHeightLimit` (discriminated union: setback-based
      12ft / outside-setback 32ft / `REQUIRES_VERIFICATION`).
- [ ] 3.3 Same file/module — `CoverageExcludedEcaCategory` (4 values), `EcaLotAreaAdjustment`
      (`NOT_APPLICABLE` / `REQUIRES_VERIFICATION` / `ESTABLISHED` with `minimumCoverageFloor`),
      `LotCoverageAllowanceFacts`, `ShedLotCoverageFacts`, `ShedLotCoverageResult` (5-variant
      CASE A/B/C union per `domain-entities.md` §3c — `WITHIN_STANDARD_ALLOWANCE`,
      `MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE`, `EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE`,
      `POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE`, `LOT_AREA_ADJUSTMENT_UNRESOLVED`).

## 4. Regulatory Rules Engine — evaluators (plain deterministic functions, per the governing constraint above)

- [ ] 4.1 `evaluateRoofArea` (P1 / `ROOF_AREA`) — `wallFootprintSqFt > 120` → `NOT_MET`;
      `<= 120` and (`roofOverhang` absent or `extendsBeyondWalls === false`, or a given
      `approxOverhangIn` keeps projected area `<= 120`) → `MET`; otherwise
      `REQUIRES_VERIFICATION`. Citation: SRC R105.2 Item 3.1.
- [ ] 4.2 `evaluateStoryHeight` (P2a / `STORY_HEIGHT`) — always `MET` (product scope is
      inherently single-story).
- [ ] 4.3 `evaluateFoundationExemption` (P3a / `FOUNDATION`) — `foundationType ∈
      {SLAB_ON_GRADE, PIER_BLOCKS, ON_SOIL}` → `MET`; `∈ {FROST_FOOTING, PILES,
      WOOD_FOUNDATION}` → `NOT_MET`; `undefined` → `REQUIRES_VERIFICATION`.
- [ ] 4.4 `evaluateAttachment` (P4 / `ATTACHMENT`) — `DETACHED` → `MET`; `ATTACHED` → `NOT_MET`;
      `undefined` → `REQUIRES_VERIFICATION`.
- [ ] 4.5 `evaluateUse` (P5 / `USE`) — `∈ {STORAGE, GREENHOUSE_PLANTS}` → `MET`; **anything else,
      including `undefined`, resolves `REQUIRES_VERIFICATION` — never `NOT_MET`** (BR-U6B-10,
      hard invariant, needs its own explicit test).
- [ ] 4.6 `evaluateEcaPermitCriterion` (P6 / `ECA`) — reads the environmental-constraints fact
      through the **existing, unmodified** `deriveEcaRegulatoryImplication` (BR-4a); worded
      around "in or near an ECA," never "confirmed no ECA" (BR-U6B-2/3).
- [ ] 4.7 `evaluateSizeSpan` (P7a+P7b / `SIZE_SPAN`) — footprint `> 750` → `NOT_MET`;
      `structuralSpanFt < 14` → `MET` (if footprint also `<= 750`); `14 < structuralSpanFt <= 30`
      with `usesManufacturedTruss === true` → `MET`; `structuralSpanFt > 14` without truss, or
      `> 30` even with truss → `NOT_MET`; `structuralSpanFt === 14.0` exactly, or
      `structuralSpanInfo` missing → `REQUIRES_VERIFICATION`. Never inferred from
      `widthFt`/`depthFt`.
- [ ] 4.7b `evaluateFoundationStfiDisqualifier` (P3b) — **added on review, 2026-09-15**: a real
      candidate rule (`candidate-regulatory-rules.md`) that existed in the design docs but was
      never actually wired into `reviewPath` derivation anywhere — a genuine gap, not a Code
      Generation-time invention. `foundationType ∈ {PILES, WOOD_FOUNDATION}` →
      disqualifies STFI (contributes `FULL_REVIEW_LIKELY`), independent of P3a/ECA/`SIZE_SPAN`,
      and independent of whether P3a *also* already failed on the same foundation fact;
      `foundationType` unanswered → contributes `REQUIRES_VERIFICATION` (an evidence gap, not a
      tier issue); any other foundation type → no P3b disqualification (review-path unaffected
      by foundation).
- [ ] 4.8 `deriveBuildingPermitState` — Flow 3's `buildingPermit`/`reviewPath` derivation from the
      6 exemption criteria + `SIZE_SPAN` + **P3b (4.7b)**, evaluated in the exact conceptual order
      business-logic-model.md §2's closing steps specify (permit-required check → known
      disqualifiers, now including P3b → 750 sqft check → span only if it can still change the
      outcome).
- [ ] 4.9 `evaluateAccessoryHeightLimit` (P2b, standalone `Finding`, **not** part of
      `PermitCriterionId`) — reads the shed's already-computed setback-distance facts to
      determine in-required-setback vs. outside; `heightFt <= 12` (in setback) or `<= 32`
      (outside) → `PASS`; **over the applicable limit → `REQUIRES_VERIFICATION`, never an
      unconditional `FAIL`** (corrected on review, 2026-09-15 — domain-entities.md/
      business-logic-model.md's own text already discloses that both the 12ft and 32ft figures
      are subject to unenumerated SMC 23.44.070 roof/height exceptions, item 24; asserting FAIL
      would silently assume none apply); setback-location itself unresolved →
      `REQUIRES_VERIFICATION`. Rendered via the existing `Finding`/`FindingClassification`
      shape, subject "Accessory structure height limit" — never nested inside
      `PermitRequirementFinding`.
- [ ] 4.10 `buildTradePermitDisclosures` (P8, non-tiered advisory) — one fixed-copy
      `TradePermitDisclosure` per truthy `utilityIntent` field, entirely independent of
      `buildingPermit`/`reviewPath`.
- [ ] 4.11 `evaluateEcaLotAreaAdjustment` (C1b/C1e) — `NOT_APPLICABLE` when none of the 4 named
      categories intersect; `REQUIRES_VERIFICATION` when a named category intersects but exact
      exclusion geometry can't be established (this is expected to be the common outcome for
      the shoreline/submerged-land and wetland-buffer sub-categories per the researched data
      limitation — item 26); `ESTABLISHED` with `excludedAreaSqFt` + `minimumCoverageFloor`
      (625 sqft `KNOWN`, or `REQUIRES_VERIFICATION` for the Director-alternative branch — never
      guessed) otherwise.
- [ ] 4.12 `evaluateShedLotCoverage` (C1a/c/d + CASE A/B/C banding, Flow 4) — computes
      `adjustedLotAreaSqFt`, `baseAllowanceSqFt`, `potentialSpecialAllowanceSqFt`, then the
      5-branch classification exactly as `nfr-design.md`/`business-logic-model.md` Flow 4
      specify, including the asymmetric fail-closed override for an unresolved C1b denominator
      (never fabricates a false `WITHIN_STANDARD_ALLOWANCE`). **No automatic C1c/C1d
      applicability detection is built** (founder decision) — `Applicability` for those two
      provisions is not attempted; the banding logic itself is what's implemented.
- [ ] 4.13 Wire 4.1–4.12 (+4.7b) into `evaluateRule`'s `ruleType` dispatch and `evaluateProject`'s
      shed branch, assembling the final `PermitRequirementFinding` + standalone P2b `Finding` +
      `ShedLotCoverageResult`.
- [ ] 4.14 **Partial-activation aggregation rule — corrected on review, 2026-09-15** (this is a
      bounded implementation decision, not a new regulatory or product decision; Functional
      Design never specified it because it never addressed how one aggregate finding interacts
      with this codebase's existing per-rule ACTIVE gating). **Adopts the more conservative of
      two options the review raised, rather than the "any one constituent active" version this
      plan originally proposed**: `PermitRequirementFinding`/`ShedLotCoverageResult` are included
      on the `Report` **only once every constituent rule** that finding depends on is `ACTIVE` —
      never partially. This is strictly safer and eliminates a real honesty problem the original
      version had: with only *some* constituents active, a customer-visible
      `REQUIRES_VERIFICATION` on an inactive criterion would be indistinguishable from a genuine
      evidence gap on their specific parcel, silently conflating "the founder hasn't activated
      this rule yet" with "we don't know this fact about your shed" — a real traceability problem
      for a project whose whole premise is evidence-backed, provenance-traceable conclusions.
      Requiring full activation before the aggregate ever appears removes that ambiguity
      entirely: once it does appear, any `REQUIRES_VERIFICATION` within it is guaranteed to be a
      genuine evidence gap, never a governance artifact. **No live behavior changes today either
      way** — every constituent rule currently sits at DRAFTED/TRIAGED, so both the original and
      corrected versions produce an identical (fully dormant) result right now; this only affects
      the founder's future, separate activation decisions.

**Dormancy clarification — corrected on review, 2026-09-15 (the original version of this plan
overstated it)**: capability **(A) ECA screening** is **not** dormant — the "Mapped
environmental/site constraints" report section is produced by the **already-`ACTIVE`, existing**
`resolveCriticalAreaFinding`/`deriveEcaRegulatoryImplication` pipeline (BR-5/BR-4a), which
`evaluate.ts` consumes via a separate, unconditional path (`input.ecaFindings`) that is **not**
gated by any `RegulatoryRule` lifecycle state at all. **This section ships live, for real
customers, immediately once this Code Generation lands** — it is not held back by anything in
§5. Only capabilities **(B) shed permit-requirement determination** and **(C) estimated
lot-coverage analysis** depend on the new P1–C2 candidate rules and are genuinely dormant per
§4.14 above, exactly Unit 4's own precedent for `LOT_COVERAGE` (coded and deterministically
tested today, not yet appearing in a real garage customer's report). **This distinction matters
for the founder's eventual hands-on acceptance test**: a real shed report will show the new
environmental-constraints section immediately, but no "Building permit" or "Estimated lot
coverage" section until those rules are later, separately activated — that is expected, not a
defect, and should not be mistaken for missing functionality during that test.
`PermitRequirementFinding`/`ShedLotCoverageResult` are optional fields on the shared `Report`
shape (§6.2) precisely so their
simple absence — the natural, correct outcome of the existing filter, not a special case anyone
has to remember — is what ships in every real report until activation. §6's `ReportView`
sections render conditionally on the field being present, with no additional dormancy logic
needed anywhere.

## 5. Regulatory rule governance (RESEARCHED state preserved — DRAFTED/TRIAGED only, never ACTIVE)

- [ ] 5.1 Add `RegulatoryRule` candidate fixtures (mirroring
      `tests/fixtures/garage-candidate.ts`'s `DraftedRuleInput` shape) for every founder-confirmed
      rule: P1, P2a, P2b-1, P2b-2, P3a, P3b, P4, P5, P6, P7a, P7b, P9, C1a, C1b, C1c, C1d,
      C1e-floor, C1e-director, C2. (P8 excluded — withdrawn as a tiered rule, advisory only, no
      governance row.) **Every tier assigned here is not a new decision** — it is the exact,
      already-founder-confirmed value recorded in
      `candidate-regulatory-rules.md`'s "Summary table (founder-confirmed status)" and
      `functional-design/rule-tier-review.md`'s table (both part of the already-approved
      Functional Design; `triage()`'s `founderIdentity` parameter cites the founder's own
      2026-09-11 tier-review message, not a fresh Code-Generation-time judgment call). Progress
      each through `draft()` → `triage()` only, per Unit 4's exact sequencing precedent — **no
      `approve()`, no `activate()`, for any of them.**
- [ ] 5.2 New test (mirrors `tests/regulatory-rule-governance/garage-candidate.test.ts`) asserting
      as a hard invariant that none of Unit 6B's new rule IDs are ever `ACTIVE`, and are therefore
      never included in `candidateActiveRules`/never consumed by `evaluateProject` or the
      production pipeline query.

## 6. Report Generation / Presentation

- [ ] 6.1 Wire `PermitRequirementFinding`, the standalone P2b `Finding`, and `ShedLotCoverageResult`
      into the shed pipeline's evidence/findings assembly (`report-generation-orchestrator/
      pipeline.ts`).
- [ ] 6.2 Extend the shared `Report` shape with two new optional fields
      (`permitRequirement?: PermitRequirementFinding`, `lotCoverage?: ShedLotCoverageResult`) —
      `undefined` for non-shed reports, unaffected.
- [ ] 6.3 Extend `app/components/ReportView.tsx` with the "Building permit" section (5 headline
      combinations + criteria checklist + trade-permit disclosures + P9 disclaimer),
      "Estimated lot coverage" section (4 case renderings per `frontend-components.md` §4 —
      Case A never mentions the 60% possibility), and the "Mapped environmental/site
      constraints" section (prominent items for real intersections, one grouped summary line
      for clean categories, never a dozen green cards — BR-U6B-4). Exact placement in the
      existing section order confirmed against the live page.

## 7. Tests

- [ ] 7.1 Deterministic boundary tests (NFR-U6B-8/10) for the CASE A/B/C lot-coverage thresholds
      and P7b's `structuralSpanFt === 14.0`/30ft boundary, mirroring
      `tests/regulatory-rules-engine/garage-evaluate.test.ts`'s pure-function-boundary style —
      naming exact values, not just incidental coverage.
- [ ] 7.2 Deterministic fan-out tests for `seattle-eca.ts` per NFR Design §1's explicit list: all
      layers succeed; one layer's `fetchLayerWithTimeout` rejects (mocked) while others succeed;
      non-2xx; non-2926 CRS; every layer fails; a plain non-`async` mocked layer operation that
      throws synchronously (proves caller-owned wrapping). Separately, a **direct** deterministic
      test of `fetchLayerWithTimeout` itself using vitest's fake-timer API (`vi.useFakeTimers()`)
      — advance past the deadline, assert the `AbortSignal` fires, the stubbed `fetch` rejects,
      and `clearTimeout` runs exactly once on both the success and abort paths.
- [ ] 7.3 Deterministic tests for each permit criterion evaluator (4.1–4.7), **P3b (4.7b)**, and
      the two-dimensional state derivation (4.8), covering all 5 real
      `buildingPermit`×`reviewPath` combinations from `domain-entities.md` §3a's table — **plus a
      dedicated case (added on review, 2026-09-15) proving a pile/wood foundation routes to
      `FULL_REVIEW_LIKELY` even when `SIZE_SPAN`/ECA both independently resolve `MET`/clear**,
      confirming P3b's disqualification is genuinely independent of the other two.
- [ ] 7.3b Deterministic test (corrected on review, 2026-09-15) for §4.14's partial-activation
      aggregation rule: with only a **subset** of a finding's constituent rules `ACTIVE`, confirm
      the aggregate field is `undefined` entirely (never a partial/placeholder result); with
      **zero** active, likewise `undefined`; with **every** constituent rule `ACTIVE`, confirm
      the aggregate is present and any remaining `REQUIRES_VERIFICATION` within it reflects only
      a genuine customer/parcel evidence gap, never rule-activation status.
- [ ] 7.4 Deterministic tests for `evaluateAccessoryHeightLimit` (P2b): in-setback/12ft,
      outside-setback/32ft, over-limit-on-either-branch resolving `REQUIRES_VERIFICATION` (never
      `FAIL`), and setback-location-unresolved.
- [ ] 7.5 Deterministic tests for `evaluateEcaLotAreaAdjustment` and `evaluateShedLotCoverage`,
      including the asymmetric-override branch.
- [ ] 7.6 New live-integration test file `tests/property-intelligence/seattle-eca.integration.test.ts`
      (gated on network, non-blocking — same `.integration.test.ts` convention already proven
      non-blocking for `seattle-building-outlines.integration.test.ts`, per NFR-U6B-9's now-cited
      CI evidence).
- [ ] 7.7 Governance hard-invariant test (5.2).
- [ ] 7.8 Full existing suite (`npm test`) remains green — zero regressions.

## 8. Verification (Build & Test entry point for this unit)

- [ ] 8.1 `npm run typecheck` — 0 errors.
- [ ] 8.2 `npm test` — all deterministic tests passing, zero regressions.
- [ ] 8.3 `npm run build` — clean.
- [ ] 8.4 `npm run test:integration` — run if `DATABASE_URL`/live credentials are available in
      this environment; if not, state that honestly (per this project's established discipline)
      rather than fabricating a result.

---

**Explicitly not built**: any per-parcel automatic detection for C1c/C1d applicability; the
shoreline/submerged-land or wetland-buffer exclusion geometry itself (both remain
`REQUIRES_VERIFICATION` by design, per items 26); Track 4 (feasible placement); any change to
report pricing, guest checkout, or account/auth flows; any new infrastructure, tech stack, or
OpenAI/application-runtime dependency.
