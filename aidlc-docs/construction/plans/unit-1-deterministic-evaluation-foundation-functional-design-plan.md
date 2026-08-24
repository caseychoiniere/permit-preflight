# Unit 1: Deterministic Evaluation Foundation (Sheds) — Functional Design Plan

**Unit definition**: `unit-of-work.md` Unit 1. **Assigned stories**: `unit-of-work-story-map.md`
Unit 1 — PR-1 through PR-5 (Property Resolution), SRE-0 + SRE-SHED-1 (shared evidence
classification + shed evaluation), RRAG-1 through RRAG-8 (full regulatory rule governance
lifecycle). No UI/frontend in this unit — Project Configuration and report display are Unit 2.

**Grounding**: this is not a from-scratch design. Unit 0B (`unit-0-pre-construction-validation/unit-0b-findings.md`)
already empirically validated the multi-source parcel-resolution algorithm (26 real test cases),
the ECA source-precedence policy, and produced a real candidate shed rule with genuine ambiguities
documented. Functional Design's job is to turn that validated behavior into a formal,
technology-agnostic business-logic model — not re-derive it from scratch.

---

## Design Checklist
- [ ] Answer clarifying questions below
- [ ] Analyze answers for ambiguity; raise follow-ups if needed
- [ ] Create `business-logic-model.md` — core workflows: parcel resolution, PropertyContext
      assembly, spatial evaluation, regulatory rule evaluation, rule governance lifecycle
- [ ] Create `business-rules.md` — the CONFIRMED/CLARIFICATION-REQUIRED/NO-MATCH decision rule,
      evidence-quality-to-classification rules, ECA precedence rules, Tier 1/Tier 2 triage rules
- [ ] Create `domain-entities.md` — Parcel, PropertyContext, PropertyFact/Evidence, SpatialResult,
      RegulatoryRule (with lifecycle state), CandidateRulePackage, Finding
- [ ] No `frontend-components.md` — confirm N/A for this unit (no UI surface)
- [ ] Cross-check every artifact traces to an assigned story and to the Unit 0B validated behavior

---

## Clarifying Questions

### Question 1 — Parcel Resolution CONFIRMED Rule (formalizing Unit 0B's validated method)
Unit 0B tested (not just proposed) a specific multi-source method: primary geocode + independent
parcel lookup + reverse-validation (does the candidate PIN's own canonical address match the
input?). Should the formal business rule be:

A) **CONFIRMED requires ALL THREE to agree**: primary geocode succeeds, independent parcel lookup returns the same PIN, AND reverse-validation passes (canonical address matches input) — strictest, matches exactly what Unit 0B tested and validated at 0-false-confident-results across 26 cases

B) CONFIRMED requires only two of the three to agree (majority rule) — more lenient, untested at this exact threshold

X) Other (describe after [Answer]: below)

[Answer]: X

Formalize the Unit 0B safety invariant, but do not make literal three-way string equality the
permanent domain rule. The domain rule should be: CONFIRMED requires sufficient independent
evidence that identifies the same parcel, successful reverse-validation of the candidate parcel
identity, and no material contradiction between authoritative evidence sources. The Unit 0B
validated method is the initial concrete baseline: primary address/geocode resolution, independent
parcel lookup/corroboration, reverse-validation against the candidate parcel's own authoritative
address/identity data. A geocoder confidence score alone is never sufficient. Material
disagreement between sources must never be resolved through a majority vote — any material
contradiction results in CLARIFICATION_REQUIRED. Address comparison must be semantic/normalized
rather than naive literal string equality — benign representation differences (abbreviation, case,
standardized directional notation, equivalent canonical formatting) must not by themselves create
a conflict. Meaningful differences (different house number, street, city/jurisdiction, parcel
identifier, materially incompatible candidate location) must prevent automatic confirmation. Where
required independent evidence is unavailable, the resolver must not lower the confidence threshold
merely to produce an answer — it returns CLARIFICATION_REQUIRED or NO_MATCH as appropriate.
Preserve the Unit 0B result as the initial validated decision strategy while leaving exact
source-specific matching tolerances/normalization rules for detailed design/testing.

