# Permit Preflight — Requirements Verification Questions

Please answer every question by filling in the letter after the `[Answer]:` tag.
If none of the options fit, choose the **Other** option and describe your answer.
Let me know when you're done (say "done" or similar) and I'll read this file and proceed.

Background: the governing brief (`docs/product/permit-preflight-inception-brief.md`) is already
very detailed and I am treating it as authoritative requirements text. These questions cover only
the decisions the brief explicitly defers to Inception, plus a few gaps/ambiguities I found while
reading it closely. I'm running research in parallel on the fact-based questions (data licensing,
LLM cost, payment/infra cost, comparable products/legal landscape) — those don't need your input,
they need verification, and I'll report findings separately.

**Status: ANSWERED — 2026-08-19.**

---

## Section A — Extension Opt-Ins

These three questions come from optional AI-DLC rule extensions. Each adds enforced constraints
to later stages if enabled.

### Question A1 — Security Baseline Extension
Should security extension rules be enforced for this project as blocking constraints throughout Construction?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended; this product handles payments, PII, and third-party API keys)

B) No — skip formal enforcement (rely on the brief's security sections + my own judgment instead)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Yes. Enforce all SECURITY rules as blocking constraints throughout Construction. Security is a
first-class requirement for this product because it will involve payments, user-owned
reports/data, database access, third-party APIs, LLM APIs, and sensitive credentials.

### Question A2 — Resiliency Baseline Extension
Should the resiliency baseline (AWS Well-Architected Reliability Pillar-derived directional guidance) be applied?

A) Yes — apply as directional design-time guidance (a paid product with real customers benefits from this even pre-launch)

B) No — skip it for MVP (treat reliability informally; revisit post-launch)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Apply the resiliency baseline as directional design-time guidance. Keep it proportionate to an
MVP and avoid enterprise-scale infrastructure or overengineering unless an actual requirement
justifies it.

### Question A3 — Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced, e.g. for spatial calculations and regulatory rule logic?

A) Yes — enforce for all business logic (recommended given the brief's emphasis on deterministic, testable spatial/regulatory logic)

B) Partial — enforce only for pure functions and serialization round-trips (e.g. evidence/report schemas), not full rule logic

C) No — skip PBT; rely on example-based fixture tests only (the brief already asks for fixture-based scenario tests)

X) Other (please describe after [Answer]: tag below)

[Answer]: X

Enable property-based testing where the domain has meaningful invariants, especially:

- spatial calculations
- geometry operations
- regulatory rule primitives
- parsers and conversions
- serialization/deserialization
- boundary calculations
- other deterministic mathematical/domain operations where invariant-based testing provides
  meaningful additional confidence

Do not require property-based testing for all business logic merely for coverage. Use
fixture-based and example-based tests where those provide clearer validation, particularly for
complete property/project scenarios and regulatory rule behavior.

---

## Section B — Target Customer & Positioning

### Question B1 — Primary Launch Persona
The brief asks Inception to recommend the strongest initial persona rather than targeting all personas equally. My working analysis (to be confirmed in the requirements doc) favors **small residential developers / builders / real-estate investors evaluating multiple properties** over one-time homeowner users, because of purchase frequency, willingness to pay, and lower CAC via professional word-of-mouth. Do you agree with prioritizing product decisions (report depth, repeat-use features, professional-friendly UX) around a professional/prosumer persona first, with homeowners as a secondary beneficiary rather than the primary design target?

A) Yes — prioritize professional/prosumer users (developers, investors, builders, agents) as the primary persona for MVP design decisions

B) No — prioritize homeowners/prospective buyers as the primary persona instead (higher volume, lower per-user value, more emotional urgency)

C) No strong preference — let the Inception research (persona analysis) decide and present the recommendation for approval rather than asking me now

X) Other (please describe after [Answer]: tag below)

[Answer]: C

No strong preference yet. This is one of the questions I specifically want Inception to
investigate rather than deciding in advance.

Use the research, market characteristics, purchase frequency, willingness to pay, customer
acquisition difficulty, report-depth requirements, repeat-use potential, and other relevant
evidence to recommend the strongest initial customer persona.

Present the recommendation and reasoning to me for approval before it becomes a product
assumption.

### Question B2 — Company / Brand Status
Is "Permit Preflight" a finalized legal business name and domain, and do you already have (or plan to personally hold) accounts with Stripe and the Anthropic API for this project, or should Inception treat these as still-open setup tasks?

A) Name/domain and accounts are still to be set up — treat as open Construction/Operations tasks, not blockers for Inception

