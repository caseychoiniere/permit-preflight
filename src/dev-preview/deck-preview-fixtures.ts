/**
 * DEV/TEST-ONLY Unit 8 (Decks) preview fixtures. Own module with no pipeline/database/server imports
 * (so the client-side /dev/deck-intake page can use it). Results come from the REAL evaluateDeck over
 * in-memory, never-persisted ACTIVE rule objects; evidence is built by the production
 * assembleDeckEvidence. Never import this from customer-facing code.
 */

import { evaluateDeck } from "../regulatory-rules-engine/evaluate-deck.js";
import type { DeckProjectDetails } from "../regulatory-rules-engine/deck-types.js";
import { assembleDeckEvidence } from "../report-generation-orchestrator/deck-evidence.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";
import type { Finding } from "../regulatory-rules-engine/types.js";

const CLEAR_ECA: CriticalAreaFinding[] = [
  { hazardType: "priority_habitat", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "preview fixture" },
  { hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "preview fixture" },
];

export interface DeckPreviewReport {
  id: string;
  findings: Finding[];
  evidence: { factType: string; value?: unknown; provenance: { qualityCaveat?: string } }[];
  explanation: null;
  generatedAt: string;
}

/** Asserted equal to the real governance candidates' specifications by tests/dev-preview/deck-report-preview.test.ts. */
export const DECK_PREVIEW_RULE_SPECS: Record<string, Record<string, unknown>> = {
  DECK_D1_SETBACK_HEIGHT_ALLOWANCE: { allowedInSetbackMaxIn: 18, rearSetbackAllowance: { minDistanceFromRearLotLineFt: 5, maxHeightFt: 12, minSeparationFromDwellingFt: 3 } },
  DECK_D2_LOT_COVERAGE_THRESHOLD: { notCountedMaxHeightIn: 36 },
  DECK_D3_PERMIT_EXEMPTION: { maxHeightIn: 18 },
  DECK_D4_STFI_ELIGIBILITY: { maxHeightAboveGroundFt: 8, beamLengthDisqualifyingFt: 14, maxAreaSqFt: 750 },
  DECK_D5_ECA_CONDITION: {},
  DECK_D6_EXEMPTION_NOT_ZONING_COMPLIANCE: {},
};

export interface DeckPreviewScenarioDefinition {
  id: string;
  group: "Unit 8 - Decks";
  title: string;
  /** Rule types ACTIVE for this scenario; omitted = all six. */
  activeRuleTypes?: string[];
  project: Partial<DeckProjectDetails>;
  expected: { buildingPermit?: string; reviewPath?: string; uncovered?: string[]; subjects?: Record<string, string> };
}

export const DECK_PREVIEW_SCENARIOS: DeckPreviewScenarioDefinition[] = [
  {
    id: "deck-low-eca-only",
    group: "Unit 8 - Decks",
    title: "12 in deck in the side setback - turns only on ECA status",
    project: { heightAboveGradeIn: 12, setbackLocations: ["SIDE_SETBACK"] },
    expected: { buildingPermit: "REQUIRES_VERIFICATION", subjects: { "Deck setback (side setback)": "KNOWN/PASS", "Deck and lot coverage": "KNOWN" } },
  },
  {
    id: "deck-high-front",
    group: "Unit 8 - Decks",
    title: "40 in deck in the front setback (no automatic allowance; counts toward lot coverage)",
    project: { heightAboveGradeIn: 40, setbackLocations: ["FRONT_SETBACK"], solidFlooring: false, longestBeamFt: 10 },
    expected: { buildingPermit: "REQUIRED", reviewPath: "REQUIRES_VERIFICATION", subjects: { "Deck setback (front setback)": "REQUIRES_VERIFICATION", "Deck and lot coverage": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "deck-rear-allowance",
    group: "Unit 8 - Decks",
    title: "30 in detached deck in the rear setback (rear-setback allowance appears met)",
    project: { heightAboveGradeIn: 30, attachment: "DETACHED", setbackLocations: ["REAR_SETBACK"], distanceFromRearLotLineFt: 6, distanceFromDwellingFt: 8, solidFlooring: false, longestBeamFt: 12 },
    expected: { buildingPermit: "REQUIRED", reviewPath: "REQUIRES_VERIFICATION", subjects: { "Deck setback (rear setback)": "REQUIRES_VERIFICATION" } },
  },
  {
    id: "deck-roof",
    group: "Unit 8 - Decks",
    title: "Roof deck (permit required, full review)",
    project: { heightAboveGradeIn: 100, attachment: "ATTACHED_TO_DWELLING", buildingRelation: "ROOF_DECK", setbackLocations: ["OUTSIDE_REQUIRED_SETBACKS"], solidFlooring: true, longestBeamFt: 8 },
    expected: { buildingPermit: "REQUIRED", reviewPath: "FULL_REVIEW_LIKELY", subjects: { "Deck setback (outside required setbacks)": "KNOWN/PASS" } },
  },
  {
    id: "deck-uncovered-claims",
    group: "Unit 8 - Decks",
    title: "Only the setback rule is ACTIVE (other claims not screened)",
    activeRuleTypes: ["DECK_D1_SETBACK_HEIGHT_ALLOWANCE"],
    project: { heightAboveGradeIn: 12, setbackLocations: ["SIDE_SETBACK"] },
    expected: { uncovered: ["deck lot coverage", "deck building permit"], subjects: { "Deck setback (side setback)": "KNOWN/PASS" } },
  },
];

export function buildDeckPreviewReport(scenario: DeckPreviewScenarioDefinition): DeckPreviewReport {
  const project: DeckProjectDetails = {
    projectType: "deck",
    heightAboveGradeIn: 24,
    widthFt: 10,
    depthFt: 12,
    attachment: "DETACHED",
    buildingRelation: "OPEN_GROUND_BELOW",
    setbackLocations: ["SIDE_SETBACK"],
    ...scenario.project,
  };
  return buildDeckReportForProject(project, scenario.id, scenario.activeRuleTypes);
}

/** Any deck declaration -> the report the production evaluator and evidence builder would produce with
 * the given (default: all six) rules ACTIVE; used by the scenarios and by /dev/deck-intake. */
export function buildDeckReportForProject(project: DeckProjectDetails, id = "custom", activeRuleTypes?: string[]): DeckPreviewReport {
  const types = activeRuleTypes ?? Object.keys(DECK_PREVIEW_RULE_SPECS);
  const rules: RegulatoryRule[] = types.map((ruleType) => ({
    id: `preview-only-${ruleType}`,
    subject: `PREVIEW-ONLY (never persisted): ${ruleType}`,
    applicableProjectType: "deck",
    applicableZone: "NR",
    ruleSpecification: { ruleType, ...DECK_PREVIEW_RULE_SPECS[ruleType] },
    citation: { smcSections: [] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: [],
  }));
  const outcome = evaluateDeck({ project, candidateActiveRules: rules });
  return {
    id: `preview-${id}`,
    findings: outcome.findings,
    evidence: [{ factType: "environmental-constraints", value: CLEAR_ECA, provenance: {} }, ...assembleDeckEvidence(outcome)] as DeckPreviewReport["evidence"],
    explanation: null,
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function toDeckPreviewArtifactRow(report: DeckPreviewReport) {
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
