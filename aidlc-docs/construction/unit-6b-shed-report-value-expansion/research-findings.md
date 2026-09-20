# Unit 6B — Shed Report Value Expansion: Research Findings

**Status**: Scope APPROVED WITH MODIFICATIONS (2026-09-11); Functional Design Part 1 produced.
This document is the **original 2026-09-10 research pass** — kept as the historical record of
that pass, not silently rewritten. **The founder independently re-verified several of the
findings below against current code text and directly corrected them on 2026-09-11.** The
corrected, authoritative versions live in `candidate-regulatory-rules.md` and
`functional-design/rule-tier-review.md` — treat those two files as controlling wherever they
disagree with the narrative below. Concretely superseded here:

- **P1** (roof-area threshold): the `≤`/`<` operator question below is **resolved** —
  SRC R105.2, Item 3.1: "does not exceed 120 square feet" (`≤`).
- **P2/P3/P5/P8** (below, presented as single combined rules): each **split** —
  P2 → P2a (R105.2 one-story, exemption) + P2b (a *separate* zoning height-limit finding, not an
  exemption criterion); P3 → P3a (R105.2 foundation, exemption) + P3b (foundation affecting
  review path); P5 rewritten to two explicit categories + an unconditioned
  `REQUIRES_VERIFICATION` catch-all (no automated "similar ... uses" interpretation); P8
  withdrawn as a tiered rule entirely, now a fixed advisory disclosure.
- **C1** (below, one combined lot-coverage rule): **split** into C1a (50% base, SMC
  23.44.080.A), C1b (explicit ECA lot-area exclusions, SMC 23.44.080.B — four named categories
  only, not "any ECA"), C1c (60% common-amenity development, SMC 23.44.080.F — **not identified
  in this original pass**), C1d (60% stacked-dwelling-units, SMC 23.44.080.G), and C1e (625 sq ft
  floor + Director-approved alternative, SMC 23.44.080.D — **not identified in this original
  pass**).
- **C2**: re-grounded in SMC 23.44.080.C's current explicit exclusions (not the old CAM 220) and
  reclassified Tier 2 → **Tier 1** (the aerial-data limitation is an evidence issue, not a rule
  ambiguity).
- **C3**: marked **SUPERSEDED / NOT CURRENT**, not implemented — the old rear-yard-coverage cap
  below has no confirmed current-code equivalent.
- **Governing principle** (new, recorded in `candidate-regulatory-rules.md`): rule tier and
  evidence quality are different dimensions — a deterministic (Tier 1) rule can still produce
  `REQUIRES_VERIFICATION` for a specific parcel merely because a needed fact is unknown; that is
  never, by itself, a reason to reclassify the rule as Tier 2. The original tier table below
  over-applied Tier 2 to several plain evidence gaps (P7b, C1b, C2) — corrected in
  `rule-tier-review.md`.

**Date of original pass**: 2026-09-10
**Method**: primary City of Seattle / SDCI / Seattle GeoData sources, read directly (URLs and
retrieval notes in §"Data-Source Review"). Grounded against the existing codebase — most of the
machinery these four capabilities need **already exists** for vacant land (Unit 5) and garage
(Unit 4) and is simply not wired into the EXISTING_PROPERTY shed pipeline yet.

---

## 0. Framing — what is actually being proposed

Unit 6B does **not** change the architecture or the epistemic model. Every preserved invariant
the founder listed (PostGIS as spatial source of truth, deterministic/versioned rules, LLM never
decides regulatory conclusions, KNOWN/INFERRED/REQUIRES_VERIFICATION, missing data never silently
PASS, authoritative provenance, immutable paid reports, fail-closed-on-claims-not-journey) is
carried through unchanged.

**Key grounding finding**: the current shed pipeline (`src/report-generation-orchestrator/pipeline.ts`)
today produces only setback distances, dwelling separation, and `uncovered-constraint-types`. It
passes `ecaFindings: []` (ECA is never queried for a shed) and builds `lotCoverageFacts` only for
the **garage** branch. Meanwhile Unit 5 already built and shipped, against real PostGIS:

- `computeSetbackConstrainedArea` — per-edge `ST_Buffer` + `ST_Difference` (feasible-area machinery)
- `computeEcaExclusionGeometry` — `ST_Intersection` of parcel and a supplied ECA polygon
- `computeBuildableEnvelope` — `ST_Difference` combining the two
- `computeParcelAreaSqFt` — `ST_Area` (already called in the shed pipeline)
- `spatial-analysis/eca.ts` + `regulatory-rules-engine/eca-implication.ts` — the full
  **DATA FACT → REGULATORY CONCLUSION** separation, the individual-vs-combined-layer precedence
  policy (Unit 0B Track 4), and the map-dispositive set (`priority_habitat`, `peat_settlement`)
- `Geometry` union type (Polygon / MultiPolygon / EmptyGeometry, with holes) — disjoint results
- `PrimaryDwellingSelection` + `existing-structure-footprints` (Building Intelligence v1) — real
  mapped building footprints on the parcel

Unit 6B is therefore mostly **integration of proven components into the shed workflow plus one
genuinely new capability (permit determination) plus one new data source (Seattle ECA layers)**.
That is why a solo founder can realistically build and maintain it.

---

## RESEARCH TRACK 1 — Permit Requirement Determination

### 1.1 Authoritative sources

