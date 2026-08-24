# Unit 2: NFR Requirements

Reuses Unit 1's NFR-5 (security discipline: env-only credentials, runtime schema validation at
every trust boundary) and general reliability posture unchanged. This document adds only what
Unit 2's new surfaces (deployed frontend, live PostGIS, token-based access) require.

## NFR-U2-1: Scalability

Prototype scale, not zero. Unlike Unit 1 (no runtime at all), Unit 2 has a real deployed app
serving founder-triggered generation and Unit 0C interview traffic — low volume (single-digit to
low-double-digit concurrent users at most), but not "nothing runs." No specific throughput target
is set. **Corrected 2026-08-22**: the async job model (`ReportGenerationJob`,
QUEUED→IN_PROGRESS→COMPLETE/FAILED) gives generation work a durable place to queue rather than
requiring it to run synchronously on a request thread — it does not, by itself, guarantee or limit
execution concurrency; that is an implementation/infrastructure concern (how many jobs are claimed
and processed at once), not a property the persisted job state provides automatically. At Unit 2's
prototype volume this distinction doesn't require additional machinery to address — it's noted here
so NFR Design doesn't inherit an overstated concurrency guarantee. No autoscaling, load balancing,
or multi-instance coordination is introduced for this volume.

## NFR-U2-2: Performance (soft targets, not SLAs)

Per Question 4 — non-blocking engineering sanity checks, not contractual commitments (there is no
live payment/SLA relationship in this unit at all):

- Interactive placement manipulation (`ParcelPlacementMap`) should feel immediate — local UI work,
  no server round-trip required for the anchor/rotation interaction itself.
- A single-parcel PostGIS spatial operation should normally complete well below one second under
  ordinary development conditions.
- The complete asynchronous report-generation pipeline (Workflow 4) should normally complete in
  seconds-to-tens-of-seconds, not minutes. Generation exceeding ~60 seconds under otherwise healthy
  conditions is a signal to investigate, not an accepted baseline.
- **Stage-level timing instrumentation is required** (not just an aggregate number) — record
  timings separately for: parcel geometry retrieval, Property Intelligence retrieval, PostGIS
  Spatial Analysis, Regulatory Rules Engine, Report Explanation, artifact persistence, and PDF
  generation when requested. Build & Test's actual measurements establish the real baseline;
  these soft numbers are revised from evidence, not defended as correct in advance.
- No premature optimization against these numbers — they exist to catch something obviously wrong,
  not to be chased.

## NFR-U2-3: Availability

No formal uptime SLA — consistent with "no live payment/commercial commitment in this unit."
Unchanged from Unit 1's general posture: no production monitoring/alerting infrastructure
introduced speculatively (would contradict the category A/B proportionality instruction).

## NFR-U2-4: Security

