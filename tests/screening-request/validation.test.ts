import { describe, expect, it } from "vitest";
import { ShedProjectConfigurationSchema } from "../../src/screening-request/types.js";
import { validateAtBoundary } from "../../src/shared/validation.js";

// Real-ish Seattle coordinates - lng magnitude (~122) safely exceeds the valid latitude range
// (max 90), which is exactly what makes the lng/lat-swap test below meaningful.
const validConfig = {
  widthFt: 8,
  depthFt: 10,
  heightFt: 8,
  alleyAdjacent: false,
  proposedPlacement: { anchor: { lng: -122.3301, lat: 47.6038 }, orientationDeg: 0 },
  lotLineRoleAssignment: {
    status: "ASSIGNED" as const,
    frontEdgeRef: "edge-0",
    rearEdgeRef: "edge-2",
    sideEdgeRefs: ["edge-1", "edge-3"],
    multipleFrontageAnswer: "NO" as const,
    method: "USER_INDICATED" as const,
  },
  distanceInputMode: "MAP_PLACEMENT" as const,
};

describe("ShedProjectConfiguration boundary validation (PC-2, NFR-U2-4)", () => {
  it("accepts a well-formed configuration", () => {
    const result = validateAtBoundary(ShedProjectConfigurationSchema, validConfig);
    expect(result.outcome).toBe("VALID");
  });

  it("[hard invariant] rejects negative dimensions", () => {
    const result = validateAtBoundary(ShedProjectConfigurationSchema, { ...validConfig, widthFt: -5 });
    expect(result.outcome).toBe("INVALID");
  });

  it("[hard invariant] rejects an out-of-range height (e.g. an absurd 5000ft shed)", () => {
    const result = validateAtBoundary(ShedProjectConfigurationSchema, { ...validConfig, heightFt: 5000 });
    expect(result.outcome).toBe("INVALID");
  });

  it("accepts an INSUFFICIENT lotLineRoleAssignment (the honest fail-closed case, not itself invalid)", () => {
    const result = validateAtBoundary(ShedProjectConfigurationSchema, {
      ...validConfig,
      lotLineRoleAssignment: { status: "INSUFFICIENT", method: "USER_INDICATED" },
    });
    expect(result.outcome).toBe("VALID");
  });

  it("[hard invariant] rejects an ASSIGNED lotLineRoleAssignment missing its required edge refs", () => {
    const result = validateAtBoundary(ShedProjectConfigurationSchema, {
      ...validConfig,
      lotLineRoleAssignment: { status: "ASSIGNED", method: "USER_INDICATED" },
    });
    expect(result.outcome).toBe("INVALID");
  });

  describe("multipleFrontageAnswer / streetFrontageEdgeRefs (maintenance correction, 2026-09-15, founder direction)", () => {
    it("[hard invariant] rejects an ASSIGNED lotLineRoleAssignment missing multipleFrontageAnswer - never a silent default", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, {
        ...validConfig,
        lotLineRoleAssignment: {
          status: "ASSIGNED",
          frontEdgeRef: "edge-0",
          rearEdgeRef: "edge-2",
          sideEdgeRefs: ["edge-1", "edge-3"],
          method: "USER_INDICATED",
        },
      });
      expect(result.outcome).toBe("INVALID");
    });

    it("accepts multipleFrontageAnswer=NOT_SURE with no streetFrontageEdgeRefs", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, {
        ...validConfig,
        lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "NOT_SURE" },
      });
      expect(result.outcome).toBe("VALID");
    });

    it("accepts multipleFrontageAnswer=YES with one or more streetFrontageEdgeRefs", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, {
        ...validConfig,
        lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: ["edge-1", "edge-3"] },
      });
      expect(result.outcome).toBe("VALID");
    });

    it("[hard invariant] rejects multipleFrontageAnswer=YES with an empty streetFrontageEdgeRefs", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, {
        ...validConfig,
        lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: [] },
      });
      expect(result.outcome).toBe("INVALID");
    });

    it("[hard invariant] rejects a non-empty streetFrontageEdgeRefs when multipleFrontageAnswer is not YES", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, {
        ...validConfig,
        lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "NO", streetFrontageEdgeRefs: ["edge-1"] },
      });
      expect(result.outcome).toBe("INVALID");
    });

    it(
      "[hard invariant, reviewer-caught, decision 266339d9-3f11-44c0-b90d-314e9208654a] rejects a streetFrontageEdgeRefs entry that is not " +
        "a member of sideEdgeRefs - e.g. the front edge itself, or a ref invented independently of the declared side-candidate set",
      () => {
        const frontAsFrontage = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: ["edge-0"] }, // edge-0 is frontEdgeRef, not a side candidate
        });
        expect(frontAsFrontage.outcome).toBe("INVALID");

        const foreignRef = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: ["edge-99"] }, // not in sideEdgeRefs at all
        });
        expect(foreignRef.outcome).toBe("INVALID");
      }
    );

    it(
      "[hard invariant, reviewer-caught, decision 8475f281-b781-428c-bb2a-9ca9303f5f3a] rejects duplicate entries in sideEdgeRefs or " +
        "streetFrontageEdgeRefs - a duplicate is never a legitimate distinct indication and could otherwise defeat a downstream length-based check",
      () => {
        const duplicateSideEdge = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, sideEdgeRefs: ["edge-1", "edge-3", "edge-1"], multipleFrontageAnswer: "NO" },
        });
        expect(duplicateSideEdge.outcome).toBe("INVALID");

        const duplicateFrontageEdge = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: ["edge-1", "edge-1"] },
        });
        expect(duplicateFrontageEdge.outcome).toBe("INVALID");
      }
    );

    describe("rearAlsoFacesStreet (maintenance correction, 2026-09-17, founder-directed through-lot fix)", () => {
      it("accepts multipleFrontageAnswer=YES with rearAlsoFacesStreet=true AND a non-empty streetFrontageEdgeRefs together", () => {
        const result = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: ["edge-1"], rearAlsoFacesStreet: true },
        });
        expect(result.outcome).toBe("VALID");
      });

      it(
        "[the actual through-lot scenario this correction exists for] accepts multipleFrontageAnswer=YES with rearAlsoFacesStreet=true " +
          "and NO streetFrontageEdgeRefs at all - the customer's own rear pick is the second street, and the multi-select side picker " +
          "structurally cannot capture that (it excludes front/rear)",
        () => {
          const result = validateAtBoundary(ShedProjectConfigurationSchema, {
            ...validConfig,
            lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: [], rearAlsoFacesStreet: true },
          });
          expect(result.outcome).toBe("VALID");
        }
      );

      it("[hard invariant] rejects multipleFrontageAnswer=YES with BOTH an empty streetFrontageEdgeRefs AND rearAlsoFacesStreet false/omitted - neither signal confirms any edge", () => {
        const result = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "YES", streetFrontageEdgeRefs: [] },
        });
        expect(result.outcome).toBe("INVALID");
      });

      it("[hard invariant] rejects rearAlsoFacesStreet=true when multipleFrontageAnswer is not YES", () => {
        const result = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "NO", rearAlsoFacesStreet: true },
        });
        expect(result.outcome).toBe("INVALID");
      });

      it("accepts rearAlsoFacesStreet=false (or omitted) regardless of multipleFrontageAnswer", () => {
        const result = validateAtBoundary(ShedProjectConfigurationSchema, {
          ...validConfig,
          lotLineRoleAssignment: { ...validConfig.lotLineRoleAssignment, multipleFrontageAnswer: "NO", rearAlsoFacesStreet: false },
        });
        expect(result.outcome).toBe("VALID");
      });
    });
  });

  describe("proposedPlacement (CRS contract, Code Generation correction 2026-08-23)", () => {
    it("accepts a valid WGS84 anchor", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, validConfig);
      expect(result.outcome).toBe("VALID");
    });

    it("[hard invariant] rejects non-finite anchor coordinates", () => {
      const malformed = { ...validConfig, proposedPlacement: { anchor: { lng: Infinity, lat: 47.6 }, orientationDeg: 0 } };
      const result = validateAtBoundary(ShedProjectConfigurationSchema, malformed);
      expect(result.outcome).toBe("INVALID");
    });

    it("[hard invariant] rejects an out-of-range longitude (e.g. 200 degrees)", () => {
      const malformed = { ...validConfig, proposedPlacement: { anchor: { lng: 200, lat: 47.6 }, orientationDeg: 0 } };
      const result = validateAtBoundary(ShedProjectConfigurationSchema, malformed);
      expect(result.outcome).toBe("INVALID");
    });

    it("[hard invariant] a swapped lng/lat pair for a real Seattle-area location is rejected (lat=-122.33 is out of the valid latitude range)", () => {
      const swapped = { ...validConfig, proposedPlacement: { anchor: { lng: 47.6038, lat: -122.3301 }, orientationDeg: 0 } };
      const result = validateAtBoundary(ShedProjectConfigurationSchema, swapped);
      expect(result.outcome).toBe("INVALID");
    });

    it("[hard invariant] there is no field anywhere in this schema for a client-computed setback distance - the schema structurally cannot accept one", () => {
      const shape = ShedProjectConfigurationSchema.shape;
      const fieldNames = Object.keys(shape);
      expect(fieldNames.some((f) => /distance.*Ft$/i.test(f) || /setback/i.test(f))).toBe(false);
    });

    it("rejects a missing orientationDeg on an otherwise-valid placement", () => {
      const malformed = { ...validConfig, proposedPlacement: { anchor: { lng: -122.33, lat: 47.6 } } };
      const result = validateAtBoundary(ShedProjectConfigurationSchema, malformed);
      expect(result.outcome).toBe("INVALID");
    });
  });

  describe("Unit 6B Capability B intake fields (foundationType/attachment/intendedUse/roofOverhang/structuralSpanInfo/utilityIntent)", () => {
    it("accepts every field populated - all optional fields round-trip through validation unchanged", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, {
        ...validConfig,
        foundationType: "PILES",
        attachment: "ATTACHED",
        intendedUse: "GREENHOUSE_PLANTS",
        roofOverhang: { extendsBeyondWalls: true, approxOverhangIn: 6 },
        structuralSpanInfo: { structuralSpanFt: 12, usesManufacturedTruss: true },
        utilityIntent: { electrical: true, plumbing: false, mechanical: true },
      });
      expect(result.outcome).toBe("VALID");
      if (result.outcome === "VALID") {
        expect(result.data.foundationType).toBe("PILES");
        expect(result.data.attachment).toBe("ATTACHED");
        expect(result.data.intendedUse).toBe("GREENHOUSE_PLANTS");
        expect(result.data.roofOverhang).toEqual({ extendsBeyondWalls: true, approxOverhangIn: 6 });
        expect(result.data.structuralSpanInfo).toEqual({ structuralSpanFt: 12, usesManufacturedTruss: true });
        expect(result.data.utilityIntent).toEqual({ electrical: true, plumbing: false, mechanical: true });
      }
    });

    it("accepts every field entirely absent - undefined stays undefined, never coerced to a default", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, validConfig);
      expect(result.outcome).toBe("VALID");
      if (result.outcome === "VALID") {
        expect(result.data.foundationType).toBeUndefined();
        expect(result.data.attachment).toBeUndefined();
        expect(result.data.intendedUse).toBeUndefined();
        expect(result.data.roofOverhang).toBeUndefined();
        expect(result.data.structuralSpanInfo).toBeUndefined();
        expect(result.data.utilityIntent).toBeUndefined();
      }
    });

    it("accepts roofOverhang with extendsBeyondWalls=true and approxOverhangIn omitted - matches the 'Yes, but not sure how far' case (REQUIRES_VERIFICATION at evaluation, never a guess)", () => {
      const result = validateAtBoundary(ShedProjectConfigurationSchema, { ...validConfig, roofOverhang: { extendsBeyondWalls: true } });
      expect(result.outcome).toBe("VALID");
    });

    it("rejects an unrecognized foundationType/attachment/intendedUse value - never silently accepted", () => {
      expect(validateAtBoundary(ShedProjectConfigurationSchema, { ...validConfig, foundationType: "CONCRETE_BASEMENT" }).outcome).toBe("INVALID");
      expect(validateAtBoundary(ShedProjectConfigurationSchema, { ...validConfig, attachment: "SEMI_DETACHED" }).outcome).toBe("INVALID");
      expect(validateAtBoundary(ShedProjectConfigurationSchema, { ...validConfig, intendedUse: "GARAGE" }).outcome).toBe("INVALID");
    });
  });
});
