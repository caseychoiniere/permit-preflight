# Unit 1 — Domain Entities

**Revised 2026-08-19** per user review — 6 targeted corrections: split address-input vs.
parcel-identifier-input resolution paths (correction 1); CONFIRMED as a hard precondition for
`PropertyContext`/production evaluation (correction 2); `CriticalAreaFinding` restated as a
spatial/map fact only, never a regulatory conclusion (correction 3); ECA proximity tolerance made
source/layer-pair-specific, not a universal constant (correction 4); `DISABLED` lifecycle state
acknowledged for compatibility only, not implemented in this unit (correction 5); BR-9's
candidate-vs-production status clarified in `business-rules.md` (correction 6).

**Revised again 2026-08-19 (second pass)** — two further corrections: added `RESOLUTION_UNAVAILABLE`
as a distinct `ParcelResolutionResult` status, so an upstream source failure during parcel
resolution is never conflated with an authoritative `NO_MATCH`; added the `InferencePolicy` entity
so `INFERRED` findings always have a governed, versioned, auditable basis rather than an ad-hoc
runtime heuristic.

Technology-agnostic. No database schema, no field types beyond concept-level, no ORM/storage
decisions. Traces to Application Design's components.md (Parcel Resolution, Property Intelligence,
Data Source Registry, Spatial Analysis, Regulatory Rule Governance, Regulatory Rules Engine,
Regulatory Source Access, Rule Research Assistant) and to Unit 1's assigned stories.

---

## Parcel Resolution Domain

### AddressInput
Raw user-supplied free-text address, plus its normalized/canonicalized form (semantic
normalization: abbreviation, case, directional-notation equivalence; never naive literal string
equality). Used by the address-input resolution path (BR-1a).

### ParcelIdentifierInput *(added — revision 2026-08-19, per correction 1)*
Raw user-supplied parcel identifier (e.g., a King County PIN or other supported identifier), plus
its normalized/canonicalized form. Used by the parcel-identifier resolution path (BR-1b) — this
path does not require or route through address geocoding.

### CandidateParcel
A single candidate parcel surfaced during resolution: parcel identifier (PIN or equivalent),
geometry reference, the parcel's own canonical/authoritative recorded address **if one exists**
(revised — some parcels, e.g. vacant or addressless parcels, have no recorded address; parcel
identity for these is established via identifier/geometry corroboration instead, never blocked on
the absence of an address), source it came from (address geocode / independent parcel lookup /
identifier lookup / other), and parcel-identity characteristics (corner lot, merged/split, condo,
vacant, addressless).

### ParcelResolutionResult
*(Revised — correction 1, second pass: added `RESOLUTION_UNAVAILABLE` as a distinct status so an
upstream source failure is never conflated with an authoritative "no such parcel" result.)*
- **status**: `CONFIRMED` | `CLARIFICATION_REQUIRED` | `NO_MATCH` | `RESOLUTION_UNAVAILABLE`
  - `CONFIRMED`: sufficient independently-corroborated parcel identity (BR-1a/BR-1b)
  - `CLARIFICATION_REQUIRED`: candidate/evidence exists, but user confirmation or disambiguation
    is needed
  - `NO_MATCH`: the required authoritative resolution queries **completed successfully** and
    produced no viable candidate — a genuine "no such parcel" result
  - `RESOLUTION_UNAVAILABLE`: sufficient resolution could not be attempted/completed because a
    required external resolution source failed (timeout, rate-limit, error) after bounded retry —
    **never reported as `NO_MATCH`**, since nothing authoritative was actually determined
- **clarificationReason** (present only when status = `CLARIFICATION_REQUIRED`): `NO_PIN` |
  `CONFLICTING_SOURCES` | `MULTIPLE_CANDIDATES` | `INSUFFICIENT_CORROBORATION` |
  `ADDRESS_MISMATCH` | other reasons discovered later (extensible, structured — not free text as
  the only machine-readable signal)
- **unavailabilityDetail** (present only when status = `RESOLUTION_UNAVAILABLE`): which source(s)
  failed and the failure nature, for later diagnosis (Admin/Support, later unit)
- **confirmedParcel**: present only when status = `CONFIRMED`
- **candidates**: the set of `CandidateParcel` considered, with which sources produced/corroborated
  each and the reverse-validation outcome for each
- **humanReadableDetail**: optional accompanying explanation text

**None of `CLARIFICATION_REQUIRED`, `NO_MATCH`, or `RESOLUTION_UNAVAILABLE` ever proceeds into
`PropertyContext` assembly or production evaluation** — only `CONFIRMED` does (see the
`PropertyContext` precondition below, and BR-2/Workflow 2).

---

## Property Intelligence Domain

### PropertyFact
A single fact about a property, always carrying evidence-quality metadata — **never** a
regulatory classification (Property Intelligence does not assign KNOWN/INFERRED/REQUIRES
VERIFICATION; see Regulatory Rules Engine below).
- **factType** (e.g., zoning designation, lot size, structure footprint)
- **value** (present only when available)
- **provenance**: source agency, dataset, source identifier, retrieval timestamp, effective date
- **availabilityState**: `AVAILABLE` | `UNAVAILABLE` | `INSUFFICIENT` | `STALE` | `SOURCE_ERROR`
  (per Q3 — populated when an external source fails after bounded retries, or when data exists but
  is known-dated/low-confidence)
