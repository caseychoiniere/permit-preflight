/**
 * DEV/TEST-ONLY Unit 7 (Fences) preview fixtures. Kept in its own module - with no pipeline, database
 * or other server imports - so the client-side /dev/fence-intake page can use it. Results come from the
 * REAL evaluateFence over in-memory, never-persisted ACTIVE rule objects; evidence is built by the
 * production assembleFenceEvidence. Never import this from customer-facing code.
 */

import { evaluateFence } from "../regulatory-rules-engine/evaluate-fence.js";
import type { FenceProjectDetails } from "../regulatory-rules-engine/fence-types.js";
import { assembleFenceEvidence } from "../report-generation-orchestrator/fence-evidence.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import type { Finding } from "../regulatory-rules-engine/types.js";

const CLEAR_ECA: CriticalAreaFinding[] = [
  { hazardType: "priority_habitat", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "preview fixture" },
  { hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "preview fixture" },
];

export interface FencePreviewReport {
  id: string;
  findings: Finding[];
  evidence: { factType: string; value?: unknown; provenance: { qualityCaveat?: string } }[];
  explanation: null;
  generatedAt: string;
}

// ---------------------------------------------------------------------------------------------
// Unit 7 (Fences) - same discipline: results come from the REAL evaluateFence over in-memory,
// never-persisted ACTIVE rule objects, and the evidence is built by the pipeline's own
// assembleFenceEvidence. The specifications below are asserted equal to the real governance
// candidates' (tests/dev-preview/report-preview.test.ts) so they cannot drift.
// ---------------------------------------------------------------------------------------------

export const FENCE_PREVIEW_RULE_SPECS: Record<string, Record<string, unknown>> = {
  FENCE_F1_HEIGHT_LIMIT_STANDARD: { maxFt: 6, openFeatureAllowanceFt: 2, absoluteMaxFt: 8 },
  FENCE_F2_HEIGHT_LIMIT_FRONT_STREET_SIDE: { maxFt: 4, absoluteMaxFt: 6 },
  FENCE_F3_RETAINING_WALL: { fenceOnWallMaxFt: 4, combinedMaxFt: 9.5, raisingGradeWallMaxFt: 6, cutWallFenceSetbackFt: 3 },
  FENCE_F4_OUTSIDE_REQUIRED_SETBACKS: { generalStructureHeightLimitFt: 32 },
  FENCE_F5_PERMIT_HEIGHT_EXEMPTION: { maxFt: 8 },
  FENCE_F6_PERMIT_MASONRY_CONCRETE: { elementsAboveFt: 6 },
  FENCE_F7_EXEMPTION_NOT_ZONING_COMPLIANCE: {},
  FENCE_F8_PERMIT_FLOOD_PRONE_CONDITION: {},
};

export interface FencePreviewScenarioDefinition {
  id: string;
  group: "Unit 7 - Fences";
  title: string;
  /** Rule types ACTIVE for this scenario; omitted = all eight. */
  activeRuleTypes?: string[];
  project: Partial<FenceProjectDetails>;
  expected: { buildingPermit?: string; uncovered?: string[]; subjects?: Record<string, string> };
}

