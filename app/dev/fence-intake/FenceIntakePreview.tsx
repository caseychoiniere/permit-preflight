"use client";

import { useState } from "react";
import { FenceDetailsForm } from "../../configure/FenceDetailsForm.js";
import { ReportView, type Report } from "../../components/ReportView.js";
import { buildFenceReportForProject, type FencePreviewReport } from "../../../src/dev-preview/fence-preview-fixtures.js";
import type { FenceProjectConfiguration } from "../../../src/screening-request/types.js";

export function FenceIntakePreview() {
  const [report, setReport] = useState<FencePreviewReport | null>(null);
  const [submitted, setSubmitted] = useState<FenceProjectConfiguration | null>(null);

  function onSubmit(config: FenceProjectConfiguration) {
    setSubmitted(config);
    setReport(buildFenceReportForProject({ projectType: "fence", ...config }, "intake"));
  }

  return (
    <div>
      <FenceDetailsForm onSubmit={onSubmit} onBack={() => setReport(null)} />
      {submitted && (
        <details style={{ marginTop: 16 }} open>
          <summary>Validated configuration submitted</summary>
          <pre data-testid="submitted-config" style={{ background: "#f5f5f5", padding: 8, overflow: "auto" }}>
            {JSON.stringify(submitted, null, 2)}
          </pre>
        </details>
      )}
      {report && (
        <section aria-label="Resulting report" style={{ marginTop: 24 }}>
          <ReportView report={report as unknown as Report} />
        </section>
      )}
    </div>
  );
}
