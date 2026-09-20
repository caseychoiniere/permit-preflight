# Plan Amendment — Unit 6B: Shed Report Value Expansion

**2026-09-10. Founder-directed plan amendment. Not a reopening of any completed Construction
stage, not an architecture change.** A new unit of work is inserted into the approved
Unit-of-Work plan between Unit 6 (Optional Accounts) and Unit 7 (Fences). This document records
**why** the unit was added and **what was decided vs. left open**.

## Why Unit 6B was added

Real product / real-browser testing of the technically-complete shed report showed its customer
value is still too narrow: the report primarily answers **setback / placement** questions. Before
replicating this experience horizontally across Fences, Decks, Retaining Walls, Additions, and
ADUs, the founder chose to **deepen one report and validate a compelling paid-product experience
first.**

The product goal for the deepened shed report:

> "Can I probably build this here, what might stop me, will I likely need a permit, and what
> should I verify before spending more money?"

## What is explicitly preserved (no architecture / epistemic change)

- PostGIS remains the spatial source of truth.
- Regulatory rules remain deterministic and versioned.
- The LLM never decides a regulatory conclusion.
- `KNOWN` / `INFERRED` / `REQUIRES_VERIFICATION` classification is unchanged.
- Missing data never silently becomes `PASS`.
- Authoritative-source provenance is unchanged.
- Paid reports remain immutable.
- The flow fails closed on **claims**, not on the customer journey (the 2026-08-27 amendment).

## What was decided (this pass)

1. **A new unit exists**: "Unit 6B — Shed Report Value Expansion," inserted after Unit 6 and
   before Unit 7. **Existing units are not renumbered** — the project's AI-DLC convention uses
   stable unit identifiers, and a "6B" insert mirrors the earlier Unit 2 → Unit 2 + Unit 2B split.
2. **Four capabilities were researched**, not assumed to all ship:
   permit-requirement determination, lot-coverage analysis, ECA screening, and preliminary
   feasible-placement-area analysis. Findings:
   `aidlc-docs/construction/unit-6b-shed-report-value-expansion/research-findings.md`.
3. **Recommended scope** (AI recommendation, founder decides): ship **ECA screening + permit
   determination + lot coverage**; **defer** the preliminary feasible-placement-area map.
   Detail + the GO/NO-GO table: `.../recommended-scope.md`.
4. **Candidate regulatory rules** were produced in `RESEARCHED` state only, with AI-suggested
   tiers: `.../candidate-regulatory-rules.md`. **None are drafted, triaged, source-verified,
   tested, approved, or activated.** The founder confirms every tier.
5. **AI-DLC plan artifacts updated**: `unit-of-work.md`, `unit-of-work-story-map.md` (0 new
   stories — 6B deepens `SRE-SHED-1` / `RGD-1..6` / `SRE-0`), `unit-of-work-dependency.md`,
   `aidlc-state.md`, and `external-verification-tracker.md`.

## What is NOT yet decided (requires founder approval before Functional Design)

The Unit 6B **capability scope is NOT approved.** Ten open decisions are listed in
`.../recommended-scope.md` §"Decisions requiring founder approval", including: the 3-capability
scope itself, the new customer intake questions for permit determination, the tier confirmation
for every candidate rule, the ECA data-source set, lot-coverage-percentage handling, and pricing.

## Constraints on this pass (honored)

Per the founder's instruction, this research pass did **not**: implement any feature, reopen
Unit 1 architecture, modify any ACTIVE rule, activate any researched rule, generalize to multiple
jurisdictions, introduce new infrastructure, treat missing mapped data as proof a condition is
absent, imply permit approval or survey-grade geometry, let an LLM make a regulatory conclusion,
or expand into trees / permit history / utilities / easements / title research.

## Next step

Founder reviews `recommended-scope.md` and approves (or modifies) the Unit 6B capability scope.
On approval, the normal per-unit Construction loop begins at **Unit 6B Functional Design Part 1**.

---

## Addendum (2026-09-11) — Scope approved with modifications; Functional Design Part 1 produced

**Founder decision**: **SCOPE APPROVED WITH MODIFICATIONS.** Unit 6B will deepen the paid Shed
report with (A) mapped ECA/site-condition screening, (B) likely building-permit determination,
(C) estimated lot-coverage analysis — before Permit Preflight expands horizontally to additional
project types. Preliminary feasible-placement analysis (Track 4) remains deferred, including the
minimal-overlay variant proposed as an option in the original recommendation — the founder
declined that option too; Unit 6B carries no Track 4 work at all.

**Material design modifications directed by the founder, applied in Functional Design Part 1**
(`../functional-design/`):

1. **ECA reporting discipline**: DATA FACT vs REGULATORY CONCLUSION preserved; explicit allowed/
   not-allowed phrasing examples given and encoded as BR-U6B-2; advisory-vs-map-dispositive and
   parcel-vs-footprint-vs-buffer distinctions preserved, never collapsed to one boolean
   (BR-U6B-1); the report shows prominent items only for detected conditions, with clean results
   summarized rather than enumerated one-by-one (BR-U6B-4); the ECA→permit relationship must be a
   deterministic regulatory rule, never a direct GIS-adapter shortcut (BR-U6B-3).
