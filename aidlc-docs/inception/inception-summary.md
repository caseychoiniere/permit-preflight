# Permit Preflight — Inception Summary (Final Approval Gate)

**Purpose**: Per the governing brief §59, this consolidates everything produced during Inception
into one summary for your final review before Construction begins. Every section links to the
full underlying artifact rather than restating it — this document is a synthesis, not a
replacement for the detailed artifacts, all of which have already been individually reviewed and
approved by you.

**Status**: All Inception stages complete and approved (Workspace Detection, Requirements
Analysis, User Stories, Workflow Planning, Application Design, Units Generation). This summary
itself requires your explicit approval before Construction begins — no code has been written, no
application has been scaffolded, and no infrastructure has been provisioned.

---

## 1. Proposed Product Scope

Seattle-first residential buildability screening across 8 project types (sheds, detached garages,
fences, decks, retaining walls, residential additions, ADUs, vacant-land screening), producing
evidence-backed preliminary reports classified KNOWN / INFERRED / REQUIRES VERIFICATION — never
silently converting missing information into a pass. Explicitly a screening/early-diligence tool,
not a permit guarantee or professional-service substitute.
→ Full detail: [`requirements.md`](requirements/requirements.md) §1-§2

## 2. Recommended Initial Customer

**Approved**: professional/repeat property evaluators (small residential developers, investors,
builders) as the primary design-prioritization target — driven by purchase frequency, willingness
to pay, and CAC feasibility via professional channels — while keeping the core experience fully
usable by homeowners/prospective buyers as first-class secondary users, not a degraded
enterprise-first UX.
→ Full reasoning and evaluation-criteria table: [`requirements.md`](requirements/requirements.md) §1.3

## 3. Major Architectural Decisions

- **Modular monolith**: Next.js/TypeScript, PostgreSQL+PostGIS, no microservices/Kubernetes/message
  queues unless demonstrated need arises.
- **16 components, 6 orchestration services**, with every one of 9 core architectural invariants
  (deterministic-vs-LLM boundary, PropertyContext/evidence, PostGIS as spatial source of truth,
  rule versioning/Tier 1-2 governance, report immutability, payment-authorization boundary,
  security/trust boundaries, component responsibilities, failure/source-health concepts) mapped to
  a specific structural enforcement point, not just documented convention.
- **Single-authoritative-owner discipline**: 8 previously-ambiguous state/concern boundaries
  (screening-request state, payment state, generation-job state, report-artifact state,
  report-access authorization, property fact/evidence quality, regulatory finding classification,
  regulatory source acquisition) each now have exactly one owning component — this was tightened
  through two rounds of your architecture review.
- **Asynchronous, durable, queue-free report generation**: payment authorization and report
  generation are separate state transitions (Order & Payment vs. Report Generation Job), resolving
  an architectural question the original brief explicitly left open (§40) and Requirements Analysis
  had not yet settled.
→ Full detail: [`application-design/application-design.md`](application-design/application-design.md)

## 4. Datasets and Sources

**Identified during Inception as available and plausibly usable for the MVP, subject to
real-property/access/data-completeness validation in Unit 0** — not confirmed production-ready.
Desk research found: King County Parcel/GIS (ArcGIS REST/export — license terms verified, exact
API/format specifics for the parcel layer itself unverified this session), King County Assessor
(bulk extracts, RCW-restricted owner-name handling — format/cadence/cost unverified), Seattle Open
Data/GeoData (Socrata — API verified, full Terms-of-Use text not independently read), Seattle
zoning/ECA layers (existence verified, explicitly labeled "not an official zoning map" by its own
publisher; the ECA liquefaction layer is a verified 1995-vintage derived product — both caveats
must be surfaced to users, not treated as settled ground truth), Seattle permit bulk data
(historical only, verified API; no live-status API found), FEMA NFHL (verified directly), USGS
3DEP LiDAR (public-domain/no-cost licensing verified directly; **King County/Seattle-specific
tile-level coverage was assessed as plausible but not individually confirmed** — this lower-confidence
distinction is preserved from research-findings.md rather than upgraded). Regulatory rule text sourced from Municode (human-read reference) +
City Clerk/Legistar (ordinance-level change-tracking provenance) — not bulk-ingested.
→ Full detail, including per-source confidence levels: [`research-findings.md`](requirements/research-findings.md) §1

