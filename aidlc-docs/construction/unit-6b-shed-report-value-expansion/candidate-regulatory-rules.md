# Unit 6B — Candidate Regulatory Rules (RESEARCHED state only)

**Status (2026-09-13, second founder correction round)**: Tiers **FOUNDER-CONFIRMED** (2026-09-11)
per the founder's own independent review of current Seattle sources (superseding the AI-suggested
tiers from the 2026-09-10 research pass — several of which over-applied Tier 2 to plain evidence
gaps; see the Governance Principle below), with a further **2026-09-13 founder-directed round**
resolving P2b (location-sensitive height model, SMC 23.44.070), P3b (current Tip 316 verified),
P7b (current Tip 316 verified + numeric domain-model correction), and C1b's two data-source gaps
(researched now, not deferred — see C1b below). **Still `RESEARCHED` state** — none of these are
drafted, triaged, source-verified end-to-end, tested, approved, or activated. The existing
lifecycle (`RESEARCHED → DRAFTED → TRIAGED → SOURCE_VERIFIED → TESTED → APPROVED → ACTIVE`) is not
bypassed by a tier confirmation.

---

## Governing principle — RULE TIER and EVIDENCE QUALITY are different dimensions

**Recorded per explicit founder instruction, correcting the original research pass's over-use of
Tier 2.** A regulatory rule's *own text* can be fully deterministic (Tier 1) even when a
*specific parcel's or customer's fact* needed to apply it is unknown. In that case:

- **rule tier** = Tier 1 (the rule itself is not ambiguous)
- **property/customer fact** = unknown
- **result** = `REQUIRES_VERIFICATION` (an evidence-quality outcome, not a tier reclassification)

Example (the founder's own): "lots with stacked dwelling units have a 60% maximum lot coverage"
is Tier 1 even though Permit Preflight does not know whether a given parcel's existing
development is stacked. **Tier 2 is reserved for**: genuinely ambiguous regulatory text,
conflicting operative provisions with no stated precedence, discretionary administrative
determinations built into the rule's own text, or a material interpretation question that
cannot be resolved mechanically. Missing per-parcel evidence is never, by itself, a Tier-2
driver — this restates and extends the project's own pre-existing rule (Unit 4's final targeted
correction) to the whole of Unit 6B.

---

## Track 1 — Permit requirement (rules P1, P2a/b, P3a/b, P4, P5, P6, P7a/b, P9; P8 removed as a tiered rule)

### P1 — Shed building-permit exemption: roof-footprint threshold
- **Citation**: **2021 Seattle Residential Code (SRC) R105.2, Item 3.1** — "The projected roof
  area does not exceed 120 square feet." **Governing provision, resolves the earlier SDCI-page
  wording discrepancy** ("120 sq ft or less" vs. "less than 120 sq ft") — R105.2 controls over
  either general SDCI web page's informal paraphrase.
- **Specification**: `projectedRoofAreaSqFt ≤ 120` (inclusive). Input: `widthFt × depthFt` (+
  `roofEaveProjectionIn` when the wall-footprint estimate is near the boundary).
- **Tier**: **T1 — FOUNDER-CONFIRMED.**
- **Evidence gap**: eave projection (optional progressive input) when the wall-footprint area is
  near 120 sq ft; otherwise none.

### P2a — Shed building-permit exemption: single-story
- **Citation**: **SRC R105.2** — the exempt accessory building must be one-story.
- **Specification**: criterion met when the shed is single-story. Part of the *exemption*
  determination only.
- **Tier**: **T1 — FOUNDER-CONFIRMED.**
- **Evidence gap**: none (shed configuration is inherently single-story by this product's own
  scope; no multi-story shed intake exists).

### P2b — Detached accessory-structure zoning height limit (SEPARATE from the R105.2 exemption; LOCATION-SENSITIVE)
- **Citation**: **Ordinance 127376 / SMC 23.44.070** — **NOT R105.2**, and not the same regulatory
  question as P2a. Founder-directed correction, 2026-09-13, superseding the earlier unresolved
  "12 ft vs. 15 ft" framing: the current ordinance sets a **general NR-zone structure height limit
  of 32 feet**, but an accessory structure **located in a required setback** is limited to **12
  feet**, with no portion of its roof permitted to extend beyond that 12-ft limit. There is no
  single universal accessory-structure height ceiling — the applicable limit depends on whether
  the specific proposed shed falls inside a required setback.