### Question 2 — Handling the "No PIN, Approximate Location Only" Case
Unit 0B found ~35% of real addresses have no address point at all (only street-range
interpolation, no PIN). Per your Application Design decision, this becomes CLARIFICATION-REQUIRED
with a map-based confirmation path. For Functional Design: should the domain model represent this
as a distinct sub-state (e.g., `CLARIFICATION_REQUIRED_NO_PIN` vs. `CLARIFICATION_REQUIRED_CONFLICT`),
so the eventual UI (Unit 2+) can show a different message/flow for "we found no exact record, please
confirm on a map" vs. "we found conflicting records, please pick one"?

A) Yes — distinct sub-states for the different clarification reasons, since they need different resolution UX later

B) No — a single CLARIFICATION_REQUIRED state is enough; reasons can be a free-text/detail field rather than distinct states

X) Other (describe after [Answer]: below)

[Answer]: X

Use one primary resolution status, CLARIFICATION_REQUIRED, with a structured clarification-reason
concept rather than a separate state-machine state for every reason. Conceptually: status =
CONFIRMED / CLARIFICATION_REQUIRED / NO_MATCH; clarificationReason (when applicable) = NO_PIN /
CONFLICTING_SOURCES / MULTIPLE_CANDIDATES / INSUFFICIENT_CORROBORATION / ADDRESS_MISMATCH / other
explicitly modeled reasons discovered later. Exact enum values deferred. This preserves a small,
comprehensible state machine while still allowing Unit 2's eventual UI to present different
resolution/confirmation experiences for different causes. Do not use free text as the only
machine-readable distinction — human-readable detail may accompany the structured reason.

### Question 3 — External API Failure/Timeout Handling During Evaluation
Requirements.md's Resiliency Baseline is enabled but general; Unit 1 needs concrete behavior. When
King County/Seattle/FEMA APIs are slow, rate-limited, or return an error during Property
Intelligence or Spatial Analysis's calls:

A) Retry with backoff a small fixed number of times (e.g., 2-3 attempts), then mark that specific fact/layer as REQUIRES VERIFICATION (not fail the whole evaluation) — recommended, matches the "never let one bad input break the whole report" principle already established for LLM degradation (RGD-5)

B) Fail the entire evaluation and surface a generic error if any single source call fails

X) Other (describe after [Answer]: below)

[Answer]: X

Use bounded retry/degradation behavior, preserving the Application Design ownership boundary. For
safe/idempotent external data reads: allow a small bounded retry policy with backoff where
appropriate; exact attempt counts, timing, jitter, and source-specific policies are NFR/implementation
concerns, not hard-coded in Functional Design; after retries are exhausted, record the affected
property fact/source evidence as unavailable/source-error/stale-or-unretrievable as appropriate;
preserve source identity, attempt/failure metadata, and evidence-quality state needed for
downstream evaluation. Property Intelligence and source-access components MUST NOT themselves
assign the regulatory finding classification REQUIRES VERIFICATION — the Regulatory Rules Engine
remains the sole owner of KNOWN/INFERRED/REQUIRES VERIFICATION classification. Flow: external
source failure -> fact/evidence marked unavailable or insufficient -> Regulatory Rules Engine
evaluates whether the missing evidence prevents a deterministic conclusion -> resulting finding may
become REQUIRES VERIFICATION. A source failure should not automatically fail the entire evaluation
when a useful, honest partial evaluation can still be produced. However, if the failed source is
indispensable to the entire requested evaluation such that no meaningful evaluation can be
produced, the workflow may fail/defer the evaluation rather than manufacture a mostly-empty report.
This distinction is modeled explicitly at the business-logic level without choosing exact retry
infrastructure yet.

### Question 4 — Regulatory Rule Domain Model: Ambiguity/Caveat as a First-Class Field
Unit 0B's real shed rule research found genuine, specific ambiguities worth preserving (e.g., "side-yard
exception is inferred from absence of a stated provision, not a direct citation"). Should the
`RegulatoryRule` domain entity carry a structured "known caveats/ambiguity notes" field that
survives into production (visible to whoever investigates a disputed finding later), or is this
just Rule Governance workflow metadata that doesn't need to persist on the ACTIVE rule itself?

A) Yes — persist caveats as a first-class field on the rule record, carried through to ACTIVE status, referenceable by Admin/Support later (ADM-2/ADM-9) — recommended, directly supports auditability (Brief §37) and the honest "not false certainty" product philosophy

