# Unit 1: Deterministic Evaluation Foundation (Sheds) — NFR Requirements Plan

**Grounding**: Functional Design (APPROVED) already fixes most of the tech stack at the product
level (Next.js, TypeScript, PostgreSQL, PostGIS, Drizzle ORM — requirements.md §9) and the Security
Baseline / Resiliency Baseline extensions are enabled project-wide (requirements.md, approved
Requirements Analysis). This stage derives *measurable* NFRs from those baselines and Unit 1's
actual risk profile (regulatory correctness, spatial correctness, source-failure resilience,
auditability) — it does not re-litigate the stack, and per the user's explicit instruction does not
choose hosting/infrastructure providers (that's Infrastructure Design, the next per-unit stage).

## Design Checklist
- [ ] Answer clarifying questions below
- [ ] Generate `nfr-requirements.md` — measurable NFRs, explicitly split into hard release gates
      vs. desirable targets
- [ ] Generate `tech-stack-decisions.md` — the small set of genuinely open Unit-1-level tooling
      choices (testing framework, schema validation, geometry helper library), each justified
- [ ] Cross-check every NFR traces to the Security/Resiliency baselines or a specific Functional
      Design risk (not invented generically)
- [ ] Confirm no enterprise-scale availability/performance target is introduced without MVP
      justification
- [ ] Confirm the Technical GO / Commercial Validation split is preserved (no NFR implies
      commercial readiness)

---

## Clarifying Questions

### Question 1 — Deterministic Reproducibility as a Hard Gate
Functional Design's core value proposition depends on reproducibility (Brief §37 auditability;
BR-4/BR-4a's classification must be traceable). Should "given identical inputs (PropertyContext,
ACTIVE rule versions, InferencePolicy versions where applicable), re-running an evaluation produces
an identical `EvaluationOutcome`" be a **hard release gate** for Unit 1 (i.e., Unit 1 is not
considered complete until this is tested and true), or a desirable target validated more loosely?

A) **Hard release gate** — tested explicitly (e.g., run the same fixture twice, assert identical output); this is foundational to the whole product's trust model and cheap to test for deterministic logic — recommended

B) Desirable target, not a blocking gate for Unit 1 specifically

X) Other (describe after [Answer]: A (accepted recommended default) below)

[Answer]: A (accepted recommended default)

### Question 2 — Auditability Minimum Granularity (Hard Gate)
Per Brief §37, a conclusion must be traceable to its evidence and rule version. For Unit 1
specifically (before any UI exists to browse this), should the hard gate be: **every `Finding` and
every `ParcelResolutionResult` retains enough structured data to reconstruct, after the fact,
exactly which sources/PropertyFacts/SpatialResults/RegulatoryRule version(s)/InferencePolicy (if
any) produced it** — tested by asserting the data is present and queryable in test fixtures, not by
building an actual audit UI (that's a later unit)?

A) Yes — this exact scope as a hard gate: data completeness/structure, not a UI — recommended

B) Broader (describe additional scope after [Answer]: A (accepted recommended default) below)

C) Narrower / defer more of this to a later unit (describe after [Answer]: A (accepted recommended default) below)

[Answer]: A (accepted recommended default)

### Question 3 — Source-Failure Resilience: Qualitative Gate + Bounded Quantitative Targets
Functional Design already fixed the *qualitative* behavior (bounded retry, then
UNAVAILABLE/RESOLUTION_UNAVAILABLE, never silent failure or false success). For NFR Requirements,
should specific **numeric** bounds be fixed now as a hard gate (e.g., "no more than 3 retry
attempts per source call, total added latency from retries capped around a small fixed ceiling"),
or should exact numbers be left to NFR Design/Infrastructure Design, with NFR Requirements fixing
only the qualitative behavior plus a coarse outer bound (e.g., "a single shed evaluation must not
hang indefinitely — some generous outer timeout exists") as the hard gate?

A) **Coarse outer bound only as the hard gate** (e.g., a generous overall timeout exists, retries are bounded and small in count) — exact retry counts/backoff timing deferred to NFR Design/Infrastructure Design where real source behavior can inform them — recommended, avoids guessing at numbers not yet empirically tuned

B) Fix specific numeric retry/latency targets now (describe your preferred numbers after [Answer]: A (accepted recommended default) below)

X) Other (describe after [Answer]: A (accepted recommended default) below)

[Answer]: A (accepted recommended default)

### Question 4 — Spatial Correctness Tolerance (Hard Gate)
PostGIS calculations (setback distances, lot-coverage percentage) need an explicit correctness
tolerance, since real-world geometry/survey data has inherent imprecision (Unit 0B found real
address-point/geometry gaps). Should Unit 1 fix a **specific numeric tolerance** as a hard
correctness gate for its fixture-based tests (e.g., setback/distance calculations must match
independently-verified values within a small fixed margin, such as a fraction of a foot), or is
"matches PostGIS's own computed value for the given geometry, verified against the real Unit 0B/0C
fixture set" sufficient without inventing a separate tolerance number?

A) **No separate invented tolerance number** — correctness is defined as "matches independently-verified expected values for the real fixture set within PostGIS's own standard geometric precision," not a made-up margin — recommended, avoids fabricating precision language not grounded in anything

B) Fix an explicit numeric tolerance now (state it after [Answer]: A (accepted recommended default) below)

X) Other (describe after [Answer]: A (accepted recommended default) below)

[Answer]: A (accepted recommended default)

### Question 5 — Security NFRs Scoped to Unit 1
Unit 1 has no customer-facing UI, no payment, no public API surface yet (per the approved
Functional Design). Confirm the Security Baseline requirements that actually apply *now*:

A) **Scoped to what's real in Unit 1**: credentials for external sources (King County/Seattle/FEMA APIs, Anthropic API when Report Explanation is touched in Unit 2) never logged/committed/exposed; least-privilege database access for this unit's operations; runtime schema validation on all external inputs (`AddressInput`, `ParcelIdentifierInput`, API responses) at every trust boundary per requirements.md §6, even though the "boundary" today is internal tooling rather than a public endpoint; no other Unit 1-specific security surface exists yet (no auth, no payment, no public API abuse vectors) — recommended, matches what's actually built

B) Broader security scope needed now (describe after [Answer]: A (accepted recommended default) below)

[Answer]: A (accepted recommended default)

### Question 6 — Minimal Tech-Stack Confirmations (Unit 1 only)
The product-level stack is already fixed. For Unit 1 specifically, confirm or override:

A) **Testing**: a TypeScript-native test runner (e.g., Vitest) for both deterministic fixture tests and the separate external-source integration/health tests (kept in distinct test suites/tags per Functional Design's fixture strategy). **Schema validation**: a runtime schema library (e.g., Zod) for all `AddressInput`/`ParcelIdentifierInput`/external-API-response validation, satisfying requirements.md §6's "TypeScript typing is not sufficient" requirement. **Geometry**: PostGIS does the authoritative spatial computation (per Application Design); no separate client-side geometry library is needed for Unit 1's server-side logic. — recommended as the minimal, justified set

B) Different preferences (describe after [Answer]: A (accepted recommended default) below)

[Answer]: A (accepted recommended default)
