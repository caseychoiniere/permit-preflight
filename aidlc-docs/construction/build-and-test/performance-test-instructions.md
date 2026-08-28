# Performance Test Instructions

## Unit 1: Not Applicable (unchanged)
No deployed runtime, no customer-facing endpoint. See the original rationale below, preserved for
the record: response-time/throughput/error-rate targets were deferred to whichever unit first
exposed a public, concurrently-used endpoint — that unit is Unit 2.

## Unit 2: Soft Sanity Targets, Not a Formal Load-Test Suite

NFR-U2-2 deliberately set non-blocking engineering sanity thresholds, not contractual SLAs, given
there is still no live-payment/commercial commitment in this unit. This Build & Test pass does not
introduce a formal load-testing tool (e.g. k6, JMeter) — that would be infrastructure disproportionate
to a founder-triggered prototype at single-digit concurrent-user scale, consistent with the
Category A/B proportionality instruction that has governed this unit throughout.

### What Exists Instead
- **`STAGE_TIMING` instrumentation** (NFR Design Pattern 4, `report-generation-orchestrator/stage-timing.ts`):
  every pipeline stage (parcel geometry retrieval, Property Intelligence, Spatial Analysis, Rules
  Engine, Report Explanation, artifact persistence, PDF rendering) emits a structured log event
  with its real duration. This is the mechanism NFR-U2-2 specified for establishing the real
  baseline from evidence — not a separate benchmark harness.
- **Soft targets** (unchanged from NFR Requirements): sub-second single-parcel PostGIS operations
  under ordinary conditions; seconds-to-tens-of-seconds for the full pipeline; ~60 seconds as an
  investigate-not-baseline threshold.

### What This Build & Test Session Could Measure
- **Real PDF rendering** (`tests/report-pdf-rendering/render.integration.test.ts`, executed live in
  this sandbox): a single headless-Chromium render completed in well under 1 second (see the
  earlier ad hoc verification: ~50KB PDF, sub-second wall time) — consistent with the soft target,
  though this is one data point on one machine, not a benchmark.
- **Deterministic test suite wall time**: 125 tests complete in well under 1 second total — an
  informal signal that no pathological slow path exists in the pure logic Unit 2 added.
- **`STAGE_TIMING` events themselves have not been observed against the real pipeline** — that
  requires `DATABASE_URL` (to actually run `report-generation-orchestrator/pipeline.ts` end to
  end), which this sandbox does not have. **This is the real baseline NFR-U2-2 asked for, and it
  remains unestablished** — tracked as a natural extension of
  `external-verification-tracker.md` item 3 (the same DB-dependent gap), not fabricated here.

### Recommendation for Whoever Runs This With Real Credentials
Once `DATABASE_URL` is available, authorize a real report generation and read the resulting
`STAGE_TIMING` log lines — that is the actual NFR-U2-2 baseline measurement. Revise the soft
targets in `nfr-requirements.md` from that evidence if warranted, per NFR-U2-2's own instruction
("Use Build & Test measurements to establish the real baseline and revise the soft numbers if
evidence justifies it"). **Corrected 2026-08-25 (Unit 2B)**: "let the poller process it" is stale —
`report-generation-orchestrator/poller.ts` was deleted, explicitly superseded by the platform-pivot
ADR. The mechanism is now event-driven: a `VERIFIED_PAYMENT`-authorized job starts
`reportGenerationWorkflow` automatically from the Stripe webhook route; an `INTERNAL_PROTOTYPE` job
via `npm run generate-prototype-report` runs the pipeline synchronously in that same CLI process
(no separate "processing" step to wait for).

## Unit 2B: No New Formal Load-Test Suite (Same Proportionality Rationale)

Same reasoning as Unit 2 — no k6/JMeter harness introduced. `STAGE_TIMING` is reused unmodified by
the new Vercel Workflow steps (`report-generation-workflow.ts`'s `runPipelineStep` calls the exact
same `runReportGenerationPipeline`). Two new, Unit-2B-specific performance-relevant unknowns are
explicitly NOT measured in this sandbox, both requiring a real Vercel deployment: (1) Vercel
Workflow step-invocation latency/cold-start overhead — no data point exists yet; (2)
`puppeteer-core`/`@sparticuz/chromium` PDF-render time inside an actual Vercel Function's memory/
CPU allocation, which may differ materially from this session's local (non-Vercel, and in this
sandbox non-Linux, so not even locally measurable) environment. Both are folded into
`external-verification-tracker.md` item 10 rather than tracked as separate performance items.

