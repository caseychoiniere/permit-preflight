# Unit 7 — Fences: Code Generation Plan

Governing design: `functional-design.md` (same directory). NFR Requirements / NFR Design / Infrastructure Design: **skipped** — no new
infrastructure, data source, auth/payment surface, or persistence shape (the fence snapshot is the existing `projectDetails` jsonb; the
existing evidence/findings jsonb columns carry the results). Mirrors Unit 4's skip rationale.

## Part A — Intake model
- [x] A1 `ProjectType.FENCE = "fence"`, `SUPPORTED_PROJECT_TYPES`, `FenceProjectConfiguration` + `FenceProjectConfigurationSchema` (cross-field refinements: wall fields, tallest ≥ height, locations unique/non-empty), `ProjectConfiguration` union (`src/screening-request/types.ts`)
- [x] A2 Schema dispatch by project type in `repository.ts` and `hydrate.ts` (a switch, not another ternary)
- [x] A3 `REQUIRED_SOURCE_IDS`, `isFenceScreeningCoverageReady() === false`, `checkFenceCheckoutEligibility`, checkout wiring, `available-project-types` stays shed-only (unchanged semantics), `POST /api/screening-requests` accepts `fence`
- [x] A4 Unit tests: schema accept/reject matrix, hydrate round-trip, readiness gate

## Part B — Pure evaluator (`src/regulatory-rules-engine/fence-types.ts`, `evaluate-fence.ts`)
- [x] B1 Types: `FenceLocation`, `FenceWallRelation`, `FenceProjectDetails`, `FencePermitRequirement`, `FenceEvaluationOutcome`
- [x] B2 Rule-type constants + explicit outcome-dependency table
- [x] B3 Per-location height findings (F1/F2/F4), wall finding (F3), slope/absolute-cap logic, feature handling
- [x] B3b Unresolved sight-distance Finding when FRONT_SETBACK / STREET_SIDE_SETBACK is declared
- [x] B4 Permit determination (F5/F6 + deferred flood-prone consideration), fixed disclosures, F7 disclaimer text
- [x] B5 Exhaustive boundary tests (limits are inclusive; every location × wall relation; slope cap; feature; masonry tri-state; dormant/partial activation; never `LIKELY_EXEMPT`)

## Part C — Governance rows
- [x] C1 Eight candidate definitions with citations, declared test cases mapped to automated tests (`src/regulatory-rule-governance/fence-candidates.ts` + fixtures test)
- [x] C2 Bootstrap through the existing `insertRuleIfAbsent`/`runNewTransition` path (idempotent one-off script, TRIAGED only)
- [x] C3 Lifecycle TRIAGED → SOURCE_VERIFIED → TESTED → APPROVED via the real admin-lifecycle functions (one-off script, never ACTIVE)

## Part D — Pipeline
- [x] D1 Retrievers: parcel geometry (existing) + ECA for fence (flood context only); health recording already generic
- [x] D2 `runFencePipeline` sibling branch: build `FenceProjectDetails`, query ACTIVE `fence` rules, evaluate, persist findings + `fence-declared-inputs` + `fence-permit-requirement` + `uncovered-constraint-types`, explanation from findings only
- [x] D3 Pipeline unit tests (pure builders) + live integration test (real parcel, synthetic ACTIVE fence rules cleaned up after, never the real rows)

## Part E — Report
- [x] E1 `ReportView.tsx`: "Fence height by location" context, "What you told us", "Building permit (fence)", fixed disclosures
- [x] E2 `render.ts` PDF: identical content
- [x] E3 Dev-preview scenarios + web/PDF parity tests

## Part F — Intake UI (`app/configure/page.tsx`)
- [x] F1 Fence DETAILS form (no PLACEMENT step), tri-state/explicit answers, plain-language location help
- [x] F2 Summary step for fences; `POST/PUT` wiring; fence absent from public type list while the readiness flag is false (reachable only for internal testing)

## Part G — Verification and closure
- [x] G1 Targeted tests during each part; full unit suite, typecheck, build, integration (with `DATABASE_URL`), preview verification
- [x] G2 Reviewer: one adversarial QA pass on the implementation; fix real defects
- [x] G3 Docs: `aidlc-state.md`, `audit.md`, this plan's boxes; secret scan; no AI attribution; commit and push
- [x] G4 Rules left APPROVED (not ACTIVE) and readiness flag left `false` — report as informational for the founder

## Outcome (2026-10-08)
All parts complete. Reviewer QA: design gate decision 50af47ff-3dbf-4881-8b1f-35240796617c and implementation gate decision
333344f2-057f-4bab-a9f8-410fa8c1660c (authority objections recorded; every engineering finding fixed - see functional-design.md §8b).
Added during QA: rule F8 (flood-prone condition), F7/F8 outcome gating, an always-emitted zoning-applicability finding, the unknown-slope
outside-setback fix, an explicit-operator-identity requirement for the governance script, and a dev-only `/dev/fence-intake` page.
Final state: 8 fence rules APPROVED (TIER_1, 0 ACTIVE), readiness flag `false`, verification: unit 907/907, integration 141 passed / 0 failed,
typecheck and build clean.

## Explicit non-goals
Sight-triangle geometry, fence placement on the map, SDOT/right-of-way, retaining-wall project type, multifamily/commercial zones,
rule activation, flipping the readiness flag, pricing/checkout changes.
