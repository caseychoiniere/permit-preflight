# Unit 6B — NFR Requirements (Shed Report Value Expansion)

**Status**: Functional Design Part 1 is APPROVED (2026-09-13). This document assesses NFR
Requirements per the AI-DLC per-unit loop. **Targeted, delta-only** — Unit 6B introduces exactly
two genuinely new NFR-relevant surfaces (a new external ECA data adapter; new optional customer
intake fields) and zero new tech stack, zero new authentication/authorization surface, zero new
persisted secret. Every other NFR category inherits the existing project baseline unchanged,
stated explicitly in §5, not silently assumed.

---

## 1. External Data Source Resiliency (new: Seattle ECA adapter)

Governs the new `src/property-intelligence/seattle-eca.ts` adapter (business-logic-model.md
Flow 1), which queries up to 12 external ArcGIS FeatureServer endpoints per report — the single
largest new runtime surface Unit 6B introduces.

- **NFR-U6B-1**: A single hazard-layer query failure (timeout, non-2926 spatial reference,
  non-2xx response) **never fails the whole `environmental-constraints` fact or the report** —
  it records that one `LayerQueryResult` as unavailable, feeding the existing
  `resolveCriticalAreaFinding` `INDETERMINATE`/combined-only path (already specified in
  business-logic-model.md Flow 1). This restates, as a testable NFR rather than only a design
  note, the same per-fact `SOURCE_ERROR` discipline `property-intelligence/assemble.ts` already
  applies project-wide (BR-2 / the 2026-08-27 fail-closed-on-claims amendment) — **no new
  failure-handling pattern is introduced.**
- **NFR-U6B-2**: The 12 (or approved-subset) layer queries execute **concurrently**, not
  serially — a report's total ECA-screening latency must not scale linearly with the layer
  count. Each individual layer query carries the same timeout discipline
  `seattle-building-outlines.ts` already applies (a bounded per-request timeout, not an
  unbounded wait) — reused, not reinvented. **Correction from NFR Design (2026-09-13)**: the
  *concurrency/partial-failure orchestration itself* is not pure reuse — the codebase's existing
  `Promise.all` call sites assume uniform success and would be unsafe here; NFR Design specifies
  a `Promise.allSettled`-based fan-out instead (see `nfr-design/nfr-design.md` §1).
- **NFR-U6B-3**: Adding ECA screening to the shed pipeline must not push the shed report's total
  generation time outside NFR-U2-2's existing **soft** sanity targets by an order of magnitude.
  This is a soft target, not an SLA (matching NFR-U2-2's own framing) — a real measurement is
  deferred to Build & Test / the existing `STAGE_TIMING` instrumentation, not estimated here as
  fact (external-verification-tracker.md item 5's discipline extends to this new stage).
- **NFR-U6B-4**: No new external service, vendor, or credential — the ECA adapter queries the
  **same** ArcGIS Online organization (`services.arcgis.com/ZOyb2t4B0UYuYNYH`) already integrated
  for Building Outlines. Zero new secrets, zero new environment variable, zero new npm dependency.

## 2. New Customer Intake Fields — Trust Boundary

Governs the new optional `ShedProjectConfiguration` fields (`foundationType`, `attachment`,
`intendedUse`, `roofOverhang`, `structuralSpanInfo`, `utilityIntent` — domain-entities.md §2).

- **NFR-U6B-5**: Every new field is validated through the project's **existing** Boundary
  Validator / zod-schema convention (`ShedProjectConfigurationSchema`), exactly like every
  pre-existing shed intake field (`widthFt`/`depthFt`/`heightFt`/`alleyAdjacent`) — no new
  validation framework, no new trust-boundary crossing pattern.
- **NFR-U6B-6**: None of the new fields carries materially greater sensitivity than existing
  shed-configuration data (dimensions, materials) — no new PII category, no new retention
  question. Existing report/data-retention posture is unchanged.

## 3. Report Immutability

- **NFR-U6B-7**: The new report sections (`PermitRequirementFinding`, the standalone P2b height
  `Finding`, `ShedLotCoverageResult`, the "Mapped environmental/site constraints" section) become
  part of the **same** immutable `EvidenceReportArtifact` snapshot at generation time — no new
  mutability window, no re-computation-on-view behavior. Matches the existing
  immutable-versioned-snapshot guarantee unchanged.

## 4. Testing Strategy

- **NFR-U6B-8**: The CASE A/B/C lot-coverage boundary logic (`baseAllowanceSqFt`,
  `potentialSpecialAllowanceSqFt`, the asymmetric `LOT_AREA_ADJUSTMENT_UNRESOLVED` override) is a
  pure function of already-known facts — covered by deterministic unit tests exercising each
  boundary (`estimate === baseAllowanceSqFt` exactly, `estimate === potentialSpecialAllowanceSqFt`
  exactly, the C1e-floor cases, the C1e-Director-relevant branch, and the asymmetric-override
  branch) — no live dependency required for this logic's correctness.
- **NFR-U6B-9**: The new ECA adapter's live query behavior (per-layer CRS verification, real
  network round-trip) is **not** exercised by deterministic tests — it is added to the existing
  **non-blocking** live-integration suite, mirroring `seattle-building-outlines.ts`'s own
  test split (deterministic contract tests always run; live-endpoint tests gated on real network
  access, consistent with external-verification-tracker.md item 19's existing tracking for these
  same endpoints).
- **NFR-U6B-10**: The exactly-14.0-ft (P7b) and exact-allowance-boundary (lot coverage) cases are
  explicitly named test cases, not incidentally covered — boundary conditions on
  `REQUIRES_VERIFICATION`-producing rules are exactly where a fencepost defect would silently
  produce a false `MET`/`WITHIN_STANDARD_ALLOWANCE`.

## 5. Explicit Baseline Inheritance (unchanged, not reassessed here)

No change to: authentication/session model (Unit 6, untouched); payment/checkout/fulfillment
(Unit 2B, untouched); PostGIS as sole spatial source of truth; the `KNOWN`/`INFERRED`/
`REQUIRES_VERIFICATION` classification model; report-access token security; rate limiting;
Vercel/Neon/Resend infrastructure; CI gates. Unit 6B adds **zero** new infrastructure component,
**zero** new tech-stack decision (no `tech-stack-decisions.md` needed — nothing new to decide),
and **zero** new deployment configuration.

---

**Recommendation (superseded by NFR Design, 2026-09-13 — see `nfr-design/nfr-design.md`)**: on
closer verification against the actual codebase, one genuinely new pattern was required after
all — the existing `Promise.all` convention (`pipeline.ts`, `postgis-adapter.ts`) assumes uniform
success and would be unsafe for the 12-layer ECA fan-out, so a `Promise.allSettled`-based
per-layer pattern was specified instead (still zero new npm dependency). Every other requirement
is satisfied by direct reuse, confirmed by exact file reference in the NFR Design document.
