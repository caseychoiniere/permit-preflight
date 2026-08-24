# Unit 2 Operations Runbook

## Scope of This Document

Unit 2 is the first unit with a real deployed runtime — one Railway service, one replica, no
queue/worker/cache/APM (Infrastructure Design). This runbook is scoped accordingly: concrete
enough to actually operate that one service, not speculative infrastructure. See
`aidlc-docs/operations/unit-1-operations-runbook.md` for what's unchanged from Unit 1 (running
tests, credential/env-var discipline, general source-failure diagnosis) — this document covers
what's new because a real deployment now exists.

## 1. Railway Deployment / Startup Behavior

- **Compute primitive**: Railway's normal persistent Service — **not** Railway Functions/Cron,
  **not** Serverless sleeping. This must stay disabled; the in-process `ReportGenerationJob`
  poller depends on the process staying alive between requests, not being woken per-request.
  **Verify after any Railway configuration change**: confirm in the Railway dashboard (or via
  `railway status`) that the service shows as a persistent Service, not a Function.
- **Startup sequence**: Railway builds via Nixpacks' default Next.js detection → runs
  `npm run build` → runs `npm run start` (`next start`). `instrumentation.ts`'s `register()` hook
  fires once, early in that process's lifetime — it starts the job poller only if `DATABASE_URL`
  is set (see "Job-Poller Startup" below).
- **Migrations**: applied as a pre-deploy step (see "Neon Migration Procedure" below) — a
  migration failure must prevent the new version from becoming active, not just log a warning.

## 2. Job-Poller Startup (Exactly Once Per Process)

- `report-generation-orchestrator/poller.ts` has a module-level guard (`pollerStarted`) — calling
  `startJobPoller` a second time in the same process is a no-op. This protects against Next.js
  dev-mode hot reload re-executing `instrumentation.ts`'s top-level code; it does **not** and must
  not be relied on for cross-process correctness (job-claim safety comes from Postgres's atomic
  `UPDATE ... RETURNING`, unchanged regardless of how many processes exist).
- **Verify in production**: after a deploy, check the Railway logs for exactly one poller-related
  startup sequence (absence of a duplicate `JOB_CLAIMED`/`JOB_STALE_RECOVERY` burst pattern that
  would suggest two pollers racing — a real anomaly to investigate if seen, since it would imply
  either a code regression in the guard or more than one process running against the same
  database, both worth escalating rather than dismissing).

## 3. Graceful Shutdown

