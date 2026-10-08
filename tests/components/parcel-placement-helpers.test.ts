/**
 * Deterministic (no DOM/browser) tests for the Placement-step UX pass's pure logic - see
 * app/components/parcel-placement-helpers.ts's own docstring for why these are split out. Covers
 * regression-test items 2, 3 (rear heuristic) and 7 (largest-structure suggestion) and the
 * Next-button completeness gate (item 14/15/16) from the 2026-08-30 UX-pass request. Items that
 * genuinely require rendering/interacting with the map component (drag, click-vs-shed-move,
 * keyboard nudge amount, sticky layout) have no automated coverage in this repo (no
 * @testing-library/jsdom infrastructure exists) - see the corresponding audit.md entry for the
 * disclosed manual-browser verification steps instead.
 */

import { isFootprintInsideParcel } from "../../app/components/parcel-placement-helpers.js";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  detectRearEdge,
  suggestLargestStructure,
  checkPlacementCompleteness,
  resolveBuildingVisualState,
  shedFootprintGeoJson,
  deriveLotLineSelectionForDisplay,
  toPersistedLotLineRoleAssignment,
} from "../../app/components/parcel-placement-helpers.js";
import type { GeographicPoint, Polygon } from "../../src/spatial-analysis/types.js";
import { LotLineRoleStatus } from "../../src/screening-request/types.js";
import { AUTHORITATIVE_PARCEL_SRID } from "../../src/property-intelligence/king-county-parcel-geometry.js";

// A simple rectangle, small enough that the local-meters approximation stays linear/well-behaved,
// large enough to have a clearly non-degenerate front edge. Matches edge-i = points[i]->points[(i+1)%n].
const rectangle: GeographicPoint[] = [
  { lng: -122.3, lat: 47.6 }, // edge-0: (0,0)->(1,0)-ish, the "front" in these tests
  { lng: -122.2999, lat: 47.6 }, // edge-1: right side
  { lng: -122.2999, lat: 47.6002 }, // edge-2: top - the true opposite of edge-0
  { lng: -122.3, lat: 47.6002 }, // edge-3: left side
];

describe("detectRearEdge (deterministic rear-lot-line heuristic)", () => {
  it("[hard invariant, regression item 2] selects the true opposite edge for an ordinary rectangular parcel", () => {
    expect(detectRearEdge(rectangle, "edge-0")).toBe("edge-2");
  });

  it("is symmetric - detecting rear from any of the 4 edges as 'front' picks its true geometric opposite", () => {
    expect(detectRearEdge(rectangle, "edge-1")).toBe("edge-3");
    expect(detectRearEdge(rectangle, "edge-2")).toBe("edge-0");
    expect(detectRearEdge(rectangle, "edge-3")).toBe("edge-1");
  });

  it("[hard invariant, regression item 3] produces a single deterministic candidate for an irregular (5-edge) parcel - never index/order-based", () => {
    // An L-shaped-ish pentagon - front is the bottom edge; the edge most distant AND most parallel
    // to it should win over a merely-closer-but-perpendicular edge.
    const pentagon: GeographicPoint[] = [
      { lng: -122.3, lat: 47.6 }, // edge-0: front, bottom-left to bottom-right
      { lng: -122.2995, lat: 47.6 },
      { lng: -122.2995, lat: 47.6001 }, // edge-1: short right side
      { lng: -122.2998, lat: 47.6003 }, // edge-2: angled edge
      { lng: -122.3003, lat: 47.6002 }, // edge-3: far, roughly-parallel-to-front top edge
      // edge-4 closes back to point 0: left side
    ];
    const result = detectRearEdge(pentagon, "edge-0");
    expect(result).not.toBeNull();
    expect(result).not.toBe("edge-0");
    // Deterministic - calling it again with the same input produces the exact same answer.
    expect(detectRearEdge(pentagon, "edge-0")).toBe(result);
  });

  it("returns null when the front edge ref doesn't exist on this polygon", () => {
    expect(detectRearEdge(rectangle, "edge-99")).toBeNull();
  });

  it("returns null for a degenerate single-edge input", () => {
    expect(detectRearEdge([{ lng: 0, lat: 0 }], "edge-0")).toBeNull();
  });
});

