# Unit 5 — NFR Requirements (Vacant Land)

**Targeted, delta-only** — per explicit founder instruction, this document addresses only the two
genuinely new NFR-relevant surfaces Unit 5 introduces (persistence/schema generalization; new
PostGIS buildable-envelope geometry). Every other NFR category inherits Units 1-4's already-approved
baseline unchanged — stated explicitly in §6, not silently assumed.

---

## 1. Data Integrity / Migration Safety

Governs the `screening_requests` table's transition from one always-`EXISTING_PROPERTY`-shaped
schema (today: `project_type`/`project_details` both `text`/`jsonb` `NOT NULL`, confirmed at
`src/db/schema.ts:98-99`) to the `workflowType`-discriminated shape `domain-entities.md`'s
Correction 6 specifies.

- **NFR-U5-1**: Every pre-Unit-5 `screening_requests` row **remains valid** as an
  `EXISTING_PROPERTY` record after migration — no backfill of a `workflow_type` value is optional;
  every existing row must resolve to `workflow_type = 'EXISTING_PROPERTY'` with its existing
  `project_type`/`project_details` values byte-for-byte unchanged. No existing SHED/GARAGE row's
  `project_type`/`project_details` is rewritten, reinterpreted, or defaulted by the migration.
- **NFR-U5-2**: The new database-level `CHECK` constraint (Correction 6) must make the following
  states **impossible to persist**, not merely discouraged by application code:
  - a `VACANT_LAND` row with non-`NULL` `project_type` or `project_details`;
  - an `EXISTING_PROPERTY` row with non-`NULL` `screening_intent` or `vacant_land_details`;
  - any row where `workflow_type` matches neither branch's required-field pattern.
- **NFR-U5-3**: The rollout ordering (migration + application deploy) must not create an interval
  where either failure mode is possible: (a) new application code able to write a row the
  *currently-deployed* schema cannot represent (an `INSERT`/`UPDATE` against columns that don't yet
  exist or a constraint not yet enforced), or (b) old application code, still running against the
  new schema, able to write a row that violates the new discriminated invariant (e.g. an old
  code path that still assumes `project_type`/`project_details` are always required, inserting a
  `VACANT_LAND` row without knowing the new columns exist). The exact deploy-ordering mechanism
  (expand-migrate-contract, a feature-gated write path, or another safe-rollout pattern) is a Code
  Generation decision — this requirement states the invariant that must hold throughout, not the
  mechanism.
- **NFR-U5-4**: A row read back from the database in a shape that violates the discriminated
  invariant (should the `CHECK` constraint ever be bypassed — e.g. a direct `psql` write, a future
  migration bug) **fails closed on read** — the application never silently coerces an invalid
  persisted shape into either `ScreeningRequest` variant by guessing which fields to trust. This
  extends the same fail-closed reading this project already applies to regulatory evidence
  (`REQUIRES_VERIFICATION` over a guessed `KNOWN`) to persistence-shape validation specifically.

## 2. Regulatory-Rule Scope Backward Compatibility

Governs `RegulatoryRuleApplicabilityScope`'s generalization of the existing `applicableProjectType`
column (`text`, `NOT NULL`, confirmed at `src/db/schema.ts:36`) — a correctness/data-integrity
requirement on an existing governed table, not a new governance model (BR-6/BR-7 remain unchanged).

- **NFR-U5-5**: Every existing SHED/GARAGE `RegulatoryRule` row's applicability is **unchanged** by
  the generalization — the exact rows Units 1/4 already govern continue to match exactly the same
  `EXISTING_PROPERTY`/`ProjectType` evaluations they matched before, with no behavioral difference
  attributable to the schema/type change itself.
- **NFR-U5-6**: No existing `ACTIVE` rule can be accidentally re-scoped to `VACANT_LAND` by the
  generalization, whether by a migration default, a application-code fallback, or an ambiguous
  `NULL`/empty-string interpretation of the new scope representation.
- **NFR-U5-7**: A `VACANT_LAND`-scoped rule can never match an `EXISTING_PROPERTY` evaluation, and
  vice versa — the evaluator's rule-lookup query is deterministic and fail-closed: an ambiguous or
  malformed `applicabilityScope` value on a row excludes that row from matching either workflow,
  never both.
