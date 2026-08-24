/**
 * ScreeningRequest persistence + Workflow 1 (Project Configuration, PC-1/PC-2). Owned by Project
 * Preflight Service conceptually - Parcel Resolution/Screening Request themselves are not
 * duplicated here (this module only orchestrates the shed/existing-property path, per
 * Application Design's ownership boundary).
 */

import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { screeningRequests, type ScreeningRequestRow } from "../db/schema.js";
import { ProjectType, ShedProjectConfigurationSchema, ValidationState, WorkflowType, type ShedProjectConfiguration } from "./types.js";
import { validateAtBoundary } from "../shared/validation.js";

const SUPPORTED_PROJECT_TYPES = new Set<string>([ProjectType.SHED]);

export async function createDraftScreeningRequest(db: Db, confirmedParcelId: string, projectType: string): Promise<ScreeningRequestRow> {
  const [row] = await db
    .insert(screeningRequests)
    .values({
      workflowType: WorkflowType.EXISTING_PROPERTY,
      confirmedParcelId,
      projectType,
      projectDetails: {},
      validationState: ValidationState.DRAFT,
    })
    .returning();
  if (!row) throw new Error("Failed to create ScreeningRequest.");
  return row;
}

export type UpdateResult =
  | { outcome: "VALID"; row: ScreeningRequestRow }
  | { outcome: "INVALID"; issues: string[] };

/** PC-2: server-side validation regardless of client-side checks. Rejects malformed/out-of-range
 * input with specific errors before validationState can become VALID. */
export async function updateProjectDetails(db: Db, screeningRequestId: string, projectDetails: unknown): Promise<UpdateResult> {
  const [existing] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, screeningRequestId));
  if (!existing) return { outcome: "INVALID", issues: ["Screening request not found."] };
  if (!SUPPORTED_PROJECT_TYPES.has(existing.projectType)) {
    return { outcome: "INVALID", issues: [`Project type "${existing.projectType}" is not currently supported.`] };
  }
  if (existing.snapshot) {
    return { outcome: "INVALID", issues: ["This screening request has already been authorized for generation and is now immutable."] };
  }

  const validated = validateAtBoundary(ShedProjectConfigurationSchema, projectDetails);
  if (validated.outcome === "INVALID") return { outcome: "INVALID", issues: validated.issues };

  const isComplete = isConfigurationComplete(validated.data);
  const [row] = await db
    .update(screeningRequests)
    .set({ projectDetails: validated.data, validationState: isComplete ? ValidationState.VALID : ValidationState.DRAFT, updatedAt: sql`now()` })
    .where(eq(screeningRequests.id, screeningRequestId))
    .returning();
  if (!row) throw new Error("Failed to update ScreeningRequest.");
  return { outcome: "VALID", row };
}

/** A configuration is ready for authorization once the pieces the pipeline actually needs are
 * present - dimensions plus a placement (map-based footprint+role, or the internal/testing
 * manual fallback). */
function isConfigurationComplete(config: ShedProjectConfiguration): boolean {
  const hasDimensions = config.widthFt > 0 && config.depthFt > 0 && config.heightFt > 0;
  const hasPlacement = config.proposedPlacement !== undefined;
  return hasDimensions && hasPlacement;
}

export async function getScreeningRequest(db: Db, id: string): Promise<ScreeningRequestRow | undefined> {
  const [row] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, id));
  return row;
}
