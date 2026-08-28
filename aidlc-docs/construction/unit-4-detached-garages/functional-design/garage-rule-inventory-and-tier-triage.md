# Unit 4: Detached Garage Rule Inventory and Tier-1/Tier-2 Triage (Q2)

**Revised 2026-08-26 (regulatory-completeness pass, round 2)**: the prior 5-candidate inventory
(G1/G1b/G2/G3/G4) modeled lot-coverage as a flat 50%-of-raw-area rule and omitted the roof-height
bonus provisions and most of the setback chapter's garage-specific text. Re-read SMC 23.44.080 (all
7 subsections, A-G), SMC 23.44.070.B (roof-height standards), SMC 23.44.090 Table A + the full G/I
text, and SMC 23.44.160.C-D (parking/garage placement in street setbacks) in full. The inventory is
now **13 candidates** (renamed to avoid colliding with SMC's own subsection lettering: `H` = height,
`S` = setback, `L` = lot coverage), decomposed per-provision rather than per-constraint-type, per
the founder's explicit instruction. **The post-POC professional-review sequencing decision from the
prior review is unchanged and not revisited here** — see "Professional Review — Committed,
Explicitly Deferred to Post-POC" below, carried forward verbatim in substance.

**Method**: real, live navigation of the current Seattle Municipal Code (`library.municode.com`,
via an interactive browser tool — Municode blocks direct programmatic fetch, confirmed, matching
Unit 0B's own finding). Every citation below was read directly from the current code text (Ord.
127376, § 31, 2025 / Supp. 44), not reconstructed from memory or from this document's own prior
draft.

**This is a founder decision point, not a finalized rule set.** Tier-2 rules below are not activated
without the deferred professional-review checkpoint, and `SRE-GARAGE-1` is not declared satisfied
merely by producing this inventory.

**Revised again 2026-08-26 (final targeted correction — Tier vs. evidence separation)**: round 2's
triage repeatedly cited "depends on facts we don't have" as if that alone justified Tier 2. It
doesn't. This project's own model (already correctly applied to L2) separates **(A) regulatory rule
tier** — is the rule's own meaning and applicability sufficiently unambiguous, once the necessary
facts are known, for founder verification, or does it require professional interpretation — from
**(B) per-parcel evidence availability** — do we actually know the facts on this parcel. Missing
evidence forces `REQUIRES_VERIFICATION` (BR-4); it does not by itself force Tier 2. Every candidate
below has been re-asked: *"Assuming the necessary facts were reliably known, is this rule's meaning
and deterministic applicability itself sufficiently unambiguous for founder verification?"* Where
the answer is yes, the candidate is now Tier 1 (governance) with its evidence gap stated separately;
where a genuine rule-level ambiguity, conflict, or discretionary/administrative determination exists
in the rule's own text, it stays Tier 2, and that specific reason is named. **Reclassified this
pass: S1 (Table A) and L6 (stacked dwelling units) move to Tier 1 (governance) + evidence-gated; L5
(frequent-transit bonus) stays Tier 2 but for a newly-identified, specific interpretation question,
not for its data gap.** H1, H2, S2, S3, S4, S5, and L4's Tier-2 classifications are unchanged in
outcome, with their reasoning tightened to isolate the genuine rule-level driver from the
separately-stated evidence gap.

---

## Height (H1, H2) — SMC 23.44.070.A + B

### H1 — Accessory structure height in a required setback

**Citation**: 23.44.070.A.3, layered with 23.44.070.B (general roof-height standards).

**Specification**: base limit 12 ft for an accessory structure "located in required setbacks."
A.3.a's own bonus: a pitched roof (≥4:12) may extend the ridge to 15 ft; **"no portion of a shed
roof is permitted to extend beyond the 12-foot height limit"** — an explicit denial for shed roofs.

