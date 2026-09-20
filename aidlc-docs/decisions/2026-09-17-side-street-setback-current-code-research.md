# Regulatory Research Correction — Side-Street Lot Line Setback Depth (SMC 23.44.090)

**2026-09-17. Founder-directed current-code source-verification pass, following founder rejection
of the prior SIDE_STREET REQUIRES_VERIFICATION treatment as "not accepted yet."** Recorded here per
the founder's own explicit instruction to update the regulatory research artifact, establish the
appropriate rule tier, and record the citations this correction relies on.

## The question

The prior maintenance correction (2026-09-15/16, see `aidlc-state.md`'s SIDE_STREET Classification
entry) captured whether a customer's parcel has street frontage on more than one side, but
deliberately left every confirmed street-frontage edge as REQUIRES_VERIFICATION, since the
applicable Seattle side-street setback figure for accessory structures had not yet been
source-verified. The founder directed a focused CURRENT-CODE research pass to resolve this,
explicitly excluding generic web summaries, superseded pre-Ordinance-127376 code, and old SDCI Tips
as controlling authority.

## Sources consulted (current, authoritative)

1. **SMC 23.44.090 ("Setbacks")** — full current text, Municode Library, **version JUL 15, 2026
   (CURRENT)**, `https://library.municode.com/wa/seattle/codes/municipal_code?nodeId=TIT23LAUSCO_SUBTITLE_IIILAUSRE_CH23.44NERE_23.44.090SE`.
   Every subsection cites `(Ord. 127376, § 31, 2025.)`.
2. **SMC 23.84A.036 ("S")** — definitions chapter, same current Municode version, citing
   `(Ord. 127376, § 82, 2025...)`.
3. **Current SDCI "Sheds" guidance page** — `https://www.seattle.gov/sdci/permits/common-projects/sheds`
   (fetched live, 2026-09-17).

## Findings

**Table A for 23.44.090** has exactly three setback categories: **Front**, **Rear**, **Side**.
There is no fourth "side street" row, and no separate numeric depth for it anywhere in the current
setback table.

- Front: 15 ft (1-2 dwelling units) / 10 ft (3+ units).
- Rear: 15 ft (1-2 units, not alley-abutting) / 10 ft (3+ units, not alley-abutting) / 5 ft (under
  5,000 sq ft, frequent-transit-service area) / 0 ft (alley-abutting).
- Side: 3 ft (under 5,000 sq ft, frequent-transit-service area) / 5 ft average, 3 ft minimum (all
  other lots).

**SMC 23.84A.036's current definitions** confirm a "side street lot line" is structurally a
**subset** of "side lot line," not a separate category:
> `"Lot line, side"` means any lot line other than a front lot line or a rear lot line.
> `"Lot line, side street"` means a lot line, other than the front lot line, abutting upon a street.
> `"Lot line, street"` means a front lot line or a side street lot line.

**The one provision that reclassifies a street-abutting line at all** is 23.44.090.B: *"Through
lots. In the case of a through lot, each setback abutting a street, shall be a front setback."* A
**"through lot"** is separately defined (23.84A) as *"a lot abutting on two (2) streets that are
parallel or within fifteen (15) degrees of parallel with each other"* — i.e. **opposite** street
frontage, structurally distinct from a **corner lot** (adjacent, non-parallel streets). This
provision does not apply to a corner lot's second, adjacent street frontage.

