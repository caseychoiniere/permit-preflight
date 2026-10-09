/**
 * Seattle zoning designation parser (citywide zoning coverage, 2026-10-09). Pure.
 *
 * The Seattle GIS zoning layer publishes one `ZONING` string per polygon ("LR1 (M)", "NC2P-55 (M1)",
 * "MIO-37-NR", "SM-SLU 100/65-145", "DMC 240/290-440"). The platform used to collapse that to "is it plain
 * NR". This module reads the designation into its parts so the Regulatory Rules Engine can dispatch on the
 * ZONE FAMILY (and, where a standard differs, the zone code) instead of a boolean:
 *
 *   zoneCode        the base zone the development standards are written for ("LR1", "NC2", "C1", "DMC", "SM-UP")
 *   family          the family a rule is tagged with ("NR", "LR", "MR", "HR", "NC", "C", "SM", "DOWNTOWN", ...)
 *   residentialCommercial   the RC designation (Chapter 23.46 adds commercial use; residential standards unchanged)
 *   heightSuffix    the numeric / U-suffix height designator ("55", "U/45", "240/290-440")
 *   mha             the Mandatory Housing Affordability suffix (M, M1, M2) - material to Lowrise FAR/height
 *   pedestrian      the "P" pedestrian designation on NC/C zones
 *   majorInstitutionOverlay   a "MIO-<height>-" prefix (its own standards apply to the institution)
 *   unrecognizedSuffixes     anything in parentheses that is not a known MHA suffix ("LR2 (0.75)" is an
 *                            older incentive-zoning base-FAR suffix) - never guessed at, kept for the report
 *
 * Interpretation follows the structured attributes of the layer (ZONELUT, CLASS_DESC, CATEGORY_DESC,
 * CHAPTER, MHA_VALUE) when they are supplied: the string parse and the attributes must agree on the zone
 * code, otherwise the designation is UNKNOWN (fail closed) rather than trusting either one alone.
 * Property Intelligence describes; this is the Rules Engine's classification (BR-3.3).
 */

export const ZoneFamily = {
  NR: "NR",
  LR: "LR",
  MR: "MR",
  HR: "HR",
  NC: "NC",
  C: "C",
  SM: "SM",
  DOWNTOWN: "DOWNTOWN",
  INDUSTRIAL: "INDUSTRIAL",
  MASTER_PLANNED: "MASTER_PLANNED",
  UNKNOWN: "UNKNOWN",
} as const;
export type ZoneFamily = (typeof ZoneFamily)[keyof typeof ZoneFamily];

/** Every family with its governing Land Use Code chapter (SMC Title 23) and customer-facing name. */
export const ZONE_FAMILY_INFO: Record<ZoneFamily, { name: string; chapter: string }> = {
  NR: { name: "Neighborhood Residential", chapter: "23.44" },
  LR: { name: "Lowrise", chapter: "23.45" },
  MR: { name: "Midrise", chapter: "23.45" },
  HR: { name: "Highrise", chapter: "23.45" },
  NC: { name: "Neighborhood Commercial", chapter: "23.47A" },
  C: { name: "Commercial", chapter: "23.47A" },
  SM: { name: "Seattle Mixed", chapter: "23.48" },
  DOWNTOWN: { name: "Downtown", chapter: "23.49" },
  INDUSTRIAL: { name: "Industrial", chapter: "23.50" },
  MASTER_PLANNED: { name: "Master Planned Community", chapter: "23.75" },
  UNKNOWN: { name: "unrecognized", chapter: "" },
};

/** Structured attributes of the zoning layer that corroborate the string parse (all optional). */
export interface ZoningLayerAttributes {
  zonelut?: string | null;
  baseZone?: string | null;
  classDesc?: string | null;
  categoryDesc?: string | null;
  chapter?: string | null;
  mhaValue?: string | null;
  mioName?: string | null;
}

