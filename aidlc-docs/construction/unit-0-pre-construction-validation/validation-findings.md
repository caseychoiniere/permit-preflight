# Unit 0: Pre-Construction Validation — Findings & Recommendation

**Method**: Real, live API calls against King County/Seattle/FEMA public data endpoints (curl,
confirmed working), plus real regulatory research against Municode/City Clerk-Legistar/SDCI for a
candidate shed setback rule. Not simulated, not desk research alone. 8 real addresses + 1 real
vacant-parcel search + 1 deliberately ambiguous input, per `validation-plan.md`.

**This document does not soften the results to protect the Inception decisions.** Several findings
below cut against assumptions made during Requirements Analysis and Application Design.

---

## Findings Against Each Evaluation Criterion

### 1. Parcel-resolution reliability — **WEAK**
Of 8 real addresses tested against King County's own authoritative address-point geocoder:
- **3/8 (37.5%)** resolved cleanly to an exact parcel (PIN, score 100).
- **4/8 (50%)** had no address point at all — the address falls in a real gap in King County's
  address-point layer — and required falling back to street-range interpolation, which returns an
  *approximate* location with **no parcel identifier**. Every downstream answer (zoning, ECA,
  flood) for these is "somewhere on this block," not the specific lot.
- **1/8 (12.5%)** failed outright — the house number doesn't exist on that street.
- The **deliberately ambiguous input** ("123 Main St, Seattle, WA") produced a **false-confident
  wrong match**: one geocoder returned a high-confidence (99.48) result attached to a parcel whose
  own assessor record shows a different address several house numbers off, with nothing in the
  response flagging the discrepancy. A second geocoder returned zero results for the identical
  input. This is the most concerning single finding — it is a **worse failure mode than an honest
  "no match,"** and it means naive reliance on a geocoder's self-reported confidence score would
  produce a wrong-parcel report the customer has no way to detect. This directly stress-tests the
  brief's own "do not assume one address = one parcel; ask for clarification when uncertain"
  requirement (§7), and shows the raw data source does not make that easy.

### 2. Property-data completeness — **MIXED**
Zoning was obtainable for 7/8 (including via the approximate fallback point). ECA data exists but
is **internally contradictory**: at one address, a combined "convenience" ECA layer flagged a hit
that the authoritative individual Steep Slope layer did not corroborate. FEMA flood zone was
obtainable for all tested points (all Zone X — not a stress test of a true flood-zone-positive
case). **No exact-address permit-history match was found for any of the 8 addresses** — only
same-street proximate records.

### 3. Zoning/data-source availability — **MIXED**
Zoning/ECA/FEMA layers exist and are queryable. Assessment/vacancy data (needed for the vacant-land
workflow) exists only in an **undocumented King County layer** not reachable through the standard
address-lookup path — finding it required schema discovery a normal product flow wouldn't surface.

### 4. Spatial-analysis feasibility — **GATED BY #1**
PostGIS can compute against whatever geometry it receives, but spatial-analysis *quality* is only
as good as parcel-resolution precision — and 5/8 test cases here would only support approximate,
not authoritative, spatial analysis under the current geocoding approach.

