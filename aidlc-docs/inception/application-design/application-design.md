# Permit Preflight — Application Design (Consolidated)

**Status**: Revised 2026-08-19 per user architecture review — 7 targeted ownership/flow
corrections applied. Draft for final review. Consolidates `components.md`, `component-methods.md`,
`services.md`, `component-dependency.md`. Scope remains right-sized per execution-plan.md: resolves
the 9 core architectural invariants at the component-boundary level; defers implementation detail.

## What Changed in This Revision

1. **Pre-payment flow corrected**: Project Preflight Service and Vacant-Land Screening Service no
   longer invoke Spatial Analysis or Regulatory Rules Engine before payment — this contradicted the
   PO-0 scoping and is now fixed everywhere (components.md, services.md,
   component-dependency.md's pre-payment diagram).
2. **Screening Request** added as a new component — the single authoritative owner of durable user
   intent (workflow type, parcel, project config, save/resume, immutable snapshot at checkout).
3. **Report Generation Job** added as a new component — the single authoritative owner of
   generation execution state (QUEUED/IN_PROGRESS/COMPLETE/FAILED), separated from Order & Payment.
4. **Order & Payment** re-scoped to payment state only (PENDING/PAID/REFUNDED + failure/cancellation)
   — no longer conflated with generation state; a UI "fulfillment status" would be derived from
   both, never stored as a third mutable copy.
5. **Property Intelligence** re-scoped: produces facts with evidence-quality state (availability,
   staleness, confidence, source health) — no longer produces KNOWN/INFERRED/REQUIRES VERIFICATION
   classifications. That decision now belongs exclusively to Regulatory Rules Engine.
6. **Report-access authorization** made explicit: Account owns `authorizeReportAccess`, a single
   boundary every user-facing report-retrieval path (authenticated or guest-link) must pass
   through — a bare client-supplied report ID is never sufficient.
7. **Regulatory Source Access** added as a new component — the single authoritative owner of
   permitted-access regulatory source acquisition, closing the previously-undefined dependency
   between Rule Research Assistant and its source material.

## Component & Service Summary

**16 components**: Parcel Resolution, Screening Request, Property Intelligence, Data Source
Registry, Spatial Analysis, Regulatory Rules Engine, Regulatory Rule Governance, Regulatory Source
Access, AI Service / AI Provider Adapter, Report Explanation, Rule Research Assistant, Evidence &
Report Artifact, Report Generation Job, Order & Payment, Account, Support Case.

**6 services** (unchanged in count, revised in scope): Project Preflight Service, Vacant-Land
Screening Service, Checkout & Fulfillment Service, Report Generation Orchestrator Service, Rule
Governance Workflow Service, Admin/Support Service.

## Single Authoritative Owner — Verification Checklist

Per the user's explicit re-verification request:

| State/concern | Single authoritative owner | Notes |
|---|---|---|
| Screening-request state | **Screening Request** | Project Preflight Service and Vacant-Land Screening Service orchestrate it but do not own its data |
| Payment/order state | **Order & Payment** | Scoped to PENDING/PAID/REFUNDED/failure-cancellation only |
| Generation-job state | **Report Generation Job** | QUEUED/IN_PROGRESS/COMPLETE/FAILED; independent state machine from Order & Payment |
| Report artifact state | **Evidence & Report Artifact** | Immutable snapshot; referenced (not duplicated) by Report Generation Job on completion |
| Report-access authorization | **Account** (`authorizeReportAccess`) | Single boundary for both authenticated and guest-link access; `getReport` is never called directly by a user-facing path |
| Property fact/evidence quality | **Property Intelligence** | Produces facts + evidence-quality state; never a regulatory classification |
| Regulatory finding classification | **Regulatory Rules Engine** | Sole owner of KNOWN/INFERRED/REQUIRES VERIFICATION, consuming Property Intelligence + Spatial Analysis as inputs |
| Regulatory source acquisition/provenance | **Regulatory Source Access** | Supplies Rule Research Assistant; never interprets/approves meaning |

Every row has exactly one owner; no two components independently maintain a mutable copy of the
same state.

## The 9 Architectural Invariants — Where Each Is Resolved (Re-verified 2026-08-19)

### 1. Deterministic regulatory/spatial conclusions vs. LLM explanation
Unchanged in substance, strengthened in this revision: **Regulatory Rules Engine** is now
explicitly the *sole* owner of the classification decision (Property Intelligence was previously
ambiguous on this point and is now corrected). Report Explanation's input contract is unchanged —
it consumes already-finalized findings and cannot alter them. See `component-dependency.md`'s
post-payment deterministic/LLM diagram.

### 2. PropertyContext and evidence/provenance concepts
**Property Intelligence** owns fact-level evidence/provenance and evidence-quality state
(availability, staleness, confidence, source health) — re-scoped this revision to explicitly
exclude regulatory classification, which was a latent inconsistency in the prior version.

### 3. PostGIS as spatial source of truth
Unchanged: **Spatial Analysis** is the sole geometry-computation owner, now explicitly invoked
only by Report Generation Orchestrator Service, post-payment (corrected — the prior version
ambiguously suggested pre-payment services might invoke it too).

### 4. Rule versioning and Tier 1/Tier 2 governance
Unchanged in the governance model itself; strengthened by adding **Regulatory Source Access** as
an explicit upstream boundary, so the full chain is now: permitted sources → Regulatory Source
Access → evidence bundle → Rule Research Assistant → candidate package → Regulatory Rule
Governance (Tier 1/Tier 2, human approval) → ACTIVE → Regulatory Rules Engine (read-only
consumption).

### 5. Report immutability/reproducibility
Strengthened: **Screening Request**'s immutable snapshot (taken at checkout) plus **Evidence &
Report Artifact**'s immutable report snapshot together guarantee that both "what was requested"
and "what was concluded" are frozen at the correct moments — a later edit to a live, unpurchased
Screening Request cannot retroactively change a report someone already paid for, and no report's
content changes after generation.

### 6. Payment authorization boundaries
Substantially strengthened this revision: **Order & Payment** and **Report Generation Job** are
now explicit, independent state machines with a single crossing point (Checkout & Fulfillment
Service creates a job after a verified PAID transition, and never touches job state again). This
makes "payment authorization and report generation are separate state transitions" a hard
structural property, not just a documented convention — the prior version's contradiction (Project
Preflight/Vacant-Land Screening describing pre-payment evaluation calls) is what made this
invariant unreliable, and is now fixed.