export interface ZoningDesignation {
  /** The layer's ZONING value exactly as published. */
  raw: string;
  /** The base zone with its height designator ("LR1", "NC2P-55", "SM-UP 85"); the layer's BASE_ZONE. */
  baseZone: string;
  /** The zone the development standards are keyed on ("LR1", "NC2", "C1", "DMC", "SM-UP", "NR"). */
  zoneCode: string;
  family: ZoneFamily;
  /** Governing chapter of Title 23 for the family ("23.45"), "" when unknown. */
  chapter: string;
  residentialCommercial: boolean;
  pedestrian: boolean;
  heightSuffix?: string;
  mha?: "M" | "M1" | "M2";
  majorInstitutionOverlay?: { heightLimit: string; name?: string };
  /** Parenthesised suffixes that are not a known MHA suffix; their standards are not interpreted. */
  unrecognizedSuffixes: string[];
  /** Why the designation is UNKNOWN, or a structured-vs-string disagreement; undefined when clean. */
  parseProblem?: string;
}

const NC_C_PATTERN = /^(NC[123]|C[12])(P)?-(\d+)$/;
const LR_PATTERN = /^(LR[123])( RC)?$/;
const MR_HR_PATTERN = /^(MR|HR)( RC)?$/;
const SM_PATTERN = /^(SM-(?:D|NG|NR|RB|SLU\/R|SLU|U\/R|UP|U))\s+(.+)$/;
const DOWNTOWN_CODES = ["DH1", "DH2", "DMC", "DMR/C", "DMR/R", "DOC1", "DOC2", "DRC", "IDM", "IDR/C", "IDR", "PMM", "PSM"];
const INDUSTRIAL_CODES = ["IB", "IC", "II", "MML", "UI"];

function unknown(raw: string, problem: string): ZoningDesignation {
  return { raw, baseZone: raw.trim(), zoneCode: "", family: ZoneFamily.UNKNOWN, chapter: "", residentialCommercial: false, pedestrian: false, unrecognizedSuffixes: [], parseProblem: problem };
}

/** Pure string parse of a layer `ZONING` value. */
export function parseZoningString(rawInput: string): ZoningDesignation {
  const raw = rawInput.trim();
  if (raw === "") return unknown(rawInput, "empty zoning value");
  let rest = raw;
  let majorInstitutionOverlay: ZoningDesignation["majorInstitutionOverlay"];
  const mio = /^MIO-(\d+(?:\/\d+)?)-(.+)$/.exec(rest);
  if (mio) {
    majorInstitutionOverlay = { heightLimit: mio[1]! };
    rest = mio[2]!.trim();
  }
  let mha: ZoningDesignation["mha"];
  const unrecognizedSuffixes: string[] = [];
  const paren = /\s*\(([^)]*)\)\s*$/.exec(rest);
  if (paren) {
    const inner = paren[1]!.trim();
    if (inner === "M" || inner === "M1" || inner === "M2") mha = inner;
    else unrecognizedSuffixes.push(inner);
    rest = rest.slice(0, paren.index).trim();
  }
  const baseZone = rest;
  const finish = (d: Omit<ZoningDesignation, "raw" | "baseZone" | "unrecognizedSuffixes" | "chapter" | "majorInstitutionOverlay" | "mha">): ZoningDesignation => ({
    raw,
    baseZone,
    chapter: ZONE_FAMILY_INFO[d.family].chapter,
    ...d,
    unrecognizedSuffixes,
    ...(mha ? { mha } : {}),
    ...(majorInstitutionOverlay ? { majorInstitutionOverlay } : {}),
  });

  if (baseZone === "NR") return finish({ zoneCode: "NR", family: ZoneFamily.NR, residentialCommercial: false, pedestrian: false });
  let m = LR_PATTERN.exec(baseZone);
  if (m) return finish({ zoneCode: m[1]!, family: ZoneFamily.LR, residentialCommercial: m[2] !== undefined, pedestrian: false });
  m = MR_HR_PATTERN.exec(baseZone);
  if (m) return finish({ zoneCode: m[1]!, family: m[1] === "MR" ? ZoneFamily.MR : ZoneFamily.HR, residentialCommercial: m[2] !== undefined, pedestrian: false });
  m = NC_C_PATTERN.exec(baseZone);
  if (m) {
    return finish({ zoneCode: m[1]!, family: m[1]!.startsWith("NC") ? ZoneFamily.NC : ZoneFamily.C, residentialCommercial: false, pedestrian: m[2] === "P", heightSuffix: m[3]! });
  }
  m = SM_PATTERN.exec(baseZone);
  if (m) return finish({ zoneCode: m[1]!, family: ZoneFamily.SM, residentialCommercial: false, pedestrian: false, heightSuffix: m[2]!.trim() });
  if (baseZone === "MPC-YT") return finish({ zoneCode: "MPC-YT", family: ZoneFamily.MASTER_PLANNED, residentialCommercial: false, pedestrian: false });
  for (const code of DOWNTOWN_CODES) {
    const tail = tailAfterCode(baseZone, code);
    if (tail !== undefined) return finish({ zoneCode: code, family: ZoneFamily.DOWNTOWN, residentialCommercial: false, pedestrian: false, ...(tail ? { heightSuffix: tail } : {}) });
  }
  for (const code of INDUSTRIAL_CODES) {
    const tail = tailAfterCode(baseZone, code);
    if (tail !== undefined) return finish({ zoneCode: code, family: ZoneFamily.INDUSTRIAL, residentialCommercial: false, pedestrian: false, ...(tail ? { heightSuffix: tail } : {}) });
  }
  return unknown(rawInput, `unrecognized zone "${baseZone}"`);
}

