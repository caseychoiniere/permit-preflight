# Unit 2: Report Generation & Presentation Prototype — Infrastructure Design Plan

**Design artifacts consumed**: all approved Functional Design and NFR Design artifacts (including
the `ReportPdfRendering`/token-authorization corrections). **This is the first unit with a real
deployed runtime** — Unit 1 had none; every prior infrastructure decision (Neon/PostGIS, env-var
secrets, structured logging) was made without an actual app to host.

**Governing constraint (per the user's explicit instruction)**: resolve only the concrete
infrastructure the approved NFR Design actually requires. Do not introduce Redis, a message queue,
distributed locks, Kubernetes, a dedicated GIS service, a PDF microservice, a tracing/APM platform,
multi-region deployment, or autoscaling unless the selected hosting environment concretely
requires or strongly justifies it.

**Central question**: how `ReportGenerationJob` claiming/execution actually continues running
after the authorizing request returns — this must match the chosen hosting runtime's real
execution model, not assume a serverless request handler can safely keep background work alive
past the response.

---

## Infrastructure Design Checklist
- [x] Answer clarifying questions below
- [x] Analyze answers for ambiguity; raise follow-ups if needed — none needed; all 8 answers were
      exhaustively specific, several going well beyond the recommended options with concrete
      operational requirements
- [x] Create `infrastructure-design.md` — component-to-infrastructure mapping (deployment target,
      job-execution mechanism, Neon branch strategy, rate-limit storage, basemap provider, PDF
      runtime/storage, secrets handling, logging)
- [x] Create `deployment-architecture.md` — the actual running-system diagram: what processes run
      where, what talks to what, explicitly contrasted with what does NOT exist (no queue, no
      separate worker fleet, no CDN/load-balancer layer unless justified)
- [x] Update `aidlc-docs/construction/shared-infrastructure.md` — this unit adds the first real
      app-hosting decision and the first real Neon *usage* (not just the provider choice) to that
      shared-infrastructure tracker

---

## Clarifying Questions

### Question 1 — Hosting Target and ReportGenerationJob Execution Model (the central, coupled question)
The job-claiming pattern (NFR Design Pattern 3) is safe under any invocation mechanism — the
safety guarantee comes from Postgres's atomic `UPDATE ... RETURNING`, not from *how* claiming is
triggered. But *whether background work can run at all* after a request returns depends entirely
on the hosting runtime's execution model.

A) **Deploy Next.js as a traditional long-running Node.js server process** on a simple
   container/VM-based platform (e.g. a single persistent Node process on a platform like Render,
   Fly.io, Railway, or a plain VM — the specific vendor is a low-risk, reversible choice, not an
   architectural one) — **not** pure request/response serverless functions. The same long-running
   process runs a simple in-process interval poller (e.g. checks for `QUEUED` jobs every few
   seconds) that claims and executes jobs via Pattern 3, entirely in-process. This sidesteps
   serverless execution-duration limits entirely (NFR-U2-2's soft target — seconds-to-tens-of-
   seconds, investigate past 60s — sits uncomfortably close to typical serverless function timeout
   ceilings) and requires no new infrastructure: no queue, no separate worker fleet, no scheduled-
   function platform feature. **Recommended** — the smallest reliable mechanism that doesn't fight
   the hosting platform's constraints.

B) Deploy on a serverless/edge platform (e.g. Vercel) and use that platform's native scheduled-
   invocation feature (e.g. Vercel Cron) to periodically hit an endpoint that claims and processes
   one job per invocation — still no message queue, but couples job processing to the platform's
   function-duration limits, which is a real risk given the pipeline's expected duration.

X) Other (describe after [Answer]: below)

[Answer]: X

