# Unit 5 — NFR Design Patterns (Vacant Land)

**Targeted, delta-only** — per explicit founder instruction, this document defines exactly the 2
new design patterns NFR Requirements' two new surfaces require. Every other NFR Design category is
recorded as inherited, unchanged, in §3 — not silently omitted.

---

## 1. Migration Design Pattern — Staged EXPAND → MIGRATE → APPLICATION ROLLOUT → PRE-ACTIVATION
ENFORCEMENT → ACTIVATE → CONTRACT/CLEANUP

Satisfies NFR-U5-1 through NFR-U5-4. Governs the `screening_requests` table's transition from its
real current shape (`workflowType` has exactly one member, `EXISTING_PROPERTY`;
`projectType`/`projectDetails` are `text`/`jsonb` `NOT NULL`, confirmed at
`src/screening-request/types.ts:93-95` and `src/db/schema.ts:98-99`) to the `workflowType`-
discriminated shape `domain-entities.md`'s Correction 6 specifies.

**Corrected per founder review**: the prior draft placed write activation (formerly Phase 4)
*before* finalizing the database `CHECK` constraint (formerly Phase 5) — that ordering created a
real interval where a `VACANT_LAND` row could be written while the database was not yet the
authoritative enforcer of the workflow-shape invariant, relying on application validation alone
during that window. Corrected: the workflow-shape `CHECK` constraint is now enforced **before**
`VACANT_LAND` write activation, not after — restated below as a 6-phase sequence with a new
**PRE-ACTIVATION ENFORCEMENT** phase inserted ahead of activation.

**Binding design invariant**: **database capability** (the schema can represent a `VACANT_LAND`
row) and **`VACANT_LAND` write activation** (the application actually writes one) are **separate
events**, deliberately decoupled so the rollout tolerates overlapping old/new application versions
during deployment — no phase below assumes an instantaneous, all-or-nothing cutover.

### Phase 1 — EXPAND (schema, backward-compatible)

- Add the workflow-aware schema in a form every existing row and every currently-deployed code path
  remains valid under:
  - Add the new nullable columns (`screening_intent`, `vacant_land_details`).
  - Relax `project_type`/`project_details`'s `NOT NULL` constraint **only as needed** to
    accommodate the future `VACANT_LAND` shape — this alone does not change what any existing row
    contains or what old code writes.
  - Introduce `workflow_type`'s representation (extending `WorkflowType` beyond its current single
    real member) in a form that defaults every row to `'EXISTING_PROPERTY'` — existing rows and
    existing read/write code remain correct without modification.
- **Explicitly not done in this phase**: no `VACANT_LAND` row is written, in production or
  otherwise, merely because the columns now exist. The database `CHECK` constraint (Phase 4,
  PRE-ACTIVATION ENFORCEMENT) is **not yet applied** — enforcing it before every deployed
  application instance is workflow-aware would itself be an unsafe premature cutover.

### Phase 2 — MIGRATE (data)

- Backfill every existing `screening_requests` row to `workflow_type = 'EXISTING_PROPERTY'`
  explicitly (rather than relying solely on a column default, so the backfill is auditable and
  idempotent).
- Preserve every existing row's `project_type`/`project_details` values **byte-for-byte unchanged**
  (NFR-U5-1) — this phase never rewrites, reinterprets, or defaults those columns.
- Migrate/generalize `RegulatoryRule.applicableProjectType` toward `RegulatoryRuleApplicabilityScope`
  (`domain-entities.md`) **without changing existing SHED/GARAGE matching behavior** (NFR-U5-5) —
  every currently-`ACTIVE` rule continues to match exactly the evaluations it matched before.
- **Verify invariants before proceeding to Phase 3**: a verification pass confirms every row is
  workflow-shape-valid (no `EXISTING_PROPERTY` row missing `project_type`/`project_details`, no row
  yet claiming `VACANT_LAND`) before any workflow-aware application code is deployed.

### Phase 3 — APPLICATION ROLLOUT (code)

- Deploy application code capable of **safely reading both workflow variants** — every
  workflow-specific field access branches on `workflowType` first (`ScreeningRequest`'s
  discriminated union, BR-U5-1), never assumes `EXISTING_PROPERTY`-shaped fields are present.
- A persisted row read in a shape that violates the discriminated invariant **fails closed**
  (NFR-U5-4) rather than being coerced into either variant by guessing which fields to trust — this
  must hold from the moment workflow-aware code is deployed, before `VACANT_LAND` writes are ever
  enabled, so the read path is proven safe under real (if entirely `EXISTING_PROPERTY`-only) traffic
  first.
- This phase can safely overlap Phase 2 in time (workflow-aware code deployed while migration
  verification is still running) precisely because Phase 1 guaranteed every row old code wrote
  remains valid under the new schema, and Phase 3's own read path is fail-closed regardless of what
  it encounters.
