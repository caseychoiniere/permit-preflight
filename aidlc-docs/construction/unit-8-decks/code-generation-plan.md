# Unit 8 — Decks: Code Generation Plan

Governing design: `functional-design.md`. NFR Requirements / NFR Design / Infrastructure Design skipped (no new infrastructure, data source or
auth/payment surface; the deck snapshot is the existing `projectDetails` jsonb). Mirrors Unit 7's structure and applies its reviewer lessons up front.

## Part A — Intake model
- [x] A1 `ProjectType.DECK`, `DeckProjectConfiguration` + schema with cross-field refinements, union, `projectDetailsSchemaFor` dispatch (`src/screening-request/types.ts`)
- [x] A2 Hydration/completeness for decks (`hydrate.ts`, `repository.ts`)
- [x] A3 `isDeckScreeningCoverageReady() === false`, checkout eligibility + wiring, `available-project-types`
- [x] A4 Tests: schema accept/reject matrix, dispatch, hydration, readiness gate (`tests/screening-request/deck-intake.test.ts`)

## Part B — Pure evaluator
- [x] B1 `deck-types.ts`, `evaluate-deck.ts` (rule-spec-driven, explicit outcome dependencies, fail-closed guards)
- [x] B2 Setback finding per declared location; the rear-setback allowance (SMC 23.44.090.H.8) assessed against declared numbers; a tall deck in a setback is never a FAIL
- [x] B3 Lot-coverage threshold finding (SMC 23.44.080.C.3); always-stated zoning-applicability finding
- [x] B4 Permit determination (REQUIRED / REQUIRES_VERIFICATION, no LIKELY_EXEMPT), review path (STFI / full / unresolved), governed ECA note and disclaimer
- [x] B5 Boundary tests (`tests/regulatory-rules-engine/deck-evaluate.test.ts`)

## Part C — Governance rows
- [x] C1 Six Tier-1 candidates with declared cases executed against the evaluator (`tests/fixtures/deck-candidates.ts`, `tests/regulatory-rule-governance/deck-candidates.test.ts`)
- [x] C2 One-off lifecycle script to APPROVED only, explicit operator identity (`scripts/unit-8-deck-governance.ts`)

## Part D — Pipeline
- [x] D1 ECA retriever for decks (context only), `runDeckPipeline` sibling branch, pure `deck-evidence.ts`
- [x] D2 Live integration test (real parcel + ECA, synthetic ACTIVE rows removed afterward)

## Part E — Report
- [x] E1 `ReportView.tsx` "What you told us" + "Building permit (deck)"; E2 PDF template identical content
- [x] E3 Pipeline-free preview fixtures, web/PDF parity tests, dev-only `/dev/deck-intake` + production guard

## Part F — Intake UI
- [x] F1 `DeckDetailsForm.tsx` (no placement step; nothing defaulted), wired into `/configure` (type step gated by the readiness flag)

## Part G — Closure
- [x] G1 Reviewer QA (decision fb0ec2e9-c780-4a86-846f-326ed2d73620): authority objection recorded; four engineering findings fixed (see functional-design.md §5b)
- [x] G2 Lifecycle script run: 6 rules APPROVED (TIER_1), 0 ACTIVE
- [x] G3 Verification: unit 1003/1003, integration 143 passed / 0 failed, typecheck and build clean, deck form -> evaluator -> report browser-verified
- [x] G4 Docs/state/audit; commit and push
