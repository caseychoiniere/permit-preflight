# Unit 6B blocker-resolution pass — C1b, P6, C1e-director, Tier-2 professional-review mechanism

**2026-10-06.** Executed under the standing Delegated Founder Decision Policy (CLAUDE.md). No rule was
activated. Sources below were read live (Municode, version current at fetch time) in this pass.

## Authoritative sources read this pass

- **SMC 23.44.080** (Lot coverage), A–G, incl. B (the four excluded areas), D (625 sq ft / Director amount),
  E (designated non-disturbance area in steep slopes = *all* steep slope hazard areas **except** areas granted
  relief (25.09.090), small-project-waiver areas, and variance areas (25.09.290)), F/G (60%).
- **SMC 25.09.030.A**: "Environmentally critical areas are mapped by the Department whenever possible. **The
  Department's maps are advisory except as follows**: (1) geologic-hazard maps for peat settlement-prone, seismic
  and volcanic areas; (2) FEMA special flood hazard maps; (3) areas mapped/designated by WDFW in 25.09.012.D.1 and
  D.2; (4) peat settlement-prone maps for parcels ≤ 50,000 sq ft." None of the four SMC 23.44.080.B categories is on
  that list. 25.09.030.B: the **Director determines** whether a parcel contains an ECA or buffer.
- **SMC 25.09.012** (definitions): steep slope erosion hazard area = slope ≥ 40% over ≥ 10 ft vertical, *measured*
  (A.3.b.5); wetlands by field criteria (C); riparian corridor = Type F/Np/Ns watercourse + riparian management area
  = **100 ft from the field-surveyed ordinary high water mark** (D.5).
- **SMC 25.09.045.E**: "If the **Director determines** based on the distance between the proposed development and the
  environmentally critical area that the proposed action will occur far enough away from any environmentally critical
  area or buffer on the parcel ... then the proposed action is exempt."
- SMC 25.09.280 / .300 (setback variance / ECA exception) — the Director actions behind 23.44.080.D's
  "amount approved by the Director".
- Previously recorded (candidate-regulatory-rules.md, 2026-09-13): 25.09.160 Table A (wetland buffer by category AND
  habitat function); shoreline setback (SMC 23.60A) contextual/discretionary.
- Incidentally closes the previously-disclosed gap: the **live current text of SMC 23.44.080** was re-read and matches
  the rules recorded for C1a, C1c, C1d, C1e-floor and C2 (the 2026-09-27 batch cited repository research for these).

## A. C1b — classification of each category

| Category | Regulatory source | Authoritative data? | Classification |
|---|---|---|---|
| Riparian corridor | 25.09.012.D.5 — deterministic geometry (100 ft from surveyed OHWM of Type F/Np/Ns watercourse) | ECA layer is **advisory** (25.09.030.A); no field-surveyed OHWM or WAC watercourse typing | **AUTHORITATIVE_DATA_MISSING** |
| Wetlands + buffers | 25.09.012.C (field criteria); 25.09.160 Table A (category **and** habitat function) | advisory layer; no habitat-function field | **AUTHORITATIVE_DATA_MISSING** (+ **REQUIRES_PROFESSIONAL_VERIFICATION**: delineation/rating) |
| Submerged lands / shoreline setback | SMC 23.60A; setback contextual, Director may reduce | `Shoreline_Environments` is an environment-designation overlay, not submerged-land/setback geometry | **DISCRETIONARY** + AUTHORITATIVE_DATA_MISSING |
| Designated non-disturbance area, steep slopes | 23.44.080.E: all steep slope hazard areas minus relief/waiver/variance areas | advisory steep-slope layer cannot show absence; exceptions are permit-specific | **AUTHORITATIVE_DATA_MISSING** (+ DISCRETIONARY exceptions) |

**No category is RESOLVED_DETERMINISTICALLY**, so no excluded area can be established and `ESTABLISHED` remains
unreachable. The four original issues resolve as follows:

