/**
 * Report Generation Orchestrator Service - Workflow 4 (business-logic-model.md). The only place
 * Property Intelligence, Spatial Analysis, and the Regulatory Rules Engine are invoked, and the
 * only caller of the production PostGIS adapter. Runs the full pipeline for one already-claimed
 * ReportGenerationJob.
 */

import { eq, and } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { screeningRequests, regulatoryRules, inferencePolicies, type ReportGenerationJobRow } from "../db/schema.js";
import type { ScreeningRequestSnapshot } from "../screening-request/types.js";
import { assemblePropertyContext, type FactRetriever } from "../property-intelligence/assemble.js";
import { createKingCountyParcelGeometryRetriever } from "../property-intelligence/king-county-parcel-geometry.js";
import { AvailabilityState, getFact } from "../property-intelligence/types.js";
import type { EvidenceQuality } from "../property-intelligence/types.js";
import type { Polygon } from "../spatial-analysis/types.js";
import { computeSetbackDistances, transformPolygonToWgs84 } from "../spatial-analysis/postgis-adapter.js";
import { evaluateProject } from "../regulatory-rules-engine/evaluate.js";
import { EvaluationStatus } from "../regulatory-rules-engine/types.js";
import { LifecycleState } from "../regulatory-rule-governance/types.js";
import type { RegulatoryRule, InferencePolicy } from "../regulatory-rule-governance/types.js";
import { CandidateParcelSource, ParcelResolutionStatus } from "../parcel-resolution/types.js";
import { explainFindings } from "../report-explanation/index.js";
import type { AiCompletionClient } from "../rule-research-assistant/index.js";
import { createEvidenceReportArtifact } from "../evidence-report-artifact/index.js";
import { markJobComplete, markJobFailed } from "../report-generation-job/repository.js";
import { withStageTiming } from "./stage-timing.js";
import { logger } from "../shared/logger.js";
import type { ConfirmedParcelResolution } from "../property-intelligence/assemble.js";

export interface PipelineDependencies {
  reportExplanationClient?: AiCompletionClient;
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
    const snapshot = screeningRequest.snapshot as ScreeningRequestSnapshot;

    // Property Intelligence - retrieves parcel geometry (King County parcel-polygon layer, this
    // unit's new retriever) and any other facts. Never invoked pre-authorization (BR-U2-1/BR-U2-3).
    const resolvedParcel = { parcelId: snapshot.confirmedParcelId, source: CandidateParcelSource.ADDRESS_GEOCODE, characteristics: {} };
    const confirmedParcel: ConfirmedParcelResolution = {
      status: ParcelResolutionStatus.CONFIRMED,
      confirmedParcel: resolvedParcel,
      candidates: [resolvedParcel],
    };
    const retrievers: FactRetriever[] = [createKingCountyParcelGeometryRetriever()];
    const propertyContext = await withStageTiming("PROPERTY_INTELLIGENCE", job.id, () =>
      assemblePropertyContext(confirmedParcel, { retrievers })
    );

    const geometryFact = getFact<Polygon>(propertyContext, "parcel-geometry-available");

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

    // Regulatory Rules Engine - ACTIVE-only, evidence-quality-gated (BR-U2-10).
    const activeRuleRows = await db.select().from(regulatoryRules).where(and(eq(regulatoryRules.lifecycleState, LifecycleState.ACTIVE), eq(regulatoryRules.applicableProjectType, "shed")));
    const activePolicyRows = await db.select().from(inferencePolicies).where(eq(inferencePolicies.lifecycleState, LifecycleState.ACTIVE));

    const outcome = await withStageTiming("RULES_ENGINE", job.id, async () =>
      evaluateProject({
        propertyContext,
        project: {
          widthFt: snapshot.projectDetails.widthFt,
          depthFt: snapshot.projectDetails.depthFt,
          heightFt: snapshot.projectDetails.heightFt,
          alleyAdjacent: snapshot.projectDetails.alleyAdjacent,
          distanceToRearLotLineFt,
          distanceToSideLotLineFt,
          distanceToFrontLotLineFt,
          spatialEvidenceQuality,
        },
        candidateActiveRules: rowsToRegulatoryRules(activeRuleRows),
        ecaFindings: [],
        candidateActiveInferencePolicies: rowsToInferencePolicies(activePolicyRows),
      })
    );

    if (outcome.status === EvaluationStatus.DEFERRED) {
      await markJobFailed(db, job.id, outcome.deferralReason ?? "Evaluation deferred.");
      return;
    }

    // Report Explanation (AI, optional) - never fails the job on unavailability (BR-U2-8).
    const explanationResult = deps.reportExplanationClient
      ? await withStageTiming("REPORT_EXPLANATION", job.id, () => explainFindings(outcome.findings, deps.reportExplanationClient!))
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

function rowsToRegulatoryRules(rows: (typeof regulatoryRules.$inferSelect)[]): RegulatoryRule[] {
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    applicableProjectType: r.applicableProjectType,
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
