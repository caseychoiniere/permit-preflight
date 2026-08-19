Using AI-DLC, perform the Inception phase for the MVP of Permit Preflight.

Do not begin implementation until the AI-DLC Inception workflow has been
completed, its artifacts have been reviewed, and explicit approval to proceed
has been given.

This document describes our current product direction, architectural
preferences, constraints, and assumptions.

These are strong starting requirements, but they are not unquestionable.

A major purpose of Inception is to determine whether our assumptions are
technically, economically, legally, operationally, and product-wise sound
before substantial implementation begins.


# 1. PRODUCT VISION

Permit Preflight is a Seattle-first residential buildability intelligence
platform.

It helps users answer two expensive questions before spending significant
money on professional due diligence:

1. EXISTING PROPERTY

   "Can I build this here?"

2. VACANT LAND

   "What could I reasonably build here?"

Permit Preflight aggregates authoritative property and regulatory information,
performs deterministic spatial and regulatory analysis, identifies unknowns,
and produces an evidence-backed preliminary feasibility report.

The product is intended for EARLY SCREENING AND DUE DILIGENCE.

It does NOT:

- guarantee permit approval
- provide architectural design
- provide engineering certification
- provide surveying
- provide title opinions
- provide legal advice
- replace architects
- replace engineers
- replace surveyors
- replace attorneys
- replace utility providers
- replace the permitting authority

The working value proposition is:

"Know what you can build before you spend money finding out."


# 2. MVP GEOGRAPHIC SCOPE

The initial regulatory jurisdiction is:

Seattle, Washington.

King County and other authoritative sources may provide parcel, assessor,
GIS, environmental, utility, or other underlying data.

However, Seattle is the only regulatory jurisdiction that should be supported
by the initial MVP.

Do not expand the MVP to other municipalities or unincorporated King County
without explicit approval.

The architecture should nevertheless avoid unnecessary assumptions that make
future jurisdiction expansion prohibitively difficult.


# 3. MVP PROJECT TYPES

The platform should be architected to support:

- sheds and accessory structures
- decks
- detached garages
- fences
- retaining walls
- residential additions
- ADUs
- vacant residential land analysis

Not every project type must have identical analytical depth at launch.

Capabilities should be capable of being introduced incrementally on top of a
shared property-intelligence and rules architecture.

During Inception, recommend an implementation order based on:

- user value
- rule complexity
- data availability
- spatial complexity
- validation difficulty
- usefulness for proving the core architecture


# 4. TARGET USERS

Potential initial users include:

- homeowners
- prospective property buyers
- small residential developers
- builders
- real-estate investors
- architects/design professionals
- real-estate agents

Professional users are strategically important because they may evaluate many
properties and therefore have recurring need for the product.

However, do not assume that all of these personas should be targeted equally
at launch.

During Inception, identify the strongest initial customer persona and explain
why.

Consider:

- frequency of use
- urgency of problem
- willingness to pay
- existing alternatives
- customer acquisition difficulty
- required report depth
- tolerance for preliminary results


# 5. EXISTING-PROPERTY WORKFLOW

A user:

1. Enters an address.
2. The system resolves the address to the correct parcel.
3. The user selects a proposed project type.
4. The user provides relevant project information such as:
   - dimensions
   - height
   - approximate location
   - other project-specific information
5. The system gathers authoritative property data.
6. The system evaluates applicable spatial and regulatory constraints.
7. The user receives an evidence-backed preliminary feasibility report.

Where practical, the map should visually communicate areas that appear:

- likely buildable
- conditionally buildable / requiring review
- constrained or unavailable

The long-term experience may allow users to position proposed structures on
the parcel map and receive updated spatial feasibility feedback.


# 6. VACANT-LAND WORKFLOW

A user enters:

- an address
- parcel number
- or another supported parcel identifier

The system should identify, where reliably possible:

