/**
 * Unit 5 (Vacant Land) domain types (domain-entities.md, final correction pass; Code Generation
 * review correction pass 2026-08-27). Kept in a dedicated file rather than added to types.ts -
 * a genuinely separate evaluation family from ShedProjectDetails/GarageProjectDetails, reusing
 * `Finding`'s existing KNOWN/INFERRED/REQUIRES_VERIFICATION classification vocabulary unchanged
 * (no new classification concept introduced there).
 *
 * **Corrected per founder review**: `ScenarioFigure` and `SetbackConstrainedAreaResult` are now
 * real THREE-state discriminated unions (KNOWN / NO_ACTIVE_COVERAGE / REQUIRES_VERIFICATION,
 * mirroring EVIDENCE UNKNOWN / NO ACTIVE GOVERNED RULE / RUNTIME FAILURE), not two-state unions
 * that were forcing "no ACTIVE rule" and "evidence genuinely unresolved" into the same
 * REQUIRES_VERIFICATION bucket. `NO_ACTIVE_COVERAGE` carries no `reason` and is never turned into
 * a diligence-risk Finding - it is disclosed exclusively via `uncoveredConstraintTypes`.
 */

import type { Geometry } from "../spatial-analysis/types.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import type { Finding } from "./types.js";

/** A citation-bearing pointer to the real ACTIVE RegulatoryRule row that produced a KNOWN value -
 * never a hardcoded SMC citation string. Every KNOWN ScenarioFigure/setback result carries one, so
 * report rendering can trace a displayed figure to the actual governed rule version used
 * (Correction 1D). */
export type AppliedRuleRef = Pick<RegulatoryRule, "id" | "subject" | "citation">;

/** Unit 5 (Correction 2, SMC 23.44.060.D.6+E / D.1 - U16/U17). `rawParcelAreaSqFt` is undefined
 * when Property Intelligence/Spatial Analysis could not establish the parcel's own area - NEVER
 * defaulted to 0 (a missing area is unknown, not zero). `densityCountableLotAreaSqFt` is the
 * D.6/E-corrected divisor every density rate actually applies to - undefined (fail-closed)
 * whenever steep-slope-non-disturbance or other D.6-listed ECA area might intersect the parcel but
 * is not measurable. `rawParcelAreaSqFt` is NEVER substituted as a stand-in when this is
 * undefined. */
export interface DensityFacts {
  rawParcelAreaSqFt?: number;
  densityCountableLotAreaSqFt?: number;
}

export const LotLineRoleEstablishmentStatus = {
  ESTABLISHED: "ESTABLISHED",
  INSUFFICIENT: "INSUFFICIENT",
} as const;
export type LotLineRoleEstablishmentStatus = (typeof LotLineRoleEstablishmentStatus)[keyof typeof LotLineRoleEstablishmentStatus];

/** Unit 5 (Correction 3). Unlike Unit 1/2/4's proposed-structure flow, Unit 5's vacant-land intake
 * (BR-U5-6) has no placement step for a user to indicate which edge is which - INSUFFICIENT is
 * therefore the honest, expected status for every real Unit 5 evaluation in this unit's current
 * UI. The PostGIS capability must still be implementable/testable with synthetic ESTABLISHED
 * roles (founder correction). Front/rear/side roles are never inferred from parcel polygon shape
 * alone. When ESTABLISHED, `roles` carries the actual edge references the setback computation
 * must consume (Code Generation review correction - previously ignored). */
export interface LotLineRoles {
  status: LotLineRoleEstablishmentStatus;
  roles?: { frontEdgeRef: string; rearEdgeRef: string; sideEdgeRefs: string[] };
}

/** Unit 5 (Correction 3, Final Correction, Code Generation review correction). Owned per-
 * `ResidentialUseScenario`, not one scenario-independent structure - Table A's setback envelope
 * genuinely varies by scenario. Three-state per §2 above: `ESTABLISHED` (real PostGIS result),
 * `NO_ACTIVE_COVERAGE` (no ACTIVE governed setback rule exists for this scenario - never a
 * hardcoded placeholder profile), `REQUIRES_VERIFICATION` (a rule IS ACTIVE but the parcel's own
 * evidence - lot-line roles, geometry validity - is unresolved). */
export type SetbackConstrainedAreaResult =
  | {
      status: "ESTABLISHED";
      areaSqFt: number;
      polygon: Geometry;
      /** true when this scenario's side setback is governed by U9's "5 ft average / 3 ft
       * minimum" branch - in that case the polygon applies a flat 5 ft on each SIDE line
       * specifically (via real per-edge differential PostGIS subtraction, never a uniform
       * across-all-edges buffer), a "conservative fixed-5-foot approximation." The true
       * achievable area may be UNDERSTATED, never overstated. */
      isConservativeSideSetbackApproximation: boolean;
      appliedRule: AppliedRuleRef;
    }
  | { status: "NO_ACTIVE_COVERAGE" }
  | { status: "REQUIRES_VERIFICATION"; reason: string };