**The historical 10-ft "reversed corner lot" setback**: the *definition* of `"Lot, reversed corner"`
still survives in current 23.84A.036 (*"a corner lot, the side street lot line of which is
substantially a continuation of the front lot line of the lot to its rear..."*), but **is never
referenced anywhere in the current 23.44.090 setback table** (confirmed by reading the section's
full A-K text). Ordinance 127376's 2025 rewrite of the NR zone evidently dropped the setback-depth
consequence of this definition, even though the definition itself was retained (likely still used
elsewhere in Title 23, out of scope for this correction). The only place "street side setback" is
still treated distinctly in current 23.44.090 is a **fence height** rule (23.44.090.H.4.a) —
unrelated to accessory-structure setback depth.

**No current provision imposes a different required depth on an accessory structure (shed/garage)
specifically because its side lot line abuts a street.** Subsections G (garages/carports), H
(unenclosed structures), and I (other enclosed structures) never reference "street" or "side
street" for depth purposes.

**One real, disclosed distinction that does NOT affect this tool's current evaluation**: 23.44.090.I.1
allows a non-dwelling accessory structure to be built *inside* a side or rear setback via a recorded
neighbor agreement — but only when the setback *"abuts the rear or side setback of another lot,"*
which a street-facing lot line can never satisfy (a street is not "another lot"). Since this
evaluator does not model that encroachment exception either way (it only checks whether the measured
distance meets the minimum), this distinction has no effect on today's PASS/FAIL computation — noted
here so a future feature that *does* model the encroachment exception does not incorrectly grant it
to a confirmed street-frontage edge.

**Current SDCI shed guidance corroborates this**: the live "Sheds" page names only "front property
line" and "side property lines," with no corner-lot carve-out, consistent with the Table A finding
above (SDCI's own guidance flags that its documents may lag recent Ordinance 127376 changes, but
this specific point is consistent with, not contradicted by, the current code text).

## Rule tier and disposition

> **SUPERSEDED by the Addendum below (2026-09-17, later same day).** The paragraph immediately
> following this notice reflects this correction's ORIGINAL, now-superseded disposition, kept here
> only for its historical record of the Tier-1 rule-tier reasoning (which itself remains correct and
> is NOT what the Addendum changes). It no longer describes `computeSetbackDistances`' actual
> behavior - see the Addendum's "Rule tier note" for the current, controlling disposition: a
> confirmed street-frontage edge whose role is not yet ESTABLISHED (through-lot vs.
> Director-determined corner-lot front vs. ordinary side-street) is excluded from the confident side
> minimum and stays REQUIRES_VERIFICATION, never unconditionally folded in.

**Deterministic. Tier 1** (rule-tier reasoning only - see the superseding notice above for why this
no longer describes the actual computation). A confirmed street-frontage edge is subject to the
**same** side-setback standard (`SIDE_FRONT_SETBACK_STANDARD`'s existing `sideMinFt`) as an ordinary
side edge, ONCE its role is established as ordinary SIDE_STREET — current code draws no distinction
for accessory-structure setback depth between the two. ~~The prior REQUIRES_VERIFICATION treatment
is removed: `computeSetbackDistances` now folds every side-candidate edge — ordinary and confirmed
street-frontage alike — into a single minimum-distance computation, unconditionally, regardless of
`multipleFrontageAnswer`.~~ *(superseded - see Addendum)*. The standalone per-edge "Side-street
setback (line N of M)" findings (`evaluate.ts`'s `evaluateStreetFrontageEdges`) remain removed; a
confirmed street-frontage edge whose role IS established now participates in the existing single
"Side Setback" finding, but the Addendum's "(additional street frontage)" grouped finding covers
every edge whose role is NOT yet established.

**Retained, unchanged**: the `MultipleFrontageAnswer`/`streetFrontageEdgeRefs` domain model, the
tri-state UI question, and the per-edge `sideEdgeDistancesFt` evidence map — this classification
data remains valuable for provenance and any future rule that might need the distinction (e.g. the
encroachment-exception nuance above, or a not-yet-researched use of the surviving "reversed corner
lot" definition elsewhere in Title 23).

## Addendum (2026-09-17, later same day) — through-lot / Director-determination correction

The founder identified two further current-code facts this research pass had not yet accounted
for, and directed a follow-up correction after an initial implementation was escalated by
`aidlc-reviewer.review_gate` (decision `53f30444-b566-4197-b0dd-e2aff768fa65`) for treating
parcel-edge azimuth as conclusive proof of a through lot. The founder's own disposition on that
escalation is recorded verbatim below, since it is now the controlling interpretation.

### Source-verified: front lot-line determination (SMC 23.84A.024)

**Current Seattle Municipal Code, SMC 23.84A.024, definition of "Lot line, front"** (current
Municode text; Ordinance 127376 material). In substance:

- a single-street lot's street-abutting line is the front lot line;
- a **through lot** (23.84A's own definition: two streets parallel or within 15 degrees of
  parallel) has its lot lines associated with those two streets both treated as front lines
  (consistent with 23.44.090.B's setback-table consequence, already documented above);
- a lot with frontage on more than one street **other than a through lot** (i.e. a genuine corner
  lot) has its front lot line **determined by the Director**, based on the existing pattern of lots
  and buildings on the block.

This confirms that on a non-through multi-street lot, a customer's own selected front edge cannot
by itself be represented as the official code-determined front lot line - it is useful property
evidence / the customer's proposed orientation, never authoritative regulatory proof on its own.

### Founder correction: parcel-edge azimuth is NOT proof of a through lot

The initial implementation of this correction computed the real PostGIS azimuth of a confirmed
street-frontage edge and the customer's own front edge, and treated an angle within 15 degrees as
**conclusive** evidence of a through lot - folding that edge's distance directly into a confident,
PASS/FAIL-producing front-setback minimum. The founder rejected this:

> "The current Seattle definition is based on the relationship between the STREETS, not the azimuth
> of arbitrary parcel-boundary segments. The live tessellated/curved-frontage result demonstrates
> why this distinction matters: two nearby fragments of one curved street frontage can be locally
> near-parallel and falsely satisfy the numeric test."

Live verification against the founder's own real, previously-rejected parcel (King County PIN
7831800315) confirmed this exactly: the parcel-boundary edge immediately adjacent to the customer's
selected front edge, on a tessellated/rounded street corner, measured **0.011 degrees** from
parallel to the front edge - a near-perfect false positive that is part of the SAME curved frontage,
not a second street at all.

**Disposition, until real street-geometry evidence is available** (the founder's own framing):

- multi-street geometry distances remain **KNOWN** (every confirmed-street edge's real PostGIS
  distance is preserved, never dropped);
- user-confirmed street frontage remains recorded (`streetFrontageEdgeRefs`, `rearAlsoFacesStreet`);
- through-lot classification is **POSSIBLE / unresolved** - never conclusively determined from
  parcel-boundary geometry alone;
- any setback conclusion whose rule depends on conclusively determining through-lot vs. corner-lot
  status is **REQUIRES_VERIFICATION**;
- unrelated setback conclusions (ordinary front/rear/side geometry not implicated by a confirmed
  street-frontage edge) are never degraded as a side effect.

Parcel-edge azimuth is retained ONLY as a **non-authoritative diagnostic heuristic** (`possibleThroughLot`
in `StreetFrontageHeuristic`, `src/spatial-analysis/postgis-adapter.ts`) - it never establishes legal
role and never by itself produces a PASS/FAIL conclusion. Full raw traceability (both edges' azimuths,
the normalized angular difference, the resulting non-authoritative label) is persisted in the
grouped "(additional street frontage)" finding's `supportingEvidence`, explicitly marked
`evidenceQuality: "INFERRED"`.

### NOT_SURE corrected to fail closed

A defect surfaced in the same review: the tri-state "does this property have street frontage on
more than one side" answer of NOT_SURE was, before this correction, behaving identically to NO
(every side-candidate edge confidently treated as ordinary side, and front/rear resolved normally).
Per founder direction, NOT_SURE now makes the front, rear, AND ordinary-side role-dependent
conclusions REQUIRES_VERIFICATION (via `frontRoleEvidenceGapReason`/`rearRoleEvidenceGapReason`/
`sideRoleEvidenceGapReason` on `ProjectDetails`) - every underlying distance stays a KNOWN
measurement, cited in the finding text, but no confident PASS/FAIL is asserted while the customer's
own uncertainty about additional street frontage remains unresolved. This is intentionally different
from YES, where only the SPECIFICALLY confirmed street-facing edge(s) become unresolved and every
other side edge stays confidently ordinary (the customer affirmatively did not mark it).

### Rule tier note (unchanged)

The Tier-1 disposition for an edge WHOSE ROLE IS ALREADY ESTABLISHED as ordinary SIDE_STREET
(never disputed, never through-lot, never corner-lot-ambiguous) remains exactly as approved above:
subject to the same side-setback standard as an ordinary side line, per current SMC 23.44.090 Table
A / 23.84A.036. This addendum only concerns HOW an edge's role gets established in the first
place - it does not reopen or weaken the underlying Tier-1 rule itself.

## Genuinely open item (not blocking this correction)

Separately from SIDE_STREET: this research surfaced that `SideFrontSetbackRuleSpec` has always
carried a `sideAverageFt` field, but `evaluateSideFrontSetback` has **never** actually evaluated it
— only the 3 ft absolute minimum is checked, never the "5 ft average" component of Table A's Side
row. The only current-code text found describing an averaging *methodology* (`SMC 23.86.012.B`,
"Setback averaging") is explicitly scoped to **multifamily and commercial zones**, not Neighborhood
Residential — leaving how the NR "5 ft average" figure should actually be computed for an irregular
lot/multiple side-line segments a genuinely open question, not resolved by this research pass. This
is a **pre-existing gap** (predates this correction, affects ordinary side edges exactly as much as
street-frontage ones) and is disclosed here rather than silently fixed — it is out of scope for this
SIDE_STREET-specific correction and awaits its own dedicated research/decision.
