# Unit 5 — Tech Stack Decisions (Vacant Land)

**No new tech stack, library, or service is introduced.** Both new NFR-relevant surfaces
(`nfr-requirements.md` §1-4) are addressed entirely within the existing stack:

| Surface | Decision | Rationale |
|---|---|---|
| Persistence/schema generalization (§1-2) | Extend the existing `screening_requests` and `regulatory_rules`-equivalent tables in place (nullable columns + a `CHECK` constraint) via the existing Drizzle/Postgres migration tooling already used for every prior schema change in this project. No new ORM, no new migration framework. | Matches Units 1-4's own precedent (`src/db/schema.ts`, `src/db/migrations/`) — this project has never introduced a second persistence mechanism, and Correction 6/NFR-U5-1 through NFR-U5-4 do not require one. |
| PostGIS buildable-envelope geometry (§3-4) | Extend the existing `src/spatial-analysis/postgis-adapter.ts` module with new `ST_Difference`-class query functions, reusing the exact same PostGIS extension, connection pool, and SRID-reprojection discipline `computeSetbackDistances`/`computeParcelAreaSqFt` already use. No new GIS library (e.g. no Turf.js/JSTS application-side geometry engine), no new spatial service. | Explicit founder instruction ("do not add a new GIS library or service"); PostGIS already computes every other spatial fact in this project — introducing a second spatial engine would create exactly the kind of dual-source-of-truth risk NFR-U5-10 exists to prevent. |
| Timing/failure/retry instrumentation (§4-5) | Reuse `withStageTiming` (`src/report-generation-orchestrator/stage-timing.ts`) and the existing Workflow SDK retry/stale-claim/failure-state machinery (`src/report-generation-job/repository.ts`) unchanged, adding one new `PipelineStage` value for the buildable-envelope computation. No new observability product, no new job/queue system. | Matches Unit 4's own NFR Design precedent ("no new reliability mechanism, no new observability product") — the new work is additional *load* on an existing, already-instrumented tier, not a new tier. |

**Rollout mechanism for the schema migration (NFR-U5-3)** is explicitly **not prescribed here** —
per instruction, this document states the safety invariant (no interval where new code can write
an unrepresentable record, or old code can violate the new invariant), not the specific
expand-migrate-contract or feature-gated-write pattern. That mechanism selection is a Code
Generation decision, made against the real migration tooling already in place.

**No new performance-monitoring, APM, or GIS-specific tooling is added** — `STAGE_TIMING`'s
existing log-event mechanism remains the sole source of real timing data for the new stage, per
NFR-U5-21/NFR-U5-23.
