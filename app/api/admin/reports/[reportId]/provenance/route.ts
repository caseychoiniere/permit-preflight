import { getDb } from "../../../../../../src/db/client.js";
import { getReportById } from "../../../../../../src/evidence-report-artifact/index.js";

/**
 * ADM-1: report evidence/provenance, read-only, keyed by REPORT/ARTIFACT ID (corrected
 * 2026-08-25 - the original implementation was keyed by ReportGenerationJob id, but ADM-1's
 * approved entry point is a report/artifact id). Operates directly on
 * EvidenceReportArtifact.id via the existing getReportById - no job lookup indirection.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const artifact = await getReportById(getDb(), reportId);
  if (!artifact) {
    return Response.json({ error: "Evidence report artifact not found." }, { status: 404 });
  }
  return Response.json({ artifact });
}
