# Permit Preflight — Application Design Plan

**Prerequisites**: requirements.md (APPROVED), stories.md/personas.md (APPROVED), execution-plan.md
(APPROVED, including the Unit 0/GO-PIVOT-NO-GO gate and the Application Design scope guidance).

**Scope guidance in effect** (per execution-plan.md, user-directed): resolve the 9 core
architectural invariants (deterministic-vs-LLM boundary, PropertyContext/evidence/provenance,
PostGIS as spatial source of truth, rule versioning/Tier 1-2 governance, report
immutability/reproducibility, payment authorization boundaries, security/trust boundaries, major
service/component responsibilities, failure/source-health concepts) at the component-boundary
level. Defer implementation-level detail (exact schemas, exact method bodies, infrastructure
provider selection) to per-unit Construction-phase design, since Unit 0 may still reshape it.

---

## Design Checklist

- [ ] Read requirements.md and stories.md/personas.md in full for design context
- [ ] Answer the clarifying questions below (component boundaries, service orchestration, dependency patterns)
- [ ] Analyze answers for ambiguity/contradiction; raise follow-ups if needed
- [ ] Draft `components.md` — component name, purpose, responsibilities, interfaces (high-level)
- [ ] Draft `component-methods.md` — method names/purpose/input-output concepts per component (not full implementation signatures, per the scope guidance)
- [ ] Draft `services.md` — orchestration services, their responsibilities, and which components they coordinate
- [ ] Draft `component-dependency.md` — dependency matrix, communication patterns, data-flow narrative (incl. a diagram showing the deterministic/LLM boundary explicitly)
- [ ] Draft `application-design.md` consolidating the above into one document, explicitly mapping each of the 9 invariants to where it's resolved
- [ ] Cross-check every component/service traces to a requirements.md section and/or stories.md epic
- [ ] Verify the design doesn't silently violate the Unit 0 gate, the deterministic/LLM boundary, or the Tier 1/Tier 2 governance model
- [ ] Update aidlc-state.md; present for approval

---

## Clarifying Questions

### Question 1 — Regulatory Rules Engine vs. Rule Governance: One Component or Two?
Requirements.md §3.2/§4.1 describes two distinct concerns: (a) *runtime evaluation* of already-ACTIVE
rules against a property (deterministic, used by every report), and (b) the *authoring/governance
lifecycle* (AI-assisted drafting, Tier 1/Tier 2 triage, verification, approval, supersession — stories.md
Epic 7). Should these be:

A) **Two separate components** — "Regulatory Rules Engine" (runtime evaluation only, reads ACTIVE rules) and "Regulatory Rule Governance" (the authoring/approval lifecycle, writes new rule versions) — recommended: cleanly separates the invariant-1 deterministic-evaluation path from the invariant-4 human-governance path, and matches the stories.md Epic 3 vs. Epic 7 split

B) **One component** with two responsibility groups (evaluation methods + governance methods)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Model these as two separate components: (1) Regulatory Rules Engine, (2) Regulatory Rule
Governance. The Regulatory Rules Engine is exclusively concerned with deterministic runtime
evaluation of production-approved ACTIVE rule versions. The Regulatory Rule Governance component
owns the authoring and lifecycle workflow: RESEARCHED -> DRAFTED -> TRIAGED -> SOURCE VERIFIED ->
TESTED -> APPROVED -> ACTIVE -> SUPERSEDED. The runtime Rules Engine must not have authority to
author, approve, mutate, or activate regulatory rules. Rule Governance may create and publish
approved rule versions, but production evaluation should consume only approved ACTIVE versions
through a clearly defined boundary. Preserve the Tier 1/Tier 2 human-approval model and the
requirement that AI cannot approve, activate, or finalize its own triage decision.

### Question 2 — Parcel Resolution vs. Property Intelligence: One Component or Two?
Stories.md Epic 1 (Property Resolution — address/parcel-ID resolution, ambiguity handling) and the
Property Intelligence concept (requirements.md §3.3 — building the normalized PropertyContext with
evidence/provenance from multiple external sources) are related but distinct concerns.

