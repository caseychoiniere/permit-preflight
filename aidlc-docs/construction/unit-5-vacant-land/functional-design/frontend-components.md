# Unit 5 — Frontend Components (Vacant Land)

Extends Unit 2/4's `frontend-components.md` (`ReportView`, `FindingsList`,
`RequiresVerificationCard`, `NoActiveRuleCoverageNotice`, existing address/parcel-resolution UI
inside `app/configure/page.tsx`) — reused where noted. Per Q5's "smallest clean design that
establishes the distinct workflow" instruction: only new/modified components are documented here,
and existing address-resolution UI is reused, not duplicated.

## Entry point — new, distinct from `/configure` (BR-U5-6)

**New (Correction 5, BR-U5-9)**: before the entry point renders anything else, it fetches a
vacant-land coverage-readiness signal — mirroring Unit 4's `available-project-types` route/pattern
exactly — and only advertises the vacant-land journey (the "Screen this vacant lot"/"Screen for
potential redevelopment" options below) when that check returns available. Stays `false` through
the POC (BR-U5-9), so in practice this entry point does not yet advertise itself; the mechanism is
built and wired now regardless, matching how Unit 4's TYPE step was corrected to work.

**Reuses**: whatever address/parcel-confirmation UI `/configure`'s own `ADDRESS` step already
implements (the same `POST /api/parcels/resolve` + boundary-fetch call sequence) — not a second,
independent implementation of address resolution. Exact packaging (a shared component extracted
from `/configure`'s existing inline implementation, vs. a small new route that duplicates only the
minimal fetch calls) is a Code Generation decision; either is acceptable as long as the actual
resolution logic is not reimplemented twice.

**New**: after a parcel is confirmed, a **screening-intent selector** distinct from `/configure`'s
TYPE step — never rendered inside `/configure` itself (BR-U5-6's explicit "never another option
inside the shed/garage TYPE step"):
- "Screen this vacant lot" — rendered only when the confirmed parcel's own `vacant` characteristic
  is `true` (reuses the existing parcel-resolution response, no new fetch).
- "Screen for potential redevelopment" — always available, regardless of `vacant`.
- Selecting either creates a `VacantLandScreeningRequest` (`workflowType: "VACANT_LAND"`,
  `screeningIntent` set accordingly) and proceeds directly to authorization/payment — **no
  intervening dimension/placement/details step**, matching VL-1's explicit "no Project
  Configuration step" requirement.

## `VacantLandReportView` — new, or a conditional branch within the existing `ReportView` (Code
Generation's call; both satisfy this design)

Renders `VacantLandEvaluationOutcome` (`domain-entities.md`) rather than a shed/garage
`EvaluationOutcome`'s findings array alone:

- **Buildability & use findings** (U1/U2) — reuses the existing `FindingsList`/
  `RequiresVerificationCard` pattern unchanged; these are ordinary `Finding` objects. **Corrected
  per founder review**: also reuses the existing `NoActiveRuleCoverageNotice` pattern (Unit 4)
  whenever U1/U2's governing `RegulatoryRule` row has no `ACTIVE` coverage (`business-logic-model.md`
  Workflow U5-2 step 2) — U2 never renders as a plain `KNOWN` value in the deployed POC merely
  because its rule text is unambiguous; it renders the same no-coverage disclosure every other
  ungoverned candidate in this unit does.
- **Scenario cards** (new) — one card per `ResidentialUseScenario`, showing `maxDwellingUnits`/
  `maxHeightFt`/`maxLotCoveragePercent`, each figure rendered per its own `ScenarioFigure` status
  (a plain value when `KNOWN`, a `RequiresVerificationCard`-styled inline note when
  `REQUIRES_VERIFICATION` — never a fabricated number). Each card cites the specific rule
  candidate(s) backing it (VL-5's evidence-traceability requirement), matching `EvidenceAppendix`'s
  existing citation-display pattern.
- **Buildable-envelope display, per scenario** (new — **corrected per founder review, Correction
  3**: `BuildableEnvelopeFacts` now lives on each scenario, not one shared parcel-level field, so
  this renders once per scenario card, not once for the whole report) — when that scenario's own
  `buildableAreaSqFt`/`buildablePolygon` are both defined, render the polygon on `ReportMap`
  (reused unchanged — it already displays arbitrary evidence-sourced geometry) and the area figure,
  with a visible **"conservative fixed-5-foot approximation"** label whenever
  `isConservativeSideSetbackApproximation` is `true` (never presented as the precise achievable
  envelope — **corrected per founder review**: this label must never read as if a 3 ft setback were
  the conservative choice; the approximation actually applied is a flat 5 ft on each
  averaging-governed side, understating rather than overstating true buildable area); when either
  is `undefined`, render a plain-language notice ("a preliminary
  buildable-area figure could not be established for this scenario — see diligence risks below") —
  **never** a partial/best-effort polygon rendered as if it were the real buildable envelope
  (BR-U5-3's explicit prohibition, mirrored at the UI layer the same way Unit 4's lot-coverage
  labeling prohibition was). **Expected to render this notice for essentially every real
  evaluation in this unit's current UI** — `LotLineRoles` has no establishment mechanism in this
  minimal design (no placement step exists to indicate front/rear/side, `domain-entities.md`), so
  `setbackConstrainedArea`/`buildableAreaSqFt` stay `REQUIRES_VERIFICATION`/`undefined` by honest
  default; this is correct behavior for this unit, not a bug to route around. A future minimal
  role-indication interaction (reusing `ParcelPlacementMap`'s existing edge-tap sub-behavior) could
  close this gap later without redesigning this component, but is not built in this unit.
- **Diligence risks section** (new, but structurally identical to `FindingsList`'s existing
  `REQUIRES_VERIFICATION` rendering — a distinctly-labeled section header, "Diligence Risks," over
  the same card component, not a new visual pattern).
- **Explanation** — reuses `ExplanationPanel` unchanged, rendering Report Explanation's plain-
  language synthesis with the existing graceful-degradation ("temporarily unavailable") fallback.
- **"Preliminary screening assessment" framing** — the report's own heading/copy uses this phrase
  throughout, never "recommendation" (VL-5's explicit acceptance criterion) — a copy-level
  requirement Code Generation must hold to, not a new component.

## Accessibility

No new accessibility requirements beyond Unit 2's existing baseline (`requirements.md` §10) —
scenario cards and the buildable-envelope notice follow the same text-contrast/screen-reader-label
conventions already applied to `RequiresVerificationCard`/`NoActiveRuleCoverageNotice`.
