# Permit Preflight — Units of Work

**Revised 2026-08-19 (latest)** — Two-gate model adopted (Technical Feasibility Gate vs. Commercial
Value Gate, see execution-plan.md). Unit 2 split into Unit 2 (Report Generation & Presentation
Prototype, authorized under Technical GO) and **Unit 2B** (Commercial Payment & Fulfillment, gated
behind Commercial GO/Unit 0C). Units 3-11 now explicitly depend on Commercial GO in addition to
their prior dependencies. Unit 1 is authorized and proceeding.

**Revised 2026-08-19 (earlier)** per user review — sequence corrected (Vacant-Land moved to position 5,
before Optional Accounts, preserving the approved project-type order), Unit 3 right-sized to
minimum paid-product operational capability, code-organization language corrected, Unit 2 pricing
language de-hardcoded.

13 units total (Unit 0 + Unit 1 + Unit 2 + Unit 2B + 9 further production units). Sized as coherent
vertical capabilities — not a mechanical one-to-one mapping of the 16 Application Design
components/6 services to units.

---

## Unit 0: Pre-Construction Validation
*(requirements.md §11 [E3]; execution-plan.md — see the TWO-GATE MODEL section for current status)*

**Delivers**: A real answer to "can Permit Preflight actually work?" — using real Seattle
properties, evaluated via scripts/spreadsheets/manual research/GIS tools, **without building the
production application**.

**Not components/services** — human-in-the-loop validation only.

**Status (2026-08-19)**: Ran as Unit 0 → PIVOT → Unit 0B (pivot validation) → **TECHNICAL GO**
(accepted by the user). Unit 0C (customer-value validation) remains open in parallel, gating
Commercial GO specifically, not Technical Construction. See execution-plan.md's TWO-GATE MODEL
section for the authoritative current gating status — the single "all units depend on GO" framing
originally stated here is superseded by that two-gate split.

---

## Unit 1: Deterministic Evaluation Foundation (Sheds)

**Delivers**: A correct, tested, human-approved deterministic evaluation of shed/accessory-structure
buildability for a real parcel — verifiable via fixtures, not yet customer- or payment-facing.

**Stands up**: Parcel Resolution, Property Intelligence, Data Source Registry, Spatial Analysis,
Regulatory Source Access, Rule Research Assistant, Regulatory Rule Governance, Rule Governance
Workflow Service, Regulatory Rules Engine (full Tier 1/Tier 2 lifecycle exercised end-to-end for
the first time, producing real ACTIVE shed rules).

**Depends on**: Unit 0 = GO.

**Exit criteria**: At least one real shed scenario evaluates correctly end-to-end, through rules
that went through the full RESEARCHED→...→ACTIVE lifecycle with real founder verification (and
Tier 2 escalation exercised at least once if any shed rule triggers it).

---

## Unit 2: Report Generation & Presentation Prototype
*(Revised and split 2026-08-19 per the two-gate model — see execution-plan.md. Formerly "Purchasable
Shed Report"; the commercial-payment portion is split out to Unit 2B, gated behind Commercial GO.
This split is the AI's proposed boundary for "validation-useful, low commercial investment" per
the user's instruction to identify a sensible line within the original Unit 2 — flagged for
confirmation/adjustment, not treated as unquestionable.)*

**Delivers**: A real, evidence-backed shed buildability report can be generated end-to-end and
viewed (web + PDF) — proving the full deterministic-plus-explanation pipeline and giving Unit 0C
real generated reports to show interview participants (an upgrade over the hand-assembled samples
in `sample-reports.md`) — **without live payment**. Report generation is authorized by a lightweight
internal/founder-triggered mechanism standing in for a verified-PAID transition, not real Stripe
Checkout.

**Stands up**: Screening Request, Project Preflight Service (shed path), AI Service / AI Provider
Adapter, Report Explanation, Report Generation Job (component — created via the internal trigger
described above, not `Order & Payment`), Report Generation Orchestrator Service, Evidence & Report
Artifact.

**Explicitly excluded from this unit** (deferred to Unit 2B): Order & Payment, Checkout &
Fulfillment Service, live Stripe Checkout/webhook integration, Account's guest-checkout purchase
flow (`authorizeReportAccess`'s guest-credential path specifically ties to a real purchase and
moves with it — Unit 2 may use a simpler internal-access mechanism for prototype reports).

**Depends on**: Unit 1, Technical GO (satisfied 2026-08-19).

