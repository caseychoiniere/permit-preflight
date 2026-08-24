# Permit Preflight — Components

High-level component definitions. Per the approved scope guidance (execution-plan.md), these
describe responsibilities and interfaces at the component-boundary level — not detailed business
logic (Functional Design, per-unit, Construction phase) or exact schemas.

**Revised 2026-08-19** — targeted ownership/flow corrections per user review: added Screening
Request, Report Generation Job, and Regulatory Source Access as explicit components; corrected
Property Intelligence's classification ownership; corrected Order & Payment's state scope;
corrected Rule Research Assistant's source dependency; added explicit report-access authorization
to Account. See `application-design.md` for the full "single authoritative owner" checklist.

---

## 1. Parcel Resolution
*(requirements.md §2.2; stories.md Epic 1; Application Design Q2)*

**Purpose**: Resolve a user-supplied address or parcel identifier to a specific, confirmed parcel.

**Responsibilities**:
- Match an address or parcel identifier against authoritative parcel data (King County GIS).
- **Use a multi-source cross-validation strategy, not a single geocoder's confidence score**
  (revised 2026-08-19, evidenced in Unit 0B `unit-0b-findings.md` Track 1 — 26 real test cases, 0
  silent wrong-parcel results): (1) primary geocode against the address-point locator; (2) an
  independent parcel lookup by address text via a different query path; (3) **reverse-validation**
  — pull the candidate PIN's own canonical recorded address and compare it against the input; a
  mismatch is a hard signal, not a soft one. A result becomes CONFIRMED only when independent
  sources agree AND reverse-validation passes.
- Detect ambiguity (multiple candidates, no conventional address, low-confidence geocoding, corner/merged/split/condo situations, **or cross-source disagreement**).
- Represent parcel-identity confirmation as an explicit state (unresolved / candidates-pending-confirmation / confirmed) rather than silently picking a candidate.
- Return structured candidate/result data only — presentation of clarification choices belongs to the orchestration/UI layer, not this component. **A map-based human confirmation step is an accepted resolution path**, not just a fallback — Unit 0B found ~35% of real test cases (address-point gaps with no reachable PIN) can only be resolved this way, not automated away.

**Explicitly not responsible for**: property characteristics beyond identity (Property Intelligence), UI rendering, evidence/provenance modeling beyond recording its own resolution confidence.

**Reused by**: Project Preflight Service, Vacant-Land Screening Service.

---

## 2. Screening Request *(NEW — added 2026-08-19 per user review)*
*(requirements.md §2.1, §2.3, §2.6; stories.md PC-1, PC-2, PC-3, VL-1)*

**Purpose**: The single authoritative owner of durable user intent — what the user wants
evaluated — from the moment a parcel is confirmed through the moment it is purchased and locked.

**Responsibilities**:
- Own: workflow type (existing-property project preflight vs. vacant-land screening), confirmed parcel reference, selected project type (where applicable), project-specific inputs/configuration (where applicable), validated/unvalidated request state, authenticated-user association (if any).
- Support save/resume of an in-progress request for authenticated users (stories.md PC-3).
- Produce an **immutable snapshot** of the request at the moment Checkout & Fulfillment Service creates a Checkout Session — this snapshot, not the live/editable request, is what payment is for and what the Report Generation Job evaluates. Later edits to a live request (if the user starts a new one) cannot retroactively change what was already paid for.
- Validate its own completeness/correctness (required fields present, project type currently supported) — this validation is what the PO-0 readiness check consults; it does not itself perform spatial or regulatory evaluation.

**Explicitly not responsible for**: parcel identity resolution (consumes an already-confirmed parcel from Parcel Resolution), spatial/regulatory evaluation (that happens only after payment, against the snapshot, via Report Generation Orchestrator Service), payment state (Order & Payment).

**Owned/orchestrated by**: Project Preflight Service and Vacant-Land Screening Service each create and validate Screening Requests of their respective workflow type — neither service owns primary Screening Request data itself.

---

## 3. Property Intelligence
*(requirements.md §3.1, §3.3; Application Design Q2; **revised 2026-08-19**)*

**Purpose**: Given a confirmed parcel, retrieve and aggregate authoritative property-related data
and normalize it into the canonical `PropertyContext`, with evidence/provenance and
**evidence-quality state** attached — but **without producing regulatory finding classifications**.

