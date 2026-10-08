"use client";

import { useState } from "react";
import { DeckDetailsForm } from "../../configure/DeckDetailsForm.js";
import { ReportView, type Report } from "../../components/ReportView.js";
import { buildDeckReportForProject, type DeckPreviewReport } from "../../../src/dev-preview/deck-preview-fixtures.js";
import type { DeckProjectConfiguration } from "../../../src/screening-request/types.js";

export function DeckIntakePreview() {
  const [report, setReport] = useState<DeckPreviewReport | null>(null);
  const [submitted, setSubmitted] = useState<DeckProjectConfiguration | null>(null);

  function onSubmit(config: DeckProjectConfiguration) {
    setSubmitted(config);
    setReport(buildDeckReportForProject({ projectType: "deck", ...config }, "intake"));
  }

  return (
    <div>
      <DeckDetailsForm onSubmit={onSubmit} onBack={() => setReport(null)} />
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
