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

## Addendum (2026-09-23) — Unit 6B Capability B: P2b "required setback" bounded research check

**Founder-directed, 2026-09-23**, in response to a Capability B (shed permit determination) code
generation plan whose §2 proposed leaving `isInRequiredSetback` (P2b's accessory-structure
height-limit input) permanently `undefined`, reasoning that Unit 1's existing `REAR_SETBACK`/
`SIDE_FRONT_SETBACK_STANDARD` rule specs represent a different figure than SMC 23.44.070's
"required setback" reference, and that the correct general figure was unsourced. The founder
directed a bounded current-code research check — specifically flagging that the plan's reference
to superseded "SMC 23.44.014" should be checked against current SMC 23.44.070/23.44.090 — before
accepting or rejecting that premise.

**Sources consulted (current, authoritative, fetched live 2026-09-23)**:
1. **SMC 23.44.070 ("Structure height")** — full current text, Municode Library,
   `https://library.municode.com/wa/seattle/codes/municipal_code?nodeId=TIT23LAUSCO_SUBTITLE_IIILAUSRE_CH23.44NERE_23.44.070STHELI`
   (chapter-level fetch; section confirmed present verbatim). Cites `(Ord. 127376, § 31, 2025.)`.
2. **SMC 23.44.090 ("Setbacks")** — full current text (subsections A–K), same fetch, same
   ordinance citation. Table A and every subsection reconfirmed, superseding the prior 2026-09-17
   pass's partial reading (that pass only quoted Table A and the through-lot/definitions context;
   this pass reads subsections D–K in full for the first time).

**The current Chapter 23.44 section sequence is .010/.020/.030/.040/.050/.060/.070/.080/.090/
.100/... — there is no "23.44.014" anywhere in the current chapter.** The original Unit 1
citation ("rear setback = 5 ft in this zone," `aidlc-docs/inception/requirements/research-findings.md`
line 53) predates Ordinance 127376's 2025 renumbering/rewrite and is confirmed **superseded** —
current law expresses these same figures through 23.44.090 (and, for the REAR figure specifically,
through 23.44.090.I.2, not Table A's general row — see below). This is a citation-currency
correction to the research record, not a change to any numeric threshold this tool already
enforces.

### Answering the founder's six questions

**Q1 — Does current 23.44.070 make the 12-ft limit depend on whether the structure is in a
"required setback" established under current 23.44.090? YES, verbatim**:

> 23.44.070.A.3: "The height limit for accessory structures that are located in required setbacks
> is 12 feet, except as follows: [roof exceptions in .a/.b]."

23.44.070 does not cite a section number for "required setbacks," but 23.44.090 ("Setbacks") is
the only section in Chapter 23.44 that defines required setbacks at all (23.44.080 is lot
coverage; 23.44.100 is inter-structure separation, a distinct concept) — unambiguous.

**Q2 — Are the required-setback boundaries derivable from current Table A for 23.44.090, not
superseded 23.44.014? YES, for FRONT and SIDE — with one real, previously-undisclosed nuance for
REAR**, found by reading subsections D–K in full (not done in the 2026-09-17 pass):

Subsection **I.2** ("Other enclosed structures allowed in setbacks") is the specific provision
that lets a non-dwelling accessory structure (a shed) be built **inside** the required rear
setback at all: *"Enclosed structures that are not dwelling units are allowed in the rear setback
provided that: (a) They are not located within 5 feet of a rear lot line that is not an alley lot
line; (b) They are not more than 12 feet in height; and (c) They are separated from a dwelling
unit by at least 3 feet, eave to eave."* **This is where this codebase's existing ACTIVE
`REAR_SETBACK` rule's numbers (`minFt: 5`, `minFtIfAlleyAdjacent: 0`) actually come from** — not
Table A's general Rear row (15 ft for 1-2 units / 10 ft for 3+ units, non-alley). Table A's Rear
row and subsection I.2's 5-ft figure are two **different** numbers for two different questions:
Table A's row is the boundary of the required-setback zone itself (the thing 23.44.070.A.3's
height provision cares about); subsection I.2's 5-ft figure is how close an enclosed accessory
structure may sit to the rear lot line, a *smaller* distance specifically because I.2 is an
exception letting the shed sit *inside* that same required-setback zone. **A shed satisfying this
codebase's existing rear-setback check (≥5 ft from a non-alley rear line) is, by the very
structure of subsection I.2, almost always still located inside the Table-A-defined required rear
setback** (since I.2 exists precisely to permit that placement) **unless** the shed is far enough
back to clear Table A's own larger boundary (15 ft / 10 ft / 5 ft depending on unit count and
FTSA) — a real, previously-undisclosed distinction between "meets the shed's own required
distance from the line" and "is outside the required-setback zone entirely."

