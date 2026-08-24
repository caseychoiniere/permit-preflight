# Unit 1: Deterministic Evaluation Foundation — Code Summary

Implements PR-1 through PR-5, SRE-0/SRE-SHED-1, and RRAG-1 through RRAG-8, per the approved
Functional Design, NFR Requirements/Design, and Infrastructure Design. No customer UI, no
payment, no deployed runtime — internal domain logic, tooling, and tests only.

## Running It

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test                # deterministic suite - no network/DB/credentials required
npm run test:integration  # live King County/Legistar/Neon/Anthropic calls - King County and
                           # Legistar need no credentials (public APIs); Neon/Anthropic tests
                           # skip cleanly when DATABASE_URL/ANTHROPIC_API_KEY are unset
```

**Result as of Build & Test** (see `aidlc-docs/construction/build-and-test/build-and-test-summary.md`
for the full report): `npm run typecheck` passes with zero errors. `npm test` passes **76/76
deterministic tests, 15/15 test files**. `npm run test:integration` — **8/13 passed** (live King
County GIS and Legistar calls, executed for real against production endpoints), **5/13 skipped**
(Neon DB round-trip and live Anthropic call — no `DATABASE_URL`/`ANTHROPIC_API_KEY` provisioned in
this sandbox; both skip cleanly rather than fail and activate automatically once credentials exist).

## What's Implemented (by Application Design component)

| Component | Files | Notes |
|---|---|---|
| Parcel Resolution | `src/parcel-resolution/` | BR-1a (address) / BR-1b (identifier) resolution paths, semantic address normalization, live King County adapter |
| Property Intelligence | `src/property-intelligence/` | `assemblePropertyContext` — CONFIRMED precondition enforced at the TypeScript type level, not just a runtime check |
| Data Source Registry | `src/data-source-registry/` | In-memory source-health tracking (`DataSourceRegistry`); no persistence in Unit 1 — see "Deliberately Deferred" below |
| Spatial Analysis | `src/spatial-analysis/` | Pure geometry reference implementation (setback/coverage math) + BR-5/BR-5a ECA source-precedence policy |
| Regulatory Rule Governance | `src/regulatory-rule-governance/` | Full lifecycle state machine (BR-6/BR-7/BR-8), structurally requires human identity for every state-advancing transition |
| Regulatory Source Access | `src/regulatory-source-access/` | Live Legistar ordinance-history integration (field mapping corrected during Build & Test — see summary); Municode content is accepted as an already-human-gathered bundle, never scraped |
| Rule Research Assistant | `src/rule-research-assistant/` | RRAG-1 candidate-package synthesis, schema-validated at the boundary (`CandidateRulePackageSchema`); real Anthropic-backed client added in `anthropic-client.ts` during Build & Test |
| Regulatory Rules Engine | `src/regulatory-rules-engine/` | BR-4/BR-4a evaluation — the sole owner of KNOWN/INFERRED/REQUIRES_VERIFICATION classification |
| Shared (NFR Design patterns) | `src/shared/` | Bounded-Retry Executor, Boundary Validator, structured logger |
| Database | `src/db/` | Drizzle schema for `regulatory_rules`/`inference_policies` (the only entities Unit 1 persists); `isTestOnlyFixture` column added during Build & Test (was missing — see summary); migrations regenerated accordingly, not yet applied to a live DB (no Neon credentials in this sandbox) |

## The Real Unit 0B Shed Candidate — Honest Status

`tests/fixtures/shed-candidate.ts` carries the actual researched candidate rule (SMC
23.44.070/090, Ordinance 127376) with its real caveats. It is **DRAFTED → TRIAGED (TIER_2)** —
`tests/regulatory-rule-governance/shed-candidate.test.ts` proves it cannot advance further without
a real land-use professional's recorded opinion, and that it is excluded from evaluation output
because it never reaches `ACTIVE`. **This is an external validation dependency, not a gap in the
code** — advancing it requires the founder to actually engage a Tier 2 reviewer (per
research-findings.md §5's cost estimates), which is a real-world action outside this Code
Generation session's scope.

All lifecycle-mechanics tests (multi-state transitions, caveat persistence, ACTIVE consumption)
use clearly-labeled `isTestOnlyFixture: true` synthetic rules instead (`tests/fixtures/test-only-active-rules.ts`).

## Hard Invariants — Where Each Is Tested

| Invariant (per the user's constraint #3) | Test |
|---|---|
| A single source/score never confirms a parcel | `tests/parcel-resolution/resolve.test.ts` |
| Unit 0B adversarial false-confidence case never becomes CONFIRMED | same file, `adversarialFalseConfidence` fixture |
| Source outage → RESOLUTION_UNAVAILABLE, never NO_MATCH | same file |
| CLARIFICATION_REQUIRED/NO_MATCH/RESOLUTION_UNAVAILABLE cannot enter PropertyContext | `tests/property-intelligence/assemble.test.ts` (type-level, via `ConfirmedParcelResolution`) |
| Missing/unhealthy evidence never silently favorable | `tests/regulatory-rules-engine/evaluate.test.ts` |
| Only the Rules Engine assigns classification | `tests/regulatory-rules-engine/eca-implication.test.ts` (CriticalAreaFinding has no classification field at all) |
| INFERRED requires an approved InferencePolicy | `tests/regulatory-rules-engine/evaluate.test.ts` |
| CriticalAreaFinding = map fact only | `tests/spatial-analysis/eca.test.ts` |
| Only ACTIVE rules consumed | `tests/regulatory-rules-engine/evaluate.test.ts`, `tests/regulatory-rule-governance/shed-candidate.test.ts` |
| Deterministic reproducibility | `tests/regulatory-rules-engine/evaluate.test.ts` |
| Provenance populated at creation | `tests/regulatory-rules-engine/evaluate.test.ts`, `tests/property-intelligence/assemble.test.ts` |
| Invalid external data rejected at the boundary | `tests/shared/validation.test.ts`, `tests/parcel-resolution/king-county-adapter-validation.test.ts` (mocked-fetch, added Build & Test) |
| PostGIS remains the sole authoritative spatial engine — pure TS geometry is test/reference-only | `tests/spatial-analysis/production-boundary.test.ts` (added Build & Test) |
| AI cannot activate/self-determine tier or lifecycle (RRAG-8); AI output is schema-validated, never coerced | `tests/rule-research-assistant/research.test.ts`, `anthropic-client.test.ts` (added Build & Test) |

## Deliberately Deferred / Not Built

- **Persisted Data Source Registry** — `src/data-source-registry/` exists and is in-memory; a
  durable, queryable registry (surviving process restarts) wasn't exercised by any Unit 1 story,
  so persistence is deferred rather than speculatively built. A later unit can back it with the
  database if Admin/Support needs durable cross-restart history.
- **Next.js / any deployed app** — no live runtime in Unit 1, per approved Infrastructure Design.
- **Production PostGIS spatial computation** — correctly out of Unit 1's invocation path per
  application-design.md's invariant #3 (Spatial Analysis is invoked exclusively by Report
  Generation Orchestrator Service, post-payment — Unit 2/2B scope). See build-and-test-summary.md
  Item 1 for the full verification.
- **Customer UI, payment, accounts, admin tooling** — explicitly out of scope per the user's
  instruction; assigned to later units.
