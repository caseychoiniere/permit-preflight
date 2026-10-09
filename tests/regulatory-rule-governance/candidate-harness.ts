/** Shared harness for the zone-scoped candidate tests: runs one declared case through the real evaluator and the real zone resolver. */
import { draft } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";
import { evaluateDeck } from "../../src/regulatory-rules-engine/evaluate-deck.js";
import { evaluateFence } from "../../src/regulatory-rules-engine/evaluate-fence.js";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import type { ProjectDetails } from "../../src/regulatory-rules-engine/types.js";
import { singleZoneContext } from "../../src/zoning/context.js";

export const SHED_BASE = { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 8, alleyAdjacent: false, distanceToRearLotLineFt: 30, distanceToSideLotLineFt: 15, distanceToFrontLotLineFt: 50, distanceToDwellingFt: 20, parcelAreaSqFt: 5000, isInRequiredSetback: false };
export const GARAGE_BASE = { projectType: "garage", widthFt: 12, depthFt: 20, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 30, distanceToSideLotLineFt: 15, distanceToFrontLotLineFt: 50, parcelAreaSqFt: 5000, isInRequiredSetback: false };
export const FENCE_BASE = { projectType: "fence", heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], siteSlopes: false, wallRelation: "NONE" };
export const DECK_BASE = { projectType: "deck", heightAboveGradeIn: 24, widthFt: 10, depthFt: 10, attachment: "DETACHED", buildingRelation: "OPEN_GROUND_BELOW", setbackLocations: ["SIDE_SETBACK"] };

export const asActive = (cands: DraftedRuleInput[], ids: Record<string, string>): RegulatoryRule[] =>
  cands.map((c) => ({ ...draft(c), id: ids[c.id]!, lifecycleState: "ACTIVE", acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"] }));

export const oc = (f: { classification: string; complianceOutcome?: string }) => `${f.classification}${f.complianceOutcome ? "/" + f.complianceOutcome : ""}`;

export function evaluateCandidateCase(projectType: string, rules: RegulatoryRule[], project: Record<string, unknown>, zoning: string) {
  const zoningContext = singleZoneContext(zoning);
  if (projectType === "fence") return evaluateFence({ project: { ...FENCE_BASE, ...project } as never, candidateActiveRules: rules, ecaFindings: [], zoningContext });
  if (projectType === "deck") return evaluateDeck({ project: { ...DECK_BASE, ...project } as never, candidateActiveRules: rules, zoningContext });
  const base = projectType === "garage" ? GARAGE_BASE : SHED_BASE;
  return evaluateProject({
    propertyContext: { parcelId: "t", assembledAt: "2026-01-01T00:00:00.000Z", facts: [] },
    project: { ...base, ...project } as unknown as ProjectDetails,
    candidateActiveRules: rules,
    ecaFindings: [],
    candidateActiveInferencePolicies: [],
    zoningContext,
  });
}

export function findCaseFinding(o: ReturnType<typeof evaluateCandidateCase>, finding: string, ruleRowId: string) {
  return finding === "Accessory structure height limit"
    ? (o as { accessoryHeightLimitFinding?: { classification: string; complianceOutcome?: string } }).accessoryHeightLimitFinding
    : o.findings.find((f) => f.subject.includes(finding) && f.appliedRule?.id === ruleRowId);
}
