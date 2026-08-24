# Permit Preflight — Unit of Work Plan

**Prerequisites**: requirements.md, stories.md/personas.md, execution-plan.md (incl. Unit 0 /
GO-PIVOT-NO-GO gate), application-design.md — all APPROVED.

**Note on process**: The user's approval of Application Design included 10 explicit, directive
guidance points for this stage (vertical-slice sizing, solo-developer sequencing, Unit 0 gating,
the approved project-type sequence, incremental shared-architecture introduction, preservation of
all Application Design invariants, surface-not-silently-reorder) — these resolve most of what this
stage's standard clarifying-question categories would otherwise ask (Team Alignment = solo
developer, already answered; Business Domain sequence = already given; Dependencies = Unit 0 gate,
already given). Combined with the user's explicit instruction to "generate the Units of Work...
then stop for my review," this plan documents the decomposition methodology and the small number
of genuinely remaining judgment calls directly (clearly flagged as AI recommendations, consistent
with how persona/sequencing recommendations were handled in Requirements Analysis), then proceeds
straight to generating the full artifacts in this same pass — rather than opening another separate
Q&A round first. If any judgment call below should have been asked as a question instead, the
Request Changes gate at the end covers it.

- [x] Assessed whether a separate Planning Q&A round is warranted — determined not to be, given the directive guidance already provided (see note above)
- [x] Story Grouping strategy: vertical-capability slices per the user's guidance, not component/service mirroring (guidance point 1)
- [x] Dependencies: Unit 0 gates all production units (guidance points 3-4); technical dependencies among production units assessed below (guidance point 9)
- [x] Team Alignment: solo developer, sequential delivery (guidance point 2, requirements.md §14)
- [x] Technical Considerations: no differing scalability/deployment needs across units identified — single modular monolith throughout, consistent with requirements.md §9
- [x] Business Domain: approved project-type sequence adopted directly (guidance point 6)
- [x] Code Organization (greenfield): per `code-generation.md`'s "Greenfield multi-unit (monolith)" pattern — nesting logical modules inside a single shared tree, not per-unit top-level directories (that pattern is for microservices). **Corrected 2026-08-19 (JC6)**: this nesting is adopted at the Application-Design component/service granularity (e.g. `regulatory-rules-engine/`, `screening-request/`), not at the AI-DLC Unit-of-Work granularity — the original draft of this bullet conflated the two. Exact directory names remain deferred to Construction per the Application Design scope guidance.

## Judgment Calls — Resolution Log

### JC1 — Unit 1/2 split for the first (shed) vertical slice — **APPROVED 2026-08-19, unchanged**
User confirmed: "I approve the Unit 1 / Unit 2 split. Unit 1 proving the real
deterministic/regulatory foundation independently before adding payment/report fulfillment is
appropriately sized for a solo developer, while Unit 2 still delivers the first true end-to-end
customer vertical slice."

### JC2 — Admin/Support Foundations placement — **REVISED 2026-08-19**
Original recommendation (Unit 3 immediately after Unit 2, all 9 ADM stories) was directionally
approved but corrected on two points: (1) Unit 3 must be right-sized (see JC4 below), and (2) its
relationship to later units must be a stated hard dependency, not just a recommended order (see
the "Explicit Operational Gate" section in `unit-of-work-dependency.md`). Renamed to "Minimum
Paid-Product Operations."

### JC3 — Optional Accounts placement — **REVISED 2026-08-19**
User rejected the original placement (Unit 5, before Vacant-Land): "Vacant-land screening was
intentionally moved to the third project-type position because it is both strategically important
to the primary professional/repeat-evaluator persona and an important early product-risk
experiment. Optional Accounts have no technical dependency with Vacant Land and should not delay
that experiment." **Resolution**: Vacant-Land is now Unit 5 (immediately after Garages, preserving
the approved project-type sequence exactly), Optional Accounts moved to Unit 6 (after Vacant-Land).

