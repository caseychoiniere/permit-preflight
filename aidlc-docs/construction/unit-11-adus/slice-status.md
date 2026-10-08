# Unit 11 — ADUs: slice status (2026-10-08)

| Slice | Status | Notes |
|---|---|---|
| 1 Zoning / overlay / transit facts and NR gating | **Done, pushed** (9365c8c) | Retrievers (zoning grid-share, frequent transit, landmark); fail-closed classifier (any material second zone = UNRESOLVED); shed/garage/fence/deck withhold NR conclusions for a verifiably non-NR parcel. The long-standing "NR test parcel" 3298700485 is LR1; integration tests moved to verified-NR 1498301270. |
| 2 Real governed shed/garage accessory rules | **Deferred** (not on the ADU critical path) | The ADU evaluator carries its own ten governed rows, so ADUs did not need the shared foundation. Current NR text (SMC 23.44.090.A Table A, I.2, 23.44.070.A.3, 23.44.100) matches the staging fixtures' numbers except small-lot/FTSA side setbacks, front 10 ft with 3+ units, and the 5 ft separation for structures with floor area; replacing the four `STAGING-TEST-ONLY` shed fixtures and unblocking the garage is the next MVP-readiness item after ADUs. |
| 3 Detached ADU (new) feasibility | **Built, rules APPROVED, public availability OFF** | See below. |
| 4 Conversion of an existing accessory structure | **Built, rule A11 APPROVED, availability OFF** | See below. |
| 5 Attached ADU | Next | Within the existing house (SMC 23.42.022.H.4: the 1,000 sq ft cap does not apply to the part that existed on July 23, 2023). |

## Slice 3 as built
- `evaluate-adu.ts` (pure, outcome-dependent): count (max 2), density incl. ADUs, size (1,000/1,200), setbacks (rear 5 ft / alley none, side 5 avg / 3 min, small FTSA lot 3, front 15 / 10 with 3+ units), 5 ft separation from the house and a flag for nearby mapped buildings, height, lot coverage (shared Unit 6B tolerance model), FAR (limit rises with the unit count, small-lot floor), amenity area (pre-1982 single-added-unit exemption), tree points, design standards, critical-area summary, zoning/overlay findings, verify-before-design checklist, fixed not-evaluated list.
- Output discipline: headline is `LOOKS_FEASIBLE` / `LIKELY_CONSTRAINED` / `BLOCKED` / `CANNOT_TELL`, never an approval. KNOWN FAIL only when a declared or mapped input breaches a threshold by more than a **2 ft mapping margin**; anything inside the margin, anything interpretive, anything advisory is REQUIRES_VERIFICATION. A parcel whose zone is not verified plain NR (other zone, split, MIO, data unavailable) gets **no ADU conclusion**. Partial rule coverage is never `LOOKS_FEASIBLE`.
- Ten Tier-1 rule rows (eleven with Slice 4's A11) (`tests/fixtures/adu-candidates.ts`, ids fixed) with 45 executable test cases, advanced to **APPROVED only** by `scripts/unit-11-adu-governance.ts`; zero ACTIVE. `isAduScreeningCoverageReady()` = false; checkout blocked; advertised only in a local development build.
- Pipeline `runAduPipeline`, `AduDetailsForm`, shared `ParcelPlacementMap` (now noun-aware), ReportView + PDF sections with a parity test, dev preview scenarios, real-PDF check.

## Slice 4 as built (conversion of an existing garage or shed)
- The building is chosen on the map from Seattle Building Outlines; its mapped outline is the footprint (new `computeSetbackDistancesForFootprint`, shared with the placed-rectangle path). No footprint is drawn; the placement controls are hidden.
- Source: SMC 23.42.022.H.1-H.3 (read live 2026-10-08): conversion = keep, add to/alter, or remove and rebuild, provided any expansion or relocation meets the ADU and zone standards; an existing accessory structure existed before July 23, 2023; permitted notwithstanding lot coverage and yard or setback provisions; the Director may waive or modify (Type I); must comply with SMC 22.206.020-.140.
- Declarations: existed before the date (yes/no/unsure); keeps footprint and height (rebuilding in place at the same size counts). Allowance states: YES (both true), NO (did not exist before the date: new-ADU setbacks and coverage applied to the building), PARTIAL (expansion or relocation: existing building covered as it stands, changed part unmeasured, coverage and FAR never definite), UNSURE (nothing asserted).
- Never a KNOWN fact about the allowance (SDCI confirms legal existence); the 5 ft separation from the house is never a KNOWN FAIL for a conversion; height is left to SDCI (the allowance does not mention it and none is collected); the Housing Code is cited by section range only; an unmatched or main-house building gives no conclusion; the main house is rejected as the building to convert at the schema boundary.
- Rule A11 (`adu-a11-conversion-2026`) APPROVED (live DB now: adu APPROVED 11, zero ACTIVE).
- Reviewer (decision ad374c35-b2de-4717-b1a6-4dbe34e12827): ESCALATE on authority, recorded; real defects FIXED (KNOWN siting fact, conclusions for an unmatched building, additions/FAR/coverage, unsupported Housing Code prose, missing height treatment, degraded-source guard).

## Founder decisions still pending (none block continued building)
1. **Activate the eleven ADU rules and flip `isAduScreeningCoverageReady()`** (public availability).
2. The 2 ft mapping margin and the "any material second zone = unresolved" zoning policy are conservative product choices recorded in the rule caveats; the reviewer flagged them as reserved and they are open to founder override.
