# Build and Test Summary

## Overall Status (as of Unit 5 Code Generation, 2026-08-27)
- **Build**: ✅ Success (`tsc --noEmit` clean, `next build --webpack` succeeds — every route from
  Unit 4 still compiles plus 2 new routes: `/vacant-land` and
  `/api/screening-requests/available-vacant-land-coverage`; no new Vercel Workflow — Unit 5
  introduces no new asynchronous/durable execution requirement).
- **Deterministic tests**: ✅ **312/312 passing**, 50 files (up from Unit 4's 240/42 — 72 new
  vacant-land-specific tests across 8 new files, no network/DB/credentials).
- **Live integration tests**: unchanged from Unit 4's own figures — Unit 5's new PostGIS geometry
  functions (`computeSetbackConstrainedArea`/`computeEcaExclusionGeometry`/
  `computeBuildableEnvelope`) are covered deterministically (short-circuit paths + pure GeoJSON/WKT
  conversion helpers) but not against a live database in this sandbox — see this file's Unit 5
  section and `external-verification-tracker.md` item 15.
- **Browser smoke suite**: unchanged executable/skip counts from Unit 4 — no vacant-land browser
  scenario was added, and no component-level test exists for the new `/vacant-land` page's
  fail-closed rendering (no React testing-library infrastructure in this project) — see
  `external-verification-tracker.md` item 16.
- **Ready for Operations**: Units 1, 2, 2B, 3, 4, and now 5 (Functional Design through Code
  Generation only — no vacant-land `RegulatoryRule` is `ACTIVE`, `VACANT_LAND` is not publicly
  purchasable, and the persistence-write-activation gate stays `false`, all by explicit founder
  design) are complete and correct as far as this sandbox can prove. External-verification items
  remain open across all units — see `aidlc-docs/operations/external-verification-tracker.md`, not
  fabricated.

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

---

# Unit 2B (Commercial Payment & Fulfillment) — 2026-08-25

## Build Status
- **Build Tool**: TypeScript 5.9 + Next.js 15 (`next build`) + the Workflow SDK's own build-time
  compilation step (`workflow/next`'s `withWorkflow()`).
- **Build Status**: ✅ **Success.** 17 routes compile (4 new API routes, the Workflow SDK's 2
  internal `.well-known/workflow/*` routes, the new `/checkout/status` page, 12 carried forward
  from Unit 2). `.next/diagnostics/workflows-manifest.json` directly inspected and confirmed
  correct (see Defect 1 below).
- **Build Artifacts**: `.next/` (gitignored, not committed). A new migration,
  `0002_hot_colleen_wing.sql`, generated but never applied to a live database in this sandbox.

## Test Execution Summary
- **Deterministic**: 153/153 passing, 27 files (28 new tests across 5 new files: `decideRefundAction`'s
  full state coverage, real offline Stripe webhook-signature verification, two
  structural/production-boundary tests, and the report-price validation suite added in the
  post-review correction pass).
- **Live integration**: 15/15 executable passing, 36 correctly skipped (0 failed) — see
  `integration-test-instructions.md`'s Unit 2B sections for the exact breakdown. Notably: Unit 2B's
  new `repository.integration.test.ts` (16 DB-dependent tests) and `stripe-live.integration.test.ts`
  (2 Stripe-test-mode-dependent tests) are both written and typecheck-clean but not executed in
  this sandbox; the PDF-rendering suite's skip here is a genuine platform gate (Linux-only
  `@sparticuz/chromium`), not a credential gap, and it runs for real on Linux CI.
- **Performance**: unchanged from Unit 2 — no new formal load-test suite; `STAGE_TIMING`
  instrumentation is reused unmodified by the new Vercel Workflow steps.

## The Workflow-Discovery Build Defect (found via real build verification, not anticipated)

`next build` succeeded with **zero errors** on the first attempt, but a direct inspection of
`.next/diagnostics/workflows-manifest.json` (performed specifically because a clean build output
alone cannot prove the Workflow SDK actually registered anything) showed **`"workflows": {}`** —
the SDK's own build-time discovery scanner does its own module resolution, separate from
webpack's, and does not follow this codebase's `.js`-extension-pointing-at-a-`.ts`-file import
convention (which webpack itself resolves fine via `next.config.mjs`'s custom `extensionAlias`).
This would have shipped a build that looks entirely correct — compiles cleanly, all routes present
— with **completely non-functional durable execution**: `start(reportGenerationWorkflow, ...)`
would never actually have run the durable workflow machinery. Fixed by dropping the `.js` suffix
specifically on the handful of imports referencing the two workflow files; re-verified the manifest
now correctly registers both workflows and all 5 step functions with the intended execution graph.
Full detail: `build-instructions.md`'s troubleshooting section and the code README.

## Two Founder-Identified Corrections (post-Code-Generation review, 2026-08-25)

1. **Report price**: the placeholder `DEFAULT_REPORT_PRICE_CENTS = 4900` ($49.00) was never a real
   pricing decision — corrected to the founder-approved `999` ($9.99), with the `REPORT_PRICE_CENTS`
   override validated by a strict digits-only check (fails closed on anything malformed, never
   silently coerces or falls back) and 12 new deterministic tests.
2. **Duplicate-payment auditability**: the original duplicate-payment-anomaly handling left the
   second Order's `paidAt` `NULL` forever to satisfy `orders_screening_request_id_paid_unique` —
   an auditability defect, since Stripe genuinely confirmed that payment. Corrected: the index's
   predicate was narrowed to exclude `refundReason = 'DUPLICATE_PAYMENT'` rows (migration
   `0002_hot_colleen_wing.sql`), so a duplicate-charged Order now records its real
   `paidAt`/`stripePaymentIntentId` while never counting toward "the one canonical paid Order."
   `getPaidOrder()` was corrected to match. Full detail in the code README's item 5 and
   `functional-design/business-rules.md`'s BR-U2B-1 point 3 (corrected in place, not silently
   rewritten).

