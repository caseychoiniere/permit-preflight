/**
 * Zone scope of a regulatory rule (citywide zoning coverage, 2026-10-09). Pure.
 *
 * A rule row's `applicableZone` text column was always descriptive ("NR"). It is now the rule's ZONE SCOPE: a
 * comma-separated list of tokens saying which zoning designations the rule governs.
 *
 *   ALL            every zone (used only for rules the code genuinely applies everywhere)
 *   <FAMILY>       NR, LR, MR, HR, NC, C, SM, DOWNTOWN, INDUSTRIAL, MASTER_PLANNED
 *   MULTIFAMILY    alias for LR, MR and HR (Chapter 23.45 governs all three)
 *   <ZONE CODE>    LR1, LR2, LR3, NC1, NC2, NC3, C1, C2, SM-UP, DMC, ...
 *   <token>:MHA    only designations that carry a Mandatory Housing Affordability suffix (M, M1, M2)
 *   <token>:NO_MHA only designations that do not
 *
 * Rows whose standards differ by zone are separate rows with separate scopes; a spec never carries a per-zone parameter
 * table. That keeps "do two zones get the same rule" a question about row identity, which is what the resolver tests.
 * An unrecognized token matches nothing (fail closed) and is reported by `validateZoneScope`.
 */

import { ZoneFamily } from "./designation.js";
import type { ZoningDesignation } from "./designation.js";

export type ZoneScopeToken =
  | { kind: "ALL" }
  | { kind: "FAMILY"; families: ZoneFamily[]; mha?: boolean; text: string }
  | { kind: "CODE"; code: string; mha?: boolean; text: string };

/** Every zone code the designation parser can emit; a scope token that is neither a family nor one of these is invalid. */
export const KNOWN_ZONE_CODES: ReadonlySet<string> = new Set([
  "NR",
  "LR1",
  "LR2",
  "LR3",
  "MR",
  "HR",
  "NC1",
  "NC2",
  "NC3",
  "C1",
  "C2",
  "SM-D",
  "SM-NG",
  "SM-NR",
  "SM-RB",
  "SM-SLU",
  "SM-SLU/R",
  "SM-U",
  "SM-U/R",
  "SM-UP",
  "DH1",
  "DH2",
  "DMC",
  "DMR/C",
  "DMR/R",
  "DOC1",
  "DOC2",
  "DRC",
  "IDM",
  "IDR",
  "IDR/C",
  "PMM",
  "PSM",
  "IB",
  "IC",
  "II",
  "MML",
  "UI",
  "MPC-YT",
]);

const FAMILY_TOKENS: Record<string, ZoneFamily[]> = {
  NR: [ZoneFamily.NR],
  LR: [ZoneFamily.LR],
  MR: [ZoneFamily.MR],
  HR: [ZoneFamily.HR],
  NC: [ZoneFamily.NC],
  C: [ZoneFamily.C],
  SM: [ZoneFamily.SM],
  DOWNTOWN: [ZoneFamily.DOWNTOWN],
  INDUSTRIAL: [ZoneFamily.INDUSTRIAL],
  MASTER_PLANNED: [ZoneFamily.MASTER_PLANNED],
  MULTIFAMILY: [ZoneFamily.LR, ZoneFamily.MR, ZoneFamily.HR],
};

export interface ParsedZoneScope {
  tokens: ZoneScopeToken[];
  /** Token texts that are not a family, an alias or a known zone code. */
  invalid: string[];
}

export function parseZoneScope(applicableZone: string): ParsedZoneScope {
  const tokens: ZoneScopeToken[] = [];
  const invalid: string[] = [];
  for (const raw of applicableZone.split(",")) {
    const text = raw.trim();
    if (text === "") continue;
    if (text === "ALL") {
      tokens.push({ kind: "ALL" });
      continue;
    }
    let base = text;
    let mha: boolean | undefined;
    const colon = text.lastIndexOf(":");
    if (colon > 0) {
      const qualifier = text.slice(colon + 1);
      base = text.slice(0, colon);
      if (qualifier === "MHA") mha = true;
      else if (qualifier === "NO_MHA") mha = false;
      else {
        invalid.push(text);
        continue;
      }
    }
    // A family token wins over a code of the same spelling (NR, MR, HR are both); they select the same designations.
    if (FAMILY_TOKENS[base]) tokens.push({ kind: "FAMILY", families: FAMILY_TOKENS[base]!, ...(mha !== undefined ? { mha } : {}), text });
    else if (KNOWN_ZONE_CODES.has(base)) tokens.push({ kind: "CODE", code: base, ...(mha !== undefined ? { mha } : {}), text });
    else invalid.push(text);
  }
  return { tokens, invalid };
}

/** Problems with a scope string: empty, or containing an unrecognized token. Used by rule-authoring checks and tests. */
export function validateZoneScope(applicableZone: string): string[] {
  const { tokens, invalid } = parseZoneScope(applicableZone);
  const problems = invalid.map((t) => `unrecognized zone scope token "${t}"`);
  if (tokens.length === 0 && invalid.length === 0) problems.push("empty zone scope");
  return problems;
}

/**
 * Does `scope` cover `zone`? An MHA-qualified token cannot be decided for a designation with an unrecognized parenthesised
 * suffix (an older incentive suffix such as "LR2 (0.75)"), so it does not match - the claim becomes unscreenable for that
 * zone instead of being answered for the wrong one.
 */
export function zoneInScope(scope: ParsedZoneScope, zone: ZoningDesignation): boolean {
  if (zone.family === ZoneFamily.UNKNOWN) return false;
  for (const token of scope.tokens) {
    if (token.kind === "ALL") return true;
    const mhaOk = (): boolean => {
      if (token.mha === undefined) return true;
      if (zone.unrecognizedSuffixes.length > 0) return false;
      return token.mha === (zone.mha !== undefined);
    };
    if (token.kind === "FAMILY" && token.families.includes(zone.family) && mhaOk()) return true;
    if (token.kind === "CODE" && token.code === zone.zoneCode && mhaOk()) return true;
  }
  return false;
}
