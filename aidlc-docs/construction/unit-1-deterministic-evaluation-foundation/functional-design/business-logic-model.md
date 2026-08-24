# Unit 1 — Business Logic Model

**Revised 2026-08-19** per user review — 6 targeted corrections applied (see `domain-entities.md`'s
revision note). Workflow 1 split by input type; Workflow 2/3 now state the CONFIRMED precondition
explicitly and remove the prior wording that implied production use of unconfirmed geometry;
Workflow 4 updated for the BR-4a map-fact/regulatory-conclusion split; Workflow 5's DISABLED step
corrected to reflect Unit 3 ownership.

**Revised again 2026-08-19 (second pass)**: Workflow 1a/1b now apply bounded retry to their source
reads and produce `RESOLUTION_UNAVAILABLE` (never `NO_MATCH`) on source failure; Workflow 4 now
requires an approved `InferencePolicy` before producing `INFERRED`.

Technology-agnostic workflows. Entities per `domain-entities.md`, decision rules per
`business-rules.md`. No infrastructure, storage, or API-shape decisions.

---

## Workflow 1: Parcel Resolution
*(Parcel Resolution component; stories PR-1 through PR-5; revised — correction 1: split by input type)*

### Workflow 1a: Address Input Path
1. Accept an `AddressInput` (free-text address).
2. Normalize the input (semantic normalization per BR-1 — not literal string matching).
3. Attempt primary address/geocode resolution (bounded retry on transient failure, per BR-3's
   conceptual policy) → candidate parcel(s), **or** a source-failure signal after retries are
   exhausted.
4. Attempt an independent parcel lookup via a different query path (same bounded-retry principle),
   using the normalized input.
5. If either step 3 or 4 ends in a source-failure signal (not "queries completed, found nothing"),
   return `RESOLUTION_UNAVAILABLE` — **do not** report this as `NO_MATCH` (new, second pass).
6. Otherwise, for each candidate parcel produced by steps 3-4, retrieve its own
   canonical/authoritative recorded address (if it has one) and compare against the normalized
   input (reverse-validation).
7. Apply BR-1a/BR-2 to determine `ParcelResolutionResult.status` and, if applicable,
   `clarificationReason`.

### Workflow 1b: Parcel Identifier Input Path
*(New — correction 1: does not route through address geocoding)*
1. Accept a `ParcelIdentifierInput`.
2. Normalize the identifier.
3. Perform an authoritative lookup of the identifier (bounded retry on transient failure) →
   candidate parcel, **or** a source-failure signal after retries are exhausted → in that case,
   return `RESOLUTION_UNAVAILABLE`, not `NO_MATCH` (new, second pass).
4. Attempt independent corroboration of the same parcel identity/geometry via a different
   authoritative query path/source (same bounded-retry principle), where available.
5. Apply BR-1b/BR-2: if corroboration is unavailable because no second path exists or genuinely
   returns nothing, return `CLARIFICATION_REQUIRED` (`INSUFFICIENT_CORROBORATION`) rather than
   treating the identifier as self-confirming; if that corroboration attempt itself fails as a
   source (not "found nothing"), that also folds into `RESOLUTION_UNAVAILABLE`; if sources
   materially disagree on identity/jurisdiction, return `CLARIFICATION_REQUIRED`
   (`CONFLICTING_SOURCES`). This path fully supports addressless/vacant parcels — no step in this
   path requires a canonical street address to exist.

### Both paths converge on:
Return the `ParcelResolutionResult` (status one of `CONFIRMED` / `CLARIFICATION_REQUIRED` /
`NO_MATCH` / `RESOLUTION_UNAVAILABLE`). **This workflow never presents a UI or clarification choice
itself** — that belongs to the orchestration/UI layer in a later unit (Application Design's Parcel
Resolution component boundary, unchanged).

## Workflow 2: PropertyContext Assembly
*(Property Intelligence component; supports SRE-SHED-1)*

**Hard precondition (correction 2, updated second pass): this workflow only ever begins for a
parcel whose Workflow 1 result has `status = CONFIRMED`.** A `CLARIFICATION_REQUIRED`, `NO_MATCH`,
or `RESOLUTION_UNAVAILABLE` result stops here — production `PropertyContext` assembly and
evaluation do not proceed on approximate/interpolated geometry, nor after a resolution-source
failure, under any circumstance. (Internal test tooling may separately construct controlled
`PropertyContext`/`SpatialResult` fixtures to exercise unavailable-evidence *behavior*, per
Workflow 6 — that is a test-only construction path, not a bypass of this production gate.)

1. Given a `CONFIRMED` parcel from Workflow 1, determine which `PropertyFact` types are needed for
   the requested evaluation (for Unit 1's scope: zoning, parcel geometry/dimensions, critical-area
   layers, and any other facts the shed rule set requires).
