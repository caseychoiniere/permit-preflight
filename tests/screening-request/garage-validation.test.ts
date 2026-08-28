import { describe, expect, it } from "vitest";
import { GarageProjectConfigurationSchema } from "../../src/screening-request/types.js";
import { validateAtBoundary } from "../../src/shared/validation.js";

const validConfig = {
  widthFt: 20,
  depthFt: 20,
  heightFt: 12,
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

describe("GarageProjectConfiguration boundary validation (Unit 4, PC-2/NFR-U2-4 pattern reused)", () => {
  it("accepts a well-formed configuration with both garage-only fields omitted", () => {
    const result = validateAtBoundary(GarageProjectConfigurationSchema, validConfig);
    expect(result.outcome).toBe("VALID");
  });

  it("[hard invariant] rejects negative dimensions, same as shed", () => {
    const result = validateAtBoundary(GarageProjectConfigurationSchema, { ...validConfig, widthFt: -5 });
    expect(result.outcome).toBe("INVALID");
  });

  it("preserves the undefined-vs-explicit-0 distinction for existingStructuresFootprintSqFt (BR-U4-3) - omitted field parses to undefined", () => {
    const result = validateAtBoundary(GarageProjectConfigurationSchema, validConfig);
    expect(result.outcome).toBe("VALID");
    if (result.outcome === "VALID") {
      expect(result.data.existingStructuresFootprintSqFt).toBeUndefined();
    }
  });

  it("accepts an explicit 0 for existingStructuresFootprintSqFt (a deliberate 'no existing structures' assertion, not the same as omitted)", () => {
    const result = validateAtBoundary(GarageProjectConfigurationSchema, { ...validConfig, existingStructuresFootprintSqFt: 0 });
    expect(result.outcome).toBe("VALID");
    if (result.outcome === "VALID") {
      expect(result.data.existingStructuresFootprintSqFt).toBe(0);
    }
  });

  it("[hard invariant] rejects a negative existingStructuresFootprintSqFt", () => {
    const result = validateAtBoundary(GarageProjectConfigurationSchema, { ...validConfig, existingStructuresFootprintSqFt: -1 });
    expect(result.outcome).toBe("INVALID");
  });

  it("preserves the undefined-vs-explicit-boolean distinction for stackedDwellingUnits (L6)", () => {
    const omitted = validateAtBoundary(GarageProjectConfigurationSchema, validConfig);
    const explicitFalse = validateAtBoundary(GarageProjectConfigurationSchema, { ...validConfig, stackedDwellingUnits: false });
    expect(omitted.outcome).toBe("VALID");
    expect(explicitFalse.outcome).toBe("VALID");
    if (omitted.outcome === "VALID" && explicitFalse.outcome === "VALID") {
      expect(omitted.data.stackedDwellingUnits).toBeUndefined();
      expect(explicitFalse.data.stackedDwellingUnits).toBe(false);
    }
  });
});