B) Name/domain/accounts already exist — I'll provide details when needed

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Permit Preflight should currently be treated as a working product/business name. Domain, legal
business setup, Stripe configuration, Anthropic API configuration, and related production
accounts are still setup tasks.

These are not blockers for Inception.

---

## Section C — MVP Scope

### Question C1 — Project Type Implementation Order
The brief asks Inception to recommend an implementation order for project types (sheds, decks, garages, fences, retaining walls, additions, ADUs, vacant land) based on user value, rule complexity, data availability, spatial complexity, validation difficulty, and architecture-proving value. Do you want to:

A) Approve whatever order the Inception research recommends (I'll present reasoning for your final sign-off before Construction)

B) Specify your own priority order now (describe it after [Answer]: below)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Use Inception research to recommend the implementation order based on user value, regulatory
complexity, data availability, spatial complexity, validation difficulty, and how effectively
each project type proves the core architecture.

Present the recommended order and reasoning for my approval before Construction.

### Question C2 — Vacant-Land Workflow at Launch
The brief describes both an existing-property workflow and a vacant-land workflow. Vacant-land analysis (buildable envelope, plausible development scenarios) is generally more complex/uncertain than "does my proposed shed fit." Should vacant-land be:

A) In the MVP launch scope, at reduced depth if needed (e.g. constraints + red flags, without a full buildable-envelope generator)

B) A fast-follow after existing-property workflows ship and are validated, not in the initial paid-launch scope

C) Explicitly out of scope until re-evaluated later (existing-property only for the foreseeable MVP)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Keep vacant-land analysis in the MVP launch scope, but reduced analytical depth is acceptable if
the available evidence does not support reliable full-buildable-envelope or development-capacity
conclusions.

A useful initial vacant-land report can focus on:

- parcel characteristics
- zoning
- mapped constraints
- preliminary development/buildable-area information where defensible
- major regulatory/site red flags
- plausible supported residential uses where defensible
- important unknowns
- professional verification requirements
- whether the parcel appears worthy of deeper due diligence

Do not manufacture precision simply to make the vacant-land report appear more complete.

### Question C3 — Handling Data Gaps Discovered During Research
If the parallel data-landscape research finds that some project types (e.g. retaining walls, which often trigger geotechnical/engineering rules that aren't cleanly encodable) would produce mostly UNKNOWN/REQUIRES VERIFICATION results rather than useful preliminary answers, how should that be handled?

A) Drop that project type from MVP scope entirely rather than ship a low-value report

B) Keep it in scope but set expectations that it will show heavy UNKNOWN results (still useful for "here's what you still need to check")

C) Decide case-by-case when the research comes back — flag it and let me choose then

X) Other (please describe after [Answer]: tag below)

[Answer]: C

Decide case-by-case based on research.

UNKNOWN / REQUIRES VERIFICATION findings are legitimate and potentially valuable, but if a
project type produces so many unknowns that the resulting report provides little meaningful
screening value, flag that project type for possible removal or deferral.

Present those cases to me rather than automatically keeping or removing the project type.

---

## Section D — Accounts, Reports, and Payment UX

### Question D1 — User Accounts
Does the MVP require user accounts (login/password or magic link), or can purchases be guest-checkout with report access via a secure emailed link?

A) Guest checkout only for MVP — report access via secure link/email, no account system (simplest, fastest to ship, avoids auth complexity)

B) Optional accounts — guest checkout works, but users can also create an account to see report history (valuable for the repeat-professional-user persona)

C) Accounts required at purchase (needed to support professional repeat use and dashboards from day one)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

Support optional accounts.

Guest checkout should remain possible so a one-time customer does not have to create an account
simply to purchase a report.

Users who want an account should be able to use it for capabilities such as report history and
repeat property analysis, particularly if professional or repeat users become the primary
customer persona.

Keep the initial account implementation proportionate to actual MVP needs.

### Question D2 — Report Output Format
What report format(s) should MVP support?

A) Web-based report only (interactive, accessible online, no PDF)

B) PDF only

C) Both — web-based primary experience, downloadable PDF as a secondary export

X) Other (please describe after [Answer]: tag below)

[Answer]: C

Use a web-based report as the primary experience, with a downloadable PDF as a secondary
artifact/export.

The web experience should support accessible presentation, maps, evidence, and interactive
information where useful.

The PDF should provide a durable, portable snapshot that a purchaser can save, reference, or
share.

### Question D3 — Re-running a Report / Report Freshness
The brief says a paid report is a durable, point-in-time snapshot that must not silently change. If a user wants an updated report later (e.g. rules changed, or they want to try a different project type on the same parcel), should that be:

A) A brand-new paid report (simplest; each report is a fresh $9.99 transaction, prior ones stay as historical snapshots)