2. For each required fact, consult Data Source Registry for the source's current health.
3. Retrieve the fact from its authoritative source, applying BR-3's bounded-retry behavior on
   failure.
4. Record each retrieved (or failed) fact as a `PropertyFact` with full provenance and
   `availabilityState` — **never assign a regulatory classification at this step** (BR-3.3).
5. Assemble the complete `PropertyContext` for this evaluation. Treat it as immutable once
   assembled — a later re-evaluation produces a new `PropertyContext`, never mutates this one.

## Workflow 3: Spatial Evaluation for a Shed Project
*(Spatial Analysis component)*

**Precondition (correction 2, inherited from Workflow 2): only ever operates on a `PropertyContext`
assembled for a `CONFIRMED` parcel.** This workflow's production path never consumes geometry from
a `CLARIFICATION_REQUIRED`/`NO_PIN` result — there is no such input available to it, by
construction, once Workflow 2's gate is respected.

1. Given a `PropertyContext` and `ShedProjectDetails` (proposed dimensions, height, placement,
   alley-adjacency), compute the geometric inputs the shed rule set needs: rear/side/front setback
   distances from the proposed structure to the relevant lot lines, lot-coverage percentage
   including the proposed structure, and height comparison against the applicable limit.
2. For critical-area applicability, query the individual authoritative ECA layer(s) relevant to
   this parcel, and (for traceability purposes only, never as an authority source) the combined
   layer, applying BR-5's precedence policy to produce `CriticalAreaFinding`(s) — **map facts
   only**; this workflow does not determine regulatory applicability (see Workflow 4/BR-4a).
3. Record each computation as a `SpatialResult` with its inputs and `availabilityState`
   (`AVAILABLE`/`UNAVAILABLE`/`SOURCE_ERROR` per BR-3 — e.g., a specific geometry operation can
   still fail due to a transient source error even for a confirmed parcel). **Test-only note**:
   internal test fixtures may directly construct a `SpatialResult` with `availabilityState =
   UNAVAILABLE` to exercise Workflow 6's partial-vs-deferred logic — this is a controlled test
   input, not a path that exists for real, unconfirmed parcels in production.

## Workflow 4: Regulatory Rule Evaluation for a Shed Project
*(Regulatory Rules Engine component; stories SRE-0, SRE-SHED-1 — the unit's central deterministic
workflow)*

1. Given a `PropertyContext` (already gated to a `CONFIRMED` parcel per Workflow 2), the
   `SpatialResult`/`CriticalAreaFinding` set from Workflow 3, and `ShedProjectDetails`, retrieve the
   applicable `ACTIVE` `RegulatoryRule`(s) for project type "shed" and the parcel's zone (read-only
   consumption of Regulatory Rule Governance's published rules — this workflow never authors,
   approves, or mutates a rule).
2. For each applicable rule, evaluate its `ruleSpecification` against the available evidence. Where
   a `CriticalAreaFinding` is relevant to the rule, derive its regulatory implication via BR-4a
   **before** using it in classification — a `CriticalAreaFinding` is never read as a regulatory
   conclusion directly (correction 3).
3. Apply BR-4 (and BR-4a for critical-area-relevant rules) to classify the resulting `Finding` as
   `KNOWN`, `INFERRED`, or `REQUIRES_VERIFICATION`, referencing the specific evidence and rule
   (including any `ACTIVE` rule's carried-forward `AmbiguityCaveat`s per BR-8) that produced the
   classification. **If the evaluation logic would otherwise want to produce `INFERRED`, it must
   first check for a matching approved `InferencePolicy` (second pass, correction 2) — apply it and
   record it as `Finding.appliedInferencePolicy` if one exists; if none exists, classify as
   `REQUIRES_VERIFICATION` instead. The workflow never invents a derivation method at this step.**
4. Apply BR-3.4/BR-3.5 at the overall-evaluation level: if enough evidence exists for a meaningful
   partial result, return the `EvaluationOutcome` with the `Finding`s produced (some possibly
   `REQUIRES_VERIFICATION`); if an indispensable input was entirely unavailable, mark the
   `EvaluationOutcome` deferred/failed instead of returning a hollow result.
5. Return the `EvaluationOutcome` — a collection of `Finding`s. **This workflow's output is the
   final word on regulatory/spatial classification** — no downstream component (including a future
   Report Explanation module) may alter it, only explain it (Application Design invariant 1,
   unchanged and reinforced here).

## Workflow 5: Regulatory Rule Governance Lifecycle
*(Regulatory Source Access, Rule Research Assistant, Regulatory Rule Governance, Rule Governance
Workflow Service; stories RRAG-1 through RRAG-8 — exercised via internal tooling per Q6, not a
built UI)*

1. **RESEARCHED → DRAFTED**: Given a target rule need (e.g., "shed rear-yard setback, NR zone"),
   Regulatory Source Access acquires a `PermittedSourceEvidenceBundle` through permitted-access
   methods (human/interactive-browser research against Municode, City Clerk/Legistar, SDCI — never
   automated scraping). Rule Research Assistant consumes the bundle and produces a
   `CandidateRulePackage` (`RegulatoryRule` at `DRAFTED`), including its self-assessed
   `AmbiguityCaveat`s and suggested tier.
2. **DRAFTED → TRIAGED**: The founder reviews the `CandidateRulePackage` and confirms the tier
   (BR-6) — always a recorded human action, the AI suggestion is advisory only.
3. **TRIAGED → SOURCE_VERIFIED**: For Tier 1, the founder verifies the package's citations directly
   against the primary sources. For Tier 2, the package is escalated to an appropriate domain
   professional (per the fit-mapping already established in research-findings.md §5); their
   recorded opinion is captured, and the founder retains final sign-off authority regardless.
4. **SOURCE_VERIFIED → TESTED**: The rule's proposed test cases (BR-9 for the shed rule
   specifically) are run against its `ruleSpecification`; all must pass to proceed.
