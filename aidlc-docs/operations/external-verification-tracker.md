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

**When available**: authorize a real report generation (via `/configure`'s UI or a direct
`authorizeReportGeneration` call) against an isolated dev/test Neon branch, let the poller process
it, then read the resulting `STAGE_TIMING` log lines for real per-stage durations.

**Checklist**:
- [ ] A real pipeline run completes and emits all 7 expected `STAGE_TIMING` events
- [ ] Recorded actual durations compared against NFR-U2-2's soft targets — targets revised in
      `nfr-requirements.md` if evidence warrants, per that document's own instruction
- [ ] No performance figure is stated anywhere as fact until this run has actually happened

**Do not invent or estimate a performance measurement before this run exists** — per the user's
explicit instruction (2026-08-23).

## 6. Railway Client-IP / Rate-Limit Source-Key Behavior

**Status: NOT YET VERIFIED.** `app/api/reports/[token]/route.ts`'s `sourceKeyFor` (and the
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

---

*Last updated: 2026-08-23 (Unit 2 Operations approval). Items 1-2 opened during Unit 1 Build &
Test, carried forward through Operations. Items 3-6 opened during Unit 2 Code Generation/Build &
Test/Operations per explicit user instruction not to fabricate live verification.*
