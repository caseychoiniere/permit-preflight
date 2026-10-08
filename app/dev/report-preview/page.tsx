/**
 * DEV/TEST-ONLY report preview (Unit 6B). Renders the REAL `ReportView` and the REAL PDF HTML
 * (`renderReportHtml`) side by side from deterministic fixtures produced by the production
 * evaluator (see src/dev-preview/report-preview-fixtures.ts). Returns 404 in any production
 * build - never a customer-facing route. Reads and writes nothing in the database and never
 * touches regulatory lifecycle state. Open at /dev/report-preview while `npm run dev` is running.
 */

import { notFound } from "next/navigation";
import { ReportView, type Report } from "../../components/ReportView.js";
import { PREVIEW_SCENARIOS, buildPreviewReport, toPreviewArtifactRow } from "../../../src/dev-preview/report-preview-fixtures.js";
import { FENCE_PREVIEW_SCENARIOS, buildFencePreviewReport, toFencePreviewArtifactRow } from "../../../src/dev-preview/fence-preview-fixtures.js";
import { DECK_PREVIEW_SCENARIOS, buildDeckPreviewReport, toDeckPreviewArtifactRow } from "../../../src/dev-preview/deck-preview-fixtures.js";
import { ADU_PREVIEW_SCENARIOS, buildAduPreviewReport, toAduPreviewArtifactRow } from "../../../src/dev-preview/adu-preview-fixtures.js";
import { renderReportHtml } from "../../../src/report-pdf-rendering/render.js";
import type { EvidenceReportArtifactRow } from "../../../src/db/schema.js";

export const dynamic = "force-dynamic";

export default async function ReportPreviewPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();

  const { scenario: requested } = await searchParams;
  const fenceScenario = FENCE_PREVIEW_SCENARIOS.find((s) => s.id === requested);
  const deckScenario = DECK_PREVIEW_SCENARIOS.find((s) => s.id === requested);
  const aduScenario = ADU_PREVIEW_SCENARIOS.find((s) => s.id === requested);
  const scenario = fenceScenario ?? deckScenario ?? aduScenario ?? PREVIEW_SCENARIOS.find((s) => s.id === requested) ?? PREVIEW_SCENARIOS[0]!;
  const report = fenceScenario
    ? buildFencePreviewReport(fenceScenario)
    : deckScenario
      ? buildDeckPreviewReport(deckScenario)
      : aduScenario
        ? buildAduPreviewReport(aduScenario)
        : buildPreviewReport(scenario as (typeof PREVIEW_SCENARIOS)[number]);
  const pdfHtml = renderReportHtml(
    (fenceScenario ? toFencePreviewArtifactRow(report as never) : deckScenario ? toDeckPreviewArtifactRow(report as never) : aduScenario ? toAduPreviewArtifactRow(report as never) : toPreviewArtifactRow(report as never)) as unknown as EvidenceReportArtifactRow
  );
  const allScenarios = [...PREVIEW_SCENARIOS, ...FENCE_PREVIEW_SCENARIOS, ...DECK_PREVIEW_SCENARIOS, ...ADU_PREVIEW_SCENARIOS];
  const groups = Array.from(new Set(allScenarios.map((s) => s.group)));

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>Unit 6B report preview (dev only)</h1>
      <p>
        Fixtures come from the real evaluator over in-memory rules. No database access, no lifecycle changes. Currently showing: <strong>{scenario.title}</strong> ({scenario.id}).
      </p>
      <nav aria-label="Preview scenarios">
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: 8 }}>
            <strong>{group}: </strong>
            {allScenarios.filter((s) => s.group === group).map((s) => (
              <a key={s.id} href={`?scenario=${s.id}`} style={{ marginRight: 12, fontWeight: s.id === scenario.id ? 700 : 400 }}>
                {s.title}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <section aria-label="Web report">
          <h2>Web (ReportView)</h2>
          <ReportView report={report as unknown as Report} />
        </section>
        <section aria-label="PDF HTML">
          <h2>PDF HTML (renderReportHtml)</h2>
          <iframe title="PDF HTML preview" srcDoc={pdfHtml} style={{ width: "100%", height: 900, border: "1px solid #ccc", background: "#fff" }} />
        </section>
      </div>
    </main>
  );
}
