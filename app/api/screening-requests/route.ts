import { getDb } from "../../../src/db/client.js";
import { createDraftScreeningRequest, createVacantLandScreeningRequest } from "../../../src/screening-request/repository.js";
import { SUPPORTED_PROJECT_TYPES, WorkflowType } from "../../../src/screening-request/types.js";

/** PC-1: creates a draft ScreeningRequest for the confirmed parcel + selected project type.
 * "shed" and (since Unit 4) "garage" are valid projectTypes - anything else is rejected here,
 * before it can reach any other part of the pipeline. Note: this gates INTAKE only (can the
 * request be created/evaluated at all) - it says nothing about public purchase eligibility, which
 * for GARAGE is a separate, additional gate (screening-request/authorization.ts's Garage
 * Screening Coverage Readiness, consulted at checkout time, not here).
 *
 * Unit 5: branches on `workflowType` FIRST (defaulting to `EXISTING_PROPERTY` for backward
 * compatibility with every existing caller, which never sent this field) - a `VACANT_LAND` body is
 * parsed/validated for real (this route genuinely knows how to read the shape), but
 * `createVacantLandScreeningRequest` itself refuses to persist it while the
 * persistence-write-activation gate (Code Generation Part 1, Step 9b) is `false`, independent of
 * this route's own logic. */
export async function POST(request: Request) {
  const body = (await request.json()) as { confirmedParcelId?: unknown; workflowType?: unknown; projectType?: unknown; screeningIntent?: unknown };
  if (typeof body.confirmedParcelId !== "string" || !body.confirmedParcelId) {
    return Response.json({ error: "confirmedParcelId is required." }, { status: 400 });
  }

  const workflowType = typeof body.workflowType === "string" ? body.workflowType : WorkflowType.EXISTING_PROPERTY;

  // Code Generation review correction - reject a mixed-workflow payload outright rather than
  // silently ignoring the incompatible field (e.g. a VACANT_LAND request that also carries
  // projectType, or an EXISTING_PROPERTY/default request that carries screeningIntent).
  if (workflowType === WorkflowType.VACANT_LAND && body.projectType !== undefined) {
    return Response.json({ error: "A VACANT_LAND request must not include projectType." }, { status: 400 });
  }
  if (workflowType !== WorkflowType.VACANT_LAND && body.screeningIntent !== undefined) {
    return Response.json({ error: "screeningIntent is only valid for a VACANT_LAND request." }, { status: 400 });
  }

  if (workflowType === WorkflowType.VACANT_LAND) {
    const result = await createVacantLandScreeningRequest(getDb(), body.confirmedParcelId, body.screeningIntent);
    if (result.outcome === "PERSISTENCE_WRITE_DISABLED") {
      return Response.json({ error: "Vacant-land screening is not yet available." }, { status: 503 });
    }
    if (result.outcome === "INVALID") {
      return Response.json({ error: result.issues.join("; ") }, { status: 400 });
    }
    return Response.json({ id: result.row.id, validationState: result.row.validationState }, { status: 201 });
  }

  if (workflowType !== WorkflowType.EXISTING_PROPERTY) {
    return Response.json({ error: `Workflow type "${workflowType}" is not currently supported.` }, { status: 400 });
  }
  if (typeof body.projectType !== "string" || !SUPPORTED_PROJECT_TYPES.has(body.projectType)) {
    return Response.json({ error: `Project type "${String(body.projectType)}" is not currently supported.` }, { status: 400 });
  }

  const row = await createDraftScreeningRequest(getDb(), body.confirmedParcelId, body.projectType);
  return Response.json({ id: row.id, validationState: row.validationState }, { status: 201 });
}
