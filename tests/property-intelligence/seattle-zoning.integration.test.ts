/**
 * Live Seattle GIS integration (network only, no database): the zoning, frequent-transit and landmark
 * retrievers against real, verified parcels. Parcel facts re-verified 2026-10-08:
 *  - 1498301270 plain NR, in the frequent transit service area
 *  - 6374500050 plain NR, not in FTSA
 *  - 0523049029 NR touching a C2-75 neighbor (sliver must be ignored)
 *  - 3298700485 zoned LR1 - the long-standing "NR test parcel" is NOT NR
 *  - 0151000010 NR with ~45% in a Shoreline District
 */
import { describe, expect, it } from "vitest";
import { createSeattleFrequentTransitRetriever, createSeattleLandmarkRetriever, createSeattleZoningRetriever } from "../../src/property-intelligence/seattle-zoning.js";
import { buildZoningContext } from "../../src/zoning/context.js";
import { resolveApplicableRules } from "../../src/zoning/resolve.js";
import type { ZoningFactValue } from "../../src/property-intelligence/seattle-zoning.js";

/** The zoning the engine would apply (no rules needed to learn the zones and the status). */
const resolve = (z: ZoningFactValue) => resolveApplicableRules({ zoning: buildZoningContext({ lot: z }), candidateRules: [] });

const parcel = (parcelId: string) => ({ parcelId, source: "ADDRESS_GEOCODE", characteristics: {} }) as never;

describe("Seattle zoning/transit/landmark retrievers - live", () => {
  it("plain NR parcels resolve to the NR family; the touching-neighbor parcel is not split", async () => {
    for (const pin of ["1498301270", "6374500050", "0523049029"]) {
      const z = await createSeattleZoningRetriever().retrieve(parcel(pin));
      expect(z.coveredFraction).toBeGreaterThan(0.95);
      const r = resolve(z);
      expect(r.status, pin).toBe("RESOLVED");
      expect(r.governing?.family, pin).toBe("NR");
    }
  }, 60_000);

  it("the former 'NR test parcel' is verified as a Lowrise (LR1) parcel, with the designation parsed from the real layer", async () => {
    const z = await createSeattleZoningRetriever().retrieve(parcel("3298700485"));
    const r = resolve(z);
    expect(r.governing?.family).toBe("LR");
    expect(r.governing?.zoneCode).toBe("LR1");
    expect(r.governing?.raw).toContain("LR1");
    expect(z.zones[0]!.designation?.family).toBe("LR");
  }, 60_000);

  it("a parcel partly in a Shoreline District is still NR but flagged", async () => {
    const r = resolve(await createSeattleZoningRetriever().retrieve(parcel("0151000010")));
    expect(r.governing?.family).toBe("NR");
    expect(r.overlays.shorelineDistrict).toBe(true);
  }, 60_000);

  it("frequent transit membership is exact by PIN; no landmark on these parcels", async () => {
    expect((await createSeattleFrequentTransitRetriever().retrieve(parcel("1498301270"))).inFrequentTransitServiceArea).toBe(true);
    expect((await createSeattleFrequentTransitRetriever().retrieve(parcel("6374500050"))).inFrequentTransitServiceArea).toBe(false);
    expect((await createSeattleLandmarkRetriever().retrieve(parcel("6374500050"))).isLandmarkParcel).toBe(false);
  }, 60_000);
});