Railway Hobby as the concrete host, deployed as ONE persistent, long-running Node.js/Next.js
service (Railway's serverless/app-sleeping mode disabled). The same process hosts both the Next.js
app and the `ReportGenerationJob` polling/execution loop — polls Postgres at a short interval,
claims only via the approved atomic compare-and-set, processes only successfully claimed jobs,
uses the approved stale-`IN_PROGRESS` recovery semantics, doesn't rely on an open HTTP request, no
message queue, no separate worker service, no scheduled-function platform feature. Runs as a
SINGLE Railway replica (process-local rate limiter, no current horizontal-scaling need) — but job
correctness must continue to come from the database claim, not from an "only one server" assumption
(don't treat single-replica as a correctness requirement). Add a simple host-native readiness
endpoint (`/healthz`) verifying the process is ready to serve requests — not a deep dependency-health
check that fails merely because King County or Anthropic is temporarily unavailable. Use Railway's
normal persistent Service compute primitive, not Railway Functions/Cron, not Serverless sleeping.
Deliberately reversible, not a product-domain invariant.

### Question 2 — Neon Environment/Branch Strategy for the Deployed Prototype
`shared-infrastructure.md` established Neon as the shared provider; Unit 1 never actually connected
to it (no credentials in that session). This unit is the first real connection.

A) **A single dedicated Neon branch/database for the deployed Unit 2 prototype**, distinct from
   whatever branch a developer might use for local `npm run test:integration` runs — reversible,
   lowest-tier, matches Unit 1's already-approved "lowest tier to start" decision. Migrations
   (`npm run db:migrate`) are applied to this branch as part of deployment, not manually out of
   band. **Recommended.**

X) Other (describe after [Answer]: below)

[Answer]: A

One dedicated Neon branch/database for the deployed Unit 2 prototype, separate from local
development, disposable/test databases, and live integration-test databases — its own
`DATABASE_URL`. Migrations applied automatically as part of deployment via the hosting platform's
pre-deploy mechanism, not a manual out-of-band step; migration failure prevents the new application
version from becoming active. No automatic destructive dev reset/seed operations against this
branch. The first real Neon deployment also closes Unit 1's still-open external-verification
checklist by actually proving migrations apply, PostGIS is enabled, RegulatoryRule/InferencePolicy
persistence work, and ACTIVE-only retrieval behaves correctly —
`external-verification-tracker.md` updated once those tests genuinely succeed.

### Question 3 — Rate-Limit Counter Storage (Pattern 2)
Pattern 2 left this open pending the hosting decision.

A) **In-process memory**, consistent with Question 1's single long-running Node process — no
   Postgres table needed for this, since the counter only needs to survive within one process's
   uptime (a restart clearing rate-limit state is an acceptable, low-stakes trade-off at this
   scale). If Question 1 lands on B (multi-instance/serverless) instead, this answer would need to
   change to a shared store — but under A, in-process is the simplest option consistent with "no
   new infrastructure." **Recommended, contingent on Question 1 = A.**

X) Other (describe after [Answer]: below)

[Answer]: A

In-process memory, appropriate given exactly one Railway replica. A process restart clearing
rate-limit state is an accepted prototype trade-off. Requirements: bounded memory usage; stale
counter entries expire/are cleaned up; only failed lookups increment the counter; successful access
never increments it; rate-limited and ordinary unknown-token responses stay externally
indistinguishable; raw report tokens are never used as limiter keys; source identity comes from a
server-derived/trusted deployment context, not an arbitrary client-supplied forwarding header —
Railway's actual proxy/client-address behavior must be verified and trusted-proxy handling
configured explicitly during implementation before relying on an IP header. If Unit 2 ever scales
beyond one replica, this in-memory limiter becomes an explicit infrastructure assumption to
revisit. No Redis introduced now.

### Question 4 — MapLibre Basemap/Tile Provider
tech-stack-decisions.md fixed MapLibre GL JS as the renderer and explicitly deferred the tile
source, warning against relying on OSM's community tile server for production use.

A) **A free/low-tier hosted vector-tile provider with clear usage terms appropriate for a low-
   volume prototype** (e.g. MapTiler's or Stadia Maps' free tier — either is a reversible,
   low-commitment choice; exact provider selection is an implementation detail, not an
   architectural one) — an API key is required (env-var, per the existing secrets pattern) but no
   new infrastructure category is introduced (it's a hosted third-party service the frontend calls
   directly, the same shape as any other external API this project already uses). **Recommended.**

X) Other (describe after [Answer]: below)

[Answer]: X

