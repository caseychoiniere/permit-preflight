# Unit 0B — Manually Assembled Sample Reports (Track 5, achievable portion)

**These are hand-assembled illustrations of realistic Permit Preflight output, built from real
data and real regulatory research gathered during Unit 0/0B — not live product output (no
application exists yet) and not idealized best cases.** Report 2 in particular deliberately shows
a REQUIRES-VERIFICATION-heavy result, matching what Unit 0 found is actually typical, not the
exception. **These are the artifact intended for real target-persona review (Track 5's other
half) — that review has not happened and cannot be simulated; see the note at the end.**

---

## Sample Report 1 — Shed, Existing Property (clean-data case)

**Address**: 9004 36th Ave SW, Seattle, WA 98126
**Parcel**: Resolved cleanly (PIN 2491200816, address-point match score 100)
**Zoning**: NR (Neighborhood Residential) — KNOWN, Seattle GIS zoning layer
**Project**: 8 ft × 10 ft (80 sq ft) detached storage shed, proposed 6 ft from rear lot line, 10 ft from side lot line, not alley-adjacent

| Finding | Classification | Basis |
|---|---|---|
| Structure size is under the 120 sq ft building-permit exemption threshold | **KNOWN** | Seattle Residential Code R105.2 / SDCI guidance — but this exempts the *permit*, not the *zoning rules* below |
| Rear setback (6 ft proposed vs. 5 ft required) | **KNOWN — passes** | SMC 23.44.090 Table A / I.2 |
| Height (assume ≤10 ft proposed vs. 12 ft max, no roof-pitch bonus for shed-form roofs) | **KNOWN — passes, pending final height confirmation** | SMC 23.44.070.A.3 |
| Side setback (10 ft proposed) | **KNOWN — passes against standard 5 ft average/3 ft minimum** | SMC 23.44.090 — no reduced-setback exception applies to side yards for accessory structures (confirmed absence of exception in the reviewed sections) |
| Separation from dwelling (assume ≥3 ft based on site layout) | **REQUIRES VERIFICATION** | Exact distance from the house not confirmed from available data — user should confirm on-site |
| Environmentally Critical Area intersection | **KNOWN — none found** | Seattle ECA layer query, no intersection at this parcel |
| Whether sections 23.44.120-.190 (not reviewed) contain any additional applicable provision | **REQUIRES VERIFICATION** | Regulatory research for this rule area was not exhaustive of the full chapter |

**Preliminary screening assessment** (LLM-explained, not LLM-determined): *Based on available evidence, this proposed shed appears likely buildable at the stated dimensions and setbacks. Two items require your own confirmation before proceeding: the exact separation from your house, and whether any additional Title 23 provisions beyond those reviewed here apply to your specific situation. This is not a permit guarantee.*

---

## Sample Report 2 — Shed, Existing Property (approximate-data case — the realistic majority)

**Address**: 4547 Latona Ave NE, Seattle, WA 98105
**Parcel**: **Could not resolve to an exact address point** — no address point exists in King County's data at this house number (confirmed gap between 4545 and 4549). Location approximated via street-range interpolation only. **No parcel identifier obtained.**
**Zoning**: NR — **INFERRED**, from the approximate point only, not confirmed against the actual parcel boundary
**Project**: Same shed as Report 1, for comparison

| Finding | Classification | Basis |
|---|---|---|
| Parcel identity | **REQUIRES VERIFICATION** | No exact address point; this report's location is an approximation of "somewhere on this block," not a confirmed lot |
| Zoning designation | **INFERRED, not KNOWN** | Based on the approximate point, not the actual parcel boundary — could be wrong if the real parcel is adjacent to a zone boundary |
| Rear/side setback compliance | **REQUIRES VERIFICATION** | Cannot be reliably calculated without an authoritative parcel boundary |
| Height limit applicability | **INFERRED** | Zone-dependent height rule assumed to apply based on the inferred zoning, not confirmed |
| Environmentally Critical Area intersection | **REQUIRES VERIFICATION** | Cannot be reliably checked without exact parcel geometry |
| Structure size vs. permit-exemption threshold | **KNOWN** | This one fact (80 sq ft < 120 sq ft) doesn't depend on exact parcel location |

**Preliminary screening assessment** (LLM-explained): *We were unable to confirm this property's exact parcel boundary in King County's data — this appears to be a genuine gap in the public address-point dataset, not an error in your address. As a result, most findings below require independent verification (e.g., a plat map, survey, or King County Assessor in-person/phone confirmation) before you can rely on them. We do not want to give you false confidence by guessing.*

**This is the realistic majority case found during validation (roughly 5 of 8 real addresses tested), not a worst-case outlier.**

---

## Sample Report 3 — Vacant-Land Screening

**Address**: 5210 S Willow St, Seattle, WA 98118
**Parcel**: PIN 9830200356 — resolved via King County Assessor property-info data (not the standard address-point geocoder, which did not return this parcel — see Unit 0 findings)
**Zoning**: NR3/NR — KNOWN, cross-checked against Seattle's zoning layer
**Lot size**: 4,095 sq ft — KNOWN, Assessor record
**Land value**: $286,600 assessed land value; $0 assessed improvement value — KNOWN, Assessor record, consistent with vacant status
**Present use**: "Vacant (Single-family)" — KNOWN, Assessor's own use-code field

| Finding | Classification | Basis |
|---|---|---|
| Parcel is genuinely vacant | **KNOWN** | Assessor's own present-use code, not an inference |
| Zoning permits single-family residential development | **KNOWN** | Zoning layer + zone definition |
| Environmentally Critical Area intersection | **KNOWN — none found** at this location | ECA layer query |
| FEMA flood zone | **KNOWN — Zone X (not a mapped special flood hazard area)** | FEMA NFHL query |
| Preliminary buildable area | **REQUIRES VERIFICATION** | Not defensibly calculable from available data without a survey establishing exact lot lines/easements |
| Utility availability (water/sewer connection) | **REQUIRES VERIFICATION** | No automated data path exists for this (confirmed during Inception research) |
| Plausible supported use | **INFERRED** — single-family residential construction appears plausible given zoning and lack of known constraints | Synthesis of the KNOWN findings above, not independently confirmed |

**Preliminary screening assessment** (LLM-explained, deterministic-assessment-first per the approved VL-5 design): *Available evidence suggests this parcel is a genuine, developable vacant lot with no identified environmental or flood constraints — a reasonable candidate for further investigation. Buildable area and utility availability are not determinable from public data alone and would need direct confirmation (survey, utility district contact) before an acquisition decision. This is a preliminary screening result, not a development feasibility guarantee.*

---

## What This Track Cannot Do

These three reports are the artifact meant to be shown to real people matching the primary
persona (small residential developers, investors, builders, agents) to ask: would this change or
accelerate a real diligence decision? Which findings matter, which REQUIRES VERIFICATION items
kill the value, would you pay for this, would you use it repeatedly? **That conversation has not
happened.** No real target-persona user has seen these reports. Per the explicit instruction not
to manufacture market signal, this criterion is reported as **unvalidated**, not answered.
