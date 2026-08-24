# Unit 2: Report Generation & Presentation Prototype — Functional Design Plan

**Unit definition**: `unit-of-work.md` Unit 2 (revised 2026-08-19, split from the original
"Purchasable Shed Report" per the Two-Gate Model). **Assigned stories**:
`unit-of-work-story-map.md` Unit 2 — PC-1, PC-2 (Project Configuration, 2 stories); RGD-1 through
RGD-6 (Report Generation & Delivery, 6 stories). 8 stories total.

**Category A / B split (per the user's 2026-08-22 instruction)** — already established at the Unit
level, not something this Functional Design reopens:
- **Category A (this unit builds all of it)**: Screening Request, Project Preflight Service (shed
  path only), AI Service/AI Provider Adapter, Report Explanation, Report Generation Job (created via
  an internal trigger, not real payment), Report Generation Orchestrator Service, Evidence & Report
  Artifact, and — for the first time — real PostGIS-backed Spatial Analysis wiring (Unit 1 built
  Spatial Analysis's pure logic/reference implementation only; production PostGIS invocation was
  explicitly deferred to whichever unit builds Report Generation Orchestrator Service — that's this
  unit).
- **Category B (explicitly NOT this unit — Unit 2B, blocked on Commercial GO)**: Order & Payment,
  Checkout & Fulfillment Service, live Stripe integration, real guest-checkout purchase flow.
  RGD-1's "given an order has moved to PAID status" criterion is satisfied here via a lightweight,
  explicitly-named internal authorization trigger (Question 1 below) — not a payment simulation,
  and structurally swappable for a real PAID transition in Unit 2B without redesign.

**Grounding**: Unit 1 already delivers the real evaluation engine this unit orchestrates —
`evaluateProject`, the real (honestly TRIAGED, not ACTIVE) shed candidate, the Anthropic adapter
pattern (`AiCompletionClient`), and the Boundary Validator/Bounded-Retry patterns this unit should
reuse rather than reinvent. This unit's job is to build the pipeline *around* that engine: intake
→ orchestration → real spatial computation → evidence assembly → presentation. Only the shed
project type is in scope (the only production-approved evaluation Unit 1 built) — every other
project type is a later unit's job.

---

## Design Checklist
- [x] Answer clarifying questions below
- [x] Analyze answers for ambiguity; raise follow-ups if needed — none needed, all 7 answers were
      specific and unambiguous
- [x] Create `business-logic-model.md` — core workflows: Screening Request creation/validation
      (existing-property, shed only), PO-0-equivalent readiness check, internal generation
      authorization, Report Generation Orchestrator's pipeline (Property Intelligence → real
      PostGIS Spatial Analysis → Regulatory Rules Engine → Report Explanation → Evidence & Report
      Artifact), web/PDF report rendering, immutable snapshot guarantee
- [x] Create `business-rules.md` — PO-0-equivalent readiness rule, internal-authorization rule
      (what makes a Report Generation Job creatable without real payment), spatial-input-to-
      `ShedProjectDetails` mapping rule, LLM-degradation rule (reuse RGD-5's already-approved
      shape), REQUIRES VERIFICATION presentation rule, parcel-geometry caveat propagation rule
- [x] Create `domain-entities.md` — ScreeningRequest (+ immutable snapshot), ReportGenerationJob,
      EvidenceReportArtifact, and the new persisted-geometry concepts needed for real Spatial
      Analysis (parcel boundary, proposed structure placement)
- [x] Create `frontend-components.md` — project-configuration flow (PC-1/PC-2) and web report view
      (RGD-2), since this unit has a real UI surface for the first time
- [x] Cross-check every artifact traces to an assigned story (PC-1/PC-2, RGD-1..6) and respects
      every Unit 1 invariant already proven (CONFIRMED precondition, classification ownership,
      ACTIVE-only rule consumption, etc.) without re-litigating them

---

## Clarifying Questions

### Question 1 — What the Internal Generation-Authorization Trigger Actually Is
`unit-of-work.md` requires RGD-1's "given an order has moved to PAID status" criterion be adapted
to "given a report-generation job is authorized via [an internal trigger]," swappable for a real
PAID transition in Unit 2B without redesign. What should that trigger concretely be at the
business-logic level?

