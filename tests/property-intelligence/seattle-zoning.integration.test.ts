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
import { deriveZoningApplicability } from "../../src/regulatory-rules-engine/zoning-applicability.js";

const parcel = (parcelId: string) => ({ parcelId, source: "ADDRESS_GEOCODE", characteristics: {} }) as never;

describe("Seattle zoning/transit/landmark retrievers - live", () => {
  it("plain NR parcels classify NR_VERIFIED; the touching-neighbor parcel is not split", async () => {
    for (const pin of ["1498301270", "6374500050", "0523049029"]) {
      const z = await createSeattleZoningRetriever().retrieve(parcel(pin));
      expect(z.coveredFraction).toBeGreaterThan(0.95);
      expect(deriveZoningApplicability(z).status, pin).toBe("NR_VERIFIED");
    }
  }, 60_000);

  it("the former 'NR test parcel' is verified as NOT NR (LR1)", async () => {
    const z = await createSeattleZoningRetriever().retrieve(parcel("3298700485"));
    const a = deriveZoningApplicability(z);
    expect(a.status).toBe("NOT_NR");
    if (a.status === "NOT_NR") expect(a.zoningLabel).toContain("LR1");
  }, 60_000);

  it("a parcel partly in a Shoreline District is still NR but flagged", async () => {
    const a = deriveZoningApplicability(await createSeattleZoningRetriever().retrieve(parcel("0151000010")));
    expect(a.status).toBe("NR_VERIFIED");
    if (a.status === "NR_VERIFIED") expect(a.overlays.shorelineDistrict).toBe(true);
  }, 60_000);

  it("frequent transit membership is exact by PIN; no landmark on these parcels", async () => {
    expect((await createSeattleFrequentTransitRetriever().retrieve(parcel("1498301270"))).inFrequentTransitServiceArea).toBe(true);
    expect((await createSeattleFrequentTransitRetriever().retrieve(parcel("6374500050"))).inFrequentTransitServiceArea).toBe(false);
    expect((await createSeattleLandmarkRetriever().retrieve(parcel("6374500050"))).isLandmarkParcel).toBe(false);
  }, 60_000);
});
