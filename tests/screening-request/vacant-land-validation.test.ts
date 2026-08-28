import { describe, expect, it } from "vitest";
import { createVacantLandScreeningRequest } from "../../src/screening-request/repository.js";
import { VacantLandDetailsSchema, VacantLandScreeningIntent, WorkflowType } from "../../src/screening-request/types.js";
import type { Db } from "../../src/db/client.js";

describe("VacantLandDetailsSchema - workflow-discriminated parsing (deterministic)", () => {
  it("accepts VACANT_PARCEL and REDEVELOP_EXISTING_PARCEL", () => {
    expect(VacantLandDetailsSchema.safeParse({ screeningIntent: VacantLandScreeningIntent.VACANT_PARCEL }).success).toBe(true);
    expect(VacantLandDetailsSchema.safeParse({ screeningIntent: VacantLandScreeningIntent.REDEVELOP_EXISTING_PARCEL }).success).toBe(true);
  });

  it("rejects an unrecognized screeningIntent value", () => {
    expect(VacantLandDetailsSchema.safeParse({ screeningIntent: "SOMETHING_ELSE" }).success).toBe(false);
  });

  it("rejects a missing screeningIntent", () => {
    expect(VacantLandDetailsSchema.safeParse({}).success).toBe(false);
  });
});

describe("createVacantLandScreeningRequest - persistence-write gate (deterministic, no DB touched while disabled)", () => {
  it("[hard invariant] refuses to persist while isVacantLandPersistenceWriteEnabled() is false (the real, deployed default today) - never reaches the database", async () => {
    const neverUsedDb = {} as Db;
    const result = await createVacantLandScreeningRequest(neverUsedDb, "test-parcel", VacantLandScreeningIntent.VACANT_PARCEL);
    expect(result).toEqual({ outcome: "PERSISTENCE_WRITE_DISABLED" });
  });
});

describe("WorkflowType - Unit 5 addition", () => {
  it("VACANT_LAND is a real, distinct member alongside EXISTING_PROPERTY", () => {
    expect(WorkflowType.VACANT_LAND).toBe("VACANT_LAND");
    expect(WorkflowType.EXISTING_PROPERTY).toBe("EXISTING_PROPERTY");
    expect(WorkflowType.VACANT_LAND).not.toBe(WorkflowType.EXISTING_PROPERTY);
  });
});
