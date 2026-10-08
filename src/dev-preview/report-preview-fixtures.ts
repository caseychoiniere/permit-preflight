/**
 * DEV/TEST-ONLY report-preview fixtures (Unit 6B). Produces representative report objects for
 * the dormant Unit 6B result sections (Building permit, Estimated lot coverage, P2b height
 * finding) so web (ReportView) and PDF (renderReportHtml) rendering can be inspected before any
 * rule is activated.
 *
 * Every result shape here comes from the REAL production evaluator (`evaluateProject`) run over
 * in-memory, never-persisted, `isTestOnlyFixture: true` ACTIVE rule objects. The active set is the
 * MVP set: every Unit 6B rule EXCEPT the discretionary Tier-2 rules P6 and C1e-director (2026-10-07
 * founder decision), so previews show exactly what a customer would see on activation of the
 * deterministic set. Nothing here reads
 * or writes the database, touches regulatory lifecycle state, or bypasses production evaluation;
 * the fixtures only stand in for the ACTIVE-rule input that the database would supply once rules
 * are activated. Findings are assembled with the same `assembleFindingsToPersist` the pipeline
 * uses. Never import this module from customer-facing code.
 */

import { evaluateProject } from "../regulatory-rules-engine/evaluate.js";
import { assembleFindingsToPersist, permitRequirementEvidenceEntry, existingStructureCoverageEvidenceEntry, shedLotCoverageEvidenceEntry } from "../report-generation-orchestrator/pipeline.js";
import { buildExistingStructureCoverageFact } from "../property-intelligence/existing-structures.js";
import type { EcaLotAreaAdjustment, ShedProjectDetails } from "../regulatory-rules-engine/types.js";
import type { PropertyContext } from "../property-intelligence/types.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import type { CriticalAreaFinding } from "../spatial-analysis/types.js";

const CONSTITUENT_RULE_TYPES = [
  // Permit/review path (9)
  "SHED_PERMIT_P1_ROOF_AREA",
  "SHED_PERMIT_P2A_STORY_HEIGHT",
  "SHED_PERMIT_P3A_FOUNDATION_EXEMPTION",
  "SHED_PERMIT_P3B_FOUNDATION_STFI_DISQUALIFIER",
  "SHED_PERMIT_P4_ATTACHMENT",
  "SHED_PERMIT_P5_USE",
  "SHED_PERMIT_P6_ECA_CRITERION",
  "SHED_PERMIT_P7A_SIZE_SPAN_FOOTPRINT",
  "SHED_PERMIT_P7B_SIZE_SPAN_STRUCTURAL",
  // Accessory height (2)
  "SHED_PERMIT_P2B1_ACCESSORY_HEIGHT_LIMIT_IN_SETBACK",
  "SHED_PERMIT_P2B2_ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK",
  // Lot coverage (6)
  "SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM",
  "SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION",
  "SHED_LOT_COVERAGE_C1C_TRANSIT_BONUS",
  "SHED_LOT_COVERAGE_C1D_STACKED_BONUS",
  "SHED_LOT_COVERAGE_C1E_MINIMUM_FLOOR",
  "SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE",
] as const;

/** Discretionary Tier-2 rules: TRIAGED/inactive for the MVP, so never part of the previewed active set. */
const INACTIVE_DISCRETIONARY_RULE_TYPES: ReadonlySet<string> = new Set(["SHED_PERMIT_P6_ECA_CRITERION", "SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE"]);
const MVP_ACTIVE_RULE_TYPES = CONSTITUENT_RULE_TYPES.filter((rt) => !INACTIVE_DISCRETIONARY_RULE_TYPES.has(rt));

function previewOnlyActiveRule(ruleType: string): RegulatoryRule {
  return {
    id: `preview-only-${ruleType}`,
    subject: `PREVIEW-ONLY (never persisted): ${ruleType}`,
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType },
    citation: { smcSections: [] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: [],
  };
}

const CLEAR_ECA: CriticalAreaFinding[] = [
  { hazardType: "priority_habitat", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "preview fixture" },
  { hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "preview fixture" },
];

