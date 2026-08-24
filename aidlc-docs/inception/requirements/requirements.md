# Permit Preflight — Requirements (Inception)

**Depth**: Comprehensive (high-complexity, regulatory-risk, payment-risk, greenfield product)
**Status**: APPROVED 2026-08-19. Persona (§1.3) and project-type order (§1.4) approved with clarifications/revisions noted inline; risk-based rule-review model (§3.2) approved. Requirements Analysis complete.

## Intent Analysis Summary

- **User request**: Perform AI-DLC Inception for the MVP of Permit Preflight, a Seattle-first residential buildability intelligence platform, using `docs/product/permit-preflight-inception-brief.md` as governing input. Validate viability (data, legal, economic, architectural) before Construction; do not implement yet.
- **Request type**: New Project (greenfield).
- **Scope estimate**: System-wide — new full-stack product (Next.js/TypeScript modular monolith, PostgreSQL+PostGIS, payment integration, LLM integration, regulatory rules engine, spatial analysis, admin tooling).
- **Complexity estimate**: Complex — regulatory domain modeling, spatial computation, multi-source data integration with licensing constraints, payment processing with financial/legal exposure, LLM integration with correctness guardrails, and a solo-developer delivery constraint.

## Traceability

This document incorporates: the governing brief (all 59 sections), `research-findings.md` (verified data/licensing/cost/legal-landscape research), and the answered `requirement-verification-questions.md`. Section references below (e.g. "Brief §18") point back to the governing brief.

---

## 1. Product Scope & Positioning

### 1.1 Vision (Brief §1)
Seattle-first residential buildability screening for two questions: "Can I build this here?" (existing property) and "What could I reasonably build here?" (vacant land). Explicitly a **screening/early-diligence tool**, not a permit guarantee, design service, or professional replacement. Working value prop: *"Know what you can build before you spend money finding out."*

### 1.2 Geographic Scope (Brief §2)
Seattle, WA only for MVP. King County/other sources may supply underlying data, but no other jurisdiction is supported at launch. Architecture must not assume Seattle is the only jurisdiction forever (e.g., avoid hardcoding "Seattle" where "jurisdiction" is the correct abstraction), without building multi-jurisdiction support now.

### 1.3 ⏳ RECOMMENDATION — Primary Persona (pending your approval, per B1)

**Recommendation: prioritize the professional/prosumer persona** — small residential developers, builders, and real-estate investors evaluating multiple properties, with real-estate agents/design professionals as a closely adjacent secondary professional audience — as the primary MVP design target. Homeowners and prospective buyers remain a real, served audience but are not the primary driver of MVP UX/report-depth decisions.

**Reasoning**, weighed against the brief's own evaluation criteria (§4) and `research-findings.md` §4:

| Factor | Professional/Prosumer | Homeowner |
|---|---|---|
| Frequency of use | High — evaluates many properties/year | Very low — once per project, years apart |
| Urgency | High — time-boxed acquisition/deal decisions | Moderate, less time-pressured |
| Willingness to pay | High — $9.99 is trivial against deal sizes; comparable tools (DeepBlocks, Zoneomics) validate $99–$5,999/mo professional spend for similar screening | Uncertain — $9.99 is low-friction but a one-time, low-urgency purchase is a classically hard consumer conversion |
| Existing alternatives | SDCI's own free zoning tools exist for both, but professionals value time-savings/synthesis more than raw access | Free city tools + general web research are a real substitute; no evidence consumers already pay for this |
| CAC difficulty | Lower — professional communities, investor forums, word-of-mouth, direct outreach are efficient, low-cost channels | Higher — needs to be found at the exact moment of a specific home-improvement/purchase decision (SEO/paid search), and consumer paid-search CPCs commonly exceed a $9.99 ticket's margin |
| Report depth/precision tolerance | Higher — professionals correctly interpret "preliminary" and "UNKNOWN" results without excess hand-holding | Lower — more likely to need plain-language explanation (a good fit for the LLM explanation layer, but a UX cost) |
| Repeat-use value | High — matches brief §4's own note that professionals are "strategically important" for recurring revenue | Low — one-and-done by nature |

The "no direct consumer competitor found" research finding is genuinely ambiguous (white space vs. unproven demand) and is **not** used here as supporting evidence either way. The professional-tier precedent (DeepBlocks/Zoneomics charging far more, successfully) is used as the stronger positive signal, because it demonstrates the underlying willingness-to-pay pattern already exists in an adjacent market.