- parcel characteristics
- jurisdiction
- zoning
- mapped development constraints
- preliminary buildable area/envelope
- plausible supported residential development scenarios
- major diligence risks
- important unknowns requiring professional verification

The purpose is rapid acquisition screening, not definitive entitlement
analysis.

A professional user should be able to answer:

"Does this parcel deserve deeper investigation?"

without manually researching every relevant government source.


# 7. PROPERTY RESOLUTION

Do not assume that:

one address = one parcel.

The system must account for potential ambiguity including:

- multiple parcels associated with an address
- parcels without conventional addresses
- vacant parcels
- corner lots
- merged/split parcels
- condominium situations
- malformed addresses
- uncertain geocoding results

During Inception, define a property-resolution strategy.

When parcel identity cannot be established with sufficient confidence, the
system should ask for clarification rather than silently selecting a parcel.


# 8. CORE ARCHITECTURE

The intended conceptual architecture is:

Government / authoritative public data
                ↓
       Property intelligence
                ↓
      Normalized property model
                ↓
      ┌─────────────────────┐
      │                     │
PostGIS spatial       Versioned deterministic
analysis              regulatory rules
      │                     │
      └──────────┬──────────┘
                 ↓
           Evidence graph
                 ↓
     Deterministic preflight result
                 ↓
        ┌────────┴────────┐
        │                 │
 Application logic     LLM layer
        │                 │
        └────────┬────────┘
                 ↓
        User-facing report

This represents an intentional architectural direction.

During Inception:

- evaluate it critically
- identify missing components
- identify unnecessary complexity
- identify dangerous assumptions

Do not replace it merely because another architecture is possible.

If there is a compelling reason to change a major architectural decision,
document the reason and request approval.


# 9. TECHNOLOGY DIRECTION

Preferred initial stack:

- Next.js
- TypeScript
- PostgreSQL
- PostGIS
- Drizzle ORM
- MapLibre GL JS

Prefer a modular monolith initially.

Avoid introducing:

- unnecessary microservices
- unnecessary languages
- Kubernetes
- complex distributed systems
- message queues
- additional infrastructure

unless a demonstrated MVP requirement justifies them.

A Python/geospatial service may be considered later if workloads such as:

- raster processing
- advanced GIS processing
- machine learning
- computer vision
- bulk parcel processing

justify it.

Do not assume Python is required for the MVP.

Technology choices should favor:

- maintainability
- type safety
- testability
- security
- observability
- reasonable operating cost
- portability
- straightforward local development


# 10. PROPERTY INTELLIGENCE

The application should construct a canonical PropertyContext from fragmented
authoritative sources.

Potential sources include:

- King County parcel/GIS data
- King County Assessor data
- Seattle GIS datasets
- Seattle zoning data
- Seattle environmentally critical area datasets
- Seattle permit data
- Seattle Municipal Code
- Seattle Department of Construction & Inspections guidance
- FEMA datasets
- utility datasets
- authoritative imagery/elevation sources
- other authoritative sources identified during Inception

Do NOT assume all required data exists or is accessible.

During Inception determine:

- what datasets exist
- publisher
- authority
- access method
- API/download availability
- format
- update frequency
- effective dates
- licensing
- commercial-use restrictions
- redistribution restrictions
- rate limits
- reliability
- geographic coverage
- historical availability
- cost
- known gaps

Identify any missing dataset capable of materially threatening the product
concept.


# 11. DATA LICENSING

Public accessibility must NOT be assumed to mean unrestricted commercial use.

For every important dataset, determine where possible:

- license
- terms of use
- commercial-use permissions
- attribution requirements
- caching restrictions
- redistribution restrictions
- derivative-data restrictions

Flag unclear licensing for human/legal review.

Do not build a commercial product dependency around a dataset whose permitted
use has not been established.


# 12. NORMALIZED PROPERTY MODEL

External dataset schemas should not propagate throughout application logic.

Normalize external information into stable internal domain models.

Property facts should preserve provenance.