A) **Two separate components** — "Parcel Resolution" (address/ID → confirmed parcel, ambiguity/clarification UX) feeds "Property Intelligence" (parcel → full PropertyContext with evidence) — recommended: Parcel Resolution's concern (identity/ambiguity) is genuinely different from Property Intelligence's concern (data aggregation/provenance), and both are independently reused by existing-property and vacant-land paths

B) **One combined component** handling resolution through full PropertyContext assembly

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Model Parcel Resolution and Property Intelligence as separate components. Parcel Resolution owns:
address/parcel-identifier resolution, candidate parcel matching, confidence, ambiguity detection,
parcel identity confirmation state. Property Intelligence owns: retrieval and aggregation of
authoritative property-related data, normalization into PropertyContext, evidence/provenance
attachment, source freshness/health awareness, construction of the property facts used by
downstream spatial/regulatory evaluation. Parcel Resolution should return structured resolution
results/candidates; the application/orchestration layer and UI may present clarification choices,
the domain component itself should not be treated as owning presentation/UI. Both components must
be reusable by the existing-property and vacant-land workflows.

### Question 3 — Existing-Property and Vacant-Land: One Orchestrating Service or Two?
Stories.md Question 7 (approved) established vacant-land as a distinct customer journey that reuses
shared components (Parcel Resolution, Payment, Accounts, Report Delivery) without forcing
project-configuration concepts onto it.

A) **One "Screening Request" orchestrating service** with two distinct request-handling paths (existing-property-with-project-type vs. vacant-land) that both call into the same underlying Spatial Analysis / Rules Engine / Property Intelligence components — recommended: avoids duplicating orchestration logic for genuinely shared infrastructure, while the *paths* themselves stay distinct per the approved stories.md design

B) **Two separate orchestrating services** (e.g., "Project Preflight Service" and "Vacant-Land Screening Service") that each independently call the shared lower-level components

X) Other (please describe after [Answer]: tag below)

[Answer]: B

Use two separate application-level orchestrating services: (1) Project Preflight Service, (2)
Vacant-Land Screening Service. This does NOT mean separate deployed services or microservices —
they remain application services/modules inside the modular monolith. The reason for separate
orchestration is that the two workflows answer fundamentally different user questions:
existing-property project preflight asks "Can I build this proposed project here?"; vacant-land
screening asks "What appears possible or problematic on this parcel, and is it worth deeper
investigation?" They should share lower-level components rather than duplicate them, including:
Parcel Resolution, Property Intelligence, Data Source Registry, Spatial Analysis, Regulatory
Rules Engine, Evidence/provenance, payment/order capabilities, report artifact generation,
account/access capabilities. The Project Preflight Service also coordinates Project
Configuration. The Vacant-Land Screening Service must not be forced through
project-configuration concepts when no proposed structure exists. If shared orchestration logic
emerges, factor it into shared lower-level capabilities rather than merging the two user journeys
into one branch-heavy application service.

### Question 4 — AI Integration: One Shared Abstraction or Separate Integration Points?
The product has two very different LLM use cases with different risk postures: (a) customer-facing
report explanation/synthesis (stories.md RGD-5, VL-5 — strictly explains deterministic findings,
must never change them), and (b) internal regulatory-rule research assistance (stories.md RRAG-1 —
produces a *candidate* requiring full human triage, a much higher-latitude use case). Requirements.md
§5.1 asks for "an internal AI service abstraction so providers/model tiers can be changed without
modifying core domain logic."

A) **One low-level "AI Service" component** (handles the Anthropic API client, structured-output validation, retries, caching, provider abstraction) used by **two separate higher-level use-case modules** — "Report Explanation" (customer-facing, strict no-determination guardrail) and "Rule Research Assistant" (internal, candidate-package output) — recommended: satisfies the shared-abstraction requirement at the provider-integration level while keeping the two use cases' very different guardrails cleanly separated at the module level, so a bug/change in one can't leak into the other's risk posture

