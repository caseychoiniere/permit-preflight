# Unit 10 (general additions): evaluation after the ADU unit, and next steps (2026-10-08)

**Decision (delegated, routine, reversible): defer Unit 10; do not start it now.** Product opportunity, not the unit number, controls sequencing (founder, 2026-10-08).

## Why
- **Evidence of demand is missing.** ADUs were prioritized on a stated high-cost-of-being-wrong hypothesis; nothing yet shows paid demand for an additions screen, and the founder's rule is no further horizontal project types without it.
- **Overlap already shipped.** The most valuable addition question (an ADU in a new addition to the house) is covered by the attached-ADU path: it states that an addition must meet the setback, height and lot-coverage standards and asks whether any part is in an addition. A general additions screen is mostly the same standards applied to a placed footprint plus floor-area-ratio, height and design review, which the platform can reuse if demand appears.
- **Cost and risk.** An addition needs a placed footprint attached to the house (a new geometry mode), height and roof-form modelling, FAR with exempt areas, tree and critical-area interplay, and design standards; most of its outcomes would be REQUIRES_VERIFICATION without a survey. Lower certainty per dollar than the open MVP items below.
- **Open MVP-readiness work is worth more** (below), and the ADU activation decision is the gating item for revenue from the ADU work.

Revisit when: a customer asks for it, the paid ADU reports show addition questions, or the founder directs it.

## What the ADU unit now covers (all gated off; rules APPROVED, none ACTIVE)
New detached ADU, conversion of an existing garage or shed, and an ADU inside or attached to the house (twelve Tier-1 rows). A parcel that is not verifiably plain NR gets no ADU conclusion. See `aidlc-docs/construction/unit-11-adus/slice-status.md`.

## Robustness validation (real parcels)
`scripts/adu-parcel-sweep.ts` ran the real pipeline over 24 real Seattle residential parcels x 3 ADU kinds (live parcel geometry, zoning, outlines, critical-area layers, PostGIS, evaluator, persistence): zero crashes or failed jobs. It found one genuine product defect, fixed here: a footprint placed over a lot line (or in the street) read as "0 ft from the rear lot line" FAIL. The ADU pipeline now measures the share of the footprint inside the parcel and, below 97%, makes no position-dependent claim (CANNOT_TELL with the reason); the shared Placement step now also requires every placed footprint (shed, garage, ADU) to be moved fully inside the boundary before Next.

## Next (continuing without waiting)
1. **Slice 2 - real shed/garage accessory rules** (replace reliance on the four `STAGING-TEST-ONLY` shed fixtures; unblock the garage). Current NR text (SMC 23.44.090 Table A and I.2, 23.44.070.A.3, 23.44.100) matches the fixtures' numbers for the rear-setback case; the gaps are the small-lot/frequent-transit side setback, the 5 ft separation for structures outside the rear setback, and the 12 ft limit applying only in setbacks. Rules will be advanced to APPROVED only; swapping them for the live fixtures changes live customer-visible shed results and needs the founder's activation authorization.
2. **Server-side containment for shed and garage** (the new UI guard covers the browser; an API caller can still submit an outside footprint).
3. **Founder decisions open:** activate the twelve ADU rules and flip `isAduScreeningCoverageReady()`; confirm or override the 2 ft mapping margin and the zoning policy.
