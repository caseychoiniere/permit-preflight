# Unit 4: Existing-Structures Lot-Coverage Data Source Validation (Q1)

**Revised 2026-08-26 per founder review**: (1) the founder has selected the user-supplied fallback
this document listed as an option — see "Founder Decision — Fallback Selected" below; (2) this
document's original closing line ("environmentally-critical-area concepts this project's existing
ECA integration already has real data for") was checked against the actual codebase during the
Correction 2 pass and found **incorrect** — corrected below under "Correction — ECA Data
Sufficiency Re-Checked."

**Method**: real, live queries against King County's GIS REST catalog (`gismaps.kingcounty.gov`,
the exact service root this project already integrates with), the King County/Esri ArcGIS Online
content-search API, and the Seattle-published `Seattle_BuildingShells` service directly — not desk
research alone. Bounded to answering exactly one question, per the founder's scope: can
sufficiently authoritative existing-structure footprint data be obtained to support SRE-GARAGE-1's
`(existing structures + proposed garage footprint) / parcel area` calculation?

**This document does not soften the result to make Unit 4 look more ready than it is.**

## Finding: NO SUITABLE AUTOMATED AUTHORITATIVE SOURCE FOUND

Every candidate identified was investigated on its actual merits, not assumed adequate or
inadequate. None is fit for this specific regulatory calculation.

### Candidates investigated

