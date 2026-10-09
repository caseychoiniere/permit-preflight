import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseZoningDesignation, parseZoningString, ZoneFamily, isInterpretable } from "../../src/zoning/designation.js";

interface Row { ZONING: string; BASE_ZONE: string; ZONELUT: string; CLASS_DESC: string; CATEGORY_DESC: string; MHA_VALUE: string | null; CHAPTER: string; MIO_NAME: string | null }
const rows: Row[] = JSON.parse(readFileSync(new URL("../fixtures/seattle-zoning-designations.json", import.meta.url), "utf8"));

const CATEGORY_TO_FAMILY: Record<string, string[]> = {
  "Neighborhood Residential": [ZoneFamily.NR],
  "Lowrise Multi-Family": [ZoneFamily.LR],
  "High-Density Multi-Family": [ZoneFamily.MR, ZoneFamily.HR],
  "Neighborhood Commercial": [ZoneFamily.NC],
  Commercial: [ZoneFamily.C],
  "Seattle Mixed": [ZoneFamily.SM],
  Downtown: [ZoneFamily.DOWNTOWN],
  Industrial: [ZoneFamily.INDUSTRIAL],
  "Master Planned Community": [ZoneFamily.MASTER_PLANNED],
};

describe("Seattle zoning designation parser against every published designation", () => {
  it("fixture is the real layer's distinct values", () => {
    expect(rows.length).toBeGreaterThan(300);
  });

  it("parses every real ZONING value to a known family that agrees with the layer's own attributes", () => {
    const failures: string[] = [];
    for (const r of rows) {
      const d = parseZoningDesignation(r.ZONING, { zonelut: r.ZONELUT, baseZone: r.BASE_ZONE, classDesc: r.CLASS_DESC, categoryDesc: r.CATEGORY_DESC, chapter: r.CHAPTER, mhaValue: r.MHA_VALUE, mioName: r.MIO_NAME });
      if (!isInterpretable(d)) {
        // "LR2 (0.75)" carries an older incentive suffix; the family is still known, the suffix is flagged
        failures.push(`${r.ZONING}: ${d.parseProblem}`);
        continue;
      }
      if (r.CATEGORY_DESC !== "Major Institutions" && !CATEGORY_TO_FAMILY[r.CATEGORY_DESC]?.includes(d.family)) failures.push(`${r.ZONING}: family ${d.family} vs category ${r.CATEGORY_DESC}`);
      if (r.CATEGORY_DESC === "Major Institutions" && !d.majorInstitutionOverlay) failures.push(`${r.ZONING}: MIO prefix not detected`);
    }
    expect(failures).toEqual([]);
  });

  it("every real MHA suffix is read", () => {
    for (const r of rows) {
      const d = parseZoningString(r.ZONING);
      // whether a suffix exists is what matters; the layer's own M/M1/M2 value is occasionally stale ("MR (M1)" polygon carrying "M")
      expect(d.mha !== undefined).toBe(r.MHA_VALUE !== null && r.MHA_VALUE !== "None");
    }
  });

  it.each([
    ["NR", ZoneFamily.NR, "NR", false],
    ["LR1", ZoneFamily.LR, "LR1", false],
    ["LR1 (M)", ZoneFamily.LR, "LR1", false],
    ["LR2 (M1)", ZoneFamily.LR, "LR2", false],
    ["LR3 RC (M1)", ZoneFamily.LR, "LR3", true],
    ["MR (M2)", ZoneFamily.MR, "MR", false],
    ["MR RC (M)", ZoneFamily.MR, "MR", true],
    ["HR (M)", ZoneFamily.HR, "HR", false],
    ["NC2P-55 (M1)", ZoneFamily.NC, "NC2", false],
    ["NC3-75 (M2)", ZoneFamily.NC, "NC3", false],
    ["C1-65", ZoneFamily.C, "C1", false],
    ["C2P-55 (M)", ZoneFamily.C, "C2", false],
    ["SM-SLU 100/65-145", ZoneFamily.SM, "SM-SLU", false],
    ["SM-UP 85 (M1)", ZoneFamily.SM, "SM-UP", false],
    ["DMC 240/290-440", ZoneFamily.DOWNTOWN, "DMC", false],
    ["DMR/C 145/75", ZoneFamily.DOWNTOWN, "DMR/C", false],
    ["IC-65 (M)", ZoneFamily.INDUSTRIAL, "IC", false],
    ["II U/125", ZoneFamily.INDUSTRIAL, "II", false],
    ["MPC-YT", ZoneFamily.MASTER_PLANNED, "MPC-YT", false],
  ])("%s -> %s / %s / RC=%s", (raw, family, code, rc) => {
    const d = parseZoningString(raw);
    expect(d.family).toBe(family);
    expect(d.zoneCode).toBe(code);
    expect(d.residentialCommercial).toBe(rc);
  });

  it("reads suffix parts", () => {
    expect(parseZoningString("NC2P-55 (M1)")).toMatchObject({ pedestrian: true, heightSuffix: "55", mha: "M1" });
    expect(parseZoningString("MIO-160-LR1 (M)")).toMatchObject({ family: ZoneFamily.LR, zoneCode: "LR1", mha: "M", majorInstitutionOverlay: { heightLimit: "160" } });
    expect(parseZoningString("MIO-160/125-LR3 (M)").majorInstitutionOverlay?.heightLimit).toBe("160/125");
    expect(parseZoningString("MIO-37-NR")).toMatchObject({ family: ZoneFamily.NR, majorInstitutionOverlay: { heightLimit: "37" } });
  });

  it("an unrecognized parenthesised suffix is kept, never guessed", () => {
    const d = parseZoningString("LR2 (0.75)");
    expect(d.family).toBe(ZoneFamily.LR);
    expect(d.mha).toBeUndefined();
    expect(d.unrecognizedSuffixes).toEqual(["0.75"]);
  });

  it("fails closed on an unknown or contradictory designation", () => {
    expect(parseZoningString("ZZ9").family).toBe(ZoneFamily.UNKNOWN);
    expect(parseZoningString("").family).toBe(ZoneFamily.UNKNOWN);
    expect(parseZoningDesignation("LR1 (M)", { zonelut: "LR2" }).family).toBe(ZoneFamily.UNKNOWN);
    expect(parseZoningDesignation("LR1 (M)", { mhaValue: "None" }).family).toBe(ZoneFamily.UNKNOWN);
    expect(parseZoningDesignation("LR1 (M)", { baseZone: "LR2" }).family).toBe(ZoneFamily.UNKNOWN);
  });
});