describe("suggestLargestStructure (regression item 7)", () => {
  it("[hard invariant] suggests the largest-area footprint among several, by outlineId", () => {
    const structures = [
      { outlineId: "small", areaSqFt: 100 },
      { outlineId: "biggest", areaSqFt: 5000 },
      { outlineId: "medium", areaSqFt: 900 },
    ];
    expect(suggestLargestStructure(structures)).toBe("biggest");
  });

  it("returns null for zero structures", () => {
    expect(suggestLargestStructure([])).toBeNull();
  });

  it("returns null for exactly one structure - nothing to suggest OVER (the existing single-building Yes/No flow already covers this case)", () => {
    expect(suggestLargestStructure([{ outlineId: "only", areaSqFt: 500 }])).toBeNull();
  });

  it("treats a missing areaSqFt as 0 - never crashes, never wins over a real measured footprint", () => {
    const structures = [
      { outlineId: "no-area" },
      { outlineId: "has-area", areaSqFt: 1 },
    ];
    expect(suggestLargestStructure(structures)).toBe("has-area");
  });
});

describe("checkPlacementCompleteness (regression items 14/15/16, the Next-button gate)", () => {
  const complete = {
    lotLineDecided: true,
    hasPlacement: true,
    hasBuildingsToAskAbout: true,
    dwellingAnswered: true,
    multipleFrontageAnswered: true,
    needsStreetFrontageEdges: false,
  };

  it("[hard invariant, item 14] incomplete when lot lines are undecided", () => {
    const result = checkPlacementCompleteness({ ...complete, lotLineDecided: false });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("Confirm the front and rear lot lines");
  });

  it("[hard invariant, item 14] incomplete when the shed has not been placed", () => {
    const result = checkPlacementCompleteness({ ...complete, hasPlacement: false });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("Place the shed on the map");
    expect(checkPlacementCompleteness({ ...complete, hasPlacement: false, structureNoun: "ADU" }).missing).toContain("Place the ADU on the map");
  });

  it('[hard invariant, item 14] incomplete when buildings exist but the dwelling question was never answered - the "never interacted with" case that caused a real customer to buy a report without confirming the dwelling', () => {
    const result = checkPlacementCompleteness({ ...complete, dwellingAnswered: false });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('Confirm your main house, or choose "I\'m not sure"');
  });

  it("[hard invariant, item 16] complete once the user explicitly confirms a real dwelling", () => {
    expect(checkPlacementCompleteness(complete)).toEqual({ complete: true, missing: [] });
  });

  it('[hard invariant, item 15] complete when the user explicitly chose "I\'m not sure" - dwellingAnswered is true for that case too, same as a real pick', () => {
    // The caller sets dwellingAnswered from `dwellingSelection !== null`, which is true for BOTH
    // {status: "SELECTED", ...} and {status: "UNKNOWN"} - this test documents that contract at the
    // completeness-check level (the SELECTED-vs-UNKNOWN distinction lives in the caller, not here).
    expect(checkPlacementCompleteness({ ...complete, dwellingAnswered: true })).toEqual({ complete: true, missing: [] });
  });

  it("never requires a dwelling answer when there were no buildings to ask about at all", () => {
    const result = checkPlacementCompleteness({ ...complete, hasBuildingsToAskAbout: false, dwellingAnswered: false });
    expect(result.complete).toBe(true);
  });

  it("only lists items actually missing, never satisfied ones", () => {
    const result = checkPlacementCompleteness({
      lotLineDecided: false,
      hasPlacement: true,
      hasBuildingsToAskAbout: true,
      dwellingAnswered: false,
      multipleFrontageAnswered: false,
      needsStreetFrontageEdges: false,
    });
    // multipleFrontageAnswered is only checked once lotLineDecided is true (nothing to answer yet
    // otherwise) - so with lotLineDecided false, only the front/rear item and the dwelling item
    // are missing here.
    expect(result.missing).toEqual(["Confirm the front and rear lot lines", 'Confirm your main house, or choose "I\'m not sure"']);
  });

  it(
    "[maintenance correction, 2026-09-15, founder direction] incomplete when lot lines ARE decided but the multiple-frontage question " +
      "was never answered - no default, Next stays disabled until an explicit answer",
    () => {
      const result = checkPlacementCompleteness({ ...complete, multipleFrontageAnswered: false });
      expect(result.complete).toBe(false);
      expect(result.missing).toContain("Answer whether this property has street frontage on more than one side");
    }
  );

  it("incomplete when the customer answered YES but has not yet selected any street-facing edge", () => {
    const result = checkPlacementCompleteness({ ...complete, needsStreetFrontageEdges: true });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("Select the additional street-facing property line(s)");
  });
});

