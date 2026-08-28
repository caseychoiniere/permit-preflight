import { describe, expect, it } from "vitest";
import { KNOWN_SOURCE_DEFINITIONS, ExpectedRefreshCadence } from "../../src/data-source-registry/known-sources.js";
import { REQUIRED_SOURCE_IDS_FOR_SHED } from "../../src/screening-request/authorization.js";

describe("ADM-3: known-source expected refresh cadence (no new infrastructure)", () => {
  it("every id in REQUIRED_SOURCE_IDS_FOR_SHED has a known-source definition - not a second, drifting list", () => {
    for (const sourceId of REQUIRED_SOURCE_IDS_FOR_SHED) {
      expect(KNOWN_SOURCE_DEFINITIONS[sourceId]).toBeDefined();
    }
  });

  it("both currently-integrated sources are ON_DEMAND (queried live, per request) - not a placeholder for a schedule that doesn't exist", () => {
    expect(KNOWN_SOURCE_DEFINITIONS["king-county-gis"]?.expectedRefreshCadence).toBe(ExpectedRefreshCadence.ON_DEMAND);
    expect(KNOWN_SOURCE_DEFINITIONS["king-county-parcel-polygon"]?.expectedRefreshCadence).toBe(ExpectedRefreshCadence.ON_DEMAND);
  });
});