By contrast, **FRONT and SIDE have no equivalent accessory-specific reduced-distance exception**
in subsections D–K for an ordinary shed (subsection G's front-setback allowance is
garage/carport-specific, with its own area/width limits, not a general shed exception; sheds are
not addressed for the front setback at all, meaning a shed must meet the *same* front setback as
a primary structure). This codebase's existing ACTIVE `SIDE_FRONT_SETBACK_STANDARD` rule
(`frontFt: 15`, `sideAverageFt: 5`, `sideMinFt: 3`) **already matches Table A's general Front (1-2
unit) and Side ("all other lots") rows exactly** — confirmed by direct comparison, not assumed.
So for FRONT and SIDE, this codebase's existing distance-vs-threshold comparison **is already the
same comparison 23.44.070.A.3's "required setback" needs** — no separate/different figure exists.

**Q3 — What property facts determine the applicable front/rear/side setback for a normal shed
parcel?**
- **Front**: dwelling-unit count on the lot (1–2 units → 15 ft; 3+ units, or any nonresidential
  structure per Table A's footnote 1, → 10 ft). A Queen Anne Boulevard frontage exception exists
  (footnote 2) — not relevant to an ordinary parcel, not modeled, not blocking.
- **Rear**: dwelling-unit count (1–2 units, non-alley → 15 ft; 3+ units, non-alley → 10 ft),
  **and** lot area + frequent-transit-service-area (FTSA) status jointly (<5,000 sq ft **and**
  within an FTSA → 5 ft, overriding the unit-count rows), **and** alley adjacency (abutting an
  alley → 0 ft, i.e. no rear setback required at all).
- **Side**: lot area + FTSA status jointly (<5,000 sq ft **and** within an FTSA → 3 ft flat; every
  other lot → 5 ft average / 3 ft minimum).

**Q4 — Which facts do we already have?** Verified by direct grep, not assumed:
- `alleyAdjacent` — **YES**, already collected (`dimensions.alleyAdjacent`, already feeds the
  existing `REAR_SETBACK` rule).
- Lot area — **YES**, already computed (`computeParcelAreaSqFt`/`rawParcelAreaSqFt`, already used
  for garage lot coverage).
- Front/rear/side lot-line roles, and through-lot/multi-street unresolved-role conditions —
  **YES**, already fully resolved by this session's own prior correction
  (`distanceToFrontLotLineFt`/`distanceToRearLotLineFt`/`distanceToSideLotLineFt`,
  `frontRoleEvidenceGapReason`/`rearRoleEvidenceGapReason`/`sideRoleEvidenceGapReason`,
  `unresolvedStreetFrontageDistancesFt`).

**Q5 — Which facts are genuinely missing?** Verified absent by direct grep across `src`/`app`,
not assumed:
- **Dwelling-unit count on the existing lot.** No such fact exists anywhere in Property
  Intelligence or the shed/garage screening-request schema today (`vacant-land-density.ts`'s
  dwelling-unit concept is for a *proposed new* Vacant Land development, a structurally different
  question — not reusable here).
- **Frequent-transit-service-area (FTSA) status.** Confirmed genuinely absent — this codebase's
  own existing code already discloses this gap in a different context:
  `pipeline.ts`'s Unit 5 lot-coverage narration states verbatim *"no transit-service-area data
  source is integrated"* (line ~838), and `evaluate-vacant-land.ts`'s `TRANSIT_BONUS` scenario
  exists only as a named, not-yet-data-backed scenario. No adapter, fact, or GIS integration for
  FTSA exists anywhere in this codebase for any unit.

**Q6 — Can `isInRequiredSetback` be computed deterministically for a meaningful subset of
properties now? Proposed: YES, via a bounded-band technique — not yet implemented, presented here
for founder confirmation before any code is written**, per the founder's explicit "do not
implement yet" instruction:

For each of front/rear/side independently, Table A's *possible* thresholds (given the genuinely
missing unit-count/FTSA facts) form a small, fully-enumerable set per boundary type:
- Front: {10, 15} ft.
- Rear (non-alley): {5, 10, 15} ft; alley → 0 ft (**known** via `alleyAdjacent`, not ambiguous).
- Side: the 3 ft absolute minimum is common to **both** possible rows (FTSA-3ft-flat and
  all-other-lots-5avg/3min) — only the *average* component differs, and this codebase does not
  compute the average component today for any side edge (the 2026-09-17 research's own disclosed,
  pre-existing "genuinely open item"), so a point-distance comparison has effectively one
  operative floor here, not two.

