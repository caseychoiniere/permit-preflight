# Unit 5 — Domain Entities (Vacant Land)

Extends Unit 1-4's domain model. Unit 5 is this project's **first second-workflow implementation**,
not a third project type — that distinction is structural, not just naming, and is preserved
throughout this document per the founder's explicit design invariant.

## `WorkflowType` — extended

```ts
export const WorkflowType = {
  EXISTING_PROPERTY: "EXISTING_PROPERTY",
  VACANT_LAND: "VACANT_LAND",
} as const;
```

## `ScreeningRequest` / `ScreeningRequestSnapshot` — now `workflowType`-discriminated unions

**Corrected per founder review (Q1=B)**: not one broad interface with loosely-optional
`projectType`/`projectDetails` fields — a real discriminated union making invalid
workflow/field combinations structurally unrepresentable.

```ts
export type ScreeningRequest = ExistingPropertyScreeningRequest | VacantLandScreeningRequest;

interface ScreeningRequestBase {
  id: string;
  confirmedParcelId: string;
  validationState: ValidationState;
  snapshotTakenAt?: string;
}

export interface ExistingPropertyScreeningRequest extends ScreeningRequestBase {
  workflowType: typeof WorkflowType.EXISTING_PROPERTY;
  projectType: ProjectType; // required - shed | garage | future project types
  projectDetails: ProjectConfiguration; // required
  snapshot?: ExistingPropertyScreeningRequestSnapshot;
}

export interface VacantLandScreeningRequest extends ScreeningRequestBase {
  workflowType: typeof WorkflowType.VACANT_LAND;
  screeningIntent: VacantLandScreeningIntent; // required - see below
  vacantLandDetails: VacantLandDetails; // required, but see its own near-empty shape below
  // NOTE: no `projectType`, no `projectDetails` field exists on this variant AT ALL - not
  // optional-and-unset, structurally absent. `ProjectType`/`ProjectConfiguration` remain the
  // shed/garage proposed-structure family exclusively; VACANT_LAND is never added to `ProjectType`
  // (explicit founder instruction).
  snapshot?: VacantLandScreeningRequestSnapshot;
}

export type ScreeningRequestSnapshot = ExistingPropertyScreeningRequestSnapshot | VacantLandScreeningRequestSnapshot;
export interface ExistingPropertyScreeningRequestSnapshot {
  workflowType: typeof WorkflowType.EXISTING_PROPERTY;
  confirmedParcelId: string;
  projectType: ProjectType;
  projectDetails: ProjectConfiguration;
}
export interface VacantLandScreeningRequestSnapshot {
  workflowType: typeof WorkflowType.VACANT_LAND;
  confirmedParcelId: string;
  screeningIntent: VacantLandScreeningIntent;
  vacantLandDetails: VacantLandDetails;
}
```

Every call site that branches on `screeningRequest.workflowType` gets real, compiler-enforced
narrowing to the correct variant — a `VacantLandScreeningRequest` can never accidentally be read as
if it had a `projectType`, and vice versa. This is the concrete implementation of the founder's
"make invalid combinations unrepresentable where practical" instruction.

## `VacantLandScreeningIntent` — new (Q2)

```ts
export const VacantLandScreeningIntent = {
  VACANT_PARCEL: "VACANT_PARCEL",
  REDEVELOP_EXISTING_PARCEL: "REDEVELOP_EXISTING_PARCEL",
} as const;
export type VacantLandScreeningIntent = (typeof VacantLandScreeningIntent)[keyof typeof VacantLandScreeningIntent];
```