A) **A single explicit domain action** — e.g. `authorizeReportGeneration(screeningRequestId,
   authorizedBy)` — requiring a recorded identity (the founder, running it manually/via a script),
   mirroring the same "no automated process bypasses a required human action" pattern already used
   for rule governance (RRAG-8). Structurally, `authorizedBy` here plays the same role
   `Order & Payment`'s verified-PAID event plays in Unit 2B — the call site changes in Unit 2B, the
   downstream contract (Report Generation Job creation) does not. **Recommended** — keeps the
   swap genuinely trivial later and avoids quietly building an implicit "anyone can trigger
   generation" capability into a component whose real-world equivalent (payment) will always
   require authorization.

B) A simpler flag/status field on the Screening Request (e.g. `generationAuthorized: true`) set by
   any caller — less ceremony, but doesn't mirror the eventual real trigger's authorization
   requirement as closely.

X) Other (describe after [Answer]: below)

[Answer]: A

Use the explicit domain action `authorizeReportGeneration(screeningRequestId, authorizedBy)`.
`authorizedBy` is a recorded real human/internal-operator identity. This is explicitly an
INTERNAL_PROTOTYPE authorization mechanism — not a simulated payment, and not evidence an Order
reached PAID. Its output must satisfy the same downstream generation contract required to create a
ReportGenerationJob that Unit 2B's real verified-PAID event will satisfy, so Unit 2B can later
replace the triggering condition without changing the generation pipeline itself. No caller may
create a generation job merely by setting a boolean flag.

### Question 2 — Parcel & Structure Geometry Source (new: real PostGIS wiring)
Unit 1 never wired PostGIS to anything — Spatial Analysis's real geometry computation starts here.
Two things need real coordinate geometry that don't exist yet: (a) the parcel's actual boundary
polygon, (b) the proposed shed's placement on that parcel (PC-2: "user can indicate approximate
placement"). Unit 0/0B validated King County's `Address_Points_locator` and `KingCo_PropertyInfo`
endpoints (already used in Unit 1) but never a parcel *polygon* layer specifically. How should this
unit source parcel boundary geometry?

A) **Fetch the real parcel boundary polygon on demand from King County's public parcel GIS layer**
   (the same ArcGIS REST family already validated for the other two King County integrations),
   per-parcel, at evaluation time — no bulk mirroring/ingestion of county-wide geometry, consistent
   with the "permitted access, no bulk scraping" pattern already established for Legistar/Municode.
   Persist only the specific parcel geometry actually used by a given report (for RGD-4's
   reproducibility requirement), not a general county-wide cache. **Recommended.**

B) Something else — describe after [Answer]: below (e.g., a different data source, or deferring
   real polygon geometry and using a simplified/approximate parcel shape for this prototype)

X) Not yet researched enough to decide — flag as a Unit 2-scoped mini-validation step before this
   part of the design is finalized (similar in spirit to Unit 0B, but scoped narrowly to "does King
   County publish a usable parcel-polygon endpoint, and what does Unit 0B's already-confirmed PIN
   give us to query it by")

[Answer]: A

Use King County's public parcel-polygon GIS layer on demand, queried by the already-confirmed
PIN. Narrowly checked as sufficient to proceed with Functional Design: King County exposes a
polygon parcel FeatureLayer, PIN is a queryable field, polygon geometry is available, the service
supports application-consumable query formats, and the source uses King County's parcel-framework
geometry. Do not bulk-ingest or mirror the county-wide dataset — fetch only the parcel geometry
needed for the current evaluation, and preserve the exact geometry/evidence snapshot used by the
generated report (RGD-4 reproducibility). **Important evidence limitation**: King County
explicitly describes these tax-parcel boundaries as general parcel location, not exact
legal/survey boundaries. This geometry is appropriate for Permit Preflight's preliminary-screening
purpose, but it must carry source/provenance and accuracy caveats, the product must never describe
it as a surveyed/legal boundary, and findings requiring survey-grade certainty may become
REQUIRES_VERIFICATION per the existing deterministic rules. A narrow adapter-level verification
against a few known Unit 0B PINs happens during implementation (Code Generation), not as another
Unit-0-style gate.

**Cross-cutting instruction carried into this design**: the parcel-geometry source's accuracy
limitation must survive through PropertyFact/spatial evidence and into the immutable report
snapshot, not be dropped after PostGIS computation.

### Question 3 — How "Approximate Placement on the Parcel" (PC-2) Becomes Real Coordinates
Given Question 2's parcel polygon, PC-2 says the user can "indicate approximate placement... where
relevant." For a prototype with no live payment and (per the category split) minimal customer-
facing polish, how should structure placement actually be captured?

A) **A simple numeric-input fallback for this unit** — e.g. direct entry of estimated distances to
   rear/side/front lot lines and to the existing dwelling (matching `ShedProjectDetails`'s existing
   fields exactly) — rather than an interactive map-click UI. A real map-based placement UI
   (computing those same distances from a clicked point + PostGIS) is real, valuable UI work but is
   commercial-facing polish more than foundation, and can be added in Unit 2B or later without
   changing the underlying domain contract (`ShedProjectDetails` already has these fields).
   **Recommended** given the category A/B proportionality instruction.

