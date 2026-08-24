"use client";

/**
 * ReportView (RGD-2, RGD-3, RGD-6). Reads exclusively through GET /api/reports/[token]
 * (BR-U2-7) - the token IS the credential; there is no reportId-based route anywhere in this app.
 */

import { use, useEffect, useState } from "react";
import { ReportMap } from "../../components/ReportMap.js";
import { FindingClassification } from "../../../src/regulatory-rules-engine/types.js";
import type { ComplianceOutcome, FindingClassification as FindingClassificationType } from "../../../src/regulatory-rules-engine/types.js";

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

export default function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [report, setReport] = useState<Report | "LOADING" | "NOT_FOUND">("LOADING");

  useEffect(() => {
    fetch(`/api/reports/${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve("NOT_FOUND")))
      .then(setReport)
      .catch(() => setReport("NOT_FOUND"));
  }, [token]);

  if (report === "LOADING") return <p>Loading...</p>;
  if (report === "NOT_FOUND") return <p>Report not found. If you believe this is an error, check that you used the complete link you were given.</p>;

  const knownAndInferred = report.findings.filter((f) => f.classification !== FindingClassification.REQUIRES_VERIFICATION);
  const requiresVerification = report.findings.filter((f) => f.classification === FindingClassification.REQUIRES_VERIFICATION);
  const caveats = report.evidence.map((e) => e.provenance.qualityCaveat).filter((c): c is string => Boolean(c));

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

      <p><a href={`/api/reports/${encodeURIComponent(token)}/pdf`}>Download PDF</a></p>
    </main>
  );
}
