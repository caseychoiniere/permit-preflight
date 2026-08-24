# Permit Preflight — User Stories

**Organization**: Domain-Based epics (approved, Question 2). Persona-to-story mapping is the
secondary view (table at the end) rather than duplicating stories per persona.
**Acceptance criteria format**: Hybrid (approved, Question 3) — Given/When/Then for property
resolution, spatial/regulatory evaluation, evidence classification, rule lifecycle/governance,
payments/order-state, authorization, report-generation failure/recovery, and important
customer-facing workflows; plain bullets for lower-risk administrative/project-configuration
behavior.
**Traceability**: Each story cites the `requirements.md` section(s) it derives from.
**INVEST**: Every story below was checked for Independent, Negotiable, Valuable, Estimable, Small,
Testable — see the `INVEST Verification` note at the end of each epic.

**Revision log**: 2026-08-19 — 6 targeted revisions per user review: ACC-2 (guest-linking requires
proof of control, not email match), added PO-0 (pre-payment readiness check), VL-5 (deterministic
assessment with LLM-explains-only framing), RRAG-1 (clarified permitted-access sourcing, not
scraping), PO-5 (decoupled refund from a hard-coded access policy), and a story-count correction.
**Current total: 54 stories** (was 53 before PO-0 was added) across 8 epics: Property Resolution
(5), Project Configuration (3), Spatial/Regulatory Evaluation (13: 1 shared + 7 project-type +
5 vacant-land), Report Generation & Delivery (6), Payment & Orders (6, incl. PO-0), Accounts (4),
Regulatory Rule Authoring & Governance (8), Admin/Support (9).

---

## Epic 1: Property Resolution
*(requirements.md §2.2 — Brief §7)*

### PR-1: Resolve an address to a single confident parcel
As a **Professional or Homeowner** user, I want to enter a property address and have the system
resolve it to the correct parcel, so that all subsequent evaluation is against the right property.

```
Given a user enters a well-formed Seattle address that maps to exactly one parcel with high geocoding confidence
When the system resolves the address
Then the system identifies the single matching parcel and proceeds without asking the user to disambiguate
And the resolved parcel's source, retrieval timestamp, and confidence are recorded as provenance
```

### PR-2: Ask for clarification when parcel identity is ambiguous
As a **Professional or Homeowner** user, I want the system to ask me to clarify when it cannot
confidently identify my parcel, so that my report is never generated against the wrong property.

```
Given an entered address matches multiple candidate parcels, or maps to a parcel without a conventional address, or produces low-confidence geocoding
When the system attempts resolution
Then the system does NOT silently select a parcel
And the system presents the candidate parcels (or a map-based selection) and asks the user to confirm the correct one
And no evaluation proceeds until the user confirms
```

### PR-3: Handle an address/identifier with no matching parcel
As a **Professional or Homeowner** user, I want a clear explanation when my address or identifier
doesn't resolve to any parcel, so that I understand why I can't proceed and what to try instead.

```
Given an entered address or parcel identifier does not match any known parcel
When the system attempts resolution
Then the system explains that no matching parcel was found
And the system suggests corrective actions (check spelling, try a parcel number, try a nearby address)
And no charge or evaluation is attempted
```

### PR-4: Resolve a parcel directly via parcel ID or other supported identifier
As a **Professional** user, I want to enter a King County parcel number (or other supported
identifier) directly instead of an address, so that I can screen parcels I already have identifiers
for, including vacant parcels without conventional addresses.

```
Given a user enters a valid King County parcel identifier
When the system resolves the identifier
Then the system identifies the matching parcel with the same provenance/confidence recording as address-based resolution
And this path is available for both existing-property and vacant-land workflows
```

### PR-5: Handle corner lots, merged/split parcels, and condominium situations
As a **Professional or Homeowner** user, I want the system to correctly represent unusual parcel
situations (corner lots, merged/split parcels, condo units), so that my evaluation reflects the
actual property rather than a simplified or wrong assumption.

```
Given a resolved parcel is a corner lot, a merged/split parcel, or associated with a condominium regime
When the system presents the resolved parcel
Then the system surfaces the relevant parcel characteristic explicitly (not silently, e.g. flags "corner lot" affecting setback rules)
And downstream spatial/regulatory evaluation accounts for the characteristic or explicitly marks affected findings as REQUIRES VERIFICATION if it cannot
```

**INVEST verification**: Each story is independently testable against a specific parcel-resolution scenario, deliverable without dependency on later epics, and sized to a single resolution behavior. Confirmed.

---

## Epic 2: Project Configuration
*(requirements.md §1.4, §2.1)*

### PC-1: Select a project type for an existing property
As a **Professional or Homeowner** user, I want to choose from the supported project types for my
resolved property, so that I get an evaluation relevant to what I actually want to build.

- Available project types reflect current production coverage per the approved sequence (requirements.md §1.4); a project type not yet built is not offered, not shown as a broken/error option.
- The selection step is a distinct, revisitable step (user can go back and pick a different type).
- Vacant-land parcels are routed to the distinct vacant-land journey (Epic 3, Vacant-Land cluster) rather than this project-type selector.

