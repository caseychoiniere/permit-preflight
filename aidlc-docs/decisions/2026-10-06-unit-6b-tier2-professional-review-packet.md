# Professional-review packet — P6 and C1e-director (Permit Preflight, Unit 6B)

**Prepared 2026-10-06 for a qualified land-use professional (land-use consultant, architect experienced with
Seattle SDCI permitting, or land-use attorney).** Documentation only; nothing here records a review, and no review
exists yet.

## What we are asking — and not asking

Permit Preflight is a Seattle pre-permit screening tool for detached sheds (NR zones). It must never state more
than the code supports. Two of its rules turn on **discretionary Director determinations**, so they are classified
**Tier 2** and may be activated only after a qualified professional has reviewed the *regulatory interpretation*.

**We are asking you to assess the regulatory interpretation and whether the proposed fail-closed customer
behavior is supportable. We are not asking you to approve, review, or run any code.** Everything below is stated in
plain regulatory terms; the "current behavior" sections describe what a customer would be told.

You may answer "not supportable" or "supportable only if X changes" — a negative review is a valid, useful result and
is recorded the same way.

---

## RULE A — P6 "Not in or near a mapped ECA" (shed building-permit exemption criterion)

- **Rule ID / type:** `68c29b20-efc9-4dae-8200-276ded81d48c` / `SHED_PERMIT_P6_ECA_CRITERION`
- **Tier / state:** TIER_2 / TRIAGED (source verification blocked pending this review)

### Provisions to review
1. **SDCI "Sheds" web guidance** ("not in or near an environmentally critical area") — this is where the "in or near"
   phrase originates; the 2021 Seattle Residential Code R105.2 item 3 text itself (≤120 sq ft projected roof area; not on a
   concrete foundation other than a slab on grade) does **not** mention ECAs. *(Guidance text is recorded in repository
   research, not re-fetched for this packet — please read the current page.)*
2. **SDCI Tip 316** (updated April 26, 2024): a Pre-Application Site Visit is required "if you will disturb any land on a
   site with an environmentally critical area (ECA)"; "based upon your proposed development and the affected ECA, we may
   require a reviewed or routed review application in lieu of a STFI."
3. **SMC 25.09.045.E**: "If the Director determines based on the distance between the proposed development and the
   environmentally critical area that the proposed action will occur far enough away from any environmentally critical area or
   buffer on the parcel that it will not temporarily or permanently encroach within, alter, or increase the impact to the
   environmentally critical area or buffer then the proposed action is exempt."
4. **SMC 25.09.015, .030, .040, .017**: chapter applies to development on parcels "containing an environmentally critical area
   or buffer"; the Department's ECA maps "are advisory" except peat/seismic/volcanic hazard maps, FEMA flood maps, WDFW-mapped
   areas, and peat maps for parcels ≤ 50,000 sq ft (.030.A); the Director determines whether a parcel contains an ECA or buffer
   (.030.B, .017.B); buffers are set by .090 (steep slope) and .160 (wetlands).

### Current deterministic implementation (what the software does)
It evaluates ten mapped hazard layers for the parcel. Only two layers (priority habitat, peat settlement) are treated as
map-dispositive; the other eight (steep slope, known/potential slides, riparian, wetland, flood-prone, historic landfill,
liquefaction) are advisory.
- A **map-dispositive** layer intersecting the parcel → criterion **NOT MET** (exemption not available; "full review likely").
- Any **advisory** layer, **regardless of whether it intersects** → **REQUIRES VERIFICATION**.
- Any indeterminate (tolerance-band) result, or **no ECA data at all** → **REQUIRES VERIFICATION**.
- **MET is returned only when every finding is a map-dispositive "no intersection."** With the real layer set this never
  occurs, so the criterion is effectively always NOT MET (priority habitat/peat hit) or REQUIRES VERIFICATION.
- No distance threshold, buffer, or proximity test is applied anywhere.

### What is known / what is discretionary
- **Known (deterministic):** the code defines ECA categories and buffers (25.09.012, .090, .160); advisory-vs-dispositive map
  status (25.09.030.A); that "far enough away" is a Director determination (25.09.045.E).
- **Discretionary:** whether a given site is "near" an ECA; whether SDCI routes an ECA-adjacent project to full review; whether
  the Director determines a parcel contains an ECA/buffer.

### What Permit Preflight currently tells a customer (verbatim basis text)
- Advisory-only/indeterminate/no data: "*[hazard] mapping cannot confidently rule out that the shed's parcel is in or near a
  mapped environmentally critical area.*" (criterion shown as unresolved; overall headline "Requires verification" when this is
  the only unresolved criterion; always followed by "SDCI makes the final determination.")
- Map-dispositive intersection: "*Mapped [hazard] data confirms an intersection with this parcel.*" (criterion not met).
- If this rule is activated, a shed ≤120 sq ft with every other criterion met is still shown as **"Requires verification,"** never
  "Likely not required."

### Unresolved interpretation / evidence questions
1. Does the R105.2 building-permit exemption itself depend on ECA status, or is "not in or near an ECA" SDCI guidance reflecting
   the separate Chapter 25.09 approval requirement (25.09.040/.045)? Is it fair to present it as an *exemption criterion*?
