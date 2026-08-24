# Unit 2: Report Generation & Presentation Prototype — NFR Requirements Plan

**Functional Design consumed**: business-logic-model.md, business-rules.md, domain-entities.md,
frontend-components.md (approved 2026-08-22, including the lot-line-role/evidence-quality
correction). **Product-level stack already fixed** (requirements.md §9): Next.js, TypeScript,
PostgreSQL, PostGIS, Drizzle ORM — this document covers only Unit-2-scoped open choices, per the
same pattern Unit 1's NFR Requirements used.

**What's genuinely new here**: Unit 2 is the first unit with a real deployed runtime, a real
map-based UI, a real (if lightweight) access-control boundary (`reportAccessToken`), and the first
live PostGIS wiring. Unit 1's NFR patterns (Bounded-Retry Executor, Boundary Validator, structured
logging, deterministic/integration test split) are reused, not redecided — questions below focus
only on what those patterns don't already cover.

---

## NFR Assessment Checklist
- [x] Answer clarifying questions below
- [x] Analyze answers for ambiguity; raise follow-ups if needed — none needed, all 7 answers were
      specific and unambiguous
- [x] Create `nfr-requirements.md` — scalability (prototype-scale, not zero), performance
      (report-generation latency, map interaction, PostGIS query targets), availability
      (no formal SLA yet), security (token entropy/handling, King County/Anthropic credentials
      reaffirmed env-only, input validation at new trust boundaries — parcel-polygon response,
      placement/footprint input, front/rear edge selection), reliability (retry/degradation
      parameters, safe job-retry), maintainability/testing (deterministic + integration split
      extended to the new King County endpoint and new UI surface)
- [x] Create `tech-stack-decisions.md` — map library, PDF generation approach (deferred from
      Functional Design Question 6), token-generation mechanism, any other Unit-2-scoped tooling
      choice
- [x] Cross-check every NFR traces to a specific Functional Design rule/workflow (BR-U2-1 through
      BR-U2-10) or story (PC-1/PC-2, RGD-1..6) — no speculative NFR content

---

## Clarifying Questions

### Question 1 — Report Access Token: Entropy, Expiration, and Rate-Limiting
BR-U2-7 requires `reportAccessToken` be "sufficiently random that it cannot be practically
enumerated." Functional Design left the concrete mechanics to this stage.

A) **A cryptographically random token (≥128 bits of entropy), never expiring** (a purchased/
   founder-generated prototype report should remain reachable by its link indefinitely, matching
   how a real purchased report will behave once Unit 2B adds real access) — plus **basic rate-
   limiting on failed report lookups** (defense-in-depth against brute-force guessing, even though
   the entropy alone already makes guessing infeasible) as a lightweight, proportionate addition
   given this is the app's first real access-control boundary. **Recommended.**

B) A shorter/simpler token (e.g. a UUID) with no rate-limiting — less defense-in-depth, but UUIDs
   are already commonly treated as unguessable in practice.

X) Other (describe after [Answer]: below)

[Answer]: X

Use a cryptographically random 256-bit bearer token (32 random bytes, base64url encoded), generated
via a cryptographically secure random source (e.g. Node's `crypto.randomBytes()` — no additional
token-generation dependency needed). Never derived from `reportId` or any predictable value. Store
only a one-way hash of the token where practical; the raw bearer token is returned only once, at
access-URL creation. Client-facing retrieval hashes the presented token and resolves against the
stored hash. Never log the raw token or expose it in analytics/error payloads. `reportId` alone
never authorizes access. No automatic expiration required for the prototype, but "report lifetime"
and "access-credential lifetime" are separate concepts — preserve the ability to revoke/rotate a
token so a leaked never-expiring URL is not permanently irrecoverable. Apply lightweight rate
limiting to repeated failed token lookups; do not introduce Redis or another distributed rate-limit
datastore solely for this — use whatever lightweight mechanism the eventual hosting platform
reasonably supports (Infrastructure Design's choice). The NFR is: token guessing is computationally
infeasible, and a leaked token is operationally revocable.

### Question 2 — Map Library Choice
`ParcelPlacementMap` and `ReportMap` (frontend-components.md) both need a real map-rendering
library — genuinely undecided until now.

A) **Use an open-source, no-account-required map library** (e.g. MapLibre GL JS or Leaflet) with
   a freely-usable basemap — avoids a new paid third-party dependency/API-key requirement for a
   prototype still pre-Commercial-GO, and keeps the map interaction's actual requirement (display a
   polygon, accept a tap/click, show a rotation control) simple enough not to need a premium
   mapping platform's feature set. **Recommended**, consistent with the category A/B proportionality
   instruction (no new paid commercial dependency merely for the prototype).

B) Use a commercial mapping platform (e.g. Mapbox, Google Maps) — likely nicer default styling and
   basemap quality, but introduces a new paid vendor relationship/API key before Commercial GO.

