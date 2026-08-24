/**
 * Report Generation Authorization - Question 1's answer, BR-U2-1/BR-U2-2 (business-rules.md).
 * The internal trigger substituting for a verified-PAID event. `authorizeReportGeneration` is the
 * ONLY path by which a ReportGenerationJob may be created in Unit 2.
 */

import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { screeningRequests } from "../db/schema.js";
import { createReportGenerationJob } from "../report-generation-job/repository.js";
import type { DataSourceRegistry } from "../data-source-registry/index.js";
import { ProjectType, ValidationState } from "./types.js";
import type { ScreeningRequestSnapshot } from "./types.js";

/** INTERNAL_PROTOTYPE only in Unit 2 - Unit 2B adds a sibling VERIFIED_PAYMENT variant without
 * changing the downstream job-creation contract that consumes this. */
export const GenerationAuthorizationType = {
  INTERNAL_PROTOTYPE: "INTERNAL_PROTOTYPE",
} as const;
export type GenerationAuthorizationType = (typeof GenerationAuthorizationType)[keyof typeof GenerationAuthorizationType];

export type GenerationAuthorization = {
  type: GenerationAuthorizationType;
  screeningRequestId: string;
  authorizedBy: string;
  authorizedAt: string;
};

const SUPPORTED_PROJECT_TYPES = new Set<string>([ProjectType.SHED]);

export type ReadinessResult = { ready: true } | { ready: false; reason: string };

/** BR-U2-1: parcel resolved (implicit - a ScreeningRequest always has a confirmedParcelId),
 * project type currently supported, request validation passed, no required source already
 * known-unhealthy. Never invokes Property Intelligence, Spatial Analysis, or the Regulatory Rules
 * Engine - a cheap check only. */
export function checkReadiness(
  screeningRequest: { projectType: string; validationState: string },
  requiredSourceIds: string[],
  dataSourceRegistry: DataSourceRegistry
): ReadinessResult {
  if (!SUPPORTED_PROJECT_TYPES.has(screeningRequest.projectType)) {
    return { ready: false, reason: `Project type "${screeningRequest.projectType}" is not currently supported.` };
  }
  if (screeningRequest.validationState !== ValidationState.VALID) {
    return { ready: false, reason: "Screening request has not passed validation." };
  }
  for (const sourceId of requiredSourceIds) {
    if (dataSourceRegistry.isKnownUnhealthy(sourceId)) {
      return { ready: false, reason: `Required data source "${sourceId}" is already known to be unhealthy.` };
    }
  }
  return { ready: true };
}

export type AuthorizeResult =
  | { outcome: "AUTHORIZED"; authorization: GenerationAuthorization; reportGenerationJobId: string }
  | { outcome: "NOT_READY"; reason: string }
  | { outcome: "NOT_FOUND" };

const REQUIRED_SOURCE_IDS_FOR_SHED = ["king-county-gis", "king-county-parcel-polygon"];

/**
 * BR-U2-2: the only path by which a ReportGenerationJob may be created. `authorizedBy` is
 * required and must identify a real human/internal-operator identity - never defaulted. Takes
 * the ScreeningRequest's immutable snapshot NOW, at this exact moment (RGD-4) - a later edit to a
 * different live request can never retroactively change this snapshot.
 */
export async function authorizeReportGeneration(
  db: Db,
  screeningRequestId: string,
  authorizedBy: string,
  dataSourceRegistry: DataSourceRegistry
): Promise<AuthorizeResult> {
  if (!authorizedBy.trim()) {
    throw new Error("authorizedBy is required to authorize report generation - no code path may omit it.");
  }

  const [request] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, screeningRequestId));
  if (!request) return { outcome: "NOT_FOUND" };

  const readiness = checkReadiness(request, REQUIRED_SOURCE_IDS_FOR_SHED, dataSourceRegistry);
  if (!readiness.ready) return { outcome: "NOT_READY", reason: readiness.reason };

  const authorizedAt = new Date().toISOString();
  const authorization: GenerationAuthorization = {
    type: GenerationAuthorizationType.INTERNAL_PROTOTYPE,
    screeningRequestId,
    authorizedBy,
    authorizedAt,
  };

  // Snapshot is taken here, once, and never overwritten again (enforced by only ever setting it
  // when currently null - re-authorizing an already-snapshotted request reuses the existing
  // snapshot via createReportGenerationJob's idempotent job creation, not a new snapshot).
  if (!request.snapshot) {
    const snapshot: ScreeningRequestSnapshot = {
      confirmedParcelId: request.confirmedParcelId,
      projectType: request.projectType as typeof ProjectType.SHED,
      projectDetails: request.projectDetails as ScreeningRequestSnapshot["projectDetails"],
    };
    await db
      .update(screeningRequests)
      .set({ snapshot, snapshotTakenAt: new Date(authorizedAt), updatedAt: sql`now()` })
      .where(eq(screeningRequests.id, screeningRequestId));
  }

  const job = await createReportGenerationJob(db, screeningRequestId, authorization);
  return { outcome: "AUTHORIZED", authorization, reportGenerationJobId: job.id };
}
