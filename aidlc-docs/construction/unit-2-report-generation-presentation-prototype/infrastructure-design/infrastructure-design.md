# Unit 2: Infrastructure Design

Unit 2 is the first unit with a real deployed runtime. Every decision below maps directly to an
already-approved NFR Design pattern or logical component — nothing here is speculative.

## Component-to-Infrastructure Mapping

| Component | Infrastructure Choice | Rationale |
|---|---|---|
| Next.js application (web + API routes) | **Railway**, one persistent Service (Hobby tier), serverless/app-sleeping **disabled** | A traditional long-running Node process, not request-scoped serverless functions — required so background job execution isn't bound by a function's execution-duration ceiling (NFR-U2-2's soft targets sit close to typical serverless timeouts). |
| `ReportGenerationJob` polling/execution loop | In-process, inside the same Railway service | Polls Postgres at a short interval; claims only via the atomic compare-and-set (NFR Design Pattern 3); doesn't depend on an open HTTP request; no queue, no separate worker service, no scheduled-function feature. |
| Database (`RegulatoryRule`, `InferencePolicy` — Unit 1; `ScreeningRequest`, `ReportGenerationJob`, `EvidenceReportArtifact`, `ReportPdfRendering`, `ReportAccessCredential` — Unit 2) | **Neon PostgreSQL + PostGIS**, one dedicated branch for the deployed prototype, distinct `DATABASE_URL` from local dev/integration-test branches | Already-approved shared provider (Unit 1 Infrastructure Design); Unit 2 is the first to actually connect. Migrations applied automatically as part of deployment (Railway pre-deploy step) — a migration failure prevents the new version from becoming active. No destructive dev reset/seed against this branch. |
| PostGIS spatial queries | Same Neon database, via the dedicated adapter (NFR Design Pattern 5) | No separate GIS service. |
| Failed-token rate limiter (Pattern 2) | **In-process memory**, within the single Railway replica | Appropriate given exactly one replica; a restart clearing state is an accepted prototype trade-off. Becomes an explicit assumption to revisit if Unit 2 ever scales beyond one replica. |
| Map rendering | **MapLibre GL JS** (client-side library, no server infra) | Unchanged from NFR Requirements/tech-stack-decisions.md. |
| Basemap/tile source | **MapTiler Cloud, free tier** | Free/low-tier hosted vector-tile provider with clear usage terms, sufficient for prototype-scale traffic. **Not** a final commercial decision — see "Commercial-GO Checkpoint" below. |
| PDF rendering | **Headless Chromium (via the Playwright ecosystem), in-process** within the same Railway service, run inside an application container/Dockerfile that pins the Chromium runtime and system dependencies | No PDF microservice. Reproducible runtime (containerized) rather than assuming the host happens to have a compatible Chromium install. Rendering concurrency limited conservatively to avoid exhausting the single application's memory. |
| `ReportPdfRendering` storage | Same Neon/Postgres database, `bytea` column | PDFs are small, low-volume derivative artifacts — no object-storage service introduced. Explicitly reversible: moving these bytes to object storage later must not alter `EvidenceReportArtifact` or the domain model. |
| Secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, future server-only credentials) | Railway's native environment-variable/sealed-variable facility | Extends Unit 1's env-var-only pattern to the real deployed environment. Never exposed via `NEXT_PUBLIC_*`, never in browser bundles, never logged. |
| MapTiler browser key | Client-side configuration (public, origin-restricted) | Intentionally **not** treated as a secret — a browser map necessarily exposes it. Restricted via MapTiler's Allowed HTTP Origins to the deployed application domain, with separate dev/localhost handling. |
| CI | **GitHub Actions**, on a branch-protected `main` | Runs the deterministic suite, typecheck, production build, and the Playwright smoke suite as **blocking** required checks. The credentialed live-integration suite (King County live, Legistar, Neon, Anthropic) is **non-blocking** — run manually/on schedule/on adapter changes — because an external service outage is not application correctness. |
| Deployment trigger | Railway's GitHub integration, deploying only from protected `main` after required checks pass | A host's "deploy on push" feature does not itself wait for a separately-triggered CI run — branch protection is what makes "CI blocks deploy" actually true, not an assumption. |
| Health check | `/healthz` endpoint, configured as Railway's deployment health check | Verifies the process is ready to serve requests — not a deep dependency-health check that fails merely because King County or Anthropic is temporarily unavailable. |
| Logs | Railway's native log collection/viewer, receiving the existing structured JSON logger's stdout/stderr output | No new observability platform. Extended event vocabulary (see below) is judged sufficient before ever introducing one. |

