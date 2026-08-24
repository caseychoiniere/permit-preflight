# Unit (Deterministic) Test Execution

## Run Unit Tests

### 1. Execute All Deterministic Tests
```bash
npm test
```
This runs `vitest run` against `vitest.config.ts`'s default (deterministic) project: everything
under `tests/**/*.test.ts` **except** `*.integration.test.ts` files. No network access, database
connection, or credentials are required or used — this is the CI-gating suite (NFR-1/NFR-4,
reaffirmed for Unit 2 by NFR-U2-6).

### 2. Review Test Results
- **Expected**: 125/125 tests pass, 0 failures, across 22 files (76/15 from Unit 1 + 49/7 new in
  Unit 2's Code Generation and its two targeted corrections).
- **Test Coverage**: Not measured via a coverage tool (not a stated NFR); correctness is instead
  demonstrated via the explicit hard-invariant tests listed in each unit's code README.
- **Test Report Location**: Console output (vitest's default reporter); no separate report file
  is generated.

### 3. Fix Failing Tests
If tests fail:
1. Review the vitest console output — it names the failing test, file, and assertion.
2. Determine whether the failure indicates a genuine domain-logic defect or a test-design flaw.
3. Fix the code (if the defect is real) or the test (if the assertion itself was wrong) — never
   loosen an assertion just to make a real failure disappear.
4. Rerun `npm test` until all pass.

## What This Suite Proves (by design, not by accident)

### Unit 1 (unchanged)
Every test file maps to a specific business rule, NFR, or one of the 12 hard invariants — see
`aidlc-docs/construction/unit-1-deterministic-evaluation-foundation/code/README.md`'s "Hard
Invariants" table.

### Unit 2 (new)
- **BR-U2-9** (lot-line roles never inferred from shape) — `tests/spatial-analysis/lot-line-roles.test.ts`
- **BR-U2-10** (evidence-quality classification gate, no fabricated tolerance) —
  `tests/regulatory-rules-engine/evidence-quality-gate.test.ts`
- **CRS contract** (WGS84 browser, PostGIS-only reprojection, fail-closed SRID) —
  `tests/spatial-analysis/postgis-adapter.test.ts` (deterministic SRID guards),
  `tests/spatial-analysis/production-boundary.test.ts` (the removed flat-earth approximation is
  absent from every production path), `tests/screening-request/validation.test.ts` (lng/lat range
  validation, structural proof no client-computed-distance field exists)
- **BR-U2-7** (report identity ≠ authorization) — `tests/report-access/credential.test.ts`,
  `tests/report-access/rate-limiter.test.ts`
- **BR-U2-6** (web/PDF share one immutable snapshot, PDF is a disposable derivative) —
  `tests/report-pdf-rendering/render.test.ts`
- **NFR Design Pattern 3** (atomic job claim, no duplicate claimant) — proven live in
  `tests/db/unit2-schema.integration.test.ts` (DB-dependent, see integration-test-instructions.md)