Conceptually, a property fact may contain:

- value
- source agency
- dataset
- source identifier
- retrieval timestamp
- effective date
- source reference
- evidence type
- confidence

The exact schema should be designed during Inception.


# 13. EVIDENCE CLASSIFICATION

The system must distinguish:

KNOWN

Directly supported by authoritative information or deterministic rules.

INFERRED

Derived through spatial calculation or another defensible analytical process.

REQUIRES VERIFICATION

Cannot reliably be established using available information.

Examples may include requirements for:

- survey
- field inspection
- engineering
- geotechnical review
- title research
- tree measurement
- utility confirmation
- professional interpretation

These classifications must exist in the domain model.

They are not merely presentation labels.

Never silently convert missing information into PASS.

UNKNOWN / REQUIRES VERIFICATION is a legitimate and desirable result when
evidence is insufficient.


# 14. REGULATORY RULES ENGINE

Regulatory conclusions must not depend on an LLM performing ad-hoc municipal
code interpretation at runtime.

Prefer deterministic and testable regulatory logic.

Rules must be:

- jurisdiction-specific
- traceable to authoritative sources
- versioned
- associated with effective dates where possible
- testable
- auditable

Simple rules may eventually be represented as structured data.

Complex rules may be implemented as typed TypeScript logic.

Do not introduce a generic rules-engine framework unless it provides a
demonstrated advantage over typed application logic.


# 15. REGULATORY RULE LIFECYCLE

Regulatory rules must have a controlled publication lifecycle.

Conceptually:

RESEARCHED
    ↓
DRAFTED
    ↓
SOURCE VERIFIED
    ↓
TESTED
    ↓
APPROVED
    ↓
ACTIVE
    ↓
SUPERSEDED

Exact states may be refined during Inception.

AI-generated or AI-researched rules must NOT automatically become production
rules.

Activation of a regulatory rule should require an explicit human approval
process.

The architecture should allow:

- rule inspection
- source inspection
- testing
- approval
- activation
- superseding old versions
- historical reproducibility


# 16. RULE TESTING

Every regulatory rule should eventually include:

- positive/pass tests
- negative/fail tests
- boundary tests
- applicable exception tests
- source references

Rule changes must be regression tested.

Fixture-based property/project scenarios should become a major component of
the test suite.

Where possible, fixtures should correspond to real or independently validated
Seattle scenarios.


# 17. SPATIAL ANALYSIS

PostGIS should be the primary spatial computation engine where appropriate.

Expected capabilities may include:

- parcel containment
- intersection
- setbacks
- distance calculations
- critical-area intersection
- percentage of parcel affected
- proposed structure placement
- buildable-envelope calculations
- geometry validation
- nearby/comparable permit searches
- spatial indexing

Do not perform critical spatial determinations through LLM reasoning.

Spatial calculations should be:

- deterministic
- testable
- reproducible


# 18. LLM / AI ARCHITECTURE

The production application may use an LLM for non-authoritative intelligence,
classification, synthesis, and explanation.

Initial preferred provider:

Anthropic Claude API.

Model usage must be isolated behind an internal AI service abstraction so
providers or model tiers can be changed without modifying core domain logic.

Potential LLM responsibilities:

- explain deterministic findings in plain language
- synthesize findings into a useful report
- highlight important constraints
- generate recommended diligence questions
- generate suggested next steps
- classify permit descriptions
- extract structured information from unstructured records
- perform other non-authoritative enrichment

The LLM must NOT:

- determine regulatory compliance
- determine authoritative spatial feasibility
- override deterministic findings
- invent property facts
- invent regulatory requirements
- convert missing information into assumptions
- present inference as authoritative fact
- independently interpret municipal code at runtime and turn that
  interpretation into regulatory conclusions

The deterministic preflight must exist independently of the LLM.

The application must degrade gracefully if the LLM provider is unavailable.

Prefer schema-constrained structured output.

Validate LLM output before using it.