2. **Permit intake redesigned as progressive disclosure**: only `foundationType`, `attachment`,
   `intendedUse` are always asked; ECA status is never asked (resolved automatically); a roof-
   overhang question is asked only near the 120-sq-ft boundary (BR-U6B-6); a structural-span
   question is asked only when it could actually change the review path (BR-U6B-7); utility
   intent stays optional/progressive and never feeds the primary state (BR-U6B-8).
3. **Permit result redesigned as two-dimensional** (`buildingPermit` × `reviewPath`) rather than
   one four-state enum, specifically so "a permit is required, but the review path is still
   unknown" can be stated truthfully without degrading to a generic `REQUIRES_VERIFICATION`
   (domain-entities.md §3a, business-logic-model.md Flow 3) — the founder's suggested design,
   evaluated and adopted.
4. **The 120-sq-ft SDCI source discrepancy** (`120 or less` vs `less than 120`) is documented as
   an open, non-blocking verification item (`rule-tier-review.md` "Open item"; tracker item 23) —
   not guessed, not resolved by assumption.
5. **Lot coverage re-verified against the CURRENT (January 2026, effective mid-January 2026,
   Council Bill 120993 / WA HB 1110) Seattle Neighborhood Residential rules**, not the stale
   pre-2024 35% figure or undated Tip 220 material. Confirmed: 50% base maximum (SMC 23.44.080),
   ECA-proportional reduction (mechanism unresolved — see below), and a reported (not yet
   verbatim-code-confirmed) 60% figure for stacked-dwelling-unit development at 23.44.080(G).
6. **`existing-structure-coverage` distinguishes MAPPED STRUCTURE COVERAGE ESTIMATE from
   CODE-DEFINED LOT COVERAGE** explicitly (domain-entities.md §1b, BR-U6B-10) — Building Outlines
   `AREA` is never treated as a code-compliance measurement.
7. **Lot-coverage results use threshold/range reasoning** rather than blanket
   `REQUIRES_VERIFICATION`: a new `CoverageMaximumResult` (`SINGLE_VALUE` / `RANGE` /
   `REQUIRES_VERIFICATION`) and comparison logic that only lands on `REQUIRES_VERIFICATION` when
   the estimate genuinely falls in the ambiguous band between possible maxima (BR-U6B-12,
   business-logic-model.md Flow 4) — the mechanism is general; no maximum value is hardcoded
   pending C1/C1b's source verification.
8. **ECA and lot coverage now compose rather than operate independently**: a new
   `EcaLotAreaAdjustment` type is explicitly a **regulatory rule** (candidate C1b), never a
   blind "subtract every mapped ECA polygon" behavior — for this unit's initial scope, any ECA
   intersection makes the coverage-limit adjustment `REQUIRES_VERIFICATION` (never guessed),
   with an asymmetric fail-closed rule: uncertainty can only push a result toward
   `REQUIRES_VERIFICATION`/`EXCEEDS`, never manufacture a false `WITHIN_LIMIT` (BR-U6B-11,
   business-logic-model.md Flow 4–5).
9. **Pricing**: unchanged, $9.99. No pricing work performed.
10. **Property Intelligence ownership confirmed**: `environmental-constraints` and
    `existing-structure-coverage` are descriptive-only facts; all regulatory interpretation
    stays in the Regulatory Rules Engine (domain-entities.md §3d, BR-U6B-3).
11. **No new user stories** — Unit 6B deepens `SRE-SHED-1` / `RGD-1..6` / `SRE-0`
    (unchanged from the original recommendation; founder confirmed no independently-valuable
    capability was discovered that couldn't be traced to existing stories).
12. **Rule tiers are NOT founder-confirmed** — a compact review table
    (`../functional-design/rule-tier-review.md`) was produced per the founder's exact required
    columns (rule ID, plain-English rule, proposed tier, primary source, exact source/code
    section, material ambiguity/exception, reason for tier), without large source excerpts,
    for the founder's own confirmation pass.
13. **External verification acknowledged, not blocking**: tracker items 19–22 (from the research
    pass) plus new item 23 (P1's `<`/`≤` operator — blocked on this sandbox's missing
    PDF-text-extraction tooling, not a source-access refusal) and items 24–25 (C1's 60% figure
    and C1b's ECA-mechanism, both needing verbatim-code confirmation) — none block Functional
    Design; all block their respective rule's promotion to `ACTIVE`.

**Status**: Unit 6B is now **SCOPE APPROVED — FUNCTIONAL DESIGN PRODUCED, AWAITING FOUNDER
REVIEW**. No Code Generation. No regulatory rule activated. No existing ACTIVE rule, Unit 1
architecture, or payment/report-immutability behavior touched.
