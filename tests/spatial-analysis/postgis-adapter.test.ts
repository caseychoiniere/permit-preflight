/**
 * Deterministic (no DB) tests for the PostGIS adapter's fail-closed SRID guards. Both
 * `computeSetbackDistances` and `transformPolygonToWgs84` validate the boundary polygon's `srid`
 * BEFORE issuing any database query - testable here without a live PostGIS connection.
 */

import { describe, expect, it } from "vitest";
import { computeDistanceToDwelling, computeParcelAreaSqFt, computeSetbackDistances, transformPolygonToWgs84 } from "../../src/spatial-analysis/postgis-adapter.js";
import { deriveLotLineRoleAssignment, applyMultipleFrontageAnswer } from "../../src/spatial-analysis/lot-line-roles.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../../src/property-intelligence/king-county-parcel-geometry.js";
import { MultipleFrontageAnswer } from "../../src/screening-request/types.js";
import type { Db } from "../../src/db/client.js";
import type { Polygon } from "../../src/spatial-analysis/types.js";

/** Never invoked - both functions under test throw before touching `db` when the SRID guard
 * fails, so a dummy object safely proves the fail-closed behavior without a real connection. */
const neverUsedDb = {} as Db;

/** Maintenance correction (2026-09-15) - footprint construction (ST_Transform of the placement
 * anchor) now runs even when lot-line roles are INSUFFICIENT, so that specific test needs a real
 * (if minimal) `db.execute` stub instead of `neverUsedDb`. The exact returned coordinates don't
 * matter for this test - only that a Polygon is actually constructed. */
const fakeTransformDb = { execute: async () => ({ rows: [{ x: 100, y: 200 }] }) } as unknown as Db;

/** Same fake, additionally shaped for distanceToEdge's ST_Distance query (`distance_ft`) so a
 * single stub can serve both the anchor-transform and the dwelling-distance query in the same
 * test (RC-5, 2026-09-15). */
const fakeTransformAndDistanceDb = { execute: async () => ({ rows: [{ x: 100, y: 200, distance_ft: 25 }] }) } as unknown as Db;

/** A genuinely non-rectangular (6-edge) real-shaped parcel boundary - the exact class of parcel
 * (irregular Seattle lots) whose front/rear roles the existing ParcelPlacementMap.tsx UI cannot
 * resolve (n===4 restriction, out of scope for this correction) and which therefore always
 * reaches computeSetbackDistances with lotLineRoleAssignment.status === "INSUFFICIENT" in
 * practice. */
const nonRectangularBoundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 80, y: 40 },
    { x: 60, y: 100 },
    { x: 0, y: 100 },
    { x: -20, y: 40 },
  ],
};

const authoritativeBoundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }],
};
const assignment = deriveLotLineRoleAssignment(authoritativeBoundary, "edge-0", "edge-2");

