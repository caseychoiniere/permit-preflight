import { getDb } from "../../../../src/db/client.js";
import { getGuestReport } from "../../../../src/checkout-fulfillment/index.js";
import { CHECKOUT_SESSION_COOKIE, readCookie } from "../../../../src/shared/cookies.js";

/**
 * Product-correctness correction (2026-08-28): lets the post-checkout status page render the
 * customer's actual generated report directly, instead of requiring them to leave the page and
 * find an email. Reuses the exact same EvidenceReportArtifact GET /api/reports already serves
 * (via getGuestReport -> getReportById - never a second report-generation or rendering path),
 * authorized by the same HttpOnly Stripe Checkout Session cookie already gating
 * GET /api/checkout/status - inherited automatically here since that cookie's path
 * ("/api/checkout") covers every route under this directory. Never the report-access token this
 * guest's browser has no way to have yet at this point in the flow.
 */
export async function GET(request: Request) {
  const sessionId = readCookie(request, CHECKOUT_SESSION_COOKIE);
  if (!sessionId) return notFound();

  const result = await getGuestReport(getDb(), sessionId);
  if (!result) return notFound();

  const { artifact, emailDeliveryStatus } = result;
  return Response.json(
    {
      id: artifact.id,
      findings: artifact.findings,
      evidence: artifact.evidence,
      explanation: artifact.explanation,
      generatedAt: artifact.generatedAt,
      ruleVersionsUsed: artifact.ruleVersionsUsed,
      emailDeliveryStatus,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function notFound(): Response {
  return Response.json({ error: "Not found." }, { status: 404 });
}
