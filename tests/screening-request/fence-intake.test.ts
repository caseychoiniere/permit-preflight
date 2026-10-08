/**
 * Unit 7 (Fences) intake: the boundary schema's accept/reject matrix, schema dispatch, snapshot
 * hydration, and the (hardcoded-false) public readiness gate.
 */
import { describe, expect, it } from "vitest";
import {
  FenceLocation,
  FenceProjectConfigurationSchema,
  FenceWallRelation,
  ProjectType,
  SUPPORTED_PROJECT_TYPES,
  projectDetailsSchemaFor,
} from "../../src/screening-request/types.js";
import { hydrateScreeningRequestShape, hydrateScreeningRequestSnapshot } from "../../src/screening-request/hydrate.js";
import { checkFenceCheckoutEligibility, isFenceScreeningCoverageReady, REQUIRED_SOURCE_IDS_FOR_FENCE, REQUIRED_SOURCE_IDS_FOR_SHED } from "../../src/screening-request/authorization.js";

const valid = { heightFt: 6, locations: [FenceLocation.OTHER_SIDE_OR_REAR_SETBACK], siteSlopes: false, wallRelation: FenceWallRelation.NONE };

describe("FenceProjectConfigurationSchema", () => {
  it("accepts a minimal declaration and leaves every optional answer undefined (never defaulted)", () => {
    const r = FenceProjectConfigurationSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.openFeatureHeightFt).toBeUndefined();
    expect(r.data.tallestPortionHeightFt).toBeUndefined();
    expect(r.data.wallHeightFt).toBeUndefined();
    expect(r.data.hasMasonryOrConcreteAbove6Ft).toBeUndefined();
  });

  it.each([
    ["height 0", { heightFt: 0 }],
    ["negative height", { heightFt: -1 }],
    ["height over 20", { heightFt: 20.1 }],
    ["non-finite height", { heightFt: Number.POSITIVE_INFINITY }],
    ["no locations", { locations: [] }],
    ["unknown location", { locations: ["MIDDLE_OF_LOT"] }],
    ["repeated location", { locations: [FenceLocation.FRONT_SETBACK, FenceLocation.FRONT_SETBACK] }],
    ["siteSlopes missing", { siteSlopes: undefined }],
    ["wallRelation missing (no default)", { wallRelation: undefined }],
    ["feature over 4", { openFeatureHeightFt: 4.5 }],
    ["negative feature", { openFeatureHeightFt: -0.5 }],
    ["tallest portion without a sloping site", { tallestPortionHeightFt: 8 }],
    ["tallest below the fence height", { siteSlopes: true, tallestPortionHeightFt: 5 }],
    ["wall height with no wall", { wallHeightFt: 3 }],
    ["cut-wall setback with no wall", { cutWallSetbackFt: 3 }],
    ["wall relation without wall height", { wallRelation: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE }],
    ["cut wall without setback", { wallRelation: FenceWallRelation.SET_BACK_FROM_CUT_WALL, wallHeightFt: 4 }],
    ["setback on a non-cut wall", { wallRelation: FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD, wallHeightFt: 4, cutWallSetbackFt: 3 }],
  ])("rejects: %s", (_label, override) => {
    expect(FenceProjectConfigurationSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it.each([
    ["sloping site with tallest portion", { siteSlopes: true, tallestPortionHeightFt: 7.5 }],
    ["tallest equal to height", { siteSlopes: true, tallestPortionHeightFt: 6 }],
    ["all four locations", { locations: Object.values(FenceLocation) }],
    ["feature at the bound", { openFeatureHeightFt: 4 }],
    ["new raising-grade wall", { wallRelation: FenceWallRelation.ON_NEW_WALL_RAISING_GRADE, wallHeightFt: 5 }],
    ["cut wall with explicit 0 ft setback (a deliberate, evaluable declaration)", { wallRelation: FenceWallRelation.SET_BACK_FROM_CUT_WALL, wallHeightFt: 4, cutWallSetbackFt: 0 }],
    ["masonry answered false", { hasMasonryOrConcreteAbove6Ft: false }],
  ])("accepts: %s", (_label, override) => {
    expect(FenceProjectConfigurationSchema.safeParse({ ...valid, ...override }).success).toBe(true);
  });
});

describe("project-type dispatch and hydration", () => {
  it("fence is a supported intake type and dispatches to its own schema; shed/garage dispatch is unchanged", () => {
    expect(SUPPORTED_PROJECT_TYPES.has(ProjectType.FENCE)).toBe(true);
    expect(projectDetailsSchemaFor(ProjectType.FENCE).safeParse(valid).success).toBe(true);
    // A fence declaration is not a valid shed/garage configuration (no dimensions), and vice versa.
    expect(projectDetailsSchemaFor(ProjectType.SHED).safeParse(valid).success).toBe(false);
    expect(projectDetailsSchemaFor(ProjectType.GARAGE).safeParse(valid).success).toBe(false);
    expect(projectDetailsSchemaFor(ProjectType.FENCE).safeParse({ widthFt: 8, depthFt: 8, heightFt: 8, alleyAdjacent: false }).success).toBe(false);
  });

  it("round-trips a fence snapshot and rejects an invalid fence payload at the boundary", () => {
    const snap = { workflowType: "EXISTING_PROPERTY", confirmedParcelId: "3298700485", projectType: "fence", projectDetails: valid };
    const ok = hydrateScreeningRequestSnapshot(snap);
    expect(ok.outcome).toBe("VALID");
    if (ok.outcome === "VALID" && ok.snapshot.workflowType === "EXISTING_PROPERTY") expect(ok.snapshot.projectType).toBe("fence");
    const bad = hydrateScreeningRequestShape({ ...snap, projectDetails: { ...valid, heightFt: 0 } });
    expect(bad.outcome).toBe("INVALID");
    if (bad.outcome === "INVALID") expect(bad.issues.join(" ")).toContain("projectDetails.heightFt");
  });

  it("an unknown project type is still rejected", () => {
    expect(hydrateScreeningRequestShape({ workflowType: "EXISTING_PROPERTY", confirmedParcelId: "x", projectType: "gazebo", projectDetails: valid }).outcome).toBe("INVALID");
  });
});

describe("Fence Screening Coverage Readiness (public availability gate)", () => {
  it("is hardcoded false: fences are not publicly offered or purchasable until a founder decision", () => {
    expect(isFenceScreeningCoverageReady()).toBe(false);
    const blocked = checkFenceCheckoutEligibility({ projectType: ProjectType.FENCE });
    expect(blocked.ready).toBe(false);
    if (!blocked.ready) expect(blocked.reason).toContain("Fence screening is not yet available for purchase");
  });
  it("is a no-op for every other project type", () => {
    for (const t of [ProjectType.SHED, ProjectType.GARAGE, null]) expect(checkFenceCheckoutEligibility({ projectType: t })).toEqual({ ready: true });
  });
  it("needs no new data source (same required sources as a shed)", () => {
    expect(REQUIRED_SOURCE_IDS_FOR_FENCE).toEqual(REQUIRED_SOURCE_IDS_FOR_SHED);
  });
});