MapTiler Cloud, on its free tier — appropriate for development/evaluation/R&D matching Unit 2/Unit
0C prototype usage, with more than sufficient scale for expected prototype traffic. **Explicit
commercial boundary**: the free tier must not be silently carried forward as the final commercial
production plan — before Commercial GO/paid public usage, review MapTiler's then-current commercial
plan and either upgrade or deliberately choose another provider; recorded as a Commercial-GO
infrastructure checkpoint. **API-key treatment**: a MapTiler browser API key is not a secret in the
`DATABASE_URL`/`ANTHROPIC_API_KEY` sense — a browser map necessarily exposes it. Create a dedicated
Permit Preflight browser key restricted via MapTiler's Allowed HTTP Origins feature to the deployed
application domain, with separate dev/localhost handling rather than opening the production key to
arbitrary origins. Never use a MapTiler service token/private backend credential in client-side
code. `tile.openstreetmap.org` is not used as the deployed application's basemap backend.

### Question 5 — PDF/Headless-Browser Runtime and Derived-PDF Storage
tech-stack-decisions.md fixed "server-side headless-browser HTML-to-PDF"; NFR Design's Pattern 6
left the runtime/storage mechanics to this stage.

A) **The headless browser (e.g. a Chromium instance via Playwright/Puppeteer) runs in-process
   within the same long-running Node server** (Question 1) — no separate rendering microservice.
   Rendered `ReportPdfRendering` bytes are stored **directly in the existing Postgres database**
   (a `bytea`/binary column) rather than introducing a new object-storage service — PDFs are small
   documents at low volume, so reusing the already-approved database avoids a new storage
   category. **Recommended.**

B) Store rendered PDFs in a dedicated object-storage service (e.g. S3-compatible storage) instead
   of the database — more conventional for larger-scale document storage, but a new infrastructure
   category not obviously justified at this volume.

X) Other (describe after [Answer]: below)

[Answer]: A

Headless Chromium runs inside the same Railway application deployment — no PDF microservice.
Because browser-based rendering is now a genuine runtime requirement, the browser runtime must be
made reproducible (an application container/Dockerfile pinning the required Chromium runtime and
system dependencies) rather than assuming the host happens to contain a compatible installation.
Prefer reusing the already-selected Playwright ecosystem for browser control rather than adding an
unrelated automation stack solely for PDF generation — exact package split (Playwright vs.
Playwright Core + packaged/system Chromium) is an implementation choice. Limit PDF rendering
concurrency conservatively at prototype scale so multiple Chromium instances can't unexpectedly
exhaust the single application's memory. `ReportPdfRendering` storage: the existing Neon/Postgres
database — `reportArtifactId`, `renderingVersion`, `generatedAt`, `contentHash` where used, PDF
bytes in `bytea` — acceptable at prototype volume since PDFs are derivative, low-volume artifacts;
no object storage introduced solely for this. Explicitly reversible: if PDF count/size becomes
meaningful later, moving `ReportPdfRendering` bytes to object storage should not alter
`EvidenceReportArtifact` or the report-generation domain model.

### Question 6 — Secrets Handling for the Deployed Runtime
Infrastructure Design's Unit 1 baseline established env-var-only secrets (local `.env`, CI secret
storage). This unit is the first to need secrets in an actual deployed environment.

A) **Extend the same pattern to the chosen hosting platform's native environment-variable/secrets
   feature** (every mainstream host — Render, Fly.io, Railway, etc. — provides this) — no new
   secrets-manager service. Credentials in the deployed environment: `DATABASE_URL`,
   `ANTHROPIC_API_KEY` (both already established), plus the new basemap provider's API key
   (Question 4). **Recommended**, unchanged in spirit from Unit 1's already-approved decision.

X) Other (describe after [Answer]: below)

[Answer]: X

