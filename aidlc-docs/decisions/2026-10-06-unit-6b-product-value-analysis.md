# Unit 6B — customer-value analysis of activating Capability B and C under today's evidence

**2026-10-06.** Analysis only: no product behavior, lifecycle state, or code was changed. Every output below was produced by the
real `evaluateProject` / `evaluateEcaLotAreaAdjustment` over in-memory ACTIVE rules (the same method as the dev preview at
`/dev/report-preview`), using the real ten-layer hazard shape (only priority habitat and peat settlement are map-dispositive; see
`src/spatial-analysis/eca.ts`). "All clear" = all ten layers report no intersection.

## 1. Capability B — Building permit (needs all nine permit rules incl. P6 ACTIVE)

| Scenario | Headline | Review path | Criteria (✓ met / ✗ not met / ⚠ unresolved) |
|---|---|---|---|
| 8×8 storage shed, slab, all clear | **Requires verification** | requires verification | 5 ✓ + ECA ⚠ + span ✓ |
| 8×8, wetland (advisory) intersects | Requires verification | requires verification | ECA ⚠ |
| 8×8, steep slope (advisory) intersects | Requires verification | requires verification | ECA ⚠ |
| 8×8, priority habitat (dispositive) intersects | **Permit required** | **full review likely** | ECA ✗ |
| 8×8, no ECA data | Requires verification | requires verification | ECA ⚠ |
| 12×12 (144 sf), all clear | **Permit likely required** | **simple review (STFI) likely** | roof ✗, ECA ⚠ |
| 30×30 (900 sf), all clear | Permit required | **full review likely** | roof ✗, span ✗ |
| 12×12, pile foundation | Permit required | full review likely | roof ✗, foundation ✗ |
| 12×12, foundation unanswered | Permit required | review path unresolved | roof ✗, foundation ⚠ |
| 8×8 attached to house | Permit required | STFI likely | attachment ✗ |
| 8×8, hobby-workshop use | Requires verification | requires verification | use ⚠, ECA ⚠ |
| 12×12, 20 ft span, no truss | Permit required | full review likely | roof ✗, span ✗ |

**Why `LIKELY_EXEMPT` is unreachable today (exact chain).** The exemption needs all six exemption criteria met, including ECA. The ECA
criterion is met only if *every* hazard finding is "known" and "no intersection". A finding is "known" only for map-dispositive layers
(BR-4a; SMC 25.09.030.A says the maps are advisory except peat/seismic/volcanic, FEMA flood and WDFW-mapped areas). Production always
carries eight advisory layers, so at least one finding is "requires verification", the ECA criterion is unresolved, and the headline can
never be "likely exempt". Empty/unavailable ECA data is also unresolved. This is the legally faithful result (the Director determines
ECA presence and "near"), not a defect.

**What is still useful.**
- **Every sized-out or disqualified shed gets a real answer.** Over 120 sq ft, attached, pile/wood foundation, span > 14 ft, or a
  dispositive habitat/peat hit → "permit required" with a full-review vs simple-review (STFI) path. These are the cases where customers
  most need a clear answer, and they are unaffected by the ECA gap.
- **Small sheds still get a five-of-six checklist** — each criterion shown with its basis and the SDCI-final-determination footer.
- The result never *contradicts* SDCI; it reports "requires verification" only where the law makes it discretionary.

**What is weak.** The most common customer (a ≤120 sq ft backyard shed) always sees a bare "Requires verification" even when five of six
criteria are met and the only open item is the ECA question.

**Presentation can help without weakening correctness.** Keep the status `REQUIRES_VERIFICATION`, but state the *reason* in the
headline area: "All other exemption criteria are met. Whether this shed is exempt now depends only on whether your site is in or near an
environmentally critical area, which only SDCI can determine." Link the mapped-hazard section directly beneath. This is wording within
approved intent; it asserts no exemption.

## 2. Capability C — Estimated lot coverage (needs all six lot-coverage rules incl. C1e-director ACTIVE)

(shed 8×8 = 64 sq ft; existing coverage is the aerial-outline estimate)