## 5. Licensing Findings

Inception research identified no obvious licensing issue that currently blocks continued product
development. The planned architecture avoids resale of raw restricted datasets and avoids bulk
reproduction of Municode's compiled presentation, instead using independently written regulatory
rule specifications with citations/provenance. Specific findings preserved: King County data
permits use with a "no resale" restriction (a reselling-the-raw-dataset concern, distinct from
using it as an input to a synthesized report); Assessor owner-name data carries a narrow RCW
anti-marketing-list restriction (handled by never exposing raw owner-name lists); Municode's
clickwrap terms govern their compiled platform content, and the underlying law itself is not
copyrightable under the government edicts doctrine (*Georgia v. Public.Resource.Org*, 2020) — with
one narrower, not-fully-settled nuance about a private codifier's contractual terms specifically
flagged for counsel (see §16 below and the legal-questions artifact). **Commercial-use,
contractual, and licensing assumptions throughout this section are engineering/research
conclusions, not legal approval, and remain subject to counsel review before public launch.**
→ Full detail: [`research-findings.md`](requirements/research-findings.md) §1.7, §4

## 6. Important Data Gaps

- SPU/SCL detailed utility infrastructure has no automated access path — modeled as REQUIRES
  VERIFICATION for MVP, not an automated KNOWN fact.
- Live real-time Seattle permit status has no public API — only historical bulk data.
- **No desk-research dataset gap was identified as an obvious blocker to continued validation.
  Actual sufficiency across real Seattle properties has not yet been established and is a core
  Unit 0 question** — this summary does not pre-answer the GO/PIVOT/NO-GO experiment Unit 0 exists
  to perform.
→ Full detail: [`research-findings.md`](requirements/research-findings.md) §5

## 7. Regulatory Architecture

Curated, not pipeline-ingested. Risk-based rule review: **Tier 1** (founder verification — single
unambiguous thresholds, no conflicts, matches an approved analog) vs. **Tier 2** (escalate to a
land-use consultant/architect/attorney — ambiguous terms, conflicting provisions, discretionary
determinations, high-consequence outcomes, critical-area intersections, novel patterns), defaulting
to Tier 2 when in doubt, with the founder always confirming the tier — AI is structurally
incapable of self-triaging or self-activating a rule. Full lifecycle: RESEARCHED → DRAFTED →
TRIAGED → SOURCE VERIFIED → TESTED → APPROVED → ACTIVE → SUPERSEDED.
→ Full detail: [`requirements.md`](requirements/requirements.md) §3.2, §4.1

## 8. LLM Architecture

Anthropic Claude API, isolated behind an AI Service/Provider Adapter with two separate,
narrowly-scoped use-case modules: **Report Explanation** (structurally can only consume
already-finalized deterministic findings — cannot alter or derive conclusions) and **Rule Research
Assistant** (higher latitude, but output is always unapproved candidate material subject to full
human triage). Schema-constrained structured output validated before use. Sonnet 5 recommended
default for narrative synthesis; cost is immaterial (~$0.01-$0.31/report even at the top tier) —
model choice should be validated by output quality, not cost.
→ Full detail: [`requirements.md`](requirements/requirements.md) §5; [`research-findings.md`](requirements/research-findings.md) §2

## 9. Security Architecture

Security Baseline extension enforced as a blocking constraint throughout Construction (your
explicit opt-in). Secrets never reach the client; every trust boundary gets runtime schema
validation; ownership enforcement is server-side by construction (`authorizeReportAccess` is the
single mandatory boundary for all report retrieval, authenticated or guest-link); parameterized
queries only; least-privilege database roles; LLM input/output treated as untrusted.
→ Full detail: [`requirements.md`](requirements/requirements.md) §6

