import { getDb } from "../../../../../src/db/client.js";
import { getAccountReport } from "../../../../../src/account-auth/workflows.js";
import { resolveAccountSession } from "../../../../../src/account-auth/session.js";
import { getReportById } from "../../../../../src/evidence-report-artifact/index.js";

/**
 * getAccountReport (workflow 4b, BR-U6-4 Mode B) - Account Access to a report, entirely
 * independent of the guest reportAccessToken (Mode A, unchanged). Authorization is the
 * AccountOrderLink check inside getAccountReport itself; a FORBIDDEN outcome is returned
 * identically whether the order doesn't exist, belongs to no account, or belongs to a different
 * account (NFR-U6-21). Reuses the existing report-rendering data shape exactly (app/api/reports's
 * own response fields) - a new authorization route to the same existing content, not a second
 * rendering mechanism.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const db = getDb();
  const session = await resolveAccountSession(request, db);
  if (!session) {
    return forbidden();
  }

  const result = await getAccountReport(db, session.accountId, orderId);
  if (result.outcome !== "FOUND") {
    return forbidden();
  }

  const artifact = await getReportById(db, result.artifactId);
  if (!artifact) {
    return forbidden();
  }

  return Response.json({
    id: artifact.id,
    findings: artifact.findings,
    evidence: artifact.evidence,
    explanation: artifact.explanation,
    generatedAt: artifact.generatedAt,
    ruleVersionsUsed: artifact.ruleVersionsUsed,
  });
}

function forbidden(): Response {
  return Response.json({ error: "Not found." }, { status: 404 });
}