describe("PostGIS adapter - fail-closed SRID guard (deterministic, no DB)", () => {
  it("[hard invariant] computeSetbackDistances rejects a boundary polygon with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(
      computeSetbackDistances(neverUsedDb, untagged, { anchor: { lng: -122.3, lat: 47.6 }, orientationDeg: 0 }, { widthFt: 8, depthFt: 10 }, assignment)
    ).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeSetbackDistances rejects a boundary polygon tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 4326 };
    await expect(
      computeSetbackDistances(neverUsedDb, wrongSrid, { anchor: { lng: -122.3, lat: 47.6 }, orientationDeg: 0 }, { widthFt: 8, depthFt: 10 }, assignment)
    ).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] transformPolygonToWgs84 rejects a boundary polygon with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(transformPolygonToWgs84(neverUsedDb, untagged)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] transformPolygonToWgs84 rejects a boundary polygon tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 3857 };
    await expect(transformPolygonToWgs84(neverUsedDb, wrongSrid)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeParcelAreaSqFt (Unit 4) rejects a boundary polygon with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(computeParcelAreaSqFt(neverUsedDb, untagged)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeParcelAreaSqFt (Unit 4) rejects a boundary polygon tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 4326 };
    await expect(computeParcelAreaSqFt(neverUsedDb, wrongSrid)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeDistanceToDwelling (building intelligence v1) rejects a shed footprint with no srid at all", async () => {
    const untagged: Polygon = { units: "FEET", points: authoritativeBoundary.points };
    await expect(computeDistanceToDwelling(neverUsedDb, untagged, authoritativeBoundary)).rejects.toThrow(/srid/i);
  });

  it("[hard invariant] computeDistanceToDwelling (building intelligence v1) rejects a dwelling footprint tagged with the wrong srid", async () => {
    const wrongSrid: Polygon = { ...authoritativeBoundary, srid: 4326 };
    await expect(computeDistanceToDwelling(neverUsedDb, authoritativeBoundary, wrongSrid)).rejects.toThrow(/srid/i);
  });

  it(
    "[maintenance correction, 2026-09-15] INSUFFICIENT lot-line assignment still produces no lot-line distances (BR-U2-9 unchanged) " +
      "but DOES still construct the footprint - footprint construction only needs the placement anchor/dimensions/orientation, " +
      "never front/rear/side role knowledge, so it must not be starved by an unrelated role-resolution gap (dwelling separation " +
      "and existing-structure evidence depend on this footprint, not on lot-line roles)",
    async () => {
      const result = await computeSetbackDistances(
        fakeTransformDb,
        authoritativeBoundary,
        { anchor: { lng: -122.3, lat: 47.6 }, orientationDeg: 0 },
        { widthFt: 8, depthFt: 10 },
        { status: "INSUFFICIENT", method: "USER_INDICATED" }
      );
      expect(result.distances).toEqual({});
      expect(result.footprintProjected).toBeDefined();
      expect(result.footprintProjected!.srid).toBe(AUTHORITATIVE_PARCEL_SRID);
      expect(result.footprintProjected!.points).toHaveLength(4);
    }
  );

  it(
    "[maintenance correction, 2026-09-15, RC-5] a genuinely NON-RECTANGULAR parcel (the real class of Seattle lot whose front/rear roles " +
      "ParcelPlacementMap.tsx cannot resolve) with INSUFFICIENT lot-line roles still produces a usable footprint, and that footprint can be " +
      "used with computeDistanceToDwelling to produce a real dwelling-separation distance - proving the fix holds for the actual real-world " +
      "shape this correction was diagnosed against, not just a simple 4-edge rectangle",
    async () => {
      const result = await computeSetbackDistances(
        fakeTransformAndDistanceDb,
        nonRectangularBoundary,
        { anchor: { lng: -122.35, lat: 47.52 }, orientationDeg: 0 },
        { widthFt: 8, depthFt: 10 },
        { status: "INSUFFICIENT", method: "USER_INDICATED" }
      );
      expect(result.distances).toEqual({}); // still correctly unresolved - BR-U2-9, unchanged
      expect(result.footprintProjected).toBeDefined();

      const dwellingFootprint: Polygon = { units: "FEET", srid: AUTHORITATIVE_PARCEL_SRID, points: [{ x: 200, y: 200 }, { x: 220, y: 200 }, { x: 220, y: 220 }, { x: 200, y: 220 }] };
      const distance = await computeDistanceToDwelling(fakeTransformAndDistanceDb, result.footprintProjected!, dwellingFootprint);
      expect(distance).toBe(25);
    }
  );
});

/** Maintenance correction (2026-09-15, founder direction) - a real 6-edge non-rectangular parcel
 * (matching the actual Fuhrman Ave lot shape verified live this session), used to test the
 * GEOMETRY-vs-REGULATORY-ROLE split: front=edge-0, rear=edge-4, sideEdgeRefs=[edge-1,2,3,5]. */
const sixSidedBoundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 80, y: 40 },
    { x: 60, y: 80 },
    { x: 20, y: 100 },
    { x: -20, y: 40 },
  ],
};

/** Responds to successive `db.execute` calls with the given values in order, ignoring query
 * content - safe here because computeSetbackDistances' own call sequence is fully deterministic
 * for a given input: 1 anchor-transform call, then front, then rear, then each validSideRefs entry
 * in array order via Promise.all (which schedules its executor callbacks synchronously in order
 * before any awaits settle), then - maintenance correction (2026-09-17, founder correction after
 * reviewer escalation 53f30444-b566-4197-b0dd-e2aff768fa65) - one sequential (not Promise.all)
 * `computeStreetFrontageHeuristic` call per confirmed-street edge (a NON-AUTHORITATIVE diagnostic
 * only - it no longer changes distanceToFrontLotLineFt/distanceToRearLotLineFt/
 * distanceToSideLotLineFt), in the order `streetFrontageEdgeRefs` lists them, followed by the rear
 * edge if `rearAlsoFacesStreet`. */