### PC-2: Provide project-specific details for the selected project type
As a **Professional or Homeowner** user, I want to provide the details relevant to my project
(dimensions, height, approximate location on the parcel, and other project-specific inputs), so
that the evaluation is based on my actual proposal.

- Required fields are specific to the selected project type (a shed asks for different details than an ADU).
- All input is validated at the server (runtime schema validation, requirements.md §6) regardless of client-side validation.
- The user can indicate approximate placement on the parcel where relevant (supports the map-based placement experience, requirements.md §2.1).
- Malformed or out-of-range input (e.g., negative dimensions) is rejected with a clear, specific error before submission proceeds.

### PC-3: Save and resume an in-progress project configuration
As a **Professional** user, I want to save an in-progress configuration and resume it later, so
that I can evaluate multiple properties without losing partially-entered work.

- Available to authenticated users (ties to Epic 6, Accounts); guest users may lose in-progress state on session end, which is an acceptable MVP trade-off (not a hard requirement for guest mode).
- Saved state does not carry a payment obligation — configuring is free, only report generation is paid.

**INVEST verification**: PC-1/PC-2 are small, independently testable, and valuable on their own (a user can configure a project without yet paying). PC-3 is explicitly lower-priority/negotiable — flagged as a candidate for deferral during Workflow Planning if it doesn't fit the approved build sequence's early scope. Confirmed.

---

## Epic 3: Spatial/Regulatory Evaluation
*(requirements.md §1.4, §4, Brief §17)*

### SRE-0: Evidence classification applies consistently to every finding
As a **Professional or Homeowner** user, I want every finding in my evaluation to be labeled
KNOWN, INFERRED, or REQUIRES VERIFICATION, so that I can trust the report never presents an
unsupported conclusion as fact.

```
Given the system evaluates any spatial or regulatory constraint for any project type
When a finding is produced
Then the finding is classified as KNOWN, INFERRED, or REQUIRES VERIFICATION per requirements.md §3.3
And missing or insufficient evidence never silently becomes a PASS
And each finding records its supporting evidence (source, dataset, retrieval timestamp, rule version where applicable)
```