export const FENCE_PREVIEW_SCENARIOS: FencePreviewScenarioDefinition[] = [
  {
    id: "fence-flood-only",
    group: "Unit 7 - Fences",
    title: "5 ft side/rear fence - turns only on flood-prone status",
    project: { heightFt: 5, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] },
    expected: { buildingPermit: "REQUIRES_VERIFICATION", subjects: { "Fence height (side or rear setback)": "KNOWN/PASS" } },
  },
  {
    id: "fence-front-over-limit",
    group: "Unit 7 - Fences",
    title: "5 ft fence in the front setback (over the 4 ft limit)",
    project: { heightFt: 5, locations: ["FRONT_SETBACK"] },
    expected: { buildingPermit: "REQUIRES_VERIFICATION", subjects: { "Fence height (front setback)": "KNOWN/FAIL", "Sight-distance requirements (corner lot, driveway, alley)": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "fence-permit-required",
    group: "Unit 7 - Fences",
    title: "9 ft fence outside required setbacks (permit required)",
    project: { heightFt: 9, locations: ["OUTSIDE_REQUIRED_SETBACKS"], hasMasonryOrConcreteAbove6Ft: false },
    expected: { buildingPermit: "REQUIRED", subjects: { "Fence height (outside required setbacks)": "KNOWN/PASS" } },
  },
  {
    id: "fence-wall-combined-over",
    group: "Unit 7 - Fences",
    title: "4 ft fence on a 6 ft raising-grade wall (combined height over 9.5 ft)",
    project: { heightFt: 4, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], wallRelation: "ON_NEW_WALL_RAISING_GRADE", wallHeightFt: 6 },
    expected: { buildingPermit: "REQUIRES_VERIFICATION", subjects: { "Fence and retaining wall or bulkhead": "KNOWN/FAIL" } },
  },
  {
    id: "fence-trellis-unresolved",
    group: "Unit 7 - Fences",
    title: "6 ft fence with a 2 ft trellis (predominantly open is SDCI's call)",
    project: { heightFt: 6, openFeatureHeightFt: 2, locations: ["OTHER_SIDE_OR_REAR_SETBACK"] },
    expected: { buildingPermit: "REQUIRES_VERIFICATION", subjects: { "Fence height (side or rear setback)": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "fence-uncovered-claims",
    group: "Unit 7 - Fences",
    title: "Only the side/rear height rule is ACTIVE (other claims not screened)",
    activeRuleTypes: ["FENCE_F1_HEIGHT_LIMIT_STANDARD"],
    project: { heightFt: 5, locations: ["FRONT_SETBACK", "OTHER_SIDE_OR_REAR_SETBACK"] },
    expected: { uncovered: ["fence height (front setback)", "fence building permit"], subjects: { "Fence height (side or rear setback)": "KNOWN/PASS" } },
  },
];

export function buildFencePreviewReport(scenario: FencePreviewScenarioDefinition): FencePreviewReport {
  const project: FenceProjectDetails = { projectType: "fence", heightFt: 6, locations: ["OTHER_SIDE_OR_REAR_SETBACK"], siteSlopes: false, wallRelation: "NONE", ...scenario.project };
  return buildFenceReportForProject(project, scenario.id, scenario.activeRuleTypes);
}

/** Any fence declaration -> the report the production evaluator and evidence builder would produce
 * with the given (default: all eight) rules ACTIVE. Used by the scenario list and by the dev-only
 * /dev/fence-intake page, which feeds it the real intake form's validated output. */
export function buildFenceReportForProject(project: FenceProjectDetails, id = "custom", activeRuleTypes?: string[]): FencePreviewReport {
  const types = activeRuleTypes ?? Object.keys(FENCE_PREVIEW_RULE_SPECS);
  const rules: RegulatoryRule[] = types.map((ruleType) => ({
    id: `preview-only-${ruleType}`,
    subject: `PREVIEW-ONLY (never persisted): ${ruleType}`,
    applicableProjectType: "fence",
    applicableZone: "NR",
    ruleSpecification: { ruleType, ...FENCE_PREVIEW_RULE_SPECS[ruleType] },
    citation: { smcSections: [] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: [],
  }));
  const outcome = evaluateFence({ project, candidateActiveRules: rules, ecaFindings: CLEAR_ECA });
  return {
    id: `preview-${id}`,
    findings: outcome.findings,
    evidence: [{ factType: "environmental-constraints", value: CLEAR_ECA, provenance: {} }, ...assembleFenceEvidence(outcome)] as FencePreviewReport["evidence"],
    explanation: null,
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Shape `renderReportHtml` reads (EvidenceReportArtifactRow), built from the same preview report so web and PDF render identical data. */
export function toFencePreviewArtifactRow(report: FencePreviewReport) {
  return {
    id: report.id,
    screeningRequestId: "preview",
    reportGenerationJobId: "preview",
    findings: report.findings,
    evidence: report.evidence,
    explanation: report.explanation,
    ruleVersionsUsed: [],
    dataRetrievalTimestamps: {},
    generatedAt: new Date(report.generatedAt),
  };
}
