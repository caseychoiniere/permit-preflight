# Unit 2: Frontend Components

First unit with a real UI surface (Unit 1 had none). Scope: PC-1, PC-2, RGD-2, RGD-3, RGD-6 only,
per Question 7's answer — real and usable, not commercially polished. No marketing pages,
checkout/payment, pricing UI, accounts, subscriptions, customer dashboards, broad multi-project-
type navigation, or growth/analytics tooling. Concrete framework/build tooling (Next.js specifics,
map library choice, PDF rendering tech) is an NFR Requirements/Infrastructure Design decision for
this unit, not fixed here — this document defines component structure, props/state, interaction
flow, and validation, technology-agnostically enough to survive that choice.

## Component Hierarchy

```
ProjectConfigurationFlow (PC-1, PC-2)
├── ProjectTypeSelector (PC-1)
├── ShedDetailsForm (PC-2 — dimensions)
├── ParcelPlacementMap (PC-2 — Workflow 2's minimal map interaction)
│   └── ManualDistanceFallback (internal/testing only, hidden from the primary customer flow)
└── ConfigurationSummary (review before generation-authorization is requested elsewhere)

ReportView (RGD-2, RGD-3, RGD-6)
├── ReportHeader (generation date, project summary, rule/data versions used — RGD-4 visibility)
├── FindingsList
│   ├── FindingCard (KNOWN / INFERRED)
│   └── RequiresVerificationCard (RGD-6 — visually/structurally distinct)
├── ReportMap (map view of buildable/constrained areas — RGD-2)
├── ExplanationPanel (RGD-5 — shows narrative, or "temporarily unavailable")
├── EvidenceAppendix (provenance, including any qualityCaveat text — BR-U2-4, never omitted)
└── PdfDownloadButton (RGD-3)
```

## ProjectConfigurationFlow

