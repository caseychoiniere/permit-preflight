# Unit 0: Pre-Construction Validation — Plan & Tracking

**Status**: In progress. **Not production code** — scripts/API experiments/manual research only,
per the user's explicit charter (2026-08-19). No Next.js scaffold, no infrastructure, no database.

## Purpose
Test whether Permit Preflight's core assumptions hold against real Seattle properties — this
exercise is explicitly designed to be able to produce PIVOT or NO-GO, not to confirm Inception was
right. Per the user's instruction: "the purpose of Unit 0 is to test the assumptions, not
demonstrate that the Inception decisions were correct."

## Method
Real API/data experiments (curl against live King County/Seattle/FEMA endpoints — connectivity
confirmed working this session) + real regulatory research against permitted sources
(Municode/Clerk-Legistar/SDCI), run in parallel via two focused research tracks, synthesized here.

## Test Set (10 real Seattle addresses/cases)
1. 3216 Fuhrman Ave E, 98102 (Eastlake — hillside/potential steep-slope candidate)
2. 7550 15th Ave NW, 98117 (Ballard/Loyal Heights — standard SF)
3. 4547 Latona Ave NE, 98105 (Wallingford — standard SF)
4. 2323 S Massachusetts St, 98144 (Judkins Park/Central District)
5. 9004 36th Ave SW, 98126 (West Seattle — standard SF)
6. 5215 S Genesee St, 98118 (Columbia City/Rainier Valley)
7. 1802 43rd Ave E, 98112 (Madison Park — near-lake, possible shoreline/ECA overlay)
8. 3025 SW Avalon Way, 98126 (West Seattle — mixed/corner-ish edge case)
9. A real vacant residential parcel (found via Assessor query, not assumed at a guessed address)
10. Deliberately malformed/ambiguous input: "123 Main St, Seattle, WA" (tests the disambiguation/no-match path intentionally)

## Evaluation Criteria (per the user's explicit charter)
- Parcel-resolution reliability
- Property-data completeness
- Zoning/data-source availability
- Spatial-analysis feasibility
- Regulatory-rule research feasibility
- % and severity of UNKNOWN / REQUIRES VERIFICATION findings
- Ability to produce a useful evidence-backed preliminary result
- Rule-authoring and verification effort
- Likely Tier 1 vs. Tier 2 rule-review burden
- Report usefulness to the professional/repeat-evaluator persona
- Willingness to pay / perceived value
- Approximate report-generation cost where estimable
- Any unexpected legal, licensing, or operational blocker

## Explicit Limitation Acknowledged Up Front
Willingness-to-pay and perceived-value cannot be genuinely tested by AI research alone — that
requires real human interviews/signal, which this session cannot fabricate. This will be reported
as an **untested criterion**, not answered with invented market research.

## Findings
See `validation-findings.md` (populated once the two research tracks return).

## Recommendation
See `validation-findings.md` — final section, presented to the user for the required GO/PIVOT/NO-GO
approval per execution-plan.md's Unit 0 gate.
