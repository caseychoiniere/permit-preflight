# Build and Test Summary

## Overall Status (as of Unit 2 Build & Test, 2026-08-23)
- **Build**: ✅ Success (`tsc --noEmit` clean, `next build` succeeds — all 12 routes compile)
- **Deterministic tests**: ✅ **125/125 passing**, 22 files, no network/DB/credentials
- **Live integration tests**: ✅ **14/14 executable passing** (King County GIS incl. the
  parcel-polygon endpoint, Legistar, real headless-Chromium PDF rendering), **17 correctly skip**
  (Neon DB, live Anthropic — no credentials in this sandbox)
- **Browser smoke suite**: ✅ **2/2 executable passing** against a real running server (health
  check, `/configure` load), **2 correctly skip** (the full DB-dependent authorize→retrieve path)
- **Ready for Operations**: Unit 1 and Unit 2 are both complete and correct as far as this sandbox
  can prove. Four external-verification items remain open (Neon/PostGIS ×2, Anthropic ×1, full
  browser smoke ×1) — see `aidlc-docs/operations/external-verification-tracker.md`, not fabricated.

---

# Unit 1 (Deterministic Evaluation Foundation, Sheds) — 2026-08-22

## Build Status
- **Build Tool**: TypeScript 5.6 (`tsc --noEmit`) — no bundling/emit step (no deployed runtime in Unit 1).
- **Build Status**: ✅ **Success — zero type errors.**
- **Build Artifacts**: None (by design).

## Test Execution Summary
- **Deterministic**: 76/76 passing, 15 files.
- **Live integration**: 8/8 executable passing (King County GIS 4/4, Legistar 2/2, +2
  "documents why skipped"), 5 skipped (Neon DB 4, Anthropic 1).
- **Performance**: N/A — no deployed/concurrently-used runtime in Unit 1's scope.

## Item 1: PostGIS Production-Boundary Verification (user's explicit ask)
**Finding: No violation exists.** `src/spatial-analysis/geometry.ts`'s pure TypeScript functions
are never imported by any production path — confirmed by direct code inspection and a structural
regression test. Spatial Analysis's real PostGIS invocation was correctly deferred to whichever
unit built the Report Generation Orchestrator — that turned out to be Unit 2 (see below).

## Item 2: RRAG-1 / Rule Research Assistant Verification (user's explicit ask)
**Finding: The interface-only seam did not satisfy RRAG-1.** Implemented a concrete Anthropic
adapter (`src/rule-research-assistant/anthropic-client.ts`) with schema-validated output
(`CandidateRulePackageSchema`), env-only credentials, and no dependency on
`regulatory-rule-governance/lifecycle.ts` (RRAG-8).

## Defects Found and Fixed
1. **Legistar `getOrdinanceHistory` searched/mapped the wrong fields** — `MatterName` is
   frequently null; the real ordinance number lives in `MatterEnactmentNumber`, not `MatterFile`
   (the council bill number). Fixed and re-verified live against the real Ordinance 127376.
2. **`regulatory_rules`/`inference_policies` were missing `isTestOnlyFixture`** — added; migrations
   regenerated cleanly (never applied to a live DB).
3. Closed two test-coverage gaps (`rule-research-assistant/`, `packageEvidenceBundle`).

## Tier-2 Shed Rule Status
Remains honestly at **DRAFTED → TRIAGED (Tier 2)** — re-verified, unchanged.

## Tests Not Executed (Unit 1)
`tests/db/schema.integration.test.ts` (no `DATABASE_URL`), `tests/rule-research-assistant/research.integration.test.ts`
(no `ANTHROPIC_API_KEY`) — both skip cleanly.

---

# Unit 2 (Report Generation & Presentation Prototype) — 2026-08-23

## Build Status
- **Build Tool**: TypeScript 5.6 + Next.js 15 (`next build`) — the first unit with a real compiled/
  deployed artifact.
- **Build Status**: ✅ **Success.** All 12 routes compile; static pages generate.
- **Build Artifacts**: `.next/` (not committed — gitignored).

