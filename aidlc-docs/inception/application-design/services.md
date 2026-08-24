# Permit Preflight — Services

Orchestration-layer services that coordinate the components defined in `components.md`. Per
AI-DLC terminology, a Service coordinates business logic across Components; it does not itself
own primary domain data (except Admin/Support Service's explicitly-scoped Support Case exception).
All services are application-level modules within the modular monolith — no separate deployment
implied.

**Revised 2026-08-19** — corrected the pre-payment/post-payment contradiction: Project Preflight
Service and Vacant-Land Screening Service no longer describe invoking Spatial Analysis or
Regulatory Rules Engine before payment. Both now orchestrate Screening Request creation/validation
only. The full deterministic pipeline is owned exclusively by Report Generation Orchestrator
Service, post-payment.

---

## A. Project Preflight Service
*(stories.md Epics 1-2, project-type-specific stories in Epic 3; Application Design Q3)*

**Answers**: "Can I build this proposed project here?" — but only *after payment* does it actually
answer that question; before payment, it only establishes that the question is well-formed and
eligible to be asked.

**Coordinates (pre-payment only)**: Parcel Resolution → Screening Request (create/validate,
workflow type = existing-property) → PO-0 readiness check → hands off the validated Screening
Request to Checkout & Fulfillment Service.

**Responsibilities**:
- Orchestrate parcel resolution and Screening Request creation/validation for the existing-property workflow, including project-type selection and project-specific detail collection (stories.md PC-1/PC-2) — validated and stored *through* the Screening Request component, which this service does not itself own.
- Perform the PO-0 pre-payment readiness check: parcel resolved, project type currently supported, Screening Request inputs valid, no required data source already known-unhealthy (a Data Source Registry state read, not a live retrieval attempt).
- **Does NOT invoke Spatial Analysis or Regulatory Rules Engine before payment** *(correction 2026-08-19 — this is the authoritative pre-payment boundary; the prior version of this document incorrectly implied otherwise)*. The full paid evaluation happens exclusively in Report Generation Orchestrator Service, post-payment, against the purchased Screening Request snapshot.

---

## B. Vacant-Land Screening Service
*(stories.md VL-1 through VL-5; Application Design Q3)*

**Answers**: "What appears possible or problematic on this parcel, and is it worth deeper
investigation?" — same pre/post-payment split as Project Preflight Service.

**Coordinates (pre-payment only)**: Parcel Resolution → Screening Request (create/validate,
workflow type = vacant-land) → PO-0-equivalent readiness check → hands off to Checkout &
Fulfillment Service.

**Responsibilities**:
- Orchestrate the vacant-land intake (parcel confirmation, no project-configuration concepts) into a Screening Request of workflow type "vacant-land."
- Perform its own readiness check: parcel resolved, vacant-land screening currently supported, no required data source already known-unhealthy.
- **Does NOT invoke Spatial Analysis or Regulatory Rules Engine before payment** *(same correction as Project Preflight Service)*. VL-2 through VL-5's actual evaluation content is produced post-payment by Report Generation Orchestrator Service.
- Shares Parcel Resolution and Screening Request with Project Preflight Service — does not duplicate them.

---

## C. Checkout & Fulfillment Service
*(stories.md Epic 5; Application Design Q6; **revised 2026-08-19**)*

**Purpose**: The boundary between "a Screening Request is validated and ready" and "payment is
authorized and generation can begin" — deliberately thin and fast.

**Coordinates**: Screening Request (reads the validated request, takes its immutable snapshot) →
Order & Payment (creates Checkout Session, verifies webhook, owns payment state only) → Report
Generation Job (creates the job record referencing the Screening Request snapshot).

**Responsibilities**:
- Receive a readiness-checked Screening Request from Project Preflight Service or Vacant-Land Screening Service; take its immutable snapshot; create the Stripe Checkout Session via Order & Payment with a server-determined price.
- Receive and verify the Stripe webhook; idempotently transition Order & Payment's state to PAID (duplicate/replayed events produce no duplicate side effects).
- On successful PAID transition, create an idempotent Report Generation Job referencing the Screening Request snapshot, and return promptly to Stripe — **does not execute the generation pipeline itself, and does not touch Spatial Analysis, Regulatory Rules Engine, Property Intelligence, Report Explanation, or Evidence & Report Artifact at any point.**
- Coordinate refund processing (stories.md PO-5), delegating the Stripe refund call to Order & Payment while recording reason/outcome; refund affects payment state only and does not implicitly alter Report Generation Job or Evidence & Report Artifact state.

---

## D. Report Generation Orchestrator Service
*(stories.md RGD-1 through RGD-6, PO-4; Application Design Q6; **revised 2026-08-19**)*

**Purpose**: The asynchronous executor of the full paid-report pipeline, and the **only** place in
the system where Spatial Analysis and Regulatory Rules Engine are invoked.

**Coordinates**: claims a Report Generation Job → reads the referenced Screening Request snapshot
→ Property Intelligence → Spatial Analysis → Regulatory Rules Engine → Report Explanation (AI,
where available) → Evidence & Report Artifact (assembles immutable snapshot + PDF) → transitions
the Report Generation Job to COMPLETE (with artifact reference) or FAILED.

**Responsibilities**:
- Claim a QUEUED Report Generation Job (execution mechanism deliberately unspecified per Q6 — Infrastructure Design decides).
- Run the full deterministic pipeline against the purchased Screening Request snapshot (never against a live, editable request) — Property Intelligence produces facts with evidence-quality states; Spatial Analysis produces geometric results; Regulatory Rules Engine consumes both to produce classified findings.
- Invoke Report Explanation with finalized deterministic findings; proceed without explanation on AI unavailability/invalid output rather than failing the job.
- Assemble the immutable report artifact via Evidence & Report Artifact; transition the Report Generation Job to COMPLETE.
- On failure, apply the defined retry policy (recorded on the Report Generation Job); if still failing, transition to FAILED (an explicit terminal state, never silently COMPLETE) and surface it for customer communication (PO-4) and operator visibility (ADM-4, read through Report Generation Job, not this service's internals).
- Guarantee safe retry after a crash — re-claiming a job must not produce duplicate paid reports or partial/corrupt artifacts.

---

## E. Rule Governance Workflow Service
*(stories.md Epic 7; Application Design Q1, Q4; **revised 2026-08-19**)*

**Purpose**: Orchestrate the end-to-end regulatory rule lifecycle, enforcing that no automated
process can activate a rule.

**Coordinates**: Regulatory Source Access (acquires permitted-source evidence bundle) → Rule
Research Assistant (AI-assisted synthesis of a candidate package from that bundle) → Regulatory
Rule Governance (owns lifecycle state) → (for Tier 2) external domain-professional review step →
Regulatory Rules Engine (one-way publication of ACTIVE versions).

**Responsibilities**:
- Request a permitted-source evidence bundle from Regulatory Source Access for a target rule need, then request a candidate rule package from Rule Research Assistant using that bundle — **corrected 2026-08-19**: Rule Research Assistant no longer implicitly "researches Municode" itself; source acquisition is a distinct, explicit step this service coordinates.
- Present the candidate package to the Founder for TRIAGED confirmation (Tier 1 vs. Tier 2) — always a recorded human action.
- Route Tier 1 packages to Founder verification; route Tier 2 packages to an escalation step capturing the external domain professional's recorded opinion, still requiring Founder final sign-off.
- Drive the package through SOURCE VERIFIED → TESTED → APPROVED → ACTIVE, publishing to the Regulatory Rules Engine's consumption boundary only at ACTIVE.
- Handle supersession when Clerk/Legistar records (obtained via Regulatory Source Access) indicate an amendment.

---

## F. Admin/Support Service
*(stories.md Epic 8; Application Design Q5; **revised 2026-08-19**)*

**Purpose**: Orchestrate operational visibility and action across the system for the
Founder/Operator, reading each domain's state through its authoritative owner rather than
duplicating it.

**Coordinates**: Evidence & Report Artifact (inspect), Regulatory Rule Governance
(inspect/disable), Data Source Registry (inspect/override), Order & Payment (inspect/refund —
payment state only), **Report Generation Job** (inspect generation status — *corrected
2026-08-19*: reads through this component now, not through Report Generation Orchestrator
Service's internals, and not conflated with Order & Payment's state), Account (inspect), Support
Case (owns).

**Responsibilities**:
- Provide read access into report evidence/provenance (ADM-1), rule version history (ADM-2),
  data-source health (ADM-3), **generation-job status via Report Generation Job** (ADM-4),
  **payment/order status via Order & Payment** (ADM-5, kept distinct from generation status per
  the corrected separation) — without copying that data into its own store.
- Trigger defined actions: issue a refund (via Order & Payment), disable a problematic rule (via Regulatory Rule Governance), mark a source unhealthy (via Data Source Registry).
- Own and persist Support Case records — the one piece of genuinely new domain data this service is responsible for, kept deliberately minimal.
- For "investigate a customer complaint end-to-end" (ADM-9), compose reads across Evidence & Report Artifact, Order & Payment, and Report Generation Job — each still authoritative for its own state, this service only aggregates the view.

---

## Cross-Cutting: PO-0 Readiness Check *(scope corrected 2026-08-19)*

Not a separate service — a shared capability invoked identically by Project Preflight Service and
Vacant-Land Screening Service before handing off to Checkout & Fulfillment Service. It checks, and
**only** checks: parcel resolved (Parcel Resolution), Screening Request validity (workflow/project
type currently supported, required inputs present and valid), and existing, already-known source
health (a Data Source Registry state read). It explicitly does **not** invoke Spatial Analysis,
Regulatory Rules Engine, Property Intelligence, Report Explanation, or Evidence & Report Artifact
— all of those remain reserved exclusively for Report Generation Orchestrator Service, post-payment.
This is now stated consistently everywhere PO-0 or the pre-payment flow is described (this file,
`component-dependency.md`, `application-design.md`) — resolving the contradiction the user
identified between the old Project Preflight/Vacant-Land Screening descriptions and the PO-0
section.

## Cross-Cutting: Report Access Authorization *(added 2026-08-19)*

Every user-facing report-retrieval path — authenticated report history (ACC-3) and secure emailed
guest-report links (ACC-1) alike — passes through Account's `authorizeReportAccess` boundary
before reaching Evidence & Report Artifact's `getReport`. No service calls `getReport` directly on
a client-supplied report ID without this check.
