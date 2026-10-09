import { getDb } from "../../../../../src/db/client.js";
import { checkParcelZoningEligibility } from "../../../../../src/zoning/eligibility-service.js";
import { logger } from "../../../../../src/shared/logger.js";

/**
 * Early, lot-level zoning advisory for the project-type step of /configure (citywide zoning coverage): which project types Permit Preflight can screen for
 * this property's zoning, before the customer enters any details. It is advisory only - the authoritative per-property purchase gate runs at checkout
 * (src/zoning/eligibility-service.ts, checkZoningPurchaseEligibility) with the project's own footprint. Returns plain-language messages and no internals.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  try {
    const { zoneLabels, byProjectType } = await checkParcelZoningEligibility(getDb(), pin);
    const summary = Object.fromEntries(
      Object.entries(byProjectType).map(([type, e]) => [type, e.eligible ? { eligible: true as const } : { eligible: false as const, message: e.message, retryable: e.retryable }])
    );
    return Response.json({ zoneLabels, byProjectType: summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.warn("SOURCE_FAILURE", { sourceId: "seattle-zoning", stage: "ELIGIBILITY_ADVISORY", error: err instanceof Error ? err.message : String(err) });
    return Response.json({ error: "Zoning could not be checked right now." }, { status: 502 });
  }
}
