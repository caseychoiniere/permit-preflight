# Permit Preflight — Personas

Per the approved story-generation-plan.md (Question 4): four personas, with guest-vs-authenticated
purchase treated as a mode/attribute rather than a separate persona.

---

## 1. Professional / Repeat Property Evaluator — **PRIMARY PERSONA**

**Who**: A small residential developer, real-estate investor, builder, or similar repeat evaluator
who screens multiple Seattle residential properties per month or year to decide whether a property
justifies deeper diligence, acquisition, or a specific project.

**Goals**:
- Screen many candidate properties quickly and cheaply before committing to paid professional diligence.
- Get evidence-backed, appropriately-hedged answers (KNOWN/INFERRED/REQUIRES VERIFICATION) rather than false confidence.
- Track report history across properties over time (portfolio-style repeat use).
- Interpret preliminary/UNKNOWN results correctly without excess hand-holding.

**Frequency of use**: High — potentially several to many properties per month.

**Willingness to pay**: High relative to deal size; $9.99+ is trivial against the financial stakes of a development/acquisition decision.

**Technical/domain comfort**: High — comfortable with zoning terminology, spatial concepts, and appropriately-hedged preliminary findings.

**Relationship to product priority**: Per requirements.md §1.3 (approved), this persona drives product prioritization, report usefulness, repeat-use capabilities, and future business-model decisions. **This must not make the core experience enterprise-oriented or unnecessarily complex** — professional-oriented capability (report history, repeat-property workflows) is added *additively*, not by complicating the primary report flow that homeowners also use.

---

## 2. Homeowner / Prospective Buyer — **SECONDARY PERSONA**

**Who**: An individual homeowner considering a small residential project (shed, deck, garage,
addition, ADU) on their own property, or a prospective buyer evaluating a property before purchase.

**Goals**:
- Understand quickly and affordably whether an idea is feasible before spending money on architects, surveys, or permit applications.
- Get a plain-language explanation of results, not raw zoning-code jargon.
- Make a specific, often time-pressured decision (e.g., before a home purchase closes, or before committing to a construction project).

**Frequency of use**: Very low — typically once, years apart from any repeat use.

**Willingness to pay**: Moderate; price-sensitive in principle, but $9.99 is low-friction relative to the decision at stake.

**Technical/domain comfort**: Lower and more variable than the professional persona — needs the LLM plain-language explanation layer and a non-map accessible representation of findings (per requirements.md §10 accessibility requirement) to get real value.

**Relationship to product priority**: Fully served as a first-class customer — guest checkout, plain-language explanations, and mobile support all serve this persona directly — but is not the persona that MVP design trade-offs optimize around when the two personas' needs diverge.

---

## 3. Founder / Rule Reviewer / Operator — **INTERNAL PERSONA**

**Who**: The product's founder, acting in an internal operational capacity — verifying AI-drafted
regulatory rules, triaging escalations, approving production rule activation, and operating
admin/support tooling.

**Goals**:
- Efficiently verify Tier 1 candidate rule packages against primary sources (Municode, City Clerk/Legistar, SDCI) without doing research from scratch.
- Correctly and conservatively triage which candidate rules require Tier 2 domain-professional escalation.
- Diagnose production issues (data-source failures, generation failures, payment/order state, evidence questions) without writing raw database queries.
- Maintain the trustworthiness of every production regulatory conclusion — this persona is the accountable human in the human-approval loop required throughout requirements.md.

**Frequency of use**: Ongoing/ad hoc, concentrated during initial rule-coverage buildout for each project type in the approved sequence (requirements.md §1.4), then intermittent as rules need updates (supersession) or new project types are added.

**Technical/domain comfort**: High technically (is the product's developer), but explicitly *not* assumed to be a credentialed land-use professional — this is the entire reason the Tier 2 escalation path exists.

**Relationship to product priority**: This persona's efficiency directly determines rule-coverage velocity (requirements.md §14) — admin/rule-governance tooling is not a nice-to-have, it's load-bearing for the business.

---

## 4. Escalated Domain Professional — **EXTERNAL / OCCASIONAL PERSONA**

**Who**: A land-use consultant/planner, architect, or land-use attorney engaged specifically to
review one Tier 2 candidate regulatory rule — see `research-findings.md` §5 for the fit-mapping
between trigger type and professional type.

**Goals**:
- Efficiently review the specific ambiguous or high-consequence question they've been engaged for, using the primary-source evidence and reasoning already assembled in the candidate rule package, so their paid time goes to judgment rather than re-research.
- Provide a documented professional opinion the founder can rely on for final production-activation sign-off.

**Frequency of use**: Occasional, per-rule, on-demand — not a continuous relationship by default.

**Relationship to product priority**: Does not use the customer-facing product. Interacts with the candidate rule package and whatever lightweight review surface Application Design provides for this workflow. Their engagement is a real, budgeted cost (research-findings.md §5: ~$100-$1,800/rule depending on type), not a free resource.

---

## Persona-to-Epic Relevance (secondary view, per Question 2)

| Epic | Professional | Homeowner | Founder/Operator | Domain Professional |
|---|---|---|---|---|
| Property Resolution | ✓ | ✓ | | |
| Project Configuration | ✓ | ✓ | | |
| Spatial/Regulatory Evaluation | ✓ | ✓ | | |
| Report Generation & Delivery | ✓ | ✓ | | |
| Payment & Orders | ✓ | ✓ | | |
| Accounts | ✓ (esp. history/repeat-use) | ✓ (esp. guest mode) | | |
| Regulatory Rule Authoring & Governance | | | ✓ | ✓ |
| Admin/Support | | | ✓ | |