Where practical, generated explanations should reference finding/evidence IDs.


# 19. LLM PLANNING

During Inception define:

- MVP LLM use cases
- recommended Claude model/model tiers
- model-selection strategy
- AI service abstraction
- prompt architecture
- structured-output schemas
- token budgets
- estimated cost
- caching
- retries
- timeout behavior
- fallback behavior
- hallucination evaluation
- privacy implications
- security implications
- observability
- model/version tracking

Do not assume that the most powerful model should be used for every task.


# 20. SECURITY

Security is a first-class architectural requirement.

It must not be deferred as post-MVP cleanup.

Perform an explicit security/threat review during Inception.


# 21. SECRETS

API keys, database credentials, authentication secrets, signing keys, webhook
secrets, and service credentials must never be:

- committed to Git
- exposed in browser JavaScript
- included in client bundles
- returned from APIs
- logged
- stored unnecessarily
- included in LLM prompts

Use appropriate environment configuration or managed secret storage.

Server-only secrets must remain server-only.

Public/client-safe configuration and private/server configuration must be
clearly separated.


# 22. SERVER / CLIENT TRUST BOUNDARY

Treat all browser input as untrusted.

Sensitive operations execute server-side.

The client must never:

- connect directly to PostgreSQL
- receive database credentials
- receive LLM API keys
- receive Stripe secret keys
- receive privileged third-party credentials

Privileged external API access should occur through trusted server code.


# 23. AUTHENTICATION AND AUTHORIZATION

If accounts are included, design authentication and authorization explicitly.

Every server-side operation involving user-owned data must enforce ownership
or appropriate permissions.

Do not rely on:

- hidden UI
- client-side route protection
- user-supplied IDs
- obscurity

for authorization.

Future organization/team accounts may be considered architecturally, but do
not implement complex RBAC unless needed.


# 24. DATABASE SECURITY

Use least-privilege principles.

Evaluate:

- application database roles
- migration/admin roles
- production credential separation
- encrypted connections
- network exposure
- connection pooling
- backup security
- SQL injection
- raw SQL safety
- PostGIS query safety

Raw SQL must use safe parameterization.

Never concatenate untrusted input into SQL.


# 25. INPUT VALIDATION

All external input is untrusted, including:

- form input
- addresses
- parcel IDs
- dimensions
- map geometry
- query parameters
- route parameters
- uploaded content
- third-party API responses
- LLM responses

Use runtime schema validation at trust boundaries.

TypeScript compile-time typing is not sufficient.


# 26. API SECURITY

Consider:

- authentication
- authorization
- request validation
- rate limiting
- abuse prevention
- request-size limits
- timeouts
- safe error handling
- idempotency
- CSRF
- CORS
- denial-of-service risks

Do not expose unnecessary implementation details in errors.


# 27. LLM SECURITY

Treat LLM input and output as untrusted.

Consider:

- prompt injection
- malicious external-data content
- malicious user input
- structured-output validation
- token/cost abuse
- system-prompt extraction attempts
- secret exposure
- cross-user data leakage

LLMs must not have unrestricted access to infrastructure or credentials.

If tool calling is introduced, tools must expose narrowly scoped,
authorized, validated operations.

An LLM refusal is not a security control.


# 28. PAYMENT MODEL

The MVP is expected to support paid individual reports.

Initial pricing hypothesis:

$9.99 per report.

This is NOT finalized pricing.

Initial preferred provider:

Stripe.

Prefer Stripe-hosted Checkout or an equivalent approach that minimizes
cardholder-data exposure.

The application must not store or process raw:

- credit-card numbers
- CVVs
- equivalent sensitive card credentials


# 29. PAYMENT WORKFLOW

Conceptually:

Configure report
        ↓
Create pending order
        ↓
Create Stripe Checkout Session server-side
        ↓
Customer pays through Stripe
        ↓
Stripe sends signed webhook
        ↓
Server verifies webhook
        ↓
