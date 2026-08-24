# Unit 1 — Business Rules

Technology-agnostic decision rules. References `domain-entities.md` for the entities involved.

**Revised 2026-08-19** per user review (6 targeted corrections — see `domain-entities.md`'s
revision note for the full list). **Revised again 2026-08-19 (second pass)**: `RESOLUTION_UNAVAILABLE`
status added (BR-2); governed-inference requirement added (BR-4/new `InferencePolicy` entity).

---

## BR-1: Parcel Resolution CONFIRMED Rule
*(Revised — correction 1: split by input type. Both paths share one safety invariant.)*

**Shared safety invariant (applies to both input types)**: a single confidence score or a single
uncorroborated lookup is **never** sufficient to reach `CONFIRMED`. Material disagreement between
sources is **never** resolved by majority vote — any material contradiction results in
`CLARIFICATION_REQUIRED`, regardless of how a vote count would fall. When required independent
evidence is unavailable *because the queries completed and simply found nothing*, the resolver
returns `CLARIFICATION_REQUIRED` or `NO_MATCH` as appropriate (BR-2) — it never lowers its
confidence threshold to force `CONFIRMED`. **When required evidence is unavailable because a
resolution source itself failed** (timeout, rate-limit, error) after a bounded retry (the same
conceptual bounded-retry principle BR-3 applies to other external reads — exact counts/backoff are
NFR/implementation concerns), the result is `RESOLUTION_UNAVAILABLE`, **never** `NO_MATCH` (added
in the second correction pass — see BR-2).

