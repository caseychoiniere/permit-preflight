# Unit 1 — NFR Requirements

All 6 clarifying questions answered with the recommended default. Per the user's pragmatic
construction standard (2026-08-19): these NFRs distinguish **hard release gates** (block Unit 1
completion) from **desirable targets** (tracked, not blocking); implementation-level tuning
(exact retry counts, backoff timing, etc.) is deliberately left open for NFR Design/Infrastructure
Design or even later empirical tuning, not fixed here as a false precision exercise.

---

## Hard Release Gates

### NFR-1: Deterministic Reproducibility
Given identical inputs (`PropertyContext`, the specific `ACTIVE` `RegulatoryRule` version(s), and
`InferencePolicy` version(s) where applicable), re-running an evaluation **must** produce an
identical `EvaluationOutcome`. Tested by running the same fixture twice and asserting identical
output. **Rationale**: this is the foundation of the product's trust model (Brief §36-§37) and
directly testable for deterministic logic — not aspirational.

### NFR-2: Auditability — Data Completeness
Every `Finding` and every `ParcelResolutionResult` retains enough structured data to reconstruct,
after the fact, exactly which sources/`PropertyFact`s/`SpatialResult`s/`RegulatoryRule`
version(s)/`InferencePolicy` (if applicable) produced it. Tested by asserting this data is present
and structured in test fixtures — **not** by building an audit UI (a later unit's concern). Applies
equally to `RESOLUTION_UNAVAILABLE` results (`unavailabilityDetail` must identify which source
failed).

### NFR-3: Source-Failure Resilience — Coarse Bound
A single shed evaluation must not hang indefinitely — a generous overall timeout exists, and
retries per external source call are bounded and small in count (exact numbers are NFR
Design/Infrastructure Design's job, informed by real source behavior once observed — not guessed at
here). The qualitative behavior fixed in Functional Design (BR-3: bounded retry → mark
unavailable → engine decides KNOWN/INFERRED/REQUIRES_VERIFICATION vs. defer entirely) is the hard
gate; specific timing constants are not.

### NFR-4: Spatial Correctness
A spatial calculation is correct if it matches independently-verified expected values for the real
Unit 0B/0C fixture set, computed via PostGIS's own standard geometric precision — **no invented
tolerance margin**. Fixture-based tests assert against real, ground-truthed values, not a
fabricated acceptable-error band. **Non-blocking addendum (approved 2026-08-19)**: supplement the
real fixtures with a small number of simple controlled geometries whose correct answers are
analytically known (e.g., a square parcel, a known distance), specifically to catch
CRS/unit/input-handling errors — this is a test-design detail, not a new tolerance policy, and does
not reopen this NFR.

### NFR-5: Security — Scoped to What Unit 1 Actually Builds
- Credentials for external sources (King County/Seattle/FEMA APIs) are never logged, committed, or
  exposed — server-only, consistent with requirements.md §6/§21.
- Least-privilege database access for this unit's read/write operations.
- Runtime schema validation (not just TypeScript compile-time typing) at every trust boundary —
  `AddressInput`, `ParcelIdentifierInput`, and all external-source API responses — per
  requirements.md §6, even though today's "boundary" is internal test tooling rather than a public
  endpoint. This discipline is established now so it doesn't need retrofitting when Unit 2 exposes
  a real boundary.
- No broader security surface exists yet in Unit 1 (no auth, no payment, no public API abuse
  vectors) — those are addressed when they're actually built, not preemptively.

### NFR-6: No Silent Evidence Corruption
Restates and makes testable the standing product invariant: missing/unhealthy/unavailable evidence
must never silently become a favorable (KNOWN-passing) finding, and a `RESOLUTION_UNAVAILABLE` or
`CLARIFICATION_REQUIRED` parcel must never reach production evaluation. Both are already structural
per Functional Design (BR-2/BR-4) — this NFR makes them explicit, directly-tested release gates,
not just documented intent.

---

## Desirable Targets (Tracked, Not Blocking)

- **Reasonable evaluation latency** for a single shed evaluation under normal (non-degraded) source
  conditions — no specific number fixed yet; will be informed by real measurement once Unit 1 is
  running against live sources.
- **Structured, queryable audit trail** beyond raw data completeness (NFR-2 requires the data
  exist; making it efficiently queryable in production is Infrastructure Design's concern).
- **Observability/monitoring** of source health, retry rates, and evaluation outcomes — valuable,
  but Unit 1's scope is the domain logic; wiring this into a real monitoring stack is a later
  concern (requirements.md §41, already noted as a standing requirement, not newly invented here).
- **InferencePolicy governance tooling** — per the user's explicit carry-forward constraint, reuse
  RRAG-1 through RRAG-8's mechanisms/internal tooling rather than building separate governance
  machinery; only revisit if a concrete requirement demonstrates the existing lifecycle can't
  safely support it. Not a hard gate — it's a reuse instruction, not a new build target.

---

## Explicitly Not Required for Unit 1 (Avoiding Unjustified Scope)

- No enterprise-scale availability/performance targets (e.g., specific uptime SLAs, multi-region
  failover) — unjustified for MVP, consistent with requirements.md §9/§54's explicit
  anti-overengineering guidance.
- No production monitoring/alerting infrastructure build-out — desirable target only (above).
- No hosting/infrastructure provider selection — Infrastructure Design's job, next stage.
- No commercial-readiness implication of any kind. **Unit 1 passing its NFR gates is technical
  evidence only — it does not represent, and must not be read as, evidence that Commercial GO
  (Unit 0C) has been reached.** The Technical GO / Commercial Validation split (execution-plan.md)
  remains fully in force.
