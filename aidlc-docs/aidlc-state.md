# AI-DLC State Tracking

## Project Information
- **Project Name**: Permit Preflight
- **Project Type**: Greenfield
- **Start Date**: 2026-08-19T15:06:23Z
- **Current Stage**: INCEPTION - Requirements Analysis

## Workspace State
- **Existing Code**: No
- **Reverse Engineering Needed**: No
- **Workspace Root**: /Users/choiniere/Documents/CODE/permit-preflight
- **Governing Brief**: docs/product/permit-preflight-inception-brief.md

## Code Location Rules
- **Application Code**: Workspace root (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only
- **Structure patterns**: See code-generation.md Critical Rules

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| Security Baseline | Yes | Requirements Analysis |
| Resiliency Baseline | Yes (proportionate/directional, per user) | Requirements Analysis |
| Property-Based Testing | Yes (targeted scope: spatial/geometry/rule primitives/parsers/serialization; fixture-based for full scenarios and rule behavior) | Requirements Analysis |

## Stage Progress
### 🔵 INCEPTION PHASE
- [x] Workspace Detection
- [ ] Reverse Engineering (N/A - greenfield)
- [x] Requirements Analysis (COMPLETE & APPROVED 2026-08-19 - persona, project-type order (revised: vacant-land moved to position 3), and risk-based rule-review model all approved; see requirements.md)
- [x] User Stories (APPROVED 2026-08-19 - stories.md 54 stories across 8 epics [PR 5, PC 3, SRE 13, RGD 6, PO 6, ACC 4, RRAG 8, ADM 9], personas.md 4 personas)
- [x] Workflow Planning (APPROVED 2026-08-19, with Unit 0/GO-PIVOT-NO-GO clarification recorded in execution-plan.md)
- [x] Application Design (APPROVED 2026-08-19 - 16 components, 6 services, baseline for Units Generation)
- [x] Units Generation (APPROVED 2026-08-19 - 12 units [0-11], all 54 stories mapped exactly once, Unit 0=GO gates all production units, Unit 3 gates Units 4-11, no project-type unit depends on another, approved sequence preserved)

## FINAL INCEPTION GATE — APPROVED 2026-08-19
Inception formally complete and approved (all artifacts, including inception-summary.md, approved
after two accuracy-correction passes). Authorized to proceed to Unit 0 only. Units 1-11 / production
Construction remain NOT authorized until Unit 0 produces GO and that is separately approved.

### 🟢 CONSTRUCTION PHASE
- [x] Unit 0: Pre-Construction Validation — PIVOT (accepted by user 2026-08-19)
## PRAGMATIC CONSTRUCTION STANDARD (adopted 2026-08-19 — standing guidance for all remaining stages)
Approved architecture/requirements remain authoritative, but approval gates should focus on
*material* issues: regulatory correctness, violation of core architectural invariants,
security/privacy problems, loss of auditability/provenance, major irreversible architectural
decisions, direct contradictions with approved requirements, unjustified scope expansion. Minor
refinements, naming decisions, tunable parameters, implementation details, and reversible design
choices are NOT reasons to stop progress — capture them as implementation decisions/follow-up items
and move on. Artifacts are living documents, amendable later as implementation/testing provides
evidence.

## TWO-GATE MODEL (adopted 2026-08-19 — see execution-plan.md for full detail)
Single Unit 0 gate replaced by two independent gates:
- **TECHNICAL FEASIBILITY GATE**: Unit 0 -> Unit 0B -> **TECHNICAL GO (ACCEPTED 2026-08-19)**.
  Authorizes Unit 1 (full) and Unit 2 (report generation/presentation only, no live payment).
- **COMMERCIAL VALUE GATE**: Unit 0C, open, runs in PARALLEL with technical Construction (does not
  block it). Gates Unit 2B (live payment) onward: Unit 3, and Units 4-11 (additional project types,
  Optional Accounts). Not yet satisfied.

- [x] Unit 0: Pre-Construction Validation — COMPLETE -> PIVOT
- [x] Unit 0B: Pivot Validation — COMPLETE -> **TECHNICAL GO** (accepted). Parcel resolution,
      ECA precedence, source-access workflow, and rule-authoring feasibility all evidenced
      sufficient.
- [ ] Unit 0C: Customer Value Validation — protocol/template prepared
      (unit-0c-customer-value-interview-protocol.md), AWAITING USER TO CONDUCT REAL INTERVIEWS.
      Gates Commercial GO only — does NOT block Units 1-2.
- [x] Unit 1: Deterministic Evaluation Foundation (Sheds) — **✅ COMPLETE 2026-08-22** (all 7 stages
      approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design, Code
      Generation, Build & Test, Operations. Not to be reopened for minor refinements. 2 tracked
      non-blocking external-verification items remain open — see
      aidlc-docs/operations/external-verification-tracker.md.)
- [ ] Unit 2: Report Generation & Presentation Prototype ("Purchasable Shed Report") — AUTHORIZED,
      **IN PROGRESS** (started 2026-08-22). Preserves the Two-Gate Model: Unit 0C remains OPEN,
      runs in parallel, does not block continued engineering. Planning will distinguish reusable
      product/report foundation (Screening Request, orchestration of Unit 1's deterministic
      capabilities, PostGIS production spatial-analysis wiring, evidence/report artifact
      generation, report presentation/explanation, immutable/versioned snapshot behavior,
      failure/degradation handling) from explicitly commercial/customer-commitment work (payment/
      paywall, production deployment, customer-facing purchase flow, commercial polish) — the
      latter is not forbidden, but investment stays proportional while Commercial GO is unmet.
  - [x] Functional Design — **APPROVED 2026-08-22** (business-logic-model.md, business-rules.md,
        domain-entities.md, frontend-components.md; 1 targeted correction applied post-review, see
        below). Key decisions: explicit `authorizeReportGeneration` internal-trigger action
        (swappable for real PAID in Unit 2B); on-demand King County parcel-polygon geometry fetch
        with a mandatory, propagated source-quality caveat (general-location, not survey/legal
        boundary — never dropped through Spatial Analysis into the report); minimal map-based
        approximate-placement UI (not manual distance entry, not a CAD tool); Report Explanation
        reuses Unit 1's AiCompletionClient pattern as a structurally distinct instance; report
        access via an opaque bearer `reportAccessToken`, never a bare `reportId` (report identity ≠
        report authorization); PDF and web are two renderings of one immutable snapshot, tech
        deferred to NFR stage; real, usable (not commercially polished) Next.js frontend for
        PC-1/PC-2/RGD-2/3/6.
        **Post-review correction (2026-08-22, BR-U2-9/BR-U2-10)**: (1) added `LotLineRoleAssignment`
        — front/rear/side lot-line roles are never inferred from `boundaryPolygon` shape alone;
        captured via explicit user indication during placement, fail-closed (`INSUFFICIENT`, not
        guessed) for corner lots/irregular parcels/multiple frontages, feeding Unit 1's existing
        missing-evidence path rather than a new mechanism; (2) evidence quality now gates KNOWN
        classification, not just report-copy disclosure — added `evidenceQuality` to `Provenance`
        and an additive `acceptedEvidenceQuality` field to Unit 1's `RegulatoryRule` (a human
        governance decision at rule-approval time), so a `GENERAL_LOCATION_ONLY`-sourced finding can
        only be KNOWN if the applied ACTIVE rule's governance record explicitly accepts that
        evidence quality — still no fabricated numeric tolerance (BR-U2-4 point 5's prohibition
        unchanged).
  - [x] NFR Requirements — **APPROVED 2026-08-22** (nfr-requirements.md, tech-stack-decisions.md;
        2 non-blocking wording corrections applied post-approval: hash-only token persistence
        stated as a hard requirement not "where practical"; ReportGenerationJob's queuing described
        accurately as "a durable place to queue," not an automatic concurrency guarantee). Key
        decisions: 256-bit hashed, revocable bearer report-access token with lightweight rate
        limiting; MapLibre GL JS (basemap source deferred to Infrastructure Design); server-side
        headless-browser PDF sharing the web report's data templates (not a literal page render);
        soft performance sanity targets with per-stage timing instrumentation (not an SLA); Unit 1's
        Boundary Validator pattern applied to 3 new trust boundaries; Unit 1's DEFAULT_RETRY_POLICY
        reused unchanged; 3-layer UI testing (deterministic component tests + a small Playwright
        smoke suite + manual verification).
  - [x] NFR Design — **APPROVED 2026-08-22** (nfr-design-patterns.md, logical-components.md; 1
        non-blocking wording correction applied post-approval: Pattern 6's PDF request is
        authorized by `reportAccessToken`, never a client-supplied `reportArtifactId`). 8 patterns
        (report access credential, failed-lookup rate limiter, ReportGenerationJob atomic claim +
        stale-claim recovery, STAGE_TIMING logger extension, PostGIS adapter boundary,
        EvidenceReportArtifact/ReportPdfRendering split, map-input validation reuse, UI test
        pyramid reaffirmed), all explicitly justified as needing no new infrastructure. Applied a
        small opportunistic Functional Design correction (domain-entities.md, BR-U2-6): PDF is a
        disposable `ReportPdfRendering` derivative, not a field on the immutable
        `EvidenceReportArtifact` — resolves a latent tension between BR-U2-6's lazy-PDF allowance
        and the artifact's immutability.
  - [x] Infrastructure Design — **APPROVED 2026-08-22** (infrastructure-design.md,
        deployment-architecture.md; shared-infrastructure.md updated; 1 non-blocking wording
        correction applied post-approval: King County parcel-polygon fetch ownership corrected to
        Property Intelligence, never the PostGIS adapter). Key decisions: Railway Hobby, one
        persistent Service, no serverless/app-sleeping, in-process ReportGenerationJob poller (no
        queue/worker/cron); one dedicated Neon branch for the deployed prototype with automated
        pre-deploy migrations; in-process rate limiter (single-replica assumption, explicit revisit
        trigger); MapTiler Cloud free tier for MapLibre's basemap (explicit Commercial-GO
        checkpoint, browser key treated as public/origin-restricted not secret); in-process
        containerized headless-Chromium PDF rendering with ReportPdfRendering stored as Postgres
        bytea; Railway native secrets with an explicit server-secret-vs-public-client-config
        distinction; GitHub Actions on a branch-protected main as a real blocking CI gate
        (deterministic+component tests, typecheck, build, Playwright smoke — live-integration suite
        non-blocking); Railway-native logs with an extended, explicit event vocabulary and a
        never-log list. 8 carry-forward implementation requirements recorded verbatim for Code
        Generation. Explicitly no Redis, queue, distributed lock, object storage, PDF/GIS
        microservice, APM platform, load balancer, multi-replica, or Kubernetes.
  - [x] Code Generation — **APPROVED 2026-08-23** (2 targeted post-review corrections applied,
        no further Code Generation gate per explicit user instruction). Full backend (5 new
        persisted entities, real PostGIS adapter, real King County parcel-polygon retrieval,
        BR-U2-9/BR-U2-10 evidence-quality gating, report-access token lifecycle, atomic job
        claim/recovery, real headless-Chromium PDF rendering) + a real Next.js frontend (MapLibre
        map placement, token-based report retrieval, ReportMap) + CI workflows (`ci.yml` blocking
        gate, `integration.yml` non-blocking live suite). 125/125 deterministic tests, typecheck
        clean, production build succeeds, 14/14 executable live-integration tests pass (King
        County incl. the parcel-polygon endpoint with verified `outSR=2926`, Legistar, real PDF
        rendering), 2/2 executable Playwright smoke tests pass against a real running server (17+2
        tests correctly skip — no Neon/Anthropic credentials in this sandbox).
        **Post-review corrections (2026-08-23)**: (1) replaced a flat-earth coordinate
        approximation with a single explicit CRS contract (browser submits native WGS84, PostGIS's
        `ST_Transform` is the only reprojection point, `Polygon.srid` + fail-closed guards) — found
        during the fix that King County's parcel-polygon endpoint's undeclared default SRID is
        actually EPSG:3857, not the originally-assumed 2926, a real defect the correction itself
        caught; (2) implemented the approved `ReportMap` component, reading only geometry already
        persisted on the immutable artifact (computed once via real `ST_Transform` during
        generation, never re-derived at view time). Both corrections' live-database-dependent
        verification (real `ST_Transform` execution, the full Playwright smoke path via a real map
        click) remains explicitly open — tracked in
        aidlc-docs/operations/external-verification-tracker.md items 3-4, not fabricated. 3 real
        defects found and fixed during the original Code Generation pass via genuine testing: an
        instrumentation.ts server-boot crash when DATABASE_URL is unset, a Playwright file-scope
        test.skip scoping bug, and a disclosed drizzle-orm SQL-injection advisory (upgraded
        0.36.4→0.45.2). See
        aidlc-docs/construction/unit-2-report-generation-presentation-prototype/code/README.md for
        full detail.
  - [x] Build and Test — **APPROVED 2026-08-23** (1 non-blocking doc fix applied post-approval:
        the Security/Provenance section's SRID-guard file reference corrected from
        `report-access/repository.ts` to `spatial-analysis/postgis-adapter.ts`)
        (aidlc-docs/construction/build-and-test/build-and-test-summary.md, covering both Unit 1
        and Unit 2). typecheck clean; `next build` succeeds (first unit with a real compiled
        artifact); 125/125 deterministic tests; 14/14 executable live-integration tests (King
        County incl. verified `outSR=2926`, Legistar, real PDF rendering); 2/2 executable
        Playwright smoke tests against a real running server. 4 external-verification items remain
        open (Neon/PostGIS CRS transform + DB round-trips, live Anthropic, full DB-dependent
        browser smoke path, STAGE_TIMING performance baseline) — tracked in
        aidlc-docs/operations/external-verification-tracker.md, not fabricated.
