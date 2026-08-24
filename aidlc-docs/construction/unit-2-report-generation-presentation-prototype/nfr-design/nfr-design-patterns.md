# Unit 2: NFR Design Patterns

Expresses the logical patterns needed to implement the approved NFR Requirements. Per the user's
explicit instruction: patterns only — no new infrastructure (queues, Redis, distributed locks,
tracing platforms) merely because Unit 2 introduces the first deployed runtime. Every pattern
below states why it doesn't need one. Reuses Unit 1's existing patterns (Bounded-Retry Executor,
Boundary Validator, structured logger) without modification where they already cover the need.

## Pattern 1: Report Access Credential (token generate/hash/lookup/revoke)

```
generateAccessCredential() -> { rawToken, tokenHash }
hashToken(rawToken) -> tokenHash
resolveByAccessToken(rawToken) -> hash, look up by tokenHash, verify active, return report | NOT_FOUND
revokeAccessToken(reportId) -> invalidate the active credential
rotateAccessToken(reportId) -> revoke old, generate new, return new rawToken exactly once
```

- 256-bit (`crypto.randomBytes(32)`) raw token; SHA-256 hash (sufficient given the source token's
  own entropy — this is not a human password needing a slow KDF).
- Only `tokenHash` is ever persisted. `rawToken` exists in memory only long enough to return it
  once, at credential-creation time; never logged, never stored recoverably.
- `resolveByAccessToken` is the **only** path from a raw token to a report — it always hashes
  first, then looks up by hash. There is no code path that looks up by raw token value.
- Revoked and unknown tokens produce an identical outward result (uniform NOT_FOUND-shaped
  response) — no signal leaks about whether a token once existed.
- `reportId` is never accepted as a credential by any client-facing path (BR-U2-7, unchanged).
- Credential lifecycle (a small table: `reportId`, `tokenHash`, `active`, timestamps) is entirely
  separate from `EvidenceReportArtifact`'s own identity and immutability — revoking/rotating a
  credential never touches the report record itself.

**Why no new infrastructure**: this is a handful of pure functions plus one small table in the
already-approved Postgres database — the same shape as Unit 1's `regulatory_rules`/
`inference_policies` tables, not a new subsystem.

## Pattern 2: Failed-Lookup Rate Limiter

```
onLookupRequest(sourceKey):
  if limiter.isLimited(sourceKey): return GENERIC_REJECTION
  result = resolveByAccessToken(rawToken)
  if result == NOT_FOUND: limiter.recordFailure(sourceKey)
  return result
```

- `sourceKey` derived from an appropriately-chosen client/IP identifier, subject to the actual
  deployment/proxy architecture (Infrastructure Design) — client-supplied forwarding headers are
  never trusted as-is for this purpose (a client could set `X-Forwarded-For` to anything).
- Only failed/invalid lookups increment the counter — a successful lookup never counts against the
  source.
- Short rolling window + cooldown; exact threshold/window values are tuned from observed behavior,
  not fixed here.
- The rejection response is generic and uniform — it must not reveal whether the block is due to
  rate-limiting specifically vs. a normal NOT_FOUND, reinforcing Pattern 1's no-signal-leak
  property.