**Props**: `confirmedParcel: { parcelId, canonicalAddress, boundaryPolygon }` (boundaryPolygon
fetched for display only — see Workflow 4's note that the frontend never computes setbacks itself).

**State**: `screeningRequestDraft: ShedProjectConfiguration & { validationState }`, `currentStep:
"TYPE" | "DETAILS" | "PLACEMENT" | "SUMMARY"`.

**Behavior**: a linear, revisitable wizard (PC-1: "distinct, revisitable step — user can go back
and pick a different type"). Submits to the server-side validation endpoint on each step's
completion (PC-2: server-side validation regardless of client-side checks) — a step cannot advance
past a failed server validation, and the specific error is shown, not a generic failure message.

### ProjectTypeSelector (PC-1)
- **Props**: `availableProjectTypes: string[]` — server-supplied, currently always `["shed"]"` in
  Unit 2; the component itself contains no hardcoded assumption that shed is the only type, so a
  later unit adding a type requires no change here.
- Never renders a "coming soon"/disabled option for an unsupported type — absent means absent
  (PC-1's explicit acceptance criterion).

### ShedDetailsForm (PC-2)
- **Props**: `value: { widthFt, depthFt, heightFt, alleyAdjacent }`, `onChange`, `serverErrors:
  Record<string, string>` (populated after a failed server-side validation call).
- **Validation**: client-side checks are advisory/UX-only (immediate feedback for obviously
  malformed input, e.g. negative dimensions) — the authoritative rejection always comes from the
  server call per PC-2; the form must render whatever specific error the server returns, not
  invent its own generic one.

### ParcelPlacementMap (PC-2, Workflow 2)
- **Props**: `boundaryPolygon: Polygon`, `shedDimensions: { widthFt, depthFt }`,
  `onFootprintChange: (footprint: Polygon, anchor, orientation) => void`, `onLotLineRolesChange:
  (assignment: LotLineRoleAssignment) => void` (**added 2026-08-22**).
- **State**: `anchorPoint?`, `orientation?` (a single rotation value — no multi-handle editing),
  `frontEdgeSelection?`, `rearEdgeSelection?` (**added 2026-08-22**).
- **Interaction**: user taps/clicks to place an anchor point on the displayed parcel; a simple
  control (e.g. a rotation slider or two-tap "point this way" gesture) sets orientation. The
  component constructs the rectangular `proposedFootprint` from anchor + orientation +
  `shedDimensions` (client-side construction is acceptable here — Workflow 2 left this
  implementation-side) and calls `onFootprintChange`.
- **Front/rear indication (added 2026-08-22, BR-U2-9)**: the user separately taps the boundary
  segment that is the front lot line and the one that is the rear lot line (two simple selections
  on the already-displayed polygon edges — not a new drawing tool). If the parcel's shape makes the
  remaining boundary unambiguously "side" given those two selections, the component calls
  `onLotLineRolesChange({ status: "ASSIGNED", frontEdgeRef, rearEdgeRef, sideEdgeRefs, method:
  "USER_INDICATED", ... })`. If the shape can't safely support that (corner lot, irregular/
  multi-sided parcel, multiple frontages, or the two selections don't yield an unambiguous
  remainder), the component calls `onLotLineRolesChange({ status: "INSUFFICIENT" })` and displays a
  plain explanation that setback findings depending on lot-line role will show as "requires
  verification" rather than guessing — never silently proceeding as if roles were assigned.
- **Explicitly not built**: snapping, dimension handles, multi-point polygon editing, freehand
  drawing, undo/redo history, layered drawing tools, or any automatic frontage/street-relationship
  detection. A single re-placeable anchor + rotation, plus two edge-role taps, is the entire
  interaction surface.
- Displays a persistent, visible label: "Approximate placement — not a survey or construction
  plan," and, when role assignment is `INSUFFICIENT`, an additional plain-language note that
  lot-line roles could not be determined for this parcel shape.

### ManualDistanceFallback
- **Props**: `value: { distanceToRearLotLineFt?, distanceToSideLotLineFt?,
  distanceToFrontLotLineFt? }`, `onChange`.
- Not part of the primary customer-facing flow (Question 3) — reachable only via an internal/
  testing entry point (e.g. a query-param-gated or developer-only route), never presented as an
  equal alternative to `ParcelPlacementMap` in the normal flow.

## ReportView

**Props**: `reportAccessToken: string` (from the URL — the component fetches via
`getReport(reportAccessToken)`, BR-U2-7; it never accepts or displays a bare `reportId` as if it
were sufficient for access).

**State**: `report: EvidenceReportArtifact | "LOADING" | "NOT_FOUND"`.

### FindingsList / FindingCard / RequiresVerificationCard (RGD-6)
- **Props** (`FindingCard`): `finding: Finding` (KNOWN/INFERRED only).
- **Props** (`RequiresVerificationCard`): `finding: Finding` (REQUIRES_VERIFICATION only) — a
  visually distinct component/style, not a conditional style branch buried inside `FindingCard`,
  so the structural distinction RGD-6 requires can't quietly erode into "same card, different
  color." Renders what could not be determined, why, and (from `explanationBasis`/evidence) what
  kind of verification would resolve it, when available.

### ReportMap (RGD-2)
- **Props**: `findings: Finding[]`, `boundaryPolygon`, `proposedFootprint`.
- Communicates likely-buildable / conditionally-buildable / constrained areas visually where
  practical. Every finding shown on the map must also appear in `FindingsList` (the accessible
  non-map representation, requirements.md §10) — `ReportMap` is a supplementary view, never the
  only place a finding is communicated.

### ExplanationPanel (RGD-5)
- **Props**: `explanation?: { text, referencedFindingIds[] }`.
- If `explanation` is present: text with visible references to the specific findings it explains.
- If absent: a plain, honest "plain-language synthesis is temporarily unavailable" message —
  never an empty section, a loading spinner that never resolves, or a generic error.

### EvidenceAppendix (BR-U2-4)
- **Props**: `evidence: EvidenceEntry[]` (each with `provenance`, including `qualityCaveat` when
  present).
- Renders every caveat verbatim — specifically, the parcel-boundary source-quality caveat must be
  visible here (and, for any finding that depends on it, referenced from that finding too) whenever
  King County's parcel-polygon layer supplied the underlying geometry. This is a hard requirement,
  not a nice-to-have: BR-U2-4 makes it a defect for this text to be silently absent.

### PdfDownloadButton (RGD-3)
- **Props**: `reportAccessToken`.
- Triggers PDF retrieval/generation from the same snapshot (BR-U2-6) — never a client-side
  "print this page" substitute that could drift from the authoritative rendering.

## Accessibility (requirements.md §10, reaffirmed for this unit's first real UI)
Every map-communicated finding has a non-map equivalent (`FindingsList`); form errors are
associated with their fields (not a generic banner only); the placement interaction
(`ParcelPlacementMap`) must remain operable via keyboard/non-pointer input at a basic level even
though it's a map interaction — exact mechanism (e.g. arrow-key nudging of the anchor point once
placed) is an implementation detail for Code Generation, not fixed here, but the requirement itself
is not deferred.
