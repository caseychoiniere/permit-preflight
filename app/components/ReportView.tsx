/**
 * ReportView - the actual report-content rendering (map, findings, vacant-land scenarios,
 * uncovered constraints, requires-verification, explanation, evidence notes), extracted
 * (2026-08-28) from app/report/page.tsx so it can be reused verbatim by the post-checkout status
 * page (product-correctness correction: showing the real generated report directly after purchase
 * instead of only telling the customer to check their email) without a second, drifting copy of
 * this rendering. Every consumer supplies its own `report` data and `pdfHref` - this component
 * itself fetches nothing and has no access-control opinion of any kind; each page's own route
 * decides how it is allowed to obtain that data.
 */

import { ReportMap } from "./ReportMap.js";
import { FindingClassification, ComplianceOutcome } from "../../src/regulatory-rules-engine/types.js";
import { isCriticalAreaFinding } from "../../src/regulatory-rules-engine/evaluate.js";
import type { ComplianceOutcome as ComplianceOutcomeType, FindingClassification as FindingClassificationType } from "../../src/regulatory-rules-engine/types.js";
import { Card } from "./ui/Card.js";
import { Badge } from "./ui/Badge.js";

export interface Finding {
  subject: string;
  classification: FindingClassificationType;
  complianceOutcome?: ComplianceOutcomeType;
  explanationBasis: string;
  supportingEvidence: string[];
}

export interface EvidenceEntry {
  factType: string;
  value?: unknown;
  provenance: { sourceAgency?: string; dataset?: string; qualityCaveat?: string };
}

export interface Report {
  id: string;
  findings: Finding[];
  evidence: EvidenceEntry[];
  explanation: { text: string; referencedFindingIds: string[] } | null;
  generatedAt: string;
}

/** Unit 5 (Code Generation review correction) - a real three-state union, mirroring
 * regulatory-rules-engine/vacant-land-types.ts's own corrected ScenarioFigure exactly:
 * NO_ACTIVE_COVERAGE ("no governed rule exists yet") is rendered distinctly from
 * REQUIRES_VERIFICATION ("a rule exists but the parcel's own evidence is unresolved") - never
 * collapsed into the same "requires verification" copy. */
type ScenarioFigure = { status: "KNOWN"; value: number } | { status: "NO_ACTIVE_COVERAGE" } | { status: "REQUIRES_VERIFICATION"; reason: string };

/** Unit 5 - mirrors regulatory-rules-engine/vacant-land-types.ts's ResidentialUseScenario shape,
 * duplicated (not imported) matching this file's existing convention for the Finding/Report shapes
 * above. */
interface VacantLandScenario {
  scenarioId: string;
  description: string;
  maxDwellingUnits: ScenarioFigure;
  maxHeightFt: ScenarioFigure;
  maxLotCoveragePercent: ScenarioFigure;
  buildableEnvelope: {
    setbackConstrainedArea:
      | { status: "ESTABLISHED"; areaSqFt: number; isConservativeSideSetbackApproximation: boolean }
      | { status: "NO_ACTIVE_COVERAGE" }
      | { status: "REQUIRES_VERIFICATION"; reason: string };
    buildableAreaSqFt?: number;
  };
  citations: string[];
}

/** Unit 6B - mirrors spatial-analysis/types.ts's CriticalAreaFinding shape, duplicated (not
 * imported) matching this file's existing convention. */
interface CriticalAreaFindingDisplay {
  hazardType: string;
  mappedIntersectionResult: "INTERSECTS" | "NO_INTERSECTION" | "INDETERMINATE";
  advisoryStatus: "ADVISORY_ONLY" | "MAP_DISPOSITIVE";
  toleranceBasis: string;
  layerVintageNote?: string;
}

/** Unit 6B Capability B - mirrors regulatory-rules-engine/types.ts's PermitRequirementFinding
 * shape, duplicated (not imported) matching this file's existing convention. */
