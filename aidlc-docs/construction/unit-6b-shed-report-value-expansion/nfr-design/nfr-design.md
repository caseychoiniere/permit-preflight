# Unit 6B — NFR Design (Shed Report Value Expansion)

**Status**: NFR Requirements is APPROVED (2026-09-13). This document is the explicit NFR Design
assessment the founder required — verified against the actual codebase, not assumed. **One
genuinely new pattern is required** (§1), comprising a concurrent settled fan-out **and** a
per-request timeout (no existing timeout mechanism exists anywhere in this codebase to reuse —
verified by direct grep, not assumed; corrected in this revision after independent review caught
the original, incorrect "reuse `seattle-building-outlines.ts`'s timeout" claim). Both pieces live
entirely inside the one new file (`seattle-eca.ts`). Every other NFR-U6B requirement is satisfied
entirely by reuse of already-approved components, cited by exact file (§2). No redundant
architecture is manufactured for requirements that reuse fully covers.

---

## 1. The one genuinely new pattern: ECA Adapter Internal Fan-Out (Concurrency + Per-Request Timeout)

**Why this can't be pure reuse**: `assemblePropertyContext` (`src/property-intelligence/
assemble.ts:35-70`) already has an established multi-source pattern, but it operates at
**one external source per fact**, fetched **sequentially** (a `for...of` loop), with a single
`executeWithBoundedRetry` call per retriever and a fail-closed `SOURCE_ERROR` on that retriever's
own failure. The new `environmental-constraints` fact is different in kind: it is **one**
`FactRetriever` whose single `retrieve()` must query up to 12 separate ArcGIS layers. Checked the
codebase's two existing `Promise.all` call sites for a reusable concurrent-fetch-with-partial-
failure precedent (`src/report-generation-orchestrator/pipeline.ts:272` and
`src/spatial-analysis/postgis-adapter.ts:188`) — **both assume uniform success**: a single
rejection rejects the whole `Promise.all`, which is correct for their use (an internal PostGIS
geometry transform genuinely should fail the operation if one part fails) but would be **actively
wrong** here — it would silently violate NFR-U6B-1/BR-U6B-1's explicit requirement that one
hazard-layer failure must never fail the whole fact. Reusing `Promise.all` as-is was the original
(inaccurate) assumption in the NFR Requirements pass; corrected here.

**Decision**: inside `seattle-eca.ts`'s `retrieve()`, fan out the (approved-subset of) layer
queries via `Promise.allSettled`. Map each settled result: `fulfilled` → that layer's real
`LayerQueryResult`; `rejected` → that layer recorded as unavailable
(`individualLayerResult: undefined`), feeding the already-existing `resolveCriticalAreaFinding`
`INDETERMINATE`/combined-only path (BR-5/BR-5a, unmodified) — **never** re-thrown. `retrieve()`
therefore only throws (triggering the *outer*, already-existing `assemblePropertyContext`
retry/`SOURCE_ERROR`-for-the-whole-fact path) on a genuine total-adapter failure (e.g. a code
defect before any query is even attempted) — never on an individual layer's failure. The outer
per-fact retry/`SOURCE_ERROR` mechanism itself is **unmodified, pure reuse**; only this one
internal fan-out decision is new.

**No new npm dependency** — `Promise.allSettled` is a native runtime API, not a package.

**Per-request timeout — corrected on review, no existing mechanism to reuse**: the original
version of this document claimed `seattle-eca.ts` would reuse a "bounded per-request timeout"
from `seattle-building-outlines.ts`. Independent review checked this directly and found it false:
`seattle-building-outlines.ts:70` calls `await fetch(url)` with no `AbortSignal` and no timeout of
any kind, and a repo-wide `grep -rln "AbortController|AbortSignal" src/` returns zero real hits
(the one incidental match, `admin-auth/credential-check.ts`, is prose in a comment about a timing
*signal*, unrelated to `AbortSignal`). `executeWithBoundedRetry` (`src/shared/retry.ts`) bounds
**attempt count**, not **wall-clock time per attempt** — a hung `fetch` would hang for as long as
the underlying network stack allows, for every retry attempt. **There is no existing per-request
timeout mechanism anywhere in this codebase to reuse.** This is therefore a second small, new,
narrowly-scoped piece of the same adapter-internal pattern (not a second unrelated pattern):

```ts
async function fetchLayerWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

