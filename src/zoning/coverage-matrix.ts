/**
 * The project type x zone coverage matrix (citywide zoning coverage, 2026-10-09). Pure. It is DERIVED from the rule rows, never hand-maintained: a claim is
 * covered for a zone when a rule of one of its rule types governs that zone, resolved by the same resolver the engine uses. The only hand-written input is the
 * list of combinations the governing code makes genuinely inapplicable (NOT_APPLICABLE), each with its citation - "not built yet" is never NOT_APPLICABLE.
 *
 *   SUPPORTED            every core claim is covered (the minimum useful report; some findings may still be REQUIRES_VERIFICATION)
 *   PARTIALLY_SUPPORTED  some, not all, core claims are covered
 *   NOT_APPLICABLE       the governing code makes the project/use inapplicable in this context
 *   NOT_YET_SUPPORTED    a product limitation: no core claim is covered
 */

import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { CORE_CLAIMS } from "./core-claims.js";
import type { CoreProjectType } from "./core-claims.js";
import { singleZoneContext } from "./context.js";
import { ZONE_FAMILY_INFO } from "./designation.js";
import type { ZoneFamily } from "./designation.js";
import { parseZoningString } from "./designation.js";
import { resolveApplicableRules } from "./resolve.js";

export type CoverageStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_APPLICABLE" | "NOT_YET_SUPPORTED";

export interface ClaimDefinition {
  claim: string;
  anyOfRuleTypes: string[];
  core: boolean;
}

/** Every zone-specific claim a screening can make, per project type (the core claims first). */
export const CLAIM_CATALOG: Record<CoreProjectType, ClaimDefinition[]> = {
  shed: [
    ...CORE_CLAIMS.shed.map((c) => ({ ...c, core: true })),
    { claim: "separation from the house", anyOfRuleTypes: ["DWELLING_SEPARATION", "MF_ACC_SEPARATION"], core: false },
    {
      claim: "lot coverage or floor area ratio",
      anyOfRuleTypes: ["SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM", "MF_FAR", "COMM_FAR_NOTE"],
      core: false,
    },
    { claim: "building-permit determination", anyOfRuleTypes: ["SHED_PERMIT_P1_ROOF_AREA"], core: false },
  ],
  garage: [
    ...CORE_CLAIMS.garage.map((c) => ({ ...c, core: true })),
    { claim: "lot coverage or floor area ratio", anyOfRuleTypes: ["LOT_COVERAGE", "MF_FAR", "COMM_FAR_NOTE"], core: false },
    { claim: "garage access and driveway", anyOfRuleTypes: ["MF_GARAGE_PARKING_ACCESS", "COMM_GARAGE_PARKING_ACCESS"], core: false },
  ],
  fence: [
    ...CORE_CLAIMS.fence.map((c) => ({ ...c, core: true })),
    { claim: "fence height outside required setbacks", anyOfRuleTypes: ["FENCE_F4_OUTSIDE_REQUIRED_SETBACKS"], core: false },
    { claim: "fence on a retaining wall", anyOfRuleTypes: ["FENCE_F3_RETAINING_WALL"], core: false },
    { claim: "building-permit determination", anyOfRuleTypes: ["FENCE_F5_PERMIT_HEIGHT_EXEMPTION"], core: false },
  ],
  deck: [
    ...CORE_CLAIMS.deck.map((c) => ({ ...c, core: true })),
    { claim: "lot coverage", anyOfRuleTypes: ["DECK_D2_LOT_COVERAGE_THRESHOLD", "DECK_MF_NO_LOT_COVERAGE_LIMIT"], core: false },
    { claim: "building-permit determination", anyOfRuleTypes: ["DECK_D3_PERMIT_EXEMPTION"], core: false },
  ],
  adu: [
    ...CORE_CLAIMS.adu.map((c) => ({ ...c, core: true })),
    { claim: "size limit", anyOfRuleTypes: ["ADU_A2_SIZE_LIMIT"], core: false },
    { claim: "separation between structures", anyOfRuleTypes: ["ADU_A4_SEPARATION"], core: false },
    { claim: "lot coverage", anyOfRuleTypes: ["ADU_A6_LOT_COVERAGE"], core: false },
    { claim: "floor area ratio", anyOfRuleTypes: ["ADU_A7_FLOOR_AREA_RATIO"], core: false },
    { claim: "amenity area", anyOfRuleTypes: ["ADU_A8_AMENITY_AREA"], core: false },
    { claim: "trees", anyOfRuleTypes: ["ADU_A9_TREES"], core: false },
    { claim: "design standards", anyOfRuleTypes: ["ADU_A10_DESIGN_STANDARDS"], core: false },
  ],
};

/** Combinations the governing code makes inapplicable. Each needs a citation; leave empty rather than guess. */
export interface NotApplicableDeclaration {
  projectType: CoreProjectType;
  family: ZoneFamily;
  reason: string;
  citation: string;
}
export const NOT_APPLICABLE: NotApplicableDeclaration[] = [];

