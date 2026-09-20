# Unit 6B — Functional Design: Business-Logic Model

**Status**: Functional Design Part 1 — **APPROVED 2026-09-13** (with the C1c/C1d bounded-
reasoning scope decision applied). Do not reopen approved decisions. No Code Generation, no rule
activation.

Five flows: (1) ECA screening, (2) permit criterion evaluation, (3) permit state derivation
(the two-dimensional model), (4) lot-coverage evaluation, (5) ECA↔permit and ECA↔coverage
composition. Existing shed pipeline steps (setback distances, dwelling separation) are
unchanged and not repeated here.

---

## Flow 1 — ECA screening (Property Intelligence assembly time)

```
assembleShedPropertyContext (extended)
  → NEW: fetchSeattleEcaLayers(parcelBoundary) — seattle-eca.ts adapter
       for each of the 12 (or approved-subset) hazard services:
         query the ArcGIS FeatureServer with a spatial filter against the parcel boundary
         (esriSpatialRelIntersects), outSR=2926, verify returned spatialReference.wkid===2926
         (fail closed otherwise, identical to seattle-building-outlines.ts)
         → LayerQueryResult { hazardType, individualLayerResult, distanceToIndividualLayerEdgeFt?,
                                layerVintageNote, geometry? }
       ALSO query the combined "Environmentally_Critical_Areas_ECA" layer once →
         combinedLayerResult per hazard type it covers
  → for each hazard type: resolveCriticalAreaFinding(query) [EXISTING, unmodified, BR-5/BR-5a]
       → CriticalAreaFinding[]
  → PropertyFact { factType: "environmental-constraints", value: CriticalAreaFinding[],
                    availabilityState: AVAILABLE | SOURCE_ERROR (per-hazard, or whole-fact on a
                    genuine adapter failure - never silently dropped) }
```

A single hazard-service failure (timeout, non-2926 response) records that ONE hazard's
`LayerQueryResult` as unavailable (`individualLayerResult: undefined`, feeding
`resolveCriticalAreaFinding`'s existing `INDETERMINATE`/combined-only path) — it does **not**
fail the whole `environmental-constraints` fact or the report. This mirrors
`property-intelligence/assemble.ts`'s existing per-fact `SOURCE_ERROR` discipline (BR-2/the
2026-08-27 fail-closed-on-claims amendment) exactly; no new failure-handling pattern is
introduced.

**Footprint-scope refinement** (evaluation time, once `proposedPlacement`/footprint exists):
for any hazard whose `hazardGeometry` was returned, a new spatial-analysis function —
`computeFootprintEcaIntersection(db, shedFootprint, hazardGeometry)`, a direct sibling of the
existing `computeDistanceToDwelling` (`ST_Intersects`/`ST_Distance` on two already-projected
polygons, same SRID, no new geometry engine) — populates `footprintIntersection`. Never
required for the parcel-scope screening to be usable; a report can show parcel-scope ECA facts
even before a footprint is placed (early in the wizard) and refine at generation time.

---

## Flow 2 — Permit criterion evaluation

One evaluator per `PermitCriterionId` (domain-entities.md §3a), each independent and each
producing exactly one `PermitCriterionResult`:

| Criterion | Inputs | MET | NOT_MET | REQUIRES_VERIFICATION |
|---|---|---|---|---|
| `ROOF_AREA` (P1) | `wallFootprintSqFt` (widthFt × depthFt), `roofOverhang?` | `wallFootprintSqFt ≤ 120` AND (`roofOverhang` absent, OR `extendsBeyondWalls === false`, OR a given `approxOverhangIn` still keeps projected roof area ≤120) (SRC R105.2 Item 3.1, `≤` confirmed) | `wallFootprintSqFt > 120` (roof area can only be ≥ wall footprint — the exemption criterion is already unsatisfiable; the overhang question is never even asked, BR-U6B-6) | `wallFootprintSqFt ≤ 120` AND `extendsBeyondWalls === true` AND `approxOverhangIn` not given (or a given value pushes projected area over 120 without an exact figure being confirmable) |
| `STORY_HEIGHT` (P2a only) | (shed is inherently single-story by this product's scope) | always MET | — | — |
| `FOUNDATION` (P3a) | `foundationType` | ∈ {SLAB_ON_GRADE, PIER_BLOCKS, ON_SOIL} (SRC R105.2 Item 3.2) | ∈ {FROST_FOOTING, PILES, WOOD_FOUNDATION} | `undefined` |
| `ATTACHMENT` (P4) | `attachment` | `DETACHED` | `ATTACHED` (→ explanationBasis redirects to the addition path) | `undefined` |
| `USE` (P5) | `intendedUse` | ∈ {STORAGE, GREENHOUSE_PLANTS} — the two explicit primary-source categories only | **never** (no automated NOT_MET — BR-U6B-10) | anything else, including `OCCUPIABLE`, `HOBBY_WORKSHOP_UNOCCUPIED`, or `undefined` — "similar generally unoccupied uses" is not interpreted in Unit 6B |
| `ECA` (P6) | `environmental-constraints` fact → BR-U6B-3's derived classification, worded around "is the shed/site in or near an ECA" | no basis, from available mapped/buffer data, to conclude the shed is in or near an ECA (never asserted as "confirmed no ECA") | any hazard resolves to a classification indicating a real mapped intersection | any hazard resolves `REQUIRES_VERIFICATION` due to `INDETERMINATE` map fact, or the whole fact is `SOURCE_ERROR`/`UNAVAILABLE` |
| `SIZE_SPAN` (P7a + P7b combined) | wall-footprint area (P7a, ≤750 sqft — one necessary condition, never sufficient alone), `structuralSpanInfo?` (P7b: `structuralSpanFt`, `usesManufacturedTruss?`) | **both** P7a AND P7b met: footprint ≤750 sqft AND (`structuralSpanFt < 14`, OR `structuralSpanFt` in `(14, 30]` AND `usesManufacturedTruss === true`) | P7a or P7b fails: footprint >750 sqft, **or** `structuralSpanFt > 14` without a qualifying truss, **or** `structuralSpanFt > 30` even with a truss | P7a met but P7b unanswered (evidence gap, BR-U6B-14, not a tier issue) — **or** `structuralSpanFt === 14.0` exactly, whose controlling operator is unreconciled between Tip 316's "less than 14 feet" and the SDCI shed guidance's "more than 14 feet" framing (narrow boundary-operator item, external-verification-tracker item 25) |

P2a's height-related exemption criterion (single-story) is folded into `STORY_HEIGHT` as always
`MET` for this product's scope; **P2b (the accessory-structure zoning height limit) is NOT part
of this table at all** — it is a separate, ordinary, location-sensitive zoning `Finding`,
evaluated independently (see domain-entities.md §3a note and Flow 3's closing note below).

**P3b (foundation-based STFI disqualification) is also NOT part of this table** — corrected on
review, 2026-09-15: it is a real candidate rule (`candidate-regulatory-rules.md`), independent of
`FOUNDATION`/P3a (the R105.2 *exemption* criterion above) and independent of `SIZE_SPAN`. It reads
the same `foundationType` input a second time, for a different regulatory question (STFI
eligibility, not exemption), and is consulted directly in Flow 3's `reviewPath` derivation below —
not folded into any `PermitCriterionId` row here, exactly like ECA's `NOT_MET` short-circuit.

`SIZE_SPAN` is evaluated **only** following this exact conceptual order (founder-directed,
2026-09-13 — progressive disclosure, never an always-visible construction questionnaire):
1. Determine whether a building permit is required at all (`ROOF_AREA`/`STORY_HEIGHT`/
   `FOUNDATION`/`ATTACHMENT`/`USE`/`ECA`). If the shed is trending `LIKELY_EXEMPT`, STFI-routing
   questions (including span) are never asked.
2. If a permit is required, evaluate the known STFI disqualifiers first — `ECA` `NOT_MET` alone
   already routes to `FULL_REVIEW_LIKELY` regardless of span.
3. Evaluate P7a (the ≤750 sq ft criterion) — if it already fails (footprint >750), the review path
   is already `FULL_REVIEW_LIKELY` and span cannot change that outcome.
4. Ask the structural-span question **only if**: (a) the project has not already been routed to
   full review by ECA or size, AND (b) size remains STFI-eligible (footprint ≤750 sq ft), AND
   (c) span information can actually still change `STFI_LIKELY` vs. `FULL_REVIEW_LIKELY`/
   `REQUIRES_VERIFICATION` — i.e., exactly the one remaining open variable.

---

## Flow 3 — Permit state derivation (the two-dimensional model)

```
buildingPermit =
  if ROOF_AREA, STORY_HEIGHT, FOUNDATION, ATTACHMENT, USE, and ECA are ALL "MET"
    → LIKELY_EXEMPT
  else if any of ROOF_AREA, STORY_HEIGHT, FOUNDATION, ATTACHMENT, USE, ECA is "NOT_MET"
    → REQUIRED                                    # a permit IS needed - this is now KNOWN
  else  # no NOT_MET, but at least one REQUIRES_VERIFICATION among the six
    → REQUIRES_VERIFICATION                        # can't even establish exempt-vs-required yet

reviewPath =
  if buildingPermit == LIKELY_EXEMPT
    → NONE
  else if buildingPermit == REQUIRED
    if ECA criterion == "NOT_MET" (a real mapped intersection)
      → FULL_REVIEW_LIKELY                          # ECA disqualifies STFI outright (Tip 316)
    else if foundationType ∈ {PILES, WOOD_FOUNDATION}   # P3b - CORRECTED ON REVIEW, 2026-09-15:
                                                          # this candidate rule existed in
                                                          # candidate-regulatory-rules.md but was
                                                          # never actually wired into this
                                                          # derivation - a real, disclosed gap.
                                                          # Tip 316 disqualifies STFI for these
                                                          # foundation types independent of ECA/
                                                          # size/span, even when P3a has ALSO
                                                          # already failed the exemption on the
                                                          # same foundation fact.
      → FULL_REVIEW_LIKELY
    else if SIZE_SPAN == "NOT_MET"                   # >750 sqft or confirmed >14ft span
      → FULL_REVIEW_LIKELY
    else if SIZE_SPAN == "MET" AND foundationType is known (not undefined)
      → STFI_LIKELY
    else                                             # SIZE_SPAN == REQUIRES_VERIFICATION,
                                                       # or ECA == REQUIRES_VERIFICATION,
                                                       # or foundationType undefined (P3b's own
                                                       # evidence gap - never itself a tier issue)
      → REQUIRES_VERIFICATION                         # <- the founder's target case:
                                                       #    "Permit required, review path unknown"
  else  # buildingPermit == REQUIRES_VERIFICATION
    → REQUIRES_VERIFICATION
```

This is the concrete mechanism behind the table in domain-entities.md §3a. It never degrades a
`REQUIRED` `buildingPermit` finding to `REQUIRES_VERIFICATION` merely because `reviewPath` is
unknown — the founder's explicit requirement.

**P2b (zoning height limit) runs entirely outside this derivation**, and is now **location-
sensitive** (founder correction, 2026-09-13): the shed's already-computed placement/setback facts
determine whether it falls inside a required setback.

```
if the shed's placement facts show it is IN a required setback:
    limitFt = 12                          # SMC 23.44.070 - roof also may not exceed this limit
elif the shed's placement facts show it is OUTSIDE every required setback:
    limitFt = 32                          # SMC 23.44.070 general NR-zone limit, subject to that
                                             section's own roof/height exceptions (narrow item 24)
else:  # the setback-location fact itself is unresolved
    → FindingClassification.REQUIRES_VERIFICATION

heightFt ≤ limitFt  → ComplianceOutcome.PASS
heightFt > limitFt  → FindingClassification.REQUIRES_VERIFICATION   # corrected on review,
                        # 2026-09-15: NEVER an unconditional FAIL - both limitFt branches above
                        # carry an explicitly disclosed, unresolved roof/height-exception question
                        # (item 24). Asserting FAIL would silently assume no exception applies,
                        # which is exactly the invented certainty this project forbids. FAIL is
                        # reserved for once item 24 resolves the exception text.
```

This finding is produced and rendered alongside `PermitRequirementFinding`, never inside it, and
never implied by `buildingPermit === LIKELY_EXEMPT` (BR-U6B-9) — a shed can be `LIKELY_EXEMPT` on
the R105.2 criteria above while this separate height finding is `FAIL` or `REQUIRES_VERIFICATION`,
and vice versa. Never encoded as one universal "12 ft in NR zones" limit — the founder's explicit
correction of the earlier unreconciled 12-vs-15 framing.

---

## Flow 4 — Lot-coverage evaluation (bounded CASE A/B/C reasoning, founder-directed 2026-09-13)

**No automatic C1c/C1d applicability detection is built in this slice** (founder decision) — the
flow below never attempts to determine whether a parcel actually qualifies for the 60% allowance;
it only bounds the estimate between the always-known 50% base and the always-known 60% ceiling.

```
adjustedLotAreaSqFt =
  if ecaAdjustment.status == "ESTABLISHED"
    → parcelAreaSqFt - ecaAdjustment.excludedAreaSqFt
  else  # NOT_APPLICABLE or REQUIRES_VERIFICATION
    → parcelAreaSqFt   # the REQUIRES_VERIFICATION case is handled by the asymmetric override below,
                          not by silently using an optimistic denominator here

c1eFloorSqFt =
  if ecaAdjustment.status == "ESTABLISHED" and ecaAdjustment.minimumCoverageFloor.status == "KNOWN"
    → 625
  else
    → undefined

c1eDirectorAlternativeRelevant =
  ecaAdjustment.status == "ESTABLISHED" and ecaAdjustment.minimumCoverageFloor.status == "REQUIRES_VERIFICATION"

baseAllowanceSqFt            = max(adjustedLotAreaSqFt * 0.50, c1eFloorSqFt ?? 0)   # C1a (+ C1e floor)
potentialSpecialAllowanceSqFt = max(adjustedLotAreaSqFt * 0.60, c1eFloorSqFt ?? 0)  # C1c/C1d's ceiling
                                                                                       (+ C1e floor)

estimatedCoverageSqFt = existingMappedCoverageSqFt + proposedShedFootprintSqFt

ShedLotCoverageResult =
  if ecaAdjustment.status == "REQUIRES_VERIFICATION":
    # asymmetric fail-closed override (unchanged discipline from the prior design): a real ECA
    # exclusion can only SHRINK adjustedLotAreaSqFt and therefore only ever makes both allowances
    # SMALLER - so it is safe to test EXCEEDS using the OPTIMISTIC (unadjusted) denominator's
    # potentialSpecialAllowanceSqFt; it is NEVER safe to conclude Case A or B from it, since the
    # true (smaller) denominator could push the real result into a worse case.
    optimisticPotentialSpecialAllowanceSqFt = max(parcelAreaSqFt * 0.60, 0)  # no floor - C1e
                                                                                doesn't apply while
                                                                                C1b itself is unresolved
    if estimatedCoverageSqFt > optimisticPotentialSpecialAllowanceSqFt:
      → EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE   # true even with the true (smaller) denominator
    else:
      → REQUIRES_VERIFICATION (reason: "LOT_AREA_ADJUSTMENT_UNRESOLVED")

  else if estimatedCoverageSqFt <= baseAllowanceSqFt:
    → WITHIN_STANDARD_ALLOWANCE                  # CASE A - the 60% question is irrelevant here

  else if estimatedCoverageSqFt <= potentialSpecialAllowanceSqFt:
    → REQUIRES_VERIFICATION (reason: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE")   # CASE B

  else if c1eDirectorAlternativeRelevant:
    → REQUIRES_VERIFICATION (reason: "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE")  # CASE C, Director branch

  else:
    → EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE     # CASE C, no Director relevance
```

This is the concrete, fail-closed implementation of BR-U6B-13. It never asks a customer question
or fetches new data to resolve the 50%-vs-60% question; it never claims a failure while a
Director-approved alternative could still apply; and it never manufactures a false
`WITHIN_STANDARD_ALLOWANCE` from an unresolved, potentially-smaller true lot-area denominator.

---

## Flow 5 — Composition (ECA feeds both Permit and Lot Coverage; they never run independently of it)

```
environmental-constraints (Property Intelligence fact, Flow 1)
        │
        ├──► BR-U6B-3 derivation ──► PermitCriterionResult["ECA"] (P6, ALL 12 hazard categories
        │     relevant) ──► Flow 3 (buildingPermit / reviewPath)
        │
        └──► EcaLotAreaAdjustment (candidate rule C1b - ONLY the 4 SMC 23.44.080.B-named
              categories: riparian corridors, wetlands+buffers, submerged lands/shoreline-
              setback, steep-slope non-disturbance areas - per BR-U6B-12)
                     │
                     └──► Flow 4 (ShedLotCoverageResult)
```

Both consumers read the **same single** `environmental-constraints` fact — there is no second
ECA fetch, no second interpretation of what "intersects" means, and no path by which the permit
rule and the coverage rule could disagree about whether a given hazard is present on the parcel.
Their *scope* now also differs deliberately, not just their *regulatory consequence*: P6 (permit)
considers **every** mapped hazard category; C1b (coverage) considers **only** the four SMC
23.44.080.B-named categories — a mapped liquefaction or peat-settlement area, for example,
matters to P6 but never to C1b. Each consequence remains its own named rule (P6 vs. C1b) — never
one rule silently implying the other, and never one rule's scope silently borrowed by the other.
