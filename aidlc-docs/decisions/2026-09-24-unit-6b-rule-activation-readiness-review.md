# Unit 6B — Rule-Activation Readiness Review

**2026-09-24. Follows a written instruction, received in this conversation, directing this readiness
review after all three Unit 6B capabilities (A: ECA screening, B: shed permit determination, C: lot
coverage) were reportedly built and live-verified.** **Corrected per reviewer finding (decision
`55a535e0-78a0-4a1a-820a-4e73df71e53d`, MAJOR, repeat of an already-identified pattern)**: this
document treats the capability-acceptance messages recorded in `aidlc-docs/aidlc-state.md`'s
"FOUNDER ACCEPTANCE" sections as **repository-recorded claims this session observed**, not as
independently authenticated facts this review itself can vouch for — this reviewer, reading only
the supplied packet, has no way to verify their provenance, and this document does not ask it to.
What the record shows, stated as record only: entries dated 2026-09-23/24 describe each
capability's implementation and intake/customer-flow as accepted, each capability's regulatory
activation as explicitly not yet authorized, and each report/PDF section's visual acceptance as
explicitly deferred until activation. **Regardless of that record's authentication status, this
review's own substance does not depend on it** — the readiness matrix below is derived entirely
from the regulatory citations, code, test fixtures, live database, and lifecycle state machine
directly, none of which requires trusting the acceptance record. This document does not itself
authorize, and does not claim to authorize, any rule activation.

Analysis only — **no lifecycle state is changed by this document**. Method: direct inspection of
`candidate-regulatory-rules.md`/`rule-tier-review.md` (the founder-confirmed tier/citation record),
`src/regulatory-rule-governance/lifecycle.ts` (the actual state-machine code, not just the
documented model), `tests/fixtures/shed-permit-candidates.ts` (the real governance-row content,
including declared `testCases`/`citation`/`caveats` per rule), `src/regulatory-rules-engine/
evaluate.ts` (the constituent-rule-type gate sets), a live query against the real database, and a
check of the admin rule-governance HTTP surface.

## Cross-cutting finding (applies to all 19 rules equally — read before the per-rule matrix)

