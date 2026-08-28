# Unit 0C: Customer Value Validation — Interview Protocol & Evidence-Capture Template

**Status**: **DEFERRED — OPTIONAL COMMERCIAL VALIDATION** (founder decision, 2026-08-24; see
`aidlc-docs/aidlc-state.md`'s FOUNDER DECISION section). Not COMPLETE, not PASSED, not FAILED, not
GO, not NO-GO — no interviews have been conducted. This protocol was designed and is preserved
here unchanged for possible later use, but the founder elected to continue Construction (Unit 2B
onward) before conducting it, and it is no longer a prerequisite for any unit. If conducted later,
synthesize real conversations against the decision framework at the end of this document at that
time. No AI-simulated interviews. No production code.

**Materials to use**: the three realistic sample reports in
[`sample-reports.md`](sample-reports.md) — including Sample Report 2, the
REQUIRES-VERIFICATION-heavy case, which Unit 0B confirmed is the realistic norm, not a worst case.
Do not swap in a cleaner, more idealized report for interviews — the point is to test reaction to
what the product would actually produce.

**Target**: 5 minimum, 8-10 if reasonably achievable. Real people matching the approved primary
persona — small residential developers, investors, builders, agents, or other repeat property
evaluators. Not colleagues answering hypothetically about a concept; people who would plausibly be
in the actual buying situation.

---

## Before You Start

- **Do not lead with price.** Establish whether the report changes/accelerates a real decision and
  what it replaces *before* asking anything about willingness to pay.
- **Do not over-explain the report before getting their first reaction.** Let them read it and tell
  you what they think it says. Their unprompted read is more informative than their reaction to
  your explanation.
- **Show the REQUIRES VERIFICATION-heavy report to everyone**, not just the clean one — if you only
  show Sample Report 1, you'll validate a version of the product that may not reflect real output.
- **Avoid**: "Would you pay $10 for this?" as an early or standalone question — it invites a polite
  yes/no with no signal behind it. Anchor pricing questions to their actual current process/cost
  instead (see the pricing section below).
- **One person's opinion is one data point.** Don't let an articulate or enthusiastic participant
  carry more weight than a quiet skeptical one — capture both fully.

---

## Interview Flow (roughly 20-30 minutes)

### 1. Warm-up — their current process (before showing anything)
- What's your role, and roughly how many properties or projects do you personally screen/evaluate
  in a typical month or year?
- Walk me through what you actually do today when you first hear about a property or project idea
  and want to know if it's worth pursuing further — before you'd pay for a survey, hire an
  architect, or talk to the city.
- Roughly how much time does that early screening take you, per property? Any hard costs involved
  (a call to a permit expediter, a paid zoning lookup service, etc.)?
- What's frustrating or slow about that process today, if anything?

### 2. First reaction (show one report, minimal framing)
Hand them (or share) **Sample Report 2** first (the REQUIRES-VERIFICATION-heavy one) with minimal
setup — something like *"This is a sample output from an early-stage tool we're evaluating. Take a
look and tell me what you think it's telling you."* Let them read in silence if possible.

- What do you think this report is telling you?
- Is anything confusing, or does it read clearly?
- (Only after their unprompted read) — explain briefly what KNOWN / INFERRED / REQUIRES
  VERIFICATION mean if they didn't already infer it correctly.

### 3. Value assessment
- Which specific findings in this report are genuinely useful to you? Which ones did you already
  know or could easily find elsewhere?
- Which of the REQUIRES VERIFICATION / UNKNOWN items bother you, versus which feel like a
  reasonable thing to ask a surveyor/professional anyway?
- If you'd received this report on a real property you were considering, would it have changed
  what you did next — pursued it, walked away, or dug deeper before deciding? Be specific if you
  can think of a real property this resembles.
- What's missing that you'd need before this was genuinely useful to you?

### 4. Now show the other two
Show **Sample Report 1** (clean shed case) and **Sample Report 3** (vacant-land) briefly for
contrast.
- Does the clean-data version change your read on the product? Does it feel like a materially
  different (better) experience, or a modest variation on the same thing?
- (If they evaluate vacant land / acquisitions) Does the vacant-land report answer the "is this
  worth investigating further" question for you?

### 5. Repeat-use and pricing (anchor to their real process, not abstract willingness)
- Given what you do today (from Section 1) and what you just saw, would you use something like
  this repeatedly, for most/many properties you screen? Or only occasionally, for specific
  situations?
- Thinking about the time/cost of your current early-screening process — what would a report like
  this need to save you or tell you to be worth paying for?
- Ask at **two price points**, not one, and let them react naturally rather than confirming a
  number you suggest: *"If this cost around $10, how would you think about that? What about
  somewhere in the $30-50 range?"* Note whether their reaction changes qualitatively (e.g., "$10 is
  a no-brainer, I'd try it on everything" vs. "$40 only if I were already seriously considering the
  property").
- Would you want this as a one-off purchase, or would a subscription/bulk-screening model fit how
  you actually work better?

### 6. Close
- Anything about this that surprised you, positively or negatively?
- Is there anyone else you think I should show this to?

---

## Per-Participant Capture Template

Copy this block once per participant. Fill in as much as you can during/immediately after the
conversation — don't rely on memory later.

```
### Participant [N]
- Date:
- Role / persona fit: (developer / investor / builder / agent / other repeat evaluator — describe)
- Approx. frequency of evaluating properties/projects:
- Current early-screening process (in their words):
- Approx. time/cost/friction of current process:
- Report shown: (2 first, then 1 and 3)
- Unprompted first reaction — what they thought the report told them:
- Findings they identified as genuinely useful:
- REQUIRES VERIFICATION / UNKNOWN items that reduced value for them:
- Would this affect a real pursue / don't-pursue / investigate-further decision? How, specifically:
- What they said is missing:
- Would they use it repeatedly, or only occasionally? Which situations:
- Reaction at ~$10:
- Reaction at ~$30-50:
- One-off vs. subscription/bulk preference:
- Anything surprising:
- Overall read (your own note, not theirs): positive / mixed / negative, and why
```

---

## After the Interviews: Decision Framework

Apply qualitatively — this is a small sample, not a statistically powered study. Do not manufacture
false numerical precision (e.g., don't report "73% willingness to pay" from 7 conversations).

**GO** — A clear majority of participants indicate the realistic report saves meaningful diligence
effort and/or would affect a real pursue/don't-pursue/investigate decision, with multiple credible
willingness-to-pay signals *despite* the REQUIRES VERIFICATION items they actually saw (not a
hypothetical cleaner version).

**PIVOT** — Participants identify real value, but a consistent, specific, fixable weakness keeps
the current report/product configuration from being valuable enough — e.g., a particular category
of REQUIRES VERIFICATION finding consistently kills value, the price expectation clusters well
below what the economics support, or the report is missing one specific thing multiple participants
independently named. If this is the outcome, identify the smallest evidence-backed change — don't
default to a large re-scope if the interviews point to something narrow.

**NO-GO** — Participants consistently find the realistic report does not materially improve their
process, the unavoidable uncertainty (REQUIRES VERIFICATION rate) makes it insufficiently useful
even when explained, or willingness to pay is consistently weak relative to the verified regulatory-maintenance
burden (Unit 0B: ~35-40 min/rule, 80% Tier 2, real professional-review cost).

Once you've run the conversations, bring the filled-in template back and I'll help synthesize it
against this framework and produce the final Unit 0 GO/PIVOT/NO-GO write-up — but the read on what
people actually said is yours to characterize first; I won't infer sentiment beyond what you
capture.