B) A single AI component handling both use cases directly, differentiated only by which method is called

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Use one low-level AI provider abstraction with two separate higher-level use-case modules.
Low-level component: AI Service / AI Provider Adapter — Anthropic/provider integration, model
selection/configuration, structured-output handling, schema validation support, retry/error
behavior, provider abstraction, permitted caching where appropriate. Higher-level use-case
modules: (1) Report Explanation, (2) Rule Research Assistant. Do not expose a generic
unrestricted "generate text" capability directly to core domain logic. Report Explanation must
accept deterministic findings/evidence as input and may only explain or synthesize them — it
cannot create or alter authoritative regulatory/spatial conclusions. Rule Research Assistant has
higher latitude to research and draft candidate rule packages, but its output remains unapproved
candidate material subject to founder-confirmed triage and the Tier 1/Tier 2 governance
lifecycle. Keep the guardrails in these use-case-specific modules rather than relying only on
prompt wording inside a shared AI client.

### Question 5 — Admin/Support: Component or Service?
Stories.md Epic 8 (Admin/Support, 9 stories) mostly reads data owned by other components (reports,
rules, orders, sources) and triggers a few actions (refund, disable rule, mark source unhealthy) on
them, per AI-DLC's Component vs. Service distinction (Service = orchestration layer coordinating
components, Component = owns a focused capability/domain).

A) **Model Admin/Support as a Service** — it orchestrates read access and triggers actions across Order & Payment, Rule Governance, Property Intelligence/Data Source Registry, and Report components, without owning its own domain data — recommended, matches the AI-DLC terminology distinction and avoids duplicating data ownership

B) Model Admin/Support as its own Component with independent responsibilities/data

X) Other (please describe after [Answer]: tag below)

[Answer]: X

Model Admin/Support primarily as an orchestration service, as recommended, but do not assume it
owns no persisted domain data whatsoever. The Admin/Support service should coordinate
capabilities owned by: Reports/Evidence, Regulatory Rule Governance, Data Source Registry, Order
& Payment, Accounts, report-generation/job status. It should not duplicate those components' data
ownership. However, the approved Admin/Support stories require persisted support/investigation
information such as a customer complaint, investigation outcome, actions taken, and audit
history. Model that minimal persisted capability explicitly, either as a small Support Case /
Operational Case component or another clearly-owned persistence concern determined during
Application Design. The goal is: Admin/Support Service = orchestration; support/investigation
record ownership = explicit minimal domain ownership. Do not turn this into a large CRM,
ticketing system, or enterprise admin platform.

### Question 6 — Report Generation Orchestration: Synchronous or Asynchronous?
Brief §40 (carried into requirements.md §2.5) explicitly asks Inception to determine whether report
generation needs to be asynchronous (multiple external calls, spatial calculation, regulatory
evaluation, LLM synthesis, document generation) rather than assumed to fit one synchronous HTTP
request — and explicitly says not to introduce queues merely because they're common. This was not
fully resolved in Requirements Analysis and is a genuine open question at this design altitude.

A) **Asynchronous background job, no queue infrastructure** — the payment webhook handler enqueues a generation job (e.g., a database-backed job row, not a message-queue service) and a worker process picks it up; the web UI polls/receives status until COMPLETE — recommended: matches stories.md PO-4's retry/failure handling and RGD-1's multi-step orchestration without introducing unnecessary infrastructure (no Kafka/SQS/etc.), consistent with requirements.md §9 "avoid... message queues... unless a demonstrated MVP requirement justifies them"

B) **Synchronous within the webhook request** — the Stripe webhook handler performs the full pipeline and responds only once complete — simpler, but risks webhook timeout on a multi-step pipeline and couples Stripe's retry behavior to report-generation duration

C) **Synchronous within a user-facing request** (e.g., triggered when the user first visits the report page after payment, not from the webhook) — avoids webhook timeout risk but shifts failure-handling complexity to the frontend