**Responsibilities**:
- Retrieve data from authoritative sources (King County Assessor, Seattle GIS/zoning/ECA, FEMA, permit history, etc.).
- Normalize fragmented external schemas into the internal `PropertyContext` model — external schemas never leak past this boundary.
- Attach to every property fact: value, provenance (source, dataset, retrieval timestamp, effective date), confidence, **freshness/staleness**, **source-health state** (consulted from Data Source Registry), and an explicit **unavailable/insufficient-data state** where a fact cannot be reliably established.
- Handle owner-name data per its RCW-restricted use — not exposed/exported as a raw list.

**Explicitly not responsible for** *(corrected 2026-08-19)*: **producing KNOWN / INFERRED / REQUIRES VERIFICATION regulatory findings.** Property Intelligence determines whether a *fact* is available, stale, untrusted, or insufficient — it does not decide what that means for a *regulatory conclusion*. That determination belongs exclusively to the Regulatory Rules Engine (and, for spatial facts, Spatial Analysis feeding into it), which consumes Property Intelligence's fact/evidence-quality states as one of its inputs. This correction preserves invariant 1 (deterministic evaluation is owned by the evaluation layer, not the data-aggregation layer) and prevents missing/unhealthy data from silently becoming PASS at the wrong layer.

**Reused by**: Report Generation Orchestrator Service only (see point 1 in the pre-payment correction below — Property Intelligence is never invoked before payment).

---

## 4. Data Source Registry
*(requirements.md §38; Application Design Q7)*

**Purpose**: Own cross-cutting metadata about each external authoritative data source, independent of any single property lookup.

**Responsibilities**:
- Track source identity, type, expected refresh cadence, last successful retrieval, health state, and failure history.
- Support manual unhealthy/healthy overrides (stories.md ADM-8).
- Serve as the single source of truth for source health — consumed by Property Intelligence (fact-level evidence-quality) and by the PO-0 readiness check (workflow-level "is a required source already known-unhealthy" check — a cheap existing-state read, not a live retrieval), and by Admin/Support Service (inspection).

---

## 5. Spatial Analysis
*(Brief §17; requirements.md §4.3)*

**Purpose**: The sole owner of PostGIS-backed spatial computation.