Railway's native environment-variable/sealed-variable facilities, but with an explicit distinction
between SERVER SECRETS (`DATABASE_URL`, `ANTHROPIC_API_KEY`, any future server-only provider
credential — never exposed through `NEXT_PUBLIC_*` variables, never serialized into browser
bundles, never logged, configured via Railway's native variable/sealed-variable mechanism; local
dev continues using gitignored `.env`; CI continues using GitHub Actions encrypted secrets) and
PUBLIC CLIENT CONFIGURATION (the MapTiler browser key — intentionally browser-visible, not a
server secret; exposed via the appropriate client-side configuration mechanism and protected by
MapTiler origin restrictions rather than treated as secret or assumed hidden by an environment
variable; separate prototype/dev credentials maintained where practical).

### Question 7 — CI / Test-Suite / Deployment Separation
No CI platform has been chosen yet in this project (all testing this session has run manually).
This unit introduces the first real deploy target, making "how do tests gate a deploy" a genuine
open question.

A) **A standard git-triggered CI pipeline** (e.g. GitHub Actions, matching this project's existing
   GitHub-hosted repo) running the deterministic suite (`npm test`) and the small Playwright smoke
   suite (NFR-U2-6) on every push — both **blocking**: a failure prevents deployment. The
   credentialed live-integration suite (`npm run test:integration`'s King County/Legistar/Neon/
   Anthropic tests) runs separately — either on a schedule or manual trigger, **not** blocking
   every deploy, since it depends on live external services whose transient unavailability
   shouldn't block shipping an otherwise-correct change (consistent with the standing "don't make
   transient public-source availability a requirement for the gating suite" principle from Build &
   Test). Deployment itself is triggered by the hosting platform's own git-integration (e.g.
   deploy-on-push-to-main after CI passes), not a separately-built deployment pipeline.
   **Recommended.**

X) Other (describe after [Answer]: below)

[Answer]: X

GitHub Actions as the CI gate, Railway's GitHub integration for deployment — but made structurally
real: a protected-main workflow (PR -> GitHub Actions -> required checks pass -> merge to
protected main -> Railway observes main -> pre-deploy migration -> health check -> deployment
active), since a host's "deploy on push to main" feature does not itself wait for a separately-
triggered GitHub Actions workflow. Required blocking PR checks: dependency install; `npm run
typecheck`; `npm test` (deterministic/domain + component tests); production Next.js build; the
small Playwright browser smoke suite (run against a locally-started/CI app with controlled fixture
data where possible, so transient King County/Anthropic availability can't make the deployment gate
flaky). The live-integration suite (King County live, Legistar, Neon, Anthropic) stays separate and
non-blocking for ordinary deployments — run manually, on a schedule, and/or when specifically
changing an adapter/integration; failures stay visible but don't prevent an otherwise-correct
deploy, since an external government/API outage isn't application correctness. Main must actually
be branch-protected so required checks genuinely prevent merge/direct deployment — "CI blocks
deploy" isn't claimed unless that protection is actually configured. Railway auto-deploys only from
protected main.

### Question 8 — Minimal Logs/Runtime Visibility
The Founder/Operator needs *some* way to see what a deployed prototype is doing, without building
Unit 3's Admin/Support Service early.

A) **The existing structured JSON logger's output, captured by the hosting platform's native log
   viewer/aggregation** (every mainstream host captures stdout/stderr and provides a log-viewing
   UI or CLI) — no new logging/observability platform. This already includes `SOURCE_FAILURE` and
   the new `STAGE_TIMING` events (NFR Design Pattern 4), which is sufficient operator visibility
   for a founder-triggered prototype at this scale. **Recommended.**

[Answer]: A

Railway's native log collection/viewer, with structured JSON continuing to stdout/stderr through
the existing logger. Required useful events: `SOURCE_FAILURE`, `STAGE_TIMING`, job claim, stale-job
recovery, job COMPLETE/FAILED, validation-rejection category, PDF render failure, credential
revocation/rotation event, rate-limit event. Never logged: `reportAccessToken`, `tokenHash`,
`DATABASE_URL`, `ANTHROPIC_API_KEY`, MapTiler credentials, raw user-submitted payloads unless
specifically safe/redacted. No Datadog/Sentry/OpenTelemetry collector/APM platform/separate log
storage required for Unit 2 — Railway's native health check + native logs are sufficient. If Build
& Test later demonstrates real report failures are hard to diagnose at this visibility level,
improve the structured events first before adding an observability platform.