### BR-1a: Address Input
*(Q1's original scope; validated by Unit 0B, 26 real cases, 0 false-confident results)*

A `ParcelResolutionResult` from an `AddressInput` may have status `CONFIRMED` only if **all** hold:
1. Primary address/geocode resolution succeeds and identifies a candidate parcel.
2. An independent parcel lookup (a different query path than #1) corroborates the same parcel.
3. Reverse-validation succeeds: the candidate parcel's own canonical/authoritative recorded
   address, compared to the input using **semantic/normalized** comparison (not literal string
   equality — abbreviation, case, and standardized directional-notation differences are not
   conflicts), matches.
4. No material contradiction exists between the sources consulted (different house number,
   street, city/jurisdiction, parcel identifier, or a materially incompatible candidate location).

### BR-1b: Parcel Identifier Input
*(New — correction 1: an identifier does not skip corroboration merely because it looks precise)*

A `ParcelResolutionResult` from a `ParcelIdentifierInput` may have status `CONFIRMED` only if
**all** hold:
1. Authoritative lookup of the supplied identifier succeeds and returns a candidate parcel.
2. Independent corroboration of the same parcel identity/geometry is obtained from another
   authoritative query path/source, where available.
3. No material contradiction exists in parcel identity or jurisdiction between the sources
   consulted.

If independent corroboration cannot be obtained (not every identifier has a second authoritative
path to cross-check against), the result is `CLARIFICATION_REQUIRED` — an identifier is **not**
treated as inherently more trustworthy than an address merely because it looks precise. This path
must fully support **addressless/vacant parcels**: identity is established via the identifier and
its geometry, never blocked on the absence of a canonical street address.

Exact source-specific matching tolerances and normalization rules are left to detailed/implementation
design and testing for both BR-1a and BR-1b — these rules fix the *decision structure*, not every
literal comparison rule.

## BR-2: Resolution Outcome Classification
*(Q2; revised second pass — `RESOLUTION_UNAVAILABLE` row added, `NO_MATCH` row tightened to require
that the queries actually completed)*

| Condition | status | clarificationReason |
|---|---|---|
| BR-1a's (address input) or BR-1b's (identifier input) conditions all hold | `CONFIRMED` | n/a |
| **Required authoritative resolution queries completed successfully** and produced no viable candidate, input well-formed | `NO_MATCH` | n/a |
| **A required resolution source failed (timeout/rate-limit/error) after bounded retry, so resolution could not be completed** *(new)* | `RESOLUTION_UNAVAILABLE` | n/a (see `unavailabilityDetail`) |
| A candidate exists only via interpolated/approximate location, no PIN reachable | `CLARIFICATION_REQUIRED` | `NO_PIN` |
| Independent sources return different parcels/addresses | `CLARIFICATION_REQUIRED` | `CONFLICTING_SOURCES` |
| Multiple genuinely plausible candidates exist (e.g., a building with several legitimate addresses) | `CLARIFICATION_REQUIRED` | `MULTIPLE_CANDIDATES` |
| Only one source responds and it cannot be independently corroborated | `CLARIFICATION_REQUIRED` | `INSUFFICIENT_CORROBORATION` |
| Reverse-validation fails (candidate's own address doesn't match input) | `CLARIFICATION_REQUIRED` | `ADDRESS_MISMATCH` |

This taxonomy is extensible — new reasons may be added as real cases are found, per Q2's
"other reasons discovered later." **None of `CLARIFICATION_REQUIRED`, `NO_MATCH`, or
`RESOLUTION_UNAVAILABLE` ever proceeds into production `PropertyContext` assembly or evaluation —
only `CONFIRMED` does** (see `PropertyContext`'s precondition, `domain-entities.md`).

## BR-3: External Source Failure / Evidence Availability
*(Q3)*

1. Property Intelligence and Regulatory Source Access read operations may retry on failure with a
   small bounded policy; exact attempt counts/timing/backoff are NFR/implementation concerns, not
   fixed here.
2. After retries are exhausted, the affected `PropertyFact` (or `SpatialResult`) is recorded with
   `availabilityState` = `UNAVAILABLE` or `SOURCE_ERROR` as appropriate — **never silently omitted,
   never silently defaulted to a favorable value.**
3. **Property Intelligence, Spatial Analysis, and Regulatory Source Access never assign
   `REQUIRES_VERIFICATION` themselves.** Only the Regulatory Rules Engine's `Finding.classification`
   carries that value, and only after it evaluates whether the missing evidence prevents a
   deterministic conclusion for the specific rule in question.
4. If the failed source is not indispensable — other evidence can still support a meaningful,
   honest partial evaluation — the evaluation proceeds, and the affected `Finding`(s) become
   `REQUIRES_VERIFICATION` rather than failing the whole `EvaluationOutcome`.
5. If the failed source is indispensable such that **no** meaningful evaluation could be produced
   (e.g., the parcel geometry itself is unavailable), the `EvaluationOutcome` is marked
   deferred/failed rather than manufactured as a mostly-empty report presented as if it were
   complete.

## BR-4: Regulatory Finding Classification
*(Revised — correction 2 (first pass): precondition and example corrected. Revised again — correction
2 (second pass): `INFERRED` now requires a governed `InferencePolicy`, not an ad-hoc runtime
heuristic. Unit 1's core deterministic-evaluation rule — the Regulatory Rules Engine's sole
responsibility.)*

**Precondition**: this rule only ever applies to a `PropertyContext` assembled for a `CONFIRMED`
parcel (see `domain-entities.md`'s `PropertyContext` precondition). There is no classification
path for an unconfirmed parcel — evaluation simply does not begin.

For a given rule applied to a `PropertyContext` + `ShedProjectDetails`:
- `KNOWN`: all required evidence (`PropertyFact`s, `SpatialResult`s, `CriticalAreaFinding`s) has
  `availabilityState` = `AVAILABLE` (or, for `CriticalAreaFinding`s specifically, a regulatory
  implication resolvable per BR-4a), and the rule's deterministic logic can be fully evaluated
  against it.
- `INFERRED`: parcel identity is `CONFIRMED`, evidence is otherwise valid, but a genuinely
  ambiguous situation requires an interpretive step beyond a single unambiguous source read — **and
  an approved `InferencePolicy` (see `domain-entities.md`) matched to that specific situation
  exists and is applied.** The Engine reports which `InferencePolicy` it used
  (`Finding.appliedInferencePolicy`), never a runtime-invented heuristic. **If no approved
  `InferencePolicy` exists for the situation, the result is `REQUIRES_VERIFICATION`, not
  `INFERRED`** — the Engine does not choose a convenient method (proportional area, centroid,
  primary-structure location, or otherwise) on its own merely because the evidence is ambiguous.
  Example: the confirmed parcel's geometry straddles a mapped zoning-layer boundary — if an
  approved policy establishes how the applicable zone is derived in that situation, the Engine
  applies it and may produce `INFERRED`; if no such policy has been approved yet, the result is
  `REQUIRES_VERIFICATION`. *(A prior version of this example implied the Engine could pick a
  derivation method itself; that has been corrected.)*
- `REQUIRES_VERIFICATION`: required evidence is unavailable/insufficient/stale, sources
  materially disagree without an authority-hierarchy resolution, no approved `InferencePolicy`
  exists for a genuinely ambiguous situation, the applicable `RegulatoryRule`
  itself carries an unresolved `AmbiguityCaveat` directly relevant to this specific case, or (per
  BR-4a) a `CriticalAreaFinding`'s regulatory implication cannot be resolved to KNOWN.
- **Missing or unhealthy evidence never silently becomes a passing (KNOWN-favorable) finding.**

## BR-4a: Critical-Area Regulatory Implication Derivation
*(New — correction 3: separates the map fact from the regulatory conclusion. Owned exclusively by
the Regulatory Rules Engine — `CriticalAreaFinding` itself never carries a regulatory verdict.)*

Given a `CriticalAreaFinding` (a spatial/map fact — see `domain-entities.md`), the Regulatory Rules
Engine derives its regulatory implication as follows:
1. `mappedIntersectionResult = INDETERMINATE` → the corresponding `Finding` is always
   `REQUIRES_VERIFICATION`, regardless of `advisoryStatus`.
2. `mappedIntersectionResult` = `INTERSECTS` or `NO_INTERSECTION`, **and** `advisoryStatus =
   MAP_DISPOSITIVE`: the mapped result **may** be used as KNOWN-strength evidence, as allowed by
   the specific applicable `RegulatoryRule`'s own logic — this rule does not force KNOWN
   automatically, it removes the advisory-only ceiling that otherwise applies.
3. `mappedIntersectionResult` = `INTERSECTS` or `NO_INTERSECTION`, **and** `advisoryStatus =
   ADVISORY_ONLY`: a KNOWN map intersection **never automatically becomes a KNOWN regulatory
   finding**. The applicable rule's own evidentiary requirements govern the resulting
   classification, which is typically `INFERRED` at best or `REQUIRES_VERIFICATION` — never `KNOWN`
   — because authoritative guidance itself states these maps may not show every real instance of
   the hazard.
4. In all cases, the map fact (`mappedIntersectionResult`, `individualLayerResult`,
   `combinedLayerResult`, `advisoryStatus`, currency/vintage note) is carried into the `Finding`'s
   `explanationBasis` so the basis for the classification remains traceable — the derivation is
   never opaque.

## BR-5: Critical-Area Source Precedence (Map-Fact Level Only)
*(Revised — correction 3: restated as a spatial/map-fact policy; the regulatory-implication step
moved to BR-4a. Formalizes Unit 0B Track 4's validated policy.)*

1. An individual authoritative ECA layer always takes precedence over a combined/convenience layer
   for determining `CriticalAreaFinding.mappedIntersectionResult`. A combined-layer-only hit, with
   no corroborating individual-layer hit, never produces `mappedIntersectionResult = INTERSECTS` —
   it produces `INDETERMINATE`.
2. When individual layers of *different* hazard types disagree (e.g., steep-slope says no,
   potential-slide says yes), each is reported as its own `CriticalAreaFinding` — never collapsed
   into one verdict.
3. A query point within the applicable proximity-tolerance band for the specific source/layer
   relationship being compared (see BR-5a — **not** a single global constant) produces
   `mappedIntersectionResult = INDETERMINATE`.
4. `CriticalAreaFinding.advisoryStatus` is set from authoritative guidance (e.g., SDCI) about
   whether that specific hazard type's maps are advisory or dispositive — this field feeds BR-4a's
   regulatory-implication derivation; BR-5 itself makes no regulatory determination.

## BR-5a: ECA Proximity-Tolerance Scoping
*(New — correction 4: the observed ~15-20m band is not a universal ECA constant)*

The proximity-tolerance threshold used to determine `INDETERMINATE` in BR-5.3 is
**source/layer-pair-specific**, derived from verified layer metadata, empirical validation against
that specific pair, or an explicitly configured conservative policy where neither is available —
never assumed to be a single fixed distance across all ECA layers or hazard types. Unit 0B's
observed ~15-20m discrepancy is preserved as: (a) documented evidence of the phenomenon existing,
(b) a test fixture, and (c) an initial value **specifically for the combined-layer-vs-individual-Steep-Slope-layer
relationship it was measured against** — not a general-purpose ECA tolerance applied to every layer
pair. Other layer-pair relationships require their own tolerance basis before `INDETERMINATE` can
be reliably applied to them.

## BR-6: Tier 1 / Tier 2 Triage
*(requirements.md §3.2, reinforced empirically by Unit 0B Track 2 — 80% Tier 2 across 5 real rules)*

A `CandidateRulePackage` is Tier 1 only if **all** hold: a single unambiguous threshold directly
stated in the source text; no conflicting cross-referenced provisions found; no unresolved
exceptions/conditional triggers; the pattern matches an already-`ACTIVE` analogous rule. **Any one**
of the following forces Tier 2: undefined/ambiguous terms requiring interpretation; multiple
provisions independently governing the same fact pattern with no stated precedence (the real
pattern Unit 0B found for garage rear setback); a discretionary/administrative determination;
high-consequence outcome for a high-value project type; critical-area/geotechnical intersection; a
genuinely novel pattern; or the `CandidateRulePackage`'s own ambiguity flag indicating low
confidence. **Tier defaults to Tier 2 when genuinely in doubt.** Tier confirmation
(`RegulatoryRule.tier`) is always a recorded human (founder) action — the AI-suggested tier is
advisory only (RRAG-2, RRAG-8).

## BR-7: Rule Lifecycle Transition Rules
*(RESEARCHED → DRAFTED → TRIAGED → SOURCE VERIFIED → TESTED → APPROVED → ACTIVE → SUPERSEDED/DISABLED)*

- No automated process may transition a `RegulatoryRule` to `TRIAGED`, `APPROVED`, or `ACTIVE` — each
  requires a recorded human action (RRAG-8's structural guardrail).
- `TRIAGED` requires an explicit founder tier confirmation (BR-6), even when it matches the AI
  suggestion.
- `SOURCE_VERIFIED` requires founder verification (Tier 1) or a recorded escalated-professional
  opinion **plus** founder sign-off (Tier 2 — the professional informs, never unilaterally
  activates, per RRAG-5).
- `TESTED` requires the rule's `testCases` to pass against its `ruleSpecification`.
- `APPROVED` → `ACTIVE` publication is the one-way handoff to the Regulatory Rules Engine's
  read-only consumption boundary (components.md — the Engine never writes back).
- **`DISABLED` (correction 5, 2026-08-19)**: acknowledged conceptually as distinct from
  `SUPERSEDED` (normal version replacement) — a disabled rule would stop applying to *new*
  evaluations without altering historical reports — but **this transition, its trigger (ADM-7),
  and any operator tooling for it are assigned to Unit 3, not Unit 1.** Unit 1 defines the
  `RegulatoryRule` entity so this state slots in later without redesign; it does not implement or
  exercise the transition itself, and `DISABLED` is not a Unit 1 exit criterion.

## BR-8: Rule Ambiguity/Caveat Persistence
*(Q4)*

Every `AmbiguityCaveat` identified during `DRAFTED`/`TRIAGED`/`SOURCE_VERIFIED` review persists on
the `RegulatoryRule` record through `ACTIVE` and beyond (`SUPERSEDED`/`DISABLED`) — caveats are
never dropped upon activation. Reaching `ACTIVE` means the governance process concluded the rule is
production-safe **despite** its documented caveats (e.g., a founder or Tier 2 professional judged
an inferred-from-silence provision acceptable), not that the caveats were eliminated. This record
is what later supports disputed-finding investigation, supersession review, and reproducing why a
historical report reached its conclusion.

## BR-9: Shed Rule Content (Unit 1's first candidate rule set)
*(The actual candidate rule researched in Unit 0B — carried forward as this unit's concrete first
target for exercising the full RESEARCHED→ACTIVE lifecycle, not a hypothetical example)*

**Status disclaimer (correction 6, 2026-08-19, explicit per user instruction): the content below
is candidate rule specification content used to exercise Unit 1's governance and evaluation
behavior. It is not production-authoritative merely by appearing in this document.** It remains
non-production candidate material until the appropriate Tier 2 `SOURCE_VERIFIED` review has
occurred and the rule then passes `TESTED`, `APPROVED`, and `ACTIVE` per BR-7's lifecycle. Fixture
tests built against this specification validate **engine behavior** (does the Regulatory Rules
Engine correctly apply a rule shaped like this, correctly classify findings, correctly handle the
documented caveats) — they do not validate the independent legal correctness of the candidate
content itself; that determination belongs to the governance process. Only a `RegulatoryRule` that
has actually reached `ACTIVE` status is consumable by production Regulatory Rules Engine behavior
— this candidate content does not become "real" by virtue of being well-documented here.

- Rear setback: ≥5 ft from rear lot line, or 0 ft if the rear lot line abuts an alley.
- Height: ≤12 ft (no roof-pitch bonus for shed-form roofs).
- Dwelling separation: ≥3 ft, eave to eave.
- Side and front yard setbacks: **no reduced-setback exception** — full standard setback applies
  (5 ft average/3 ft minimum side; full front setback).
- A structure under 120 sq ft, one-story, slab-on-grade is exempt from a *building permit* — this
  does **not** waive the zoning setback/height rule above (BR-4/domain modeling must keep these two
  facts distinct; conflating "permit-exempt" with "rule-exempt" is a known false-positive risk).
- Documented `AmbiguityCaveat`s carried forward per BR-8: the side-yard rule is inferred from the
  *absence* of a stated exception, not a direct citation; sections 23.44.120-.190 were not fully
  read; a discrepancy was found between older SDCI guidance and current code text (post-Ordinance
  127376 rezone). **Tier: TIER_2** (BR-6).