## Test Execution Summary
- **Deterministic**: 125/125 passing, 22 files (49 new tests across 7 new files added during Unit
  2's Code Generation and its two targeted post-review corrections).
- **Live integration**: 14/14 executable passing (King County GIS incl. the parcel-polygon
  endpoint — now requesting and verifying an explicit `outSR=2926` — Legistar, real
  headless-Chromium PDF rendering), 17 skipped (Neon DB round-trips including the new CRS-transform
  tests, live Anthropic for both RRAG-1 and Report Explanation).
- **Browser smoke suite**: 2/2 executable passing (health check, `/configure` load) against a real
  built-and-started server; 2 DB-dependent tests (the full configure→place-via-real-map-click→
  authorize path, and the unknown-token-404 check) correctly skip.
- **Performance**: soft NFR-U2-2 targets, not a formal load-test suite — see
  `performance-test-instructions.md`. `STAGE_TIMING` instrumentation exists but has not been
  observed against a real pipeline run (needs `DATABASE_URL`) — tracked as open, not fabricated.

## Targeted Correction 1: CRS Pipeline (user's explicit post-Code-Generation-review ask)

**What was found**: the originally-shipped `ParcelPlacementMap` converted a map click's lng/lat
delta into feet using a local flat-earth approximation before submitting it — a genuine
correctness defect (a precise PostGIS calculation over incorrectly-transformed input is still
incorrect), not UI polish.

**What was also found while fixing it (not anticipated)**: live inspection of King County's
parcel-polygon endpoint showed its **undeclared default spatial reference is EPSG:3857 (Web
Mercator)**, not the EPSG:2926 the original adapter had hardcoded and assumed without verification.
Had that default response ever been used, every persisted parcel boundary would have been silently
mistagged with the wrong coordinate system.

**Fix**: a single explicit CRS contract for the entire spatial path —
- Browser (`ParcelPlacementMap.tsx`): submits the raw WGS84 `{lng, lat}` MapLibre produces, zero
  conversion, no client-computed distance ever possible (`ShedProjectConfigurationSchema` has no
  such field, proven structurally).
- King County retrieval (`king-county-parcel-geometry.ts`): requests an explicit `outSR=2926` and
  **verifies the response's declared `spatialReference.wkid` actually matches** before trusting
  it — fails closed otherwise.
- PostGIS adapter (`postgis-adapter.ts`): the *only* reprojection point, via real `ST_Transform`
  calls; both `computeSetbackDistances` and the new `transformPolygonToWgs84` (for display) fail
  closed on a missing/mismatched `Polygon.srid`.

**Tests added** (per the user's explicit list): `tests/spatial-analysis/postgis-adapter.test.ts`
(deterministic SRID fail-closed guards — provable without a DB, since the guard runs before any
query); `postgis-adapter.integration.test.ts` (rewritten — a known-WGS84-point transform checked
against an independently-obtained reference pair pulled live from King County's own reprojection
of the same real parcel vertex during this fix; an explicit lng/lat-swap-produces-wrong-location
check; full round-trips; SRID fail-closed against a real connection); a structural test in
`production-boundary.test.ts` grepping `src/`/`app/` for the removed approximation's constants;
`screening-request/validation.test.ts` extended with lng/lat range validation and a real-Seattle-
coordinate swap-rejection test. **All DB-dependent tests here are written and verified to
typecheck, but not executed in this sandbox (no `DATABASE_URL`) — kept explicitly open per the
user's instruction not to fabricate this verification.**

## Targeted Correction 2: ReportMap (user's explicit post-Code-Generation-review ask)

**What was missing**: `frontend-components.md` specified a `ReportMap` component; the original
Code Generation pass didn't build it (disclosed at the time, not silently omitted).

**Fix**: `app/components/ReportMap.tsx`, reading only geometry already persisted on the immutable
`EvidenceReportArtifact` — never re-queries King County, never reruns PostGIS, never reruns the
Rules Engine. The parcel boundary and proposed footprint are transformed to WGS84 **once, during
generation**, via real `ST_Transform` calls, and stored as synthetic evidence entries
(`parcel-boundary-wgs84-display`, `proposed-footprint-wgs84-display`) — `EvidenceEntry` gained a
`value` field to make this possible (previously only `provenance` was persisted, which would have
made a real map view impossible without re-deriving data at view time). Every finding shown on the
map still has its full, unchanged representation in `FindingsList`/`RequiresVerificationCard`.

## Defects Found and Fixed (original Code Generation pass, before the two corrections)
1. **`instrumentation.ts` crashed the entire server on boot when `DATABASE_URL` was unset** —
   found by actually building, starting, and curling the app (`/healthz` returned 500). `getDb()`
   was called eagerly, defeating its own lazy-construction design and taking down even the
   DB-independent health check. Fixed: the hook checks for `DATABASE_URL` first and simply skips
   starting the poller when absent. Re-verified live.
2. **Playwright's `test.skip(condition, reason)` at file scope skips every test in the file**, not
   just subsequent ones — found when all 4 smoke tests unexpectedly skipped on first run. Fixed by
   scoping DB-dependent tests inside their own `test.describe()`.
3. **`drizzle-orm@0.36.4` (Unit 1's original pin) has a disclosed SQL-injection-via-identifiers
   advisory** (GHSA-gpj5-g38j-94v9) — found via `npm audit`. Upgraded to the patched `^0.45.2`
   (matching `drizzle-kit` bump); migrations regenerated; full suite re-verified.

## Tier-2 Shed Rule Status
Unchanged — still honestly `DRAFTED → TRIAGED (Tier 2)`. Unit 2 added the `acceptedEvidenceQuality`
field the candidate would need to declare at `APPROVED`, but since it never reaches `APPROVED`,
this remains an open question for whoever eventually reviews it (BR-U2-10 point 5).

## Security / Provenance Checks
- Same discipline as Unit 1: credentials never logged, only used as request headers/env reads.
- `report-access/credential.ts`: raw tokens exist only long enough to return once; only the
  SHA-256 hash is ever persisted; revoked and unknown tokens resolve identically (no signal leak).
- `spatial-analysis/postgis-adapter.ts`'s SRID guards (`assertAuthoritativeSrid`, checked before
  any query) and `screening-request/types.ts`'s Boundary Validator schemas reject malformed input
  before it reaches PostGIS or the domain layer.

## Tests That Could Not Be Executed, and Why
| Suite | Reason | What activates it |
|---|---|---|
| `tests/db/schema.integration.test.ts`, `unit2-schema.integration.test.ts`, `postgis-adapter.integration.test.ts` | No `DATABASE_URL` provisioned in any session of this project. | Set `DATABASE_URL` to an isolated Neon dev/test branch, run `npm run db:migrate` then `npm run test:integration`. |
| `tests/rule-research-assistant/research.integration.test.ts`, `tests/report-explanation/research.integration.test.ts` | No `ANTHROPIC_API_KEY`. | Set `ANTHROPIC_API_KEY` and run `npm run test:integration`. |
| `e2e/smoke.spec.ts`'s DB-dependent `describe` block | Same `DATABASE_URL` gap — the full flow needs a real screening request/job/artifact. | Set `DATABASE_URL`, `npm run build && npx playwright test`. |
| `STAGE_TIMING` real-pipeline observation (performance baseline) | Same `DATABASE_URL` gap. | Authorize a real report generation once credentials exist; read the resulting log lines. |

All DB/credential-gated suites are written to **skip cleanly** rather than fail when the
environment is absent.

## Remaining External Dependencies
- **Neon PostgreSQL+PostGIS credentials**: needed for the DB round-trips, the real `ST_Transform`
  CRS verification, and the real `STAGE_TIMING` performance baseline.
- **Anthropic API key**: needed to exercise RRAG-1 and Report Explanation end-to-end against the
  live model (deterministic mechanics already proven via fake-client tests for both).
- **A real Tier 2 professional review**: unchanged — the only thing standing between the real shed
  candidate and `ACTIVE`.
- **A `MAPTILER` API key**: optional — the app functions and displays parcel/footprint overlays
  correctly without one; only the basemap image itself is absent.