### JC4 — Admin/Support completeness strategy — **REVISED 2026-08-19**
User rejected building all 9 ADM stories into one large internal-tooling unit: "I do not want all
nine Admin/Support stories to become a large internal-tooling gate before we continue validating
the core product... Define Unit 3 as the minimum operational capability required to safely support
real paid reports." **Resolution**: Unit 3 now carries 8 of 9 ADM stories (ADM-1, 2, 3, 4, 5, 6, 7,
8 — inspect evidence, inspect rule versions, inspect source health, inspect generation failures,
inspect payment/order state, refunds, disable a rule, mark a source unhealthy). ADM-9 (end-to-end
complaint investigation) and its Support Case component are deferred to **Unit 9 (Retaining
Walls)** — a placement chosen (not arbitrary) because Retaining Walls is explicitly the project
type most likely to generate confused-customer complaints (heavy REQUIRES VERIFICATION results),
and because by that point there's substantially more usage history to exercise the workflow
against. This specific placement is itself flagged as a judgment call open to override.

### JC5 — Operational gate resolution — **NEW 2026-08-19, resolved per explicit user instruction**
The user identified a real contradiction: the prior artifacts simultaneously implied "Unit 3
should come before scaling paid reports" (JC2's rationale) and stated "all later project types
depend only on Unit 2" (the dependency matrix). Instructed to resolve into one model. **Resolution
adopted**: Unit 3 is a genuine hard dependency for Units 4 through 11 (in addition to Unit 2), not
merely a recommended order — reasoning: shipping additional paid project types or account-linked
customer surface with zero refund/disable-rule/inspection capability would be operationally unsafe
once more than one project type's worth of paying customers and rule surface exists
(requirements.md §12, §31). This is now stated identically and consistently across
`unit-of-work.md` and `unit-of-work-dependency.md`.

### JC6 — Code organization language — **NEW 2026-08-19, corrected**
User identified a self-contradiction: committing to `src/{unit-name}/` while also explaining code
should be organized by Application Design component boundaries (since multiple units extend the
same component over time). **Resolution**: removed the unit-boundary code-organization commitment.
Clarified principle: Units of Work define delivery/sequencing; Application Design
components/services define logical code-ownership boundaries; `code-generation.md`'s
greenfield-monolith pattern is adopted at the component/service granularity, not the
Unit-of-Work granularity (these were conflated in the prior version); exact physical structure
remains deferred to Construction.

### JC7 — Hard-coded pricing — **NEW 2026-08-19, corrected**
User identified that Unit 2's description hard-coded "$9.99" despite requirements.md §9.4 treating
pricing as an unresolved hypothesis. **Resolution**: Unit 2 now reads "pay the current
server-configured report price."

## Mandatory Artifacts (Step 2)
- [x] `unit-of-work.md` — unit definitions, responsibilities, code organization strategy
- [x] `unit-of-work-dependency.md` — dependency matrix + recommended Construction order
- [x] `unit-of-work-story-map.md` — every one of the 54 stories assigned to exactly one unit
- [x] Unit boundaries/dependencies validated (all production units trace to Unit 0 = GO; no story left unassigned; no story assigned twice)

## Technical-Dependency Check Against the Approved Sequence (guidance point 9)
**Corrected 2026-08-19** — this section previously stated the pre-revision (Unit-2-only)
dependency model and was stale relative to the approved Unit 3 operational gate. Corrected text:

Checked whether any production unit (4, 5, 7, 8, 9, 10, 11 — the project-type units) has a hard
technical dependency forcing a different order than sheds → garages → vacant-land → fences → decks
→ retaining walls → additions → ADUs. **Finding: no such dependency exists.** No project-type unit
has a technical dependency on another project-type unit that forces a change to the approved
project-type sequence. Each subsequent paid project-type unit depends on Unit 2 (shared
purchasable-report foundation) and Unit 3 (minimum paid-product operational safety gate), but does
not require the preceding project-type unit to exist. The approved sequence is preserved because
it was approved for product/architecture-proving reasons (requirements.md §1.4), not because the
code requires it. This is stated explicitly rather than silently assumed, per guidance point 9.

Note: Unit 6 (Optional Accounts) is not a project-type unit and is excluded from this check; its
own dependencies (Unit 2, Unit 3) are covered identically in `unit-of-work-dependency.md`.