- **confidence**: qualitative confidence descriptor
- **sourceHealthState**: reference to the originating source's current health (from Data Source
  Registry)

### PropertyContext
The normalized, assembled property model for a parcel. **Hard precondition (correction 2,
2026-08-19; updated for the `RESOLUTION_UNAVAILABLE` status added in the second correction pass): a
`PropertyContext` may only be assembled for a parcel whose `ParcelResolutionResult.status` is
`CONFIRMED`.** None of `CLARIFICATION_REQUIRED`, `NO_MATCH`, or `RESOLUTION_UNAVAILABLE` ever
proceeds into production `PropertyContext` assembly or evaluation — see Workflow 2/BR-2 in the
companion documents. Once
assembled: parcel reference + the full collection of `PropertyFact` records gathered for it.
Immutable once assembled for a given evaluation (a later re-evaluation produces a new
`PropertyContext`, never mutates an old one — this supports report-snapshot immutability, owned
downstream by Evidence & Report Artifact in a later unit).

---

## Spatial Analysis Domain

### SpatialResult
Output of a single spatial computation (setback distance, containment, lot-coverage percentage,
etc.): the specific geometries/inputs used, the computed value, and an availability/error state
(same shape as `PropertyFact.availabilityState` — a spatial computation can also fail/be
unavailable, e.g., if the parcel geometry itself is only approximate per a `CLARIFICATION_REQUIRED`
resolution that was overridden for testing purposes).

### CriticalAreaFinding *(revised — correction 3: this is a spatial/map fact, never a regulatory conclusion)*
Represents **only** what the authoritative published ECA layer(s) show at a location — "does the
map show an intersection here." It never represents "is this property legally subject to this
critical-area designation," which is a regulatory conclusion the Regulatory Rules Engine alone
derives from this fact (see BR-4a in `business-rules.md`). Renaming `precedenceOutcome` away from
KNOWN/uncertain language, which read as a regulatory classification, to a purely descriptive
map-fact outcome:
- **hazardType** (e.g., steep slope, liquefaction, wetland)
- **individualLayerResult**: hit/no-hit from the authoritative individual layer, if queried
- **combinedLayerResult**: hit/no-hit from the combined/convenience layer, if queried (reference
  only — never authoritative on its own, per BR-5)
- **mappedIntersectionResult**: `INTERSECTS` | `NO_INTERSECTION` | `INDETERMINATE` — the map-fact
  outcome of applying the source-precedence policy (BR-5); `INDETERMINATE` covers both
  edge-proximity uncertainty and cross-source disagreement
- **advisoryStatus**: `ADVISORY_ONLY` | `MAP_DISPOSITIVE` — whether authoritative guidance (e.g.,
  SDCI) treats this specific hazard type's maps as advisory or as dispositive; carried forward so
  the Regulatory Rules Engine can weight this map fact correctly (BR-4a) rather than treating every
  intersection as equally strong evidence
- **toleranceBasis**: reference to the specific source/layer-pair proximity-tolerance policy used
  to determine `INDETERMINATE` for this hazard type/layer relationship (BR-5a — **not** a single
  universal constant across all ECA layers)
- **layerVintage/currency note**: e.g., "derived from 1993-2001 terrain data" — carried through so
  it can be surfaced to the end user later, not dropped

---

## Regulatory Rule Domain

### RuleCitation
SMC section(s), ordinance number (if found), effective date (if found or inferred, with the basis
noted — e.g., "inferred from Seattle's standard 30-day post-publication default" per Unit 0B's
actual research experience).

### AmbiguityCaveat (per Q4 — first-class, not a free-text afterthought)
- **category**: e.g., "inferred from absence of provision," "unread adjacent section," "conflicting
  guidance sources," "conditional/discretionary determination"
- **description**
- **affectedConditionOrInterpretation**: what part of the rule this caveat concerns
- **sourceReferences**: supporting and/or conflicting source citations
- **reviewerNotes**: populated during SOURCE VERIFIED / Tier 2 review
- **resolutionStatus**: how/whether the ambiguity was resolved sufficiently for activation (a
  caveat does not have to be fully resolved to reach ACTIVE — see business-rules.md BR-8)

### CandidateRulePackage
The DRAFTED-stage output of Rule Research Assistant, consuming a `PermittedSourceEvidenceBundle`:
proposed rule specification (structured, independently-written — never bulk-copied source text),
`RuleCitation`, reasoning chain, proposed test cases (positive/negative/boundary/exception),
self-assessed `AmbiguityCaveat` list, and a suggested tier (advisory only).