interface PermitCriterionResultDisplay {
  criterionId: string;
  status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION" | "NOT_APPLICABLE";
  explanationBasis: string;
}
interface TradePermitDisclosureDisplay {
  trade: "ELECTRICAL" | "PLUMBING" | "MECHANICAL";
  explanationBasis: string;
}
interface PermitRequirementFindingDisplay {
  buildingPermit: "LIKELY_EXEMPT" | "REQUIRED" | "REQUIRES_VERIFICATION";
  reviewPath: "NONE" | "STFI_LIKELY" | "FULL_REVIEW_LIKELY" | "REQUIRES_VERIFICATION";
  criteria: PermitCriterionResultDisplay[];
  tradePermitDisclosures: TradePermitDisclosureDisplay[];
  /** Optional: absent on reports persisted before 2026-10-07 and whenever the ECA criterion is evaluated. */
  ecaDeferral?: { allOtherExemptionCriteriaMet: boolean; note?: string };
  /** Optional: present only when the review path is unresolved solely because of the ECA question. */
  reviewPathNote?: string;
}
/** Optional on persisted results: absent on reports generated before 2026-10-07. */
interface LotCoverageToleranceDisplay {
  explanation: string[];
}

/** frontend-components.md §2's exact 5-row headline table - shared with render.ts's PDF template
 * so the two never drift (that module duplicates this one small function rather than importing
 * from app/, matching this project's existing src/<->app boundary). */
function permitHeadline(buildingPermit: PermitRequirementFindingDisplay["buildingPermit"], reviewPath: PermitRequirementFindingDisplay["reviewPath"]): string {
  if (buildingPermit === "REQUIRES_VERIFICATION") return "Requires verification";
  if (buildingPermit === "LIKELY_EXEMPT") return "Likely not required";
  if (reviewPath === "STFI_LIKELY") return "Likely required — simple review (STFI)";
  if (reviewPath === "FULL_REVIEW_LIKELY") return "Likely required — full review";
  return "Permit likely required — review path needs verification";
}

function permitCriterionIcon(status: PermitCriterionResultDisplay["status"]): string {
  if (status === "MET") return "✓";
  if (status === "NOT_MET") return "✗";
  return "⚠";
}

/** Unit 6B Capability C - mirrors regulatory-rules-engine/types.ts's ShedLotCoverageResult
 * shape, duplicated (not imported) matching this file's existing convention. */
interface ShedLotCoverageFactsDisplay {
  parcelAreaSqFt: number;
  existingMappedCoverageSqFt: number;
  proposedShedFootprintSqFt: number;
  ecaAdjustment:
    | { status: "NOT_APPLICABLE"; reason: string }
    | { status: "REQUIRES_VERIFICATION"; reason: string }
    | { status: "ESTABLISHED"; excludedAreaSqFt: number; basis: string; minimumCoverageFloor: { status: "NOT_APPLICABLE" | "KNOWN" | "REQUIRES_VERIFICATION"; floorSqFt?: number } };
  allowanceFacts: { adjustedLotAreaSqFt: number; c1eFloorSqFt?: number; c1eDirectorAlternativeRelevant: boolean };
}
type ShedLotCoverageResultDisplay =
  | { status: "WITHIN_STANDARD_ALLOWANCE"; estimatedCoverageSqFt: number; baseAllowanceSqFt: number; facts: ShedLotCoverageFactsDisplay }
  | { status: "REQUIRES_VERIFICATION"; reason: "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE"; estimatedCoverageSqFt: number; baseAllowanceSqFt: number; potentialSpecialAllowanceSqFt: number; facts: ShedLotCoverageFactsDisplay }
  | {
      status: "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE";
      estimatedCoverageSqFt: number;
      potentialSpecialAllowanceSqFt: number;
      facts: ShedLotCoverageFactsDisplay;
      exclusionTolerance?: LotCoverageToleranceDisplay;
      parcelSpecificApprovalDisclosure?: string;
    }
  | { status: "REQUIRES_VERIFICATION"; reason: "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE"; estimatedCoverageSqFt: number; potentialSpecialAllowanceSqFt: number; facts: ShedLotCoverageFactsDisplay }
  | {
      status: "REQUIRES_VERIFICATION";
      reason: "LOT_AREA_ADJUSTMENT_UNRESOLVED";
      estimatedCoverageSqFt: number;
      facts: ShedLotCoverageFactsDisplay;
      exclusionTolerance?: LotCoverageToleranceDisplay;
      parcelSpecificApprovalDisclosure?: string;
    };

