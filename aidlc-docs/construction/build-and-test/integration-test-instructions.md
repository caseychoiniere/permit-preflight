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

### Real PDF Rendering (Chromium binary required, no credentials)
- `tests/report-pdf-rendering/render.integration.test.ts` — real headless-Chromium rendering via
  Playwright. Requires `npx playwright install chromium` once. **Result**: ✅ passes live —
  produces a real PDF starting with the `%PDF` header.

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

## Run the Integration Suite
```bash
npm run test:integration
```

### Verify Results
- **This session's actual run** (Unit 2 Build & Test): 31 tests total — **14 passed** (all live,
  credential-free sources: King County GIS ×6, Legistar ×2, real PDF rendering ×1, plus the 5
  "documents why skipped" tests), **17 skipped** (all correctly gated on missing
  `DATABASE_URL`/`ANTHROPIC_API_KEY`), **0 failed**.

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
