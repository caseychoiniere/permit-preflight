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
    expect(parsed.aduType === "DETACHED_NEW" && parsed.proposedPlacement).toBeUndefined();
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

describe("ADU conversion intake boundary (Unit 11 Slice 4)", () => {
  const conversion = {
    aduType: "CONVERSION_EXISTING",
    stories: 1,
    bedrooms: 1,
    alleyAdjacent: false,
    existingPrincipalDwellingUnits: 1,
    existingAduCount: 0,
    convertedStructure: { outlineId: "1271023117", method: "USER_CONFIRMED" },
  };

  it("accepts a conversion with no footprint, height or placement (the footprint is the mapped outline) and leaves unanswered declarations undefined", () => {
    const parsed = AduProjectConfigurationSchema.parse(conversion);
    expect(parsed.aduType).toBe("CONVERSION_EXISTING");
    if (parsed.aduType === "CONVERSION_EXISTING") {
      expect(parsed.existedBeforeJuly2023).toBeUndefined();
      expect(parsed.keepsFootprintAndHeight).toBeUndefined();
    }
  });

  it.each([
    ["a missing unit count", { existingAduCount: undefined }],
    ["an empty building id", { convertedStructure: { outlineId: "", method: "USER_CONFIRMED" } }],
    ["more than three stories", { stories: 7 }],
    ["the chosen building also being the main house", { primaryDwellingSelection: { status: "SELECTED", outlineId: "1271023117", method: "USER_CONFIRMED" } }],
  ])("rejects %s", (_name, over) => {
    expect(AduProjectConfigurationSchema.safeParse({ ...conversion, ...over }).success).toBe(false);
  });

  it("a different main house is fine, and an unanswered building choice is allowed at the boundary (completeness is enforced when the request is finalized)", () => {
    expect(AduProjectConfigurationSchema.safeParse({ ...conversion, primaryDwellingSelection: { status: "SELECTED", outlineId: "999", method: "USER_CONFIRMED" } }).success).toBe(true);
    expect(AduProjectConfigurationSchema.safeParse({ ...conversion, convertedStructure: undefined }).success).toBe(true);
  });

  it("the discriminant must be one of the two ADU types", () => {
    expect(AduProjectConfigurationSchema.safeParse({ ...conversion, aduType: "ATTACHED" }).success).toBe(false);
  });
});

describe("ADU attached-to-house intake boundary (Unit 11 Slice 5)", () => {
  const attached = { aduType: "ATTACHED_TO_HOUSE", grossFloorAreaSqFt: 700, bedrooms: 1, includesAddition: false, existingPrincipalDwellingUnits: 1, existingAduCount: 0 };

  it("accepts a declared-only attached ADU: no footprint, height, placement or building choice, unanswered optionals stay undefined", () => {
    const parsed = AduProjectConfigurationSchema.parse(attached);
    expect(parsed.aduType).toBe("ATTACHED_TO_HOUSE");
    if (parsed.aduType === "ATTACHED_TO_HOUSE") {
      expect(parsed.portionExistedBeforeJuly2023).toBeUndefined();
      expect(parsed.existingHouseBuiltBefore1982).toBeUndefined();
    }
  });

  it.each([
    ["no floor area", { grossFloorAreaSqFt: undefined }],
    ["zero floor area", { grossFloorAreaSqFt: 0 }],
    ["absurd floor area", { grossFloorAreaSqFt: 50_000 }],
    ["addition not answered", { includesAddition: undefined }],
    ["fractional bedrooms", { bedrooms: 1.5 }],
    ["no principal dwelling", { existingPrincipalDwellingUnits: 0 }],
    ["missing ADU count", { existingAduCount: undefined }],
  ])("rejects %s", (_name, over) => {
    expect(AduProjectConfigurationSchema.safeParse({ ...attached, ...over }).success).toBe(false);
  });

  it("an attached ADU snapshot hydrates through the shared boundary", () => {
    const ok = hydrateScreeningRequestSnapshot({ workflowType: "EXISTING_PROPERTY", confirmedParcelId: "1498301270", projectType: "adu", projectDetails: attached });
    expect(ok.outcome).toBe("VALID");
  });
});