## Unit 3: No New Formal Load-Test Suite (Single-Operator Internal Tool Scale)

Same proportionality reasoning, sized down further: NFR-U3-2's soft targets are framed around a
single internal operator, not concurrent public traffic — a formal load-testing harness would be
disproportionate to that scale regardless of tooling cost. Nothing new is introduced here.

### What Exists Instead
- The admin surface's queries are all small, single-row/small-list reads and writes (order lookup
  by exact id/email, a handful of rule/data-source rows) — no pagination, no aggregation, no
  full-table scan anywhere in `src/order-payment/repository.ts`'s `findOrdersByCustomerEmail` or
  `src/regulatory-rule-governance/repository.ts`'s `listRules`/`getRuleById`, consistent with the
  small expected data volume at this stage.
- **Deterministic test suite wall time**: 212 tests complete in ~1.5 seconds total (this session's
  actual measurement) — no pathological slow path in the pure logic Unit 3 added, including the
  admin-auth constant-time-comparison functions (SHA-256 hashing twice per credential check is
  microseconds, not a measurable latency concern at this scale).
- **Not measured in this sandbox** (same `DATABASE_URL` gap as every prior unit): real query
  latency for the 4 atomic `withAdminTransaction` mutations (rule disable/re-enable, data-source
  override set/clear) against a live Neon connection, and real Basic Auth/CSRF-check latency added
  to every admin request by `proxy.ts` on an actual Vercel deployment. Neither is expected to be
  material at single-operator scale, but is unestablished, not fabricated — folded into
  `external-verification-tracker.md`'s existing DB/deployment-dependent items rather than tracked
  as a new separate performance item, since it is the same underlying gap (no live credentials/
  deployment in this sandbox), not a new class of unknown.

## Unit 4: No New Formal Load-Test Suite (Same Proportionality Rationale)

Same reasoning as Units 2/2B/3. `evaluateLotCoverage` and the widened setback/height evaluators are
pure, allocation-light functions over a handful of fields - no new pathological slow path.
`computeParcelAreaSqFt` is a single `ST_Area` query, the same cost class as the existing
`ST_Distance`/`ST_Transform` calls already in `postgis-adapter.ts`. **Deterministic test suite wall
time**: 240 tests (up from Unit 3's 212) complete in ~2-3 seconds total (this session's actual
measurement) - no measurable regression from Unit 4's additions. Real query latency for
`computeParcelAreaSqFt` against a live Neon connection is unestablished, not fabricated - folded
into the same existing DB/deployment-dependent external-verification items as every prior unit's
own unmeasured latency, not tracked as a new separate performance item.

## Unit 5: No New Formal Load-Test Suite (Same Proportionality Rationale); One New PostGIS
Compute-Load Consideration (Already Addressed by NFR Requirements)

Same reasoning as Units 2/2B/3/4 for the evaluator/hydrator layer - `evaluateVacantLand` and
`hydrateScreeningRequestShape` are pure, allocation-light functions over a handful of fields, no
new pathological slow path. The genuinely new compute-load question (NFR-U5-19 through -23,
`aidlc-docs/construction/unit-5-vacant-land/nfr-requirements/nfr-requirements.md` §4) is the new
per-scenario PostGIS `ST_Buffer`/`ST_Difference`/`ST_Intersection` geometry work -
`computeSetbackConstrainedArea` now issues one nested `ST_Difference(..., ST_Buffer(...))`
expression per lot-line edge (front, rear, each side) per scenario, up to 4 scenarios per
evaluation (`SCENARIO_DEFINITIONS`), a bounded, finite count never driven by uncontrolled user
input (NFR-U5-19/-20). Real query latency for this chain against a live Neon/PostGIS connection is
unestablished in this sandbox (no `DATABASE_URL`) - the same class of gap as `computeParcelAreaSqFt`
above, not fabricated. `STAGE_TIMING` instrumentation (`RULES_ENGINE`/a future dedicated stage tag)
remains the intended real-data source once a live deployment exists, per NFR-U5-21/-23's own
explicit "empirical, not invented" discipline. **Deterministic test suite wall time**: 312 tests
(up from Unit 4's 240) complete in ~2-3 seconds total (this session's actual measurement) - no
measurable regression from Unit 5's additions.
