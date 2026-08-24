# Unit 1 — Logical Components (NFR Design)

Two small, cross-cutting logical components emerge from NFR Design, layered on top of the
Application Design components (Parcel Resolution, Property Intelligence, Data Source Registry,
Spatial Analysis, Regulatory Source Access, Rule Research Assistant, Regulatory Rule Governance,
Regulatory Rules Engine — unchanged from Application Design/Functional Design). Neither is a new
Application-Design-level component or service — both are shared internal patterns the existing
components use.

## Bounded-Retry Executor (implements NFR Design Pattern 1)

**Used by**: Parcel Resolution, Property Intelligence, Spatial Analysis, Regulatory Source Access —
anywhere an external read occurs.

**Responsibility**: apply the shared bounded-retry contract (Pattern 1) uniformly, returning either
validated data or an explicit source-failure signal. Owns no domain state itself — it wraps a
caller-supplied read operation and returns a result the caller then maps into its own domain
entity's `availabilityState` (or `ParcelResolutionResult.status = RESOLUTION_UNAVAILABLE` for
Parcel Resolution specifically).

**Explicitly not**: a queue, a circuit breaker, or a standalone deployed service — a shared logical
pattern/utility used in-process by the components above.

## Boundary Validator (implements NFR Design Pattern 2)

**Used by**: any component accepting external input — Parcel Resolution (`AddressInput`,
`ParcelIdentifierInput`), Property Intelligence/Spatial Analysis/Regulatory Source Access (external
API responses).

**Responsibility**: validate raw external input/responses against the expected schema before
domain logic sees it; return either domain-shaped validated data or an explicit validation-error
result. Owns no domain state — a shared logical pattern/utility, not a component with its own
lifecycle or persistence.

## Everything Else: Unchanged from Application Design

Provenance/auditability (NFR Design Pattern 3) requires no new component — it's a discipline
applied within the existing components using the fields Functional Design already defined. No
other logical component (cache, queue, circuit breaker, scaling infrastructure) is introduced,
consistent with the N/A determinations in `nfr-design-patterns.md`.