## Defects Found and Fixed During Code Generation (before the two corrections above)
1. **The Workflow-discovery build defect** — see above.
2. **`scripts/generate-prototype-report.ts` cannot safely call `start()` on a Vercel Workflow** —
   `start()` is designed for calls from within the same registered Next.js build; a standalone
   `tsx`-run CLI script is an untested cross-context path. Fixed: the CLI runs the pipeline
   directly (`claimQueuedJob` + `runReportGenerationPipeline`) instead.
3. **`handlePaymentConfirmed`'s original duplicate-payment-anomaly design would have aborted the
   entire atomic transaction on the very unique-violation it exists to detect** — a naive `UPDATE`
   hitting the partial index throws inside the surrounding Postgres transaction, poisoning it
   entirely (including the ledger write) until rolled back, which would have made Stripe redeliver
   the webhook forever without ever reaching the anomaly-handling path. Fixed with a nested
   `tx.transaction()` (a Postgres `SAVEPOINT`).
4. **Two disclosed, non-blocking `npm audit` findings** in `puppeteer-core`'s `extract-zip`
   transitive dependency and the `workflow` SDK's `nanoid` transitive dependency — neither
   vulnerable code path is reachable by this application's actual usage.

## Tier-2 Shed Rule Status
Unchanged — still honestly `DRAFTED → TRIAGED (Tier 2)`. Unit 2B introduces no new regulatory-rule
mechanics.

## Security / Provenance Checks
- Same discipline as Units 1/2: credentials never logged (Stripe/Resend/webhook secrets accessed
  only via env reads and request headers).
- Stripe webhook signature verification happens against the exact raw request body, before any
  event data is trusted (`tests/order-payment/webhook-signature.test.ts` proves both accept and
  reject paths, including a tampered-body case and a wrong-secret case).
- `GuestOrderStatus`'s minimized response shape is structurally proven never to reference
  `customerEmail`, `stripePaymentIntentId`, `stripeRefundId`, `reportAccessToken`,
  `refundIdempotencyKey`, or `checkoutCreationIdempotencyKey`
  (`tests/checkout-fulfillment/guest-status-minimization.test.ts`).
- `INTERNAL_PROTOTYPE` is structurally proven to have no deployed HTTP route at all, and no route
  file imports `authorizeReportGeneration`
  (`tests/checkout-fulfillment/internal-prototype-route-surface.test.ts`).
- The `orders_screening_request_id_pending_unique`/`orders_screening_request_id_paid_unique`
  partial unique indexes enforce BR-U2B-1's concurrency/duplicate-payment invariants at the
  database level, verified live (against a real Neon connection, once provisioned) via a genuine
  `Promise.all` concurrent-race test in `repository.integration.test.ts`, not merely asserted.

## Tests That Could Not Be Executed, and Why
| Suite | Reason | What activates it |
|---|---|---|
| `tests/order-payment/repository.integration.test.ts` | No `DATABASE_URL` provisioned in this session. | Set `DATABASE_URL`, run `npm run db:migrate` then `npm run test:integration`. |
| `tests/order-payment/stripe-live.integration.test.ts` | No `STRIPE_SECRET_KEY` provisioned. | Set a Stripe **test-mode** `STRIPE_SECRET_KEY`, run `npm run test:integration`. |
| `tests/report-pdf-rendering/render.integration.test.ts` | This sandbox is macOS; `@sparticuz/chromium` ships Linux-only binaries — a genuine platform gate, not a credential gap. | Runs automatically on Linux CI (`ci.yml`, `integration.yml`) with no extra setup. |
| A real deployed Vercel Workflow run (durable suspend/resume across a real crash/deploy, real Cron-triggered reconciliation, real Stripe webhook delivery) | No Vercel deployment exists in this sandbox. | Deploy to Vercel, provision `STRIPE_WEBHOOK_SECRET`/`CRON_SECRET`, and observe a real end-to-end purchase → generation → delivery cycle. |

All DB/credential/platform-gated suites are written to **skip cleanly** rather than fail when their
requirement is absent.

## Deliberately Not Updated in This Pass
The Playwright browser-smoke suite (`e2e/smoke.spec.ts`) still exercises Unit 2's original
`/configure` → internal-authorize flow's DB-dependent block, not Unit 2B's new
`/configure` → `POST /api/checkout` → Stripe redirect flow. It still correctly skips without
`DATABASE_URL` either way, so this is a coverage gap, not a false-positive risk — flagged here
rather than silently left unmentioned. Extending it to the real Checkout flow needs a Stripe
test-mode key in addition to `DATABASE_URL`, and is deferred to a future pass rather than expanded
speculatively in this one.

## Remaining External Dependencies
- **Neon PostgreSQL credentials**: needed for `repository.integration.test.ts`'s DB round-trips,
  including the real concurrent-race and duplicate-payment-index tests.
- **A Stripe test-mode API key**: needed for `stripe-live.integration.test.ts` and to extend the
  browser-smoke suite to the real Checkout flow.