## 10. Payment Architecture

Stripe Checkout, server-determined price only, webhook-signature-verified, idempotent PAID
transition. **Payment state and report-generation state are two independent, single-owner state
machines** (Order & Payment vs. Report Generation Job) crossing at exactly one point (job creation
after verified payment) — this was a specific correction made during your Application Design
review to prevent the two from silently drifting apart. A pre-payment readiness check (PO-0)
prevents charging for a request already known to be unfulfillable, without running the paid
evaluation pipeline before payment.
→ Full detail: [`requirements.md`](requirements/requirements.md) §9.1-§9.2; [`application-design/component-dependency.md`](application-design/component-dependency.md)

## 11. Estimated Unit Economics

**Corrected 2026-08-19** — the previous version of this section arithmetically double-counted and
mischaracterized the underlying figures from research-findings.md §3. Reconciled here:

- **Non-LLM (infrastructure/payment/storage/etc.) modeled cost**: ~$20.59/report at 1 report/month,
  falling to **~$0.60-$0.70/report at 1,000-10,000 reports/month** as fixed costs amortize (Stripe's
  2.9%+$0.30 fee dominates the variable-cost floor at that volume).
- **LLM modeled cost**: ~$0.01-$0.31/report, depending on model tier — **relatively modest** rather
  than negligible: the upper estimate ($0.31) is material relative to the modeled $0.60-$0.70
  non-LLM cost, not a rounding error against it.
- **Combined currently modeled range at meaningful volume**: **~$0.61-$1.01/report**
  ($0.60 non-LLM low + $0.01 LLM low, to $0.70 non-LLM high + $0.31 LLM high) — **before** the
  unresolved PDF-rendering compute cost and other unmodeled operational variance.
- **These are planning/model estimates from desk research, not validated production COGS.** They
  have not been measured against a real, running system, and the PDF-rendering gap in particular
  means the true figure could land meaningfully higher than $1.01/report.

Tier 2 regulatory-rule review adds a separate, real but bounded, amortized (not per-report) cost:
~$100-$1,800 per escalated rule depending on professional type — a maintenance-cost planning
figure, also not yet validated against actual rule-authoring volume.

**Directional read**: even the corrected, wider range remains small relative to any hypothesized
report price, so cost does not currently appear to threaten viability — but this is a modeled
estimate to be tested, not a confirmed margin.
→ Full detail: [`research-findings.md`](requirements/research-findings.md) §3, §5

## 12. Pricing Recommendation

