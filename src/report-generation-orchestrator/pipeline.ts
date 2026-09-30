/**
 * Report Generation Orchestrator Service - Workflow 4 (business-logic-model.md). The only place
 * Property Intelligence, Spatial Analysis, and the Regulatory Rules Engine are invoked, and the
 * only caller of the production PostGIS adapter. Runs the full pipeline for one already-claimed
 * ReportGenerationJob.
 */

import { eq, and } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { screeningRequests, regulatoryRules, inferencePolicies, type ReportGenerationJobRow } from "../db/schema.js";
import type { GarageProjectConfiguration, ShedProjectConfiguration, VacantLandScreeningRequestSnapshot } from "../screening-request/types.js";
import { LotLineRoleStatus, MultipleFrontageAnswer, ProjectType, WorkflowType } from "../screening-request/types.js";
import { hydrateScreeningRequestSnapshot } from "../screening-request/hydrate.js";
import { assemblePropertyContext, type FactRetriever } from "../property-intelligence/assemble.js";
import { createKingCountyParcelGeometryRetriever } from "../property-intelligence/king-county-parcel-geometry.js";
import { createSeattleBuildingOutlinesRetriever } from "../property-intelligence/seattle-building-outlines.js";
import { createSeattleEcaRetriever } from "../property-intelligence/seattle-eca.js";
import {
  classifyExistingStructures,
  findPrimaryDwelling,
  buildExistingStructureCoverageFact,
  type ExistingStructure,
  type RawBuildingFootprint,
  type ExistingStructureCoverageFact,
} from "../property-intelligence/existing-structures.js";
import { AvailabilityState, getFact } from "../property-intelligence/types.js";
import type { PropertyFact } from "../property-intelligence/types.js";
import { recordIngestionResult } from "../data-source-registry/index.js";
import type { EvidenceQuality } from "../property-intelligence/types.js";
import type { CriticalAreaFinding, GeographicPoint, Polygon } from "../spatial-analysis/types.js";
import {
  computeBuildableEnvelope,
  computeDistanceToDwelling,
  computeEcaExclusionGeometry,
  computeExistingStructureCoverageSqFt,
  computeParcelAreaSqFt,
  computeSetbackConstrainedArea,
  computeSetbackDistances,
  transformPolygonToWgs84,
} from "../spatial-analysis/postgis-adapter.js";
import { evaluateProject, isCriticalAreaFinding, evaluateEcaLotAreaAdjustment } from "../regulatory-rules-engine/evaluate.js";
import { evaluateVacantLand, findActiveScenarioRule, SCENARIO_DEFINITIONS, toAppliedRuleRef } from "../regulatory-rules-engine/evaluate-vacant-land.js";
import type { VacantLandSetbackRuleSpec } from "../regulatory-rules-engine/evaluate-vacant-land.js";
import { EvaluationStatus } from "../regulatory-rules-engine/types.js";
import type { LotCoverageFacts, ProjectDetails, ShedProjectDetails, ShedLotCoverageFacts, Finding } from "../regulatory-rules-engine/types.js";
import type { BuildableEnvelopeFacts, DensityFacts, LotLineRoles } from "../regulatory-rules-engine/vacant-land-types.js";
import { LifecycleState, toApplicabilityScope } from "../regulatory-rule-governance/types.js";
import type { RegulatoryRule, InferencePolicy } from "../regulatory-rule-governance/types.js";
import { CandidateParcelSource, ParcelIdentityProvenance, ParcelResolutionStatus } from "../parcel-resolution/types.js";
import type { ExplanationResult } from "../report-explanation/index.js";
import { createEvidenceReportArtifact } from "../evidence-report-artifact/index.js";
import { markJobComplete, markJobFailed } from "../report-generation-job/repository.js";
import { withStageTiming } from "./stage-timing.js";
import { logger } from "../shared/logger.js";
import type { ConfirmedParcelResolution } from "../property-intelligence/assemble.js";

export interface PipelineDependencies {
  /** Product-correctness correction (2026-08-28): a self-contained operation, not a raw
   * AiCompletionClient - the caller (report-generation-workflow.ts's runPipelineStep,
   * generate-prototype-report.ts) owns constructing the real Anthropic client AND calling
   * explainFindings entirely within its own execution (see
   * report-explanation/anthropic-wiring.ts's generateReportExplanation), so this pipeline never
   * sees, holds, or forwards an API key or client object - only a plain callback that returns the
   * already-serializable ExplanationResult. Injectable in tests with a fake implementation, same
   * as the AiCompletionClient it replaced. */
  generateExplanation?: (findings: Finding[]) => Promise<ExplanationResult>;
}

/** The three Unit 6B evidence-entry constructors runReportGenerationPipeline uses, extracted so the
 * dev report-preview harness builds its evidence through the SAME functions (and the caveat's
 * provenance path the PDF renderer reads is therefore the production one, not a re-typed copy). */
export function permitRequirementEvidenceEntry(outcome: { permitRequirement?: unknown }) {
  return outcome.permitRequirement ? { factType: "shed-permit-requirement", value: outcome.permitRequirement, provenance: {} } : undefined;
}
export function existingStructureCoverageEvidenceEntry(fact: ExistingStructureCoverageFact) {
  return { factType: "existing-structure-coverage", value: fact, provenance: { qualityCaveat: fact.overCountCaveat } };
}
export function shedLotCoverageEvidenceEntry(outcome: { shedLotCoverage?: unknown }) {
  return outcome.shedLotCoverage ? { factType: "shed-lot-coverage", value: outcome.shedLotCoverage, provenance: {} } : undefined;
}

/** The exact findings-collection construction used at the persistence/explanation boundary in
 * runReportGenerationPipeline, extracted as a pure function so the P2b fold-in is directly
 * testable without a database (same pattern as selectFindingsForExplanation below). Appends
 * `accessoryHeightLimitFinding` (P2b) to the ordinary findings when present; never folds in
 * `permitRequirement`, which reaches the artifact only via its own evidence entry. */
export function assembleFindingsToPersist(outcome: { findings: Finding[]; accessoryHeightLimitFinding?: Finding }): Finding[] {
  return outcome.accessoryHeightLimitFinding ? [...outcome.findings, outcome.accessoryHeightLimitFinding] : outcome.findings;
}

/**
 * Maintenance correction (2026-09-15) - the exact boundary between a full EvaluationOutcome's
 * findings and what Report Explanation's free-text synthesis is given. The individual per-hazard
 * "Critical area: X" findings are excluded entirely - they already have a correct, dedicated,
 * structurally-precise presentation (ReportView's "Mapped Environmental / Site Constraints"
 * section, which reads the raw environmental-constraints evidence fact directly and preserves the
 * KNOWN/REQUIRES_VERIFICATION distinction), and handing all of them to free-text synthesis is what
 * previously invited the LLM to blend differently-classified findings into one undifferentiated
 * claim not present in any individual finding's own basis. Exported (rather than inlined at the
 * call site) so this exact boundary is directly, deterministically testable.
 *
 * Deliberately narrow: this touches only the flat `Finding[]` handed to explanation. It never
 * reads or modifies `EvaluationOutcome.evidence`, `.permitRequirement`, or `.shedLotCoverage` -
 * those are separate fields on the outcome this function never receives, so the full, unabridged
 * `outcome.findings` (including every ECA finding) persisted into the immutable artifact, and any
 * derived permit/lot-coverage aggregate, are structurally unaffected by this filter regardless of
 * what it does.
 */
export function selectFindingsForExplanation(findings: Finding[]): Finding[] {
  return findings.filter((f) => !isCriticalAreaFinding(f.subject));
}

/** Maintenance correction (2026-09-15, RC-4/RC-7) - the exact, exhaustive set of reasons
 * distanceToDwellingFt can be unavailable, extracted as a pure function so each branch is
 * directly testable without a database. Exactly one case applies per evaluation - never guessed,
 * never conflated with setbackEvidenceGapReason (a completely independent cause, since dwelling
 * separation no longer depends on lot-line roles at all). Returns undefined only for the
 * PRIMARY_DWELLING_FOUND case, where distanceToDwellingFt was actually computed and no
 * REQUIRES_VERIFICATION finding results at all. */
export type DwellingSeparationEvidenceGapCase =
  | { case: "PRIMARY_DWELLING_FOUND" }
  | { case: "SELECTION_NOT_MATCHED" }
  | { case: "NO_SELECTION_MADE" }
  | { case: "BUILDING_OUTLINES_UNAVAILABLE" }
  | { case: "NO_FOOTPRINT" };

/** Maintenance correction (2026-09-15, RC-7) - derives WHICH case applies from the real, raw
 * pipeline preconditions, as its own pure function directly testable against every realistic
 * combination - not merely a lookup from an already-chosen case (the prior, incomplete
 * extraction). Mirrors the exact real branching pipeline.ts's shed-only building-intelligence
 * block already performs. */