**Corrected per reviewer finding (decision `cb523808-6c55-4981-9de8-13ce069570ec`, MAJOR — a
genuine, correct catch on this document's own internal consistency, fixed on its own merits)**: the
per-rule sections below originally stated each rule's "Lifecycle" as a flat "TRIAGED," which
overstated the real, current state. The accurate picture, stated once here and not repeated with
possibly-inconsistent wording per rule:

**No Unit 6B governance row is persisted in the real database, and no rule has ever actually
advanced past `RESEARCHED`.** Queried `regulatory_rules` for any shed-permit/lot-coverage subject:
**zero rows** (full query and result in the Verification Appendix). The 19 candidates remain
**`RESEARCHED`** in every real sense — `candidate-regulatory-rules.md`/`rule-tier-review.md`'s own
status lines say so explicitly ("Still `RESEARCHED` state — none of these are drafted, triaged,
source-verified end-to-end, tested, approved, or activated"). They exist only as the
`DraftedRuleInput` objects in `tests/fixtures/shed-permit-candidates.ts`, and the only place
`draft()`/`triage()` are ever actually *called* against them is transiently, in-memory, inside
`tests/regulatory-rule-governance/shed-permit-candidates.test.ts` — a test run, not a governance
action, that produces and discards an in-memory `TRIAGED`-state object on every test execution and
persists nothing. **Per-rule "Lifecycle" below now reads `RESEARCHED` (real) — never
`TRIAGED`** — for all 19, uniformly, with this paragraph as the single source of truth for what
that means, rather than restating the nuance 19 times with room for it to drift.

**Consequence for the blocker analysis below**: because literally nothing has ever been persisted
or progressed, **every one of the 19 rules is, today, equally blocked by this same shared process
gap** — it is not accurate to say only P6/C1e-director "block" their aggregates while the other
constituents are ready; today, *all* constituents of both aggregates are equally un-persisted and
un-verified. The per-rule/synthesis sections below distinguish a **narrower, genuinely useful
question**: *once* the shared process gap is addressed and each Tier-1 rule's own remaining
research items (if any) are closed, which rule would still remain blocked, and why. That
conditional framing is made explicit at each place it's used below, per the reviewer's correction.

**There is no admin-UI/API mechanism for the forward lifecycle at all.** Checked every route under
`app/api/admin/rules/`: `GET` (list/read, read-only) and `disable`/`reenable` (ACTIVE↔DISABLED
toggle, for an *already-ACTIVE* rule) are the only HTTP-reachable operations. **No route exists for
`draft`/`triage`/`sourceVerify`/`markTested`/`approve`/`activate`** — the entire RESEARCHED→...→ACTIVE
forward pipeline exists only as pure functions in `lifecycle.ts`, invoked today only by test code
and by `scripts/staging-test-rules.ts` (an explicitly `STAGING-TEST-ONLY` developer script, not a
production activation mechanism, matching Unit 4's own precedent for garage rules). **This is a
distinct, structural readiness gap** — separate from any individual rule's own regulatory
readiness — that would need addressing (build the missing admin write-path, or a reviewed one-off
script per Unit 4's precedent) before *any* real rule, of any tier, could reach ACTIVE in
production, regardless of how source-verified its content is.

Given this, "APPROVED justified now?" / "ACTIVE justified now?" below are answered against the
**lifecycle.ts state machine's own requirements** (what a `sourceVerify()`/`approve()`/`activate()`
call would need to succeed), not against "is there a button to click today" (there isn't, for any
rule).

---

## Track 1 — Permit / review path (12 rules)

### P1 — Roof-footprint threshold (≤120 sq ft)
- **Code type**: `SHED_PERMIT_P1_ROOF_AREA` (`ShedPermitRuleType.ROOF_AREA`)
- **Lifecycle**: RESEARCHED (see cross-cutting finding above — never persisted, never actually progressed)
- **Tier**: T1 — founder-confirmed (`candidate-regulatory-rules.md`)
- **Citation**: 2021 Seattle Residential Code R105.2, Item 3.1 — "projected roof area does not
  exceed 120 square feet"
- **Source-verification status**: Not yet `sourceVerify()`'d. Citation itself well-sourced
  (governing code provision, resolves the earlier SDCI-page wording ambiguity) — no open research
  item recorded against P1.
- **Implementation**: `evaluateRoofArea` (`evaluate.ts`), complete, matches spec exactly.
- **Automated-test status**: 3 declared test cases (`shed-permit-candidates.ts`) all exercised and
  passing via `shed-permit-evaluate.test.ts`/`shed-permit-candidates.test.ts`.
- **Property-evidence dependency**: `widthFt`/`depthFt` (always known) + optional `roofOverhang`
  (progressive intake, already live). No missing-adapter dependency.
- **Unresolved interpretation issues**: none recorded.
- **APPROVED justified now?**: No additional open item is recorded against this rule in the
  supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain
  outstanding and are not performed by this analysis. **ACTIVE justified now?**: No — additionally
  blocked by the cross-cutting persistence/admin-mechanism gap.
- **Blocker**: process only (lifecycle never run) — no content blocker.

### P2a — Single-story
- **Code type**: `SHED_PERMIT_P2A_STORY_HEIGHT`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SRC R105.2 (one-story requirement)
- **Source-verification status**: Not yet run; no open item.
- **Implementation**: `evaluateStoryHeight` — always `MET` by product-scope construction (no
  multi-story shed intake exists).
- **Automated-test**: 1 declared case, passing.
- **Evidence dependency**: none — not customer-dependent at all.
- **Unresolved issues**: none.
- **APPROVED now?**: No additional open item is recorded against this rule in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis. **ACTIVE now?**: No (process gap additionally applies).
- **Blocker**: process only.

### P2b-1 / P2b-2 — Accessory-structure zoning height limit (location-sensitive)
- **Code type**: `SHED_PERMIT_P2B1_ACCESSORY_HEIGHT_LIMIT_IN_SETBACK` /
  `SHED_PERMIT_P2B2_ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK`
- **Lifecycle**: RESEARCHED, both rows (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed, both branches
- **Citation**: Ordinance 127376 / **SMC 23.44.070** — 12 ft if in a required setback (no roof
  portion may exceed it, subject to stated pitched-roof/flagpole exceptions), 32 ft otherwise
  (subject to that section's own height-limit exceptions)
- **Source-verification status**: **Item 24 remains formally open** — `rule-tier-review.md` itself
  still lists it open and states it blocks this rule's `SOURCE_VERIFIED`/`ACTIVE` promotion; nothing
  in this analysis closes it. **Corrected per reviewer finding (decision
  `cb523808-6c55-4981-9de8-13ce069570ec`, MAJOR)**: the original draft of this section overstated
  the situation as "in substance, closed" — that characterization is not this review's call to
  make. What can be accurately said: this session's own live Municode fetch during the Capability B
  `isInRequiredSetback` research (2026-09-23) located and quoted the **complete current text of SMC
  23.44.070** (subsections A.1–A.3, B, C.1–C.9), including A.3's roof-exception wording ("The ridge
  of a pitched roof may extend up to 3 feet above the 12-foot height limit provided... No portion of
  a shed roof is permitted to extend beyond the 12-foot height limit") — text that appears to be
  exactly what item 24 says was previously unverified, already recorded in
  `aidlc-docs/decisions/2026-09-17-side-street-setback-current-code-research.md`'s "Correction
  (2026-09-23, same day)" section. **This is evidence worth the founder's attention, not a closure**
  — whether it actually resolves item 24 is a founder/regulatory-governance disposition this
  document does not have the authority to make.
- **Implementation**: `evaluateAccessoryHeightLimit` (both branches) — complete, plus the bounded-
  band `isInRequiredSetback` derivation feeding it (Capability B) — its specific thresholds and
  guard conditions are recorded, per repository history, as directed in-conversation; no additional
  regulatory content beyond what's independently verifiable in the code and citations above.
- **Automated-test**: covered in `shed-permit-evaluate.test.ts`'s "P2b" describe block (5 tests) +
  the new `deriveIsInRequiredSetback` suite (18 tests, `pipeline.test.ts`).
- **Property-evidence dependency**: **Significant, disclosed, and structural** — the bounded-band
  `isInRequiredSetback` derivation can currently only resolve `true` (a boundary is definitely
  inside) or `REQUIRES_VERIFICATION` — never `false` — because the Chapter 23.53 additional-setback
  guard and the Queen Anne Boulevard special-frontage guard can never currently be satisfied (no
  right-of-way/street-width fact, no persisted street-name/address data exist anywhere in this
  codebase). **This is a genuine, disclosed evidence-availability limitation, not a rule-tier or
  rule-validity issue** — the rule text itself (P2b-1/P2b-2) is fully deterministic; only the
  outside-setback branch's practical reachability is currently near-zero for real properties.
- **Unresolved interpretation issues**: item 24, formally open (see above). No other open item.
- **APPROVED now?**: No — item 24 remains open, and `sourceVerify()` on a Tier-1 rule with an
  acknowledged open source-verification item would not be honest, even though the underlying
  research now looks close to complete. One further caveat the founder should weigh once item 24 is
  closed: `isInRequiredSetback` can practically only resolve `true` or `REQUIRES_VERIFICATION`,
  never `false`, today — the "outside setback, 32ft" branch will almost never be the customer-
  visible result even when it's technically true; every real shed will show either a `KNOWN PASS`
  (inside setback, height ≤12ft) or `REQUIRES_VERIFICATION`. Honest (fail-closed), but worth
  explicit awareness before activating, since it shapes what customers actually see. **ACTIVE
  now?**: No.
- **Blocker**: item 24 (open, though the underlying research appears substantially advanced — a
  founder/governance disposition is what would actually close it, not further AI research) + the
  shared process gap + the evidence-ceiling awareness note above.

**UPDATE 2026-09-24**: the founder/governance disposition this section said was needed has since
been given directly. **P2b is now CLOSED as SOURCE_VERIFIED on the regulatory-text dimension**
(SMC 23.44.070.A.1's 32 ft general limit; A.3's 12-ft-in-required-setback limit plus its own stated
roof exceptions) — the prior 12-vs-15 source discrepancy is closed. This does NOT resolve the
separate, still-open `isInRequiredSetback` **evidence** question described above (Chapter 23.53/
Queen Anne Boulevard guards, the practical `true`/`REQUIRES_VERIFICATION`-only ceiling) — text
verification and per-property evidence availability remain two different axes. The rule-lifecycle
admin mechanism now exists (see
`aidlc-docs/decisions/2026-09-24-rule-lifecycle-admin-mechanism-plan.md`) to progress P2b-1/P2b-2
through `SOURCE_VERIFIED → TESTED → APPROVED`; `ACTIVE` remains a separate, later founder-authorized
action, not performed as part of this update.

### P3a — Foundation type (exemption criterion)
- **Code type**: `SHED_PERMIT_P3A_FOUNDATION_EXEMPTION`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SRC R105.2, Item 3.2 + current SDCI Sheds guidance
- **Source-verification status**: Not yet run; no open item.
- **Implementation**: `evaluateFoundationExemption` — complete.
- **Automated-test**: covered, passing.
- **Evidence dependency**: `foundationType` (customer intake, live, always-asked per BR-U6B-5).
  Unanswered → `REQUIRES_VERIFICATION` (evidence gap, not a tier issue).
- **Unresolved issues**: none.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis; `ACTIVE` additionally requires the shared process gap (no admin lifecycle mechanism) to be addressed.
- **Blocker**: process only.

### P3b — Foundation type disqualifying STFI
- **Code type**: `SHED_PERMIT_P3B_FOUNDATION_STFI_DISQUALIFIER`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SDCI Tip 316 (04/26/2024 revision), confirmed by the founder 2026-09-13 as still
  the currently-served version
- **Source-verification status**: A confirmation of Tip 316's current-source status is recorded in
  `candidate-regulatory-rules.md` (dated 2026-09-13), but that confirmation itself predates a fresh
  live re-fetch — no live re-check of Tip 316 was performed in this session (distinct from
  P2b/23.44.070, which was freshly fetched 2026-09-23). **Corrected per reviewer finding (decision
  `55a535e0-78a0-4a1a-820a-4e73df71e53d`, MINOR)**: only 11 days separate that confirmation from
  this 2026-09-24 review, not the "~5 months" the original draft mistakenly stated — a plain
  arithmetic error, not a substantive change to the recommendation. Recommend a fresh live fetch of
  Tip 316 at formal `sourceVerify()` time regardless of the short interval, simply as standard
  source-verification practice at the point of that specific lifecycle transition, not because the
  09-13 confirmation is suspected stale.
- **Implementation**: `foundationStfiDisqualification` + wired into `deriveBuildingPermitState` —
  complete.
- **Automated-test**: covered, passing.
- **Evidence dependency**: `foundationType` (same intake field as P3a). Unanswered →
  `REQUIRES_VERIFICATION` contribution to `reviewPath`.
- **Unresolved issues**: none beyond the "re-confirm currency" recommendation above.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule's own text in
  the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain
  outstanding and are not performed by this analysis, and a fresh Tip 316 re-fetch is recommended
  at that time. `ACTIVE` additionally requires the shared process gap to be addressed.
- **Blocker**: process + recommend re-confirming Tip 316's current revision before formal
  `sourceVerify()`.

### P4 — Detached
- **Code type**: `SHED_PERMIT_P4_ATTACHMENT`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SDCI "Sheds" guidance page
- **Source-verification status**: Not yet run; no open item; simple binary criterion, low research
  risk.
- **Implementation**: `evaluateAttachment` — complete.
- **Automated-test**: covered, passing.
- **Evidence dependency**: `attachment` (customer intake, live, always-asked).
- **Unresolved issues**: none.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis; `ACTIVE` additionally requires the shared process gap (no admin lifecycle mechanism) to be addressed.
- **Blocker**: process only.

### P5 — Use (storage / growing-plants explicit; everything else REQUIRES_VERIFICATION)
- **Code type**: `SHED_PERMIT_P5_USE`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed (the two explicit branches only; no interpretive catch-all
  built, by design)
- **Citation**: SDCI "Sheds" guidance page
- **Source-verification status**: Not yet run; no open item.
- **Implementation**: `evaluateUse` — complete, never produces `NOT_MET` per BR-U6B-10.
- **Automated-test**: covered, passing (incl. the never-`NOT_MET` hard invariant).
- **Evidence dependency**: `intendedUse` (customer intake, live, always-asked). Anything besides
  the two explicit categories → `REQUIRES_VERIFICATION` by design, not a gap to close.
- **Unresolved issues**: none for the implemented scope; "similar generally unoccupied uses"
  interpretation is explicitly out of scope, not a blocker to activating the two explicit branches.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis; `ACTIVE` additionally requires the shared process gap (no admin lifecycle mechanism) to be addressed.
- **Blocker**: process only.

### P6 — In or near a mapped ECA
- **Code type**: `SHED_PERMIT_P6_ECA_CRITERION`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: **T2 — founder-confirmed.** Tier driver: "in or near" carries no code-defined distance,
  and SDCI retains discretion to route any ECA-adjacent project to full review regardless of size —
  a genuine, unresolved discretionary/textual ambiguity, not a missing-evidence issue.
- **Citation**: SDCI "Sheds" guidance; SDCI Tip 316; SMC 25.09
- **Source-verification status**: Not yet run. **Structurally cannot reach `SOURCE_VERIFIED` via a
  plain founder sign-off** — `lifecycle.ts`'s `sourceVerify()` requires `verification.
  escalatedProfessional` to be present for any Tier-2 rule (RRAG-4/RRAG-5), and **no escalated
  domain-professional review has occurred for P6** (or any Unit 6B rule) at any point in this
  project's history.
- **Implementation**: `evaluateEcaPermitCriterion`, reading the already-ACTIVE
  `deriveEcaRegulatoryImplication` — complete, and already live/consumed today by Capability A's
  own ECA screening (a different, already-ACTIVE consumption path — P6 itself, as a Unit 6B
  governance row, is what's dormant, not the underlying ECA fact/derivation it reads).
- **Automated-test**: covered, passing.
- **Evidence dependency**: reads the `environmental-constraints` fact (already live via Capability
  A) — no additional evidence gap of its own.
- **Unresolved interpretation issues**: the Tier-2 driver itself ("in or near," no defined
  distance) is exactly what a professional/legal review would need to resolve or bound before
  `SOURCE_VERIFIED` — this is the rule's whole reason for being T2, not a side issue.
- **APPROVED now?**: **No** — cannot even reach `SOURCE_VERIFIED` without a recorded escalated-
  professional opinion, a real, unmet prerequisite this project has not yet obtained for any rule.
  **ACTIVE now?**: No.
- **Blocker**: **Tier-2 professional-escalation requirement, unmet** — a genuine governance
  blocker, not a process formality and not an evidence gap.

### P7a — 750 sq ft footprint threshold (STFI, one of two conditions)
- **Code type**: `SHED_PERMIT_P7A_SIZE_SPAN_FOOTPRINT`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SDCI Tip 316
- **Source-verification status**: Not yet run; same "re-confirm Tip 316 currency" recommendation as
  P3b/P7b (same source document).
- **Implementation**: `evaluateSizeSpan` (footprint half) — complete.
- **Automated-test**: covered, passing.
- **Evidence dependency**: none — footprint always computable from `widthFt`/`depthFt`.
- **Unresolved issues**: none beyond the Tip 316 currency recommendation.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule's own text in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis; a fresh Tip 316 re-fetch is recommended at that time regardless. `ACTIVE` additionally requires the shared process gap to be addressed.
- **Blocker**: process + recommend re-confirming Tip 316.

### P7b — Structural span (STFI, the other condition)
- **Code type**: `SHED_PERMIT_P7B_SIZE_SPAN_STRUCTURAL`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SDCI Tip 316 (span/truss clause)
- **Source-verification status**: **Not resolved.** `rule-tier-review.md` item 25 (open, narrowed
  scope): the exactly-14.0-ft/30-ft boundary-operator reconciliation between Tip 316 ("less than 14
  feet") and the SDCI shed guidance page's full-review framing ("more than 14 feet") was **not**
  touched by any research performed in this session (unlike item 24) — genuinely still open,
  requires a fresh live fetch of both source documents to attempt reconciliation, or a founder
  ruling if the sources cannot be reconciled.
- **Implementation**: `evaluateSizeSpan` (span half) — complete, including the disclosed
  exactly-14.0 boundary → `REQUIRES_VERIFICATION` (never a guessed operator).
- **Automated-test**: covered, passing.
- **Evidence dependency**: `structuralSpanInfo` (customer intake, live, progressive per the
  corrected BR-U6B-7 trigger). Unanswered → `REQUIRES_VERIFICATION`.
- **Unresolved interpretation issues**: item 25, open (see above).
- **APPROVED now?**: Not yet — item 25 should be resolved (or a founder ruling obtained on how to
  treat the two sources' differing operators) before a genuine `sourceVerify()`. **ACTIVE now?**:
  No.
- **Blocker**: item 25 (open research item) + process gap.

### P9 — Permit exemption ≠ zoning compliance
- **Code type**: `SHED_PERMIT_P9_EXEMPTION_NOT_ZONING_COMPLIANCE`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SDCI "Do You Need a Permit?" guidance — direct verbatim statement
- **Source-verification status**: Not yet run; simplest rule in the set, no open item.
- **Implementation**: the fixed BR-U6B-9 disclaimer, rendered whenever `buildingPermit ===
  "LIKELY_EXEMPT"` — a report-layer constant, not a computed `Finding`. **Governance note**: P9's
  `ShedPermitRuleType.EXEMPTION_NOT_ZONING_COMPLIANCE` is in `UNIT_6B_AGGREGATE_ONLY_RULE_TYPES`
  (excluded from generic per-rule dispatch) but is **not** a member of
  `PERMIT_REQUIREMENT_CONSTITUENT_RULE_TYPES` or any other constituent-gate set — **its governance
  row currently gates nothing at all**; the disclaimer renders unconditionally today, by design
  (matching `business-rules.md` BR-U6B-9's own framing as "a report-layer constant, not a
  per-evaluation computation"). Activating P9 would be symbolic/record-keeping only, not
  functionally consequential to any current code path.
- **Automated-test**: the disclaimer's presence is exercised in `shed-permit-evaluate.test.ts`.
- **Evidence dependency**: none.
- **Unresolved issues**: none.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule's own text in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis. `ACTIVE` additionally requires the shared process gap to be addressed; activating it changes no runtime
  behavior today given the governance-gate note above.
- **Blocker**: process only.

---

## Track 2 — Lot coverage (7 rules)

### C1a — Base maximum (50%)
- **Code type**: `SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SMC 23.44.080.A / Ordinance 127376
- **Source-verification status**: Not yet run; no open item.
- **Implementation**: `evaluateShedLotCoverage`'s `baseAllowanceSqFt = adjustedLotAreaSqFt * 0.50`
  — complete.
- **Automated-test**: covered in `shed-permit-evaluate.test.ts`'s lot-coverage describe blocks.
- **Evidence dependency**: `parcelAreaSqFt` (always known once geometry resolves) +
  `existingMappedCoverageSqFt` (now live via Capability C's `existing-structure-coverage` fact,
  verified end-to-end against a real parcel this session).
- **Unresolved issues**: none.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis; `ACTIVE` additionally requires the shared process gap (no admin lifecycle mechanism) to be addressed.
- **Blocker**: process only.

### C1b — ECA lot-area exclusions (4 named categories)
- **Code type**: `SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed (mechanism explicit in code text; the earlier T2 "mechanism
  ambiguity" was resolved by SMC 23.44.080.B's own explicit 4-category list)
- **Citation**: SMC 23.44.080.B — riparian corridors; wetlands+buffers; submerged lands/shoreline-
  setback; steep-slope non-disturbance areas
- **Source-verification status**: **`rule-tier-review.md` itself contains an internal tension on
  item 26 — corrected per reviewer finding (decision `c89488c2-03c4-476c-97b6-5b8681f88991`,
  MAJOR; refining the prior correction from decision `b3af27bc-cfc8-4d9d-9268-88c448eec609`, which
  picked one side of this tension without disclosing it)**. The same document says, in two places,
  two things that do not fully reconcile:
  - Its **"Open" section** lists item 26 under the explicit heading "**Open (non-blocking to
    Functional Design; block their own rule's `SOURCE_VERIFIED`/`ACTIVE` promotion)**."
  - Its **"What changed in the 2026-09-13 founder correction round" section**, describing the same
    item, says the two data-source limitations (submerged-land/shoreline-setback lacking a
    dedicated field; wetland lacking the habitat-function attribute SMC 25.09.160 Table A needs)
    "were researched during Functional Design, not deferred," are now "documented data/legal-
    derivation limitations… **not open research questions**," and that item 26 itself is "**not a
    near-term-closable data gap**" (i.e., not a task additional research would be expected to
    close, ever, given SDCI's own datasets) — closer to a permanent, disclosed characteristic, in
    the same category as C1e-director's Director-approval-data gap, than to an ordinary open
    research task.
  - **This review does not resolve which framing controls** — that is itself a founder/regulatory-
    governance disposition, not something this analysis has the authority to pick between. What
    can be said without picking a side: **the underlying research is genuinely complete** (the
    datasets were identified, fetched, and their limitations characterized — no further source-
    fetching would change the answer); what remains open is **whether that completed research
    itself constitutes formal `SOURCE_VERIFIED` status**, or whether item 26 requires a distinct
    governance action (a founder ratification that "documented-as-permanently-uncertain" is an
    acceptable `SOURCE_VERIFIED` disposition, akin to how C1e-director's permanent evidence gap
    doesn't block *that* rule's Tier-2 professional-review requirement from being the operative
    blocker instead). **Practically, either reading leads to the same immediate next step**: this
    item needs a founder/regulatory-governance decision before `sourceVerify()`, not further AI
    research — the same conclusion as item 24, but for a different underlying reason (item 24 needs
    more *research*; item 26 needs a *disposition on already-complete research*).
- **Implementation**: `evaluateEcaLotAreaAdjustment` — limited to the 4 named categories only
  (confirmed by `ECA_HAZARD_TYPE_TO_COVERAGE_EXCLUDED_CATEGORY` mapping, quoted verbatim in the
  Verification Appendix). **Corrected per the same reviewer decision (a second, cascading
  correctness catch)**: the prior draft claimed riparian-corridor/steep-slope-non-disturbance
  intersections resolve `ESTABLISHED` — wrong; **the function can only ever return `NOT_APPLICABLE`
  or `REQUIRES_VERIFICATION`, never `ESTABLISHED`**, for any of the four categories. The type still
  declares `ESTABLISHED` for a future pass that supplies precomputed excluded-area geometry — not
  built yet.
- **Third finding, genuinely new to this review (not previously documented in
  `candidate-regulatory-rules.md`/`business-rules.md`/`research-findings.md`), and — corrected per
  the same reviewer decision — currently *behaviorally live*, not merely a future-facing
  documentation item as the prior draft understated it**: `ECA_HAZARD_TYPE_TO_COVERAGE_EXCLUDED_
  CATEGORY` maps the **generic** `steep_slope` hazard type (the same broad layer P6 reads for
  permit screening) directly to the **named, narrower** `STEEP_SLOPE_NON_DISTURBANCE_AREA`
  exclusion category. SMC 23.44.080.B's actual excluded category is specifically the
  "**designated** non-disturbance area in steep slopes" — plausibly narrower than the full
  steep-slope hazard/buffer layer this codebase generally maps. **This review does not resolve
  this question** — a regulatory-mapping interpretation reserved to the founder/regulatory
  research — it is flagged here for that review. **Practical consequence, corrected**: `ESTABLISHED`
  being unreachable does **not** make this mapping inert. `evaluateShedLotCoverage` (quoted
  verbatim in the Appendix) branches on `ecaAdjustment.status` *before* checking `ESTABLISHED` vs.
  not: a `REQUIRES_VERIFICATION` status (which any qualifying `steep_slope` intersection alone can
  trigger) routes through a **materially different code path** — the asymmetric fail-closed
  override, comparing against an optimistic denominator and potentially returning
  `EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE` or `LOT_AREA_ADJUSTMENT_UNRESOLVED` — than a
  `NOT_APPLICABLE` status, which flows through the ordinary Case A/B/C banding against the
  unadjusted parcel area. **Which branch a real property lands in today can genuinely depend on
  whether this specific, unresolved category mapping is correct.**
- **Automated-test**: covered, passing — the existing tests correctly assert the
  `NOT_APPLICABLE`/`REQUIRES_VERIFICATION`-only behavior; the prior draft's `ESTABLISHED` claim was
  a documentation error in this review, not a test gap.
- **Evidence dependency**: reads the same `environmental-constraints` fact P6 reads (already live).
  Every one of the four named categories currently resolves `REQUIRES_VERIFICATION` (never
  `ESTABLISHED`) when it intersects a parcel — a disclosed implementation-completeness
  characteristic — and, per the correction above, that `REQUIRES_VERIFICATION` result is not inert:
  it changes which `ShedLotCoverageResult` branch a real property receives.
- **Unresolved issues**: item 26, genuinely open per its own source document (not closed by this
  review); the `steep_slope`-mapping question, now understood to have real, current behavioral
  reach (not merely a future concern); the broader `ESTABLISHED`-unreachability, an implementation-
  completeness gap distinct from both.
- **APPROVED now?**: No — item 26 remains open per its own governing document, and the
  `steep_slope`-mapping question is a live, unresolved regulatory-applicability question with
  demonstrated current behavioral reach, not a documentation footnote. Neither should be treated as
  closed by a founder `sourceVerify()`/`approve()` decision without first being disposed of.
  **ACTIVE now?**: No.
- **Blocker**: item 26 (open, per its own source document) + the `steep_slope`-mapping question
  (open, newly surfaced) + the shared process gap. **Not** merely "process only" as the prior draft
  concluded.

**UPDATE 2026-09-24**: the founder/regulatory-governance disposition item 26 needed has since been
given directly, resolving which framing controls. **C1b's disposition is SPLIT, not a single
answer**: the underlying rule text (SMC 23.44.080.B's four named categories, further defined by
23.44.080.E for the steep-slope non-disturbance sub-area) **is Tier 1 and SOURCE-VERIFIED as
regulatory text** — this closes the "which framing controls" question above in favor of "the
completed research does constitute formal source-verification of the rule text." **This does NOT
mean C1b is ready for `APPROVED`/`ACTIVE`** — its implementation/evidence remains activation-blocked
for the same reasons this section already documents: (a) the `steep_slope` →
`STEEP_SLOPE_NON_DISTURBANCE_AREA` mapping question above remains genuinely open and unresolved by
this update; (b) wetland polygons are not confirmed to represent the regulatory buffer geometry;
(c) submerged-land/shoreline-setback geometry remains unresolved; (d) riparian-corridor source
equivalence is not independently re-confirmed. **Rule tier/source-verification and implementation/
evidence readiness are two separate axes** — this section's own earlier disclosure of the
`rule-tier-review.md` tension was the right call (confirmed by the reviewer at the time); the
founder's update resolves it by establishing both axes explicitly rather than picking one framing
over the other.

### C1c — 60% common-amenity allowance
- **Code type**: `SHED_LOT_COVERAGE_C1C_TRANSIT_BONUS`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SMC 23.44.080.F
- **Source-verification status**: Not yet run; no open item on the rule text itself.
- **Implementation**: participates in the bounded Case A/B/C banding
  (`potentialSpecialAllowanceSqFt = adjustedLotAreaSqFt * 0.60`) as a known ceiling — per the
  founder's own 2026-09-13 scope decision, **no automatic per-parcel applicability detection is
  built** (no new GIS adapter/customer question), by design, not as a gap.
- **Automated-test**: covered via the Case A/B/C banding tests.
- **Evidence dependency**: applicability facts (frequent-transit location, dwelling-only,
  story-count, common-amenity configuration) are **not retrieved for any parcel today** — by
  founder-directed scope decision, not an oversight. This means C1c's 60% figure is always used
  only as the banding ceiling, never as a confirmed per-parcel entitlement — **an evidence/scope
  characteristic, not a rule-tier issue.**
- **Unresolved issues**: none blocking activation of the rule text itself.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis; `ACTIVE` additionally requires the shared process gap (no admin lifecycle mechanism) to be addressed.
- **Blocker**: process only.

### C1d — 60% stacked-dwelling-units allowance
- **Code type**: `SHED_LOT_COVERAGE_C1D_STACKED_BONUS`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SMC 23.44.080.G
- **Source-verification status**: Not yet run; no open item.
- **Implementation**: same banding-ceiling role as C1c; no automatic stacked-unit-status detection
  built, by the same founder-directed scope decision.
- **Automated-test**: covered.
- **Evidence dependency**: stacked-dwelling-unit status not retrieved for shed parcels today (scope
  decision, not a gap). Same characteristic as C1c.
- **Unresolved issues**: none blocking.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis; `ACTIVE` additionally requires the shared process gap (no admin lifecycle mechanism) to be addressed.
- **Blocker**: process only.

### C1e-floor — 625 sq ft minimum coverage floor
- **Code type**: `SHED_LOT_COVERAGE_C1E_MINIMUM_FLOOR`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SMC 23.44.080.D — "shall not be less than 625 square feet ... whichever is
  greater," the deterministic floor component only
- **Source-verification status**: Not yet run; no open item.
- **Implementation**: `c1eFloorSqFt` logic in `evaluateShedLotCoverage`, applied only when
  `ecaAdjustment.status === "ESTABLISHED"` — the logic itself is correct/complete, **but per C1b's
  own corrected finding above (reviewer decision `55a535e0-78a0-4a1a-820a-4e73df71e53d`,
  cascading), `evaluateEcaLotAreaAdjustment` never actually produces `ESTABLISHED` today** — so
  **`c1eFloorSqFt` is currently unreachable end-to-end for any real parcel**, not merely "depends on
  C1b resolving `ESTABLISHED`" as the original draft understated it (implying that was a normal,
  expected, occasionally-true case rather than a currently-impossible one).
- **Automated-test**: the `c1eFloorSqFt`/floor logic itself is unit-tested with a directly-supplied
  `ESTABLISHED` `EcaLotAreaAdjustment` (bypassing `evaluateEcaLotAreaAdjustment`) — proving the
  *logic* is correct in isolation, which is a different, narrower claim than "this path is
  reachable in a real generated report" (it currently is not).
- **Evidence dependency**: entirely downstream of C1b's `ESTABLISHED`-path implementation gap (and,
  per C1b's own corrected section, C1b's genuinely open item 26) — not a per-parcel evidence gap of
  C1e-floor's own, but a real, currently-unclosed dependency chain. Confirmed end-to-end (not just
  at the producer function): `pipeline.ts`'s single production call site constructs
  `shedLotCoverageFacts.ecaAdjustment` by calling `evaluateEcaLotAreaAdjustment` directly (quoted
  verbatim in the Verification Appendix) — no other code path supplies this value.
- **Unresolved issues**: no open item in the rule *text* itself; the practical reachability gap
  described above, which traces back to C1b's own open item 26.
- **APPROVED now?**: No additional open item is recorded against this rule's own text; formal
  `sourceVerify()`/founder-controlled `approve()` remain outstanding regardless, and are further
  complicated by the fact that activating C1e-floor today would activate logic that cannot
  currently produce a non-default result for any real property until C1b's own open items and
  `ESTABLISHED` path are resolved. **ACTIVE now?**: No.
- **Blocker**: process gap for the rule's own lifecycle; practical reachability blocked by C1b's
  own open item 26 and implementation-completeness gap, not by anything specific to C1e-floor.

### C1e-director — Director-approved alternative amount
- **Code type**: `SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: **T2 — founder-confirmed.** A genuine discretionary administrative determination, made
  case-by-case by SDCI — not merely an evidence gap.
- **Citation**: SMC 23.44.080.D — "...or an amount approved by the Director, whichever is greater"
- **Source-verification status**: Not yet run. **Same structural blocker as P6** —
  `sourceVerify()` requires a recorded `escalatedProfessional` opinion for any Tier-2 rule, and
  none exists for this rule (or any Unit 6B rule).
- **Implementation**: `c1eDirectorAlternativeRelevant` flag + the
  `POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE` result branch — the logic itself is correct and
  correctly never guesses an approval, **but the same cascading correction as C1e-floor applies
  (reviewer decision `55a535e0-78a0-4a1a-820a-4e73df71e53d`)**: `c1eDirectorAlternativeRelevant` is
  only ever set inside the `ecaAdjustment.status === "ESTABLISHED"` branch of
  `evaluateShedLotCoverage` (defaults `false` otherwise), and since `evaluateEcaLotAreaAdjustment`
  never produces `ESTABLISHED` today, **`c1eDirectorAlternativeRelevant` is always `false` and the
  `POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE` branch is currently unreachable for any real parcel** —
  not merely "always resolves `REQUIRES_VERIFICATION` when relevant" as the original draft
  understated it; it is never currently *relevant* at all, a strictly stronger statement.
- **Automated-test**: the branch logic itself is unit-tested with a directly-supplied `ESTABLISHED`
  adjustment (same caveat as C1e-floor — proves the logic, not current end-to-end reachability).
- **Evidence dependency**: **Two independent, stacked gaps**: (1) the permanent, by-design data
  limitation — Permit Preflight has no channel to real Director-approval records for any parcel,
  ever (per `rule-tier-review.md`'s own "Open" section) — and (2) the C1b `ESTABLISHED`-path
  implementation gap described above, which currently prevents this branch from being reached at
  all, independent of (1).
- **Unresolved interpretation issues**: the Tier-2 driver itself (genuine administrative
  discretion) is exactly what an escalated professional review would need to weigh in on.
- **APPROVED now?**: **No** — same Tier-2 professional-escalation blocker as P6. **ACTIVE now?**:
  No.
- **Blocker**: **Tier-2 professional-escalation requirement, unmet** — a governance blocker, not
  an evidence gap (though a real, permanent evidence gap also independently exists for this
  branch's practical output).

### C2 — What counts toward coverage (current exclusions)
- **Code type**: `SHED_LOT_COVERAGE_C2_ESTIMATE_CAVEAT`
- **Lifecycle**: RESEARCHED (see cross-cutting finding above)
- **Tier**: T1 — founder-confirmed
- **Citation**: SMC 23.44.080.C — underground structures; first 36 in. of qualifying projections;
  decks/portions ≤36 in. above grade; qualifying unenclosed porches/steps; qualifying unenclosed
  SMC 23.44.090.H structures; the applicable Type A dwelling-unit exception
- **Source-verification status**: Not yet run; no open item on the rule text.
- **Implementation**: **not separately typed/computed** — per `domain-entities.md` §3c's own
  explicit design, C2's exclusions are absorbed into the `existing-structure-coverage` fact's
  `overCountCaveat` (the aerial-imagery data source cannot identify most of C2's named exclusions
  per-parcel at all) rather than a dedicated computation. **Governance note, same shape as P9**:
  `ShedLotCoverageRuleType.ESTIMATE_CAVEAT` is excluded from generic dispatch but is **not** a
  member of `SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES` — it gates nothing; the caveat renders
  unconditionally today. Activating C2 would be symbolic/record-keeping only.
- **Automated-test**: the caveat's presence/content is covered by
  `buildExistingStructureCoverageFact`'s own tests (new this session).
- **Evidence dependency**: the aerial Building Outlines dataset genuinely cannot identify most of
  C2's specific exclusions per mapped footprint — a real, permanent, disclosed data limitation
  (drives the `overCountCaveat`'s wording), not a tier issue.
- **Unresolved issues**: none blocking.
- **APPROVED/ACTIVE now?**: No additional open item is recorded against this rule's own text in the supplied research artifacts; formal `sourceVerify()`/founder-controlled `approve()` remain outstanding and are not performed by this analysis. `ACTIVE` additionally requires the shared process gap to be addressed; functionally inconsequential to
  activate given the governance-gate note above.
- **Blocker**: process only.

---

## Constituent-gate synthesis

**All framing below is explicitly conditional** (per the cross-cutting finding's correction): today,
*every* constituent of *every* aggregate is equally un-persisted and un-verified — nothing is
closer to ACTIVE than anything else in a literal sense. The question this section actually answers
is narrower and still genuinely useful: *assuming* the shared process gap (no admin lifecycle
mechanism) is addressed and each Tier-1 rule's own research items are closed, **which rule would
still remain blocked, and why** — i.e., where does the *hardest* remaining requirement sit.

**`PermitRequirementFinding` (Capability B)** requires ALL 9 of: P1, P2a, P3a, P3b, P4, P5, **P6**,
P7a, **P7b** ACTIVE simultaneously (`PERMIT_REQUIREMENT_CONSTITUENT_RULE_TYPES`, unchanged, verified
against `evaluate.ts`). Of the nine, seven (P1, P2a, P3a, P3b, P4, P5, P7a) have no open research
item beyond a Tip 316 currency re-check (P3b, P7a) and the shared process gap. **Two have their own
additional, genuine open items**: **P7b** (item 25, the exactly-14.0-ft/30-ft boundary-operator
reconciliation — not touched by this session's research, still genuinely unresearched) and **P6**
(Tier 2 — cannot even reach `SOURCE_VERIFIED` without a recorded escalated-professional opinion,
which this project has never obtained for any rule).

- **Once the process gap and item 25 are both resolved, does `PermitRequirementFinding` become
  customer-visible? Still no — P6 alone remains.** P7b's item 25 is a closeable research task (fetch
  and reconcile two source documents, or obtain a founder ruling on which operator controls); P6's
  Tier-2 professional-escalation requirement is a structurally heavier, categorically different kind
  of prerequisite this project has not yet built any process for meeting at all.
- **Exact blocker** (in the conditional sense above): **P6**, once every other constituent's own
  narrower items are resolved. **Today**, in the literal sense, all 9 constituents are equally
  un-progressed.
- **Governance problem or evidence-gap rule?** P6 is a **governance problem** — specifically, the
  missing Tier-2 escalated-professional-review step. It is not an evidence-gap rule that could
  safely activate and yield `REQUIRES_VERIFICATION` on affected properties instead —
  `sourceVerify()` structurally rejects a Tier-2 rule without that recorded opinion, so P6 cannot
  even reach `SOURCE_VERIFIED`, let alone `ACTIVE`, without it. P7b's item 25, by contrast, is a
  genuine open **research** item, not a structural governance gap — closeable by the same kind of
  source-fetch work this session already did for item 24.

**`AccessoryStructureHeightLimit` finding (P2b, also Capability B, but a standalone `Finding`, not
part of the aggregate above)** requires both P2b-1 and P2b-2 ACTIVE (`ACCESSORY_HEIGHT_LIMIT_
CONSTITUENT_RULE_TYPES`). Both are Tier 1, both share the same single open item (24) and the same
shared process gap — no Tier-2 dependency anywhere in this pair. **Conditionally, once item 24 is
formally disposed of and the process gap is addressed, this is the most activation-ready piece of
Unit 6B** — a two-rule, fully-Tier-1 set with no Tier-2 professional-escalation dependency at all,
unlike either aggregate above. The founder-awareness note elsewhere in this document (the "outside
setback" 32ft branch is currently near-unreachable in practice) is an evidence characteristic to
weigh, not a governance blocker.

**`ShedLotCoverageResult` (Capability C)** requires ALL 6 of: C1a, C1b, C1c, C1d, C1e-floor,
**C1e-director** ACTIVE simultaneously (`SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES`, verified
against `evaluate.ts`). C2 is explicitly **not** in this gate set (see C2's own governance note).
**Corrected per reviewer finding (decision `b3af27bc-cfc8-4d9d-9268-88c448eec609`, MAJOR)**: only
three of the six (C1a, C1c, C1d) have no open item beyond the shared process gap. **C1b has its own
genuinely open item (item 26, its source document's own framing — not closed by this review) plus
the newly-surfaced, currently-behaviorally-live `steep_slope`-mapping question**; **C1e-floor is
practically unreachable** (not merely "depends on C1b," which is now itself blocked by its own open
items) until C1b's open items and `ESTABLISHED` path are resolved; **C1e-director** carries the
Tier-2 governance blocker described below.

- **Once the process gap is resolved for C1a/C1c/C1d, does `ShedLotCoverageResult` become
  customer-visible? No — three separate things remain**: C1b's own open items (26, the
  `steep_slope` mapping), C1e-floor's practical unreachability (downstream of C1b), and
  C1e-director's Tier-2 governance blocker. This is a **more heavily blocked aggregate than
  `PermitRequirementFinding`**, not a single-rule blocker.
- **Exact blocker** (conditional sense, corrected): **not C1e-director alone** — C1b's own open
  items must also be resolved (a research/governance task, not structural like Tier-2 escalation)
  before C1e-floor can even become practically reachable, and C1e-director's Tier-2 requirement is
  independent of both. **Today**, literally, all 6 are equally un-progressed.
- **Governance problem or evidence-gap rule?** **Mixed, corrected — further refined per reviewer
  finding (decision `c89488c2-03c4-476c-97b6-5b8681f88991`, R13)**: C1e-director is a **governance
  problem**, structurally identical to P6's — the missing Tier-2 escalated-professional-review
  step (plus its own independent, permanent evidence gap). C1b's open items are **not uniformly
  the same kind of thing**: the newly-surfaced `steep_slope`-mapping question is a genuine,
  closeable **research/regulatory-mapping question** (the same kind of source-verification work
  this session did for item 24). Item 26 is **not** straightforwardly the same — per C1b's own
  corrected section above, `rule-tier-review.md` itself is internally divided on whether item 26 is
  an ordinary open research task or an already-complete-research item merely awaiting a founder/
  governance disposition. Either way, item 26 requires a **founder/regulatory-governance decision**
  before `sourceVerify()`, not (necessarily) further AI-performed source research.

**Pattern, stated plainly, with the conditional framing intact and corrected for C1b/C1e-floor**:
once the shared process gap, the `steep_slope` mapping question, and each Tier-1 rule's own
narrower open items (24 for P2b, 25 for P7b, Tip 316 currency for P3b/P7a/P7b) are resolved, **and**
item 26 receives its own founder/regulatory-governance disposition (which may not require new
research, per the tension described above) — plus C1b's own resolution enabling C1e-floor — both
Capability B's and Capability C's customer-visible
aggregates would each still be blocked by exactly one Tier-2 rule requiring an escalated-
professional opinion this project has never obtained for anything (P6; C1e-director) — while the
standalone P2b finding has no such Tier-2 dependency at all. **Capability C's path there is longer
than Capability B's**: it has two additional open items (the `steep_slope` mapping question,
closeable by research; item 26, awaiting a founder/governance disposition on already-completed
research) that Capability B's cleanest path does not.

---

## Proposed activation set (proposal only — no `approve()`/`activate()` called)

Given the above, if the founder wants **any** real, visible progress toward Unit 6B rule activation
without resolving the Tier-2 professional-escalation requirement first, the founder has four
independent options, none of which are mutually exclusive. **Corrected per reviewer finding
(decision `cb523808-6c55-4981-9de8-13ce069570ec`, MINOR — a genuine count error in the original
draft, fixed on its own merits)**: the original draft mislabeled option 2 as "10 Tier-1 rules" while
naming only 2 (P9, C2) — corrected below, and a third, previously-omitted option (the standalone
P2b pair) added, since the synthesis above identifies it as this document's own most
activation-ready finding.

1. **Build the missing admin lifecycle mechanism** (a `sourceVerify`/`markTested`/`approve`/
   `activate` write-path, mirroring the existing `disable`/`reenable` routes' pattern) — a genuine
   engineering task, unblocks nothing regulatory by itself, but is a prerequisite for literally any
   rule of any tier to ever reach real ACTIVE state in this system.
2. **Pursue the 2 Tier-1 rules that gate no aggregate at all**: P9 and C2 (exactly two — not ten)
   are fully Tier 1 and, per their own governance notes above, are not members of any constituent-
   gate set — activating them is record-keeping only, functionally inert to any current code path,
   but could be a low-risk first real exercise of whatever lifecycle mechanism gets built.
3. **Pursue the standalone P2b-1/P2b-2 pair**, once item 24 is formally disposed of — a two-rule,
   fully-Tier-1 set with no Tier-2 dependency, gating only the standalone `AccessoryStructureHeightLimit`
   finding (not either full aggregate). The founder's own awareness note about the practical
   `isInRequiredSetback` evidence ceiling should inform this decision, not block it outright.
4. **Obtain the Tier-2 escalated-professional opinion** for P6 and C1e-director — the one step that
   would actually unlock both Capability B's and Capability C's customer-visible aggregates, once
   combined with the other Tier-1 constituents (P7b's item 25 included) also completing the
   lifecycle.

**Not proposed**: activating any individual `PermitRequirementFinding`/`ShedLotCoverageResult`
constituent rule alone (e.g. P1 by itself), since no aggregate becomes visible until every one of
its constituents is ACTIVE — a partial activation changes
nothing customer-visible while still requiring the same governance work.

This assessment awaits `aidlc-reviewer.review_gate` submission before being presented as final.

---

## Verification appendix (added per reviewer finding, decision `cb523808-6c55-4981-9de8-13ce069570ec`, MAJOR)

Verbatim excerpts backing this document's central structural claims, so they can be checked without
re-fetching source files.

**Live database query confirming zero persisted Unit 6B rows** (run 2026-09-24 against the real
Neon database this session has access to via `.env.local`). **Corrected per reviewer finding
(decision `55a535e0-78a0-4a1a-820a-4e73df71e53d`, R5)**: the original draft's query used a subject-
text pattern match (`ilike '%shed permit%'` etc.), which could not conclusively rule out a
differently-worded subject. Re-run against the exact `ruleType` value of all 19 real candidates:
```
query: select id, subject, lifecycle_state, tier,
              rule_specification->>'ruleType' as rule_type
       from regulatory_rules
       where rule_specification->>'ruleType' = ANY(ARRAY[
         'SHED_PERMIT_P1_ROOF_AREA','SHED_PERMIT_P2A_STORY_HEIGHT',
         'SHED_PERMIT_P2B1_ACCESSORY_HEIGHT_LIMIT_IN_SETBACK','SHED_PERMIT_P2B2_ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK',
         'SHED_PERMIT_P3A_FOUNDATION_EXEMPTION','SHED_PERMIT_P3B_FOUNDATION_STFI_DISQUALIFIER',
         'SHED_PERMIT_P4_ATTACHMENT','SHED_PERMIT_P5_USE','SHED_PERMIT_P6_ECA_CRITERION',
         'SHED_PERMIT_P7A_SIZE_SPAN_FOOTPRINT','SHED_PERMIT_P7B_SIZE_SPAN_STRUCTURAL',
         'SHED_PERMIT_P9_EXEMPTION_NOT_ZONING_COMPLIANCE',
         'SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM','SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION',
         'SHED_LOT_COVERAGE_C1C_TRANSIT_BONUS','SHED_LOT_COVERAGE_C1D_STACKED_BONUS',
         'SHED_LOT_COVERAGE_C1E_MINIMUM_FLOOR','SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE',
         'SHED_LOT_COVERAGE_C2_ESTIMATE_CAVEAT'
       ]);  -- 19 values, exhaustive
result: ruleTypes count: 19
        matched rows: 0
        []
```
Exhaustive and conclusive: every one of the 19 exact rule-type values, individually, matches zero
rows in the real `regulatory_rules` table.

**`lifecycle.ts`'s Tier-2 `sourceVerify()` gate** (`src/regulatory-rule-governance/lifecycle.ts`,
the exact structural check that blocks P6/C1e-director):
```ts
export function sourceVerify(rule: RegulatoryRule, verification: VerificationRecord): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.TRIAGED) {
    return { outcome: "REJECTED", reason: `Cannot source-verify from state ${rule.lifecycleState}; must be TRIAGED.` };
  }
  if (!rule.tier) {
    return { outcome: "REJECTED", reason: "Rule has no confirmed tier; triage() must run first." };
  }
  if (!verification.founderIdentity.trim()) {
    return { outcome: "REJECTED", reason: "founderIdentity is required for source verification." };
  }
  if (verification.tier !== rule.tier) {
    return { outcome: "REJECTED", reason: "Verification tier does not match the rule's confirmed tier." };
  }
  if (rule.tier === Tier.TIER_2 && !verification.escalatedProfessional) {
    return {
      outcome: "REJECTED",
      reason: "TIER_2 rules require a recorded escalated domain-professional opinion before SOURCE_VERIFIED.",
    };
  }
  return { outcome: "OK", rule: { ...rule, lifecycleState: LifecycleState.SOURCE_VERIFIED, verificationHistory: [...rule.verificationHistory, verification] } };
}
```

**`evaluate.ts`'s three constituent-rule-type gate sets** (the exact source of every "requires ALL
of..." claim above):
```ts
const PERMIT_REQUIREMENT_CONSTITUENT_RULE_TYPES: readonly string[] = [
  ShedPermitRuleType.ROOF_AREA, ShedPermitRuleType.STORY_HEIGHT, ShedPermitRuleType.FOUNDATION_EXEMPTION,
  ShedPermitRuleType.FOUNDATION_STFI_DISQUALIFIER, ShedPermitRuleType.ATTACHMENT, ShedPermitRuleType.USE,
  ShedPermitRuleType.ECA_CRITERION, ShedPermitRuleType.SIZE_SPAN_FOOTPRINT, ShedPermitRuleType.SIZE_SPAN_STRUCTURAL,
];
const ACCESSORY_HEIGHT_LIMIT_CONSTITUENT_RULE_TYPES: readonly string[] = [
  ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_IN_SETBACK, ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK,
];
const SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES: readonly string[] = [
  ShedLotCoverageRuleType.BASE_MAXIMUM, ShedLotCoverageRuleType.ECA_LOT_AREA_EXCLUSION,
  ShedLotCoverageRuleType.TRANSIT_BONUS, ShedLotCoverageRuleType.STACKED_BONUS,
  ShedLotCoverageRuleType.MINIMUM_FLOOR, ShedLotCoverageRuleType.DIRECTOR_ALTERNATIVE,
];
```
Confirms: P9 (`EXEMPTION_NOT_ZONING_COMPLIANCE`) and C2 (`ESTIMATE_CAVEAT`) appear in neither list
above nor in `UNIT_6B_AGGREGATE_ONLY_RULE_TYPES`'s other members beyond these three sets — they are
listed separately in that aggregate-only set (excluded from generic dispatch) but gate nothing.

**Test execution evidence** (added per reviewer finding, decision
`55a535e0-78a0-4a1a-820a-4e73df71e53d`, R5; **expanded per reviewer finding, decision
`b3af27bc-cfc8-4d9d-9268-88c448eec609`, R10, since the first cut omitted suites this document also
cites** — re-run 2026-09-24, command and full result):
```
$ npx vitest run --config vitest.config.ts \
    tests/regulatory-rule-governance/shed-permit-candidates.test.ts \
    tests/regulatory-rules-engine/shed-permit-evaluate.test.ts \
    tests/report-generation-orchestrator/pipeline.test.ts \
    tests/property-intelligence/existing-structures.test.ts \
    tests/report-pdf-rendering/render.test.ts \
    tests/screening-request/validation.test.ts

 ✓ |deterministic| tests/property-intelligence/existing-structures.test.ts (11 tests) 3ms
 ✓ |deterministic| tests/report-pdf-rendering/render.test.ts (16 tests) 4ms
 ✓ |deterministic| tests/screening-request/validation.test.ts (27 tests) 9ms
 ✓ |deterministic| tests/regulatory-rules-engine/shed-permit-evaluate.test.ts (52 tests) 9ms
 ✓ |deterministic| tests/regulatory-rule-governance/shed-permit-candidates.test.ts (23 tests) 5ms
 ✓ |deterministic| tests/report-generation-orchestrator/pipeline.test.ts (33 tests) 149ms

 Test Files  6 passed (6)
      Tests  162 passed (162)
```
This command now covers every suite this document cites anywhere: the 19-candidate governance
hard-invariant tests and every evaluator (75, as before), `pipeline.test.ts`'s 33 (including the 18
`deriveIsInRequiredSetback` tests the P2b section refers to), `existing-structures.test.ts`'s 11
(including `buildExistingStructureCoverageFact`, which the C2 section refers to), and the PDF/
validation suites referenced elsewhere in this document's own implementation history. No
"Automated-test: covered, passing" line above cites a suite outside this list.

**Admin rule-governance route inventory** — **corrected per reviewer finding (decision
`b3af27bc-cfc8-4d9d-9268-88c448eec609`, R12)**: the prior draft labeled abbreviated excerpts as
"full contents"; below is the real directory listing plus the complete, unabridged contents of all
four route files (`.DS_Store` excluded as non-code):
```
$ find app/api/admin/rules -type f | sort
app/api/admin/rules/.DS_Store
app/api/admin/rules/[ruleId]/disable/route.ts
app/api/admin/rules/[ruleId]/reenable/route.ts
app/api/admin/rules/[ruleId]/route.ts
app/api/admin/rules/route.ts
```
```ts
// app/api/admin/rules/route.ts (complete file, 12 lines)
import { getDb } from "../../../../src/db/client.js";
import { listRules } from "../../../../src/regulatory-rule-governance/repository.js";

/** ADM-2: rule/version inspection, read-only. */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const applicableProjectType = searchParams.get("applicableProjectType") ?? undefined;
  const applicableZone = searchParams.get("applicableZone") ?? undefined;

  const rules = await listRules(getDb(), { applicableProjectType, applicableZone });
  return Response.json({ rules });
}
```
```ts
// app/api/admin/rules/[ruleId]/route.ts (complete file, 11 lines)
import { getDb } from "../../../../../src/db/client.js";
import { getRuleById } from "../../../../../src/regulatory-rule-governance/repository.js";

/** ADM-2: rule/version inspection, read-only. */
export async function GET(_request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params;
  const rule = await getRuleById(getDb(), ruleId);
  if (!rule) {
    return Response.json({ error: "Regulatory rule not found." }, { status: 404 });
  }
  return Response.json({ rule });
}
```
```ts
// app/api/admin/rules/[ruleId]/disable/route.ts (complete file)
import { getDb } from "../../../../../../src/db/client.js";
import { requireOperatorId, validateReason } from "../../../../../../src/admin-auth/operator.js";
import { disableRule } from "../../../../../../src/regulatory-rule-governance/admin-lifecycle.js";

/** ADM-7: ACTIVE -> DISABLED. Reversible lifecycle-state-only toggle - never permission to mutate
 * published content. */
export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }
  const { ruleId } = await params;
  const body = (await request.json().catch(() => undefined)) as { reason?: unknown } | undefined;
  const reasonResult = validateReason(body?.reason);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "reason is required.", issues: reasonResult.issues }, { status: 400 });
  }
  const result = await disableRule(getDb(), ruleId, operatorId, reasonResult.data);
  switch (result.outcome) {
    case "NOT_FOUND":
      return Response.json({ error: "Regulatory rule not found." }, { status: 404 });
    case "REJECTED":
      return Response.json({ error: result.reason }, { status: 400 });
    case "CONFLICT":
      return Response.json({ error: "The rule's lifecycle state changed before this request could be applied - reload and retry." }, { status: 409 });
    case "OK":
      return Response.json({ rule: result.rule }, { status: 200 });
  }
}
```
```ts
// app/api/admin/rules/[ruleId]/reenable/route.ts (complete file)
import { getDb } from "../../../../../../src/db/client.js";
import { requireOperatorId, validateReason } from "../../../../../../src/admin-auth/operator.js";
import { reenableRule } from "../../../../../../src/regulatory-rule-governance/admin-lifecycle.js";

/** ADM-7: DISABLED -> ACTIVE, legal only for the exact rule version being re-enabled - never
 * permission to mutate published content. If correcting the underlying problem requires changing
 * regulatory logic/applicability/threshold/citation content, this route must NOT be used - a new
 * version goes through the full governance pipeline instead. */
export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const operatorId = requireOperatorId();
  if (!operatorId) {
    return Response.json({ error: "ADMIN_OPERATOR_ID is not configured." }, { status: 401 });
  }
  const { ruleId } = await params;
  const body = (await request.json().catch(() => undefined)) as { reason?: unknown } | undefined;
  const reasonResult = validateReason(body?.reason);
  if (reasonResult.outcome === "INVALID") {
    return Response.json({ error: "reason is required.", issues: reasonResult.issues }, { status: 400 });
  }
  const result = await reenableRule(getDb(), ruleId, operatorId, reasonResult.data);
  switch (result.outcome) {
    case "NOT_FOUND":
      return Response.json({ error: "Regulatory rule not found." }, { status: 404 });
    case "REJECTED":
      return Response.json({ error: result.reason }, { status: 400 });
    case "CONFLICT":
      return Response.json({ error: "The rule's lifecycle state changed before this request could be applied - reload and retry." }, { status: 409 });
    case "OK":
      return Response.json({ rule: result.rule }, { status: 200 });
  }
}
```
Confirmed by reading every line of all four complete files: no route imports or calls `draft`,
`triage`, `sourceVerify`, `markTested`, or `approve` from `regulatory-rule-governance/lifecycle.ts`
or `admin-lifecycle.ts` anywhere under `app/`.

**`pipeline.ts`'s single production call site for `ecaAdjustment`** (added per reviewer finding,
decision `b3af27bc-cfc8-4d9d-9268-88c448eec609`, R11 — the evidence connecting C1b's producer
function to what a real report actually receives, backing the C1e-floor/C1e-director "unreachable
for any real parcel" claims):
```ts
// src/report-generation-orchestrator/pipeline.ts, the shed lot-coverage-facts assembly site
ecaAdjustment: evaluateEcaLotAreaAdjustment(environmentalConstraintsFact?.value ?? []),
```
Confirmed by grep across `src/`, `app/`, and `scripts/` for `ecaAdjustment:` (the only way a
`ShedLotCoverageFacts`/`EcaLotAreaAdjustment` value is constructed): exactly one production
construction site, `pipeline.ts` above, calling `evaluateEcaLotAreaAdjustment` directly. The other
two matches are `regulatory-rules-engine/types.ts` (the field's own type declaration) and
`app/components/ReportView.tsx` (the display type mirror, not a construction site). No other code
path can supply an `ESTABLISHED` `ecaAdjustment` to a real evaluation.

**Governance test fixture's own docstring** (`tests/fixtures/shed-permit-candidates.ts`, confirming
the "test-model only" characterization):
> "Every row here mirrors Unit 4's `realGarageLotCoverageCandidate` precedent exactly: real,
> non-fixture content (`isTestOnlyFixture: false`), progressed only through `draft()` ->
> `triage()` in `tests/regulatory-rule-governance/shed-permit-candidates.test.ts` — never
> `sourceVerify()`, `markTested()`, `approve()`, or `activate()`. Held at DRAFTED/TRIAGED only, per
> code-generation-plan.md §5's explicit constraint."

**`candidate-regulatory-rules.md`'s own current-status line**, confirming `RESEARCHED` is the real,
current state, not `TRIAGED`:
> "**Still `RESEARCHED` state** — none of these are drafted, triaged, source-verified end-to-end,
> tested, approved, or activated. The existing lifecycle (`RESEARCHED → DRAFTED → TRIAGED →
> SOURCE_VERIFIED → TESTED → APPROVED → ACTIVE`) is not bypassed by a tier confirmation."

**`evaluate.ts`'s `evaluateEcaLotAreaAdjustment` (C1b) — the exact function backing the corrected
finding above (decision `55a535e0-78a0-4a1a-820a-4e73df71e53d`, R6) that `ESTABLISHED` is
structurally unreachable through it today**:
```ts
const ECA_HAZARD_TYPE_TO_COVERAGE_EXCLUDED_CATEGORY: Record<string, CoverageExcludedEcaCategory> = {
  riparian_corridor: "RIPARIAN_CORRIDOR",
  wetland: "WETLAND_AND_BUFFER",
  wetland_buffer: "WETLAND_AND_BUFFER",
  shoreline_setback: "SUBMERGED_LAND_OR_SHORELINE_SETBACK",
  submerged_land: "SUBMERGED_LAND_OR_SHORELINE_SETBACK",
  steep_slope: "STEEP_SLOPE_NON_DISTURBANCE_AREA",  // <- the generic-hazard-to-named-category mapping flagged above
};

function evaluateEcaLotAreaAdjustment(ecaFindings: CriticalAreaFinding[]): EcaLotAreaAdjustment {
  const intersectingCategories = new Set<CoverageExcludedEcaCategory>();
  for (const finding of ecaFindings) {
    const category = ECA_HAZARD_TYPE_TO_COVERAGE_EXCLUDED_CATEGORY[finding.hazardType];
    if (category && finding.mappedIntersectionResult !== MappedIntersectionResult.NO_INTERSECTION) {
      intersectingCategories.add(category);
    }
  }
  if (intersectingCategories.size === 0) {
    return { status: "NOT_APPLICABLE", reason: "No mapped riparian corridor, wetland/buffer, submerged-land/shoreline-setback, or steep-slope non-disturbance area intersects this parcel." };
  }
  return {
    status: "REQUIRES_VERIFICATION",
    intersectingCategories: Array.from(intersectingCategories),
    reason: "A SMC 23.44.080.B-named lot-area-exclusion category intersects this parcel, but the exact excluded-area geometry needed to adjust the lot-coverage denominator is not established by this evaluation.",
  };
}
```
Confirmed by reading the complete function body: there is no code path in which this function
returns `{ status: "ESTABLISHED", ... }` — only the two branches shown above exist.
