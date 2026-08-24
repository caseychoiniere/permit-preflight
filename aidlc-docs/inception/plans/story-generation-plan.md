# Permit Preflight — User Story Generation Plan

**Role**: Product Owner
**Prerequisite**: `aidlc-docs/inception/requirements/requirements.md` (APPROVED)
**Assessment**: `aidlc-docs/inception/plans/user-stories-assessment.md` (Execute: Yes)

This is Part 1 (Planning) of the User Stories stage. Answer the embedded questions below;
once approved, Part 2 (Generation) will execute this checklist to produce `stories.md` and
`personas.md`.

---

## Story Breakdown Approach — Options

Given the domain, here are the realistic approaches and my recommendation:

- **Domain-Based** (organize around: Property Resolution, Project Configuration, Spatial/Regulatory
  Evaluation, Report Generation & Delivery, Payment & Orders, Accounts, Regulatory Rule Authoring
  & Governance, Admin/Support) — maps cleanly onto the architecture in requirements.md and onto
  likely future Units of Work. **Recommended** as the primary organizing structure.
- **Persona-Based** — would group by professional vs. homeowner vs. rule-reviewer vs. admin; useful
  as a *secondary* lens (persona-to-story mapping table) but a poor primary structure here because
  most domain workflows are shared across the professional and homeowner personas — splitting by
  persona first would duplicate the same story with cosmetic differences.
- **User Journey-Based** — good for the two customer-facing workflows (existing-property, vacant-land)
  specifically, but doesn't naturally fit the rule-authoring or admin domains, which aren't "journeys."
- **Feature-Based / Epic-Based** — reasonable alternative to Domain-Based; in this product the two
  are nearly equivalent since domains and features line up closely.

**Recommendation**: Domain-Based epics as the primary structure (Question 2 below asks you to confirm
or override this), with an explicit persona-to-story mapping table as required by Step 4's mandatory
artifacts, and journey-style acceptance criteria used *within* the two customer-facing workflow epics
specifically (Question 3 asks about acceptance-criteria format).

---

## Clarifying Questions

### Question 1 — Story Granularity Across the 8 Project Types
Permit Preflight covers 8 project types with an approved build sequence (requirements.md §1.4). Writing a fully separate story per project type per workflow step could produce 40-60+ near-duplicate stories. How should project-type variability be handled?

A) **Generic workflow stories** (e.g., "As a professional user, I select a project type and provide project-specific details, so that the system can evaluate the correct rules") with project-type-specific rule/data differences captured as acceptance-criteria detail and left to per-unit Functional Design during Construction — recommended, keeps stories stable as sequence/scope evolves

B) **One story per project type per major workflow step** (explicit duplication) — more exhaustive but much larger story count, more maintenance overhead as the approved sequence (§1.4) evolves

C) **Tiered**: generic stories for the shared pipeline (parcel resolution, checkout, report delivery) + one dedicated story per project type only for the "evaluate spatial/regulatory constraints" step specifically, since that's where project types genuinely diverge

X) Other (please describe after [Answer]: tag below)

[Answer]: C

Use a tiered approach.

Keep shared pipeline capabilities generic where the behavior is genuinely common across project
types, including: property/parcel resolution, project-type selection, common project
configuration behavior, payments/orders, report generation and delivery, accounts, evidence
presentation, common error/failure handling.

Create project-type-specific stories for Spatial/Regulatory Evaluation where the project types
genuinely diverge in rules, required inputs, spatial calculations, evidence requirements, and
possible outcomes.

The goal is to avoid 40-60 near-duplicate stories without hiding meaningful domain differences
inside overly generic stories.

Project-specific implementation detail that is better handled during Functional Design may remain
there rather than being exhaustively encoded in Inception stories.

### Question 2 — Primary Story Organization
Confirm or override the recommended Domain-Based epic structure above (Property Resolution, Project Configuration, Spatial/Regulatory Evaluation, Report Generation & Delivery, Payment & Orders, Accounts, Regulatory Rule Authoring & Governance, Admin/Support).

A) Use the recommended Domain-Based structure as-is

B) Use Domain-Based but with different/additional epics — describe after [Answer]: below

C) Use a different primary structure entirely (Persona-Based, Journey-Based, Feature-Based) — describe after [Answer]: below

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Use the recommended Domain-Based epic structure: Property Resolution, Project Configuration,
Spatial/Regulatory Evaluation, Report Generation & Delivery, Payment & Orders, Accounts,
Regulatory Rule Authoring & Governance, Admin/Support.

Use persona-to-story mapping as a secondary view rather than duplicating shared stories by
persona.