2. Is there any official screening distance, map rule, Director's Rule, or published SDCI interpretation defining "near"? (We
   found none and have not invented one.)
3. For a parcel with a mapped advisory layer that does **not** intersect, is "requires verification" the appropriate customer
   statement, or is some stronger/weaker statement supportable?
4. Is treating a **map-dispositive intersection** (priority habitat/peat) as "exemption not available / full review likely"
   supportable?

### Questions you must answer
- Q-P6-1: Is "in or near" inherently a case-by-case SDCI/Director determination with no code-defined distance? (yes/no + basis)
- Q-P6-2: Is the fail-closed behavior above (never "likely exempt" from advisory maps; "requires verification" otherwise; "not
  available" only on a dispositive intersection) a **supportable** way to describe the exemption to a customer? If not, what must change?
- Q-P6-3: Is the current wording ("cannot confidently rule out…", "SDCI makes the final determination") accurate and not
  misleading? Suggest corrections.
- Q-P6-4: Does a sufficiently distant, mapped-clear parcel have any recognized path to a "likely exempt" statement that Permit
  Preflight could support deterministically? If yes, what exact condition?
- Q-P6-5: Any additional provisions (e.g., SMC 23.60A Shoreline District, SRC/SBC provisions, Director's Rules) that change the answer?

### What conclusion qualifies the review as suitable-for-deterministic-or-fail-closed-use
`suitableForDeterministicOrFailClosedUse = true` if you conclude **both**: (a) the interpretation that "in or near" is
discretionary and cannot be resolved from advisory maps is correct, and (b) the described fail-closed customer behavior is
supportable (with or without the wording changes you list). Use `false` if the behavior would mislead customers or the
interpretation is wrong; explain in the conclusion.

### Limitations to record explicitly
Date of the SDCI guidance read; whether the Sheds web page was reviewed in its current form; any SDCI staff
conversation/interpretation reference; geographic/zone scope (Seattle NR zones only); that the assessment is of the interpretation
and customer wording, not of any parcel; any Director's Rules relied on.

---

## RULE B — C1e-director "Director-approved alternative lot coverage"

- **Rule ID / type:** `4d3983b7-19a8-4066-93ab-92648569eced` / `SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE`
- **Tier / state:** TIER_2 / TRIAGED

### Provisions to review
1. **SMC 23.44.080.B**: not counted in lot size for lot coverage: riparian corridors; wetlands and their buffers; submerged lands
   and areas within the shoreline setback; designated non-disturbance area in steep slopes.
2. **SMC 23.44.080.D**: "The lot coverage allowed on lots containing areas listed in subsection 23.44.080.B shall not be less than 625
   square feet or an amount of lot coverage approved by the Director through an environmentally critical area reduction, waiver, or
   modification pursuant to Chapter 25.09, whichever is greater."
3. **SMC 23.44.080.E**: designated non-disturbance area in steep slopes = all portions of steep slope hazard areas except areas
   with relief (25.09.090), small-project-waiver areas, and areas under a steep-slope erosion hazard area variance (25.09.290).
4. **SMC 25.09.030.A** (maps advisory), **25.09.012** (definitions), **25.09.160 Table A** (wetland buffer by category and
   habitat function), **25.09.200/.012.D.5** (riparian management area = 100 ft from the field-surveyed OHWM),
   **25.09.280/.300** (setback variance / ECA exception), SMC 23.60A (shoreline setback).

### Current deterministic implementation
- The **625 sq ft floor** is a separate, approved Tier-1 rule (not part of this review).
- Lot-coverage estimate = (existing mapped structure footprint area, estimated from aerial roof outlines) + proposed shed footprint.
- Because no mapped layer is dispositive for any 23.44.080.B category, the software **never establishes an excluded area** and always
  treats the lot-area denominator as unresolved.
- If estimated coverage exceeds the **most generous possible allowance** (the greater of 60% of the full parcel and 625 sq ft) **and** a
  mapped layer *indicates* a 23.44.080.B category, the result is **"a Director-approved alternative may be relevant"** (requires
  verification). With no map indication, the result is **"appears to exceed"** (hedged). It never says a Director alternative *applies*.
- It never invents or assumes a Director-approved amount; it has no channel to learn of one.

### What is known / discretionary
- **Known:** 625 sq ft floor; the four categories; the 50% base and 60% special allowances; that the alternative exists only on lots
  containing a 23.44.080.B area.
- **Discretionary:** whether a Director approval exists for a parcel and its amount (case-by-case, per application under Chapter
  25.09); the extent of each excluded area (field delineation, Director determination).

### What Permit Preflight currently tells a customer
- "*The standard calculated allowance appears exceeded, but a parcel-specific Director-approved amount, if one exists, could alter this
  result. Permit Preflight has no way to confirm whether such an approval exists.*" (when a mapped layer indicates a 23.44.080.B area)
- "*Even Seattle's higher 60% allowance (for qualifying developments) appears exceeded.*" (no map indication).
- "*A mapped riparian corridor, wetland, shoreline-setback, or steep-slope non-disturbance condition may intersect this parcel, or cannot be
  ruled out from mapped data … and may reduce the countable lot area used for this estimate, pending more precise geometry.*"

### Unresolved interpretation / evidence questions
1. Is "an amount … approved by the Director through an ECA reduction, waiver, or modification" limited to approvals actually issued
   for the lot, or can it be a standing allowance? What application types qualify?
2. Does 23.44.080.D's alternative apply only when a 23.44.080.B area exists on the lot? Is "lots containing areas listed in B" judged
   by the Director's determination (25.09.030.B) or by the maps?
3. Is it supportable to say "a Director-approved alternative **may be relevant**" when a mapped (advisory) layer indicates a B area and
   coverage exceeds the generous ceiling — and **"appears to exceed"** (not "may be relevant") when no layer indicates one?
4. Is using the greater of 60% of the **full** parcel and 625 sq ft as the most generous possible allowance (exclusions can only
   shrink the denominator) a correct upper bound?

### Questions you must answer
- Q-C1e-1: Is the Director-approved alternative inherently discretionary and case-by-case, with no way for a screening tool to
  determine it? (yes/no + basis)
- Q-C1e-2: Is the described behavior ("may be relevant" / "appears to exceed" / never "applies") supportable and not misleading? Corrections?
- Q-C1e-3: Is the generous-ceiling upper bound correct under 23.44.080.A–G? Any allowance missed (e.g., 23.44.080.C structures not
  counted; Type A units)?
- Q-C1e-4: Which application types ("reduction, waiver, or modification pursuant to Chapter 25.09") can produce an approved amount?
- Q-C1e-5: Any other provision that changes the interpretation?

### What conclusion qualifies the review as suitable-for-deterministic-or-fail-closed-use
`true` if you conclude the alternative is discretionary and not determinable by a screening tool **and** the three-way customer
behavior above is supportable (with or without listed wording changes). `false` if any statement would mislead customers or the
interpretation is incorrect.

### Limitations to record explicitly
Date of code text read; that existing coverage is an *estimate* from aerial roof outlines (over-counts); that no parcel-specific
Director approvals were checked; the zone scope (Seattle NR); any Director's Rules or SDCI interpretations relied on.

---

## How the result is entered (existing mechanism)

One `rule_professional_reviews` row per rule, recorded through the admin route
`POST /api/admin/rules/{ruleId}/professional-review` with `confirm: "RECORD PROFESSIONAL REVIEW"` while the rule is TRIAGED. Map your
answers to these fields:

| Field | Content |
|---|---|
| `reviewerIdentity` | Your name and firm |
| `reviewerRole` | `LAND_USE_CONSULTANT`, `ARCHITECT`, `ATTORNEY` or `OTHER` |
| `reviewDate` | ISO date the review was completed (not in the future) |
| `sourceProvisions` | The provisions you actually reviewed (list above, plus any others you relied on) |
| `conclusion` | Your answers to the numbered questions, in your words |
| `limitations` | The limitations above, plus anything else (write "none identified" only if true) |
| `evidenceRefs` | Title/date/location of your written opinion or memo (at least one) |
| `suitableForDeterministicOrFailClosedUse` | `true`/`false` per the criteria above |

A rule with a negative or incomplete review cannot be Tier-2 source-verified. Recording a review does not activate anything: after
source verification the rule still needs testing, approval, and a separate founder-authorized activation.

## Appendix — current deterministic behavior (reference examples)

Real evaluator output for an 8×8 shed on a slab (all ten layers "clear"): criteria roof area, story height, foundation, attachment, use
= met; ECA = requires verification; headline = "Requires verification." With a priority-habitat intersection: ECA = not met; "permit likely
required — full review." For a 5,000 sq ft parcel with 3,100 sq ft existing + 64 sq ft shed (63%): no map indication → "appears
exceeded"; wetland layer indicates → "a Director-approved alternative may be relevant."

---

## Status update 2026-10-07 — deferred; preserved as a future option

> **Founder decision (recorded verbatim):** For the MVP, professional review of P6 and C1e-director is deferred. The Tier-2 rules remain
> TRIAGED and inactive. They are no longer blanket prerequisites for deterministic outcomes that do not depend on resolving those
> discretionary questions.

This packet is **not withdrawn and not obtained**: no professional review was recorded, P6 and C1e-director remain TIER_2 / TRIAGED /
inactive, and nothing above was source-verified, approved or activated. The earlier statement that the review "unblocks both aggregates"
no longer applies — see `2026-10-06-unit-6b-product-value-analysis.md` §6. If the review is later commissioned, it would unlock only what
the deterministic set deliberately does not claim: **P6** → the "likely not required" (LIKELY_EXEMPT) exemption outcome; **C1e-director** →
any claim that a Director-approved alternative may be relevant. The professional-review recording mechanism remains in the repository
unchanged for that purpose. The "Appendix — current deterministic behavior" below describes behavior with both rules active and is retained
as the original reference; with them inactive the behavior is as tabulated in the product-value analysis §6.2.