**What this does NOT mean**: homeowners are not excluded from MVP. Guest checkout (D1), plain-language LLM explanations, and mobile support all directly serve homeowners too. This recommendation affects design *priorities* under constraint (report depth, professional-friendly bulk/repeat-use affordances, project-type sequencing) — not who is allowed to buy a report.

**APPROVED 2026-08-19**, with clarification: the primary/repeat-evaluator persona (small residential developers, real-estate investors, builders, and similar repeat property evaluators) drives *product prioritization, report usefulness, repeat-use capabilities, and future business-model decisions* — but this must not become enterprise-oriented or unnecessarily complex UX. The core experience must remain understandable and usable by homeowners and prospective buyers as full secondary users, not a degraded afterthought. In practice: when a design decision would trade off simplicity/clarity for the general user against depth/power for the repeat evaluator, prefer keeping the core experience simple and add professional-oriented capability *additively* (e.g., report history, repeat-property comparison) rather than complicating the primary report/report-request flow itself.

### 1.4 MVP Project Types & Implementation Order — APPROVED (revised 2026-08-19, per your C1 approval with a sequencing change)

All eight project types named in the brief (§3) remain in architectural scope (the shared property-intelligence/rules architecture must not preclude any of them). **Approved working sequence** (revised from the original Inception recommendation to move vacant-land earlier, at your direction):

1. **Sheds / small accessory structures** — lowest regulatory complexity, good data availability, lowest validation difficulty.
2. **Detached garages** — same spatial pattern as sheds plus lot-coverage-percentage calculation; incremental complexity, real user/professional value.

   **Types 1-2 together establish and validate the foundational architecture**: property-intelligence, PostGIS spatial analysis, the deterministic rules engine, the evidence model, the testing approach, and report generation end-to-end — at the lowest rule-complexity risk, fastest path to the pre-construction validation test (§11).

3. **Vacant-land screening** — moved up from its original later position at your direction, because it is strategically important to the professional/prosumer persona (§1.3) and is an important product *and* architecture validation point in its own right: it specifically tests whether the available authoritative data and analytical architecture can produce a genuinely valuable acquisition-screening product, independent of whether the "existing structure" workflows scale to more complex project types. Its early position is **not** a mandate for an ambitious implementation — the initial capability stays limited to what available evidence defensibly supports: parcel characteristics, zoning, mapped constraints, preliminary buildable-area information where defensible, supported residential-use scenarios where defensible, major diligence risks, and explicit REQUIRES VERIFICATION findings (matching your original C2 answer — no manufactured precision). It architecturally reuses a *subset* of the existing-property machinery (zoning + ECA + basic buildable-area, without a specific proposed structure to place), which is part of why it's tractable this early despite its strategic weight.
4. **Fences** — simple rules, reuses most of the shed/garage pattern; low incremental engineering cost, but genuinely **low per-project value** (flag per your C3 answer if early validation shows low report value).
5. **Decks** — adds attachment-to-primary-structure and height-above-grade considerations; moderate incremental complexity.
6. **Retaining walls** — `research-findings.md` flags this as prone to heavy geotechnical/engineering-triggered UNKNOWN results; build after the REQUIRES VERIFICATION evidence/UX pattern is well-proven. Candidate for your C3 case-by-case review once early data shows how UNKNOWN-heavy it actually is.
7. **Residential additions** — higher complexity (existing nonconforming-structure handling, multiple setback categories), higher value.
8. **ADUs** — highest regulatory complexity in the set but the highest professional-persona fit and user value; the focused "deep" build once the pipeline is thoroughly proven.

**Standing instruction carried into Construction**: if implementation-level research (Application Design, Units Generation, or early Construction) surfaces a materially better ordering for genuine technical-dependency reasons (e.g., vacant-land turns out to structurally require something only built for a later type), that must be **surfaced explicitly for your approval before the sequence changes** — not silently reordered.

### 1.5 Explicit Out-of-Scope for MVP (Brief §53 — unchanged, restated for traceability)
Commercial/industrial/major-multifamily development, subdivisions, complete permit prep/submission, architectural design, engineering certification, surveying, title/legal opinions, permit guarantees, native mobile apps, multi-region architecture, Kubernetes, enterprise SSO, sophisticated org RBAC, dozens of municipalities, custom ML models.

---

## 2. Core Workflows (Brief §5–§7, refined by D1–D3)