/** The text after `code` when `value` starts with it followed by a separator (space, "-", "/") or ends; else undefined. */
function tailAfterCode(value: string, code: string): string | undefined {
  if (!value.startsWith(code)) return undefined;
  const after = value.slice(code.length);
  if (after === "") return "";
  if (after[0] === " " || after[0] === "-") return after.slice(1).trim();
  if (after[0] === "/") return after.slice(1).trim();
  return undefined;
}

/**
 * Parse with the layer's structured attributes as a cross-check. A disagreement between the string and the
 * attributes about the zone code (or an MHA suffix) makes the designation UNKNOWN: the platform does not pick
 * a winner between two descriptions of the same polygon.
 */
export function parseZoningDesignation(raw: string, attrs?: ZoningLayerAttributes): ZoningDesignation {
  const parsed = parseZoningString(raw);
  if (!attrs || parsed.family === ZoneFamily.UNKNOWN) return parsed;
  const baseFromString = parsed.baseZone;
  if (attrs.baseZone && attrs.baseZone.trim() !== "" && attrs.baseZone.trim() !== baseFromString) {
    return { ...parsed, family: ZoneFamily.UNKNOWN, chapter: "", parseProblem: `zoning "${raw}" disagrees with BASE_ZONE "${attrs.baseZone}"` };
  }
  // Only whether the designation HAS an MHA suffix matters to a development standard (the layer's own
  // MHA_VALUE is occasionally stale about which of M / M1 / M2, e.g. one "MR (M1)" polygon carries "M").
  const mhaAttr = (attrs.mhaValue ?? "").trim();
  const attrHasMha = mhaAttr !== "" && mhaAttr !== "None";
  if (attrs.mhaValue !== undefined && attrs.mhaValue !== null && attrHasMha !== (parsed.mha !== undefined)) {
    return { ...parsed, family: ZoneFamily.UNKNOWN, chapter: "", parseProblem: `zoning "${raw}" disagrees with MHA_VALUE "${mhaAttr}"` };
  }
  // ZONELUT is the zone code without height / RC designators. It is checked for the residential and
  // commercial families whose code it equals; other families publish a coarser or renamed lookup code
  // (MPC-YT -> "MPC", UI -> "UX", DMR/C -> "DMR"), so a mismatch there proves nothing.
  const lut = (attrs.zonelut ?? "").trim();
  const lutCheckedFamilies: ZoneFamily[] = [ZoneFamily.NR, ZoneFamily.LR, ZoneFamily.MR, ZoneFamily.HR, ZoneFamily.NC, ZoneFamily.C];
  if (lut !== "" && lut !== "MIO" && !parsed.majorInstitutionOverlay && lutCheckedFamilies.includes(parsed.family) && lut !== parsed.zoneCode) {
    return { ...parsed, family: ZoneFamily.UNKNOWN, chapter: "", parseProblem: `zoning "${raw}" disagrees with ZONELUT "${lut}"` };
  }
  return parsed;
}

/** True when the designation's development standards can be read as an ordinary (non-MIO) zone of a known family. */
export function isInterpretable(d: ZoningDesignation): boolean {
  return d.family !== ZoneFamily.UNKNOWN && d.parseProblem === undefined;
}

/** Customer-facing zone label, e.g. "LR1 (M)" (the published designation) - never reworded. */
export function zoningLabel(d: ZoningDesignation): string {
  return d.raw;
}
