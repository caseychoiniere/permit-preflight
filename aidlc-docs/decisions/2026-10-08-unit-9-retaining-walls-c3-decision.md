# Unit 9 (Retaining Walls) — C3 decision memo (founder decision required)

**2026-10-08.** The Continuous Autonomous Execution Policy tells Claude to begin the next planned unit automatically except for the five founder-only conditions. Unit 9 hits
two of them, so work stopped here deliberately. Nothing was built for Unit 9.

## Why this is a founder decision
1. **Your own C3 answer (requirements Q C3 = "C")** reserves it: for a project type whose reports would be mostly UNKNOWN, *"flag that project type for possible removal or
   deferral"* and let you choose. `requirements.md` §1.4/§C names retaining walls (and additions) as the candidates. That is a project-type scope decision (condition 2).
2. **Unit 9 also delivers ADM-9 + the Support Case** (a complaint record linking a report, the customer's email, an investigation outcome and any refund) — a new admin surface that stores
   customer-identifying data (condition 3: privacy/credential/data handling).
3. **Reordering:** `requirements.md` §1.4's standing instruction says a change of project-type order must be surfaced for approval first, so skipping Unit 9 to build Unit 10 is also not Claude's call.

## C3 research: how UNKNOWN-heavy would a retaining-wall report be? (sources read live 2026-10-08)
- **SMC 23.44.090.H.5** (walls in required setbacks): raising-grade walls ≤ 6 ft above existing grade (deterministic from declared height); cut walls "not exceed the minimum height necessary to support the
  cut or 6 feet ... whichever is greater" (necessity is a geotechnical judgment — unknowable); any fence set back ≥ 3 ft from a cut wall (already evaluated in Unit 7).
- **2021 SRC R105.2 item 6** (permit exemption): wall ≤ 4 ft **from the bottom of the footing** (even if under grade), no surcharge, **not in an ECA or ECA buffer**, **does not support soils in a steep-slope /
  potential-slide / known-slide area**, and **failure would likely cause no damage to adjoining property**. Four of those conditions depend on facts Permit Preflight cannot determine (ECA/steep-slope status from advisory maps;
  "likely no damage" is a judgment; footing depth is often unknown to a homeowner).
- **SDCI Retaining Walls page:** no permit only if ≤ 4 ft, not on a parcel with an ECA, and no damage to adjoining property — "a wall at the property line" may need a permit; on a parcel with an ECA a wall of *any* height
  needs very specific requirements or an exemption; drawings "commonly require a professional stamp"; rockeries need a geotechnical design or prescriptive standards; grading permit by soil volume; right-of-way and side-sewer rules.
- **Not lot coverage:** walls and rockeries do not count toward lot coverage.

**Assessment.** A declared-input retaining-wall evaluation (like Units 7-8) is feasible and honest: `> 4 ft from footing bottom` → permit required (deterministic), a wall at a property line → permit likely required (SDCI states it), raising-grade
height in setbacks (deterministic), and almost everything else → REQUIRES_VERIFICATION because ECA/steep-slope/damage/engineering questions are always open. Typical outcome: "permit required, drawings likely stamped" for walls over 4 ft; "turns only on
ECA and adjoining-property conditions" for small walls — useful but thinner than sheds, and the ECA question dominates (SDCI: any wall on an ECA parcel needs special requirements). Roughly **moderately** UNKNOWN-heavy, not "mostly UNKNOWN".

## Options
| Option | Meaning | Cost / risk |
|---|---|---|
| **A. Drop** retaining walls from the MVP | Skip Unit 9's project type | Zero cost; loses a project type customers often confuse |
| **B. Build** it gated, like Units 7-8 | Declared-input evaluation, rules to APPROVED, readiness flag false | Same effort as Unit 8; adds a fourth dormant project type nobody can buy yet |
| **C. Defer** until there is paid-demand evidence | Keep it on the roadmap; revisit with real customer data | Zero cost now; honours "validate paid value before horizontal expansion" |

**Recommendation: C (defer).** Three project types beyond the shed (garage, fence, deck) are now built and gated off, none activated or sold. The scarcest resource is no longer engineering throughput but a founder decision on which
verticals to turn on and evidence that customers pay. Splitting out **ADM-9** as its own decision (what complaint data is stored, retention, who can see it) is cleaner than bundling it with a project type.

## Decisions requested (when you next look at this)
1. Retaining walls: A, B or C (recommend C).
2. ADM-9 + Support Case: build now, defer, or specify the data/retention scope first.
3. Order of the remaining units (10 Additions and 11 ADUs are also C3 candidates): confirm the sequence or tell Claude which to build next.

## Informational (no action required)
- Fences (Unit 7) were themselves flagged "low per-project value" for C3 review in the requirements; they were built (gated, APPROVED, not activated) under the continuous-execution instruction. If you would rather drop them, nothing customer-facing exists.
- Activation of the 8 fence rules and 6 deck rules, and flipping the two readiness flags, remain your decisions.
- The reviewer's ECA full-review point (decks) also applies to the live shed result "simple review (STFI) likely"; left as authorized in the Unit 6B activation.