Scoped entirely to `seattle-eca.ts` — `seattle-building-outlines.ts` and every other existing
retriever are **not** retrofitted with this (out of scope for Unit 6B; they have their own
single-request shape and their own existing behavior, unchanged). The exact `timeoutMs` value
(a reasonable starting point: 5000ms per layer, well inside NFR-U2-2's "seconds-to-tens-of-
seconds" whole-pipeline soft target) is a Code-Generation-tunable constant, not fixed dogma here,
mirroring how `DEFAULT_RETRY_POLICY`'s own constants (`src/shared/retry.ts`) are already treated
as adjustable rather than sacred.

**Synchronous-error isolation — corrected on review to be caller-owned, not callee-owned**: the
original version of this document required every per-layer query function itself to be declared
`async`, relying on each implementation remembering to do so. Independent review correctly
identified this as fragile — it protects only a compliant `queryLayer`, not an injected or future
one that forgets. Corrected: the **fan-out construction site itself** owns the promise boundary,
regardless of how `queryLayer` is implemented:

```ts
const settled = await Promise.allSettled(
  layers.map((layer) => (async () => queryLayer(layer, fetchLayerWithTimeout))())
);
```

Wrapping each invocation in the caller's own `async () => ...` (immediately invoked) means any
synchronous throw from `queryLayer(...)` — a bug in request construction, a synchronous
CRS-validation check, a malformed-URL error, or any other exception thrown before or without ever
returning a promise — is caught by that wrapper and converted into a rejection, identically to a
genuine network rejection. This works even if `queryLayer` is a plain, non-`async` function that
throws directly. `Promise.allSettled` never receives anything but promises, so it can never itself
be the thing that throws.

**Test design for the fan-out (per-layer isolation)**: this is the one place Unit 6B introduces
new runtime *behavior* (as opposed to reused behavior), so it gets an explicit, proportionate test
list rather than a general "mirrors the existing test split" reference. All of the following are
deterministic (no live network) and belong beside the fake-response-based tests
`tests/property-intelligence/seattle-building-outlines.test.ts` already uses:

- All 12 (or approved-subset) layers succeed → all real `LayerQueryResult`s populated, no
  `SOURCE_ERROR`.
- **A direct, deterministic test of `fetchLayerWithTimeout` itself** (not a bypass): using
  vitest's built-in fake-timer API (`vi.useFakeTimers()` / `vi.advanceTimersByTime()` — no new
  dependency; vitest is already a devDependency, though this is the first use of fake timers in
  this codebase, noted here rather than silently introduced) and a stubbed `fetch` that never
  settles on its own but does observe the `AbortSignal` it was called with — advance fake time
  past `timeoutMs`, then assert: (a) the signal's `aborted` flag becomes `true`, (b) the stubbed
  fetch's promise rejects (simulating the real `AbortError` a genuine `fetch` throws when
  aborted), (c) `clearTimeout` fires exactly once on both the success path (resolve before
  the deadline) and the abort path (never a leaked timer either way). This proves the mechanism
  itself, not merely that *some* rejection propagates.