/** Unit 7 (Fences) - mirrors regulatory-rules-engine/fence-types.ts's FencePermitRequirement and
 * FenceDeclaredInput shapes, duplicated (not imported) matching this file's existing convention. */
interface FenceDeclaredInputDisplay {
  label: string;
  value: string;
}
interface FencePermitRequirementDisplay {
  buildingPermit: "REQUIRED" | "REQUIRES_VERIFICATION";
  criteria: { criterionId: string; status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION"; explanationBasis: string }[];
  note?: string;
  exemptionDisclaimer?: string;
  permitPathNote?: string;
  disclosures: string[];
}
function fencePermitHeadline(buildingPermit: FencePermitRequirementDisplay["buildingPermit"]): string {
  return buildingPermit === "REQUIRED" ? "Building permit likely required" : "Requires verification";
}

/** Unit 8 (Decks) - mirrors regulatory-rules-engine/deck-types.ts's DeckPermitRequirement; duplicated (not imported). */
interface DeckPermitRequirementDisplay {
  buildingPermit: "REQUIRED" | "REQUIRES_VERIFICATION";
  criteria: { criterionId: string; status: "MET" | "NOT_MET" | "REQUIRES_VERIFICATION"; explanationBasis: string }[];
  reviewPath?: "FULL_REVIEW_LIKELY" | "REQUIRES_VERIFICATION";
  reviewPathReasons?: string[];
  note?: string;
  exemptionDisclaimer?: string;
  disclosures: string[];
}
function deckPermitHeadline(p: DeckPermitRequirementDisplay): string {
  if (p.buildingPermit === "REQUIRES_VERIFICATION") return "Requires verification";
  if (p.reviewPath === "FULL_REVIEW_LIKELY") return "Building permit likely required - full review";
  return "Building permit likely required";
}

function coveragePercent(estimatedCoverageSqFt: number, parcelAreaSqFt: number): number {
  return Math.round((estimatedCoverageSqFt / parcelAreaSqFt) * 100);
}

function formatHazardType(hazardType: string): string {
  return hazardType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderScenarioFigure(figure: ScenarioFigure): string {
  if (figure.status === "KNOWN") return String(figure.value);
  if (figure.status === "NO_ACTIVE_COVERAGE") return "not yet automatically screenable";
  return "requires verification";
}

interface Props {
  report: Report;
  /** Omit to hide the Download PDF action entirely (e.g. a context with no PDF route of its own
   * yet) - never a raw token/artifact id, just the URL of whichever route the consuming page is
   * itself authorized to call. */
  pdfHref?: string;
  /** "Screening Report" is either the whole page's own <h1> (app/report/page.tsx, which has
   * nothing else on it) or a section heading nested under a page that already has its own <h1>
   * (the checkout-status page's "Order Status"/"Report ready") - callers pick which is correct
   * for their own document structure rather than this component guessing. Defaults to "h2" (the
   * nested case) since that is the more common composition. */
  headingLevel?: "h1" | "h2";
}

export function ReportView({ report, pdfHref, headingLevel = "h2" }: Props) {
  const Heading = headingLevel;
  // Unit 6B - the per-hazard "Critical area: X" findings the existing (pre-Unit-6B)
  // ecaFindings-derivation loop in evaluate.ts already produces are redirected entirely to the
  // dedicated "Mapped Environmental / Site Constraints" section below (BR-U6B-4's grouped
  // presentation), never duplicated as a dozen individual cards in the general Findings/Requires
  // Verification lists - the raw fact remains fully present in report.evidence either way.
  // Maintenance correction (2026-09-15) - reuses evaluate.ts's own isCriticalAreaFinding rather
  // than a second, independently-drifting "Critical area: " string check.
  const knownAndInferred = report.findings.filter((f) => f.classification !== FindingClassification.REQUIRES_VERIFICATION && !isCriticalAreaFinding(f.subject));
  const requiresVerification = report.findings.filter((f) => f.classification === FindingClassification.REQUIRES_VERIFICATION && !isCriticalAreaFinding(f.subject));
  const caveats = report.evidence.map((e) => e.provenance.qualityCaveat).filter((c): c is string => Boolean(c));
  // Unit 6B - present once seattle-eca.ts's retriever is wired into the shed pipeline; undefined
  // for garage/vacant-land reports and for any report generated before this fact existed.
  const environmentalConstraints = report.evidence.find((e) => e.factType === "environmental-constraints")?.value as CriticalAreaFindingDisplay[] | undefined;
  const notableEcaFindings = (environmentalConstraints ?? []).filter((f) => f.mappedIntersectionResult !== "NO_INTERSECTION");
  const cleanEcaFindings = (environmentalConstraints ?? []).filter((f) => f.mappedIntersectionResult === "NO_INTERSECTION");
  // Unit 4 (business-rules.md BR-U4-5) - constraint types with zero ACTIVE rule coverage for this
  // project type, persisted at generation time as part of the immutable snapshot (never
  // recomputed at view time). Empty for shed today. Rendered as NoActiveRuleCoverageNotice,
  // visually and textually distinct from the KNOWN/INFERRED/REQUIRES_VERIFICATION finding cards
  // above so it is never mistaken for "screened clean."
  const uncoveredConstraintTypes = (report.evidence.find((e) => e.factType === "uncovered-constraint-types")?.value as string[] | undefined) ?? [];
  // Unit 5 - present only for a VACANT_LAND report's evidence array; undefined for shed/garage.
  const vacantLandScenarios = report.evidence.find((e) => e.factType === "vacant-land-scenarios")?.value as VacantLandScenario[] | undefined;
  // Unit 6B Capability B - present only once every constituent ShedPermitRuleType row is ACTIVE
  // (evaluateProject's own dormancy gate, untouched here) - undefined for garage/vacant-land and
  // for any shed report generated while the 19 Unit 6B rows remain TRIAGED (production today).
  const permitRequirement = report.evidence.find((e) => e.factType === "shed-permit-requirement")?.value as PermitRequirementFindingDisplay | undefined;
  // Unit 6B Capability C - present only once every constituent SHED_LOT_COVERAGE rule row is
  // ACTIVE (evaluateProject's own dormancy gate, untouched here) - undefined for garage/
  // vacant-land and for any shed report generated while the 6 Unit 6B "C" rows remain TRIAGED
  // (production today).
  const shedLotCoverage = report.evidence.find((e) => e.factType === "shed-lot-coverage")?.value as ShedLotCoverageResultDisplay | undefined;
  // Unit 7 (Fences) - present only on a fence report. The permit aggregate is evidence only (never a
  // finding), exactly like Unit 6B's; declared inputs are echoed so the customer sees what the result rests on.
  const fenceDeclaredInputs = report.evidence.find((e) => e.factType === "fence-declared-inputs")?.value as FenceDeclaredInputDisplay[] | undefined;
  const fencePermit = report.evidence.find((e) => e.factType === "fence-permit-requirement")?.value as FencePermitRequirementDisplay | undefined;
  // Unit 8 (Decks) - same arrangement: declared inputs echoed, permit aggregate as evidence only.
  const deckDeclaredInputs = report.evidence.find((e) => e.factType === "deck-declared-inputs")?.value as FenceDeclaredInputDisplay[] | undefined;
  const deckPermit = report.evidence.find((e) => e.factType === "deck-permit-requirement")?.value as DeckPermitRequirementDisplay | undefined;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Heading className="text-xl font-semibold text-slate-900">Screening Report</Heading>
          <p className="text-sm text-slate-500">Generated: {new Date(report.generatedAt).toLocaleString()}</p>
        </div>
        {pdfHref && (
          <a
            href={pdfHref}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Download PDF
          </a>
        )}
      </div>

      <Card className="mb-6 p-0 overflow-hidden">
        <ReportMap evidence={report.evidence} />
      </Card>

      <h3 className="mb-3 text-base font-semibold text-slate-900">Findings</h3>
      <div className="mb-8 flex flex-col gap-3">
        {knownAndInferred.map((f, i) => (
          <Card key={i}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-slate-900">{f.subject}</strong>
              <Badge tone="neutral">{f.classification}</Badge>
              {f.complianceOutcome && (
                <Badge tone={f.complianceOutcome === ComplianceOutcome.PASS ? "success" : "danger"}>{f.complianceOutcome}</Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-600">{f.explanationBasis}</p>
          </Card>
        ))}
      </div>

      {deckDeclaredInputs && deckDeclaredInputs.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">What you told us</h3>
          <div className="mb-8 flex flex-col gap-3">
            <Card>
              <p className="text-sm text-slate-500">This deck was evaluated from the details you entered, not from measurements of the site.</p>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {deckDeclaredInputs.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <dt className="text-slate-500">{d.label}:</dt>
                    <dd className="text-slate-900">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}

      {deckPermit && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Building permit (deck)</h3>
          <div className="mb-8 flex flex-col gap-3">
            <Card>
              <strong className="text-sm text-slate-900">{deckPermitHeadline(deckPermit)}</strong>
              {deckPermit.note && <p className="mt-2 text-sm text-amber-900">{deckPermit.note}</p>}
              <ul className="mt-3 flex flex-col gap-1">
                {deckPermit.criteria.map((c, i) => (
                  <li key={i} className="text-sm text-slate-600">
                    {permitCriterionIcon(c.status)} {c.explanationBasis}
                  </li>
                ))}
              </ul>
              {(deckPermit.reviewPathReasons ?? []).map((r, i) => (
                <p key={i} className="mt-3 text-sm text-slate-600">
                  {r}
                </p>
              ))}
              {deckPermit.exemptionDisclaimer && <p className="mt-3 text-sm text-slate-500">{deckPermit.exemptionDisclaimer}</p>}
              {deckPermit.disclosures.map((d, i) => (
                <p key={i} className="mt-3 text-sm text-slate-500">
                  {d}
                </p>
              ))}
              <p className="mt-3 text-xs text-slate-400">SDCI makes the final determination.</p>
            </Card>
          </div>
        </>
      )}

      {fenceDeclaredInputs && fenceDeclaredInputs.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">What you told us</h3>
          <div className="mb-8 flex flex-col gap-3">
            <Card>
              <p className="text-sm text-slate-500">This fence was evaluated from the details you entered, not from measurements of the site.</p>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {fenceDeclaredInputs.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <dt className="text-slate-500">{d.label}:</dt>
                    <dd className="text-slate-900">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}

      {fencePermit && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Building permit (fence)</h3>
          <div className="mb-8 flex flex-col gap-3">
            <Card>
              <strong className="text-sm text-slate-900">{fencePermitHeadline(fencePermit.buildingPermit)}</strong>
              {fencePermit.note && <p className="mt-2 text-sm text-amber-900">{fencePermit.note}</p>}
              <ul className="mt-3 flex flex-col gap-1">
                {fencePermit.criteria.map((c, i) => (
                  <li key={i} className="text-sm text-slate-600">
                    {permitCriterionIcon(c.status)} {c.explanationBasis}
                  </li>
                ))}
              </ul>
              {fencePermit.permitPathNote && <p className="mt-3 text-sm text-slate-600">{fencePermit.permitPathNote}</p>}
              {fencePermit.exemptionDisclaimer && <p className="mt-3 text-sm text-slate-500">{fencePermit.exemptionDisclaimer}</p>}
              {fencePermit.disclosures.map((d, i) => (
                <p key={i} className="mt-3 text-sm text-slate-500">
                  {d}
                </p>
              ))}
              <p className="mt-3 text-xs text-slate-400">SDCI makes the final determination.</p>
            </Card>
          </div>
        </>
      )}

      {permitRequirement && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Building permit</h3>
          <div className="mb-8 flex flex-col gap-3">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-slate-900">{permitHeadline(permitRequirement.buildingPermit, permitRequirement.reviewPath)}</strong>
              </div>
              {permitRequirement.ecaDeferral?.note && <p className="mt-2 text-sm text-amber-900">{permitRequirement.ecaDeferral.note}</p>}
              <ul className="mt-3 flex flex-col gap-1">
                {permitRequirement.criteria.map((c, i) => (
                  <li key={i} className="text-sm text-slate-600">
                    {permitCriterionIcon(c.status)} {c.explanationBasis}
                  </li>
                ))}
              </ul>
              {permitRequirement.reviewPathNote && <p className="mt-3 text-sm text-amber-900">{permitRequirement.reviewPathNote}</p>}
              {permitRequirement.tradePermitDisclosures.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {permitRequirement.tradePermitDisclosures.map((d, i) => (
                    <p key={i} className="text-sm text-amber-900">
                      ⚠ {d.explanationBasis}
                    </p>
                  ))}
                </div>
              )}
              {permitRequirement.buildingPermit === "LIKELY_EXEMPT" && (
                <p className="mt-3 text-sm text-slate-500">
                  A building-permit exemption does not waive setback, lot-coverage, height, or rear-yard-coverage compliance.
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400">SDCI makes the final determination.</p>
            </Card>
          </div>
        </>
      )}

      {shedLotCoverage && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Estimated lot coverage</h3>
          <div className="mb-8 flex flex-col gap-3">
            <Card>
              <strong className="text-sm text-slate-900">
                {coveragePercent(shedLotCoverage.estimatedCoverageSqFt, shedLotCoverage.facts.parcelAreaSqFt)}%
              </strong>
              {shedLotCoverage.status === "WITHIN_STANDARD_ALLOWANCE" && (
                <>
                  <p className="mt-2 text-sm text-slate-600">Standard applicable limit: 50%</p>
                  <p className="mt-2 text-sm text-slate-600">Result: Within the standard lot-coverage allowance</p>
                </>
              )}
              {shedLotCoverage.status === "REQUIRES_VERIFICATION" && shedLotCoverage.reason === "MAY_QUALIFY_FOR_SPECIAL_ALLOWANCE" && (
                <>
                  <p className="mt-2 text-sm text-slate-600">Standard applicable limit: 50%</p>
                  <p className="mt-2 text-sm text-amber-900">Result: Requires verification</p>
                  <p className="mt-2 text-sm text-amber-900">
                    Estimated coverage exceeds the standard 50% limit but may fit within Seattle&apos;s 60% allowance for certain qualifying
                    developments (common-amenity or stacked-dwelling-unit arrangements). Permit Preflight could not determine whether that
                    allowance applies to this property.
                  </p>
                </>
              )}
              {shedLotCoverage.status === "EXCEEDS_STANDARD_AND_SPECIAL_ALLOWANCE" && (
                <>
                  <p className="mt-2 text-sm text-slate-600">Even Seattle&apos;s higher 60% allowance (for qualifying developments) appears exceeded.</p>
                  {shedLotCoverage.exclusionTolerance?.explanation.map((p, i) => (
                    <p key={i} className="mt-2 text-sm text-slate-600">
                      {p}
                    </p>
                  ))}
                  {shedLotCoverage.parcelSpecificApprovalDisclosure && <p className="mt-2 text-sm text-slate-500">{shedLotCoverage.parcelSpecificApprovalDisclosure}</p>}
                </>
              )}
              {shedLotCoverage.status === "REQUIRES_VERIFICATION" && shedLotCoverage.reason === "POSSIBLE_DIRECTOR_APPROVED_ALTERNATIVE" && (
                <>
                  <p className="mt-2 text-sm text-amber-900">Result: Requires verification</p>
                  <p className="mt-2 text-sm text-amber-900">
                    The standard calculated allowance appears exceeded, but a parcel-specific Director-approved amount, if one exists, could
                    alter this result. Permit Preflight has no way to confirm whether such an approval applies to this property.
                  </p>
                </>
              )}
              {shedLotCoverage.status === "REQUIRES_VERIFICATION" && shedLotCoverage.reason === "LOT_AREA_ADJUSTMENT_UNRESOLVED" && (
                <>
                  <p className="mt-2 text-sm text-amber-900">Result: Requires verification</p>
                  <p className="mt-2 text-sm text-amber-900">
                    A mapped riparian corridor, wetland, shoreline-setback, or steep-slope non-disturbance condition may intersect this parcel, or cannot be ruled out from mapped data (regulatory buffers and setback areas are not mapped), and
                    may reduce the countable lot area used for this estimate, pending more precise geometry.
                  </p>
                  {shedLotCoverage.exclusionTolerance?.explanation.map((p, i) => (
                    <p key={i} className="mt-2 text-sm text-slate-600">
                      {p}
                    </p>
                  ))}
                  {shedLotCoverage.parcelSpecificApprovalDisclosure && <p className="mt-2 text-sm text-slate-500">{shedLotCoverage.parcelSpecificApprovalDisclosure}</p>}
                </>
              )}
              <p className="mt-3 text-sm text-slate-500">Existing mapped structure coverage: {Math.round(shedLotCoverage.facts.existingMappedCoverageSqFt)} sq ft.</p>
              {shedLotCoverage.facts.ecaAdjustment.status === "ESTABLISHED" && (
                <p className="mt-2 text-sm text-slate-500">
                  A mapped riparian/wetland/shoreline-setback/steep-slope non-disturbance area excludes {Math.round(shedLotCoverage.facts.ecaAdjustment.excludedAreaSqFt)} sq ft
                  from the countable lot area
                  {shedLotCoverage.facts.ecaAdjustment.minimumCoverageFloor.status === "KNOWN" && shedLotCoverage.facts.ecaAdjustment.minimumCoverageFloor.floorSqFt
                    ? `, subject to a ${shedLotCoverage.facts.ecaAdjustment.minimumCoverageFloor.floorSqFt} sq ft minimum (a parcel-specific Director-approved alternative amount may exist)`
                    : ""}
                  .
                </p>
              )}
            </Card>
          </div>
        </>
      )}

      {vacantLandScenarios && vacantLandScenarios.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Preliminary Screening Assessment - Scenarios</h3>
          <div className="mb-8 flex flex-col gap-3">
            {vacantLandScenarios.map((scenario) => (
              <Card key={scenario.scenarioId}>
                <strong className="text-sm text-slate-900">{scenario.description}</strong>
                <p className="mt-2 text-sm text-slate-600">
                  Max dwelling units: {renderScenarioFigure(scenario.maxDwellingUnits)} · Max height: {renderScenarioFigure(scenario.maxHeightFt)} ft · Max lot
                  coverage: {renderScenarioFigure(scenario.maxLotCoveragePercent)}%
                </p>
                {scenario.buildableEnvelope.buildableAreaSqFt !== undefined ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Preliminary buildable area: {scenario.buildableEnvelope.buildableAreaSqFt} sq ft
                    {scenario.buildableEnvelope.setbackConstrainedArea.status === "ESTABLISHED" &&
                      scenario.buildableEnvelope.setbackConstrainedArea.isConservativeSideSetbackApproximation && (
                        <em className="text-slate-500"> (conservative fixed-5-foot approximation - the true achievable area may be understated)</em>
                      )}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">A preliminary buildable-area figure could not be established for this scenario - see diligence risks below.</p>
                )}
                <p className="mt-2 text-xs text-slate-400">Citations: {scenario.citations.join(", ")}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {uncoveredConstraintTypes.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Not Yet Automatically Screenable</h3>
          <div className="mb-8 flex flex-col gap-3">
            {uncoveredConstraintTypes.map((constraintType) => (
              <div key={constraintType} role="note" className="rounded-xl border-l-4 border-slate-400 bg-slate-100 p-4">
                <strong className="text-sm text-slate-900">{constraintType.charAt(0).toUpperCase() + constraintType.slice(1)}</strong>
                <p className="mt-2 text-sm text-slate-600">
                  This constraint could not yet be automatically screened for this project type - no active
                  regulatory rule currently governs it in this system. This is not the same as a compliance
                  finding of any kind and should not be read as a pass.
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {environmentalConstraints && environmentalConstraints.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Mapped Environmental / Site Constraints</h3>
          <div className="mb-8 flex flex-col gap-3">
            {notableEcaFindings.map((f, i) => (
              <div
                key={i}
                role="note"
                className={`rounded-xl border-l-4 p-4 ${
                  f.mappedIntersectionResult === "INTERSECTS" && f.advisoryStatus === "MAP_DISPOSITIVE"
                    ? "border-red-500 bg-red-50"
                    : "border-amber-500 bg-amber-50"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-slate-900">{formatHazardType(f.hazardType)}</strong>
                  <Badge tone={f.mappedIntersectionResult === "INTERSECTS" ? "danger" : "warning"}>
                    {f.mappedIntersectionResult === "INTERSECTS" ? "MAPPED INTERSECTION" : "INDETERMINATE"}
                  </Badge>
                  {f.advisoryStatus === "ADVISORY_ONLY" && <Badge tone="neutral">ADVISORY MAP DATA</Badge>}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {f.advisoryStatus === "ADVISORY_ONLY"
                    ? "This map layer is advisory-only - authoritative confirmation from SDCI is still required before treating this as a confirmed condition."
                    : "This is a map-dispositive layer - the mapped result may be relied on as evidence, subject to the source's own vintage and tolerance."}
                </p>
              </div>
            ))}
            {cleanEcaFindings.length > 0 && (
              <Card>
                <p className="text-sm text-slate-600">
                  No mapped {cleanEcaFindings.map((f) => formatHazardType(f.hazardType).toLowerCase()).join(", ")} conditions detected on this parcel.
                </p>
              </Card>
            )}
          </div>
        </>
      )}

      {requiresVerification.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Requires Verification</h3>
          <div className="mb-8 flex flex-col gap-3">
            {requiresVerification.map((f, i) => (
              <div key={i} role="note" className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-slate-900">{f.subject}</strong>
                  <Badge tone="warning">REQUIRES VERIFICATION</Badge>
                </div>
                <p className="mt-2 text-sm text-amber-900">{f.explanationBasis}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="mb-3 text-base font-semibold text-slate-900">Explanation</h3>
      <p className="mb-8 text-sm text-slate-600">
        {report.explanation ? report.explanation.text : <em>Plain-language synthesis is temporarily unavailable.</em>}
      </p>

      {caveats.length > 0 && (
        <>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Evidence Notes</h3>
          <ul className="mb-8 list-inside list-disc text-sm text-slate-600">
            {caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
