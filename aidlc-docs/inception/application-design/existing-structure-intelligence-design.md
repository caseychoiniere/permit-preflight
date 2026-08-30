# Existing-Building / Dwelling-Footprint Intelligence — Research & Design

**Status:** Design only — no implementation code in this pass, per explicit instruction.
**Date:** 2026-08-29

> **SUPERSEDED (2026-08-29, same day, founder correction):** This document's factual research
> (Seattle Building Outlines 2023's real endpoint/fields/CRS/licensing, King County `resbldg_extr`'s
> real fields/join-key/no-geometry limitation, the unresolved bulk-download-access blocker) remains
> valid and was relied on for the actual implementation. **Its recommended CLASSIFICATION STRATEGY
> below (King County `resbldg_extr` as a prerequisite for confident `PRIMARY_DWELLING`
> classification) was explicitly rejected and replaced.** The founder's instruction: *"Do NOT make
> King County assessor data a blocker."* The implemented v1 strategy uses **explicit user
> confirmation** instead — the property owner is shown each real building footprint on the parcel
> map and confirms which one (if any) is the primary dwelling; `resbldg_extr` is deferred
> indefinitely and integrated nowhere. See `aidlc-docs/audit.md`'s "Building intelligence v1 -
> implementation" entry and `src/property-intelligence/existing-structures.ts` for what was
> actually built. Do not follow this document's own §4/§7 classification-rule recommendation.
**Trigger:** Real staging end-to-end test confirmed the full pipeline works, but exposed that
`distanceToDwellingFt` (consumed by `evaluate.ts`'s `DWELLING_SEPARATION` rule) is never populated
by Property Intelligence, so the finding is always `REQUIRES_VERIFICATION` for every shed report.

---

## 1. Recommended public data sources

### 1a. Seattle Building Outlines 2023 — CONFIRMED, real, verified live

| | |
|---|---|
| **Owner** | City of Seattle, Enterprise GIS Data Team ("SeattleData" ArcGIS org account) |
| **Endpoint** | `https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Building_Outlines_2023/FeatureServer/0` |
| **Access** | Public Esri REST `/query` (same mechanism, same request shape as the parcel-boundary retriever already in production — `?where=PIN='...'&outFields=...&outSR=2926&f=json`) |
| **Geometry** | Polygon |
| **CRS** | **WKID 2926** — Washington State Plane North, the exact `AUTHORITATIVE_PARCEL_SRID` this codebase already standardizes on. **No reprojection needed at the boundary** — a genuine simplification versus the parcel retriever, which has to actively defend against a default-EPSG:3857 response. |
| **Fields** | `PIN` (join key — same PIN format the existing King County parcel retriever already uses), `AREA` / `Shape__Area` (footprint sq ft), `OUTLINE_ID`, `CENTROID_X`/`CENTROID_Y`, `COMMENT_` (free text). **No building-type/use attribute of any kind.** |
| **Provenance** | "Hand Drawn Building Outlines derived from King County 2023 ortho imagery by Eagleview Corp." Created Jan 2025, last modified Jun 2026 (actively maintained, no published refresh SLA). |
| **Licensing** | City of Seattle's standard accuracy disclaimer ("no representation or warranty as to its accuracy... labeling, dimensions, contours, property boundaries, or placement"). No commercial-use restriction found. Same posture as the parcel-boundary layer already in production — general-location-quality, not survey-grade. |
| **Max record count** | 2,000 — irrelevant at per-parcel query volume. |

This is a drop-in sibling to `king-county-parcel-geometry.ts` — same transport pattern, same CRS,
same join key, different agency (Seattle, not King County).

### 1b. King County Assessor Residential Building Extract (`resbldg_extr`) — CONFIRMED fields, access mechanism needs direct follow-up

| | |
|---|---|
| **Owner** | King County Department of Assessments; value-added/re-published by KCGIS Center |
| **Access mechanism** | **Not a spatial ArcGIS REST layer** — confirmed via the GIS Data Catalog (`www5.kingcounty.gov/sdc/?Layer=resbldg_extr`): "Geometry Type: None (data table)", "Sharing Status: Not Public" as an ArcGIS Online item. The authoritative public path is King County Assessor's own bulk file extract (`info.kingcounty.gov/assessor/DataDownload`), gated behind an acknowledgment of RCW 42.56.070(9) (restricts use of *lists of individuals* for commercial purposes — not obviously applicable to aggregate building characteristics, but worth a direct compliance read before relying on it in a paid product). **The exact current file name/format/URL was not resolved by this research pass** — the download page is an acknowledgment gate, not a self-describing API; this is the #1 open item before implementation (see §9). |
| **Join key** | `PIN` = `MAJOR` + `MINOR` concatenated — the same PIN format already used everywhere in this codebase. |
| **Update cadence** | Weekly (per the GIS Data Catalog). |
| **Coverage** | One record per **residential** building (1–3 living units) — commercial/multi-family (4+ units) buildings are out of scope for this table, which is fine: Permit Preflight's shed/garage flow only ever cares about single-family-adjacent parcels. |
| **Key fields** | `BLDGNBR` (1–31 — parcels CAN have multiple assessor-tracked buildings), `NBRLIVINGUNITS` (1–3), `SQFTTOTLIVING`, `YRBUILT`, `STORIES`, `BLDGGRADE`, `BLDGCONDITION` (renamed from `CONDITION` by GIS Center), plus basement/garage/porch/deck sqft breakdowns. |
| **Critical limitation** | **No geometry, and no key linking a specific `BLDGNBR` record to a specific Building-Outlines `OUTLINE_ID`.** When a parcel has exactly one outline, the join is unambiguous by PIN alone. When a parcel has multiple outlines, there is no authoritative way to say which polygon corresponds to which assessor building record — this is the central limitation answered in §2. |

### 1c. Optional secondary source (not required for the first slice)

`kca102_presentuse_parcel` decode table + the King County Assessor **Parcel** extract's
`PRESENTUSE` field (a *different* table than the bare `KingCo_Parcels` spatial layer already in
production, which was confirmed via live query to carry only `MAJOR`/`MINOR`/`PIN`/geometry — no
land-use attribute). `PRESENTUSE` (e.g., codes for "Single Family(Res Use/Zone)") is a cheap,
parcel-level corroborating signal — useful as a *future* secondary check, not necessary for the
minimal slice, since `resbldg_extr`'s `NBRLIVINGUNITS` already carries the primary signal needed.

No other Seattle/King County source materially changes this picture — LIDAR-derived footprint
sets, E911 address points, and King County's own general building-footprint layers were considered
and would add access complexity without resolving the core ambiguity (matching a specific footprint
to a specific assessor building record on multi-structure parcels).

---

## 2. Can Seattle Building Outlines alone identify the primary dwelling?

**No.** The layer has zero attributes describing building type, use, or function — only geometry,
area, a numeric outline ID, and PIN. Two sheds and a house on the same parcel are three
indistinguishable polygons as far as this dataset is concerned.

**What's needed, and what it actually buys you:**

- King County `resbldg_extr` confirms *that* a residential building exists on a parcel
  (`NBRLIVINGUNITS >= 1`) and gives its rough characteristics (square footage, year built,
  stories) — but carries **no geometry**, so it cannot say *which* outline polygon that building
  corresponds to.
- The two sources join cleanly by **PIN** at the parcel level, but there is **no sub-parcel join
  key** (no shared building ID) between an assessor `BLDGNBR` record and a Building-Outlines
  `OUTLINE_ID`.
- The practical consequence: identification is **confident only when a parcel has exactly one
  building outline** and the assessor record confirms a residential building exists — at that
  point, "the one polygon on this parcel" and "the one residential building the assessor tracks"
  are the same real-world object with very high confidence, even without a formal join key. The
  moment a parcel has **two or more outlines**, matching a specific outline to a specific
  assessor record is guesswork without a real join key — and per the founder's own principle, this
  codebase does not guess. That case degrades to `UNKNOWN`, not a heuristic pick.

This directly shapes the recommended first slice in §8: it deliberately targets only the
single-outline, high-confidence case.

---

## 3. Proposed normalized Property Intelligence model

The existing model already fits this well without a new abstraction:
`PropertyContext.facts: PropertyFact[]`, where `PropertyFact<TValue>.value` is already generic and
`Provenance` is already a full source/quality/caveat record attached per-fact. The right move is
**two new primitive `FactRetriever`s (one per external source, each honestly single-sourced) plus
one small pure classification step that combines them** — mirroring the existing precedent of
`buildLotCoverageFacts` (a pure, non-network "derive a fact from already-fetched facts" function
already living in `pipeline.ts`).

```ts
// New PropertyFact, factType: "existing-structure-footprints"
// Retrieved by a Seattle-Building-Outlines FactRetriever, evidenceQuality: GENERAL_LOCATION_ONLY
// (same caveat class as the parcel-boundary layer - hand-drawn from imagery, not surveyed).
interface RawStructureFootprint {
  outlineId: string;
  footprint: Polygon;       // srid: AUTHORITATIVE_PARCEL_SRID (2926) - already native, no transform
  areaSqFt: number;         // from the source's own AREA field
}

// New PropertyFact, factType: "existing-residential-building-summary"
// Retrieved by a King-County-resbldg_extr FactRetriever, evidenceQuality: GENERAL_LOCATION_ONLY
// or AUTHORITATIVE depending on the confirmed access mechanism (see open question #9).
interface ResidentialBuildingSummary {
  bldgNbr: number;
  nbrLivingUnits: number;
  sqFtTotLiving: number;
  yrBuilt?: number;
}

// NOT a FactRetriever output - a pure, derived value computed in the pipeline from the two facts
// above (exactly like buildLotCoverageFacts today), attached to the report's evidence array the
// same way that function's own output already is. One entry per structure found.
type ExistingStructureClassification = "PRIMARY_DWELLING" | "UNKNOWN";

interface ExistingStructure {
  outlineId: string;
  footprint: Polygon;
  areaSqFt: number;
  classification: ExistingStructureClassification;
  /** Never invented copy - a specific, inspectable reason, e.g. "sole building outline on parcel;
   * King County residential-building record confirms 1 living unit" or "3 outlines present on this
   * parcel; could not be confidently matched to a specific assessor building record." Surfaced
   * verbatim in the report when the finding is REQUIRES_VERIFICATION, so the customer sees WHY,
   * not just that verification is needed. */
  classificationBasis: string;
}
```

This is deliberately **not** a new top-level domain concept, a new database table, or a new
service module — it's two more entries in the same `facts[]` array every other Property
Intelligence source already populates, plus one pure function. `EvidenceQuality` stays a two-value
enum exactly as it is today; classification confidence is expressed through
`classification`/`classificationBasis`, never a third evidence-quality tier.

---

## 4. Pipeline

```
confirmed parcel (existing)
  → fetchParcelBoundaryPolygon (existing, unchanged)
  → NEW: fetchExistingStructureFootprints(parcelId)   — Seattle Building Outlines, by PIN
  → NEW: fetchResidentialBuildingSummary(parcelId)     — King County resbldg_extr, by PIN
       (both assembled into PropertyContext.facts via assemblePropertyContext, unchanged)
  → NEW: classifyExistingStructures(footprints, summary) — pure function, pipeline.ts
       (mirrors buildLotCoverageFacts's existing "derive from already-fetched facts" pattern)
  → PostGIS (existing computeSetbackDistances call site, pipeline.ts ~line 145-165):
       NEW: computeDistanceToDwelling(db, shedFootprintProjected, dwellingFootprint, srid)
       — only called when exactly one structure classified PRIMARY_DWELLING
  → project.distanceToDwellingFt populated (shed branch, pipeline.ts ~line 210-221)
  → regulatory-rules-engine/evaluate.ts's DWELLING_SEPARATION case — completely unchanged;
    it already does the right thing once the fact is present
```

Nothing about `evaluate.ts`, the regulatory-rule-governance module, deterministic findings for
setbacks/height/lot-coverage, payment, or artifact immutability changes. The rules engine already
handles "fact absent → REQUIRES_VERIFICATION" correctly; this work only ever adds a new,
best-effort way to supply that fact when confidence genuinely supports it.

---

## 5. `distanceToDwellingFt` calculation

Exactly the same mechanism already used for lot-line setbacks
(`spatial-analysis/postgis-adapter.ts`'s `distanceToEdge`), applied to a second polygon instead of
a line:

```sql
SELECT ST_Distance(
  ST_SetSRID(ST_GeomFromText(:shedFootprintWkt), :srid::int),
  ST_SetSRID(ST_GeomFromText(:dwellingFootprintWkt), :srid::int)
) AS distance_ft
```

Both geometries are already in (or trivially available in) the authoritative projected CRS
(2926) — the shed's own footprint polygon is already computed and held in-memory at the exact call
site (`footprintProjected`, pipeline.ts) by the time this would run, and Seattle's Building
Outlines are natively 2926, so no `ST_Transform` is needed for the dwelling side at all. This is
minimum polygon-to-polygon distance (`ST_Distance` on two `POLYGON` geometries), never centroid
distance and never a value derived from user-entered coordinates — PostGIS remains the sole
authority for the computation, matching every other spatial calculation in this codebase.

---

## 6. Edge-case behavior

| Situation | Behavior |
|---|---|
| No building footprint returned | Fact recorded as `AVAILABLE` with an empty array (a real, informative "no buildings found" result — distinct from a source failure). Classification: no candidates → `distanceToDwellingFt` stays `undefined` → existing `REQUIRES_VERIFICATION` path, unchanged. |
| Multiple buildings exist | v1 (see §8): classified `UNKNOWN` for all candidates — no "largest wins" guess. `distanceToDwellingFt` undefined → `REQUIRES_VERIFICATION`, but the report can now disclose *why* ("N structures observed; the primary dwelling could not be confidently identified") instead of an unexplained REQUIRES_VERIFICATION as today. |
| Assessor confirms a dwelling but geometry can't be confidently matched | Same as above — `UNKNOWN`, disclosed, never a guess. |
| Footprint data and assessor records conflict (e.g. assessor shows 0 residential buildings but a house-sized outline exists) | Treated as a disagreement signal, not resolved by trusting either source — `UNKNOWN`. Never silently prefer one source. |
| Parcel contains an ADU or detached garage | Each outline becomes its own `ExistingStructure` entry, independently classified. Without a real outline↔`BLDGNBR` join key, a parcel with an ADU (its own `NBRLIVINGUNITS` record) alongside the main house is exactly the "multiple outlines" case above — correctly `UNKNOWN` in v1 rather than a guess at which is "the" dwelling. |
| Building-outline data appears stale (e.g. a shed/addition built after 2023 imagery) | Disclosed via the retriever's own `qualityCaveat`, exactly like the parcel-boundary layer's existing "general parcel location... not surveyed" caveat — an honest, static, per-source disclosure, not a per-call staleness check (no reliable way to detect staleness from the API itself). |

This is the "fail closed on claims, not on customer journey" principle applied directly: every one
of these cases still produces a complete report; only the specific finding stays
`REQUIRES_VERIFICATION`, now with a legible reason instead of a black box.

---

## 7. What this unlocks beyond dwelling separation

- **Existing-structure footprint area** — `AREA`/`Shape__Area` from Building Outlines, or a PostGIS
  `ST_Area` cross-check, gives a *measured* existing-structure square footage for the first time.
- **Lot coverage** — today, garage lot-coverage (`buildLotCoverageFacts`, BR-U4-3) relies entirely
  on a **self-reported** existing-structure estimate from the customer, always `REQUIRES_VERIFICATION`
  by design. Real building-footprint area is a natural, materially better input here — **not**
  proposed as part of this slice (BR-U4-3's self-report-only design looks deliberate and shouldn't
  be silently overridden), but flagged as the highest-value next opportunity once this capability
  ships (§10).
- **Multiple-structure awareness** — even at `UNKNOWN` classification, simply knowing "N existing
  structures on this parcel" is new, useful report content today's pipeline has no way to produce.
- **Map display** — `ParcelPlacementMap`/`ReportMap` already render GeoJSON layers (parcel
  boundary, shed footprint) via the exact same MapLibre pattern; existing-structure footprints slot
  in as one more layer with no new client-side mechanism needed.
- **Future project types** — additions, decks, and further ADU/garage scenarios all need "what's
  already there" context; this is the one integration point all of them would share.

---

## 8. Smallest first implementation slice

Deliberately conservative, to keep "do not infer/guess without support" as strict as possible on
day one, and to make validation against real Seattle parcels fast:

1. `fetchExistingStructureFootprints(parcelId)` — new module mirroring
   `king-county-parcel-geometry.ts` almost exactly (Esri `/query` by PIN, Zod validation, explicit
   SRID verification, `qualityCaveat`), targeting the Seattle Building Outlines FeatureServer.
2. `fetchResidentialBuildingSummary(parcelId)` — new module for King County `resbldg_extr`, shape
   depends on the confirmed real access mechanism (§9 blocking question).
3. `classifyExistingStructures(footprints, summary)` — pure function. **v1 rule: classify
   `PRIMARY_DWELLING` only when there is exactly one footprint AND the assessor summary confirms
   `nbrLivingUnits >= 1`. Every other combination (zero footprints, multiple footprints, no
   assessor confirmation, conflicting signals) is `UNKNOWN`.** No area-ranking heuristic in v1.
4. `computeDistanceToDwelling` in `postgis-adapter.ts` — the `distanceToEdge`-style function from
   §5.
5. Wire into `pipeline.ts`'s shed branch only (`DWELLING_SEPARATION` is already shed-only) — set
   `project.distanceToDwellingFt` when classification succeeds.
6. No map-display change, no lot-coverage change, no garage-branch change in this slice.

This is validatable immediately against real single-family Seattle parcels (the common case) and
deliberately defers every genuinely ambiguous case to the honest `UNKNOWN` path already correct
today, rather than trying to solve multi-structure disambiguation in the first pass.

---

## 9. New external-verification-tracker items to add

1. **Blocking:** confirm King County `resbldg_extr`'s real, current public access mechanism (exact
   bulk file/URL/format, or a REST path not surfaced by this research pass) directly against
   `info.kingcounty.gov/assessor/DataDownload` — the RCW 42.56.070(9) acknowledgment gate blocked
   automated discovery here.
2. Confirm the Seattle Building Outlines 2023 FeatureServer's rate limits/reliability at real
   per-request production volume (it's a shared ArcGIS Online org service, not King County's own
   dedicated `gismaps.kingcounty.gov` infrastructure already proven in production).
3. Quick compliance read on RCW 42.56.070(9) as applied to this specific use (aggregate building
   characteristics per parcel for a paid screening report, never an owner-identity list) before
   relying on King County Assessor data in a commercial product.
4. Manual QA pass classifying a real sample of Seattle parcels (single structure, garage-present,
   suspected-ADU) against this design's v1 rule, before trusting `PRIMARY_DWELLING` output in
   production.
5. No published refresh cadence found for Building Outlines 2023 — track it as a point-in-time
   snapshot and periodically re-verify it hasn't gone stale relative to King County's newer imagery
   cycles.

---

## 10. Existing assumptions that would need amendment

- Any code comment currently treating "`DWELLING_SEPARATION` is always `REQUIRES_VERIFICATION`" as
  a permanent, accepted limitation (rather than "no fact source exists yet") should be corrected
  once this ships — it becomes conditionally resolvable, not permanently unavailable.
- `ProjectDetails`/`ShedProjectDetails`'s `distanceToDwellingFt` field docstring should be updated
  from "never populated" (if worded that way today) to describe the new, best-effort source.
- BR-U4-3 (garage lot-coverage's existing-structure figure is always self-reported,
  always `REQUIRES_VERIFICATION`) is **not** touched by this slice, but is the clear next place this
  capability would materially help — worth a deliberate, separate decision later, not an incidental
  side effect of this change.
- Property Intelligence's own module-level docstrings (`assemble.ts`, `king-county-parcel-geometry.ts`)
  describe "Unit 1's" retrievers as parcel-geometry-only; a second, sibling retriever family
  (existing structures) is a natural, disclosed extension of the same `FactRetriever` contract, not
  a departure from it — worth a one-line doc update noting the pattern now has more than one member.

---

## Closing recommendations

**Source strategy:** Seattle Building Outlines 2023 (geometry, `AREA`, PIN join) + King County
`resbldg_extr` (residential-building confirmation signal, PIN join) — two sources, both already
matching this codebase's existing per-parcel Esri-REST-by-PIN pattern in spirit; no new
infrastructure, no bulk ingestion, no new database tables.

**Normalized data shape:** two new primitive `PropertyFact`s (raw footprints, raw assessor summary)
plus one pure, derived `ExistingStructure[]` classification computed in the pipeline exactly like
`buildLotCoverageFacts` already is — no new domain abstraction.

**First implementation slice:** the single-outline-plus-confirmed-residential-record case only;
every ambiguous case stays the existing, correct `UNKNOWN`/`REQUIRES_VERIFICATION` path, now with a
disclosed reason.

**Concrete files/modules likely to change (when this moves to implementation):**
- New: `src/property-intelligence/seattle-building-outlines.ts` (FactRetriever, mirrors
  `king-county-parcel-geometry.ts`)
- New: `src/property-intelligence/king-county-residential-building.ts` (FactRetriever, exact shape
  pending §9's blocking question)
- New (small, pure): a classification function — likely co-located in `pipeline.ts` near
  `buildLotCoverageFacts`, or a new tiny `src/property-intelligence/existing-structures.ts`
- `src/spatial-analysis/postgis-adapter.ts` — new `computeDistanceToDwelling` function
- `src/report-generation-orchestrator/pipeline.ts` — wire the new retrievers into
  `assemblePropertyContext`'s retriever list, call the classifier, call the new PostGIS function,
  populate `project.distanceToDwellingFt` in the shed branch
- No changes to `regulatory-rules-engine/evaluate.ts`, `regulatory-rule-governance/`,
  `order-payment/`, `checkout-fulfillment/`, or artifact/report-access modules

**Risks / open questions:**
- King County `resbldg_extr`'s exact live access mechanism is unconfirmed — resolve before writing
  code (§9, item 1).
- No sub-parcel join key between the two sources caps confident classification to the
  single-outline case; this is a real, permanent limitation of these two sources, not a bug to
  eventually fix — multi-structure parcels stay `UNKNOWN` unless a better-joined source is found
  later.
- RCW 42.56.070(9) warrants a quick compliance read given this is a paid product, even though the
  specific fields used here are aggregate, not owner-identity data.
- Building Outlines 2023 has no published refresh SLA.

**Recommendation: proceed**, scoped to the conservative v1 slice in §8, with item 1 of §9 (the
King County access-mechanism question) resolved first as a genuine blocking prerequisite.