**Why this exists (Q2)**: VL-1's own acceptance criteria allows a user to explicitly choose the
vacant-land path for a parcel with an existing structure they intend to redevelop — Property
Resolution's own `vacant: boolean` characteristic (`parcel-resolution/types.ts`) must never be
silently overridden or ignored to make this work. `screeningIntent` is the explicit, honest record
of which case applies: `VACANT_PARCEL` when the parcel resolution's own `vacant: true` characteristic
matches the user's selection; `REDEVELOP_EXISTING_PARCEL` when the user explicitly asserts a
redevelopment intent regardless of what `vacant` says. The evaluation may assume existing
improvements can be removed where necessary for a `REDEVELOP_EXISTING_PARCEL` scenario, but this
assumption is **never** used to silently erase property-specific concerns (existing legal/
nonconforming status, demolition requirements, easements, vested rights) — see `business-rules.md`
BR-U5-2.

## `VacantLandDetails` — new, deliberately minimal (Q1, Q5's "smallest clean design")

```ts
export interface VacantLandDetails {
  screeningIntent: VacantLandScreeningIntent;
}
```

VL-1's own acceptance criteria is explicit: "does not require any Project Configuration step."
Every other fact the vacant-land evaluation needs (parcel boundary, zoning, ECA/FEMA constraints)
already comes from the existing Property Intelligence/Spatial Analysis pipeline, keyed off the
confirmed parcel alone — there is no proposed-structure shape to collect. This structure may grow
if a future need is found, but starts genuinely minimal rather than speculatively pre-built.

## `LotLineRoles` — new (Correction 3: no placement step exists in this workflow)

**Corrected per founder review**: every setback-dependent figure (U9, and anything downstream of
`setbackConstrainedArea` below) needs front/rear/side lot-line roles, and SMC 23.84A.024's own
"Lot line, front" definition (read live alongside U1's "Lot" definition) is itself a real,
multi-branch determination — single-street frontage is the simple case, but a through-lot,
multi-frontage lot, or a lot with no street frontage each resolve differently, and the
multi-frontage case is explicitly **Director-determined** in the code's own text ("the Director
shall determine... based on the existing pattern of lots and buildings on the block" — a genuine
discretionary mechanism, not a geometry problem). Unlike Unit 1/2/4's proposed-structure flow,
Unit 5's vacant-land intake (`business-rules.md` BR-U5-6, `frontend-components.md`) has **no
placement step** for a user to indicate which edge is which — there is no proposed footprint to
place, so there is nothing for `ParcelPlacementMap`'s existing edge-tap role-indication mechanism
to attach to. Lot-line roles are therefore **not inferrable from parcel polygon shape alone** (a
corner lot's own definition depends on which two lines are "front," which is exactly the fact in
question) and are not asserted from any other data source in this unit.

```ts
export interface LotLineRoles {
  /** ESTABLISHED only if a future minimal role-indication interaction (reusing
   * ParcelPlacementMap's existing edge-tap sub-behavior) is added to the vacant-land intake -
   * NOT built in this unit. INSUFFICIENT is therefore the honest, expected status for every real
   * Unit 5 evaluation today - stated plainly so Code Generation does not under-build the
   * REQUIRES_VERIFICATION path as a rare branch (frontend-components.md). */
  status: "ESTABLISHED" | "INSUFFICIENT";
  roles?: { front: LineSegment; rear: LineSegment; sides: LineSegment[] };
}
```

**Consequence, stated plainly, not smoothed over**: because `LotLineRoles.status` is
`INSUFFICIENT` for every real evaluation in this unit's actual UI, `setbackConstrainedArea` below
is `REQUIRES_VERIFICATION` for every scenario, for every parcel, in this unit's deployed behavior —
the real PostGIS buildable-envelope *capability* is still built and tested (per Q4/BR-U5-3), but it
structurally cannot produce an `ESTABLISHED` result without lot-line roles this minimal UI does not
collect. This is the correct, honest consequence of Q5's "smallest clean design" choice, not a
defect to work around by inferring roles from geometry.

## `BuildableEnvelopeFacts` — new, server-derived, fail-closed, **per-scenario** (Q4, corrected
per founder review — Correction 3)

