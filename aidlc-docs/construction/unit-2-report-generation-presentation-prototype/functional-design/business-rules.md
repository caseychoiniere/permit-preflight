# Unit 2: Business Rules

All Unit 1 business rules (BR-1a/1b through BR-9) are unchanged and unaffected by this unit — the
Regulatory Rules Engine, Parcel Resolution decision logic, and Regulatory Rule Governance lifecycle
are consumed as-is, not modified. This document defines only the new rules Unit 2 introduces.

## BR-U2-1: PO-0-Equivalent Readiness Check (Project Preflight Service, shed path)

Before a `ScreeningRequest` may be authorized for generation, the following must ALL hold:

1. The parcel has a `CONFIRMED` `ParcelResolutionResult` (Unit 1's structural precondition —
   `CLARIFICATION_REQUIRED` / `NO_MATCH` / `RESOLUTION_UNAVAILABLE` cannot reach this check at all).
2. `projectType === "shed"` — the only currently-supported type; any other value is rejected before
   this check runs (not silently coerced or defaulted).
3. `ScreeningRequest.validationState === "VALID"` (PC-2's server-side validation passed).
4. No data source required by the shed evaluation pipeline is already known-unhealthy — a
   **read of existing Data Source Registry state**, never a live retrieval attempt (matches PO-0's
   own "low-cost, no live retrieval" requirement exactly, even though Unit 2 has no real payment gate
   behind it).

This check does **not** invoke Property Intelligence, Spatial Analysis, or the Regulatory Rules
Engine — those remain reserved exclusively for the post-authorization pipeline (rule carried
forward unchanged from Unit 1/Application Design's pre-payment boundary; "post-payment" is read as
"post-authorization" for Unit 2's internal-trigger substitution).

If the check fails, generation authorization is refused with a specific reason — never silently
allowed through.

## BR-U2-2: Generation Authorization Is Never Implicit

`authorizeReportGeneration(screeningRequestId, authorizedBy)` is the **only** path by which a
`ReportGenerationJob` may be created in Unit 2.

- `authorizedBy` is required and must identify a real human/internal-operator identity — never
  defaulted, never a system-generated placeholder.
- BR-U2-1 must have already passed for the referenced `ScreeningRequest`.
- The resulting `GenerationAuthorization` is `{ type: "INTERNAL_PROTOTYPE", ... }` — this literal
  discriminator must never be presented, logged, or stored in a way that could be mistaken for a
  real payment event (mirrors Unit 1's constraint #1 discipline: test/prototype material must stay
  structurally distinguishable from production-authoritative content — here, from a real commercial
  transaction).
- `ReportGenerationJob` creation is idempotent per `ScreeningRequest.snapshot` — re-authorizing an
  already-snapshotted request does not create a duplicate job.

## BR-U2-3: Report Generation Orchestrator Pipeline Order (unchanged ownership, first real wiring)

Reaffirms Application Design's already-approved pipeline, now actually implemented:

```
claim QUEUED job → read ScreeningRequest.snapshot → Property Intelligence
  → Spatial Analysis (real PostGIS) → Regulatory Rules Engine → Report Explanation (AI, optional)
  → Evidence & Report Artifact → job COMPLETE (or FAILED)
```

- Property Intelligence, Spatial Analysis, and the Regulatory Rules Engine are invoked **only**
  from this pipeline — never from any pre-authorization path (BR-U2-1 confirms this negatively;
  this rule confirms it positively).
- Spatial Analysis is invoked with exactly three inputs per report: the parcel boundary polygon
  (BR-U2-4), `ShedProjectConfiguration.proposedFootprint`, and `ShedProjectConfiguration.
  lotLineRoleAssignment` (all from the snapshot) — it does not re-resolve the parcel, re-derive
  placement, or re-derive lot-line roles from anything else (BR-U2-9).
- A crash mid-pipeline must be safely retryable — re-claiming a `QUEUED`/stuck job must never
  produce a duplicate `EvidenceReportArtifact` or a partially-written one (unchanged from
  components.md's existing Report Generation Job requirement).

## BR-U2-4: Parcel-Geometry Source-Quality Caveat Must Propagate, Never Be Dropped
*(Revised 2026-08-22 — point 5 corrected: evidence quality now participates in classification, not
just disclosure. Points 1-4 unchanged.)*

*(Directly required by the user's cross-cutting instruction on Question 2.)*

1. When Property Intelligence retrieves `boundaryPolygon` from King County's parcel-polygon layer,
   it attaches `qualityCaveat` ("King County publishes this boundary as general parcel location —
   not a surveyed or legal boundary") **and** `evidenceQuality: GENERAL_LOCATION_ONLY` to that
   fact's `Provenance` at creation. Neither is optional metadata; a `parcel-geometry-available` fact
   retrieved from this source without both attached is a defect, not an acceptable simplification.
2. Any `SpatialResult` Spatial Analysis derives using `boundaryPolygon` (setback distances, lot
   coverage, etc.) must carry both `qualityCaveat` and `evidenceQuality` forward into its own
   `provenance` — neither is regenerated, re-worded, or silently absorbed into a "confidence score"
   that loses the original disclosure text or the classification-relevant quality level.
3. `EvidenceReportArtifact.evidence` must include the caveat, associated with every finding whose
   supporting evidence traces back to `boundaryPolygon` — visible in both the web report and the
   PDF (same snapshot, per BR-U2-6).
4. The product must never present this parcel boundary as a surveyed or legal boundary, in any
   report copy or UI text.
5. **Corrected 2026-08-22 — evidence quality participates in classification, not just report copy**:
   `evidenceQuality` is passed to the Regulatory Rules Engine as a genuine input, not merely
   forwarded for display. Per BR-U2-10, a finding whose determination materially depends on a
   `GENERAL_LOCATION_ONLY`-sourced spatial measurement may be classified KNOWN only when the applied
   ACTIVE `RegulatoryRule` explicitly lists `GENERAL_LOCATION_ONLY` in its governed
   `acceptedEvidenceQuality` (a human approval-time decision, not application code deciding at
   runtime). This still does **not** mean inventing a numeric close-margin-setback tolerance band:
   Unit 0B's real, empirically-measured ECA tolerance (BR-5a, ~15-20m/66ft) has no equivalent
   positional-accuracy figure for King County's parcel-polygon boundary, and this unit does not
   fabricate one by analogy. The mechanism here is categorical (does this rule's governance record
   say this evidence quality is acceptable at all?), not a numeric distance threshold. Disclosure
   (points 1-4) remains mandatory regardless of classification outcome — the caveat is shown even
   on a finding that does end up KNOWN under a rule that has explicitly accepted this evidence
   quality.

## BR-U2-5: `ShedProjectConfiguration.proposedFootprint` vs. Declared Dimensions

Spatial Analysis computes setback distances purely from `proposedFootprint` (the drawn placement)
against `boundaryPolygon`. The declared `widthFt`/`depthFt`/`heightFt`/`alleyAdjacent` fields feed
the Regulatory Rules Engine's dimension/height rules directly (unchanged from Unit 1). Unit 2
introduces no cross-validation rule reconciling "does the drawn footprint's size match the declared
dimensions" — both are taken as given inputs to their respective consumers. (Flagged here as an
explicit scope boundary, not an oversight, so a later unit doesn't assume this reconciliation
already exists.)

## BR-U2-6: Web Rendering and PDF Rendering Both Derive From One Immutable Snapshot
*(Corrected 2026-08-22 — the PDF is a disposable derivative, not a field on the artifact; see
domain-entities.md's `ReportPdfRendering` correction and NFR Design's `logical-components.md`.)*

Neither the web rendering nor `ReportPdfRendering` may independently re-query current property
data, rerun Spatial Analysis, rerun the Regulatory Rules Engine, or rerun Report Explanation. Both
read only the already-persisted `EvidenceReportArtifact` — including a `ReportPdfRendering`
generated lazily (e.g., on first download) well after the artifact itself was created. Generating,
caching, deleting, or regenerating a `ReportPdfRendering` never mutates `EvidenceReportArtifact` —
the artifact's immutability (RGD-4) is never compromised by PDF generation timing. If underlying
inputs change later (new rule version, updated GIS layer, new LLM model), neither the existing web
rendering nor any existing `ReportPdfRendering` changes; a new evaluation produces an entirely new
`EvidenceReportArtifact` (and, if a PDF is ever requested for it, its own new
`ReportPdfRendering`) — unchanged from Unit 1's general provenance/reproducibility posture.

## BR-U2-7: Report Access Requires the Access Token, Never the Bare ID

Every client-facing report-retrieval path in Unit 2 (there is no authenticated-account path here —
that's Unit 2B/6) must resolve `reportAccessToken → EvidenceReportArtifact`, never
`reportId → EvidenceReportArtifact` directly from client input. `reportId` alone is never
sufficient for access, and the token must not be derivable from `reportId` or any other
predictable/sequential value. This is Unit 2's substitute for `Account.authorizeReportAccess`
(components.md) — a later unit replaces or wraps this boundary; it does not redesign `getReport` or
the artifact itself.

## BR-U2-8: LLM Degradation (Report Explanation) — Reaffirms RGD-5, Applied to a New Component

Report Explanation follows the identical degradation contract Unit 1 already proved for Rule
Research Assistant's `AiCompletionClient`: on provider failure, timeout, or schema-invalid output,
the pipeline proceeds without explanation (BR-U2-3 still reaches `EvidenceReportArtifact` and
`COMPLETE`) — it never fails the entire `ReportGenerationJob`, and it never fabricates a plausible-
sounding explanation from a failed/partial response. `explanation` is either present and
schema-valid, or explicitly marked unavailable — never a third, silent state.

## BR-U2-9: Lot-Line Role Assignment Is Never Inferred From Geometry Alone
*(Added 2026-08-22 per the user's Functional Design correction.)*

1. Spatial Analysis never determines which boundary segment of `boundaryPolygon` is front, rear, or
   side purely from the polygon's shape. A `LotLineRoleAssignment` (domain-entities.md) must exist
   and have `status === "ASSIGNED"` before any role-dependent distance
   (`distanceToFrontLotLineFt`, `distanceToRearLotLineFt`, `distanceToSideLotLineFt`) may be
   computed.
2. `LotLineRoleAssignment` is produced only from the user's explicit front/rear indication captured
   during placement (Workflow 2) — never silently chosen by the system, never guessed from which
   edge is "longest" or "closest to a road centerline" or any other geometric heuristic.
3. **Fail closed, not guessed**: corner lots, irregular/multi-sided parcels, multiple street
   frontages, or any configuration the simple prototype indication can't unambiguously resolve
   produce `LotLineRoleAssignment.status === "INSUFFICIENT"`. When `INSUFFICIENT`:
   - Spatial Analysis does not compute the role-dependent distances at all (they remain
     unavailable, not defaulted to zero or any other placeholder).
   - The Regulatory Rules Engine's existing missing-evidence path (unchanged from Unit 1 —
     `missingEvidenceFinding`) is what produces the resulting REQUIRES_VERIFICATION findings for
     REAR_SETBACK / SIDE_FRONT_SETBACK_STANDARD-type rules. This is not a new mechanism Unit 2 has
     to build — it is Unit 1's already-proven "missing evidence never silently becomes a favorable
     finding" invariant, now exercised by a new cause.
4. `LotLineRoleAssignment.method` and its provenance (who indicated the roles, when) are preserved
   in the report's evidence, per RGD-4/auditability — never discarded once the report is generated.
5. This remains preliminary screening, not a legal determination of lot-line or frontage status —
   report copy must not imply otherwise, in either the `ASSIGNED` or `INSUFFICIENT` case.
6. Out of scope for Unit 2, not forbidden forever: automatic/authoritative frontage classification
   (e.g., derived from a street-centerline layer) is real future work, but building it now would be
   a new GIS subsystem disproportionate to this unit's prototype scope. `LotLineRoleAssignment.
   method` exists specifically so that future capability is a new `method` value, not a redesign.

## BR-U2-10: Evidence Quality Gates KNOWN Classification for Spatial Findings
*(Added 2026-08-22 per the user's Functional Design correction — extends Unit 1's "only governed
content establishes what evidence is sufficient" invariant to spatial evidence quality.)*

1. For any `Finding` whose determination materially depends on a spatial measurement carrying
   `evidenceQuality !== "AUTHORITATIVE"` (in Unit 2, concretely: `GENERAL_LOCATION_ONLY`, from
   `boundaryPolygon`-derived distances), the Regulatory Rules Engine may classify that finding
   `KNOWN` **only if** the applied `ACTIVE RegulatoryRule`'s governed `acceptedEvidenceQuality`
   (domain-entities.md) explicitly includes that evidence-quality level.
2. If the applied rule does not accept that evidence quality: the finding is `INFERRED` if an
   `ACTIVE InferencePolicy` exists establishing a defensible derivation despite the limitation
   (Unit 1's existing INFERRED mechanism, unchanged — `evaluateWithInferencePolicy`'s "no policy
   match → REQUIRES_VERIFICATION, never invented" behavior applies here too); otherwise
   `REQUIRES_VERIFICATION`.
3. `acceptedEvidenceQuality` is set once, by a human, as part of a rule's governance approval
   (Regulatory Rule Governance, BR-6/BR-7 — unchanged lifecycle, additive field) — never inferred,
   defaulted, or set by application code at evaluation time. A rule silent on this question is
   treated as **not** accepting `GENERAL_LOCATION_ONLY` evidence (the safe default is
   REQUIRES_VERIFICATION, not KNOWN-by-omission).
4. This is a categorical gate (does this rule's record say this evidence quality is acceptable at
   all?), not a numeric tolerance — it does not reopen BR-U2-4 point 5's prohibition on fabricating
   a distance-based tolerance band.
5. Concrete consequence for the real shed candidate: because it has not yet reached `ACTIVE` (still
   honestly `TRIAGED`, Tier 2 — unchanged from Unit 1), it has no opportunity to declare
   `acceptedEvidenceQuality` yet either. Whoever eventually reviews it for `SOURCE_VERIFIED`/
   `APPROVED` must, as part of that review, decide and record whether King County's general-location
   parcel geometry is acceptable evidence for this rule's setback determination — this is now
   explicitly part of what "approving the rule" means, not a separate, optional step.
