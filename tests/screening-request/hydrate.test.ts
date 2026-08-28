/**
 * Real boundary parser/hydrator tests (NFR-U5-4, Code Generation review Correction 4A) - proves
 * `hydrateScreeningRequestShape`/`hydrateScreeningRequestRow` genuinely validate rather than cast:
 * discriminate on workflowType, validate required branch fields, reject cross-workflow
 * combinations, reject unrecognized workflowType, fail closed on any invalid shape.
 */
import { describe, expect, it } from "vitest";
import { hydrateScreeningRequestRow, hydrateScreeningRequestShape, hydrateScreeningRequestSnapshot } from "../../src/screening-request/hydrate.js";

describe("hydrateScreeningRequestShape - valid shapes", () => {
  it("accepts a valid EXISTING_PROPERTY/shed shape", () => {
    const result = hydrateScreeningRequestShape({
      workflowType: "EXISTING_PROPERTY",
      confirmedParcelId: "test-parcel",
      projectType: "shed",
      projectDetails: { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false },
    });
    expect(result.outcome).toBe("VALID");
  });

  it("accepts a valid VACANT_LAND shape", () => {
    const result = hydrateScreeningRequestShape({
      workflowType: "VACANT_LAND",
      confirmedParcelId: "test-parcel",
      screeningIntent: "VACANT_PARCEL",
      vacantLandDetails: { screeningIntent: "VACANT_PARCEL" },
    });
    expect(result.outcome).toBe("VALID");
    if (result.outcome === "VALID") expect(result.value.workflowType).toBe("VACANT_LAND");
  });
});

describe("hydrateScreeningRequestShape - fails closed on cross-workflow pollution", () => {
  it("[hard invariant] rejects a VACANT_LAND payload that also carries projectType", () => {
    const result = hydrateScreeningRequestShape({
      workflowType: "VACANT_LAND",
      confirmedParcelId: "test-parcel",
      screeningIntent: "VACANT_PARCEL",
      vacantLandDetails: { screeningIntent: "VACANT_PARCEL" },
      projectType: "shed",
    });
    expect(result.outcome).toBe("INVALID");
  });

  it("[hard invariant] rejects an EXISTING_PROPERTY payload that also carries screeningIntent", () => {
    const result = hydrateScreeningRequestShape({
      workflowType: "EXISTING_PROPERTY",
      confirmedParcelId: "test-parcel",
      projectType: "shed",
      projectDetails: { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false },
      screeningIntent: "VACANT_PARCEL",
    });
    expect(result.outcome).toBe("INVALID");
  });
});

describe("hydrateScreeningRequestShape - fails closed on an unrecognized workflowType", () => {
  it("[hard invariant] rejects a workflowType matching neither branch", () => {
    const result = hydrateScreeningRequestShape({ workflowType: "SOMETHING_ELSE", confirmedParcelId: "test-parcel" });
    expect(result.outcome).toBe("INVALID");
  });

  it("[hard invariant] rejects a completely malformed payload", () => {
    expect(hydrateScreeningRequestShape(null).outcome).toBe("INVALID");
    expect(hydrateScreeningRequestShape(undefined).outcome).toBe("INVALID");
    expect(hydrateScreeningRequestShape("not an object").outcome).toBe("INVALID");
    expect(hydrateScreeningRequestShape({}).outcome).toBe("INVALID");
  });
});

describe("hydrateScreeningRequestShape - validates required branch fields, not just the discriminant", () => {
  it("rejects EXISTING_PROPERTY with an out-of-range projectDetails value", () => {
    const result = hydrateScreeningRequestShape({
      workflowType: "EXISTING_PROPERTY",
      confirmedParcelId: "test-parcel",
      projectType: "shed",
      projectDetails: { widthFt: -5, depthFt: 10, heightFt: 8, alleyAdjacent: false },
    });
    expect(result.outcome).toBe("INVALID");
  });

  it("rejects VACANT_LAND with an invalid screeningIntent value", () => {
    const result = hydrateScreeningRequestShape({
      workflowType: "VACANT_LAND",
      confirmedParcelId: "test-parcel",
      screeningIntent: "NOT_A_REAL_INTENT",
      vacantLandDetails: { screeningIntent: "NOT_A_REAL_INTENT" },
    });
    expect(result.outcome).toBe("INVALID");
  });

  it("rejects a missing confirmedParcelId", () => {
    const result = hydrateScreeningRequestShape({ workflowType: "EXISTING_PROPERTY", projectType: "shed", projectDetails: {} });
    expect(result.outcome).toBe("INVALID");
  });
});

describe("hydrateScreeningRequestRow - narrows a full DB row before hydrating", () => {
  it("a clean EXISTING_PROPERTY row (VACANT_LAND fields genuinely NULL) hydrates successfully", () => {
    const result = hydrateScreeningRequestRow({
      workflowType: "EXISTING_PROPERTY",
      confirmedParcelId: "test-parcel",
      projectType: "shed",
      projectDetails: { widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false },
      screeningIntent: null,
      vacantLandDetails: null,
    });
    expect(result.outcome).toBe("VALID");
  });

  it("[hard invariant] a corrupted row with workflowType='VACANT_LAND' but a non-null projectType is rejected, not silently stripped", () => {
    const result = hydrateScreeningRequestRow({
      workflowType: "VACANT_LAND",
      confirmedParcelId: "test-parcel",
      projectType: "shed", // corruption: should be NULL for this workflow
      projectDetails: null,
      screeningIntent: "VACANT_PARCEL",
      vacantLandDetails: { screeningIntent: "VACANT_PARCEL" },
    });
    expect(result.outcome).toBe("INVALID");
  });
});

describe("hydrateScreeningRequestSnapshot - snapshot convenience wrapper", () => {
  it("fails closed on an invalid snapshot shape rather than casting", () => {
    const result = hydrateScreeningRequestSnapshot({ workflowType: "NOT_REAL" });
    expect(result.outcome).toBe("INVALID");
  });

  it("hydrates a valid VACANT_LAND snapshot", () => {
    const result = hydrateScreeningRequestSnapshot({
      workflowType: "VACANT_LAND",
      confirmedParcelId: "test-parcel",
      screeningIntent: "REDEVELOP_EXISTING_PARCEL",
      vacantLandDetails: { screeningIntent: "REDEVELOP_EXISTING_PARCEL" },
    });
    expect(result.outcome).toBe("VALID");
    if (result.outcome === "VALID") expect(result.snapshot.workflowType).toBe("VACANT_LAND");
  });
});
