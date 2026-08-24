# Unit 2: Report Generation & Presentation Prototype — NFR Design Plan

**NFR Requirements consumed**: nfr-requirements.md, tech-stack-decisions.md (approved 2026-08-22,
with 2 non-blocking wording corrections: hash-only token persistence as a hard requirement; the
`ReportGenerationJob` queuing-vs-concurrency distinction).

**Governing constraint (per the user's explicit instruction)**: NFR Design expresses the logical
patterns needed to implement the already-approved requirements — it does not invent new
infrastructure. No queues, Redis, distributed locks, or tracing platforms merely because a real
deployed runtime now exists; Infrastructure Design introduces concrete infrastructure only when a
specific approved requirement demonstrates the need.

---

## NFR Design Checklist
- [x] Answer clarifying questions below
- [x] Analyze answers for ambiguity; raise follow-ups if needed — none needed; Q3 and Q6 added
      substantive detail beyond the recommended options but were fully specific, not ambiguous
- [x] Create `nfr-design-patterns.md` — token generation/hash/lookup/revocation pattern,
      failed-lookup rate-limiting pattern, `ReportGenerationJob` claim/retry pattern, stage-level
      timing-instrumentation pattern, PostGIS spatial-query boundary pattern, PDF-rendering pattern
      (shared presentation model, lazy vs. eager), map-input validation pattern (reaffirm Boundary
      Validator, no new subsystem), UI test-pyramid pattern (reaffirm NFR-U2-6, no new content)
- [x] Create `logical-components.md` — component/module boundaries for the above (e.g. a
      `report-access` module owning token generation/hash/lookup/revocation/rate-limiting; a
      `spatial-analysis` PostGIS adapter alongside Unit 1's existing pure/reference module; a
      shared report-presentation-model module consumed by both web and PDF rendering)
- [x] Explicitly confirm, per pattern, "why this doesn't need new infrastructure" — a one-line
      justification per logical component, so Infrastructure Design has a clear, already-reasoned
      answer rather than re-litigating the same question

---

## Clarifying Questions

### Question 1 — Token Generate/Hash/Lookup/Revoke Pattern
NFR-U2-4 fixed the requirements (256-bit random, hash-only persistence, single raw disclosure,
revocable). What's the logical shape?

A) **A small, named pattern mirroring Unit 1's Bounded-Retry Executor/Boundary Validator style** —
   e.g. a `ReportAccessCredential` module exposing `generateAccessCredential()` (returns
   `{rawToken, tokenHash}`), `hashToken(raw)` (pure function, e.g. SHA-256), and
   `resolveByAccessToken(raw)` (hashes, then looks up by hash — never by raw value).
   `revokeAccessToken(reportId)` invalidates the stored hash (e.g. nulling/tombstoning it), after
   which the old raw token no longer resolves; regaining access requires generating and
   distributing a new one. **Recommended** — same "small, named, reusable pattern" discipline
   already established for Unit 1's shared utilities, not a new architectural concept.

X) Other (describe after [Answer]: below)

[Answer]: A

Confirmed with a fully specified API: `generateAccessCredential() -> {rawToken, tokenHash}`;
`hashToken(rawToken) -> tokenHash`; `resolveByAccessToken(rawToken)` hashes, resolves by
`tokenHash`, verifies active/not-revoked, returns the report or NOT_FOUND; `revokeAccessToken
(reportId)` invalidates the active credential; `rotateAccessToken(reportId)` revokes the old one,
generates a new one, returns the new raw token exactly once. SHA-256 is sufficient for hashing
since the source token already has high cryptographic entropy (not a human password). Raw token
never persisted or logged. `reportId` alone never sufficient. Revoked tokens fail identically to
unknown tokens from the caller's perspective (no distinguishing signal leaked). Credential
lifecycle stays separate from `EvidenceReportArtifact` identity/immutability. No general
authentication framework built around this prototype credential.

### Question 2 — Failed-Token-Lookup Rate-Limiting Pattern
NFR-U2-4 requires "lightweight rate limiting on repeated failed token lookups... no Redis solely
for this." What's the logical pattern, leaving the concrete storage mechanism to Infrastructure
Design?

A) **A simple counting pattern**: track failed-lookup attempts per source (e.g. by IP or a
   coarser key) over a short rolling window; beyond a small threshold, further lookups from that
   source are rejected/delayed for a short cooldown. The counter's storage (in-memory
   single-instance counter, or a lightweight table in the already-approved Postgres database) is
   an Infrastructure Design choice — the pattern itself doesn't require a dedicated cache/store
   technology at this volume. **Recommended.**

[Answer]: A