**Exit criteria**: A configured shed project passes the PO-0-equivalent readiness check, an
internally-authorized report-generation job runs the full pipeline, and a correctly-classified,
evidence-backed report (web + PDF) is produced, with graceful LLM degradation if the AI Service is
unavailable. No real money changes hands in this unit.

**Implementation note carried forward**: stories.md's RGD-1 acceptance criteria reference "Given an
order has moved to PAID status" — Unit 2's Functional Design should adapt this to "given a
report-generation job is authorized via [the internal trigger]," with Unit 2B later wiring the same
job-creation call to a real verified-PAID transition instead. This is a deliberate, temporary
substitution, not a silent scope change to the approved story.

---

## Unit 2B: Commercial Payment & Fulfillment
*(New 2026-08-19, split from the original Unit 2 — gated behind Commercial GO)*

**Delivers**: Real customers can pay the current server-configured report price via Stripe Checkout
and receive their report — the commercial completion of the vertical slice Unit 2 proved
technically.

**Stands up**: Order & Payment, Checkout & Fulfillment Service, Account (guest mode +
`authorizeReportAccess`'s guest-credential path).

**Depends on**: Unit 2, **Commercial GO** (Unit 0C produces GO — not yet satisfied).

**Exit criteria**: Unchanged from the original Unit 2 exit criteria — a guest user can pay via
Stripe Checkout at the current server-determined price and receive report access via secure link,
with idempotent webhook-verified payment state, separate from (not conflated with) Report
Generation Job state.

---

## Unit 3: Minimum Paid-Product Operations
*(renamed and right-sized 2026-08-19, was "Admin/Support Foundations")*

**Delivers**: The minimum operational capability required to safely support real paid reports —
not full Admin/Support Service coverage. Scoped to exactly what's needed before it's safe to
expand the paid-customer surface area further (more project types, accounts).

**Included stories** (8 of 9 ADM stories): ADM-1 (inspect report evidence/provenance), ADM-2
(inspect rule versions — sufficient to investigate a result, not full rule-governance tooling),
ADM-3 (inspect data-source health), ADM-4 (inspect report-generation failures), ADM-5 (inspect
payment/order state), ADM-6 (issue/process refunds), ADM-7 (emergency-disable a problematic rule),
ADM-8 (mark a data source unhealthy).

**Deferred** (1 of 9 ADM stories, per the user's explicit "assign to exactly one later unit"
instruction): **ADM-9** (investigate/resolve a customer complaint end-to-end) and its supporting
**Support Case** component are deferred to **Unit 9 (Retaining Walls)** — not because of any
technical dependency, but because Retaining Walls is the project type explicitly flagged
(stories.md SRE-WALL-1, research-findings.md) as most likely to produce heavy REQUIRES
VERIFICATION results and therefore the most likely near-term source of confused-customer
complaints; by that point in the sequence there's also substantially more usage history to
exercise a real complaint-investigation workflow against. This placement is a judgment call, not a
hard requirement — flagged for your review like the other sequencing decisions.

**Stands up**: Admin/Support Service (8 of 9 stories — ADM-9 and Support Case explicitly excluded
here).

**Depends on**: Unit 2B, **Commercial GO** (revised 2026-08-19 — needs real orders to inspect, which only exist once Unit 2B's live payment exists; explicitly gated behind Commercial GO alongside Unit 2B per the two-gate model, not authorized under Technical GO alone).

**Gates**: Units 4 through 11 (see the explicit operational-gate dependency in
`unit-of-work-dependency.md` — this is now a stated hard dependency, not merely a recommended
order, per the user's instruction to resolve the ambiguity one way or the other).

**Exit criteria**: The founder/operator can inspect report evidence, rule versions (sufficiently to
investigate a specific result), data-source health, and payment/order state; issue a refund;
disable a rule; and mark a source unhealthy — all without a raw database query, and all before any
additional paid project type or account-linked customer surface goes live.

---

## Unit 4: Detached Garages

**Delivers**: The second project type, proving the pipeline generalizes beyond sheds.

**Extends**: Regulatory Rules Engine (new rule set), Project Preflight Service (garage path).

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate model).

---

## Unit 5: Vacant-Land Screening
*(moved to position 5, immediately after Garages, per user correction 2026-08-19 — preserves the approved project-type sequence: sheds → garages → vacant-land → fences → decks → retaining walls → additions → ADUs)*

**Delivers**: The distinct vacant-land customer journey — "is this parcel worth deeper
investigation?" — reusing the shared pipeline without forcing project-configuration concepts onto
it. Strategically important to the primary professional/repeat-evaluator persona and an important
early product-risk experiment, per the user's explicit rationale for this position.

**Stands up**: Vacant-Land Screening Service (new). **Extends**: Regulatory Rules Engine
(`evaluateVacantLand`), Spatial Analysis (buildable-envelope calculation), Report Explanation
(`explainVacantLandAssessment`, deterministic-assessment/LLM-explains-only framing).

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate model).

**Exit criteria**: A user can screen a vacant parcel and receive a preliminary screening assessment
(not a "recommendation") with defensible-only buildable-area/scenario information and explicit
REQUIRES VERIFICATION items.

---

## Unit 6: Optional Accounts
*(moved to position 6, after Vacant-Land, per user correction 2026-08-19)*

**Delivers**: Account creation, report history, and account deletion for the professional/repeat-evaluator
persona, plus save/resume for in-progress requests — now available in time to serve repeat users of
the Vacant-Land and upcoming project-type units.

**Extends**: Account (adds ACC-2/3/4 on top of Unit 2's guest-only baseline), Screening Request
(save/resume, PC-3).

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate
model — account deletion/disputes are exactly the kind of new support surface Unit 3's minimum
capability exists to handle, and this unit is explicitly listed as deferred "optional account
sophistication" until Commercial GO).

**Exit criteria**: A user can create an account, see their report history (server-enforced
ownership), link a prior guest purchase with proof of control, save and resume an in-progress
request, and delete their account per the retention policy.

---

## Unit 7: Fences

**Delivers**: The third structure project type — deliberately low-complexity. Candidate for the C3
case-by-case low-value review if early data shows low report value.

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate model).

---

## Unit 8: Decks

**Delivers**: Adds attachment-to-primary-structure and height-above-grade evaluation.

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate model).

