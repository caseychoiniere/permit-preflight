/**
 * REAL governance candidates for the COMMERCIAL 2 (C2) zone, for shed, detached garage, fence and deck (2026-10-09). Chapter 23.47A states the setback (23.47A.014), height
 * (23.47A.012), floor area ratio (23.47A.013) and fence/deck (23.47A.014.G) standards for NC and C zones alike, with no C2-specific variation (read live from Municode, version
 * Sep 25 2026, Ord. 127375/127376); the parking location and access rule (23.47A.032.A.3 and B.3) treats a C structure with a residential use like an NC structure and says so in
 * the garage row's text. Each row is therefore the Neighborhood Commercial / Commercial 1 row for the same claim, scoped to C2 only and re-verified against the same text.
 *
 * What is NOT the same: residential use is a CONDITIONAL use in C2 (23.47A.004 Table A row J, footnote 15). A dwelling in C2 may be a conditional use, a legal nonconforming
 * use (expansion limited, SMC 23.42.100-23.42.112) or neither, and an accessory structure to it can depend on that. Every C2 report therefore carries a REQUIRES_VERIFICATION
 * finding "Residential use in a Commercial 2 zone" (src/zoning/findings.ts), and ADUs stay unsupported in C2 (their eligibility message says why). Tier 1; lifecycle script
 * advances to APPROVED.
 */
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { allCommercialCandidates } from "./commercial-candidates.js";
import { mfRowId } from "./multifamily-candidates.js";

const C2_ZONING = "C2-40 (M)";
const RESTATE = (s: string): string => s.replace(/Neighborhood Commercial and Commercial 1 zones/g, "Commercial 2 (C2) zones").replace(/Neighborhood Commercial and Commercial zones/g, "Commercial 2 (C2) zones").replace(/Neighborhood Commercial or Commercial zone/g, "Commercial 2 (C2) zone");

export const allCommercialC2Candidates: DraftedRuleInput[] = allCommercialCandidates.map(
  (c): DraftedRuleInput => ({
    ...c,
    id: `${c.id}-c2`,
    subject: RESTATE(c.subject),
    applicableZone: "C2",
    caveats: [
      ...c.caveats,
      {
        category: "residential use is a conditional use in C2",
        description:
          "Residential uses are conditional uses in C2 zones (SMC 23.47A.004 Table A row J, footnote 15). Whether a dwelling on the lot was approved as one, is a legal nonconforming use (SMC 23.42.100-23.42.112 limit expansion), or is neither is not checked; the report states this as a REQUIRES_VERIFICATION finding.",
        affectedConditionOrInterpretation: "SMC 23.47A.004; SMC 23.42.100-23.42.112",
        sourceReferences: ["SMC 23.47A.004 Table A", "SMC 23.42.104", "SMC 23.42.106"],
        resolutionStatus: "Resolved by design.",
      },
    ],
    testCases: (c.testCases as unknown as { input: { project: Record<string, unknown>; zoning?: string } }[]).map((t) => ({ ...t, input: { ...t.input, zoning: C2_ZONING } })) as never,
  })
);
export const shedCommercialC2Candidates = allCommercialC2Candidates.filter((c) => c.applicableProjectType === "shed");
export const garageCommercialC2Candidates = allCommercialC2Candidates.filter((c) => c.applicableProjectType === "garage");
export const fenceCommercialC2Candidates = allCommercialC2Candidates.filter((c) => c.applicableProjectType === "fence");
export const deckCommercialC2Candidates = allCommercialC2Candidates.filter((c) => c.applicableProjectType === "deck");
export const COMMERCIAL_C2_FIXED_ROW_IDS: Record<string, string> = Object.fromEntries(allCommercialC2Candidates.map((c) => [c.id, mfRowId(c.id)]));
