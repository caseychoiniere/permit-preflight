# Unit 6B — Functional Design: Frontend Components (Customer Intake UX + Report Sections)

**Status**: Functional Design Part 1 — **APPROVED 2026-09-13** (with the C1c/C1d bounded-
reasoning scope decision applied). No copy here is final production copy; exact wording is
confirmed during Code Generation. No Code Generation, no rule activation.

---

## 1. Shed intake — progressive disclosure

Extends the existing shed "Details" step (`app/configure/page.tsx`'s DETAILS step, current
fields: width/depth/height/alleyAdjacent). New fields, in presentation order:

### Always asked (core three, per BR-U6B-5)

1. **Foundation** — "What will the shed sit on?" → Slab / Pier blocks / On soil / A footing that
   goes below frost line / Piles or pin piles / A wood foundation / Not sure yet
2. **Attached or detached** — "Will the shed be attached to your house or another building?" →
   Detached / Attached / Not sure yet
3. **Intended use** — "What will you mainly use it for?" → Storage / Greenhouse or growing plants
   / Something else / Not sure yet — kept deliberately close to the two explicit primary-source
   categories the rule can actually evaluate (candidate P5); an "Something else" answer is
   collected for the customer's own clarity but resolves the rule to `REQUIRES_VERIFICATION`,
   never an automated pass or fail (BR-U6B-10) — Unit 6B does not attempt to classify what a
   free-form "something else" answer means.

Each renders as a single-select control; "Not sure yet" is a real, first-class option mapping to
`undefined` (never a forced guess) — matching the existing shed-intake convention.

### Progressive — roof overhang (per BR-U6B-6)

Shown **only** when the client-side wall-footprint estimate (`widthFt × depthFt`) is **≤ 120 sq
ft** — a deterministic threshold, never an arbitrary margin band (founder correction, 2026-09-13:
"there is no principled reason to invent a 10-, 20-, or 30-sq-ft proximity band"). When
`wallFootprintSqFt > 120`, the roof-area exemption criterion is already unsatisfiable regardless
of overhang, and this question is never shown at all. When shown (`wallFootprintSqFt ≤ 120`):

> "Does the roof extend beyond the shed's walls (eaves/overhangs)?"
> — No / Yes / Not sure

"No" → the wall footprint stands in for projected roof area (still ≤120, criterion `MET`). If
"Yes": a secondary, clearly-optional field — "Roughly how far, in inches? (Doesn't need to be
exact)" — skippable, mapping to `roofOverhang.approxOverhangIn: undefined` if left blank
(criterion resolves `REQUIRES_VERIFICATION`, not a guessed pass).

### Progressive — structural span (per BR-U6B-7)

Shown **only** following this exact order: (1) a building permit is already trending `REQUIRED`
(never shown if trending `LIKELY_EXEMPT`); (2) no other known condition has already routed the
review path to full review (a mapped ECA intersection alone is dispositive, regardless of span);
(3) footprint remains `≤ 750 sq ft` (already `> 750` also routes to full review regardless of
span); (4) span information can still actually change `STFI_LIKELY` vs. `FULL_REVIEW_LIKELY`/
`REQUIRES_VERIFICATION` — exactly the one remaining open variable. Collects a number, not a
category (founder correction, 2026-09-13 — a categorical enum could not distinguish a 20-ft from
a 35-ft manufactured truss):

> "About how far does the longest structural beam span, in feet? (Doesn't need to be exact —
> roughly the widest unsupported distance the roof framing crosses.)"
> — [numeric input] / Not sure yet
>
> "Does it use a manufactured or engineered roof truss?" (shown alongside, optional)
> — No / Yes / Not sure

Maps to `structuralSpanInfo.structuralSpanFt` (required if answered) and
`structuralSpanInfo.usesManufacturedTruss` (optional). Never inferred from `widthFt`/`depthFt`. A
`structuralSpanFt` of exactly 14 is disclosed as needing verification (the boundary-operator gap,
external-verification item 25), not silently resolved either way.

### Progressive — utility intent (per BR-U6B-8)

Shown as a light, clearly-optional multi-select, decoupled from the permit questions above:

> "Planning to add any of these? (optional — helps us flag separate permits you may need)"
> ☐ Electrical  ☐ Plumbing  ☐ Mechanical/HVAC

Any box checked renders the fixed advisory (candidate P8, non-tiered): "Electrical, plumbing, or
mechanical work may require separate permits. Permit Preflight's shed building-permit result
does not determine those trade permits."

### Not asked at all

ECA status — never a customer question (BR-U6B-5). No lot-coverage-specific question — every
coverage input is either already collected (dimensions) or Property-Intelligence-derived. No
question for P2b's zoning height limit — `heightFt` is already collected (existing shed intake),
and whether the shed falls inside a required setback is derived automatically from the
already-computed placement/setback facts, never asked of the customer (domain-entities.md §3a
note).

---

## 2. Report — "Building permit" section

```
Building permit
  <headline, derived from buildingPermit + reviewPath — five real combinations, business-
   logic-model.md Flow 3>

  Likely not required                         buildingPermit=LIKELY_EXEMPT, reviewPath=NONE
  Likely required — simple review (STFI)      buildingPermit=REQUIRED, reviewPath=STFI_LIKELY
  Likely required — full review                buildingPermit=REQUIRED, reviewPath=FULL_REVIEW_LIKELY
  Permit likely required — review path         buildingPermit=REQUIRED, reviewPath=REQUIRES_VERIFICATION
    needs verification
  Requires verification                        buildingPermit=REQUIRES_VERIFICATION

  <criteria checklist — one line per evaluated PermitCriterionResult, ✓ / ✗ / ⚠, each with its
   explanationBasis>

  <trade-permit disclosures, if any, rendered as separate ⚠ items below the checklist — never
   inside it>

  <if buildingPermit === LIKELY_EXEMPT: the fixed BR-U6B-9 disclaimer>
  <always: "SDCI makes the final determination" footer>
```

