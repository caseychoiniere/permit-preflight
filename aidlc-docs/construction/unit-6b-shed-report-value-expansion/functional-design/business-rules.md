# Unit 6B — Functional Design: Business Rules

**Status**: Functional Design Part 1 — **APPROVED 2026-09-13** (with the C1c/C1d bounded-
reasoning scope decision applied). Do not reopen approved decisions. No Code Generation, no rule
activation.

Numbered `BR-U6B-*`, matching the project's per-unit convention (`BR-U4-*`, `BR-U5-*`,
`BR-U6-*`). Each rule cites the domain-entities.md type(s) it governs.

---

## BR-U6B-1 — ECA screening produces a DATA FACT array, never a single boolean

Property Intelligence's `environmental-constraints` fact is always an array with one entry per
evaluated hazard type (§1a) — never collapsed into a single "has ECA / no ECA" boolean, and
never omits an entry merely because that hazard's `mappedIntersectionResult` is
`NO_INTERSECTION`. Distinguishes, per entry: **advisory vs. map-dispositive** status,
**parcel-scope vs. footprint-scope** intersection (footprint-scope populated only once a
placement/footprint exists — a shed report's ECA screening therefore has TWO passes: a
parcel-scope pass at Property Intelligence assembly time, and an optional footprint-scope
refinement at evaluation time, matching the pipeline's actual data-availability order), and
**buffer/nearby** conditions (a hazard's own tolerance-band proximity, already governed by
`toleranceFor`/BR-5a, unmodified).

## BR-U6B-2 — ECA regulatory conclusions are never stronger than their source supports

Every `CriticalAreaFinding` continues to flow through the **existing, unmodified**
`deriveEcaRegulatoryImplication` (BR-4a). This rule restates the founder's explicit wording
constraint as a review gate on Report Generation copy (`business-logic-model.md` §5,
`frontend-components.md`):

- **Allowed**: "No mapped landslide-prone area detected." / "Mapped liquefaction-prone area
  intersects the parcel." / "Mapped wetland buffer intersects the proposed project area."
- **Not allowed**: "No landslide hazard exists." / "This property has no ECA." / "PASS — no
  critical-area restrictions apply." — unless a specific authoritative source/rule genuinely
  supports that stronger claim (none identified in this research pass for any of the 12 layers;
  see `research-findings.md` §3.3–3.4).

A `NO_INTERSECTION` result is reported as a **mapped-data fact about that specific layer**
("no mapped [hazard] detected on this parcel"), never generalized into "no [hazard] risk" —
absence from a map is not proof of absence on the ground (`requirements.md`'s own
never-treat-missing-as-clean posture).

## BR-U6B-3 — the permit/ECA relationship is a regulatory rule, never a direct GIS→permit shortcut

`PermitCriterionResult` for `criterionId: "ECA"` (domain-entities.md §3a) is produced **only** by
a Regulatory Rules Engine rule (candidate P6) reading the ALREADY-DERIVED
`FindingClassification` from BR-U6B-2's output — it never reads `CriticalAreaFinding` or the raw
`environmental-constraints` fact directly. This is the same layering BR-4a already enforces
between the map-fact and regulatory layers, restated for the permit consumer specifically so a
future refactor cannot accidentally let Property Intelligence's adapter decide permit
eligibility. Candidate P6 is worded around **whether the shed/site is in or near an ECA** — a
`MET` result means "no basis, from available mapped/buffer data, to conclude the shed is in or
near an ECA," never "confirmed no ECA exists" (founder correction to the rule's own wording, not
just its report-copy rendering — restated from BR-U6B-2 at the rule-specification level itself).

## BR-U6B-4 — the report never renders one card per non-intersecting ECA layer