- **Specification (split, per founder instruction)**:
  - **P2b-1** — accessory structure located in a required setback → `heightFt ≤ 12`, and no
    portion of the roof may exceed that limit.
  - **P2b-2** — accessory structure outside every required setback → the current general NR-zone
    structure-height framework applies: `heightFt ≤ 32`, subject to whatever roof/height
    exceptions SMC 23.44.070 itself states (not enumerated here — narrow open item, see below).
  - Whether the proposed shed is inside a required setback is derived from the shed's
    **already-computed placement/setback facts** (the existing setback-distance computation the
    pipeline already performs for its own setback findings) — never a customer question.
  - This produces its **own** zoning finding (subject: "Accessory structure height limit"),
    rendered through the shed report's *existing* general findings mechanism
    (`Finding`/`FindingClassification`) — **not** nested inside `PermitRequirementFinding`. A
    shed can fail this check independently of whether the R105.2 exemption is otherwise
    satisfied, and can pass the exemption while still needing verification here.
- **Tier**: **T1 — FOUNDER-CONFIRMED**, both branches. The prior "T1 pending exact-provision
  confirmation" status is resolved by the founder's own direct citation of SMC 23.44.070; the
  rule text itself is a plain, location-conditioned numeric limit with no interpretive ambiguity.
- **Evidence gap**: none for `heightFt` (already collected). The setback-location fact is derived
  from existing pipeline computation, not customer-supplied, so it does not introduce a new
  evidence gap of its own.
- **Narrow open item (not blocking, replaces the former 12-vs-15 item)**: the exact current SMC
  23.44.070 subsection numbering and the precise wording of its own roof/height-exception
  interaction for setback-located accessory structures has not been independently re-verified
  against the full current statutory text in this session — external-verification item 24
  (narrowed scope, no longer an unreconciled 12-vs-15 discrepancy).

### P3a — Shed building-permit exemption: foundation type
- **Citation**: **SRC R105.2, Item 3.2** (foundation condition for the exemption) + current SDCI
  "Sheds" guidance ("simple concrete slab, pier blocks, or soil").
- **Specification**: criterion met when `foundationType ∈ {SLAB_ON_GRADE, PIER_BLOCKS, ON_SOIL}`.
- **Tier**: **T1 — FOUNDER-CONFIRMED**, grounded directly in R105.2 Item 3.2.
- **Evidence gap**: `foundationType` is a customer input; unknown → `REQUIRES_VERIFICATION` for
  this criterion (evidence gap, not a tier issue, per the governing principle above).

### P3b — Foundation type affecting STFI eligibility / review path (SEPARATE from the exemption criterion)
- **Citation**: **SDCI Tip 316 (04/26/2024 revision — confirmed by the founder, 2026-09-13, to
  still be the currently-published/served version)**. Its current text explicitly lists, among
  projects that do not qualify for STFI: all-wood foundations, and foundations using piles
  (including pipe piles and pin piles).
- **Specification**: `foundationType ∈ {PILES, WOOD_FOUNDATION}` → disqualifies STFI (→
  `FULL_REVIEW_LIKELY` contribution). This is a distinct rule from P3a because it affects
  `reviewPath`, not the `buildingPermit` exemption question. Use the exact normalized
  `FoundationType` categories that already map cleanly to this source (domain-entities.md §2) —
  no new category invented for this rule.
- **Tier**: **T1 — FOUNDER-CONFIRMED.** The prior "pending exact current-source verification"
  status is resolved.
- **Evidence gap**: `foundationType` unknown → `REQUIRES_VERIFICATION` for the review-path
  contribution — missing customer knowledge, never classified as a tier issue (governing
  principle).

