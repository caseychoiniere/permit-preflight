# Unit 2: Report Generation & Presentation Prototype — Code Generation Plan

**Process note**: per the user's explicit instruction ("optimize for working software and
executable integration rather than further architecture refinement... proceed through Code
Generation and stop at the normal Code Generation review gate"), this plan is generated and
executed in the same pass, matching how Unit 1's Code Generation was handled under equivalently
comprehensive up-front direction.

**Design consumed**: all approved Functional Design, NFR Requirements/Design, and Infrastructure
Design artifacts for Unit 2, including the two Functional Design corrections (lot-line-role
assignment/evidence-quality gating) and the NFR Design correction (`ReportPdfRendering` as a
disposable derivative, PDF-request token authorization wording).

## Steps

1. [x] **Database Schema Extension** — 5 new tables (`screening_requests`,
   `report_generation_jobs`, `evidence_report_artifacts`, `report_pdf_renderings`,
   `report_access_credentials`); additive `accepted_evidence_quality` column on `regulatory_rules`;
   migrations regenerated (never applied to a live DB - safe to regenerate cleanly).
2. [x] **Screening Request** (`src/screening-request/`) — types, Boundary Validator schema for
   `ShedProjectConfiguration`/`LotLineRoleAssignment`, `authorizeReportGeneration` (BR-U2-2),
   BR-U2-1 readiness check, repository (create/validate/update).
3. [x] **Spatial Analysis Extensions** (`src/spatial-analysis/`) — `lot-line-roles.ts` (BR-U2-9,
   fail-closed role derivation/validation), `postgis-adapter.ts` (real, parameterized production
   setback-distance computation, never fetches geometry itself).
4. [x] **Property Intelligence Extension** (`src/property-intelligence/`) — real King County
   parcel-polygon retriever with mandatory `qualityCaveat`/`evidenceQuality` attachment;
   `Provenance`/`FactRetriever` extended additively.
5. [x] **Regulatory Rule Governance / Rules Engine Extensions** — additive
   `acceptedEvidenceQuality` on `RegulatoryRule` (required at `approve()` time); BR-U2-10's
   evidence-quality classification gate in `evaluate.ts`.
6. [x] **Report Explanation** (`src/report-explanation/`) — RGD-5, reuses the `AiCompletionClient`
   pattern as a structurally distinct module.
7. [x] **Report Access** (`src/report-access/`) — credential generate/hash/resolve/revoke/rotate
   (pure + DB-backed), in-process bounded rate limiter.
8. [x] **Report Generation Job** (`src/report-generation-job/`) — atomic claim + stale-claim
   recovery.
9. [x] **Evidence & Report Artifact + Report PDF Rendering** (`src/evidence-report-artifact/`,
   `src/report-pdf-rendering/`) — immutable artifact; real headless-Chromium PDF rendering as a
   separate, lazy, cached derivative.
10. [x] **Report Generation Orchestrator** (`src/report-generation-orchestrator/`) — the full
    pipeline, the in-process job poller (dev-hot-reload-guarded, graceful-shutdown-aware),
    `STAGE_TIMING` logger extension.
11. [x] **Next.js Application** (`app/`, `instrumentation.ts`, `next.config.mjs`) — API routes,
    `/configure` (`ProjectConfigurationFlow`), `/report/[token]` (`ReportView`), real MapLibre GL
    JS integration (`ParcelPlacementMap`), `/healthz`.
12. [x] **Fixture Data** (`tests/fixtures/test-only-active-rules.ts` extensions) — BR-U2-10 test
    fixtures (an authoritative-only rule, a rule accepting `GENERAL_LOCATION_ONLY`, a matching
    `InferencePolicy`).
13. [x] **Deterministic Test Suite** — 114 tests across 21 files; no network/DB/credentials.
14. [x] **Integration/Health Test Suite** — King County parcel-polygon (executed live), Neon/
    PostGIS round-trips + setback computation (written, skip cleanly - no `DATABASE_URL`),
    Anthropic/Report Explanation (written, skips cleanly - no `ANTHROPIC_API_KEY`), real
    headless-Chromium PDF rendering (executed live).
15. [x] **Browser Smoke Suite** (`e2e/`, `playwright.config.ts`) — 2 executable tests run live
    against a real built-and-started server (health check, configure-page load); 2 DB-dependent
    tests written and skip cleanly.
16. [x] **CI** (`.github/workflows/ci.yml`, `integration.yml`) — blocking gate vs. non-blocking
    scheduled live-integration workflow, matching the approved Infrastructure Design exactly.
17. [x] **Documentation** — `aidlc-docs/construction/unit-2-report-generation-presentation-prototype/code/README.md`.
18. [x] **Targeted Correction 1 (CRS pipeline)** — replaced the flat-earth coordinate
    approximation with a single explicit WGS84-browser / PostGIS-`ST_Transform`-server contract;
    `Polygon.srid`, fail-closed SRID guards in `postgis-adapter.ts`, King County fetch now
    requests+verifies `outSR=2926` (found the endpoint's undeclared default is actually EPSG:3857,
    not the originally-assumed 2926 — a real defect this correction caught); 6 new
    deterministic/integration test files covering every case the user specified.
19. [x] **Targeted Correction 2 (ReportMap)** — implemented `app/components/ReportMap.tsx`,
    reading only the immutable artifact's persisted WGS84 evidence (computed once during
    generation via real `ST_Transform`, never re-derived at view time); `EvidenceEntry` gained a
    `value` field to make this possible.

## Note on Live Execution

This session has `DATABASE_URL`/`ANTHROPIC_API_KEY` unset (no live Neon/Anthropic credentials) but
**does** have real network access and a real, working Playwright/Chromium install. Consequently,
significantly more of this unit's integration surface was actually exercised live than was
possible in Unit 1: the King County parcel-polygon endpoint, the full production build, real
headless-Chromium PDF rendering, and 2 of 4 browser smoke tests all ran for real, not merely
written. Three real defects were found and fixed via this genuine testing (see the code README's
"Defects Found and Fixed" section) - not simulated failures.
