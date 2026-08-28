/**
 * Deterministic (no DB) tests for Unit 5's new buildable-envelope PostGIS adapter functions -
 * mirrors postgis-adapter.test.ts's own "short-circuits before touching db" convention. Real
 * PostGIS-backed geometry correctness (ST_Buffer/ST_Intersection/ST_Difference results,
 * ST_IsValid rejection, Polygon/MultiPolygon parsing) requires a live database and belongs in an
 * `.integration.test.ts` file, not here.
 */

import { describe, expect, it } from "vitest";
import { computeEcaExclusionGeometry, computeSetbackConstrainedArea, SpatialComputationError } from "../../src/spatial-analysis/postgis-adapter.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../../src/property-intelligence/king-county-parcel-geometry.js";
import type { Db } from "../../src/db/client.js";
import type { Polygon } from "../../src/spatial-analysis/types.js";

const neverUsedDb = {} as Db;

const authoritativeBoundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }],
};

describe("computeSetbackConstrainedArea - LotLineRoles fail-closed default (deterministic, no DB)", () => {
  it("[hard invariant] INSUFFICIENT lot-line roles short-circuits before any PostGIS call, returning REQUIRES_VERIFICATION - the honest, expected status for every real Unit 5 evaluation today (no role-establishment UI exists)", async () => {
    const result = await computeSetbackConstrainedArea(neverUsedDb, authoritativeBoundary, { status: "INSUFFICIENT" }, { frontFt: 15, rearFt: 15, sideFt: 5, sideIsAveragingGoverned: true });
    expect(result).toEqual({
      status: "REQUIRES_VERIFICATION",
      reason: "Lot-line roles (front/rear/side) are not established for this parcel - required to compute a setback-constrained buildable area.",
    });
  });
});

describe("computeEcaExclusionGeometry - no ECA data source integrated (deterministic, no DB)", () => {
  it("[hard invariant] undefined knownEcaGeometry short-circuits before any PostGIS call, returning REQUIRES_VERIFICATION - no production ECA area-of-overlap capability exists in this unit", async () => {
    const result = await computeEcaExclusionGeometry(neverUsedDb, authoritativeBoundary, undefined);
    expect(result).toEqual({
      status: "REQUIRES_VERIFICATION",
      reason: "No ECA (critical-area) geometry is available for this parcel - no production area-of-overlap capability is integrated in this unit.",
    });
  });
});

describe("SpatialComputationError - the COMPUTATION_FAILURE variant (deterministic)", () => {
  it("is a real, named Error subclass distinguishable from an ordinary Error - never conflated with a DATA_QUALITY_UNRESOLVED result or a REQUIRES_VERIFICATION evidence finding", () => {
    const err = new SpatialComputationError("a genuine PostGIS execution failure");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SpatialComputationError);
    expect(err.name).toBe("SpatialComputationError");
  });
});