B) Build the real interactive map-click placement UI now, with PostGIS computing the resulting
   setback distances server-side from the clicked point — more realistic prototype for Unit 0C
   interviews, but more UI investment while Commercial GO is still open.

X) Other (describe after [Answer]: below)

[Answer]: X

Build a MINIMAL map-based approximate-placement interaction, not a manual-numeric-entry primary
flow — manual distance entry would push a core spatial calculation onto the user and would fail to
exercise the real PostGIS path this unit exists partly to introduce. Keep the UI deliberately
simple rather than commercially polished. Conceptually: (1) display the confirmed parcel polygon on
a map; (2) collect shed dimensions separately; (3) let the user indicate an approximate shed
location on the parcel; (4) capture only the additional orientation information necessary to
construct an approximate proposed shed footprint; (5) send the proposed footprint/placement to the
server; (6) PostGIS computes the relevant spatial values (setback distances and other
geometry-derived `ShedProjectDetails` inputs); (7) preserve the proposed-placement geometry used by
the report in the immutable report/evidence snapshot. The interface must clearly state placement is
approximate, not a survey or construction plan. Not a CAD/drawing application — no snapping,
dimension handles, sophisticated polygon editing, architectural drawing tools, polished
drag/rotate interactions, or survey-grade placement. A simple map interaction sufficient to place an
approximate rectangular shed footprint on the parcel is enough. If direct numeric setback entry is
retained at all, it is an internal/testing fallback only, never the primary customer flow.

### Question 4 — Report Explanation's AI Client
Unit 1 built a real `AiCompletionClient` seam and a concrete Anthropic-backed implementation
(`rule-research-assistant/anthropic-client.ts`) for RRAG-1. Report Explanation (RGD-5) needs its
own AI Service call (deterministic findings → plain-language narrative), structurally separate
from Rule Research Assistant per Application Design (different component, different concern —
narrative synthesis vs. candidate-rule research).

A) **Reuse the same `AiCompletionClient` interface shape** (schema-in, schema-out; a
   `createAnthropicCompletionClient`-style concrete adapter) for Report Explanation too — same
   env-only-credential, same "never fabricate on failure, degrade instead" pattern (RGD-5's own
   degradation requirement is even more explicit than RRAG-1's), but a structurally distinct client
   instance/module so Report Explanation's prompts/schema can't accidentally end up feeding
   `regulatory-rule-governance` in any way. **Recommended** — proven pattern, no reason to diverge.

B) Design a separate AI Service abstraction from scratch for Report Explanation.

X) Other (describe after [Answer]: below)

[Answer]: A

Reuse the proven `AiCompletionClient`/provider-adapter pattern from Unit 1. Report Explanation gets
its own module/use-case boundary and its own schema/prompt contract — it may share the underlying
Anthropic provider implementation or common AI Service infrastructure, but Report Explanation and
Rule Research Assistant remain logically separate use cases. Report Explanation consumes finalized
deterministic findings only; may explain/summarize them; cannot change classification, create new
regulatory conclusions, or alter supporting evidence; cannot invoke regulatory-governance
transitions; validates model output at the runtime boundary; degrades safely when the model/
provider fails. No reason to invent a second provider abstraction from scratch.

