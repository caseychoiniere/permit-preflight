import { describe, expect, it } from "vitest";
import { parseZoningString } from "../../src/zoning/designation.js";
import { KNOWN_ZONE_CODES, parseZoneScope, validateZoneScope, zoneInScope } from "../../src/zoning/scope.js";

const inScope = (scope: string, zoning: string): boolean => zoneInScope(parseZoneScope(scope), parseZoningString(zoning));

describe("zone scope grammar", () => {
  it("ALL matches any interpretable zone but never an unknown designation", () => {
    expect(inScope("ALL", "NR")).toBe(true);
    expect(inScope("ALL", "DMC 240/290-440")).toBe(true);
    expect(inScope("ALL", "ZZ9")).toBe(false);
  });
  it("a family token covers every zone of the family", () => {
    expect(inScope("NR", "NR")).toBe(true);
    expect(inScope("LR", "LR3 RC (M1)")).toBe(true);
    expect(inScope("LR", "MR")).toBe(false);
    expect(inScope("NC", "NC2P-55 (M1)")).toBe(true);
    expect(inScope("C", "C1-65")).toBe(true);
    expect(inScope("NC", "C1-65")).toBe(false);
  });
  it("MULTIFAMILY is LR, MR and HR", () => {
    for (const z of ["LR1", "LR2 (M)", "MR (M1)", "HR (M)"]) expect(inScope("MULTIFAMILY", z)).toBe(true);
    expect(inScope("MULTIFAMILY", "NR")).toBe(false);
    expect(inScope("MULTIFAMILY", "NC2-40")).toBe(false);
  });
  it("a zone-code token is exact", () => {
    expect(inScope("LR1", "LR1 (M)")).toBe(true);
    expect(inScope("LR1", "LR2")).toBe(false);
    expect(inScope("LR2,LR3", "LR3 RC")).toBe(true);
    expect(inScope("SM-UP", "SM-UP 85 (M1)")).toBe(true);
    expect(inScope("SM-UP", "SM-U 85")).toBe(false);
  });
  it("MHA qualifiers distinguish a zone with an MHA suffix, and cannot be decided for an unrecognized suffix", () => {
    expect(inScope("LR2:MHA", "LR2 (M1)")).toBe(true);
    expect(inScope("LR2:MHA", "LR2")).toBe(false);
    expect(inScope("LR2:NO_MHA", "LR2")).toBe(true);
    expect(inScope("LR2:NO_MHA", "LR2 (M)")).toBe(false);
    expect(inScope("LR:MHA", "LR2 (0.75)")).toBe(false);
    expect(inScope("LR:NO_MHA", "LR2 (0.75)")).toBe(false);
    expect(inScope("LR", "LR2 (0.75)")).toBe(true);
  });
  it("invalid tokens match nothing and are reported", () => {
    expect(validateZoneScope("NR")).toEqual([]);
    expect(validateZoneScope("LR1,LR2:MHA")).toEqual([]);
    expect(validateZoneScope("")).toEqual(["empty zone scope"]);
    expect(validateZoneScope("LR9")).toEqual(['unrecognized zone scope token "LR9"']);
    expect(validateZoneScope("LR1:SOMETIMES")).toHaveLength(1);
    expect(inScope("LR9", "LR1")).toBe(false);
  });
  it("the zone code of every real designation is a known scope code", () => {
    for (const z of ["NR", "LR1", "MR", "HR", "NC3-75", "C2-75", "SM-SLU/R 65/95", "DMR/C 145/75", "IDR/C 125/150-270", "IC-45", "UI U/30", "MPC-YT"]) {
      expect(KNOWN_ZONE_CODES.has(parseZoningString(z).zoneCode)).toBe(true);
    }
  });
});