| Source | What it gives |
|---|---|
| SDCI, "Sheds" (common projects page), seattle.gov/sdci/permits/common-projects/sheds | The exemption checklist for sheds, verbatim (below) |
| SDCI Tip 316, "Subject-to-Field-Inspection (STFI) Permits" (cam316.pdf, updated 2024-04-26) | The STFI tier: detached accessory structures ≤ 750 sq ft, spans < 14 ft (30 ft truss); the disqualifiers (ECA routing, peat Cat 1 + new impervious, retaining walls, pile/wood foundations, SEPA, relocation, special inspections); PASV rules |
| SDCI, "Do You Need a Permit?" (seattle.gov/sdci/permits/do-you-need-a-permit) | "A one-story detached accessory building … if the projected roof area is less than 120 square feet and the building foundation is only a slab on the ground" is exempt; and: "Even if you don't need a permit, your project must meet all code requirements and development standards." |
| SMC Chapter 23.44 (Neighborhood Residential) | Zoning standards a shed must meet whether or not a building permit is required — setbacks (23.44.090), lot coverage (23.44.080), height, separation |
| SMC Chapter 25.09 (Environmentally Critical Areas) | ECA categories, buffers, and the exemption interaction (below) |
| SDCI Tip 220 / CAM 220, "Lot Coverage, Height and Yard Standards for Homes in Neighborhood Residential Zones" | Accessory-structure yard and coverage detail (Track 2) |

### 1.2 The exemption checklist (verbatim, SDCI "Sheds")

A shed needs **no building permit** only if **all** of the following are true:

1. "The total area (or 'footprint') of the shed's roof is **120 square feet or less**."
2. "The shed is a **single-story** building."
3. "The shed sits on a **simple concrete slab, pier blocks, or soil**." (i.e. not a frost-depth
   footing foundation, not piles/pin piles, not an all-wood foundation — those independently
   disqualify an STFI too, per Tip 316.)
4. "The shed is **not attached** to a house or other building."
5. "The shed is **not in or near an environmentally critical area (ECA)**, for example a steep
   slope, wetland, or flood-prone area."
6. "The shed is only used for **storage, growing plants, or similar generally unoccupied uses**."

Plus, from the same page: "The shed cannot be more than **12 feet tall**," and zoning setbacks
still apply (front 10–15 ft, side ~5 ft, generally rear-yard only).

### 1.3 The tiers (from Tip 316 + Sheds page)

| Condition | Likely outcome |
|---|---|
| All six criteria above met | **LIKELY_PERMIT_EXEMPT** (building permit only — zoning + separate trade permits still apply) |
| Fails ≥1 exemption criterion, but ≤ 750 sq ft, structural spans < 14 ft (30 ft truss), **not** in/near an ECA | **STFI_PERMIT_LIKELY** (subject-to-field-inspection; ~1 working day, site plan + elevations required) |
| > 750 sq ft, **or** beam span > 14 ft, **or** in/near an ECA (→ routed/reviewed land-use review; peat Cat 1 + new impervious surface explicitly cannot be STFI) | **FULL_PERMIT_LIKELY** (construction addition/alteration permit + plan review) |
| A required input is unknown, ECA proximity is indeterminate, or a Tier-2 interpretation applies | **REQUIRES_VERIFICATION** |

### 1.4 Separate trade permits (disclosed, never change the building-permit answer)

- **Electrical**: any electrical work / connecting the shed to power requires a separate Seattle
  electrical permit (and City Light service coordination). Independent of the building permit.
- **Plumbing / side sewer**: any plumbing requires a separate permit.
- **Mechanical**: any HVAC requires a separate permit.

The report should **disclose** these as "⚠ separate review" items whenever the customer indicates
utility intent — it must not fold them into the LIKELY_PERMIT_EXEMPT/STFI/FULL determination.

### 1.5 Inputs we already have vs. inputs we'd need to ask

**Already have** (`ShedProjectConfiguration` + pipeline):
- `widthFt` × `depthFt` → footprint area (≈ roof footprint, modulo eave overhang — see 1.6)
- `heightFt` → the 12-ft test
- `alleyAdjacent`, `proposedPlacement`, `lotLineRoleAssignment`
- parcel geometry, parcel area, existing structure footprints (Building Intelligence v1)
- **NOT yet**: any ECA intersection (Track 3 is a hard dependency for criterion 5)

