# Integration & Live-Source Test Instructions

## Purpose
Prove real external integrations work against the actual live services, not just captured
fixtures. Kept structurally separate from the deterministic suite (`vitest.integration.config.ts`,
`tests/**/*.integration.test.ts`) so upstream drift or missing credentials can never break the
CI-gating deterministic suite.

## Test Scenarios

### King County GIS (public, no credentials)
- `tests/parcel-resolution/king-county.integration.test.ts` — address/PIN resolution (Unit 1).
- `tests/property-intelligence/king-county-parcel-geometry.integration.test.ts` — parcel-polygon
  fetch (Unit 2). **Result**: ✅ passes live, now requesting and verifying an explicit `outSR=2926`
  — Code Generation's CRS correction found the endpoint's undeclared default is actually EPSG:3857,
  not 2926, making this explicit request+verification a real, load-bearing correctness check, not
  a formality.

### Seattle Legistar (public, no credentials)
- `tests/regulatory-source-access/legistar.integration.test.ts`. **Result**: ✅ passes live.

### Real PDF Rendering (Chromium binary required, no credentials, Linux-only since Unit 2B)
- `tests/report-pdf-rendering/render.integration.test.ts` — real headless-Chromium rendering.
  **Unit 2B changed the binary source** from Playwright's bundled Chromium to `puppeteer-core` +
  `@sparticuz/chromium` (Vercel's read-only function filesystem can't support Playwright's runtime
  browser download) — `@sparticuz/chromium` ships **Linux-only** binaries, so this suite now
  `describe.skipIf(process.platform !== "linux")`s itself on any other platform (this sandbox is
  macOS — the suite correctly skips here). **Result (Unit 2, pre-Unit-2B)**: ✅ passed live on this
  same macOS sandbox via Playwright's cross-platform Chromium. **Result (Unit 2B)**: ⏭️ not
  executed in this sandbox (non-Linux); runs for real on Linux CI (`ci.yml`'s `ubuntu-latest`
  runner, and `integration.yml`'s scheduled job) with no credential gate. Tracked as
  `external-verification-tracker.md` item 10 until proven on a real Vercel deployment specifically.

### Neon PostgreSQL + PostGIS (requires `DATABASE_URL`)
- `tests/db/schema.integration.test.ts` (Unit 1: RegulatoryRule/InferencePolicy round-trip,
  ACTIVE-only retrieval, PostGIS extension check).
- `tests/db/unit2-schema.integration.test.ts` (Unit 2: atomic job-claim exclusivity, stale-claim
  recovery, EvidenceReportArtifact + ReportAccessCredential create/resolve/revoke,
  ReportPdfRendering bytea round-trip).
- `tests/spatial-analysis/postgis-adapter.integration.test.ts` (Unit 2, CRS correction: a known
  WGS84→EPSG:2926 transform checked against an independently-obtained reference pair from King
  County's own reprojection of the same real parcel vertex; an explicit lng/lat-not-reversed
  check; full `computeSetbackDistances`/`transformPolygonToWgs84` round-trips; SRID fail-closed
  checks against a real connection).
- **Result**: ⏭️ **Not executed — `DATABASE_URL` was not provisioned in any session of this
  project.** All skip cleanly (`describe.skipIf`). See
  `aidlc-docs/operations/external-verification-tracker.md` items 1 and 3.

### Anthropic
- `tests/rule-research-assistant/research.integration.test.ts` (RRAG-1).
- `tests/report-explanation/research.integration.test.ts` (RGD-5, Unit 2).
- **Result**: ⏭️ **Not executed — `ANTHROPIC_API_KEY` was not provisioned.** Both skip cleanly.
  See `external-verification-tracker.md` item 2.

### FEMA / Seattle SDCI GIS
No adapter exists for either in `src/` — no integration test for a source that isn't implemented.

### Unit 2B: Order & Payment (requires `DATABASE_URL`, no Stripe credential needed)
- `tests/order-payment/repository.integration.test.ts` — checkout-session resumability (new order,
  interrupted-session-id resume, concurrent-race single-PENDING-order guarantee, existing-session
  reuse), webhook ledger dedup, the atomic BR-U2B-15 fulfillment transaction, the corrected
  duplicate-payment anomaly (real `paidAt`/`stripePaymentIntentId` retained, canonical order stays
  canonical through its own later refund, a third duplicate still cannot become canonical), and the
  corrected refund state machine end-to-end (a real concurrent-claim race on the same `PAID` order,
  a simulated lost-Stripe-response resumption — both assert the exact same `refundIdempotencyKey`
  is reused). Uses a **fake** `StripeClient` (`tests/fixtures/fake-stripe-client.ts`), so only
  `DATABASE_URL` is required — this suite proves the database-level correctness this unit is built
  around, independent of real Stripe availability.
- **Result**: ⏭️ **Not executed — `DATABASE_URL` was not provisioned in this session.** Skips
  cleanly. See `external-verification-tracker.md` items 1/3 (same DB-provisioning gap as every
  other Neon-dependent suite in this project).

### Unit 2B: Stripe Test-Mode (requires `STRIPE_SECRET_KEY`, test-mode only)
- `tests/order-payment/stripe-live.integration.test.ts` — real Checkout Session creation against
  Stripe's own test-mode API (never a real charge), server-authoritative amount/currency,
  `orderId`/`client_reference_id` correlation, session retrieval, and idempotency-key reuse
  returning the same session rather than creating a duplicate.
- **Result**: ⏭️ **Not executed — no `STRIPE_SECRET_KEY` was provisioned.** Skips cleanly. New
  item, not yet in `external-verification-tracker.md`'s original numbered list — see that
  document's Unit 2B section.

### Unit 3: Admin Operations (requires `DATABASE_URL`, no other credential needed)
- `tests/data-source-registry/repository.integration.test.ts` — the 5 founder-specified
  observed/override/effective cases end-to-end against the real `data_source_health` table:
  known-source-initialization upsert, a successful retrieval recording `HEALTHY` + a success
  timestamp, a failed retrieval recording `UNHEALTHY` + failure data, automated recording
  continuing while a manual override is active, the override remaining the effective value despite
  a newer contradicting observation, and clearing the override immediately exposing the latest
  observed value.
- `tests/admin-action-log/repository.integration.test.ts` — `AdminActionLog` round-trip, the
  database's own `NOT NULL`/`CHECK(length(trim(reason)) > 0)` constraint rejecting a blank reason,
  the 4 atomic local mutations' fault-injected rollback (both the domain write and the audit entry
  roll back together), and the concurrency-safe rule-lifecycle conflict path (a stale/concurrent
  `transitionLifecycleState` call affects zero rows and writes no audit entry).