describe("resolveBuildingVisualState (regression items 6, 7, 8, 9 - 2026-08-30 color-semantics correction)", () => {
  it('[hard invariant, item 6] the largest-building SUGGESTION is never resolved as "confirmed" - only an explicit selection is', () => {
    expect(resolveBuildingVisualState("big-house", null, "big-house")).toBe("suggested");
  });

  it('[hard invariant, item 8] an explicitly SELECTED outlineId resolves to "confirmed"', () => {
    expect(resolveBuildingVisualState("chosen", "chosen", null)).toBe("confirmed");
  });

  it("a footprint that is neither selected nor suggested resolves to \"ordinary\"", () => {
    expect(resolveBuildingVisualState("other", "chosen", "big-house")).toBe("ordinary");
  });

  it('[hard invariant] CONFIRMED always takes precedence over SUGGESTED for the same outlineId - never both, never "suggested" once confirmed', () => {
    // Real callers never actually pass the same outlineId as both selected and suggested at once
    // (suggestedOutlineId is cleared the instant dwellingSelection is set - see
    // suggestLargestStructure's own contract), but this function's own precedence order is the
    // actual guarantee, not an assumption about caller discipline - proven directly here.
    expect(resolveBuildingVisualState("same-id", "same-id", "same-id")).toBe("confirmed");
  });

  it("resolves to \"ordinary\" when nothing is selected or suggested at all", () => {
    expect(resolveBuildingVisualState("any", null, null)).toBe("ordinary");
  });
});

describe("ParcelPlacementMap.tsx source-level regression guards (items 1, 2, 3, 9 - 2026-08-30 interaction pass)", () => {
  // Source-text scan, mirroring this codebase's own existing convention (e.g.
  // tests/rule-research-assistant/research.test.ts's "no import of lifecycle.ts" check) - proves
  // the OLD "Edit lot lines" mode-toggle/"Done" interaction, and the amber suggested-dwelling map
  // color, are genuinely gone from the source, not just absent from a stale mental model of it.
  const source = readFileSync(fileURLToPath(new URL("../../app/components/ParcelPlacementMap.tsx", import.meta.url)), "utf-8");

  it('[hard invariant, items 1/2] no "Edit lot lines" toggle button or "Done" step remains in the Lot lines card', () => {
    // Matches only the actual RENDERED button text (">Edit lot lines<", allowing surrounding
    // whitespace/newlines) - the phrase legitimately still appears in this file's own historical
    // doc comments explaining what was removed and why, which must stay intact, not be scrubbed.
    expect(source).not.toMatch(/>\s*Edit lot lines\s*</);
    expect(source).not.toMatch(/editingLotLines/); // the old state variable itself is gone entirely
  });

  it('[hard invariant, item 9] the suggested-but-unconfirmed building has no distinct map fill/line color (no amber/orange constant for it) - buildingColorExpression only ever produces two colors', () => {
    expect(source).not.toContain("BUILDING_SUGGESTED_COLOR");
    expect(source).not.toContain("#d97706");
  });

  it("[hard invariant] the Lot lines fieldset is not conditionally gated on a decided/undecided state - it always renders (item 3)", () => {
    // The old gate was `{lotLinesDecided && (` immediately before the Lot lines <fieldset>; proves
    // that specific conditional wrapper is gone, not just renamed.
    expect(source).not.toMatch(/lotLinesDecided/);
  });

  it("[hard invariant, real-bug regression 2026-08-30] the shed-footprint MapLibre source is never initialized with a hardcoded-empty literal - it must use shedFootprintGeoJson so a pre-existing placement renders on the very first paint, not only after a later change", () => {
    // The exact bug: `map.addSource("shed-footprint", { type: "geojson", data: { type:
    // "FeatureCollection", features: [] } })` - a literal, unconditional empty FeatureCollection at
    // creation time. Proves that literal is gone from the addSource call specifically (the phrase
    // "FeatureCollection" legitimately still appears elsewhere - e.g. shedFootprintGeoJson's own
    // null-anchor branch, and the parcel-edges/existing-structures sources - so this scopes to the
    // actual addSource("shed-footprint", ...) call site).
    const addSourceCall = source.match(/map\.addSource\("shed-footprint",[^)]*\)/)?.[0];
    expect(addSourceCall).toBeDefined();
    expect(addSourceCall).toContain("shedFootprintGeoJson(");
    expect(addSourceCall).not.toMatch(/data:\s*\{\s*type:\s*"FeatureCollection",\s*features:\s*\[\]\s*\}/);
  });
});

