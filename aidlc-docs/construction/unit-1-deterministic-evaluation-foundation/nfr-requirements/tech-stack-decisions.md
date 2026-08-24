# Unit 1 — Tech Stack Decisions

Product-level stack already fixed (requirements.md §9): Next.js, TypeScript, PostgreSQL, PostGIS,
Drizzle ORM. This document covers only the genuinely open, Unit-1-scoped tooling choices. Per the
user's pragmatic construction standard, these are reversible, low-risk decisions — not treated as
approval-blocking architecture, and may be revisited as implementation provides evidence.

## Testing
**Decision**: A TypeScript-native test runner (e.g., Vitest), with two distinct, separately-tagged
suites:
1. Deterministic fixture-based domain tests (Unit 0B's real, captured data — no network access,
   run in CI, gate NFR-1/NFR-4).
2. External-source integration/health tests (live calls to King County/Seattle/FEMA, detect
   upstream drift — per Functional Design's fixture strategy note, not part of the deterministic
   CI gate).

**Rationale**: matches the existing TypeScript stack; the two-suite split is a direct
implementation of Functional Design's already-approved fixture strategy, not a new decision.

## Runtime Schema Validation
**Decision**: A runtime schema validation library (e.g., Zod), applied at every trust boundary
identified in NFR-5 — `AddressInput`, `ParcelIdentifierInput`, and external-source API responses.

**Rationale**: requirements.md §6 explicitly requires runtime validation beyond TypeScript's
compile-time typing; this is a direct implementation of that standing requirement.

## Geometry
**Decision**: No separate client-side/application-level geometry library for Unit 1 — PostGIS
performs the authoritative spatial computation (Application Design's Spatial Analysis component),
consumed via Drizzle's query layer. If a specific need for in-application geometry manipulation
arises during Code Generation (e.g., preparing a geometry for a PostGIS query), it will be
addressed then as a concrete implementation need, not speculatively decided now.

## Deferred to Infrastructure Design (Next Stage)
Hosting provider, managed Postgres/PostGIS provider selection, deployment mechanism, and any
provider-specific configuration remain out of scope for this document, per the user's explicit
instruction.