| Candidate | What it is | Access method | Disqualifying finding |
|---|---|---|---|
| King County regional GIS REST catalog (`Property`, `Planning`, `DLS`, `Administration`, `BaseMaps`, `KCGIS`, `Topo`, `Survey` folders — every folder enumerated) | — | Live `?f=json` folder/service listing | **No building-footprint or structure-footprint layer exists anywhere in the catalog.** `Property/KingCo_PropertyInfo`'s own 12 sublayers (parcel/ownership/tax-classification data only) confirmed to contain nothing structural. |
| `KingCo_ImperviousSurfaces` (`Environment/KingCo_ImperviousSurfaces/MapServer/0`) | 2015 impervious-surface classification, "derived primarily on spectral vegetative index applied to 2015 color infrared aerial orthoimagery" (the service's own description) | Live service query | **Raster-only** (`geometryType` absent, single `Map` image layer, `OBJECTID`/`SHAPE`(point) fields only) — no per-parcel vector/attribute query is possible without raster zonal-statistics processing, a materially different and more complex integration than this project's existing simple `query` REST calls. Even if processed, it measures **all** impervious surface (driveways, patios, parking — not just roofed structures), which would overcount relative to SMC 23.44.080's actual "lot coverage" definition (§ below). **10+ years stale** (2015). |
| `Seattle_BuildingShells` (`services.arcgis.com/ZOyb2t4B0UYuYNYH/.../SceneServer`), published by City of Seattle OPCD | "3D building shells for the City of Seattle. Derived from LIDAR and building footprints captured in 2015." The one candidate genuinely derived from real footprint capture. | Live service metadata (`SceneServer?f=json`, layer field list) | **3D `SceneServer`/`3DObject` layer, not a queryable 2D `FeatureServer`/`MapServer` polygon** — the field list (`BLDGHEIGHT`, `EAVEHEIGHT`, `ROOFFORM`, `BASEELEV`, etc.) has **no footprint-area attribute**; deriving area would require extracting and computing area from 3D mesh geometry, a nontrivial capability this project's PostGIS-based pipeline does not have and was not designed for. **10+ years stale** (2015 LIDAR capture). Explicit publisher disclaimer: *"The City of Seattle makes no representation or warranty as to its accuracy, and in particular, its accuracy as to labeling, dimensions, contours, property boundaries, or placement or location of any map feature thereof."* Whether small detached accessory structures (a target-size garage) are captured with the same fidelity as primary residences is undocumented. |
| Seattle SDCI's own published GIS layers (`SDCI_SeattleCityGIS` org — ECA layers, Development Sites, Unreinforced Masonry Buildings, Landmarks, etc., every layer enumerated via live content search) | — | Live ArcGIS content search | **No building-footprint, lot-coverage, or structure-area layer published by SDCI at all** — SDCI's own GIS output is regulatory-overlay-focused (critical areas, design review, historic), not structure-inventory-focused. |
| King County/Seattle Open Data catalog search for "lot coverage" | — | Live ArcGIS content search | No relevant authoritative result — only unrelated third-party/other-jurisdiction items. |

### Why the two closest candidates were still rejected, explicitly

Both `KingCo_ImperviousSurfaces` and `Seattle_BuildingShells` are **real, genuinely-existing,
publicly-accessible** data — this is not a "nothing was found" outcome dressed up as "no suitable
source." Each was rejected on a specific, stated basis: staleness (both 2015 — over a decade old as
of this project's 2026 present), a service-type mismatch with this project's existing simple-REST-
query integration pattern (raster vs. this project's vector-query pipeline; 3D mesh vs. this
project's 2D-polygon PostGIS pipeline), a measured-quantity mismatch (impervious surface ≠ SMC's
specific "lot coverage" definition — see below), and, for the building-shells product specifically,
an explicit publisher accuracy disclaimer naming property boundaries and feature placement by name.

### What SMC 23.44.080 actually defines as "lot coverage" (confirmed live against the current code)

Read directly from Seattle Municipal Code 23.44.080 (Neighborhood Residential zone, current as of
Ordinance 127376/Supp. 44 Update 1, the same chapter this project's existing real shed-setback
candidate already cites): **maximum lot coverage for structures is 50 percent** of lot area, with
specific carve-outs not counted (underground structures; the first 36 inches of eaves/cornices/
gutters/roofs/fireplaces/chimneys; decks 36" or less above grade; unenclosed porches/steps ≤4ft;
certain unenclosed structures per 23.44.090.H). This is a **structure-footprint** concept (what
counts as "structure," explicitly excluding several classes of minor/unenclosed features) — neither
candidate source measures this specific quantity. Impervious surface is broader (includes paved
areas); building shells' 3D mesh, even if area could be extracted from it, would need the same
exclusion logic applied and has no documented way to do so.

## Correction — ECA Data Sufficiency Re-Checked (2026-08-26, Correction 2)

This document's numerator-side finding above (no source for *existing-structure footprint*) is
unchanged. But its closing sentence in the original version of this document additionally claimed,
in passing, that the SMC 23.44.080.B *denominator*-side exclusions (riparian corridors,
wetlands/buffers, submerged lands/shoreline setback, steep-slope non-disturbance areas) were
categories "this project's existing ECA integration already has real data for." **That claim was
not actually checked against the codebase when originally written, and is wrong.** Grepping the
real source during the founder's Correction 2 review found:

- `spatial-analysis/eca.ts`'s `resolveCriticalAreaFinding` is a **pure classification function**
  (map fact → `CriticalAreaFinding` with a tri-state `MappedIntersectionResult` — `INTERSECTS` /
  `NO_INTERSECTION` / `INDETERMINATE`, plus a distance-to-edge) — it has **no current caller
  anywhere in `src/`** outside its own test file. There is no live King County ECA GIS adapter
  wired into the pipeline today; the function exists, designed and tested, awaiting a real
  integration that Unit 1 never built (sheds' setback siting apparently never needed it wired in,
  or it was deferred).
- Of the hazard types actually named anywhere in this codebase, only `"steep_slope"` appears at all
  (`eca.ts`'s `toleranceFor`, referencing Unit 0B's own empirical tolerance-band finding). Nothing
  named `wetland`, `riparian`, or `shoreline` appears anywhere in `src/`. **3 of SMC 23.44.080.B's 4
  exclusion categories (riparian corridors, wetlands/buffers, submerged lands/shoreline setback)
  have zero prior integration of any kind in this project** — not stale, not partial, simply never
  built.
- Even for `steep_slope`, the one category with any prior design work, `CriticalAreaFinding`
  answers *"does this hazard type's mapped layer intersect this parcel"* (a boolean/tri-state
  proximity fact) — it does **not** answer *"how many square feet of this parcel fall within the
  hazard area"*, which is what an SMC 23.44.080.B area exclusion actually requires. Computing that
  would need a genuinely different PostGIS operation (an area-of-intersection computation, e.g.
  `ST_Intersection` + `ST_Area`) that `spatial-analysis/postgis-adapter.ts` has never performed —
  its existing operations are `ST_Transform`, `ST_Distance`, `ST_MakePoint`, and `ST_AsGeoJSON`
  only.

**Corrected conclusion**: existing ECA/spatial data is **not** sufficient today to compute a
countable-lot-area exclusion with authority, for any of SMC 23.44.080.B's four exclusion
categories. See `business-rules.md` BR-U4-7 and `business-logic-model.md` Workflow U4-1 for how the
lot-coverage calculation now handles this honestly (a parcel with no evidence of any exclusion
category applying can still use its raw parcel area as the countable area — there is nothing to
subtract; a parcel where an exclusion category might apply, and the actual excluded area cannot be
measured, routes to `REQUIRES_VERIFICATION` for that reason, independent of the existing-structures
question). **This finding does not, by itself, justify adding a new data source or building a new
PostGIS capability in Unit 4** — per the founder's explicit instruction, that would require separate
approval; it is documented here so the actual coverage limitation is visible rather than assumed
away.

## Conclusion

No automated authoritative source was found that can defensibly produce "existing structure
footprint square feet, per SMC 23.44.080's specific definition" for an arbitrary Seattle parcel
today. This is a real, disclosed limitation — not resolved by lowering the bar to accept an
inadequate proxy (`KingCo_ImperviousSurfaces`, `Seattle_BuildingShells`), and not resolved by
silently narrowing `SRE-GARAGE-1`'s own acceptance criteria to proposed-garage-only coverage, per
the founder's explicit instruction not to do either.

## Founder Decision — Fallback Selected (2026-08-26)

The founder selected **user-supplied existing-structure footprint square footage** as the Unit 4
fallback (the first option this document listed). Full semantics now specified in
`business-rules.md` BR-U4-3 (revised) and `frontend-components.md`'s `GarageDetailsForm`; summarized
here for this document's own completeness:

- **Numerator semantics corrected (2026-08-26, regulatory-completeness pass round 2)**: the garage
  intake form asks the applicant for the **countable** combined footprint of existing structures on
  the parcel (garages, sheds, other accessory buildings, and the principal dwelling itself — the
  same "existing structures" SRE-GARAGE-1 already named) — i.e., already reflecting SMC
  23.44.080.C's numerator exclusions (underground structures, minor eave/cornice/roof projections,
  low decks, small unenclosed porches/steps) in plain, non-legalistic language, not simply the
  gross/raw outer footprint of every structure — and does **not** imply this is the same thing as
  assessed improvement value, gross floor area, roof area, or impervious surface (all real but
  different quantities this document investigated and rejected above).