**New finding this pass — a real conflict with B, not previously modeled**: 23.44.070.B is a
*general* roof-height standard that by its own text applies to "the maximum height limit, as
determined under subsection 23.44.070.A" — which includes A.3. B.1 gives *any* qualifying pitched
(non-shed/butterfly) roof up to **+5 ft** (not A.3.a's +3 ft). B.2 gives shed/butterfly roofs up to
**+3 ft on the high side** (directly contradicting A.3.a's flat denial of any shed-roof bonus),
plus up to +4 ft total if the roofline is extended to accommodate eaves. **A.3.a (specific,
in-setback-accessory-structure provision) and B (general, zone-wide roof-height provision) give
different, and for shed roofs directly contradictory, answers for the identical fact pattern** — a
shed-roofed garage in a required setback: A.3.a says no bonus at all; B.2 says up to +3 ft. Neither
section cross-references or subordinates the other. This is a textbook "general vs. specific"
statutory conflict a zoning professional resolves, not this project.

**Applicability**: depends on whether the garage is actually sited within a required setback, which
depends on where the setback line falls (S1) and, if relying on a setback-placement exception,
which of S2/S3/S4 applies. **This is a per-parcel evidence question, not a rule-ambiguity
question**, once S1 is itself resolved (S1 is Tier 1 governance — below); it is stated under
"Required facts," not counted as an independent Tier-2 driver.

**BR-6 triage** (revised — Tier vs. evidence separated): ❌ **genuine, rule-level conflict between
A.3.a and B for the shed/butterfly-roof case** (and a differing bonus amount even for the non-shed
case, +3 ft vs +5 ft) — this survives the "assuming facts were known" test, since even with perfect
knowledge of siting and roof form, the *rule itself* gives two different answers with no stated
precedence; ❌ no `ACTIVE` analog. Setback-siting is **not** listed as a Tier-2 driver here (see
Required facts / Unavailable-fact behavior instead).

**Tier: TIER 2** — solely for the A.3.a/B roof-bonus conflict, a genuine rule-level ambiguity.

**Required facts**: whether the garage sits within a required setback (from S1's baseline geometry
plus the garage's actual proposed placement — an evidence question, not itself ambiguous); if
relying on a setback-placement exception, which of S2/S3/S4 governs; roof form (shed/butterfly vs.
other pitched vs. flat) and pitch, once the A.3.a/B conflict is resolved by review.

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` whenever setback siting cannot be established
from S1's evidence — independent of, and in addition to, the A.3.a/B conflict's own
`REQUIRES_VERIFICATION` requirement (never assume the more generous (B) or more restrictive (A.3.a)
reading).

**Reviewer type**: zoning consultant/planner (resolves the A.3.a/B general-vs-specific conflict).

### H2 — General accessory structure height (outside required setbacks)

**Citation**: 23.44.070.A.1 (base 32 ft) / A.2 (42 ft, checked and found inapplicable to the
ordinary garage case, with one disclosed exception below), layered with 23.44.070.B.

**Specification**: 32 ft flat limit for "any structure not listed in A.2 or A.3." A.2's 42 ft
allowances (3+ principal-dwelling-unit developments; stacked dwelling units meeting floor-area or
Green Factor conditions; lots retaining a Tier 1/2 tree or hitting a canopy-point score) are
unambiguously about principal residential development for (a)-(c); (d)'s "structures on lots that"
retain a qualifying tree is worded generically enough that whether an accessory garage could read
into it is genuinely ambiguous text — flagged, not resolved, and practically immaterial since a
garage would essentially never need 32 ft, let alone 42 ft.

**B's roof bonus applies cleanly here** — no A.3.a-style specific provision exists to conflict with
it for the outside-setback case, so H2's actual permitted envelope is simply A.1/A.2's base limit
plus whichever of B.1 (+5 ft, qualifying pitched, non-shed/butterfly) or B.2 (+3 ft high-side,
shed/butterfly, +4 ft if eaves are accommodated) applies to the garage's actual roof form. This is a
computable "allowed height envelope," not a bare 32 ft comparison.

**BR-6 triage** (revised — Tier vs. evidence separated): ❌ **A.2.d's own textual ambiguity** — a
genuine rule-level question (does "structures on lots that" retain a qualifying tree extend to an
accessory garage) that survives the "assuming facts were known" test, since even knowing the tree/
canopy facts with certainty, the *rule's own scope* is unclear; ❌ no `ACTIVE` analog. Setback-siting
is **not** listed as a Tier-2 driver (evidence question, see below — resolved by S1, Tier 1). B's
bonus itself is not an added ambiguity here (unlike H1) — it applies cleanly once the base limit is
known.

**Tier: TIER 2** — solely for A.2.d's genuine textual ambiguity (practically low-stakes, since a
garage would essentially never need 32 ft, but real ambiguous text nonetheless).

**Required facts**: setback siting (from S1's baseline geometry — an evidence question); roof
form/pitch for the B bonus computation.

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` when setback siting cannot be established
from S1's evidence — independent of A.2.d's own review-pending status.

**Reviewer type**: zoning consultant/planner.

---

## Setback (S1-S5) — SMC 23.44.090 Table A + A, G, I; SMC 23.44.160.C-D

### S1 — Table A baseline dimensions (the shared geometric input every other setback/height
candidate depends on)

**Citation**: 23.44.090 Table A (+ footnotes 1-3).

**Specification**: Front 15 ft (lots with 1-2 dwelling units) / 10 ft (3+ dwelling units). Rear
15 ft (1-2 principal dwelling units, not alley-abutting) / 10 ft (3+ principal dwelling units, not
alley-abutting) / 5 ft (lots <5,000 sq ft in a frequent-transit-service area) / 0 ft (rear setback
abuts an alley). Side: 3 ft (lots <5,000 sq ft in a frequent-transit-service area) / otherwise 5 ft
average, 3 ft minimum. (Footnote 3: ADUs specifically get a flat 5 ft rear setback — not applicable
to a non-dwelling garage.)

**Role**: Table A does not itself regulate a garage's placement — it establishes *where the
required-setback lines are*, which is the precondition every one of S2-S5, H1, and H2 needs before
their own applicability (in-setback vs. outside-setback) can be determined at all.

**Real data gap (evidence, not rule ambiguity)**: several of Table A's own branches depend on facts
this project does not currently capture — principal dwelling-unit count on the lot, and (again)
frequent-transit-service-area status (the same undetermined external GIS fact L5 also needs).

**BR-6 triage** (re-triaged this pass — Tier vs. evidence separated): ✅ the dimension numbers
themselves are not ambiguous once the correct branch is identified — applying the "assuming facts
were known" test: yes, Table A's own branch-selection logic (dwelling-unit count, alley-abutment,
lot size, transit-area status) is explicit and mechanical, not a matter of interpretation. No
conflicting cross-reference, no discretionary determination, no undefined term was found in Table A
itself. This is the same pattern already correctly applied to L2 (governance-level enumeration,
blocked from full usability by evidence, not by ambiguity).

**Tier: TIER 1 (governance)** — reclassified this pass from the round-2 draft's Tier 2. The
dwelling-unit-count and frequent-transit-area data gaps are real and force `REQUIRES_VERIFICATION`
per parcel (below), but do not themselves make the rule Tier 2.

**Required facts**: principal dwelling-unit count on the lot (plausibly a direct, self-reportable
intake fact, similar to `alleyAdjacent`); frequent-transit-service-area status (an external GIS
fact — see L5's data-gap note; not newly integrated in Unit 4 per the founder's explicit
instruction).

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` for the whole setback-siting determination
(and everything downstream that depends on knowing where the setback line falls — H1/H2's
applicability, S2-S5's own siting-dependent facts) when the correct Table A branch cannot be
confidently established from available evidence.

**Reviewer type**: none required to reach `SOURCE_VERIFIED` for the rule itself (Tier 1, like L1-L3)
— founder verification only, per BR-7.

### S2 — Garage/parking placement in a street-abutting required setback

**Citation**: 23.44.090.G.1 ("Garages and carports may be located in a setback where parking is
allowed in a setback as provided in subsections 23.44.160.D.4 and 23.44.160.D.5"), plus
23.44.160.C.2, D.4, D.5, H.

**Specification (as read)**: 160.C.2 — street (rather than alley) access to parking is permitted
only if the **Director determines** one of 6 listed conditions exists (no adequately-improved alley;
topography prevents alley access; ≥50% of alley frontage abuts nonresidential zoning; alley access
would create a significant safety hazard; street access is needed for building-code-compliant
parking; alley access would require removing a protected tree). 160.D.4 ("uphill setbacks abutting
streets") and D.5 ("downhill setbacks abutting streets") each require: street access already
permitted under C; a specific measured grade condition (≥6 ft rise, or ≥6 ft drop in the first 10 ft
from the street lot line, measured along specific reference lines); no other parking/driveways on
the lot; a garage-width cap of 24 ft (vs. 20 ft combined width if no garage); and a lot-width
percentage cap (≤60% of lot width in parking/garage). 160.H additionally requires garage entrances
facing the street to sit back ≥20 ft from the street lot line, *except* under D.4/D.5.

**BR-6 triage** (revised — Tier vs. evidence separated): ❌ **discretionary/administrative
determination baked into the rule itself** — 160.C.2's street-access permission is explicitly a
Director determination, one of BR-6's own named Tier-2-forcing criteria; this survives the
"assuming facts were known" test, since even with perfect knowledge of the lot's topography and
alley situation, the rule still requires an actual Director-level judgment call to be exercised —
not a fact this project could ever "look up." The grade-threshold conditions (≥6 ft rise/drop,
measured at specific reference lines) are themselves objective and mechanical once known — a real
evidence gap (this project has never integrated elevation/slope data), not a rule-level ambiguity;
listed under Required facts, not counted as an independent Tier-2 driver. ❌ no `ACTIVE` analog.

**Tier: TIER 2** — on the Director-determination ground alone; the grade/topography data gap is a
separate, additional evidence blocker that would force `REQUIRES_VERIFICATION` even if this
candidate were otherwise Tier 1.

**Required facts**: whether street parking access has been (or would be) Director-approved (not
determinable by this project at all — a case-specific administrative approval, not a mapped GIS
fact — this is the genuine Tier-2 driver, not merely a missing fact); existing lot grade/topography
at specific measured reference lines (elevation/slope data this project has never integrated —
parcel-boundary geometry alone does not supply this — a separate evidence gap).

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION` whenever this pathway might be relevant
(i.e., whenever a garage is proposed within a street-abutting required setback) — **no new
elevation/grade data integration is added in Unit 4** to force a `KNOWN` result here, per explicit
instruction. In practice this pathway is expected to be rare for this product's typical
accessory-garage scenario (it requires a sloped, street-facing setback siting) but is real and must
not be silently ignored when it is proposed.

**Reviewer type**: zoning consultant/planner (for the deterministic-modeling boundary of this
pathway); the Director-determination itself is never something Permit Preflight or a reviewing
consultant can resolve on the applicant's behalf — it stays a real permitting-process step outside
this product's scope, disclosed as such.

### S3 — Garage side setback (was G3)

**Citation**: 23.44.090.G.2, cross-checked against 23.44.090.I.1 (re-fetched and confirmed
unchanged from the prior pass).

**Specification**: a garage/carport may be located in a required side setback abutting another
lot's rear/side setback if **either** (a) detached, and confined to the portion of the side setback
within 40 ft of an alley centerline or within 25 ft of a non-alley rear lot line, **or** (b) a
recorded owners' agreement (King County Recorder's Office) authorizes it. I.1 independently permits
"any accessory structure that is not a dwelling unit" in a side **or** rear setback abutting another
lot's setback via the same recorded-agreement mechanism, without G.2's detached/geometric
alternative — a second, broader statement of the recorded-agreement pathway with no cross-reference
to G.2.