describe("shedFootprintGeoJson (real-bug regression 2026-08-30 - Placement-step rehydration)", () => {
  const anchor: GeographicPoint = { lng: -122.35, lat: 47.6 };

  it('[hard invariant] a null anchor (nothing placed yet) is a real, valid empty FeatureCollection - never an error, never a fabricated footprint', () => {
    expect(shedFootprintGeoJson(null, 8, 10, 0)).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("a real anchor produces a real closed-ring Polygon Feature, centered on that anchor", () => {
    const result = shedFootprintGeoJson(anchor, 8, 10, 0) as GeoJSON.Feature;
    expect(result.type).toBe("Feature");
    expect(result.geometry.type).toBe("Polygon");
    const ring = (result.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(ring.length).toBe(5); // 4 corners + the closing repeat of the first point
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed ring
  });

  it("[hard invariant] is deterministic - the exact same inputs always produce byte-identical output, whether called once at mount (addSource) or again later (the sync effect) - the two call sites can never silently diverge", () => {
    const first = shedFootprintGeoJson(anchor, 8, 10, 45);
    const second = shedFootprintGeoJson(anchor, 8, 10, 45);
    expect(first).toEqual(second);
  });

  it("reflects a changed orientation - proves rotation is genuinely part of the computed geometry, not dropped", () => {
    const unrotated = shedFootprintGeoJson(anchor, 8, 10, 0);
    const rotated = shedFootprintGeoJson(anchor, 8, 10, 90);
    expect(rotated).not.toEqual(unrotated);
  });
});

// Maintenance correction (2026-09-15, reviewer decision 9947a0ef-ed89-43f2-9fcc-e2a487cbdc49, RC-3)
// - covers the actual regression: a real customer front/rear selection that
// deriveLotLineRoleAssignment (lot-line-roles.ts, already tested in
// tests/spatial-analysis/lot-line-roles.test.ts) resolves to INSUFFICIENT must still be visible on
// the Review step, but must NEVER be submitted to the server for that status (BR-U2-9's persisted
// contract, LotLineRoleAssignmentSchema, only permits frontEdgeRef/rearEdgeRef/sideEdgeRefs when
// ASSIGNED).
const rectangleBoundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }],
};
const pentagonBoundary: Polygon = {
  units: "FEET",
  srid: AUTHORITATIVE_PARCEL_SRID,
  points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 80, y: 40 }, { x: 30, y: 80 }, { x: -20, y: 40 }],
};

describe("deriveLotLineSelectionForDisplay (maintenance correction 2026-09-15 - the defect: a real user selection silently vanished on Review)", () => {
  it("[hard invariant] a valid opposite-edge pick on a rectangle produces ASSIGNED with sideEdgeRefs, matching deriveLotLineRoleAssignment's own result", () => {
    const result = deriveLotLineSelectionForDisplay(rectangleBoundary, "edge-0", "edge-2");
    expect(result).toEqual({ status: LotLineRoleStatus.ASSIGNED, frontEdgeRef: "edge-0", rearEdgeRef: "edge-2", sideEdgeRefs: ["edge-1", "edge-3"] });
  });

  it(
    "[founder-directed widening, 2026-09-15] a non-quadrilateral parcel's valid (non-adjacent) front/rear pick now ASSIGNS - " +
      "side setback is a shape-agnostic minimum-distance computation, never a rectangle-only operation - so the Review step " +
      "shows a real ASSIGNED result with every remaining edge as a side edge, not a fallback message",
    () => {
      const result = deriveLotLineSelectionForDisplay(pentagonBoundary, "edge-0", "edge-2");
      expect(result.status).toBe(LotLineRoleStatus.ASSIGNED);
      expect(result.frontEdgeRef).toBe("edge-0");
      expect(result.rearEdgeRef).toBe("edge-2");
      expect((result.sideEdgeRefs ?? []).sort()).toEqual(["edge-1", "edge-3", "edge-4"]);
    }
  );

  it("[the actual reported defect, now only reachable via an adjacent pick] a non-quadrilateral parcel's ADJACENT front/rear pick is still INSUFFICIENT (front/rear can never touch) but RETAINS the user's raw picks for Review display", () => {
    const result = deriveLotLineSelectionForDisplay(pentagonBoundary, "edge-0", "edge-1");
    expect(result.status).toBe(LotLineRoleStatus.INSUFFICIENT);
    expect(result.frontEdgeRef).toBe("edge-0");
    expect(result.rearEdgeRef).toBe("edge-1");
    expect(result.sideEdgeRefs).toBeUndefined();
  });

  it("[cause-neutral case] an adjacent pick on an ORDINARY rectangle is ALSO INSUFFICIENT with picks retained - proves the defect fix is not limited to non-quadrilateral parcels", () => {
    const result = deriveLotLineSelectionForDisplay(rectangleBoundary, "edge-0", "edge-1");
    expect(result.status).toBe(LotLineRoleStatus.INSUFFICIENT);
    expect(result.frontEdgeRef).toBe("edge-0");
    expect(result.rearEdgeRef).toBe("edge-1");
  });
});

