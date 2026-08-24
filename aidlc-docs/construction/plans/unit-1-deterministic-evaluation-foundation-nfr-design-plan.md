# Unit 1 — NFR Design Plan

**Grounding**: NFR Requirements (APPROVED) already made the qualitative calls — bounded retry, no
enterprise-scale targets, PostGIS as authoritative spatial engine, no separate geometry library,
schema validation at trust boundaries. NFR Design's job is to express these as logical
design patterns/components, not re-decide them. Per the pragmatic construction standard, several
categories below are marked N/A with brief justification rather than expanded into full question
sets, since NFR Requirements already resolved the underlying question.

## Category Assessment
- **Resilience Patterns**: applicable — see Question 1
- **Scalability Patterns**: **N/A** — Unit 1 is domain/evaluation logic, not a scaled service;
  NFR Requirements explicitly excluded enterprise-scale targets; real scaling concerns belong to
  Infrastructure Design/later units once real traffic exists
- **Performance Patterns**: **N/A beyond the coarse timeout already fixed (NFR-3)** — no caching
  layer or performance-optimization pattern is justified for Unit 1's volume (internal tooling,
  not a live customer path yet)
- **Security Patterns**: applicable — see Question 2
- **Logical Components**: applicable — see Question 1 (retry) and Question 3 (audit data)

## Design Checklist
- [ ] Answer clarifying questions below
- [ ] Generate `nfr-design-patterns.md` — resilience pattern, validation pattern, audit-data
      pattern, explicit N/A rationale for scalability/performance/caching/queues
- [ ] Generate `logical-components.md` — the small number of cross-cutting logical
      components/patterns Unit 1 actually needs
- [ ] Confirm no infrastructure component (queue, cache, circuit-breaker service) is introduced
      without NFR justification

---

## Clarifying Questions

### Question 1 — Resilience Pattern & Logical Component
NFR-3 fixed bounded retry → mark unavailable as the qualitative behavior. Should this be
implemented as **one shared, reusable logical pattern** (a technology-agnostic "bounded retry
executor" used by every external read — Property Intelligence's source calls, Spatial Analysis's
layer queries, Regulatory Source Access's research calls) rather than ad hoc per-call retry logic
duplicated in each component?

A) **Yes — one shared logical resilience pattern**, applied consistently wherever an external read
   happens; no circuit-breaker, queue, or other heavier infrastructure component is justified at
   Unit 1's volume — recommended, keeps behavior consistent and matches NFR-3's "coarse bound, no
   premature numeric guessing" framing

B) Different pattern preferred (describe after [Answer]: below)

[Answer]: A

Use one shared, reusable logical bounded-retry/resilience pattern for external reads. The pattern
establishes the common contract: external read -> bounded retry where safe -> success with
validated data OR explicit source-failure result after exhaustion. Individual sources may later
have source-specific timeout/retry configuration, but use the same logical resilience contract
rather than independent ad-hoc retry semantics. No circuit breakers, queues, distributed retry
infrastructure, or other heavier resilience machinery in Unit 1 unless implementation exposes a
concrete need.

### Question 2 — Security Pattern: Validation Layer
NFR-5 requires runtime schema validation at every trust boundary. Should this be a **consistent
cross-cutting validation pattern** (every external input — `AddressInput`, `ParcelIdentifierInput`,
every external API response — passes through schema validation before domain logic touches it,
using the chosen validation library from tech-stack-decisions.md) rather than validation applied
inconsistently per call site?

A) **Yes — one consistent validation pattern applied at every boundary identified in NFR-5** — recommended

B) Different pattern preferred (describe after [Answer]: below)

[Answer]: A

Use one consistent cross-cutting validation pattern at every identified trust boundary. Domain
logic must never consume unvalidated external input directly. Applies to AddressInput,
ParcelIdentifierInput, external API responses, and other external/untrusted payloads introduced by
Unit 1. The validation layer converts validated data into the domain-facing shape or returns an
explicit validation/error result. No duplicated inconsistent validation behavior across individual
call sites.

### Question 3 — Audit-Data Pattern
NFR-2 (auditability/data completeness) is largely satisfied by the domain entities' structure
already defined in Functional Design (`Finding.supportingEvidence`, `appliedRule`,
`appliedInferencePolicy`; `ParcelResolutionResult.candidates`/`unavailabilityDetail`). Does NFR
Design need to introduce a **new logical component** for this (e.g., a separate "Evidence
Recorder"), or does it just need to **confirm** that consistently populating these already-defined
fields at the point each workflow step produces them is sufficient, with no new component required?

A) **Confirm sufficient — no new component needed**, just consistent field population per the
   already-approved Functional Design entities — recommended, avoids inventing infrastructure NFR-2
   didn't ask for

B) A dedicated component is wanted (describe scope after [Answer]: below)

[Answer]: A

No new Evidence Recorder or audit-specific logical component is required for Unit 1. The
already-approved domain entities contain the required audit/provenance structure. Auditability is
achieved by requiring each workflow/component to populate its own provenance/evidence fields when
it creates the relevant domain result: Parcel Resolution populates candidates,
corroboration/reverse-validation, clarification reason, and source-failure detail; Property
Intelligence populates PropertyFact provenance and availability; Spatial Analysis records
inputs/source basis for SpatialResult and CriticalAreaFinding; Regulatory Rules Engine records
supporting evidence, applied rule version, applied InferencePolicy when applicable, and
explanation basis on Finding. No separate logical component merely to copy or re-record this
information. A later persistence/query/audit interface may organize these records for inspection,
but that is not a reason to introduce another Unit 1 domain component now.