- **NFR-U5-8**: Every already-generated report's evidence/provenance/versioning trail (this
  project's existing immutable-snapshot discipline, Unit 2's Evidence & Report Artifact
  immutability) remains fully reproducible after the schema/type generalization — a historical
  report's recorded rule version/citation is unaffected by how currently-stored `RegulatoryRule`
  rows represent applicability going forward.

## 3. PostGIS Geometry Correctness / Reliability

Governs the new buildable-envelope computation (`BuildableEnvelopeFacts`, `domain-entities.md`) —
materially different in kind from Unit 1/4's existing `computeSetbackDistances`/
`computeParcelAreaSqFt` (`src/spatial-analysis/postgis-adapter.ts`), which measure distance/area
against a *given* footprint rather than deriving a remaining envelope via subtraction.

- **NFR-U5-9**: The new envelope computation enforces the **same canonical SRID discipline**
  already governing every other PostGIS operation in this project (parcel boundary, setback
  geometry, and ECA exclusion geometry are all reprojected to the project's existing canonical SRID
  before any `ST_Difference`-class operation — no mixed-SRID subtraction).
- **NFR-U5-10**: PostGIS remains the **sole spatial source of truth** — no envelope area or polygon
  is computed, approximated, or cross-checked in application code outside PostGIS.
- **NFR-U5-11**: Invalid or malformed input geometry — **corrected per founder review to
  distinguish a data/geometry-quality condition from a computation failure (see NFR-U5-14)**: when
  PostGIS *successfully evaluates* the supplied authoritative geometry and determines the geometry
  itself is invalid/unusable (a non-simple polygon, self-intersection, or a parcel/setback/ECA
  geometry for which `ST_IsValid` deterministically returns `false`), this is a **data-quality/
  evidence condition**, not a runtime failure — `setbackConstrainedArea`/`ecaExclusionArea` **fail
  closed** to `REQUIRES_VERIFICATION`, never a best-effort repaired or partial geometry presented as
  authoritative, and no unapproved automatic geometry-repair operation (e.g. `ST_MakeValid`) is
  applied silently. This alone does not fail the report-generation job — it is evidence
  uncertainty, handled the same way any other unresolved regulatory fact is, not an infrastructure
  failure.
- **NFR-U5-12**: An empty-geometry result (e.g. a setback envelope that fully consumes the parcel,
  leaving zero buildable area) is handled **explicitly and distinctly** from a
  `REQUIRES_VERIFICATION`/failure result — a genuine zero-area finding (`buildableAreaSqFt: 0`) is
  not the same outcome as "could not be computed," and the UI/report layer must be able to tell
  them apart.
- **NFR-U5-13**: `Polygon` and `MultiPolygon` outcomes (a setback subtraction can legitimately split
  a parcel's remaining buildable area into disjoint pieces) are handled **deliberately**, not
  assumed away — `domain-entities.md`'s `Polygon | MultiPolygon` typing (Correction 3's ECA
  geometry fix) is honored end to end, not narrowed to `Polygon`-only downstream.
- **NFR-U5-14**: A PostGIS topology or `ST_Difference`/`ST_Intersection` **execution failure** —
  **corrected per founder review, the counterpart to NFR-U5-11's data-quality condition**: the
  spatial operation itself cannot execute successfully (a PostGIS exception, a topology-operation
  exception, a database/runtime failure, or a timeout — distinct from `ST_IsValid` successfully
  evaluating and rejecting the input geometry, NFR-U5-11) is **not** regulatory/evidence
  uncertainty. It **never becomes a fabricated area or polygon**, and it follows the existing
  report-job failure/retry path (§5), never the `REQUIRES_VERIFICATION` evidence path.
- **NFR-U5-15**: `ecaExclusionArea`'s `excludedAreaSqFt` and `excludedGeometry` (the Final
  Correction's geometry fix) remain **internally consistent** — `excludedAreaSqFt` is always the
  actual measured area of `excludedGeometry` as computed by PostGIS, never an independently-sourced
  or estimated number paired with unrelated geometry.