X) Other (describe after [Answer]: below)

[Answer]: A

Use MapLibre GL JS. It fits the approved TypeScript/Next.js stack and supports everything this unit
needs: parcel polygon display, proposed shed footprint display, click/tap placement, rotation
interaction, report-map overlays, GeoJSON sources/layers. Do not introduce Mapbox or Google Maps
merely for this prototype. Important distinction: MapLibre is the rendering library; the basemap/
tile source is a separate infrastructure/data-provider decision. Do not make OpenStreetMap's
community `tile.openstreetmap.org` service a production dependency merely because OSM data is open
— its public tile servers are best-effort and subject to usage restrictions. Infrastructure Design
selects a basemap source whose usage terms and capacity are appropriate for the deployed prototype.
The parcel polygon itself continues to come from the approved King County source, not from the
basemap.

### Question 3 — PDF Generation Approach (deferred from Functional Design Question 6)
Functional Design fixed only the invariant (PDF = same snapshot as web, never independently
regenerated); the concrete technology is decided here.

A) **Server-side HTML-to-PDF rendering of the same web-report template** (e.g. a headless-
   browser-based renderer invoked server-side against the already-generated report snapshot) —
   guarantees the PDF and web report are visually/structurally the same rendering of the same data
   by construction, rather than two independently-maintained templates that could drift.
   **Recommended.**

B) A separate, purpose-built PDF-authoring library/template distinct from the web template — more
   control over print-specific layout, but two templates to keep in sync, raising exactly the risk
   BR-U2-6 exists to prevent (must still render only the persisted snapshot's data, never
   re-derive it).

X) Other (describe after [Answer]: below)

[Answer]: X

Use server-side HTML/browser-based PDF generation, but do NOT require the PDF to literally render
the identical interactive web-page template. The stronger invariant: both the web rendering and the
PDF rendering derive from the same persisted immutable `EvidenceReportArtifact`, and both use the
same shared report presentation model/components wherever practical — the PDF may use print-
specific presentation where needed. This matters particularly for the interactive MapLibre/WebGL
map, which does not need to be reproduced as an interactive map inside a PDF: the PDF may render the
same report sections/findings/evidence with print-specific CSS and a static map representation
derived solely from the artifact's stored geometry, while the web version uses the interactive
MapLibre map. Neither version may re-query GIS/property data, rerun PostGIS, rerun the Rules
Engine, rerun Report Explanation, or select newer rules/model/data than the snapshot already used. A
headless-browser HTML-to-PDF approach is appropriate; the exact browser package/runtime integration
is finalized during NFR Design/Infrastructure Design. This avoids maintaining two independent report
*data* templates while still allowing a print-appropriate layout.

### Question 4 — Performance Targets for the First Live PostGIS Wiring
Unit 1 had no live PostGIS query to benchmark. Unit 2 introduces the first real ones (parcel-
boundary fetch + setback computation). Should this unit set a concrete performance target, or defer
to observed behavior?

A) **A soft target, not a hard SLA**: report generation (the full async pipeline, Workflow 4)
   should typically complete within a low-single-digit number of minutes end-to-end (dominated by
   the AI Service call and external GIS fetch, not PostGIS itself, which should be sub-second for a
   single-parcel query) — treated as a design sanity check, not a customer-facing promise, since
   there is no live payment/SLA commitment in this unit at all. **Recommended** — avoids
   over-specifying a number nothing yet depends on, while still giving Code Generation a concrete
   "does this feel wrong" bar.

B) No target at all — purely observe and adjust later.

X) Other (describe after [Answer]: below)

[Answer]: X

Use soft engineering sanity thresholds plus stage-level timing instrumentation rather than a
customer SLA or a vague "a few minutes is fine" target. Initial prototype expectations: interactive
placement manipulation should feel immediate (local UI work); a single-parcel PostGIS spatial
operation should normally complete well below one second under ordinary development conditions; the
complete asynchronous report-generation pipeline should normally complete in seconds-to-tens-of-
seconds rather than minutes; generation taking longer than approximately 60 seconds under otherwise
healthy conditions should be treated as something to investigate, not an acceptable baseline. These
are non-blocking engineering sanity targets, not contractual SLAs. Record timings separately for:
parcel geometry retrieval, Property Intelligence retrieval, PostGIS Spatial Analysis, Regulatory
Rules Engine, Report Explanation, artifact persistence, and PDF generation when requested. Use Build
& Test measurements to establish the real baseline and revise the soft numbers if evidence
justifies it. Do not optimize prematurely merely to hit these values.

### Question 5 — Security: New Trust Boundaries Introduced by This Unit
Per the enabled Security Baseline extension (requirements.md), every new trust boundary needs
runtime validation (reused Boundary Validator pattern) — Functional Design identified three new
external/user-input boundaries: (a) King County's parcel-polygon API response, (b) the user-
submitted `proposedFootprint`/placement data, (c) the user's front/rear edge selection
(`LotLineRoleAssignment` input). Confirm scope:

A) **All three get the same Boundary Validator treatment already proven in Unit 1** (schema
   validation before domain code ever sees the value; malformed King County responses rejected
   exactly like the existing adapters; malformed/out-of-range placement or edge-selection input
   rejected server-side per PC-2's existing requirement) — no new validation *pattern*, just the
   existing pattern applied to three new boundaries. **Recommended** — this is a direct continuation
   of NFR-5's already-established scope, not a new decision.

X) Something about one of these three boundaries needs different treatment — describe after
   [Answer]: below

[Answer]: A

Apply the existing Boundary Validator pattern to all three (King County parcel-polygon response,
`proposedFootprint`/placement input, `LotLineRoleAssignment`/front-rear-side selection input) — all
treated as untrusted until runtime schema validation succeeds. Additional requirements: reject
malformed polygons; reject non-finite coordinates; reject structurally invalid lot-line assignments;
reject edge references that do not belong to the submitted parcel boundary; reject impossible/out-
of-range shed dimensions and placement inputs; never trust client-computed setback distances —
server/PostGIS recomputes authoritative spatial values regardless of what a client claims. No new
validation architecture needed.

### Question 6 — Reliability: Reuse Unit 1's Retry/Degradation Parameters As-Is?
BR-U2-3 (pipeline safety) and BR-U2-8 (LLM degradation) reaffirm Unit 1's existing patterns
(Bounded-Retry Executor, `DEFAULT_RETRY_POLICY`: 3 attempts). Should Unit 2 reuse these exact
parameters for its new external calls (King County parcel-polygon fetch, the AI call for Report
Explanation), or does anything about this unit's context call for different values?

A) **Reuse `DEFAULT_RETRY_POLICY` (3 attempts, backoff) as-is for both** — no evidence yet that
   Unit 2's external calls have meaningfully different failure characteristics than Unit 1's
   already-proven King County/Anthropic integrations. **Recommended.**

X) Different parameters needed for one of these — describe after [Answer]: below

[Answer]: A

Reuse Unit 1's existing Bounded-Retry Executor and `DEFAULT_RETRY_POLICY` as the initial Unit 2
behavior — no second retry system. Unchanged distinctions: retry only safe/idempotent external
reads; exhaustion becomes an explicit failure/degradation state; King County failure cannot
silently produce valid geometry; Report Explanation failure does not fail the deterministic report;
retries must not duplicate `EvidenceReportArtifact` creation. Retry policy stays source-
configurable, as Unit 1's NFR Design already allows — if Build & Test shows Anthropic or the
parcel-polygon endpoint has materially different latency/failure behavior, tune that source's
configuration based on evidence rather than redesigning the resilience pattern.

### Question 7 — Testing Approach for the New UI Surface
Unit 1 had no frontend, so its test-suite split (deterministic domain tests vs. live integration
tests) never had to address UI testing. Unit 2 does.

A) **Component-level tests for the new frontend components** (frontend-components.md's tree),
   run within the same deterministic (`npm test`) gate — no browser/e2e automation required for
   Unit 2's prototype scope. Manual verification (matching this project's established practice of
   actually using the feature in a browser before reporting a UI task complete) substitutes for
   automated end-to-end tests at this stage. **Recommended** — proportionate to a pre-Commercial-GO
   prototype; full e2e coverage is more naturally a Unit 2B/later investment once there's a real
   purchase flow to protect.

B) Build full browser-based end-to-end test automation now.

X) Other (describe after [Answer]: below)

[Answer]: X

Use three layers, keeping the browser layer deliberately small. (1) Component tests in the
deterministic `npm test` gate: project configuration validation, placement state behavior,
lot-line-role selection behavior, REQUIRES_VERIFICATION rendering, evidence/caveat rendering,
explanation-unavailable state, report-access failure states. (2) A small automated browser smoke
suite (e.g. Playwright) for only the highest-value end-to-end path: load project configuration,
place an approximate shed on the map, identify lot-line roles, submit a valid configuration,
retrieve a generated fixture report through `reportAccessToken`, verify `reportId` alone cannot
retrieve it, verify the report renders findings and the non-map accessible representation — not a
comprehensive E2E suite, and does not simulate checkout/accounts/Unit 2B behavior. (3) Manual
browser verification remains required for subjective/visual behavior: map usability, keyboard
interaction, responsive layout, PDF appearance, visual distinction of REQUIRES_VERIFICATION,
parcel/source caveat visibility. The smoke suite is added now specifically because Unit 2 is the
first real browser product surface — map interaction, routing/access-token behavior, and
client/server integration are difficult to prove adequately with component tests alone. Do not
build a broad commercial-grade E2E matrix before Commercial GO.
