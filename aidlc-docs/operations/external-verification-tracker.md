# External-Verification Tracker

Open, unresolved external-verification items — not blockers to shipping the units that produced
them, but items that must stay visible rather than being silently treated as "verified." Update
this file (check items off, add a date and who ran it) the first time each becomes runnable — do
not mark anything done without actually running it.

## 1. Neon / PostGIS Live Verification

**Status: NOT YET RUN.** No Neon database has been provisioned in any session of this project.

**Blocked on**: an isolated Neon development/test database (never production) and a `DATABASE_URL`
pointed at it.

**When available, run**:
```bash
npm run db:migrate          # applies src/db/migrations/0000_*.sql and 0001_enable_postgis.sql
npm run test:integration    # activates tests/db/schema.integration.test.ts
```

**Checklist** (all live inside `tests/db/schema.integration.test.ts` — check off only once that
file has actually run and passed against a real Neon database):
- [ ] Migrations apply cleanly to the isolated database
- [ ] `PostGIS_Version()` query succeeds (extension enabled)
- [ ] `RegulatoryRule` insert → select → `isTestOnlyFixture` round-trips correctly
- [ ] `InferencePolicy` insert → select round-trips correctly
- [ ] ACTIVE-only retrieval query excludes a TRIAGED row

**A generated migration is not considered empirically verified against Neon until this entire
checklist passes for real**, per the user's explicit instruction (2026-08-22).

## 2. Anthropic Live Verification (RRAG-1 + Unit 2 Report Explanation)

Two structurally distinct integrations share this credential — both are independently NOT YET RUN;
one running does not verify the other.

### 2a. Rule Research Assistant / RRAG-1

**Status: NOT YET RUN.** No `ANTHROPIC_API_KEY` has been provisioned in any session of this
project. The concrete adapter (`src/rule-research-assistant/anthropic-client.ts`) exists and its
deterministic contract/schema tests pass (`tests/rule-research-assistant/research.test.ts`,
`anthropic-client.test.ts` — both using a fake client, no real model call).

**When available, run**:
```bash
npm run test:integration    # activates tests/rule-research-assistant/research.integration.test.ts
```

**Checklist**:
- [ ] Real request/response succeeds against the live Anthropic API
- [ ] Response is accepted by `CandidateRulePackageSchema` (schema-valid real output)
- [ ] A deliberately malformed/unexpected response is manually verified to still fail closed (the
      existing deterministic tests already prove this against a fake client — this step confirms
      it also holds against whatever the real model actually returns, not just a hand-written fixture)
- [ ] No credential appears in any log line or error message during a real run (spot-check console
      output, not just code review)
- [ ] Confirm the real output is consumed only as `CandidateRulePackage` data — never passed to
      any `regulatory-rule-governance/lifecycle.ts` function directly

### 2b. Unit 2 Report Explanation (RGD-5)