### 7. Security/trust boundaries
Strengthened: **Account**'s new `authorizeReportAccess` closes a gap in the prior version, which
described report retrieval only informally. Every user-facing report access — authenticated or
guest-link — now has one explicit, mandatory authorization boundary rather than two parallel,
potentially-inconsistent paths.

### 8. Major service/component responsibilities
Fully re-enumerated above; every stories.md epic still maps to at least one component/service, with
3 new components covering gaps the user identified (Screening Request, Report Generation Job,
Regulatory Source Access) rather than any story requiring new capability.

### 9. Failure and source-health concepts
Unchanged for Data Source Registry; **Report Generation Job** now gives generation-level failure
semantics (retry attempts, explicit terminal FAILED state) a proper, independently-inspectable
home, rather than living inside Report Generation Orchestrator Service's internals where
Admin/Support Service couldn't cleanly read it (ADM-4 now reads Report Generation Job directly).

## Requirements/Story Traceability (Re-verified 2026-08-19)

All 3 new components trace to existing, already-approved requirements/stories — none introduce a
new capability:
- **Screening Request** → requirements.md §2.1, §2.3, §2.6; stories.md PC-1/PC-2/PC-3, VL-1.
- **Report Generation Job** → requirements.md §9.1, §40; stories.md RGD-1, PO-4, ADM-4.
- **Regulatory Source Access** → requirements.md §3.2; stories.md RRAG-1 (this component makes
  RRAG-1's already-approved "permitted-access sourcing" acceptance criteria — added in the
  User Stories revision round — architecturally concrete).

No story or requirement is contradicted by this revision; the corrections tighten enforcement of
already-approved invariants rather than changing product behavior.

## What Is Deliberately Deferred (Unchanged)
Exact database schemas, exact API endpoints, the concrete report-generation-job execution
mechanism, hosting/infrastructure provider selection, exact state-enum names, and the PDF
renderer implementation remain open for Construction-phase design after the Unit 0 gate.

## Standing Constraints Confirmed Preserved
- **Unit 0 / GO-PIVOT-NO-GO gate**: unaffected — Units Generation still expresses all production
  units' dependency on Unit 0's GO decision.
- **Solo-developer sizing**: 16 components + 6 services is larger than the prior 13+6, entirely
  because the user's own review surfaced 3 real ownership gaps — not scope creep. Units Generation
  will still right-size delivery sequencing for a single developer.
- **Deterministic/LLM boundary and Tier 1/Tier 2 governance**: preserved and, per invariant 1 and
  4 above, structurally strengthened by this revision.
- **Do not begin Construction or Units Generation** until the user explicitly approves this
  revised Application Design.
