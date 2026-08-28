import { runReconciliation } from "../../../../src/checkout-fulfillment/reconciliation.js";

/**
 * Vercel Cron backstop (every 5 minutes, vercel.json). Protected by CRON_SECRET - Vercel's
 * documented pattern for Cron-invoked routes, since this endpoint would otherwise be an
 * unauthenticated public route capable of forcing refund/workflow restarts. Every check inside
 * runReconciliation() is itself idempotent, so this route has no need to distinguish a real Cron
 * invocation's timing from a manual retry - only its authorization.
 */
export async function GET(request: Request) {
  const cronSecret = process.env["CRON_SECRET"];
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await runReconciliation();
  return Response.json(summary, { status: 200 });
}