export type EcaExclusionAreaResult =
  | { status: "NOT_APPLICABLE" }
  | { status: "REQUIRES_VERIFICATION"; reason: string }
  | { status: "KNOWN"; excludedAreaSqFt: number; excludedGeometry: Geometry; provenance: string };

export type FootnoteExceptionStatus = "NOT_APPLICABLE" | "REQUIRES_VERIFICATION" | "KNOWN";

export interface BuildableEnvelopeFacts {
  rawParcelAreaSqFt?: number;
  setbackConstrainedArea: SetbackConstrainedAreaResult;
  ecaExclusionArea: EcaExclusionAreaResult;
  /** Table A footnote exceptions (e.g. Queen Anne Boulevard) - when REQUIRES_VERIFICATION, this
   * known-unresolved applicable constraint GATES buildableAreaSqFt/buildablePolygon below (Code
   * Generation review correction - previously computed independently of this field). */
  footnoteExceptionStatus: FootnoteExceptionStatus;
  /** Producible ONLY when setbackConstrainedArea.status is ESTABLISHED AND ecaExclusionArea.status
   * is NOT_APPLICABLE or KNOWN AND footnoteExceptionStatus is NOT_APPLICABLE or KNOWN. undefined
   * otherwise - never a partial polygon presented as "the buildable envelope," never derived by
   * subtracting an area scalar. */
  buildableAreaSqFt?: number;
  buildablePolygon?: Geometry;
}

/** Three-state, mirroring SetbackConstrainedAreaResult's own distinction: a scenario figure is
 * KNOWN only when both an ACTIVE governed rule exists AND the parcel's own required evidence is
 * resolved; NO_ACTIVE_COVERAGE when no governed rule for this figure is ACTIVE (never converted
 * into a diligence-risk Finding); REQUIRES_VERIFICATION only when a rule IS ACTIVE but evidence is
 * genuinely unresolved. */
export type ScenarioFigure =
  | { status: "KNOWN"; value: number; appliedRule: AppliedRuleRef }
  | { status: "NO_ACTIVE_COVERAGE" }
  | { status: "REQUIRES_VERIFICATION"; reason: string };

/** VL-4's "plausible supported residential-use scenarios" - multiple, independently-evidenced
 * hypothetical configurations (Correction 3's bounded family: general-density, small-lot bonus,
 * transit-dependent, stacked/multi-unit), not a single number. */
export interface ResidentialUseScenario {
  scenarioId: string;
  description: string;
  /** Final figure has SMC 23.44.060.D.1's fraction-rounding rule (U17) already applied - only
   * when an ACTIVE U17 rule supplies the governed threshold; NO_ACTIVE_COVERAGE otherwise, never
   * ordinary floor/round arithmetic and never a hardcoded threshold. */
  maxDwellingUnits: ScenarioFigure;
  maxHeightFt: ScenarioFigure;
  maxLotCoveragePercent: ScenarioFigure;
  buildableEnvelope: BuildableEnvelopeFacts;
  /** Derived exclusively from the real `appliedRule.citation`s of whichever figures above are
   * KNOWN - never a static/hardcoded citation list presented regardless of ACTIVE status
   * (Correction 1D). Empty when nothing in this scenario is KNOWN. */
  citations: string[];
}

export interface VacantLandEvaluationOutcome {
  /** U1/U2 - the buildability-floor and permitted-use findings, reusing Finding's existing
   * classification vocabulary unchanged. Absent from this array entirely (not a
   * REQUIRES_VERIFICATION Finding) when no ACTIVE governed rule exists - disclosed via
   * uncoveredConstraintTypes instead. */
  buildabilityFindings: Finding[];
  densityFacts: DensityFacts;
  scenarios: ResidentialUseScenario[];
  /** Diligence risks (VL-4) - reuses Finding's own REQUIRES_VERIFICATION classification. Never
   * includes a Finding whose only reason is missing ACTIVE rule coverage (Correction 2) - only
   * genuine evidence-unknown conditions. */
  diligenceRisks: Finding[];
  /** Reuses Unit 4's uncoveredConstraintTypes mechanism unchanged (EvaluationOutcome,
   * types.ts) - since BR-U5-5 confirms zero Unit 5 candidates reach ACTIVE within this unit,
   * this is expected to be non-empty for every real evaluation today. */
  uncoveredConstraintTypes: string[];
}
