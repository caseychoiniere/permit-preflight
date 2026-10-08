import { describe, expect, it } from "vitest";
import { AduProjectConfigurationSchema, ProjectType, SUPPORTED_PROJECT_TYPES, projectDetailsSchemaFor } from "../../src/screening-request/types.js";
import { hydrateScreeningRequestSnapshot } from "../../src/screening-request/hydrate.js";

const valid = {
  aduType: "DETACHED_NEW",
  widthFt: 16,
  depthFt: 20,
  stories: 1,
  bedrooms: 1,
  heightFt: 15,
  alleyAdjacent: false,
  existingPrincipalDwellingUnits: 1,
  existingAduCount: 0,
};

describe("ADU intake boundary", () => {
  it("is a supported project type dispatching to the ADU schema", () => {
    expect(ProjectType.ADU).toBe("adu");
    expect(SUPPORTED_PROJECT_TYPES.has("adu")).toBe(true);
    expect(projectDetailsSchemaFor("adu")).toBe(AduProjectConfigurationSchema);
  });

  it("accepts a complete declaration and leaves unanswered optionals undefined (never defaulted)", () => {
    const parsed = AduProjectConfigurationSchema.parse(valid);
    expect(parsed.existingHouseBuiltBefore1982).toBeUndefined();
    expect(parsed.existingChargeableFloorAreaSqFt).toBeUndefined();
    expect(parsed.proposedPlacement).toBeUndefined();
  });

  it.each([
    ["missing existing unit counts", { existingPrincipalDwellingUnits: undefined }],
    ["no principal dwelling", { existingPrincipalDwellingUnits: 0 }],
    ["fractional stories", { stories: 1.5 }],
    ["four stories", { stories: 4 }],
    ["negative bedrooms", { bedrooms: -1 }],
    ["fractional bedrooms", { bedrooms: 1.5 }],
    ["zero width", { widthFt: 0 }],
    ["absurd height", { heightFt: 200 }],
    ["negative floor area", { existingChargeableFloorAreaSqFt: -5 }],
    ["unknown ADU type", { aduType: "CONVERSION" }],
    ["alley not answered", { alleyAdjacent: undefined }],
    ["NaN width", { widthFt: Number.NaN }],
  ])("rejects %s", (_name, over) => {
    expect(AduProjectConfigurationSchema.safeParse({ ...valid, ...over }).success).toBe(false);
  });

  it("a persisted ADU snapshot hydrates through the shared boundary, and an ADU snapshot missing its declared counts is rejected", () => {
    const ok = hydrateScreeningRequestSnapshot({ workflowType: "EXISTING_PROPERTY", confirmedParcelId: "1498301270", projectType: "adu", projectDetails: valid });
    expect(ok.outcome).toBe("VALID");
    const bad = hydrateScreeningRequestSnapshot({ workflowType: "EXISTING_PROPERTY", confirmedParcelId: "1498301270", projectType: "adu", projectDetails: { ...valid, existingAduCount: undefined } });
    expect(bad.outcome).toBe("INVALID");
  });
});
