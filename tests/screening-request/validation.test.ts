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
});
