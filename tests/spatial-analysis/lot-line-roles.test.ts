import { describe, expect, it } from "vitest";
import { deriveLotLineRoleAssignment, validateLotLineRoleAssignment, edgeRefsForPolygon } from "../../src/spatial-analysis/lot-line-roles.js";
import { rectangle } from "../../src/spatial-analysis/geometry.js";
import type { Polygon } from "../../src/spatial-analysis/types.js";

const simpleLot = rectangle(0, 0, 50, 100); // edge-0: bottom(front), edge-1: right(side), edge-2: top(rear), edge-3: left(side)

describe("Lot-Line Role Assignment (BR-U2-9)", () => {
  it("edgeRefsForPolygon returns one ref per polygon edge, in order", () => {
    expect(edgeRefsForPolygon(simpleLot)).toEqual(["edge-0", "edge-1", "edge-2", "edge-3"]);
  });

  it("assigns ASSIGNED for a simple quadrilateral with opposite front/rear edges", () => {
    const result = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-2", "test-user");
    expect(result.status).toBe("ASSIGNED");
    if (result.status !== "ASSIGNED") return;
    expect(result.frontEdgeRef).toBe("edge-0");
    expect(result.rearEdgeRef).toBe("edge-2");
    expect((result.sideEdgeRefs ?? []).sort()).toEqual(["edge-1", "edge-3"]);
    expect(result.method).toBe("USER_INDICATED");
    expect(result.indicatedBy).toBe("test-user");
  });

  it("[hard invariant] fails closed to INSUFFICIENT when front/rear edges are adjacent, not opposite", () => {
    const result = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-1", "test-user");
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("[hard invariant] fails closed to INSUFFICIENT for a non-quadrilateral parcel (e.g. a corner lot / 5-sided shape)", () => {
    const fiveSided: Polygon = {
      units: "FEET",
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 60 },
        { x: 25, y: 100 },
        { x: 0, y: 60 },
      ],
    };
    const result = deriveLotLineRoleAssignment(fiveSided, "edge-0", "edge-2", "test-user");
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("[hard invariant] fails closed when front and rear are the same edge", () => {
    const result = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-0", "test-user");
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("never guesses roles without an explicit front/rear indication - the function requires both refs as arguments", () => {
    // Structural check: deriveLotLineRoleAssignment has no zero-argument or polygon-only overload.
    expect(deriveLotLineRoleAssignment.length).toBeGreaterThanOrEqual(3);
  });

  it("validateLotLineRoleAssignment accepts a valid ASSIGNED result", () => {
    const assignment = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-2");
    const validation = validateLotLineRoleAssignment(assignment, simpleLot);
    expect(validation.valid).toBe(true);
  });

  it("[hard invariant] validateLotLineRoleAssignment rejects an edge reference that does not belong to the polygon", () => {
    const validation = validateLotLineRoleAssignment(
      { status: "ASSIGNED", frontEdgeRef: "edge-0", rearEdgeRef: "edge-99", sideEdgeRefs: ["edge-1", "edge-3"], method: "USER_INDICATED" },
      simpleLot
    );
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((i) => i.includes("edge-99"))).toBe(true);
  });

  it("INSUFFICIENT assignments always validate as valid (nothing to check)", () => {
    const validation = validateLotLineRoleAssignment({ status: "INSUFFICIENT", method: "USER_INDICATED" }, simpleLot);
    expect(validation.valid).toBe(true);
  });
});