- The resulting combined lot-coverage finding is **always** `REQUIRES_VERIFICATION`, never `KNOWN`
  — the quantity is user-supplied and unverified against any authoritative source, regardless of
  how plausible the number looks.
- The value is never defaulted to `0`. An explicit `0` is accepted only as a deliberate user
  assertion ("no existing structures on this parcel"), never inferred from a blank/skipped field.
- If the applicant cannot or does not supply the value, the combined lot-coverage percentage is not
  fabricated — the finding is `REQUIRES_VERIFICATION` for that reason, same as if a value had been
  supplied (the finding's classification does not change based on whether the input exists; what
  changes is only the explanation shown to the reader).
- The garage's own proposed footprint may still be shown as plain factual geometry (a real, known
  quantity, computed from validated dimensions and placement) — but it must never be labeled, by
  itself, as the project's SMC "lot coverage" result; that would silently misrepresent a different,
  narrower quantity as the regulatory one.

This resolves this document's own open question without requiring any new external service,
paid vendor, or manual-records integration.

**Not evaluated in this pass** (genuinely out of scope for a bounded spike, not a hidden gap): a
paid/commercial building-footprint data provider (e.g. a national parcel-data vendor); a manual
SDCI records lookup per-parcel (not automatable); requesting a current King County/Seattle
building-footprint dataset be published (outside this project's control).