**Status: NOT YET RUN.** Same `ANTHROPIC_API_KEY` blocker. The concrete client
(`src/report-explanation/index.ts`'s `explainFindings`, reusing
`rule-research-assistant/anthropic-client.ts`'s adapter as a structurally distinct instance) exists
and the live integration test below is written. **Noted while writing this tracker entry**: unlike
`researchCandidateRule` (which has `tests/rule-research-assistant/research.test.ts` exercising a
fake `AiCompletionClient`), `explainFindings` currently has no equivalent deterministic
fake-client test of its own — a real, small test-coverage gap, flagged here rather than silently
left unstated. Does not block this tracker item's live-verification checklist below, which is
independent of that gap.

**When available, run**:
```bash
npm run test:integration    # activates tests/report-explanation/research.integration.test.ts
```

**Checklist**:
- [ ] Real request/response succeeds against the live Anthropic API for a real findings set
- [ ] Response is accepted by `ExplanationSchema` (schema-valid real output)
- [ ] A deliberately malformed/unexpected response is manually verified to still fail closed to
      `UNAVAILABLE` rather than a fabricated explanation (BR-U2-8's degradation contract)
- [ ] No credential appears in any log line or error message during a real run
- [ ] Confirm the real output cannot alter classification, evidence, or governance state (structural
      guarantee: `report-explanation/index.ts` has no import of `regulatory-rule-governance/lifecycle.ts`
      or the Regulatory Rules Engine's write paths)

**Do not fabricate a successful result for either 2a or 2b if credentials remain unavailable** —
leave items unchecked and both statuses as NOT YET RUN. Running one does not verify the other.

## 3. Unit 2 CRS Transform / Setback Computation Live Verification

**Status: NOT YET RUN.** Same `DATABASE_URL` blocker as item 1. Added during Unit 2 Code
Generation's targeted CRS correction (2026-08-23) — the fail-closed SRID guards are deterministically
tested (`tests/spatial-analysis/postgis-adapter.test.ts`), but the actual `ST_Transform` math has
never run against a real PostGIS instance.

**When available, run**:
```bash
npm run test:integration    # activates tests/spatial-analysis/postgis-adapter.integration.test.ts
```

**Checklist**:
- [ ] A known WGS84 point transforms to the expected projected (EPSG:2926) location, within the
      test's tolerance, cross-checked against King County's own independent reprojection of the
      same real parcel vertex
- [ ] A deliberately lng/lat-swapped pair transforms to a materially different (wrong) location -
      confirms no silent axis-order bug
- [ ] `computeSetbackDistances` produces a real, finite distance for a synthetic boundary +
      real-world anchor, with `footprintProjected.srid` correctly set
- [ ] `transformPolygonToWgs84` round-trips a projected polygon to valid WGS84 coordinates
- [ ] Both `computeSetbackDistances` and `transformPolygonToWgs84` still fail closed on a
      missing/wrong SRID even against a real database connection (not just the deterministic
      no-DB version of this check)
- [ ] **(Unit 4)** `computeParcelAreaSqFt` (`spatial-analysis/postgis-adapter.ts`) produces a real,
      finite `ST_Area` result for a synthetic boundary against a real PostGIS instance, and still
      fails closed on a missing/wrong SRID even against a real database connection - added here
      rather than as a new standalone tracker item, since it is the same underlying blocker (a live
      Neon/PostGIS connection) and the same class of check (`ST_*` function correctness) as the
      items above.

**This item exists specifically because the user directed it be kept explicitly open rather than
fabricated** ("If the actual PostGIS transform cannot be executed without the still-unavailable
database environment, keep that live verification explicitly open for Build & Test rather than
fabricating success").

## 4. Unit 2 Full Browser Smoke Path (Real Map Placement)

**Status: NOT YET RUN.** Same `DATABASE_URL` blocker. `e2e/smoke.spec.ts`'s
`"requires a running app with DATABASE_URL"` describe block is written to exercise the real
MapLibre map-click placement path (not the accessible longitude/latitude fallback inputs) end to
end: configure → place via a real map click → identify lot-line roles → submit → authorize →
(implicitly) generate. 2 of 4 smoke tests already run live in this sandbox (health check,
configure-page load); these 2 do not.

**When available, run**:
```bash
DATABASE_URL=... npx playwright test
```

**Checklist**:
- [ ] The full configure→authorize flow completes via a real map click, not a mocked/manual input
- [ ] An unknown report token resolves to "not found," never a crash or another report's data

## 5. Unit 2 Performance Baseline (`STAGE_TIMING`)

**Status: NOT YET ESTABLISHED.** Same `DATABASE_URL` blocker — no real
`report-generation-orchestrator/pipeline.ts` run has ever occurred, so no `STAGE_TIMING` event has
ever been emitted outside of code review. NFR-U2-2's soft targets (sub-second PostGIS ops,
seconds-to-tens-of-seconds full pipeline, ~60s investigate threshold) are design-time estimates,
not measurements.

**When available**: authorize a real report generation (via a real Stripe test-mode Checkout, or
`npm run generate-prototype-report` for the `INTERNAL_PROTOTYPE` path) against an isolated dev/test
Neon branch, then read the resulting `STAGE_TIMING` log lines for real per-stage durations.
**Corrected 2026-08-25**: "let the poller process it" is stale — `report-generation-orchestrator/
poller.ts` was deleted (explicitly superseded by the 2026-08-24 platform-pivot ADR); generation is
now event-driven via `reportGenerationWorkflow` (VERIFIED_PAYMENT) or run synchronously by the CLI
script (INTERNAL_PROTOTYPE) — see item 9 below for the Workflow-specific verification.

**Checklist**:
- [ ] A real pipeline run completes and emits all 7 expected `STAGE_TIMING` events
- [ ] Recorded actual durations compared against NFR-U2-2's soft targets — targets revised in
      `nfr-requirements.md` if evidence warrants, per that document's own instruction
- [ ] No performance figure is stated anywhere as fact until this run has actually happened

**Do not invent or estimate a performance measurement before this run exists** — per the user's
explicit instruction (2026-08-23).

## 6. Client-IP / Rate-Limit Source-Key Behavior (platform target changed: Railway → Vercel)

**Status: NOT YET VERIFIED — target platform changed 2026-08-24.** This item was originally
written against Railway's edge/proxy behavior; the founder's deployment-platform pivot
(`aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`) makes Vercel the
canonical platform instead. The checklist below is retained and still applies in spirit — the
underlying question ("which header/value represents the real client, and can it be spoofed") is
platform-independent — but every mention of Railway below should be read as "whichever platform is
actually deployed to," and re-verified against **Vercel's** actual header behavior specifically
(Vercel is documented to set `x-forwarded-for` and its own `x-vercel-*` headers — the exact,
current, trustworthy header/format must still be confirmed against a real deployment, not assumed
from this note). `app/api/reports/[token]/route.ts`'s `sourceKeyFor` (and the
identical logic in the PDF route) currently derives the failed-lookup rate limiter's source key
from `request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()` — an assumption about how
Railway's edge/proxy populates that header, made at Code Generation time and **never tested
against the actual deployed platform**. This is defense-in-depth (NFR-U2-4/Infrastructure Design
Q3) — it does not block Unit 2 completion — but the assumption must not silently become
"verified" just because it typechecks and passes deterministic tests against a fabricated header
value.

**Blocked on**: an actual Railway deployment reachable by real distinct clients.

**When available, verify**:
- [ ] Which header/value Railway's edge actually populates to represent the real connecting
      client (confirm `x-forwarded-for` is the right header at all, and its exact format)
- [ ] The exact parsing rule `sourceKeyFor` should use, given that real format (the current
      "first comma-separated value" assumption may or may not match Railway's actual behavior)
- [ ] A client cannot arbitrarily choose its own rate-limit source key (e.g. by setting its own
      `X-Forwarded-For` header and having Railway pass it through unmodified/prepended instead of
      appended — this would let an attacker evade the limiter entirely by rotating a claimed
      value)
- [ ] Multi-hop / header-list behavior is handled correctly (more than one proxy hop between the
      real client and this app)
- [ ] Normal users from genuinely distinct real clients produce distinct source keys where
      expected (the limiter doesn't accidentally collapse everyone onto one shared key, e.g. if
      Railway's internal load-balancer address were used instead of the client's)

**Update `sourceKeyFor` in both routes if the empirical result differs from the current
implementation** — this is expected to require at least a documentation update and possibly a
code change, not merely a passive check.

## 7. Stripe CLI End-to-End Webhook Smoke (Unit 2B)

**Status: NOT YET RUN.** No `STRIPE_SECRET_KEY`/Stripe CLI session has been used in any session of
this project. **Corrected 2026-08-25**: the deterministic webhook/signature/state-machine tests
(`tests/order-payment/webhook-signature.test.ts`, `refund-decision.test.ts`) are written AND
verified passing in this sandbox (no credential needed — see Build & Test). The automated live
Stripe test-mode integration test (`tests/order-payment/stripe-live.integration.test.ts` — Checkout
Session creation/retrieval, `STRIPE_SECRET_KEY`-activated) is written and typecheck-clean but has
**not** been executed or verified passing in any session — it was previously, inaccurately,
described here as already passing; that was wrong, since no `STRIPE_SECRET_KEY` has ever been
provisioned in this project. This item (7) is specifically the full, real, Stripe-CLI-forwarded
end-to-end path, distinct from and broader than that automated test, per the founder's explicit
instruction
(`aidlc-docs/construction/unit-2b-commercial-payment-fulfillment/nfr-requirements/nfr-requirements.md`
NFR-U2B-6). Running the automated `stripe-live.integration.test.ts` suite is a prerequisite sanity
check before attempting this item's fuller CLI-forwarded checklist, not a substitute for it.

**When available, run**:
```bash
stripe listen --forward-to <local-or-deployed-app>/api/webhooks/stripe
```
then complete a real Stripe-hosted test Checkout using a Stripe test card.

**Checklist**:
- [ ] A real test-mode Checkout payment succeeds via Stripe's own hosted page
- [ ] Stripe sends a real signed webhook event, forwarded by the Stripe CLI
- [ ] This application's raw-body signature verification accepts it
- [ ] `Order` transitions `PENDING -> PAID`
- [ ] `GenerationAuthorization { type: VERIFIED_PAYMENT }` is constructed
- [ ] `ReportGenerationJob` is created (QUEUED) and `reportGenerationWorkflow` starts durably
      (platform target changed 2026-08-24: Vercel Workflows, not the Railway in-process poller —
      see `aidlc-docs/decisions/2026-08-24-deployment-platform-pivot-railway-to-vercel.md`)
- [ ] `ProcessedStripeEvent` is recorded
- [ ] A duplicate/replayed delivery of the same event is a verified no-op

**Do not fabricate a successful result** if Stripe CLI/credentials remain unavailable — leave
unchecked and status NOT YET RUN, consistent with every other item on this tracker.

## 8. MapTiler Pre-Commercial-Launch Licensing Review (Unit 2B)

**Status: NOT YET DONE.** MapTiler's Free tier (established Unit 2) is explicitly a
prototype/non-commercial-testing choice, not an approved commercial-production licensing decision
(`shared-infrastructure.md`). Unit 2B is the unit that makes real paid public usage possible — per
the founder's explicit confirmation (NFR/Infrastructure Design review), this checkpoint applies
now, as a pre-commercial-launch item, independent of "Commercial GO" no longer gating Construction.

**When ready to enable live Stripe charging for real customers**: review MapTiler's then-current
commercial plan and either upgrade to an appropriate paid tier or deliberately replace the basemap
provider — before, not after, live-mode Stripe credentials are enabled.

**Checklist**:
- [ ] MapTiler's current commercial terms reviewed against actual/projected traffic
- [ ] Either upgraded to a commercially-appropriate MapTiler plan, or a replacement provider chosen
- [ ] Confirmed before (not after) `STRIPE_SECRET_KEY` is switched to a live-mode key in production

## 9. Vercel Workflow Execution — Real Deployment Proof (Unit 2B, added by the platform pivot)

**Status: NOT YET RUN.** No real Vercel deployment has run in any session of this project. The
2026-08-24 deployment-platform pivot's architecture (durable `reportGenerationWorkflow`/
`processRefundWorkflow`, deterministic hook-token idempotent starts, the Cron reconciliation
backstop) is verified against **current Vercel documentation** (see the ADR's Sources), not against
a real running deployment — those are two different kinds of confidence, and this tracker exists
specifically so the difference isn't blurred.

**When a real Vercel deployment is available, verify**:
- [ ] A `reportGenerationWorkflow` run actually starts, executes every step in order, and reaches
      `ReportGenerationJob.state = COMPLETE` against a real parcel/project
- [ ] A deliberately-induced step failure (e.g. a temporarily-broken external call) triggers the
      step's built-in retry behavior as documented, not a silent skip
- [ ] A workflow run genuinely survives a redeploy mid-run (deploy a new version while a run is
      in-flight; confirm Skew Protection keeps it on its original version and it still completes)
- [ ] Two concurrent/duplicate `start()` calls for the same `job:${jobId}` — confirm the
      **database claim** (`claimQueuedJob`'s atomic `QUEUED -> IN_PROGRESS` update), not the hook
      token, is what results in only one run ever executing the pipeline; it is acceptable (and
      expected) for more than one workflow run to be created — only one may claim and complete the
      job. Do not treat `hook.getConflict()` as the correctness mechanism being verified here — see
      the 2026-08-24 Workflow-Start Idempotency correction in the ADR.
- [ ] `processRefundWorkflow` genuinely resumes at the correct step after a simulated crash between
      its two steps (as close a real-world approximation of this as the deployment allows), and a
      duplicate refund-workflow start results in only one Stripe call, verified via the conditional
      `PAID -> REFUND_PENDING` claim, not the hook token
- [ ] The Cron reconciliation route actually fires on its configured schedule and its re-`start()`
      calls behave as designed (safe no-ops via the database claim, not workflow-run detection)
      against genuinely stuck/orphaned rows
- [ ] Vercel Workflow Events/Data-Written usage for a realistic report-generation run is observed
      and compared against this project's actual **Pro-plan** included allowance (not the
      Hobby-tier figures this ADR's first draft incorrectly used as the baseline) —
      confirms the pricing assumption in the ADR isn't silently wrong at real usage

**Do not fabricate a successful result** — this item exists because "verified against current
documentation" and "verified against a real deployment" are different claims, and this project's
standing discipline is to never present the former as the latter.

## 10. PDF/Headless-Chromium Compatibility on Vercel (Unit 2B, added by the platform pivot)

**Status: NOT YET VERIFIED.** The platform pivot's PDF-generation decision
(`@sparticuz/chromium` + `puppeteer-core`, replacing Unit 2's containerized-Chromium-on-Railway
approach) is based on current, documented Vercel/community guidance for exactly this
read-only-filesystem constraint — it has not been proven against a real deployed Vercel function in
this project. This is explicitly flagged as the single biggest runtime-compatibility risk item in
the pivot, per the founder's own instruction, and must not be silently assumed to work merely
because the documented pattern is well-established elsewhere.

**When a real Vercel deployment is available, verify**:
- [ ] A real PDF renders successfully from a real `EvidenceReportArtifact` via a deployed Vercel
      Function using `@sparticuz/chromium` + `puppeteer-core`
- [ ] Cold-start latency and function bundle size are within acceptable bounds for this
      application's soft performance targets (NFR-U2-2) — the Chromium binary is a real weight to
      account for
- [ ] Rendering does not exceed the deployed function's execution-duration/memory limits under
      realistic report sizes
- [ ] The rendered PDF is byte-for-byte/visually consistent with what Unit 2's original
      containerized-Chromium approach produced (no silent rendering regression from the
      binary-provisioning change)
- [ ] `ReportPdfRendering` persistence (the existing `bytea` column, unchanged) still round-trips
      correctly from this new rendering path

**If this proves genuinely infeasible on Vercel** (not merely inconvenient), surface that back as a
material infrastructure issue per the founder's own explicit instruction, rather than silently
working around it with an unreviewed architecture change (e.g. a third-party PDF rendering service)
— that decision, if it ever becomes necessary, belongs to the founder, not to this tracker.

## 11. Vercel Platform Request-Log Token Exposure — Confirm the Fix (Unit 2B)

**Status: FIX APPLIED 2026-08-25 (code); LIVE CONFIRMATION NOT YET DONE.** Originally identified
while writing `unit-2b-operations-runbook.md` (Operations stage, 2026-08-25): `GET /report/[token]`
and `GET /api/checkout/status/[sessionId]` (and its query-string form,
`/checkout/status?session_id=...`) both carried a sensitive bearer value directly in the URL itself
— a path segment or query string. This application's own structured logger
(`src/shared/logger.ts`) never logged these values, but Vercel's own platform-level request/access
logs are a separate system, outside this application's code, documented to capture Request Path and
Search Params.

**Corrected, not merely documented**: the credentials no longer appear in any request path or
query string at all. The Stripe Checkout Session ID moved to an HttpOnly cookie
(`POST`/`GET /api/checkout` + `/api/checkout/status`, no longer a `[sessionId]` route); the
`reportAccessToken` moved to a URL **fragment** in the guest-delivery email (never transmitted as
part of any HTTP request) exchanged client-side for an HttpOnly cookie via
`POST /api/reports/access`, with `GET /api/reports`/`GET /api/reports/pdf` (no longer `[token]`
routes) reading that cookie. No new authentication framework — every cookie value is still
re-validated against the existing hash-only credential/Order lookup on every request.

**What remains open**: confirming this against a real deployment, not merely by code inspection.

**Blocked on**: a real Vercel deployment and dashboard/CLI access to its log drain and retention
settings.

**When available, verify**:
- [ ] `/report` and `/checkout/status` requests show only clean, static route paths in Vercel's
      Runtime Logs — no token/session-ID suffix or query string
- [ ] No raw `reportAccessToken` or full Checkout Session ID appears in Request Path or Search
      Params for ANY route, for a real end-to-end guest purchase + report-delivery cycle
- [ ] This application's own logs also remain clean (reaffirms, does not merely repeat, the
      code-review-only guarantee in `src/shared/logger.ts`)
- [ ] Confirm the same question for any third-party log drain/analytics integration, if one is
      ever added (none exists today)
- [ ] Spot-check that the HttpOnly cookies themselves (`pp_checkout_session`, `pp_report_access`)
      are not being captured verbatim by any log drain either — a materially smaller, more
      standard risk surface than a bare URL, but not yet independently confirmed

**Do not fabricate a result** — code-level correctness and a live platform-log confirmation are
different claims; only the first one is true as of this writing.

## 12. Admin Basic Auth / CSRF Live Behavior — Real Deployment Proof (Unit 3)

**Status: CODE COMPLETE 2026-08-25; LIVE CONFIRMATION NOT YET DONE.** `proxy.ts` (Basic Auth,
constant-time credential comparison, same-origin CSRF validation) is verified in this sandbox only
via deterministic direct function calls against constructed `Request` objects
(`tests/admin-auth/*.test.ts`) — never a real HTTP round-trip through an actual deployed
`proxy.ts`, and never against a real resolved `VERCEL_URL`/`APP_BASE_URL` origin.

**What remains open**:
- [ ] A real request to `/admin` or `/api/admin/*` without credentials returns `401` with
      `WWW-Authenticate: Basic realm="admin"`, confirmed against the actual deployed proxy
- [ ] The correct credentials, entered via a real browser's native Basic Auth prompt, succeed
- [ ] `Authorization` header values are confirmed absent from Vercel's platform-level Runtime Logs
      (this application's own logger already never logs them — code-level only, same distinction as
      item 11 above)
- [ ] A real cross-origin `POST` to a mutating `/api/admin/*` route is rejected (`403`) against the
      actual deployed origin
- [ ] A real same-origin `POST` from the deployed admin UI itself succeeds — confirms
      `resolveExpectedAdminOrigin()` resolves the real `VERCEL_URL`/`APP_BASE_URL` correctly in a
      real deployed environment, not just in this sandbox's unit tests

**Blocked on**: a real Vercel deployment with `ADMIN_BASIC_AUTH_USERNAME`/`ADMIN_BASIC_AUTH_
PASSWORD`/`ADMIN_OPERATOR_ID` actually configured.

**Do not fabricate a result** — deterministic test coverage and live deployment behavior are
different claims; only the first is true as of this writing.

## 13. Unit 3 Database-Backed Integration Tests — Not Yet Run (Unit 3)

**Status: WRITTEN 2026-08-25; NOT EXECUTED.** Four new `DATABASE_URL`-gated integration test files
were added this unit (`tests/data-source-registry/repository.integration.test.ts`,
`tests/admin-action-log/repository.integration.test.ts`,
`tests/regulatory-rule-governance/repository.integration.test.ts`,
`tests/order-payment/admin-search.integration.test.ts`) — same pre-existing gap as every prior
unit's DB-dependent suite (see item 1), not a new class of risk, just more tests waiting on the
same missing credential.

**When available, run**: `DATABASE_URL=<real Neon connection string> npm run test:integration` and
confirm all 4 files execute (not skip) and pass, including the fault-injected atomic-transaction
rollback and concurrency-conflict cases, which can only be genuinely proven against a real Postgres
transaction — not simulated in a deterministic unit test.

**Blocked on**: a provisioned Neon `DATABASE_URL` (same blocker as item 1).

---

## 14. Unit 4 Garage Browser Smoke Scenario — Not Yet Written (Unit 4)

**Status: NOT WRITTEN, NOT EXECUTED.** No Playwright scenario exists for the real garage
`/configure` path (configure a garage → place it on the parcel via a real map click → identify
lot-line roles → reach the summary step → attempt checkout and see the honest Garage Screening
Coverage Readiness rejection message). The existing `e2e/smoke.spec.ts` file's one full-path
scenario covers shed only.

**Explicitly accepted as a gap for Code Generation** by founder review (2026-08-26), and **explicitly
confirmed DEFERRED and NON-BLOCKING for Unit 4 completion** by founder review again at Operations
(2026-08-27) — rather than blocking either stage or being silently omitted. Do not write or
fabricate a passing browser scenario merely to close this item; defer it until the real environment
below actually exists. The 26 new deterministic `vitest` tests added during Unit 4 Code Generation
(see `build-and-test/unit-test-instructions.md`'s Unit 4 section) cover the corrected
domain/application logic directly (the L1/L5/L6 percentage resolution, fail-closed
cross-project-type dispatch, the coverage-readiness gate's two independent layers) — they do not
exercise the real browser UI end-to-end.

**When deciding whether to add this**: the scenario would need the same live `DATABASE_URL` +
MapLibre/parcel-resolution environment item 4's shed scenario already requires — not a new class of
blocker, the same one. Writing the test itself (once that environment is available) is a smaller
task than the Functional Design/Code Generation work already complete; the founder's call is
whether it's worth doing now versus deferring alongside item 4.

**Blocked on**: a provisioned Neon `DATABASE_URL` + the same live map/parcel-resolution environment
item 4 requires (same blocker, not a new one) — plus, if added, the actual test code being written.

---

## 15. Unit 5 Vacant-Land PostGIS Buildable-Envelope — Live Integration Not Yet Run (Unit 5)

**Status: NOT RUN.** `computeSetbackConstrainedArea`/`computeEcaExclusionGeometry`/
`computeBuildableEnvelope` (`src/spatial-analysis/postgis-adapter.ts`) implement real per-edge
differential setback subtraction, holes/multi-part geometry preservation, and the
`ST_IsValid`-vs-execution-exception distinction, but none of this has been exercised against a
live PostGIS connection in this environment (confirmed: no `DATABASE_URL` configured). The
deterministic (no-DB) short-circuit paths — `LotLineRoles.status !== "ESTABLISHED"` →
`REQUIRES_VERIFICATION` before any query; `setbackProfile === undefined` →
`NO_ACTIVE_COVERAGE` before any query; the pure GeoJSON↔`Geometry`/WKT conversion helpers
(`geoJsonToGeometry`/`geometryToWkt`, empty-geometry and holes/multi-part handling) — are covered
by `tests/spatial-analysis/vacant-land-postgis-adapter.test.ts` and
`tests/spatial-analysis/vacant-land-geometry-conversion.test.ts`. The real `ST_Buffer`/
`ST_Difference`/`ST_Intersection`/`ST_IsValid` SQL execution itself is not run here — an
`.integration.test.ts` file (mirroring `postgis-adapter.integration.test.ts`'s own structure) is
real follow-up work for an environment with live PostGIS access, not silently skipped or
fabricated as passing.

**Explicitly accepted as a gap for Code Generation** by founder review (2026-08-27) — "the absence
of a LIVE PostGIS integration run does NOT block Code Generation in this environment... if
DATABASE_URL remains unavailable, do not fabricate a pass, keep them skipped."

**Blocked on**: the same provisioned Neon `DATABASE_URL` items 1/3/4/14 already require — not a
new class of blocker.

## 16. Unit 5 Vacant-Land Public Entry Point Fail-Closed Behavior — No Component-Level Test (Unit 5)

**Status: NOT TESTED at the component level.** `app/vacant-land/page.tsx`'s BR-U5-9 fail-closed
behavior (while `isVacantLandScreeningCoverageReady()` is `false`, the public route renders only
an "unavailable" message — no address entry, screening-intent buttons, request creation, or
checkout) is implemented as a plain early-return in the component (`if (!coverageAvailable) return
<unavailable-only-view>`) and is directly readable/reviewable in source, but this project has no
React component-testing infrastructure (`@testing-library/react`, jsdom, or equivalent — confirmed
absent from `package.json`) to exercise it as an automated test, and no Playwright scenario covers
this route either (the same class of gap items 4/14 already name for shed/garage). Adding a
component-testing framework was not attempted — that would be new test infrastructure beyond this
correction pass's scope, not a fix to the flagged defect itself.

**Explicitly accepted as a gap** — the underlying logic fix (Correction 6) is real and verified by
`npm run typecheck`/`npm run build` (the component compiles and type-checks correctly); only the
automated behavioral verification of the rendered output is deferred, the same class of gap this
tracker already carries for the shed/garage browser paths.

**Blocked on**: a founder decision on whether to introduce component-testing infrastructure
(new scope) or rely on a future Playwright scenario (same blocker as items 4/14/15).

## 17. Vercel Firewall Rate-Limiting Rule — Live Configuration/Behavior Not Yet Verified (Unit 6)

**Status: NOT YET CONFIGURED/VERIFIED.** Unit 6's NFR Requirements (NFR-U6-37, corrected per
founder review) specify a Vercel Firewall rate-limiting rule as the primary/outer abuse control for
`requestLoginLink`, `claimPurchase` Path A's start call, and (where useful) the verification
endpoints — existing Vercel Pro platform capability, not a new vendor. This item tracks two things,
neither yet true: (1) the rule has not yet been configured against a real Vercel project (this is a
Code Generation/deployment-configuration task, not a code change); (2) even once configured, its
actual enforcement behavior (does it correctly rate-limit per the intended source key, does its
threshold behave as expected under real traffic) has not been observed against a real deployment.
Distinct from, but related to, item 6 (client-IP/source-key header behavior) — item 6 covers the
*application-local* `FailedLookupRateLimiter`'s source-key assumption; this item covers the
*platform-level* Firewall rule's own configuration and behavior, a separate mechanism entirely.

**Blocked on**: a real Vercel deployment with Firewall rule configuration access, plus real or
simulated traffic to observe enforcement.

## 18. Real Local Customer-Journey Retest — Parcel-Confirmation Correction (Product-Correctness Amendment)

**Status: PARTIALLY VERIFIED 2026-08-27, one real address, live browser + live King County data.**
The founder reported "nothing happens at all" clicking Find Parcel against their own local dev
server. Attached this session's Browser tool to that real running server (`localhost:3000`) and
reproduced it live: `POST /api/parcels/resolve` for "3216 Fuhrman Ave E, Seattle, WA" correctly
returned real, live King County geocode data (`CLARIFICATION_REQUIRED`/`INSUFFICIENT_CORROBORATION`,
one real candidate, parcel `1959703080`) and the new confirmation UI **did** render — but was
functionally invisible: `app/layout.tsx`'s `<body>` never declared a background color, so a
dark-mode browser/OS painted a black canvas behind the app's existing `#1a1a1a` near-black text,
making every page (not just this new UI) look blank. Fixed (`color-scheme: light` + an explicit
white body background) and re-verified live in the same browser session: the confirmation UI is now
clearly legible, and clicking "Yes, this is the property" correctly proceeds to fetch the parcel
boundary — which then fails on the **separate, explicitly out-of-scope** `DATABASE_URL is not set`
condition (this local environment has no database configured; unrelated to this correction, not
touched per the founder's own explicit instruction). The original 2026-08-27 amendment record
(`aidlc-docs/decisions/2026-08-27-fail-closed-on-claims-not-completion-correction.md`) is updated
with this finding. **Still open**: the full 26-address retest and the second acceptance test
(address → confirmation → project configuration → evaluation with disclosed downstream
uncertainty) — this session verified the fix mechanism works against one real address, not the
full acceptance-test scope.

*(Original entry, still accurate as the starting point before this partial verification):* The
2026-08-27 "fail closed on claims, not on completion" amendment
(`aidlc-docs/decisions/2026-08-27-fail-closed-on-claims-not-completion-correction.md`) was directed
by, and its underlying defect discovered by, the founder's own real local testing against 26 real
Seattle addresses (26/26 dead ends before the fix). The fix itself is covered by real, passing
deterministic tests (`confirmCandidate`'s own behavior, `tests/parcel-resolution/resolve.test.ts`)
and a clean typecheck/build, but **no live re-test against real King County geocoding/parcel data
has been run in this session** — no live credentials in this sandbox, matching this project's own
established discipline of never fabricating a live-verification result. The founder's own §7
acceptance-test requirement (the same class of addresses must now allow candidate confirmation and
continue; several real Seattle residential properties must be able to move through
address→confirmation→project configuration→evaluation with downstream uncertainty disclosed rather
than blocking) remains open until re-run locally.

**Blocked on**: the founder's own local environment (the same one that surfaced the original
26/26 regression) re-running that same test against this fix.

## 19. Seattle ECA Feature Services — Live Query Behavior Not Yet Verified (Unit 6B research)

**Status: NOT YET VERIFIED.** Unit 6B's research
(`aidlc-docs/construction/unit-6b-shed-report-value-expansion/research-findings.md`, Track 3)
identified 12 Seattle ECA feature services on `services.arcgis.com/ZOyb2t4B0UYuYNYH` (the same
ArcGIS Online org already integrated for Building Outlines). The `Environmentally_Critical_Areas_Steep_Slope`
service was confirmed live to declare WKID 2926 and support `query`. **Not yet done**: (1) a live
`query` round-trip against each of the other 11 services (some Seattle GIS endpoints —
`gisrevprxy.seattle.gov`, `gisdata.seattle.gov` — were observed refusing connections / returning
500s during the research pass, so per-endpoint reachability from the deployment environment must be
confirmed); (2) per-layer verification that each declares SRID 2926 on a real 1+-feature response
(the Building Outlines adapter already does this fail-closed check — the ECA adapter must too);
(3) per-layer attribute-field and vintage confirmation. **Blocked on**: Unit 6B scope approval,
then an ECA adapter with real network access.

## 20. Seattle ECA / SMC Buffer Distances and Lot-Coverage Percentage — Code-Text Verification (Unit 6B research)

**Status: NOT YET VERIFIED.** The research pass read SDCI summary pages and the NR Zoning Summary
(explicitly "for Illustrative Purposes Only") but did not verify against SMC 23.44.080 / 23.44.090
/ 25.09 code text: (1) the applicable lot-coverage percentage for a given parcel (35% legacy
Single-Family vs. 50% Neighborhood Residential, and any One-Seattle transition/vesting provisions);
(2) exact wetland / riparian / steep-slope buffer distances; (3) the accessory-structure-specific
setback reductions (the "rear 40% of the lot" 1-ft setback, the 40%-of-required-rear-yard coverage
cap) and whether they survived the rezone unchanged; (4) precisely which projections/features count
toward lot coverage. These drive the Tier-2 assignments for candidate rules C1–C3, F1, P6
(`candidate-regulatory-rules.md`). **Blocked on**: direct SMC reading (human/browser — Municode
blocks programmatic fetch, per every prior unit) during Unit 6B Functional Design / rule drafting.

## 21. Unit 6B Permit-Requirement Rules — Professional Review (Unit 6B research)

**Status: NOT YET DONE.** Candidate rules P1–P9 (permit-requirement determination) were researched
from primary SDCI sources but carry genuine interpretation risk: "generally unoccupied uses" (P5),
"in or near an ECA" with SDCI routing discretion (P6), and the STFI-vs-full span determination
(P7) are Tier-2 by AI suggestion. Per the project's rule-governance model, Tier-2 rules require
founder verification and, where the founder deems it warranted, escalated-professional review
before `APPROVED` → `ACTIVE`. This item tracks that obligation; it is **not** a blocker to Unit 6B
Functional Design.

## 22. Unit 6B Lot-Coverage and Feasible-Placement Rules — Professional Review (Unit 6B research)

**Status: NOT YET DONE.** Candidate rules C1–C3 (lot coverage) and F1 (accessory-structure setback
profile, only relevant if the deferred Track 4 is later scoped) are Tier-2 by AI suggestion and
carry the same founder-verification / optional-professional-review obligation as item 21. Also:
the research finding that aerial building-outline `AREA` **over-counts** code-countable coverage
(roof edge vs. wall line) is a stated `ESTIMATED`-label rationale that a reviewing professional
should confirm is a genuinely conservative (capacity-under-stating) direction. Not a blocker to
Functional Design.

## 23. Unit 6B Candidate Rule P1 — Exact Exemption-Threshold Operator — RESOLVED 2026-09-11

**Status: RESOLVED — CLOSED.** The founder independently reviewed the governing 2021 Seattle
Residential Code provision directly: **R105.2, Item 3.1** — "The projected roof area does not
exceed 120 square feet." This confirms `projectedRoofAreaSqFt ≤ 120` (the inclusive operator) and
resolves the discrepancy between SDCI's "Sheds" page ("120 sq ft or less") and its "Do You Need a
Permit?" page ("less than 120 sq ft") — R105.2 governs over either informal paraphrase. No
further verification needed for this specific operator question; `candidate-regulatory-rules.md`
P1 updated accordingly and marked Tier 1, founder-confirmed.

## 24. Unit 6B Candidate Rule P2b — Detached Accessory-Structure Zoning Height Limit — LOCATION MODEL RESOLVED 2026-09-13; narrow item remains

**Status: LOCATION-SENSITIVE MODEL RESOLVED — narrow subsection detail remains open.** The
founder independently reviewed Ordinance 127376 / SMC 23.44.070 directly (2026-09-13): the
general NR-zone structure height limit is **32 feet**; an accessory structure **located in a
required setback** is limited to **12 feet**, with no portion of its roof permitted to extend
beyond that limit. This resolves the earlier unreconciled "12 ft (SDCI Sheds page) vs. 15 ft (NR-
zone summary citing SMC 23.44.046)" discrepancy — both were incomplete paraphrases of a single
location-conditioned rule, not two competing figures for the same case. P2b is now split into
P2b-1 (in a required setback → 12 ft) and P2b-2 (outside → 32 ft, subject to 23.44.070's own
exceptions), both **T1 — FOUNDER-CONFIRMED**
(`candidate-regulatory-rules.md`/`rule-tier-review.md` updated). **What remains open**: the exact
current SMC 23.44.070 subsection numbering and the precise wording of its own roof/height-
exception interaction for setback-located accessory structures has not been independently
re-verified against the full current statutory text in this session (the founder's citation gives
the substance, not a subsection-by-subsection read). **Blocked on**: a direct read of the full
current SMC 23.44.070 text. Does not block Functional Design (the rule's mechanism — a
location-conditioned plain numeric height check, reading the shed's already-computed setback
facts — is not in question); blocks P2b's promotion past `SOURCE_VERIFIED`.

## 25. Unit 6B Candidate Rules P3b / P7b — Current Tip 316 Verified 2026-09-13; P7b's boundary-operator gap narrowed and remains

**Status: P3b RESOLVED/CLOSED. P7b's rule text RESOLVED; a narrow boundary-operator item
remains.** The founder independently confirmed (2026-09-13) that the 04/26/2024-dated SDCI Tip
316 is still the currently-published/served version, and that its text explicitly lists among
projects that do not qualify for STFI: all-wood foundations, and foundations using piles
(including pipe piles and pin piles) — **P3b is now T1 — FOUNDER-CONFIRMED, fully closed**, no
further action needed. Tip 316 also still provides: detached accessory structures up to 750 sq
ft, a structural-span criterion around 14 ft, and a manufactured-truss allowance up to a
separately-stated 30-ft threshold; the SDCI Sheds page's full-review framing states beams
spanning more than 14 ft trigger the more extensive review path. **P7b is now T1 —
FOUNDER-CONFIRMED** for its rule text, with the domain model corrected to a numeric
`structuralSpanFt` + `usesManufacturedTruss` boolean (replacing a categorical enum that could not
distinguish a 20-ft from a 35-ft manufactured truss). **What remains open (P7b only, narrowed
scope)**: Tip 316's eligibility bullet reads "less than 14 feet," while the SDCI shed guidance's
full-review framing reads "more than 14 feet" — these do not textually reconcile at exactly 14.0
ft. `structuralSpanFt === 14.0` resolves `REQUIRES_VERIFICATION` by design pending this
reconciliation, rather than a guessed operator. **Blocked on**: locating a single source that
states the boundary operator unambiguously (or founder confirmation, as with P1's operator).
Does not block Functional Design; blocks P7b's promotion past `SOURCE_VERIFIED`.

## 26. Unit 6B Candidate Rule C1b — Two Data-Source Gaps — RESEARCHED 2026-09-13, confirmed data-insufficient (not a near-term-closable gap)

**Status: RESEARCHED — both sub-categories confirmed to lack a currently-available deterministic
data path; not a rule-mechanism ambiguity (that is resolved) and not merely unresearched.** Per
explicit founder instruction (2026-09-13: "do not defer this until Code Generation... resolve the
data contract during Functional Design"), both open data-source questions were investigated
directly against live ArcGIS REST endpoints on the same org (`services.arcgis.com/
ZOyb2t4B0UYuYNYH`, WKID 2926 confirmed) used by Building Outlines and the other 12 ECA layers:

- **Submerged lands / shoreline-setback**: the founder's proposed candidate,
  `Shoreline_Environments` (`.../arcgis/rest/services/Shoreline_Environments/FeatureServer/23`),
  is **confirmed real and live** — polygon geometry, backed by the city's general zoning-overlay
  table (`DPD.ZONING_OVERLAY_ALL`) filtered to `TYPE = 'SHORELINE'`. Fields: `OVERLAY`,
  `DESCRIPTION`, `PUBLIC_DESCRIPTION`, `TYPE`, `CHAPTER`, `CHAPTER_LINK`. `DESCRIPTION` carries
  the shoreline **environment designation** (Urban Harborfront, Urban Maritime, Conservancy
  Navigation, Conservancy Management, Conservancy Preservation, Conservancy Waterway, Conservancy
  Recreation) — a zoning/environment-designation attribute, **not** a dedicated submerged-lands
  field. Treating "Conservancy Navigation" as equivalent to the code's "submerged lands" term
  would be an **unverified interpretive leap**, not confirmed here. Separately, the actual
  shoreline-setback *distance* (SMC 23.60.198.B.1) is itself contextual/discretionary — dependent
  on neighboring residences' locations, with the Director able to reduce a setback exceeding 75
  ft down to no less than 75 ft — not a single fixed distance that could be offset from the
  companion `Seattle Shoreline` waterline layer (an 8-ft-contour approximation of mean high
  water) even if it were. **Conclusion**: no deterministic exclusion geometry is currently
  establishable for this sub-category; expected to resolve `REQUIRES_VERIFICATION` in
  essentially every real evaluation — closer in character to C1e's Director-alternative branch
  (item 27) than to a solvable near-term data gap.
- **Wetland buffer**: `Environmentally_Critical_Areas_Wetlands` (`ECA - Wetland`, layer 10)
  carries a numeric `CATEGORY` field but **no habitat-function field**. SMC 25.09.160 Table A
  sets wetland buffer width as a function of **both** category **and** habitat function (a
  Category III wetland with low habitat function requires a 60-ft buffer per 25.09.160.B, for
  example) — with habitat function absent from the dataset, buffer width cannot be
  deterministically computed from this layer alone. `ST_Buffer(wetlandPolygon, <fixed
  distance>)` is explicitly not used as a stand-in for the regulatory buffer. This does not limit
  ECA screening's (P6) ability to report the mapped wetland fact itself — only the
  lot-coverage-denominator buffer computation is affected.

**No guessed polygon subtraction is built for either sub-category.** `EcaLotAreaAdjustment`
(domain-entities.md §3b) already resolves `REQUIRES_VERIFICATION` for a named category whenever
its exclusion geometry cannot be established precisely — both of these sub-categories are
expected to exercise that branch in essentially every real evaluation. **Blocked on** (should a
future pass want to close this further): a data source that identifies submerged lands
specifically (not just shoreline environment designation), a confirmed operational definition of
the code's "shoreline-setback area" as a computable geometry, and a habitat-function data source
for mapped wetlands (or a founder decision to adopt a documented conservative default). Does not
block Functional Design; blocks C1b's full, precise implementation for these two sub-categories
and their promotion past `SOURCE_VERIFIED`.

## 27. Unit 6B Candidate Rule C1e — Director-Approved Alternative Has No Data Channel

**Status: PERMANENTLY `REQUIRES_VERIFICATION` IN PRACTICE, NOT A VERIFICATION TASK.** SMC
23.44.080.D's Director-approved-alternative branch (a case-by-case administrative determination
that may set a minimum-coverage figure greater than the 625 sq ft floor) is genuinely Tier 2 —
Permit Preflight has no data channel to actual Director approval records for a given parcel and
is not expected to acquire one. Recorded here for completeness, not as an action item: this
branch should be expected to resolve `REQUIRES_VERIFICATION` for essentially every real
evaluation, by design, never guessed as "no Director alternative exists."

---

*Last updated: 2026-09-13 (founder's second correction round — Functional Design Part 1
completion). Item 24 (P2b) resolved to a location-sensitive T1 model via the founder's own
citation of SMC 23.44.070; a narrow subsection/roof-exception detail remains open. Item 25: P3b
CLOSED (current Tip 316 confirmed); P7b's rule text resolved to T1 with a corrected numeric
domain model, narrowed to only the exactly-14.0-ft/30-ft boundary-operator question. Item 26: both
of C1b's data-source gaps directly researched against live ArcGIS endpoints (not deferred) —
confirmed data-insufficient for now, expected to resolve `REQUIRES_VERIFICATION` in practice
rather than being a near-term-closable gap. Item 27 and items 1-23 unchanged by this pass.*

*Prior update: 2026-09-11 (founder's independent tier review and current-code correction). Item
23 (P1's operator) RESOLVED/CLOSED via the founder's own direct citation of SRC R105.2 Item 3.1.
The former items 24-25 (C1's 60% figure and the ECA-reduction mechanism) are SUPERSEDED - the
founder's direct citations of SMC 23.44.080.A/B/C/D/F/G resolved both the mechanism ambiguity and
the 60% figure's existence (now split into C1c/C1d, both founder-confirmed Tier 1 from explicit
code text). New items 24-27 opened: P2b's 12 ft vs 15 ft height-limit discrepancy; P3b/P7b's
pending re-verification against the current Tip 316; C1b's two remaining data-source gaps
(submerged-lands/shoreline dataset, wetland-buffer geometry coverage); and C1e's Director-
alternative branch (not a verification task - an inherent, permanent REQUIRES_VERIFICATION by
design). None block Functional Design; all block their respective rule's promotion past
SOURCE_VERIFIED. Items 1-22 unchanged by this pass.*

*Prior update: 2026-09-10 (Unit 6B research pass). Items 19-22 added - they track external
verification obligations surfaced by the Unit 6B research (ECA endpoint reachability + per-layer
CRS, SMC code-text verification for buffer/coverage figures, and Tier-2 professional review for the
candidate permit/coverage rules). None is a blocker to Unit 6B Functional Design; all are gated on
Unit 6B scope approval first. Items 1-18 unchanged by this pass - no live credentialed check ran.*

*Prior update: 2026-08-27 (Product-Correctness Amendment). Item 18 added - tracks the one open
acceptance-testing item the amendment itself could not close in this sandbox. Item 17 added during
Unit 6 NFR Requirements review correction pass - tracks the new Vercel Firewall rate-limiting rule
NFR-U6-37's correction introduces as the primary auth-endpoint abuse control, replacing an initial
in-process-only model that incorrectly assumed single-replica/no-cold-start behavior. Item 6 remains
open and unchanged, now explicitly distinguished from item 17 (application-local source-key
assumption vs. platform-level rule configuration/behavior, two different mechanisms). Items 1-16
unchanged by this pass.*

*Prior update: 2026-08-27 (Unit 5 Code Generation review correction pass). Items 15-16 added -
item 15 covers the new PostGIS buildable-envelope geometry functions' live-integration gap
(same DATABASE_URL blocker as items 1/3/4/14); item 16 covers the vacant-land public entry point's
fail-closed behavior (BR-U5-9, Correction 6), verified by typecheck/build but not by an automated
component/browser test, the same class of gap items 4/14 already carry for shed/garage. Neither
item's underlying defect is unresolved - both are real, verified fixes; only the live/automated
verification layer is deferred, per explicit founder instruction not to fabricate a pass. Items
1-14 unchanged by this pass.

*Prior update: 2026-08-27 (Unit 4 Build & Test). Item 14 added during Unit 4 Build & Test - the
garage browser-smoke gap explicitly accepted for Code Generation by founder review, carried forward
here as a tracked, undecided item rather than silently dropped. Items 1-13 unchanged by Unit 4 - none
were marked complete, since no live credentialed deployment/database check actually ran in this pass
either. Items 12-13 added during Unit 3 Code Generation (not during Unit 2B Operations - corrected
footer wording), expanded with concrete first-deployment checklists during Unit 3 Operations
(`unit-3-operations-runbook.md` §2/§3/§10); neither marked complete, since no live credentialed
deployment/database check actually ran in that pass. Item 11 added during Unit 2B Operations (a new
finding, not previously flagged); items 1-10 unchanged by Unit 2B or Unit 3 Operations - none were
marked complete, since no live credentialed check actually ran in either pass. Items 1-2 opened
during Unit 1 Build & Test, carried forward since. Items 3-6 opened during Unit 2 Code
Generation/Build & Test/Operations per explicit user instruction not to fabricate live verification
— item 6's target platform updated by the pivot, not re-verified yet either way. Items 7-8 opened
during Unit 2B Infrastructure Design (Railway-targeted pass); item 7 corrected 2026-08-25 (an
inaccurate already-passing claim about the automated Stripe test-mode suite removed - it is written
and typecheck-clean, not executed). Items 9-10 opened by the deployment-platform pivot itself, same
not-fabricated-until-real discipline; item 9's checklist remains accurate post-Code-Generation (this
session's build-time workflow-manifest inspection proves registration, not a real deployed run -
still open). Item 5 corrected 2026-08-25 (stale "poller" reference removed, superseded by Vercel
Workflows).*
