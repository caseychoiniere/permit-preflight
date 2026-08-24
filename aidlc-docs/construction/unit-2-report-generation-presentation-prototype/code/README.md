# Unit 2: Report Generation & Presentation Prototype — Code Summary

Implements PC-1, PC-2, RGD-1 through RGD-6, per the approved Functional Design, NFR
Requirements/Design, and Infrastructure Design. First unit with a real deployed runtime (Next.js
on Railway) and a real UI. No commercial scope: no checkout, pricing, accounts, subscriptions, or
other project types — those remain Unit 2B/later.

## Running It

```bash
npm install
npm run typecheck            # tsc --noEmit
npm test                      # deterministic suite - no network/DB/credentials required
npm run build                 # production Next.js build
npm run dev                   # local dev server
npx playwright install chromium   # once, for PDF rendering + the e2e smoke suite
npm run test:e2e              # small Playwright smoke suite (webServer auto-starts `npm run start`)
npm run test:integration      # live King County/Legistar/Neon/Anthropic - see below
```

**Result as of this session**: typecheck clean; `npm test` **125/125 passing** across 22 files;
`npm run build` succeeds (all routes compile, static pages generate); `npm run test:e2e`
**2/2 executable tests pass** (health check, configure-page load) against a real running server,
**2 correctly skip** (the full authorize→retrieve path, which now exercises a real MapLibre map
click, not the accessible fallback — needs `DATABASE_URL`); `npm run test:integration`
**14/14 executable tests pass** (King County GIS incl. the parcel-polygon endpoint now requesting
an explicit, verified `outSR=2926`, Legistar, real headless-Chromium PDF rendering), **17 correctly
skip** (Neon DB round-trips including the CRS-transform/setback-computation tests, live Anthropic
— no credentials in this sandbox).

## What's Implemented (by component)