---

## Unit 9: Retaining Walls

**Delivers**: The project type flagged as prone to heavy geotechnical/engineering-triggered
REQUIRES VERIFICATION results. Built after the REQUIRES VERIFICATION UX pattern is well-proven
(Units 1-8 all exercise it). **Also delivers the deferred ADM-9 + Support Case** (see Unit 3 note
above) — the complaint-investigation workflow ships alongside the project type most likely to need
it.

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate model).

---

## Unit 10: Residential Additions

**Delivers**: Higher-complexity evaluation — existing nonconforming-structure handling, multiple
setback categories.

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate model).

---

## Unit 11: ADUs

**Delivers**: The highest-regulatory-complexity, highest-professional-persona-value project type —
the focused "deep" build once the pipeline is thoroughly proven.

**Depends on**: Unit 2B, **and Unit 3**, **and Commercial GO** (revised 2026-08-19, two-gate model).

---

## Code Organization Strategy — Corrected 2026-08-19

**Prior version incorrectly committed to a literal `src/{unit-name}/` directory structure while
simultaneously explaining that code should be organized around Application Design
components/services. That was self-contradictory and is corrected here.**

The clarified principle:
- **Units of Work define delivery and Construction sequencing** — what gets built and shipped
  together, and in what order. They are a planning/scheduling concept.
- **Application Design components/services define logical code-ownership boundaries** — e.g.,
  `regulatory-rules-engine`, `screening-request`, `report-generation-job`. This is the durable
  organizational structure, because **multiple units extend the same component over time** (Units
  4, 5, 7, 8, 9, 10, 11 all extend Regulatory Rules Engine; Unit 6 extends Account, which Unit 2
  already stood up).
- `code-generation.md`'s prescribed pattern for a greenfield multi-unit monolith — nesting logical
  modules inside a single shared tree (as opposed to microservices' per-unit top-level
  directories) — is adopted at the *component/service* granularity, not the *AI-DLC Unit-of-Work*
  granularity. These are different groupings (a component is a stable code-ownership boundary; a
  Unit of Work is a temporary delivery-sequencing label), and conflating them was the error in the
  prior version.
- **Exact physical Next.js/`src/` folder structure, naming, and layout remain deferred to
  Construction-phase Code Generation**, per the Application Design scope guidance — this document
  fixes the *principle* (component-boundary code ownership, not unit-boundary code ownership), not
  the literal paths.
