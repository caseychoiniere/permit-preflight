import { ABOUT_HEADING, SUMMARY_HEADING, buildExplanationView, type ExplanationViewSection, type FindingLike } from "../../src/report-explanation/structured.js";

/**
 * The report's Explanation as real sections (headings, paragraphs, lists) from the structured explanation - the same view model the PDF renders, so the two cannot
 * drift. Empty sections are never rendered. Presentational only; the explanation is stored data, never recomputed here.
 */

const SECTION_MARK: Record<ExplanationViewSection["key"], string> = {
  satisfied: "border-emerald-500",
  issues: "border-red-500",
  requiresVerification: "border-amber-500",
  additionalConsiderations: "border-sky-500",
  legacy: "border-slate-300",
};

/** `findings` are the report's own: they let an explanation written before the structured contract be re-screened against them. */
export function ExplanationSections({ explanation, findings }: { explanation: unknown; findings?: FindingLike[] }) {
  const view = buildExplanationView(explanation, findings);
  if (!view) return <p className="mb-8 text-sm text-slate-600"><em>Plain-language synthesis is temporarily unavailable.</em></p>;
  return (
    <div className="mb-8 max-w-prose space-y-7 text-sm leading-relaxed text-slate-700" data-testid="explanation">
      <section aria-labelledby="explanation-summary">
        <h4 id="explanation-summary" className="mb-3 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {SUMMARY_HEADING}
        </h4>
        <div className="space-y-2">
          {view.summaryParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>
      {view.sections.map((section, si) => (
        <section key={`${section.key}-${si}`} aria-labelledby={`explanation-${section.key}-${si}`}>
          <h4 id={`explanation-${section.key}-${si}`} className="mb-3 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {section.heading}
          </h4>
          <ul className="space-y-3">
            {section.items.map((item, i) => (
              <li key={i} className={`border-l-4 pl-3 ${SECTION_MARK[section.key]}`}>
                {item.title && <p className="font-semibold text-slate-900">{item.title}</p>}
                <p className={item.title ? "mt-0.5" : undefined}>{item.text}</p>
                {item.basedOn.length > 0 && <p className="mt-1 text-xs text-slate-500">Based on: {item.basedOn.join("; ")}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {view.about && (
        <section aria-labelledby="explanation-about">
          <h4 id="explanation-about" className="mb-3 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {ABOUT_HEADING}
          </h4>
          <p>{view.about}</p>
        </section>
      )}
    </div>
  );
}
