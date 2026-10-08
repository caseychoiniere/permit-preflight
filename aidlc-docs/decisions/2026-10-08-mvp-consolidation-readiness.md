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