### 5. Regulatory-rule research feasibility — **TRACTABLE, HARDER THAN ASSUMED**
A real, cited, testable candidate shed-setback rule was successfully produced (see
`sme-shed-rule-candidate.md`... *[full text preserved in the research agent's output — see this
document's Regulatory Research Detail section below]*). But: **Municode blocked all direct
programmatic fetch attempts (HTTP 403)** — research required an actual interactive browser tool,
not a simple API/fetch call. Search-indexed Municode section links were frequently stale/dead,
traced to Seattle's own December 2025 zoning restructure (Ordinance 127376 collapsed the old
SF-zone subtypes into a single "Neighborhood Residential" zone) — a concrete, recent example of
exactly the regulatory-change risk the rule-governance model exists to handle, encountered in
practice rather than theory.

### 6. % and severity of UNKNOWN / REQUIRES VERIFICATION — **HIGHER THAN LIKELY ASSUMED**
An honest implementation would need to classify roughly **5 of 8 (62.5%)** of these test parcels'
spatial findings as REQUIRES VERIFICATION or low-confidence INFERRED rather than KNOWN, purely
from parcel-location imprecision — before any regulatory-rule uncertainty is even layered on top.
This is the evidence-classification model working as designed (never silently converting missing
information into a pass), but the *rate* is higher than the product's economics/value proposition
was likely modeled around.

### 7. Ability to produce a useful evidence-backed preliminary result — **PARTIALLY VALIDATED, OPEN QUESTION SURFACED**
Report *content* can be genuinely evidence-backed and well-cited when the underlying data is exact
(proven by the shed rule and the 3 clean-match addresses). But for the majority of addresses
tested, a report would lean heavily on REQUIRES VERIFICATION. Whether a REQUIRES-VERIFICATION-heavy
report is still worth paying for is a real, unresolved product question this test surfaces but
cannot answer alone.

### 8. Rule-authoring and verification effort — **CONFIRMED REAL, MEANINGFUL**
~45-60 minutes for one simple rule (shed setback), honestly expected to be longer for messier
project types (multifamily-adjacent, ADU, critical-area-intersecting). Sustainable for one person,
but not a copy-paste process — Municode's fragile node-ID linking means each rule needs fresh
live-navigation, not a durable bookmark.

### 9. Likely Tier 1 vs. Tier 2 rule-review burden — **HIGHER THAN THE APPROVED SEQUENCING ASSUMED**
The simplest possible rule (shed rear setback) was honestly assessed as **Tier 2**, not Tier 1 —
genuine ambiguity was found (an inferred-from-silence side-yard rule, unread code sections, a live
discrepancy between older SDCI guidance and current code text). This directly contradicts the
Inception-time assumption (requirements.md §1.4) that sheds/garages would be Tier-1-dominated early
project types, which was part of the reasoning for their position in the approved build sequence.

### 10. Report usefulness to the professional/repeat-evaluator persona — **NOT DIRECTLY TESTED, STRUCTURALLY RELEVANT**
No real professional reviewed a sample report. But a professional evaluating many properties would
hit the same parcel-resolution reliability wall at volume — if roughly 60% of real addresses only
yield approximate/REQUIRES-VERIFICATION results, that materially affects whether the product
delivers enough per-property screening value for repeat professional use. Flagged as a real
concern, not a conclusive negative.

### 11. Willingness to pay / perceived value — **UNTESTED, AS DISCLOSED IN THE PLAN**
No real interviews were conducted. This cannot be fabricated and is reported honestly as an open
gap, not answered.

### 12. Approximate report-generation cost — **NOT MATERIALLY CHANGED, BUT ENGINEERING-EFFORT RISK FLAGGED**
The LLM/infrastructure COGS model from research-findings.md §3/§5 is not invalidated by this test.
However, the *engineering* effort to reach a trustworthy result — querying 9 individual ECA layers
instead of 1 combined layer, building cross-geocoder validation logic, handling the Municode
browser-access requirement — is a real scope input for Units 1-2 that was not fully accounted for
in Application Design's component-method-level detail (deliberately deferred there, but worth
surfacing now that real friction has been found).

### 13. Unexpected legal, licensing, or operational blockers — **OPERATIONAL FINDINGS, NO NEW LEGAL BLOCKER**
- Municode's 403-on-fetch behavior is an operational constraint, not new legal information — but it
  has a real architectural implication: Rule Research Assistant (Application Design) may need
  interactive-browser access, not simple HTTP fetch, to reach Municode at all. This should be
  resolved as a concrete design decision before Unit 1, not assumed away.
- King County's Socrata catalog search can silently return **out-of-state (Ohio) datasets** on an
  unscoped query — a real data-integrity trap requiring careful query scoping in implementation.
- FEMA's documented endpoint pattern was dead; the working one had to be found by trial — minor.
- No new legal/licensing blocker beyond what `legal-questions-for-counsel.md` already flags.

---

## Regulatory Research Detail (preserved from the research track)