Order becomes PAID
        ↓
Report generation authorized
        ↓
Report generated
        ↓
Purchaser receives report access

A browser redirect is NOT authoritative proof of payment.

Never trust client-supplied payment status.

Report price must be determined/validated server-side.

A modified client request must not allow a user to purchase a report at an
arbitrary price.


# 30. PAYMENT SECURITY AND RELIABILITY

During Inception define:

- Checkout integration
- PCI implications
- Stripe secret management
- webhook signature verification
- webhook security
- idempotent processing
- duplicate/replayed event handling
- payment reconciliation
- refunds
- failed payments
- test vs production credentials
- authorization to purchased reports
- prevention of unpaid report generation

Treat:

- reports
- orders
- payments

as separate domain concepts.

An order lifecycle may resemble:

PENDING
PAID
GENERATING
COMPLETE
FAILED
REFUNDED

Exact states should be designed during Inception.


# 31. REPORT GENERATION FAILURE

Explicitly design what happens if a customer pays and report generation fails.

Possible failures include:

- external GIS outage
- government API outage
- LLM outage
- timeout
- insufficient evidence
- unexpected data format
- internal processing failure

Define:

- retry policy
- recovery
- user communication
- partial-report policy
- minimum evidence required for a valid paid report
- automatic/manual refund behavior
- support escalation

A successful payment must never leave the customer in an undefined state.


# 32. REPORT UNIT ECONOMICS

Determine the expected marginal cost of one report before finalizing pricing.

Include applicable variable costs:

- payment-processing fees
- LLM input tokens
- LLM output tokens
- geocoding
- map APIs
- paid GIS/property data
- external property APIs
- server compute
- PostGIS/database usage
- PDF/report generation
- object storage
- bandwidth
- email/notifications
- retries/failures
- other usage-based services

Separate VARIABLE COSTS from FIXED COSTS.

Fixed/base costs may include:

- hosting
- database plan
- monitoring
- domain
- email service
- paid datasets
- development tooling


# 33. COST MODEL

During Inception estimate cost at:

- 1 report
- 100 reports/month
- 1,000 reports/month
- 10,000 reports/month

Identify:

- free tiers
- usage pricing
- minimum commitments
- rate limits
- pricing cliffs
- volume discounts

Determine:

- estimated COGS/report
- contribution/report
- gross margin
- largest cost uncertainty
- maximum viable cost/report at $9.99


# 34. PRICING

Treat $9.99 as a hypothesis.

Evaluate pricing using:

1. COST FLOOR

What does the report cost us to generate while maintaining healthy margin?

2. CUSTOMER VALUE

What is the report worth given the research time, professional expense, or
investment risk it may reduce?

Do not automatically use cost-plus pricing.

Consider whether future offerings warrant different prices:

- lightweight screening
- full project preflight
- vacant-land acquisition report
- professional subscription
- bulk screening

Do not introduce unnecessary pricing complexity into the MVP.


# 35. COST OBSERVABILITY

The system should eventually make actual report cost measurable.

Where appropriate track:

- model used
- LLM input/output tokens
- AI cost
- external API cost
- payment fee
- generation duration
- retries
- other material variable costs

Avoid storing sensitive content merely for cost analysis.


# 36. REPORT PERSISTENCE AND REPRODUCIBILITY

A paid report must be treated as a durable product artifact.

During Inception determine:

- how reports are stored
- purchaser access
- report URLs
- downloadable/PDF requirements
- retention period
- deletion policy
- whether reports can be shared
- report ownership

Reports should represent a snapshot in time.

Where feasible, preserve enough information to reproduce why a report reached
its conclusions.

A historical report should not silently change because:

- municipal code changed
- zoning data changed
- a GIS layer changed
- an LLM model changed
- a rule was updated


# 37. AUDITABILITY

A user-facing conclusion should be traceable.

Example:

"Proposed garage fails rear setback"
        ↓
