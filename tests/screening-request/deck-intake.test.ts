import { describe, expect, it } from "vitest";
import { DeckBuildingRelation, DeckProjectConfigurationSchema, ProjectType, SUPPORTED_PROJECT_TYPES, projectDetailsSchemaFor } from "../../src/screening-request/types.js";
import { hydrateScreeningRequestShape, hydrateScreeningRequestSnapshot } from "../../src/screening-request/hydrate.js";
import { checkDeckCheckoutEligibility, isDeckScreeningCoverageReady, REQUIRED_SOURCE_IDS_FOR_DECK, REQUIRED_SOURCE_IDS_FOR_SHED } from "../../src/screening-request/authorization.js";

const valid = { heightAboveGradeIn: 24, widthFt: 10, depthFt: 12, attachment: "DETACHED", buildingRelation: DeckBuildingRelation.OPEN_GROUND_BELOW, setbackLocations: ["SIDE_SETBACK"] };

describe("DeckProjectConfigurationSchema", () => {
  it("accepts a minimal declaration and never defaults optional answers", () => {
    const r = DeckProjectConfigurationSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.solidFlooring).toBeUndefined();
      expect(r.data.longestBeamFt).toBeUndefined();
      expect(r.data.distanceFromRearLotLineFt).toBeUndefined();
    }
  });
  it.each([
    ["height 0", { heightAboveGradeIn: 0 }],
    ["negative height", { heightAboveGradeIn: -2 }],
    ["height over 240 in", { heightAboveGradeIn: 241 }],
    ["non-finite width", { widthFt: Number.NaN }],
    ["width over 100", { widthFt: 101 }],
    ["missing attachment (no default)", { attachment: undefined }],
    ["missing buildingRelation (no default)", { buildingRelation: undefined }],
    ["no locations", { setbackLocations: [] }],
    ["unknown location", { setbackLocations: ["MIDDLE"] }],
    ["repeated location", { setbackLocations: ["SIDE_SETBACK", "SIDE_SETBACK"] }],
    ["rear distance without rear setback", { distanceFromRearLotLineFt: 6 }],
    ["dwelling distance on an attached deck", { attachment: "ATTACHED_TO_DWELLING", distanceFromDwellingFt: 4 }],
    ["detached roof deck", { buildingRelation: "ROOF_DECK", attachment: "DETACHED" }],
    ["negative beam", { longestBeamFt: -1 }],
  ])("rejects: %s", (_l, o) => expect(DeckProjectConfigurationSchema.safeParse({ ...valid, ...o }).success).toBe(false));
  it.each([
    ["all five locations", { setbackLocations: ["FRONT_SETBACK", "STREET_SIDE_SETBACK", "SIDE_SETBACK", "REAR_SETBACK", "OUTSIDE_REQUIRED_SETBACKS"] }],
    ["rear with distances, detached", { setbackLocations: ["REAR_SETBACK"], distanceFromRearLotLineFt: 0, distanceFromDwellingFt: 0 }],
    ["attached roof deck", { buildingRelation: "ROOF_DECK", attachment: "ATTACHED_TO_DWELLING" }],
    ["answered flooring and beam", { solidFlooring: false, longestBeamFt: 13.5 }],
  ])("accepts: %s", (_l, o) => expect(DeckProjectConfigurationSchema.safeParse({ ...valid, ...o }).success).toBe(true));
});

describe("dispatch, hydration and the readiness gate", () => {
  it("deck is a supported intake type with its own schema; fence/shed/garage payloads are not valid decks", () => {
    expect(SUPPORTED_PROJECT_TYPES.has(ProjectType.DECK)).toBe(true);
    expect(projectDetailsSchemaFor(ProjectType.DECK).safeParse(valid).success).toBe(true);
    expect(projectDetailsSchemaFor(ProjectType.FENCE).safeParse(valid).success).toBe(false);
    expect(projectDetailsSchemaFor(ProjectType.SHED).safeParse(valid).success).toBe(false);
    expect(projectDetailsSchemaFor(ProjectType.DECK).safeParse({ heightFt: 6, locations: ["FRONT_SETBACK"], siteSlopes: false, wallRelation: "NONE" }).success).toBe(false);
  });
  it("round-trips a deck snapshot and rejects an invalid one at the boundary", () => {
    const snap = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: "3298700485", projectType: "deck", projectDetails: valid };
    const ok = hydrateScreeningRequestSnapshot(snap);
    expect(ok.outcome).toBe("VALID");
    const bad = hydrateScreeningRequestShape({ ...snap, projectDetails: { ...valid, heightAboveGradeIn: 0 } });
    expect(bad.outcome).toBe("INVALID");
    if (bad.outcome === "INVALID") expect(bad.issues.join(" ")).toContain("projectDetails.heightAboveGradeIn");
  });
  it("Deck Screening Coverage Readiness is true after the founder's 2026-10-08 decision; the check is a no-op for every other type", () => {
    expect(isDeckScreeningCoverageReady()).toBe(true);
    expect(checkDeckCheckoutEligibility({ projectType: ProjectType.DECK })).toEqual({ ready: true });
    for (const t of [ProjectType.SHED, ProjectType.GARAGE, ProjectType.FENCE, null]) expect(checkDeckCheckoutEligibility({ projectType: t })).toEqual({ ready: true });
    expect(REQUIRED_SOURCE_IDS_FOR_DECK).toEqual(REQUIRED_SOURCE_IDS_FOR_SHED);
  });
});