describe("toPersistedLotLineRoleAssignment (maintenance correction 2026-09-15 - the persisted-contract boundary)", () => {
  it("[hard invariant] strips frontEdgeRef/rearEdgeRef from an INSUFFICIENT selection before it would reach the server - the persisted schema forbids them for this status", () => {
    const displayOnly = { status: LotLineRoleStatus.INSUFFICIENT, frontEdgeRef: "edge-0", rearEdgeRef: "edge-2" };
    expect(toPersistedLotLineRoleAssignment(displayOnly)).toEqual({ status: LotLineRoleStatus.INSUFFICIENT });
  });

  it("passes an ASSIGNED selection through unchanged, including sideEdgeRefs", () => {
    const assigned = { status: LotLineRoleStatus.ASSIGNED, frontEdgeRef: "edge-0", rearEdgeRef: "edge-2", sideEdgeRefs: ["edge-1", "edge-3"] };
    expect(toPersistedLotLineRoleAssignment(assigned)).toEqual(assigned);
  });

  it("round-trips deriveLotLineSelectionForDisplay's own ASSIGNED output (non-quadrilateral parcel) through unchanged", () => {
    const displayResult = deriveLotLineSelectionForDisplay(pentagonBoundary, "edge-0", "edge-2");
    expect(toPersistedLotLineRoleAssignment(displayResult)).toEqual(displayResult);
  });

  it("round-trips deriveLotLineSelectionForDisplay's own INSUFFICIENT output (adjacent pick) back down to the bare persisted shape", () => {
    const displayResult = deriveLotLineSelectionForDisplay(pentagonBoundary, "edge-0", "edge-1");
    expect(toPersistedLotLineRoleAssignment(displayResult)).toEqual({ status: LotLineRoleStatus.INSUFFICIENT });
  });
});

describe("isFootprintInsideParcel (a footprint reaching over a lot line is a mis-placement)", () => {
  // A ~120 x 50 ft rectangle near Seattle (WGS84): 120 ft ~ 0.000468 deg lng, 50 ft ~ 0.000137 deg lat.
  const o = { lng: -122.3116, lat: 47.5861 };
  const boundary = [
    { lng: o.lng, lat: o.lat },
    { lng: o.lng + 0.000468, lat: o.lat },
    { lng: o.lng + 0.000468, lat: o.lat + 0.000137 },
    { lng: o.lng, lat: o.lat + 0.000137 },
  ];
  const center = { lng: o.lng + 0.000234, lat: o.lat + 0.0000685 };

  it("a small footprint at the center is inside", () => {
    expect(isFootprintInsideParcel(center, 16, 20, 0, boundary)).toBe(true);
    expect(isFootprintInsideParcel(center, 16, 20, 45, boundary)).toBe(true);
  });
  it("a footprint over the rear lot line, in the street, or entirely off the parcel is not", () => {
    expect(isFootprintInsideParcel({ lng: o.lng + 0.000468 - 0.00001, lat: center.lat }, 16, 20, 0, boundary)).toBe(false); // ~3 ft from the east edge, 16 ft wide
    expect(isFootprintInsideParcel({ lng: o.lng - 0.0002, lat: center.lat }, 16, 20, 0, boundary)).toBe(false);
    expect(isFootprintInsideParcel({ lng: o.lng + 1, lat: o.lat + 1 }, 16, 20, 0, boundary)).toBe(false);
  });
  it("a footprint too big for the lot is not inside, and a degenerate boundary is never 'inside'", () => {
    expect(isFootprintInsideParcel(center, 200, 20, 0, boundary)).toBe(false);
    expect(isFootprintInsideParcel(center, 16, 20, 0, [])).toBe(false);
  });
  it("a concave (L-shaped) lot: a footprint spanning the notch is not inside", () => {
    const l = [
      { lng: o.lng, lat: o.lat },
      { lng: o.lng + 0.000468, lat: o.lat },
      { lng: o.lng + 0.000468, lat: o.lat + 0.00005 },
      { lng: o.lng + 0.00015, lat: o.lat + 0.00005 },
      { lng: o.lng + 0.00015, lat: o.lat + 0.000137 },
      { lng: o.lng, lat: o.lat + 0.000137 },
    ];
    expect(isFootprintInsideParcel({ lng: o.lng + 0.0003, lat: o.lat + 0.000025 }, 16, 12, 0, l)).toBe(true);
    expect(isFootprintInsideParcel({ lng: o.lng + 0.0003, lat: o.lat + 0.00007 }, 16, 12, 0, l)).toBe(false); // in the notch
  });
});
