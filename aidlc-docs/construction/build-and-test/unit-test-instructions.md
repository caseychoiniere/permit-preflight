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
- **Expected**: 240/240 tests pass, 0 failures, across 42 files (76/15 from Unit 1 + 49/7 from
  Unit 2 + 28/5 from Unit 2B's Code Generation and its post-review corrections + 59/11 new across
  Unit 3's Code Generation and its three correction rounds + 28 net-new/changed across Unit 4's
  Code Generation — 26 genuinely new tests in 6 new files, plus mechanical `projectType: "shed"`
  fixture updates to 4 pre-existing shed test files — see the Unit 4 breakdown below).
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

### Unit 2B (new)
- **BR-U2B-5, corrected 2026-08-24** (`REFUND_PENDING` is resumable, never a dedup-exit) —
  `tests/order-payment/refund-decision.test.ts`'s pure `decideRefundAction` coverage; proven
  end-to-end (real concurrent-claim race, real resumed-same-key submission) in
  `tests/order-payment/repository.integration.test.ts` (DB-dependent)
- **BR-U2B-4** (webhook signature verification against the exact raw body) —
  `tests/order-payment/webhook-signature.test.ts` (genuinely deterministic — a local/offline HMAC
  computation via Stripe's own `generateTestHeaderString`, no network call)
- **BR-U2B-9, corrected 2026-08-24** (`INTERNAL_PROTOTYPE` has no deployed HTTP route) —
  `tests/checkout-fulfillment/internal-prototype-route-surface.test.ts` (structural/filesystem
  check)
- **NFR Design Pattern 4** (guest status response never exposes an internal field) —
  `tests/checkout-fulfillment/guest-status-minimization.test.ts`
- **BR-U2B-12, corrected 2026-08-25** (server-determined price, fails closed on misconfiguration) —
  `tests/checkout-fulfillment/report-price.test.ts`
- **BR-U2B-1 point 4, corrected 2026-08-25** (duplicate payment retains real `paidAt`, never
  authorizes fulfillment) — proven live in `tests/order-payment/repository.integration.test.ts`
  (DB-dependent)

### Unit 3 (new)
- **NFR Design Pattern 2** (constant-time credential comparison, uniform failure response) —
  `tests/admin-auth/credential-check.test.ts`, `tests/admin-auth/basic-auth.test.ts`
- **NFR Design Pattern 3** (same-origin CSRF, including the exact `evil-example.com`/`example.com`
  non-match case from NFR Requirements) — `tests/admin-auth/csrf.test.ts`
- **BR-U3-0a** (`ADMIN_OPERATOR_ID` fail-closed independent of Basic Auth; non-empty-reason
  validation) — `tests/admin-auth/operator.test.ts`
- **Corrected observed/override/effective derivation** (the founder's own worked example) —
  `tests/data-source-registry/health-derivation.test.ts`; the automated-recording-continues-under-
  override and clear-takes-effect-immediately halves proven live in
  `tests/data-source-registry/repository.integration.test.ts` (DB-dependent)
- **ADM-7, corrected — concurrency-safe rule lifecycle** — pure `disable`/`reenable` legal-
  transition rejections in `tests/regulatory-rule-governance/lifecycle.test.ts` (matching
  `activate()`'s own style); the conditional-`UPDATE`/stale-transition-conflict-writes-no-audit-
  entry behavior proven live in `tests/admin-action-log/repository.integration.test.ts` and
  `tests/regulatory-rule-governance/repository.integration.test.ts` (DB-dependent)
- **`RegulatoryRule.approvalRecord`, closed gap** (never inferred from verification/updatedAt/
  lifecycle state) — `tests/regulatory-rule-governance/lifecycle.test.ts`; persistence round-trip
  and pre-existing-rows-show-absent-not-fabricated proven live in
  `tests/regulatory-rule-governance/repository.integration.test.ts` (DB-dependent)
- **ADM-5, corrected — exact-match search, PII never in a URL, response-minimization DTO** —
  `tests/order-payment/admin-view.test.ts` (DTO exclusion, deterministic),
  `tests/checkout-fulfillment/admin-search-route-surface.test.ts` (structural — POST-only,
  body-based, old query-string route gone); exact orderId/email/reportId lookups and the
  partial-email-fails/search-is-read-only proofs live in
  `tests/order-payment/admin-search.integration.test.ts` (DB-dependent)
- **ADM-4, corrected — Order correlation, no fabricated `INTERNAL_PROTOTYPE` order** —
  `tests/report-generation-job/admin-correlation.test.ts` (pure `resolveOrderIdFromAuthorization`,
  plus the structural no-retry-route check)
- **ADM-3, corrected — known-source expected cadence, no new infrastructure** —
  `tests/data-source-registry/known-sources.test.ts`
- **ADM-6, corrected — `REFUND_PENDING` resumability preserved, `decideRefundAction` as sole
  authority** — `tests/order-payment/admin-refund.test.ts` (all 10 founder-specified cases: PAID
  new-refund, `REFUND_PENDING` resumption using the existing persisted reason, the client can never
  substitute a reason, no fabricated/returned idempotency key, missing-reason/missing-key fail
  closed, all 4 `NOOP` states reject), `tests/checkout-fulfillment/admin-refund-ui-route-surface.
  test.ts` (structural — UI exposes the refund action for PAID/`REFUND_PENDING` only, no
  route-local re-implementation of the state check)
- **BR-U3-9** (`AdminActionLog` atomicity for the 4 local mutations; audit-commit-before-`start()`
  sequencing for `REFUND_INITIATED`) — proven live in
  `tests/admin-action-log/repository.integration.test.ts` (DB-dependent, fault-injected rollback)

### Unit 4 (new)
- **BR-U4-2** (`evaluateProject` exhaustive project-type dispatch; setback/height evaluators
  genuinely reused, not reimplemented) — `tests/regulatory-rules-engine/garage-evaluate.test.ts`
  (`REAR_SETBACK`/`HEIGHT_LIMIT` produce identical results for a garage-typed project as for shed)
- **`DWELLING_SEPARATION`/`LOT_COVERAGE` fail-closed cross-project-type dispatch** (never a thrown
  error, never a silently-wrong `KNOWN`) — `tests/regulatory-rules-engine/garage-evaluate.test.ts`
- **BR-U4-3** (existing-structures figure is USER_SUPPLIED, always `REQUIRES_VERIFICATION`
  regardless of value) — `tests/regulatory-rules-engine/garage-evaluate.test.ts`'s
  `evaluateLotCoverage` coverage (missing-numerator, fully-resolved-but-still-unverified, and the
  specific-unresolved-input-named-in-explanation cases)
- **BR-U4-7, final targeted correction — the corrected L1/L5/L6 percentage resolution**
  (`stackedDwellingUnits === false` rules out L6 only, never L5 — no real request reaches
  `ESTABLISHED(50, L1_DEFAULT)`) — `tests/regulatory-rules-engine/garage-evaluate.test.ts`'s
  dedicated resolution-branch tests (`true`/`false`/`undefined` cases)
- **BR-U4-4** (L1, the one Tier-1 garage candidate, held honestly `TRIAGED`; Tier does not imply
  usability) — `tests/regulatory-rule-governance/garage-candidate.test.ts` (mirrors
  `shed-candidate.test.ts`'s pattern, adapted for Tier 1's different — founder-verification-only,
  no escalated-professional — blocking story per BR-7)
- **`GarageProjectConfigurationSchema`** (undefined-vs-explicit-`0`/`false` preserved through the
  Boundary Validator) — `tests/screening-request/garage-validation.test.ts`
- **BR-U4-9** (Garage Screening Coverage Readiness — `false` today; checkout gate is a no-op for
  shed) — `tests/screening-request/garage-coverage-readiness.test.ts`
- **`computeParcelAreaSqFt`** (fail-closed SRID guard, same discipline as every other
  `postgis-adapter.ts` entry point) — 2 new tests in `tests/spatial-analysis/postgis-adapter.test.ts`

### Unit 5 (new, 72 tests across 8 files; re-verified after 2 correction rounds)
- **All 17 real vacant-land candidates (U1-U17) stay honestly non-`ACTIVE`**, never routed through
  `evaluateVacantLand` even if mistakenly passed in —
  `tests/regulatory-rule-governance/vacant-land-candidate.test.ts`
- **RegulatoryRuleApplicabilityScope** (no `applicableProjectType` on a `VACANT_LAND`-scoped rule;
  `toApplicabilityScope` resolves correctly) — same file
- **Bounded 4-scenario family** (`GENERAL_DENSITY`/`SMALL_LOT_BONUS`/`TRANSIT_BONUS`/
  `STACKED_MULTI_UNIT`; one scenario's ACTIVE rule never leaks into another's figure); **the
  three-state `ScenarioFigure` distinction** (`NO_ACTIVE_COVERAGE` never becomes
  `REQUIRES_VERIFICATION`, never produces a diligence-risk Finding); **U17's governed rounding
  threshold** (never applied without an ACTIVE `VACANT_LAND_FRACTION_ROUNDING` rule, even when
  density itself is ACTIVE); **the density-divisor fail-closed default** (`rawParcelAreaSqFt`
  never substituted for `densityCountableLotAreaSqFt`); **cross-workflow rule-scope isolation** —
  `tests/regulatory-rules-engine/vacant-land-evaluate.test.ts`
- **Vacant-Land Screening Coverage Readiness (BR-U5-9) and the persistence-write-activation gate**
  (two independently-hardcoded-`false` mechanisms, verified structurally separate); **`checkReadiness`'s
  workflow-first branching** — `tests/screening-request/vacant-land-coverage-readiness.test.ts`
- **`VacantLandDetailsSchema` validation; `createVacantLandScreeningRequest`'s
  `PERSISTENCE_WRITE_DISABLED` fail-closed default (never touches the DB while disabled)** —
  `tests/screening-request/vacant-land-validation.test.ts`
- **NFR-U5-4's real boundary hydration** (discriminates on `workflowType`, validates required
  branch fields, rejects cross-workflow field pollution, rejects an unrecognized `workflowType`,
  fails closed rather than casting) — `tests/screening-request/hydrate.test.ts`
- **`computeSetbackConstrainedArea`/`computeEcaExclusionGeometry`'s deterministic short-circuit
  paths** (`NO_ACTIVE_COVERAGE` with zero PostGIS call when no setback rule is ACTIVE;
  `REQUIRES_VERIFICATION` when lot-line roles are `INSUFFICIENT` or no ECA geometry is supplied) —
  `tests/spatial-analysis/vacant-land-postgis-adapter.test.ts`
- **The pure GeoJSON↔`Geometry`/WKT conversion functions** (`geoJsonToGeometry`/`geometryToWkt`,
  exported specifically for this): empty-geometry safety (never a zero-point `Polygon` that would
  crash `polygonToWkt`), interior-ring/hole preservation, `MultiPolygon`/single-`Polygon`
  collapsing — `tests/spatial-analysis/vacant-land-geometry-conversion.test.ts`
- **The staged migration is actually executable in the designed order** (the PRE-ACTIVATION
  ENFORCEMENT `CHECK`-constraint migration is confirmed absent from `db:migrate`'s own journal/file
  chain; the explicit `db:enforce-vacant-land` script exists as a separate mechanism) —
  `tests/db/vacant-land-migration-staging.test.ts`
