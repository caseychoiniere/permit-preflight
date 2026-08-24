# Unit 2: Business Logic Model

Technology-agnostic workflows. Reuses Unit 1's `resolveByAddress`/`resolveByIdentifier`,
`assemblePropertyContext`, `evaluateProject`, and the Regulatory Rule Governance lifecycle
unchanged — this document describes only the new workflows Unit 2 adds around them.

## Workflow 1: Project Configuration (PC-1, PC-2)

**Owned by**: Project Preflight Service, orchestrating Screening Request.

```
1. User has a CONFIRMED parcel (Unit 1's Parcel Resolution, unchanged entry point).
2. Project Preflight Service creates a ScreeningRequest { workflowType: EXISTING_PROPERTY,
   confirmedParcelId, validationState: DRAFT }.
3. User selects projectType. Only "shed" is offered (PC-1: a project type not yet built is never
   shown as a broken/error option — it's simply absent from the offered list).
4. User provides ShedProjectConfiguration: dimensions (widthFt/depthFt/heightFt/alleyAdjacent) via
   form input, and proposedFootprint via the minimal map-placement interaction (Workflow 2).
5. Server-side validation runs regardless of client-side checks (PC-2): malformed/out-of-range
   input is rejected with a specific error; validationState stays DRAFT until it passes.
6. On success, ScreeningRequest.validationState -> VALID. Still a live, editable request — no
   snapshot exists yet, no generation has been authorized.
```

Save/resume (PC-3) is explicitly out of scope for Unit 2 (deferred to Unit 6, tied to
authenticated accounts, per unit-of-work-story-map.md) — a Unit 2 ScreeningRequest that isn't
authorized before the session ends is simply lost, an accepted MVP trade-off already approved at
Inception.

## Workflow 2: Approximate Shed Placement (PC-2, minimal map interaction)

**Owned by**: the frontend, in cooperation with a lightweight server-side geometry-construction
step. Per Question 3's answer, this is a simple map interaction, not a CAD tool.

```
1. Frontend requests and displays the confirmed parcel's boundaryPolygon (fetched via Workflow 4's
   Property Intelligence retriever, exposed read-only to the frontend for display purposes only —
   the frontend never computes setbacks itself).
2. User places an approximate anchor point for the shed on the displayed parcel and provides the
   minimal orientation information needed (e.g. a single rotation value) — no dimension handles,
   snapping, or polygon editing.
3. Given the anchor point, orientation, and the already-entered widthFt/depthFt (Workflow 1 step
   4), the system constructs an approximate rectangular proposedFootprint polygon. (Whether this
   construction happens client-side or server-side is an implementation detail for Code Generation
   — the domain contract is simply that a complete proposedFootprint Polygon reaches the server.)
4. User identifies the front and rear boundary segments of the displayed parcel (Added 2026-08-22
   per the Functional Design correction — front/rear/side are never inferred from polygon shape
   alone, BR-U2-9). If the parcel's shape makes the remaining boundary unambiguously "side" (e.g. a
   simple quadrilateral-like parcel with the identified front/rear roughly opposing), the system
   produces a LotLineRoleAssignment { status: ASSIGNED, ... }. If the shape is a corner lot,
   irregular/multi-sided parcel, multiple street frontage, or otherwise not safely resolvable by
   this simple indication, the system produces LotLineRoleAssignment { status: INSUFFICIENT } and
   tells the user plainly that role-dependent setback findings will require verification rather than
   silently guessing.
5. proposedFootprint and lotLineRoleAssignment are stored on the (still-live, still-editable)
   ScreeningRequest's ShedProjectConfiguration.
6. The UI clearly labels the placement as approximate — not a survey or construction plan, and (per
   BR-U2-9 point 5) not a legal determination of lot-line/frontage status.
```

If a manual numeric-distance fallback exists at all (internal/testing use only, per Question 3), it
produces the same `proposedFootprint`/`lotLineRoleAssignment`-bearing `ShedProjectConfiguration`
shape, so downstream workflows never need to know which path produced it (beyond the informational
`distanceInputMode` field).

## Workflow 3: Report Generation Authorization (replaces "given an order has moved to PAID")

**Owned by**: an internal/founder-facing action — not a customer-facing UI flow in Unit 2 (there is
no checkout).

```
1. BR-U2-1's readiness check runs against the VALID ScreeningRequest.
2. If it fails: no snapshot is taken, no authorization is possible, a specific reason is surfaced.
3. If it passes: authorizeReportGeneration(screeningRequestId, authorizedBy) is called by a real
   recorded identity (Question 1).
4. ScreeningRequest.snapshot is taken NOW (immutable copy) — this is the moment "what was
   requested" becomes frozen (RGD-4), mirroring exactly when Checkout & Fulfillment Service takes
   its snapshot in the real (Unit 2B) flow.
5. A GenerationAuthorization { type: INTERNAL_PROTOTYPE, ... } is produced.
6. A ReportGenerationJob is created idempotently, state QUEUED, referencing the snapshot and the
   authorization.
```

Unit 2B's future replacement: step 3 becomes "Order & Payment's webhook handler verifies PAID and
calls the same downstream job-creation contract with a `VERIFIED_PAYMENT` authorization" — steps
4-6 are unchanged. This is the concrete mechanism by which "swappable without redesign" (the user's
Question 1 requirement) is satisfied.

## Workflow 4: Report Generation Pipeline (RGD-1, the core of this unit)

**Owned by**: Report Generation Orchestrator Service. The only place Spatial Analysis and the
Regulatory Rules Engine are invoked (unchanged invariant from Application Design, now actually
exercised for the first time).

