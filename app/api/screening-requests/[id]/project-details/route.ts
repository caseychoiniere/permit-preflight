import { getDb } from "../../../../../src/db/client.js";
import { updateProjectDetails } from "../../../../../src/screening-request/repository.js";

/** PC-2: server-side validation regardless of client-side checks - the authoritative rejection
 * always comes from here, never trusting whatever the client already checked. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: unknown = await request.json();
  const result = await updateProjectDetails(getDb(), id, body);

  if (result.outcome === "INVALID") {
    return Response.json({ error: "Validation failed.", issues: result.issues }, { status: 400 });
  }
  return Response.json({ id: result.row.id, validationState: result.row.validationState });
}
