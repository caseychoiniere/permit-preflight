# MVP consolidation / readiness pass — 2026-10-08

Founder decisions executed: fences (8 rules) and decks (6 rules) activated APPROVED → ACTIVE through the normal lifecycle, public gates flipped to `true`; the shed
STFI/ECA review-path defect fixed; retaining walls, ADM-9 and additions deferred; ADUs next. Method: real pipeline runs against the live database with the real ACTIVE rules,
rendered through the real web `ReportView`, the real PDF template and real PDF bytes (Chromium), plus the real `/configure` flow in the browser.

## Per project type

| Type | Public state | Rules | Result of the real-pipeline smoke | Customer-ready? |
|---|---|---|---|---|
| **Shed** | Offered (always was) | 17 real ACTIVE (Unit 6B: permit, P2b, lot coverage). **Setback / height / dwelling-separation findings come from 4 `STAGING-TEST-ONLY` fixture rules** | 8x10 clean: permit REQUIRES_VERIFICATION (ECA-only note), lot coverage unresolved with tolerance; 12x12: permit REQUIRED with review path **REQUIRES_VERIFICATION + ECA note** (the STFI correction); never LIKELY_EXEMPT; web = PDF | **Partially.** Capabilities A-C are real and correct. Setback/height/separation are synthetic in this (staging) database; a production database without those fixtures would show them as "Not Yet Automatically Screenable" (fail closed, correct but thin). |
| **Garage** | Hidden; checkout blocked | **0 real rules** | Report = three "not screened" notices (setback, height, lot coverage), no findings | **No.** Not a routine defect: it needs real governed accessory-structure setback / height / lot-coverage rules (the same foundation ADUs need). Left gated. |
| **Fence** | Offered | 8 real ACTIVE | 5 ft front+side: front KNOWN FAIL, side KNOWN PASS, sight-distance + zoning unresolved; 6 ft side: PASS; 9 ft: permit REQUIRED; never LIKELY_EXEMPT; web = PDF | **Yes** (declared-input product; stated as such in every report) |
| **Deck** | Offered | 6 real ACTIVE | 12 in: PASS + ECA-only note; 40 in front: REQUIRES_VERIFICATION naming allowances (never a violation), permit REQUIRED, path unconfirmed; roof deck: REQUIRED / FULL; web = PDF | **Yes** (same) |

## End-to-end path (intake → evaluation → payment → report → PDF/email)
- Real `/configure` (browser): address → live parcel → type step offers **shed, fence, deck** (no garage) → fence and deck forms → review (placement step correctly skipped).
- Payment: "Continue to payment" for a fence created a real **Stripe sandbox** Checkout Session (`cs_test_…`); no payment details were entered. The deck uses the identical path; garage checkout is blocked by its gate (tested).
- Fulfilment/report/PDF/email: covered by the DB-backed integration suite (order/payment repository, webhook idempotency, guest report access, reconciliation, PDF rendering with real Chromium bytes); live Stripe/Resend sends were not exercised.
- Fail-closed: confirmed per type above (uncovered claims are listed; the PDF now shows the same notice as the web report).

## Verification
Unit 1013/1013; integration 143 (fence/deck pipeline tests rewritten against the real activated rules; 0 failures after); typecheck and production build clean.

## Findings for launch readiness (not stops)
1. **Shed setback/height/dwelling-separation rules are staging fixtures** (`scripts/staging-test-rules.ts`, rear 5 ft etc.). A production database must NOT contain them (the seed requires an explicit opt-in), and real governed rules do not exist yet. Plan: author real accessory-structure setback / height / separation / lot-coverage rules as the foundation of the ADU unit, then wire shed and garage to them (this also opens the garage).
2. The static public gates (fence/deck/garage) are not derived from rule state; a later-disabled rule yields a fail-closed notice, not a conclusion.
3. Live Stripe → webhook → email delivery on the staging deployment should be exercised once end to end before any public launch (a founder-controlled launch decision).

## Update (later 2026-10-08): shed and garage on real rules; ECA correction
- **Shed:** the four STAGING-TEST-ONLY fixtures are gone from the database. Real governed shed setback / separation rules (S1-S3) are ACTIVE beside the 17 Unit 6B rules, so setback, separation and height findings are real and cited to the current code (Ord. 127376).
- **Garage:** now public. Five real rules ACTIVE (rear, side/front, height in and out of a required setback, lot coverage). Side/front shortfalls are REQUIRES_VERIFICATION, not failures, because the garage exceptions in SMC 23.44.090.G / 23.44.160.D cannot be ruled out. Every garage report states that separation from the house (SMC 23.44.100.A) is not automatically screened.
- **Robustness sweep** (`scripts/accessory-parcel-sweep.ts`, real pipeline, real ACTIVE rules, 16 real Seattle parcels x shed + garage): 32 of 32 reports COMPLETE, zero crashes. Definite FAILs were all plausible geometry from the sweep's synthetic placement (a footprint touching the rear lot line or landing on the house outline = 0 ft), never a garage side/front failure.
- **Defect found and fixed during the sweep prep: ECA retriever.** Eight of ten hazard layers were queried at layer id 0 (nonexistent), and the combined fallback only read the flood layer, so an unchecked hazard could be reported as "no mapped intersection" (including the map-dispositive priority-habitat and peat layers). Fixed with verified layer ids, hazard-specific fallback and POST queries; a live test now asserts all ten hazards answer. Reports generated earlier on the staging deployment could show those hazards as clean without a check; reports from now on are complete and more conservative. Reviewer decision 122d2ae7-5610-47e5-a3d0-f9bf446bd441 (APPROVE).
- Still open for launch (founder-controlled): live Stripe -> webhook -> email on the staging deployment, and the Tier-2 professional review of the garage package (post-POC Commercialization Gate).