**Proposed rule, mirroring this unit's own already-founder-approved Flow-4 Case A/B/C
banding technique** (bounded reasoning between a known floor and a known ceiling, rather than
guessing a missing fact): for a boundary whose exact applicable figure is unresolved (unit count
or FTSA unknown), compare the shed's known distance against the **smallest** possible threshold
and the **largest** possible threshold for that boundary type:
- `distance < min(possible thresholds)` → definitely **inside** every possible required setback →
  `isInRequiredSetback = true` for that boundary, regardless of which threshold actually applies.
- `distance ≥ max(possible thresholds)` → definitely **outside** every possible required setback →
  `isInRequiredSetback = false` for that boundary.
- Otherwise (distance falls in the ambiguous band between the smallest and largest possible
  thresholds) → **REQUIRES_VERIFICATION** for that boundary specifically — never guessed.
- Alley-adjacent rear → deterministically 0 ft required setback (known fact, not banded) → that
  boundary is never "inside a required setback."
- **`isInRequiredSetback` (the single boolean `evaluateAccessoryHeightLimit` needs) = `true` if
  ANY resolved boundary is `true`; `false` only if EVERY boundary is definitively resolved `false`;
  otherwise unresolved/`REQUIRES_VERIFICATION`** — mirroring this project's existing "any confirmed
  hazard/condition is dispositive, all-clear requires every check to resolve clean" pattern used
  elsewhere (e.g. the ECA permit criterion, BR-U6B-3).
- **REAR's boundary uses Table A's general row (5/10/15 ft), never the codebase's existing 5-ft
  `REAR_SETBACK.minFt`** — reusing the existing rule's own 5 ft figure directly would be
  systematically wrong per Q2's finding above (it is the *shed's own* reduced distance, not the
  required-setback zone's boundary); the smallest-possible-threshold in the banded comparison
  happens to also be 5 ft here, which is a coincidence of Table A's own small-lot/FTSA row, not a
  reuse of the existing rule spec.

This is a genuine, disclosed methodological proposal — RULE TIER stays Tier 1 (23.44.070/090 are
fully deterministic code text; nothing about them is discretionary), while the **specific
per-property fact** (unit count, FTSA) stays an evidence gap exactly per this project's own
governing BR-U6B-14 principle, never conflated with a tier question. **Not implemented. Awaiting
founder confirmation of this bounded-band technique** before any code is written.

### Correction (2026-09-23, same day) — founder-approved with required corrections

**Founder decision: APPROVE the bounded-band approach in principle, with required corrections.**
The per-boundary model above is retained (three-state `DEFINITELY_INSIDE` /
`DEFINITELY_OUTSIDE` / `REQUIRES_VERIFICATION` per boundary, aggregated as: **any boundary
definitely inside → `true`; every relevant boundary definitely outside AND all applicable
additional-setback conditions ruled out → `false`; otherwise → `undefined`/
`REQUIRES_VERIFICATION`**), but three parts of the original proposal text above are corrected as
follows.

> **SUPERSEDED**: the Q6 "Side" band's statement that *"a point-distance comparison has
> effectively one operative floor here, not two"* and the proposed rule that collapsed the Side
> analysis to only the shared 3 ft floor. **This understated the Side band and is corrected below.**

**1. FRONT band (approved, with a Queen Anne Boulevard guard)**: `distance < 10` → definitely
inside; `distance ≥ 15` → definitely outside the **base** Table-A front setback, but Table A for
23.44.090 carries a special exception (footnote 2) for lots abutting the **Queen Anne Boulevard**
landmark right-of-way (front setback becomes 20 ft, or the average of abutting lots' front
setbacks, or a slope-adjusted figure — whichever is least). **Checked**: no street-name or
address evidence is persisted anywhere in this codebase past initial parcel *resolution* —
`CandidateParcel.canonicalAddress` (`src/parcel-resolution/types.ts`) is used transiently during
address-matching (`resolve.ts`) and is never written to `screeningRequests` or any other
persisted table (confirmed: no `address` column exists anywhere in `src/db/schema.ts`). **There
is therefore no way to rule the Queen Anne Boulevard exception in or out today** — per the
founder's own instruction, this is not built as a new adapter; instead, whenever the front band
would otherwise resolve `distance ≥ 15` → definitely outside, it is downgraded to
`REQUIRES_VERIFICATION` (reason: "special Queen Anne Boulevard frontage unresolved (no
street-name evidence available)"). In practice this means the front boundary's OUTSIDE branch is
never reachable with today's evidence — an honest, disclosed consequence of a genuine data gap,
not a defect. `10 ≤ distance < 15` remains `REQUIRES_VERIFICATION` (dwelling-unit count unknown),
unchanged from the original proposal.