- `tests/regulatory-rule-governance/repository.integration.test.ts` — `approvalRecord`
  persistence/round-trip, a pre-existing rule with no `approvalRecord` reading back as `undefined`
  (never fabricated), `SUPERSEDED`/`DISABLED` versions both independently inspectable, citation/
  verificationHistory exposed unchanged.
- `tests/order-payment/admin-search.integration.test.ts` — ADM-5's exact orderId/email/reportId
  lookups against real inserted Orders/Jobs/Artifacts (including a real substring of a real email
  proven to NOT match — the exact-match guarantee, not just an empty-string edge case), ADM-1's
  reportId-directly-resolves-provenance path, and a read-only proof that a search performs zero
  `AdminActionLog` writes.
- **Result**: ⏭️ **Not executed — `DATABASE_URL` was not provisioned in this session.** All 4 new
  files skip cleanly, same gap as every other Neon-dependent suite in this project.

## Run the Integration Suite
```bash
npm run test:integration
```

### Verify Results
- **Unit 2 Build & Test's run** (2026-08-23, on this same macOS sandbox): 31 tests total — **14
  passed** (all live, credential-free sources: King County GIS ×6, Legistar ×2, real PDF rendering
  via Playwright ×1, plus the 5 "documents why skipped" tests), **17 skipped** (all correctly gated
  on missing `DATABASE_URL`/`ANTHROPIC_API_KEY`), **0 failed**.