B) A discounted "re-run" price for an existing purchaser on the same parcel within some window

C) Decide during pricing/economics analysis — don't lock this in now

X) Other (please describe after [Answer]: tag below)

[Answer]: C

Do not lock in the re-run pricing policy yet.

Evaluate this during pricing, product, and unit-economics analysis. Preserve the core requirement
that each generated report is an immutable point-in-time snapshot.

If updated/re-run reports are introduced, they should produce new report artifacts rather than
silently modifying historical reports.

### Question D4 — Pricing Flexibility
The brief treats $9.99 as a hypothesis to be evaluated, not a commitment. If the unit-economics research shows $9.99 has unacceptable or marginal margin at the LLM/data costs discovered, how much latitude do you want Inception to have in recommending a different number or model?

A) Full latitude — recommend whatever price/model the economics support, including tiered pricing (e.g. lightweight vs. full report), and justify it

B) Stay near $9.99 (e.g. $5-$15 range) even if margins are thinner — pricing accessibility matters more right now

C) I want to review the economics myself and set the price — just show me the numbers, don't recommend a number

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Treat $9.99 as a hypothesis, not a required price.

Recommend whatever pricing structure the economics and customer-value analysis support.

This may include a different single-report price or, if strongly justified, different report
tiers such as lightweight screening, deeper preflight, or vacant-land analysis.

However, avoid introducing pricing complexity merely because it is possible. The MVP should
remain simple unless meaningful differences in value or cost justify multiple tiers.

---

## Section E — Team, Timeline, and Operational Reality

### Question E1 — Team Size / Solo vs. Team
Is this being built by a solo developer/founder, or is there a team? This affects how much Inception should invest in parallelizable units of work vs. a simpler sequential build plan.

A) Solo developer/founder (me), at least initially

B) Small team (2-5 people)

C) Larger team

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Assume I am a solo developer/founder initially.

Design the implementation plan accordingly. Favor a clear sequential Construction path,
manageable units of work, maintainability, automation, and low operational burden rather than an
architecture optimized for a large engineering team.

### Question E2 — Regulatory Domain Expertise
The brief requires human approval before any regulatory rule (setback, zoning, critical-area interpretation) goes live. Who will perform that review — i.e., who is verifying that "rear setback = 5 ft for this zone" is actually correct against the Seattle Municipal Code?

A) I (or someone on my team) will personally research and verify rules against SMC/SDCI sources, with AI assistance drafting candidate rules for my review

B) I plan to hire/contract someone with Seattle land-use/zoning expertise for this

C) I'm expecting the AI/product itself to be the primary source of rule accuracy verification (flag: brief explicitly prohibits this for production rules — I'll note this as a risk if selected)

X) Other (please describe after [Answer]: tag below)

[Answer]: X

**REVISED 2026-08-19** (original answer superseded — see audit.md for the original text and the
reasoning behind this revision).

I do not want the operating model to assume I personally perform all regulatory research from
scratch or independently interpret every regulatory rule. As a solo founder, that would likely
make rule-coverage expansion impractically slow.

Instead, design the regulatory rule-development workflow around AI-assisted research with human
verification and risk-based escalation:

authoritative primary sources → AI-assisted regulatory research → candidate rule package → human
verification → automated tests → human approval → production rule

The AI-assisted research process may:

- locate potentially applicable SMC provisions
- follow definitions and cross-references
- locate relevant SDCI guidance
- locate relevant City Clerk/Legistar ordinances and amendment history
- identify effective dates
- identify exceptions and conditional provisions
- identify potentially conflicting or ambiguous provisions
- draft a structured candidate rule specification
- propose citations/evidence
- propose boundary, pass, fail, and exception test cases
- summarize the reasoning supporting the candidate rule

The resulting candidate rule package should make verification efficient by presenting the
relevant primary-source evidence and reasoning together.

AI must still NOT have authority to activate a regulatory rule.

For rules that are straightforward and well-supported by authoritative sources, I may perform the
human verification and approval of the candidate rule package myself.

For rules that are ambiguous, unusually consequential, involve significant legal interpretation,
contain difficult exceptions, or otherwise exceed a defined risk threshold, require escalation to
an appropriate Seattle land-use/domain professional or counsel before activation.

A risk-based rule-review model determining which candidate rules can reasonably receive founder
verification vs. which require domain-expert review should be designed during Inception, along
with consideration of the operational/economic implications (including whether professional rule
review should eventually be treated as a business/maintenance cost).

This does not change the core requirement that production regulatory behavior must be
deterministic, sourced, tested, versioned, auditable, and human-approved.

