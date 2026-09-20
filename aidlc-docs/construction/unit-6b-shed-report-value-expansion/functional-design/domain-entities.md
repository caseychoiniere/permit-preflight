# Unit 6B — Functional Design: Domain Entities

**Status**: Functional Design Part 1 — **APPROVED 2026-09-13** (with the C1c/C1d bounded-
reasoning scope decision applied). Do not reopen approved decisions. No Code Generation, no rule
activation.

Scope: ECA screening + shed permit-requirement determination + lot-coverage analysis (Track 4,
feasible placement, remains deferred — no types for it below).

---

## 1. Property Intelligence — reusable facts

Both new facts are **descriptive only** ("what does authoritative/mapped data say about this
property") — neither carries a regulatory conclusion. That derivation lives entirely in the
Regulatory Rules Engine (§3), matching the project's existing Property-Intelligence/Regulatory-
Rules-Engine boundary (`property-intelligence/types.ts`'s own docstring: "Property Intelligence
NEVER assigns a regulatory classification").

### 1a. `environmental-constraints` (new `PropertyContext` fact, `factType: "environmental-constraints"`)

```ts
// Reuses spatial-analysis/types.ts's CriticalAreaFinding VERBATIM - no duplicate type. One
// element per Seattle ECA hazard category, always present (a hazard with no data yet is
// AvailabilityState.UNAVAILABLE at the PropertyFact level, not simply absent from the array).
value: CriticalAreaFinding[]

// Optional, per-hazard: the actual hazard geometry as fetched (SRID 2926, same CRS as the parcel
// boundary and Building Outlines - no transform needed), ONLY for hazard types where a
// footprint-level (not just parcel-level) intersection check is meaningful and the query
// returned geometry within a bounding envelope around the parcel. Mirrors the precedent already
// set by Building Intelligence v1's `existing-structure-footprints` fact (real Polygon geometry
// stored in a PropertyContext fact, not just a boolean).
hazardGeometry?: { hazardType: string; geometry: Polygon | MultiPolygon }[]
```

**Assembled by**: a new `src/property-intelligence/seattle-eca.ts` adapter, templated directly on
`seattle-building-outlines.ts` — same ArcGIS org (`services.arcgis.com/ZOyb2t4B0UYuYNYH`), same
`outSR=2926` + `spatialReference.wkid` verification before trusting any coordinate (fails closed
otherwise, identical discipline). Queries each of the (approved subset of) 12 ECA feature
services with a spatial filter against the parcel boundary (or a small buffered envelope, for
hazards where "near" matters), returning per-hazard `individualLayerResult`
(`esriSpatialRelIntersects` hit/no-hit) and, for hazards where distance-to-edge matters
(steep slope, per the existing Unit 0B tolerance), a distance value computed via PostGIS
`ST_Distance` on the fetched geometry — feeding directly into the **already-ACTIVE**
`spatial-analysis/eca.ts`'s `resolveCriticalAreaFinding` (BR-5/BR-5a), unmodified.

**Never** computed by the adapter itself: the `MappedIntersectionResult` / `advisoryStatus`
values are always produced by calling the existing `resolveCriticalAreaFinding`, never
re-implemented in the adapter.

### 1b. `existing-structure-coverage` (new `PropertyContext` fact, `factType: "existing-structure-coverage"`)

```ts
interface ExistingStructureCoverageFact {
  /** ST_Area(ST_Union(<mapped building-outline footprints> ∩ parcel boundary)) via PostGIS -
   * a new, small PostGIS function alongside computeParcelAreaSqFt/computeEcaExclusionGeometry,
   * not a new engine. Derived from the SAME footprints Building Intelligence v1's
   * `existing-structure-footprints` fact already retrieves - never a second fetch. */
  mappedFootprintAreaSqFt: number;
  /** How many distinct mapped footprints intersect the parcel - display/debug only. */
  footprintCount: number;
  /** ALWAYS present alongside a mappedFootprintAreaSqFt - a mandatory, non-optional caveat
   * (never silently omitted) explaining the roof-edge-vs-wall-line over-count and the
   * capture-date/feature-completeness limitation (research-findings.md §2.2). Concatenated
   * into the fact's own `provenance.qualityCaveat` (PropertyFact convention), not just prose
   * buried in a report string. */
  overCountCaveat: string;
}
// value: ExistingStructureCoverageFact
```

**Assembled by**: a new pure "derive from already-fetched facts" function (matching the existing
`buildLotCoverageFacts` convention exactly — no network of its own), combining the already-
fetched `existing-structure-footprints` fact + a new `computeExistingStructureCoverageSqFt`
PostGIS helper (`ST_Area(ST_Union(...))`, mirroring `computeEcaExclusionGeometry`'s
`ST_Intersection` + `ST_Area` pattern).

**`PropertyContext.parcelArea`**: no new field — `computeParcelAreaSqFt`'s existing result,
already flowing into `LotCoverageFacts.rawParcelAreaSqFt` for garage, is reused unchanged for
the shed lot-coverage rule (§3c).

---

## 2. Screening Request — shed intake additions

All new fields are **optional** on `ShedProjectConfiguration`
(`src/screening-request/types.ts`) and its Boundary Validator zod schema
(`ShedProjectConfigurationSchema`, same file) — `undefined` means "not answered," never coerced
to a default, matching every existing garage/shed intake field's convention.

```ts
export const FoundationType = {
  SLAB_ON_GRADE: "SLAB_ON_GRADE",
  PIER_BLOCKS: "PIER_BLOCKS",
  ON_SOIL: "ON_SOIL",
  FROST_FOOTING: "FROST_FOOTING",
  PILES: "PILES",
  WOOD_FOUNDATION: "WOOD_FOUNDATION",
} as const;
export type FoundationType = (typeof FoundationType)[keyof typeof FoundationType];

export const ShedAttachment = {
  DETACHED: "DETACHED",
  ATTACHED: "ATTACHED",
} as const;
export type ShedAttachment = (typeof ShedAttachment)[keyof typeof ShedAttachment];

export const ShedIntendedUse = {
  STORAGE: "STORAGE",
  GREENHOUSE_PLANTS: "GREENHOUSE_PLANTS",
  HOBBY_WORKSHOP_UNOCCUPIED: "HOBBY_WORKSHOP_UNOCCUPIED",
  OCCUPIABLE: "OCCUPIABLE", // office / studio / sleeping - flagged out of shed-permit scope, not silently treated as exempt
} as const;
export type ShedIntendedUse = (typeof ShedIntendedUse)[keyof typeof ShedIntendedUse];

/** Progressive - triggered by a deterministic condition, never an arbitrary numeric margin band
 * (founder correction, 2026-09-13): asked if and only if `wallFootprintSqFt` (widthFt x depthFt)
 * <= 120. When `wallFootprintSqFt` > 120, the projected-roof-area exemption criterion (P1) is
 * already unsatisfiable regardless of overhang - the question is never shown (Frontend
 * §1/business-logic-model.md §2). */
export interface RoofOverhang {
  extendsBeyondWalls: boolean;
  /** Approximate per-side overhang, inches. Optional even when extendsBeyondWalls===true -
   * absent -> the roof-area criterion becomes REQUIRES_VERIFICATION rather than guessed. */
  approxOverhangIn?: number;
}

/** Progressive - only asked when it can actually change reviewPath (business-logic-model.md
 * §3). Never inferred from widthFt/depthFt (explicit founder instruction).
 *
 * Rewritten 2026-09-13 (founder correction): a categorical enum cannot distinguish a 20-ft
 * manufactured truss from a 35-ft one, even though the separately-stated 30-ft manufactured-
 * truss threshold matters. Collect the raw numbers instead and let evaluation apply the
 * thresholds (business-logic-model.md §2, `SIZE_SPAN`). */
export interface StructuralSpanInfo {
  structuralSpanFt: number;
  usesManufacturedTruss?: boolean;
}

/** Progressive, optional. Each sub-field independent - a customer may know they want electrical
 * but not yet know about plumbing. Drives trade-permit DISCLOSURE only (§3d) - never the
 * buildingPermit/reviewPath state. */
export interface UtilityIntent {
  electrical?: boolean;
  plumbing?: boolean;
  mechanical?: boolean;
}

// Added to ShedProjectConfiguration (all optional):
foundationType?: FoundationType;
attachment?: ShedAttachment;         // NOTE: no field exists today for this at all - always asked (§4 core three)
intendedUse?: ShedIntendedUse;
roofOverhang?: RoofOverhang;         // progressive
structuralSpanInfo?: StructuralSpanInfo; // progressive
utilityIntent?: UtilityIntent;       // progressive
```

`GarageProjectConfiguration` is **not touched** — garage permit determination is out of Unit 6B's
approved scope (shed only); the same fields would apply near-identically to a future garage pass
per `recommended-scope.md`'s reuse table, but are not added speculatively here.

---

## 3. Regulatory Rules Engine — new result types

### 3a. `PermitRequirementFinding` — the two-dimensional model (founder-directed evaluation, adopted)

A single enum (`LIKELY_PERMIT_EXEMPT` / `STFI_PERMIT_LIKELY` / `FULL_PERMIT_LIKELY` /
`REQUIRES_VERIFICATION`) cannot truthfully represent "the shed clearly needs *a* permit, but
*which* review path it needs is still unknown" — that case would otherwise be forced into the
generic `REQUIRES_VERIFICATION` bucket, discarding the one thing we DO know (a permit is
needed). The two-dimensional model keeps those independent:

```ts
export const BuildingPermitStatus = {
  LIKELY_EXEMPT: "LIKELY_EXEMPT",
  REQUIRED: "REQUIRED",
  REQUIRES_VERIFICATION: "REQUIRES_VERIFICATION",
} as const;
export type BuildingPermitStatus = (typeof BuildingPermitStatus)[keyof typeof BuildingPermitStatus];

export const PermitReviewPath = {
  /** Only ever paired with buildingPermit === LIKELY_EXEMPT. */
  NONE: "NONE",
  STFI_LIKELY: "STFI_LIKELY",
  FULL_REVIEW_LIKELY: "FULL_REVIEW_LIKELY",
  REQUIRES_VERIFICATION: "REQUIRES_VERIFICATION",
} as const;
export type PermitReviewPath = (typeof PermitReviewPath)[keyof typeof PermitReviewPath];

// P2b (zoning height) is DELIBERATELY EXCLUDED from this id set - founder correction: it is a
// separate zoning-compliance question, not an R105.2 exemption criterion, and is rendered as an
// ordinary Finding (see §3a-note below), never nested inside PermitRequirementFinding.
export const PermitCriterionId = {
  ROOF_AREA: "ROOF_AREA",       // P1
  STORY_HEIGHT: "STORY_HEIGHT", // P2a only (one-story) - NOT the height-limit number (P2b)
  FOUNDATION: "FOUNDATION",     // P3a
  ATTACHMENT: "ATTACHMENT",     // P4
  USE: "USE",                   // P5
  ECA: "ECA",                   // P6
  SIZE_SPAN: "SIZE_SPAN",       // P7a (750 sqft) AND P7b (span) combined - see business-logic-model.md Flow 2
} as const;
export type PermitCriterionId = (typeof PermitCriterionId)[keyof typeof PermitCriterionId];

export interface PermitCriterionResult {
  criterionId: PermitCriterionId;
  /** USE (P5) never produces NOT_MET, by founder instruction - only MET (storage/growing-plants)
   * or REQUIRES_VERIFICATION (everything else, including an explicitly occupiable answer). Every
   * other criterion may use the full status set. */
  status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION" | "NOT_APPLICABLE";
  /** e.g. "Shed is an addition, not a shed - see the addition path." for ATTACHMENT===ATTACHED;
   * or, for USE, "Use doesn't match the two explicit exempt categories (storage, growing
   * plants) - confirm with SDCI whether it counts as a similar unoccupied use." Always
   * populated, never a bare enum for the customer to interpret alone. */
  explanationBasis: string;
}

export interface TradePermitDisclosure {
  trade: "ELECTRICAL" | "PLUMBING" | "MECHANICAL";
  /** Fixed advisory copy (candidate P8, now non-tiered) - "Electrical, plumbing, or mechanical
   * work may require separate permits. Permit Preflight's shed building-permit result does not
   * determine those trade permits." Never framed as an absolute "always required" claim. */
  explanationBasis: string;
}

export interface PermitRequirementFinding {
  buildingPermit: BuildingPermitStatus;
  reviewPath: PermitReviewPath;
  criteria: PermitCriterionResult[];         // one per PermitCriterionId actually evaluated - P2b is NOT here
  tradePermitDisclosures: TradePermitDisclosure[]; // only for utilityIntent items the customer indicated
}
```

**P2b (zoning height limit) is a separate, ordinary regulatory finding** — reuses the
project's existing `Finding`/`FindingClassification` shape (unchanged, `regulatory-rules-engine/types.ts`),
subject "Accessory structure height limit," exactly like the shed report's pre-existing setback/
dwelling-separation findings. It is evaluated independently of `PermitRequirementFinding` and can
produce a `REQUIRES_VERIFICATION`/fail result even when `buildingPermit === LIKELY_EXEMPT` — the
founder's explicit point that a shed can fail zoning height compliance independently of the
building-permit exemption analysis.

**P2b is location-sensitive** (founder correction, 2026-09-13, superseding the earlier unresolved
"12 ft vs. 15 ft" framing): Ordinance 127376 / SMC 23.44.070 sets a general NR-zone structure
height limit of **32 feet**, but an accessory structure **located in a required setback** is
limited to **12 feet**, with no portion of its roof permitted to extend beyond that 12-ft limit.
This is never encoded as one universal number. The applicable branch is derived automatically
from the shed's **already-computed placement/setback facts** (the existing setback-distance
computation the shed pipeline already performs for its setback findings) — never a customer
question (Frontend §1):

```ts
// Not a new fact-fetch - reads the placement/setback computation already performed for the
// shed's existing setback findings, to determine whether the proposed shed footprint falls
// inside a required setback.
type AccessoryStructureHeightLimit =
  | { basis: "IN_REQUIRED_SETBACK"; limitFt: 12; roofMayNotExceedLimit: true }   // P2b-1
  | { basis: "OUTSIDE_REQUIRED_SETBACK"; limitFt: 32; citation: "SMC 23.44.070" } // P2b-2,
      // subject to whatever roof/height exceptions SMC 23.44.070 itself states - not
      // enumerated here, narrow item (external-verification-tracker item 24)
  | { basis: "REQUIRES_VERIFICATION"; reason: string }; // setback-location fact itself unresolved
```

The finding then compares `heightFt` (already collected) against `limitFt` for whichever branch
applies: `heightFt <= limitFt` → `PASS` (safe regardless of the unresolved exceptions below, since
satisfying the stated base limit is never worse off under any plausible exception). **Corrected on
review, 2026-09-15**: `heightFt > limitFt` → `REQUIRES_VERIFICATION`, **never an unconditional
`FAIL`**, for *both* branches — this document's own citation already discloses that P2b-2's 32 ft
figure is "subject to applicable roof/height exceptions SMC 23.44.070 itself states, not
enumerated here" (external-verification item 24), and P2b-1's 12 ft figure carries the same
unresolved roof-exception-interaction question. Declaring an unconditional `FAIL` for exceeding
either limit would silently assume none of those undisclosed exceptions apply — exactly the kind
of invented certainty this project's governing principle forbids. `FAIL` is reserved for a future
pass once item 24 resolves the exact exception text and confirms none apply to the case at hand.
Never implied by `buildingPermit === LIKELY_EXEMPT` (BR-U6B-9, unchanged).

**State-derivation summary** (full rule logic in `business-logic-model.md` §2–3):

| buildingPermit | reviewPath | Meaning |
|---|---|---|
| `LIKELY_EXEMPT` | `NONE` | all exemption criteria (P1, P2a, P3a, P4, P5, P6) MET |
| `REQUIRED` | `STFI_LIKELY` | fails ≥1 exemption criterion; P7a AND P7b both MET; ECA clear; foundation type known and not pile/wood (P3b clear) |
| `REQUIRED` | `FULL_REVIEW_LIKELY` | P7a or P7b NOT_MET, or ECA (P6) NOT_MET, or foundationType ∈ {PILES, WOOD_FOUNDATION} (P3b — corrected on review, 2026-09-15: previously documented as a candidate rule but never wired into this derivation) |
| `REQUIRED` | `REQUIRES_VERIFICATION` | permit is definitely needed (an exemption criterion is confirmed NOT_MET) but P7a/P7b/P6/P3b's contribution to reviewPath is itself unresolved (incl. `foundationType` unanswered) |
| `REQUIRES_VERIFICATION` | `REQUIRES_VERIFICATION` | not even the exempt-vs-required question can be answered yet (a required criterion is unanswered) |

### 3b. `EcaLotAreaAdjustment` — the ECA → lot-coverage interaction, restructured against SMC 23.44.080.B's now-explicit exclusion list (candidate C1b)

Founder correction: the earlier "REQUIRES_VERIFICATION for ANY intersecting ECA" design was too
broad. SMC 23.44.080.B names exactly four excluded categories — **only those four** ever
participate in this adjustment; every other mapped ECA hazard (steep slope outside its
designated non-disturbance sub-area, liquefaction, peat settlement, landslide-prone, flood-prone,
priority habitat, abandoned landfill) is irrelevant to lot-area exclusion, even though several of
them still matter for P6.

```ts
export const CoverageExcludedEcaCategory = {
  RIPARIAN_CORRIDOR: "RIPARIAN_CORRIDOR",
  WETLAND_AND_BUFFER: "WETLAND_AND_BUFFER",
  SUBMERGED_LAND_OR_SHORELINE_SETBACK: "SUBMERGED_LAND_OR_SHORELINE_SETBACK", // data source TBD - item 26
  STEEP_SLOPE_NON_DISTURBANCE_AREA: "STEEP_SLOPE_NON_DISTURBANCE_AREA", // a sub-area of the
                                                                          // steep_slope hazard,
                                                                          // not the whole polygon
                                                                          // - item 26
} as const;
export type CoverageExcludedEcaCategory = (typeof CoverageExcludedEcaCategory)[keyof typeof CoverageExcludedEcaCategory];

export type EcaLotAreaAdjustment =
  | { status: "NOT_APPLICABLE"; reason: string } // none of the 4 named categories intersect the parcel
  // A named category intersects, but the geometry needed to compute the excluded AREA precisely
  // is unavailable or insufficient - an EVIDENCE limitation (per the governing principle), never
  // a tier issue; C1b itself is T1.
  | { status: "REQUIRES_VERIFICATION"; intersectingCategories: CoverageExcludedEcaCategory[]; reason: string }
  | {
      status: "ESTABLISHED";
      excludedAreaSqFt: number;
      /** C1e - only meaningful when this adjustment's status is ESTABLISHED with excludedAreaSqFt > 0. */
      minimumCoverageFloor:
        | { status: "NOT_APPLICABLE" }
        | { status: "KNOWN"; floorSqFt: 625 }
        | { status: "REQUIRES_VERIFICATION"; reason: string }; // a Director-approved alternative
                                                                  // MAY exist (C1e, T2) - never
                                                                  // guessed; practically always
                                                                  // this branch, not KNOWN(625)
                                                                  // outright, once C1b areas exist
      basis: string;
    };
```

### 3c. `ShedLotCoverageResult` — bounded CASE A/B/C reasoning between the base (C1a, 50%) and potential special (C1c/C1d, 60%) allowances (founder-directed, 2026-09-13)

**Founder decision, 2026-09-13**: Unit 6B's initial slice does **not** build per-parcel
applicability detection for C1c (frequent-transit/dwelling-only/<3-story/common-amenity) or C1d
(stacked-dwelling-units) — no new GIS adapter, assessor integration, or customer question is
added merely to resolve the 50%-vs-60% question. **This defers automatic applicability
detection, not the rules themselves** — C1a/C1c/C1d remain deterministic Tier 1 rules
(`candidate-regulatory-rules.md`). The earlier `Applicability`/`LotCoverageMaximumFacts`/
`CoverageMaximumResult` (SINGLE_VALUE/RANGE) types are **retired** — replaced by bounded
band-reasoning directly against the two known, code-given percentages, with the estimated
coverage classified into exactly one of three cases (never a fourth speculative case):

```ts
export interface LotCoverageAllowanceFacts {
  adjustedLotAreaSqFt: number;   // parcelAreaSqFt, less any ESTABLISHED C1b exclusion (§3b);
                                   // raw parcelAreaSqFt when ecaAdjustment is NOT_APPLICABLE
  /** Present only when ecaAdjustment.status === "ESTABLISHED" with a KNOWN minimumCoverageFloor
   * (C1e's 625 sq ft floor, domain-entities.md §3b) - never fabricated when C1b doesn't apply. */
  c1eFloorSqFt?: 625;
  /** True when ecaAdjustment.status === "ESTABLISHED" and minimumCoverageFloor.status ===
   * "REQUIRES_VERIFICATION" - a Director-approved alternative (C1e, T2) MAY set a higher floor.
   * Only matters for Case C below - never guessed, never silently ignored. */
  c1eDirectorAlternativeRelevant: boolean;
}

// baseAllowanceSqFt      = max(adjustedLotAreaSqFt * 0.50, c1eFloorSqFt ?? 0)   [C1a, always known]
// potentialSpecialAllowanceSqFt = max(adjustedLotAreaSqFt * 0.60, c1eFloorSqFt ?? 0)  [C1c/C1d's
//   POTENTIAL ceiling - never asserted as this parcel's actual applicable maximum, since
//   applicability is never detected in this slice]

export interface ShedLotCoverageFacts {
  parcelAreaSqFt: number;                    // computeParcelAreaSqFt, reused
  existingMappedCoverageSqFt: number;        // existing-structure-coverage fact, reused (ESTIMATED)
  proposedShedFootprintSqFt: number;         // already computed in-memory in the pipeline
  ecaAdjustment: EcaLotAreaAdjustment;        // §3b (C1b/C1e)
  allowanceFacts: LotCoverageAllowanceFacts;  // this section
}

export type ShedLotCoverageResult =
  // CASE A - estimated coverage <= baseAllowanceSqFt. The 60% exception is IRRELEVANT to this
  // parcel's result - never required-verification merely because C1c/C1d applicability is
  // unknown (that unknown has no bearing on an outcome that's already within the 50% floor).
  | { status: "WITHIN_STANDARD_ALLOWANCE"; estimatedCoverageSqFt: number; baseAllowanceSqFt: number; facts: ShedLotCoverageFacts }
  // CASE B - baseAllowanceSqFt < estimated coverage <= potentialSpecialAllowanceSqFt. Exceeds the
  // standard 50% but might fit within a 60% allowance IF the development qualifies under C1c/C1d
  // - unknown in this slice, so REQUIRES_VERIFICATION, never a claimed failure.
  | { status: "REQUIRES_VERIFICATION"; reason: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE"; estimatedCoverageSqFt: number; baseAllowanceSqFt: number; potentialSpecialAllowanceSqFt: number; facts: ShedLotCoverageFacts }
  // CASE C, C1e Director-alternative NOT relevant - estimated coverage exceeds BOTH percentage
  // possibilities. Deterministic, subject to the ESTIMATED nature of mapped structure coverage.
  | { status: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE"; estimatedCoverageSqFt: number; potentialSpecialAllowanceSqFt: number; facts: ShedLotCoverageFacts }
  // CASE C, C1e Director-alternative relevant - never an unconditional failure. A parcel-specific
  // Director-approved amount, if one exists (never guessed), could set a higher permitted amount.
  | { status: "REQUIRES_VERIFICATION"; reason: "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE"; estimatedCoverageSqFt: number; potentialSpecialAllowanceSqFt: number; facts: ShedLotCoverageFacts }
  // The lot-area denominator adjustment itself (C1b) is unresolved (a REQUIRES_VERIFICATION
  // EcaLotAreaAdjustment) AND the unadjusted-denominator computation does not already land
  // safely in EXCEEDS territory - the asymmetric fail-closed rule below applies (never
  // manufactures a false WITHIN_STANDARD_ALLOWANCE or MAY_QUALIFY case from an uncertain,
  // possibly-smaller true denominator).
  | { status: "REQUIRES_VERIFICATION"; reason: "LOT_AREA_ADJUSTMENT_UNRESOLVED"; estimatedCoverageSqFt: number; facts: ShedLotCoverageFacts };
```

Concrete numeric values (50%, 60%, 625 sq ft) are **directly founder-confirmed from cited
current-code subsections** (`candidate-regulatory-rules.md` C1a/c/d/e). What is deferred is only
*automatic detection of which parcels the 60% figure actually applies to* — never the figures
themselves, and never the deterministic Tier-1 status of C1c/C1d. C2's exclusions (underground
structures, qualifying projections/decks/porches, etc.) reduce `existingMappedCoverageSqFt`'s
reliability (an `ESTIMATED`-label/evidence matter, per candidate rule C2 — T1) but are not
separately typed here; they are absorbed into the `existing-structure-coverage` fact's own
`overCountCaveat` (§1b) until Code Generation determines whether any is worth a dedicated
computation for Unit 6B's scope.

**Deferred enhancement (recorded, not scheduled)**: "Automatic 60%-allowance applicability
detection" — resolving whether a given parcel actually qualifies under C1c/C1d (frequent-transit
location, development use, story count, common-amenity configuration, stacked-dwelling-unit
status) so Case B's band could sometimes collapse to a definite result. Not a new unit; revisit
only if real reports land materially often between the base and potential-special allowance, or
professional-user feedback indicates the ambiguity is reducing report value.

### 3d. What is explicitly NOT a new type

- No change to `Finding`, `FindingClassification`, `ComplianceOutcome` (existing, unmodified).
- No change to `CriticalAreaFinding`, `spatial-analysis/eca.ts`, `eca-implication.ts` (reused
  verbatim).
- No `PropertyContext.environmentalConstraints`/`existingStructureCoverage` camelCase aliasing —
  facts live in `PropertyContext.facts[]` exactly like every existing fact, addressed by
  `factType` string via `getFact()`, not as new top-level fields (the founder's example names in
  the original request were illustrative; the actual mechanism is the existing `PropertyFact`
  array, unchanged).
- No Track 4 types (feasible placement remains fully deferred).
