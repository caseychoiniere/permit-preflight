# Unit 1 — Infrastructure Design

Deliberately minimal, per the approved plan. Unit 1 introduces exactly one piece of real
infrastructure (the database) and no live-serving infrastructure of any kind.

```
Local / CI TypeScript tooling
        |
        +--> external public data sources (King County GIS/Assessor, Seattle GIS/Socrata,
        |     FEMA NFHL, Municode/City Clerk-Legistar via browser-assisted research)
        |
        +--> Anthropic API (Rule Research Assistant only)
        |
        +--> shared Neon PostgreSQL + PostGIS
```

There is no deployed Permit Preflight application runtime in Unit 1.

## Infrastructure Components

| Component | Decision | Notes |
|---|---|---|
| Database | **Neon** (managed PostgreSQL + PostGIS) | Lowest/free tier to start; PostGIS enabled; shared across all future units, not unit-specific. Reversible provider decision — see `shared-infrastructure.md`. |
| Compute/hosting | **None** | No application server, container, or function deployed. Code runs as local dev processes and CI jobs only. |
| Networking (load balancer, API gateway) | **None** | Nothing is served over the network yet. |
| Messaging/queues | **None** | Confirmed N/A per NFR Design; no async infrastructure introduced. |
| Caching | **None** | Confirmed N/A per NFR Requirements/Design. |
| Monitoring/observability | **None (infrastructure-level)** | Structured console/log output only — see logging note below. No dashboards, alerting, APM, or centralized logging platform. |
| Secrets | **Environment variables** | Local: gitignored `.env` + committed `.env.example` (placeholders only). CI: platform-native encrypted secret storage, injected only into jobs that need it. No dedicated secrets-manager infrastructure. |
| Scaling | **None** | No autoscaling infrastructure — nothing is running as a scalable service. |

## Logging (Dev-Time, Not Infrastructure)
Structured console/log output, useful for diagnosing: external-source failures/retry exhaustion,
`RESOLUTION_UNAVAILABLE` outcomes, schema-validation failures, rule-governance lifecycle
transitions, deterministic evaluation failures, and live integration-test failures. Implemented in
code (Code Generation stage), not provisioned as infrastructure. Secrets/credentials are never
written to logs (NFR-5, unchanged).

## Explicitly Not Introduced (per the approved plan)
Queues, caches, load balancers, API gateways, Kubernetes, production monitoring infrastructure,
multi-region infrastructure, dedicated secrets-manager infrastructure, autoscaling infrastructure —
none of these are justified by any concrete Unit 1 requirement. This list is preserved from the
user's explicit instruction, not narrowed or expanded here.