### PermittedSourceEvidenceBundle
Output of Regulatory Source Access: source excerpts/summaries obtained through permitted access
methods, citation metadata, acquisition method and timestamp (e.g., "interactive browser session,
Municode, 2026-08-19").

### RegulatoryRule
The versioned rule record, the sole artifact the Regulatory Rules Engine consumes (read-only, only
at `ACTIVE`):
- **subject**: e.g., "shed rear-yard setback, NR zone"
- **applicableProjectType / applicableZone**
- **ruleSpecification**: structured, technology-agnostic representation of the deterministic logic
  (e.g., "rear setback >= 5 ft, OR 0 ft if rear lot line abuts an alley")
- **citation**: `RuleCitation`
- **lifecycleState**: `RESEARCHED` | `DRAFTED` | `TRIAGED` | `SOURCE_VERIFIED` | `TESTED` |
  `APPROVED` | `ACTIVE` | `SUPERSEDED` | `DISABLED` — `DISABLED` is acknowledged here only for
  **domain-model compatibility** (so Unit 3 can add the emergency-stop capability later without
  redesigning this entity); **Unit 1 does not implement or exercise the `DISABLED` transition or
  its operator tooling — that is ADM-7, assigned to Unit 3** (correction 5, 2026-08-19)
- **tier**: `TIER_1` | `TIER_2`, plus who confirmed it (always a human, per requirements.md §3.2)
- **caveats**: list of `AmbiguityCaveat` — persists through to `ACTIVE` (Q4); **an `ACTIVE` rule
  does not imply no ambiguity exists, only that it passed the approved governance process despite
  documented caveats**
- **testCases**: positive/negative/boundary/exception cases, with results
- **verificationHistory**: verifier identity/timestamp for Tier 1; verifier + escalated
  professional identity/opinion for Tier 2 (always with founder final sign-off, per RRAG-5)
- **supersessionLink**: reference to the rule version this replaced, and/or the version that
  replaced this one

### InferencePolicy *(new — correction 2, second pass)*
An explicit, deterministic, auditable policy governing how an `INFERRED` conclusion may be derived
when authoritative evidence alone is ambiguous — e.g., "how to determine the applicable zone when
a confirmed parcel's geometry straddles two zoning polygons." Structurally parallel to a
`RegulatoryRule`: it must go through the same kind of governed, versioned, human-approved lifecycle
(it is not created ad hoc by the Regulatory Rules Engine at runtime) before the Engine may apply it.
- **subject**: what ambiguous-evidence situation this policy addresses
- **derivationMethod**: the specific, deterministic method to apply (e.g., "proportional area,"
  "primary-structure location") — one explicit, chosen method, not a menu the engine picks from at
  runtime
- **citation/basis**: why this method is the approved one (may reference a `RegulatoryRule`,
  professional guidance, or another documented basis)
- **approvalStatus**: whether this policy itself has been reviewed/approved for use — an
  `InferencePolicy` that hasn't been through this approval cannot be applied
- **version**

**Governing invariant**: the Regulatory Rules Engine may only produce an `INFERRED` classification
by applying an approved `InferencePolicy` matched to the situation. **If no approved
`InferencePolicy` exists for a given ambiguous-evidence situation, the result is
`REQUIRES_VERIFICATION` — the Engine never invents a heuristic (proportional area, centroid,
primary-structure location, or otherwise) at runtime merely because it seems reasonable.** See
BR-4 in `business-rules.md`.

---

## Evaluation Domain

### ShedProjectDetails
The technology-agnostic shape of the input SRE-SHED-1 evaluation needs: dimensions, height,
approximate placement/location on the parcel, alley-adjacency flag (relevant to the real shed rule
found in Unit 0B). **Note**: the component that collects/validates this from a real user is
Project Configuration / Screening Request, assigned to Unit 2 — Unit 1 exercises this evaluation
logic via internal test tooling (per Q6) using this same conceptual shape, so Unit 2 can populate
it later without a shape mismatch.

### Finding
The Regulatory Rules Engine's output — the **sole** place KNOWN / INFERRED / REQUIRES VERIFICATION
is assigned:
- **classification**: `KNOWN` | `INFERRED` | `REQUIRES_VERIFICATION`
- **subject**: what the finding is about (e.g., "rear setback compliance")
- **appliedRule**: reference to the specific `RegulatoryRule` (with its citation) used, if any
- **appliedInferencePolicy** *(new — correction 2, second pass)*: reference to the specific
  approved `InferencePolicy` used, **present and required whenever `classification = INFERRED`**.
  An `INFERRED` `Finding` with no `appliedInferencePolicy` reference is not a valid output — it
  would mean the Engine derived a conclusion without a governed, auditable basis, which this
  domain model does not allow.
- **supportingEvidence**: references to the specific `PropertyFact`(s), `SpatialResult`(s), and/or
  `CriticalAreaFinding`(s) that produced this classification
- **explanationBasis**: the specific reasoning connecting evidence (and, for `INFERRED`, the
  applied `InferencePolicy`) to classification (this is what Report Explanation, in a later unit,
  is allowed to restate in plain language — never invent)

### EvaluationOutcome
The full result of evaluating a `ShedProjectDetails` against a `PropertyContext`: a collection of
`Finding` records, plus an overall evaluation status distinguishing "a useful, honest partial
evaluation was produced" from "evaluation deferred/failed because an indispensable source was
unavailable" (per Q3's explicit distinction).