- [ ] Unit 2B: Commercial Payment & Fulfillment — BLOCKED pending Commercial GO
- [ ] Unit 3, Units 4-11 — BLOCKED pending Commercial GO (via Unit 2B)

## Unit 0 / GO-PIVOT-NO-GO Gate (binding, see execution-plan.md for full detail)
Sequence: Inception -> Application Design -> Units Generation -> Inception approval -> Unit 0
(Pre-Construction Validation, lightweight/human-in-the-loop, no production app required) -> explicit
GO/PIVOT/NO-GO decision -> only then substantial production Construction. All production units
depend on Unit 0's GO outcome. NO-GO stops production Construction. PIVOT returns to
requirements/application-design/units-planning artifacts for revision.

## Outstanding Pre-Final-Gate Items
Items that do not block ongoing Inception stages but MUST be resolved/reported before the final
Inception approval-gate summary is presented for Construction sign-off.

| Item | Status | Notes |
|---|---|---|
| Seattle land-use professional/counsel Tier-2 rule-review cost research (land-use consultant/planner, architect/domain-professional, land-use attorney — rate ranges + fit mapping) | ✅ Complete (2026-08-19) | ~$100-$1,800/escalated rule depending on professional type; Seattle-specific data found for architect rates, general-market for consultant/attorney. See research-findings.md §5. Incorporated into requirements.md §3.2/§14/§15. |

