# Unit 0B: Pivot Validation — Findings & Revised Recommendation

All 4 delegated tracks plus the 2 tracks completed directly are done. Combined results below.

---

## Track 1: Multi-Source Parcel Resolution — **MITIGATION WORKS, EVIDENCED**

26 real test cases (2 batches, 13 each), combining direct retests of all 8 original Unit 0
addresses plus corner lots, condos, hillside parcels, address variants, malformed input, a second
independent vacant-parcel search, and a second independent ambiguous/garbage-input test.

**Combined tally**:

| Outcome | Count | % |
|---|---|---|
| CONFIRMED (multiple independent sources agree, reverse-validated) | 10 | 38.5% |
| CLARIFICATION-REQUIRED (correctly refused to auto-confirm) | 9 | 34.6% |
| NO-MATCH/REJECTED (honest, correct rejection) | 4 | 15.4% |
| **FALSE-CONFIDENT (would-have-been) — CAUGHT by cross-check** | 2 | 7.7% |
| Not reliably testable with available tooling | 1 | 3.8% |

**The headline result**: the exact failure mode that drove Unit 0's PIVOT — a naive geocoder
returning a high-confidence score attached to the wrong parcel — was **deliberately re-triggered
twice**, under two different mechanisms, and **caught both times**:
- Batch A retested the original "123 Main St, Seattle, WA" case directly. Both geocoders agreed on
  a 99.48%-confidence match — the reverse-validation step revealed the returned PIN's own
  *canonical* address is "119 S Main St," not 123 (123 exists only as a non-primary alias), and an
  independent parcel-attribute query surfaced a second, textually exact match in **Algona, WA**, a
  different city entirely. Two independent disagreements — correctly downgraded to
  CLARIFICATION-REQUIRED.
- Batch B tested a fresh garbage input ("asdf 123, Seattle") and got a real, plausible-looking
  parcel back at 80% confidence — in Algona, WA again, a different city, ~20 miles from Seattle.
  Reverse-validation caught the city mismatch.

**Zero of 26 cases produced a silent wrong-parcel result under the multi-source strategy.** Where
the strategy could not reach full confidence (6 of 13 in batch A — real address-point gaps with no
PIN to validate against), it correctly refused to guess and returned CLARIFICATION-REQUIRED rather
than an approximate answer presented as fact — which is itself the correct, honest behavior per
the product's evidence-classification design, not a new failure.

**Conclusion**: parcel-resolution failure genuinely *can* be made safe through the
verification/clarification approach the user specified. This is no longer a speculative fix — it's
evidenced across 26 real cases, including deliberate adversarial retests of the exact prior
failure.

---

## Track 2: Regulatory Rule-Authoring Sample — **BURDEN CONFIRMED, NOT RESOLVED**

5 rules total (1 shed + 4 garage). **4 of 5 (80%) Tier 2** — including a rule where two SMC
subsections independently govern the same fact pattern with no stated precedence between them
(garage rear setback), and a side-setback rule with three separate conditional exception pathways.
Only the flat-percentage lot-coverage rule was Tier 1. Retrieval got faster with practice (a
batch-fetch technique cut lookup time substantially); **interpretation/judgment time did not** —
each dimensional rule required genuine legal reading, not just faster searching. Blended average
~35-40 minutes/rule.

**Conclusion**: this does not invalidate deterministic rule authoring as infeasible — real,
citable, testable rules were produced — but it confirms, with a larger sample, that Tier 2 should
be planned as the **default** for early project types, not the exception, with real professional-review
budget attached as an ongoing cost (research-findings.md §5 already estimated ~$100-$1,800/rule).

---

## Track 3: Regulatory Source-Access Workflow — **CONFIRMED SUSTAINABLE, NO CHANGE NEEDED**

Re-verified architecturally: the Regulatory Rules Engine (production runtime) has never depended
on live Municode access — it only ever reads ACTIVE rules already published by Regulatory Rule
Governance. Municode's 403-on-fetch behavior only affects the offline, human/browser-assisted
authoring workflow (Regulatory Source Access → Rule Research Assistant), which was always designed
to be curated, not automated. Track 2's experience confirms this workflow is real and repeatable
(with the browser-tool requirement now a known, documented constraint) — sustainable, if
budgeted for accurately per Track 2's findings.

---

## Track 4: ECA / Overlapping-Source Precedence — **RESOLVED, CONCRETE POLICY PRODUCED**

Root cause of the Unit 0 contradiction identified: the combined ECA layer is a dissolved/generalized
union of the individual authoritative polygons, creating a real ~15-20m boundary-tolerance band
where hit/no-hit can flip near an edge. The combined layer's own publisher explicitly disclaims it
as "for analytical purposes only... does not represent actual regulatory areas." Recommended
policy, adopted below: individual authoritative layers always take precedence over the combined
layer for KNOWN findings; disagreeing individual layers are reported separately, not collapsed;
proximity to a polygon edge (within the observed tolerance band) itself triggers REQUIRES
VERIFICATION; even authoritative layers are advisory per SDCI's own guidance except two hazard
types (priority habitat, peat-settlement), which should be weighted accordingly.

---

## Track 5: Real User-Value / Willingness-to-Pay — **STILL UNVALIDATED (as disclosed up front)**

Three realistic sample reports were produced (`sample-reports.md`), including one deliberately
showing the REQUIRES-VERIFICATION-heavy outcome now confirmed to be the realistic norm (not the
exception) given Track 1's data. **No real target-persona person has seen these reports.** This
criterion remains genuinely untested — it requires real human interviews this session cannot
conduct or fabricate.

---

## Revised Recommendation

Per the user's own stated bar: *"A GO should require evidence that parcel-resolution failure can
be made safe through verification/clarification behavior **and** that the resulting reports retain
enough real user value despite unavoidable unknowns."*

**The first half of that bar is now met, with real evidence** (Track 1). **The second half is not,
and cannot be met without real human input this session does not have access to** (Track 5).

Recommendation: **PIVOT — but narrowly scoped now, not broadly.** Four of Unit 0's five original
open concerns (parcel resolution, ECA precedence, Municode/source-access sustainability, and rule-authoring
burden — now *quantified* rather than merely flagged) have concrete, evidenced resolutions ready to
fold into the approved artifacts. **The one remaining gate is real user-value validation** — showing
`sample-reports.md`'s reports (or reports like them) to actual people matching the primary
professional/repeat-evaluator persona, and honestly capturing whether a REQUIRES-VERIFICATION-heavy
report (the now-confirmed realistic norm, not a worst case) is still worth paying for.

This is not a call for more AI research. It requires you, or someone with real access to the target
persona, to have that conversation. Once that happens, the decision becomes a straightforward GO or
a genuine NO-GO on value — not a data/architecture question anymore.

**Artifact updates made below reflect evidence already gathered (per your instruction to update
only when Unit 0B produces evidence requiring it) — they do not presume the outcome of the
remaining user-value question.**