Journey-oriented acceptance criteria may be used within customer-facing workflows where useful.

### Question 3 — Acceptance Criteria Format
What level of detail/format should acceptance criteria use?

A) **Given/When/Then (Gherkin-style)** for every story — most rigorous, directly testable, but more verbose; a strong fit given the regulatory/evidence-classification stakes and the intent to hand these to AI-assisted Construction as a spec

B) **Plain bullet-point criteria** ("must," "must not" statements) — lighter-weight, faster to write/read, less directly mappable to automated test cases

C) **Hybrid** — Given/When/Then for the customer-facing workflows and regulatory-rule-lifecycle stories (where correctness stakes are highest), plain bullets for lower-stakes admin/support stories

X) Other (please describe after [Answer]: tag below)

[Answer]: C

Use a hybrid approach.

Use Given/When/Then acceptance criteria for behavior where correctness, state transitions,
evidence integrity, authorization, regulatory behavior, or customer outcomes are especially
important, including where appropriate: property resolution and ambiguity handling,
spatial/regulatory evaluation, evidence classification, regulatory rule lifecycle/governance,
payments and order-state transitions, authorization/access control, report-generation
failure/recovery, important customer-facing workflows.

Use concise plain-language acceptance-criteria bullets for lower-risk administrative/support
behavior where Gherkin would add verbosity without meaningfully improving testability.

Acceptance criteria should remain specific and testable regardless of format.

### Question 4 — Personas to Formally Define
Based on requirements.md, I'd define these personas for `personas.md`. Confirm, adjust, or add:

A) **Confirm as-is**: (1) Professional/Repeat Evaluator (primary — developer/investor/builder), (2) Homeowner/Prospective Buyer (secondary), (3) Guest Purchaser (no account, either persona), (4) Founder/Rule Reviewer (internal — Tier 1 rule verification, admin/support), (5) Escalated Domain Professional (external, occasional — Tier 2 reviewer: consultant/architect/attorney)

B) Same core set, but merge Guest Purchaser into the Professional/Homeowner personas as a purchase-mode attribute rather than a separate persona — describe preference after [Answer]: below

C) Different persona set — describe after [Answer]: below

X) Other (please describe after [Answer]: tag below)

[Answer]: B

Use the same core persona set, but do not model Guest Purchaser as a separate persona. Guest
purchase is an authentication/purchase mode available to appropriate customer personas rather
than a distinct user motivation.

Formally define:

1. Professional / Repeat Property Evaluator — Primary persona: small residential developer,
   investor, builder, or similar repeat evaluator.
2. Homeowner / Prospective Buyer — Secondary customer persona.
3. Founder / Rule Reviewer / Operator — Internal persona responsible for Tier 1 verification,
   rule triage, approvals, administration, and support responsibilities appropriate to the MVP.
4. Escalated Domain Professional — External/occasional Tier 2 reviewer, which may include a
   land-use consultant/planner, architect, attorney, or other appropriate domain expert depending
   on the rule.

Represent guest vs. authenticated purchase behavior as attributes/modes of the customer personas
rather than separate personas.

### Question 5 — Regulatory Rule-Authoring Workflow as User Stories
The Tier 1/Tier 2 rule-authoring workflow (requirements.md §3.2) has a real "user" (the founder, and occasionally an escalated domain professional) even though it's not a customer-facing flow. Should this get full user-story treatment (INVEST-compliant stories, acceptance criteria) alongside the customer-facing stories?

A) Yes — treat it as a first-class epic with full stories; it's core to product correctness and was explicitly designed during Requirements Analysis, so it deserves the same rigor

B) Lighter treatment — a few high-level stories covering the workflow shape, without full Gherkin-level acceptance criteria per step

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Treat Regulatory Rule Authoring & Governance as a first-class epic with full user-story treatment.
This workflow is a core operational capability of Permit Preflight and is directly responsible
for the trustworthiness of production regulatory conclusions.

Stories should cover the lifecycle established during Requirements Analysis, including:
authoritative sources → AI-assisted research → candidate rule package → TRIAGED → Tier 1 or
Tier 2 verification → SOURCE VERIFIED → testing → approval → activation → supersession.

Include the requirement that AI may assist with research and drafting but cannot approve rules,
determine its own final review tier, or activate production regulatory behavior. The founder must
confirm triage. Tier 2 rules require the appropriate domain-professional review before activation.

### Question 6 — Admin/Support Story Depth
Requirements.md §12 describes lightweight admin tooling (inspect reports/evidence/rule versions/source failures/payment state, issue refunds, disable rules, mark sources unhealthy) and a minimal support process. How much story-level detail do you want here for MVP?