- **The wider fan-out's handling of that timeout** (a separate, higher-level test from the one
  above): with `fetchLayerWithTimeout` mocked to reject (simulating the outcome the direct test
  above already proved that mechanism produces) for exactly one layer while the rest resolve →
  that one layer resolves to `individualLayerResult: undefined`/unavailable; every other layer's
  real result is still present; the fact-level `availabilityState` is still `AVAILABLE`
  (BR-U6B-1's core guarantee).
- One layer returns a non-2xx response → same as above (rejected → unavailable for that layer
  only).
- One layer returns a response whose declared `spatialReference.wkid` is not 2926 → same as above
  (fails closed for that layer only, mirrors `seattle-building-outlines.ts`'s existing CRS-guard
  test).
- Every layer rejects/fails → the fact is still `AVAILABLE` with every entry unavailable (never
  silently promoted to `SOURCE_ERROR` for the whole fact merely because every layer individually
  failed — only a genuine adapter-level throw before any query is attempted produces
  `SOURCE_ERROR`, per NFR-U6B-1).
- A **plain, non-`async` mocked layer operation that throws synchronously** (a direct test of the
  caller-owned wrapping above, not of any convention the per-layer function itself must follow) is
  still isolated: `retrieve()` resolves normally, that one layer is unavailable, every other
  layer's real result is unaffected.

`existing-structure-coverage`'s new PostGIS helpers and the CASE A/B/C lot-coverage boundary
logic are unaffected by this fan-out — see §2's NFR-U6B-8/10 rows below for their own (separate)
test disposition.

## 2. Everything else: reuse only, cited by exact component

| NFR-U6B requirement | Reused component | Verified at |
|---|---|---|
| NFR-U6B-1 (per-fact fail-closed) | `assemblePropertyContext`'s existing `SOURCE_ERROR` recording on retriever failure | `src/property-intelligence/assemble.ts:60-68` |
| NFR-U6B-1 (retry/timeout) | `executeWithBoundedRetry` + `DEFAULT_RETRY_POLICY` | `src/property-intelligence/assemble.ts:41` (call site), `src/shared/retry.ts:51` (`executeWithBoundedRetry` definition) |
| NFR-U6B-2 (per-request timeout) | **Not reuse — a new, minimal mechanism** (§1's `fetchLayerWithTimeout`, `AbortController`-based); no existing timeout mechanism was found anywhere in this codebase to reuse | Absence confirmed at `src/property-intelligence/seattle-building-outlines.ts:70` (plain `fetch(url)`, no signal) and `src/shared/retry.ts` (bounds attempt count, not per-attempt wall-clock time); new mechanism specified in §1 |
| NFR-U6B-3 (soft latency target) | **Pure reuse, corrected on review** — no new stage or logging vocabulary needed at all: the ECA fetch runs as one `FactRetriever` inside `assemblePropertyContext`, which the **existing** `PROPERTY_INTELLIGENCE` stage-timing boundary already wraps end-to-end. Real measurement happens at Build & Test, compared against NFR-U2-2's existing soft target ("the complete asynchronous report-generation pipeline...should normally complete in seconds-to-tens-of-seconds...exceeding ~60 seconds...is a signal to investigate") — never estimated as fact here. | Baseline: `aidlc-docs/construction/unit-2-report-generation-presentation-prototype/nfr-requirements/nfr-requirements.md:21-40` (NFR-U2-2, verbatim). Existing measurement boundary: `src/report-generation-orchestrator/stage-timing.ts:8-15` (`PipelineStage` incl. `PROPERTY_INTELLIGENCE`, `withStageTiming()`); `src/report-generation-orchestrator/pipeline.ts:104` (the existing `PROPERTY_INTELLIGENCE`-stage call wrapping `assemblePropertyContext`, which the new ECA retriever becomes one more `FactRetriever` inside of) |
| NFR-U6B-4 (no new vendor/secret) | Same ArcGIS Online org, same **no-API-key** public REST convention already in production | `src/property-intelligence/seattle-building-outlines.ts:27` (`services.arcgis.com/ZOyb2t4B0UYuYNYH`, no credential) |
| NFR-U6B-5 (new intake fields) | The existing Boundary Validator convention — real runtime zod validation at the trust boundary, never TypeScript-typing-only | `src/shared/validation.ts:23` (`validateAtBoundary`, the generic helper); `src/screening-request/types.ts:251` (`ShedProjectConfigurationSchema` definition, where Unit 6B's new optional fields are added); `src/screening-request/repository.ts:92` (the actual call site applying that schema via `validateAtBoundary`) |
| — (persistence) | `project_details` is already `jsonb`, `NOT NULL` where required — the new optional fields slot in with **zero migration** | `src/db/schema.ts:129` |
| — (report persistence) | `evidenceReportArtifacts.findings`/`.evidence` are already `jsonb` — the new finding/result types persist with **zero migration** | `src/db/schema.ts:185-186` |
| NFR-U6B-6 (no new sensitivity/retention question) | Corrected on review: the actual report-*payload* read path is `getReportById` (`src/evidence-report-artifact/index.ts`), an opaque `db.select().from(evidenceReportArtifacts)` full-row read that never inspects `findings`/`evidence` by shape — Unit 6B's new finding/result types pass through it unchanged. `report-access/repository.ts`/`account-auth/report-access.ts` (cited previously) are the separate *authorization* layer (credential/id resolution) that decides whether `getReportById` may be called at all — real and relevant, but not themselves the payload read; no retention/expiry/sensitivity logic exists on either layer today | `src/evidence-report-artifact/index.ts:63-65` (`getReportById` — the actual payload read); `src/report-access/repository.ts:58` (read-by-id authorization), `:152-154` (access-credential join); `src/account-auth/report-access.ts:33,54` (account-linked authorization) |
| NFR-U6B-7 (report immutability) | `evidenceReportArtifacts` is written by exactly one insert call site in the entire codebase, never updated (`grep -rn "\.update(evidenceReportArtifacts" src app` → zero matches) — Unit 6B's new finding/result types flow through this same single insert, unmodified | `src/evidence-report-artifact/index.ts:41-53` (`createEvidenceReportArtifact()`, the one `.insert(evidenceReportArtifacts)` call), called from `src/report-generation-orchestrator/pipeline.ts:407,550`; table-level immutability documented at `src/db/schema.ts:176-178` |
| NFR-U6B-8 (deterministic CASE A/B/C + P7b boundary tests) | Pure-function unit testing of the bounded lot-coverage/permit-span thresholds — no live dependency, no adapter involved; a distinct testing concern from the ECA adapter's own tests below | New deterministic test file(s) following the existing `regulatory-rules-engine` pure-function-boundary test convention, exemplified by `tests/regulatory-rules-engine/garage-evaluate.test.ts:63` (`describe("Unit 4 - LOT_COVERAGE (net-new evaluator)")`) and its boundary-naming style at `:91` ("REQUIRES_VERIFICATION even when a full allowedCoverageSqFt is resolved — numerator is always USER_SUPPLIED"), added at Code Generation |
| NFR-U6B-9 (live ECA adapter verification, non-blocking) | The existing deterministic-tests-always-run / live-integration-tests-gated-on-network split already established for `seattle-building-outlines.ts`. **Non-blocking is proven, not assumed**: `.github/workflows/ci.yml` (the blocking PR gate: typecheck, `npm test`, build, `test:e2e`) never runs `test:integration` at all — that script lives in a wholly separate workflow, `.github/workflows/integration.yml`, whose own header comment states it is "Deliberately NOT triggered on every push/PR ... an external government/API/database outage is not application correctness and must never block an otherwise-correct deploy," triggered only by `workflow_dispatch`/a weekly schedule. `vitest.integration.config.ts` itself documents `test:integration` as "NOT part of the default `npm test` gate." | `tests/property-intelligence/seattle-building-outlines.test.ts` (deterministic, mocked-fetch) and `tests/property-intelligence/seattle-building-outlines.integration.test.ts` (real network); gating proof: `.github/workflows/ci.yml:30,33,36,39,45` (the blocking gate's full step list — `npm ci`/`typecheck`/`test`/`build`/`test:e2e` — `test:integration` provably absent from this list); `.github/workflows/integration.yml:1-10` (separate workflow; header comment lines 3-6 state it is deliberately not triggered on push/PR; `on:` block lines 8-10 shows only `workflow_dispatch`/`schedule` triggers); `vitest.integration.config.ts:5` (doc comment: "NOT part of the default `npm test` gate"); item 19 of `aidlc-docs/operations/external-verification-tracker.md:550-563` already tracks this specific live-endpoint gap |
| NFR-U6B-10 (naming boundary conditions as explicit test cases) | A testing-methodology requirement, not a component — satisfied by §1's explicit fan-out test list above and by NFR-U6B-8's boundary-focused deterministic tests naming the exact values (`structuralSpanFt === 14.0`, `estimate === baseAllowanceSqFt`, `estimate === potentialSpecialAllowanceSqFt`) rather than only incidental coverage | See §1's test list above and NFR-U6B-8's row |

**Explicitly not built**: no new retry policy, no new logging vocabulary, no new evidence-quality
enum value, no new `PropertyContext` top-level field (facts live in the existing `facts[]` array,
per domain-entities.md §3d), no new authentication/authorization surface, no new failure-state
beyond the project's existing `AVAILABLE`/`SOURCE_ERROR`/`REQUIRES_VERIFICATION` vocabulary.

## 3. Logical components touched

One new file (`src/property-intelligence/seattle-eca.ts`, a `FactRetriever` implementation,
structurally identical in shape to `seattle-building-outlines.ts`), one new small PostGIS helper
(`computeExistingStructureCoverageSqFt`, sibling to `computeEcaExclusionGeometry`) plus one new
spatial-analysis function (`computeFootprintEcaIntersection`, sibling to
`computeDistanceToDwelling`) — both new *functions* on the **existing** PostGIS adapter module,
not a new module or new database object. No new logical component boundary is introduced.