```
1. Claim a QUEUED ReportGenerationJob -> IN_PROGRESS.
2. Read the referenced ScreeningRequest.snapshot (never a live request).
3. Property Intelligence: assemblePropertyContext(confirmedParcelResolution, retrievers) —
   including, new in this unit, a retriever for factType "parcel-geometry-available" that fetches
   boundaryPolygon from King County's parcel-polygon layer by PIN and attaches the mandatory
   sourceQualityCaveat AND evidenceQuality: GENERAL_LOCATION_ONLY (BR-U2-4) to its Provenance. Other
   property facts (zoning, etc.) use whatever retrievers already exist/are exercised in Unit 1's
   fixtures.
4. Spatial Analysis (real PostGIS, first live wiring): given boundaryPolygon,
   snapshot.projectDetails.proposedFootprint, and snapshot.projectDetails.lotLineRoleAssignment —
   **Corrected 2026-08-22**: role-dependent distances are computed only when lotLineRoleAssignment.
   status === ASSIGNED (BR-U2-9); Spatial Analysis never infers front/rear/side from the polygon's
   shape itself. When status === INSUFFICIENT, distanceToRearLotLineFt/distanceToSideLotLineFt/
   distanceToFrontLotLineFt are left unavailable rather than guessed. distanceToDwellingFt remains
   unavailable in Unit 2 regardless (no existing-structure-location capture story exists yet). Every
   unavailable distance flows to the Regulatory Rules Engine as a missing-evidence input, producing
   a REQUIRES VERIFICATION finding per Unit 1's existing (unchanged) evaluate.ts
   missingEvidenceFinding behavior — not a defect, an honest reflection of what Unit 2 actually
   captures/can safely resolve. Every SpatialResult derived from boundaryPolygon carries forward
   both sourceQualityCaveat and evidenceQuality (BR-U2-4).
5. Regulatory Rules Engine: evaluateProject(...) — **Corrected 2026-08-22**: for any finding
   depending on a GENERAL_LOCATION_ONLY-sourced distance, KNOWN classification requires the applied
   ACTIVE rule's acceptedEvidenceQuality to include GENERAL_LOCATION_ONLY (BR-U2-10); otherwise
   INFERRED (if an ACTIVE InferencePolicy covers it) or REQUIRES_VERIFICATION. This is an additive
   check Unit 2's Code Generation adds to the Regulatory Rules Engine's evaluation logic — the
   engine's ownership of classification, its ACTIVE-only rule consumption, and its
   governed-InferencePolicy-only INFERRED mechanism are all unchanged from Unit 1. Consumes the real
   (but still honestly TRIAGED, not ACTIVE) shed candidate's eventual ACTIVE successor if/when one
   exists, or whatever ACTIVE shed rules exist at generation time; if none are ACTIVE yet, the
   evaluation legitimately produces few/no KNOWN findings — Unit 2 does not fabricate rule content
   (or a rule's acceptedEvidenceQuality) to make this pipeline look more complete than the real
   governance state allows (same fabrication discipline the user required in Unit 1 Code Generation,
   still binding here).
6. Report Explanation (AI, optional): given the finalized Finding[], produce plain-language
   narrative via the reused AiCompletionClient pattern (Question 4). On failure/invalid output:
   proceed without it (BR-U2-8) — the pipeline does not stop.
7. Evidence & Report Artifact: assemble the immutable EvidenceReportArtifact from findings +
   evidence (with caveats intact, BR-U2-4) + optional explanation. Generate reportAccessToken.
8. ReportGenerationJob -> COMPLETE, referencing the artifact. On an unrecoverable failure anywhere
   in steps 3-7, after the retry policy is exhausted: -> FAILED (an explicit terminal state, never
   silently COMPLETE without a real artifact) — unchanged from components.md's existing contract.
```

Safe-retry requirement (unchanged from components.md): re-claiming a crashed/stuck job must not
produce a duplicate or partially-written `EvidenceReportArtifact`.

## Workflow 5: Report Presentation (RGD-2, RGD-3, RGD-6)

**Owned by**: the frontend, reading exclusively through `getReport(reportAccessToken)` (BR-U2-7) —
never `getReport(reportId)` directly from client input.

```
1. Client requests /report/<reportAccessToken>.
2. getReport resolves the token to the EvidenceReportArtifact, or fails closed (invalid/unknown
   token -> not found, not a partial/degraded response).
3. Web rendering (RGD-2): interactive page presenting findings, evidence, and (where practical) a
   map view of KNOWN/REQUIRES VERIFICATION areas. Every finding communicated on the map also has an
   accessible non-map representation (unchanged accessibility requirement, requirements.md §10).
   REQUIRES VERIFICATION findings are visually/structurally distinct from KNOWN/INFERRED (RGD-6),
   each explaining what could not be determined, why, and (where possible) what would resolve it —
   this now includes findings produced by Workflow 4 step 4's missing distanceToDwellingFt case, a
   concrete real example this unit actually produces.
4. PDF rendering (RGD-3): available from the report's web page, generated from the same snapshot
   (BR-U2-6) — not a separately-authored document.
5. Explanation, if present, is displayed with clear reference to the specific finding/evidence IDs
   it explains (RGD-5); if absent, the UI states synthesis is temporarily unavailable rather than
   hiding the gap or showing an error.
```

## Cross-Cutting: What This Unit Does NOT Do

Reaffirmed from the plan's category split, stated here so no future stage in this unit
accidentally reopens it: no Order & Payment, no Checkout & Fulfillment Service, no real Stripe
integration, no authenticated-account report history, no guest-checkout purchase flow, no other
project type (garage/fence/deck/wall/addition/ADU/vacant-land), no admin/support tooling beyond
what already exists informally from Unit 1's operations runbook.