- Retirement of pre-workflow-aware application instances is tracked as part of this phase — Phase 4
  cannot begin until every deployed instance is confirmed workflow-aware.

### Phase 4 — PRE-ACTIVATION ENFORCEMENT (database `CHECK` constraint) — **new phase, inserted per
founder correction**

- **Once every deployed application instance is workflow-aware (Phase 3 fully complete), apply and
  finalize the database-level `CHECK` constraint (NFR-U5-2)** — this is the point at which the
  discriminated invariant becomes impossible to violate at the database layer, not merely
  application-enforced. This phase happens **before** any `VACANT_LAND` row is ever written, not
  after.
- Verify the constraint and every invariant it enforces **successfully** before proceeding: an
  `EXISTING_PROPERTY` row must have `project_type`/`project_details` present and every
  vacant-land-only field absent; a (still-hypothetical, none yet written) `VACANT_LAND` row must
  have its vacant-land fields present and `project_type`/`project_details` absent. This
  verification runs against the real, fully-migrated data from Phase 2 — by this point every row is
  `EXISTING_PROPERTY`, so the constraint's `VACANT_LAND` branch is verified structurally (the
  constraint's own logic), not yet against a live example.
- **Explicitly not done in this phase**: no `VACANT_LAND` write is enabled yet — this phase is
  purely about the database becoming the authoritative enforcer, ahead of any application activity
  that could depend on it.

### Phase 5 — ACTIVATE (write enablement)

- Only **after** Phase 4's `CHECK` constraint is confirmed enforced may `VACANT_LAND` writes be
  enabled at all — this is a code/config-level switch, not a schema change, and it is the **first**
  point in the entire sequence at which a `VACANT_LAND` row can be written. **This avoids relying
  solely on application validation during the first `VACANT_LAND`-write window** — by construction,
  the database-level invariant is already authoritative before that window opens.
- **Public paid readiness remains independently `false`** per BR-U5-9's own Vacant-Land Screening
  Coverage Readiness gate — activating the capability to persist a `VACANT_LAND` row is not the
  same event as offering vacant-land screening for purchase, and this phase does not conflate them.
  A `VACANT_LAND` row may eventually be created internally (e.g. for testing or gradual rollout)
  while public paid readiness remains `false` — but per this correction, any such row is already
  protected by the database-level workflow-shape invariant from Phase 4, not merely by application
  code.
- **The commercial-readiness flag (BR-U5-9) is never relied on as the database migration safety
  mechanism, and the reverse is equally true** — the database `CHECK` constraint (data-integrity
  enforcement) and BR-U5-9 (commercial-availability enforcement) are independent gates; neither
  substitutes for the other, and this corrected ordering ensures the data-integrity gate is always
  the first of the two to close.

### Phase 6 — CONTRACT / CLEANUP

- Remove any transitional compatibility behavior (e.g. a temporarily-relaxed constraint, a
  read-path fallback for a pre-Phase-3 row shape) **only once old code can no longer depend on it**
  — i.e., only after every application instance still capable of writing a pre-migration shape has
  been fully retired (already confirmed complete as of Phase 3/4, restated here as the point such
  transitional behavior is finally deleted from the codebase, not merely made dormant).