**Responsibilities**:
- Parcel containment, intersection, setback distance, critical-area intersection, %-of-parcel-affected, proposed-structure placement, buildable-envelope calculation, geometry validation, spatial indexing, nearby/comparable-permit spatial search.
- Return deterministic, reproducible results with the specific geometries/inputs used.
- **Critical-area source-precedence policy** (added 2026-08-19, per Unit 0B Track 4
  `unit-0b-findings.md`): individual authoritative ECA layers always take precedence over any
  combined/convenience layer for a KNOWN finding (Seattle's own combined layer is explicitly
  publisher-disclaimed as "analytical purposes only... does not represent actual regulatory
  areas"). When two individual layers of *different* hazard types disagree, report each
  independently rather than collapsing to one verdict. A query point within the observed
  boundary-tolerance band of a polygon edge (~15-20m, where the combined layer's generalization
  can diverge from the individual layer) triggers REQUIRES VERIFICATION rather than a confident
  answer. Even individual authoritative layers are advisory per SDCI's own guidance, except two
  hazard types SDCI names as map-dispositive (priority habitat, peat-settlement) — weight
  confidence accordingly.

**Explicitly not responsible for**: interpreting what a spatial result means regulatorily (Regulatory Rules Engine).

**Invoked exclusively by**: Report Generation Orchestrator Service, post-payment, against a purchased Screening Request snapshot — **never invoked pre-payment** (correction 2026-08-19, see below).

---

## 6. Regulatory Rules Engine
*(requirements.md §4.1, §14; stories.md Epic 3; Application Design Q1; **revised 2026-08-19**)*

**Purpose**: Deterministic runtime evaluation of a property/project against production-approved
ACTIVE rule versions — and the sole owner of regulatory finding classification.

**Responsibilities**:
- Given a `PropertyContext` (with its fact/evidence-quality states from Property Intelligence), spatial-analysis results, and a Screening Request snapshot, select applicable ACTIVE rules and evaluate them.
- **Own the KNOWN / INFERRED / REQUIRES VERIFICATION classification decision** — consuming Property Intelligence's fact/evidence-quality states (unavailable, stale, untrusted, insufficient) and Spatial Analysis's results as inputs to that decision, never producing a classification from incomplete inputs without an explicit basis. Missing or unhealthy input data must never silently become a passing finding.
- Consume rule content exclusively through the boundary published by Regulatory Rule Governance (ACTIVE versions with citation/effective-date metadata) — cannot author, approve, mutate, or activate a rule.

**Invoked exclusively by**: Report Generation Orchestrator Service, post-payment.

---

## 7. Regulatory Rule Governance
*(requirements.md §3.2, §4.1; stories.md Epic 7; Application Design Q1)*

**Purpose**: Own the full regulatory-rule authoring and lifecycle workflow, preserving the Tier 1/Tier 2 human-approval model.

**Responsibilities**:
- Own rule lifecycle state: RESEARCHED → DRAFTED → TRIAGED → SOURCE VERIFIED → TESTED → APPROVED → ACTIVE → SUPERSEDED.
- Accept AI-drafted candidate rule packages (from Rule Research Assistant) as DRAFTED input only.
- Enforce that tier confirmation is always a human (Founder) action, defaulting to Tier 2 when ambiguous.
- Record Tier 2 domain-professional review outcomes and require Founder sign-off regardless of tier before APPROVED.
- Publish ACTIVE rule versions through the one-way boundary the Regulatory Rules Engine consumes.
- Support supersession without altering historical report reproducibility.

---

## 8. Regulatory Source Access *(NEW — added 2026-08-19 per user review)*
*(requirements.md §3.2; stories.md RRAG-1; Application Design Q1, Q4)*

**Purpose**: The single authoritative owner of **permitted-access regulatory source acquisition**
— closes the gap where Rule Research Assistant previously implied it directly "researched
Municode" with no defined acquisition boundary.

**Responsibilities**:
- Obtain regulatory source material through permitted access methods only: Municode as a human/research reference used in accordance with its terms (not scraped/bulk-ingested), City Clerk/Legistar for ordinance text/amendment history/effective dates, SDCI guidance where applicable.
- Identify and preserve source/citation/effective-date metadata for everything it supplies.
- Supply a **permitted-source evidence bundle** to Rule Research Assistant — this is the only path by which regulatory source material reaches AI-assisted research.
- **Explicitly does not interpret or approve regulatory meaning** — it acquires and cites source material; it does not decide what a provision means (that's Rule Research Assistant's synthesis, subject to full human triage) or whether a rule is correct (Regulatory Rule Governance/Founder).
- The concrete acquisition mechanism (manual research, permitted API, browser/research-tool-assisted) is deliberately left unspecified here — Application Design fixes *who owns the boundary*, not *how retrieval is implemented*.

**Explicitly prevents**: the AI Provider Adapter from implicitly becoming a general-purpose web crawler or an unbounded regulatory source of truth — it never acquires source material directly; it only ever receives what this component supplies.

---

## 9. AI Service / AI Provider Adapter
*(requirements.md §5.1, §5.4; Application Design Q4)*

**Purpose**: The single low-level integration point with the Anthropic Claude API.

**Responsibilities**:
- Provider/model selection and configuration, structured-output request handling, schema-validation support, retry/timeout/error behavior, prompt-caching where appropriate.
- Expose a constrained interface (schema-in, schema-out) — not a generic unrestricted "generate text" capability, and not a source-acquisition mechanism (see Regulatory Source Access above).

---

## 10. Report Explanation
*(requirements.md §5.1, §5.3; stories.md RGD-5, VL-5; Application Design Q4)*

**Purpose**: Use-case-specific module that turns deterministic findings/evidence into plain-language report narrative — and nothing else.

**Responsibilities**:
- Accept already-finalized deterministic findings and evidence as input (assembled by Report Generation Orchestrator Service, post-payment).
- Produce plain-language explanation, synthesis, diligence-question suggestions, and the vacant-land "preliminary screening assessment" narrative — always referencing specific finding/evidence IDs.
- Structurally cannot alter, override, or independently derive a regulatory or spatial conclusion.
- Degrade gracefully: if unavailable or output fails schema validation, return "explanation unavailable" rather than blocking delivery of deterministic findings.

---

## 11. Rule Research Assistant
*(requirements.md §3.2; stories.md RRAG-1; Application Design Q4; **revised 2026-08-19**)*

**Purpose**: Use-case-specific module that performs AI-assisted regulatory research synthesis and
drafts candidate rule packages, consuming permitted-source material rather than acquiring it
directly.

**Responsibilities**:
- Given a target rule need and a permitted-source evidence bundle **supplied by Regulatory Source Access**, use the AI Service to synthesize a candidate rule package: independently-written rule specification, citations, reasoning chain, proposed tests, self-assessed ambiguity/tier suggestion.
- Output is always DRAFTED-stage material handed to Regulatory Rule Governance — never able to advance its own output to TRIAGED or beyond.
- **Depends on Regulatory Source Access (for evidence bundles) and AI Service / AI Provider Adapter (for synthesis)** — corrected from the prior design, which left source acquisition as an undefined, implicit dependency.

---

## 12. Evidence & Report Artifact
*(requirements.md §3.3, §36-§37; stories.md Epic 4; Application Design Q8)*

**Purpose**: Own the immutable report snapshot.

**Responsibilities**:
- Assemble a report from deterministic findings/evidence + (optional) Report Explanation output into one immutable, versioned snapshot, pinned to the specific rule versions and data-retrieval timestamps used.
- Produce the web-report representation and the PDF representation from that single snapshot, via an internal renderer/adapter interface.
- Guarantee that once generated, a report's content never changes.
- Expose `getReport` for internal use by the orchestration layer — **user-facing retrieval must pass through the report-access authorization boundary owned by Account** (see below), not call this directly.

**Associated by**: Report Generation Job (below), once generation completes.

---

## 13. Report Generation Job *(NEW — added 2026-08-19 per user review)*
*(requirements.md §9.1, §40; stories.md RGD-1, PO-4, ADM-4; Application Design Q6)*

**Purpose**: The single authoritative owner of report-generation execution state — separated out
so that generation state has a persisted, inspectable home independent of whichever orchestration
service happens to be executing it.

**Responsibilities**:
- Own job state: QUEUED → IN_PROGRESS → COMPLETE / FAILED, created idempotently by Checkout & Fulfillment Service after a verified PAID transition, referencing the purchased Screening Request snapshot.
- Record retry attempts and failure reasons.
- Be claimed and transitioned by Report Generation Orchestrator Service (QUEUED→IN_PROGRESS on claim; →COMPLETE with an Evidence & Report Artifact reference on success; →FAILED, an explicit terminal state, after the retry policy is exhausted — never silently remaining COMPLETE-equivalent without an actual artifact).
- Serve as the read source for Admin/Support Service's job-status inspection (ADM-4) — Admin/Support reads through this component, not through the orchestrator service's internals.

**Explicitly separate from Order & Payment** (see correction 2026-08-19 below) — generation state and payment state are never the same state machine.

---

## 14. Order & Payment
*(requirements.md §9.1; stories.md Epic 5; Brief §28-§30; **revised 2026-08-19**)*

**Purpose**: Own the payment/order domain only — Stripe Checkout Session creation, webhook
verification, and **payment lifecycle state**, now explicitly scoped apart from generation state.

**Responsibilities**:
- Create a Checkout Session against a validated Screening Request snapshot, with a server-determined price only.
- Verify Stripe webhook signatures; idempotently transition payment state (conceptually: PENDING → PAID → REFUNDED, plus a payment failure/cancellation state if needed — exact enum deferred to Functional Design).
- Process refunds via the Stripe API, recording reason and resulting access decision.

**Explicitly not responsible for** *(corrected 2026-08-19)*: generation state (Report Generation Job owns QUEUED/IN_PROGRESS/COMPLETE/FAILED entirely). If an overall "fulfillment status" is useful for the UI, it is *derived* by reading both Order & Payment and Report Generation Job — it is never stored as a third, independently-mutable copy, so the two cannot silently drift apart.

---

## 15. Account
*(requirements.md §2.4; stories.md Epic 6; **revised 2026-08-19**)*

**Purpose**: Own guest/authenticated identity, and — as of this revision — the single explicit
**report-access authorization boundary**.

**Responsibilities**:
- Support guest purchase (no account) and optional account creation.
- Link a prior guest purchase to an account only with proof of control (email/magic-link verification or secure access-token possession) — never on email match alone.
- Handle account deletion per the retention/deletion policy while preserving report-record immutability for records that must persist for business/audit purposes.
- **Own `authorizeReportAccess`** *(added 2026-08-19)*: a single explicit contract that every user-facing report-retrieval path must pass through — given a report reference and either an authenticated account or a guest access credential (the secure token from an emailed report link), returns authorized/denied. A bare client-supplied report ID is never sufficient on its own. This covers both authenticated report-history access (stories.md ACC-3) and secure emailed guest-report links (stories.md ACC-1) through the same boundary, so there is exactly one place ownership/authorization logic lives rather than two parallel, potentially-inconsistent checks.

---

## 16. Support Case (Operational Case)
*(requirements.md §12, §47; stories.md ADM-9; Application Design Q5)*

**Purpose**: Minimal, explicitly-owned persistence for support/investigation records.

**Responsibilities**:
- Record a customer complaint/investigation, its linked references (report ID, order ID, generation-job ID, rule version(s) involved), the investigation outcome, and any resulting action.
- Nothing more — not a CRM, ticketing system, or general-purpose case-management platform.

**Owned/accessed through**: Admin/Support Service.
