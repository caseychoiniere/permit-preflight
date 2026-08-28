"use client";

/**
 * Account Access report view (BR-U6-4 Mode B) - reuses GET /api/account/reports/[orderId], whose
 * response shape exactly matches the existing guest GET /api/reports (app/report/page.tsx). This
 * is a new AUTHORIZATION route to the same existing report content, not a new rendering
 * mechanism - deliberately kept minimal (findings + evidence caveats only, no ReportMap/PDF
 * controls) rather than duplicating app/report/page.tsx's full presentational logic; extracting a
 * fully shared rendering component between the guest and account views is a reasonable follow-up,
 * not done in this pass.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FindingClassification } from "../../../../src/regulatory-rules-engine/types.js";
import type { ComplianceOutcome, FindingClassification as FindingClassificationType } from "../../../../src/regulatory-rules-engine/types.js";

interface Finding {
  subject: string;
  classification: FindingClassificationType;
  complianceOutcome?: ComplianceOutcome;
  explanationBasis: string;
  supportingEvidence: string[];
}

interface Report {
  id: string;
  findings: Finding[];
  explanation: { text: string; referencedFindingIds: string[] } | null;
  generatedAt: string;
}

export default function AccountReportPage() {
  const params = useParams<{ orderId: string }>();
  const [report, setReport] = useState<Report | "LOADING" | "NOT_FOUND">("LOADING");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await fetch(`/api/account/reports/${params.orderId}`, { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setReport("NOT_FOUND");
        return;
      }
      setReport(await res.json());
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.orderId]);

  if (report === "LOADING") return <p>Loading...</p>;
  if (report === "NOT_FOUND") return <p>Report not found, or this account doesn&apos;t have access to it.</p>;

  const knownAndInferred = report.findings.filter((f) => f.classification !== FindingClassification.REQUIRES_VERIFICATION);
  const requiresVerification = report.findings.filter((f) => f.classification === FindingClassification.REQUIRES_VERIFICATION);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <a href="/account">&larr; Back to your account</a>
      <h1>Permit Preflight - Screening Report</h1>
      <p>Generated: {new Date(report.generatedAt).toLocaleString()}</p>

      <h2>Findings</h2>
      {knownAndInferred.map((f, i) => (
        <div key={i} style={{ padding: 8, marginBottom: 8, border: "1px solid #ddd" }}>
          <strong>{f.subject}</strong> - {f.classification}
          {f.complianceOutcome ? ` (${f.complianceOutcome})` : ""}
          <p>{f.explanationBasis}</p>
        </div>
      ))}

      {requiresVerification.length > 0 && (
        <>
          <h2>Requires verification</h2>
          {requiresVerification.map((f, i) => (
            <div key={i} style={{ padding: 8, marginBottom: 8, border: "1px solid #ddd" }}>
              <strong>{f.subject}</strong>
              <p>{f.explanationBasis}</p>
            </div>
          ))}
        </>
      )}

      {report.explanation && (
        <>
          <h2>Explanation</h2>
          <p>{report.explanation.text}</p>
        </>
      )}
    </main>
  );
}
