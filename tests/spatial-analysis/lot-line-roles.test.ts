import { describe, expect, it } from "vitest";
import { deriveLotLineRoleAssignment, validateLotLineRoleAssignment, applyMultipleFrontageAnswer, edgeRefsForPolygon } from "../../src/spatial-analysis/lot-line-roles.js";
import { rectangle } from "../../src/spatial-analysis/geometry.js";
import { MultipleFrontageAnswer } from "../../src/screening-request/types.js";
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

  it(
    "[maintenance correction, 2026-09-15, founder direction] a non-quadrilateral parcel (5-sided) with a valid, " +
      "non-adjacent front/rear pick now ASSIGNS - side setback is a shape-agnostic minimum-distance computation " +
      "(computeSetbackDistances' own Math.min over every remaining edge), never a rectangle-only operation. " +
      "Every edge that isn't front or rear becomes a side edge, regardless of count.",
    () => {
      const result = deriveLotLineRoleAssignment(fiveSided, "edge-0", "edge-2", "test-user");
      expect(result.status).toBe("ASSIGNED");
      if (result.status !== "ASSIGNED") return;
      expect(result.frontEdgeRef).toBe("edge-0");
      expect(result.rearEdgeRef).toBe("edge-2");
      expect((result.sideEdgeRefs ?? []).sort()).toEqual(["edge-1", "edge-3", "edge-4"]);
    }
  );

  it("[hard invariant, unchanged] still fails closed to INSUFFICIENT when front/rear are ADJACENT on a non-quadrilateral parcel - a lot's front and rear can never touch, regardless of edge count", () => {
    const result = deriveLotLineRoleAssignment(fiveSided, "edge-0", "edge-1", "test-user");
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("[hard invariant] fails closed when front and rear are the same edge", () => {
    const result = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-0", "test-user");
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("[hard invariant, reviewer-caught, decision bf8aadcd-00b6-4f49-8ed3-598d0ca9c2c4] fails closed when an edge ref is out of range for the polygon - never lets a nonexistent edge reach ASSIGNED via numeric coincidence with the adjacency check", () => {
    expect(deriveLotLineRoleAssignment(simpleLot, "edge-99", "edge-1", "test-user").status).toBe("INSUFFICIENT");
    expect(deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-99", "test-user").status).toBe("INSUFFICIENT");
    // On a 4-edge polygon, edge-6 and edge-2 are numerically "adjacent" mod 4 ((6+1)%4===3, not
    // 2 - not actually a coincidental match here, but the case matters regardless: edge-6 doesn't
    // exist on this polygon at all, so this must fail closed purely on the range check, independent
    // of whatever the adjacency arithmetic happens to compute.
    expect(deriveLotLineRoleAssignment(simpleLot, "edge-6", "edge-2", "test-user").status).toBe("INSUFFICIENT");
  });

  it("never guesses roles without an explicit front/rear indication - the function requires both refs as arguments", () => {
    // Structural check: deriveLotLineRoleAssignment has no zero-argument or polygon-only overload.
    expect(deriveLotLineRoleAssignment.length).toBeGreaterThanOrEqual(3);
  });

  it("[hard invariant, maintenance correction 2026-09-15] validateLotLineRoleAssignment rejects an ASSIGNED result missing multipleFrontageAnswer - deriveLotLineRoleAssignment's raw output alone is not yet a complete, submittable assignment", () => {
    const assignment = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-2");
    const validation = validateLotLineRoleAssignment(assignment, simpleLot);
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((i) => i.includes("multipleFrontageAnswer"))).toBe(true);
  });

  it("validateLotLineRoleAssignment accepts a valid ASSIGNED result once multipleFrontageAnswer is applied", () => {
    const assignment = applyMultipleFrontageAnswer(deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-2"), MultipleFrontageAnswer.NO);
    const validation = validateLotLineRoleAssignment(assignment, simpleLot);
    expect(validation.valid).toBe(true);
  });

  it("[hard invariant] validateLotLineRoleAssignment rejects an edge reference that does not belong to the polygon", () => {
    const validation = validateLotLineRoleAssignment(
      {
        status: "ASSIGNED",
        frontEdgeRef: "edge-0",
        rearEdgeRef: "edge-99",
        sideEdgeRefs: ["edge-1", "edge-3"],
        multipleFrontageAnswer: MultipleFrontageAnswer.NO,
        method: "USER_INDICATED",
      },
      simpleLot
    );
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((i) => i.includes("edge-99"))).toBe(true);
  });

  it("INSUFFICIENT assignments always validate as valid (nothing to check)", () => {
    const validation = validateLotLineRoleAssignment({ status: "INSUFFICIENT", method: "USER_INDICATED" }, simpleLot);
    expect(validation.valid).toBe(true);
  });

  it("[hard invariant, maintenance correction 2026-09-17] validateLotLineRoleAssignment rejects rearAlsoFacesStreet=true when multipleFrontageAnswer is not YES", () => {
    const validation = validateLotLineRoleAssignment(
      {
        status: "ASSIGNED",
        frontEdgeRef: "edge-0",
        rearEdgeRef: "edge-2",
        sideEdgeRefs: ["edge-1", "edge-3"],
        multipleFrontageAnswer: MultipleFrontageAnswer.NO,
        rearAlsoFacesStreet: true,
        method: "USER_INDICATED",
      },
      simpleLot
    );
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((i) => i.includes("rearAlsoFacesStreet"))).toBe(true);
  });

  it("validateLotLineRoleAssignment accepts rearAlsoFacesStreet=true when multipleFrontageAnswer is YES", () => {
    const validation = validateLotLineRoleAssignment(
      {
        status: "ASSIGNED",
        frontEdgeRef: "edge-0",
        rearEdgeRef: "edge-2",
        sideEdgeRefs: ["edge-1", "edge-3"],
        multipleFrontageAnswer: MultipleFrontageAnswer.YES,
        streetFrontageEdgeRefs: ["edge-1"],
        rearAlsoFacesStreet: true,
        method: "USER_INDICATED",
      },
      simpleLot
    );
    expect(validation.valid).toBe(true);
  });

  it(
    "[the actual through-lot scenario this correction exists for] validateLotLineRoleAssignment accepts multipleFrontageAnswer=YES " +
      "with rearAlsoFacesStreet=true and NO streetFrontageEdgeRefs at all",
    () => {
      const validation = validateLotLineRoleAssignment(
        {
          status: "ASSIGNED",
          frontEdgeRef: "edge-0",
          rearEdgeRef: "edge-2",
          sideEdgeRefs: ["edge-1", "edge-3"],
          multipleFrontageAnswer: MultipleFrontageAnswer.YES,
          rearAlsoFacesStreet: true,
          method: "USER_INDICATED",
        },
        simpleLot
      );
      expect(validation.valid).toBe(true);
    }
  );

  it("[hard invariant] validateLotLineRoleAssignment rejects multipleFrontageAnswer=YES with neither streetFrontageEdgeRefs nor rearAlsoFacesStreet set", () => {
    const validation = validateLotLineRoleAssignment(
      {
        status: "ASSIGNED",
        frontEdgeRef: "edge-0",
        rearEdgeRef: "edge-2",
        sideEdgeRefs: ["edge-1", "edge-3"],
        multipleFrontageAnswer: MultipleFrontageAnswer.YES,
        method: "USER_INDICATED",
      },
      simpleLot
    );
    expect(validation.valid).toBe(false);
  });
});

describe("applyMultipleFrontageAnswer (maintenance correction, 2026-09-15, founder direction - separates geometric side candidates from regulatory ORDINARY_SIDE/street-frontage classification)", () => {
  const assigned = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-2"); // sideEdgeRefs: edge-1, edge-3

  it("is a no-op for an INSUFFICIENT assignment - nothing to classify without resolved front/rear", () => {
    const insufficient = deriveLotLineRoleAssignment(simpleLot, "edge-0", "edge-1");
    expect(insufficient.status).toBe("INSUFFICIENT");
    const result = applyMultipleFrontageAnswer(insufficient, MultipleFrontageAnswer.YES, ["edge-3"]);
    expect(result).toEqual(insufficient);
  });

  it("NO sets multipleFrontageAnswer and an empty streetFrontageEdgeRefs, leaving sideEdgeRefs untouched", () => {
    const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.NO);
    expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.NO);
    expect(result.streetFrontageEdgeRefs).toEqual([]);
    expect((result.sideEdgeRefs ?? []).sort()).toEqual(["edge-1", "edge-3"]);
  });

  it("NOT_SURE also sets an empty streetFrontageEdgeRefs - the ordinary/street-frontage split itself stays unresolved, not guessed", () => {
    const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.NOT_SURE);
    expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.NOT_SURE);
    expect(result.streetFrontageEdgeRefs).toEqual([]);
  });

  it("[the founder's core example] YES with one valid edge records it as street frontage, preserving sideEdgeRefs (geometry) unchanged - a classification decision never destroys the geometric candidate set", () => {
    const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.YES, ["edge-1"]);
    expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.YES);
    expect(result.streetFrontageEdgeRefs).toEqual(["edge-1"]);
    expect((result.sideEdgeRefs ?? []).sort()).toEqual(["edge-1", "edge-3"]);
  });

  it("YES supports MULTIPLE street-frontage edges - never hard-coded to exactly one", () => {
    const threeSided = deriveLotLineRoleAssignment(
      { units: "FEET", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 60, y: 40 }, { x: 50, y: 80 }, { x: 0, y: 80 }, { x: -10, y: 40 }] },
      "edge-0",
      "edge-3"
    );
    expect(threeSided.status).toBe("ASSIGNED");
    const result = applyMultipleFrontageAnswer(threeSided, MultipleFrontageAnswer.YES, ["edge-1", "edge-2"]);
    expect((result.streetFrontageEdgeRefs ?? []).sort()).toEqual(["edge-1", "edge-2"]);
  });

  it(
    "[real UX bug found and fixed during this correction's own browser verification] YES with zero edges stays YES (not reclassified as NOT_SURE) - " +
      "this is the ordinary real-time state while the customer has answered YES but hasn't picked an edge yet; completeness is enforced separately " +
      "by checkPlacementCompleteness, not by silently rewriting the answer they gave",
    () => {
      const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.YES, []);
      expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.YES);
      expect(result.streetFrontageEdgeRefs).toEqual([]);
    }
  );

  it("[hard invariant] YES with an edge that is actually front/rear (not a side candidate) fails the WHOLE answer closed to NOT_SURE - never silently drops just the bad ref", () => {
    const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.YES, ["edge-0"]); // edge-0 is the front, not a side candidate
    expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.NOT_SURE);
    expect(result.streetFrontageEdgeRefs).toEqual([]);
  });

  it("[hard invariant] YES with a foreign/nonexistent edge ref also fails closed to NOT_SURE", () => {
    const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.YES, ["edge-99"]);
    expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.NOT_SURE);
    expect(result.streetFrontageEdgeRefs).toEqual([]);
  });

  describe("rearAlsoFacesStreet (maintenance correction, 2026-09-17, founder-directed through-lot fix)", () => {
    it("YES threads rearAlsoFacesStreet through unchanged, alongside streetFrontageEdgeRefs", () => {
      const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.YES, ["edge-1"], true);
      expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.YES);
      expect(result.streetFrontageEdgeRefs).toEqual(["edge-1"]);
      expect(result.rearAlsoFacesStreet).toBe(true);
    });

    it("YES with zero street-frontage edges still threads rearAlsoFacesStreet through (the real UX in-progress state applies independently of the side-edge picker)", () => {
      const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.YES, [], true);
      expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.YES);
      expect(result.streetFrontageEdgeRefs).toEqual([]);
      expect(result.rearAlsoFacesStreet).toBe(true);
    });

    it("NO forces rearAlsoFacesStreet to false, even if true was passed - never left dangling from a prior YES", () => {
      const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.NO, [], true);
      expect(result.rearAlsoFacesStreet).toBe(false);
    });

    it("NOT_SURE forces rearAlsoFacesStreet to false", () => {
      const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.NOT_SURE, [], true);
      expect(result.rearAlsoFacesStreet).toBe(false);
    });

    it("[hard invariant] YES with an invalid streetFrontageEdgeRefs entry fails closed to NOT_SURE and clears rearAlsoFacesStreet too", () => {
      const result = applyMultipleFrontageAnswer(assigned, MultipleFrontageAnswer.YES, ["edge-99"], true);
      expect(result.multipleFrontageAnswer).toBe(MultipleFrontageAnswer.NOT_SURE);
      expect(result.rearAlsoFacesStreet).toBe(false);
    });
  });
});