function makeQueueDb(responses: Array<{ x?: number; y?: number; distance_ft?: number; azimuth_front_deg?: number; azimuth_edge_deg?: number; angle_from_parallel_deg?: number }>): Db {
  let i = 0;
  return { execute: async () => ({ rows: [responses[i++]!] }) } as unknown as Db;
}

describe(
  "computeSetbackDistances - confirmed-street-edge role classification (maintenance correction, 2026-09-17, founder correction after " +
    "reviewer escalation 53f30444-b566-4197-b0dd-e2aff768fa65: parcel-edge azimuth is NEVER conclusive evidence of a through lot or " +
    "corner-lot Director determination - EVERY confirmed-street edge stays unresolved, excluded from both the front and ordinary-side " +
    "confident minimums, with azimuth kept only as a non-authoritative diagnostic heuristic)",
  () => {
    const placement = { anchor: { lng: -122.35, lat: 47.52 }, orientationDeg: 0 };
    const dims = { widthFt: 8, depthFt: 10 };
    // sixSidedBoundary via deriveLotLineRoleAssignment(front=edge-0, rear=edge-4): sideEdgeRefs =
    // edge-1, edge-2, edge-3, edge-5.
    const baseDistanceQueue = [{ x: 100, y: 200 }, { distance_ft: 10 }, { distance_ft: 20 }, { distance_ft: 5 }, { distance_ft: 6.8 }, { distance_ft: 8 }, { distance_ft: 15 }];

    it("YES: a confirmed street-frontage edge is excluded from both front and side minimums, KNOWN distance preserved, regardless of the heuristic's angle result", async () => {
      const base = deriveLotLineRoleAssignment(sixSidedBoundary, "edge-0", "edge-4");
      const assignment = applyMultipleFrontageAnswer(base, MultipleFrontageAnswer.YES, ["edge-2"]);
      const db = makeQueueDb([...baseDistanceQueue, { azimuth_front_deg: 90, azimuth_edge_deg: 45, angle_from_parallel_deg: 45 }]);
      const result = await computeSetbackDistances(db, sixSidedBoundary, placement, dims, assignment);
      expect(result.distances.distanceToFrontLotLineFt).toBe(10); // always just the customer's own pick - never blended
      expect(result.distances.distanceToRearLotLineFt).toBe(20);
      expect(result.distances.distanceToSideLotLineFt).toBe(5); // min(5, 8, 15) - edge-2 excluded
      expect(result.distances.sideEdgeDistancesFt).toEqual({ "edge-1": 5, "edge-2": 6.8, "edge-3": 8, "edge-5": 15 });
      expect(result.distances.unresolvedStreetFrontageDistancesFt).toEqual({ "edge-2": 6.8 });
      expect(result.distances.streetFrontageHeuristics).toEqual({
        "edge-2": { frontEdgeRef: "edge-0", edgeRef: "edge-2", azimuthFrontDeg: 90, azimuthEdgeDeg: 45, angleFromParallelDeg: 45, possibleThroughLot: false, evidenceQuality: "INFERRED" },
      });
    });

    it("YES: even when the heuristic angle IS within 15 degrees of parallel, the edge still stays unresolved (never conclusively folded into front)", async () => {
      const base = deriveLotLineRoleAssignment(sixSidedBoundary, "edge-0", "edge-4");
      const assignment = applyMultipleFrontageAnswer(base, MultipleFrontageAnswer.YES, ["edge-2"]);
      const db = makeQueueDb([...baseDistanceQueue, { azimuth_front_deg: 90, azimuth_edge_deg: 92, angle_from_parallel_deg: 2 }]);
      const result = await computeSetbackDistances(db, sixSidedBoundary, placement, dims, assignment);
      expect(result.distances.distanceToFrontLotLineFt).toBe(10); // still just the customer's own pick
      expect(result.distances.distanceToSideLotLineFt).toBe(5); // min(5, 8, 15)
      expect(result.distances.unresolvedStreetFrontageDistancesFt).toEqual({ "edge-2": 6.8 });
      expect(result.distances.streetFrontageHeuristics?.["edge-2"]?.possibleThroughLot).toBe(true); // label only, never authoritative
    });

    it("rearAlsoFacesStreet: the customer's own rear pick stays a KNOWN measurement, but is ALSO recorded as unresolved (keyed by rearEdgeRef) - never folded into front", async () => {
      const base = deriveLotLineRoleAssignment(sixSidedBoundary, "edge-0", "edge-4");
      const assignment = applyMultipleFrontageAnswer(base, MultipleFrontageAnswer.YES, [], true);
      const db = makeQueueDb([...baseDistanceQueue, { azimuth_front_deg: 90, azimuth_edge_deg: 270, angle_from_parallel_deg: 0 }]);
      const result = await computeSetbackDistances(db, sixSidedBoundary, placement, dims, assignment);
      expect(result.distances.distanceToFrontLotLineFt).toBe(10); // unaffected
      expect(result.distances.distanceToRearLotLineFt).toBe(20); // KNOWN, never undefined
      expect(result.distances.unresolvedStreetFrontageDistancesFt).toEqual({ "edge-4": 20 });
      expect(result.distances.distanceToSideLotLineFt).toBe(5); // ordinary sides unaffected - streetFrontageEdgeRefs stayed empty
    });

    it("supports MULTIPLE confirmed street-frontage edges - all stay unresolved regardless of their individual heuristic angle", async () => {
      const base = deriveLotLineRoleAssignment(sixSidedBoundary, "edge-0", "edge-4");
      const assignment = applyMultipleFrontageAnswer(base, MultipleFrontageAnswer.YES, ["edge-1", "edge-5"]);
      const db = makeQueueDb([
        { x: 100, y: 200 },
        { distance_ft: 10 }, // front
        { distance_ft: 20 }, // rear
        { distance_ft: 4 }, // edge-1 (street frontage)
        { distance_ft: 7 }, // edge-2 (ordinary)
        { distance_ft: 9 }, // edge-3 (ordinary)
        { distance_ft: 3 }, // edge-5 (street frontage)
        { azimuth_front_deg: 90, azimuth_edge_deg: 92, angle_from_parallel_deg: 2 }, // edge-1 vs front - heuristically "possible through lot"
        { azimuth_front_deg: 90, azimuth_edge_deg: 20, angle_from_parallel_deg: 70 }, // edge-5 vs front - heuristically not parallel
      ]);
      const result = await computeSetbackDistances(db, sixSidedBoundary, placement, dims, assignment);
      expect(result.distances.sideEdgeDistancesFt).toEqual({ "edge-1": 4, "edge-2": 7, "edge-3": 9, "edge-5": 3 });
      expect(result.distances.distanceToFrontLotLineFt).toBe(10); // never blended with any confirmed edge
      expect(result.distances.distanceToSideLotLineFt).toBe(7); // min(7, 9) - edge-1 and edge-5 both excluded
      expect(result.distances.unresolvedStreetFrontageDistancesFt).toEqual({ "edge-1": 4, "edge-5": 3 });
      expect(result.distances.streetFrontageHeuristics?.["edge-1"]?.possibleThroughLot).toBe(true);
      expect(result.distances.streetFrontageHeuristics?.["edge-5"]?.possibleThroughLot).toBe(false);
    });

    it("NOT_SURE: no confirmed street edges to classify - every side-candidate edge's raw distance counts toward the ordinary minimum (the NOT_SURE-vs-NO uncertainty distinction is applied at the regulatory-rules-engine layer, not here)", async () => {
      const base = deriveLotLineRoleAssignment(sixSidedBoundary, "edge-0", "edge-4");
      const assignment = applyMultipleFrontageAnswer(base, MultipleFrontageAnswer.NOT_SURE);
      const db = makeQueueDb(baseDistanceQueue);
      const result = await computeSetbackDistances(db, sixSidedBoundary, placement, dims, assignment);
      expect(result.distances.distanceToSideLotLineFt).toBe(5);
      expect(result.distances.sideEdgeDistancesFt).toEqual({ "edge-1": 5, "edge-2": 6.8, "edge-3": 8, "edge-5": 15 });
      expect(result.distances.unresolvedStreetFrontageDistancesFt).toBeUndefined();
    });

    it("NO: unchanged - no confirmed street edges to classify, every side-candidate edge counts toward the ordinary minimum", async () => {
      const base = deriveLotLineRoleAssignment(sixSidedBoundary, "edge-0", "edge-4");
      const assignment = applyMultipleFrontageAnswer(base, MultipleFrontageAnswer.NO);
      const db = makeQueueDb(baseDistanceQueue);
      const result = await computeSetbackDistances(db, sixSidedBoundary, placement, dims, assignment);
      expect(result.distances.distanceToSideLotLineFt).toBe(5);
      expect(result.distances.sideEdgeDistancesFt).toEqual({ "edge-1": 5, "edge-2": 6.8, "edge-3": 8, "edge-5": 15 });
    });
  }
);
