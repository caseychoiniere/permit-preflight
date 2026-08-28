import { isVacantLandScreeningCoverageReady } from "../../../../src/screening-request/authorization.js";

/**
 * Unit 5 (BR-U5-9) - mirrors `available-project-types/route.ts`'s exact pattern, a separate route
 * rather than an extension of that one, since VACANT_LAND is not a `ProjectType` (BR-U5-1). The
 * vacant-land entry point (a client component) uses this so it never imports
 * screening-request/authorization.js (a server-only module) directly. Not a general feature-flag
 * framework - one flag, one route, matching the garage precedent exactly.
 *
 * Governs PUBLIC advertisement only. The checkout-time gate
 * (`checkVacantLandCheckoutEligibility`) and the persistence-write-activation gate
 * (`isVacantLandPersistenceWriteEnabled`, Code Generation Part 1 Step 9b - a structurally separate
 * data-layer concern) remain the authoritative server-side defenses even if a caller bypasses this
 * route entirely. Expected to stay `false` for the entire Units 5-11 POC-build phase.
 */
export async function GET() {
  return Response.json({ available: isVacantLandScreeningCoverageReady() }, { headers: { "Cache-Control": "no-store" } });
}