Not part of `VacantLandDetails`, never client-supplied — assembled server-side at evaluation time
from the confirmed parcel boundary, applicable setback geometry, and measurable ECA exclusions,
using PostGIS as the spatial source of truth (a genuinely new Spatial Analysis capability — the
inverse of Unit 1/4's `computeSetbackDistances`, which measures distance from a *given* footprint
to lot lines; this instead derives the *remaining buildable area* after subtracting every
applicable constraint from the parcel boundary).

**Corrected per founder review**: the prior draft modeled this as one scenario-independent
structure. That is not honest — Table A's setback envelope genuinely varies by scenario (dwelling-
unit count, small-lot/transit branches, per U9), so "the buildable envelope" is not one fixed
number per parcel; it is one figure **per `ResidentialUseScenario`**, keyed to that scenario's own
setback branch. `BuildableEnvelopeFacts` is therefore now owned by `ResidentialUseScenario` below,
not a standalone top-level field of `VacantLandEvaluationOutcome`.

**Side-setback averaging, corrected — twice now**: U9's "5 ft average, 3 ft minimum" side-setback
rule is not describable as a single fixed-width buffer polygon — no one polygon is "the" compliant
envelope under an averaging rule (an infinite family of side walls average to 5 ft while dipping to
3 ft locally). **A prior correction in this same pass wrongly applied the flat 3 ft minimum and
labeled it "conservative" — that was backwards and is withdrawn.** A flat 3 ft/3 ft condition
averages to 3 ft, not 5 ft, and does not satisfy the rule at all; the 3 ft minimum bounds only the
*lowest permitted individual* setback, it does not independently satisfy the average requirement.
The corrected, genuinely conservative approach (option A, the founder's preferred choice): the
PostGIS subtraction applies a **flat 5 ft on each averaging-governed side** — a clearly compliant
subset of the possible envelopes (5 ft/5 ft trivially averages to 5 ft and never dips below the 3
ft floor) — labeled explicitly as a **"conservative fixed-5-foot approximation"**, and understood
to potentially *understate* the true maximum buildable area, since a real design could trade one
side below 5 ft against the other above 5 ft while still respecting the 3 ft minimum and the 5 ft
average. No optimization engine for side-setback averaging is built in this unit — the flat-5-ft
approximation is deliberately simple, not the true achievable maximum.

```ts
export interface BuildableEnvelopeFacts {
  rawParcelAreaSqFt: number;
  /** ESTABLISHED only when LotLineRoles.status is ESTABLISHED for this parcel (see above) AND the
   * scenario's own setback branch (U9) is itself resolved. REQUIRES_VERIFICATION otherwise -
   * expected to be the status for every real evaluation in this unit's current UI, per
   * LotLineRoles' own stated consequence. */
  setbackConstrainedArea:
    | {
        status: "ESTABLISHED";
        areaSqFt: number;
        polygon: Polygon;
        /** true when this scenario's side setback is governed by U9's "5 ft average / 3 ft
         * minimum" branch - in that case this polygon applies a flat 5 ft on each
         * averaging-governed side (NOT the 3 ft minimum - a flat 3/3 condition averages to 3 ft
         * and does not satisfy the rule at all). This is a "conservative fixed-5-foot
         * approximation": a clearly compliant subset of the possible envelopes, never the precise
         * achievable envelope, and the true maximum buildable area may be UNDERSTATED (a real
         * design could trade one side below 5 ft against the other above 5 ft while still
         * respecting the 3 ft minimum and 5 ft average) - never overstated. No optimization engine
         * for side-setback averaging is built in this unit. */
      isConservativeSideSetbackApproximation: boolean;
    }
    | { status: "REQUIRES_VERIFICATION"; reason: string };
  /** SMC 23.44.080.B/23.44.060.D.6-listed ECA area actually measured to intersect the parcel
   * (U11/U4's shared evidence gap) - NOT_APPLICABLE only when confidently no such area exists.
   * Corrected per founder review: the KNOWN branch must carry the actual authoritative exclusion
   * GEOMETRY needed for ST_Difference, not an area scalar alone - an area number cannot produce
   * buildablePolygon by itself. */
  ecaExclusionArea:
    | { status: "NOT_APPLICABLE" }
    | { status: "REQUIRES_VERIFICATION"; reason: string }
    | {
        status: "KNOWN";
        excludedAreaSqFt: number;
        /** REQUIRED alongside the area scalar - the actual authoritative exclusion geometry
         * ST_Difference needs to subtract this area from the setback-constrained polygon. An area
         * number alone cannot produce a polygon. Exact shape/provenance tracking is a Code
         * Generation decision (either inline here, as shown, or as a separate server-derived
         * Spatial Analysis result keyed to this fact) - the binding requirement is that
         * buildablePolygon is never derived by subtracting a scalar. */
        excludedGeometry: Polygon | MultiPolygon;
        provenance: string;
      };
  /** The final candidate buildable area/polygon - producible ONLY when BOTH
   * setbackConstrainedArea.status is ESTABLISHED AND ecaExclusionArea.status is NOT_APPLICABLE or
   * KNOWN (i.e. carrying real excludedGeometry, not merely a known area). undefined otherwise -
   * never a partial polygon presented as "the buildable envelope" (explicit founder instruction),
   * and never a polygon derived by subtracting an area scalar. If excludedAreaSqFt is known
   * numerically but excludedGeometry is unavailable, buildableAreaSqFt/buildablePolygon remain
   * undefined (REQUIRES_VERIFICATION) rather than guessed. Building this capability does not mean
   * always reporting a number - most real parcels are expected to stay undefined here under the
   * POC's current evidence coverage (the same ECA/transit-area gaps vacant-land-rule-inventory-
   * and-tier-triage.md's U4/U7/U11/U13 already name, PLUS LotLineRoles' own INSUFFICIENT default),
   * and that is correct, not a defect - the point of this correction is that the capability is
   * structurally correct when tested with synthetic/known geometry, not that it resolves more
   * often today. No new ECA geometry provider is added in this unit just to make this path
   * reachable. */
  buildableAreaSqFt?: number;
  buildablePolygon?: Polygon;
  /** Table A footnote exceptions (e.g. Queen Anne Boulevard) - REQUIRES_VERIFICATION when this
   * parcel's footnote-eligibility facts are unestablished, rather than silently assuming the
   * footnote does not apply. */
  footnoteExceptionStatus: "NOT_APPLICABLE" | "REQUIRES_VERIFICATION" | "KNOWN";
}
```

## `DensityFacts` — new (Correction 2: SMC 23.44.060.D.1/D.6/E, U16-U17)

```ts
export interface DensityFacts {
  /** Property Intelligence's existing parcel-boundary geometry - unchanged, always known once a
   * parcel is confirmed. */
  rawParcelAreaSqFt: number;
  /** The D.6/E-corrected divisor U3-U7's density rates actually apply to (U16) - undefined
   * (fail-closed) whenever steep-slope-non-disturbance or other D.6-listed ECA area might
   * intersect the parcel but is not measurable, per the same ECA area-of-overlap gap
   * U4/U7/U11/U13 already name. rawParcelAreaSqFt is NEVER substituted as a stand-in when this is
   * undefined. */
  densityCountableLotAreaSqFt?: number;
}
```

## `ResidentialUseScenario` — new (VL-4's "plausible supported residential-use scenarios")

A named, self-contained hypothetical development configuration, each independently evaluated
against the density/height/coverage candidates in `vacant-land-rule-inventory-and-tier-triage.md` —
not a single number, since VL-4's own acceptance criteria calls for multiple scenarios, each tied
to its own supporting evidence.

```ts
export interface ResidentialUseScenario {
  /** e.g. "GENERAL_DENSITY", "STACKED_MULTI_UNIT", "SMALL_LOT_BONUS", "FREQUENT_TRANSIT_BONUS" -
   * corresponds to which SMC 23.44.060.A/C subclause and 23.44.080 percentage the scenario
   * represents (vacant-land-rule-inventory-and-tier-triage.md's U3-U7, U14-U15). Not an exhaustive
   * closed enum in this design - Code Generation may add scenario identifiers as the rule
   * inventory's own candidates dictate. */
  scenarioId: string;
  description: string;
  /** Final figure has SMC 23.44.060.D.1's fraction-rounding rule (U17) already applied - never
   * ordinary floor/round arithmetic. */
  maxDwellingUnits: ScenarioFigure;
  maxHeightFt: ScenarioFigure;
  maxLotCoveragePercent: ScenarioFigure;
  /** Corrected per founder review (Correction 3): owned per-scenario, not one
   * scenario-independent top-level structure - this scenario's own setback branch (U9) determines
   * the setback envelope subtracted from the parcel boundary, which genuinely differs by
   * dwelling-unit count/small-lot/transit branch across scenarios. */
  buildableEnvelope: BuildableEnvelopeFacts;
  /** Citations backing this scenario's figures - traces to the specific candidate(s) in the rule
   * inventory, matching requirements.md §5.3's evidence-traceability requirement (also VL-5's own
   * AC). */
  citations: string[];
}

/** Each figure a scenario reports is independently KNOWN or REQUIRES_VERIFICATION - a scenario is
 * not all-or-nothing (e.g. a scenario's density may be KNOWN while its height depends on an
 * unresolved A.2.d question, per U8). */
export type ScenarioFigure =
  | { status: "KNOWN"; value: number }
  | { status: "REQUIRES_VERIFICATION"; reason: string };
```

## `VacantLandEvaluationOutcome` — new (replaces the shed/garage `EvaluationOutcome` for this
workflow)