### Question 5 — Report Access for a No-Payment Prototype
Report Access Authorization (Account's `authorizeReportAccess` boundary) is explicitly Unit 2B/
Unit 6 scope — Unit 2 has no real Account or guest-checkout component. Given that, how should a
generated prototype report actually be reachable?

A) **An unguessable, unauthenticated-by-ID URL** (e.g. a long random report ID in the path) — no
   login, no purchase record, matching this unit's "internal/founder-triggered, no live payment"
   scope exactly; real authorization (`authorizeReportAccess`) is added in Unit 2B/Unit 6 without
   changing how `getReport` itself works. Acceptable because this unit doesn't handle real
   customer PII at scale — reports exist only for founder-triggered prototype/interview use.
   **Recommended.**

B) Build a minimal auth gate now even though no real accounts exist yet.

X) Other (describe after [Answer]: below)

[Answer]: X

Use an unguessable bearer/capability token for prototype report access, kept conceptually separate
from the report's internal identifier: internal report identity = `reportId`; prototype access
credential = `reportAccessToken`. Prototype URL shape: `/report/<opaque-random-access-token>`.
Knowing or guessing `reportId` alone must not grant access. No account/login system is required in
Unit 2. The token must be generated with sufficient randomness that it cannot be practically
enumerated, and treated as a credential rather than a business identifier. Concrete token-storage
mechanics are an implementation choice; the Functional Design invariant is simply "report identity
is not report authorization." This is deliberately lightweight prototype access, not the final
`Account.authorizeReportAccess` implementation — when Unit 2B/Unit 6 introduces real guest/account
authorization, it replaces or wraps this prototype capability boundary rather than redesigning
`getReport` or the immutable report artifact itself. Reports must never be exposed through a route
where possession of a sequential, database, or otherwise ordinary report ID is sufficient for
access.

### Question 6 — PDF Generation Approach
RGD-3 requires a PDF reflecting the same report snapshot as the web version. No PDF library/
approach has been chosen yet (out of scope for Inception; this is the first unit that needs one).

A) Decide the specific library/approach during this unit's own NFR Requirements/Design stage (not
   Functional Design) — Functional Design should only establish that Evidence & Report Artifact
   produces the PDF *from the same immutable snapshot* the web view uses (never a separately-
   authored artifact, per components.md), leaving the rendering mechanism itself as an
   implementation-technology decision. **Recommended** — matches how Unit 1 handled "AI Provider
   Adapter" (component ownership fixed at Application Design, concrete tech chosen later).

X) Other (describe after [Answer]: below)

[Answer]: A

Functional Design establishes only the invariant: the web report and PDF are two renderings of the
same immutable EvidenceReportArtifact/report snapshot. They must never independently reconstruct or
re-evaluate the property — generating a PDF must not re-query current property data, rerun spatial
analysis, rerun regulatory rules, rerun Report Explanation, or use newer rule/source/model versions
than the corresponding web report. Both outputs render the already-generated immutable snapshot.
The concrete PDF rendering technology is chosen during the appropriate NFR/implementation stage.

### Question 7 — Frontend Scope Confirmation
Unit 1 explicitly had no frontend. This unit is the first to need one (PC-1/PC-2 project
configuration, RGD-2 web report view with a map). Given the category A/B proportionality
instruction and Commercial GO still open:

A) **Build a real, usable Next.js frontend for exactly PC-1/PC-2 (shed only) and RGD-2/RGD-3/RGD-6**
   — functional and accessible (per RGD-2's non-map-representation requirement) but not
   commercially polished (no marketing pages, no account UI, no purchase flow — those don't exist
   in this unit at all). This is the actual product surface Unit 0C needs to show real interview
   participants, so it should be genuinely usable, not a throwaway internal tool. **Recommended.**

B) Build only a minimal internal/developer-facing view (e.g. raw JSON or a bare unstyled page) and
   defer real UI polish until Commercial GO.

X) Other (describe after [Answer]: below)

[Answer]: A

Build a real, usable Next.js frontend for exactly the Unit 2 stories (PC-1, PC-2, RGD-2, RGD-3,
RGD-6), sufficiently usable and accessible to represent the actual Permit Preflight experience in
Unit 0C customer interviews, including the minimal map-based placement interaction from Question 3.
No commercial polish or unrelated customer-facing scope: no marketing pages, checkout/payment,
pricing UI, accounts, subscriptions, customer dashboards, broad multi-project-type navigation, or
production growth/analytics tooling. The goal is a genuine shed-report product prototype, not a
throwaway developer interface and not a commercially complete SaaS.