const BASE_PROJECT: ShedProjectDetails = {
  projectType: "shed",
  widthFt: 8,
  depthFt: 8,
  heightFt: 10,
  alleyAdjacent: false,
  foundationType: "SLAB_ON_GRADE",
  attachment: "DETACHED",
  intendedUse: "STORAGE",
  isInRequiredSetback: true,
  structuralSpanInfo: { structuralSpanFt: 10 },
};

const PARCEL_AREA_SQFT = 5000;
const NOT_APPLICABLE_ADJUSTMENT: EcaLotAreaAdjustment = { status: "NOT_APPLICABLE", reason: "Preview fixture: no lot-area-exclusion category intersects." };

export type PreviewGroup = "Capability B - Building permit" | "Capability C - Estimated lot coverage";

export interface PreviewScenarioDefinition {
  id: string;
  group: PreviewGroup;
  title: string;
  /** What production evaluation is expected to return - asserted by tests so a fixture can never
   * silently drift away from the shape it claims to preview. */
  expected: { buildingPermit?: string; reviewPath?: string; lotCoverageStatus?: string; lotCoverageReason?: string };
  project: Partial<ShedProjectDetails>;
  existingMappedCoverageSqFt: number;
  ecaAdjustment: EcaLotAreaAdjustment;
  /** Defaults to PARCEL_AREA_SQFT. */
  parcelAreaSqFt?: number;
}