**Candidate rule** (Seattle Neighborhood Residential zone, SMC 23.44.070/090): a detached
accessory structure used as a shed may sit in the rear setback at ≥5 ft from the rear lot line
(0 ft if alley-abutting), must not exceed 12 ft in height (no roof-pitch bonus), and must be ≥3 ft
from any dwelling unit. Side and front yards get no such exception — full standard setbacks apply.
Separately, structures under 120 sq ft, one-story, slab-on-grade are exempt from a *building
permit* (Seattle Residential/Building Code) — but this does **not** waive the zoning setback/height
rule, a distinction a naive implementation could get wrong. Citation: SMC 23.44.070.A.3,
23.44.090 Table A/I.2/B; Ordinance 127376 (passed 12/16/2025, signed 12/22/2025) restructured the
zone this rule lives in. Tier assessed: **Tier 2**, honestly, due to the inferred (not
explicitly stated) side-yard rule, unread adjacent code sections, and a discrepancy found between
older public SDCI guidance and current code text.

---

## Recommendation: **PIVOT**

Not GO, and not NO-GO. Reasoning:

**Why not GO**: Parcel resolution — the single most load-bearing assumption in the entire
product — succeeded cleanly only 37.5% of the time against real addresses, and the failure mode
observed for ambiguous input (confident wrong match, not an honest "unsure") is exactly the kind
of silent-error risk the brief explicitly warns against. Shipping Units 1-2 against the current
Parcel Resolution design, unrevised, risks building the foundational architecture on an
under-specified confidence model.

**Why not NO-GO**: Nothing found here shows the product *cannot* work. The evidence-classification
architecture (KNOWN/INFERRED/REQUIRES VERIFICATION) is precisely the right tool for a data
landscape this imperfect — arguably this test *validates* the wisdom of that architectural choice,
since a competitor promising false certainty would be far more exposed by these same data gaps. A
real, correctly-cited regulatory rule was successfully produced. The blockers found are answerable
engineering/design questions, not evidence of fundamental infeasibility.

**Required revisions before Units 1-2 proceed as currently scoped**:

1. **Parcel Resolution needs a materially more sophisticated confidence/validation strategy** than
   Application Design currently specifies — cross-source validation (not trusting a single
   geocoder's self-reported score), explicit handling of the interpolated-vs-exact distinction, and
   a concrete design for detecting the "confident wrong match" failure mode. This affects
   `components.md`'s Parcel Resolution definition and `component-methods.md`'s `resolveByAddress`.
2. **Evaluate an alternative/paid geocoder** (research-findings.md §3 named Google/Mapbox as
   fallback options to the free Census geocoder — note this test used King County's own geocoder,
   a *third*, untested option) for real Seattle parcel-point coverage before concluding the
   free-tier approach is sufficient — this specific comparison has not yet been run.
3. **Spatial Analysis needs a defined multi-ECA-layer strategy** (query individual authoritative
   layers, not one combined convenience layer, with an explicit tie-breaking/downgrade rule when
   sources disagree) rather than the single-layer assumption implicit in the current design.
4. **Resolve Rule Research Assistant's Municode-access mechanism concretely** — real interactive
   browser access appears necessary; decide whether "AI-assisted research" means autonomous
   browser-driving AI, or a human-browses/AI-assists hybrid, before Unit 1 begins.
5. **Revisit the Tier 1-heavy assumption for early project types** (requirements.md §1.4) — plan
   rule-authoring timelines and Tier 2 professional-consultation budget around Tier 2 as a
   realistic default for early rules, not an exception.
6. **The REQUIRES-VERIFICATION rate found here (~60%) should inform, not be discovered after, a
   small real willingness-to-pay/usefulness check** with actual target-persona users before
   committing further engineering investment — criterion #11 remains genuinely untested and is
   now more consequential given criterion #6's result, not less.

None of these require abandoning the approved product concept, persona, project-type sequence, or
core architecture. They require a **revision pass on Parcel Resolution's design, the spatial data
source strategy, and rule-authoring timeline expectations** before Unit 1/Unit 2 begin — consistent
with a PIVOT outcome as defined in the user's own charter for this gate ("product remains viable
but requirements, scope, persona, project types, architecture, data approach, or economics need
material revision").

**This is a recommendation, not a decision.** Per the Unit 0 gate, this stops here for your
explicit review and direction.
