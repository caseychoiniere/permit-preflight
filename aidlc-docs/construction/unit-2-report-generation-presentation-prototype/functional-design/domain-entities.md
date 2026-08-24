# Unit 2: Domain Entities

Technology-agnostic. Reuses Unit 1's already-approved entities (`ParcelResolutionResult`,
`PropertyContext`/`PropertyFact`, `CriticalAreaFinding`, `Finding`, `EvaluationOutcome`) without
modification. **One entity, `RegulatoryRule`, needs one additive extension** (see
"RegulatoryRule Extension" below, added per the user's 2026-08-22 correction) — everything else
this document defines is new to Unit 2.

## CRS Correction (Code Generation, 2026-08-23) — `proposedFootprint` → `proposedPlacement`

Every reference below (and in `business-logic-model.md`/`business-rules.md`/
`frontend-components.md`) to `ShedProjectConfiguration.proposedFootprint: Polygon` is superseded
by `proposedPlacement: ProposedPlacement { anchor: {lng, lat} (WGS84), orientationDeg }`. Code
Generation found the originally-approved shape ("a complete `proposedFootprint` Polygon reaches
the server") implicitly required the browser to construct a feet-based polygon from a WGS84 map
interaction — which the initial implementation did via a local flat-earth approximation, an actual
correctness defect (not UI polish) inconsistent with PostGIS being authoritative for spatial
computation. The corrected contract: the browser submits its native WGS84 anchor unmodified; the
server (never the browser) transforms it into the parcel boundary's projected CRS via PostGIS's
`ST_Transform` and constructs the footprint there, in `spatial-analysis/postgis-adapter.ts`. See
that file and `tests/spatial-analysis/postgis-adapter.test.ts`/`.integration.test.ts` for the full
contract and its proofs. This is a narrower, technical correction to the wire shape — the
underlying invariants (BR-U2-9's lot-line-role fail-closed logic, PostGIS as the sole computation
engine, client-computed distances never trusted) are unchanged, and the Application Design/BR-U2
numbering is not renumbered for it.

## RegulatoryRule Extension: `acceptedEvidenceQuality` (governed, not invented by application code)
*(Added per the user's 2026-08-22 correction — evidence quality must participate in
classification, not just report-copy disclosure.)*

Unit 1's `RegulatoryRule` (owned by Regulatory Rule Governance) gains one additive field:
`acceptedEvidenceQuality: EvidenceQuality[]` — the set of evidence-quality levels (e.g.
`AUTHORITATIVE`, `GENERAL_LOCATION_ONLY`) a human explicitly decided, as part of that rule's
governance approval, are sufficient to support a KNOWN classification under this rule. This is a
**human governance decision recorded once per rule at approval time** — the same discipline
already used for tier confirmation and caveat review (BR-6/BR-7) — never a runtime numeric
tolerance invented by application code. A rule with no `acceptedEvidenceQuality` entry for
`GENERAL_LOCATION_ONLY` simply cannot produce a KNOWN finding from `GENERAL_LOCATION_ONLY`
evidence — see BR-U2-10. This is additive to Unit 1's `RegulatoryRule` shape, not a redesign of
rule governance itself; Unit 1's lifecycle state machine, human-identity requirements, and
Tier 1/Tier 2 process are unchanged.

## ScreeningRequest
*(components.md "Screening Request"; PC-1, PC-2)*

The durable owner of user intent from confirmed-parcel through purchase-lock. Unit 2 exercises
only the `EXISTING_PROPERTY` / shed path.

| Field | Notes |
|---|---|
| `id` | Identity. |
| `workflowType` | `"EXISTING_PROPERTY"` — the only value Unit 2 produces (vacant-land is Unit 5). |
| `confirmedParcelId` | References a `ConfirmedParcelResolution` (Unit 1) — never a non-CONFIRMED status; same structural precondition Unit 1 already enforces at the type level for `assemblePropertyContext`. |
| `projectType` | `"shed"` — the only value Unit 2 produces (every other project type is a later unit). |
| `projectDetails` | See `ShedProjectConfiguration` below. |
| `validationState` | `DRAFT \| VALID` — `VALID` requires PC-2's server-side validation to pass; see business-rules.md. |
| `authenticatedUserId?` | Optional — Unit 2 has no real accounts; present only if a later unit's auth context happens to be attached (not exercised here). |
| `snapshot` | Present only once `authorizeReportGeneration` succeeds (see GenerationAuthorization below) — an immutable copy of the fields above at that instant. A live, editable `ScreeningRequest` and its `snapshot` are distinct: later edits to a new/different live request can never retroactively change a snapshot already used for generation (RGD-4). |

### ShedProjectConfiguration
*(PC-2)*

| Field | Notes |
|---|---|
| `widthFt`, `depthFt`, `heightFt` | Declared shed dimensions — consumed by the Regulatory Rules Engine's `HEIGHT_LIMIT`/coverage rules (Unit 1, unchanged). |
| `alleyAdjacent` | Boolean — consumed by `REAR_SETBACK`'s reduced-setback exception (Unit 1, unchanged). |
| `proposedFootprint` | A `Polygon` (Unit 1's `spatial-analysis/types.ts` shape, planar/projected coordinates) representing the approximate placement captured by the minimal map interaction (Question 3) — the geometric input Spatial Analysis uses to compute setback distances. Distinct from the declared dimensions above: the footprint is what's *drawn*, the dimensions are what's *declared* for rule evaluation. In the common case they agree; Spatial Analysis does not require them to reconcile exactly for Unit 2 (no cross-validation rule is introduced here — see business-rules.md's explicit scope note). |
| `lotLineRoleAssignment` | A `LotLineRoleAssignment` (below), or absent. **Distances that depend on a specific edge role (front/rear/side) can only be computed when this is present and valid** — see BR-U2-9. |
| `distanceInputMode` | `"MAP_PLACEMENT" \| "MANUAL_FALLBACK"` — records which capture path produced `proposedFootprint`/setback distances, purely for provenance/debugging; the manual path (Question 3) is an internal/testing fallback only, never the customer-facing primary flow. |

**Validation** (PC-2): server-side, regardless of client-side checks — malformed/out-of-range
input (e.g. negative `widthFt`) is rejected with a specific error before `validationState` can
become `VALID`.

## LotLineRoleAssignment
*(Added per the user's 2026-08-22 Functional Design correction — front/rear/side roles are never
inferred from polygon shape alone.)*

A polygon by itself carries no regulatory meaning for "which edge is the rear yard" — that role
comes from the parcel's relationship to the street(s) it fronts, which `boundaryPolygon` alone
cannot establish. This entity records how the roles were established, not just what they are.

| Field | Notes |
|---|---|
| `status` | `"ASSIGNED" \| "INSUFFICIENT"`. `INSUFFICIENT` is the fail-closed outcome — produced whenever the parcel's shape or street relationship isn't safely representable by Unit 2's simple prototype model (corner lots, irregular/multi-sided parcels, multiple street frontages, or any case the user's front/rear indication can't unambiguously resolve). `INSUFFICIENT` is not an error state to work around — it is the correct, honest outcome for a case this prototype cannot safely resolve. |
| `frontEdgeRef`, `rearEdgeRef` | References to the specific boundary segment(s) of `boundaryPolygon` the user identified as front/rear (present only when `status === "ASSIGNED"`). |
| `sideEdgeRefs` | The remaining boundary segments, treated as side — derived only when the parcel's shape makes this unambiguous given the identified front/rear edges (e.g., a simple quadrilateral-like parcel with front and rear as roughly-opposing edges). Exact ambiguity-detection is a Code Generation implementation decision; the domain rule (BR-U2-9) is that anything not safely representable this way produces `INSUFFICIENT`, never a guess. |
| `method` | `"USER_INDICATED"` in Unit 2 (the only method this unit implements) — kept as an explicit field, not hardcoded, so a later unit's automatic/authoritative frontage classification (if ever built) is a new `method` value, not a redesign. |
| `indicatedBy`, `indicatedAt` | Who/when the user made the indication — provenance for this specific report's evidence (RGD-4). |

`LotLineRoleAssignment` is captured once, at placement time (Workflow 2), and becomes part of the
`ScreeningRequest.snapshot` — like every other input to a generated report, it is frozen at
generation-authorization time, not re-derived later.

## GenerationAuthorization
*(Question 1 — the internal trigger substituting for a verified-PAID event)*

A discriminated concept, not a boolean flag, so Unit 2B can add a sibling variant without changing
downstream consumers.

```
GenerationAuthorization =
  | { type: "INTERNAL_PROTOTYPE"; screeningRequestId; authorizedBy: string; authorizedAt: string }
  | { type: "VERIFIED_PAYMENT"; ... }   // Unit 2B adds this variant later; not defined here
```

- Produced only by the domain action `authorizeReportGeneration(screeningRequestId, authorizedBy)`
  — `authorizedBy` is a required, recorded real identity (the founder or an internal operator), not
  an optional/defaultable field. No code path may construct a `GenerationAuthorization` without one.
- Consumed exactly once by Report Generation Job creation (below) as proof that generation is
  allowed — the job-creation contract accepts *a* `GenerationAuthorization` of any valid variant,
  never a raw boolean, so Unit 2B's real payment event slots in as a second variant without
  changing the job-creation contract itself.
- Is explicitly **not** evidence of payment and must never be labeled or logged as if it were —
  it is an `INTERNAL_PROTOTYPE` authorization, full stop.

## ReportGenerationJob
*(components.md "Report Generation Job"; already specified there — Unit 2 is the first unit to
actually implement it)*

| Field | Notes |
|---|---|
| `id` | Identity. |
| `screeningRequestSnapshotId` | References the immutable `ScreeningRequest.snapshot`, never a live/editable request. |
| `generationAuthorizationRef` | References the `GenerationAuthorization` that permitted creation — auditable link back to who/what authorized this job. |
| `state` | `QUEUED → IN_PROGRESS → COMPLETE \| FAILED` (per components.md — unchanged here). |
| `retryAttempts`, `failureReasons` | Per components.md. |
| `evidenceReportArtifactId?` | Set only on `COMPLETE`. |

Created idempotently — re-authorizing the same `ScreeningRequest.snapshot` must not create a
second job (mirrors Checkout & Fulfillment Service's idempotent-job-creation requirement, reused
here even though the caller is different).

## ParcelBoundaryGeometry (new fact content, not a new top-level entity)
*(Question 2)*

Not a separate persisted entity — the concrete *value* carried by a `PropertyFact` whose
`factType` is `"parcel-geometry-available"` (a fact type Unit 1's Regulatory Rules Engine already
references as an indispensable-input check — Unit 2 is the first unit to actually populate it).

| Concept | Notes |
|---|---|
| `boundaryPolygon` | The parcel's boundary as a `Polygon`, fetched on demand from King County's public parcel-polygon layer by the already-confirmed PIN. Not bulk-ingested; fetched and persisted only as part of the specific report's evidence (RGD-4 reproducibility). |
| `sourceQualityCaveat` | **Required**, not optional metadata: King County publishes these boundaries as general parcel location, explicitly not a surveyed/legal boundary. Human-readable disclosure text, attached to the fact's `Provenance` at retrieval time (Property Intelligence) and carried forward unchanged through every downstream artifact derived from this geometry — the `SpatialResult`(s) Spatial Analysis produces from it, and the evidence entries in the immutable `EvidenceReportArtifact`. No component in this chain is permitted to drop it. |
| `evidenceQuality` | **Corrected 2026-08-22** — a structurally-significant classification input, not just display copy: `"AUTHORITATIVE" \| "GENERAL_LOCATION_ONLY"`. Set to `GENERAL_LOCATION_ONLY` for any fact/`SpatialResult` derived from `boundaryPolygon`. This is a new field on `Provenance` (extending Unit 1's `property-intelligence/types.ts` shape, alongside `sourceQualityCaveat`) — orthogonal to `availabilityState` (which is about retrieval success/freshness, not source precision). The Regulatory Rules Engine consumes this field as a genuine input to classification, not merely something Report Explanation or the UI displays after the fact — see business-rules.md BR-U2-4 (revised) and BR-U2-10. |

Both fields propagate together: wherever `sourceQualityCaveat` is required to survive unchanged
(disclosure), `evidenceQuality` is required to survive unchanged alongside it (classification
input) — they are two views of the same underlying limitation, not two independent mechanisms.

This extends Unit 1's `Provenance` concept (`property-intelligence/types.ts`) with a
`qualityCaveat?: string` — present whenever a source has a known, disclosed accuracy limitation
(so far: only this one). Not modeled as a new `AmbiguityCaveat`-style structured object (that
concept is specific to Regulatory Rule Governance) — a plain, always-propagated string is
sufficient for Unit 2's scope; a later unit may generalize it if a second source-quality caveat
appears.

## EvidenceReportArtifact
*(components.md "Evidence & Report Artifact" — already specified; Unit 2 implements it)*

| Field | Notes |
|---|---|
| `id` (`reportId`) | Internal identity — never sufficient on its own for client access (Question 5). |
| `reportAccessToken` | A separate, high-entropy opaque bearer credential generated at report-completion time. `getReport` accepts a token, never a bare `reportId`, from any client-facing path — "report identity is not report authorization." |
| `screeningRequestSnapshotId`, `generationAuthorizationRef` | Traceability back to what was requested and what authorized generation. |
| `findings` | The finalized `Finding[]` from Unit 1's `evaluateProject` (unchanged shape). |
| `evidence` | Every fact/spatial-result consumed, each with its `Provenance` (including any `qualityCaveat` — never dropped, per above) and the specific rule/policy versions applied. |
| `explanation?` | Report Explanation's plain-language output, or explicitly absent (with a "temporarily unavailable" marker) on AI degradation (RGD-5) — never absent silently. |
| `generatedAt`, `ruleVersionsUsed`, `dataRetrievalTimestamps` | Pinned at generation time — this is what makes the snapshot reproducible/immutable (RGD-4). |
| `webRendering` | The web presentation of this snapshot — computed from the fields above, not a separately-stored field with its own mutation risk. |

**Corrected 2026-08-22 (NFR Design)**: the PDF is **not** a field on `EvidenceReportArtifact`. It
is a separate, disposable/recreatable derivative — `ReportPdfRendering` (see NFR Design's
`logical-components.md`) — keyed to this artifact's id (and a rendering-version marker), generated
lazily on first request and cached thereafter. This keeps `EvidenceReportArtifact` genuinely
immutable (no field ever gets "filled in later") while still allowing lazy PDF generation.
`ReportPdfRendering` may be deleted and regenerated at any time without altering the underlying
report — it reads only the already-persisted `EvidenceReportArtifact`, never re-runs any part of
the evaluation pipeline (BR-U2-6, unchanged in substance, restated precisely).

Once created, no field on `EvidenceReportArtifact` above may be mutated — a new evaluation always
produces a new, separate `EvidenceReportArtifact` (RGD-4), never an edit to an existing one.