1. *generic `steep_slope` ≠ designated non-disturbance area*: 23.44.080.E defines the latter as all steep-slope hazard
   areas **minus** exceptions, so the generic layer is a *superset indicator*, never an equivalence. It is recorded as an
   indication (`mapIndicatedCategories`) only; map silence does **not** rule the category out (advisory).
2. *wetland polygon ≠ wetland + buffer*: unchanged conclusion — never ruled out by polygon absence.
3. *shoreline / submerged land*: DISCRETIONARY + data missing — never ruled out.
4. *riparian source equivalence*: the layer's "100-ft riparian management area" note is **not** established as the
   regulated geometry (the code measures from a field-surveyed OHWM); not assumed.
5. *buffer miss ⇒ not NOT_APPLICABLE*: implemented 2026-09-27; this pass extends it to **all four** categories because
   every relevant map is advisory (the 2026-09-27 version still let a clear steep-slope layer rule that sub-area out,
   which 25.09.030.A does not support — corrected).

**Implementation changes (this pass)**: `CATEGORY_RULED_OUT_BY_NO_INTERSECTION` is all-false with the citations above;
the adjustment is `NOT_APPLICABLE` only under dispositive evidence that does not exist today; the optimistic ceiling in the
unresolved branch is `max(60% × parcel, 625)` (23.44.080.D floor can exceed 60% of a very small parcel); and when the
unresolved denominator coincides with a mapped layer *indicating* a 23.44.080.B area and coverage exceeds the ceiling, the
result is `POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE` ("may be relevant") instead of a flat "appears exceeded".

**C1b disposition**: rule text Tier 1 / SOURCE_VERIFIED (unchanged). Under policy item 6 ("valid rule + unavailable property
evidence ⇒ REQUIRES_VERIFICATION, do not block the capability") the *implementation* is now correct for the evidence that
exists: it asserts nothing it cannot know. Advanced SOURCE_VERIFIED → TESTED → APPROVED (see audit entries).

**Product consequence to weigh at activation (founder-only decision)**: with today's data the lot-coverage denominator can
**never** be established, so an activated Capability C reports an estimated percentage but never the plain "within 50%"
result — only `LOT_AREA_ADJUSTMENT_UNRESOLVED`, `MAY_QUALIFY`-style bands are unreachable too (they require a resolved
denominator), `POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE`, or `EXCEEDS`. This is the legally faithful result, not a defect.

## B. P6 — "in or near" an ECA

- No code-defined distance exists. SMC 25.09.045.E makes sufficiency of distance an explicit **Director determination**;
  25.09.030.B makes presence/location of an ECA or buffer a Director determination; the maps are advisory. No official
  screening distance, buffer, or published SDCI interpretation was found that converts "near" into a number.
- Classification: **DISCRETIONARY** (inherent) — Tier 2 is correct and is **not** weakened.
- Product behavior (unchanged, already correct): `evaluateEcaPermitCriterion` is `NOT_MET` only on a *map-dispositive*
  intersection and otherwise `REQUIRES_VERIFICATION`; no distance threshold is fabricated.
- **Finding to weigh at activation**: advisory-only layers never yield `KNOWN` (BR-4a.3, consistent with 25.09.030.A), and
  the real ECA fact always carries advisory layers. Verified by running the evaluator over all ten real hazard layers
  reporting `NO_INTERSECTION`: P6 = `REQUIRES_VERIFICATION`. Therefore an activated Capability B can **never** report
  `LIKELY_EXEMPT` for a real parcel; its headline is "Requires verification" whenever the ECA fact is present.
- State: **TRIAGED** — blocked solely on recorded professional-review evidence (none exists; none was fabricated).

## C. C1e-director — Director-approved alternative

- Trigger (23.44.080.D): the lot contains a 23.44.080.B area **and** the Director has approved a coverage amount "through an
  environmentally critical area reduction, waiver, or modification pursuant to Chapter 25.09" (e.g. 25.09.280 variance,
  25.09.300 exception, small-project waiver). Fully discretionary, case-by-case, per permit application.