- On receipt of the process termination signal (Railway's normal deploy/restart flow), the
  intended behavior is: **stop claiming new jobs**, let any in-flight job either finish or be
  interrupted. An interrupted job is recovered later via stale-claim recovery (below) — shutdown
  must never fabricate a fake `COMPLETE`.
- **Implementation**: `instrumentation.ts` wires `poller.stop()` to both `SIGTERM` and `SIGINT` —
  found missing while writing this runbook (2026-08-23) and fixed immediately (a small, safe,
  reversible addition, not an architectural change). `stop()` clears the poll interval and resets
  the module-level start guard; any job already claimed when the signal arrives is left
  `IN_PROGRESS` and picked up later by ordinary stale-claim recovery (item 4) — shutdown never
  marks it `COMPLETE`.

## 4. Stale-Job Recovery Procedure

- A job stuck `IN_PROGRESS` (e.g., the process restarted mid-pipeline) is reclaimed automatically
  by the poller's next tick, once `claimedAt` is older than `DEFAULT_STALE_CLAIM_THRESHOLD_MS`
  (currently 5 minutes — `report-generation-job/repository.ts`). No manual intervention is needed
  for the common case.
- **To manually inspect a stuck job**: query `report_generation_jobs` for rows where
  `state = 'IN_PROGRESS'` and `claimed_at` is old. A job stuck well past the threshold with no
  automatic reclaim is worth investigating (is the poller actually running? check Railway logs for
  recent `JOB_CLAIMED`/`STAGE_TIMING` activity).
- The 5-minute threshold is a starting value, not empirically tuned — revise it once real
  `STAGE_TIMING` data exists (external-verification-tracker.md item 5) showing actual pipeline
  duration, giving it real margin rather than a guess.

## 5. Failed `ReportGenerationJob` Diagnosis and Retry

- A job reaching `FAILED` (an explicit terminal state, never silently `COMPLETE` without a real
  artifact) has its failure reason(s) recorded in `report_generation_jobs.failure_reasons` (an
  array — every attempt's reason is appended, not overwritten).
- **To diagnose**: read `failure_reasons` for the specific job, and cross-reference `JOB_FAILED`
  log events (same `reportGenerationJobId`) for the full error message and stack context.
- **To retry a genuinely `FAILED` job**: there is currently no automatic re-queue from `FAILED`
  back to `QUEUED` — this is a deliberate scope boundary (Unit 2 has no admin tooling; that's
  Unit 3). A manual retry today means creating a new `ScreeningRequest`/authorization for the same
  underlying request, producing a new job. If this proves operationally painful before Unit 3
  exists, that's a signal to prioritize Unit 3's `ADM-4` early, not to bolt an ad hoc retry
  endpoint onto Unit 2.

## 6. Health-Check Behavior

- `/healthz` (`app/healthz/route.ts`) verifies only that the process is up and can respond —
  **deliberately does not touch the database, King County, or Anthropic**. A transient external
  outage must never fail Railway's health check and trigger an unnecessary restart.
- **Do not "improve" this into a deep dependency check** without deliberately revisiting this
  decision — it was a specific, tested fix (see the Build & Test defect: an eager `getDb()` call
  in `instrumentation.ts` previously crashed the entire process, including this endpoint, whenever
  `DATABASE_URL` was unset).

## 7. Neon Migration Procedure

```bash
# Pre-deploy step (Railway config), or manually against an isolated dev/test branch:
npm run db:migrate   # drizzle-kit migrate - applies 0000_*.sql and 0001_enable_postgis.sql in order
```
- **Never** run this against a production database that doesn't yet exist for Unit 2 — the
  deployed prototype's Neon branch is itself the only "production-like" target right now, and it
  must stay isolated per Infrastructure Design (never shared with local dev/live-integration-test
  branches).
- A migration failure must prevent the new application version from becoming active (Infrastructure
  Design's carry-forward requirement) — if using Railway's pre-deploy hook, confirm it's actually
  configured to block on failure, not just log one.
- This procedure itself remains **unverified against a real Neon database** —
  external-verification-tracker.md item 1/3.

## 8. Report-Access Token Rotation / Revocation

- `report-access/repository.ts` exposes `revokeAccessCredential(db, reportArtifactId)` and
  `rotateAccessCredential(db, reportArtifactId)` (revoke + issue a new token, returning the new
  raw value exactly once).
- **When to use**: if a report link is suspected leaked (e.g., accidentally posted somewhere
  public), rotate it — the old link stops resolving immediately, and a new one must be
  distributed to the legitimate recipient.
- **There is currently no UI or API route exposing this** — it's callable only via a direct
  script/REPL against the database, consistent with Unit 1's "no operator UI yet, Unit 3's job"
  posture for anything beyond the customer-facing surface Unit 2 actually needed to ship.

## 9. Rate-Limit Operational Assumptions

- `report-access/rate-limiter.ts`'s `FailedLookupRateLimiter` is **in-process memory** — valid
  only because Unit 2 runs exactly one Railway replica (see "Single-Replica Assumption" below). A
  process restart clears all rate-limit state, an accepted prototype trade-off.
- **Source-key derivation** (`app/api/reports/[token]/route.ts`'s `sourceKeyFor`) currently reads
  `x-forwarded-for` directly. **This has not been verified against Railway's actual proxy
  behavior** — if Railway's edge doesn't set this header the way assumed, or sets multiple values
  in an unexpected order, the rate limiter could key on the wrong value (e.g., always "unknown," or
  a proxy hop's address instead of the real client), or a client could evade the limiter entirely
  by supplying its own conflicting header value. **Tracked as external-verification-tracker.md
  item 6** — not yet verified, not to be assumed correct until tested against the real deployed
  service.

## 10. PDF-Rendering Failure Diagnosis

- A PDF-render failure logs `PDF_RENDER_FAILURE` (with the report artifact id and reason) and
  returns a 500 to the requester — critically, it **never corrupts or modifies the report
  artifact itself** (`report-pdf-rendering/repository.ts`'s `getOrRenderReportPdf` only ever
  inserts a new `ReportPdfRendering` row on success).
- **Common causes to check first**: Chromium not actually installed/available in the deployed
  container (verify the Dockerfile/build step that pins it actually ran); memory pressure from
  concurrent renders (Infrastructure Design's "limit rendering concurrency conservatively"
  requirement — if this becomes a real issue, that's evidence to actually add a concurrency limit,
  not a reason to introduce a PDF microservice).
- A failed render is always retryable on the next request — `getOrRenderReportPdf` re-attempts
  rendering whenever no cached `ReportPdfRendering` row exists yet.

## 11. MapTiler Configuration / Origin Restriction

- `NEXT_PUBLIC_MAPTILER_KEY` is a public, browser-visible value by design — **never treat it as a
  secret**. Its protection is MapTiler's own Allowed HTTP Origins restriction, configured in the
  MapTiler dashboard, not environment-variable secrecy.
- **Before going live on a real domain**: confirm the MapTiler key's allowed origins actually
  include the deployed Railway domain (and any custom domain, if one is added) — an unrestricted
  or wrongly-restricted key either leaks quota to other sites or breaks the map for legitimate
  users.
- **Commercial-GO checkpoint (reaffirmed, unchanged)**: MapTiler's free tier is prototype/R&D
  infrastructure only — not an approved commercial-production licensing decision. Revisit before
  paid public usage (`infrastructure-design.md`'s existing checkpoint).

## 12. Railway Logs and `STAGE_TIMING` Use

- All operator visibility comes from Railway's native log viewer receiving the existing structured
  JSON logger's stdout/stderr — no new observability platform (Infrastructure Design, unchanged).
- `STAGE_TIMING` events (one per pipeline stage: `PARCEL_GEOMETRY_RETRIEVAL`,
  `PROPERTY_INTELLIGENCE`, `SPATIAL_ANALYSIS`, `RULES_ENGINE`, `REPORT_EXPLANATION`,
  `ARTIFACT_PERSISTENCE`, `PDF_RENDERING`) are the mechanism for establishing NFR-U2-2's real
  performance baseline — **this has not happened yet**, since no real pipeline run has occurred in
  any session of this project (needs `DATABASE_URL`). See "Performance Baseline" in the
  external-verification tracker.
- Never-logged list (reaffirmed): `reportAccessToken`, `tokenHash`, `DATABASE_URL`,
  `ANTHROPIC_API_KEY`, MapTiler credentials, raw user-submitted payloads unless specifically
  redacted.

## 13. External-Verification Tracker

See `aidlc-docs/operations/external-verification-tracker.md` — items 1/3 (Neon/PostGIS, including
the CRS-transform tests), 2 (Anthropic, split into 2a Rule Research Assistant/RRAG-1 and 2b Report
Explanation — running one does not verify the other), 4 (the full DB-dependent Playwright smoke
path), 5 (the `STAGE_TIMING` performance baseline), and 6 (Railway's real client-IP/proxy-header
behavior, which the rate limiter's `sourceKeyFor` currently only assumes — see item 9 above). All
remain explicitly open. Update the tracker the first time each becomes runnable — never mark
anything verified without actually running it.

## 14. Rollback / Redeployment Procedure (Railway)

- Railway retains prior deployments; rolling back means redeploying a previous build from the
  Railway dashboard/CLI (`railway rollback` or selecting a prior deployment) — no bespoke rollback
  tooling exists or is needed at this scale.
- **Database migrations are forward-only in this project** (no down-migrations have been
  authored) — a code rollback that depends on a schema change being reverted is **not** safely
  automatic. If a deploy that included a schema migration needs to be rolled back, that requires a
  deliberate, manual database decision (write and apply a compensating migration, or accept the
  newer schema alongside the older code if compatible) — never assume rollback alone undoes a
  migration.
- Given Unit 2 has no live customers/payment, the practical rollback bar is low — this procedure
  exists mainly so it isn't invented under pressure later.

## 15. Single-Replica Assumption (Explicit)

Unit 2 runs exactly one Railway replica. Two things currently depend on this and would need
revisiting before ever scaling beyond it:
1. The in-process `FailedLookupRateLimiter` (item 9) — a second replica would have its own,
   independent rate-limit state, weakening the protection.
2. The in-process job poller's dev-hot-reload guard is process-local by design — this is fine for
   correctness (the atomic DB claim is what actually matters), but running multiple replicas would
   mean multiple pollers ticking independently, which is safe but wasteful (each tick queries for
   `QUEUED`/`IN_PROGRESS` jobs even when another replica already claimed them).

Scaling beyond one replica is a deliberate future infrastructure change, not a silent assumption to
relax — Infrastructure Design and this runbook both flag it explicitly so it isn't done by
accident.

## Explicitly N/A / Not Introduced

Consistent with Infrastructure Design: no admin dashboard, no message queue, no Redis, no
distributed lock service, no APM/tracing platform, no object storage, no PDF/GIS microservice, no
multi-replica/autoscaling configuration, no Kubernetes. None of these become justified merely
because Operations as a stage exists — only by a concrete requirement demonstrating a real need,
which none currently do.