### 🟡 OPERATIONS PHASE (placeholder stage per CLAUDE.md - no formal template; lightweight, scoped per user instruction 2026-08-22)
- [x] Unit 1 Operations Runbook — **APPROVED 2026-08-22**
      (aidlc-docs/operations/unit-1-operations-runbook.md,
      aidlc-docs/operations/external-verification-tracker.md). Non-blocking wording cleanup applied
      (source-failure diagnosis guidance neutralized, no "almost always upstream" assumption).
- [x] Unit 2 Operations Runbook — **APPROVED 2026-08-24** (3 non-blocking housekeeping cleanups
      applied post-approval: a stale tracker-item cross-reference corrected (item 4→5); the
      Anthropic tracker item split into 2a Rule Research Assistant/RRAG-1 and 2b Report
      Explanation, each independently NOT YET RUN, with a genuine test-coverage gap noted for
      `explainFindings` — a background task suggestion was raised for it, not fixed inline; a new
      tracker item 6 added for Railway's unverified client-IP/rate-limit source-key behavior)
      (aidlc-docs/operations/unit-2-operations-runbook.md,
      aidlc-docs/operations/external-verification-tracker.md items 3-6). Covers Railway
      deployment/startup, app-sleeping-disabled confirmation, job-poller single-start, graceful
      shutdown, stale-job recovery, failed-job diagnosis, health-check behavior, Neon migration
      procedure, token rotation/revocation, rate-limit assumptions, PDF-failure diagnosis, MapTiler
      origin restriction, Railway logs/STAGE_TIMING, rollback/redeployment, and the explicit
      single-replica assumption. Found and fixed one real gap while writing it: graceful shutdown
      (`poller.stop()`) was never wired to SIGTERM/SIGINT — fixed in `instrumentation.ts`,
      re-verified (typecheck, 125/125 tests, build, live `/healthz` check all still pass). No new
      infrastructure introduced (no admin dashboard, queue, Redis, or APM).

## UNIT 1: DETERMINISTIC EVALUATION FOUNDATION (SHEDS) — ✅ COMPLETE 2026-08-22
All 7 stages approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design,
Code Generation, Build & Test, Operations. Not to be reopened for minor refinements. Two tracked,
non-blocking external-verification items remain open (see
aidlc-docs/operations/external-verification-tracker.md): (1) Neon/PostGIS live migration/persistence
verification, (2) Anthropic live RRAG-1 integration verification. Both explicitly NOT VERIFIED
until run with real credentials — their eventual execution does not require reopening Unit 1
unless a material defect is exposed.

## UNIT 2: REPORT GENERATION & PRESENTATION PROTOTYPE — ✅ COMPLETE 2026-08-24
All 7 stages approved: Functional Design, NFR Requirements, NFR Design, Infrastructure Design,
Code Generation (incl. 2 targeted post-review corrections — CRS pipeline, ReportMap), Build & Test,
Operations. Not to be reopened for ordinary implementation refinements or another review cycle.
Eight tracked, non-blocking external-verification items remain open across both units (see
aidlc-docs/operations/external-verification-tracker.md): (1) Unit 1 Neon/PostGIS, (2a) RRAG-1
Anthropic, (2b) Unit 2 Report Explanation Anthropic, (3) Unit 2 CRS-transform/PostGIS live
verification, (4) Unit 2 full DB-dependent browser-smoke path (real map click), (5) Unit 2
STAGE_TIMING performance baseline, (6) Railway client-IP/rate-limit source-key behavior. All
explicitly NOT VERIFIED until run with real credentials/a real deployment — none block Unit 2
completion. The real Tier-2 professional review for the shed candidate remains a
regulatory-content dependency, not a software gap.

**Next work (per explicit user direction, 2026-08-24)**: does NOT proceed into Unit 2B — Commercial
GO remains open (Unit 0C). Two independent, parallel tracks: (A) continue Unit 0C commercial
validation using the now-working Unit 2 prototype to demonstrate the report experience with
controlled data — customer discovery does not wait for every external-verification checkbox to
close; (B) close the Neon/PostGIS and Anthropic external-verification items as soon as credentials
become available. The Technical GO / Commercial Validation two-gate split is preserved.
