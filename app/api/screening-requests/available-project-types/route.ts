import { ProjectType } from "../../../../src/screening-request/types.js";
import { isGarageScreeningCoverageReady } from "../../../../src/screening-request/authorization.js";

/**
 * Unit 4 (business-rules.md BR-U4-9, corrected per founder review 2026-08-27) - the minimal
 * server-safe mechanism `/configure` (a client component) uses to decide which project types to
 * publicly advertise. `/configure` must never import screening-request/authorization.js directly
 * (a server-only module) into browser code merely to read this flag - this tiny, single-purpose
 * endpoint is the boundary instead. Not a general feature-flag framework: one flag, one route.
 *
 * SHED is always advertised. GARAGE is included only when isGarageScreeningCoverageReady() is
 * true - expected to stay false for the entire Units 4-11 POC-build phase. This governs PUBLIC
 * advertisement only; GARAGE remains fully representable/testable via the existing
 * POST /api/screening-requests endpoint regardless (SUPPORTED_PROJECT_TYPES still accepts it) -
 * intake/evaluation support and public advertisement are deliberately separate gates. The
 * checkout-time gate (checkGarageCheckoutEligibility, screening-request/authorization.ts) remains
 * the authoritative server-side defense even if a caller bypasses this list entirely.
 */
export async function GET() {
  const availableProjectTypes = [ProjectType.SHED, ...(isGarageScreeningCoverageReady() ? [ProjectType.GARAGE] : [])];
  return Response.json({ availableProjectTypes }, { headers: { "Cache-Control": "no-store" } });
}
