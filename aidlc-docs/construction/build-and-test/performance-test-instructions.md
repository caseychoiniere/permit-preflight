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
Once `DATABASE_URL` is available, authorize a real report generation, let the poller process it,
and read the resulting `STAGE_TIMING` log lines — that is the actual NFR-U2-2 baseline
measurement. Revise the soft targets in `nfr-requirements.md` from that evidence if warranted, per
NFR-U2-2's own instruction ("Use Build & Test measurements to establish the real baseline and
revise the soft numbers if evidence justifies it").