- **Unit 2B Build & Test's actual run** (2026-08-25, this session): **51 tests total across 11
  files — 15 passed, 36 skipped, 0 failed.** Passed: King County GIS ×6, Legistar ×2, plus 7
  "documents why skipped" tests (now including Unit 2B's new `stripe-live`/`repository`
  integration suites' own fallback describes). Skipped: PDF rendering (this sandbox is macOS, not
  Linux — a real, expected, platform-driven skip, not a credential gap — see the "Real PDF
  Rendering" note above), all `DATABASE_URL`-gated suites (now including Unit 2B's
  `repository.integration.test.ts`, 16 of its 17 tests), all `ANTHROPIC_API_KEY`-gated suites, and
  both `STRIPE_SECRET_KEY`-gated `stripe-live.integration.test.ts` tests.
- **Unit 3 Build & Test's actual run** (2026-08-25, this session): **76 tests total across 16
  files — 16 passed, 60 skipped, 0 failed.** Passed: the same 3 always-executable live
  credential-free source files (King County GIS, King County parcel-polygon, Legistar), plus every
  file's own correctly-collected `describe.skipIf` fallback. Skipped: PDF rendering (macOS, not
  Linux), every `DATABASE_URL`-gated suite (now including all 4 new Unit 3 files above, plus Unit
  2B's `repository.integration.test.ts`), every `ANTHROPIC_API_KEY`-gated suite, and
  `STRIPE_SECRET_KEY`-gated `stripe-live.integration.test.ts`. No new credential requirement was
  introduced by Unit 3 — every new DB-backed test reuses the existing `DATABASE_URL` gate.

### Cleanup
DB-backed tests delete their own inserted rows in `afterAll`/inline cleanup once they run against
a real database. The live GIS/Legistar/PDF tests are read-only or self-contained — nothing to
clean up.

## Browser Smoke Suite (Playwright)
Distinct from the vitest integration suite — see `playwright.config.ts`/`e2e/smoke.spec.ts`.
```bash
npx playwright install chromium   # once
npm run test:e2e                   # webServer auto-starts `npm run start` against the built app
```
- **Always-executable** (no `DATABASE_URL` needed): health check, `/configure` initial page load.
  **Result**: ✅ 2/2 pass, run live against a real built-and-started server in this sandbox.
- **DB-dependent** (`describe` block scoped so the skip doesn't affect the tests above — an actual
  bug found and fixed during Code Generation, see build-and-test-summary.md): the full
  configure→place-via-a-real-map-click→identify-lot-line-roles→submit→authorize path, and the
  unknown-token-returns-not-found check. **Result**: ⏭️ not executed, no `DATABASE_URL`. See
  `external-verification-tracker.md` item 4.
- **Unit 4 (Detached Garages) — not yet written**: no equivalent full-path scenario exists for the
  garage configure→place→summary→checkout-rejection path. Explicitly accepted as a gap for Code
  Generation by founder review (2026-08-26), carried into Build & Test as a tracked item rather
  than silently omitted or fabricated — see `external-verification-tracker.md`'s new item for the
  founder's decision on whether to add it now or defer further. The 26 new deterministic
  `vitest` tests (see `unit-test-instructions.md`'s Unit 4 section) cover the corrected
  domain/application logic directly; they do not exercise the real browser UI.
- **Unit 5 (Vacant Land) — not yet written, and not feasible with this project's current test
  infrastructure**: no browser scenario exists for the `/vacant-land` address→screening-intent→
  request-creation→checkout path (same `DATABASE_URL`/live-map blocker as items 4/14), and no
  component-level test exists for the page's BR-U5-9 fail-closed rendering either — this project
  has no React component-testing infrastructure (`@testing-library/react`, jsdom, or equivalent)
  at all, confirmed absent from `package.json`. Explicitly accepted as gaps by founder review
  (2026-08-27 Code Generation review's own "ACCEPTED DEFERRED VERIFICATION" instruction), tracked
  as `external-verification-tracker.md` items 15 (live PostGIS geometry execution) and 16
  (component-level fail-closed rendering) rather than silently omitted or fabricated. The 72 new
  deterministic `vitest` tests (see `unit-test-instructions.md`'s Unit 5 section) cover the
  corrected domain/application/geometry-conversion logic directly; they do not exercise the real
  browser UI or a live PostGIS connection.
