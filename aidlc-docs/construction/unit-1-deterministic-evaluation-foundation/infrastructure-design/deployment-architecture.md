# Unit 1 — Deployment Architecture

**There is no deployment in Unit 1.** This document exists (per the standard Infrastructure Design
artifact set) to state that explicitly and describe how Unit 1's code actually runs instead.

## Execution Surfaces

1. **Local development** — a developer runs Unit 1's TypeScript code (domain logic, internal
   tooling/scripts for exercising the RRAG governance workflow, evaluation logic) directly against
   Neon (dev branch/database) and, where needed, live external sources or the Anthropic API, using
   local environment variables for credentials.
2. **CI-executed deterministic tests** — the fixture-based domain test suite (Unit 0B's real,
   captured data) runs with no network access and no external credentials, gated on every change.
3. **CI-executed external-source integration/health tests** — a separate, smaller CI job (or
   manually triggered) exercises real external sources, using CI-injected credentials only for the
   jobs that need them, kept logically separate from the deterministic suite per NFR Requirements'
   fixture strategy.
4. **Internal tooling for rule governance** — scripts/CLI commands exercising RESEARCHED → ... →
   ACTIVE (RRAG-1 through RRAG-8), run locally by the founder, against the same shared Neon
   database.

## What This Explicitly Does Not Include
No application server, container image, serverless function, load balancer, DNS/domain
configuration, or CDN. No CI/CD *deployment* pipeline (a *test*-running CI pipeline is in scope;
deploying anything anywhere is not). These arrive when a later unit (Unit 2 onward) introduces an
actual live runtime — this document will be superseded/extended at that point, not amended
speculatively now.