### Question E3 — Pre-Construction Validation (the ~10-property test)
The brief requires validating the concept against ~10 real Seattle properties before substantial build, evaluating data completeness, rule coverage, % UNKNOWN, and willingness to pay. How do you want this run?

A) As an early, small, human-in-the-loop unit of work I approve separately before the main build (spreadsheet/script-assisted, not a full app) — recommended, matches the brief's intent

B) Skip formal validation and proceed straight to building the full MVP — I'm confident enough already

C) I'll perform this validation myself outside of AI-DLC and report results back to you

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Perform the approximately 10-property validation as an early, small, human-in-the-loop unit of
work before substantial application Construction.

It may use spreadsheets, scripts, manual research, GIS tools, or other lightweight techniques
rather than requiring the application itself to exist.

The goal is to validate:

- data availability and completeness
- property-resolution feasibility
- regulatory rule coverage
- spatial-analysis feasibility
- frequency and severity of UNKNOWN findings
- report usefulness
- professional/user feedback
- willingness to pay
- approximate report-generation cost
- whether the product can actually deliver enough value to justify building the full MVP

Treat this as a genuine product/technical validation gate rather than a ceremonial exercise.

If the validation exposes a fundamental problem, surface it before substantial Construction.

### Question E4 — Timeline / Budget Constraints
Are there any hard timeline or budget constraints Inception should design around (e.g. a launch date, a monthly infra budget ceiling, a total pre-revenue runway)?

A) No hard constraints right now — optimize for getting a genuinely useful, correct MVP; note-worthy budget concerns can be flagged as they arise

B) Yes — describe the constraint after [Answer]: below

X) Other (please describe after [Answer]: tag below)

[Answer]: A

There are no hard launch-date or total-budget constraints right now.

Optimize for producing a genuinely useful, trustworthy, maintainable MVP rather than meeting an
arbitrary deadline.

Continue to flag material costs, unexpectedly expensive dependencies, or architectural decisions
that would create significant ongoing operational expense.

### Question E5 — Legal Counsel Access
The brief asks Inception to flag items for legal review (ToS, disclaimers, liability, data licensing, "preliminary feasibility" language, professional-services implications) rather than resolve them itself. Do you currently have access to legal counsel to review these before public launch, or should Inception's output assume that's still to be arranged?

A) Not yet arranged — Inception should produce a clear "questions for counsel" list as an artifact, but assume launch planning proceeds in parallel with arranging counsel

B) Counsel is already available and will review before launch

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Legal counsel has not yet been arranged specifically for this project.

Produce a clear "questions for counsel" / legal-review artifact covering issues that should be
professionally reviewed before public launch.

Inception and development planning may continue while counsel is being arranged, but do not
treat AI-generated legal analysis as final legal approval.

---

## Section F — Technical Preferences Beyond the Brief

### Question F1 — Hosting/Deployment Preference
The brief prefers Next.js/TypeScript/Postgres+PostGIS as a modular monolith but doesn't name a hosting provider. Do you have an existing preference (e.g. Vercel, AWS, Fly.io, Render) or should Inception's infra research recommend one based on cost/fit?

A) No preference — recommend based on the cost/architecture research (Vercel for Next.js + managed Postgres/PostGIS like Neon/Supabase/RDS is the likely default recommendation)

B) I have a preference — describe it after [Answer]: below

X) Other (please describe after [Answer]: tag below)

[Answer]: A

I do not have a required hosting provider.

Recommend the deployment architecture based on:

- technical fit
- Postgres/PostGIS requirements
- Next.js compatibility
- security
- operational simplicity for a solo developer
- reliability
- observability
- scalability appropriate to expected demand
- development experience
- vendor lock-in
- expected fixed and variable costs

Vercel plus an appropriate managed PostgreSQL/PostGIS provider may be considered, but do not
assume it is automatically the best architecture. Compare reasonable alternatives and recommend
the best fit for this product.

### Question F2 — Existing Accounts/Infra Already in Place
Do you already have any accounts, API keys, domains, or infrastructure provisioned for this project (Anthropic API key, Stripe account, a cloud provider account, a domain name), or is Inception planning for a totally clean setup?

A) Clean setup — nothing exists yet, plan accordingly

B) Some things already exist — describe after [Answer]: below

X) Other (please describe after [Answer]: tag below)

[Answer]: A

Treat this as a clean setup.

No Permit Preflight-specific production infrastructure, API keys, Stripe configuration,
Anthropic API configuration, domains, databases, or cloud resources should be assumed to exist
yet.

Plan their secure creation/configuration at the appropriate later stage.

---

**When you're done, let me know and I'll read your answers, check for contradictions/ambiguities, and proceed (asking follow-ups only if something doesn't add up).**