```ts
export interface VacantLandEvaluationOutcome {
  /** U1/U2 - the buildability-floor and permitted-use findings, reusing the existing Finding
   * shape/classification vocabulary (KNOWN/INFERRED/REQUIRES_VERIFICATION) unchanged - no new
   * classification concept introduced. */
  buildabilityFindings: Finding[];
  /** New (Correction 2) - the D.6/E-corrected density divisor, shared across all scenarios'
   * density figures (unlike BuildableEnvelopeFacts, this does not vary by scenario - it is a
   * property of the parcel, not of a hypothetical development configuration). */
  densityFacts: DensityFacts;
  /** Corrected per founder review (Correction 3): buildableEnvelope is no longer a top-level
   * field here - it moved onto each ResidentialUseScenario, since the setback-constrained area
   * genuinely varies by scenario. */
  scenarios: ResidentialUseScenario[];
  /** Diligence risks (VL-4) - reuses Finding's own REQUIRES_VERIFICATION classification rather
   * than a new "risk" concept; a risk IS a REQUIRES_VERIFICATION finding by construction (an
   * unresolved fact material to the assessment), not a separate vocabulary. */
  diligenceRisks: Finding[];
}
```

No new `FindingClassification` value is introduced - `KNOWN`/`INFERRED`/`REQUIRES_VERIFICATION`
(`regulatory-rules-engine/types.ts`) are reused exactly as Units 1-4 defined them.

