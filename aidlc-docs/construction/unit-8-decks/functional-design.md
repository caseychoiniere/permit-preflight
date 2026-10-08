# Unit 8 — Decks: Functional Design (research, rule inventory, evaluation semantics)

**2026-10-08.** The next planned unit (`unit-of-work.md` §Unit 8; story SRE-DECK-1: "setback rules specific to attached/detached decks and
height-above-grade thresholds ... including its attachment to an existing structure"), started automatically under the founder's Continuous
Autonomous Execution Policy after Unit 7. Same shape as Unit 7: a **declared-input** evaluation (no map placement, no new data source), fail-closed,
rules advanced to APPROVED only, never publicly available until a founder decision.

## 1. Sources (current, authoritative — read live 2026-10-08)

| # | Source | Controls |
|---|---|---|
| S1 | **SMC 23.44.090.H.1** (Ord. 127376, § 31, 2025; Municode CURRENT): *"All unenclosed structures not more than 18 inches above existing or finished grade, whichever is lower, are allowed in any required setback including but not limited to decks, swimming pools, and hot tubs."* | Low decks in required setbacks |
| S2 | **SMC 23.44.090.H.8**: *"Unenclosed structures are allowed in the rear setback provided that the structure is: a. Not located within 5 feet of a rear lot line that is not an alley lot line; b. Not more than 12 feet in height; and c. Separated from a dwelling unit by at least 3 feet, eave to eave."* and **E.4** (unenclosed porches or steps no higher than 4 ft above existing grade may extend to within 5 ft of a street lot line and 3 ft of a side lot line; covered only with stated limits) | The allowances that can apply to a deck over 18 in |
| S3 | **SMC 23.44.080.C.3**: *"The following structures and portions of structures are not counted in lot coverage calculations: ... 3. Decks or parts of a deck that are 36 inches or less above existing grade"* (and C.5: unenclosed structures that meet 23.44.090.H) | Lot-coverage counting threshold |
| S4 | **2021 SRC R105.1 / R105.2 item 7** (SDCI `2021SRCChapter1.pdf`, extracted from the PDF): *"Platforms, walks and driveways not more than 18 inches above grade and not over any basement or story below"* are exempt from a building permit; R105.1 requires a permit except as specifically provided | Building-permit exemption |
| S5 | **SDCI "Decks" page** (current): permit needed if more than 18 in above ground, a roof deck, or in an ECA; "most decks require only a subject-to-field-inspection permit" unless the deck is more than 8 ft above the ground, has beams 14 ft or longer, is a roof deck, is in an ECA, has solid flooring (no gaps), or exceeds 750 sq ft; an ECA site needs a pre-application site visit | Permit path; ECA condition |
| S6 | **SMC 23.44.090 Table A / B** (front 15 ft for 1–2 dwelling units, etc.) | What a required setback is |

**Source conflict recorded and deliberately left unresolved:** SDCI's page says a deck over 18 in cannot be within the required setbacks. The code text is
narrower and more nuanced (S1 limits only the *automatic* allowance to ≤ 18 in; S2 separately allows certain unenclosed structures in the rear setback
and porches/steps near street and side lot lines). Permit Preflight does **not** adjudicate it: it never reports a tall deck in a setback as a violation,
it attributes SDCI's guidance to SDCI, names the code allowances, mechanically compares declared numbers to H.8's conditions (rear setback only), and says
whether any allowance applies is for SDCI to determine. It makes no statement about whether a deck is or is not a porch.

## 2. Scope and honesty model
Declared inputs only; every finding says it rests on the details the customer entered. NR-zone scope stated in every report as an unresolved item (parcel
zoning is not verified for any project type). Not evaluated, and never implied satisfied: structural/ledger-connection/guardrail/stair requirements
(building code), lot-coverage estimation, ECA and shoreline rules, right-of-way, covenants. No rule is activated; `isDeckScreeningCoverageReady()` is hardcoded `false`.

## 3. Intake (`DeckProjectConfiguration`) — nothing silently defaulted
`heightAboveGradeIn` (0 < h ≤ 240; greatest height of the deck surface above existing or finished grade, whichever is lower); `widthFt`, `depthFt`
(0 < x ≤ 100); `attachment` (`DETACHED` | `ATTACHED_TO_DWELLING`); `buildingRelation` (`OPEN_GROUND_BELOW` | `OVER_BASEMENT_OR_STORY_BELOW` | `ROOF_DECK`);
`setbackLocations[]` (`FRONT_SETBACK`, `STREET_SIDE_SETBACK`, `SIDE_SETBACK`, `REAR_SETBACK`, `OUTSIDE_REQUIRED_SETBACKS`; 1–5 unique);
`solidFlooring` (tri-state; `true` = no gaps between boards); `longestBeamFt` (optional); `distanceFromRearLotLineFt` and `distanceFromDwellingFt`
(optional; used only to settle the rear-setback allowance).

## 4. Rules (six, Tier 1, NR zone, `deck`)
| ID | ruleType | Claim | Source |
|---|---|---|---|
| D1 | `DECK_D1_SETBACK_HEIGHT_ALLOWANCE` | ≤ 18 in: allowed in any required setback. Above 18 in: no automatic allowance; the rear-setback allowance (≥ 5 ft from a non-alley rear lot line, ≤ 12 ft high, ≥ 3 ft from the dwelling) and porch/step allowances are named, never assumed | S1, S2 |
| D2 | `DECK_D2_LOT_COVERAGE_THRESHOLD` | ≤ 36 in above grade: not counted in lot coverage; above 36 in: counted (not estimated here) | S3 |
| D3 | `DECK_D3_PERMIT_EXEMPTION` | Exempt only if ≤ 18 in and not over a basement or story below (so never a roof deck) | S4, S5 |
| D4 | `DECK_D4_STFI_ELIGIBILITY` | Subject-to-field-inspection path unless > 8 ft above ground, beams ≥ 14 ft, a roof deck, solid flooring, or > 750 sq ft | S5 |
| D5 | `DECK_D5_ECA_CONDITION` | SDCI: a deck in an ECA needs a permit and a pre-application site visit — stated only as an **attributed, unresolved consideration** (never decided) | S5 |
| D6 | `DECK_D6_EXEMPTION_NOT_ZONING_COMPLIANCE` | Exemption is not zoning compliance (disclaimer; governed claim) | S4 |

Tier 1 rationale: numeric thresholds in current text; D5 is an attributed agency statement that resolves nothing (precedent: Unit 7 F8, shed P3b).
Thresholds live on each row's `ruleSpecification`; the evaluator contains no SMC number as a literal.

## 5. Evaluation
**Setback finding (per declared location).** `OUTSIDE_REQUIRED_SETBACKS`: scope statement (no H.1 limit applies). In a setback: height ≤ 18 in → KNOWN PASS
("allowed in any required setback", H.1). Above 18 in → REQUIRES_VERIFICATION, never FAIL, stating that H.1's allowance does not apply and which allowance
could: for `REAR_SETBACK` the H.8 conditions, evaluated against the declared numbers when supplied (attached → H.8c cannot be met because the deck is not
separated from the dwelling; > 12 ft high; < 5 ft from the rear lot line) — a declared violation of H.8 means "no allowance identified" (still REQUIRES_VERIFICATION
for the possibility of an allowance outside the provisions evaluated, e.g. an alley lot line or a porch), and fully met H.8 conditions → REQUIRES_VERIFICATION
"appears allowed" (SDCI confirms); for `FRONT_SETBACK`/`STREET_SIDE_SETBACK`/`SIDE_SETBACK` only the porch/step allowance (E.4) could apply.
**Lot coverage finding.** ≤ 36 in: KNOWN, "not counted (SMC 23.44.080.C.3)". Above 36 in: REQUIRES_VERIFICATION and part-specific: the code excludes only decks *or parts of a deck* at or below 36 in, so any
part above counts; only the greatest height is declared, so "at least part of this deck counts; how much depends on how much is above 36 in", and lot coverage is not estimated for decks.
**Permit (`DeckPermitRequirement`).** HEIGHT (≤ 18 in MET, else NOT_MET), STRUCTURE_BELOW (open ground below MET; basement/story/roof NOT_MET), ECA (D5, always
REQUIRES_VERIFICATION). `REQUIRED` on any NOT_MET (one active conclusive disqualifier suffices; the inference is textual: R105.1 requires a permit except as
provided, R105.2.7 provides only for ≤ 18 in decks not over a story below). Otherwise `REQUIRES_VERIFICATION` — there is no LIKELY_EXEMPT (ECA status cannot be
determined). **Review path** (only when REQUIRED, needs D4): FULL_REVIEW_LIKELY if any known disqualifier (> 8 ft, beam ≥ 14 ft, roof deck, solid flooring, > 750 sq ft);
otherwise REQUIRES_VERIFICATION - **there is no STFI_LIKELY**: SDCI lists an ECA as a full-review trigger and ECA status can never be determined, so even when every other
criterion is met the path stays unconfirmed and the report says the remaining question is the ECA. (This deliberately differs from the shed Capability B result, which
predates this reasoning; reviewer decision fb0ec2e9.) ECA wording is precise: SDCI requires a permit for a deck *in* an ECA and a pre-application site visit for one *in or near* an ECA.
**Outcome dependencies:** setback/lot-coverage findings need D1/D2; REQUIRED needs D3; the REQUIRES_VERIFICATION permit result needs D3 and D5; the review path needs D4; the
disclaimer needs D6. A claim whose rule is not ACTIVE is not made and is listed as uncovered.

## 5b. Reviewer QA record (2026-10-08, decision fb0ec2e9-c780-4a86-846f-326ed2d73620)
ESCALATE / RESERVED_FOUNDER on authority grounds (Tier 1 creation / APPROVED advancement) - recorded, not a defect, per the Delegated Founder Decision Policy and the
Continuous Autonomous Execution Policy. Real engineering findings, **all fixed**: (1) the setback text characterized the deck ("generally is not a porch", "appears not to be
allowed") - replaced by attribution to SDCI plus "for SDCI to determine", and the conflict is recorded as unresolved, not "resolved by design"; (2) STFI_LIKELY ignored the
unresolved ECA full-review trigger - removed; (3) "in or near an ECA" was applied to the permit condition - now stated exactly as SDCI states it; (4) lot-coverage text now part-specific.

## 6. Rollout
Hardcoded-false readiness flag, rules left APPROVED, dev-only `/dev/deck-intake` preview. Founder decisions (not done): activating the six rules, flipping the flag.