## Secrets Inventory (Deployed Environment)

| Name | Classification | Notes |
|---|---|---|
| `DATABASE_URL` | Server secret | Railway sealed variable; never logged. |
| `ANTHROPIC_API_KEY` | Server secret | Railway sealed variable; never logged; used only by `rule-research-assistant`'s and Report Explanation's Anthropic clients. |
| MapTiler browser API key | Public client configuration, **not a secret** | Origin-restricted via MapTiler, not hidden via environment-variable secrecy — a browser necessarily exposes it. Dedicated Permit Preflight key, separate dev/prod credentials where practical. |

## Log Event Vocabulary (Reaffirmed, Extended)

Required: `SOURCE_FAILURE` (Unit 1), `STAGE_TIMING` (NFR Design Pattern 4), job claim, stale-job
recovery, job `COMPLETE`/`FAILED`, validation-rejection category, PDF render failure, credential
revocation/rotation event, rate-limit event.

Never logged, under any circumstance: `reportAccessToken`, `tokenHash`, `DATABASE_URL`,
`ANTHROPIC_API_KEY`, MapTiler credentials, raw user-submitted payloads unless specifically
safe/redacted.

If Build & Test later demonstrates that diagnosing real report failures is genuinely difficult at
this visibility level, the structured event vocabulary is extended first — an observability
platform is not the default next step.

## Commercial-GO Infrastructure Checkpoint

MapTiler's free tier is a deliberate prototype/R&D choice, not an approved commercial-production
licensing decision. **Before Commercial GO / paid public usage**, review MapTiler's then-current
commercial plan and either upgrade to an appropriate tier or deliberately choose a different tile
provider. This is recorded here so it isn't silently carried forward.

## Carry-Forward Implementation Requirements (verbatim from the approved answers — binding on Code Generation)

1. Railway serverless/app-sleeping stays disabled while the in-process job poller is the execution
   mechanism.
2. Job processing starts exactly once per application process in production; development hot
   reload must not accidentally create accumulating poller loops.
3. Graceful shutdown stops claiming new jobs on receipt of the process termination signal. An
   interrupted in-flight job is recovered later via the approved stale-claim mechanism (NFR Design
   Pattern 3) — shutdown never fabricates a fake completion.
4. Unit 1's outstanding Neon/PostGIS external-verification item (`external-verification-tracker.md`)
   is closed only after this unit's first real deployment genuinely proves migrations apply,
   PostGIS is enabled, `RegulatoryRule`/`InferencePolicy` persistence work, and ACTIVE-only
   retrieval behaves correctly.
5. The outstanding Anthropic external-verification item remains open until a real credentialed
   integration call succeeds — this unit's infrastructure makes that call possible, but doesn't by
   itself satisfy the checklist.
6. MapTiler Free is explicitly a prototype/R&D choice — see the Commercial-GO checkpoint above.
7. A Railway health check is configured for the Next.js service (`/healthz`).
8. Unit 2 stays at one Railway replica unless a later, explicitly reviewed infrastructure change
   revisits the in-memory rate-limiter assumption.

## Explicitly Not Present

Redis, a queue broker, a separate worker deployment, serverless functions, cron-based job
execution, a distributed lock, an object-storage service, a PDF microservice, a GIS microservice,
an APM/tracing platform, load-balancer architecture, multiple app replicas, Kubernetes. None of
these are introduced because the deployed runtime now exists — only because the approved NFR
Design's actual requirements demonstrate a concrete need, which none of the above currently do.