Confirmed: lookup request -> check limiter for request-source key -> if temporarily limited,
reject generically -> otherwise attempt hash-based lookup -> success returns the report, failure
increments the failed-attempt state. Source key derived from an appropriately-chosen client/IP
identifier subject to the actual deployment/proxy architecture (Infrastructure Design) — never
trust arbitrary client-supplied forwarding headers as source identity. Only failed/invalid attempts
increment the counter. Short rolling window/cooldown. Never reveal whether a token once existed,
was revoked, or was malformed (uniform failure response). No Redis/dedicated cache introduced.
Concrete storage and threshold/cooldown values are Infrastructure Design/implementation choices,
tunable from observed behavior. The logical requirement is lightweight abuse resistance, not a
distributed rate-limiting platform.

### Question 3 — ReportGenerationJob Claim/Retry Pattern (the concurrency correction)
Per the correction: the job model provides a durable queue, not an automatic concurrency
guarantee. What's the logical claim pattern, without introducing a distributed lock?

A) **An atomic conditional claim at the database level** — claiming a job is a single
   compare-and-set operation (read a `QUEUED` job and transition it to `IN_PROGRESS` in one atomic
   statement, e.g. an `UPDATE ... WHERE state = 'QUEUED' ... RETURNING`), which is sufficient to
   guarantee at most one claimant per job even with multiple concurrent claimers, without any
   separate distributed-lock component. Job-level `retryAttempts`/`failureReasons` (already in
   domain-entities.md) record whole-pipeline retries after a crash; Unit 1's Bounded-Retry Executor
   remains scoped to individual external calls *within* a single pipeline run, a distinct concern
   from job-level retry. **Recommended** — this is a standard database pattern already available
   from the approved Postgres/Drizzle stack, not new infrastructure.

[Answer]: X

Use the atomic compare-and-set claim, PLUS an explicit stale-claim/recovery mechanism — a bare
QUEUED->IN_PROGRESS transition by itself leaves a job permanently stuck if the worker crashes after
claiming it. Model the claim with `claimedAt` (+ an attempt identifier if useful) alongside
`retryAttempts`/`failureReasons`. Initial claim: `UPDATE ... SET state=IN_PROGRESS, claimedAt=now(),
retryAttempts=... WHERE id=... AND state='QUEUED' RETURNING ...` — only the successful atomic
claimant runs the pipeline. Crash recovery: a job may be reclaimed only through another atomic
conditional transition when its existing IN_PROGRESS claim is demonstrably stale per a
configured recovery policy — never allow arbitrary IN_PROGRESS jobs to be rerun. The exact stale
duration is not invented here; it must be finite/configurable, selected with margin over observed
normal pipeline duration during implementation/Build & Test. No heartbeat subsystem or distributed
lock required at Unit 2's low volume unless implementation evidence demonstrates a need. Preserve
the distinction between (1) EXTERNAL-CALL RETRY (Unit 1's Bounded-Retry Executor, retries a single
safe/idempotent external operation within one pipeline attempt) and (2) JOB-LEVEL RECOVERY
(reclaims/retries an abandoned or failed whole report-generation attempt) — job-level retry must
remain idempotent with respect to `EvidenceReportArtifact` creation; retrying after a crash must
never create two authoritative artifacts for the same job/snapshot. No queue service or
distributed-lock infrastructure introduced — Postgres remains the concurrency authority.

### Question 4 — Stage-Level Timing Instrumentation Pattern
NFR-U2-2 requires per-stage timing (parcel geometry retrieval, Property Intelligence, Spatial
Analysis, Rules Engine, Report Explanation, artifact persistence, PDF generation).

A) **Extend Unit 1's existing structured JSON logger** (`src/shared/logger.ts`) with a
   `STAGE_TIMING` event type carrying `{stage, durationMs, reportGenerationJobId}` — emitted once
   per pipeline stage. No new tracing/APM platform; timing data lives in the same structured logs
   Unit 1 already produces for `SOURCE_FAILURE` etc., queryable the same way. **Recommended** —
   directly satisfies "no infrastructure merely because a deployed runtime exists."

[Answer]: A

Confirmed, with a fixed event shape `{event: "STAGE_TIMING", stage, durationMs,
reportGenerationJobId}` and stable stage names: PARCEL_GEOMETRY_RETRIEVAL, PROPERTY_INTELLIGENCE,
SPATIAL_ANALYSIS, RULES_ENGINE, REPORT_EXPLANATION, ARTIFACT_PERSISTENCE, PDF_RENDERING. Duration
uses a monotonic elapsed-time mechanism where practical rather than subtracting wall-clock
timestamps. Timing instrumentation must never include secrets, raw access tokens, or sensitive
payload contents. Instrumentation failure must never fail report generation. No tracing/APM
platform required. Build & Test uses these events to establish the first real performance
baseline. This extends the existing logging pattern rather than creating a new observability
subsystem.