export const PREVIEW_SCENARIOS: PreviewScenarioDefinition[] = [
  { id: "permit-eca-determination-only", group: "Capability B - Building permit", title: "All other criteria met - turns only on the ECA question", expected: { buildingPermit: "REQUIRES_VERIFICATION", reviewPath: "REQUIRES_VERIFICATION" }, project: {}, existingMappedCoverageSqFt: 1500, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  { id: "permit-stfi-likely", group: "Capability B - Building permit", title: "REQUIRED / review path unconfirmed (ECA open)", expected: { buildingPermit: "REQUIRED", reviewPath: "REQUIRES_VERIFICATION" }, project: { widthFt: 12, depthFt: 12, utilityIntent: { electrical: true, plumbing: false, mechanical: true } }, existingMappedCoverageSqFt: 1500, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  { id: "permit-full-review-likely", group: "Capability B - Building permit", title: "REQUIRED / FULL_REVIEW_LIKELY", expected: { buildingPermit: "REQUIRED", reviewPath: "FULL_REVIEW_LIKELY" }, project: { widthFt: 30, depthFt: 30 }, existingMappedCoverageSqFt: 1500, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  { id: "permit-review-path-unresolved", group: "Capability B - Building permit", title: "REQUIRED / review path unresolved", expected: { buildingPermit: "REQUIRED", reviewPath: "REQUIRES_VERIFICATION" }, project: { widthFt: 12, depthFt: 12, foundationType: undefined }, existingMappedCoverageSqFt: 1500, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  { id: "permit-requires-verification", group: "Capability B - Building permit", title: "REQUIRES_VERIFICATION", expected: { buildingPermit: "REQUIRES_VERIFICATION", reviewPath: "REQUIRES_VERIFICATION" }, project: { intendedUse: "OCCUPIABLE" }, existingMappedCoverageSqFt: 1500, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  { id: "coverage-standard", group: "Capability C - Estimated lot coverage", title: "Standard (<= 50%)", expected: { lotCoverageStatus: "WITHIN_STANDARD_ALLOWANCE" }, project: {}, existingMappedCoverageSqFt: 1500, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  { id: "coverage-special-allowance", group: "Capability C - Estimated lot coverage", title: "> 50% and <= 60% (special-allowance verification)", expected: { lotCoverageStatus: "REQUIRES_VERIFICATION", lotCoverageReason: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE" }, project: {}, existingMappedCoverageSqFt: 2500, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  { id: "coverage-exceeds", group: "Capability C - Estimated lot coverage", title: "> 60%", expected: { lotCoverageStatus: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE" }, project: {}, existingMappedCoverageSqFt: 3100, ecaAdjustment: NOT_APPLICABLE_ADJUSTMENT },
  {
    id: "coverage-exceeds-map-indicated",
    group: "Capability C - Estimated lot coverage",
    title: "> 60%, a mapped layer indicates an exclusion area (no Director-alternative claim)",
    expected: { lotCoverageStatus: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE" },
    project: {},
    existingMappedCoverageSqFt: 3100,
    ecaAdjustment: { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], mapIndicatedCategories: ["WETLAND_AND_BUFFER"], reason: "Preview fixture: a mapped wetland layer intersects." },
  },
  {
    id: "coverage-lot-area-unresolved",
    group: "Capability C - Estimated lot coverage",
    title: "Lot-area adjustment unresolved - 31% with tolerance",
    expected: { lotCoverageStatus: "REQUIRES_VERIFICATION", lotCoverageReason: "LOT_AREA_ADJUSTMENT_UNRESOLVED" },
    project: {},
    existingMappedCoverageSqFt: 1500,
    ecaAdjustment: { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], reason: "Preview fixture: a lot-area-exclusion category may intersect." },
  },
  {
    id: "coverage-unresolved-over-50",
    group: "Capability C - Estimated lot coverage",
    title: "Unresolved, already over 50% with no exclusions (60% tolerance)",
    expected: { lotCoverageStatus: "REQUIRES_VERIFICATION", lotCoverageReason: "LOT_AREA_ADJUSTMENT_UNRESOLVED" },
    project: {},
    existingMappedCoverageSqFt: 2500,
    ecaAdjustment: { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], reason: "Preview fixture: a lot-area-exclusion category may intersect." },
  },
  {
    id: "coverage-unresolved-small-lot-floor",
    group: "Capability C - Estimated lot coverage",
    title: "Unresolved, tiny 900 sq ft parcel (625 sq ft minimum)",
    expected: { lotCoverageStatus: "REQUIRES_VERIFICATION", lotCoverageReason: "LOT_AREA_ADJUSTMENT_UNRESOLVED" },
    project: {},
    parcelAreaSqFt: 900,
    existingMappedCoverageSqFt: 480,
    ecaAdjustment: { status: "REQUIRES_VERIFICATION", intersectingCategories: ["WETLAND_AND_BUFFER"], reason: "Preview fixture: a lot-area-exclusion category may intersect." },
  },
];

export interface PreviewReport {
  id: string;
  findings: ReturnType<typeof assembleFindingsToPersist>;
  evidence: { factType: string; value?: unknown; provenance: { qualityCaveat?: string } }[];
  explanation: null;
  generatedAt: string;
}

export function buildPreviewReport(scenario: PreviewScenarioDefinition): PreviewReport {
  const project = { ...BASE_PROJECT, ...scenario.project } as ShedProjectDetails;
  const propertyContext: PropertyContext = { parcelId: "PREVIEW-ONLY", assembledAt: "2026-01-01T00:00:00.000Z", facts: [] };
  const outcome = evaluateProject({
    propertyContext,
    project,
    candidateActiveRules: MVP_ACTIVE_RULE_TYPES.map(previewOnlyActiveRule),
    ecaFindings: CLEAR_ECA,
    candidateActiveInferencePolicies: [],
    shedLotCoverageFacts: {
      parcelAreaSqFt: scenario.parcelAreaSqFt ?? PARCEL_AREA_SQFT,
      existingMappedCoverageSqFt: scenario.existingMappedCoverageSqFt,
      proposedShedFootprintSqFt: project.widthFt * project.depthFt,
      ecaAdjustment: scenario.ecaAdjustment,
    },
  });
  const coverageFact = buildExistingStructureCoverageFact({ areaSqFt: scenario.existingMappedCoverageSqFt, footprintCount: 1 });
  const evidence: PreviewReport["evidence"] = [
    { factType: "environmental-constraints", value: CLEAR_ECA, provenance: {} },
    existingStructureCoverageEvidenceEntry(coverageFact),
  ];
  const permitEntry = permitRequirementEvidenceEntry(outcome);
  if (permitEntry) evidence.push(permitEntry);
  const coverageEntry = shedLotCoverageEvidenceEntry(outcome);
  if (coverageEntry) evidence.push(coverageEntry);
  return { id: `preview-${scenario.id}`, findings: assembleFindingsToPersist(outcome), evidence, explanation: null, generatedAt: "2026-01-01T00:00:00.000Z" };
}

/** Shape `renderReportHtml` reads (EvidenceReportArtifactRow) - constructed from the same
 * preview report so web and PDF are guaranteed to render identical underlying data. */
export function toPreviewArtifactRow(report: PreviewReport) {
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