- **NFR-U5-16**: `buildableAreaSqFt` always **corresponds to the actual resulting PostGIS geometry**
  in `buildablePolygon` (the area of the polygon PostGIS actually returned from the subtraction
  chain) — never a value derived by arithmetic subtraction of area scalars in application code, the
  same discipline the Final Correction already established for the ECA branch, extended to the
  final combined result.
- **NFR-U5-17**: A **partial** constraint subtraction (one applicable constraint — setback or ECA —
  silently omitted from the chain) is never labeled as "the buildable envelope" — unchanged from
  BR-U5-3's existing fail-closed gate, restated here as a reliability requirement on the
  implementation, not merely a design intent.
- **NFR-U5-18**: The "conservative fixed-5-foot approximation" side-setback case (Final Correction)
  remains **explicitly, structurally distinguishable** from a precise-geometry result at every
  layer — the `isConservativeSideSetbackApproximation` flag is propagated through the computation,
  persisted with the evidence, and never dropped or defaulted away between PostGIS, the evaluator,
  and the rendered report.

**No new GIS library or service is added** — this section is implemented entirely with the
project's existing PostGIS extension and query layer.

## 4. Performance / Bounded Work

Unit 5 adds per-`ResidentialUseScenario` `ST_Difference`-class spatial work — genuinely more
computation per request than Unit 1/4's single setback-distance measurement. Requirements are
**soft** (behavioral bounds), not hard numeric targets — no performance figure below has been
measured against live Neon/PostGIS and none is claimed as such.

- **NFR-U5-19**: The number of `ResidentialUseScenario`s evaluated (and therefore the number of
  buildable-envelope computations) per screening request is **explicitly bounded** by the rule
  inventory's own finite candidate set (`vacant-land-rule-inventory-and-tier-triage.md`'s U3-U7/
  U16-U17/U14-U15-derived scenario set) — never a count that grows with unbounded or
  attacker-influenced input.
- **NFR-U5-20**: PostGIS operations for a single evaluation **do not scale with uncontrolled user
  input** — the parcel boundary and applicable constraint geometries are the only inputs to the
  envelope computation, both server-derived from a confirmed parcel (never client-supplied
  arbitrary geometry), matching this project's existing trust-boundary discipline.
- **NFR-U5-21**: Per-stage timing instrumentation **continues through the existing mechanism** —
  the buildable-envelope computation is wrapped in `withStageTiming` (`src/report-generation-
  orchestrator/stage-timing.ts`) exactly like `SPATIAL_ANALYSIS`/`RULES_ENGINE` today, emitting the
  same `STAGE_TIMING` log event, so real duration data accumulates from first deployment rather
  than needing a later instrumentation retrofit.
- **NFR-U5-22**: An unusually expensive or pathological parcel geometry (e.g. a large multi-part
  parcel producing a complex subtraction) **fails or times out within the existing report-job
  execution envelope** — the Workflow SDK's existing retry behavior (up to 3 retries / 4 total
  attempts with backoff, `src/report-generation-job/repository.ts:93-95`) and the existing
  `DEFAULT_STALE_CLAIM_THRESHOLD_MS` stale-claim requeue mechanism govern this exactly as they
  already govern every other pipeline stage — no new timeout/retry mechanism is introduced for
  vacant-land specifically.
- **NFR-U5-23**: Actual performance targets **remain empirical** — this document does not assert a
  specific millisecond budget; `DEFAULT_STALE_CLAIM_THRESHOLD_MS`'s own code comment already states
  it is "a starting value, tuned from Build & Test's real STAGE_TIMING data, not treated as final,"
  and the same discipline applies to whatever real `STAGE_TIMING` data the new buildable-envelope
  stage produces once exercised in Build & Test.

## 5. Failure / Degradation Behavior

- **NFR-U5-24**: **Corrected per founder review** — a true spatial computation/runtime **failure**
  (a PostGIS exception, topology-operation exception, database/runtime failure, or timeout;
  NFR-U5-14) never fabricates a `KNOWN` buildable-area/polygon result, and is kept distinct from an
  `ST_IsValid` rejection of successfully-evaluated-but-invalid input geometry — that is a
  data-quality/evidence condition (NFR-U5-11), not a computation failure, and does not itself fail
  the report-generation job.
