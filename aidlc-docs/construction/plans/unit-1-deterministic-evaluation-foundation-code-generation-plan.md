# Unit 1: Deterministic Evaluation Foundation (Sheds) — Code Generation Plan

**Process note**: per the user's explicit instruction ("implement, test, and continue to the normal
Code Generation review gate"), this plan is generated and executed in the same pass rather than
pausing for a separate plan-approval round — the single review gate is the post-generation
completion message (Step 14+ of code-generation.md), consistent with how prior stages in this
project have been handled when the user gave comprehensive up-front direction.

**Code organization**: per unit-of-work.md's approved correction (JC6), organized by Application
Design **component**, not by AI-DLC unit name: `src/{component}/`, `tests/{component}/`. No Next.js
app scaffold — Unit 1 has no deployed runtime (approved Infrastructure Design); `src/` is a plain
TypeScript package that a later unit's Next.js app will import as its business-logic dependency.

**Stories implemented**: PR-1 through PR-5, SRE-0 + SRE-SHED-1, RRAG-1 through RRAG-8 (per
unit-of-work-story-map.md Unit 1).

**Dependencies**: Technical GO (satisfied). Shared infrastructure: Neon PostgreSQL+PostGIS
(credentials not present in this session — see note below).

## Steps

1. [x] **Project Structure Setup** — `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`,
   `vitest.config.ts` (with a deterministic/integration test split), directory scaffold.
2. [x] **Shared Utilities** (`src/shared/`) — Bounded-Retry Executor (NFR Design Pattern 1), Boundary
   Validator (Pattern 2), common domain types shared across components.
3. [x] **Database Schema** (`src/db/`) — Drizzle schema for `regulatory_rules` and
   `inference_policies` (the only persisted entities Unit 1 owns), DB client module.
4. [x] **Parcel Resolution** (`src/parcel-resolution/`) — types, BR-1a/BR-1b/BR-2 decision logic (pure,
   deterministically testable), address/identifier resolution orchestration, live-source adapters
   (King County endpoints, per Unit 0B).
5. [x] **Data Source Registry** (`src/data-source-registry/`) — source health tracking (in-memory for
   Unit 1, per approved minimal scope).
6. [x] **Property Intelligence** (`src/property-intelligence/`) — PropertyFact/PropertyContext
   assembly, evidence-quality states, BR-3 integration.
7. [x] **Spatial Analysis** (`src/spatial-analysis/`) — setback/coverage/height calculation
   (PostGIS-query-shaped, testable against controlled analytical geometries per the NFR addendum),
   BR-5/BR-5a ECA precedence producing `CriticalAreaFinding`.
8. [x] **Regulatory Rule Governance** (`src/regulatory-rule-governance/`) — the `RegulatoryRule`
   lifecycle state machine (BR-6/BR-7/BR-8), enforcing human-only transitions structurally.
9. [x] **Regulatory Source Access + Rule Research Assistant** (`src/regulatory-source-access/`,
   `src/rule-research-assistant/`) — permitted-source evidence bundle types, AI Service adapter
   interface (Anthropic), candidate-package generation contract.
10. [x] **Regulatory Rules Engine** (`src/regulatory-rules-engine/`) — BR-4/BR-4a evaluation logic
    (`evaluateProject`), consuming only `ACTIVE` rules, InferencePolicy-governed `INFERRED`.
11. [x] **Fixture Data** (`tests/fixtures/`) — Unit 0B's 26 parcel-resolution cases + real shed-rule
    test cases, captured as deterministic fixtures (no network dependency); clearly-labeled
    TEST-ONLY rules/policies distinct from the real (non-ACTIVE) shed candidate.
12. [x] **Deterministic Test Suite** — proves the hard invariants (listed in the user's constraint #3)
    against fixtures; runs with no network/DB/credentials.
13. [x] **Integration/Health Test Suite** (separate, tagged) — real King County/Seattle/FEMA/Neon/Anthropic
    calls; **not executed in this session** (no live credentials provisioned here — see note).
14. [x] **Documentation** — `aidlc-docs/construction/unit-1-deterministic-evaluation-foundation/code/README.md`
    summarizing what was built and how to run it.
15. [x] **Deployment Artifacts** — none (no deployment in Unit 1, per approved Infrastructure Design).

## Note on Live Execution
This session has no provisioned Neon database credentials or Anthropic API key. Code for both
integrations is written for real (matching the validated endpoints/contracts from Unit 0/0B), but
the integration/health suite and any DB-backed persistence are not executed here. The deterministic
suite (Steps 11-12) requires neither and **will** be run and must pass before this stage is
presented for review.
