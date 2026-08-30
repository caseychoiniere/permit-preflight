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
  const knownAndInferred = report.findings.filter((f) => f.classification !== FindingClassification.REQUIRES_VERIFICATION);
  const requiresVerification = report.findings.filter((f) => f.classification === FindingClassification.REQUIRES_VERIFICATION);
  const caveats = report.evidence.map((e) => e.provenance.qualityCaveat).filter((c): c is string => Boolean(c));
  // Unit 4 (business-rules.md BR-U4-5) - constraint types with zero ACTIVE rule coverage for this
  // project type, persisted at generation time as part of the immutable snapshot (never
  // recomputed at view time). Empty for shed today. Rendered as NoActiveRuleCoverageNotice,
  // visually and textually distinct from the KNOWN/INFERRED/REQUIRES_VERIFICATION finding cards
  // above so it is never mistaken for "screened clean."
  const uncoveredConstraintTypes = (report.evidence.find((e) => e.factType === "uncovered-constraint-types")?.value as string[] | undefined) ?? [];
  // Unit 5 - present only for a VACANT_LAND report's evidence array; undefined for shed/garage.
  const vacantLandScenarios = report.evidence.find((e) => e.factType === "vacant-land-scenarios")?.value as VacantLandScenario[] | undefined;

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
