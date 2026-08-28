# Unit 5: Vacant-Land Rule Inventory and Tier-1/Tier-2 Triage (Q3)

**Method**: real, live navigation of the current Seattle Municipal Code (`library.municode.com`,
via an interactive browser tool — Municode blocks direct programmatic fetch, confirmed matching
every prior unit's own finding). `SMC 23.44.060` (maximum density and minimum lot size) was read
live in full for this pass — never read before in this project. `SMC 23.44.070` (height),
`23.44.080` (lot coverage), `23.44.090` Table A (setback baseline), and `23.44.020` Table A
(permitted uses) were all read live during Unit 1/Unit 4's own research this project — reused here
by citation, not re-fetched, since their text is unchanged and this pass's job is to determine how
they apply to a **new principal dwelling on a vacant/to-be-redeveloped lot**, a genuinely different
application than Unit 1's shed or Unit 4's garage (both accessory structures).

**Tier vs. evidence, applied correctly from the start this time.** Per the founder's own corrected
model (Unit 4's final targeted correction): a candidate is Tier 2 only for a genuine rule-level
reason — an unresolved textual ambiguity, a conflicting provision with no stated precedence, or a
discretionary/administrative determination baked into the rule's own text. Missing per-parcel
evidence forces `REQUIRES_VERIFICATION` (BR-4), never Tier 2 by itself. Every candidate below states
its Tier driver (if Tier 2) and its evidence gaps (if any) as two separate things.

**Subdivisions are explicitly OUT OF SCOPE** (per the founder's explicit instruction, matching
`requirements.md`'s own MVP boundary). This inventory evaluates an **existing** lot — one Property
Resolution has already confirmed as a real King County parcel record — never the creation of a new
one. `23.44.060.B` ("minimum lot size for lots created after the effective date... is 5,000 square
feet") governs *new* lot creation and is correctly out of scope for that reason, not omitted by
oversight.

**A real, genuinely different finding from Unit 4's own garage inventory**: because vacant-land
screening evaluates *plausible scenarios* ("what could be built here"), not one specific
user-supplied proposal, several candidates that were Tier-2-driving ambiguities for Unit 4's garage
(specifically L5's "does an accessory garage's presence break 'entirely of dwelling units'"
question) simply don't arise here — a genuine multi-unit-residential-development *scenario* really
is "entirely of dwelling units," with no accessory structure to muddy that reading. This is stated
explicitly per-candidate below, not assumed.

---

## Buildability & Use (U1, U2)

### U1 — Minimum buildability floor for an existing lot

**Citation**: SMC 23.44.060.C.4.c — *"At least one dwelling unit is allowed on all lots in
existence as of the effective date of this ordinance."* — read together with **SMC 23.84A.024**'s
real, live-verified "Lot" definition (corrected per founder review; the prior draft's "confirmed
King County parcel ⇒ `KNOWN`" claim conflated a King County parcel record with the code's actual,
narrower "lot" test and is withdrawn):

> *"'Lot' means... a parcel of land that qualifies for separate development or has been separately
> developed. A lot is the unit that the development standards of each zone are typically applied
> to. A lot shall abut upon and be accessible from a private or public street sufficiently improved
> for vehicle travel or abut upon and be accessible from an unobstructed permanent access easement.
> A lot may not be divided by a street or alley."* (SMC 23.84A.024, "Lot")

**Specification**: regardless of how the density formula (U3-U7, U16-U17 below) computes, a lot
meeting C.4.c's two conditions is entitled to at least one dwelling unit: (1) it is a "lot" under
23.84A.024's real test — quoted above — and (2) it was **in existence as of the ordinance's
effective date** (~January 21, 2026, per the founder — consistent with this project's own
previously-inferred 30-day-post-publication calculation for Ordinance 127376). Neither condition
reduces to "Property Resolution confirmed a King County parcel record." A King County parcel record
says nothing about street/easement access, "qualifies for separate development" status, or whether
a street/alley divides it — and Property Resolution has never measured any of those things.

**BR-6 triage**: ✅ C.4.c's own text is single and unconditional — the rule itself carries no
ambiguity or discretionary mechanism. The genuine complexity here is **entirely in the
applicability facts** (the "lot" qualification test and the existence-date requirement), not in the
rule's own text — the correct place for that complexity to live, per this project's own Tier-vs-
evidence discipline (a Tier-1 rule's *applicability facts* can still be genuinely unresolved; that
is not the same thing as the rule itself being Tier 2).

**Tier: TIER 1.**

**Required facts** (two, both currently unestablished by any data source this project integrates):
1. **SMC-23.84A.024 "lot" qualification** — that the parcel qualifies for separate development or
   has been separately developed, abuts and is accessible from a sufficiently-improved street or an
   unobstructed permanent access easement, and is not divided by a street or alley. A King County
   parcel boundary (Property Resolution's existing data) does not establish any of these — it is
   geometry, not a legal/access determination.
2. **Existence as of the ordinance's effective date** (~January 21, 2026) — this project has no
   parcel-history/records data source that establishes when a given lot came into existence.

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` by default — the practical outcome for
essentially every real evaluation under the POC's current data coverage, since neither required
fact is established by anything Property Resolution/Property Intelligence currently provides. This
is a genuine correction from the prior draft's claim of a rare, usable `KNOWN` result: no such
`KNOWN` path exists today. **If** both facts were independently established (e.g., a founder or
future integration supplies them) **and** this candidate's governed `RegulatoryRule` row is
`ACTIVE` (see below), the finding becomes `KNOWN` and states plainly: "if this lot's qualification
and existence-date are confirmed, the code guarantees a one-unit floor regardless of how the
density formula computes" — genuinely useful framing to preserve, just correctly gated.

**Candidate semantics vs. current POC execution** (added per founder review — the ACTIVE-only rule
query governs every candidate, U1/U2 included, not only the scenario figures): the evidence-gated
behavior above describes what U1 would determine *if* its governed rule is `ACTIVE`. Since BR-U5-5
confirms zero Unit 5 candidates reach `ACTIVE` within this unit, the deployed POC produces no
governed U1 finding at all today — disclosed as no-`ACTIVE`-coverage, the same mechanism used for
every other candidate, independent of and in addition to the evidence gap above.

**Real, disclosed limitation**: no Recorder/SDCI legal-building-site or parcel-history integration
is built in this unit (explicit founder instruction) — this candidate's evidence gap is named and
left `REQUIRES_VERIFICATION`, not worked around with an out-of-scope data source.

### U2 — Permitted residential use

**Citation**: SMC 23.44.020, Table A for 23.44.020 (read live during Unit 4's own research;
reused here for the principal-use question rather than an accessory one).

**Specification**: "A. Residential uses except as listed below: P" (permitted outright). Narrow
listed exceptions: assisted living facilities (X, prohibited), caretaker's quarters (X), congregate
residences (X/P — permitted only within a major transit service area, prohibited elsewhere).

**BR-6 triage**: ✅ a direct permitted-use table, single unambiguous default (P) for ordinary
residential use, with explicit enumerated exceptions — no discretion, no conflicting provision.

**Tier: TIER 1.**

**Required facts**: none beyond zone confirmation (NR), already established by Property Resolution.
The congregate-residence exception alone needs major-transit-service-area status (see U5's shared
data gap) — immaterial for the ordinary single/multi-family scenario.

**Unavailable-fact behavior**: `KNOWN` for the ordinary case (not a congregate residence) —
**candidate semantics**, describing what U2 would determine *if* its governed `RegulatoryRule` row
is `ACTIVE` (added per founder review, mirroring U1's own correction: the ACTIVE-only rule query
governs U1/U2 exactly like every other candidate). **Current POC execution**: since BR-U5-5
confirms zero Unit 5 candidates reach `ACTIVE` within this unit, U2 produces no governed finding
today either — disclosed as no-`ACTIVE`-coverage, not silently rendered as `KNOWN` merely because
its rule text is Tier 1 and unambiguous.

---

## Density (U3-U7, U16-U17) — SMC 23.44.060.A + C + D + E

**Corrected per founder review**: the prior draft read D.1/D.6/E live but never actually modeled
them — every U3-U7 density figure silently assumed the regulatory "lot area" divisor equals the
parcel's raw geometric area. That is wrong on two independent counts, both now modeled as new
candidates (U16, U17) and as a new required fact-pair on every density candidate below:
`rawParcelAreaSqFt` (Property Intelligence's existing parcel-boundary geometry, unchanged) is no
longer treated as interchangeable with `densityCountableLotAreaSqFt` (the regulatory divisor, which
may differ per D.6/E — see U16). U3-U7's own "lot area (known)" required-fact lines above are
corrected by this note: "known" refers only to `rawParcelAreaSqFt`; the countable divisor U16
actually requires is a separate, evidence-gated fact. (Authoritative numbering, restated per this
correction pass: **U16** = 23.44.060.D.6+E density-countable lot area; **U17** = 23.44.060.D.1
fraction-rounding.)

### U3 — Base maximum density

**Citation**: SMC 23.44.060.A (all 4 subclauses).

**Specification**: 1 dwelling unit per 1,250 sq ft of lot area (the general default, A.4); 1 per
600 sq ft for stacked dwelling units (A.1); 1 per 500 sq ft for stacked units meeting a tree-
retention/Green-Factor bonus (A.2); 1 per 650 sq ft within a frequent-transit-service area for a
specific multi-story/amenity-area configuration (A.3, identical condition shape to lot coverage's
own L5/23.44.080.F).

**BR-6 triage**: ✅ each subclause's own number is unambiguous; the choice *between* subclauses
depends on which development *type* a given scenario represents — not itself an ambiguity, since
`vacant-land-screening` is explicitly scenario-based (VL-4's own framing: "plausible... scenarios,"
plural). No discretionary determination, no conflicting cross-reference.

**Tier: TIER 1.**

**Required facts**: lot area (known — Property Intelligence's existing parcel-boundary geometry,
reused, not new); which scenario type is being evaluated (not a per-parcel evidence gap — the
*scenario itself* determines which subclause applies, by design, since this is "what could be
built here," not "what is being built here").

**Unavailable-fact behavior**: computable as a genuine `KNOWN` figure **per scenario** (e.g. "up to
N units under the general 1,250 sq ft/unit rate; up to M units if built as a qualifying frequent-
transit-area development") — A.3's frequent-transit-area condition specifically stays
`REQUIRES_VERIFICATION` for that one scenario variant only, since transit-service-area status is an
unresolved data gap (U5 below), not for the density calculation as a whole.

### U4 — Small-lot density bonus, general (<5,000 sq ft)

**Citation**: SMC 23.44.060.C.1.

**Specification**: a lot under 5,000 sq ft may be developed with up to 4 dwelling units, provided
it contains no riparian corridor/wetland+buffer/submerged-land-or-shoreline-setback/steep-slope
non-disturbance area.

**BR-6 triage**: ✅ a simple size threshold plus a categorical ECA-absence condition — no
discretionary determination, no conflicting provision. Survives the "assuming facts were known"
test cleanly.

**Tier: TIER 1.**

**Required facts**: lot area (known); whether any SMC 23.44.080.B-listed ECA category is present on
the lot (the same unresolved evidence gap `business-rules.md` BR-U4-7 already found for garages —
no production ECA area-of-overlap capability exists).

**Unavailable-fact behavior**: `KNOWN` when the lot is confidently ≥5,000 sq ft (the bonus simply
doesn't apply — a real negative result, not an unresolved one) or when ECA-absence is confidently
established; `REQUIRES_VERIFICATION` whenever the lot is <5,000 sq ft and ECA-presence is unresolved
— expected to be the common case for a genuinely small lot, matching Unit 4's own data-gap finding.

### U5 — Small-lot + transit density bonus (<7,500 sq ft)

**Citation**: SMC 23.44.060.C.2.

**Specification**: a lot under 7,500 sq ft, within 1/4 mile walking distance of a stop on a "major
transit service," may be developed with up to 6 dwelling units under the same ECA-absence
condition as U4.

**BR-6 triage**: ✅ same shape as U4 — a size threshold, a categorical ECA-absence condition, and a
distance-to-transit-stop condition — no discretion, no conflicting provision.

**Tier: TIER 1.**

**Required facts**: lot area (known); ECA-absence (same gap as U4); **1/4-mile walking-distance to
a "major transit service" stop — a new, real data gap this project has never integrated** (distinct
from, but the same general class as, `23.44.060.A.3`/`23.44.080.F`'s "frequent transit service
area" — Seattle's code uses at least two related-but-distinct transit-proximity concepts; this
pass does not attempt to reconcile whether they're the same underlying dataset, since neither is
integrated today either way).

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` whenever transit-stop distance is unknown —
expected to be the case for essentially every parcel today, since no transit-service GIS layer is
integrated. **No new external data provider is added in this unit to close this gap** — flagged for
founder awareness, matching Q4's explicit instruction not to improvise an integration.

### U6 — Small-lot low-income-housing density bonus (<7,500 sq ft, not near transit)

**Citation**: SMC 23.44.060.C.3.

**Specification**: a lot under 7,500 sq ft, more than 1/4 mile from major transit, may still reach
up to 6 units if the same ECA-absence condition holds **and** at least 2 principal units are
"low-income units subject to a regulatory agreement, covenant, or other legal instrument
enforceable by The City of Seattle," administered by a qualifying non-profit organization per
Office-of-Housing criteria, with ongoing compliance reporting.

**BR-6 triage**: ❌ **genuine discretionary/administrative mechanism baked into the rule's own
text** — a City-enforceable regulatory agreement and Office-of-Housing non-profit qualification are
real administrative processes, not facts this project could ever resolve by better data alone; this
survives the "assuming facts were known" test, since even complete knowledge of a lot's physical
characteristics says nothing about whether such an agreement exists or would be pursued.

**Tier: TIER 2** — on the discretionary-mechanism ground, the same class of driver as Unit 4's L4
(Director-approved amount) and S2 (Director determination).

**Required facts**: same ECA-absence gap as U4/U5; whether a qualifying regulatory agreement
exists/would be pursued — never determinable from any data source this project has or has
contemplated integrating.

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` whenever this pathway might be relevant — not
a candidate that will ever reach `KNOWN` for an as-yet-hypothetical scenario; useful only as a named,
disclosed possibility ("this lot may qualify for a further density bonus if paired with a
City-administered affordable-housing agreement — consult SDCI/Office of Housing").

**Reviewer type**: zoning consultant/planner (confirms the practical scope of this pathway).

### U7 — ECA-proportional density calculation

**Citation**: SMC 23.44.060.C.4.

**Specification**: on a lot containing an ECA area, an applicant may instead compute density as
(units allowed under C.1-C.3 assuming no ECA) × (percentage of the lot NOT covered by ECA area),
with a floor of at least 1 unit for any existing lot (cross-referencing U1's own floor).

**BR-6 triage**: ✅ the arithmetic itself is a stated formula, not a discretionary determination —
no ambiguity in the formula; its dependency on C.1-C.3 inherits U4/U5/U6's own Tier status per
scenario (U6's discretionary mechanism specifically, if that scenario variant is chosen).

**Tier: TIER 1** for the arithmetic; **the same evidence gates as U4-U6 apply**, plus a new one —
the formula itself requires knowing the *actual measured percentage* of the lot covered by ECA
area, not merely whether any ECA area is present at all (a stricter, area-of-overlap requirement,
the same capability gap `lot-coverage-data-source-validation.md`/BR-U4-7 already found absent).

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` whenever the ECA-covered-percentage cannot be
measured — expected to be the common case, same underlying gap as Unit 4's lot-coverage denominator.

### U16 — Density-countable lot area (ECA/steep-slope exclusions from the divisor)

**Citation**: SMC 23.44.060.D.6 (excludes "lot area" within a steep-slope non-disturbance area
and other listed ECA categories from the density-calculation divisor) + SMC 23.44.060.E (defines
the steep-slope non-disturbance area used by D.6, reusing the same categorical ECA concept U4-U7
already name — not a new capability, a new *application* of the existing gap).

**Specification**: the "lot area" figure every U3-U7 density rate divides by is **not** the raw
parcel boundary area — D.6 requires subtracting any steep-slope non-disturbance area (E) and the
other D.6-listed ECA categories first. `densityCountableLotAreaSqFt` (new fact, below) is this
corrected divisor; `rawParcelAreaSqFt` alone is not sufficient input to any U3-U7 figure.

**BR-6 triage**: ✅ D.6's exclusion list and E's steep-slope definition are stated categorically —
no discretionary determination, no conflicting cross-reference. The complexity is evidentiary
(measuring the excluded area), not textual.

**Tier: TIER 1.**

**Required facts**: `rawParcelAreaSqFt` (known, Property Intelligence's existing geometry);
measurable steep-slope-non-disturbance-area and other D.6-listed-ECA-category area actually
intersecting the parcel — the same ECA area-of-overlap capability gap U4/U7/U11/U13 already name,
applied here to the density divisor specifically rather than the lot-coverage denominator.

**Unavailable-fact behavior**: `densityCountableLotAreaSqFt` is `KNOWN` (and equal to
`rawParcelAreaSqFt`) only when confidently no D.6-listed area intersects the parcel;
`REQUIRES_VERIFICATION` whenever such area might be present but is not measurable — the same
fail-closed default every other ECA-dependent candidate in this inventory uses. Every U3-U7 figure
that depends on `densityCountableLotAreaSqFt` inherits this gate rather than silently substituting
`rawParcelAreaSqFt`.

### U17 — Fraction-rounding rule for computed dwelling-unit counts

**Citation**: SMC 23.44.060.D.1.

**Specification**: when a density formula (U3, U4, U5, U6, U7) produces a fractional number of
dwelling units, D.1 states the specific rounding treatment governing the final allowed count (not
ordinary floor/round arithmetic — the code's own stated rounding rule controls).

**BR-6 triage**: ✅ a single stated arithmetic rule — no discretion, no conflicting provision.

**Tier: TIER 1.**

**Required facts**: none beyond the density formula's own inputs (U3-U7, U16) — D.1 is a pure
computation step applied to whatever figure those candidates already produce.

**Unavailable-fact behavior**: inherits whichever U3-U7 figure it rounds — `KNOWN` when that
figure is `KNOWN`, `REQUIRES_VERIFICATION` when it is. Every scenario's `maxDwellingUnits`
(`domain-entities.md`, `ResidentialUseScenario`) must apply D.1's rule as the final step, not
ordinary rounding.

---

## Height (U8) — SMC 23.44.070

### U8 — Height for a new principal dwelling

**Citation**: SMC 23.44.070.A.1 (32 ft base) / A.2 (42 ft, for qualifying multi-unit/stacked/
tree-retention configurations) + 23.44.070.B (roof-height standards). **A.3 (the 12/15 ft
accessory-structure-in-required-setback limit) does not apply at all** — a new principal dwelling
is never "an accessory structure," so this candidate is genuinely simpler than Unit 4's H1/H2 pair;
no A.3.a/B roof-bonus conflict arises here (that conflict was specific to A.3's accessory case).

**Specification**: 32 ft flat limit by default; 42 ft for a development with 3+ principal dwelling
units and a ≥20 ft front setback, for qualifying stacked-dwelling-unit configurations, or for lots
retaining a qualifying tree/canopy score (A.2.d). B's roof-height bonuses (+5 ft qualifying pitched,
+3 ft shed/butterfly high-side, up to +4 ft for eave accommodation) apply cleanly on top of
whichever base limit governs — no specific-vs-general conflict here (unlike Unit 4's H1).

**BR-6 triage**: ✅ A.1's default and B's bonuses are unambiguous; ❌ **A.2.d's own textual
ambiguity survives, unchanged from Unit 4's H2 finding** — "structures on lots that" retain a
qualifying tree is worded without an explicit principal-vs-accessory qualifier, and here it is
**more materially relevant than it was for Unit 4** (a real principal dwelling might genuinely want
the 42 ft allowance, unlike a garage which would never need it).

**Tier: TIER 2** — for A.2.d's genuine scoping ambiguity, the sole driver (no setback-siting
dependency here, since a principal dwelling's height doesn't turn on whether it happens to sit in a
setback the way an accessory structure's did).

**Required facts**: which A.2 configuration (if any) the scenario represents (scenario-determined,
not a per-parcel evidence gap, per U3's same reasoning); roof form/pitch (scenario-determined).

**Unavailable-fact behavior**: the *base* 32 ft figure (A.1, for a scenario not claiming any A.2
bonus) is `KNOWN`-computable once B's roof bonus is applied; any scenario claiming an A.2 bonus
depends on A.2.d's unresolved scoping question when the tree-retention pathway specifically is
invoked, and is otherwise `KNOWN` for the 3+-unit/stacked-unit pathways (a-c), which have no scoping
ambiguity.

**Reviewer type**: zoning consultant/planner.

---

## Setback (U9) — SMC 23.44.090 Table A

### U9 — Setback baseline for a new principal dwelling

**Citation**: SMC 23.44.090 Table A (+ footnotes 1-3) — reused directly from Unit 4's own S1
candidate, now governing the principal structure itself rather than being the shared geometric
input for an accessory-structure exception.

**Specification**: unchanged from Unit 4's S1 — front 15 ft (1-2 dwelling units) / 10 ft (3+); rear
15 ft / 10 ft / 5 ft (small lot, transit area) / 0 ft (alley-abutting); side 3 ft (small lot,
transit area) / 5 ft average, 3 ft minimum otherwise.

**BR-6 triage** (reapplying Unit 4's own corrected S1 conclusion, unchanged): ✅ the branch-selection
logic itself is explicit and mechanical — no ambiguity, no discretionary determination, no
conflicting cross-reference.

**Tier: TIER 1 (governance)** — same conclusion as Unit 4's S1, reached independently here on the
same real basis, not merely copied.

**Required facts**: which dwelling-unit-count branch applies (scenario-determined, per U3); lot
size/frequent-transit-area status for the small-lot branches (the same unresolved transit-area gap
as U5/L5).

**Unavailable-fact behavior**: `KNOWN` for the ordinary (non-small-lot) case once a scenario's unit
count is fixed; `REQUIRES_VERIFICATION` for the small-lot/transit-dependent branches when
transit-area status is unresolved.

---

## Lot Coverage (U10-U15) — SMC 23.44.080

Reused directly from Unit 4's own L1-L6 (`garage-rule-inventory-and-tier-triage.md`) — same
citations, same numbers, same governance-level Tier conclusions where the underlying rule text is
identical. Only the *applicability context* differs (a new principal dwelling / multi-unit
development scenario, not an accessory garage), which materially changes one candidate's real-world
usability (U14, below).

### U10 — Base maximum lot coverage
**Citation**: 23.44.080.A. **Tier: TIER 1** (identical to Unit 4's L1).

### U11 — Excluded lot-area categories (denominator)
**Citation**: 23.44.080.B + E. **Tier: TIER 1 (governance)**, blocked from usability by the same
unresolved ECA area-of-overlap gap as Unit 4's L2/BR-U4-7 — unchanged, not re-litigated here.

### U12 — Numerator exclusions
**Citation**: 23.44.080.C. **Tier: TIER 1** (identical to Unit 4's L3).

### U13 — Minimum lot coverage floor
**Citation**: 23.44.080.D. **Tier: TIER 2** — the same Director-approval discretionary mechanism as
Unit 4's L4, unchanged.

### U14 — Frequent-transit-area multi-unit 60% provision — *re-triaged for this context*
**Citation**: 23.44.080.F. Unit 4's L5 found a genuine scoping ambiguity ("does 'development
consisting entirely of dwelling units' exclude a lot that also has a non-dwelling accessory
garage") that forced Tier 2. **That ambiguity does not arise for a vacant-land scenario evaluating
an actual qualifying multi-unit residential development** — there is no accessory structure to
create the scoping question; the scenario genuinely *is* "entirely of dwelling units" by
construction.

**BR-6 triage**: ✅ once the accessory-structure scoping question is set aside, F's own condition
list (story count, structure arrangement, amenity-area sizing, transit-area status) is complex but
explicit — no discretionary determination, no conflicting provision, no remaining ambiguity in this
context.

**Tier: TIER 1 (governance)** — a genuine, context-driven re-triage, not a blanket reclassification
of the citation itself; Unit 4's garage-context L5 finding stands unchanged for garages.

**Required facts**: the same frequent-transit-area gap as U5/U9, plus the specific structure-
arrangement/amenity-area facts (scenario-determined, not a per-parcel gap, since this is being
evaluated as a hypothetical qualifying scenario, not a real site plan).

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` for the transit-area-status component of this
scenario specifically; the scenario's own configuration facts are asserted as part of the scenario
description, not evidence-gated.

### U15 — Stacked-dwelling-units 60% provision
**Citation**: 23.44.080.G. **Tier: TIER 1** (identical conclusion to Unit 4's L6, and here the
"stacked dwelling units" fact is the scenario itself being evaluated, not a self-reported physical
fact about an existing building — even more directly usable in this context than in Unit 4's).

---

## Summary — Candidate Count and Tier Distribution

| Candidate | Question | Citation | Tier | Genuine rule-level driver (if Tier 2) |
|---|---|---|---|---|
| U1 | Buildability floor | 23.44.060.C.4.c | **1** | — |
| U2 | Permitted use | 23.44.020 Table A | **1** | — |
| U3 | Base density | 23.44.060.A | **1** | — |
| U4 | Small-lot density bonus | 23.44.060.C.1 | **1** | — |
| U5 | Small-lot+transit density bonus | 23.44.060.C.2 | **1** | — |
| U6 | Low-income-housing density bonus | 23.44.060.C.3 | **2** | Regulatory-agreement discretion |
| U7 | ECA-proportional density | 23.44.060.C.4 | **1** | — |
| U16 | Density-countable lot area | 23.44.060.D.6+E | **1** | — |
| U17 | Fraction-rounding rule | 23.44.060.D.1 | **1** | — |
| U8 | Height, new principal dwelling | 23.44.070.A/B | **2** | A.2.d scoping ambiguity |
| U9 | Setback baseline | 23.44.090 Table A | **1 (governance)** | — |
| U10 | Lot coverage base | 23.44.080.A | **1** | — |
| U11 | Excluded lot area | 23.44.080.B+E | **1 (governance)** | — |
| U12 | Numerator exclusions | 23.44.080.C | **1** | — |
| U13 | Minimum coverage floor | 23.44.080.D | **2** | Director-approval discretion |
| U14 | Frequent-transit coverage bonus | 23.44.080.F | **1 (governance)** | — (re-triaged, context-specific) |
| U15 | Stacked-units coverage bonus | 23.44.080.G | **1** | — |

**3 of 17 (18%) Tier 2** — recomputed honestly after adding U16/U17 (both Tier 1, no forcing
applied to preserve the prior draft's "15 candidates / 20%" figures) — still a real, genuinely
different distribution from Unit 4's garage inventory (62% Tier 2), **not forced to match it or
Unit 0B's own sample**. This is explained by real, disclosed structural reasons, not softened: (a)
subdivision-adjacent/discretionary-agreement content (U6, U13) and one recurring textual ambiguity
(U8's A.2.d, inherited unchanged from Unit 4's H2) are the only genuine Tier-2 drivers found; (b)
scenario-based evaluation (vs. Unit 4's single-specific-user-proposal evaluation) genuinely
sidesteps the "does an accessory structure count against 'entirely of dwelling units'" ambiguity
that drove Unit 4's L5 to Tier 2 — a real methodological difference, not a coincidence, stated
explicitly at U14; (c) U16/U17 (the newly-modeled D.1/D.6/E mechanics) are both Tier 1 — their
complexity is evidentiary (ECA area-of-overlap measurement, inherited from the existing gap), not
textual, so they do not change the Tier distribution, only the honesty of what U3-U7 actually
compute.

**Reminder, restated after this correction**: Tier and evidence-availability remain two separate
axes throughout this inventory (U1's own correction above is the clearest instance) — a low
Tier-2 rate never implies most findings will reach `KNOWN`; it only means most candidates' own rule
text is unambiguous. U1, U16, and most of U3-U7 are Tier 1 and still expected to render
`REQUIRES_VERIFICATION` for the large majority of real parcels today, for evidentiary reasons
stated at each candidate. **A third, independent axis, added per the final founder correction
pass**: `ACTIVE` governance coverage. Every candidate's evidence-gated behavior above describes
what it would determine *if* its governed `RegulatoryRule` row is `ACTIVE` — since no Unit 5
candidate reaches `ACTIVE` in this unit (BR-U5-5), the deployed POC produces no governed finding
for **any** U1-U17 candidate today, U1/U2 included, regardless of Tier or evidence status.

**This lower Tier-2 rate does NOT mean vacant-land findings will commonly reach `KNOWN`.** Real,
substantial evidence gaps remain independent of Tier: ECA area-of-overlap measurement (U4, U7,
U11, U13 — unchanged from Unit 4's own finding, still no production capability), "major transit
service" 1/4-mile-walking-distance data (U5, distinct from but same class as the existing
"frequent transit service area" gap affecting U3.A.3, U9, U14), and the general-vs-scenario
distinction itself (a *scenario's own* configuration facts are asserted, not evidence-gated, but
the *parcel's own* physical facts — its actual ECA/transit-area status — remain the same real,
disclosed, currently-unresolved gaps this project has held to since Unit 4).

**Professional review is deferred to the same post-POC "Regulatory Professional Review /
Commercialization Gate" milestone** (`aidlc-docs/aidlc-state.md`) established for Unit 4 — this
inventory's job is to be complete and precise enough for that eventual review, not to prepare for
an imminent one. **Reviewer type for U6 and U8**: zoning consultant/planner (same package as Unit
4's deferred review would use, when it happens — this inventory can be batched with Unit 4's own
13 candidates at that time, not a separate engagement).

**Scope discipline**: this pass stayed within SMC 23.44.020/.060/.070/.080/.090 — the sections
directly answering VL-2 through VL-4's stated questions (parcel/zoning characteristics, buildable-
lot/density, mapped constraints, setback/height/coverage envelope inputs, plausible residential-use
scenarios). It deliberately did not research subdivision/platting procedure (SMC Title 23 Subtitle
II, out of scope per explicit instruction), demolition-permit process, easement law, or vested-
rights doctrine — none of which SMC 23.44 itself addresses, and none of which this pass found a
strict necessity to research for VL-2 through VL-5 specifically (per the founder's own Q2
instruction not to expand into that territory absent a demonstrated need). Where the
`REDEVELOP_EXISTING_PARCEL` intent (`domain-entities.md`) surfaces one of these concerns as
materially relevant to a specific finding, that finding is `REQUIRES_VERIFICATION` — never
silently assumed resolved, and never researched further in this bounded pass.
