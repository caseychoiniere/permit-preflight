# Unit 6B — Rule Tier Review (FOUNDER-CONFIRMED, 2026-09-11; updated 2026-09-13)

**Status**: Tiers below are **founder-confirmed**, superseding the 2026-09-10 AI-suggested table
(which over-applied Tier 2 to plain evidence gaps — see the Governing Principle in
`../candidate-regulatory-rules.md`), with a further 2026-09-13 founder-directed round resolving
P2b/P3b/P7b to full T1 confirmation and researching C1b's two data-source gaps directly (see
"What changed in the 2026-09-13 founder correction round" below). Rules remain in `RESEARCHED`
state — tier confirmation is not the same as `SOURCE_VERIFIED`/`APPROVED`/`ACTIVE`; the lifecycle
is not bypassed.

| ID | Plain-English rule | Tier | Primary source | Exact section | Material ambiguity / exception | Reason for tier |
|---|---|---|---|---|---|---|
| P1 | Shed projected roof area ≤120 sq ft → exemption criterion met | **T1** | 2021 Seattle Residential Code | **R105.2, Item 3.1** | None — operator resolved (`≤`, not `<`); governs over informal SDCI web-page paraphrases | Plain numeric threshold in the governing code provision |
| P2a | Shed is single-story → exemption criterion met | **T1** | SRC | R105.2 | None | Plain, from the governing exemption provision |
| P2b | Detached accessory structure height limit (a separate zoning matter, not part of the R105.2 exemption) — location-sensitive | **T1 — FOUNDER-CONFIRMED** | Ordinance 127376 / SMC 23.44.070 | 23.44.070 — 12 ft if in a required setback (roof may not exceed it), 32 ft otherwise (subject to that section's own exceptions) | Exact current subsection numbering/roof-exception interaction not independently re-verified — item 24 (narrowed scope) | Founder's own direct citation resolves the location-sensitive model; only a narrow numbering detail remains open |
| P3a | Foundation ∈ {slab, pier blocks, on soil} → exemption criterion met | **T1** | SRC | R105.2, Item 3.2 | None | Plain, from the governing exemption provision |
| P3b | Pile/pin-pile/wood foundation disqualifies STFI (review path, not exemption) | **T1 — FOUNDER-CONFIRMED** | SDCI Tip 316 (04/26/2024 revision, confirmed by founder still current, 2026-09-13) | Tip 316, disqualifier list | None | Current-source verification complete |
| P4 | Detached (not attached) → exemption criterion met | **T1** | SDCI "Sheds" | (page) | None | Binary, explicit |
| P5 (storage / growing-plants) | These two explicit uses → exemption criterion met | **T1** | SDCI "Sheds" | (page) | None for these two named categories | Explicit primary-source categories only |
| P5 (everything else) | Any other stated use → `REQUIRES_VERIFICATION`, never automated | n/a (not a tiered rule branch) | — | — | "similar generally unoccupied uses" is not interpreted automatically in Unit 6B | Avoids unnecessary Tier-2 interpretive logic per founder instruction |
| P6 | Whether the shed/site is in or near a mapped ECA | **T2** | SDCI "Sheds"; Tip 316 | (pages) | "in or near" has no code-defined distance; SDCI retains routing discretion | Genuine discretionary/textual ambiguity |
| P7a | Footprint ≤750 sq ft — one condition of STFI eligibility (not sufficient alone) | **T1** | SDCI Tip 316 | Tip 316, size bullet | None | Plain numeric threshold |
| P7b | Structural span <14 ft (or qualifying truss ≤30 ft) — the other condition of STFI eligibility | **T1 — FOUNDER-CONFIRMED** | SDCI Tip 316 (04/26/2024 revision, confirmed current) | Tip 316, span clause | Numeric model corrected (structuralSpanFt + truss flag, not a category enum); exactly-14.0/30-ft boundary operator unreconciled between Tip 316 ("less than 14 ft") and SDCI shed guidance ("more than 14 ft") — item 25 (narrowed scope) | Governance principle applied — a missing customer fact (unknown span) is evidence uncertainty, not rule ambiguity; the boundary-operator gap is a narrow source-reconciliation detail |
| P8 | Electrical/plumbing/mechanical work may need separate permits | **Not tiered — advisory only** | General SDCI guidance | — | Absolute "always required" framing withdrawn — trade-specific exemptions not researched | Removed from the deterministic rule set per founder instruction |
| P9 | Permit exemption never waives zoning-code compliance | **T1** | SDCI "Do You Need a Permit?" | (page) | None | Direct verbatim statement |
| C1a | Base maximum lot coverage = 50% | **T1** | SMC | 23.44.080.A / Ord. 127376 | Unless another subsection applies | Plain, explicit |
| C1b | Riparian corridors / wetlands+buffers / submerged lands & shoreline-setback / steep-slope non-disturbance areas excluded from lot-area denominator | **T1** | SMC | 23.44.080.B | Explicit list resolves the mechanism ambiguity; submerged-lands/shoreline-setback dataset (`Shoreline_Environments`) confirmed real but insufficient (no submerged-land field; setback distance is contextual/discretionary); wetland layer has `CATEGORY` but no habitat-function field needed for SMC 25.09.160 Table A buffer widths — both sub-categories expected to resolve `REQUIRES_VERIFICATION` in practice (item 26, researched not deferred) | Mechanism is now explicit in code text — data/legal-derivation limitation is separate from rule tier |
| C1c | 60% max where frequent-transit + dwelling-only + <3 stories + common-amenity arrangement | **T1** | SMC | 23.44.080.F | Conditions explicit; applicability unknown for most parcels today | Rule text is deterministic; unknown applicability is evidence uncertainty |
| C1d | 60% max on lots with stacked dwelling units | **T1** | SMC | 23.44.080.G | Stacked-unit status of host parcel usually unknown | Rule text is deterministic (founder's own worked example) |
| C1e (floor) | 625 sq ft minimum lot coverage where C1b areas present | **T1** | SMC | 23.44.080.D | Only applies when C1b areas exist on the lot | Plain numeric floor |
| C1e (Director alt.) | Director may approve a different (greater) amount | **T2** | SMC | 23.44.080.D | Case-by-case administrative discretion; Permit Preflight has no data channel to actual approvals | Genuine discretionary determination, not an evidence gap |
| C2 | Underground structures / 36-in projections / low decks / qualifying porches-steps / 23.44.090.H structures / Type A exception excluded from coverage | **T1** | SMC | 23.44.080.C | Aerial data (Building Outlines) cannot identify most of these features per-parcel | Rule text is explicit; the *data* limitation drives an `ESTIMATED` label, not a tier change |
| C3 | Historical 40%-of-required-rear-yard cap on accessory-structure coverage | **SUPERSEDED — not implemented** | Older CAM 220 (pre-2026) | — | No current equivalent found in the 2026 SMC 23.44.090 rewrite reviewed for Unit 6B | Not carried forward by inertia; would require a specific current provision to reinstate |

## What changed from the 2026-09-10 draft table

- **P1**: resolved (`≤`, SRC R105.2 Item 3.1) — no longer an open item.
- **P2**: split into P2a (exemption, T1) and P2b (zoning height, its own finding, T1-pending).
- **P3**: split into P3a (exemption, T1) and P3b (review-path, pending, expected T1).
- **P5**: rewritten to two explicit T1 branches + an unconditioned `REQUIRES_VERIFICATION`
  catch-all — no attempt to automate "similar ... uses."
- **P6**: tier unchanged (T2) but the rule's own wording corrected — never phrased as "no ECA
  in/near," always "is the shed/site in or near an ECA," preserving the parcel/footprint/buffer/
  advisory distinctions.
- **P7b**: T2 → **T1, conditional on source verification** (governance-principle correction).
- **P8**: removed entirely from the tiered rule set; now a fixed advisory disclosure.
- **C1**: split into C1a/b/c/d/e, each independently tiered against the actual current SMC
  23.44.080 subsections; C1b and C2 moved T2 → **T1** (the earlier "mechanism ambiguity" is
  resolved by the explicit current code text; remaining uncertainty is a data/evidence question,
  not a rule-tier question). C1e's Director-alternative branch is the one genuinely new **T2**
  item in this group.
- **C3**: marked **SUPERSEDED / NOT CURRENT**, not implemented, rather than carried forward as a
  Tier-2 candidate.

## What changed in the 2026-09-13 founder correction round (second pass)

- **P2b**: resolved from "pending exact-provision confirmation" to **T1 — FOUNDER-CONFIRMED** —
  the founder's own citation of Ordinance 127376 / SMC 23.44.070 establishes a location-sensitive
  model (12 ft in a required setback, roof included; 32 ft outside, subject to that section's own
  exceptions), derived automatically from already-computed setback facts, never a customer
  question. Only a narrow subsection-numbering/roof-exception detail remains open (item 24,
  narrowed scope — no longer an unreconciled 12-vs-15 discrepancy).
- **P3b**: resolved to **T1 — FOUNDER-CONFIRMED** — the founder confirmed the 04/26/2024 Tip 316
  revision is still the currently-served version and still lists all-wood and pile/pin-pile
  foundations as STFI disqualifiers.
- **P7b**: resolved to **T1 — FOUNDER-CONFIRMED** — same current-Tip-316 confirmation, plus a
  corrected domain model (`structuralSpanFt` numeric + `usesManufacturedTruss` boolean, replacing
  a categorical enum that could not distinguish a 20-ft from a 35-ft manufactured truss). A
  narrow exactly-14.0-ft/30-ft boundary-operator gap remains (item 25, narrowed scope).
- **C1b**: the two data-source gaps were researched during Functional Design, not deferred to
  Code Generation, per explicit founder instruction. Findings: the `Shoreline_Environments`
  FeatureServer is real (same org/CRS) but is a zoning-overlay/environment-designation layer with
  no dedicated submerged-lands field, and the shoreline-setback distance itself is contextual/
  discretionary (SMC 23.60.198.B.1) rather than a fixed offset; the wetland layer has a numeric
  `CATEGORY` field but no habitat-function field, and SMC 25.09.160 Table A's buffer width needs
  both. C1b's rule-text tier is unchanged (T1) — both sub-categories are now documented as
  data/legal-derivation limitations expected to resolve `REQUIRES_VERIFICATION` in essentially
  every real evaluation (item 26, updated with these findings), not open research questions.
- Progressive-disclosure triggers for the roof-overhang and structural-span questions were
  corrected from an arbitrary numeric "margin band" to deterministic conditions (BR-U6B-6/7,
  business-logic-model.md §2) — no tier impact, a Functional Design UX correction.

## Open (non-blocking to Functional Design; block their own rule's SOURCE_VERIFIED/ACTIVE promotion)

- Item 24 (narrowed) — P2b's exact current SMC 23.44.070 subsection numbering and its roof-
  exception interaction wording, not independently re-verified against full statutory text.
- Item 25 (narrowed) — P7b's exactly-14.0-ft/30-ft boundary-operator reconciliation between Tip
  316 ("less than 14 feet") and the SDCI shed guidance ("more than 14 feet").
- Item 26 — C1b's submerged-lands/shoreline-setback and wetland-buffer sub-categories: datasets
  identified and their limitations documented (2026-09-13); expected to remain
  `REQUIRES_VERIFICATION` in practice for those two sub-categories, not a near-term-closable data
  gap.
- C1e's Director-approved-alternative data channel (expected to remain permanently
  `REQUIRES_VERIFICATION` in practice — Permit Preflight has no way to obtain actual Director
  approvals).