B) No — caveats are TRIAGED/SOURCE VERIFIED-stage workflow notes only; once a rule is ACTIVE it's just the rule, no caveat metadata carried forward

X) Other (describe after [Answer]: below)

[Answer]: A

Persist known caveats and ambiguities as first-class metadata on the versioned RegulatoryRule
record through ACTIVE status. This information is part of the rule's audit/provenance history and
must remain inspectable later for disputed findings, Admin/Support investigation, supersession/re-review,
future professional review, understanding why a rule was Tier 2, and reproducing the reasoning
environment under which an old report was issued. Do not model this as an unstructured note field
only — conceptually, ambiguity/caveat information should be able to capture: ambiguity/caveat
category, description, affected condition or interpretation, supporting/conflicting source
references, verification/reviewer notes where applicable, and whether/how the ambiguity was
resolved sufficiently for activation. Exact schemas deferred. An ACTIVE rule does not imply "no
ambiguity exists" — it means the rule passed the approved human governance process despite any
documented caveats.

### Question 5 — Fixture-Based Test Data Source
Requirements.md §8 calls for fixture-based tests against real/validated Seattle scenarios. Unit 0B
already produced 26 real, ground-truthed parcel-resolution test cases and 1 real, cited shed rule
with documented test cases (pass/fail/boundary/exception). Should Unit 1's actual test suite:

A) **Directly reuse Unit 0B's real test data as the fixture baseline** (the 26 parcel cases + the shed rule's documented test cases), extending with more fixtures only where gaps remain — recommended, avoids re-deriving what's already been validated, and these are genuinely real Seattle scenarios, not synthetic ones

B) Treat Unit 0B's data as reference only and build an entirely separate fixture set for Unit 1

X) Other (describe after [Answer]: below)

[Answer]: A

Directly reuse Unit 0B's validated real-world cases as the baseline fixture corpus: the 26
parcel-resolution cases, the real shed-rule pass/fail/boundary/exception cases, and the deliberate
false-confidence/adversarial cases. However, convert the relevant Unit 0B observations into
captured, deterministic local test fixtures/snapshots — the core automated test suite must NOT
depend on live King County/Seattle/FEMA API responses on every test run. Separate: (1) deterministic
fixture-based domain tests (captured known inputs/responses, stable and reproducible, suitable for
CI) from (2) external-source integration/health tests (exercise real APIs where useful, detect
upstream schema/behavior changes, may vary independently from application correctness). Extend the
Unit 0B fixture corpus only where Functional Design identifies coverage gaps — do not replace
already-ground-truthed scenarios with invented synthetic cases merely to create a new Unit 1 test
set. Synthetic edge cases may supplement the real fixtures where they exercise boundaries difficult
to obtain naturally.

### Question 6 — Frontend Components Confirmation
Confirm: Unit 1 has no UI/frontend surface (project configuration UI, report display, and the
rule-governance review interface are Unit 2+/later units) — Unit 1 is domain logic + a way for the
founder to exercise the RRAG-1 through RRAG-8 workflow (even if that "way" is a script/internal
tool rather than a polished UI, consistent with the two-gate model's "low-regret" framing).

A) Confirmed — no `frontend-components.md` for this unit; rule governance is exercised via internal tooling/scripts, not a built UI, for now

B) Actually, a minimal internal UI for rule governance IS wanted in Unit 1 — describe scope after [Answer]: below

X) Other (describe after [Answer]: tag below)

[Answer]: A

Confirmed. Unit 1 has no customer-facing UI and no frontend-components.md artifact. Project
Configuration UI, parcel-confirmation/map UX, report display, customer report access, and other
customer-facing experiences remain outside Unit 1. The RRAG-1 through RRAG-8 governance workflow
must still be genuinely exercisable in Unit 1, but may use deliberately lightweight internal
tooling such as scripts, CLI commands, structured files, or internal developer/operator commands
rather than a polished governance UI. The lightweight tool must still exercise the real
governance/domain rules; it must not bypass lifecycle transitions or directly mutate ACTIVE rule
state merely because it is an internal tool. Do not build frontend infrastructure solely to
exercise Unit 1.
