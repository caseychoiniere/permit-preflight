# Unit 4 — Frontend Components (Detached Garages)

Extends Unit 2's `frontend-components.md` (`ProjectConfigurationFlow`, `ProjectTypeSelector`,
`ParcelPlacementMap`, `ReportView` and its children) — reused unchanged except where noted. Only new
or modified components are documented here.

**Revised 2026-08-26 per founder review**: `GarageDetailsForm` now collects
`existingStructuresFootprintSqFt` (Founder Decision 1 resolved the Q1 fallback) with an explicit
3-choice UX rather than a plain text box, and `ReportView`'s garage lot-coverage rendering gains an
explicit prohibition on mislabeling garage-footprint-alone as the SMC lot-coverage result
(Correction 2/3).

**Revised again 2026-08-26 (regulatory-completeness pass, round 2)**: `GarageDetailsForm`'s intake
copy corrected for numerator semantics — the quantity asked for is the SMC-*countable*
existing-structure area (23.44.080.C's exclusions applied), not raw/gross footprint of every
existing structure (`business-rules.md` BR-U4-3 revised).

## `ProjectTypeSelector` (PC-1) — no component change; advertised value now conditionally gated

Unchanged component. `availableProjectTypes` includes `"garage"` only once Workflow U4-3's
readiness gate (`business-rules.md` BR-U4-9) is `true` for the current request — **not**
unconditionally, and not merely because `GARAGE` is in `SUPPORTED_PROJECT_TYPES` (BR-U4-1, revised,
Correction 4: intake-support and public purchase eligibility are separate gates now). This was
already the component's designed extension point (Unit 2's own note: "the component itself contains
no hardcoded assumption that shed is the only type") and requires no change here — only the
server-side list it's fed changes, and "absent means absent" (PC-1) continues to apply exactly as
before: while the gate is closed, `GARAGE` is simply not in the list, never a disabled/"coming soon"
option.

## `GarageDetailsForm` (new, mirrors `ShedDetailsForm`'s PC-2 pattern)

- **Props**: `value: { widthFt, depthFt, heightFt, alleyAdjacent, existingStructuresFootprintSqFt?
  }`, `onChange`, `serverErrors: Record<string, string>`.
- **`existingStructuresFootprintSqFt` input (Founder Decision 1, 2026-08-26)**: presented as a
  3-choice control, not a plain number field defaulting to blank/zero:
  1. "Enter combined square footage of existing structures on this parcel" (a number input).
  2. "There are no existing structures on this parcel" (submits explicit `0` — a deliberate
     assertion, per BR-U4-3).
  3. "I don't know / skip this" (submits `undefined` — never inferred as `0`).
  **Numerator semantics corrected (round 2)**: accompanying plain-language copy asks specifically
  for the *countable* combined footprint of existing structures on the parcel — garages, sheds,
  other accessory buildings, and the principal dwelling, **excluding** underground portions, minor
  eave/roof/cornice overhangs, low decks, and small unenclosed porches/steps (SMC 23.44.080.C's own
  exclusion categories, restated in plain language, not legal citation, for the applicant) — not
  simply every square foot of every structure's outer footprint. The copy does not require the
  applicant to compute this with precision (a good-faith approximation is expected and sufficient,
  since the resulting finding is `REQUIRES_VERIFICATION` regardless of value) and explicitly does
  **not** imply this quantity is the same thing as assessed improvement value, gross floor area,
  roof area, or impervious surface (`business-rules.md` BR-U4-3; `lot-coverage-data-source-
  validation.md`'s own rejected-proxy findings). Copy also states plainly that this is a
  self-reported figure and the resulting lot-coverage finding will be marked "requires verification"
  regardless of what is entered — set expectations before submission, not only in the report
  afterward.
- Client-side validation is advisory only; the server call remains authoritative (PC-2, unchanged
  discipline).

## `ParcelPlacementMap` (Workflow 2/PC-2) — reused unchanged

No new props or behavior. Constructs `proposedFootprint` from anchor + orientation + the garage's
`widthFt`/`depthFt` exactly as it already does for a shed's dimensions — the component has no
project-type-specific logic to change.

## `ReportView` — new disclosure requirements

### Garage lot-coverage rendering — labeling prohibition (Founder Decision 1, Correction 2/3)

The report may show the garage's own `proposedGarageCountableFootprintSqFt` (`domain-entities.md`'s
`LotCoverageFacts`) as plain factual geometry — a real, known quantity. It must **never** be
labeled, by itself, as the project's SMC "lot coverage" result (i.e., never rendered as
`proposedGarageCountableFootprintSqFt / rawParcelAreaSqFt` presented as if it were the regulatory
percentage) — that would silently substitute a narrower, different quantity for the one
SRE-GARAGE-1 actually promises (existing structures + proposed garage, over the applicable
allowed-coverage denominator, BR-U4-7). Whenever the combined figure is `REQUIRES_VERIFICATION`
(BR-U4-3/BR-U4-7 — expected to be the common case today, now for several independent reasons:
unverified existing-structures input, an unmeasurable countable-lot-area exclusion, an unresolved
applicable-percentage question, or an unresolved minimum-floor applicability question), the report
shows that classification with its actual explanation rather than silently falling back to a
garage-only number dressed up as the real result.

## `ReportView` — new disclosure requirement (BR-U4-5, Workflow U4-2 step 6)

### `NoActiveRuleCoverageNotice` (new)

- **Props**: `constraintType: string` (e.g. `"setback"`, `"height"`, `"lot coverage"`),
  `projectType: string`.
- Renders when `EvaluationOutcome`'s "no `ACTIVE` rule for this constraint/project type" tag
  (Workflow U4-1 step 5) is set for a given constraint. Plain-language statement that this specific
  constraint could not yet be automatically screened for this project type — explicitly **not**
  styled or worded as a pass/clean result, and visually distinct from `FindingsList`'s existing
  `KNOWN`/`INFERRED`/`REQUIRES_VERIFICATION` cards (RGD-6) so it cannot be mistaken for one of them
  at a glance.
- Rendered per-constraint, not as a single blanket "garages aren't supported yet" banner — a garage
  report may have some constraints covered (if/when any garage rule reaches `ACTIVE`) and others not,
  and the disclosure must reflect that per-constraint reality rather than an all-or-nothing message.

### `FindingsList` (RGD-6, Unit 2) — consumption change only

No prop-shape change. Its rendering logic now checks the per-constraint "no active coverage" tag
before treating an absence of findings for that constraint as "nothing to show" — an absence caused
by "no rule exists yet" must route to `NoActiveRuleCoverageNotice`, not be silently dropped as if the
constraint were simply compliant.

## Accessibility

No new accessibility requirements beyond Unit 2's existing baseline (`requirements.md` §10) —
`NoActiveRuleCoverageNotice` follows the same text-contrast/screen-reader-label conventions already
applied to `RequiresVerificationCard`.