export interface DwellingSeparationEvidenceGapContext {
  /** buildingFootprintsFact was AVAILABLE with a real value AND footprintProjected exists - the
   * precondition Building Intelligence v1's classification step itself requires. */
  buildingFootprintsAvailable: boolean;
  /** The shed's own proposed footprint was actually constructed (independent of lot-line roles -
   * see computeSetbackDistances). */
  footprintProjected: boolean;
  /** A primary dwelling was matched among this generation's freshly-classified structures. */
  primaryDwellingFound: boolean;
  /** The customer's stored selection status, from configuration - "SELECTED" or absent/other. */
  primaryDwellingSelectionStatus: "SELECTED" | undefined;
}

export function selectDwellingSeparationEvidenceGapCase(ctx: DwellingSeparationEvidenceGapContext): DwellingSeparationEvidenceGapCase["case"] {
  if (ctx.primaryDwellingFound) return "PRIMARY_DWELLING_FOUND";
  if (ctx.buildingFootprintsAvailable) {
    return ctx.primaryDwellingSelectionStatus === "SELECTED" ? "SELECTION_NOT_MATCHED" : "NO_SELECTION_MADE";
  }
  if (ctx.footprintProjected) return "BUILDING_OUTLINES_UNAVAILABLE";
  return "NO_FOOTPRINT";
}

export function deriveDwellingSeparationEvidenceGapReason(ctx: DwellingSeparationEvidenceGapCase): string | undefined {
  switch (ctx.case) {
    case "PRIMARY_DWELLING_FOUND":
      return undefined;
    case "SELECTION_NOT_MATCHED":
      // The user selected a specific building during configuration, but it's not among the
      // footprints this fresh, generation-time re-fetch returned (removed/redrawn upstream, or a
      // genuinely stale selection) - never guessed at or silently re-mapped to a different
      // footprint (classifyExistingStructures' own hard invariant). Also reused verbatim as
      // dwellingSelectionNotMatchedExplanation's own evidence-fact text - one source of truth.
      return (
        "The building you previously selected as the primary dwelling could not be matched against the current Seattle Building Outlines data, " +
        "so dwelling separation could not be evaluated for this report. Other applicable findings below are unaffected."
      );
    case "NO_SELECTION_MADE":
      return "No primary dwelling was selected during configuration, so the separation distance could not be computed.";
    case "BUILDING_OUTLINES_UNAVAILABLE":
      return "Building footprint data for this property was not available, so a primary dwelling could not be identified.";
    case "NO_FOOTPRINT":
      return "The shed's proposed placement was not established, so dwelling separation could not be evaluated.";
  }
}

/** Maintenance correction (2026-09-17, founder correction after reviewer escalation
 * ccf1dee8-392a-416a-82d4-82222a837446 - reviewer-caught gap: the front/rear/side role-gap-reason
 * derivation lived inline in `runReportGenerationPipeline`, untestable without a real DB. Extracted
 * as a pure function, matching this module's own established `selectDwellingSeparationEvidenceGapCase`/
 * `deriveDwellingSeparationEvidenceGapReason` pattern exactly, so the actual derivation logic
 * `evaluateSideFrontSetback`/`evaluateRearSetback` depend on is independently unit-testable. */
export interface StreetFrontageRoleGapContext {
  multipleFrontageAnswer: MultipleFrontageAnswer | undefined;
  rearAlsoFacesStreet: boolean | undefined;
  /** True whenever `SetbackDistances.unresolvedStreetFrontageDistancesFt` is non-empty - i.e. at
   * least one SPECIFIC confirmed-street edge (side or rear) exists whose role cannot be resolved
   * from parcel-boundary geometry alone. */
  hasUnresolvedStreetFrontage: boolean;
}

export interface StreetFrontageRoleGapReasons {
  frontRoleEvidenceGapReason?: string;
  rearRoleEvidenceGapReason?: string;
  sideRoleEvidenceGapReason?: string;
}

export function deriveStreetFrontageRoleGapReasons(ctx: StreetFrontageRoleGapContext): StreetFrontageRoleGapReasons {
  const answeredNotSure = ctx.multipleFrontageAnswer === MultipleFrontageAnswer.NOT_SURE;
  const reasons: StreetFrontageRoleGapReasons = {};

  // Front: uncertain whenever a SPECIFIC confirmed-street edge exists (its role genuinely can't be
  // resolved from parcel geometry alone), OR the customer answered NOT_SURE (an as-yet-unconfirmed
  // additional street can't be ruled out either).
  if (ctx.hasUnresolvedStreetFrontage) {
    reasons.frontRoleEvidenceGapReason =
      "current Seattle code cannot confirm from this property's boundary geometry alone whether the actual streets involved make this a mandatory through-lot front line (SMC 23.44.090.B) or leave the front-line determination to the City's Director of Construction & Inspections (SMC 23.84A.024) - see the additional street frontage finding.";
  } else if (answeredNotSure) {
    reasons.frontRoleEvidenceGapReason =
      "you indicated you're not sure whether this property has street frontage on more than one side - until that's confirmed, whether your indicated front line is definitively the code-defined front line cannot be established.";
  }

  // Rear: uncertain whenever the customer specifically confirmed it also faces a street
  // (rearAlsoFacesStreet - this is itself one of the edges reflected in
  // hasUnresolvedStreetFrontage/frontRoleEvidenceGapReason above, so both are always set together
  // for this case), or when NOT_SURE (rear could secretly be a second street too - not ruled out).
  if (ctx.rearAlsoFacesStreet) {
    reasons.rearRoleEvidenceGapReason =
      "your rear property line was confirmed to also face a street, and current Seattle code cannot confirm from parcel geometry alone whether that makes it a through-lot front line (SMC 23.44.090.B) or a Director-determined front line (SMC 23.84A.024), or leaves it as an ordinary rear line - see the additional street frontage finding.";
  } else if (answeredNotSure) {
    reasons.rearRoleEvidenceGapReason =
      "you indicated you're not sure whether this property has street frontage on more than one side, which could include your rear line - until that's confirmed, the ordinary rear-setback standard cannot be confidently applied.";
  }

  // Side: NOT_SURE must not behave like NO. A specific YES-confirmed street edge is already
  // excluded from distanceToSideLotLineFt's minimum by computeSetbackDistances itself
  // (postgis-adapter.ts), so every OTHER side edge stays confidently ordinary under YES (the
  // customer affirmatively did not mark it) - no gap reason needed there. Under NOT_SURE, nothing
  // was confirmed either way, so NONE of the side edges can be confidently called ordinary.
  if (answeredNotSure) {
    reasons.sideRoleEvidenceGapReason =
      "you indicated you're not sure whether this property has street frontage on more than one side - until that's confirmed, none of your side property lines can be confidently treated as ordinary (non-street-facing) side lines.";
  }

  return reasons;
}

/**
 * Unit 6B Capability B - P2b's `isInRequiredSetback` bounded-band derivation (founder-directed
 * current-code research + founder-approved corrected design, 2026-09-23 - full citations and
 * reasoning in `aidlc-docs/decisions/2026-09-17-side-street-setback-current-code-research.md`'s
 * "Correction (2026-09-23, same day)" section). Every threshold below is drawn directly from
 * Table A for SMC 23.44.090's quoted text - none invented. `REAR_SETBACK`/
 * `SIDE_FRONT_SETBACK_STANDARD`'s own ACTIVE rule minimums are deliberately never reused here -
 * `REAR_SETBACK.minFt` in particular is sourced from 23.44.090.I.2's distinct accessory-structure
 * placement exception, a different figure than Table A's general Rear-row boundary this function
 * needs.
 *
 * Two guards (Chapter 23.53 additional-setback applicability; the Queen Anne Boulevard special-
 * frontage exception) can never currently be satisfied - no right-of-way/street-width fact exists
 * anywhere in this codebase, and no street-name/address evidence survives past initial parcel
 * resolution - so a `DEFINITELY_OUTSIDE` boundary conclusion is unreachable with today's inputs.
 * This is an honest, disclosed consequence of a genuine evidence gap, not a defect: extending this
 * function's own inputs (dwelling-unit count, frequent-transit-service-area status, street-name/
 * address data, right-of-way data) is real future work, not a zero-code-change activation.
 */
type BoundaryRequiredSetbackStatus = { status: "DEFINITELY_INSIDE" } | { status: "DEFINITELY_OUTSIDE" } | { status: "REQUIRES_VERIFICATION"; reasons: string[] };

