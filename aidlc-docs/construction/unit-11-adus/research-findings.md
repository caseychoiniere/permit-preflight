# Unit 11 — ADUs: research findings (current Seattle sources, read live 2026-10-08)

**Headline: the ADU rules changed fundamentally with Ordinance 127376 (2025) and most public guidance is out of date.** SMC 23.44.041 (the old NR-zone ADU section with the 3,200 sq ft
lot minimum, 40%-of-rear-yard cap, entrance-orientation rules and owner-occupancy history) **no longer exists**; ADUs are now governed by **SMC 23.42.022** plus the ordinary NR
development standards. SDCI's own DADU Tip 116B ("Updated August 18, 2023") and Tip 116A still describe the old regime; competing feasibility tools that were built from them may be wrong.
Every claim below is taken from the current Municode text, not from guidance pages.

## Sources
| # | Source | Used for |
|---|---|---|
| S1 | **SMC 23.42.022 "Accessory dwelling units"** (Ord. 127376 § 21, 2025; Ord. 127211 § 5, 2025), Municode CURRENT | The ADU rules |
| S2 | **SMC 23.44.020.C.6** ("Accessory dwelling units are permitted, provided they comply with Section 23.42.022") | NR permission |
| S3 | **SMC 23.44.060** (density; Ord. 127376 § 31) | Units allowed, lot-area measurement |
| S4 | **SMC 23.44.050** (FAR) | Floor-area headroom |
| S5 | **SMC 23.44.080** (lot coverage), **23.44.090** (setbacks, Table A + footnote 3), **23.44.070** (height), **23.44.100** (separations), **23.44.110** (amenity area), **23.44.120** (trees), **23.44.130** (width), **23.44.140** (design standards) | Development standards that apply to an ADU |
| S6 | **SDCI ADU page** (current), **SDCI Tip 116B** (Aug 2023 - OUTDATED on zoning standards; still valid on building-code items such as emergency-escape windows, separate heating controls, King County sewer capacity charge) | Practical/non-zoning requirements |
| S7 | **Seattle GIS** (services.arcgis.com/ZOyb2t4B0UYuYNYH): `Current_Land_Use_Zoning_Detail_2` (fields ZONING, BASE_ZONE, SHORELINE, HISTORIC, OVERLAY), `Frequent_Transit_Service_Area`, `Major_Transit_Stop_Half_Mile_Walksheds`, `Landmarks` | Zone, overlay and transit facts |

## Verbatim operative text (S1, SMC 23.42.022)
> A. Accessory dwelling units are allowed as a housing use in all zones where housing uses are allowed. In the Shoreline District, accessory dwelling units shall comply with Chapter 23.60A.
> C. No lot may have more than two accessory dwelling units. D. Accessory dwelling units may be attached, detached, or stacked.
> E. Unless otherwise provided in the standards of the underlying zone, accessory dwelling units shall be subject to the same standards as principal dwelling units.
> F. Accessory dwelling units must be located on the same lot as the principal dwelling unit.
> G.1.a The gross floor area of an accessory dwelling unit with up to two bedrooms may not exceed 1,000 square feet ... b. ... three or more bedrooms may not exceed 1,200 square feet ... c. [1,500 sq ft only if the lot is in an LR zone, in a frequent transit service area, and not purchased for more than $1,000 in the past 20 years].
> G.2 The following are not included in the gross floor area limit: a. Up to 250 square feet of gross floor area in an attached garage; b. All stories, or portions of stories, that are underground; and c. Up to 35 square feet ... long-term bicycle parking.
> H.3 An existing accessory structure [existing prior to July 23, 2023] may be converted into a detached accessory dwelling unit ... b. Conversion ... is permitted notwithstanding applicable lot coverage or yard or setback provisions in this Section 23.42.022 or the applicable zone. The converted accessory structure shall comply with the minimum standards set forth in Sections 22.206.020 through 22.206.140.
> H.4 The gross floor area of an attached accessory dwelling unit may exceed 1,000 square feet if the portion of the structure in which the attached accessory dwelling unit is located existed as of July 23, 2023.
> I. No off-street motor vehicle parking is required for an accessory dwelling unit. J. When calculating density, the number of dwelling units shall include both accessory dwelling units and principal dwelling units.