Measured setback: 3.7 ft
        ↓
PostGIS calculation
        ↓
Authoritative parcel geometry

AND

Required setback: 5 ft
        ↓
Versioned Seattle rule
        ↓
Specific authoritative source

Preserve sufficient information to understand:

- what data was used
- what rules were used
- when they were used
- what calculations occurred
- what LLM/model generated explanatory content


# 38. DATA FRESHNESS

Authoritative data changes.

Design a source registry that can eventually track:

- source
- owner/publisher
- expected refresh cadence
- last successful retrieval
- last observed update
- schema/version
- source health
- licensing
- ingestion failures

The system should detect or surface stale/unhealthy sources rather than
silently generating reports from unreliable data.


# 39. REGULATORY CHANGE MANAGEMENT

Municipal rules change.

During Inception define how the system will:

- discover regulatory changes
- review changes
- update rule implementations
- test updates
- approve new versions
- activate new versions
- supersede old versions
- preserve historical reports

Do not allow automated regulatory research to silently alter production
behavior.


# 40. REPORT GENERATION ARCHITECTURE

Do not assume report generation should occur within one synchronous HTTP
request.

A report may require:

- multiple external requests
- spatial calculations
- regulatory evaluation
- LLM synthesis
- document generation

During Inception determine whether the MVP needs:

- asynchronous jobs
- retries
- progress/status tracking
- polling
- durable job state
- idempotent generation

Do not introduce queues merely because they are common.

Introduce them only if justified by the actual workflow.


# 41. LOGGING AND OBSERVABILITY

Design structured observability.

Logs must not contain:

- secrets
- passwords
- auth tokens
- API keys
- database credentials
- unnecessary sensitive user information

Consider observability for:

- API failures
- GIS/data-source failures
- report generation
- rule evaluation
- LLM calls
- payment events
- security events
- source freshness
- report cost
- latency


# 42. PRODUCT ANALYTICS

Define the minimum analytics required to validate the business.

Potential funnel:

address entered
    ↓
parcel resolved
    ↓
project configured
    ↓
preview displayed
    ↓
checkout started
    ↓
payment completed
    ↓
report generated
    ↓
report viewed

Potential metrics:

- parcel-resolution success
- checkout conversion
- generation failure rate
- generation duration
- report cost
- project-type demand
- UNKNOWN frequency
- user abandonment
- repeat professional usage

Analytics collection must respect security and privacy requirements.


# 43. DATA PRIVACY

Minimize personal-data collection.

During Inception determine:

- what user information is necessary
- retention
- deletion
- account deletion
- what information goes to third parties
- what information goes to the LLM
- what information is actually necessary for report generation

Do not send data to an LLM merely because it is available.


# 44. ACCESSIBILITY

Accessibility is an MVP architectural concern.

The product will likely be map-heavy.

Do not make the map the only means of understanding a result.

Important information should also have an accessible non-map representation.

Plan for:

- keyboard accessibility
- screen-reader compatibility
- semantic UI
- appropriate contrast
- accessible forms
- understandable validation/errors
- accessible report output

Use appropriate WCAG guidance during implementation.


# 45. MOBILE EXPERIENCE

Assume users may use the product:

- at home
- while evaluating a property
- while physically standing on a site

The core workflow should function effectively on mobile devices.

Do not require desktop-only interaction for essential report functionality.


# 46. ADMIN / INTERNAL TOOLING

Plan for lightweight internal administrative capabilities.

Potential needs include:

- inspect reports
- inspect evidence
- inspect rule versions
- inspect source failures
- inspect generation failures
- inspect payment state
- issue/refund purchases
- disable problematic rules
- mark sources unhealthy
- investigate customer complaints

Do not overbuild an enterprise admin platform.

However, avoid an architecture where production behavior can only be
diagnosed by manually querying the database.


# 47. CUSTOMER SUPPORT AND DISPUTES

Design for cases where a customer says:

"Your report was wrong."