**Corrected 2026-08-19** — the previous version of this section ("not threatened by cost at any
modeled volume") directly contradicted Section 11, which models the 1-report/month case at
~$20.59/report. Corrected: **at meaningful report volume, the currently modeled cost structure does
not appear to threaten a $9.99 price hypothesis. Very-low-volume economics are dominated by
fixed-cost amortization (for example, the modeled 1-report/month case exceeds $9.99/report), so
this should not be interpreted as positive unit margin at every modeled volume.**

Per your approved D4 answer, full latitude was granted to recommend pricing structure; the
recommendation remains to **launch with a single, simple, server-configured report price** (not
hard-coded as $9.99 in any build artifact) and **validate the actual price through Unit 0 and
early real-customer evidence** rather than tiering speculatively now.
→ Full detail: [`requirements.md`](requirements/requirements.md) §9.4

## 13. Validation Plan

**Unit 0: Pre-Construction Validation** — ~10 real Seattle properties, human-in-the-loop
(scripts/spreadsheets/manual research/GIS tools, no production application required), evaluating
data completeness, rule coverage, UNKNOWN frequency, report usefulness, willingness to pay, and
approximate cost. Produces an explicit **GO / PIVOT / NO-GO** decision that gates all subsequent
Construction. This has not yet been executed — it is the next step after this summary is approved.
→ Full detail: [`requirements.md`](requirements/requirements.md) §11; [`execution-plan.md`](plans/execution-plan.md)

## 14. Proposed Units of Work

12 units (Unit 0 + 11 production units), organized as vertical delivery capabilities:

| Unit | Delivers | Hard dependencies |
|---|---|---|
| 0 | Pre-Construction Validation | None |
| 1 | Deterministic Evaluation Foundation (Sheds) | Unit 0 = GO |
| 2 | Purchasable Shed Report (first real product) | Unit 1 |
| 3 | Minimum Paid-Product Operations | Unit 2 |
| 4 | Detached Garages | Unit 2, Unit 3 |
| 5 | Vacant-Land Screening | Unit 2, Unit 3 |
| 6 | Optional Accounts | Unit 2, Unit 3 |
| 7 | Fences | Unit 2, Unit 3 |
| 8 | Decks | Unit 2, Unit 3 |
| 9 | Retaining Walls (+ deferred complaint-investigation tooling) | Unit 2, Unit 3 |
| 10 | Residential Additions | Unit 2, Unit 3 |
| 11 | ADUs | Unit 2, Unit 3 |

All 54 approved user stories are mapped to exactly one unit, verified twice.
→ Full detail: [`unit-of-work.md`](application-design/unit-of-work.md), [`unit-of-work-story-map.md`](application-design/unit-of-work-story-map.md)

## 15. Implementation Order

Sequential (solo developer): 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 — preserving your
approved project-type sequence (sheds → garages → vacant-land → fences → decks → retaining walls
→ additions → ADUs) exactly, with Unit 3 (operational safety) and Unit 6 (accounts) inserted at
the positions you directed. No technical dependency was found forcing any different order among
the project-type units themselves.
→ Full detail: [`unit-of-work-dependency.md`](application-design/unit-of-work-dependency.md)

## 16. Major Risks (Carried Forward)

1. **Rule-coverage velocity** is bounded by founder verification bandwidth (Tier 1) and
   domain-professional availability/cost (Tier 2, ~$100-$1,800/rule) — not engineering throughput.
2. **PDF-generation compute cost** is unmeasured — flagged, to be measured directly in Construction.
3. **Retaining walls and additions** are candidates for heavy-UNKNOWN reports — subject to your
   approved case-by-case review once real data exists.
4. **No direct paid consumer competitor found** at the $9.99/Seattle-homeowner segment — genuine
   open question (white space vs. unproven demand), mitigated by prioritizing the professional
   persona and by Unit 0's validation gate before scaling investment.
5. **Total Tier 2 rule-escalation volume is unknown** until real rule-authoring begins (cost per
   escalation is known; total exposure is not).
→ Full detail: [`requirements.md`](requirements/requirements.md) §15

## 17. Unresolved Questions / Decisions Requiring Human Approval Beyond This Gate

1. **Unit 0's actual GO / PIVOT / NO-GO outcome** — not yet run. This is the next concrete step.
2. **Legal counsel review** — not yet arranged; a dedicated question list exists and should be
   engaged before public launch, not before Construction starts (per your E5 answer).
   → [`legal-questions-for-counsel.md`](requirements/legal-questions-for-counsel.md)
3. **Exact PDF rendering approach** (and its real cost) — deferred to Construction per Application
   Design's scope guidance.
4. **Hosting/infrastructure provider selection** — deferred to Construction (Infrastructure Design,
   per-unit).
5. **Final pricing number/structure** — deliberately left open, to be informed by Unit 0 and early
   real usage.

## 18. What Happens Next

If you approve this summary, the very next concrete action is **Unit 0: Pre-Construction
Validation** — not application scaffolding, not `npm install`, not a database. Unit 0 is explicitly
designed to not require the production application to exist. Its own GO/PIVOT/NO-GO outcome is a
separate decision point from this one; approving this summary authorizes *proceeding toward*
Construction via Unit 0, not skipping Unit 0 or beginning Units 1-11's actual code.

---

## Explicit Approval Requested

Per the governing brief's implementation gate (§59) and the Unit 0 gate (execution-plan.md),
Construction — including Unit 0 — does not begin until you explicitly approve this summary.
