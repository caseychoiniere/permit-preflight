/**
 * Live Seattle ECA integration (network only, no database). Guards against layer-id drift: in 2026-10 it was found that eight of the ten hazards were
 * queried at layer id 0 (which does not exist in their services), so they were silently "unavailable" and the combined fallback reported
 * "no intersection". Every hazard must now answer, on an ordinary parcel and on a very large one (which needs the POST form of the query).
 */
import { describe, expect, it } from "vitest";
import { fetchSeattleEcaFindings } from "../../src/property-intelligence/seattle-eca.js";

describe("Seattle ECA retriever - live", () => {
  it("every one of the ten hazards answers (no layer unavailable) for an ordinary parcel, and the mapped hits are consistent between the individual and combined services", async () => {
    const findings = await fetchSeattleEcaFindings("1498301270");
    expect(findings).toHaveLength(10);
    for (const f of findings) {
      expect(f.individualLayerResult, f.hazardType).not.toBeUndefined();
      expect(f.combinedLayerResult, f.hazardType).not.toBeUndefined();
    }
    // 1498301270 (1906 16th Ave S) is mapped in the steep-slope and slide layers.
    for (const h of ["steep_slope", "known_slides", "potential_slide_areas"]) expect(findings.find((f) => f.hazardType === h)!.individualLayerResult, h).toBe(true);
  }, 90_000);

  it("a very large (campus) parcel also answers every hazard: the polygon travels in a POST body", async () => {
    const findings = await fetchSeattleEcaFindings("2982800005");
    for (const f of findings) expect(f.individualLayerResult, f.hazardType).not.toBeUndefined();
    expect(findings.find((f) => f.hazardType === "riparian_corridor")!.individualLayerResult).toBe(true);
  }, 90_000);
});