function evaluateFrontRequiredSetbackBand(distanceToFrontLotLineFt: number | undefined, frontRoleEvidenceGapReason: string | undefined): BoundaryRequiredSetbackStatus {
  if (distanceToFrontLotLineFt === undefined || frontRoleEvidenceGapReason !== undefined) {
    return { status: "REQUIRES_VERIFICATION", reasons: ["front lot-line regulatory role unresolved"] };
  }
  if (distanceToFrontLotLineFt < 10) return { status: "DEFINITELY_INSIDE" };
  if (distanceToFrontLotLineFt >= 15) {
    // Queen Anne Boulevard guard - Table A for 23.44.090's front-setback footnote 2. Never
    // ruled out: no street-name/address evidence is persisted anywhere past initial parcel
    // resolution in this codebase.
    return { status: "REQUIRES_VERIFICATION", reasons: ["special Queen Anne Boulevard frontage unresolved (no street-name evidence available)"] };
  }
  return { status: "REQUIRES_VERIFICATION", reasons: ["dwelling-unit count needed to select the 10ft vs 15ft front setback"] };
}

function evaluateRearRequiredSetbackBand(
  distanceToRearLotLineFt: number | undefined,
  rearRoleEvidenceGapReason: string | undefined
): BoundaryRequiredSetbackStatus {
  if (distanceToRearLotLineFt === undefined || rearRoleEvidenceGapReason !== undefined) {
    return { status: "REQUIRES_VERIFICATION", reasons: ["rear lot-line regulatory role unresolved"] };
  }
  if (distanceToRearLotLineFt < 5) return { status: "DEFINITELY_INSIDE" };
  // Chapter 23.53 guard applies whether the rear line is alley-abutting (Table A's own rear
  // setback drops to 0, but 23.44.090.C reserves additional Chapter 23.53 setbacks that this
  // codebase has no evidence to rule out) or the distance already clears Table A's largest
  // possible non-alley figure (15ft) - never DEFINITELY_OUTSIDE either way with today's evidence.
  return { status: "REQUIRES_VERIFICATION", reasons: ["additional Chapter 23.53 setback applicability unresolved"] };
}

function evaluateSideRequiredSetbackBand(distanceToSideLotLineFt: number | undefined, sideRoleEvidenceGapReason: string | undefined): BoundaryRequiredSetbackStatus {
  if (distanceToSideLotLineFt === undefined || sideRoleEvidenceGapReason !== undefined) {
    return { status: "REQUIRES_VERIFICATION", reasons: ["side lot-line regulatory role unresolved"] };
  }
  if (distanceToSideLotLineFt < 3) return { status: "DEFINITELY_INSIDE" };
  if (distanceToSideLotLineFt >= 5) {
    return { status: "REQUIRES_VERIFICATION", reasons: ["additional Chapter 23.53 setback applicability unresolved"] };
  }
  return { status: "REQUIRES_VERIFICATION", reasons: ["side distance falls in the unresolved 3-5ft band pending frequent-transit-service-area status"] };
}

export interface RequiredSetbackDerivationContext {
  distanceToFrontLotLineFt: number | undefined;
  distanceToRearLotLineFt: number | undefined;
  distanceToSideLotLineFt: number | undefined;
  frontRoleEvidenceGapReason: string | undefined;
  rearRoleEvidenceGapReason: string | undefined;
  sideRoleEvidenceGapReason: string | undefined;
}

export interface RequiredSetbackDerivationResult {
  isInRequiredSetback: boolean | undefined;
  requiredSetbackEvidenceGapReasons: string[] | undefined;
}

export function deriveIsInRequiredSetback(ctx: RequiredSetbackDerivationContext): RequiredSetbackDerivationResult {
  const boundaries = [
    evaluateFrontRequiredSetbackBand(ctx.distanceToFrontLotLineFt, ctx.frontRoleEvidenceGapReason),
    evaluateRearRequiredSetbackBand(ctx.distanceToRearLotLineFt, ctx.rearRoleEvidenceGapReason),
    evaluateSideRequiredSetbackBand(ctx.distanceToSideLotLineFt, ctx.sideRoleEvidenceGapReason),
  ];

  if (boundaries.some((b) => b.status === "DEFINITELY_INSIDE")) {
    return { isInRequiredSetback: true, requiredSetbackEvidenceGapReasons: undefined };
  }
  if (boundaries.every((b) => b.status === "DEFINITELY_OUTSIDE")) {
    return { isInRequiredSetback: false, requiredSetbackEvidenceGapReasons: undefined };
  }
  const reasons = boundaries.flatMap((b) => (b.status === "REQUIRES_VERIFICATION" ? b.reasons : []));
  return { isInRequiredSetback: undefined, requiredSetbackEvidenceGapReasons: reasons };
}

/** Runs the full pipeline for one claimed (IN_PROGRESS) job. Never throws for an ordinary
 * degradation (e.g. missing evidence, unavailable explanation) - only for a genuinely
 * unrecoverable error, which the caller (the poller) turns into markJobFailed. */