**Why no new infrastructure**: a counter keyed by source, with a short window, is expressible as
either an in-process structure (acceptable at Unit 2's single-instance prototype scale) or a small
table/column set in the existing Postgres database — no dedicated cache/store technology is
required at this volume.

## Pattern 3: ReportGenerationJob Claim and Recovery

```
-- Initial claim (atomic, DB-level compare-and-set):
UPDATE report_generation_jobs
SET state = 'IN_PROGRESS', claimed_at = now(), retry_attempts = retry_attempts + 1
WHERE id = :jobId AND state = 'QUEUED'
RETURNING *;
-- Only the caller that receives a row back is the claimant. No row returned = someone else claimed it first.

-- Stale-claim recovery (also atomic, also DB-level):
UPDATE report_generation_jobs
SET state = 'IN_PROGRESS', claimed_at = now(), retry_attempts = retry_attempts + 1
WHERE id = :jobId AND state = 'IN_PROGRESS' AND claimed_at < now() - :staleClaimThreshold
RETURNING *;
```

- A single atomic conditional `UPDATE ... RETURNING` is sufficient to guarantee at most one
  claimant per job even with multiple concurrent claim attempts — no separate lock component.
- `claimedAt` distinguishes a legitimately-running job from an abandoned one. A job is only ever
  reclaimed via the second atomic statement above, and only once `claimedAt` is older than a
  configured `staleClaimThreshold` — never by simply allowing any `IN_PROGRESS` job to be rerun.
- `staleClaimThreshold` is finite and configurable; its concrete value is set during
  implementation/Build & Test, with margin over observed normal pipeline duration (NFR-U2-2's
  timing data is exactly what informs this number) — not invented here.
- **Two distinct retry concepts, kept separate**:
  1. **External-call retry** (Unit 1's Bounded-Retry Executor, unchanged) — retries a single
     safe/idempotent external operation *within* one pipeline attempt (e.g. one King County fetch).
  2. **Job-level recovery** (this pattern) — reclaims/retries an entire abandoned or failed
     report-generation attempt.
- Job-level retry must be idempotent with respect to `EvidenceReportArtifact` creation — a
  reclaimed job that completes must never produce two authoritative artifacts for the same job/
  snapshot (e.g., the artifact-creation step itself should be a conditional insert keyed to the
  job, or check-then-create within the same transaction).

**Why no new infrastructure**: both operations are standard Postgres capabilities already
available from the approved Drizzle/Postgres stack — no distributed lock service, no external
queue/broker.

## Pattern 4: Stage-Level Timing Instrumentation

```
logger.log({ event: "STAGE_TIMING", stage: "SPATIAL_ANALYSIS", durationMs, reportGenerationJobId })
```

Stable stage names: `PARCEL_GEOMETRY_RETRIEVAL`, `PROPERTY_INTELLIGENCE`, `SPATIAL_ANALYSIS`,
`RULES_ENGINE`, `REPORT_EXPLANATION`, `ARTIFACT_PERSISTENCE`, `PDF_RENDERING`.

- Extends Unit 1's existing `src/shared/logger.ts` structured-JSON logger with one new event type
  — the same mechanism already used for `SOURCE_FAILURE`, queryable the same way.
- Duration measured via a monotonic elapsed-time mechanism where practical (not wall-clock
  timestamp subtraction, which is vulnerable to clock adjustments).
- Never includes secrets, raw access tokens, or sensitive payload contents — timing events carry
  only stage name, duration, and the job id.
- Instrumentation failure (e.g. a logging call throwing) must never fail report generation — timing
  is observational, not load-bearing.
- Build & Test's actual measurements establish NFR-U2-2's real performance baseline from these
  events; the soft targets in nfr-requirements.md are revised from that evidence.

**Why no new infrastructure**: this is one new event type on an already-existing logger — no
tracing/APM platform.

## Pattern 5: PostGIS Spatial-Query Boundary

```
Report Generation Orchestrator
  -> Spatial Analysis domain operation (unchanged Unit 1 ownership)
  -> PostGIS adapter (new, this unit)
  -> parameterized PostGIS query
  -> validated SpatialResult
  -> Regulatory Rules Engine
```

- A dedicated adapter module, structurally parallel to `parcel-resolution/king-county-adapter.ts`
  — real, tested integration code distinct from Unit 1's pure `geometry.ts` reference
  implementation, which remains test/reference-only (the already-proven Build & Test boundary,
  unchanged).
- All SQL and geometry values are parameterized — never string-concatenated (requirements.md's
  standing database-security requirement, reaffirmed here for the first time it's actually
  exercised).
- Input geometry is validated before the query is issued (Boundary Validator pattern, reused);
  database output is validated/normalized before domain code consumes it — the same discipline
  applied to every other external response in this codebase.
- Every resulting `SpatialResult` carries forward `boundaryPolygon`'s `qualityCaveat` and
  `evidenceQuality` unchanged (BR-U2-4, unchanged from Functional Design).
- `LotLineRoleAssignment` is consumed as an explicit input — the adapter never derives front/rear/
  side from the queried geometry's shape (BR-U2-9, unchanged).
- Client-supplied distance values are never consumed as authoritative, regardless of what a client
  claims — the adapter's own computation is the only source of truth.
- Not callable from any pre-authorization code path — same invariant Unit 1's Spatial Analysis
  already had conceptually, now actually enforced by there being exactly one caller (Report
  Generation Orchestrator Service).

**Why no new infrastructure**: PostGIS itself is already-approved shared infrastructure (Neon,
since Unit 1's Infrastructure Design) — this pattern is application code querying it, not a new
service.

## Pattern 6: Report Presentation — Web Rendering and `ReportPdfRendering` (Corrected)

**Functional Design correction applied** (see `functional-design/domain-entities.md` and
`business-rules.md` BR-U2-6, updated 2026-08-22): the PDF is not a field on the immutable
`EvidenceReportArtifact`. It is a separate, disposable/recreatable derivative:

```
ReportPdfRendering { reportArtifactId, renderingVersion, storageReference, generatedAt, contentHash? }

onPdfRequest(rawAccessToken):
  // Corrected 2026-08-22: authorization is by token (Pattern 1), never by a client-supplied
  // reportArtifactId. reportArtifactId is used only internally, after successful token resolution.
  artifact = resolveByAccessToken(rawAccessToken)
  if artifact == NOT_FOUND: return NOT_FOUND
  existing = findReportPdfRendering(artifact.id, currentRenderingVersion)
  if existing: return existing
  rendered = renderPdfFrom(artifact)   // reads ONLY the persisted artifact — no pipeline re-run
  persisted = persistReportPdfRendering(artifact.id, currentRenderingVersion, rendered)   // does not mutate `artifact`
  return persisted
```

`reportArtifactId` may be used internally once authorization has already succeeded (e.g. as the
lookup key for `findReportPdfRendering` or as a foreign key on the persisted row) — it is never
sufficient, by itself, as client-supplied authorization for the PDF endpoint, exactly matching
Pattern 1's "`reportId` alone never authorizes access" invariant (BR-U2-7).

- Lazy: rendered on first request, not eagerly at generation-completion time — most prototype
  reports may only ever be viewed on the web during an interview.
- Cached: subsequent requests for the same artifact/rendering-version return the persisted
  rendering rather than re-rendering.
- Never mutates `EvidenceReportArtifact` — generating, caching, deleting, or regenerating a
  `ReportPdfRendering` leaves the artifact untouched, preserving its immutability (RGD-4) exactly.
- Never re-runs Property Intelligence, external GIS retrieval, PostGIS, the Rules Engine, or Report
  Explanation — reads only the already-persisted artifact.
- PDF generation failure does not corrupt or modify the report artifact — a failed render simply
  produces no `ReportPdfRendering` row; the artifact and web rendering are entirely unaffected.
- Concurrent first-requests for the same artifact are tolerated: duplicate-but-equivalent render
  work is acceptable at prototype scale, or a database uniqueness constraint on
  `(reportArtifactId, renderingVersion)` prevents a duplicate persisted row if that's preferred at
  implementation time.
- Web rendering and PDF rendering share the same underlying report-data templates/presentation
  model wherever practical (tech-stack-decisions.md) — the PDF may use print-specific layout
  (e.g., a static map image rendered from the artifact's stored geometry, replacing the
  interactive MapLibre map), but both draw from the same `EvidenceReportArtifact` data, never an
  independently re-derived version of it.

**Why no new infrastructure**: `ReportPdfRendering` is one more small table plus a headless-browser
render call (already chosen in tech-stack-decisions.md) — no separate document-generation service.

## Pattern 7: Map/Placement Input Validation

No new pattern — reaffirms NFR-U2-4's already-approved scope. `boundaryPolygon` (from the King
County adapter), `proposedFootprint`, and `LotLineRoleAssignment` (both from client submission) all
go through the same Boundary Validator function Unit 1 already established, at the same
server-side trust boundary PC-2 already requires for every other input. No dedicated
"map-input-validation subsystem" is introduced.

## Pattern 8: UI Test Pyramid

No new pattern — reaffirms NFR-U2-6 exactly as approved: component tests in the deterministic
gate, a small Playwright smoke suite for the single highest-value end-to-end path, manual browser
verification for subjective/visual behavior. Restated here only for completeness of this
document's pattern inventory, not redesigned.