- **A Resend API key**: not yet exercised by any integration test in this sandbox — guest-delivery
  email sending has deterministic coverage (via the fake Resend client) but no live-Resend
  integration test was written this pass.
- **A real Vercel deployment**: the single biggest remaining unverified risk for this unit — proves
  nothing this sandbox's build-time manifest inspection couldn't already prove about workflow
  *registration*, but says nothing about a real deployed *run*'s behavior (durability across a real
  crash/redeploy, real Cron dispatch, real Stripe webhook delivery, real
  `puppeteer-core`/`@sparticuz/chromium` PDF rendering inside an actual Vercel Function).

---

# Platform Maintenance — Next.js 15 → 16 Upgrade — 2026-08-25

Not a unit stage — a bounded, founder-directed platform-maintenance amendment performed between
Unit 3's NFR Design and Infrastructure Design, since Next.js 15 became Maintenance LTS (support
ending 2026-10-21) while the project is still pre-launch. Full detail in `aidlc-docs/audit.md`'s
framework-version-correction entry; summarized here since it changes the "Build Tool" facts stated
above for Unit 2/Unit 2B (accurate as historical records of what was true when each of those units
actually built — not rewritten) and for all Construction work from this point forward.

- **Versions**: `next` 15.5.23 → **16.3.3** (Active LTS); `react`/`react-dom` 18.3.1 → **19.2.8**
  (required by Next.js 16's App Router, which runs on a React 19 canary line); `@types/react` →
  19.2.18; `@types/react-dom` → 19.2.5. No other dependency required a version change — checked
  every installed package's `peerDependencies` against React 19 before upgrading (`@react-email/render`,
  `styled-jsx`, `swr`, `use-sync-external-store` all already declared `^19.0.0` support; none
  conflicted).
- **Bundler**: `next.config.mjs`'s existing custom `webpack()` function (the `.js`→`.ts`/`.tsx`
  `resolve.extensionAlias` remap this codebase's internal `.js`-suffixed import specifiers need,
  per `tsconfig.json`'s `"moduleResolution": "Bundler"`) has no Turbopack-config equivalent —
  Turbopack's `resolveAlias`/`resolveExtensions` options were checked directly against the official
  Turbopack config reference and neither supports remapping a written `.js` specifier to an
  on-disk `.ts` file the way webpack's `extensionAlias` does. Since Next.js 16 defaults `next dev`
  and `next build` to Turbopack, a first `next build` attempt under Turbopack failed with 56
  "Module not found" errors across every route importing from `src/`. Rather than mass-renaming
  hundreds of internal import specifiers project-wide (out of scope for a framework version
  upgrade), `dev`/`build` npm scripts now pass `--webpack` explicitly, keeping the exact
  already-working bundler behavior. This also means the "custom webpack config → Turbopack build
  fails to prevent misconfiguration" guard the upgrade guide describes never applies here, since
  Webpack is now explicitly selected rather than left to Turbopack's default.
- **`proxy.ts` vs `middleware.ts`**: Unit 3's admin auth/CSRF gate had not yet been code-generated,
  so this was a design-document correction only (see Unit 3 NFR Design's `nfr-design-patterns.md`
  Pattern 1) — no code needed renaming. Confirmed via the official upgrade guide that Next.js 16's
  `proxy` runtime is fixed to Node.js and cannot be configured (the `edge` runtime is not supported
  in `proxy` at all), so Pattern 2's `node:crypto`-based constant-time comparison needs no
  runtime-compatibility fallback.