A) Full stories for each capability listed in §12 — treats admin tooling as a real, scoped part of MVP rather than an afterthought

B) A smaller set of consolidated stories (e.g., one "operator can investigate a customer complaint end-to-end" story covering several capabilities at once) — lighter-weight, trusts Application Design to flesh out specifics later

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Create explicit stories for the MVP admin/support capabilities identified in requirements.md §12
rather than collapsing them into one broad operator story: inspecting reports, inspecting
evidence/provenance, inspecting rule versions, inspecting source/data failures, inspecting
report-generation failures, inspecting payment/order state, issuing or managing refunds,
disabling problematic rules, identifying/marking unhealthy sources, investigating customer
complaints, supporting correction/escalation workflows.

However, keep each story scoped to the minimum operational capability required for MVP. Do not
use this decision as justification for building a sophisticated enterprise admin platform.

### Question 7 — Vacant-Land Story Scope Given Its Moved-Up Position
Vacant-land screening is now position 3 in the build sequence (requirements.md §1.4), explicitly scoped to defensible-evidence-only conclusions (no manufactured buildable-envelope precision). Should its stories:

A) Mirror the existing-property workflow's story structure closely (parcel resolution → screening parameters → evaluation → report), adapted for vacant-land's specific evidence constraints — recommended, keeps the two workflows comparable for Construction

B) Be written as a distinctly different, more exploratory/investigative story shape, reflecting that vacant-land is fundamentally a "should I investigate further?" tool rather than a "does my project fit?" tool

X) Other (please describe after [Answer]: tag below)

[Answer]: B

Treat vacant-land screening as a distinct customer journey rather than simply mirroring the
existing-property project-preflight workflow. The fundamental user question is different:
existing-property asks "Can I build this proposed project here?"; vacant-land asks "Is this
parcel worth deeper investigation, and what appears possible or problematic based on defensible
available evidence?"

Vacant-land stories should emphasize: identifying/resolving the parcel, understanding parcel
characteristics, zoning, mapped constraints, preliminary buildable/development-area information
where defensible, plausible supported residential-use scenarios where defensible, major
acquisition/diligence risks, evidence quality, UNKNOWN/REQUIRES VERIFICATION findings,
recommended next diligence steps, and helping the user decide whether deeper investigation is
warranted.

Do not force vacant-land stories into project-configuration concepts that only make sense when a
user already has a specific proposed structure. At the same time, reuse shared underlying
capabilities such as parcel resolution, property intelligence, evidence/provenance, payments,
report delivery, accounts, and common spatial infrastructure rather than duplicating them.

---

## Story Generation Checklist (Part 2 — executes after this plan is approved)

- [ ] Read approved answers from this plan document
- [ ] Analyze answers for ambiguity/contradiction (Step 9 of user-stories.md); raise follow-ups if needed
- [ ] Draft `personas.md` per Question 4 answer, with each persona's goals, frequency of use, technical comfort, and relationship to the approved persona-priority decision (requirements.md §1.3)
- [ ] Draft epic structure per Question 2 answer
- [ ] Draft stories for the Property Resolution epic (address/parcel entry, disambiguation, clarification-request flow per requirements.md §2.2)
- [ ] Draft stories for the Project Configuration epic (project-type selection, project detail entry), applying the granularity decision from Question 1
- [ ] Draft stories for the Spatial/Regulatory Evaluation epic, applying the granularity decision from Question 1 and the vacant-land scope decision from Question 7
- [ ] Draft stories for the Report Generation & Delivery epic (web-primary + PDF export, evidence classification display, non-map accessible representation)
- [ ] Draft stories for the Payment & Orders epic (Stripe Checkout, webhook verification, order state machine, generation-failure handling, refunds)
- [ ] Draft stories for the Accounts epic (guest checkout, optional account creation, report history)
- [ ] Draft stories for the Regulatory Rule Authoring & Governance epic per Question 5 answer (AI-assisted research, candidate rule package, Tier 1/Tier 2 triage, verification, testing, approval, supersession)
- [ ] Draft stories for the Admin/Support epic per Question 6 answer
- [ ] Apply the acceptance-criteria format decision from Question 3 consistently across all stories
- [ ] Verify every story against INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable); revise any that fail
- [ ] Build the persona-to-story mapping table
- [ ] Cross-check every story traces back to a requirements.md section (traceability)
- [ ] Assemble `aidlc-docs/inception/user-stories/stories.md`
- [ ] Assemble `aidlc-docs/inception/user-stories/personas.md`
- [ ] Update `aidlc-docs/aidlc-state.md` progress
- [ ] Present completion message and wait for approval