### 2.1 Existing-Property Workflow
Address entry → parcel resolution (with disambiguation per §2.2 below) → project-type selection → project details (dimensions, height, approx. location, etc.) → authoritative data gathering → spatial + regulatory evaluation → evidence-backed preliminary report (web-primary, PDF secondary per D2). Map should communicate likely-buildable / conditionally-buildable / constrained areas where practical; non-map accessible representation is mandatory (Brief §44), not optional.

### 2.2 Property Resolution (Brief §7)
Must not assume one address = one parcel. Must handle: multiple parcels per address, parcels without conventional addresses, vacant parcels, corner lots, merged/split parcels, condo situations, malformed addresses, uncertain geocoding. **When parcel identity cannot be established with sufficient confidence, the system must ask the user for clarification rather than silently selecting a parcel.** This is a hard functional requirement, not a UX nicety — silent misidentification would put a report against the wrong parcel, which is a trust-destroying failure mode for a product whose entire value is evidentiary accuracy.

### 2.3 Vacant-Land Workflow (Brief §6, scoped by C2)
Address/parcel/identifier entry → parcel characteristics, jurisdiction, zoning, mapped constraints, preliminary buildable area/envelope (where defensible), plausible supported residential scenarios (where defensible), major diligence risks, important unknowns. Must answer "does this deserve deeper investigation?" without manufacturing false precision (per your C2 answer — no fabricated buildable-envelope numbers when evidence doesn't support them).

### 2.4 Accounts & Checkout (per D1)
Guest checkout is the baseline path (no forced account creation to purchase). Optional account creation enables report history and repeat-property analysis. Account system scope should be the minimum needed for these two capabilities — not a general-purpose user platform.

### 2.5 Report Output (per D2)
Web-based report is the primary experience (interactive, accessible, map + non-map views). PDF is a secondary, durable, portable export of the same underlying report snapshot — not a separately-authored artifact.

### 2.6 Report Re-generation / Freshness (per D3)
Each report is an immutable point-in-time snapshot (Brief §36 unchanged). Re-run/update pricing policy is explicitly deferred to pricing/economics work in Construction — not decided here. Any future re-run capability must produce a new report artifact; historical reports must never be silently modified.

---

## 3. Property Intelligence, Data, and Provenance

### 3.1 Data Sources (Brief §10, verified in `research-findings.md` §1)
Confirmed usable sources for MVP: King County Parcel/GIS (ArcGIS Hub REST/export; resale of raw data prohibited without written agreement — report product is not raw-data resale), King County Assessor data (bulk extracts; RCW 42.56.070(9) restricts commercial use of *owner-name lists* specifically — do not expose/export raw owner-name lists as a product feature), Seattle Open Data / GeoData (Socrata + ArcGIS Hub, PDDL/public-domain corroborated), Seattle zoning datasets (explicitly labeled "not an official zoning map" — must be presented as such, not as ground truth), Seattle ECA layers (liquefaction layer is 1995-vintage — surface data-currency as evidence metadata), Seattle permit data (bulk Socrata datasets since 1990 are usable; live real-time permit status via the Accela portal is **not** available — do not imply real-time permit status), FEMA NFHL (federal, public domain, digital layer is a "convenience" reference — hardcopy FIRM/FIS remains legally official), USGS 3DEP LiDAR (public domain, free).

**Not automatable for MVP**: SPU/SCL detailed utility infrastructure (easements, mains) — requires a manual licensing request with ~10 business day turnaround; must be modeled as REQUIRES VERIFICATION, never as an automated KNOWN fact.

### 3.2 Regulatory Rule Sourcing, Provenance & Risk-Based Review (Brief §14–§15; revised per user-directed research in `research-findings.md` §1.7; revised again 2026-08-19 per your E2 clarification)

Regulatory rules are **curated, not pipeline-ingested**, and rule *drafting* is AI-assisted rather than founder-manual, to keep rule-coverage velocity viable for a solo founder:

**Workflow**: authoritative primary sources (Seattle Municipal Code via Municode, human/AI-read; SDCI guidance; City Clerk/Legistar ordinance history for effective dates and amendment tracking) → **AI-assisted regulatory research** → **candidate rule package** → **risk triage** → **human verification** (founder or escalated domain professional, per tier below) → automated tests → human approval → production rule.

**AI-assisted research may**: locate potentially applicable SMC provisions, follow definitions/cross-references, locate relevant SDCI guidance and City Clerk/Legistar ordinances/amendment history, identify effective dates, identify exceptions and conditional provisions, identify potentially conflicting or ambiguous provisions, draft a structured candidate rule specification, propose citations/evidence, propose boundary/pass/fail/exception test cases, and summarize the reasoning supporting the candidate rule. **AI never has authority to activate a rule, and never unilaterally decides a rule skips escalation** — tier classification itself is a human checkpoint (see below), not an AI output taken at face value.

**Candidate rule package contents** (what AI-assisted research produces for every rule, regardless of tier): the proposed rule specification (structured, typed-logic-ready), primary-source citations (SMC section, ordinance number, effective date), the reasoning chain connecting source to rule, proposed test cases (positive/negative/boundary/exception), and a **self-assessed ambiguity/confidence flag** with a suggested tier (advisory only — see below).

**Risk-based review tiers**:

| | Tier 1 — Founder Verification | Tier 2 — Domain-Professional/Counsel Escalation |
|---|---|---|
| **Applies when** | A single, unambiguous numeric/geometric threshold is directly stated in the SMC text for a zone/use that's already well-understood; no conflicting provisions found across cross-referenced sections; no unresolved exceptions or conditional-use triggers apply; the rule pattern closely matches an already-approved analogous rule (e.g., extending an approved garage setback rule to a similar accessory-structure case); traceable to one SMC section with a confirmed Clerk/Legistar effective date | **Any one** of: undefined/ambiguous terms requiring interpretation (e.g., "substantially conforming"); multiple potentially-conflicting provisions requiring precedence judgment (e.g., base zone vs. overlay vs. critical-area overlay); a discretionary/administrative determination rather than a bright-line rule (e.g., a Director's Rule interpretation or case-by-case SDCI call); high-consequence outcome for a high-value project type (e.g., ADU unit-count eligibility, critical-area buffer reduction); intersects with critical-area/geotechnical provisions (matches the brief's own examples requiring professional interpretation, §13); a genuinely novel rule pattern with no approved analog; or the AI-assisted research's own confidence flag indicates ambiguity/conflicting sources |
| **Who verifies/approves** | Founder, against the primary sources cited in the package | Escalated Seattle land-use professional or counsel, with founder retaining final production-activation sign-off |
| **Typical velocity** | Fast — verification-of-evidence, not from-scratch research | Slower — bounded by professional availability/scheduling |

**Escalation defaults to Tier 2 when in doubt** — the AI's suggested tier is advisory; the founder confirms tier classification as an explicit first checkpoint for every candidate package, so a human — not the AI — always makes the escalation call, consistent with the brief's prohibition on AI holding activation authority.

**Rule lifecycle states** (Brief §15, refined): RESEARCHED → DRAFTED (AI produces the candidate rule package) → TRIAGED (human confirms Tier 1 or Tier 2) → SOURCE VERIFIED (founder for Tier 1; domain professional for Tier 2) → TESTED → APPROVED → ACTIVE → SUPERSEDED.

**Provenance/storage discipline (unchanged)**: never bulk-copy or store Municode's compiled/formatted/annotated text in the product; store citations, ordinance numbers, effective dates, and independently-written rule summaries only. Clerk/Legistar records remain the source of truth for rule supersession/versioning.

**Operational/economic implications** (verified, `research-findings.md` §5): Tier 2 review is a real cost, but it is a **per-rule, amortized cost** (each approved rule serves many future reports), not a per-report variable cost — it belongs with fixed/maintenance costs, not COGS. Three professional types fit different Tier 2 triggers: **land-use consultant/planner** (~$100-$250/hr, cheapest, best for standard zoning-mechanics questions) for general zoning-interpretation/process questions, **architect** (~$175-$250/hr, Seattle-specific data available) for construction-practical judgment calls (ADU/addition edge cases), and **land-use attorney** (~$200-$600/hr, or a $500-$1,500 flat "quick consult") for genuinely ambiguous legal text or discretionary/administrative determinations. Rough cost per escalated rule (1-3 hrs of professional time): **~$100-$1,800** depending on type/complexity — a one-time cost amortized across every future report that rule supports, not a threat to per-report unit economics (§9.3), but a real early-stage cash-planning item. This model also **reinforces** the project-type build order in §1.4: simpler project types (sheds, garages, fences) are more likely to be Tier-1-dominated and thus faster/cheaper to reach production, while retaining walls/additions/ADUs are more likely to trigger (costlier) Tier 2 review — the recommended sequence already front-loads the Tier-1-heavy types.

### 3.3 Normalized Property Model & Evidence Classification (Brief §12–§13)
External schemas must not leak into application logic — normalize into a stable internal `PropertyContext` model. Every property fact preserves provenance (value, source agency, dataset, source identifier, retrieval timestamp, effective date, source reference, evidence type, confidence). Every finding is classified **KNOWN** (authoritative/deterministic), **INFERRED** (defensible analytical derivation), or **REQUIRES VERIFICATION** (insufficient evidence) — these are domain-model states, not presentation labels, and missing information must never silently become a PASS.

---

## 4. Regulatory Rules Engine & Spatial Analysis

### 4.1 Rules Engine (Brief §14–§16)
Deterministic, testable, typed TypeScript logic (not an LLM at runtime, not a generic rules-engine framework unless a demonstrated need arises). Rules are jurisdiction-specific, versioned, traceable to source, associated with effective dates, testable, auditable. Full lifecycle (see §3.2 for the risk-tiered detail): RESEARCHED → DRAFTED → TRIAGED → SOURCE VERIFIED → TESTED → APPROVED → ACTIVE → SUPERSEDED (exact implementation states refined in Application Design). AI drafts candidate rules and proposes a tier; a human always confirms the tier and never delegates activation authority to AI, matching your revised E2 answer.

### 4.2 Rule Testing (Brief §16, scoped by your A3 answer)
Every rule needs positive/negative/boundary/exception tests with source references; changes are regression-tested. Fixture-based real/validated Seattle scenarios are a major test-suite component. **Property-based testing is targeted, not blanket**: applied to spatial calculations, geometry operations, regulatory rule *primitives* (the reusable computational building blocks — e.g. setback distance math, coverage percentage math), parsers/conversions, serialization round-trips, and other deterministic math/domain operations with real invariants. Full property/project *scenarios* and end-to-end regulatory rule *behavior* use fixture/example-based tests, which give clearer, more legally-traceable validation for compound regulatory logic than generated-input property tests would.

### 4.3 Spatial Analysis (Brief §17)
PostGIS as primary spatial engine: parcel containment, intersection, setbacks, distance, critical-area intersection, %-of-parcel-affected, proposed structure placement, buildable-envelope calculation, geometry validation, nearby/comparable permit search, spatial indexing. Deterministic, testable, reproducible — never delegated to LLM reasoning.

---

## 5. LLM Architecture (Brief §18–§19, grounded in `research-findings.md` §2)

### 5.1 Role & Boundaries
LLM (Anthropic Claude API) is a **non-authoritative** synthesis/explanation layer, isolated behind an internal AI service abstraction (provider/model-tier swappable without touching domain logic). Responsibilities: explain deterministic findings in plain language, synthesize the report narrative, highlight constraints, generate diligence questions/next steps, light classification/extraction. **Never**: determine regulatory compliance or spatial feasibility, override deterministic findings, invent facts/requirements, convert missing information into assumptions, present inference as fact, or interpret municipal code at runtime into regulatory conclusions. The deterministic preflight must function correctly with the LLM entirely unavailable (graceful degradation, not a partial-failure state).

### 5.2 Model Selection Strategy
Verified current lineup/pricing (2026-08-19): Haiku 4.5 ($1/$5 per MTok in/out), Sonnet 5 ($2/$10), Opus 5 ($5/$25), Fable 5 ($10/$50, rarely needed). **Finding**: LLM cost is not the binding constraint — a full report's 2-4 calls cost roughly $0.01-$0.06 (Haiku), $0.02-$0.12 (Sonnet), or $0.06-$0.31 (Opus) — 0.1%-3% of a $9.99 report even at the top tier. **Recommendation**: default to Sonnet 5 for narrative synthesis/explanation (needs real language quality, cost is immaterial), consider Haiku 4.5 for lighter classification/extraction sub-tasks. Model choice should be validated by output-quality testing during Construction, not locked in during Inception.

### 5.3 Structured Output & Reliability
Use schema-constrained output (`output_config`/strict tool-use, confirmed supported) for every LLM call whose output reaches the report — validate against schema before use, never trust free-form text as fact. Reference finding/evidence IDs in generated explanations so LLM narrative is traceable back to deterministic evidence (supports Brief §37 auditability).

### 5.4 Cost/Reliability Controls
Prompt caching (verified: 90% discount on cache reads) should cache stable system-prompt/rule-context content reused across the 2-4 calls/report. Batch API (50% discount, stacks with caching) is available for any non-realtime sub-task. Rate limits at Start tier (1,000 RPM, 2M ITPM) are ample for MVP volume. Data retention: commercial API content not used for training by default, not retained by default (confirm exact DPA language with Anthropic before finalizing any privacy commitment — see legal-questions-for-counsel.md). Timeout/retry/fallback behavior for LLM unavailability to be defined in Application/NFR Design.

---

## 6. Security (Brief §20–§27, §50–§52 — Security Baseline Extension ENABLED per A1)

All SECURITY-extension rules apply as blocking constraints through Construction (full rule file loaded per your A1 answer; enforced at NFR Requirements/NFR Design/Code Generation stages). Baseline requirements carried from the brief, restated for traceability:
- **Secrets**: never in Git, browser JS, client bundles, API responses, logs, or LLM prompts; environment config or managed secret storage; server-only secrets stay server-only.
- **Trust boundary**: all browser input untrusted; sensitive operations server-side; client never touches Postgres directly or receives LLM/Stripe/privileged credentials.
- **AuthZ**: if accounts exist (per D1), every server-side operation on user-owned data enforces ownership — never hidden-UI, client-side-only, or user-supplied-ID "protection."
- **Database security**: least-privilege roles, separated app/migration/admin credentials, encrypted connections, parameterized queries only (never concatenate untrusted input into SQL, including PostGIS queries).
- **Input validation**: runtime schema validation at every trust boundary (form input, addresses, parcel IDs, dimensions, map geometry, query/route params, uploads, third-party API responses, LLM responses) — TypeScript compile-time typing alone is insufficient.
- **API security**: authN/authZ, request validation, rate limiting, abuse prevention, request-size limits, timeouts, safe error handling (no implementation-detail leakage), idempotency, CSRF, CORS, DoS awareness.
- **LLM security**: treat LLM input/output as untrusted — prompt injection, malicious external-data content, structured-output validation, token/cost abuse, system-prompt extraction, secret exposure, cross-user leakage. An LLM refusal is not a security control. Tool-calling (if introduced) must expose narrowly scoped, authorized, validated operations only.
- **Dependency/deployment security**: maintained trusted dependencies, lockfiles, vulnerability monitoring, HTTPS/TLS everywhere, dev/staging/prod separation, least-privilege prod DB network access, secure CI/CD secret handling, no cross-environment secret reuse.
- **Security testing**: authorization tests, input validation/injection tests, secret-exposure checks, dependency scanning, rate-limit/abuse tests, cross-user access tests, webhook security tests, LLM prompt-injection/adversarial tests — scoped to what's required for MVP vs. safely deferrable, decided in NFR Requirements per unit.

---

## 7. Resiliency (Brief-adjacent — Resiliency Baseline Extension ENABLED per A2, proportionate)

Applied as **directional, design-time guidance**, not a production-readiness certification (per the extension's own framing and your A2 answer to keep it proportionate to MVP scale). Relevant areas to address in NFR Design per unit: graceful degradation on external dependency failure (GIS/government API outage, LLM outage — Brief §31/§40), retry/timeout policy for external calls, observable failure modes (Brief §41), backup/recovery proportionate to the fact that paid reports have real business/customer value (Brief §49) without enterprise-scale overengineering. Explicitly avoid: multi-region architecture, complex distributed systems, infrastructure introduced without a demonstrated MVP requirement (Brief §9, §53).

---

## 8. Testing Strategy (Brief §16, §52, PBT extension per A3)

- **Fixture-based scenario tests**: primary validation method for regulatory rule behavior and complete property/project scenarios, ideally against real or independently-validated Seattle cases (ties directly to the pre-construction validation in §11 below).
- **Property-based tests**: scoped per A3 — spatial/geometry calculations, rule primitives, parsers/conversions, serialization round-trips, boundary math.
- **Security tests**: per §6 above, scoped per unit in NFR Requirements.
- **Regression discipline**: every rule change is regression-tested against its full fixture set before approval.

---

## 9. Payments & Unit Economics (Brief §28–§35, grounded in `research-findings.md` §3)

### 9.1 Payment Architecture (Brief §28–§30, unchanged)
Stripe Checkout Session (server-created) or equivalent minimizing cardholder-data exposure; no raw card data stored/processed by the application. Flow: configure report → pending order → Checkout Session → customer pays → signed webhook → server verifies webhook → order PAID → report generation authorized → report generated → purchaser gets access. Browser redirect is never authoritative proof of payment; price is server-determined/validated, never client-supplied. Orders, reports, and payments are separate domain concepts; order lifecycle (PENDING/PAID/GENERATING/COMPLETE/FAILED/REFUNDED or similar) refined in Application Design.

### 9.2 Report Generation Failure Handling (Brief §31; refined during User Stories, 2026-08-19)
Must be explicitly designed (Application/NFR Design): retry policy, recovery, user communication, partial-report policy, minimum evidence bar for a valid paid report, refund behavior (automatic vs. manual), support escalation. A successful payment must never leave a customer in an undefined state — this is a hard requirement, not a nice-to-have.

**Addition**: this requirement should be satisfied proactively as well as reactively — a low-cost pre-payment readiness check (confirming the parcel resolved, the requested workflow/project type is currently supported, required inputs are valid, and no already-known system/data condition makes generation impossible) should run before Checkout is offered, so payment is never knowingly accepted for an unfulfillable request. This does not replace post-payment failure handling above (a readiness pass is not a generation guarantee) — it reduces the population of failures that handling has to cover. See `aidlc-docs/inception/user-stories/stories.md` PO-0.

### 9.3 Unit Economics (verified, `research-findings.md` §3)
Stripe fee: 2.9% + $0.30 (~$0.59 on a $9.99 report). Infrastructure (hosting, DB, geocoding, tiles, storage, monitoring) COGS: ~$20.59 at 1 report/month down to ~$0.60-0.70/report at 1,000-10,000/month, driven mostly by fixed costs amortizing. LLM cost: $0.01-$0.31/report. **Combined COGS at meaningful volume (~1,000+ reports/month) is roughly $1.20-$1.30/report against $9.99 revenue — comfortable gross margin (~87-88%) at every modeled volume.** The real, uncounted cost is human regulatory-research time (§3.2), which doesn't appear in per-report COGS but is a genuine ongoing cost, especially for a solo founder (per E1/E2). **Biggest quantified uncertainty**: PDF-generation compute cost if rendered via headless Chromium in serverless functions — unmeasured, could add up to ~$0.20+/report at high volume; recommend measuring directly once a PDF approach is chosen rather than assuming.

### 9.4 Pricing (per D4 — full latitude granted)
$9.99 is **not threatened by infrastructure or LLM cost** at any modeled volume — the economics support keeping it, raising it, or introducing tiers. Given your D4 answer ("avoid introducing pricing complexity merely because it is possible"), and that comparable professional tools (DeepBlocks, Zoneomics) price 10-500x higher for adjacent value, the recommendation for MVP is: **keep a single ~$9.99-$14.99 report price for launch simplicity**, revisit tiering (lightweight vs. full vs. vacant-land-specific vs. professional/bulk) only after the pre-construction validation (§11) and early real usage data show actual willingness-to-pay by persona — not speculatively now. This is a lighter-weight recommendation than the persona/sequencing ones above (pricing precision isn't achievable pre-launch regardless) and doesn't require separate approval, but flag if you want a different stance.

---

## 10. Observability, Analytics, Privacy, Accessibility, Mobile (Brief §41-§45)

- **Logging/observability**: structured logs, no secrets/credentials/unnecessary PII; observe API failures, GIS/data-source failures, report generation, rule evaluation, LLM calls, payment events, security events, source freshness, report cost, latency.
- **Product analytics**: minimum funnel — address entered → parcel resolved → project configured → preview displayed → checkout started → payment completed → report generated → report viewed. Metrics: parcel-resolution success rate, checkout conversion, generation failure rate/duration, report cost, project-type demand, UNKNOWN frequency, abandonment, repeat professional usage (directly validates/invalidates the persona recommendation in §1.3).
- **Privacy**: minimize personal-data collection; define retention/deletion including account deletion; do not send data to the LLM merely because it's available — only what's necessary for synthesis.
- **Accessibility**: MVP architectural concern, not deferred. Map must never be the sole means of understanding a result — every important finding needs an accessible non-map representation. WCAG guidance applies during implementation.
- **Mobile**: core workflow (including on-site use while standing on a property) must function on mobile — no desktop-only essential functionality.

---

## 11. Pre-Construction Validation (Brief §56, scoped by your E3 answer)

A **human-in-the-loop unit of work**, executed before substantial application Construction, using spreadsheets/scripts/manual research/GIS tools rather than the application itself. Approximately 10 real Seattle properties, mixed: normal developed residential, constrained parcels, vacant parcels, multiple supported project scenarios (favoring the recommended first project types in §1.4). Validates: data completeness, property-resolution feasibility, rule coverage, spatial-analysis feasibility, UNKNOWN frequency/severity, report usefulness, professional/user feedback, willingness to pay, approximate generation cost, and — per your explicit instruction — **whether the product can deliver enough value to justify building the full MVP at all**. This is a genuine go/no-go gate, not a formality; a fundamental problem surfaced here must be reported before Construction proceeds, per Brief §58.

---

## 12. Admin Tooling, Support, Backups (Brief §46-§47, §49 — lightweight, proportionate)

Minimal internal tooling to inspect reports/evidence/rule versions/source failures/generation failures/payment state, issue refunds, disable problematic rules, mark sources unhealthy — sized for a solo operator, not an enterprise admin platform, but sufficient that production behavior is diagnosable without raw database queries. Customer support process (Brief §47) — minimal defined process for correction requests, regulatory-error reports, refunds, escalation, documented known issues — to be defined in Application Design. Backups/DR (Brief §49) proportionate to the fact that paid reports have real business value once customers exist.

---

## 13. Legal & Compliance (Brief §48, §11 — see separate artifact)

Per your E5 answer, a dedicated **[legal-questions-for-counsel.md](legal-questions-for-counsel.md)** artifact has been created listing items requiring professional legal review before public launch. Inception/Construction planning proceeds in parallel with arranging counsel; AI-generated analysis in this document and its companion research is explicitly not a substitute for that review.

---

## 14. Team & Process Constraints (per E1, E4, revised E2)

Solo developer/founder, no hard timeline or budget ceiling. Workflow Planning and Units Generation should favor a clear sequential Construction path, right-sized units of work, high automation, and low ongoing operational burden — not an architecture optimized for a large team. Material costs, unexpectedly expensive dependencies, or high-ongoing-operational-expense architectural choices should continue to be flagged as they're discovered, not just at Inception.

Regulatory rule authoring specifically is AI-assisted (§3.2), not founder-manual-from-scratch — this was an explicit correction to the original E2 answer once its rule-coverage-velocity implication was identified. Tier 2 (domain-professional/counsel) review should be planned as an occasional, as-needed paid-consultation cost — a maintenance/fixed cost category, not a per-report COGS item — roughly $100-$1,800 per escalated rule depending on professional type (§3.2, `research-findings.md` §5), budgeted for once specific rules requiring escalation are identified during the pre-construction validation (§11) or early rule-authoring work.

---

## 15. Risks & Open Items Carried Forward

1. ~~Persona and project-type-order recommendations require approval~~ — **RESOLVED**: both approved 2026-08-19 (persona with the professional-first-but-not-enterprise clarification in §1.3; project-type order with vacant-land moved to position 3, per §1.4). A standing instruction to surface any materially-better technical-dependency-driven reordering before changing it (rather than silently reordering) carries forward into Construction.
2. **Rule-coverage velocity** (§3.2, §14) is now bounded by founder verification bandwidth (Tier 1) and domain-professional availability/cost (Tier 2, ~$100-$1,800/rule, verified per `research-findings.md` §5) rather than from-scratch founder research — a real improvement over the original E2 answer. **Updated 2026-08-19 per Unit 0B Track 2** (`construction/unit-0-pre-construction-validation/unit-0b-findings.md`): actual Tier 2 volume is no longer fully unknown — an empirical 5-rule sample (1 shed + 4 garage rules, real SMC research) came back **80% Tier 2**, including cases where two code subsections independently govern the same fact pattern with no stated precedence. Plan Tier 2 as the *default* outcome for early rules, not the exception, and budget professional-review cost as a recurring line item across most rules, not an occasional one. Blended research effort measured at ~35-40 minutes/rule once basic chapter navigation is familiar — retrieval speed improves with practice, but the underlying legal-judgment time does not.
3. **Municode clickwrap-terms nuance** (research-findings.md §1.7) — narrow, not fully settled by case law, flagged for counsel, not a blocker.
4. **PDF-generation compute cost** (§9.3) is an unmeasured cost uncertainty — measure directly once an approach is chosen.
5. **SPU utility data has no automated access path** (§3.1) — must remain REQUIRES VERIFICATION in the evidence model for MVP; do not silently promote to KNOWN later without re-verifying the access situation.
6. **Retaining walls and additions are candidates for heavy-UNKNOWN reports** (§1.4) — subject to your C3 case-by-case review once early data exists.
7. **Extension process load vs. solo capacity** (§14) — will be actively right-sized in Workflow Planning, not ignored.

None of these are blocking — they are carried forward as live risks to revisit at the appropriate later gate, per Brief §58's instruction not to silently engineer around findings.