**BR-6 triage** (unchanged from the prior pass): ❌ multiple independent conditional pathways;
❌ path (b)/I.1's recorded-agreement fact is not determinable from any data source this project has
or has ever contemplated integrating.

**Tier: TIER 2.**

**Resolution of the recorded-agreement data gap (founder decision, carried forward unchanged)**: no
King County Recorder/title-record integration is added in Unit 4. If the deterministic geometric
pathway (a) independently establishes the outcome, evaluate it normally. If the outcome depends on
an unknown recorded agreement, the finding is `REQUIRES_VERIFICATION` — an evidence-availability
condition, not a reason to build Recorder integration.

**Reviewer type**: zoning consultant/planner (resolves G.2/I.1's overlap and confirms the geometric
pathway's own boundary conditions).

### S4 — Garage rear setback (was G2)

**Citation**: 23.44.090.G.3, cross-checked against 23.44.090.I.2 (re-fetched and confirmed
unchanged from the prior pass).

**Specification**: G.3 — garages/carports may be in the rear setback if not within 5 ft of the rear
property line (silent on alley exception, height, dwelling-separation). I.2 — enclosed non-dwelling
structures allowed in the rear setback if not within 5 ft of a *non-alley* rear lot line, not more
than 12 ft in height, and separated from a dwelling unit by ≥3 ft eave-to-eave. Neither
cross-references the other.

**BR-6 triage / Tier** (unchanged from the prior pass): **TIER 2** — multiple provisions
independently governing the same fact pattern, no stated precedence (BR-6's own named example).

**Reviewer type**: zoning consultant/planner (resolves G.3/I.2 precedence).

### S5 — Garage-in-setback size and roof-use standards (new this pass)

**Citation**: 23.44.090.G.4.

**Specification**: whenever a garage/carport actually relies on a setback-placement allowance
(S2, S3, or S4), it must additionally: (a) in a **front** setback, stay within 300 sq ft / 14 ft
max width (1 space) or 600 sq ft / 24 ft max width (2 spaces); (b) roof eaves/gutters projecting up
to 2 ft are excluded from those caps; (c) the roof may not be used as a balcony or deck in rear or
side setbacks.

**BR-6 triage** (re-confirmed this pass — Tier vs. evidence separated, distinguished from H1/H2's
now-corrected reasoning): ✅ the numeric caps themselves are simply stated, not ambiguous; ❌
**applicability is conditional on S2, S3, or S4 — each of which is Tier 2 for a genuine rule-level
reason (S2's Director-determination; S3/S4's overlapping provisions), not merely an evidence gap**.
This is a legitimate Tier-2 driver, unlike H1/H2's now-removed dependency on S1 (which is Tier 1) —
S5's applicability genuinely cannot be resolved by evidence alone, since which of S2/S3/S4 governs
(if any) is itself an open interpretation question.

**Tier: TIER 2** — for this applicability-dependency reason only; the underlying numbers are simple
and this candidate would likely resolve quickly once S2/S3/S4 are reviewed.

**Required facts**: which setback-placement pathway (if any) the garage actually relies on; number
of parking spaces served (for the front-setback area/width cap); roof design (for the balcony/deck
restriction).

**Unavailable-fact behavior**: `REQUIRES_VERIFICATION`, inherited from whichever of S2/S3/S4 is the
relevant pathway.

**Reviewer type**: zoning consultant/planner, reviewed together with S2/S3/S4 as one package (same
underlying setback-placement question).

---

## Lot Coverage (L1-L6) — SMC 23.44.080 (all 7 subsections)

Decomposed per the founder's explicit instruction, replacing the prior pass's single flat-50%
model. `LotCoverageFacts` (`domain-entities.md`, revised) is now structured to support an
**applicable allowed-coverage quantity** (percentage × countable area, with the D floor applied),
not a bare percentage.

### L1 — Base maximum lot coverage

**Citation**: 23.44.080.A — *"Except as otherwise provided in this Section 23.44.080, the maximum
lot coverage allowed for structures is 50 percent."*

**Specification**: 50% default, explicitly subject to L5 (F) and L6 (G) potentially raising it to
60%.

**BR-6 triage**: ✅ single unambiguous default; the "except as otherwise provided" cross-reference is
itself explicit and enumerable (L5, L6) — not an unresolved conflict, a clean default/exception
structure.

**Tier: TIER 1** for the default itself. Its final applicability still depends on L5/L6's own
resolution (below) — this is a data-availability dependency (which percentage applies), not a
textual ambiguity in L1 itself.

### L2 — Excluded lot-area categories (denominator), refined by E

**Citation**: 23.44.080.B (4 categories) + 23.44.080.E (defines "designated non-disturbance area in
steep slopes" for B.4 — steep-slope hazard area *except* areas granted relief, a small-project
waiver, or a variance under specific cross-referenced sections).

**Specification**: riparian corridors; wetlands + buffers; submerged lands + shoreline setback area;
designated steep-slope non-disturbance area (narrower than "all steep slope hazard area" per E's
own carve-outs) are excluded from the lot-area denominator.

**BR-6 triage / Tier** (unchanged conclusion from the prior pass, re-confirmed, not re-litigated
here): **TIER 1 on governance grounds** (the categories are enumerated, not ambiguous), but **not
usable today** — `business-rules.md` BR-U4-7's finding stands: no production ECA integration exists
for any of the 4 categories with area-of-overlap precision, and E's own relief/waiver/variance
carve-outs (25.09.090, 25.09.290) are administrative determinations this project cannot query
per-parcel either. `countableLotAreaSqFt` is `undefined` (→ `REQUIRES_VERIFICATION`) unless the
system has confident evidence no exclusion category applies at all.

### L3 — Numerator exclusions (structures/portions not counted)

**Citation**: 23.44.080.C (6 items).

**Specification**: not counted toward the coverage numerator — underground structures (C.1); the
first 36" of architectural projections, eaves/cornices/gutters/roofs/fireplaces/chimneys (C.2);
decks ≤36" above grade (C.3); unenclosed porches/steps ≤4 ft above grade (C.4); unenclosed
structures meeting 23.44.090.H's standards (C.5); Type A dwelling-unit square footage in
≤10-stacked-unit structures (C.6, multifamily-specific — not applicable to a garage or a typical
accessory-garage host lot's own coverage calculation, noted for completeness only).

**Applicability to a garage's own footprint**: C.2 (eave-overhang exclusion) is the one most likely
to matter for a garage's own countable footprint — matches S5's identical eave/gutter exclusion
already modeled for setback-area caps, a real internal-consistency data point corroborating the
citation is being read correctly.

**Applicability to the existing-structures numerator (Correction 2, this pass)**: the same C.1-C.5
exclusions apply to *any* existing structure counted toward the combined lot-coverage figure, not
just the proposed garage. This means the USER_SUPPLIED `existingStructuresFootprintSqFt` figure
(`business-rules.md` BR-U4-3) is not simply "gross footprint of every existing structure" — it
should represent the **countable** existing-structure area under C's exclusions. See
`business-rules.md` BR-U4-3 (revised) for the corrected numerator semantics.

**BR-6 triage**: ✅ exhaustively enumerated, not ambiguous.

**Tier: TIER 1.**

### L4 — Minimum lot coverage floor

**Citation**: 23.44.080.D — *"The lot coverage allowed on lots containing areas listed in
subsection 23.44.080.B shall not be less than 625 square feet or an amount of lot coverage approved
by the Director through an environmentally critical area reduction, waiver, or modification pursuant
to Chapter 25.09, whichever is greater."*

**Specification**: a floor protecting a B-constrained lot from an unreasonably small buildable
allowance — the applicable allowed coverage is `MAX(computed percentage × countable area, 625 sq
ft OR a greater Director-approved amount)`, but only on a lot that actually contains a B-category
area at all.

**BR-6 triage** (revised — Tier vs. evidence separated): ✅ the 625 sq ft statutory number itself is
unambiguous; ❌ **discretionary/administrative determination baked into the rule's own text** — "an
amount... approved by the Director" is exactly BR-6's own named Tier-2-forcing criterion, and this
survives the "assuming facts were known" test: even if we somehow knew with certainty that a
B-category area exists on the lot, the rule's own "whichever is greater" structure still requires
knowing about a specific, individualized Director approval — not a fact obtainable by better data
integration, a genuinely open-ended provision. Whether a B-category area exists on the lot **at
all** is a separate matter, governed entirely by L2 (Tier 1 governance + evidence-gated) — not an
independent Tier-2 driver for L4 itself.

**Tier: TIER 2** — solely on the Director-determination ground, which is a property of the rule's
own text, not of missing data.

**Unavailable-fact behavior**: never assume a Director-approved amount exists or its value —
`REQUIRES_VERIFICATION` whenever L2 indicates (or cannot rule out) a B-category area on the lot
(inherited from L2's own evidence gate) **and, independently, even when L2 confirms a B-category
area is present**, since the possibility of an unverifiable greater Director-approved amount can
never be ruled out (see `domain-entities.md`'s revised `MinimumCoverageFloor` status model).

**Reviewer type**: zoning consultant/planner (confirms the floor's applicability and interaction
with L2, and whether any documented Director-approval process is realistically ever knowable to
this product).

### L5 — Frequent-transit-area multi-unit 60% provision

**Citation**: 23.44.080.F.

**Specification**: 60% (instead of 50%) for development "consisting entirely of dwelling units" in
structures <3 stories, arranged on up to 3 sides of a shared ground-level amenity area ≥20% of lot
area with usable contiguous green space/trees, within a frequent-transit-service area.

**Applicability determination (explicit, not assumed either way, per instruction)**: F's trigger is
about the **lot's principal development**, not the garage itself (a garage is never itself
"development consisting entirely of dwelling units"). It is a real, in-scope applicability question
for a lot whose principal development independently qualifies (e.g., a qualifying small multi-unit
development adding an accessory garage) — plausible but expected to be uncommon for this product's
typical single-family-accessory-garage use case. **Not excluded by fiat.**

**Re-triaged this pass — Tier vs. evidence separated. Applying the founder's own test ("assuming the
necessary facts were reliably known, is this rule's meaning and applicability itself sufficiently
unambiguous"): mostly yes, but one specific, genuine interpretation question survives even with
perfect facts.** F's own condition list (story count, structure arrangement, amenity-area sizing,
transit-area status) is complex but explicit — multi-part conditions alone, per the founder's
instruction, do not force Tier 2. **The genuine ambiguity**: F's trigger is "development consisting
entirely of dwelling units" — but a lot with a detached garage necessarily also has a non-dwelling
accessory structure on it. Read literally and lot-wide, "entirely of dwelling units" could never be
satisfied by any lot that also has an accessory garage, which would make F self-defeating for
exactly the scenario this candidate needs to evaluate (F's own purpose is to set the *lot's* overall
structure-coverage percentage, implicitly covering whatever accessory structures exist). Whether
"development" in F's clause scopes to the qualifying residential building/complex specifically
(garage excluded from that scoping) or to everything built on the lot (garage included, defeating
F's own applicability) is genuine, real ambiguous text — not resolvable by more data, only by
professional interpretation. This is the actual Tier-2 driver, not F's multi-part condition
structure or its missing transit-area data source.

**Real, separate data gap (evidence, not the Tier driver)**: "frequent transit service area" is an
external, defined geographic concept (tied to King County Metro/Sound Transit service frequency) —
Permit Preflight has never integrated a transit-frequency GIS layer. Per the founder's explicit
instruction, **no new data integration is added in Unit 4** to resolve this; F's applicability is
modeled as an intake-assertable fact that defaults to **not established** — never silently assumed
either included or excluded. This gap would force `REQUIRES_VERIFICATION` even if F's "development...
entirely of dwelling units" scoping question were resolved by review.

**BR-6 triage**: ❌ **genuine interpretation ambiguity in F's own "entirely of dwelling units"
scoping**, surviving the assuming-facts-were-known test; ❌ no `ACTIVE` analog.

**Tier: TIER 2** — for the scoping ambiguity specifically, not for F's condition complexity or its
missing data source (both are real, but are evidence/complexity matters, not independent Tier-2
drivers under this project's own model).

**Unavailable-fact behavior**: when F's applicability is not established (either because the
scoping question is unreviewed, or because transit-area status is unknown), the *overall* applicable
percentage (L1 vs. L5 vs. L6) is itself unresolved — `LotCoverageFacts`'s revised
`applicableCoveragePercentage` result stays in its `REQUIRES_VERIFICATION` state
(`domain-entities.md`), and the combined lot-coverage finding is `REQUIRES_VERIFICATION` for that
reason alone, independent of L2/L3/L4's own conditions.

**Reviewer type**: zoning consultant/planner (resolves F's "entirely of dwelling units" scoping
question).

### L6 — Stacked-dwelling-units 60% provision

**Citation**: 23.44.080.G — *"The maximum lot coverage allowed on lots with stacked dwelling units
is 60 percent."*

**Specification**: simpler trigger than L5 — a single binary fact (does the lot have stacked
dwelling units, a term also used in 23.44.070.A.2 and defined by its ordinary NR-zone usage).

**Applicability determination (explicit, per instruction)**: real and in-scope — WA's Middle Housing
legislation means NR-zone lots may now genuinely have stacked multi-unit housing, and such a lot's
owner could plausibly want an accessory garage. **Not excluded by fiat**, and more directly
self-reportable than L5 (no external GIS fact needed).

**Re-triaged this pass — Tier vs. evidence separated. Applying the founder's own test**: G's own
text is a single, bright-line trigger ("lots with stacked dwelling units") to a single percentage
(60%), with no discretionary approval, no cross-referenced conflict, and no multi-part conditional
structure (unlike L5) found in the text actually read this pass. The round-2 draft classified this
Tier 2 on the grounds that "a lay user might misclassify" stacked vs. attached dwelling units and
that no `ACTIVE` analog exists — **both explicitly identified by the founder as evidence-quality
concerns, not Tier-2 legal-review grounds, absent a genuine textual ambiguity actually cited.** This
pass (per the explicit "do not perform another SMC research pass" instruction) did not fetch and
does not cite a specific definitional ambiguity for "stacked dwelling units" itself — without a
cited textual basis for doubt, the honest classification under this project's own model is Tier 1,
not a default-to-Tier-2 guess.

**BR-6 triage** (revised): ✅ single unambiguous trigger and percentage, no discretionary
determination, no conflicting cross-reference, no multi-part conditional structure, and no cited
ambiguity in the term itself from the text actually read this pass.

**Tier: TIER 1 (governance)** — reclassified this pass from the round-2 draft's Tier 2. If a future
professional review identifies a genuine "stacked" vs. "attached"/"detached" classification
ambiguity this research pass didn't have the expertise to find, that would be new information
justifying reopening this classification — not assumed here.

**Required facts**: whether the lot has stacked dwelling units — a direct, self-reportable intake
fact (similar in kind to `alleyAdjacent`), with real risk of an applicant's own misclassification
(an evidence-quality concern, per the founder's framing).

**Unavailable-fact behavior**: when not established (unanswered, or answered with low confidence),
`LotCoverageFacts`'s revised `applicableCoveragePercentage` result stays in its
`REQUIRES_VERIFICATION` state, forcing `REQUIRES_VERIFICATION` for the combined finding — same
practical effect as before, now correctly attributed to evidence unavailability rather than rule
ambiguity.

**Reviewer type**: none required to reach `SOURCE_VERIFIED` for the rule itself (Tier 1) — founder
verification only, per BR-7.

---

## Professional Review — Committed, Explicitly Deferred to Post-POC (carried forward unchanged)

**This section's substance is unchanged from the prior review round — restated here, not
revisited, per the founder's explicit "do not revisit that decision" instruction.** The professional
review described below will happen, but not during Unit 4 Construction and not per-unit — it
becomes one post-POC batch engagement across all project types built during the POC (see
`aidlc-state.md`'s "Regulatory Professional Review / Commercialization Gate" milestone for the full
expected sequence). This inventory's job right now is to be complete and precise enough that the
future reviewer can review the actual candidate package directly, without first having to
rediscover or re-derive it from the garage code.

**Reviewer type**: a Seattle land-use/zoning consultant or planner, engaged as a single bounded
package. **Escalation**: a land-use attorney only if the zoning professional determines a specific
issue cannot be resolved within normal professional zoning interpretation (candidates most likely to
need this: H1's A.3.a/B general-vs-specific conflict; S3/S4's overlapping-provision precedence;
S2's Director-determination boundary).

**Required durable review-record fields** (per rule reviewed, unchanged): citation reviewed,
reviewer's interpretation, applicability/exception handling, unresolved caveats, reviewer identity,
review date, professional opinion — persisted via BR-8's existing mechanism.

Founder source verification/approval (`SOURCE_VERIFIED`) remains a separate, later checkpoint after
the (post-POC) review lands. **No Tier-2 candidate below becomes `ACTIVE` before that review
occurs.** Unit 4 Construction being marked complete does **not** require this review to have
occurred (`business-rules.md` BR-U4-4) — it requires the deterministic machinery, tests, and this
review-ready inventory to exist.

## Summary — Recomputed Candidate Count and Tier Distribution (Tier vs. evidence now separated)

| Candidate | Constraint | Citation | Tier | Genuine rule-level driver (if Tier 2) | Separate evidence gap |
|---|---|---|---|---|---|
| H1 | Height, in required setback | 23.44.070.A.3 + B | **2** | A.3.a/B roof-bonus conflict | Setback siting (from S1) |
| H2 | Height, outside required setbacks | 23.44.070.A.1/A.2 + B | **2** | A.2.d scoping ambiguity | Setback siting (from S1) |
| S1 | Setback baseline dimensions | 23.44.090 Table A | **1 (governance)** | — | Dwelling-unit count; transit-area status |
| S2 | Garage in street-abutting setback | 23.44.090.G.1 + 23.44.160.C/D.4/D.5 | **2** | 160.C.2 Director determination | Grade/topography data |
| S3 | Side setback | 23.44.090.G.2 + I.1 | **2** | G.2/I.1 overlapping provisions | Recorded-agreement fact (I.1(b)) |
| S4 | Rear setback | 23.44.090.G.3 + I.2 | **2** | G.3/I.2 overlapping provisions | — |
| S5 | Garage-in-setback size/roof-use caps | 23.44.090.G.4 | **2** | Depends on S2/S3/S4's own ambiguity | Which pathway applies |
| L1 | Lot coverage base 50% | 23.44.080.A | **1** | — | — |
| L2 | Excluded lot-area categories | 23.44.080.B + E | **1 (governance)** | — | No area-of-overlap ECA capability |
| L3 | Numerator exclusions | 23.44.080.C | **1** | — | — |
| L4 | Minimum coverage floor | 23.44.080.D | **2** | Director-approved-amount possibility | Whether L2's B-area exists |
| L5 | Frequent-transit 60% bonus | 23.44.080.F | **2** | "Entirely of dwelling units" scoping vs. a garage's presence | Transit-area status |
| L6 | Stacked-dwelling-units 60% bonus | 23.44.080.G | **1 (governance)** | — | Self-reported classification |

**8 of 13 (62%) Tier 2** — H1, H2, S2, S3, S4, S5, L4, L5. **5 of 13 (38%) Tier 1** — S1, L1, L2,
L3, L6 (3 of these — L2's governance classification and L1/L3 — carry no Tier-2 status at all; S1
and L6 are newly reclassified this pass). This is a real, one-time recomputation — the prior round's
9/13 (69%) figure conflated evidence gaps with rule tier and is superseded, not merely arithmetic-
corrected. **Not forced to match Unit 0B's earlier 80% sample** — this inventory is authoritative
for Unit 4 on its own terms, per explicit instruction.

Setback and height still have **no Tier-1 candidate** (S1's reclassification is governance-only —
its own evidence gap still blocks full usability, and H1/H2's height determinations still ultimately
depend on knowing where the setback line falls). Lot coverage now has 3 Tier-1 candidates (L1, L2
governance, L3) plus 2 newly-Tier-1 (S1's setback baseline isn't a lot-coverage candidate, but L6
is) against 2 genuine Tier-2 drivers (L4, L5) — a real mix, not "mostly blocked" the way setback/
height are.

**Explicit corrections to stale claims (Correction 7, reaffirmed)**:
- L1 is **not** a universal flat-50% rule — it is a default, conditionally overridden by L5/L6 to
  60%, and floored by L4 at a minimum of 625 sq ft (or more, if a Director approval exists that this
  project cannot verify) on any B-constrained lot.
- This inventory (H1, H2, S1-S5, L1-L6) is **not** claimed to be the complete, final SRE-GARAGE-1
  rule set — only the complete set this specific research pass, reading SMC 23.44.070/.080/.090/
  .160 in full, established. A future professional review may still find something this pass missed.
- Existing ECA integration does **not** supply all four 23.44.080.B exclusion categories or their
  measurable areas — `business-rules.md` BR-U4-7's finding (no production ECA adapter wired in; even
  `steep_slope`, the one hazard type with any prior design work, supports only proximity/
  intersection facts, not area-of-overlap) stands unchanged and is not contradicted by anything in
  this revised inventory.
- **Tier does not equal usability** — S1 and L6 being Tier 1 does not mean either produces a `KNOWN`
  finding today; both remain fully gated by real, currently-unresolved per-parcel evidence
  (dwelling-unit count/transit-area status for S1; the self-reported stacked-dwelling-units fact for
  L6). BR-4's `REQUIRES_VERIFICATION` classification, not Tier status, is what actually governs
  whether a given parcel's finding can be trusted.

**Scope discipline (Correction 5)**: this pass stayed within SRE-GARAGE-1's 3 named constraint types
(setback, height, lot coverage) and the cross-references needed to decide them (23.44.160.C/D for
S2; 23.44.090.I for S3/S4). It deliberately did **not** research 23.44.090.H (unenclosed structures
— not applicable to an enclosed garage beyond C.5/S5's narrow cross-references already captured),
23.44.090.J/K (additions to existing nonconforming dwellings; tree-protection setback extensions —
not applicable to a new accessory garage), or 23.44.100 (separations between structures — a distinct
4th constraint category, out of scope per explicit instruction).