The report's "Mapped environmental/site constraints" section (`frontend-components.md` §2) is
built from the `environmental-constraints` fact via one rendering rule: every entry whose
`mappedIntersectionResult !== NO_INTERSECTION` gets its own prominent item (⚠ or the map-
dispositive-KNOWN styling); every `NO_INTERSECTION` entry is folded into one concise summary
line grouped by category (e.g. "No mapped landslide, liquefaction, peat settlement, flood, or
priority-habitat conditions detected"). This is a **presentation rule**, not a data-suppression
rule — every hazard's raw finding is still present in the persisted evidence array, unabridged;
only the rendering groups the clean results.

## BR-U6B-5 — permit's three core questions are always asked; everything else is progressive

`foundationType`, `attachment`, `intendedUse` (domain-entities.md §2) are always presented on
the shed intake — they are the three criteria with no other resolution path (no Property
Intelligence source can answer them). ECA status (`criterionId: "ECA"`) is **never** asked of
the customer — it resolves automatically from BR-U6B-3's chain; a customer-facing ECA question
would only ever be appropriate if the automatic determination becomes structurally unavailable
(e.g. the adapter itself is down for the whole request), and even then the correct behavior is
`REQUIRES_VERIFICATION` with a "confirm with SDCI" disclosure, never a customer self-report
standing in for mapped data.

## BR-U6B-6 — roof area is never assumed equal to wall footprint, and the overhang question is triggered by a deterministic threshold, never an arbitrary margin band

`widthFt × depthFt` is the shed's **wall footprint**, not necessarily its **projected roof
area** (the actual SDCI-exemption measure, candidate P1). Per founder correction (2026-09-13):
there is no principled reason to invent a proximity band around the 120 sq ft threshold — the
governing rule is the projected roof area itself, so the trigger is the threshold, exactly:

- `wallFootprintSqFt > 120` → the `roofOverhang` question is **never shown** — the roof-area
  exemption criterion is already unsatisfiable (roof area can only be ≥ wall footprint).
- `wallFootprintSqFt ≤ 120` → ask whether the roof extends beyond the walls. "No" → the wall
  footprint stands in for projected roof area (still ≤120, criterion `MET`). "Yes" → collect an
  approximate overhang; if the customer cannot provide it, criterion `ROOF_AREA` resolves
  `REQUIRES_VERIFICATION` — never a guessed pass.

## BR-U6B-7 — beam span is never inferred from shed dimensions, is collected as a number (not a category), and is asked only when it could still change the outcome

`structuralSpanInfo` (domain-entities.md §2, `structuralSpanFt` + `usesManufacturedTruss?`) is
never derived from `widthFt`/`depthFt` alone — a shed's actual framing span depends on
construction method, not just overall size. Founder correction (2026-09-13): the earlier
categorical enum (`UNDER_14FT`/`OVER_14FT_NON_TRUSS`/`OVER_14FT_MANUFACTURED_TRUSS`) could not
distinguish a 20-ft manufactured truss from a 35-ft one even though the separately-stated 30-ft
manufactured-truss threshold matters — replaced with a plain numeric `structuralSpanFt` plus a
`usesManufacturedTruss` boolean, letting evaluation apply both thresholds directly rather than
growing an ever-more-detailed enum.

Progressive, per this exact conceptual order (business-logic-model.md §2's closing steps): (1)
determine whether a permit is required at all — never asked if trending `LIKELY_EXEMPT`; (2) if
required, evaluate known STFI disqualifiers first (ECA `NOT_MET` alone routes to
`FULL_REVIEW_LIKELY` regardless of span); (3) evaluate the ≤750 sqft criterion (P7a) — already
failing routes to `FULL_REVIEW_LIKELY` regardless of span; (4) ask span only if the project has
not already been routed to full review by another known condition, size remains STFI-eligible,
AND span information can actually still change `STFI_LIKELY` vs. `FULL_REVIEW_LIKELY`/
`REQUIRES_VERIFICATION` — the one remaining open variable, never an always-visible construction
questionnaire.

**Boundary-operator caveat**: Tip 316's STFI-eligibility wording ("less than 14 feet") and the
SDCI shed guidance's full-review framing ("more than 14 feet") do not textually reconcile at
exactly 14.0 ft. `structuralSpanFt === 14.0` resolves `REQUIRES_VERIFICATION` for this criterion
rather than silently picking an operator — a narrow, disclosed boundary-source gap
(external-verification-tracker item 25), not a reason to reclassify P7b's tier.

## BR-U6B-8 — trade-permit mentions are a fixed advisory, never a researched/tiered rule, and never participate in the building-permit state

Candidate P8 was **withdrawn as a tiered regulatory rule** (founder correction — "always
required" is too absolute without researching each trade code's own exemptions). Unit 6B instead
renders a fixed, non-tiered advisory whenever `utilityIntent` indicates interest in a trade:
"Electrical, plumbing, or mechanical work may require separate permits. Permit Preflight's shed
building-permit result does not determine those trade permits." `TradePermitDisclosure` entries
are computed and rendered entirely independently of `buildingPermit`/`reviewPath` — a
`PermitRequirementFinding` with `buildingPermit: LIKELY_EXEMPT` and one or more trade
disclosures is a real, expected, valid combination.

## BR-U6B-9 — an exemption finding always carries the "not a zoning approval" disclaimer, and P2b is never implied by it

Any `PermitRequirementFinding` with `buildingPermit === LIKELY_EXEMPT` is rendered with the
fixed disclaimer that the building-permit exemption does not waive setback, lot-coverage,
height, or rear-yard-coverage compliance, and that SDCI makes the final determination
(candidate P9) — a report-layer constant, not a per-evaluation computation. This explicitly
includes the accessory-structure zoning-height limit (candidate P2b) — a `LIKELY_EXEMPT` finding
**never implies** the shed also satisfies P2b's height limit; P2b is a separate finding
(domain-entities.md §3a note) that can independently pass or fail regardless of the exemption
outcome.

## BR-U6B-10 — USE (P5) never resolves an automated NOT_MET

Per founder instruction, the `USE` criterion only ever resolves `MET` (for the two explicit
primary-source categories, `STORAGE`/`GREENHOUSE_PLANTS`) or `REQUIRES_VERIFICATION` (every other
answer, including an explicitly occupiable one) — **never an automated `NOT_MET`**. Unit 6B does
not build an interpretive rule for "similar generally unoccupied uses"; that remains a genuine
Tier-2 candidate for a future pass, not automated here even conservatively.

## BR-U6B-11 — lot coverage numbers are always labeled by their epistemic status, never presented as compliance

`ShedLotCoverageResult` (domain-entities.md §3c) never renders as "compliant" / "non-compliant"
— only as `WITHIN_STANDARD_ALLOWANCE` / `REQUIRES_VERIFICATION` (with its specific
`MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE` / `POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE` /
`LOT_AREA_ADJUSTMENT_UNRESOLVED` reason) / `EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE`, each with its
own honest copy — and, per BR-U6B-13, only Case B/C's copy ever mentions the 60% allowance at all
(Case A never burdens the customer with a possibility that has no bearing on their result).
`existingMappedCoverageSqFt` is always rendered with its `overCountCaveat` (domain-entities.md
§1b) adjacent — never as a bare number.

## BR-U6B-12 — the ECA→lot-area adjustment subtracts ONLY the four SMC 23.44.080.B-named categories, never any other mapped ECA

`EcaLotAreaAdjustment` (domain-entities.md §3b) is `NOT_APPLICABLE` whenever none of the four
named categories (`RIPARIAN_CORRIDOR`, `WETLAND_AND_BUFFER`, `SUBMERGED_LAND_OR_SHORELINE_SETBACK`,
`STEEP_SLOPE_NON_DISTURBANCE_AREA`) intersects the parcel. Candidate C1b is **T1** — the
mechanism is now explicit — but a real intersection with insufficient geometry to compute the
excluded area precisely still resolves `REQUIRES_VERIFICATION` (an evidence limitation per
BR-U6B-15, not a tier issue). **Researched during Functional Design, not deferred (founder
instruction, 2026-09-13)**: for `SUBMERGED_LAND_OR_SHORELINE_SETBACK` specifically, the real
`Shoreline_Environments` FeatureServer (same ArcGIS org/CRS, confirmed live) carries an
environment-designation attribute (e.g. Conservancy Navigation) but no dedicated submerged-lands
field, and the actual shoreline-setback distance (SMC 23.60.198.B.1) is itself contextual/
discretionary (dependent on adjacent-residence placement, Director-adjustable) — not a fixed
buffer distance derivable from any single geometry. For `WETLAND_AND_BUFFER`, the existing ECA
Wetlands layer carries a numeric `CATEGORY` field but no habitat-function attribute, and SMC
25.09.160 Table A's buffer width depends on **both** category and habitat function — so buffer
width cannot be computed from this dataset alone. Both sub-categories are therefore expected to
resolve `REQUIRES_VERIFICATION` in practice whenever they apply — a genuine, now-documented data/
legal-derivation limitation (external-verification-tracker item 26), not a guessed polygon
subtraction and not grounds to reclassify C1b's tier. `ESTABLISHED` also carries C1e's minimum-coverage-floor result
(625 sq ft, `KNOWN`, unless a Director-approved alternative might apply, which is always
`REQUIRES_VERIFICATION` in practice — Permit Preflight has no channel to real Director-approval
records, C1e's T2 branch). This rule remains the concrete implementation of "only exclude the
specific areas the current code says are excluded... this is a regulatory rule, not generic GIS
behavior" — now grounded in SMC 23.44.080.B's own explicit list rather than a placeholder for
"every ECA."

## BR-U6B-13 — the coverage result is bounded CASE A/B/C reasoning between C1a's base allowance and C1c/C1d's potential special allowance; automatic applicability detection is deferred, not the rules

**Founder decision, 2026-09-13**: Unit 6B's initial slice does not build automatic per-parcel
applicability detection for C1c (frequent-transit/dwelling-only/<3-story/common-amenity) or C1d
(stacked-dwelling-units) — no new GIS adapter, assessor integration, or customer question is
added merely to resolve whether the 50% or 60% figure governs a given parcel. **This defers
detection, not the rules** — C1a/C1c/C1d remain deterministic Tier 1 (`candidate-regulatory-
rules.md`). Instead, `ShedLotCoverageResult` (domain-entities.md §3c) classifies the estimate
into exactly one of three cases against `baseAllowanceSqFt` (C1a, 50%, floored by C1e's 625 sq ft
where applicable) and `potentialSpecialAllowanceSqFt` (the C1c/C1d ceiling, 60%, similarly
floored):

- **Case A** (estimate ≤ base allowance) → `WITHIN_STANDARD_ALLOWANCE`. The 60% possibility is
  irrelevant to this outcome — **never** `REQUIRES_VERIFICATION` merely because C1c/C1d
  applicability is unknown when that unknown has no bearing on the result.
- **Case B** (base allowance < estimate ≤ potential special allowance) → `REQUIRES_VERIFICATION`
  (`MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE`) — the project may fit within a 60% allowance if it
  qualifies under C1c/C1d; never claimed as a failure.
- **Case C** (estimate > potential special allowance) → `EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE`
  (deterministic, subject to the `ESTIMATED` nature of mapped structure coverage) **unless**
  C1e's Director-approved-alternative branch is relevant to this parcel (a C1b area is present
  and its floor's Director-alternative is unresolved), in which case → `REQUIRES_VERIFICATION`
  (`POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE`) — never an unconditional failure, never a guessed
  Director approval.

If the C1b lot-area denominator adjustment itself is unresolved (`EcaLotAreaAdjustment.status ===
"REQUIRES_VERIFICATION"`), the existing asymmetric fail-closed rule governs: uncertainty about a
coverage-*reducing* adjustment can only ever push the result toward `REQUIRES_VERIFICATION`/a
worse case, never manufacture a false Case A or B off an optimistic (too-large) denominator
(`reason: "LOT_AREA_ADJUSTMENT_UNRESOLVED"`) — see business-logic-model.md Flow 4.

No numeric maximum is hardcoded speculatively — 50%, 60%, and 625 sq ft are the founder-confirmed,
cited current-code values (C1a/c/d/e). **Deferred enhancement, recorded not scheduled**:
"Automatic 60%-allowance applicability detection" — revisit only if real reports land materially
often in Case B, or professional-user feedback indicates the ambiguity reduces report value; not
a new unit.

## BR-U6B-14 — the governing principle: rule tier and evidence quality are different dimensions

Recorded explicitly per founder instruction, correcting the original research pass's over-use of
Tier 2 for plain evidence gaps (P7b, C1b, C2 were originally mis-tiered this way). A rule's own
text can be fully deterministic (Tier 1) even when a specific parcel's or customer's fact needed
to apply it is unknown — in that case the **rule tier** stays Tier 1, the **property/customer
fact** is recorded as unknown, and the **result** is `REQUIRES_VERIFICATION` (an evidence-quality
outcome, not a tier reclassification). Tier 2 is reserved for genuinely ambiguous regulatory
text, conflicting operative provisions, discretionary administrative determinations built into
the rule's own text (e.g. C1e's Director-approved-alternative branch), or a material
interpretation question that cannot be resolved mechanically (e.g. P6's undefined "near," or a
future attempt to automate P5's "similar ... uses" catch-all). This principle governs every
`REQUIRES_VERIFICATION` outcome produced anywhere in Unit 6B's rules — it is never itself evidence
that the underlying rule needs reclassification.

## BR-U6B-15 — no existing ACTIVE rule, Unit 1 architecture, or payment/report-immutability behavior is touched

Restated as an explicit rule (not just a constraint) because Unit 6B extends multiple existing
modules (Property Intelligence, Regulatory Rules Engine, Report Generation): every change is
additive (new fact types, new optional intake fields, new result types, new rules entering as
`RESEARCHED`) — no existing `RegulatoryRule` row, `Finding`/`ComplianceOutcome` semantics,
`EvidenceReportArtifact` immutability guarantee, or payment/checkout logic is modified by
anything in this Functional Design.
