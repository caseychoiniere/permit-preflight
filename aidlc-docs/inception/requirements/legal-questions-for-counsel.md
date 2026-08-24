# Permit Preflight — Questions for Legal Counsel

**Purpose**: Per Brief §48 and your E5 answer, this is a list of items requiring professional legal
review before public launch. This document is a work product of AI-DLC Inception research
(`research-findings.md`) and product requirements analysis. **It is not legal advice, does not
constitute legal analysis, and must not be treated as final legal approval for any of the items
below.** Counsel has not yet been engaged for this project (per E5); this list is meant to give
counsel a fast, concrete starting point once engaged.

---

## 1. Data Licensing & Commercial Use
- Confirm whether building a commercial report product on King County GIS/parcel data (which uses
  the underlying data as an *input to a synthesized product* rather than reselling the raw
  dataset) is consistent with King County's "no resale without written agreement" term, or whether
  a written data-use agreement with King County should be obtained proactively.
- Confirm appropriate handling of King County Assessor **owner-name** data given RCW 42.56.070(9)'s
  restriction on commercial use of "lists of individuals" — specifically, confirm the product's
  planned approach (not displaying/exporting raw owner-name lists as a feature) is sufficient, or
  whether additional restrictions apply to any owner-name display within a report.
- Confirm Seattle Open Data / GeoData license terms (believed PDDL/public domain, not independently
  read in full — see `research-findings.md` §1.3) before relying on that assumption commercially.

## 2. Seattle Municipal Code / Municode Use
- Confirm whether Municode's clickwrap terms of use (personal-use-only, no commercial exploitation,
  no derivative works "from the website or its content") impose any restriction on Permit Preflight's
  intended practice — human employees reading the current SMC on Municode for research purposes,
  then writing **independent, original rule specifications** citing the relevant section and
  ordinance number, without reproducing Municode's compiled/annotated text — beyond what the
  government edicts doctrine (*Georgia v. Public.Resource.Org*, 2020) already permits for the
  underlying law itself. This is a narrow question about a private codifier's contractual terms
  layered on top of otherwise-public-domain legal text; see `research-findings.md` §1.7 for the
  full research trail.
- Confirm whether citing specific ordinance numbers and effective dates sourced from
  `clerk.seattle.gov`/Seattle Legistar (the City's own official legislative records) as the
  provenance/change-tracking source for rule versioning is appropriate and sufficient.

## 3. Product Positioning & Disclaimers ("Unauthorized Practice" Risk)
- Review and approve final disclaimer/Terms of Service language distinguishing "preliminary
  screening information" from professional advice requiring licensure (architecture, engineering,
  surveying, law). Comparable disclaimer patterns identified in research (Zillow Zestimate's
  "as-is, no warranty, not a substitute for an appraisal" language; mortgage pre-qualification
  tools' "not a commitment" language) are a starting reference point, not a drop-in template.
- Confirm the report's framing (findings classified KNOWN / INFERRED / REQUIRES VERIFICATION,
  explicit "not a permit guarantee" language per Brief §1) is legally sufficient to avoid
  unauthorized-practice-of-architecture/engineering/law exposure in Washington State specifically.

## 4. Payment & Refunds
- Review refund policy (Brief §30-§31: what happens when payment succeeds but report generation
  fails or produces insufficient evidence for a valid report) for consumer-protection compliance.
- Confirm Stripe Terms of Service / merchant-of-record obligations relevant to a one-off digital
  report product.

## 5. Data Privacy
- Confirm what user/customer data handling requires a formal Privacy Policy disclosure (address
  entered, payment info via Stripe, any account data, any data sent to the Anthropic API).
- Confirm Anthropic's data-retention/training-usage terms (`research-findings.md` §2 — commercial
  API content reportedly not used for training and not retained by default, per Anthropic's public
  docs as of 2026-08-19) are sufficient for any privacy commitments made to customers, or whether a
  formal Data Processing Agreement / Zero Data Retention arrangement with Anthropic should be
  pursued before launch.

## 6. Business Entity & Terms of Service
- Confirm appropriate business entity formation before accepting payments commercially (brand name
  "Permit Preflight" is currently a working name only, per B2 — no legal entity formed yet).
- Draft/review full Terms of Service and Privacy Policy prior to public launch.

---

**Status**: Open. No items above have been reviewed by counsel as of this document's creation
(2026-08-19). None are blockers to continuing Inception/Construction planning, but items 1-3
should be prioritized before public launch given their direct bearing on the regulatory rules
engine and product positioning.
