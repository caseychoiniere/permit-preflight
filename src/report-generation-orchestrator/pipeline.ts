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
import { ProjectType, WorkflowType } from "../screening-request/types.js";
import { hydrateScreeningRequestSnapshot } from "../screening-request/hydrate.js";
import { assemblePropertyContext, type FactRetriever } from "../property-intelligence/assemble.js";
import { createKingCountyParcelGeometryRetriever } from "../property-intelligence/king-county-parcel-geometry.js";
import { createSeattleBuildingOutlinesRetriever } from "../property-intelligence/seattle-building-outlines.js";
import { classifyExistingStructures, findPrimaryDwelling, type ExistingStructure, type RawBuildingFootprint } from "../property-intelligence/existing-structures.js";
import { AvailabilityState, getFact } from "../property-intelligence/types.js";
import type { PropertyFact } from "../property-intelligence/types.js";
import { recordIngestionResult } from "../data-source-registry/index.js";
import type { EvidenceQuality } from "../property-intelligence/types.js";
import type { GeographicPoint, Polygon } from "../spatial-analysis/types.js";
import {
  computeBuildableEnvelope,
  computeDistanceToDwelling,
  computeEcaExclusionGeometry,
  computeParcelAreaSqFt,
  computeSetbackConstrainedArea,
  computeSetbackDistances,
  transformPolygonToWgs84,
} from "../spatial-analysis/postgis-adapter.js";
import { evaluateProject } from "../regulatory-rules-engine/evaluate.js";
import { evaluateVacantLand, findActiveScenarioRule, SCENARIO_DEFINITIONS, toAppliedRuleRef } from "../regulatory-rules-engine/evaluate-vacant-land.js";
import type { VacantLandSetbackRuleSpec } from "../regulatory-rules-engine/evaluate-vacant-land.js";
import { EvaluationStatus } from "../regulatory-rules-engine/types.js";
import type { LotCoverageFacts, ProjectDetails, ShedProjectDetails, Finding } from "../regulatory-rules-engine/types.js";
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
    }
    const propertyContext = await withStageTiming("PROPERTY_INTELLIGENCE", job.id, () =>
      assemblePropertyContext(confirmedParcel, { retrievers })
    );

    const geometryFact = getFact<Polygon>(propertyContext, "parcel-geometry-available");
    const buildingFootprintsFact = getFact<RawBuildingFootprint[]>(propertyContext, "building-footprints-available");

    // Unit 3, 2026-08-25: wires the existing recordIngestionResult contract into this already-
    // implemented authoritative retrieval path (property-intelligence/assemble.ts itself is NOT
    // modified - it stays pure/DB-free). Best-effort: a health-recording failure must never fail
    // report generation itself, and never turns a failed retrieval into a recorded success.
    try {
      if (geometryFact?.availabilityState === AvailabilityState.AVAILABLE) {
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
      footprintProjected = computedFootprint;

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
      if (buildingFootprintsFact?.availabilityState === AvailabilityState.AVAILABLE && buildingFootprintsFact.value && footprintProjected) {
        const shedDetails = snapshot.projectDetails as ShedProjectConfiguration;
        const structures = classifyExistingStructures(buildingFootprintsFact.value, buildingFootprintsFact.provenance, shedDetails.primaryDwellingSelection);
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
        if (primaryDwelling) {
          distanceToDwellingFt = await withStageTiming("SPATIAL_ANALYSIS", job.id, () => computeDistanceToDwelling(db, footprintProjected!, primaryDwelling.footprint));
        } else if (shedDetails.primaryDwellingSelection?.status === "SELECTED") {
          // The user selected a specific building during configuration, but it's not among the
          // footprints this fresh, generation-time re-fetch returned (removed/redrawn upstream,
          // or a genuinely stale selection) - never guessed at or silently re-mapped to a
          // different footprint (classifyExistingStructures' own hard invariant).
          dwellingSelectionNotMatchedExplanation =
            "The building you previously selected as the primary dwelling could not be matched against the current Seattle Building Outlines data, " +
            "so dwelling separation could not be evaluated for this report. Other applicable findings below are unaffected.";
        }
      }

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
      };
    }

    const outcome = await withStageTiming("RULES_ENGINE", job.id, async () =>
      evaluateProject({
        propertyContext,
        project,
        candidateActiveRules: rowsToRegulatoryRules(activeRuleRows),
        ecaFindings: [],
        candidateActiveInferencePolicies: rowsToInferencePolicies(activePolicyRows),
        lotCoverageFacts,
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

    // Report Explanation (AI, optional) - never fails the job on unavailability (BR-U2-8).
    const explanationResult = deps.generateExplanation
      ? await withStageTiming("REPORT_EXPLANATION", job.id, () => deps.generateExplanation!(outcome.findings))
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
    ];

    const { artifact } = await withStageTiming("ARTIFACT_PERSISTENCE", job.id, () =>
      createEvidenceReportArtifact(db, {
        screeningRequestId: screeningRequest.id,
        reportGenerationJobId: job.id,
        findings: outcome.findings,
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