### Report Access Token (BR-U2-7, Question 1)
- 256-bit cryptographically random bearer token (32 random bytes, base64url-encoded), generated via
  a cryptographically secure random source (Node's `crypto.randomBytes()` — no new dependency).
- Never derived from `reportId` or any predictable value.
- **Required, not merely practical: only a one-way cryptographic hash of the token is ever
  persisted.** The raw token is generated once, returned exactly once (at access-URL creation
  time), and never stored in recoverable/plaintext form anywhere. A design that persists the
  recoverable plaintext token is non-compliant with this NFR, full stop — if a future requirement
  genuinely needs a recoverable token, that requires an explicit NFR change, not a silent exception
  found by reading "where practical" loosely.
- Client-facing retrieval hashes the presented token and resolves against the stored hash —
  `getReport` never accepts or compares a raw token against a raw stored value.
- Never logged in plaintext; never included in analytics or error payloads.
- `reportId` alone never authorizes access (BR-U2-7, unchanged).
- No automatic expiration for the prototype, but token lifetime is a concept distinct from report
  lifetime — the design must preserve the ability to revoke/rotate a specific token (e.g.,
  invalidate the stored hash and issue a new one) so a leaked, non-expiring URL is not permanently
  irrecoverable.
- Lightweight rate limiting on repeated failed token lookups, as defense-in-depth (the entropy
  alone already makes brute-force guessing computationally infeasible; rate limiting is a second,
  proportionate layer, not a load-bearing one). No new distributed datastore (e.g. Redis)
  introduced solely for this — the concrete mechanism is an Infrastructure Design choice, using
  whatever the eventual hosting platform reasonably supports.

### Credentials (reaffirmed, unchanged from Unit 1)
`DATABASE_URL`, `ANTHROPIC_API_KEY` remain environment-variable-only. Any new credential this unit
introduces (none currently required — King County's parcel-polygon layer, like the existing King
County endpoints, is a public, unauthenticated API) follows the same discipline.

### New Trust Boundaries (Question 5)
All three of the following get the same Boundary Validator treatment already proven in Unit 1 —
schema-validated before any domain code sees the value, no new validation *pattern*:
1. King County's parcel-polygon API response.
2. User-submitted `proposedFootprint`/placement data.
3. User-submitted `LotLineRoleAssignment` (front/rear/side edge selection).

Specific rejection requirements: malformed polygons; non-finite coordinates; structurally invalid
lot-line assignments; edge references that don't belong to the submitted parcel boundary;
impossible/out-of-range shed dimensions and placement inputs. **Client-computed setback distances
are never trusted** — even if a client happened to compute and submit a distance value, the
server/PostGIS recomputation is the only authoritative source; this is not merely a validation rule
but a restatement of BR-U2-9's "Spatial Analysis never infers/accepts role-dependent distances
except from its own computation."

## NFR-U2-5: Reliability

Reuses Unit 1's Bounded-Retry Executor and `DEFAULT_RETRY_POLICY` (3 attempts, backoff) as-is for
both new external calls (King County parcel-polygon fetch, Report Explanation's AI call) — no
second retry system, no new parameters invented without evidence (Question 6). Unchanged
distinctions: retry only safe/idempotent reads; retry exhaustion becomes an explicit
failure/degradation state (never a silent favorable default); King County failure cannot silently
produce valid geometry; Report Explanation failure never fails the deterministic report
(BR-U2-8); retries must never duplicate `EvidenceReportArtifact` creation (BR-U2-3's safe-retry
requirement). Retry policy remains source-configurable — if Build & Test evidence shows materially
different latency/failure characteristics for a specific source, that source's configuration is
tuned, not the pattern redesigned.

## NFR-U2-6: Maintainability / Testing

Extends Unit 1's deterministic (`npm test`, no network/DB/credentials) + integration
(`npm run test:integration`, live/credentialed) split — same two-suite discipline, now covering:
- The new King County parcel-polygon endpoint: deterministic tests against captured fixtures; a
  live integration test against the real endpoint (same pattern as the existing King County
  address/property-info integration tests).
- The new UI surface (Question 7), in three layers:
  1. **Component tests**, in the deterministic gate: project-configuration validation, placement
     state behavior, lot-line-role selection behavior, `RequiresVerificationCard` rendering,
     evidence/caveat rendering (BR-U2-4's mandatory disclosure, testable as "is this text present"),
     explanation-unavailable state, report-access failure states.
  2. **A small automated browser smoke suite** (Playwright or equivalent) — the single highest-
     value end-to-end path only: configure a shed project, place it on the map, identify lot-line
     roles, submit, retrieve a fixture report via `reportAccessToken`, verify `reportId` alone
     fails, verify findings and the non-map accessible representation render. Not a comprehensive
     E2E matrix; does not simulate checkout/accounts/Unit 2B behavior. Added specifically because
     Unit 2 is the first real browser product surface — map interaction and token-based access are
     difficult to prove adequately with component tests alone.
  3. **Manual browser verification** (this project's established practice) for subjective/visual
     behavior the automated layers don't cover well: map usability, keyboard interaction,
     responsive layout, PDF appearance, visual distinction of REQUIRES_VERIFICATION, caveat
     visibility.

## Extension Compliance Summary

| Extension | Applicable Here | Status |
|---|---|---|
| Security Baseline | Yes | Compliant — NFR-U2-4 (token handling, credential discipline, boundary validation for 3 new trust boundaries) |
| Resiliency Baseline | Yes | Compliant — NFR-U2-5 (reuses Unit 1's proportionate/directional bounded-retry pattern, no new infrastructure) |
| Property-Based Testing | Partial | The new PostGIS setback computation is a spatial/geometry primitive within the extension's targeted scope (per Inception's "spatial/geometry/rule primitives" carve-out) — property-based test coverage for this specific function is expected during Code Generation, consistent with Unit 1's `geometry.ts` reference-implementation testing approach. Not otherwise applicable to this unit's UI/orchestration code (fixture-based, per the extension's own scope limit). |
