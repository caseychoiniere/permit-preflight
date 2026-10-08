# Unit 7 — Fences: Functional Design (research, rule inventory, evaluation semantics)

**2026-10-08.** Started under the founder's Continuous Autonomous Execution Policy (2026-10-08) immediately after Unit 6B's 17 rules were
activated and smoke-verified. Planned scope source: `unit-of-work.md` §Unit 7 and story SRE-FENCE-1 ("height-by-location rules ...
corner-lot sight-distance rules per PR-5 ... likely-buildable / conditionally-buildable / constrained"). Unit 7 is flagged in
`requirements.md` §1.4 as low per-project value, so the design deliberately stays small: deterministic, declared-input, fail-closed,
no new data source and no spatial placement.

## 1. Sources (current, authoritative — all fetched live 2026-10-08)

| # | Source | What it controls |
|---|---|---|
| S1 | **SMC 23.44.090.H.4 "Fences" and H.5 "Bulkheads and retaining walls"**, Municode Library (CURRENT), `(Ord. 127376, § 31, 2025)`. Chapter 23.44 is "Neighborhood Residential"; the pre-2025 citation SMC 23.44.014 no longer exists (see `2026-09-17-side-street-setback-current-code-research.md`). | Zoning height limits for fences in required setbacks |
| S2 | **SMC 23.44.090 Table A + B** (same section): Front 15 ft (1–2 dwelling units) / 10 ft (3+); Rear per table; Side 5 ft avg / 3 ft min; through lots: every street-abutting setback is a front setback. | What a "required setback" is |
| S3 | **2021 Seattle Residential Code, Chapter 1, R105.2 "Work exempt from permit"** (Seattle amendments; SDCI `2021SRCChapter1.pdf`, text extracted from the PDF itself): item 4 *"Fences not over 8 feet high that do not have masonry or concrete elements above 6 feet"*; item 6 retaining walls ≤ 4 ft from bottom of footing with ECA/surcharge/steep-slope/adjoining-property conditions; preamble: exemption "does not authorize any work to be done in any manner in violation of this code or any other laws or ordinances". | Building-permit exemption |
| S4 | **SDCI "Fences" page** (current): permit not needed for ≤ 8 ft without masonry/concrete over 6 ft, **but a construction permit is needed "if the fence will be located in a flood-prone area"**; "most fences [needing a permit] require only a construction subject-to-field-inspection permit"; on a slope a fence may be 8 ft "if the average height between posts is 6 feet"; if the retaining wall *lowers* grade, normal fence limits apply. | Flood-prone permit condition; permit path context |

| S5 | **SMC 23.44.070.A "Maximum height established"** (same Municode chapter, CURRENT). Verbatim: *"1. Subject to the exceptions allowed in this Section 23.44.070, the height limit is 32 feet for any structure not listed in subsections 23.44.070.A.2 or 23.44.070.A.3; 2. The height limit is 42 for the following types of development: ... 3. The height limit for accessory structures that are located in required setbacks is 12 feet, except as follows: ..."* | General bound outside required setbacks (A.1: 32 ft; A.2: 42 ft for certain developments); A.3's 12 ft in-setback accessory cap is not binding on fences because H.4 specifically limits them to 8 ft or less |
| S6 | **2021 SRC R105.1 "Permits required"** (same PDF). Verbatim: *"Except as otherwise specifically provided in this code, a building permit shall be obtained from the building official for each building or structure prior to erecting, constructing, enlarging, altering, repairing, moving, improving, removing, changing the occupancy of, or demolishing such building or structure... All work shall comply with this code, even where no permit is required."* Plus SDCI Fences page: *"If you're building a taller fence, you need a construction permit."* | The general rule from which "permit required" follows when R105.2 item 4's conditions are not met |

**Correction recorded:** earlier project documents and generic summaries cite "fences not over 7 feet" (the IBC model-code wording). The
controlling Seattle text (S3) is **8 feet, with a masonry/concrete-above-6-ft exception**. S3 and S4 agree.

### Verbatim operative text (S1, SMC 23.44.090.H.4–H.5)
> **4. Fences** a. Fences no greater than 6 feet in height are allowed in any required setback, except that fences in the required front
> setback extended to side lot lines or in street side setbacks extended to the front and rear lot lines may not exceed 4 feet in height.
> Fences located on top of a bulkhead or retaining wall are also limited to 4 feet. If a fence is placed on top of a new bulkhead or
> retaining wall used to raise grade, the maximum combined height is limited to 9.5 feet.
> b. Except for fences in the required front setback extended to side lot lines or in street side setbacks extended to the front and rear
> lot lines, up to 2 feet of additional height for architectural features such as arbors or trellises on the top of a fence is allowed if
> the architectural features are predominately open.
> c. Fence height may be averaged along sloping grades for each 6-foot-long segment of the fence, but in no case may any portion of the
> fence exceed 8 feet in height when the height allowed by subsection 23.44.090.H.4.a is 6 feet, or 6 feet in height when the height
> allowed by subsection 23.44.090.H.4.a is 4 feet.
> **5. Bulkheads and retaining walls** a. Bulkheads and retaining walls used to raise grade are allowed in any required setback if they are
> limited to 6 feet in height, measured above existing grade. b. Bulkheads and retaining walls used to protect a cut into existing grade
> may not exceed the minimum height necessary to support the cut or 6 feet measured from the finished grade on the low side, whichever is
> greater. Any fence shall be set back a minimum of 3 feet from such a bulkhead or retaining wall.

## 2. Scope and honesty model

- **Declared-input evaluation.** A fence is a line, not a placed rectangle; no map placement is collected. Every input is user-declared and is
  labeled as such in the report ("based on what you told us"). No finding is presented as a measurement of the site.
- **Zone scope.** Rules carry `applicableZone: "NR"` exactly like the shed rules; S1 governs NR zones. Multifamily and other zones are not
  evaluated (SDCI's page says similar limits exist in multifamily zones, but that is not code text Permit Preflight has verified). No zoning fact is
  retrieved for any project type today (the shed and garage paths share this limitation), so for fences - new ground - **every report carries an
  always-emitted REQUIRES_VERIFICATION finding, "Zoning applicability (Neighborhood Residential zones)"**, stating that the parcel's zoning was not
  verified, that Permit Preflight cannot confirm these rules apply, and that a parcel in another zone can have different limits.
- **Never claims (explicit non-goals, shown as fixed disclosures):** corner-lot / driveway / alley sight-distance rules (PR-5), public
  right-of-way and street-use permits, fences on or near property lines (boundary and neighbor matters), covenants/HOA, critical-area and
  shoreline restrictions, lot coverage and other zoning standards beyond fence height-by-location, and retaining walls beyond the
  fence-related checks below. None of these is evaluated; none is implied to be satisfied.
- **Not purchasable until a founder decision.** Following the Unit 4/5 precedent, a hardcoded `isFenceScreeningCoverageReady() === false`
  keeps fences out of the public type list and public checkout. The capability is fully built and internally testable
  (INTERNAL_PROTOTYPE path). No fence rule is activated by this unit (activation is a founder decision).

## 3. Intake model (`FenceProjectConfiguration`) — every field declared, nothing defaulted silently

| Field | Meaning | Rule |
|---|---|---|
| `heightFt` | Fence height above existing or finished grade (whichever is lower); on a slope, the greatest 6-ft-segment average | required, 0 < h ≤ 20 |
| `locations[]` | `FRONT_SETBACK` (the required front setback, extended to the side lot lines), `STREET_SIDE_SETBACK` (corner lot: the setback along the side street, extended to front and rear lot lines), `OTHER_SIDE_OR_REAR_SETBACK`, `OUTSIDE_REQUIRED_SETBACKS` | required, 1–4 unique values; a fence that crosses regions lists each |
| `openFeatureHeightFt` | height of a predominantly-open arbor/trellis on top; omitted = none | optional, 0 ≤ h ≤ 4 |
| `siteSlopes` | whether the fence follows sloping grade (heights averaged per 6-ft segment) | required boolean |
| `tallestPortionHeightFt` | greatest height of any portion; required to settle the absolute cap when `siteSlopes` | optional, ≥ `heightFt` |
| `wallRelation` | `NONE`, `ON_NEW_WALL_RAISING_GRADE`, `ON_OTHER_WALL_OR_BULKHEAD`, `SET_BACK_FROM_CUT_WALL` | required (no default) |
| `wallHeightFt` | wall height (above existing grade for a raising-grade wall) | required iff `wallRelation` is not `NONE` |
| `cutWallSetbackFt` | distance from the fence to a grade-cutting wall | required iff `SET_BACK_FROM_CUT_WALL` |
| `hasMasonryOrConcreteAbove6Ft` | any masonry/concrete element above 6 ft | optional tri-state; unanswered is allowed and unresolved only when the fence exceeds 6 ft |

## 4. Rule inventory (eight governance rows; all Tier 1; NR zone; EXISTING_PROPERTY / `fence`)

| ID | ruleType | Claim | Source | Consumed by |
|---|---|---|---|---|
| F1 | `FENCE_F1_HEIGHT_LIMIT_STANDARD` | Required setbacks other than front/street-side: body ≤ 6 ft; up to +2 ft predominantly-open feature; absolute cap 8 ft | S1 H.4.a–c | height findings (side/rear) |
| F2 | `FENCE_F2_HEIGHT_LIMIT_FRONT_STREET_SIDE` | Front setback (extended to side lot lines) and street-side setback: ≤ 4 ft total, **no** feature allowance, absolute cap 6 ft | S1 H.4.a–c | height findings (front / street side) |
| F3 | `FENCE_F3_RETAINING_WALL` | On top of any bulkhead/retaining wall: fence ≤ 4 ft; on a new raising-grade wall: combined ≤ 9.5 ft and wall ≤ 6 ft above existing grade; cut wall: fence set back ≥ 3 ft (otherwise normal limits) | S1 H.4.a, H.5.a–b | wall finding, location limits |
| F4 | `FENCE_F4_OUTSIDE_REQUIRED_SETBACKS` | SMC 23.44.090.H.4 governs fences "in any required setback"; for a fence declared outside every required setback this screening identifies **no fence-specific height limit**, and the general structure height limit (S5: 32 ft, or 42 ft for A.2 developments) is the lowest bound identified. Intake caps a fence at 20 ft, below either bound. The finding is worded as "no limit identified among the provisions evaluated", never as general compliance | S1 (scope of H.4) + S5 (A.1/A.2) | height finding (outside) |
| F5 | `FENCE_F5_PERMIT_HEIGHT_EXEMPTION` | Fence not over 8 ft high (including any top feature) satisfies the height prong of the permit exemption | S3 R105.2 item 4 | permit aggregate |
| F6 | `FENCE_F6_PERMIT_MASONRY_CONCRETE` | No masonry/concrete element above 6 ft satisfies the second prong | S3 R105.2 item 4 | permit aggregate |
| F7 | `FENCE_F7_EXEMPTION_NOT_ZONING_COMPLIANCE` | Exemption from permit is not compliance with zoning or other law (report-layer disclaimer; gates no evaluation, but the disclaimer is a governed claim emitted only while F7 is ACTIVE) | S3 R105.2 preamble | report disclaimer only |
| F8 | `FENCE_F8_PERMIT_FLOOD_PRONE_CONDITION` | SDCI states a construction permit is needed for a fence "located in a flood-prone area". Stated only as an **attributed, unresolved consideration** (always REQUIRES_VERIFICATION; the underlying code section is not identified on SDCI's page, so the product never decides it) | S4 | "turns only on flood-prone status" permit result |

Why Tier 1 (not Tier 2): F1-F6 are numeric thresholds in current code text, with no Director judgment, interpretive latitude, or
unresolved source conflict. The two qualitative elements are handled **without** a rule claiming to resolve them: "predominately open" is
never asserted (a declared feature always yields REQUIRES_VERIFICATION), and flood-prone status is a data limitation, not a rule (§6).

## 5. Height evaluation (pure; one finding per declared location)

Let `top = (siteSlopes ? tallestPortionHeightFt : heightFt) + (openFeatureHeightFt ?? 0)`, `body = heightFt`.

- **`FRONT_SETBACK` / `STREET_SIDE_SETBACK`** (F2; if `wallRelation` ∈ {ON_NEW_WALL, ON_OTHER_WALL}: also F3's 4 ft): limit 4 ft, cap 6 ft, no feature allowance, so the
  tested height is `body + feature` (and `top` against the cap).
  KNOWN PASS if `body + feature ≤ 4` and `top ≤ 6` (with `siteSlopes` and no tallest portion given: REQUIRES_VERIFICATION for the cap only when
  `body + feature ≤ 4`; the cap cannot be settled); KNOWN FAIL if `body + feature > 4` or `top > 6`.
- **`OTHER_SIDE_OR_REAR_SETBACK`** (F1; wall on top: 4 ft via F3): body ≤ 6 (≤ 4 on a wall); a declared feature (≤ 2 ft) yields REQUIRES_VERIFICATION
  (eligibility turns on "predominately open", a qualitative SDCI determination), a feature > 2 ft is a KNOWN FAIL; `top ≤ 8` cap.
  KNOWN FAIL if `body > 6` (or `> 4` on a wall), or `top > 8`; KNOWN PASS otherwise when no feature; unresolved cap as above.
- **`OUTSIDE_REQUIRED_SETBACKS`** (F4): KNOWN PASS statement of scope (no H.4 limit; bounded by 32 ft); never a statement that the fence is
  otherwise compliant. On a sloping site with no tallest portion declared it is **REQUIRES_VERIFICATION** (the general limit cannot be confirmed), and a
  known excess is still a definite FAIL (reviewer decision 333344f2: an earlier draft returned PASS from the lower bound).
- **Wall finding** (F3, only if some declared location is a required setback and `wallRelation ≠ NONE`):
  `ON_NEW_WALL_RAISING_GRADE`: wall ≤ 6 ft above existing grade, `wall + (body + feature) ≤ 9.5`, fence ≤ 4 ft; `ON_OTHER_WALL_OR_BULKHEAD`: fence ≤ 4 ft (wall height rules not
  determinable: REQUIRES_VERIFICATION note); `SET_BACK_FROM_CUT_WALL`: `cutWallSetbackFt ≥ 3` PASS else FAIL (the wall's own "minimum height necessary
  to support the cut" is a geotechnical matter — disclosed, not evaluated).
- Multiple locations: independent findings; the report shows each. The most restrictive governs the customer-visible summary ordering.

All arithmetic is on declared numbers; ties at a limit PASS ("no greater than").

## 6. Building-permit determination (`FencePermitRequirement`)

Criteria: **HEIGHT** (F5: `top ≤ 8` MET; `> 8` NOT_MET; sloping site without tallest portion REQUIRES_VERIFICATION unless `body + feature > 8`
already), **MASONRY_CONCRETE** (F6: MET if `top ≤ 6` or declared false; NOT_MET if declared true and `top > 6`; REQUIRES_VERIFICATION if `top > 6`
and unanswered), **FLOOD_PRONE** (deferred consideration — never MET, never NOT_MET: SDCI's flood-prone permit condition (S4) rests on
mapping Permit Preflight does not treat as dispositive; a mapped flood layer that indicates a possible intersection is disclosed as
context only, "not used to decide this criterion").

`buildingPermit`: `REQUIRED` if any evaluated criterion is NOT_MET (one active conclusive disqualifier suffices). The inference is textual, not
interpretive: R105.1 (S6) requires a building permit for each structure except as specifically provided, R105.2 item 4 specifically provides an
exemption only for fences "not over 8 feet high that do not have masonry or concrete elements above 6 feet", and SDCI states a taller fence needs
a construction permit — so a fence outside that exemption has no exemption under the code. Otherwise
`REQUIRES_VERIFICATION`. **`LIKELY_EXEMPT` does not exist for fences** while flood-prone status cannot be determined — same discipline as
Unit 6B Capability B. When HEIGHT and MASONRY are MET the report says: *"All other screened building-permit exemption criteria are met. The
remaining question is whether the site is in a flood-prone area, where SDCI requires a construction permit. Permit Preflight cannot
determine that conclusively from available mapping; SDCI makes that determination."* When `REQUIRED`, the report adds the sourced note that
SDCI states most fences needing a permit require only a subject-to-field-inspection permit (S4) — attributed, not computed.

**Outcome dependencies (explicit table, evaluate-fence.ts):** REQUIRED-by-height needs F5 ACTIVE; REQUIRED-by-masonry needs F6; the
REQUIRES_VERIFICATION result (which states SDCI's flood-prone condition) needs F5, F6 **and F8**; the flood-prone criterion row appears only while F8 is
ACTIVE; the exemption disclaimer appears only while F7 is ACTIVE; each location's height finding needs its rule (F2 / F1 / F4) and F3 when a wall is declared.
A claim whose rule is not ACTIVE is not made; the location is listed in `uncovered-constraint-types` so the report shows the existing
"no active rule coverage" notice rather than an empty clean result.

## 7. Report presentation

- Height findings are ordinary `Finding`s (flow through the existing Findings list and Report Explanation like every other finding).
- Structured evidence: `fence-declared-inputs` ("what you told us"), `fence-permit-requirement`, `uncovered-constraint-types`.
  The permit aggregate reaches the artifact only as evidence (never as a Finding), so the explanation LLM cannot restate or override it —
  the Unit 6B invariant.
- **Sight distance is retained as an explicit unresolved item, not dropped (SRE-FENCE-1 / PR-5).** When any declared location is
  `FRONT_SETBACK` or `STREET_SIDE_SETBACK`, a REQUIRES_VERIFICATION `Finding` ("Corner-lot, driveway and alley sight-distance requirements")
  states that such visibility requirements may limit a fence or other obstruction near an intersection, driveway or alley, that Permit Preflight
  has no intersection/driveway geometry or verified rule text for this and so does not evaluate it, and that SDCI/SDOT determine it. It is an ordinary
  Finding (visible in the Findings list and the "Requires verification" styling), not a footer. Evaluating it is future work and would need
  data this unit does not add; this unit makes **no** statement that sight-distance rules are satisfied.
- Fixed disclosures (never evaluated, never implied satisfied): driveway/alley visibility beyond the finding above; right-of-way and street-use;
  boundary/neighbor/covenant matters; critical-area and shoreline; other zoning standards; retaining walls beyond the fence checks.
- Web and PDF print identical text, generated once in the evaluator, and parity is test-enforced through the dev preview harness.

## 8. Readiness gating and rollout

`isFenceScreeningCoverageReady()` is hardcoded `false`. Fences are creatable/validatable/evaluable (internal development, INTERNAL_PROTOTYPE
generation), absent from the public type list, and blocked at public checkout with the same message shape as garage. Flipping the flag and
activating the eight rules are founder decisions and are **not** part of this unit.

## 8b. Reviewer QA record (2026-10-08, decision 50af47ff-3dbf-4881-8b1f-35240796617c)
`aidlc-reviewer` returned ESCALATE / RESERVED_FOUNDER. Triage under the Delegated Founder Decision Policy and the Continuous Autonomous
Execution Policy:
- **Recorded, not a defect:** "creating Tier 1 rules and advancing them to APPROVED is founder-reserved." The continuous policy lists
  lifecycle advancement as routine; only APPROVED → ACTIVE is founder-only and it is out of scope here (rules stop at APPROVED).
- **Fixed — F4 traceability:** S5 (23.44.070.A) is now quoted; F4 is scoped to "no limit identified among the provisions evaluated" and
  records the 42 ft A.2 alternative.
- **Fixed — permit-REQUIRED inference:** S6 (SRC R105.1 + SDCI) is now quoted; the inference is shown to be textual (general rule + a
  specific, narrower exemption).
- **Fixed — sight distance:** retained as an explicit unresolved Finding (§7) instead of only a footer, so SRE-FENCE-1's corner-lot
  sight-distance element is surfaced as REQUIRES_VERIFICATION rather than silently dropped. It does not change the customer promise: the
  report never claimed to evaluate it.

### Second reviewer QA (implementation, 2026-10-08, decision 333344f2-057f-4bab-a9f8-410fa8c1660c)
ESCALATE / RESERVED_FOUNDER again on authority grounds (Tier 1 creation / APPROVED advancement; the F4, permit-REQUIRED and flood meanings) - recorded,
not defects (design §8b rationale unchanged: lifecycle advancement is routine under the Continuous Autonomous Execution Policy; only ACTIVE is
founder-only; the F4 and permit-REQUIRED meanings are now fully quoted from source). Real engineering findings, **all fixed**: (1) outside-setback KNOWN
PASS with an unknown tallest portion on a slope -> REQUIRES_VERIFICATION; (2) F7's disclaimer emitted without F7 ACTIVE -> now gated; (3) the flood-prone
statement had no governed rule -> new rule F8, and the "turns only on flood-prone status" result now depends on it; (4) NR applicability never verified ->
always-emitted zoning-applicability finding (same limitation as shed/garage, now stated in the report rather than assumed); (5) the governance script
defaulted the operator identity -> it must now be supplied explicitly at invocation.

## 9. Founder-only items surfaced (none block this unit)

None. No pricing, scope change, regulatory interpretation with multiple defensible outcomes, security/privacy change, or irreversible
commitment is involved: all rules are numeric current-code text; ambiguity is resolved fail-closed to REQUIRES_VERIFICATION.