5. **TESTED → APPROVED → ACTIVE**: Founder approval, then activation — the one-way publication to
   the Regulatory Rules Engine's consumption boundary (BR-7). `AmbiguityCaveat`s persist forward
   (BR-8), they are not cleared on activation.
6. **ACTIVE → SUPERSEDED**: When Regulatory Source Access surfaces an ordinance amendment (via
   City Clerk/Legistar) affecting an `ACTIVE` rule, a new `CandidateRulePackage` is drafted
   (returning to step 1) and goes through the same lifecycle; upon its activation, the prior
   version is marked `SUPERSEDED` for future evaluations only — historical `EvaluationOutcome`s
   already produced under the old version are unaffected (a standing constraint from Application
   Design, not re-derived here).
7. **ACTIVE → DISABLED (correction 5 — out of scope for Unit 1)**: an emergency-stop path distinct
   from supersession, used when a rule is found incorrect and needs to stop applying to new
   evaluations immediately. The `RegulatoryRule` entity acknowledges this state for future
   compatibility, but **its transition, trigger (ADM-7), and any operator tooling are implemented
   in Unit 3, not here** — Unit 1 does not build or exercise this step.

## Workflow 6: Source-Failure Partial-vs-Deferred Decision
*(Cross-cutting; applies within Workflows 2-4; formalizes BR-3.4/BR-3.5)*

1. When a required `PropertyFact` or `SpatialResult` fails to retrieve after bounded retry, first
   determine: is this input indispensable to *every* `Finding` the requested evaluation would
   produce, or does it only affect *some* findings?
2. If indispensable to all (e.g., the parcel geometry itself, without which no spatial rule can be
   evaluated at all): mark the entire `EvaluationOutcome` deferred/failed with a clear reason,
   rather than returning an `EvaluationOutcome` composed entirely of `REQUIRES_VERIFICATION`
   findings dressed up as a complete report.
3. If it only affects some findings (e.g., one ECA layer is down, but setback/height evaluation
   doesn't depend on it): proceed with the evaluation; the affected finding(s) become
   `REQUIRES_VERIFICATION` per BR-4, the rest are classified normally.
4. This decision, and its basis, is recorded on the `EvaluationOutcome` for later inspection
   (Admin/Support, in a later unit, will read this — Unit 1 need only ensure the information
   exists, not build the inspection UI).

---

## Fixture Strategy Note
*(Q5)*

Per Q5, this unit's automated test suite is built from two separate layers:
1. **Deterministic fixture-based domain tests** — Unit 0B's 26 ground-truthed parcel-resolution
   cases (captured as fixed input/expected-output snapshots, not live API calls) exercising
   Workflow 1/BR-1/BR-2, including the two adversarial false-confidence cases that must resolve to
   `CLARIFICATION_REQUIRED`, never `CONFIRMED`. Unit 0B's real shed rule (BR-9) with its documented
   pass/fail/boundary/exception test cases exercises Workflow 4/BR-4. These run in CI without
   network access.
2. **External-source integration/health tests** — a separate, smaller suite that does call live
   King County/Seattle/FEMA endpoints, to detect upstream schema/behavior drift (e.g., the address-point
   gaps and undocumented layers Unit 0B found). These may vary independently of application
   correctness and are not part of the deterministic CI gate.

Synthetic fixtures may supplement the real ones only to cover boundary conditions the real sample
didn't naturally produce — never to replace an already-ground-truthed real scenario.