export async function runReportGenerationPipeline(db: Db, job: ReportGenerationJobRow, deps: PipelineDependencies = {}): Promise<void> {
  try {
    const [screeningRequest] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, job.screeningRequestId));
    if (!screeningRequest?.snapshot) {
      await markJobFailed(db, job.id, "Referenced ScreeningRequest has no snapshot - cannot generate against a live/unauthorized request.");
      return;
    }
    // NFR-U5-4 (Code Generation review correction) - a real boundary hydration, not a TypeScript
    // `as` cast on a jsonb column value. Fails closed (markJobFailed) on an invalid/unrecognized
    // persisted shape rather than coercing it into a domain object.
    const hydrated = hydrateScreeningRequestSnapshot(screeningRequest.snapshot);
    if (hydrated.outcome === "INVALID") {
      await markJobFailed(db, job.id, `Persisted ScreeningRequest snapshot failed shape validation: ${hydrated.issues.join("; ")}`);
      return;
    }
    const snapshot = hydrated.snapshot;

    // Property Intelligence - retrieves parcel geometry (King County parcel-polygon layer, this
    // unit's new retriever) and any other facts. Never invoked pre-authorization (BR-U2-1/BR-U2-3).
    // Shared by both workflows (Unit 5) - Property Resolution has no workflow-specific behavior, a
    // resolved parcel is a resolved parcel regardless of which journey follows it (Workflow U5-1).
    const resolvedParcel = { parcelId: snapshot.confirmedParcelId, source: CandidateParcelSource.ADDRESS_GEOCODE, characteristics: {} };
    const confirmedParcel: ConfirmedParcelResolution = {
      status: ParcelResolutionStatus.CONFIRMED,
      confirmedParcel: resolvedParcel,
      candidates: [resolvedParcel],
      // Only confirmedParcelId is persisted on ScreeningRequest (never the original resolution
      // result), so the real identityProvenance (ALGORITHMIC vs. USER_CONFIRMED - product-
      // correctness amendment 2026-08-27) is not retained past checkout and cannot be reconstructed
      // here. This is a disclosed, inert placeholder - assemblePropertyContext (the only consumer
      // of this value) never reads identityProvenance; it exists purely to satisfy the type.
      identityProvenance: ParcelIdentityProvenance.ALGORITHMIC,
    };
    // Building intelligence v1 - Seattle Building Outlines are only ever needed for a shed's own
    // DWELLING_SEPARATION fact (a garage has no equivalent field or rule; vacant land has no
    // placed structure to measure from at all) - scoped here rather than fetched unconditionally,
    // so garage/vacant-land requests never pay for a network call they can't use.
    const retrievers: FactRetriever[] = [createKingCountyParcelGeometryRetriever()];
    if (snapshot.workflowType === WorkflowType.EXISTING_PROPERTY && snapshot.projectType === ProjectType.SHED) {
      retrievers.push(createSeattleBuildingOutlinesRetriever());
      // Unit 6B - ECA screening (capability A) is shed-scoped for this unit's approved scope
      // (shed permit-requirement + lot-coverage), matching the same conditional the shed-only
      // Building Outlines retriever above already uses. Reusing this for garage/vacant-land is
      // real future value (research-findings.md notes every project type needs it) but is not
      // part of this unit's approved scope and is not added speculatively here.
      retrievers.push(createSeattleEcaRetriever());
    }
    const propertyContext = await withStageTiming("PROPERTY_INTELLIGENCE", job.id, () =>
      assemblePropertyContext(confirmedParcel, { retrievers })
    );

    const geometryFact = getFact<Polygon>(propertyContext, "parcel-geometry-available");
    const buildingFootprintsFact = getFact<RawBuildingFootprint[]>(propertyContext, "building-footprints-available");
    // Unit 6B - undefined for garage/vacant-land (retriever not attempted) and for a shed whose
    // fetch failed (SOURCE_ERROR) - both correctly resolve to zero ecaFindings below, never a
    // fabricated clean result. A genuine fetch success always carries one entry per queried
    // hazard category (never an empty array for a real shed evaluation).
    const environmentalConstraintsFact = getFact<CriticalAreaFinding[]>(propertyContext, "environmental-constraints");

    // Unit 3, 2026-08-25: wires the existing recordIngestionResult contract into this already-
    // implemented authoritative retrieval path (property-intelligence/assemble.ts itself is NOT
    // modified - it stays pure/DB-free). Best-effort: a health-recording failure must never fail
    // report generation itself, and never turns a failed retrieval into a recorded success.
    try {
      // Maintenance correction (2026-09-15): UNAVAILABLE (a legitimate "no boundary for this
      // specific parcel" result - property-intelligence/types.ts's SourceRecordNotFoundError) is
      // treated as a healthy source interaction here, same as AVAILABLE - the source responded
      // correctly, it just has nothing for this one PIN. Only SOURCE_ERROR (a genuine transport/
      // validation/CRS failure) marks the source unhealthy. Never conflate one parcel's own
      // legitimate absence of data with the global source's health.
      if (geometryFact?.availabilityState === AvailabilityState.AVAILABLE || geometryFact?.availabilityState === AvailabilityState.UNAVAILABLE) {
        await recordIngestionResult(db, "king-county-parcel-polygon", { success: true });
      } else {
        await recordIngestionResult(db, "king-county-parcel-polygon", {
          success: false,
          reason: "King County parcel-polygon retrieval failed during report generation.",
        });
      }
    } catch (err) {
      logger.warn("DATA_SOURCE_HEALTH_RECORDING_FAILED", { sourceId: "king-county-parcel-polygon", error: err instanceof Error ? err.message : String(err) });
    }

    // Same best-effort health recording as above, only when the retriever was actually included
    // (shed only - see the conditional push above). A zero-footprint AVAILABLE result is a real
    // success, not a failure - only SOURCE_ERROR counts as unhealthy.
    if (buildingFootprintsFact) {
      try {
        if (buildingFootprintsFact.availabilityState === AvailabilityState.AVAILABLE) {
          await recordIngestionResult(db, "seattle-building-outlines", { success: true });
        } else {
          await recordIngestionResult(db, "seattle-building-outlines", {
            success: false,
            reason: "Seattle Building Outlines retrieval failed during report generation.",
          });
        }
      } catch (err) {
        logger.warn("DATA_SOURCE_HEALTH_RECORDING_FAILED", { sourceId: "seattle-building-outlines", error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Unit 6B - same best-effort health recording, only when the retriever was actually included
    // (shed only). A genuine fetch success always carries findings for every queried hazard
    // category (never empty) - only SOURCE_ERROR counts as unhealthy.
    if (environmentalConstraintsFact) {
      try {
        if (environmentalConstraintsFact.availabilityState === AvailabilityState.AVAILABLE) {
          await recordIngestionResult(db, "seattle-eca", { success: true });
        } else {
          await recordIngestionResult(db, "seattle-eca", {
            success: false,
            reason: "Seattle ECA retrieval failed during report generation.",
          });
        }
      } catch (err) {
        logger.warn("DATA_SOURCE_HEALTH_RECORDING_FAILED", { sourceId: "seattle-eca", error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Unit 5 - a new, sibling top-level branch on workflowType BEFORE the existing shed/garage
    // branch (Code Generation Part 1, Step 2/6) - never a third arm inside the EXISTING_PROPERTY
    // branch below.
    if (snapshot.workflowType === WorkflowType.VACANT_LAND) {
      await runVacantLandPipeline(db, job, snapshot, screeningRequest.id, geometryFact, deps);
      return;
    }

    // Spatial Analysis (real PostGIS) - only when the parcel geometry was actually retrieved and
    // a lot-line role assignment was captured. BR-U2-9: never guesses roles.
    let spatialEvidenceQuality: EvidenceQuality | undefined;
    let distanceToRearLotLineFt: number | undefined;
    let distanceToSideLotLineFt: number | undefined;
    let distanceToFrontLotLineFt: number | undefined;
    // Captured (once, here, during real PostGIS computation) purely so ReportMap can display them
    // later without ever touching PostGIS again - a presentation of this immutable snapshot only.
    let boundaryPolygonWgs84: Awaited<ReturnType<typeof transformPolygonToWgs84>> | undefined;
    let footprintProjected: Polygon | undefined;
    let footprintWgs84: Awaited<ReturnType<typeof transformPolygonToWgs84>> | undefined;
    // Unit 4 - the parcel's own area, needed for LotCoverageFacts.rawParcelAreaSqFt regardless of
    // placement/lot-line-role-assignment status (unlike the setback distances below, which
    // specifically require a proposed footprint to measure against).
    let rawParcelAreaSqFt: number | undefined;
    // Building intelligence v1 (shed only) - populated below, once footprintProjected exists, from
    // the user's own primaryDwellingSelection re-validated against a fresh fetch. Left undefined
    // for every other case (no footprints, no selection, selection no longer present) - the
    // existing, unmodified DWELLING_SEPARATION evaluator already turns that into
    // REQUIRES_VERIFICATION, never a blocked report.
    let distanceToDwellingFt: number | undefined;
    // Carried into `evidence` below regardless of whether a PRIMARY_DWELLING was established, so
    // the report's own evidence can show what was fetched and what (if anything) the user
    // confirmed - geometry provenance and classification basis stay structurally distinct per
    // structure (existing-structures.ts).
    let existingStructuresForEvidence: ExistingStructure[] | undefined;
    // Unit 6B Capability C - the mapped existing-structure coverage fact (domain-entities.md §1b).
    // Only populated once real footprint evidence exists (buildingFootprintsAvailable below) -
    // absent (never a fabricated zero) when that evidence itself was never fetched/failed,
    // mirroring this pipeline's own established "no fact when genuinely unavailable" convention.
    let existingStructureCoverageFact: ExistingStructureCoverageFact | undefined;
    // Regression fix (2026-08-30): the raw fact above is SRID 2926 (authoritative/projected) -
    // useless to any browser map without a transform, and no transform was ever computed or
    // persisted, so ReviewPlacementMap/ReportMap had no display geometry for existing structures
    // at all (only the parcel boundary and proposed shed footprint got this treatment). Mirrors
    // boundaryPolygonWgs84/footprintWgs84's own established pattern exactly - computed once here,
    // via real PostGIS ST_Transform, and persisted as its own display evidence entry so the paid
    // report never needs to re-fetch Building Outlines to render what was actually evaluated.
    let existingStructuresWgs84Display: { outlineId: string; footprintWgs84: GeographicPoint[]; areaSqFt?: number; classification: string }[] | undefined;
    // Set only in the one case actually worth explaining to the user: a dwelling WAS selected
    // during configuration, but the fresh re-fetch at generation time no longer contains that
    // outlineId (BR: never guess a replacement - see classifyExistingStructures). Left undefined
    // for the ordinary "no selection was ever made" case, which needs no special explanation.
    let dwellingSelectionNotMatchedExplanation: string | undefined;
    // Maintenance correction (2026-09-15, RC-4) - the real, distinct reason distanceToDwellingFt
    // is unavailable, threaded into the DWELLING_SEPARATION finding instead of a generic
    // "not available." Deliberately independent of setbackEvidenceGapReason below - dwelling
    // separation no longer depends on lot-line roles at all (RC-1's footprint decoupling), so its
    // own remaining gap always has a genuinely different cause (no selection made, a stale
    // selection, or unavailable building-outline data).
    let dwellingEvidenceGapReason: string | undefined;
    // Maintenance correction (2026-09-15) - the real reason distanceTo{Rear,Side,Front}LotLineFt
    // are undefined when lot-line roles could not be resolved, threaded through to the
    // REQUIRES_VERIFICATION setback findings instead of being discarded (evaluate.ts's
    // evaluateRearSetback/evaluateSideFrontSetback). Never set for dwelling separation - that
    // fact no longer depends on lot-line roles at all (see computeSetbackDistances below).
    let setbackEvidenceGapReason: string | undefined;
    // The real, KNOWN PostGIS distance to every side-candidate edge, keyed by edgeRef - preserved
    // for evidence/citation transparency (see postgis-adapter.ts's SetbackDistances docstring).
    let sideEdgeDistancesFt: Record<string, number> | undefined;
    // Maintenance correction (2026-09-17, founder correction after reviewer escalation
    // 53f30444-b566-4197-b0dd-e2aff768fa65) - see postgis-adapter.ts's SetbackDistances docstring
    // and ProjectDetails' own docstring for the full explanation. unresolvedStreetFrontageDistancesFt/
    // streetFrontageHeuristics carry through unchanged; frontRoleEvidenceGapReason/
    // rearRoleEvidenceGapReason/sideRoleEvidenceGapReason are derived here, the same way
    // setbackEvidenceGapReason already is for the unrelated INSUFFICIENT-parcel-shape case.
    let unresolvedStreetFrontageDistancesFt: Record<string, number> | undefined;
    let streetFrontageHeuristics: ShedProjectDetails["streetFrontageHeuristics"];
    let frontRoleEvidenceGapReason: string | undefined;
    let rearRoleEvidenceGapReason: string | undefined;
    let sideRoleEvidenceGapReason: string | undefined;

    if (geometryFact?.availabilityState === AvailabilityState.AVAILABLE && geometryFact.value) {
      rawParcelAreaSqFt = await computeParcelAreaSqFt(db, geometryFact.value);
    }

    if (geometryFact?.availabilityState === AvailabilityState.AVAILABLE && geometryFact.value && snapshot.projectDetails.proposedPlacement && snapshot.projectDetails.lotLineRoleAssignment) {
      spatialEvidenceQuality = geometryFact.provenance.evidenceQuality;
      const { distances, footprintProjected: computedFootprint } = await withStageTiming("SPATIAL_ANALYSIS", job.id, () =>
        computeSetbackDistances(
          db,
          geometryFact.value!,
          snapshot.projectDetails.proposedPlacement!,
          { widthFt: snapshot.projectDetails.widthFt, depthFt: snapshot.projectDetails.depthFt },
          snapshot.projectDetails.lotLineRoleAssignment!
        )
      );
      distanceToRearLotLineFt = distances.distanceToRearLotLineFt;
      distanceToSideLotLineFt = distances.distanceToSideLotLineFt;
      distanceToFrontLotLineFt = distances.distanceToFrontLotLineFt;
      sideEdgeDistancesFt = distances.sideEdgeDistancesFt;
      unresolvedStreetFrontageDistancesFt = distances.unresolvedStreetFrontageDistancesFt;
      streetFrontageHeuristics = distances.streetFrontageHeuristics;
      footprintProjected = computedFootprint;
      if (snapshot.projectDetails.lotLineRoleAssignment.status === LotLineRoleStatus.INSUFFICIENT) {
        setbackEvidenceGapReason = "The front, rear, and side property lines could not be confidently identified for this parcel's shape.";
      }

      const roleGapReasons = deriveStreetFrontageRoleGapReasons({
        multipleFrontageAnswer: snapshot.projectDetails.lotLineRoleAssignment.multipleFrontageAnswer,
        rearAlsoFacesStreet: snapshot.projectDetails.lotLineRoleAssignment.rearAlsoFacesStreet,
        hasUnresolvedStreetFrontage: Boolean(unresolvedStreetFrontageDistancesFt && Object.keys(unresolvedStreetFrontageDistancesFt).length > 0),
      });
      frontRoleEvidenceGapReason = roleGapReasons.frontRoleEvidenceGapReason;
      rearRoleEvidenceGapReason = roleGapReasons.rearRoleEvidenceGapReason;
      sideRoleEvidenceGapReason = roleGapReasons.sideRoleEvidenceGapReason;

      boundaryPolygonWgs84 = await transformPolygonToWgs84(db, geometryFact.value);
      if (footprintProjected) {
        footprintWgs84 = await transformPolygonToWgs84(db, footprintProjected);
      }
    }

    // Regulatory Rules Engine - ACTIVE-only, evidence-quality-gated (BR-U2-10). Unit 5: also
    // requires applicableWorkflowType = 'EXISTING_PROPERTY' - a structurally separate query from
    // the VACANT_LAND path's own query (runVacantLandPipeline below), never an OR that could
    // accidentally cross-match (NFR-U5-6/-7).
    const activeRuleRows = await db
      .select()
      .from(regulatoryRules)
      .where(
        and(
          eq(regulatoryRules.lifecycleState, LifecycleState.ACTIVE),
          eq(regulatoryRules.applicableWorkflowType, "EXISTING_PROPERTY"),
          eq(regulatoryRules.applicableProjectType, snapshot.projectType)
        )
      );
    const activePolicyRows = await db.select().from(inferencePolicies).where(eq(inferencePolicies.lifecycleState, LifecycleState.ACTIVE));

    // Unit 4 - project-type-dispatched (BR-U4-2). Shed's branch is byte-for-byte the prior
    // behavior; garage additionally assembles LotCoverageFacts server-side (BR-U4-8 - never from
    // client-asserted numbers).
    let project: ProjectDetails;
    let lotCoverageFacts: LotCoverageFacts | undefined;
    let shedLotCoverageFacts: Omit<ShedLotCoverageFacts, "allowanceFacts"> | undefined;
    if (snapshot.projectType === ProjectType.GARAGE) {
      const garageDetails = snapshot.projectDetails as GarageProjectConfiguration;
      project = {
        projectType: "garage",
        widthFt: garageDetails.widthFt,
        depthFt: garageDetails.depthFt,
        heightFt: garageDetails.heightFt,
        alleyAdjacent: garageDetails.alleyAdjacent,
        distanceToRearLotLineFt,
        distanceToSideLotLineFt,
        distanceToFrontLotLineFt,
        spatialEvidenceQuality,
        setbackEvidenceGapReason,
        sideEdgeDistancesFt,
        unresolvedStreetFrontageDistancesFt,
        streetFrontageHeuristics,
        frontRoleEvidenceGapReason,
        rearRoleEvidenceGapReason,
        sideRoleEvidenceGapReason,
      };
      // rawParcelAreaSqFt is only undefined when the parcel geometry itself came back
      // AvailabilityState.INSUFFICIENT (AVAILABLE/UNAVAILABLE/SOURCE_ERROR are all handled above -
      // the latter two already short-circuit to DEFERRED before this code runs). Leaving
      // lotCoverageFacts undefined here is correct and safe: evaluateLotCoverage already treats a
      // missing LotCoverageFacts as REQUIRES_VERIFICATION, never a thrown error.
      if (rawParcelAreaSqFt !== undefined) {
        lotCoverageFacts = buildLotCoverageFacts(rawParcelAreaSqFt, garageDetails);
      }
    } else {
      // Building intelligence v1 - only attempted once the shed's own footprint was actually
      // established (footprintProjected), mirroring the same gating the setback distances above
      // already use. classifyExistingStructures re-validates the user's stored selection against
      // THIS fetch's own outlineIds - a selection that no longer matches anything returned resolves
      // every footprint to UNKNOWN, never a guess.
      let primaryDwellingFound = false;
      let primaryDwellingSelectionStatus: "SELECTED" | undefined;
      const buildingFootprintsAvailable = Boolean(buildingFootprintsFact?.availabilityState === AvailabilityState.AVAILABLE && buildingFootprintsFact.value && footprintProjected);
      if (buildingFootprintsAvailable) {
        const shedDetails = snapshot.projectDetails as ShedProjectConfiguration;
        const structures = classifyExistingStructures(buildingFootprintsFact!.value!, buildingFootprintsFact!.provenance, shedDetails.primaryDwellingSelection);
        existingStructuresForEvidence = structures;
        existingStructuresWgs84Display = await Promise.all(
          structures.map(async (s) => ({
            outlineId: s.outlineId,
            footprintWgs84: await transformPolygonToWgs84(db, s.footprint),
            areaSqFt: s.areaSqFt,
            classification: s.classification,
          }))
        );
        const primaryDwelling = findPrimaryDwelling(structures);
        primaryDwellingFound = Boolean(primaryDwelling);
        primaryDwellingSelectionStatus = shedDetails.primaryDwellingSelection?.status === "SELECTED" ? "SELECTED" : undefined;
        if (primaryDwelling) {
          distanceToDwellingFt = await withStageTiming("SPATIAL_ANALYSIS", job.id, () => computeDistanceToDwelling(db, footprintProjected!, primaryDwelling.footprint));
        }
        // Unit 6B Capability C - reuses these SAME already-classified footprints (never a second
        // fetch, domain-entities.md §1b's explicit instruction). Independent of primary-dwelling
        // classification - every mapped footprint on the parcel counts toward coverage, not just
        // the dwelling.
        const coverage = await withStageTiming("SPATIAL_ANALYSIS", job.id, () =>
          computeExistingStructureCoverageSqFt(
            db,
            geometryFact!.value!,
            structures.map((s) => s.footprint)
          )
        );
        existingStructureCoverageFact = buildExistingStructureCoverageFact(coverage);
      }
      // Maintenance correction (2026-09-15, RC-7) - the case is now DERIVED from the actual, real
      // pipeline preconditions gathered above (never hand-picked), via a pure function that is
      // directly unit-testable against every realistic combination of those preconditions - not
      // just "given a case, what string" (the prior, incomplete extraction), but "given real
      // state, which case genuinely applies."
      const dwellingGapCase = selectDwellingSeparationEvidenceGapCase({
        buildingFootprintsAvailable,
        footprintProjected: Boolean(footprintProjected),
        primaryDwellingFound,
        primaryDwellingSelectionStatus,
      });
      dwellingEvidenceGapReason = deriveDwellingSeparationEvidenceGapReason({ case: dwellingGapCase });
      if (dwellingGapCase === "SELECTION_NOT_MATCHED") {
        // The user selected a specific building during configuration, but it's not among the
        // footprints this fresh, generation-time re-fetch returned (removed/redrawn upstream, or
        // a genuinely stale selection) - never guessed at or silently re-mapped to a different
        // footprint (classifyExistingStructures' own hard invariant). Reuses the exact same text
        // as the DWELLING_SEPARATION finding's own reason - one source of truth, never a second,
        // independently-worded message for the same fact.
        dwellingSelectionNotMatchedExplanation = dwellingEvidenceGapReason;
      }

      // Unit 6B Capability C - only assembled once real coverage evidence exists (never a
      // fabricated 0 when it doesn't - evaluateProject safely treats an absent
      // shedLotCoverageFacts as "not yet computable," never throwing). allowanceFacts is
      // deliberately excluded - evaluateShedLotCoverage computes it internally as a pure
      // derivation of ecaAdjustment/parcelAreaSqFt (domain-entities.md §3c's own Flow 4).
      if (existingStructureCoverageFact && rawParcelAreaSqFt !== undefined) {
        shedLotCoverageFacts = {
          parcelAreaSqFt: rawParcelAreaSqFt,
          existingMappedCoverageSqFt: existingStructureCoverageFact.mappedFootprintAreaSqFt,
          proposedShedFootprintSqFt: snapshot.projectDetails.widthFt * snapshot.projectDetails.depthFt,
          // BR-U6B-12/Flow 5 - the SAME single environmental-constraints fact P6 already reads,
          // never a second ECA fetch or interpretation.
          ecaAdjustment: evaluateEcaLotAreaAdjustment(environmentalConstraintsFact?.value ?? []),
        };
      }

      // Unit 6B Capability B - the bounded-band isInRequiredSetback derivation (founder-approved
      // 2026-09-23, see deriveIsInRequiredSetback's own docstring for full citations). Computed
      // from the exact same role/distance facts gathered above for the existing setback findings -
      // no new fetch, no new geometry engine.
      const shedDetailsForPermit = snapshot.projectDetails as ShedProjectConfiguration;
      const requiredSetback = deriveIsInRequiredSetback({
        distanceToFrontLotLineFt,
        distanceToRearLotLineFt,
        distanceToSideLotLineFt,
        frontRoleEvidenceGapReason,
        rearRoleEvidenceGapReason,
        sideRoleEvidenceGapReason,
      });

      project = {
        projectType: "shed",
        widthFt: snapshot.projectDetails.widthFt,
        depthFt: snapshot.projectDetails.depthFt,
        heightFt: snapshot.projectDetails.heightFt,
        alleyAdjacent: snapshot.projectDetails.alleyAdjacent,
        distanceToRearLotLineFt,
        distanceToSideLotLineFt,
        distanceToFrontLotLineFt,
        distanceToDwellingFt,
        spatialEvidenceQuality,
        setbackEvidenceGapReason,
        sideEdgeDistancesFt,
        unresolvedStreetFrontageDistancesFt,
        streetFrontageHeuristics,
        frontRoleEvidenceGapReason,
        rearRoleEvidenceGapReason,
        sideRoleEvidenceGapReason,
        dwellingSeparationEvidenceGapReason: dwellingEvidenceGapReason,
        // Unit 6B Capability B - straight passthrough from the already-validated intake schema
        // (ShedProjectConfigurationSchema already covers every one of these fields).
        foundationType: shedDetailsForPermit.foundationType,
        attachment: shedDetailsForPermit.attachment,
        intendedUse: shedDetailsForPermit.intendedUse,
        roofOverhang: shedDetailsForPermit.roofOverhang,
        structuralSpanInfo: shedDetailsForPermit.structuralSpanInfo,
        utilityIntent: shedDetailsForPermit.utilityIntent,
        isInRequiredSetback: requiredSetback.isInRequiredSetback,
        requiredSetbackEvidenceGapReasons: requiredSetback.requiredSetbackEvidenceGapReasons,
      };
    }

    const outcome = await withStageTiming("RULES_ENGINE", job.id, async () =>
      evaluateProject({
        propertyContext,
        project,
        candidateActiveRules: rowsToRegulatoryRules(activeRuleRows),
        ecaFindings: environmentalConstraintsFact?.value ?? [],
        candidateActiveInferencePolicies: rowsToInferencePolicies(activePolicyRows),
        lotCoverageFacts,
        shedLotCoverageFacts,
      })
    );

    if (outcome.status === EvaluationStatus.DEFERRED) {
      await markJobFailed(db, job.id, outcome.deferralReason ?? "Evaluation deferred.");
      return;
    }

    // Regression diagnostics (2026-08-30, expanded per founder follow-up) - the exact fields the
    // founder asked to see for one job when "why did findings come back empty" can't be answered
    // from the artifact alone (e.g. ACTIVE rule coverage vanishing from the DB, or a rule/zone
    // combination the founder didn't expect, is invisible to the artifact itself, which only ever
    // sees whatever candidateActiveRules it was handed). Counts, ids, subjects, and rule-type/zone
    // labels only - no address, no PIN, no citation text, no evidence payloads, no findings'
    // supportingEvidence/explanationBasis prose.
    //
    // rulesEligible equals rulesLoaded today because evaluateProject applies NO further zone-based
    // filtering of its own (confirmed by reading evaluate.ts - only lifecycleState is re-checked
    // there; a rule's applicableZone is descriptive metadata on the row, never compared against
    // anything). Property Intelligence also does not currently retrieve any independent "parcel
    // zone" fact for the shed/garage path at all - eligibleRuleZones below is the zone(s) the
    // LOADED RULES themselves declare, not a zone Property Intelligence produced (there is none to
    // compare it against) - logged honestly as what actually exists, not a fabricated match/mismatch
    // check against a fact this pipeline never fetches.
    if (snapshot.projectType === ProjectType.SHED) {
      const shedProject = project as ShedProjectDetails;
      const shedDetails = snapshot.projectDetails as ShedProjectConfiguration;
      logger.info("SHED_REPORT_DIAGNOSTICS", {
        reportGenerationJobId: job.id,
        workflowType: snapshot.workflowType,
        projectType: snapshot.projectType,
        rulesLoaded: activeRuleRows.length,
        rulesEligible: activeRuleRows.length,
        eligibleRuleSubjects: activeRuleRows.map((r) => r.subject).join(" | "),
        eligibleRuleTypes: activeRuleRows.map((r) => (r.ruleSpecification as Record<string, unknown> | null)?.["ruleType"]).join(","),
        eligibleRuleZones: [...new Set(activeRuleRows.map((r) => r.applicableZone))].join(","),
        widthFt: shedProject.widthFt,
        depthFt: shedProject.depthFt,
        heightFt: shedProject.heightFt,
        alleyAdjacent: shedProject.alleyAdjacent,
        distanceToRearLotLineFt: shedProject.distanceToRearLotLineFt,
        distanceToFrontLotLineFt: shedProject.distanceToFrontLotLineFt,
        distanceToSideLotLineFt: shedProject.distanceToSideLotLineFt,
        distanceToDwellingFt: shedProject.distanceToDwellingFt,
        findingsProduced: outcome.findings.length,
        findingSubjectsAndClassifications: outcome.findings.map((f) => `${f.subject}:${f.classification}`).join(" | "),
        buildingOutlinesReturned: buildingFootprintsFact?.value?.length ?? 0,
        primaryDwellingSelectionPresent: shedDetails.primaryDwellingSelection?.status === "SELECTED",
        // "selected outline ID matched fresh source data" - i.e. the outlineId the user picked
        // during configuration was actually present in THIS generation's fresh re-fetch.
        primaryDwellingSelectionMatchedFreshData: Boolean(existingStructuresForEvidence && findPrimaryDwelling(existingStructuresForEvidence)),
        primaryDwellingEstablished: Boolean(existingStructuresForEvidence && findPrimaryDwelling(existingStructuresForEvidence)),
        distanceToDwellingFtComputed: distanceToDwellingFt !== undefined,
      });
    }

    // Unit 6B Capability B - accessoryHeightLimitFinding (P2b) is an ordinary Finding (domain-
    // entities.md §3a note: "a separate, ordinary, location-sensitive zoning Finding, never nested
    // inside PermitRequirementFinding"), so it is folded into the same findings array every other
    // setback/dwelling-separation finding already flows through - no new rendering path needed, it
    // renders via ReportView's existing generic Findings/Requires-Verification lists exactly like
    // those. `outcome.permitRequirement` (the buildingPermit/reviewPath aggregate) is deliberately
    // NEVER folded in here - it reaches the persisted artifact only via the `evidence` entry below,
    // never via `findings`, so it structurally cannot reach Report Explanation's LLM input (which
    // reads only `findings`) - the LLM cannot narrate, reinterpret, or override buildingPermit/
    // reviewPath by construction, not by a runtime guard.
    const findingsToPersist = assembleFindingsToPersist(outcome);

    // Report Explanation (AI, optional) - never fails the job on unavailability (BR-U2-8).
    const findingsForExplanation = selectFindingsForExplanation(findingsToPersist);
    const explanationResult = deps.generateExplanation
      ? await withStageTiming("REPORT_EXPLANATION", job.id, () => deps.generateExplanation!(findingsForExplanation))
      : ({ outcome: "UNAVAILABLE", reason: "No Report Explanation client configured." } as const);

    // Evidence & Report Artifact - immutable, generates the first access credential. `value` is
    // included (not just provenance) so ReportMap can present this snapshot's actual geometry
    // without ever re-querying King County or rerunning PostGIS (BR-U2-6/RGD-2's "presentation
    // of the immutable snapshot only" requirement). Map-display (WGS84) entries are synthetic -
    // computed once above via PostGIS, never recomputed at view time.
    const evidence = [
      ...propertyContext.facts.map((f) => ({ factType: f.factType, value: f.value, provenance: f.provenance as unknown as Record<string, unknown> })),
      ...(boundaryPolygonWgs84 ? [{ factType: "parcel-boundary-wgs84-display", value: boundaryPolygonWgs84, provenance: {} }] : []),
      ...(footprintWgs84 ? [{ factType: "proposed-footprint-wgs84-display", value: footprintWgs84, provenance: {} }] : []),
      // Building intelligence v1 - the classified existing-structure list (geometry provenance and
      // classification basis stay distinct per structure, never conflated - see
      // property-intelligence/existing-structures.ts). Omitted entirely when the retriever wasn't
      // even attempted (garage/vacant-land) or footprintProjected was never established.
      ...(existingStructuresForEvidence ? [{ factType: "existing-structures-classified", value: existingStructuresForEvidence, provenance: {} }] : []),
      // Regression fix (2026-08-30) - the display-ready WGS84 counterpart, see the declaration
      // comment above. This is what ReviewPlacementMap/ReportMap actually render; the codebase's
      // "no independent re-fetch/reconstruction of evaluated geometry" invariant depends on this
      // entry existing.
      ...(existingStructuresWgs84Display ? [{ factType: "existing-structures-wgs84-display", value: existingStructuresWgs84Display, provenance: {} }] : []),
      ...(dwellingSelectionNotMatchedExplanation
        ? [{ factType: "dwelling-selection-outcome", value: { outcome: "SELECTION_NOT_MATCHED", explanation: dwellingSelectionNotMatchedExplanation }, provenance: {} }]
        : []),
      // Unit 4 (BR-U4-5) - persisted at generation time, part of this immutable snapshot, never
      // recomputed at report-view time (ACTIVE rule state could change later). Empty for shed
      // today. Report rendering must consume this to show NoActiveRuleCoverageNotice per
      // constraint type rather than presenting an empty findings array as a clean screening
      // result.
      { factType: "uncovered-constraint-types", value: outcome.uncoveredConstraintTypes, provenance: {} },
      // Unit 6B Capability B - the PermitRequirementFinding aggregate (buildingPermit/reviewPath),
      // present only once evaluateProject's own ACTIVE-gate (allRuleTypesActive against every
      // constituent ShedPermitRuleType row) is satisfied - dormant in production today (all 19
      // rows TRIAGED). Matches this pipeline's established convention for a structured, non-
      // Finding aggregate result (same pattern as uncovered-constraint-types above).
      ...(permitRequirementEvidenceEntry(outcome) ? [permitRequirementEvidenceEntry(outcome)!] : []),
      // Unit 6B Capability C - a descriptive Property Intelligence fact (domain-entities.md §1b),
      // present whenever real footprint evidence exists, independent of the lot-coverage rules'
      // own ACTIVE status - never a regulatory conclusion itself (property-intelligence/types.ts's
      // "never assigns a regulatory classification" boundary).
      ...(existingStructureCoverageFact ? [existingStructureCoverageEvidenceEntry(existingStructureCoverageFact)] : []),
      // The regulatory conclusion itself - present only once evaluateProject's own ACTIVE-gate
      // (every SHED_LOT_COVERAGE_CONSTITUENT_RULE_TYPES row) is satisfied.
      ...(shedLotCoverageEvidenceEntry(outcome) ? [shedLotCoverageEvidenceEntry(outcome)!] : []),
    ];

    const { artifact } = await withStageTiming("ARTIFACT_PERSISTENCE", job.id, () =>
      createEvidenceReportArtifact(db, {
        screeningRequestId: screeningRequest.id,
        reportGenerationJobId: job.id,
        findings: findingsToPersist,
        evidence,
        explanation: explanationResult.outcome === "AVAILABLE" ? explanationResult.explanation : undefined,
        ruleVersionsUsed: activeRuleRows.map((r) => r.id),
        dataRetrievalTimestamps: Object.fromEntries(propertyContext.facts.map((f) => [f.factType, f.provenance.retrievalTimestamp])),
      })
    );

    await markJobComplete(db, job.id, artifact.id);
    logger.info("JOB_COMPLETE", { reportGenerationJobId: job.id, evidenceReportArtifactId: artifact.id });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown pipeline error.";
    logger.error("JOB_FAILED", { reportGenerationJobId: job.id, reason });
    await markJobFailed(db, job.id, reason);
  }
}

/**
 * Unit 5 (Vacant Land) Regulatory Evaluation - Workflow U5-2. Called from within
 * `runReportGenerationPipeline`'s own try/catch (never a separate error boundary) - a thrown
 * `SpatialComputationError` (a true PostGIS execution failure, distinct from a
 * DATA_QUALITY_UNRESOLVED result returned normally) propagates up into that SAME existing
 * markJobFailed path, per NFR-U5-25/-28 - no new failure-state machine for vacant-land.
 */
async function runVacantLandPipeline(
  db: Db,
  job: ReportGenerationJobRow,
  snapshot: VacantLandScreeningRequestSnapshot,
  screeningRequestId: string,
  geometryFact: PropertyFact<Polygon> | undefined,
  deps: PipelineDependencies
): Promise<void> {
  // PROPERTY_INTELLIGENCE was already timed/assembled once by the caller before branching here
  // (runReportGenerationPipeline) - Property Resolution has no workflow-specific behavior
  // (Workflow U5-1), so it is not repeated for this workflow.
  //
  // Code Generation review Correction 5A - a missing parcel area is left undefined (unknown),
  // NEVER defaulted to 0. `rawParcelAreaSqFt` is genuinely optional in DensityFacts/
  // BuildableEnvelopeFacts for exactly this reason.
  const rawParcelAreaSqFt =
    geometryFact?.availabilityState === AvailabilityState.AVAILABLE && geometryFact.value ? await computeParcelAreaSqFt(db, geometryFact.value) : undefined;

  const densityFacts: DensityFacts = {
    rawParcelAreaSqFt,
    // U16 - the D.6/E-corrected divisor. No production ECA area-of-overlap capability is
    // integrated in this unit (the same gap BR-U4-7 already found) - stays undefined (fail-closed),
    // never silently defaulted to rawParcelAreaSqFt.
    densityCountableLotAreaSqFt: undefined,
  };

  // LotLineRoles - this unit's UI has no role-establishment interaction (Code Generation Part 1,
  // item 9) - INSUFFICIENT is the honest, expected status for every real evaluation today. Never
  // inferred from polygon shape. (The postgis-adapter functions remain fully exercisable with a
  // synthetic ESTABLISHED+roles value - see tests/spatial-analysis/vacant-land-postgis-adapter.test.ts.)
  const lotLineRoles: LotLineRoles = { status: "INSUFFICIENT" };

  // Query ACTIVE rules scoped to { workflowType: "VACANT_LAND" } - a structurally separate query
  // from the EXISTING_PROPERTY path's applicableProjectType query (Correction 4/NFR-U5-6/-7),
  // never an OR that could accidentally match both.
  const activeVacantLandRuleRows = await db
    .select()
    .from(regulatoryRules)
    .where(and(eq(regulatoryRules.lifecycleState, LifecycleState.ACTIVE), eq(regulatoryRules.applicableWorkflowType, "VACANT_LAND")));
  const candidateActiveRules = rowsToRegulatoryRules(activeVacantLandRuleRows).filter((r) => toApplicabilityScope(r).workflowType === "VACANT_LAND");

  // Correction 3 - the bounded 4-scenario family, each independently sourcing its own setback
  // profile from an ACTIVE VACANT_LAND_SETBACK rule scoped to that scenarioId - NEVER a hardcoded
  // placeholder profile (Correction 1C). A scenario with no ACTIVE setback rule gets
  // NO_ACTIVE_COVERAGE for its buildable envelope, with no PostGIS call for that part at all.
  const scenarioBuildableEnvelopes: Record<string, BuildableEnvelopeFacts> = {};
  for (const { scenarioId } of SCENARIO_DEFINITIONS) {
    const setbackRule = findActiveScenarioRule(candidateActiveRules, "VACANT_LAND_SETBACK", scenarioId);
    const setbackProfile = setbackRule ? (setbackRule.ruleSpecification as unknown as VacantLandSetbackRuleSpec) : undefined;

    const setbackGeometryResult =
      geometryFact?.availabilityState === AvailabilityState.AVAILABLE && geometryFact.value
        ? await computeSetbackConstrainedArea(db, geometryFact.value, lotLineRoles, setbackProfile)
        : setbackProfile === undefined
          ? ({ status: "NO_ACTIVE_COVERAGE" } as const)
          : ({ status: "REQUIRES_VERIFICATION", reason: "Parcel geometry is not available for this evaluation." } as const);

    const ecaResult =
      geometryFact?.availabilityState === AvailabilityState.AVAILABLE && geometryFact.value
        ? await computeEcaExclusionGeometry(db, geometryFact.value, undefined)
        : ({ status: "REQUIRES_VERIFICATION", reason: "Parcel geometry is not available for this evaluation." } as const);

    // Correction 5D - a known-unresolved applicable Table A footnote exception GATES the final
    // envelope. No footnote-exception data source is integrated in this unit, so this stays
    // REQUIRES_VERIFICATION for every real evaluation today - buildableAreaSqFt/buildablePolygon
    // are therefore never populated below, an honest, disclosed consequence, not an oversight.
    const footnoteExceptionStatus: BuildableEnvelopeFacts["footnoteExceptionStatus"] = "REQUIRES_VERIFICATION";

    let buildableAreaSqFt: number | undefined;
    let buildablePolygon: BuildableEnvelopeFacts["buildablePolygon"];
    if (
      setbackGeometryResult.status === "ESTABLISHED" &&
      (ecaResult.status === "NOT_APPLICABLE" || ecaResult.status === "KNOWN") &&
      footnoteExceptionStatus !== "REQUIRES_VERIFICATION"
    ) {
      const combined = await computeBuildableEnvelope(db, setbackGeometryResult.polygon, ecaResult.status === "KNOWN" ? ecaResult.excludedGeometry : undefined);
      buildableAreaSqFt = combined.areaSqFt;
      buildablePolygon = combined.polygon;
    }

    scenarioBuildableEnvelopes[scenarioId] = {
      rawParcelAreaSqFt,
      setbackConstrainedArea:
        setbackGeometryResult.status === "ESTABLISHED"
          ? { ...setbackGeometryResult, appliedRule: toAppliedRuleRef(setbackRule!) }
          : setbackGeometryResult,
      ecaExclusionArea: ecaResult,
      footnoteExceptionStatus,
      buildableAreaSqFt,
      buildablePolygon,
    };
  }

  const outcome = await withStageTiming("RULES_ENGINE", job.id, () =>
    Promise.resolve(
      evaluateVacantLand({
        candidateActiveRules,
        buildabilityApplicability: {},
        densityFacts,
        lotLineRoles,
        scenarioBuildableEnvelopes,
      })
    )
  );

  const explanationResult = deps.generateExplanation
    ? await withStageTiming("REPORT_EXPLANATION", job.id, () => deps.generateExplanation!([...outcome.buildabilityFindings, ...outcome.diligenceRisks]))
    : ({ outcome: "UNAVAILABLE", reason: "No Report Explanation client configured." } as const);

  const evidence = [
    { factType: "vacant-land-screening-intent", value: snapshot.screeningIntent, provenance: {} },
    { factType: "vacant-land-scenarios", value: outcome.scenarios, provenance: {} },
    { factType: "uncovered-constraint-types", value: outcome.uncoveredConstraintTypes, provenance: {} },
  ];

  const { artifact } = await withStageTiming("ARTIFACT_PERSISTENCE", job.id, () =>
    createEvidenceReportArtifact(db, {
      screeningRequestId,
      reportGenerationJobId: job.id,
      findings: [...outcome.buildabilityFindings, ...outcome.diligenceRisks],
      evidence,
      explanation: explanationResult.outcome === "AVAILABLE" ? explanationResult.explanation : undefined,
      ruleVersionsUsed: activeVacantLandRuleRows.map((r) => r.id),
      dataRetrievalTimestamps: {},
    })
  );

  await markJobComplete(db, job.id, artifact.id);
  logger.info("JOB_COMPLETE", { reportGenerationJobId: job.id, evidenceReportArtifactId: artifact.id });
}

/**
 * Unit 4 (business-rules.md BR-U4-7, revised through the final targeted correction). Assembles
 * LotCoverageFacts server-side, never from client-asserted derived numbers (BR-U4-8).
 *
 * `excludedLotAreaSqFt`/`countableLotAreaSqFt` are always left undefined - no production ECA
 * area-of-overlap capability exists today (confirmed against the actual codebase during
 * Functional Design's Correction 2 pass), so `minimumCoverageFloor` is always
 * REQUIRES_VERIFICATION with the 625 sq ft statutory minimum, never NOT_APPLICABLE - this project
 * can never confirm a parcel has no SMC 23.44.080.B-listed area at all.
 *
 * `applicableCoveragePercentage` follows the corrected L1/L5/L6 resolution: `stackedDwellingUnits
 * === false` rules out L6 only, never L5 (whose applicability cannot be independently established
 * at all today, per BR-U4-7) - so this never reaches ESTABLISHED(50, L1_DEFAULT) for any real
 * request; that branch exists in the type for a future unit that integrates transit-area data.
 */
function buildLotCoverageFacts(rawParcelAreaSqFt: number, garageDetails: GarageProjectConfiguration): LotCoverageFacts {
  const applicableCoveragePercentage: LotCoverageFacts["applicableCoveragePercentage"] =
    garageDetails.stackedDwellingUnits === true
      ? { status: "ESTABLISHED", percent: 60, basis: "L6_STACKED_BONUS" }
      : garageDetails.stackedDwellingUnits === false
        ? {
            status: "REQUIRES_VERIFICATION",
            reason:
              "This lot does not have stacked dwelling units (SMC 23.44.080.G ruled out), but whether it qualifies for the separate frequent-transit-area multi-unit 60% provision (SMC 23.44.080.F) cannot currently be established - no transit-service-area data source is integrated.",
          }
        : {
            status: "REQUIRES_VERIFICATION",
            reason:
              "Whether this lot qualifies for either SMC 23.44.080.F's frequent-transit-area multi-unit provision or SMC 23.44.080.G's stacked-dwelling-units provision (both raise the allowed coverage from 50% to 60%) has not been established.",
          };

  return {
    rawParcelAreaSqFt,
    proposedGarageCountableFootprintSqFt: garageDetails.widthFt * garageDetails.depthFt,
    existingStructuresCountableFootprintSqFt: garageDetails.existingStructuresFootprintSqFt,
    excludedLotAreaSqFt: undefined,
    countableLotAreaSqFt: undefined,
    applicableCoveragePercentage,
    minimumCoverageFloor: {
      status: "REQUIRES_VERIFICATION",
      statutoryMinimumSqFt: 625,
      reason:
        "Whether this parcel contains any SMC 23.44.080.B-listed area (which would trigger SMC 23.44.080.D's minimum coverage floor) cannot currently be established - no production critical-area area-of-overlap capability is integrated.",
    },
    allowedCoverageSqFt: undefined,
  };
}

function rowsToRegulatoryRules(rows: (typeof regulatoryRules.$inferSelect)[]): RegulatoryRule[] {
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    applicableProjectType: r.applicableProjectType ?? undefined,
    applicableWorkflowType: (r.applicableWorkflowType ?? undefined) as RegulatoryRule["applicableWorkflowType"],
    applicableZone: r.applicableZone,
    ruleSpecification: r.ruleSpecification as Record<string, unknown>,
    citation: r.citation as RegulatoryRule["citation"],
    lifecycleState: r.lifecycleState,
    tier: r.tier ?? undefined,
    caveats: r.caveats as RegulatoryRule["caveats"],
    testCases: r.testCases as RegulatoryRule["testCases"],
    verificationHistory: r.verificationHistory as RegulatoryRule["verificationHistory"],
    supersedesRuleId: r.supersedesRuleId ?? undefined,
    supersededByRuleId: r.supersededByRuleId ?? undefined,
    isTestOnlyFixture: r.isTestOnlyFixture,
    acceptedEvidenceQuality: r.acceptedEvidenceQuality as RegulatoryRule["acceptedEvidenceQuality"],
    approvalRecord: (r.approvalRecord as RegulatoryRule["approvalRecord"]) ?? undefined,
  }));
}

function rowsToInferencePolicies(rows: (typeof inferencePolicies.$inferSelect)[]): InferencePolicy[] {
  return rows.map((p) => ({
    id: p.id,
    subject: p.subject,
    derivationMethod: p.derivationMethod,
    citationOrBasis: p.citationOrBasis,
    lifecycleState: p.lifecycleState,
    version: p.version,
    isTestOnlyFixture: p.isTestOnlyFixture,
  }));
}