| Scenario | Estimated coverage | Result shown |
|---|---|---|
| Small 3,000 sf lot, existing 1,200 | 1,264 (42%) | Requires verification — lot-area adjustment unresolved |
| Medium 5,000 sf, existing 1,500 | 1,564 (31%) | Requires verification — unresolved |
| Large 9,000 sf, existing 2,000 | 2,064 (23%) | Requires verification — unresolved |
| 5,000 sf, existing 2,500 (>50%) | 2,564 (51%) | Requires verification — unresolved |
| 5,000 sf, existing 3,100 (>60%), maps clear | 3,164 (63%) | **Appears to exceed** the standard and special allowance |
| Same, a wetland layer indicates | 3,164 (63%) | **Director-approved alternative may be relevant** (requires verification) |
| 5,000 sf, wetland indicates, existing 1,500 | 1,564 (31%) | Requires verification — unresolved |
| Tiny 900 sf, existing 480 | 544 (60%) | Requires verification — unresolved |
| Tiny 900 sf, 624 total (≤625 floor) | 624 (69%) | Requires verification — unresolved (625 floor not exceeded) |
| Tiny 900 sf, 664 total (>625 floor) | 664 (74%) | Appears to exceed |
| 5,000 sf, no ECA data | 1,564 (31%) | Requires verification — unresolved |

**Why a plain "within 50%" is unreachable today (exact chain).** The 50% limit applies to lot area *after* subtracting four SMC
23.44.080.B categories. The denominator is "established" only if no category can be ruled out or the excluded area is computed. No
mapped layer is dispositive for riparian corridors, wetlands + buffers, shoreline/submerged land, or the steep-slope non-disturbance
area (SMC 25.09.030.A), so every category is "cannot rule out" for every parcel; the evaluator therefore always takes the
unresolved-denominator branch, which is evaluated *before* the 50%/60% banding. The "within 50%" and "50–60% may qualify" results
(and the 625-floor branch) exist in code but are reachable only if a dispositive source or computed excluded area appears.

**Is it still useful?** As shipped, a 23%-coverage parcel and a 51%-coverage parcel get the same label. That is practically
unhelpful for most customers even though it is regulatorily honest. Genuinely useful today: the estimated coverage and parcel size; a
**definite "appears to exceed"** when coverage is over the most generous possible allowance (those customers are correctly warned);
and Director-alternative relevance when a layer indicates an exclusion area.