**Explicitly not prescribed**: exact migration SQL, the number of migration files, or specific
deployment/orchestration mechanics (e.g. how "every deployed instance is workflow-aware" is
verified in this project's actual Vercel deployment model) — all Code Generation decisions, made
against the real migration tooling already in place (`src/db/migrations/`). **No new migration
framework and no generic feature-flag system is introduced** — Phase 5's write-enablement switch is
a narrow, purpose-built check (mirroring BR-U4-9/BR-U5-9's own existing two-layer
readiness-check pattern), not a new general-purpose feature-flagging product.

---

## 2. Spatial Computation Result Pattern — `SpatialComputationResult<T>`

Satisfies NFR-U5-11, NFR-U5-14, NFR-U5-24, NFR-U5-27, NFR-U5-28. Defines **one reusable result
boundary** for the new PostGIS buildable-envelope operations (`setbackConstrainedArea`,
`ecaExclusionArea`, and their combination into `buildableAreaSqFt`/`buildablePolygon`,
`domain-entities.md`) so the three states NFR Requirements already distinguished cannot be
re-conflated by a future implementation detail.

### The three states, exhaustively, mutually exclusive

- **`SUCCESS<T>`** — the PostGIS computation completed successfully and produced a valid,
  evidence-backed result (e.g. a real `areaSqFt`/`polygon` pair, or a `MultiPolygon` per
  NFR-U5-13). Maps onward to a deterministic spatial value the evaluator consumes directly.
- **`DATA_QUALITY_UNRESOLVED`** — PostGIS *successfully inspected* the authoritative input, but the
  data itself cannot support the requested conclusion. Examples, matching NFR-U5-11 exactly:
  `ST_IsValid` returns `false`; required geometry is absent (e.g. no ECA exclusion geometry
  available, only an area estimate — the Final Correction's own ECA-geometry fix); geometry is
  deterministically unusable; required lot-line roles are unavailable (`LotLineRoles.status ===
  "INSUFFICIENT"`). Maps onward to `REQUIRES_VERIFICATION` — and, critically, **does not fail the
  report-generation job** by itself.
- **`COMPUTATION_FAILURE`** — the spatial operation itself failed to *execute*, distinct from
  successfully executing and finding the input unusable. Examples, matching NFR-U5-14 exactly: a
  PostGIS exception; a topology-operation execution error (an `ST_Difference`/`ST_Intersection`
  failure); a database/runtime failure; a timeout. Maps onward to the existing
  `ReportGenerationJob` failure/retry path — **never** `REQUIRES_VERIFICATION`, and **never**
  fabricates a geometry or area in the process.

### Conceptual shape (not a binding representation)

```ts
type SpatialComputationResult<T> =
  | { kind: "SUCCESS"; value: T }
  | { kind: "DATA_QUALITY_UNRESOLVED"; reason: string }
  | { kind: "COMPUTATION_FAILURE"; cause: unknown };
```

The exact TypeScript representation is **not binding** on Code Generation. If the existing
`postgis-adapter.ts` conventions make it cleaner for a true `COMPUTATION_FAILURE` to be expressed
by **throwing** a typed `SpatialComputationError` rather than returning a third union member (so
that ordinary call sites only ever pattern-match `SUCCESS`/`DATA_QUALITY_UNRESOLVED`, and the
report-generation orchestrator's own existing exception-to-job-failure handling catches the
thrown error), that is an acceptable, equally-compliant implementation of this same pattern — the
**binding requirement is the semantic boundary**, restated as the one sentence every call site
must remain true to:

> **success ≠ evidence/data-quality uncertainty ≠ runtime/computation failure.**

### How this maps onto `BuildableEnvelopeFacts`'s existing discriminated fields

This pattern is the *internal* result shape the new PostGIS adapter functions return; it is not a
replacement for `domain-entities.md`'s own `setbackConstrainedArea`/`ecaExclusionArea` discriminated
types, which remain the *external*, evaluator-facing shape. The mapping is direct and one-way:
`SUCCESS` → `{ status: "ESTABLISHED" | "KNOWN", ... }`; `DATA_QUALITY_UNRESOLVED` → `{ status:
"REQUIRES_VERIFICATION", reason }`; `COMPUTATION_FAILURE` is **never** mapped into either
`BuildableEnvelopeFacts` field at all — it never reaches the evaluator as a spatial fact, per
§4/`logical-components.md`'s own responsibility boundary below.

---

## 3. Inherited — No New Pattern

Per explicit instruction, the following NFR Design categories are recorded as **inherited
unchanged** — no new pattern, component, service, or mechanism is introduced for any of them:

- **Authentication/authorization** — unchanged.
- **Privacy/PII** — unchanged; no new personal-data category.
- **Secret management** — unchanged; no new credential/API key.
- **External-service resilience** — unchanged; no new external dependency (Report Explanation's
  existing RGD-5 graceful-degradation behavior is reused unchanged).
- **Vercel Workflow retry architecture** — unchanged; the existing 3-retry/4-attempt backoff
  (`src/report-generation-job/repository.ts:93-95`) governs the new buildable-envelope stage
  exactly as it governs every other pipeline stage.
- **Job state machine** — unchanged; `ReportGenerationJobState`, the existing stale-claim
  (`DEFAULT_STALE_CLAIM_THRESHOLD_MS`) and no-automatic-`FAILED`-retry posture (Unit 3's own
  correction) are reused unchanged.
- **General observability** — unchanged; `withStageTiming`/`STAGE_TIMING`
  (`src/report-generation-orchestrator/stage-timing.ts`) gains one new `PipelineStage` tag, not a
  new instrumentation approach or product.
- **Deployment topology** — unchanged; no new Vercel service, no new deployment target.
- **Backup/recovery** — unchanged; no new data store.
- **Accessibility** — unchanged; `frontend-components.md`'s own Accessibility section already
  confirms Unit 2's existing baseline is followed.
- **Scaling architecture** — unchanged; no new queue, cache, or circuit breaker (NFR-U5-19/-20's
  bounded-work requirements are satisfied by the existing pipeline's own capacity, not a new
  scaling mechanism).

**No new infrastructure, service, queue, cache, GIS library, APM product, or auth mechanism is
introduced anywhere in this document.**
