# Unit 6B — Recommended Scope (for founder approval)

**Status (2026-09-11): SCOPE APPROVED WITH MODIFICATIONS.** Approved: A (ECA screening),
B (shed permit-requirement determination), C (lot-coverage analysis). Track 4 (preliminary
feasible-placement area) remains **deferred**, including the optional minimal overlay — not
included in Unit 6B at all. Full founder decision + the design modifications this drove:
`../functional-design/` (`domain-entities.md`, `business-rules.md`, `business-logic-model.md`,
`frontend-components.md`, `rule-tier-review.md`) and
`aidlc-docs/decisions/2026-09-10-unit-6b-shed-report-value-expansion.md`. **Functional Design
Part 1 — APPROVED 2026-09-13**, including the founder's C1c/C1d bounded-reasoning scope decision
(no automatic 60%-allowance applicability detection in this slice). No Code Generation, no rule
activation.

Original proposal status below (superseded where the founder's modifications above apply —
kept for the record, not rewritten):

---

## Recommendation in one line

**Unit 6B ships three compounding capabilities — ECA screening, permit-requirement determination,
and lot-coverage analysis — and defers the preliminary feasible-placement-area map to a later
pass.**

Rationale: these three answer the founder's product goal ("Can I probably build this here, what
might stop me, will I likely need a permit, and what should I verify before spending more money?")
while re-using components already proven in Units 4 and 5. The feasible-placement map is the one
capability with genuine legal-correctness risk and the highest ongoing maintenance surface, and
its value is largely additive rather than foundational.

---

## In scope

### A. ECA screening (Research Track 3) — build first

- One new data adapter (`src/property-intelligence/seattle-eca.ts`), templated on the existing
  `seattle-building-outlines.ts` adapter: query the Seattle ECA feature services on
  `services.arcgis.com/ZOyb2t4B0UYuYNYH` with `outSR=2926`, verify `spatialReference.wkid` before
  trusting coordinates, fail closed otherwise.
- One new reusable Property Intelligence fact: `environmental-constraints` (per-hazard mapped
  intersection at parcel scope, footprint scope where computable, advisory status, layer vintage,
  provenance).
- Wire the fact into the shed pipeline's already-existing but currently-empty `ecaFindings`
  path, through the already-ACTIVE `spatial-analysis/eca.ts` (BR-5) and
  `regulatory-rules-engine/eca-implication.ts` (BR-4a). **No change to that policy.**
- Report: one finding per intersecting hazard type; DATA FACT and REGULATORY CONCLUSION kept
  separate; `NO_INTERSECTION` hazards shown as ✓ ("no mapped …"); vintage disclosed.

### B. Permit-requirement determination (Research Track 1) — depends on A

- Five new `ShedProjectConfiguration` intake fields (all optional / `undefined` = not answered,
  never coerced): `foundationType`, `attachment`, `intendedUse`, `utilityIntent`,
  `roofEaveProjectionIn`. Boundary Validator schema extended.
- One new project-type rule producing a `PermitRequirementFinding`
  (`LIKELY_PERMIT_EXEMPT` / `STFI_PERMIT_LIKELY` / `FULL_PERMIT_LIKELY` / `REQUIRES_VERIFICATION`)
  from candidate rules P1–P9 (`candidate-regulatory-rules.md`).
- Separate trade permits (electrical / plumbing / mechanical) always disclosed as ⚠ items, never
  folded into the state.
- Every `LIKELY_PERMIT_EXEMPT` result carries the "exemption ≠ zoning approval; SDCI makes the
  final call" disclaimer (rule P9).

### C. Lot-coverage analysis (Research Track 2)

- One new reusable Property Intelligence fact: `existing-structure-coverage` (a pure
  "derive from already-fetched facts" function, like `buildLotCoverageFacts`), from Building
  Outlines `AREA` / PostGIS `ST_Area(ST_Union(footprints ∩ parcel))`.
- Extend the shed pipeline to build `lotCoverageFacts` (today only built for garage) using the
  real mapped-footprint input + `computeParcelAreaSqFt` (already called) + the shed footprint
  (already in memory).
- One coverage rule (candidate C1–C3), reusing/generalizing the garage `LotCoverageFacts`
  scaffold. Every figure labeled `ESTIMATED`; the applicable maximum labeled
  `REQUIRES_VERIFICATION` (which percentage applies).

### Cross-cutting

- `PermitRequirementFinding` and the coverage output render through the existing shared
  `ReportView` component (extended, not replaced).
- Candidate rules P1–P9, C1–C3 enter as `RESEARCHED` and progress through the normal lifecycle;
  **none are activated in this unit** without the founder's tier confirmation + approval.
- No new infrastructure, no new npm dependency, no new external service beyond the Seattle ECA
  REST endpoints (same host + CRS as Building Outlines).

---

## Out of scope / deferred

- **Preliminary feasible-placement-area map (Research Track 4)** — deferred to a 6B follow-on or a
  later unit. Optionally, Functional Design may propose a *minimal* "does your placed shed fit
  inside the setback + 5-ft-separation envelope?" boolean overlay (a small extension of the
  per-edge setback distances already computed) **if** it proves genuinely low-cost — with **no**
  ECA subtraction and **no** negative-buffer erosion. Not required for 6B's value case.
- Trees, permit history, utilities, easements, title research, comparable-permit search — the
  founder's explicit exclusions for this pass. Not investigated.
