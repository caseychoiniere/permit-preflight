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
import { FindingClassification, ComplianceOutcome } from "../../../../src/regulatory-rules-engine/types.js";
import type { ComplianceOutcome as ComplianceOutcomeType, FindingClassification as FindingClassificationType } from "../../../../src/regulatory-rules-engine/types.js";
import { Container } from "../../../components/ui/Container.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";

interface Finding {
  subject: string;
  classification: FindingClassificationType;
  complianceOutcome?: ComplianceOutcomeType;
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

  if (report === "LOADING")
    return (
      <Container>
        <p className="text-sm text-slate-500">Loading...</p>
      </Container>
    );
  if (report === "NOT_FOUND")
    return (
      <Container>
        <Card>
          <p className="text-sm text-slate-600">Report not found, or this account doesn&apos;t have access to it.</p>
        </Card>
      </Container>
    );

  const knownAndInferred = report.findings.filter((f) => f.classification !== FindingClassification.REQUIRES_VERIFICATION);
  const requiresVerification = report.findings.filter((f) => f.classification === FindingClassification.REQUIRES_VERIFICATION);

  return (
    <Container>
      <a href="/account" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Back to your account
      </a>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Screening Report</h1>
      <p className="text-sm text-slate-500">Generated: {new Date(report.generatedAt).toLocaleString()}</p>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">Findings</h2>
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

      {requiresVerification.length > 0 && (
        <>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Requires verification</h2>
          <div className="mb-8 flex flex-col gap-3">
            {requiresVerification.map((f, i) => (
              <div key={i} className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4">
                <strong className="text-sm text-slate-900">{f.subject}</strong>
                <p className="mt-2 text-sm text-amber-900">{f.explanationBasis}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {report.explanation && (
        <>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Explanation</h2>
          <p className="text-sm text-slate-600">{report.explanation.text}</p>
        </>
      )}
    </Container>
  );
}
