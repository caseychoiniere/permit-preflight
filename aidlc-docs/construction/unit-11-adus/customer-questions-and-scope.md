# Unit 11 — ADUs: customer questions, report shape, and slicing

Product-first: define what a customer needs answered *before* spending design/permit money, then map each question to current deterministic rules (research-findings.md). Priority is useful
feasibility depth over matching Unit 7/8's depth; unresolved discretionary facts stay REQUIRES_VERIFICATION and never block ordinary-parcel value.

## Who and what they are deciding
Homeowners, buyers, investors, agents, builders/developers, deciding whether to pay for design/engineering/permitting of an ADU. The cost of being wrong is high (design fees, a purchase price premised
on an ADU, a stalled build), so the report must say clearly what *looks feasible*, what *prevents or threatens it*, and *what to verify first*.

## The questions the report answers
| # | Customer question | Answered from | Determinism today |
|---|---|---|---|
| Q1 | **Can this property likely support an ADU?** | Zone is NR (verified from Seattle zoning data), no shoreline/historic/landmark overlay flag, existing principal dwelling on the lot, density (existing units + the ADU vs lot area), ADU count cap (max 2) | High: zone/overlay verified from data; density deterministic except ECA exclusion areas |
| Q2 | **What type of ADU appears feasible?** | New detached (DADU), conversion of an existing accessory structure (permitted notwithstanding coverage/setbacks), attached (AADU / within the house), stacked | Declared type + rules per type; conversion path is highly valuable and deterministic from declared facts |
| Q3 | **Where could it go?** | Customer-placed footprint on the parcel map: distances to lot lines and to the existing dwelling vs the 5 ft separation, rear setback 5 ft (alley: none), side 5 avg/3 min (3 ft small FTSA lots), front 15 ft, through-lot handling, height 32 ft / 12 ft in setbacks | High where lot-line roles are established; "requires verification" where the street/front/rear role is uncertain (existing model) |
| Q4 | **What are the biggest constraints?** | Ranked from the findings: placement, lot coverage (with tolerance), **FAR headroom (computed: limit rises with the ADU's density band)**, size cap (1,000/1,200 sq ft), amenity area (20% of lot; exempt for one new unit on a pre-1982 house), trees (required points), ECA | Mixed; each item states what it rests on |
| Q5 | **What specifically prevents or threatens feasibility?** | Findings classified KNOWN FAIL / REQUIRES_VERIFICATION with the precise reason and the number involved ("over the 5 ft separation by 1.8 ft") | Deterministic where inputs are established |
| Q6 | **What facts still need professional/SDCI verification?** | The REQUIRES_VERIFICATION list, grouped: site (ECA, shoreline, survey), existing-structure facts, utilities, design | By construction |
| Q7 | **What should I verify before paying for design work?** | A short ordered checklist generated from the unresolved items (e.g. confirm lot lines with a survey; ECA/steep-slope screening; sewer/stormwater; tree inventory) | Derived |

## Report shape (web + PDF identical)
1. **Headline feasibility** (never an approval): "Looks feasible - N items to verify" / "Blocked by ..." / "Cannot tell - ...".
2. **What you told us** and **what we found about the property** (zoning, overlays, transit area, lot area, existing structures) with provenance.
3. **Constraint table** (placement, lot coverage, FAR, size, amenity, trees, density) each with status and the number involved.
4. **Biggest constraints / what could stop it**, then **verify-before-design checklist**.
5. Fixed disclosures (building code, utilities, capacity charge, title covenants, design review) - never implied satisfied.

## Reuse (no rebuilding)
Parcel geometry, Building Outlines + primary-dwelling selection, lot-line role model and street-frontage uncertainty, `computeSetbackDistances`, the bounded `isInRequiredSetback` derivation, ECA screening,
Capability C lot-coverage estimate + tolerance, evidence/provenance, rule lifecycle, report/PDF pipeline, the shed placement UI (footprint on the parcel map). Genuinely new: zoning/overlay/transit property facts,
the real governed accessory-structure rule foundation, ADU rules, FAR/amenity/tree/density computations, the ADU intake and report sections.

## Slicing (each slice ends in tests + reviewer QA + commit/push)
- **Slice 1 - Zoning & overlay facts (foundation, also fixes live types).** New retrievers for zoning/overlays and frequent-transit/major-transit-walkshed facts; health recording; NR applicability gating for shed/fence/deck so an NR-only conclusion is never produced for a parcel that is verifiably not NR; the "zoning not verified" finding becomes a verified fact where data exists.
- **Slice 2 - Real accessory-structure rule foundation.** Governed rule rows (setbacks incl. ADU rear 5 ft/alley, height 32/12, separation 5 ft, lot coverage) replacing reliance on staging fixtures; wire shed (and unblock garage) to them.
- **Slice 3 - DADU feasibility (new detached).** `adu` project type (declared type, size/bedrooms, placement on the map, height, existing floor area, pre-1982 house, existing ADU count); evaluator: eligibility, density/units, size cap, placement vs setbacks/separation, lot coverage + tolerance, FAR headroom, amenity, trees; report + PDF; intake UI; rules to APPROVED (activation is a separate founder authorization).
- **Slice 4 - Conversion of an existing accessory structure** (the notwithstanding-setbacks path + minimum-standards disclosure) and **Slice 5 - attached ADU**.
- Each slice is independently valuable; ordinary parcels are never held up by an edge case (edge cases return REQUIRES_VERIFICATION with the limitation recorded).

## Slice status
See `slice-status.md` (Slice 1 done; Slice 2 deferred off the ADU critical path; Slice 3 built with rules APPROVED and availability off).

## Founder-only checks (none triggered so far)
No pricing/scope/privacy/payment/irreversible-architecture/launch decision is involved. The only possible trigger would be an interpretation with materially different defensible customer outcomes; none has appeared (the text is explicit on size, density, separation, setbacks, coverage and FAR). Rule activation remains a separate, founder-authorized step per rule set.
