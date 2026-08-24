# Unit 2: Logical Components

The component set stays deliberately small — one module per NFR Design pattern that needs a real
code boundary, nothing more. No component here is infrastructure (a deployable service, a data
store technology, a message broker) — each is application code living inside the same modular
monolith Unit 1 established, following the same `src/{component}/` organization convention
(unit-of-work.md's Code Organization Strategy, unchanged).

| Logical Component | Owns | Implements Pattern(s) | Why No New Infrastructure |
|---|---|---|---|
| `report-access` (new) | `ReportAccessCredential` generation/hashing/lookup/revocation/rotation; the failed-lookup rate limiter | Pattern 1, Pattern 2 | A handful of pure functions plus one small Postgres table (credential hash + active flag) and a counter (in-process or a small table) — the same shape as Unit 1's existing persisted entities, not a new subsystem. |
| `report-generation-job` (new — Unit 1 only specified the domain type, never implemented it) | `ReportGenerationJob` claim/recovery, `retryAttempts`/`failureReasons` bookkeeping | Pattern 3 | Two atomic SQL statements against the already-approved Postgres database — no queue broker, no distributed lock service. |
| `shared/logger.ts` (extended, not new) | The new `STAGE_TIMING` event type | Pattern 4 | Already exists (Unit 1) — this is one additional event shape, not a new component. |
| `spatial-analysis/postgis-adapter.ts` (new module inside the existing `spatial-analysis` component) | Real PostGIS query execution for setback/coverage computation | Pattern 5 | Lives inside Unit 1's already-established `spatial-analysis` component boundary, alongside (not replacing) the existing pure `geometry.ts` reference module — extends an existing component, doesn't introduce a new one. |
| `evidence-report-artifact` (new — Unit 1 never implemented this Application-Design-specified component) | `EvidenceReportArtifact` (immutable), web-rendering assembly, and — as a clearly separate concern within the same component — `ReportPdfRendering` (disposable derivative) | Pattern 6 | One persisted table for the artifact, one small persisted table for cached PDF renderings, plus the headless-browser render call already selected in tech-stack-decisions.md. No separate document-generation service. |
| `screening-request` (new — Unit 1 never implemented this Application-Design-specified component) | `ScreeningRequest`, its snapshot, `ShedProjectConfiguration`, `LotLineRoleAssignment`, `GenerationAuthorization` | (domain entities, no new NFR pattern beyond Boundary Validator reuse) | Plain application code + persisted rows in the already-approved database — no new infrastructure. |
| `report-generation-orchestrator` (new — the Report Generation Orchestrator Service, first implemented here) | Pipeline coordination: claims a job (via `report-generation-job`), calls Property Intelligence, `spatial-analysis` (including the new PostGIS adapter), the Regulatory Rules Engine, Report Explanation, and `evidence-report-artifact` | Ties Patterns 1-6 together | An orchestration module invoked by whatever process claims jobs (a scheduled task, a worker process, or a request-triggered check — Infrastructure Design's choice of *how* claiming is invoked, not *whether* new infrastructure is needed to claim). |
| `project-preflight` (new — Project Preflight Service, shed path only) | `authorizeReportGeneration`, the BR-U2-1 readiness check | (orchestrates existing components, no new pattern) | Thin orchestration over `screening-request`, Parcel Resolution (Unit 1, unchanged), and Data Source Registry (Unit 1, unchanged) — no new component of its own beyond a coordination module. |
| Frontend: `ProjectConfigurationFlow`, `ReportView` trees | UI (frontend-components.md, unchanged from Functional Design) | Pattern 7 (validation reuse), Pattern 8 (test pyramid) | Standard Next.js application code — no new backend infrastructure. |

## Explicitly Not Introduced (per the user's proportionality instruction)

- **No message queue/broker** — `ReportGenerationJob`'s `QUEUED` state is a row in Postgres, claimed
  via Pattern 3's atomic SQL, not a queue service.
- **No distributed lock service** (e.g. Redis-based locking, Zookeeper) — Pattern 3's atomic
  `UPDATE ... WHERE state = ... RETURNING` is Postgres's own concurrency control, sufficient at
  this volume.
- **No Redis or other dedicated cache** — Pattern 2's rate limiter and Pattern 6's PDF cache both
  fit in the already-approved Postgres database or in-process memory at this volume.
- **No tracing/APM platform** — Pattern 4 extends the existing structured logger.
- **No separate document-generation microservice** — Pattern 6's PDF rendering is an in-process
  (or same-deployment) headless-browser call, not a standalone service.
- **No dedicated GIS/geometry service** — Pattern 5's PostGIS adapter is application code against
  the already-approved shared Neon+PostGIS database.
- **No authentication framework** — Pattern 1's `ReportAccessCredential` is a narrow, prototype-
  scoped bearer-token mechanism, explicitly not a general auth system (per the user's Q1 answer).

## Deferred to Infrastructure Design

- Concrete hosting/deployment target for the first real running Next.js app and whatever process
  actually claims/executes `ReportGenerationJob`s (a cron-style poller, a background worker, a
  request-triggered check — the pattern in `nfr-design-patterns.md` Pattern 3 works under any of
  these, since the safety guarantee comes from the atomic SQL, not from *how* claiming is invoked).
- The concrete storage mechanism for Pattern 2's rate-limit counters (in-process vs. a Postgres
  table) — depends on whether the deployment target runs as a single long-lived process or
  something more ephemeral.
- The basemap/tile-source provider for MapLibre GL JS (tech-stack-decisions.md, unchanged).
- The specific headless-browser package/runtime integration for PDF rendering.
- `staleClaimThreshold`'s concrete value (Pattern 3) — set from Build & Test's real timing
  measurements (Pattern 4's data), not invented in advance.
