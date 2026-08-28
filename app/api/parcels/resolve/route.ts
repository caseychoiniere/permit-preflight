import { resolveByAddress, ParcelResolutionStatus } from "../../../../src/parcel-resolution/index.js";
import { getDb } from "../../../../src/db/client.js";
import { recordIngestionResult } from "../../../../src/data-source-registry/index.js";
import { logger } from "../../../../src/shared/logger.js";

/**
 * Minimal glue, not a rebuild of Epic 1 (Property Resolution): PC-1/PC-2's approved
 * ProjectConfigurationFlow starts from an already-confirmed parcel, but Unit 1 built no UI at
 * all. This is the smallest possible entry point that reaches Unit 1's real, unchanged
 * resolveByAddress - it does not add any new resolution UX (map-based clarification, candidate
 * picking, etc.) beyond what's needed to reach the approved flow's starting point.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { address?: unknown };
  if (typeof body.address !== "string" || !body.address.trim()) {
    return Response.json({ error: "address is required." }, { status: 400 });
  }

  const result = await resolveByAddress(body.address);

  // Unit 3, 2026-08-25: wires the existing recordIngestionResult contract into this already-
  // implemented authoritative retrieval path (parcel-resolution/index.ts itself is NOT modified -
  // it stays pure/DB-free). RESOLUTION_UNAVAILABLE is returned by resolve.ts exactly when the
  // underlying King County RetryResult was EXHAUSTED - a reliable, already-computed failure
  // signal. Best-effort: a health-recording failure must never change or block the actual
  // resolution response returned to the caller.
  try {
    if (result.status === ParcelResolutionStatus.RESOLUTION_UNAVAILABLE) {
      await recordIngestionResult(getDb(), "king-county-gis", { success: false, reason: result.unavailabilityDetail.failureNature });
    } else {
      await recordIngestionResult(getDb(), "king-county-gis", { success: true });
    }
  } catch (err) {
    logger.warn("DATA_SOURCE_HEALTH_RECORDING_FAILED", { sourceId: "king-county-gis", error: err instanceof Error ? err.message : String(err) });
  }

  return Response.json(result);
}