**P2b (accessory-structure zoning height limit) renders as its own, separate finding** — in the
report's existing general Findings list (subject "Accessory structure height limit"), never
inside the "Building permit" section above and never implied by its headline. The applicable
limit is location-sensitive (12 ft if the shed falls inside a required setback, 32 ft otherwise —
SMC 23.44.070) and is derived automatically from already-computed setback facts. A shed can show
"Likely not required" for the building permit while this separate finding reads "Requires
verification" (the setback-location fact itself unresolved) or "Fails" (height exceeds whichever
limit applies).

## 3. Report — "Mapped environmental/site constraints" section (per BR-U6B-4)

```
Mapped environmental/site constraints

  <one prominent item per hazard where mappedIntersectionResult !== NO_INTERSECTION>
    ⚠ Mapped liquefaction-prone area intersects the parcel.
      Source: Seattle ECA (SDCI), 1995 mapping — not survey-grade, advisory.
    (for a map-dispositive KNOWN hazard, e.g. priority_habitat with a clean intersection: a
     distinct, still-non-alarmist styling — "This mapped condition is treated as established
     under SDCI guidance" rather than the generic advisory wording)

  <one concise summary line for every clean category, grouped>
    ✓ No mapped landslide, liquefaction, peat settlement, flood-prone, or priority-habitat
      conditions detected on this parcel.

  <source/vintage/limitations footer, always present>
    Based on City of Seattle mapped data (see individual layer notes above); these are
    screening-level maps, not a site survey. A clean result here does not rule out an
    unmapped condition.
```

Never a dozen individual green cards (BR-U6B-4) — clean results are summarized, not enumerated.

## 4. Report — "Estimated lot coverage" section (CASE A/B/C model, founder-directed 2026-09-13)

**Founder UX principle**: never burden the customer with the special-allowance possibility when
it has no bearing on their result. Case A shows a simple result with no mention of 60% at all;
only Case B and Case C ever explain the special allowance or Director-alternative, because only
there does it actually matter.

**Case A — `WITHIN_STANDARD_ALLOWANCE`** (simple, no special-allowance mention):

```
Estimated lot coverage
  38%

Standard applicable limit
  50%

Result
  Within the standard lot-coverage allowance
```
followed by the estimate-limitations disclosure (mapped-structure-coverage caveat, always
present per BR-U6B-11) — never a "you might qualify for 60%" line, since that possibility has no
bearing on this result.

**Case B — `REQUIRES_VERIFICATION` / `MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE`**:

```
Estimated lot coverage
  56%

Standard applicable limit
  50%

Result
  Requires verification

  Estimated coverage exceeds the standard 50% limit but may fit within Seattle's 60% allowance
  for certain qualifying developments (common-amenity or stacked-dwelling-unit arrangements).
  Permit Preflight could not determine whether that allowance applies to this property.
```
Never rendered as a failure.

**Case C, no Director relevance — `EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE`**:

```
Estimated lot coverage
  68%

Even Seattle's higher 60% allowance (for qualifying developments) appears exceeded.
```
Subject to the estimate-limitations disclosure — never asserted with more precision than the
mapped-structure-coverage estimate supports.

**Case C, Director-alternative relevant — `REQUIRES_VERIFICATION` /
`POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE`**:

```
Estimated lot coverage
  68%

Result
  Requires verification

  The standard calculated allowance appears exceeded, but a parcel-specific Director-approved
  amount, if one exists, could alter this result. Permit Preflight has no way to confirm whether
  such an approval applies to this property.
```
Never claims an unconditional failure; never invents or implies a Director approval exists.

**Common to all cases**: `existingMappedCoverageSqFt` is always shown with its `overCountCaveat`
(domain-entities.md §1b). If `ecaAdjustment.status === "ESTABLISHED"`, a line discloses the
excluded area (riparian/wetland/shoreline/steep-slope-non-disturbance) and, if a floor applies,
the 625 sq ft minimum — noting a Director-approved alternative amount may exist where relevant. If
`ecaAdjustment.status === "REQUIRES_VERIFICATION"`, the result is
`LOT_AREA_ADJUSTMENT_UNRESOLVED` (rendered like Case B/C's `REQUIRES_VERIFICATION` copy, disclosing
that a mapped riparian/wetland/shoreline/steep-slope-non-disturbance condition intersects the
parcel and may reduce the countable lot area, pending more precise geometry) unless the estimate
already clears `EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE` even optimistically (business-logic-
model.md Flow 4). No "estimated remaining capacity" figure is ever shown for Case B/C or the
Director-relevant branch — only Case A's result is precise enough to state one, and even then only
when it can be given honestly (Code Generation may omit it even in Case A if no single honest
number applies).

## 5. `ReportView` integration

Both new sections are added to the existing `app/components/ReportView.tsx` (extended, not
replaced — matching Unit 6's own corrected posture toward that component) as two new
conditionally-rendered sections, reading two new optional fields on the shared `Report` shape
(`permitRequirement?: PermitRequirementFinding`, `lotCoverage?: ShedLotCoverageResult`) —
`undefined` for a garage/vacant-land report (unaffected), populated for a shed report. Placed
between "Findings" and "Requires Verification" in the existing section order (exact placement
confirmed during Code Generation against the live page, not fixed here).
