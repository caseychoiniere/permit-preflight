import { describe, expect, it } from "vitest";
import {
  checkReadiness,
  checkVacantLandCheckoutEligibility,
  isVacantLandPersistenceWriteEnabled,
  isVacantLandScreeningCoverageReady,
} from "../../src/screening-request/authorization.js";
import { WorkflowType } from "../../src/screening-request/types.js";

/** Mirrors garage-coverage-readiness.test.ts exactly, plus the new persistence-write-activation
 * gate (Code Generation Part 1, Step 9b - a structurally separate, data-layer concern). */
describe("Unit 5 - Vacant-Land Screening Coverage Readiness (business-rules.md BR-U5-9)", () => {
  it("[hard invariant] isVacantLandScreeningCoverageReady() is false today - expected to stay false for the entire Units 5-11 POC-build phase", () => {
    expect(isVacantLandScreeningCoverageReady()).toBe(false);
  });

  it("checkVacantLandCheckoutEligibility rejects a vacant-land order while the coverage gate is closed, with a reason a customer can read", () => {
    const result = checkVacantLandCheckoutEligibility({ workflowType: WorkflowType.VACANT_LAND });
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("checkVacantLandCheckoutEligibility is a no-op ({ ready: true }) for an EXISTING_PROPERTY order - this gate has nothing to say about shed/garage", () => {
    expect(checkVacantLandCheckoutEligibility({ workflowType: WorkflowType.EXISTING_PROPERTY })).toEqual({ ready: true });
  });
});

describe("Unit 5 - Persistence-Write Activation Gate (NFR Design, corrected ordering) - structurally separate from commercial readiness", () => {
  it("[hard invariant] isVacantLandPersistenceWriteEnabled() is false today - no VACANT_LAND row may be written before PRE-ACTIVATION ENFORCEMENT is confirmed applied", () => {
    expect(isVacantLandPersistenceWriteEnabled()).toBe(false);
  });

  it("the persistence-write gate and the commercial-readiness gate are two independent flags - neither's value implies the other", () => {
    // Both currently false, but this test documents the invariant that they are NOT the same
    // function/mechanism - checked by identity, not merely by equal current values.
    expect(isVacantLandPersistenceWriteEnabled).not.toBe(isVacantLandScreeningCoverageReady);
  });
});

describe("Unit 5 - checkReadiness branches on workflowType before ever reading projectType", () => {
  it("a VACANT_LAND request with VALID validationState is ready, regardless of projectType (which is null for this workflow)", async () => {
    const neverUsedDb = {} as Parameters<typeof checkReadiness>[0];
    const result = await checkReadiness(neverUsedDb, { workflowType: WorkflowType.VACANT_LAND, projectType: null, validationState: "VALID" }, []);
    expect(result).toEqual({ ready: true });
  });

  it("an unrecognized workflowType is rejected with a clear reason", async () => {
    const neverUsedDb = {} as Parameters<typeof checkReadiness>[0];
    const result = await checkReadiness(neverUsedDb, { workflowType: "SOMETHING_ELSE", projectType: null, validationState: "VALID" }, []);
    expect(result.ready).toBe(false);
  });
});