### Question 5 — PostGIS Spatial-Query Boundary Pattern
Spatial Analysis's real computation (setback distances from `boundaryPolygon` +
`proposedFootprint`) needs a concrete query boundary — Unit 1 only ever built the pure-TypeScript
reference implementation.

A) **A dedicated PostGIS adapter module alongside Unit 1's existing pure/reference module**
   (mirroring `parcel-resolution/king-county-adapter.ts`'s pattern: a real, tested integration
   module distinct from the pure decision/reference logic) — parameterized queries only (never
   string-concatenated SQL, requirements.md's standing database-security requirement), consumed
   exclusively by Report Generation Orchestrator Service (unchanged invariant). The pure
   `geometry.ts` reference implementation remains test/reference-only (per the Build & Test
   boundary already proven for Unit 1) — this adapter is what actually executes in production.
   **Recommended.**

[Answer]: A

Confirmed, with a fixed shape: Report Generation Orchestrator -> Spatial Analysis domain operation
-> PostGIS adapter -> parameterized PostGIS query -> validated `SpatialResult` -> Rules Engine.
Requirements: PostGIS is authoritative for production spatial computation; pure `geometry.ts`
remains reference/test-only; all SQL and geometry values parameterized, no string-concatenated SQL;
validate input geometry before issuing the query; validate/normalize database output before domain
consumption; preserve parcel-boundary provenance and `qualityCaveat` through every resulting
`SpatialResult`; `LotLineRoleAssignment` is an explicit input — the adapter never guesses
front/rear/side from polygon shape; client-supplied distances are never consumed as authoritative;
the adapter is not callable from the pre-authorization path. No separate geometry service or GIS
infrastructure introduced.

### Question 6 — PDF Rendering Trigger Pattern
BR-U2-6/tech-stack-decisions.md fixed that PDF and web share one immutable snapshot/presentation
model. When is the PDF actually rendered?

A) **Lazily, on first request** (not eagerly generated alongside the web report at completion
   time) — most prototype reports may only ever be viewed on the web during an interview; rendering
   a PDF nobody requests is wasted work. The rendered PDF is then cached (persisted alongside the
   artifact) so a repeat download doesn't re-render. Still governed by BR-U2-6: even lazy
   generation reads only the already-persisted snapshot, never re-runs the pipeline.
   **Recommended.**

B) Eagerly, at report-completion time (part of Workflow 4 step 7) — guarantees the PDF is always
   immediately available with no first-request latency, at the cost of always doing the rendering
   work even for reports never downloaded as PDF.

[Answer]: X

Render lazily on first request, but do NOT mutate the immutable `EvidenceReportArtifact` to attach
the rendered PDF afterward — the artifact is an immutable point-in-time snapshot and that invariant
must be preserved. Model a separate derived-rendering concept, `ReportPdfRendering`
(`reportArtifactId`, `renderingVersion`, `storageReference`/bytes reference, `generatedAt`, optional
`contentHash`). Flow: PDF request -> resolve the authorized `EvidenceReportArtifact` -> look for an
existing `ReportPdfRendering` for that artifact/version -> if present, return it; if absent, render
from the immutable artifact only, persist the derived rendering separately, return it. The PDF
rendering is a derivative/cache of the immutable artifact, not part of the authoritative evaluation
state. Requirements: lazy on first request; subsequent downloads reuse the persisted rendering;
rendering never re-runs Property Intelligence, external GIS retrieval, PostGIS, the Rules Engine, or
Report Explanation; PDF generation reads only the persisted `EvidenceReportArtifact`;
generating/caching the PDF never mutates the artifact; deleting/rebuilding a `ReportPdfRendering`
cannot alter the underlying report; PDF generation failure does not corrupt or modify the report
artifact; concurrent first requests must not create conflicting authoritative state (duplicate
equivalent rendering work is tolerable at prototype scale, or a simple database uniqueness
constraint may prevent duplicate persisted renderings). This resolves the apparent tension in the
approved Functional Design between BR-U2-6's lazy-PDF allowance and `EvidenceReportArtifact`'s
immutability — the PDF is a derived rendering, not a field filled in later on the artifact.
Functional Design's `domain-entities.md` and `business-rules.md` (BR-U2-6) are corrected to reflect
this, opportunistically, without reopening the broader Functional Design review.