- **Verification performed** (all in this sandbox, no live deployment available): `npm run
  typecheck` — clean. `npm test` — 153/153 passing (27 files), unchanged from before the upgrade.
  `npm run test:integration` — 16/16 executable tests passing, 42 correctly self-skipped for
  missing credentials (`DATABASE_URL`/`ANTHROPIC_API_KEY`/Stripe test key — the same pre-existing,
  honestly-open gap as every prior unit, not introduced or worsened by this upgrade). `npm run
  build` — succeeds under `--webpack`; every route from Unit 2B's own route list compiles (all API
  routes, `/checkout/status`, `/configure`, `/report`, `/healthz`, plus the Workflow SDK's 2
  internal `.well-known/workflow/*` routes), `✓ Compiled workflows in ...ms (21 steps, 2 workflows)`
  unchanged from
  pre-upgrade, no deprecation warnings in build output, `/report` and `/checkout/status` remain
  static (`○`) exactly as Unit 2B's NFR Design Pattern 8 requires for their `Referrer-Policy:
  no-referrer` headers to apply. Next's own build tooling made one automatic, mandatory
  `tsconfig.json` adjustment (`"jsx": "preserve"` → `"jsx": "react-jsx"`, plus adding
  `.next/dev/types/**/*.ts` to `include`) — Next-managed, not a manual/speculative change, and
  `npm run typecheck` was re-run afterward to confirm it still passes.
- **Not run**: `npm run test:e2e` (Playwright) — not in the founder's minimum verification list for
  this amendment, and (per Unit 2B's own build-and-test record above) already correctly self-skips
  without `DATABASE_URL` regardless of Next.js version. A real Vercel deployment/build remains
  unverified in this sandbox, unchanged from every prior unit's same honestly-open gap (see
  "Remaining External Dependencies" above and `aidlc-docs/operations/external-verification-tracker.md`).
- **No architectural/product behavior changed**: no route, business rule, workflow, schema, or API
  contract was touched. Unit 2B was not reopened — its own Build & Test record above remains an
  accurate historical snapshot of what was true on 2026-08-25 before this same-day amendment.

---

# Unit 3 (Minimum Paid-Product Operations) — 2026-08-25

ADM-1 through ADM-8: a minimal internal Admin/Support Service — order lookup and admin-initiated
refund, regulatory rule disable/re-enable, data-source health override, read-only failed-job
inspection. Built on the Next.js 16 baseline from the Platform Maintenance amendment above. Full
narrative detail (every correction round's exact reasoning) lives in `aidlc-docs/audit.md` and
`aidlc-docs/construction/unit-3-minimum-paid-product-operations/code/README.md` — this section is
the Build & Test record, not a restatement of that narrative.

## Build Status
- **Build Tool**: TypeScript 5.9 + Next.js 16 (`next build --webpack`) + the Workflow SDK's
  unchanged build-time compilation step.
- **Build Status**: ✅ **Success.** All Unit 2B routes compile unchanged; 12 new `app/api/admin/*`
  routes and 6 new `app/admin/*` pages added; `ƒ Proxy (Middleware)` present (this project's first
  `proxy.ts`). `.next/diagnostics/workflows-manifest.json` directly inspected — still registers
  exactly `src/workflows/refund-workflow.ts`/`src/workflows/report-generation-workflow.ts`,
  confirming the new admin refund route's `start(processRefundWorkflow, ...)` call site did not
  disturb workflow discovery.
- **Build Artifacts**: `.next/` (gitignored, not committed). Two new purely-additive migrations
  generated, neither applied to a live database in this sandbox: `0003_heavy_wallow.sql`
  (`admin_action_log` + `data_source_health` tables, 3 new enums) and `0004_curly_zuras.sql`
  (`regulatory_rules.approval_record`, a single nullable column).

## Test Execution Summary
- **Deterministic**: **212/212 passing**, 38 files (59 new tests across 11 new files/expansions
  since Unit 2B's 153/27 baseline — see `unit-test-instructions.md`'s Unit 3 section for the full
  invariant-to-test-file mapping).
- **Live integration**: 16/16 executable passing (unchanged live sources); 4 new `DATABASE_URL`-
  gated files added (`data-source-registry`, `admin-action-log`, `regulatory-rule-governance/
  repository`, `order-payment/admin-search`), all correctly self-skip — not executed in this
  sandbox, no `DATABASE_URL` provisioned in any session of this project.
- **Browser smoke suite**: 2/2 executable passing, 2/2 correctly skip — unchanged from Unit 2B,
  confirming `proxy.ts`'s matcher does not intercept `/`, `/configure`, or `/healthz`.

## Three Correction Rounds (post-Code-Generation review, all 2026-08-25)

1. **Code Generation Part 1 plan review** (before any code was written): (a) wired the previously
   design-only `recordIngestionResult` contract into the 2 already-implemented King County
   retrieval paths rather than leaving `observedHealthState` permanently `UNKNOWN`; (b) made
   `AdminActionLog.reason` `NOT NULL` with a DB-level `CHECK` constraint, and split the admin
   refund route's machine-readable `refundReason` from the operator's free-text `justification`;
   (c) made rule-lifecycle transitions (ADM-7) concurrency-safe via a conditional
   `UPDATE ... WHERE lifecycle_state = <expected>` rather than a read-then-unconditional-write.
2. **Full-repository review** (of the generated code, via the new `npm run package:context`
   archive): (a) ADM-5 rewritten to a body-based `POST /api/admin/orders/search`, removing
   `customerEmail` from any URL, plus a response-minimization `AdminOrderView` DTO excluding
   `checkoutCreationIdempotencyKey`/`refundIdempotencyKey`/`stripeCheckoutSessionId`; (b) ADM-1
   made report-ID-native; (c) ADM-4 completed with `retryAttempts`/timestamps/Order correlation;
   (d) ADM-2 completed (citation/verification/version-chain UI) and a genuine pre-existing
   auditability gap closed — `RegulatoryRule.approvalRecord` now durably records who approved a
   rule and when, never inferred from other fields; (e) ADM-3 given static known-source expected-
   cadence metadata, no new infrastructure. Plus 2 documentation-accuracy corrections (a "zero
   Unit 2B files touched" claim and a wrong test-count claim, both corrected in `aidlc-state.md`
   and the code README).
3. **Final review**: ADM-6's admin refund action had regressed Unit 2B's own deliberately-designed
   `REFUND_PENDING` resumability (gating the refund command on `order.state === "PAID"` only). Now
   uses the existing, unmodified `decideRefundAction(order.state)` as the sole branching authority
   — `PAID` allows a new refund command, `REFUND_PENDING` resumes the same logical refund using its
   existing persisted reason/idempotency key (never a client-substituted reason), every other state
   is rejected before any `AdminActionLog` write or workflow start.

No defect in any of these three rounds required touching Unit 2B's payment/refund correctness
machinery, workflows, or database transaction helper — every fix was additive or a targeted change
strictly within Unit 3's own new code.

## Tier-2 Shed Rule Status
Unchanged — remains honestly at **DRAFTED → TRIAGED (Tier 2)**, re-verified. Unit 3 introduces
`disable()`/`reenable()` as new lifecycle transitions available to this (and every) rule, but does
not itself advance any rule's lifecycle state.

## Security / Provenance Checks
- Constant-time Basic Auth credential comparison (SHA-256 digest before `timingSafeEqual`) and
  uniform failure response verified deterministically — malformed header, wrong username, wrong
  password, and both-wrong all produce the identical `401` shape.
- Same-origin CSRF validation verified deterministically, including the exact
  `evil-example.com`/`example.com` non-match case from NFR Requirements, `Sec-Fetch-Site`
  defense-in-depth, and the Development-only `localhost` carve-out never applying outside
  Development.
- `ADMIN_OPERATOR_ID` fail-closed independent of Basic Auth succeeding, verified deterministically.
- Admin order responses never carry `checkoutCreationIdempotencyKey`, `refundIdempotencyKey`, or
  `stripeCheckoutSessionId` — verified both by direct DTO-exclusion assertions and a belt-and-
  suspenders serialized-value-never-leaks-under-any-key-name check.
- `customerEmail` never appears in a request path/query string — verified structurally (the search
  route is POST/body-based only; the admin search page's source never constructs a URL containing
  the searched value).
- The 4 atomic local admin mutations (rule disable/re-enable, data-source override set/clear) and
  the `REFUND_INITIATED` audit-before-`start()` sequencing are exercised by fault-injected
  integration tests (written, not executed in this sandbox — no `DATABASE_URL`).
- No raw access token or token hash is ever sent to the admin browser — `report-access/
  repository.ts`'s `listAccessCredentialSummaries` deliberately selects only operational metadata.

## Tests That Could Not Be Executed, and Why
Every `DATABASE_URL`-gated test (Unit 3 adds 4 new files) — no live Neon credential in this
sandbox, same gap as every prior unit. Live Basic Auth/CSRF behavior against a real deployed origin
— no real Vercel deployment in this sandbox; covered only by deterministic direct-function-call
tests here, not a real HTTP round-trip. Both are new items on
`aidlc-docs/operations/external-verification-tracker.md`.

## Remaining External Dependencies
- **Neon PostgreSQL credentials**: needed for all 4 new Unit 3 integration test files, plus every
  existing DB-dependent suite.
- **A real Vercel deployment**: needed to prove Basic Auth/CSRF behave correctly against the
  actual resolved `VERCEL_URL`/`APP_BASE_URL` origin, and that `proxy.ts`'s matcher behaves as
  designed in a real deployed environment (this sandbox's build output and deterministic tests
  prove the matcher's *configuration*, not its live-deployment behavior).
- No new external service credential is required by Unit 3 beyond what Units 1/2/2B already
  needed — Unit 3 introduces no new third-party integration.

# Unit 4 (Detached Garages) — 2026-08-27

`ProjectType.GARAGE` alongside shed: real project-type generalization, a net-new `LOT_COVERAGE`
evaluator, reused (unmodified-logic) setback/height evaluators, a real garage `/configure` UI, and
the Garage Screening Coverage Readiness gate (BR-U4-9) governing both public advertisement and
checkout. Full narrative detail (four Functional Design correction rounds, the Code Generation
plan and its own correction) lives in `aidlc-docs/audit.md` and
`aidlc-docs/construction/plans/unit-4-detached-garages-code-generation-plan.md` — this section is
the Build & Test record, not a restatement of that narrative.

## Build Status
- **Build Tool**: TypeScript 5.9 + Next.js 16 (`next build --webpack`), unchanged from Unit 3.
- **Build Status**: ✅ **Success.** All Unit 3 routes compile unchanged; 1 new route
  (`app/api/screening-requests/available-project-types`) added. No new `app/admin/*` pages, no new
  Workflow, no new migration — `screeningRequests.projectType`/`projectDetails` and
  `regulatoryRules.applicableProjectType` were already plain `text`/`jsonb` columns, confirmed via
  a real read-only codebase audit before Code Generation began; `"garage"` needed zero schema
  change. `.next/diagnostics/workflows-manifest.json` unaffected — still registers exactly the same
  2 workflows as Unit 3, confirming Unit 4 introduced no new asynchronous/durable execution
  requirement (one of the founder's own explicit reopen-trigger checks, not hit).
- **Build Artifacts**: `.next/` (gitignored, not committed). No new migration file.

## Test Execution Summary
- **Deterministic**: **240/240 passing**, 42 files (28 net-new/changed since Unit 3's 212/38
  baseline — 26 new tests across 6 new files, plus mechanical `projectType: "shed"` fixture
  updates to 4 pre-existing shed test files, the expected, planned consequence of `ProjectDetails`
  becoming a real discriminated union). See `unit-test-instructions.md`'s Unit 4 section for the
  full file-by-file mapping.
- **Live integration**: unchanged from Unit 3 — no new `DATABASE_URL`-gated file was needed (the
  new `computeParcelAreaSqFt` PostGIS function is covered by 2 new deterministic SRID-guard tests
  in the existing `postgis-adapter.test.ts`, matching the exact pattern already used for
  `computeSetbackDistances`/`transformPolygonToWgs84` — no live-DB round-trip test was written for
  it in this pass, a real gap named explicitly below, not silently absent).
- **Browser smoke suite**: unchanged executable/skip counts from Unit 3. **The real garage
  full-path browser scenario (configure → place → summary → the honest checkout-rejection message)
  was not added** — explicitly accepted as a Code Generation-stage gap by founder review
  (2026-08-26), carried into this Build & Test pass's own scope for a decision (see "Tests That
  Could Not Be Executed" below) rather than silently dropped or fabricated.

## Two Correction Rounds (post-Code-Generation review, both 2026-08-26/27)

1. **Functional Design correction rounds (four, before any code was written)** — summarized here
   only; full reasoning in `aidlc-docs/audit.md`: (a) a founder sequencing correction deferring all
   professional regulatory review to a post-POC "Regulatory Professional Review /
   Commercialization Gate" project-level milestone, decoupling "Unit 4 Construction Complete" from
   "Garage Commercial Regulatory Readiness"; (b) a regulatory-completeness pass expanding the
   candidate inventory from 5 to 13 (H1/H2 height, S1-S5 setback, L1-L6 lot coverage), correcting a
   flat-50%-lot-coverage oversimplification and adding the roof-height-bonus conflict (H1) and the
   street-setback exception (S2); (c) a final targeted correction separating regulatory Tier from
   per-parcel evidence availability (reclassifying S1 and L6 from Tier 2 to Tier 1) and replacing
   two overloaded-`undefined` fields (`applicableCoveragePercentage`, `minimumCoverageFloor`) with
   discriminated result types.
2. **Code Generation correction (2026-08-27)**: the Part-2 implementation had reconciled "real
   garage UI" with "no public garage purchase" by enforcing `checkGarageCheckoutEligibility` at
   checkout only, while always offering both project types in the public `/configure` TYPE step —
   narrower than BR-U4-9's actual two-part invariant (gates both public advertisement *and*
   checkout). Corrected with one new minimal route
   (`GET /api/screening-requests/available-project-types`) and a client-side fetch in
   `app/configure/page.tsx`, without touching any of the substantial garage implementation already
   built. Re-verified: `npm run typecheck` clean, `npm test` 240/240 still passing, `npm run build`
   succeeds with the one new route.

No defect in either round required touching Unit 1/2/2B/3's own shed evaluation, payment,
fulfillment, or admin correctness machinery — every fix was additive or a targeted change strictly
within Unit 4's own new code. All pre-Unit-4 tests pass byte-for-byte unchanged.

## Tier-2 Shed Rule Status
Unchanged — remains honestly at **DRAFTED → TRIAGED (Tier 2)**, re-verified. Unit 4 introduces its
own real, non-`ACTIVE` garage candidate (`tests/fixtures/garage-candidate.ts`'s L1, Tier 1 on
governance grounds but still blocked from `KNOWN`-quality usability by BR-U4-3/BR-U4-7's evidence
gates, held honestly at `TRIAGED`) — the same "real candidate content, never fabricated further
along the governance lifecycle than actually justified" discipline this project has held since
Unit 1.

## Security / Provenance Checks
- `existingStructuresFootprintSqFt`/`stackedDwellingUnits` never coerce a skipped/blank field to a
  concrete value — verified deterministically at both the Boundary Validator layer
  (`garage-validation.test.ts`) and the domain-evaluation layer (`garage-evaluate.test.ts`'s
  explicit `undefined`-vs-`false`-vs-`true` resolution tests).
- The garage lot-coverage numerator (existing-structures figure) is USER_SUPPLIED and unverified by
  construction — verified that `evaluateLotCoverage` produces `REQUIRES_VERIFICATION` even when
  every other input (denominator, percentage, floor) is fully resolved, never silently upgrading to
  `KNOWN` regardless of how plausible the combined figure looks.
- `DWELLING_SEPARATION`/`LOT_COVERAGE` both fail closed to `REQUIRES_VERIFICATION` (never a thrown
  error, never a silently-wrong `KNOWN` result) when dispatched against the wrong project type —
  verified directly.
- No client-asserted parcel-derived number is trusted — `GarageProjectDetails`/
  `GarageProjectConfiguration` deliberately carry no `proposedFootprintSqFt`/`lotAreaSqFt` fields;
  `LotCoverageFacts` is assembled server-side only, confirmed by reading the actual
  `pipeline.ts`/`evaluate.ts` call sites (no test asserts a negative here beyond the type system
  itself structurally preventing the field from existing).
- `app/configure/page.tsx` (client component) does not import `screening-request/authorization.js`
  (server-only) — verified by direct inspection of the file's import list after the BR-U4-9
  correction.

## Tests That Could Not Be Executed, and Why
Every `DATABASE_URL`-gated test — no live Neon credential in this sandbox, same gap as every prior
unit (Unit 4 added no new file to this category). **The real garage browser end-to-end scenario**
(configure a garage → place it → reach summary → attempt checkout and see the honest
coverage-readiness rejection) was not written or run — the existing full-path e2e test is itself
gated behind a live `DATABASE_URL` and a live MapLibre/parcel-resolution flow, unavailable in this
sandbox exactly as it has been for every prior unit's own e2e coverage. Per the founder's explicit
instruction (2026-08-26 Code Generation review): this gap is accepted for Code Generation and
carried into Build & Test as a decision point, not fabricated — the 26 new deterministic tests
remain meaningful evidence for the corrected logic itself (percentage resolution, fail-closed
dispatch, the readiness gate's two independent layers), but they do not prove the real browser UI
renders and behaves correctly end-to-end. **New item added to
`aidlc-docs/operations/external-verification-tracker.md`** rather than silently left untracked;
whether to write the Playwright scenario now or defer it further is the founder's call, not decided
unilaterally here.

## Remaining External Dependencies
Identical to Unit 3's own list (Neon PostgreSQL credentials; a real Vercel deployment) — Unit 4
introduces no new external service credential requirement of any kind, per the founder's own
explicit, repeated instruction across every Functional Design and Code Generation review round.

---

# Unit 5 (Vacant Land) — 2026-08-27

Unit 5 is this project's first second-*workflow* implementation (`WorkflowType.VACANT_LAND`
alongside `EXISTING_PROPERTY`), not a third project type: a real `workflowType`-discriminated
`ScreeningRequest`/`ScreeningRequestSnapshot` union, a generalized
`RegulatoryRuleApplicabilityScope` replacing `applicableProjectType` as the sole governance
discriminant, a genuinely separate `evaluateVacantLand` evaluator (never routed through
`evaluateProject`), real PostGIS buildable-envelope geometry (per-edge differential setback
subtraction, ECA intersection, holes/multi-part preservation), a bounded 4-scenario family
(`GENERAL_DENSITY`/`SMALL_LOT_BONUS`/`TRANSIT_BONUS`/`STACKED_MULTI_UNIT`), and a fully separate
customer journey (`/vacant-land`, fail-closed while `isVacantLandScreeningCoverageReady()` is
`false`). Full narrative detail (two Functional Design correction rounds, one NFR Requirements
correction, one NFR Design correction, two Code Generation correction rounds — the second, six
material implementation corrections) lives in `aidlc-docs/audit.md` and
`aidlc-docs/construction/plans/unit-5-vacant-land-code-generation-plan.md` — this section is the
Build & Test record, not a restatement of that narrative.

## Build Status
- **Build Tool**: TypeScript 5.9 + Next.js 16 (`next build --webpack`), unchanged from Unit 4.
- **Build Status**: ✅ **Success.** All Unit 4 routes compile unchanged; 2 new routes
  (`/vacant-land`, `/api/screening-requests/available-vacant-land-coverage`) added. No new Vercel
  Workflow.
- **Build Artifacts**: `.next/` (gitignored). Two new Drizzle migration files in the normal chain
  (`0005_expand_vacant_land_workflow.sql` — nullable-column EXPAND phase only) plus one deliberately
  **out-of-chain** manual migration (`src/db/manual-migrations/pre-activation-enforcement-vacant-
  land.sql`, applied only by the new `npm run db:enforce-vacant-land` script — never by `npm run
  db:migrate`, a real, tested separation, not merely documented).

## Test Execution Summary
- **Deterministic**: **312/312 passing**, 50 files (72 net-new since Unit 4's 240/42 baseline,
  across 8 new test files):
  - `tests/regulatory-rule-governance/vacant-land-candidate.test.ts` (12) — all 17 real candidates
    (U1-U17) stay non-`ACTIVE`.
  - `tests/regulatory-rules-engine/vacant-land-evaluate.test.ts` (18) — the bounded 4-scenario
    family, the 3-state `ScenarioFigure` distinction, U17's governed rounding, the density-divisor
    fail-closed default, cross-workflow rule-scope isolation.
  - `tests/screening-request/vacant-land-coverage-readiness.test.ts` (7),
    `vacant-land-validation.test.ts` (5) — both readiness gates, `checkReadiness`'s workflow-first
    branching, the persistence-write gate's deterministic `PERSISTENCE_WRITE_DISABLED` path.
  - `tests/screening-request/hydrate.test.ts` (13) — the real boundary hydrator: valid shapes,
    cross-workflow-pollution rejection, unrecognized-`workflowType` rejection, required-field
    validation.
  - `tests/spatial-analysis/vacant-land-postgis-adapter.test.ts` (3),
    `vacant-land-geometry-conversion.test.ts` (9) — deterministic short-circuit paths (no-`ACTIVE`
    setback rule, `INSUFFICIENT` lot-line roles, undefined ECA geometry) and the pure
    GeoJSON↔`Geometry`/WKT conversion functions (empty geometry, holes, multi-part results),
    exercised without a live database.
  - `tests/db/vacant-land-migration-staging.test.ts` (5) — proves the enforcement migration is
    genuinely outside `db:migrate`'s own journal/file chain.
- **Live integration**: no new `DATABASE_URL`-gated file was added for the new PostGIS geometry
  functions in this pass — a real, disclosed gap (`external-verification-tracker.md` item 15), not
  silently absent; the deterministic short-circuit/conversion tests above remain meaningful
  evidence for the corrected logic itself.
- **Browser smoke suite**: unchanged from Unit 4. No vacant-land browser scenario, and no
  component-level test for `/vacant-land`'s fail-closed rendering (no React testing-library
  infrastructure exists in this project) — `external-verification-tracker.md` item 16.

## Two Code Generation Correction Rounds (both 2026-08-27)
1. **Part 1 plan corrections (two, before code was written)**: (a) `RegulatoryRule.
   applicableProjectType` made nullable rather than left `NOT NULL`, so a `VACANT_LAND` rule row
   is never forced to carry a bogus shed/garage value; (b) a new
   `isVacantLandPersistenceWriteEnabled()` gate added, kept structurally separate from
   `isVacantLandScreeningCoverageReady()`'s own commercial-readiness decision.
2. **Part 2 generation correction (six material corrections, post-review of the full generated
   code)**: (1) all 17 real candidates written as non-`ACTIVE` fixtures (previously only U1); U17's
   rounding threshold and U9's setback numbers made genuinely governed (previously hardcoded); (2)
   `ScenarioFigure`/setback results redesigned as real three-state unions
   (`KNOWN`/`NO_ACTIVE_COVERAGE`/`REQUIRES_VERIFICATION`) so no-`ACTIVE`-coverage never produces a
   diligence-risk Finding; (3) the single-scenario draft replaced with the bounded 4-scenario
   family VL-4 requires; (4) a real `hydrate.ts` validation module replaced every unsafe `as` cast
   on a persisted row/snapshot, and the PRE-ACTIVATION ENFORCEMENT migration moved into a genuinely
   separate, explicit command; (5) the buildable-envelope PostGIS contract corrected (no `?? 0`
   parcel-area fallback, real per-edge differential setback subtraction replacing a uniform-max
   buffer misrepresentation, footnote-exception gating, holes/empty-geometry handling fixed,
   `ST_IsValid` extended to supplied ECA geometry); (6) the public `/vacant-land` route made
   genuinely fail-closed while coverage readiness is `false`. Re-verified after every single
   correction: `npm run typecheck` clean, `npm test` 312/312, `npm run build` succeeds.

No defect in either round required touching Unit 1/2/2B/3/4's own shed/garage evaluation, payment,
fulfillment, or admin correctness machinery — every fix was additive or a targeted change strictly
within Unit 5's own new code. All 240 pre-Unit-5 tests pass byte-for-byte unchanged throughout both
correction rounds.

## Tier-2 Vacant-Land Rule Status
3 of 17 real candidates (U6 — low-income-housing density bonus, discretionary regulatory-agreement
mechanism; U8 — height, A.2.d scoping ambiguity; U13 — minimum coverage floor, Director-approval
discretion) remain honestly at **DRAFTED → TRIAGED (Tier 2)**, blocked by the same deferred
post-POC "Regulatory Professional Review / Commercialization Gate" milestone Unit 4 established —
Unit 5's 17 candidates join Unit 4's 13 as one combined future batch, not a separate engagement.
The remaining 14 (Tier 1) still require founder verification and are separately blocked from
`KNOWN`-quality usability by real, disclosed evidence gaps (ECA area-of-overlap measurement,
transit-proximity data, U1's lot-qualification/existence-date facts, `LotLineRoles`' structural
`INSUFFICIENT` default) independent of Tier — the same "real candidate content, never fabricated
further along the governance lifecycle than actually justified" discipline this project has held
since Unit 1.

## Security / Provenance Checks
- Every persisted `ScreeningRequest`/snapshot shape is validated through `hydrate.ts`'s real
  zod-discriminated-union boundary before becoming a domain object consumed by authorization,
  checkout, or report generation — never a TypeScript `as` cast on `jsonb` column data — verified
  by 13 deterministic tests including cross-workflow-pollution and unrecognized-`workflowType`
  rejection.
- `app/api/screening-requests/route.ts` rejects a mixed-workflow HTTP payload (e.g. `VACANT_LAND`
  with a `projectType` field) outright, at the HTTP boundary, before it ever reaches the
  repository layer.
- The database-level `screening_requests_workflow_shape_valid`/
  `regulatory_rules_applicability_scope_valid` `CHECK` constraints are the final, authoritative
  enforcement layer — confirmed to live outside the normal `db:migrate` chain until explicitly
  applied, so no `VACANT_LAND` row can ever be written before that constraint is active
  (`vacant-land-migration-staging.test.ts`).
- `isVacantLandPersistenceWriteEnabled()` and `isVacantLandScreeningCoverageReady()` are two
  independently-hardcoded-`false` gates, verified by identity (not merely by equal current value)
  to be genuinely separate functions/mechanisms — a data-layer capability decision is never
  conflated with a commercial-availability decision.
- `app/vacant-land/page.tsx` renders none of the journey steps (address entry, screening-intent
  selection, request creation, checkout) while coverage readiness is unconfirmed — verified by
  direct source inspection (the entire component returns an early, minimal view); no automated
  component-level test exists for this yet (external-verification-tracker.md item 16).
- No SMC citation number or regulatory threshold (U17's 0.85 rounding fraction, U9's front/rear/
  side setback distances, density rates, height limits, coverage percentages) appears as a literal
  in `evaluate-vacant-land.ts` or `pipeline.ts` — every one is read from an `ACTIVE`
  `RegulatoryRule` row's own `ruleSpecification`, verified by tests asserting `NO_ACTIVE_COVERAGE`
  (not a computed value) whenever the corresponding rule is absent.

## Tests That Could Not Be Executed, and Why
Every `DATABASE_URL`-gated test — no live Neon credential in this sandbox, same gap as every prior
unit. **The real PostGIS `ST_Buffer`/`ST_Difference`/`ST_Intersection`/`ST_IsValid` execution**
underlying the new buildable-envelope functions was not run against a live database — the
deterministic short-circuit paths (which are the actual production default for essentially every
real evaluation today, since `LotLineRoles` has no establishment mechanism in this unit's UI) and
the pure GeoJSON/WKT conversion helpers are tested instead. **No vacant-land browser scenario and
no component-level test** for `/vacant-land`'s fail-closed rendering — the same class of gap this
file's Unit 4 section already names for garage, extended here since this project has no React
component-testing infrastructure at all. Both **new items added to
`aidlc-docs/operations/external-verification-tracker.md`** (15, 16) rather than silently left
untracked or fabricated as passing.

## Remaining External Dependencies
Identical to Unit 4's own list (Neon PostgreSQL credentials; a real Vercel deployment) — Unit 5
introduces no new external service credential requirement of any kind, per the founder's own
explicit, repeated instruction across every Functional Design, NFR, and Code Generation review
round (no ECA/transit-area/Recorder data provider added anywhere in this unit).