**Would need to ask** (new `ShedProjectConfiguration` fields, all optional / `undefined` = "not
answered", never coerced — matching the garage-config convention):

| New input | Which criterion it resolves | Result states it affects |
|---|---|---|
| **Foundation type** — `SLAB_ON_GRADE` / `PIER_BLOCKS` / `ON_SOIL` / `FROST_FOOTING` / `PILES` / `WOOD_FOUNDATION` / `UNKNOWN` | Criterion 3 (and the STFI pile/wood disqualifier) | exempt ↔ STFI ↔ full |
| **Attached vs. detached** — `DETACHED` / `ATTACHED` / `UNKNOWN` | Criterion 4 | exempt ↔ (addition, not a shed) |
| **Intended use** — `STORAGE` / `GREENHOUSE_PLANTS` / `HOBBY_WORKSHOP_UNOCCUPIED` / `OCCUPIABLE` (office, studio, sleeping) / `UNKNOWN` | Criterion 6 | exempt ↔ STFI/full; an occupiable use is effectively a DADU question, out of shed scope |
| **Utility intent** — booleans: electrical? plumbing? mechanical? | Separate-permit disclosure only | (adds ⚠ items, never changes the building-permit state) |
| **Roof eave / overhang projection (in)** — optional | Criterion 1 precision (the exemption measures *projected roof area*), and Track 2 coverage | nudges the 120-sq-ft boundary case |

Without foundation/attachment/use, the honest output is **REQUIRES_VERIFICATION** with the reason
stated ("we can't confirm the building-permit exemption without knowing the foundation type"),
never a guessed PASS.

### 1.6 Accuracy assessment — how well can we answer "does this shed likely need a permit?"

- **Well** for the common case: a small (≤120 sq ft or clearly larger), single-story, detached,
  slab-founded storage shed on a parcel with **no mapped ECA** → a confident
  LIKELY_PERMIT_EXEMPT or STFI_PERMIT_LIKELY with every criterion shown as ✓/✗ and its evidence.
- **Genuine residual uncertainty** (always disclaimed, SDCI makes the final call):
  - "in **or near** an ECA" — "near" has no single distance; each hazard has its own buffer
    (riparian 100 ft; wetland 50–100+ ft by category; steep slope has a setback/buffer). Proximity
    within the Unit 0B tolerance band already resolves to INDETERMINATE → REQUIRES_VERIFICATION.
  - "projected roof area" vs. wall footprint at the 120-sq-ft boundary (eave overhang).
  - SDCI's discretion to route **any** ECA project to full land-use review regardless of size.
  - Vesting / which code edition applies on a parcel mid-transition (One Seattle rezone).
- Net: the deliverable is a **likelihood with reasons and a verification list**, not a
  yes/no guarantee — exactly the product's stated posture.

### 1.7 Proposed deterministic result states (NOT created in code yet)

```
LIKELY_PERMIT_EXEMPT      all six exemption criteria KNOWN-true (incl. ECA-clear from Track 3)
STFI_PERMIT_LIKELY        fails ≥1 exemption criterion; ≤750 sqft; spans <14ft; no ECA
FULL_PERMIT_LIKELY        >750 sqft, or span >14ft, or any mapped ECA on parcel/footprint
REQUIRES_VERIFICATION     a required input missing, ECA proximity indeterminate, or Tier-2 question
```

Evidence that would support each is enumerated per-criterion in
`candidate-regulatory-rules.md` (rules P1–P6).

---

## RESEARCH TRACK 2 — Lot Coverage

### 2.1 Authoritative sources

| Source | What it gives |
|---|---|
| **SMC 23.44.080** (Maximum lot coverage) | Neighborhood Residential maximum lot coverage = **50 percent**; "reduced in proportion to percentage of lot that contains ECAs" (per the SDCI NR Zoning Summary, citing 23.44.080). NB: the **pre-2024 Single-Family** number was **35%** — which percentage applies depends on the parcel's current zone and, for a mid-transition parcel, vesting. |
| **SMC 23.44.010 / 23.44.086** (lot coverage calculation, projections) | What counts toward coverage ("all structures"); the eave/gutter/cornice projection allowance; deck/uncovered-porch/underground-structure exclusions. **Current-code exact figures require verification** — the older CAM 220 gives a ~18–24-in eave allowance and a 40%-of-required-rear-yard cap on accessory structures; whether those survive the rezone unchanged is a Tier-2 item. |
| **SMC 23.44.090** (yards) | Rear-yard coverage limit for accessory structures. |
| SDCI Tip 220 / CAM 220 | Homeowner-facing lot-coverage / yard explanation. |
| **Seattle Building Outlines 2023** (`services.arcgis.com/ZOyb2t4B0UYuYNYH/.../Building_Outlines_2023/FeatureServer/0`) — already integrated | Mapped roof-edge footprint polygons + `AREA` (sq ft), native SRID **2926**. |
| King County parcel polygon — already integrated | Parcel geometry + `computeParcelAreaSqFt` (already called in the shed pipeline). |

### 2.2 What Building Outlines can and cannot truthfully represent

**Can**: the roof-drip-line footprint of mapped permanent buildings captured in the 2023 imagery,
each with an `AREA` value, in the exact CRS the codebase standardizes on (2926 — no transform).

**Cannot** (each a mandatory `ESTIMATED` / `REQUIRES_VERIFICATION` label):
- **Roof edge over-counts vs. the code basis** — SMC counts structures at the wall line plus a
  limited projection; a roof outline includes the full eave. Using `AREA` directly therefore
  **over-states** existing coverage. That is a *safe* direction for a "remaining capacity"
  estimate (it under-states capacity), but it must be labeled, not presented as exact.
- Structures built/demolished since the 2023 capture.
- Whether a given mapped polygon is a code-countable "structure" (house, garage) vs. something
  that may not count, or an existing large shed.
- Decks, uncovered porches, carports, patios — may or may not count; not reliably in the layer.
- ECA reduction of the *allowed* percentage (needs Track 3's ECA area-of-overlap).

### 2.3 Truthful output shape

```
Estimated lot coverage

  Parcel area (King County):                       6,240 sq ft   [KNOWN — general-location boundary]
  Existing mapped structure coverage:              2,010 sq ft   [ESTIMATED — aerial roof outlines,
                                                                  over-counts eaves; not every
                                                                  code-counted condition]
  Proposed shed footprint:                            120 sq ft
  Estimated post-project coverage:      2,130 / 6,240 = 34%
  Applicable maximum (Neighborhood Residential):      50%        [REQUIRES_VERIFICATION — which
                                                                  percentage applies depends on
                                                                  the parcel's zone / vesting;
                                                                  reduced where ECAs are present]
  Estimated remaining capacity:                    ~990 sq ft    [ESTIMATED]
```

Every number labeled; the *maximum* and the *existing coverage* both explicitly
`REQUIRES_VERIFICATION` / `ESTIMATED`; the conclusion is "you appear to have room" or "you may be
close to / over the limit — verify," never "compliant."

### 2.4 PostGIS reuse

Direct, no new engine:
- Parcel area: `computeParcelAreaSqFt` — already exists, already called.
- Existing mapped coverage: `ST_Area(ST_Union(<building-outline polygons> ∩ parcel))` — a small
  extension of `computeEcaExclusionGeometry`'s `ST_Intersection` + `ST_Area` pattern.
- Proposed shed area: the shed footprint polygon is already computed in-memory
  (`footprintProjected`, `pipeline.ts`).
- ECA reduction of the allowed area: `computeEcaExclusionGeometry` (already exists) → subtract
  from parcel area before applying the percentage.

### 2.5 Reuse across project types

**HIGH.** The garage branch already has `LotCoverageFacts` (BR-U4-3) but it relies on a
**self-reported** existing-structure estimate — always `REQUIRES_VERIFICATION` by design. A real
mapped-footprint input (`PropertyContext.existingStructureCoverage`) is a materially better input
for the same existing rule, and every future footprint-adding project type (decks, additions,
ADUs, DADUs) needs the same "how much coverage budget is left" answer. This is a
**reusable Property Intelligence fact + a shared coverage rule**, not shed-specific.

---

## RESEARCH TRACK 3 — Environmentally Critical Areas

### 3.1 Authoritative source — one org, right CRS, already trusted by this codebase

**City of Seattle GeoData / SDCI**, ArcGIS Online organization
`services.arcgis.com/ZOyb2t4B0UYuYNYH` — **the same org ID the codebase already queries for
Building Outlines** (`src/property-intelligence/seattle-building-outlines.ts`). The existing
adapter (query with `outSR=2926`, then verify `spatialReference.wkid === 2926` before trusting
coordinates, fail closed otherwise) is a near-exact template.

Twelve published ECA feature services:

| # | Service name | ECA category | Notes |
|---|---|---|---|
| 1 | `Environmentally_Critical_Areas_ECA` | **Combined** overlay | Publisher-disclaimed "analytical purposes only… does not represent actual regulatory areas" — use only as the *combined-layer* input to the Unit 0B precedence policy, never as KNOWN |
| 2 | `Environmentally_Critical_Areas_Steep_Slope` | Steep slope erosion hazard | FeatureServer/9, WKID **2926**, polygon. "40% slope or greater… ≥10 ft rise." Source: 2001 PSLC LIDAR + 1993 contours; SDCI Director's Rule 12-2019. Query-capable. |
| 3 | `Environmentally_Critical_Areas_Known_Slides` | Landslide-prone (mapped historic slides) | |
| 4 | `Environmentally_Critical_Areas_Potential_Slide_Areas` | Landslide-prone (potential) | |
| 5 | `Environmentally_Critical_Areas_Riparian_Corridors` | Fish & wildlife habitat — riparian | 100-ft riparian management area |
| 6 | `Environmentally_Critical_Areas_Wetlands` | Wetlands | Category-based buffers (≈50–110 ft; needs SMC 25.09 verification) |
| 7 | `ECA_Fish_and_Wildlife_Habitat_Conservation_Area` | Priority habitat, corridors, species of local importance | Contains the **map-dispositive** `priority_habitat` type (SDCI + Unit 0B Track 4) |
| 8 | `ECA_Flood_Prone_Areas` | Flood-prone | Cross-reference FEMA NFHL (already a listed source) |
| 9 | `ECA_Landfills_Historical` | Abandoned landfills | |
| 10 | `ECA_Liquefaction_Prone_Areas` | Liquefaction | **1995 vintage**, USGS-derived — surface the vintage as evidence metadata (`requirements.md` already mandates this) |
| 11 | `ECA_Peat_Settlement_Prone_Areas` | Peat settlement | **Map-dispositive**; Category 1 + new impervious surface **disqualifies STFI** (Tip 316) |
| 12 | `Environmentally_Critical_Area_Overlay_for_Zoned_Development_Capacity_Model_Current` | Combined analytical overlay | Modeling artifact — not a regulatory layer |

CRS confirmed 2926 on the steep-slope service; the same is expected across the org's ECA layers
(to be verified per-layer, same as the Building Outlines adapter already does).

### 3.2 DATA FACT vs REGULATORY CONCLUSION — already built

`src/spatial-analysis/eca.ts` produces a `CriticalAreaFinding` (map fact only — `INTERSECTS` /
`NO_INTERSECTION` / `INDETERMINATE`, `advisoryStatus`, tolerance basis, layer vintage). It never
carries a `classification`. `src/regulatory-rules-engine/eca-implication.ts`
(`deriveEcaRegulatoryImplication`) is the **only** path from that fact to a `FindingClassification`:

- `INDETERMINATE` map fact → always `REQUIRES_VERIFICATION`
- map-dispositive hazard (`priority_habitat`, `peat_settlement`) with a clean intersection → may be `KNOWN`
- every advisory hazard, even on a clean intersection → `REQUIRES_VERIFICATION` (SDCI's own maps
  are advisory; confirmation by survey/report is still required)
- individual authoritative layer always beats the combined layer; proximity within the
  source-specific tolerance band → `INDETERMINATE`

Unit 6B **wires a real fetcher** into this (the shed pipeline currently passes `ecaFindings: []`)
— it does not redesign the policy.

### 3.3 Per-hazard screening decisions

| Question | Answer |
|---|---|
| Is **parcel** intersection meaningful? | Yes, at screening depth — it's the exemption trigger (criterion 5) and SDCI's own site-plan trigger. |
| Does **footprint** intersection matter more? | Yes for the *regulated activity* precision (is the disturbance actually in the hazard/buffer) — computable via `ST_Intersects(shedFootprint, hazard)` once the fetcher exists. Report both: "parcel intersects" (screening) and, where computable, "proposed shed location intersects / does not." |
| Is a **buffer** calculation required? | For wetland, riparian, and steep-slope: yes — the regulated area is hazard + buffer. Buffer distances are SMC 25.09 values that need code verification → the buffer polygon is `REQUIRES_VERIFICATION`-grade unless the layer itself already includes the buffer. |
| Does it **change permit-exemption eligibility**? | **Yes — this is the single biggest permit lever.** Any mapped ECA on the parcel plausibly defeats criterion 5 → at least STFI, often full land-use review. Stated only because SDCI's own shed guidance names ECA as a disqualifier. |
| Deterministic conclusion, or disclose only? | Mostly **disclose + REQUIRES_VERIFICATION**. `priority_habitat` / `peat_settlement` can reach `KNOWN`-strength. Never "mapped ECA ⇒ project prohibited" — the source doesn't support that. |

### 3.4 DATA FACT / REGULATORY CONCLUSION example

> **DATA FACT** (`spatial-analysis`): "The parcel intersects a mapped Liquefaction-Prone Area
> (Seattle ECA layer, 1995 vintage, USGS-derived). The proposed shed footprint also intersects
> this area."
>
> **REGULATORY CONCLUSION** (`regulatory-rules-engine`, `REQUIRES_VERIFICATION`): "A mapped ECA on
> the parcel means this shed most likely does **not** qualify for the building-permit exemption
> and would require at least a subject-to-field-inspection permit; SDCI may require geotechnical
> review before issuing it. Confirm the ECA status and permit path with SDCI."

### 3.5 Reuse

**VERY HIGH.** Every project type and vacant land needs ECA screening. Vacant land already has
half the plumbing (`computeEcaExclusionGeometry` with a *supplied* geometry). A shared
`PropertyContext.environmentalConstraints` fact + the shared fetcher serves Units 4, 5, 7–11 and
the vacant-land workflow. This is the highest-reuse capability of the four.

---

## RESEARCH TRACK 4 — Preliminary Feasible Placement Area

### 4.1 What already exists

Unit 5 built the entire subtraction chain, against real PostGIS, with disjoint-multipolygon and
hole representation solved (`Geometry` type):

```
parcel boundary
  − per-edge required setbacks   (computeSetbackConstrainedArea: ST_Buffer each edge by its own
                                   required distance, ST_Difference — never one uniform inward offset)
  − ECA exclusion geometry       (computeEcaExclusionGeometry: ST_Intersection, then subtract)
  = buildable envelope           (computeBuildableEnvelope: ST_Difference)
```

`transformPolygonToWgs84` already exists to hand the result to MapLibre for display — the browser
only renders; it never computes feasibility.

### 4.2 What a shed-specific version adds

1. **Accessory-structure setback profile** — a `SHED_SETBACK` rule spec (front/side/rear for a
   *detached accessory structure* per SMC 23.44.090, plus the special "rear 40% of lot" reduced
   side setback and the alley 0-ft case). The exact accessory-structure numbers are **Tier 2**
   until code-verified (see `candidate-regulatory-rules.md` rule F1).
2. **Existing-structure conflict + 5-ft separation** — subtract each Building-Outlines footprint
   buffered outward by the SMC 23.44 "minimum separation between buildings: 5 feet"
   (`ST_Buffer(footprint, 5)`, then `ST_Difference`).
3. **Morphological erosion for the shed's own size** — the feasible *area* is not enough; to place
   a `widthFt × depthFt` shed you need `ST_Buffer(feasibleArea, −r)` where `r` is (conservatively)
   half the shed's smaller dimension, then require the eroded region non-empty. PostGIS negative
   `ST_Buffer` does exactly this — this is the "account for the shed footprint itself" step.
4. **Placement check** — `ST_Contains(feasibleArea, shedFootprint)` on the user's *placed*
   footprint (`footprintProjected`, already in memory) → the "Your selected shed location is
   inside / outside the currently identified feasible area" finding.

### 4.3 What can legitimately participate

| Input | Participates in the feasible polygon? |
|---|---|
| Front / rear / side setbacks | **Yes** — geometric, deterministic (numbers Tier 2 until verified) |
| 5-ft dwelling / building separation | **Yes** — geometric |
| Existing building footprints | **Yes** — subtract |
| Lot coverage | **No** — it's an *area budget*, not a *location* constraint. Show separately: "even where it fits, your coverage budget allows only ~M sq ft." |
| ECA constraints | **Partial.** Exclusion-type hazards (steep-slope non-disturbance area, wetland + buffer) may be subtracted. **Advisory** hazards must be **overlay / warning only**, not silently subtracted — subtracting them would imply more certainty than the advisory map supports (the founder's explicit caution). |

### 4.4 Naming

**"Preliminary feasible placement area"** — never "buildable area." Matches Unit 5's own
"preliminary buildable area" caution and `requirements.md`'s "no manufactured precision."

### 4.5 Assessment

- PostGIS remains authoritative; no browser geometry.
- Complexity is **MEDIUM–HIGH**: the erosion step, disjoint-multipolygon handling, and the
  advisory-vs-exclusion ECA split are real work, and the accessory-setback profile is a new
  Tier-2 rule surface.
- It is the **highest-uncertainty, highest-maintenance** of the four — every setback or ECA rule
  change ripples into the geometry, and the legal-correctness caveats ("this is not where you may
  build, only where the constraints we can model don't obviously prohibit") are the hardest of the
  four to communicate to a homeowner.
- Reuse: HIGH for garage (same accessory rules), MEDIUM for decks/additions, LOW for fences.

---

## Data-Source Review (consolidated)

| # | Agency / owner | Exact dataset / service | Authoritative URL / endpoint | Information obtained | Update / freshness | Coverage | CRS | Access method | Terms | Known accuracy limits |
|---|---|---|---|---|---|---|---|---|---|---|
| DS-1 | City of Seattle SDCI | "Sheds" common-projects page | seattle.gov/sdci/permits/common-projects/sheds | Shed permit-exemption checklist (6 criteria + 12-ft height) | Page, undated; reflects current SMC | Seattle | n/a | HTML (human read) | City content | Narrative summary, not code text |
| DS-2 | City of Seattle SDCI | Tip 316, "Subject-to-Field-Inspection (STFI) Permits" | seattle.gov/dpd/publications/cam/cam316.pdf | STFI tier + disqualifiers + PASV | "Updated April 26, 2024" | Seattle | n/a | PDF | City content, "not a substitute for codes" | Tip-level, disclaims completeness |
| DS-3 | City of Seattle SDCI | "Do You Need a Permit?" | seattle.gov/sdci/permits/do-you-need-a-permit | 120-sq-ft slab-only exemption wording; "must meet all code requirements even if no permit" | Page, undated | Seattle | n/a | HTML | City content | Narrative |
| DS-4 | City of Seattle SDCI | Tip 220 / CAM 220, "Lot Coverage, Height and Yard Standards … Neighborhood Residential Zones" | web.seattle.gov/dpd/cams/CamDetail.aspx?cn=220 (PDF cam220.pdf) | Accessory-structure yards, coverage, rear-yard cap | Post-2022 update; pre/post One-Seattle status to verify | Seattle NR | n/a | PDF/HTML | City content | Reflects a code edition; verify currency |
| DS-5 | City of Seattle SDCI | Neighborhood Residential Zoning Summary | seattle.gov/documents/Departments/SDCI/Codes/NeighborhoodResidentialSummary.pdf | 50% max lot coverage (23.44.080); setbacks (23.44.090); 5-ft building separation | Reflects One-Seattle NR code | Seattle NR | n/a | PDF | City content; "for Illustrative Purposes Only" | Explicitly illustrative — defer to SMC 23.44 |
| DS-6 | Seattle Legislative / SMC | SMC Ch. 23.44 (Neighborhood Residential), Ch. 25.09 (ECA) | Seattle Municipal Code (library.municode.com mirror; read, not scraped) | Setback / coverage / ECA-buffer rule text | Ordinance-driven | Seattle | n/a | HTML (human read) | Public edicts (Georgia v. Public.Resource.Org) | Municode blocks programmatic fetch — human/browser read only, per every prior unit |
| DS-7 | City of Seattle GIS / SDCI | `Environmentally_Critical_Areas_Steep_Slope` | services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Environmentally_Critical_Areas_Steep_Slope/FeatureServer/9 | Steep-slope polygons | Item modified 2026-03 (metadata); underlying data 2001 LIDAR / DR 12-2019 | Seattle | **2926** (verified) | ArcGIS REST `query` (`f=json`, `outSR=2926`) | City GIS open data (PDDL / public-domain corroborated per `requirements.md`) | Roof/terrain model vintage; edge tolerance ~15–20 m (Unit 0B) |
| DS-8 | City of Seattle GIS / SDCI | 10 sibling ECA services (`Known_Slides`, `Potential_Slide_Areas`, `Riparian_Corridors`, `Wetlands`, `Fish_and_Wildlife_Habitat_Conservation_Area`, `Flood_Prone_Areas`, `Landfills_Historical`, `Liquefaction_Prone_Areas`, `Peat_Settlement_Prone_Areas`, combined `ECA`) | services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/<name>/FeatureServer | Per-hazard polygons | Per-layer edit dates (liquefaction 1995; others vary) | Seattle | Expected 2926 — **verify per layer** (adapter already does this for Building Outlines) | ArcGIS REST `query` | City GIS open data | Liquefaction 1995 USGS-derived; advisory maps per SDCI |
| DS-9 | City of Seattle GIS / SDCI | Building Outlines 2023 — **already integrated** | services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Building_Outlines_2023/FeatureServer/0 | Roof-edge footprint polygons + `AREA` | 2023 imagery capture | Seattle | 2926 | ArcGIS REST (existing adapter) | City GIS open data | Roof edge over-counts eaves; no building-type attribute; capture-date staleness |
| DS-10 | King County | Parcel polygon — **already integrated** | gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_Parcels/MapServer/0 | Parcel geometry + area | ON_DEMAND | King County | 2926 | ArcGIS REST (existing adapter) | County GIS terms — resale of raw data prohibited (report product ≠ raw resale) | "General location," not surveyed/legal |
| DS-11 | FEMA | National Flood Hazard Layer (NFHL) — listed in `requirements.md`, not yet integrated | msc.fema.gov / hazards.fema.gov NFHL services | Flood zone corroboration for DS-8 flood-prone layer | Periodic FIRM updates | National | 4269/4326 | ArcGIS REST | Federal public domain; digital layer is a "convenience," hardcopy FIRM is official | Map-scale; LOMA/LOMR not reflected instantly |

**Municode is not made a dependency**: every rule text above is read from the SMC via a human /
browser (as every prior unit did); the machine-queried sources (DS-7/8/9/10) are all City-of-Seattle
or King County authoritative GIS services.

---

## PropertyContext / Data-Model Implications

Small, reusable additions only (each justified by the research; none creates a multi-city
abstraction — Seattle remains the only jurisdiction):

| Addition | Kind | Justification | Consumers |
|---|---|---|---|
| `PropertyContext` fact `environmental-constraints` | **Reusable Property Intelligence fact** — array of per-hazard `{ hazardType, mappedIntersectionResult (parcel), footprintIntersectionResult?, advisoryStatus, layerVintage, provenance }` | Track 3; every project type + vacant land needs it | Regulatory Rules Engine (`deriveEcaRegulatoryImplication`, already exists); permit rule (Track 1); feasible-area (Track 4) |
| `PropertyContext` fact `existing-structure-coverage` | **Reusable Property Intelligence fact** — `{ mappedFootprintAreaSqFt, footprintCount, parcelAreaSqFt, source, caveat }`, a pure "derive from already-fetched facts" function like `buildLotCoverageFacts` | Track 2; garage's existing self-reported `LotCoverageFacts` gets a better input; decks/additions/ADUs need it | Regulatory Rules Engine (shared coverage rule) |
| `ShedProjectConfiguration` fields: `foundationType?`, `attachment?`, `intendedUse?`, `utilityIntent?: { electrical, plumbing, mechanical }`, `roofEaveProjectionIn?` | **Project-specific intake** — shed permit determination needs these; `undefined` = not answered, never coerced (garage-config convention) | Track 1 | Boundary Validator schema + permit rule |
| `regulatory-rules-engine` result type: a `PermitRequirementFinding` discriminated union with the four states in §1.7 | **Project-type-specific rule output** | Track 1 | Report artifact / `ReportView` |
| No new PostGIS engine, no new infrastructure, no new npm dependency, no new external service beyond the Seattle ECA REST endpoints (same host + CRS as Building Outlines) | | | |

`PropertyContext.parcelArea` already effectively exists (`computeParcelAreaSqFt` result flows into
`LotCoverageFacts.rawParcelAreaSqFt`) — no change needed there.

---

## Proposed Deterministic Findings / Results (summary)

| Capability | Finding subject | Possible classifications | Never |
|---|---|---|---|
| Permit (Track 1) | "Building permit requirement" | `LIKELY_PERMIT_EXEMPT` / `STFI_PERMIT_LIKELY` / `FULL_PERMIT_LIKELY` (as KNOWN/INFERRED) or `REQUIRES_VERIFICATION` | "permit approved" / "no permit needed" as a guarantee |
| Permit — trade permits | "Electrical / plumbing / mechanical permits" | disclosure item (⚠) when utility intent indicated | folded into the building-permit state |
| Lot coverage (Track 2) | "Estimated lot coverage" | KNOWN parcel area; `ESTIMATED` existing + post-project; `REQUIRES_VERIFICATION` applicable maximum | "compliant" / exact coverage |
| ECA (Track 3) | one finding per intersecting hazard type | KNOWN (map-dispositive only) / `REQUIRES_VERIFICATION` / not-shown when `NO_INTERSECTION` | "project prohibited" from a mapped hazard alone |
| Feasible placement (Track 4, if scoped) | "Preliminary feasible placement area" + "Is your placement inside it?" | KNOWN geometry result with `REQUIRES_VERIFICATION` caveat on the setback numbers | "buildable area" / survey-grade certainty |

---

## Uncertainty / Verification Boundaries

1. **Which code edition / lot-coverage percentage applies** (35% legacy SF vs. 50% NR, vesting) —
   `REQUIRES_VERIFICATION`, Tier 2.
2. **"Near an ECA"** has no single distance; buffer values are SMC 25.09 figures needing code
   verification — proximity within the Unit 0B tolerance band already → `INDETERMINATE`.
3. **Building-outline roof edge over-counts** code-countable area — existing coverage is
   `ESTIMATED` and deliberately conservative (under-states remaining capacity).
4. **SDCI discretion** to route any ECA project to full review regardless of size — always
   disclaimed.
5. **Accessory-structure setback numbers** (SMC 23.44.090 special cases) — Tier 2 until
   founder + professional verification.
6. **Liquefaction layer is 1995 vintage** — surfaced as evidence metadata, never hidden.
7. **The determination is a likelihood with reasons and a verification list** — never a permit
   guarantee, never survey-grade geometry, never an LLM conclusion.

---

## Example Customer-Facing Report Value (illustrative — NOT final copy)

**PERMIT**

> **Building permit — likely not required**
> Your proposed detached storage shed appears to meet Seattle's basic size, foundation, and use
> criteria for a building-permit exemption.
> ✓ Roof footprint 120 sq ft or less (yours: ~110 sq ft)
> ✓ Single story, 12 ft or less tall (yours: 9 ft)
> ✓ Detached from the house
> ✓ Slab / pier-block / on-soil foundation
> ✓ Storage use
> ✓ No mapped environmentally critical area on this parcel
> ⚠ Electrical work needs a separate Seattle electrical permit
> ⚠ A permit exemption is **not** a zoning approval — your shed still has to meet setback, lot
> coverage, and height limits (see below). SDCI makes the final call.

**LOT COVERAGE**

> **Estimated lot coverage — 34%**
> Existing mapped structures: ~2,010 sq ft · Proposed shed: 120 sq ft · Parcel: 6,240 sq ft
> Applicable maximum (Neighborhood Residential): 50% — *verify which limit applies to your zone*
> Estimated remaining capacity: ~990 sq ft
> *Based on aerial building outlines, which trace roof edges and don't capture every condition the
> code counts. Treat as a screening estimate.*

**SITE CONSTRAINTS**

> **Mapped site conditions**
> ✓ No mapped steep slope
> ✓ No mapped wetland or riparian corridor
> ⚠ Parcel intersects a mapped **liquefaction-prone area** (Seattle ECA, 1995 mapping). This does
> not prohibit your shed, but it likely means the shed no longer qualifies for the permit
> exemption and SDCI may ask for geotechnical review. Confirm with SDCI.

**PLACEMENT** (only if Track 4 is scoped)

> **Preliminary feasible placement**
> Your selected shed location is inside the area where the setbacks and building-separation rules
> we can model are satisfied. This is a screening view, not a survey or a guarantee of approval.

---

## GO / NO-GO Assessment

| Capability | Customer value | Data availability | Rule encodability | Impl complexity | Uncertainty | Reuse across project types | **Recommendation** |
|---|---|---|---|---|---|---|---|
| **1. Permit requirement** | **HIGH** — the single question the founder's product goal names first | **PARTIAL** — needs 3 new customer inputs + Track 3 | **MEDIUM** — exemption criteria are crisp; "near ECA" + SDCI discretion are fuzzy | **MEDIUM** — a new rule + intake fields; no new engine | **MEDIUM** | **HIGH** — garage reuses immediately; every project type has a permit question | **SHIP IN 6B** (hard-depends on 3) |
| **2. Lot coverage** | **MEDIUM–HIGH** — "what might stop me" | parcel area **GOOD**; existing coverage **PARTIAL** (aerial); applicable % **PARTIAL** (zone/vesting) | **MEDIUM** — 50% is clear; which % + what counts is Tier 2 | **LOW–MEDIUM** — PostGIS `ST_Area`/`ST_Union`/`ST_Intersection` reuse; garage `LotCoverageFacts` scaffold exists | **MEDIUM** | **HIGH** — garage, decks, additions, ADUs | **SHIP IN 6B** |
| **3. ECA screening** | **HIGH** — "what might stop me" and the top permit input | **GOOD** — 12 authoritative layers, right CRS (2926), same ArcGIS org already integrated | **HIGH for the data fact**; the regulatory-implication policy **already exists and is tested** | **MEDIUM** — one fetcher; `eca.ts` / `eca-implication.ts` / `computeEcaExclusionGeometry` already built | **LOW–MEDIUM** — advisory → `REQUIRES_VERIFICATION` already handled honestly | **VERY HIGH** — every unit + vacant land | **SHIP IN 6B — best value/effort ratio; do first** |
| **4. Preliminary feasible placement area** | **MEDIUM–HIGH** — nice map, but "where constraints don't obviously prohibit" is a subtle promise | **GOOD** — all geometric inputs in hand | **MEDIUM** — setback numbers Tier 2; ECA participation is nuanced (advisory = overlay only) | **MEDIUM–HIGH** — negative-buffer erosion, disjoint multipolygons, advisory/exclusion ECA split, a new `SHED_SETBACK` profile | **MEDIUM–HIGH** — highest of the four | **HIGH for garage, MEDIUM otherwise** | **DEFER** — to a 6B follow-on or a later unit. Optionally ship a *minimal* "does your placement fit the setback + 5-ft-separation envelope?" boolean (a small extension of the setback distances already computed), with **no** ECA subtraction and **no** erosion — clearly labeled preliminary |

---

## Recommended Smallest Unit 6B Scope

**Ship 3 + 1 + 2. Defer 4.**

- **3 (ECA screening)** first — highest reuse, lowest incremental cost (machinery exists), and it
  unblocks the permit determination.
- **1 (Permit requirement)** — the headline capability; needs 3 + three new intake questions.
- **2 (Lot coverage)** — cheap given the existing PostGIS operations and the garage
  `LotCoverageFacts` scaffold; every figure labeled `ESTIMATED` / `REQUIRES_VERIFICATION`.
- **4 (Feasible placement area)** — **deferred**. It has the highest uncertainty, the highest
  ongoing maintenance surface (every setback/ECA rule change ripples into geometry), and the
  hardest-to-communicate promise. A *minimal* setback-envelope "does it fit" overlay is a
  reasonable optional add if Functional Design shows it is genuinely low-cost, but it is not
  required for 6B to move the report from "setback calculator" to "can I build this, will I need a
  permit, what might stop me, what should I verify."

This combination is what a solo founder can build on top of proven components and maintain: one
new data adapter (ECA, templated on the Building Outlines adapter), two reusable Property
Intelligence facts, one new project-type rule (permit) plus one reused/generalized rule
(coverage), and no new infrastructure.

Full detail and the decisions requiring founder approval are in `recommended-scope.md`.
Candidate regulatory rules (RESEARCHED state, not activated) are in
`candidate-regulatory-rules.md`.