- **NFR-U5-25**: An evaluation-stage exception during Unit 5's regulatory evaluation (Workflow
  U5-2) uses the **existing report-generation job failure/retry behavior** unchanged
  (`ReportGenerationJobState.FAILED` with `failureReasons`, the existing retry/stale-claim
  mechanism, and the existing no-automatic-retry-of-`FAILED`-jobs posture Unit 3's own correction
  established, `src/report-generation-job/repository.ts:164-168`) — no new failure-state machine is
  introduced for vacant-land.
- **NFR-U5-26**: A `VACANT_LAND`-workflow-specific failure **cannot corrupt or affect** an
  `EXISTING_PROPERTY` report — the two workflows share the report-generation job/pipeline
  infrastructure but not any mutable evaluation state; a failure in one workflow type's evaluation
  logic has no code path that touches the other's data.
- **NFR-U5-27**: **Corrected per founder review — three distinct states, not two, kept separate end
  to end**: (1) **evidence uncertainty** (missing lot qualification, missing/invalid ECA geometry
  per NFR-U5-11, `LotLineRoles.status === "INSUFFICIENT"`, unknown transit-area status) is the only
  condition producing `REQUIRES_VERIFICATION` as a `FindingClassification`; (2) **governed-rule
  coverage absence** — no `ACTIVE` `RegulatoryRule` row supports a given regulatory conclusion
  (`business-logic-model.md` Workflow U5-2's `uncoveredConstraintTypes`-style disclosure) — is a
  **separate concept, not a `FindingClassification`**, and is **withdrawn from this requirement's
  prior list**: no-`ACTIVE`-coverage must never be represented as `REQUIRES_VERIFICATION` merely to
  fit the existing evidence vocabulary; (3) a true **computation/runtime failure** (NFR-U5-14) is
  neither of the above. All three remain distinguishable at every layer — evidence uncertainty,
  no-coverage disclosure, and infrastructure failure are never conflated or coerced into one
  another.
- **NFR-U5-28**: A true computation/runtime failure (§3/§4's PostGIS or timeout failures, NFR-U5-14)
  remains **distinguishable from both an evidence-driven `REQUIRES_VERIFICATION` result (NFR-U5-11,
  NFR-U5-27(1)) and a no-`ACTIVE`-rule-coverage disclosure (NFR-U5-27(2))** at every layer this
  project already distinguishes classification concepts at (`Finding`'s existing vocabulary is not
  overloaded to mean "the system errored," and `uncoveredConstraintTypes` is not overloaded to mean
  either "unresolved evidence" or "the system errored" — a runtime failure surfaces through the
  existing job-failure path, §5's own mechanism, never as a regulatory finding or a coverage
  disclosure of any kind).

## 6. Explicit Baseline Inheritance — No New Requirements

Per explicit instruction, the following categories are **unaffected by Unit 5** and inherit Units
1-4's already-approved posture entirely unchanged — restated here explicitly so this targeted
document is not mistaken for silently omitting them:

- **Authentication/authorization** — unchanged; no new auth mechanism, role, or permission model.
- **PII/privacy category** — unchanged; no new personal-data category is introduced (parcel/
  zoning/geometry facts are not personal data, matching Units 1-4's own posture).
- **Secret management** — unchanged; no new credential, API key, or secret is introduced (no new
  external provider, per explicit instruction throughout Functional Design and this document).
- **External service availability** — unchanged; no new external dependency (Report Explanation's
  existing RGD-5 graceful-degradation behavior is reused unchanged, Workflow U5-3 step 3).
- **Queue/worker architecture** — unchanged; the existing Report Generation Job/Workflow SDK
  pipeline is reused unchanged, with one new instrumented stage (§4) inside it, not a new pipeline.
- **Backup/recovery** — unchanged; no new data store, no new backup/recovery posture beyond the
  existing Neon/Postgres posture.
- **Accessibility baseline** — unchanged; `frontend-components.md`'s own Accessibility section
  already confirms Unit 5's new UI follows Unit 2's existing baseline unchanged.
- **General deployment topology** — unchanged; no new Vercel service, no new deployment target.