### P4 — Shed building-permit exemption: detached
- **Citation**: SDCI "Sheds" — "not attached to a house or other building."
- **Specification**: criterion met when `attachment === DETACHED`.
- **Tier**: **T1 — FOUNDER-CONFIRMED.**
- **Evidence gap**: `attachment` is a customer input; unknown → `REQUIRES_VERIFICATION`.

### P5 — Shed building-permit exemption: use (explicit categories only, no interpretive automation)
- **Citation**: SDCI "Sheds" — "only used for storage, growing plants, or similar generally
  unoccupied uses."
- **Specification (rewritten per founder instruction — no automated interpretation of "similar
  generally unoccupied uses")**:
  - `intendedUse === STORAGE` → criterion **MET**
  - `intendedUse === GREENHOUSE_PLANTS` → criterion **MET**
  - anything else (including an explicitly occupiable answer, an unanswered field, or any future
    intake category not in this exact list) → **`REQUIRES_VERIFICATION`**, never an automated
    `NOT_MET`. Unit 6B does not attempt to classify "hobby workshop," "studio," "heated
    workroom," or any other description as "similar" to storage/growing-plants — that
    classification is explicitly left to SDCI/the customer's own verification.
- **Tier**: the two explicit branches (storage, growing plants) are **T1 — FOUNDER-CONFIRMED**.
  A *future* rule that attempts to automate the "similar generally unoccupied uses" catch-all
  would itself be **Tier 2** (a genuine interpretive question) — not built in Unit 6B.
- **Evidence gap**: none for the two explicit branches; every other case is a `REQUIRES_VERIFICATION`
  outcome by design, not an evidence gap to be closed later.

### P6 — Shed building-permit exemption: not in or near a mapped ECA (rewording per founder instruction)
- **Citation**: SDCI "Sheds" — "not in or near an environmentally critical area (ECA)"; SDCI Tip
  316 (ECA sites need a PASV / may be routed to full review); SMC 25.09.
- **Specification (reworded)**: the regulatory question is **whether the proposed shed/site is
  in or near an ECA** — not whether we can affirmatively prove none exists. The criterion draws
  on, without collapsing: (a) mapped **parcel** intersection, (b) mapped **proposed-footprint**
  intersection (once a footprint exists), (c) mapped **buffer/nearby** conditions where
  authoritative buffer geometry exists, and (d) each layer's own **advisory vs. map-dispositive**
  status. Criterion **MET** means "no basis, from available mapped and buffer data, to conclude
  the shed is in or near an ECA" — explicitly **not** "confirmed no ECA exists"; a
  `NO_INTERSECTION` map result is never promoted to a stronger factual claim than the map itself
  supports (BR-U6B-2, unchanged). Any real intersection → `NOT_MET`. Any `INDETERMINATE` map fact
  (tolerance-band proximity, per the existing BR-5a policy) → `REQUIRES_VERIFICATION`.
- **Tier**: **T2 — FOUNDER-CONFIRMED.** *Tier driver (unchanged)*: "in or near" carries no
  code-defined distance, and SDCI retains discretion to route any ECA-adjacent project to full
  review regardless of size — a genuine, unresolved discretionary/textual question, not a
  missing-evidence issue.

### P7a — STFI-vs-full-review: 750 sq ft size threshold (one criterion among several, not sufficient alone)
- **Citation**: SDCI Tip 316 — detached accessory structures "up to 750 square feet" are
  STFI-eligible on size.
- **Specification**: `footprintSqFt ≤ 750` is **one necessary condition** contributing to an
  overall STFI determination — explicitly **not sufficient by itself**; P7b's span condition
  must also resolve `MET` before `reviewPath` can reach `STFI_LIKELY`.
- **Tier**: **T1 — FOUNDER-CONFIRMED.**
- **Evidence gap**: none (footprint is always computable from `widthFt`/`depthFt`).

### P7b — STFI-vs-full-review: structural span
- **Citation**: **SDCI Tip 316 (04/26/2024 revision — confirmed current by the founder,
  2026-09-13)** — detached accessory structures up to 750 sq ft, structural span criterion around
  14 ft, manufactured-truss allowance up to a separately-stated 30-ft threshold; the SDCI Sheds
  page's full-review framing states the more extensive review path applies where beams span more
  than 14 ft.
- **Domain-model correction (founder-directed)**: the earlier categorical
  `OVER_14FT_MANUFACTURED_TRUSS` value could not distinguish a 20-ft manufactured truss from a
  35-ft one, even though the 30-ft threshold matters. Corrected to collect a plain numeric
  `structuralSpanFt` plus a `usesManufacturedTruss?` boolean (domain-entities.md §2) — never
  inferred from shed width/depth.
- **Specification**: `structuralSpanFt < 14` → **MET**; `14 < structuralSpanFt ≤ 30` AND
  `usesManufacturedTruss === true` → **MET**; `structuralSpanFt > 14` without a qualifying truss,
  or `structuralSpanFt > 30` even with a truss → **NOT_MET** (→ contributes to
  `FULL_REVIEW_LIKELY`); `structuralSpanFt` unanswered → **`REQUIRES_VERIFICATION`** (an evidence
  gap on an otherwise-deterministic rule, per the governing principle — **not** a Tier-2
  reclassification).
- **Boundary-operator caveat**: Tip 316's eligibility bullet reads "less than 14 feet," while the
  SDCI shed guidance/full-review framing reads "more than 14 feet" — these do not textually
  reconcile at exactly 14.0 ft. `structuralSpanFt === 14.0` resolves **`REQUIRES_VERIFICATION`**
  rather than fabricating a boundary operator. A narrow, disclosed source-reconciliation gap
  (external-verification item 25), not a reason to treat the whole rule as Tier 2.
- **Tier**: **T1 — FOUNDER-CONFIRMED.** The prior "conditional on exact current-source
  verification" status is resolved; only the narrow 14.0-ft/30-ft boundary-operator question
  remains open (item 25), which is a source-reconciliation detail, not a rule-tier driver.

### P8 — Trade permits: ADVISORY ONLY, removed from the tiered deterministic rule set
- **Removed as a candidate regulatory rule** per founder instruction — "electrical/plumbing/
  mechanical work needs its own separate permit" is too absolute without researching each
  trade code's own specific exemptions.
- **Treatment in Unit 6B**: a fixed customer-facing advisory disclosure, not a researched rule
  and not tiered:
  > "Electrical, plumbing, or mechanical work may require separate permits. Permit Preflight's
  > shed building-permit result does not determine those trade permits."
- Shown only for the trades the customer indicated interest in (`utilityIntent`), independent of
  `buildingPermit`/`reviewPath` (BR-U6B-8, updated wording). If deterministic trade-permit
  conclusions are wanted later, that is separate, out-of-scope research.

### P9 — Permit exemption ≠ zoning compliance (framing rule)
- **Citation**: SDCI "Do You Need a Permit?" — "Even if you don't need a permit, your project
  must meet all code requirements and development standards."
- **Specification**: unchanged from the original pass — a `LIKELY_EXEMPT` finding always carries
  this disclaimer.
- **Tier**: **T1 — FOUNDER-CONFIRMED.**

---

## Track 2 — Lot coverage (SMC 23.44.080, restructured into discrete rules per founder's independent review)

### C1a — Base maximum lot coverage
- **Citation**: **SMC 23.44.080.A** / Ordinance 127376 — "Except where another subsection
  applies, maximum lot coverage is 50%."
- **Specification**: `applicableMaximum = 50%` unless C1c or C1d establishes a higher figure
  applies.
- **Tier**: **T1 — FOUNDER-CONFIRMED.**

### C1b — ECA lot-area exclusions (explicit list — resolves the earlier denominator-mechanism ambiguity)
- **Citation**: **SMC 23.44.080.B** — explicitly identifies areas **not counted in lot size**
  for the coverage calculation: **riparian corridors; wetlands and their buffers; submerged
  lands and shoreline-setback areas; designated non-disturbance area in steep slopes.**
- **Specification**: subtract from the lot-area denominator **only** the geometry of these four
  named categories that intersects the parcel — **never** any other mapped ECA category (steep
  slope outside its designated non-disturbance sub-area, liquefaction, peat settlement,
  landslide-prone, flood-prone, priority habitat, abandoned landfill are all explicitly **not**
  part of this exclusion, even though several of them still matter for P6). Where the geometry
  needed to compute the excluded area is unavailable or insufficient →
  `REQUIRES_VERIFICATION` (an **evidence** limitation, not a tier issue).
- **Tier**: **T1 — FOUNDER-CONFIRMED** (changed from the original pass's T2 — the mechanism
  ambiguity is resolved by 23.44.080.B's explicit list).
- **Researched during Functional Design, 2026-09-13 (founder instruction — not deferred to Code
  Generation)**:
  - **Submerged lands / shoreline-setback**: the founder's proposed candidate dataset,
    `Shoreline_Environments` (`services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/
    Shoreline_Environments/FeatureServer/23`), is **confirmed real and live** — same ArcGIS
    org/CRS as the other 12 ECA layers and Building Outlines (WKID 2926 confirmed), polygon
    geometry, backed by the city's general zoning-overlay table (`DPD.ZONING_OVERLAY_ALL`)
    filtered to `TYPE = 'SHORELINE'`. Its fields are `OVERLAY`, `DESCRIPTION`,
    `PUBLIC_DESCRIPTION`, `TYPE`, `CHAPTER`, `CHAPTER_LINK` — `DESCRIPTION` carries the shoreline
    **environment designation** (Urban Harborfront, Urban Maritime, Conservancy Navigation,
    Conservancy Management, Conservancy Preservation, Conservancy Waterway, Conservancy
    Recreation). **This is a zoning-overlay/environment-designation layer, not a dedicated
    submerged-lands exclusion geometry** — there is no field distinguishing submerged land as
    such. A "Conservancy Navigation" designation is a plausible but **unconfirmed** proxy (would
    require treating the environment designation as equivalent to the code's "submerged lands"
    term — an unverified equivalence, not assumed here). Separately, the actual shoreline-setback
    *distance* (SMC 23.60.198.B.1) is itself **contextual and partly discretionary** — dependent
    on neighboring residences' locations, with the Director able to reduce a setback exceeding 75
    ft down to no less than 75 ft — not a single fixed buffer distance that can be mechanically
    offset from any waterline geometry (the companion `Seattle Shoreline` layer, an 8-ft-contour
    approximation of mean high water, gives a reference line but not a setback polygon). **No
    guessed polygon subtraction is built from this** — this sub-category of C1b is expected to
    resolve `REQUIRES_VERIFICATION` in essentially every real evaluation, similar in character to
    C1e's Director-alternative branch (item 27), rather than as a solvable near-term data gap.
  - **Wetland buffer**: the existing `Environmentally_Critical_Areas_Wetlands` layer (`ECA -
    Wetland`, layer 10, WKID 2926 confirmed) carries a numeric `CATEGORY` field but **no habitat-
    function field**. SMC 25.09.160 Table A sets wetland buffer width as a function of **both**
    category **and** habitat function (e.g., a Category III wetland with low habitat function
    requires a 60-ft buffer per 25.09.160.B) — with habitat function absent from the dataset, the
    applicable buffer width **cannot be deterministically computed** from this layer alone.
    `ST_Buffer(wetlandPolygon, <one fixed distance>)` is explicitly **not** used as a stand-in for
    the regulatory buffer. This does not prevent ECA screening itself (P6) from reporting the
    mapped wetland fact — only the *lot-coverage denominator adjustment* for the wetland-buffer
    portion of C1b is affected.
  - **Conclusion**: C1b's rule text remains **T1** (the exclusion mechanism and category list are
    explicit in code) — these are documented **data/legal-derivation limitations**, not a rule-
    tier issue. For a parcel where either sub-category intersects, `EcaLotAreaAdjustment`
    resolves `REQUIRES_VERIFICATION` rather than computing a precise excluded area, per its own
    type definition (domain-entities.md §3b). external-verification item 26 updated with this
    finding (no longer "not yet researched").

### C1c — 60% common-amenity development allowance
- **Citation**: **SMC 23.44.080.F**.
- **Specification**: `applicableMaximum = 60%` when the development satisfies **all** of:
  frequent-transit-service-area location; dwelling-only development; less-than-three-story
  structures; the required arrangement/common-amenity characteristics. Any condition unknown →
  `REQUIRES_VERIFICATION` for this rule's applicability (evidence, not tier — Permit Preflight
  does not currently retrieve most of these facts for a shed's host parcel).
- **Tier**: **T1 — FOUNDER-CONFIRMED** (the conditions are explicit in the code text).
- **Scope decision, 2026-09-13 (founder-directed)**: Unit 6B's initial slice does **not** build
  automatic per-parcel applicability detection for this rule — no new GIS adapter, assessor
  integration, or customer question is added merely to resolve whether it applies. This defers
  **detection**, not the rule — C1c remains a fully deterministic T1 rule. Its 60% figure
  participates in the bounded CASE A/B/C lot-coverage reasoning (`domain-entities.md` §3c,
  `business-logic-model.md` Flow 4) as a known ceiling, never as a per-parcel confirmed fact.

### C1d — 60% stacked-dwelling-units allowance
- **Citation**: **SMC 23.44.080.G** — maximum lot coverage on lots with stacked dwelling units is
  60%.
- **Specification**: `applicableMaximum = 60%` when the parcel's existing/proposed development
  includes stacked dwelling units. Unknown stacked-unit status → `REQUIRES_VERIFICATION`
  (evidence, not tier — matches the founder's own worked example of the governing principle).
- **Tier**: **T1 — FOUNDER-CONFIRMED.**
- **Scope decision, 2026-09-13 (founder-directed)**: same as C1c — no automatic stacked-dwelling-
  status detection built in this slice; the rule stays T1 and its 60% figure participates in the
  same bounded CASE A/B/C reasoning as C1c's.

**Deferred enhancement (recorded, not scheduled)**: "Automatic 60%-allowance applicability
detection" for C1c/C1d — potential facts: frequent-transit location, development use, story
count, common-amenity configuration, stacked-dwelling-unit status. Not a new unit; revisit only
if real reports land materially often in the ambiguous Case-B band, or professional-user feedback
indicates the ambiguity is reducing report value.

### C1e — Minimum coverage floor + Director-approved alternative
- **Citation**: **SMC 23.44.080.D** — on lots containing C1b's subsection-B areas, lot coverage
  "shall not be less than 625 square feet or an amount approved by the Director [through an ECA
  reduction/waiver/modification], whichever is greater."
- **Specification (split per founder instruction)**:
  - the **625 sq ft deterministic floor** → **T1 — FOUNDER-CONFIRMED**; applies only when C1b
    areas are present on the lot.
  - the **Director-approved alternative amount** → **T2 — FOUNDER-CONFIRMED** (a genuine
    discretionary administrative determination, made case-by-case by SDCI — not merely an
    evidence gap). Result is `REQUIRES_VERIFICATION` unless actual Director-approval data is
    available for the specific parcel — which Permit Preflight has no channel to obtain and
    **never guesses**.

### C2 — What counts toward lot coverage (rewritten against CURRENT code, not the old CAM 220)
- **Citation**: **SMC 23.44.080.C** — explicit exclusions: **underground structures; the first
  36 inches of qualifying architectural projections; decks/portions 36 inches or less above
  existing grade; qualifying unenclosed porches/steps; qualifying unenclosed structures under
  SMC 23.44.090.H; the applicable Type A dwelling-unit exception.**
- **Specification**: only the current, explicit exclusions Unit 6B actually needs to represent
  (given the shed report's scope) are encoded; the aerial Building Outlines dataset's inability
  to identify most of these features per-parcel is an **evidence/data limitation** — it produces
  an `ESTIMATED` label on the derived coverage figure and, where material, a
  `REQUIRES_VERIFICATION` disclosure — it does **not** make the rule itself Tier 2.
- **Tier**: **T1 — FOUNDER-CONFIRMED** (changed from the original pass's T2 — old CAM 220 is no
  longer the controlling source; the current code's exclusions are explicit).

### C3 — Historical rear-yard 40% coverage rule — SUPERSEDED / NOT CURRENT, not implemented
- **Historical citation**: older SDCI CAM 220 (pre-2026) — accessory structures + permitted
  portions of the principal structure ≤ 40% of the *required rear yard*.
- **Current status**: the 2026 rewrite of SMC 23.44.090 (setback/accessory-structure rules) does
  **not** appear, in the material reviewed for Unit 6B, to carry forward a general rear-yard-
  coverage percentage cap of this kind. **Marked SUPERSEDED / NOT CURRENT** per founder
  instruction — not implemented in Unit 6B. If a current, presently-effective authoritative
  provision preserving an equivalent restriction is later found, that specific provision must be
  presented for founder review before any rule reinstating this restriction is drafted — it is
  not reinstated by inertia or by resemblance to the old rule.
- **Tier**: not applicable (not an active candidate).

---

## Track 3 — ECA (no new rules; unchanged from the 2026-09-10 pass)

No new regulatory rules — Track 3 adds the `environmental-constraints` Property Intelligence
fact only. The existing ACTIVE `deriveEcaRegulatoryImplication` (BR-4a) / `resolveCriticalAreaFinding`
(BR-5) policy is unchanged and is what P6 (above) and C1b (above) both read through, per their
own specifications — never a second, parallel ECA interpretation.

## Track 4 — Feasible placement area — DEFERRED, no candidate rules in Unit 6B

Unchanged: F1 (accessory-structure setback profile) is not part of Unit 6B. Not researched
further, not tiered, not implemented.

---

## Summary table (founder-confirmed status)

| Rule | Tier | Note |
|---|---|---|
| P1 | **T1** | ≤120 sq ft, SRC R105.2 Item 3.1 — operator resolved |
| P2a | **T1** | one-story, SRC R105.2 — exemption criterion |
| P2b | **T1 — FOUNDER-CONFIRMED** | zoning height, separate finding — location-sensitive (12 ft in required setback / 32 ft outside, SMC 23.44.070); narrow subsection/roof-exception item remains (item 24) |
| P3a | **T1** | foundation for exemption, SRC R105.2 Item 3.2 |
| P3b | **T1 — FOUNDER-CONFIRMED** | foundation affecting review path — current Tip 316 (04/26/2024) verified |
| P4 | **T1** | detached |
| P5 (storage / growing-plants) | **T1** | explicit categories only |
| P5 (everything else) | n/a | always `REQUIRES_VERIFICATION`, never automated |
| P6 | **T2** | "in or near" undefined distance + SDCI discretion — reworded per founder instruction |
| P7a | **T1** | 750 sq ft — one of two conditions for STFI |
| P7b | **T1 — FOUNDER-CONFIRMED** | span — numeric model (structuralSpanFt + truss flag); exactly-14.0/30-ft boundary-operator item remains (item 25) |
| P8 | **not tiered — advisory only** | removed from the deterministic rule set |
| P9 | **T1** | exemption ≠ zoning compliance |
| C1a | **T1** | 50% base, SMC 23.44.080.A |
| C1b | **T1** | explicit ECA exclusions, SMC 23.44.080.B — submerged-lands/shoreline-setback and wetland-buffer sub-categories researched and confirmed data-insufficient for now (item 26); expected to resolve `REQUIRES_VERIFICATION` in practice |
| C1c | **T1** | 60% common-amenity, SMC 23.44.080.F |
| C1d | **T1** | 60% stacked dwelling units, SMC 23.44.080.G |
| C1e (625 sq ft floor) | **T1** | SMC 23.44.080.D |
| C1e (Director alternative) | **T2** | genuine discretionary determination |
| C2 | **T1** | current 23.44.080.C exclusions — aerial-data limitation ≠ tier driver |
| C3 | **SUPERSEDED — not implemented** | pre-2026 rear-yard rule, no current equivalent found |