- Any change to the existing setback / dwelling-separation / vacant-land / garage rules.
- Multi-jurisdiction anything. Seattle only.
- Re-pricing. (Flagged as a decision below — recommendation: keep $9.99.)

---

## Reuse across future project types (per capability)

| Capability | Garage (U4) | Fences (U7) | Decks (U8) | Retaining walls (U9) | Additions (U10) | ADUs (U11) | Vacant land (U5) |
|---|---|---|---|---|---|---|---|
| ECA screening (`environmental-constraints`) | HIGH | HIGH | HIGH | HIGH | HIGH | HIGH | HIGH (replaces the "supplied geometry" stub) |
| Permit determination | HIGH (garages have the same exemption structure) | MEDIUM (fence permit rules differ) | HIGH | MEDIUM | HIGH | HIGH (DADU is the natural extension of P5's "occupiable" branch) | LOW (no specific structure) |
| Lot coverage (`existing-structure-coverage`) | HIGH (replaces the self-reported estimate) | LOW | HIGH | LOW | HIGH | HIGH | MEDIUM |
| Feasible placement (deferred) | HIGH | LOW | MEDIUM | LOW | MEDIUM | HIGH | already have the envelope |

**Belongs in reusable Property Intelligence**: `environmental-constraints`,
`existing-structure-coverage`. **Belongs in project-specific rules**: the permit-state rule,
the coverage-comparison rule, the accessory-setback profile.

---

## Implementation-complexity estimate (relative, for founder planning only)

| Item | Complexity | Why |
|---|---|---|
| ECA adapter + `environmental-constraints` fact | **LOW–MEDIUM** | Direct template of the Building Outlines adapter; 12 layers but one query pattern; CRS already 2926 |
| Wire ECA into the shed pipeline's `ecaFindings` | **LOW** | The path exists (`ecaFindings: []` today); `eca.ts` / `eca-implication.ts` unchanged |
| Permit intake fields + Boundary Validator schema | **LOW** | Mirrors the garage-config `undefined`-not-coerced pattern |
| `PermitRequirementFinding` rule (P1–P9) | **MEDIUM** | New result type; a handful of crisp criteria + two Tier-2 branches; deterministic |
| `existing-structure-coverage` fact | **LOW** | Pure derive-from-facts function, like `buildLotCoverageFacts` |
| Shed lot-coverage rule (C1–C3) | **LOW–MEDIUM** | Reuses the garage `LotCoverageFacts` scaffold + existing PostGIS ops |
| Report rendering (extend `ReportView`) | **LOW–MEDIUM** | New sections; component already shared |
| **Feasible placement (deferred)** | **MEDIUM–HIGH** | Negative-buffer erosion, disjoint multipolygons, advisory/exclusion ECA split, new `SHED_SETBACK` profile |

No stage of the recommended scope requires new infrastructure or a new engine.

---

## Decisions requiring founder approval

1. **Scope**: approve ECA + permit + lot coverage; defer feasible-placement (Track 4). Or
   include a minimal Track 4 overlay. Or a different combination.
2. **New customer inputs for permit determination**: approve adding `foundationType`,
   `attachment`, `intendedUse` as (optional) shed intake fields, plus optional `utilityIntent`
   and `roofEaveProjectionIn`. And: ask them **always**, or **only** when the answer is close to a
   threshold (progressive disclosure)?
3. **Tier confirmation**: confirm the AI-suggested tiers for every candidate rule in
   `candidate-regulatory-rules.md` (P1–P9, C1–C3, F1). AI suggests; you decide.
4. **ECA data-source set**: approve integrating all 12 Seattle ECA layers, or a subset (e.g.
   defer `Landfills_Historical` and `Flood_Prone_Areas`-via-FEMA to later). Confirm the Unit 0B
   Track 4 individual-vs-combined-layer precedence + map-dispositive set carries over to the shed
   workflow unchanged.
5. **Lot-coverage percentage handling**: report the NR 50% figure with a `REQUIRES_VERIFICATION`
   "which limit applies to your zone" caveat (recommended), vs. attempt a zone-specific /
   vesting-aware determination (more work, still Tier 2).
6. **Feasible-placement naming**: if Track 4 is included at all, confirm "Preliminary feasible
   placement area" (not "buildable area").
7. **Pricing**: keep the shed report at **$9.99** (recommended — 6B is about proving value at the
   current price before horizontal expansion), or re-price.
8. **New PropertyContext facts**: confirm `environmental-constraints` and
   `existing-structure-coverage` belong in reusable Property Intelligence (not shed-specific).
9. **User-story treatment**: does permit determination warrant a new user story
   (e.g. `SRE-SHED-PERMIT-1`), or is it an expansion of the existing `SRE-SHED-1` +
   `RGD-1..6` scope? (Recommendation: expansion — no new story; 6B deepens existing stories.
   Reflected in `unit-of-work-story-map.md`.)
10. **External-verification items**: acknowledge the new tracker items (ECA endpoint
    live-verification, per-layer CRS verification, permit-rule professional review, coverage-rule
    professional review) — these are Tier-2 verification obligations, not blockers to Functional
    Design.

---

## Suggested next step (after founder approval of scope)

Proceed to **Unit 6B Functional Design Part 1** (question round) per the normal per-unit
Construction loop — domain entities (the two new facts, the new intake fields, the
`PermitRequirementFinding` type), business rules, business-logic model, and the report-rendering
additions. Do **not** start Code Generation or activate any rule.
