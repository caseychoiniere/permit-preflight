import { getDb } from "../../../../../src/db/client.js";
import { authorizeReportGeneration } from "../../../../../src/screening-request/authorization.js";
import { dataSourceRegistry } from "../../../../../src/shared/data-source-registry-instance.js";

/**
 * BR-U2-2: the only path by which a ReportGenerationJob may be created. Deliberately an
 * internal/founder-facing action in Unit 2 - not exposed by the ProjectConfigurationFlow UI
 * (there is no checkout in this unit). `authorizedBy` must be a real recorded identity.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { authorizedBy?: unknown };
  if (typeof body.authorizedBy !== "string" || !body.authorizedBy.trim()) {
    return Response.json({ error: "authorizedBy is required." }, { status: 400 });
  }

  const result = await authorizeReportGeneration(getDb(), id, body.authorizedBy, dataSourceRegistry);

  if (result.outcome === "NOT_FOUND") return Response.json({ error: "Screening request not found." }, { status: 404 });
  if (result.outcome === "NOT_READY") return Response.json({ error: result.reason }, { status: 409 });
  return Response.json({ reportGenerationJobId: result.reportGenerationJobId }, { status: 202 });
}
