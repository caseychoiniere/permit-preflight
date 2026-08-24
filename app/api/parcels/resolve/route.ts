import { resolveByAddress } from "../../../../src/parcel-resolution/index.js";

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
  return Response.json(result);
}