## `RegulatoryRuleApplicabilityScope` — new, generalizes `RegulatoryRule.applicableProjectType`
(Correction 4)

**Corrected per founder review**: the prior draft's plan to set `applicableProjectType` to a
string shortcut like `"vacant-land"` was withdrawn — it would have made vacant-land candidates
evaluable only via a parallel, hand-rolled matching mechanism outside the real governed-rule path,
contradicting this project's own core invariant (`authoritative sources → governed RegulatoryRule
content → evaluator → findings/evidence → report`, unbroken since Unit 1). It also directly
contradicted `business-logic-model.md`'s own Workflow U5-2 draft, which described evaluating real
SMC-derived numbers while `business-rules.md`'s BR-U5-5 simultaneously claimed no Unit 5 candidate
is ever governance-drafted as a `RegulatoryRule` row at all — a genuine, self-caught
contradiction, now resolved by making Unit 5 candidates real, governed `RegulatoryRule` rows,
scoped by workflow rather than by a string convention:

```ts
export type RegulatoryRuleApplicabilityScope =
  | { workflowType: typeof WorkflowType.EXISTING_PROPERTY; projectType: ProjectType }
  | { workflowType: typeof WorkflowType.VACANT_LAND };
```

`RegulatoryRule` (`regulatory-rule-governance/types.ts`) gains an `applicabilityScope` field of
this shape, generalizing the existing `applicableProjectType` string field one level up to the
workflow itself — the same discriminated-union pattern `ScreeningRequest` (BR-U5-1) and
`ProjectConfiguration` (Unit 4) already established, applied here to rule governance. A Unit 5
candidate (U1-U17) is drafted as a real `RegulatoryRule` row with
`applicabilityScope: { workflowType: "VACANT_LAND" }` — never a shed/garage-shaped row with a
repurposed string field. The evaluator queries `ACTIVE` rules by `applicabilityScope` exactly the
way it already queries by `applicableProjectType` today; no new matching mechanism, no hardcoded
SMC numbers inside `evaluateVacantLand`-equivalent code. Exact schema/migration mechanics
(replacing vs. additively generalizing `applicableProjectType`) are a Code Generation decision;
this design only commits to the discriminated shape and the single evaluation path.

**Direct consequence for Workflow U5-2** (`business-logic-model.md`): because no Unit 5 candidate
reaches `ACTIVE` within this unit (same governance discipline as Unit 4's 13 candidates — BR-U5-5,
unchanged), the deployed POC's actual scenario evaluation is dominated by "no `ACTIVE` rule
coverage" disclosures, the same mechanism Unit 4's `uncoveredConstraintTypes`
(`regulatory-rules-engine/types.ts`) established — not by real computed numbers. The prior draft's
claim that "no `uncoveredConstraintTypes`-style tag is needed" is withdrawn; Unit 5 needs the exact
same mechanism, reused, not a new one.

## Persistence Consequence of the `workflowType`-Discriminated Union (Correction 6)

**Corrected per founder review**: BR-U5-1's discriminated union is a real TypeScript-level
invariant, but the actual Postgres `screening_requests` table's `project_type`/`project_details`
columns are currently `NOT NULL` — a real gap between the type design and what the schema would
actually enforce, left undocumented in the prior draft. This design commits to the real consequence
(exact migration SQL deferred to Code Generation, per this project's established
Functional-Design-specifies/Code-Generation-implements pattern):
- `project_type` and `project_details` become **nullable** (required only for
  `workflow_type = 'EXISTING_PROPERTY'` rows).
- Two new **nullable** columns are added: `screening_intent`, `vacant_land_details`
  (required only for `workflow_type = 'VACANT_LAND'` rows).
- A **database-level `CHECK` constraint** enforces the discriminated invariant directly (not left
  to application-code discipline alone) — approximately: `workflow_type = 'EXISTING_PROPERTY'`
  requires `project_type IS NOT NULL AND project_details IS NOT NULL AND screening_intent IS NULL
  AND vacant_land_details IS NULL`, and the mirror-image condition for `'VACANT_LAND'`. This
  matches the project's existing practice of pushing structural invariants into the schema
  wherever practical (the same discipline `jsonb`-shape-by-discriminant already follows for
  `ProjectConfiguration`), rather than relying solely on TypeScript's compile-time narrowing, which
  cannot protect data written or read outside the application layer.