The system should provide enough auditability to investigate:

- report ID
- property
- source data
- timestamps
- rule versions
- calculations
- evidence
- LLM/model version

During Inception define a minimal process for:

- customer support
- correction requests
- regulatory-rule error reports
- refunds
- escalation
- documenting known issues


# 48. LEGAL / LIABILITY REVIEW

Identify areas requiring professional legal review before public launch.

Potential areas include:

- Terms of Service
- Privacy Policy
- disclaimers
- limitation of liability
- refund policy
- data licensing
- regulatory positioning
- use of "preliminary feasibility" language
- professional-services implications

AI-DLC should identify questions for counsel.

It must not substitute its own conclusions for legal advice where professional
review is appropriate.


# 49. BACKUPS AND DISASTER RECOVERY

Once customers pay for reports, those reports and associated records have
business value.

During Inception define appropriate MVP requirements for:

- database backups
- backup retention
- restore procedures
- object-storage durability
- migration safety
- report recovery
- acceptable data loss
- environment separation

Avoid enterprise-level overengineering, but do not operate without a viable
recovery strategy.


# 50. DEPENDENCY / SUPPLY-CHAIN SECURITY

Use maintained dependencies from trusted sources.

Avoid unnecessary packages.

During implementation:

- maintain lockfiles
- review significant dependencies
- monitor vulnerabilities
- keep security-critical dependencies current
- avoid unnecessary execution of untrusted scripts/packages


# 51. DEPLOYMENT SECURITY

During Inception define:

- HTTPS/TLS
- secret management
- development/staging/production separation
- production DB network access
- least-privilege credentials
- secure CI/CD secret handling
- backup strategy
- vulnerability scanning
- logging
- error monitoring

Do not reuse production secrets unnecessarily across environments.


# 52. SECURITY TESTING

Security should be included in acceptance criteria.

Consider:

- authorization tests
- input validation tests
- injection tests
- secret exposure checks
- dependency scanning
- rate-limit/abuse tests
- cross-user access tests
- webhook security tests
- LLM prompt-injection/adversarial tests

Identify which controls are required for MVP and which can safely be deferred.


# 53. MVP BOUNDARIES

Explicitly out of scope initially:

- commercial development
- industrial development
- major multifamily development
- subdivisions
- complete permit preparation
- permit submission
- architectural design
- engineering certification
- surveying
- title/legal opinions
- permit guarantees
- native mobile apps
- multi-region architecture
- Kubernetes
- enterprise SSO
- sophisticated organization RBAC
- dozens of municipalities
- custom machine-learning models

Do not expand into these areas without explicit approval.


# 54. DEVELOPMENT PHILOSOPHY

Prefer:

- simple architecture
- modular monolith
- deterministic behavior
- explicit domain models
- evidence over assumptions
- runtime validation at trust boundaries
- strong automated testing
- small reviewable units of work
- incremental vertical slices
- secure defaults
- observable behavior
- human approval for high-risk regulatory changes

Avoid:

- premature microservices
- speculative abstractions
- unnecessary infrastructure
- unnecessary dependencies
- hidden coupling to external schemas
- LLM regulatory decision making
- client-side privileged operations
- uncontrolled scope expansion


# 55. PRODUCT PHILOSOPHY

Permit Preflight is a SCREENING and EARLY-DILIGENCE product.

The goal is NOT:

"Tell me with certainty whether the city will approve my project."

The goal is:

"Tell me what authoritative public information currently indicates, identify
obvious opportunities and constraints, tell me what we cannot know, and help
me determine whether this project/property is worth investigating further."

Trustworthiness is more important than appearing certain.

UNKNOWN is preferable to an unsupported conclusion.

False precision is a product defect.


# 56. PRE-CONSTRUCTION PRODUCT VALIDATION

Do not assume that technical feasibility means product viability.

Before substantial implementation, validate the concept using approximately
10 real Seattle properties.

Include a mix of:

- normal developed residential parcels
- constrained parcels
- vacant parcels
- different supported project scenarios

Manually or semi-manually determine whether available data is sufficient to
produce a report that would actually be valuable.

Evaluate:

- data completeness
- rule coverage
- percentage of UNKNOWN findings
- report usefulness
- professional review feedback
- user willingness to pay
- expected report cost

This validation may occur before or as an early approved unit of work, but
should precede substantial product construction.

If the available data cannot support a useful report, surface that finding
rather than building around it.


# 57. INCEPTION OBJECTIVES

Use the AI-DLC Inception workflow before implementation.

During Inception:

1. Validate and refine product requirements.
2. Identify missing requirements.
3. Challenge assumptions.
4. Recommend the strongest initial customer persona.
5. Evaluate MVP project-type scope.
6. Identify required external datasets.
7. Verify dataset accessibility.
8. Evaluate dataset licensing/commercial-use restrictions.
9. Identify important data gaps.
10. Define property resolution.
11. Define the canonical property model.
12. Define provenance/evidence modeling.
13. Define regulatory rules architecture.
14. Define rule lifecycle and approval.
15. Define geospatial architecture.
16. Define rule/version change management.
17. Define data freshness/source monitoring.
18. Define report persistence and reproducibility.
19. Define report-generation architecture.
20. Define LLM architecture.
21. Define model selection and cost strategy.
22. Define security architecture and threat model.
23. Define authentication/authorization requirements.
24. Define secret/API-key management.
25. Define database security.
26. Define API security.
27. Define LLM-specific security.
28. Define payment architecture.
29. Define payment failure/recovery behavior.
30. Define report-generation failure/recovery behavior.
31. Estimate report unit economics.
32. Evaluate the $9.99 pricing hypothesis.
33. Define cost observability.
34. Define product analytics.
35. Define logging/technical observability.
36. Define privacy requirements.
37. Define accessibility requirements.
38. Define mobile requirements.
39. Define minimal admin tooling.
40. Define customer-support/dispute requirements.
41. Identify legal-review requirements.
42. Define backup/recovery requirements.
43. Identify major technical risks.
44. Identify regulatory risks.
45. Identify security/privacy risks.
46. Identify economic risks.
47. Identify product risks.
48. Identify unknowns requiring validation.
49. Define pre-construction validation.
50. Break the MVP into appropriate units of work.
51. Recommend implementation order.
52. Define testing strategy.
53. Define security testing.
54. Identify decisions requiring human approval.
55. Identify the smallest vertical slice capable of proving the core property
    intelligence architecture.


# 58. IMPORTANT INCEPTION BEHAVIOR

Do not treat this brief as unquestionable.

If research reveals that:

- an essential dataset is unavailable
- data cannot legally be used commercially
- available data produces too many unknowns
- an architectural choice is inappropriate
- a regulatory feature cannot be implemented reliably
- an LLM use case creates unacceptable risk
- a security assumption is unsafe
- $9.99 produces unacceptable economics
- the proposed MVP is substantially larger than expected
- the technology stack is poorly suited to an important requirement
- our target customer is wrong
- customers are unlikely to pay
- or another assumption threatens viability

surface that finding explicitly.

Do NOT silently engineer around a fundamental problem.

Prefer discovering during Inception that an assumption is wrong rather than
spending time implementing it.


# 59. IMPLEMENTATION GATE

Do not begin application implementation during Inception.

Produce the appropriate AI-DLC Inception artifacts and stop at the approval
gate.

Before Construction begins, summarize for human review:

- proposed product scope
- recommended initial customer
- major architectural decisions
- datasets and sources
- licensing findings
- important data gaps
- regulatory architecture
- LLM architecture
- security architecture
- payment architecture
- estimated unit economics
- pricing recommendation
- validation plan/results where available
- proposed units of work
- implementation order
- major risks
- unresolved questions
- decisions requiring human approval

Construction begins only after explicit approval.