**2. REAR band (approved as proposed)**: `distance < 5` → definitely inside; `5 ≤ distance < 15`
→ `REQUIRES_VERIFICATION` (unit count/FTSA unknown); `distance ≥ 15` → definitely outside the
base Table-A rear setback, **subject to the same Chapter 23.53 guard as every boundary (§3
below)**. Continues to distinguish Table A's rear row from 23.44.090.I.2's separate 5 ft
accessory-placement exception (Q2 above) — `REAR_SETBACK.minFt` is never reused as the
required-setback boundary. **Alley-abutting rear**: Table A states no ordinary rear setback is
required, but per the founder's instruction this does NOT by itself resolve the rear boundary to
definitely-outside — it is routed through the same Chapter 23.53 guard as any other
definitely-outside candidate.

**3. SIDE band — corrected, no longer collapsed to the 3 ft floor**: `minimum applicable side
distance < 3` → definitely inside (both possible Table-A side rows share this floor); **every**
applicable side distance `≥ 5` → definitely outside the base side setback (5 ft is the "all other
lots" row's average anchor — the safe upper extremum, not asserted as a precise average
computation, which remains the disclosed, separately-open NR-averaging-methodology gap); `3 ≤
minimum distance < 5` → `REQUIRES_VERIFICATION` (FTSA status unknown, and/or the open averaging
methodology). A side distance of exactly 3–5 ft is **never** claimed as definitely outside merely
because it clears the 3 ft absolute floor — the corrected treatment the founder required.

**4. Chapter 23.53 additional-setback guard (new)**: 23.44.090.C states additional structure
setbacks may be required to satisfy Chapter 23.53 (streets, alleys, easements). **Checked**: no
fact, adapter, or column anywhere in Property Intelligence, Spatial Analysis, or the persisted
schema models street/right-of-way width, improvement status, or dedication requirements (grepped
for "right of way," "rightOfWay," "streetWidth," "23.53," "unopened" across `src/property-
intelligence` and `src/spatial-analysis` — zero matches). **This guard can never be satisfied
with today's evidence** — per the founder's explicit "smallest safe evidence guard" instruction,
this means a base-band **definitely-outside** result on ANY boundary is currently always
downgraded to `REQUIRES_VERIFICATION` (reason: "additional Chapter 23.53 setback applicability
unresolved"), while a base-band **definitely-inside** result remains fully dispositive (`true`)
without needing this guard at all — the guard only ever blocks the OUTSIDE→`false` direction, per
the founder's explicit instruction, never the INSIDE→`true` direction. **Practical consequence,
stated plainly**: with today's evidence, `isInRequiredSetback` can resolve `true` (some boundary
definitely inside) or `REQUIRES_VERIFICATION`, but **not yet `false`** for any real property — the
aggregation logic itself (every relevant boundary definitely outside → `false`) is implemented
correctly, it simply has no reachable evidence today. **Correction (2026-09-23, Capability B plan
resubmission, decision `3fdb3357-510f-49d0-baa2-7dd20dabae9f`)**: an earlier version of this text
claimed the `false` path "activates automatically" once future evidence is sourced — overstated.
The pipeline derivation function's own input surface must first be **extended** with new
parameters (dwelling-unit count, FTSA status, street-name/address data, Chapter 23.53/right-of-way
status) before either guard could ever resolve; supplying new data alone, without also changing
that function's signature and the two guard conditions, would not activate anything. This remains
Tier 1 throughout — deterministic code text, gated on evidence quality, never a tier question
(BR-U6B-14) — but reaching `false` in practice requires both new evidence AND a future code change
to consume it, not evidence alone.

No numeric threshold above is invented — every figure (10/15 front, 5/10/15 rear, 3/5 side, and
the guard conditions) is drawn directly from the current Table A/subsection text already quoted
in this document. **Still not implemented as of this correction** — implementation proceeds now
under Unit 6B Capability B's Code Generation plan, which this correction updates.