**Deterministic information that exists but is not shown — a presentation opportunity, not a regulatory change.** Exclusions can only
*shrink* the lot area, so the rule yields an exact **tolerance**: the 50% limit holds unless the excluded area exceeds
`parcel − estimatedCoverage ÷ 0.50` (and the 60% allowance, `parcel − estimatedCoverage ÷ 0.60`). Examples: medium lot (1,564 of 5,000):
**within 50% unless more than ~1,870 sq ft (37% of the lot) is wetland/buffer/riparian/shoreline/steep-slope non-disturbance area**;
large lot (2,064 of 9,000): unless more than ~4,870 sq ft (54%); small lot (1,264 of 3,000): unless more than ~470 sq ft (16%); 51% lot
(2,564 of 5,000): over 50% even with no exclusions, within 60% only if ≤ ~730 sq ft is excluded. This is pure arithmetic of the code,
asserts nothing about mapped conditions, and turns "requires verification" into an actionable statement ("check whether more than N sq ft of
your lot is a critical-area exclusion"). Also showable: whether any mapped hazard layer indicates a B category at all.

## 3. Technical readiness (separate from value)

- **P2b pair (APPROVED):** standalone accessory-height finding; activation needs only those two rows. Independent of P6 and C1e-director.
  Output today is mostly "meets the 12 ft limit (in a required setback)" or "requires verification" because the bounded setback model
  can resolve only "inside" or unresolved (never "outside").
- **Capability B:** 8 of 9 permit rules APPROVED; P6 TRIAGED. **Capability C:** 5 of 6 lot-coverage rules APPROVED (C1b APPROVED);
  C1e-director TRIAGED. Both aggregates are all-or-nothing gated, so each is dormant until its Tier-2 rule is ACTIVE.
- **Lifecycle note for P6 (found this pass):** its persisted declared test case 2 ("no hazard findings at all → MET") contradicts the
  implemented fail-closed behavior (empty findings → requires verification, corrected 2026-09-15). When P6 is eventually tested, that case
  must be reported honestly (it passes only under the reading "every finding is a map-dispositive no-intersection", as in the existing
  unit test) and disclosed in the audit reason, as was done for C1b case 0. Persisted rows are not rewritten.

## 4. Recommendation — path D (staged), with the three dimensions separated

**D. Another clearly justified path — staged activation:**
1. **Activate the P2b pair standalone when the founder chooses** (option B for that finding): technically ready, regulatory-correct, low
   risk, modest value. Founder-only (activation).
2. **Run one professional engagement covering P6 and C1e-director** (packet: `2026-10-06-unit-6b-tier2-professional-review-packet.md`).
   Both are inherently discretionary; the review is cheap relative to its effect and unblocks both aggregates.
3. **Capability B: activate after professional review (option A)**, shipped with the clearer headline reason above. Value is real for the
   many sheds that are over 120 sq ft, attached, or on disqualifying foundations, and the checklist helps small sheds.
4. **Capability C: do not activate as currently presented (option C for presentation, not for rules).** After the review, add the
   tolerance presentation above, then activate. As it stands the output is honest but near-useless for most parcels; better data (SDCI
   field-delineated ECA boundaries) is not realistically obtainable, so improving *presentation*, not data, is the lever.

- **Regulatory correctness:** sound for every path above; the conservative results follow from SMC 25.09.030.A and the Director-determination
  provisions. Nothing recommended weakens a customer-facing claim.
- **Technical readiness:** B and C await only P6 / C1e-director; the presentation changes are small, deterministic, and testable with the
  existing preview harness.
- **Customer value:** B moderate-to-good after a wording tweak; C poor today, good with the tolerance display; P2b modest.

A customer-value concern here is **not** a regulatory defect and none of it requires re-opening a rule.

## 5. Founder-only decisions actually required now

- **Activation of any rule** (APPROVED → ACTIVE), including the P2b pair, whenever the founder wants it. Nothing else blocks.
- **Only if** the founder wants to avoid the professional review by *removing P6/C1e-director from the tiered rule set* (e.g., treating them
  as fixed fail-closed disclosures like P8/P9) — that is a rule-tier change and founder-only. Not recommended: it would encode a regulatory
  position (discretionary) without professional support.
- Everything in this document's presentation recommendations is within delegated scope.

---

## 6. Addendum 2026-10-07 — Founder decision: professional review deferred; outcome-specific gating

> **Founder decision (recorded verbatim):** For the MVP, professional review of P6 and C1e-director is deferred. The Tier-2 rules remain
> TRIAGED and inactive. They are no longer blanket prerequisites for deterministic outcomes that do not depend on resolving those
> discretionary questions.

Sections 1-5 above are the original 2026-10-06 analysis and are left unchanged. Where §3-§4 say Capability B/C are "all-or-nothing gated"
and recommend a professional engagement *before* activation, that is **superseded** by this decision. The engagement remains a future option
(the packet is preserved) but is not an MVP prerequisite. P6 and C1e-director are not source-verified, approved, or activated; no review
evidence was created; their tier is unchanged (TIER_2 / TRIAGED / inactive).

### 6.1 What changed (code)

Replaced the blanket "all constituent rules must be ACTIVE before the aggregate exists" with an explicit **outcome-dependency model**
(`src/regulatory-rules-engine/evaluate.ts`, `PERMIT_CRITERION_RULE_DEPENDENCIES` and siblings). An outcome renders when every rule
*required for that specific claim* is ACTIVE; an inactive rule is never evaluated and never contributes a deterministic conclusion
(the general lifecycle rule is unchanged).

**Capability B**
- A criterion is evaluated only if its rules are ACTIVE.
- `REQUIRED` needs only one conclusive active disqualifier (roof area, attachment, foundation, structural span, ...).
- `REQUIRES_VERIFICATION` ("every deterministic criterion passes; ECA unresolved") needs the eight deterministic permit rules
  (P1, P2a, P3a, P3b, P4, P5, P7a, P7b).
- `LIKELY_EXEMPT` additionally needs P6 ACTIVE and met, so it is unreachable while P6 is inactive — by construction, not a special case.
- While P6 is inactive the ECA criterion is a fixed "SDCI determines" row (never MET/NOT_MET). Mapped layers that show a possible
  intersection are disclosed as context only (not used to decide the criterion; no claim is made about whether the layer is advisory or dispositive); they do not decide the criterion. When every other exemption criterion is met the
  report adds: "All other screened building-permit exemption criteria are met. The remaining question is whether the site is in or near an
  environmentally critical area. Permit Preflight cannot determine that conclusively from Seattle's advisory mapping; SDCI makes that
  determination."
- A review-path conclusion that rests on P3b needs P3b ACTIVE.

**Capability C**
- The calculation needs the five deterministic rules (C1a, C1b, C1c, C1d, C1e-floor); C1e-director is no longer a prerequisite.
- Any claim about a Director-approved alternative needs C1e-director ACTIVE. While it is inactive, no result says an alternative applies,
  may apply, or what it would be (`POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE` is unreachable); the neutral disclosure is used instead:
  "Parcel-specific SDCI approvals, reductions, waivers, or modifications are not evaluated by Permit Preflight and could affect the final
  allowable coverage." It is shown only where the lot-area denominator is unresolved (the only path on which such an approval could exist).
- New pure module `lot-coverage-tolerance.ts`: with parcel P, estimate E and unknown excluded area X, the 50% (or 60%) limit holds while
  X ≤ P − E/f, with the 625 sq ft minimum (SMC 23.44.080.D) preserved whenever an exclusion exists. Four outcomes per threshold: within
  unless X exceeds a number; within regardless (E ≤ 625 and within the threshold); exceeds unless an exclusion exists (E > f·P but E ≤ 625);
  exceeds regardless. Exact numbers stay in the structured result; display rounds **down** (nearest 10 sq ft from 100 up, whole sq ft below).
  The explanation always states that the figure is a mathematical tolerance, not a measured or mapped size, that the excluded area is
  unknown, that a mapped layer is not the regulatory exclusion area, and that SDCI/field determination may still be required.

### 6.2 Reachable outcomes with P6 and C1e-director inactive (real evaluator; production-shaped ten-layer ECA data)

| Capability B scenario | buildingPermit | reviewPath |
|---|---|---|
| 8×8 slab, all layers clear | REQUIRES_VERIFICATION (ECA-only note) | REQUIRES_VERIFICATION |
| 8×8, advisory wetland intersects | REQUIRES_VERIFICATION (ECA-only note) | REQUIRES_VERIFICATION |
| 8×8, priority habitat (dispositive) intersects | REQUIRES_VERIFICATION (ECA-only note; layer disclosed as context only) | REQUIRES_VERIFICATION |
| 12×12 (144 sq ft) | REQUIRED | STFI likely |
| 30×30 (900 sq ft) | REQUIRED | full review likely |
| 12×12, pile foundation | REQUIRED | full review likely |
| 12×12, foundation unanswered | REQUIRED | REQUIRES_VERIFICATION |
| 8×8 attached | REQUIRED | STFI likely |
| 12×12, 20 ft span, no truss | REQUIRED | full review likely |
| 8×8, occupiable use | REQUIRES_VERIFICATION | REQUIRES_VERIFICATION |

Value lost relative to §1 of this analysis: a **dispositive** priority-habitat/peat intersection on an otherwise exempt-size shed
previously yielded "permit required / full review" via P6. With P6 inactive it yields "requires verification" with the layer disclosed as
context only. This is the direct consequence of not evaluating an inactive rule.

| Capability C scenario | Estimate | Result |
|---|---|---|
| 3,000 sq ft lot, 1,264 sq ft | 42% | unresolved; within 50% unless > ~470 sq ft (15%) excluded |
| 5,000 sq ft lot, 1,564 sq ft | 31% | unresolved; within 50% unless > ~1,870 sq ft (37%) excluded |
| 9,000 sq ft lot, 2,064 sq ft | 23% | unresolved; within 50% unless > ~4,870 sq ft (54%) excluded |
| 5,000 sq ft lot, 2,564 sq ft | 51% | unresolved; already over 50% with no exclusions; 60% allowance holds unless > ~720 sq ft (14%) excluded |
| 5,000 sq ft lot, 3,164 sq ft | 63% | appears to exceed 50% and 60% regardless of exclusions (no Director-alternative claim, with or without a mapped layer) |
| 900 sq ft lot, 464 sq ft | 52% | unresolved; over 50% unless an exclusion exists (625 sq ft minimum then applies); within 60% regardless |
| 900 sq ft lot, 544 sq ft | 60% | unresolved; over 50% and 60% unless an exclusion exists (625 sq ft minimum) |
| 900 sq ft lot, 664 sq ft | 74% | appears to exceed (above the 625 sq ft minimum) |

### 6.3 Updated recommendation (supersedes §4 steps 2-4 only)
Activate the full approved set (the P2b pair, the eight deterministic permit rules, and C1a/b/c/d/e-floor) without professional review.
Capability B ships with the ECA-only headline note; Capability C ships with the tolerance. LIKELY_EXEMPT and any Director-alternative claim
stay unavailable until, and only if, P6 / C1e-director are later reviewed, approved and activated. Activation itself remains a founder-only decision.

### 6.4 Reviewer QA record (2026-10-07, decision 1d07201b-2fbf-48c3-8f4b-d1ead1bbd235)
The `aidlc-reviewer` returned ESCALATE with `authority: RESERVED_FOUNDER`. Its CRITICAL finding and its third finding (the generic
parcel-specific-approval disclosure) rest solely on being unable to authenticate the founder decision quoted in §6; under the Delegated
Founder Decision Policy that is recorded and not treated as a defect — the decision was relayed by the founder and is authoritative for this
scope, and the disclosure wording was specified by the founder. Its one engineering finding was accepted and fixed: the inactive-P6 ECA row
described mapped layers as "advisory", which would contradict the report's own treatment of map-dispositive layers; the copy now says the
layers are shown "context only; not used to decide this criterion". The reviewer's INFO finding confirmed proportional test coverage.