*(This story's acceptance criteria apply to every project-type story below — it is not repeated in each one to avoid duplication, per the approved tiered granularity decision.)*

### SRE-SHED-1: Evaluate shed/accessory-structure buildability
As a **Professional or Homeowner** user, I want my proposed shed or small accessory structure
evaluated against applicable setback, height, lot-coverage, and critical-area constraints, so
that I know whether it's likely buildable before I spend money on permitting.

```
Given a resolved parcel and a configured shed/accessory-structure project
When the system evaluates the proposal
Then setback, height, and lot-coverage constraints are evaluated using PostGIS spatial calculations against the parcel geometry
And applicable Seattle Municipal Code accessory-structure rules (production-approved, per Epic 7) are applied
And Environmentally Critical Area intersection is checked and surfaced with its data-currency caveat where relevant (research-findings.md §1.5)
And the result includes a clear likely-buildable / conditionally-buildable / constrained classification per finding
```

### SRE-GARAGE-1: Evaluate detached garage buildability
As a **Professional or Homeowner** user, I want my proposed detached garage evaluated against
setback, height, and lot-coverage-percentage constraints, so that I understand its buildability
before investing further.

```
Given a resolved parcel and a configured detached-garage project
When the system evaluates the proposal
Then setback and height constraints are evaluated as in SRE-SHED-1
And lot-coverage-percentage is calculated using the garage footprint plus any existing structures on the parcel
And the result reflects the same likely-buildable / conditionally-buildable / constrained classification
```

### SRE-FENCE-1: Evaluate fence buildability
As a **Homeowner or Professional** user, I want my proposed fence evaluated against applicable
height and location rules, so that I know if it requires special review before I build it.

```
Given a resolved parcel and a configured fence project
When the system evaluates the proposal
Then height-by-location rules (e.g., different limits for front vs. side/rear yards, corner-lot sight-distance rules per PR-5) are applied
And the result reflects the likely-buildable / conditionally-buildable / constrained classification
```

### SRE-DECK-1: Evaluate deck buildability
As a **Professional or Homeowner** user, I want my proposed deck evaluated against setback and
height-above-grade rules, including its attachment to an existing structure, so that I understand
its buildability.

```
Given a resolved parcel, existing-structure information, and a configured deck project
When the system evaluates the proposal
Then setback rules specific to attached/detached decks and height-above-grade thresholds are applied
And the result reflects the likely-buildable / conditionally-buildable / constrained classification
```

### SRE-WALL-1: Evaluate retaining wall buildability with explicit UNKNOWN tolerance
As a **Professional or Homeowner** user, I want my proposed retaining wall evaluated against
applicable rules, with clear REQUIRES VERIFICATION flags where geotechnical/engineering review is
needed, so that I get genuine screening value even though this project type often can't be fully
resolved by available data (research-findings.md, flagged risk).

```
Given a resolved parcel and a configured retaining-wall project
When the system evaluates the proposal
Then height and location rules that ARE deterministically knowable are evaluated and classified normally
And triggers for geotechnical/engineering review (e.g., height thresholds, slope conditions) are explicitly classified REQUIRES VERIFICATION rather than guessed at
And the report clearly explains what professional review is needed and why, rather than presenting an incomplete answer as complete
```

### SRE-ADD-1: Evaluate residential addition buildability
As a **Professional or Homeowner** user, I want my proposed addition evaluated against setback,
height, lot-coverage, and existing-nonconforming-structure considerations, so that I understand
buildability for a more complex project.

```
Given a resolved parcel, existing-structure information, and a configured addition project
When the system evaluates the proposal
Then setback, height, and lot-coverage constraints account for the existing structure's footprint and any nonconforming status
And multiple applicable setback categories (if the addition affects different yard types) are each evaluated and reported
And the result reflects the likely-buildable / conditionally-buildable / constrained classification per affected constraint
```

### SRE-ADU-1: Evaluate ADU buildability
As a **Professional** user (primary fit), I want my proposed ADU evaluated against Seattle's
ADU/DADU-specific rules (unit-count limits, parking exceptions, size/height by lot type, and
owner-occupancy-related considerations where determinable), so that I can assess feasibility for
a high-value project type.

```
Given a resolved parcel and a configured ADU project
When the system evaluates the proposal
Then applicable ADU/DADU-specific production rules (unit count, parking, size/height by lot configuration) are evaluated
And any consideration the system cannot deterministically resolve (e.g., a condition dependent on facts not captured in available data) is classified REQUIRES VERIFICATION rather than assumed favorable or unfavorable
And the result reflects the likely-buildable / conditionally-buildable / constrained classification per constraint
```

### Vacant-Land Screening cluster
*(Distinct customer journey per approved Question 7 — reuses Property Resolution, Payment, Accounts, and Report Delivery epics; does NOT use Project Configuration's proposed-structure concepts)*

### VL-1: Enter vacant-land screening directly from a resolved parcel
As a **Professional or Homeowner** user, I want to enter vacant-land screening directly after
resolving a parcel (address, parcel ID, or other identifier), without being asked to configure a
specific proposed structure, so that the workflow matches how I actually think about a vacant
parcel — "what's possible here?" not "does my specific plan fit?"

- Available whenever the resolved parcel (via Epic 1) is vacant, or the user explicitly chooses the vacant-land screening path for a parcel with an existing structure they intend to redevelop.
- Does not require any Project Configuration (Epic 2) step.

### VL-2: Generate parcel characteristics and zoning summary for vacant-land screening
As a **Professional or Homeowner** user, I want a summary of the parcel's characteristics and
zoning, so that I understand the baseline regulatory context before anything else.

```
Given a resolved vacant (or to-be-redeveloped) parcel
When the system generates the vacant-land screening summary
Then parcel characteristics (size, dimensions, zoning classification) are presented with source/provenance
And the zoning classification is explicitly labeled as sourced from a dataset that is "not an official zoning map" per research-findings.md §1
```

### VL-3: Generate mapped-constraints and preliminary buildable-area assessment
As a **Professional or Homeowner** user, I want to see mapped development constraints and a
preliminary buildable-area indication where the evidence defensibly supports it, so that I get a
useful screening signal without false precision.

```
Given a resolved vacant parcel with its zoning and constraint layers evaluated
When the system generates the buildable-area assessment
Then mapped constraints (Environmentally Critical Areas, FEMA flood zones, known setback envelopes) are evaluated and presented
And a preliminary buildable-area figure is presented ONLY when defensibly supported by available evidence
And where evidence does not support a defensible buildable-area figure, the system presents REQUIRES VERIFICATION rather than a fabricated number (requirements.md §1.4, §2.3)
```

### VL-4: Generate plausible supported residential-use scenarios and diligence risks
As a **Professional** user (primary fit for acquisition screening), I want to see plausible
supported residential development scenarios and the major diligence risks for this parcel, so
that I can quickly judge whether it merits deeper investigation.

```
Given a resolved vacant parcel with zoning and constraints evaluated
When the system generates the scenario/risk summary
Then plausible residential-use scenarios supported by the zoning/constraint evidence are listed, each tied to its supporting evidence
And major diligence risks (e.g., critical-area intersection, utility-availability unknowns per research-findings.md §1.10) are explicitly surfaced, not buried
And scenarios or risks that cannot be defensibly determined are explicitly marked REQUIRES VERIFICATION
```

### VL-5: Present a deterministic preliminary screening assessment with LLM-explained next steps
As a **Professional or Homeowner** user, I want a clear preliminary screening assessment of this
parcel, explained in plain language, plus recommended next diligence steps, so that I can decide
how to spend my time and money next — without the system overstating its own certainty.

```
Given a completed vacant-land evaluation (VL-2 through VL-4)
When the report is finalized
Then the deterministic evidence and findings (constraints, scenario support, diligence risks, REQUIRES VERIFICATION items from VL-2 through VL-4) produce the underlying preliminary screening assessment — the LLM does not independently determine or change whether the parcel appears worth deeper investigation
And the LLM's role is limited to explaining and synthesizing that deterministic assessment and its supporting findings in plain language, consistent with the non-authoritative LLM boundary in requirements.md §5.1
And the report uses "preliminary screening assessment" framing rather than "recommendation" language, consistent with Permit Preflight's screening/early-diligence positioning (Brief §1, §55)
And the user-facing assessment remains traceable to the specific deterministic findings and evidence IDs that produced it (requirements.md §5.3)
And recommended next diligence steps (e.g., "confirm utility availability with SPU," "consult a geotechnical engineer if grading is planned") are included where relevant unknowns exist, framed as explanation of the deterministic REQUIRES VERIFICATION findings rather than independent LLM advice
And if the LLM is unavailable, the deterministic preliminary screening assessment and findings are still delivered in full, per the degradation behavior in RGD-5
```

**INVEST verification (re-run 2026-08-19 after VL-5 revision)**: Project-type stories (SRE-*) are independent of each other and independently deployable per the approved sequence — each can ship without the others existing. Vacant-land stories (VL-*) are sequenced dependently (VL-2 before VL-3 before VL-4 before VL-5) but each is independently testable and valuable as an incremental capability. VL-5's revision (deterministic assessment, LLM explains only) does not change its dependency shape — it still consumes VL-2 through VL-4's findings — but sharpens Testability: "the LLM did not change the assessment" is now a concrete, checkable property (compare deterministic assessment before/after LLM synthesis) rather than an implicit assumption. Confirmed.

**Epic story count**: 1 (SRE-0, shared) + 7 (project-type-specific: SRE-SHED-1, SRE-GARAGE-1, SRE-FENCE-1, SRE-DECK-1, SRE-WALL-1, SRE-ADD-1, SRE-ADU-1) + 5 (VL-1 through VL-5) = **13 stories** in this epic.

---

## Epic 4: Report Generation & Delivery
*(requirements.md §2.5, §5, Brief §36-§37, §40, §44)*

### RGD-1: Generate a report after successful payment
As a **Professional or Homeowner** user, I want my report generated automatically once payment
succeeds, so that I don't have to take any further action to receive what I paid for.

```
Given an order has moved to PAID status (Epic 5)
When report generation is triggered
Then the system orchestrates evidence gathering, spatial/regulatory evaluation, and LLM synthesis into a single report artifact
And generation failures are handled per RGD-1a (see Epic 5, PO-4) rather than leaving the customer in an undefined state
And the completed report is linked to the order and made available to the purchaser
```

### RGD-2: View the web-based report
As a **Professional or Homeowner** user, I want to view my report as an interactive, accessible
web page, so that I can explore findings, evidence, and the map without needing a PDF viewer.

```
Given a completed report linked to my order
When I access my report
Then the report is presented as the primary web-based experience per requirements.md §2.5
And the map communicates likely-buildable / conditionally-buildable / constrained areas where practical (Brief §5)
And every finding communicated on the map has an accessible non-map representation as well (requirements.md §10, Brief §44)
```

### RGD-3: Download a PDF export of the report
As a **Professional or Homeowner** user, I want to download a PDF version of my report, so that I
have a durable, portable copy I can save or share.

- The PDF reflects the same underlying report snapshot as the web version — not a separately-authored artifact.
- The PDF is available immediately after report generation completes, from the report's web page.
- The PDF includes the same evidence classifications and provenance information as the web version.

### RGD-4: Report is an immutable point-in-time snapshot
As a **Professional or Homeowner** user, I want my purchased report to never silently change, so
that I can rely on it as a historical record of what was known at the time I paid for it.

```
Given a report has been generated and delivered
When any underlying input changes later (municipal code, zoning data, a GIS layer, an LLM model, a rule version)
Then the previously-delivered report's content does not change
And any new evaluation for the same parcel/project produces a new, separate report artifact
And the original report remains accessible with its original generation date and rule/data versions recorded
```

### RGD-5: LLM-generated explanations reference evidence and degrade gracefully
As a **Professional or Homeowner** user, I want the plain-language explanations in my report to be
traceable to specific findings, and I want the report to still be useful if the LLM service is
unavailable, so that I never receive an untrustworthy or broken report.

```
Given a report is being generated
When the LLM synthesis step runs successfully
Then generated explanations reference specific finding/evidence IDs (requirements.md §5.3)
And LLM output has been validated against its expected schema before inclusion in the report

Given the LLM service is unavailable or returns invalid output
When report generation proceeds
Then the deterministic findings (evidence, classifications, spatial/regulatory results) are still delivered in full
And the report clearly indicates that plain-language synthesis is temporarily unavailable, rather than failing the entire report
```

### RGD-6: Report clearly communicates REQUIRES VERIFICATION items
As a **Professional or Homeowner** user, I want REQUIRES VERIFICATION findings to be presented as
clearly and usefully as KNOWN findings, so that I understand what I still need to check rather
than feeling the report is incomplete or broken.

```
Given a report contains one or more REQUIRES VERIFICATION findings
When I view the report
Then each REQUIRES VERIFICATION finding explains what could not be determined and why
And where possible, the finding suggests what kind of verification would resolve it (e.g., "confirm with a licensed surveyor," "SPU utility data request")
And REQUIRES VERIFICATION findings are visually/structurally distinct from KNOWN and INFERRED findings, not blended in ambiguously
```

**INVEST verification**: RGD-1 depends on Epic 5 (payment); the rest are independently testable given a completed report fixture. Confirmed appropriately sequenced, not falsely independent.

---

## Epic 5: Payment & Orders
*(requirements.md §2.6, §9, Brief §28-§31)*

### PO-0: Validate report-generation readiness before checkout
As a **Professional or Homeowner** user, I want the system to confirm my request is actually
generatable before I'm asked to pay, so that I'm never charged for a report that was already
known to be impossible to produce.

```
Given a user is about to proceed to checkout for a configured project or vacant-land screening request
When the system performs the pre-payment readiness check
Then the check confirms: the parcel has been successfully resolved (Epic 1); the requested workflow/project type is currently supported in production (per the approved build sequence, requirements.md §1.4); required project/request inputs are present and pass validation (Epic 2 / VL-1); no already-known system or data-source condition makes generation impossible (e.g., a data source already marked unhealthy per ADM-8 for a required input)
And the check is low-cost — it does NOT perform the full evidence-gathering, spatial/regulatory evaluation, or LLM-synthesis pipeline (RGD-1), which remains authorized only after verified payment (PO-3)
And if the readiness check fails, checkout is not offered and the user receives a clear explanation instead of being charged for an unfulfillable request
And if the readiness check passes, this does not itself guarantee successful generation — post-payment failures are still handled per PO-4
```

### PO-1: Purchase a report via Stripe Checkout
As a **Professional or Homeowner** user (guest or authenticated), I want to pay for my report
through a secure, standard checkout flow, so that I can trust my payment information is handled
safely.

```
Given a configured project (or completed vacant-land screening request) that has passed the PO-0 readiness check
When I proceed to purchase
Then the server creates a Stripe Checkout Session with a server-determined price (never a client-supplied price)
And the application never receives or stores raw card data
And I can complete checkout as a guest or, if authenticated, linked to my account
```

### PO-2: Server-side price validation prevents client-tampered pricing
As the **Founder/Operator**, I want the report price to always be validated server-side, so that
no modified client request can purchase a report at an arbitrary price.

```
Given a checkout request is initiated
When the server creates the Checkout Session
Then the price is determined entirely by server-side logic based on the current approved pricing (requirements.md §9.4)
And any client-supplied price/amount field, if present, is ignored or rejected
```

### PO-3: Webhook-verified payment confirmation
As the **Founder/Operator**, I want order status to change to PAID only after a verified Stripe
webhook confirms payment, so that a browser redirect alone can never authorize report generation.

```
Given a customer completes payment in Stripe Checkout
When Stripe sends a payment-confirmation webhook
Then the server verifies the webhook signature before trusting the event
And the order transitions PENDING -> PAID only after successful verification
And report generation (RGD-1) is authorized only once the order is PAID
And duplicate/replayed webhook events are handled idempotently (no double-generation, no double-fulfillment)
```

### PO-4: Handle report-generation failure after successful payment
As a **Professional or Homeowner** user who has paid, I want a clear resolution path if my report
generation fails, so that a successful payment never leaves me in an undefined state.

```
Given an order is PAID and report generation begins
When generation fails (external GIS/government API outage, LLM outage, timeout, insufficient evidence, unexpected data format, internal error)
Then the system retries per a defined retry policy before declaring failure
And if generation ultimately fails, the order moves to FAILED with a clear customer-facing explanation
And the customer is offered an appropriate resolution (automatic refund, retry option, or support escalation) per the minimum-evidence policy defined in Application Design
And the failure is logged with enough detail for the Founder/Operator to investigate (Epic 8)
```

### PO-5: Request or process a refund
As a **Professional or Homeowner** user (or the **Founder/Operator** on their behalf), I want a
clear refund path when appropriate, so that payment disputes have a defined resolution.

```
Given a customer requests a refund, or an operator determines a refund is warranted (e.g., generation failure, reported inaccuracy, goodwill)
When the refund is processed
Then the refund is issued through Stripe and the order status updates to REFUNDED
And the historical report/order/payment record remains available internally for auditability and support (ADM-1, ADM-5) regardless of refund reason
And the underlying evidence and rule-version provenance for the report are never silently destroyed, consistent with RGD-4's immutability requirement
And customer-facing access to the report after refund follows the approved refund/retention policy — which this story does NOT hard-code, since it may reasonably differ between generation-failure refunds, reported-inaccuracy refunds, and goodwill refunds; the exact policy per refund reason is defined in Application Design
And the refund action, reason, and resulting access decision are recorded for audit purposes
```

**INVEST verification (re-run 2026-08-19 after revisions)**: PO-0 is a genuinely independent, small, testable capability (a readiness check against fixture parcel/project states) that sits logically before PO-1 without requiring PO-1's checkout machinery to exist — testable standalone. PO-1 through PO-3 form a necessary sequence (checkout -> price validation is embedded in checkout -> webhook confirms) but each is independently testable in isolation with appropriate fixtures/mocks. PO-4 is an independently testable failure-path story. PO-5 (revised) remains independently testable; its acceptance criteria now correctly avoid hard-coding a single access policy across all refund reasons, which if anything makes it more Negotiable (a core INVEST property) than the original version — Application Design retains room to define per-reason policy without contradicting this story. Confirmed, no new dependency introduced by the PO-0 addition.

---

## Epic 6: Accounts
*(requirements.md §2.4, Brief §23)*

### ACC-1: Complete a purchase as a guest
As a **Professional or Homeowner** user, I want to purchase a report without creating an account,
so that a one-time purchase doesn't require unnecessary friction.

```
Given I have a configured project or vacant-land screening request ready for purchase
When I choose to check out as a guest
Then I complete payment (Epic 5) without being required to create an account
And I receive report access via a secure emailed link (requirements.md §2.4)
And no account record is created unless I separately opt in
```

### ACC-2: Create an optional account to save report history
As a **Professional** user (primary fit), I want to create an account, so that I can see my report
history and evaluate repeat properties more efficiently over time.

- Account creation is optional and available before or after a purchase.
- Account creation requires only the minimum information necessary (email + authentication method) per the privacy-minimization requirement (requirements.md §10).
- A prior guest purchase can be linked to a new or existing account after the fact, so a guest customer isn't locked out of upgrading later — **but only with proof of control over the guest purchase**, never on email-address match alone:

```
Given a user has a prior guest purchase and wants to link it to an account
When they request linking
Then linking requires proof of control over the guest purchase — successful email verification/magic-link confirmation to the purchase email, or possession of the secure report-access token issued at purchase, or another appropriately authenticated mechanism
And an email-address match alone is never sufficient to link a report to an account (prevents an attacker who merely knows/guesses the purchaser's email from claiming their report)
And server-side authorization remains the sole source of truth for report ownership after linking, consistent with ACC-3's ownership enforcement
```

### ACC-3: View report history as an authenticated user
As a **Professional** user, I want to see a list of my past report purchases, so that I can revisit
past screenings across multiple properties.

```
Given I am authenticated and have one or more past report purchases linked to my account
When I view my report history
Then I see only reports linked to my own account (ownership enforced server-side, requirements.md §6)
And I cannot view another user's reports by guessing or manipulating a report ID or URL
```

### ACC-4: Delete account and associated data
As a **Professional or Homeowner** user, I want to delete my account and understand what happens
to my data, so that I retain control over my personal information.

```
Given I am an authenticated user requesting account deletion
When I confirm deletion
Then my account credentials and unnecessary personal data are deleted per the retention/deletion policy defined in requirements.md §10
And previously purchased reports' historical existence is handled per the retention policy (e.g., anonymized/retained for business-record purposes rather than silently altered, consistent with RGD-4's immutability requirement)
And the deletion action is confirmed to the user
```

**INVEST verification (re-run 2026-08-19 after ACC-2 revision)**: All four stories remain independently valuable and testable; ACC-1 has no dependency on ACC-2/3/4 (guest mode works standalone), consistent with requirements.md §2.4. ACC-2's revised guest-linking criteria remain independently testable (verification-token/magic-link fixtures) and are now more Testable in the INVEST sense than the original email-match version, since "proof of control" gives an unambiguous pass/fail condition where "email matches" left the security-relevant edge case (attacker knows victim's email) untested. Confirmed.

---

## Epic 7: Regulatory Rule Authoring & Governance
*(requirements.md §3.2, §4.1 — first-class epic per approved Question 5)*

### RRAG-1: AI-assisted research produces a candidate rule package from permitted sources
As the **Founder/Rule Reviewer**, I want AI-assisted research to produce a structured candidate
rule package using only permitted-access source material, so that I can verify efficiently
instead of researching from scratch — without the system depending on unauthorized scraping or
bulk copying of any source.

```
Given a need to draft a new regulatory rule (e.g., for the next project type in the approved sequence)
When AI-assisted research is conducted
Then the research uses regulatory source material obtained through permitted access methods only: Municode as the current compiled SMC reference, used in accordance with its applicable terms and primarily as a human/research reference (not bulk-scraped or ingested); City Clerk/Legistar for ordinance text, amendment history, effective dates, and change-tracking provenance; SDCI and other authoritative City sources where applicable
Then the resulting candidate rule package includes: an independently-written structured rule specification (not reproduced from Municode's compiled text), primary-source citations (SMC section + ordinance number + effective date) rather than bulk reproduction of source content, the reasoning chain connecting source to rule, proposed test cases (positive/negative/boundary/exception), and a self-assessed ambiguity/confidence flag with a suggested tier
And the package never includes bulk-copied Municode formatted/annotated text (requirements.md §3.2 provenance discipline)
And the research process does not depend on automated scraping or bulk ingestion of Municode or any other source whose terms do not permit it
```

### RRAG-2: Founder triages a candidate rule package into Tier 1 or Tier 2
As the **Founder/Rule Reviewer**, I want to confirm the risk tier for every candidate rule myself,
so that the AI never has authority to decide a rule skips domain-professional review.

```
Given a candidate rule package with an AI-suggested tier
When I review the package
Then I confirm or override the suggested tier based on the Tier 1/Tier 2 criteria (requirements.md §3.2)
And the rule's lifecycle state moves to TRIAGED only after my explicit confirmation
And when genuinely in doubt, I default to Tier 2 per the approved escalation-biased model
```

### RRAG-3: Founder performs Tier 1 source verification and approval
As the **Founder/Rule Reviewer**, I want to verify a Tier 1 candidate rule directly against primary
sources and approve it, so that straightforward, well-supported rules can reach production quickly.

```
Given a candidate rule package TRIAGED as Tier 1
When I verify the package's citations against the primary sources myself
Then I can move the rule to SOURCE VERIFIED without domain-professional involvement
And after automated tests pass (TESTED), I can approve the rule (APPROVED) and it becomes ACTIVE
And my identity and verification timestamp are recorded for audit purposes (requirements.md §37)
```

### RRAG-4: Escalate a Tier 2 candidate rule to a domain professional
As the **Founder/Rule Reviewer**, I want to escalate a Tier 2 candidate rule to the appropriate
domain professional, so that ambiguous or high-consequence rules get qualified review before
activation.

```
Given a candidate rule package TRIAGED as Tier 2
When I escalate it
Then I select the appropriate professional type per the fit-mapping in research-findings.md §5 (land-use consultant, architect, or attorney, depending on the trigger)
And the professional receives the candidate rule package (evidence + reasoning already assembled) rather than needing to research from scratch
```

### RRAG-5: Domain-professional review informs Tier 2 approval
As the **Escalated Domain Professional**, I want to review the candidate rule package and provide a
documented opinion, so that the Founder has a qualified basis for final activation sign-off.

```
Given an escalated Tier 2 candidate rule package
When the domain professional completes their review
Then their opinion (approve, revise, or reject the candidate rule) is recorded and linked to the rule's audit trail
And the rule moves to SOURCE VERIFIED only after this professional input is recorded
And final production APPROVED status still requires the Founder's own sign-off (the professional informs, but does not unilaterally activate, the rule)
```

### RRAG-6: Approved rule becomes ACTIVE with full version/citation metadata
As a **Professional or Homeowner** user (indirect beneficiary) and the **Founder/Rule Reviewer**
(direct actor), I want every ACTIVE rule to carry its full citation and version metadata, so that
every regulatory conclusion in a report is traceable back to its authoritative source.

```
Given a rule has passed APPROVED status
When it is activated
Then the rule's SMC citation, ordinance number, effective date, tier, and (if Tier 2) reviewing professional are all recorded and queryable
And the rule's version is associated with an effective-date range so historical reports remain reproducible (RGD-4)
```

### RRAG-7: Supersede an active rule when the underlying ordinance changes
As the **Founder/Rule Reviewer**, I want to supersede an active rule when City Clerk/Legistar
records show the underlying ordinance changed, so that production rules stay current without
breaking historical report reproducibility.

```
Given an ACTIVE rule's underlying SMC section is amended by a new ordinance (detected via Clerk/Legistar per requirements.md §3.2)
When I initiate a rule update
Then a new candidate rule package is drafted (RRAG-1) and goes through the same TRIAGED -> verified -> tested -> approved lifecycle
And upon activation, the new rule version supersedes the old one for future evaluations only
And historical reports generated under the superseded rule version remain unchanged (RGD-4)
```

### RRAG-8: AI cannot activate or self-determine final tier for a production rule
As the **Founder/Rule Reviewer**, I want it to be structurally impossible for AI-assisted research
to activate a rule or finalize its own tier classification, so that human accountability for
regulatory conclusions is never bypassed.

```
Given any candidate rule package at any lifecycle stage
When the system processes it
Then no automated process can move a rule to APPROVED or ACTIVE status without a recorded human (Founder, or Founder-plus-domain-professional for Tier 2) action
And the AI-suggested tier is always advisory only — TRIAGED status requires explicit human confirmation (RRAG-2)
```

**INVEST verification (re-run 2026-08-19 after RRAG-1 revision)**: Stories follow the approved lifecycle sequence (RESEARCHED->DRAFTED->TRIAGED->SOURCE VERIFIED->TESTED->APPROVED->ACTIVE->SUPERSEDED) and are dependent in that natural order, but each is independently testable given an appropriate fixture rule at that lifecycle stage. RRAG-1's revision (permitted-access sourcing, independently-written specs) does not change its dependency shape or testability — it remains independently testable against fixture source material — and removes an implicit assumption (that "AI-assisted research against Municode" meant automated scraping) that could otherwise have misled Construction toward an unauthorized-access implementation. RRAG-8 is a cross-cutting guardrail story, verified as testable via negative-path tests (attempting to bypass human approval must fail). Confirmed.

---

## Epic 8: Admin/Support
*(requirements.md §12 — explicit per-capability stories per approved Question 6; plain-bullet acceptance criteria per approved Question 3)*

### ADM-1: Inspect a specific report's full evidence and provenance trail
As the **Founder/Operator**, I want to inspect any report's complete evidence and provenance
trail, so that I can answer "why did this report reach this conclusion?"

- Given a report ID, the operator can view every finding, its evidence sources, retrieval timestamps, and the rule version(s) applied.
- No raw database query is required to answer a customer's "why" question (requirements.md §46).

### ADM-2: Inspect active/historical rule versions and their source citations
As the **Founder/Operator**, I want to inspect any rule's version history and citations, so that I
can audit regulatory behavior over time.

- The operator can view a rule's full lifecycle history (RESEARCHED through SUPERSEDED) including who verified/approved it and when.
- Superseded rule versions remain inspectable, not deleted.

### ADM-3: Inspect data-source health and ingestion failures
As the **Founder/Operator**, I want to see the health status of each external data source, so
that I know when a source is stale or failing before it silently degrades report quality.

- The operator can view last-successful-retrieval time, expected refresh cadence, and recent ingestion failures per source (requirements.md §38).
- A source flagged unhealthy is visibly distinct from a healthy one.

### ADM-4: Inspect report-generation failures
As the **Founder/Operator**, I want to see a list of failed report generations with enough detail
to diagnose the cause, so that I can respond to affected customers proactively.

- The operator can view failure reason, affected order, and retry history for any failed generation.
- Failures are visible without needing to correlate raw logs manually.

### ADM-5: Inspect payment/order state for a specific customer
As the **Founder/Operator**, I want to look up a customer's order and payment state, so that I can
resolve billing questions without querying Stripe or the database directly.

- The operator can search by order ID, customer email, or report ID and see the full order lifecycle state.

### ADM-6: Issue or manage a refund
As the **Founder/Operator**, I want to issue a refund directly from the admin tooling, so that
customer disputes can be resolved without manual Stripe dashboard work for routine cases.

- The operator can trigger a refund for a specific order, which updates order status and calls the Stripe refund API (implements PO-5's operator-initiated path).
- The refund action and reason are recorded for audit purposes.

### ADM-7: Disable a problematic rule
As the **Founder/Operator**, I want to disable an active rule that turns out to be incorrect, so
that I can stop it from affecting new reports while I investigate and correct it.

- Disabling a rule prevents it from being applied to new evaluations; it does not alter any historical report that already used it (RGD-4).
- A disabled rule is clearly distinguished from a superseded rule in its lifecycle history (an emergency stop, not a normal version transition).

### ADM-8: Mark a data source unhealthy
As the **Founder/Operator**, I want to manually mark a data source unhealthy, so that report
generation can respond appropriately (e.g., treat related findings as REQUIRES VERIFICATION)
even before automated health checks would catch a problem.

- The operator can mark/unmark a source unhealthy, and this status is visible to ADM-3 and factored into new evaluations.

### ADM-9: Investigate and resolve a customer complaint end-to-end
As the **Founder/Operator**, I want a single workflow to investigate a "your report was wrong"
complaint from start to resolution, so that customer support doesn't require jumping between
disconnected tools.

- The operator can start from a report ID or customer email and reach the relevant evidence (ADM-1), rule versions (ADM-2), and order state (ADM-5) without separate lookups.
- The operator can document the investigation outcome and any resulting action (refund, rule correction, no action needed) against the complaint record (requirements.md §47).

**INVEST verification**: Each story maps to one distinct operational capability from requirements.md §12, independently valuable and testable against a fixture scenario, deliberately kept to MVP-minimum scope per the approved answer (not an enterprise admin platform). Confirmed.

---

## Persona-to-Story Mapping

| Story | Professional | Homeowner | Founder/Operator | Domain Professional |
|---|---|---|---|---|
| PR-1..5 | ✓ | ✓ | | |
| PC-1..3 | ✓ | ✓ | | |
| SRE-0, SRE-*-1 (all project types) | ✓ | ✓ | | |
| VL-1..5 | ✓ (primary fit) | ✓ | | |
| RGD-1..6 | ✓ | ✓ | | |
| PO-0..5 | ✓ | ✓ | ✓ (PO-0 system check; PO-2 through PO-5 operator-side) | |
| ACC-1 | ✓ | ✓ | | |
| ACC-2, ACC-3 | ✓ (primary fit) | (optional) | | |
| ACC-4 | ✓ | ✓ | | |
| RRAG-1..3, 6..8 | | | ✓ | |
| RRAG-4, 5 | | | ✓ | ✓ |
| ADM-1..9 | | | ✓ | |

---

## Requirements Traceability Summary

**Re-run 2026-08-19 after targeted revisions.** Every epic cites its source `requirements.md`
section(s) in its heading. Every major requirements.md section (§2 Core Workflows, §3 Property
Intelligence, §4 Rules Engine/Spatial Analysis, §5 LLM Architecture [via RGD-5, and now VL-5's
deterministic-assessment/LLM-explains-only framing], §6 Security [via authorization-focused
acceptance criteria in ACC-2, ACC-3, PO-2, PO-3], §9 Payments, §10
Observability/Privacy/Accessibility [via RGD-2, ACC-4], §12 Admin/Support) is represented by at
least one story.

**One addition is a genuine extension, not a re-citation, and is called out honestly rather than
force-fit to an exact section**: PO-0 (pre-payment readiness check) operationalizes the general
principle in requirements.md §9.2 ("a successful payment must never leave the customer in an
undefined state") *proactively* — checking known-impossible conditions before charging — rather
than only *reactively* after a post-payment failure, which is what §9.2 explicitly enumerates. This
does not contradict anything in requirements.md (it strictly reduces the population of failures
PO-4 has to handle) and was requested directly by the user during User Stories review; it is
recorded here as a requirements refinement worth reflecting back into requirements.md §9.2 if the
user wants that document kept fully in sync (not done automatically, to avoid silently rewriting
an already-approved artifact — flagged for the user's decision).

No story contradicts an approved requirements.md decision. The five other revisions (ACC-2 guest
linking, VL-5 deterministic/LLM boundary, RRAG-1 permitted-access sourcing, PO-5 refund/access
decoupling) are clarifications and corrections of prior story text, not new capabilities — each
maps to the same requirements.md citation as before, now stated more precisely.