| Component | Files | Notes |
|---|---|---|
| Screening Request | `src/screening-request/` | `ShedProjectConfiguration` + `LotLineRoleAssignment` types/validation, `authorizeReportGeneration` (the internal trigger, BR-U2-2), BR-U2-1 readiness check |
| Data Source Registry | `src/shared/data-source-registry-instance.ts` | Process-wide singleton wrapping Unit 1's in-memory registry, per the single-Railway-replica decision |
| Spatial Analysis | `src/spatial-analysis/lot-line-roles.ts`, `postgis-adapter.ts` | BR-U2-9's fail-closed role-assignment logic; the real production PostGIS adapter (parameterized queries, never fetches geometry itself — Property Intelligence's job; the sole place a WGS84 coordinate is reprojected, via `ST_Transform`, fail-closed on SRID mismatch — see "CRS Correction" below) |
| Property Intelligence | `src/property-intelligence/king-county-parcel-geometry.ts`, extended `types.ts`/`assemble.ts` | Real King County parcel-polygon retrieval with mandatory `qualityCaveat`/`evidenceQuality` attachment |
| Regulatory Rule Governance | Extended `types.ts`, `lifecycle.ts` | Additive `acceptedEvidenceQuality` field; `approve()` now requires it as an explicit human decision |
| Regulatory Rules Engine | Extended `types.ts`, `evaluate.ts` | BR-U2-10's evidence-quality classification gate (`classifySpatialFinding`) |
| Report Explanation | `src/report-explanation/` | RGD-5, reuses the `AiCompletionClient` pattern as a structurally distinct instance |
| Report Access | `src/report-access/` | `credential.ts` (pure crypto), `repository.ts` (DB-backed), `rate-limiter.ts` (in-process, bounded) |
| Report Generation Job | `src/report-generation-job/` | Atomic Postgres claim + stale-claim recovery (NFR Design Pattern 3) |
| Evidence & Report Artifact | `src/evidence-report-artifact/` | Immutable once created; issues the first access credential |
| Report PDF Rendering | `src/report-pdf-rendering/` | Real headless-Chromium rendering (Playwright), lazy + cached, structurally separate `ReportPdfRendering` derivative |
| Report Generation Orchestrator | `src/report-generation-orchestrator/` | `pipeline.ts` (the full Workflow 4 pipeline), `poller.ts` (in-process job poller, dev-hot-reload-guarded), `stage-timing.ts` (`STAGE_TIMING` logger extension) |
| Database | `src/db/schema.ts` | 5 new tables: `screening_requests`, `report_generation_jobs`, `evidence_report_artifacts`, `report_pdf_renderings`, `report_access_credentials`; additive `accepted_evidence_quality` column on `regulatory_rules` |
| Frontend | `app/` | Next.js App Router: `/configure` (address→type→details→placement→authorize), `/report/[token]` (findings, REQUIRES VERIFICATION distinction, evidence caveats, PDF download, `ReportMap`), `app/components/ParcelPlacementMap.tsx` (real MapLibre GL JS, submits raw WGS84, zero client-side reprojection), `app/components/ReportMap.tsx` (read-only presentation of the immutable artifact's persisted geometry) |
| Instrumentation | `instrumentation.ts` | Bootstraps the job poller once per process; **degrades (doesn't start the poller) rather than crashing server boot** when `DATABASE_URL` is unset — see "Defects Found and Fixed" |
| CI | `.github/workflows/ci.yml`, `integration.yml` | Blocking gate (typecheck/test/build/e2e-smoke) vs. non-blocking scheduled live-integration workflow |

## Ownership Boundary Correction (Infrastructure Design, 2026-08-22)

`spatial-analysis/postgis-adapter.ts` **never fetches King County data itself** — it receives an
already-retrieved `boundaryPolygon` as a parameter. Property Intelligence
(`king-county-parcel-geometry.ts`) owns the fetch, validation, and mandatory
`qualityCaveat`/`evidenceQuality` attachment. Verified by direct code inspection: the adapter has
no `fetch()` call and no King County URL anywhere in it.

## Evidence-Quality Classification Gate (BR-U2-10)

`evaluateProject`'s `REAR_SETBACK`/`SIDE_FRONT_SETBACK_STANDARD` findings now consult
`ShedProjectDetails.spatialEvidenceQuality`. A `GENERAL_LOCATION_ONLY`-sourced distance can only
produce `KNOWN` if the applied `ACTIVE` rule's `acceptedEvidenceQuality` explicitly says so (a
human decision recorded at `approve()` time — the function signature now requires it); otherwise
`INFERRED` via an `ACTIVE InferencePolicy` for the fixed
`GENERAL_LOCATION_ONLY_SETBACK_EVIDENCE` situation, or `REQUIRES_VERIFICATION`. This is
categorical, not a numeric tolerance — `tests/regulatory-rules-engine/evidence-quality-gate.test.ts`
proves both the gate and the "no fabricated tolerance" boundary (a FAIL stays FAIL even under an
accepting rule).

## Lot-Line Role Assignment (BR-U2-9)

`spatial-analysis/lot-line-roles.ts` never infers front/rear/side from a polygon's shape. Given an
explicit user front/rear indication, it succeeds (`ASSIGNED`) only for a quadrilateral parcel with
non-adjacent (opposite) front/rear edges; anything else — corner lots, irregular/multi-sided
parcels, adjacent selections — fails closed to `INSUFFICIENT`, which flows through to the
Regulatory Rules Engine's existing missing-evidence path (no new mechanism needed) and produces
`REQUIRES_VERIFICATION`, never a guess.

## The Real Unit 0B Shed Candidate — Still Honest (Unchanged)

Still `DRAFTED → TRIAGED (TIER_2)`, still excluded from evaluation output. Unit 2 introduces the
`acceptedEvidenceQuality` field the candidate would need to declare at `APPROVED` — but since it
never reaches `APPROVED`, this remains an open, undecided question for whoever eventually reviews
it, exactly as `BR-U2-10` point 5 anticipated.

## CRS Correction (Code Generation targeted fix, 2026-08-23)

The originally-shipped `ParcelPlacementMap` converted a map click into feet using a local
flat-earth approximation before submitting a feet-based footprint polygon — a genuine correctness
defect, not UI polish: a precise PostGIS calculation over an incorrectly-transformed input is
still an incorrect result. Corrected to a single, explicit CRS contract for the whole spatial
path:

- **Browser**: submits the placement anchor exactly as MapLibre produces it — WGS84 (EPSG:4326)
  `{lng, lat}`, straight from `e.lngLat`. No conversion of any kind happens in `ParcelPlacementMap`
  or anywhere else in `app/`. There is no field anywhere in `ShedProjectConfigurationSchema` for a
  client-computed distance (`tests/screening-request/validation.test.ts` proves this structurally).
- **King County parcel geometry** (`property-intelligence/king-county-parcel-geometry.ts`): now
  requests an explicit `outSR=2926` on every fetch (previously relied on the endpoint's undeclared
  default) and **verifies the response's declared `spatialReference.wkid` actually matches** before
  trusting the coordinates — fails closed otherwise. Live inspection during this fix found the
  endpoint's real default is EPSG:3857 (Web Mercator), not the 2926 originally assumed — the
  original code would have silently mistagged that default response. `Polygon` gained an explicit
  `srid` field for exactly this reason.
- **PostGIS adapter** (`spatial-analysis/postgis-adapter.ts`): the *only* place a WGS84 coordinate
  is ever reprojected — via `ST_Transform`, never application-level math. `computeSetbackDistances`
  and `transformPolygonToWgs84` both fail closed (throw) if the boundary polygon's `srid` is
  missing or doesn't match the expected value. Once the anchor is transformed into the same
  projected (feet) CRS as the boundary, constructing the rotated rectangle footprint via ordinary
  Euclidean offset/rotation math is exact, not an approximation — the approximation was doing that
  arithmetic in degree-space, not the arithmetic itself.
- **Tests**: `tests/spatial-analysis/postgis-adapter.test.ts` (deterministic — SRID fail-closed
  guards, provable without a DB since they throw before any query) and
  `postgis-adapter.integration.test.ts` (live — a known WGS84→2926 transform checked against an
  independently-obtained reference pair from King County's *own* reprojection of the same real
  parcel vertex; an explicit lng/lat-not-reversed check; full `computeSetbackDistances` and
  `transformPolygonToWgs84` round-trips) — **written for real, not executed in this sandbox
  (no `DATABASE_URL`), explicitly left open for Build & Test rather than fabricated.**
  `tests/spatial-analysis/production-boundary.test.ts` gained a structural test proving the removed
  approximation's characteristic constants appear nowhere in `src/` or `app/`.

## ReportMap (RGD-2, Code Generation targeted fix, 2026-08-23)

`app/components/ReportMap.tsx` is now implemented and wired into `/report/[token]`. It renders
**only** what's already persisted on the immutable `EvidenceReportArtifact` — the parcel boundary
and proposed footprint, both computed once via real `ST_Transform` calls during generation
(`report-generation-orchestrator/pipeline.ts`) and stored as WGS84 display-only evidence entries
(`parcel-boundary-wgs84-display`, `proposed-footprint-wgs84-display`). Viewing a report never
re-queries King County, never reruns PostGIS, never reruns the Rules Engine — `ReportMap` only
reads fields already on the fetched artifact. `EvidenceEntry` gained an optional `value` field to
carry this (previously only `provenance` was persisted, which would have made a real map view
impossible without re-deriving data at view time). Every finding shown on the map still has its
full, unchanged representation in `FindingsList`/`RequiresVerificationCard` — the map is
supplementary, never the only place a finding is communicated.

## Defects Found and Fixed During This Session

1. **`instrumentation.ts` crashed the entire server on boot when `DATABASE_URL` was unset** —
   found via a real smoke test (starting the built app and curling `/healthz`), not simulated.
   `getDb()` was called eagerly as an argument expression rather than lazily, defeating its own
   lazy-construction design and taking down even the DB-independent health check. Fixed: the hook
   now checks for `DATABASE_URL` first and simply doesn't start the poller when absent, rather
   than letting the whole process fail to boot. Re-verified live: `/healthz` and `/configure` both
   return 200 without any database configured.
2. **Playwright's `test.skip(condition, reason)` at file scope skips every test in the file, not
   just subsequent ones** — found while first running the smoke suite (all 4 tests unexpectedly
   skipped). Fixed by scoping the DB-dependent tests inside their own `test.describe()` block.
3. **`drizzle-orm@0.36.4` (Unit 1's original pin) has a disclosed SQL-injection-via-identifiers
   advisory** (GHSA-gpj5-g38j-94v9) — found via `npm audit` after installing Unit 2's new
   dependencies. Upgraded to the patched `^0.45.2` (with a matching `drizzle-kit` bump);
   regenerated migrations; re-verified typecheck and the full test suite still pass.

## Deliberately Deferred / Not Built

- **Real address→parcel resolution UX beyond a single text field** — `/api/parcels/resolve` calls
  Unit 1's real, unchanged `resolveByAddress`, but only the happy `CONFIRMED` path has UI; a
  `CLARIFICATION_REQUIRED`/`NO_MATCH`/`RESOLUTION_UNAVAILABLE` result shows a plain message rather
  than a full resolution UX (map-based candidate picking, etc.) — Epic 1 (Property Resolution) has
  no UI-design artifact of its own to build against; this is the minimum glue needed to reach the
  approved `ProjectConfigurationFlow`'s actual starting point, not a rebuild of that epic.
- **Real basemap tiles** — `ParcelPlacementMap`/`ReportMap` use `NEXT_PUBLIC_MAPTILER_KEY`; with
  no key set, MapLibre renders an empty style (still displays the parcel boundary/footprint
  overlays correctly, just without a basemap image underneath).
- **Real address→parcel resolution UX beyond a single text field** (unchanged from the original
  Code Generation pass — see above).
- **Customer accounts, payment, checkout, other project types, admin tooling** — explicitly out of
  scope per the Category A/B split.

## Remaining External Verification (carried into Build & Test, not fabricated)

- The CRS-transform and full `computeSetbackDistances`/`transformPolygonToWgs84` integration
  tests (`tests/spatial-analysis/postgis-adapter.integration.test.ts`) and the Unit 2 DB
  round-trip tests need a real `DATABASE_URL` to actually run — written, verified to typecheck,
  not executed in this sandbox.
- The full Playwright smoke path (`e2e/smoke.spec.ts`'s DB-dependent `describe` block) needs a
  running app with `DATABASE_URL` — written to exercise a real MapLibre map click (not the
  accessible fallback), not executed here.
- Both are tracked in `aidlc-docs/operations/external-verification-tracker.md` alongside Unit 1's
  still-open Neon/Anthropic items.