## What the NR development standards mean for an ADU (S3-S5)
- **Density (23.44.060):** ordinary density is **one dwelling unit per 1,250 sq ft of lot area** (fractions over 0.85 round up); **a lot under 5,000 sq ft may have up to four units** (no B-area ECA present); **under 7,500 sq ft and within a quarter mile of a major transit stop: up to six**. ADUs count in density. Lot area for density excludes riparian corridors, wetlands and buffers, submerged/shoreline-setback areas and designated steep-slope non-disturbance areas (60.D.6); where such areas exist the alternative calculation C.4 applies.
  **Consequence:** an existing house plus up to two ADUs (3 units) is within density on every ordinary parcel; the ECA exclusion areas are the only thing that can bind, and they are unknowable from advisory maps (the same limitation as lot coverage).
- **FAR (23.44.050):** limit depends on density (units per lot size) *including the ADUs*: 0.6 (less dense than 1/4,000), 0.8 (1/4,000-1/2,201), 1.0 (1/2,200-1/1,601), 1.6 (1/1,600 or denser); lots under 5,000 sq ft may have up to 2,500 sq ft regardless. Applies to total chargeable floor area of all structures; exempt: underground, portions of a story up to 4 ft above grade, Type A units. **Adding ADUs raises the density band and therefore the FAR limit** - a customer-relevant, deterministic effect.
- **Lot coverage (23.44.080):** 50%; decks <= 36 in and unenclosed structures meeting 23.44.090.H are not counted; ECA exclusion areas shrink the denominator (the existing Capability C tolerance model applies unchanged).
- **Setbacks (23.44.090 Table A):** front 15 ft (1-2 dwelling units; 10 ft for 3+ *principal* units); **rear for an ADU 5 ft, none if the rear abuts an alley (footnote 3)**; side 5 ft average / 3 ft minimum (3 ft on lots under 5,000 sq ft in a frequent transit service area); through lots: every street-abutting setback is a front setback (B).
- **Height (23.44.070):** 32 ft generally (42 ft with tree retention); **12 ft for accessory structures in required setbacks**, with the pitched-roof ridge allowance.
- **Separation (23.44.100):** **5 ft** minimum between structures containing floor area (2 ft more than a driveway/aisle width, max 24 ft, if separated by one); eaves may project 2 ft.
- **Amenity area (23.44.110):** 20% of lot area for attached/detached units, at least 120 sq ft with 8 ft minimum width/depth, unenclosed, no parking/driveways; **no amenity area for one new dwelling unit added to a dwelling existing as of January 1, 1982**.
- **Trees (23.44.120):** tree points per lot area by density band (1 point per 500/600/675/750 sq ft) or one new tree per 2,500 sq ft, whichever is greater.
- **Design (23.44.140):** each unit needs a >= 3 ft pedestrian path to the sidewalk/front lot line; a structure within 40 ft of a street lot line needs a street-facing entry with 3x3 ft weather protection and 20% windows/doors on the street-facing facade. **Structure width <= 90 ft** (23.44.130).
- **Parking:** none required (23.42.022.I). **Owner occupancy:** no requirement in the current text (a release form for legacy covenants exists - a recorded covenant on title is a title matter, not evaluated).

## Practical (non-zoning) items (S6)
King County sewer capacity charge (billed after SDCI reports the connection); emergency-escape windows, separate heating controls, smoke/CO alarms; side sewer / stormwater / City Light service changes; conversions need Seattle Energy Code compliance; "tiny houses on wheels" cannot be lived in. These are disclosed, not evaluated.

## Platform discovery: zoning has never been verified
The Seattle GIS zoning layer answers "which zone" per parcel with `ZONING`/`BASE_ZONE` (`NR` is a single value), `SHORELINE`, `HISTORIC`, `OVERLAY`. A live check shows the long-standing "NR test parcel" **3298700485 is zoned LR1 / LR3 RC**, not NR - so every NR-only rule (shed, fence, deck) has been applied with zoning never verified. Verifying zoning is therefore a correctness fix for the live types as well as the ADU prerequisite.
