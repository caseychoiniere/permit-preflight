# Unit 2: Deployment Architecture

## The Running System

```
                Browser
                   |
                   | HTTPS
                   v
          Railway — single service
          --------------------------
          Next.js application
          Report job poller
          Report orchestrator
          PostGIS adapter
          Report explanation
          Headless Chromium/PDF
          in-memory rate limiter
          structured logger
          --------------------------
             |             |
             |             +------> Anthropic
             |
             +------> King County / Legistar
             |
             +------> Neon PostgreSQL + PostGIS

Browser:
  |
  +------> MapTiler vector tiles
           using origin-restricted public browser key
```

One Railway service, one process, one replica. Everything inside the box above — the Next.js
application, the `ReportGenerationJob` poller, the Report Generation Orchestrator, the PostGIS
adapter, Report Explanation's AI client, the headless-Chromium PDF renderer, the in-memory rate
limiter, and the structured logger — runs in that single long-running Node process. Nothing in
this diagram is a separate deployable unit.

## Request/Execution Flows

### Synchronous (request/response)
```
Browser -> Railway (Next.js) -> [validate, read/write via Screening Request, Report Access
           Credential, etc.] -> Neon Postgres -> response
```
Ordinary page loads, project-configuration submission, `authorizeReportGeneration`, and
`getReport`-via-token lookups are all synchronous request/response work against Neon — no
background execution involved.

### Asynchronous (report generation)
```
authorizeReportGeneration creates a QUEUED ReportGenerationJob (a row in Neon)
        |
        v
In-process poller (same Railway process, no separate worker) periodically checks for QUEUED jobs
        |
        v
Atomic claim (QUEUED -> IN_PROGRESS, Postgres compare-and-set) -- at most one claimant, ever
        |
        v
Pipeline runs IN-PROCESS: Property Intelligence -> PostGIS adapter -> Regulatory Rules Engine
        -> Report Explanation (Anthropic) -> Evidence & Report Artifact
        |
        v
Job -> COMPLETE (artifact reference) or FAILED (explicit terminal state)
```
This never depends on an HTTP request remaining open — the job was created by a request that has
already returned; the poller picks it up independently, on its own schedule, within the same
process.

### PDF (lazy, derived)
```
Browser requests PDF via reportAccessToken
        |
        v
resolveByAccessToken -> EvidenceReportArtifact (already COMPLETE, immutable)
        |
        v
Existing ReportPdfRendering for this artifact/version? -> yes: return it
                                                         -> no: render (headless Chromium, in-process)
                                                                -> persist ReportPdfRendering (bytea, Neon)
                                                                -> return it
```
Never re-runs Property Intelligence, PostGIS, the Rules Engine, or Report Explanation — reads only
the already-persisted, immutable artifact.

## External Dependencies (all pre-existing or already-approved)

| Dependency | Called From | Auth |
|---|---|---|
| Neon PostgreSQL + PostGIS | The Railway process (all components) | `DATABASE_URL` (server secret) |
| King County GIS (address, property-info, parcel-polygon) | Parcel Resolution (address/property-info, unchanged from Unit 1); **Property Intelligence** (parcel-polygon fetch by confirmed PIN — retrieval, validation, and provenance/`qualityCaveat`/`evidenceQuality` attachment all happen here, never in the PostGIS adapter) | None (public API) |
| Seattle Legistar | Regulatory Source Access (Unit 1, unchanged) | None (public API) |
| Anthropic | Rule Research Assistant, Report Explanation | `ANTHROPIC_API_KEY` (server secret) |
| MapTiler Cloud | The **browser**, directly — not proxied through Railway | Origin-restricted public browser key |

Note the one asymmetry: every other external call happens server-side, from inside the Railway
process; MapTiler tiles are fetched directly by the browser, since the API key is public/
origin-restricted rather than a server secret.

## Explicitly Not Present

Redis, a queue broker, a separate worker deployment, serverless functions, cron-based job
execution, a distributed lock, an object-storage service, a PDF microservice, a GIS microservice,
an APM/tracing platform, load-balancer architecture, multiple app replicas, Kubernetes. If a future
unit's evidence (not speculation) demonstrates a concrete need — e.g. real multi-replica scaling
requirements — that becomes a reviewed infrastructure change at that time, revisiting specifically
the in-memory rate-limiter and single-replica job-poller assumptions this design deliberately
relies on.

## CI/CD Flow

```
Pull request
    |
    v
GitHub Actions (dependency install, typecheck, npm test [deterministic + component],
                production Next.js build, Playwright smoke suite)
    |
    v
required checks pass  ---->  merge blocked if any check fails
    |
    v
merge to protected main
    |
    v
Railway observes main (GitHub integration)
    |
    v
pre-deploy: migrations applied to the dedicated Neon branch (failure blocks activation)
    |
    v
health check (/healthz)
    |
    v
new deployment becomes active
```

The credentialed live-integration suite (King County live, Legistar, Neon, Anthropic) is
deliberately **outside** this required-checks list — run manually, on a schedule, or when
specifically touching an adapter/integration. Its failures remain visible but never block an
otherwise-correct deploy, consistent with the standing project principle that transient external-
source availability is never a gate on the deterministic/deployment path.