X) Other (please describe after [Answer]: tag below)

[Answer]: X

Use asynchronous durable report-generation orchestration, based on the spirit of option A, but
keep the execution mechanism infrastructure-provider-neutral at this stage. The Stripe webhook
must NOT execute the complete report pipeline. Boundary: verified Stripe webhook -> idempotently
transition order to PAID -> create/authorize a durable report-generation job -> return promptly
to Stripe. Then, out of band: generation executor claims job -> Property Intelligence -> Spatial
Analysis -> Regulatory Rules Engine -> deterministic findings/evidence -> Report Explanation via
AI where available -> immutable report artifact -> PDF export -> COMPLETE/FAILED state. Use a
database-backed durable job/state record for MVP rather than introducing Kafka, SQS, RabbitMQ, or
another dedicated queue system without demonstrated need. Do not require Application Design to
assume a specific persistent worker implementation yet — Infrastructure Design chooses the
concrete mechanism (background worker, scheduled/serverless invocation, managed background
function, or other reliable execution mechanism) later. Architectural invariants that MUST be
resolved now: job creation is idempotent; duplicate Stripe events cannot create duplicate paid
reports; job state is durable; generation can be retried safely; a job can reach an explicit
terminal failure state; the customer can observe generation status; a failed job does not
silently become COMPLETE; payment authorization and report generation remain separate state
transitions; LLM failure may degrade explanation but does not destroy deterministic findings when
those findings can otherwise produce a useful report. Do not require realtime push infrastructure
for MVP merely for job status; polling or another simple status mechanism is acceptable unless
later design demonstrates a stronger need.

### Question 7 — Data Source Registry: Standalone Component or Part of Property Intelligence?
Requirements.md §38 (source freshness/health tracking) is referenced independently by Admin/Support
(ADM-3, ADM-8) and by Property Intelligence (which should consult source health when building
PropertyContext).

A) **Standalone "Data Source Registry" component** — tracks per-source health/freshness/failures independent of any specific property lookup; Property Intelligence and Admin/Support both depend on it — recommended: matches its use as a cross-cutting concept referenced by multiple components, not owned by any single property lookup

B) Fold source-health tracking into Property Intelligence as a sub-responsibility

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Use a standalone Data Source Registry component. It owns cross-cutting metadata such as: source
identity, source type, expected freshness/refresh cadence, last successful retrieval, health
state, failure state/history as appropriate, manual unhealthy overrides, provenance metadata
required to identify the source. Property Intelligence consults the registry when assembling
PropertyContext. Admin/Support uses the same registry for health inspection and manual health
overrides. Evaluation logic must be able to use source-health state when deciding whether a
finding can be KNOWN/INFERRED or must become REQUIRES VERIFICATION. Do not duplicate
source-health state independently inside Property Intelligence and Admin/Support.

### Question 8 — PDF Rendering: Part of Evidence & Report Artifact Component, or Separate?
Research-findings.md flagged PDF-generation compute cost (headless-Chromium-style rendering) as the
single biggest unmeasured cost uncertainty.

A) **Fold PDF rendering into the Evidence & Report Artifact component** as one of its methods/responsibilities (produces both the web report data and the PDF export from the same immutable snapshot) — recommended for MVP simplicity; the cost uncertainty is a Construction-phase measurement/implementation concern, not a reason to add a component boundary at this altitude

B) Treat PDF rendering as its own distinct component, anticipating it may need independent scaling/isolation given the cost uncertainty

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Keep PDF rendering within the Evidence & Report Artifact component boundary for MVP. The
component owns the immutable report snapshot and produces both the web report representation and
the PDF representation, both deriving from the same immutable underlying report artifact rather
than being independently authored reports. However, keep the actual rendering implementation
behind an internal renderer/adapter interface so the implementation can later be replaced,
isolated, or split into a separately scalable component if measured compute, memory, reliability,
or hosting constraints justify doing so. The current uncertainty around PDF rendering cost is not
sufficient by itself to introduce another top-level component boundary during Inception.