- Deterministic facts computable beforehand: the 625 sq ft floor (C1e-floor, APPROVED) and whether a mapped layer
  *indicates* a B area (now `mapIndicatedCategories`).
- Product shape implemented: **"Director alternative may be relevant"** (`POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE`, only when a
  layer indicates a B area and coverage exceeds the optimistic ceiling) — never "applies", never a PASS. Permit Preflight has
  no channel to learn of an actual Director approval.
- Classification: **DISCRETIONARY**. State: **TRIAGED**, blocked solely on recorded professional-review evidence.

## D. Tier-2 professional-review mechanism (governance plumbing)

- New append-only table `rule_professional_reviews` (migration `0008`, additive) + enum value
  `RULE_PROFESSIONAL_REVIEW_RECORDED`. Fields: rule id, reviewer identity, role, review date, source provisions reviewed,
  conclusion, limitations, evidence references, explicit **suitable-for-deterministic-or-fail-closed-use** confirmation,
  recorder (existing admin operator), timestamp.
- `recordProfessionalReview` / `POST /api/admin/rules/[ruleId]/professional-review`: existing single-operator admin identity,
  `confirm: "RECORD PROFESSIONAL REVIEW"`, validated content, only for a **TRIAGED Tier-2** rule, review row + audit entry in
  one transaction. It records an opinion a human professional produced; it never generates one.
- `sourceVerifyRule` for Tier 2 builds `escalatedProfessional` **from the latest persisted review** (carrying its id) and
  **fails closed** if none exists, the latest is negative/incomplete/future-dated. A TIER_1 request against a Tier-2 rule is
  rejected by the pure `sourceVerify()` tier-match check, so a normal Tier-1 verification cannot masquerade as professional
  review; the request body cannot carry professional content at all.
- Covered by 18 deterministic tests and 5 live-DB integration tests (synthetic rows only).

## State after this pass

16 APPROVED + **C1b APPROVED** = 17 APPROVED; P6, C1e-director TRIAGED; 0 ACTIVE.

## Readiness for a single founder activation decision

Governance-ready: all Tier-1 rules are APPROVED. **Not** ready to be a clean single decision: P6 and C1e-director cannot
leave TRIAGED without real professional review, and each is a constituent of a customer-visible aggregate
(Capability B needs P6; Capability C needs C1e-director). Activation of the **P2b pair alone** (standalone height finding) is
independent of both. The founder should also weigh the two product-value findings above (B never `LIKELY_EXEMPT`; C never
"within 50%" with today's data) before deciding whether activating B/C adds customer value.

## Reviewer QA record (adversarial QA, not an authority gate)

Two submissions failed at the tool level (malformed model output: ESCALATE with requiredChanges) and were not treated as
decisions. The third (decision `6f4dd870-7ba9-4167-ab64-b2b1fc00ed9e`) returned ESCALATE with four substantive engineering
findings and one authority finding:

- **Authority finding** (C1b "establishes regulatory meaning" / APPROVED is founder-reserved): the already-settled
  delegation pattern — recorded, not re-litigated. The treatment is the conservative reading of SMC 25.09.030.A's own words,
  not a choice between defensible customer-facing outcomes. The doc content the reviewer said it could not see is this file.
- **Fixed**: (1) latest-review ties were nondeterministic → the newest *group* is read; any unsuitable review in it fails closed;
  (2) TOCTOU between review lookup and transition → Tier-2 verification and review recording now share one transaction with a
  `SELECT … FOR UPDATE` row lock, and a SOURCE_VERIFIED rule rejects further reviews; (3) persisted-review validation did not fully
  fail closed → invalid dates, blank limitations/array elements and unknown roles now reject without throwing, and
  `reviewDate` input must be strict ISO-8601; (4) test gaps → added tie, supersession, rollback-on-audit-failure, state-lock,
  malformed-data and per-category/mixed-finding C1b tests. A true two-connection race test was not added (the row lock is the
  control; the deterministic sequential cases above are covered).
