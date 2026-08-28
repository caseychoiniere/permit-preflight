# Unit 5 — Logical Components (Vacant Land)

**Targeted, delta-only** — responsibility boundaries for the 4 existing logical layers that
`nfr-design-patterns.md`'s two new patterns touch. No new logical component/service is introduced;
these are boundary clarifications on components this project already has.

## Persistence / Migration Layer (`src/db/schema.ts`, `src/db/migrations/`, `screening-request/repository.ts`)

**Owns**:
- Preserving existing data exactly — every pre-Unit-5 row's `project_type`/`project_details`
  survive the EXPAND/MIGRATE phases byte-for-byte (NFR-U5-1, `nfr-design-patterns.md` §1 Phase 2)
  — and that the workflow-shape `CHECK` constraint is enforced (Phase 4) before any `VACANT_LAND`
  row is ever written (Phase 5), never the reverse.
- Enforcing workflow-shape integrity — the database-level `CHECK` constraint (NFR-U5-2) is the
  final, authoritative guarantee that an invalid `workflowType`/field combination cannot be
  persisted, not merely an application-code convention.
- Owning schema rollout compatibility — the EXPAND → MIGRATE → APPLICATION ROLLOUT →
  PRE-ACTIVATION ENFORCEMENT → ACTIVATE → CONTRACT/CLEANUP sequencing itself
  (`nfr-design-patterns.md` §1, **corrected per founder review** to enforce the database `CHECK`
  constraint *before* `VACANT_LAND` write activation, not after) is this layer's responsibility; no
  other logical component decides when the `CHECK` constraint is safe to finalize, and no
  `VACANT_LAND` write is enabled before that constraint is already enforced.

**Does not own**: regulatory rule matching (§ Regulatory Evaluator, below), geometry validity (§
Spatial Analysis, below), or commercial/public availability (BR-U5-9's Coverage Readiness gate
lives in `screening-request/authorization.ts`, unchanged by this document).

## Spatial Analysis / PostGIS Adapter (`src/spatial-analysis/postgis-adapter.ts`)

**Owns**:
- Geometry validation and computation — every `ST_IsValid` check, every `ST_Difference`/
  `ST_Intersection`-class subtraction for the new buildable-envelope capability lives here,
  alongside the existing `computeSetbackDistances`/`computeParcelAreaSqFt` functions it already
  owns.
- Returning `SpatialComputationResult<T>`-pattern outcomes (`nfr-design-patterns.md` §2) — a
  successful spatial result, or an **explicit data-quality-uncertainty** outcome — as its output
  contract to callers.
- Canonical SRID discipline and PostGIS-as-sole-spatial-source-of-truth (NFR-U5-9/-10) — no caller
  of this adapter reprojects, approximates, or cross-checks geometry outside it.

**Does not own**: regulatory classification. This adapter **never** decides whether a
`DATA_QUALITY_UNRESOLVED` result means a `Finding` is `REQUIRES_VERIFICATION`, and never decides
whether a `COMPUTATION_FAILURE` should fail the report-generation job — those are the Report-
Generation Orchestrator's and Regulatory Evaluator's responsibilities (below). This boundary
matters specifically because it is the one the Final Correction's ECA-geometry defect crossed
without being named as a boundary violation — restated here as a standing rule, not just a
one-time fix.

## Report-Generation Orchestrator (`src/report-generation-orchestrator/pipeline.ts`,
`stage-timing.ts`)

**Owns**:
- Mapping `DATA_QUALITY_UNRESOLVED` outcomes from the Spatial Analysis adapter onto the
  evaluator's existing fail-closed evidence path (`REQUIRES_VERIFICATION`) — this translation from
  the internal `SpatialComputationResult` shape to the external `BuildableEnvelopeFacts`
  discriminated fields happens here, at the pipeline layer, per `nfr-design-patterns.md` §2's
  mapping table.
- Routing true `COMPUTATION_FAILURE` outcomes into the **existing** job failure/retry behavior
  (`ReportGenerationJobState.FAILED`, the existing retry/stale-claim mechanism, NFR-U5-25) — this
  orchestrator does not invent a new failure path for vacant-land; it reuses the one every other
  pipeline stage already fails into.
- Preserving `STAGE_TIMING` instrumentation for the new buildable-envelope stage — wrapped in
  `withStageTiming` exactly like `SPATIAL_ANALYSIS`/`RULES_ENGINE` today (NFR-U5-21), with one new
  `PipelineStage` value added, not a new instrumentation mechanism.

**Does not own**: geometry computation itself (delegated to Spatial Analysis) or the final
regulatory conclusion (delegated to the Regulatory Evaluator, below) — this layer is strictly a
router/translator between the two, matching its existing role for every other Unit 1/4 pipeline
stage.

## Regulatory Evaluator (`src/regulatory-rules-engine/evaluate.ts` and Unit 5's own vacant-land
evaluation logic)

**Owns**:
- Consuming valid spatial facts/evidence status as already-classified input
  (`BuildableEnvelopeFacts`, `DensityFacts`) — by the time a fact reaches this layer, the
  three-way `SpatialComputationResult` distinction has already been resolved by the orchestrator
  into either a usable value or a `REQUIRES_VERIFICATION` evidence state; the evaluator never
  re-inspects raw PostGIS output.
- Querying `RegulatoryRule` rows by `RegulatoryRuleApplicabilityScope` (Correction 4) and producing
  the `uncoveredConstraintTypes`-style no-`ACTIVE`-coverage disclosure when applicable — unchanged
  from Functional Design, restated here as this layer's boundary, not the orchestrator's or the
  Spatial Analysis adapter's.

**Does not own**: infrastructure failure handling. **The evaluator never catches a
`COMPUTATION_FAILURE`/spatial-engine exception and converts it into a regulatory `Finding` of any
classification** (not `REQUIRES_VERIFICATION`, not any other value) — a true computation failure
never reaches this layer as data at all; it is intercepted and routed to the job failure path by
the Report-Generation Orchestrator before the evaluator is ever invoked for that stage's output.
This is the single most important boundary this document establishes: it is the concrete mechanism
that makes NFR-U5-27/-28's three-way distinction (evidence uncertainty / no-coverage disclosure /
computation failure) impossible to accidentally collapse back into two, because each of the three
outcomes is produced and consumed by a different, single-purpose layer rather than being a tag one
layer could mislabel.

## Summary — Responsibility Boundary Table

| Layer | Produces | Never produces |
|---|---|---|
| Persistence/Migration | Valid, workflow-shape-integrity-checked rows | A `VACANT_LAND` row written before the database `CHECK` constraint (Phase 4) is enforced, or any row violating the discriminated invariant thereafter |
| Spatial Analysis/PostGIS Adapter | `SUCCESS` / `DATA_QUALITY_UNRESOLVED` spatial results | A regulatory classification of any kind |
| Report-Generation Orchestrator | `REQUIRES_VERIFICATION` evidence (from `DATA_QUALITY_UNRESOLVED`) / routed job failures (from `COMPUTATION_FAILURE`) | A fabricated geometry/area; a swallowed computation failure |
| Regulatory Evaluator | `Finding`s / `uncoveredConstraintTypes` disclosures, from already-classified input | A `Finding` derived from a raw infrastructure failure |

No new logical component is added to this table — every row names an existing module this project
already has.
