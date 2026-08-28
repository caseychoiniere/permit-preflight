"use client";

/**
 * ReportView (RGD-2, RGD-3, RGD-6). Reads exclusively through GET /api/reports (BR-U2-7) - the
 * token IS the credential, there is no reportId-based route anywhere in this app.
 *
 * Corrected 2026-08-25 (Operations, bearer-credential-in-URL finding): the raw reportAccessToken
 * no longer appears anywhere in this page's own URL path/query string - Vercel's platform request
 * logs (Runtime Logs, Log Drains) capture the full Request Path and Search Params, outside this
 * application's own logging discipline's control. The guest report-access email link now points
 * here as `/report#access_token=<token>` - a URL FRAGMENT, which browsers never send as part of
 * the actual HTTP request, so it never reaches Vercel (or any server) as request data at all. On
 * load, this page reads the fragment client-side, POSTs the token in a request BODY to
 * /api/reports/access (which validates it via the existing hash-only credential lookup and sets an
 * HttpOnly session cookie), then immediately strips the fragment from the visible URL via
 * history.replaceState - the raw token is never left sitting in the visible URL or browser
 * history. Subsequent report/PDF reads rely on that cookie, never a URL-embedded token again.
 */

import { useEffect, useState } from "react";
import { ReportMap } from "../components/ReportMap.js";
import { FindingClassification } from "../../src/regulatory-rules-engine/types.js";
import type { ComplianceOutcome, FindingClassification as FindingClassificationType } from "../../src/regulatory-rules-engine/types.js";

interface Finding {
  subject: string;
  classification: FindingClassificationType;
  complianceOutcome?: ComplianceOutcome;
  explanationBasis: string;
  supportingEvidence: string[];
}

interface EvidenceEntry {
  factType: string;
  value?: unknown;
  provenance: { sourceAgency?: string; dataset?: string; qualityCaveat?: string };
}

interface Report {
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

const ACCESS_TOKEN_HASH_PREFIX = "#access_token=";

export default function ReportPage() {
  const [report, setReport] = useState<Report | "LOADING" | "NOT_FOUND">("LOADING");

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      const res = await fetch("/api/reports", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setReport("NOT_FOUND");
        return;
      }
      setReport(await res.json());
    }

    async function run() {
      const hash = window.location.hash;
      if (hash.startsWith(ACCESS_TOKEN_HASH_PREFIX)) {
        const token = decodeURIComponent(hash.slice(ACCESS_TOKEN_HASH_PREFIX.length));
        const exchangeRes = await fetch("/api/reports/access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        // Strip the fragment from the visible URL regardless of outcome - the raw token must
        // never remain visible in the URL or browser history once read.
        window.history.replaceState(null, "", "/report");
        if (cancelled) return;
        if (!exchangeRes.ok) {
          setReport("NOT_FOUND");
          return;
        }
      }
      await loadReport();
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (report === "LOADING") return <p>Loading...</p>;
  if (report === "NOT_FOUND") return <p>Report not found. If you believe this is an error, check that you used the complete link you were given.</p>;

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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>Permit Preflight - Screening Report</h1>
      <p>Generated: {new Date(report.generatedAt).toLocaleString()}</p>

      <ReportMap evidence={report.evidence} />

      <h2>Findings</h2>
      {knownAndInferred.map((f, i) => (
        <div key={i} style={{ padding: 8, marginBottom: 8, border: "1px solid #ddd" }}>
          <strong>{f.subject}</strong> - {f.classification}{f.complianceOutcome ? ` (${f.complianceOutcome})` : ""}
          <p>{f.explanationBasis}</p>
        </div>
      ))}

      {vacantLandScenarios && vacantLandScenarios.length > 0 && (
        <>
          <h2>Preliminary Screening Assessment - Scenarios</h2>
          {vacantLandScenarios.map((scenario) => (
            <div key={scenario.scenarioId} style={{ padding: 8, marginBottom: 8, border: "1px solid #ddd" }}>
              <strong>{scenario.description}</strong>
              <p>
                Max dwelling units: {renderScenarioFigure(scenario.maxDwellingUnits)} · Max height: {renderScenarioFigure(scenario.maxHeightFt)} ft · Max lot
                coverage: {renderScenarioFigure(scenario.maxLotCoveragePercent)}%
              </p>
              {scenario.buildableEnvelope.buildableAreaSqFt !== undefined ? (
                <p>
                  Preliminary buildable area: {scenario.buildableEnvelope.buildableAreaSqFt} sq ft
                  {scenario.buildableEnvelope.setbackConstrainedArea.status === "ESTABLISHED" &&
                    scenario.buildableEnvelope.setbackConstrainedArea.isConservativeSideSetbackApproximation && (
                      <em> (conservative fixed-5-foot approximation - the true achievable area may be understated)</em>
                    )}
                </p>
              ) : (
                <p>A preliminary buildable-area figure could not be established for this scenario - see diligence risks below.</p>
              )}
              <p>Citations: {scenario.citations.join(", ")}</p>
            </div>
          ))}
        </>
      )}

      {uncoveredConstraintTypes.length > 0 && (
        <>
          <h2>Not Yet Automatically Screenable</h2>
          {uncoveredConstraintTypes.map((constraintType) => (
            <div
              key={constraintType}
              role="note"
              style={{ padding: 8, marginBottom: 8, borderLeft: "4px solid #6b7280", background: "#f3f4f6" }}
            >
              <strong>{constraintType.charAt(0).toUpperCase() + constraintType.slice(1)}</strong>
              <p>
                This constraint could not yet be automatically screened for this project type - no active
                regulatory rule currently governs it in this system. This is not the same as a compliance
                finding of any kind and should not be read as a pass.
              </p>
            </div>
          ))}
        </>
      )}

      {requiresVerification.length > 0 && (
        <>
          <h2>Requires Verification</h2>
          {requiresVerification.map((f, i) => (
            <div key={i} role="note" style={{ padding: 8, marginBottom: 8, borderLeft: "4px solid #b45309", background: "#fffbeb" }}>
              <strong>{f.subject}</strong> - REQUIRES VERIFICATION
              <p>{f.explanationBasis}</p>
            </div>
          ))}
        </>
      )}

      <h2>Explanation</h2>
      {report.explanation ? <p>{report.explanation.text}</p> : <p><em>Plain-language synthesis is temporarily unavailable.</em></p>}

      {caveats.length > 0 && (
        <>
          <h2>Evidence Notes</h2>
          <ul>{caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}

      <p><a href="/api/reports/pdf">Download PDF</a></p>
    </main>
  );
}
