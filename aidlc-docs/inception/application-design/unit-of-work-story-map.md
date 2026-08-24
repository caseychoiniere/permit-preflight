# Permit Preflight — Unit of Work Story Map

**Revised 2026-08-19** per user review — sequence renumbered (Vacant-Land now Unit 5, Optional
Accounts now Unit 6), Unit 3 right-sized (8 of 9 ADM stories only; ADM-9 deferred to Unit 9).

All 54 approved stories (stories.md) mapped to exactly one unit. Verified: no story unassigned, no
story assigned twice.

## Unit 0: Pre-Construction Validation
No stories.md stories (human-in-the-loop validation activity, not application code).

## Unit 1: Deterministic Evaluation Foundation (Sheds) — 15 stories
- **Property Resolution**: PR-1, PR-2, PR-3, PR-4, PR-5 (5)
- **Spatial/Regulatory Evaluation**: SRE-0, SRE-SHED-1 (2)
- **Regulatory Rule Authoring & Governance**: RRAG-1, RRAG-2, RRAG-3, RRAG-4, RRAG-5, RRAG-6, RRAG-7, RRAG-8 (8)

## Unit 2: Report Generation & Presentation Prototype — 8 stories
*(Revised 2026-08-19: split from the original 15-story "Purchasable Shed Report" per the two-gate
model — payment/order stories move to Unit 2B below, gated behind Commercial GO. RGD-1's "Given an
order has moved to PAID status" criterion is implemented against an internal authorization trigger
in this unit, not real payment — see unit-of-work.md's implementation note.)*
- **Project Configuration**: PC-1, PC-2 (2) — *(PC-3 save/resume deferred to Unit 6, tied to authenticated accounts)*
- **Report Generation & Delivery**: RGD-1, RGD-2, RGD-3, RGD-4, RGD-5, RGD-6 (6)

## Unit 2B: Commercial Payment & Fulfillment — 7 stories
*(New 2026-08-19, split from the original Unit 2 — BLOCKED pending Commercial GO / Unit 0C)*
- **Payment & Orders**: PO-0, PO-1, PO-2, PO-3, PO-4, PO-5 (6)
- **Accounts**: ACC-1 (guest checkout only) (1)

## Unit 3: Minimum Paid-Product Operations — 8 stories
*(Revised 2026-08-19: right-sized from all 9 ADM stories to 8 — ADM-9 deferred to Unit 9, see below)*
- **Admin/Support**: ADM-1, ADM-2, ADM-3, ADM-4, ADM-5, ADM-6, ADM-7, ADM-8 (8)

## Unit 4: Detached Garages — 1 story
- **Spatial/Regulatory Evaluation**: SRE-GARAGE-1 (1)

## Unit 5: Vacant-Land Screening — 5 stories
*(Renumbered from Unit 6 — moved before Optional Accounts per user correction)*
- **Spatial/Regulatory Evaluation (Vacant-Land cluster)**: VL-1, VL-2, VL-3, VL-4, VL-5 (5)

## Unit 6: Optional Accounts — 4 stories
*(Renumbered from Unit 5 — moved after Vacant-Land per user correction)*
- **Accounts**: ACC-2, ACC-3, ACC-4 (3)
- **Project Configuration**: PC-3 (save/resume, authenticated-user feature) (1)

## Unit 7: Fences — 1 story
- **Spatial/Regulatory Evaluation**: SRE-FENCE-1 (1)

## Unit 8: Decks — 1 story
- **Spatial/Regulatory Evaluation**: SRE-DECK-1 (1)

## Unit 9: Retaining Walls — 2 stories
*(Revised 2026-08-19: now also carries the deferred ADM-9 + Support Case, per Unit 3's right-sizing)*
- **Spatial/Regulatory Evaluation**: SRE-WALL-1 (1)
- **Admin/Support**: ADM-9 (investigate/resolve a customer complaint end-to-end) (1)

## Unit 10: Residential Additions — 1 story
- **Spatial/Regulatory Evaluation**: SRE-ADD-1 (1)

## Unit 11: ADUs — 1 story
- **Spatial/Regulatory Evaluation**: SRE-ADU-1 (1)

---

## Verification

| Unit | Story count |
|---|---|
| Unit 1 | 15 |
| Unit 2 | 8 |
| Unit 2B | 7 |
| Unit 3 | 8 |
| Unit 4 | 1 |
| Unit 5 | 5 |
| Unit 6 | 4 |
| Unit 7 | 1 |
| Unit 8 | 1 |
| Unit 9 | 2 |
| Unit 10 | 1 |
| Unit 11 | 1 |
| **Total** | **54** |

Matches stories.md's confirmed total (54). Cross-check by epic: Property Resolution 5 (Unit 1);
Project Configuration 3 (2 Unit 2 + 1 Unit 6); Spatial/Regulatory Evaluation 13 (1 shared + 7
project-type + 5 vacant-land, distributed across Units 1/4/5/7/8/9/10/11); Report Generation &
Delivery 6 (Unit 2); Payment & Orders 6 (Unit 2); Accounts 4 (1 Unit 2 + 3 Unit 6); Regulatory Rule
Authoring & Governance 8 (Unit 1); Admin/Support 9 (8 Unit 3 + 1 Unit 9). Sum:
5+3+13+6+6+4+8+9 = 54 ✓. ADM-9's move from Unit 3 to Unit 9 keeps the Admin/Support epic's total
at 9 — only its internal distribution across units changed.

## Persona Coverage Check (updated)
Professional/Repeat Evaluator and Homeowner/Prospective Buyer are served starting Unit 2;
Founder/Rule Reviewer/Operator is served starting Unit 1 (rule governance) and Unit 3 (minimum
operations), with full complaint-investigation tooling arriving at Unit 9; Escalated Domain
Professional is served starting Unit 1 (Tier 2 escalation path) — before any real customer depends
on it, unchanged from the prior version.