export interface MatrixCell {
  projectType: CoreProjectType;
  zoneCode: string;
  family: ZoneFamily;
  /** A designation used to resolve the cell (the zone code with a representative suffix). */
  example: string;
  status: CoverageStatus;
  claims: { claim: string; core: boolean; covered: boolean }[];
  notApplicable?: { reason: string; citation: string };
}

export interface BuildMatrixInput {
  /** Rules treated as ACTIVE (the caller chooses: the live ACTIVE set, or ACTIVE plus APPROVED to show what activation would deliver). */
  rules: RegulatoryRule[];
  /** Representative designations, one per zone code worth reporting (e.g. "LR1 (M)"). */
  zones: string[];
}

const ruleTypeOf = (r: RegulatoryRule): string | undefined => (r.ruleSpecification as { ruleType?: string }).ruleType;

export function buildCoverageMatrix(input: BuildMatrixInput): MatrixCell[] {
  const cells: MatrixCell[] = [];
  const projectTypes = Object.keys(CLAIM_CATALOG) as CoreProjectType[];
  for (const example of input.zones) {
    const d = parseZoningString(example);
    for (const projectType of projectTypes) {
      const projectRules = input.rules.filter((r) => r.applicableProjectType === projectType).map((r) => ({ ...r, lifecycleState: "ACTIVE" as const }));
      const resolved = resolveApplicableRules({ zoning: singleZoneContext(example), candidateRules: projectRules });
      const types = new Set(resolved.rules.map(ruleTypeOf));
      const claims = CLAIM_CATALOG[projectType].map((c) => ({ claim: c.claim, core: c.core, covered: c.anyOfRuleTypes.some((t) => types.has(t)) }));
      const core = claims.filter((c) => c.core);
      const na = NOT_APPLICABLE.find((n) => n.projectType === projectType && n.family === d.family);
      const status: CoverageStatus = na ? "NOT_APPLICABLE" : core.every((c) => c.covered) ? "SUPPORTED" : core.some((c) => c.covered) ? "PARTIALLY_SUPPORTED" : "NOT_YET_SUPPORTED";
      cells.push({ projectType, zoneCode: d.zoneCode, family: d.family, example, status, claims, ...(na ? { notApplicable: { reason: na.reason, citation: na.citation } } : {}) });
    }
  }
  return cells;
}

export function renderCoverageMatrixMarkdown(live: MatrixCell[], planned: MatrixCell[], generatedAt: string): string {
  const types = Object.keys(CLAIM_CATALOG) as CoreProjectType[];
  const zones = [...new Set(live.map((c) => c.zoneCode))];
  const cell = (cells: MatrixCell[], z: string, t: CoreProjectType): MatrixCell => cells.find((c) => c.zoneCode === z && c.projectType === t)!;
  const mark: Record<CoverageStatus, string> = { SUPPORTED: "SUPPORTED", PARTIALLY_SUPPORTED: "PARTIAL", NOT_APPLICABLE: "N/A", NOT_YET_SUPPORTED: "not yet" };
  const lines: string[] = [];
  lines.push("# Zoning coverage matrix (project type x zone)");
  lines.push("");
  lines.push(`Generated ${generatedAt} from the rule rows by scripts/zoning-coverage-matrix.ts. Do not edit by hand: re-run the script. The machine-readable form is zoning-coverage-matrix.json.`);
  lines.push("");
  lines.push("Statuses: SUPPORTED = every core claim is covered (the minimum useful report; individual findings can still be REQUIRES_VERIFICATION); PARTIAL = some core claims; N/A = the governing code makes the project inapplicable in that zone (never used for 'not built yet'); not yet = a product limitation.");
  lines.push("");
  const table = (cells: MatrixCell[], title: string): void => {
    lines.push(`## ${title}`);
    lines.push("");
    lines.push(`| Zone | Family | ${types.join(" | ")} |`);
    lines.push(`| --- | --- | ${types.map(() => "---").join(" | ")} |`);
    for (const z of zones) {
      const first = cell(cells, z, types[0]!);
      lines.push(`| ${z} | ${ZONE_FAMILY_INFO[first.family].name} | ${types.map((t) => mark[cell(cells, z, t).status]).join(" | ")} |`);
    }
    lines.push("");
  };
  table(live, "Live: governed by ACTIVE rules today (purchase is allowed only where a project type is SUPPORTED)");
  table(planned, "After activation: ACTIVE plus APPROVED rules (what activating the approved set would deliver)");
  lines.push("## Claim detail for the planned view");
  lines.push("");
  for (const t of types) {
    lines.push(`### ${t}`);
    lines.push("");
    lines.push(`| Zone | ${CLAIM_CATALOG[t].map((c) => `${c.claim}${c.core ? " (core)" : ""}`).join(" | ")} |`);
    lines.push(`| --- | ${CLAIM_CATALOG[t].map(() => "---").join(" | ")} |`);
    for (const z of zones) lines.push(`| ${z} | ${cell(planned, z, t).claims.map((c) => (c.covered ? "yes" : "-")).join(" | ")} |`);
    lines.push("");
  }
  return lines.join("\n");
}
