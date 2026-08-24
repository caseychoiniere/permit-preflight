# Unit 1 — NFR Design Patterns

Technology-agnostic patterns implementing the approved NFR Requirements. No provider/library
implementation yet (Code Generation's job, informed by tech-stack-decisions.md).

---

## Pattern 1: Bounded-Retry Resilience (implements NFR-3)

**One shared logical contract**, applied consistently to every external read Unit 1 performs
(Property Intelligence's source calls, Spatial Analysis's layer queries, Regulatory Source Access's
research calls):

```
external read
  -> attempt, subject to a small bounded retry policy where the operation is safe to retry
  -> SUCCESS: validated data returned
  -> EXHAUSTED: explicit source-failure result returned (never silence, never a default value)
```

- Individual sources may carry source-specific timeout/retry configuration (e.g., a slower
  government API might reasonably get a longer per-attempt timeout than a fast local check), but
  all sources use this same logical contract — no source implements independent, ad-hoc retry
  logic.
- The `EXHAUSTED` outcome feeds directly into the domain model already defined in Functional
  Design: `PropertyFact.availabilityState = UNAVAILABLE/SOURCE_ERROR`,
  `SpatialResult.availabilityState`, or `ParcelResolutionResult.status = RESOLUTION_UNAVAILABLE` —
  this pattern produces the *input* to those states, it doesn't duplicate their meaning.
- **No circuit breaker, queue, or distributed retry infrastructure** — unjustified at Unit 1's
  scale (internal tooling, not live customer traffic) per NFR Requirements' explicit anti-overengineering
  conclusion. Revisit only if implementation exposes a concrete need (e.g., a source that fails so
  often bounded retry alone causes real friction) — not preemptively.

## Pattern 2: Boundary Validation (implements NFR-5)

**One consistent cross-cutting pattern**, applied at every trust boundary identified in NFR-5:

```
external input (AddressInput, ParcelIdentifierInput, external API response, other untrusted payload)
  -> schema validation
  -> VALID: converted into the domain-facing shape, handed to domain logic
  -> INVALID: explicit validation-error result returned; domain logic is never reached with
     unvalidated data
```

- Domain logic (the workflows/entities defined in Functional Design) never receives raw external
  input directly — it only ever receives already-validated, domain-shaped data.
- Applied uniformly — no call site implements its own inconsistent validation logic. TypeScript's
  compile-time typing is not treated as sufficient (requirements.md §6).

## Pattern 3: Provenance-at-Creation (implements NFR-2)

**No new component** — auditability is achieved by requiring every workflow step to populate its
result's provenance/evidence fields *at the moment it creates that result*, using the fields
Functional Design already defined:

| Workflow step | Populates |
|---|---|
| Parcel Resolution | `ParcelResolutionResult.candidates`, corroboration/reverse-validation detail, `clarificationReason`, `unavailabilityDetail` |
| Property Intelligence | `PropertyFact` provenance + `availabilityState` |
| Spatial Analysis | `SpatialResult` inputs/basis; `CriticalAreaFinding` map-fact detail |
| Regulatory Rules Engine | `Finding.supportingEvidence`, `appliedRule`, `appliedInferencePolicy` (when `INFERRED`), `explanationBasis` |

This is a discipline applied at each creation point, not a separate recording step run
after-the-fact — there is no place in the design where a result is created first and its
provenance filled in later or by a different component. A later persistence/query/audit interface
(a later unit's concern) organizes these already-complete records for inspection; it does not
generate new provenance data Unit 1 failed to capture.

## Deliberately N/A (per NFR Requirements' scope, reaffirmed here)

- **Scalability patterns**: N/A — Unit 1 is domain/evaluation logic exercised via internal tooling,
  not a scaled live service. Real scaling concerns belong to Infrastructure Design or later units
  once real traffic exists.
- **Performance/caching patterns**: N/A beyond the coarse timeout already fixed (NFR-3) — no
  caching layer is justified at Unit 1's volume.
- **Additional resilience infrastructure** (queues, circuit breakers): N/A — see Pattern 1.

These are preserved as N/A per the user's explicit instruction unless a concrete Unit 1 requirement
later demonstrates otherwise — not reopened here speculatively.
