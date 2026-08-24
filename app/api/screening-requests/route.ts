import { getDb } from "../../../src/db/client.js";
import { createDraftScreeningRequest } from "../../../src/screening-request/repository.js";
import { ProjectType } from "../../../src/screening-request/types.js";

/** PC-1: creates a draft ScreeningRequest for the confirmed parcel + selected project type. Only
 * "shed" is ever a valid projectType in Unit 2 - anything else is rejected here, before it can
 * reach any other part of the pipeline. */
export async function POST(request: Request) {
  const body = (await request.json()) as { confirmedParcelId?: unknown; projectType?: unknown };
  if (typeof body.confirmedParcelId !== "string" || !body.confirmedParcelId) {
    return Response.json({ error: "confirmedParcelId is required." }, { status: 400 });
  }
  if (body.projectType !== ProjectType.SHED) {
    return Response.json({ error: `Project type "${String(body.projectType)}" is not currently supported.` }, { status: 400 });
  }

  const row = await createDraftScreeningRequest(getDb(), body.confirmedParcelId, body.projectType);
  return Response.json({ id: row.id, validationState: row.validationState }, { status: 201 });
}
