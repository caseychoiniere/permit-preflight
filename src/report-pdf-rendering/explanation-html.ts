import { ABOUT_HEADING, SUMMARY_HEADING, buildExplanationView, type FindingLike } from "../report-explanation/structured.js";

/**
 * The PDF's Explanation: the same sections, in the same order, from the same view model as the web report (app/components/ExplanationSections.tsx). Real headings,
 * paragraphs and lists - never one escaped text block. Inline styles only (the print template has no stylesheet).
 */

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BORDER: Record<string, string> = { satisfied: "#059669", issues: "#dc2626", requiresVerification: "#b45309", additionalConsiderations: "#0284c7", legacy: "#cbd5e1" };

export function explanationHtml(explanation: unknown, findings?: FindingLike[]): string {
  const view = buildExplanationView(explanation, findings);
  if (!view) return "<h2>Explanation</h2><p><em>Plain-language synthesis is temporarily unavailable.</em></p>";
  const parts: string[] = ["<h2>Explanation</h2>", `<h3>${escapeHtml(SUMMARY_HEADING)}</h3>`, ...view.summaryParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`)];
  for (const section of view.sections) {
    parts.push(`<h3 style="margin-top: 18px;">${escapeHtml(section.heading)}</h3>`, '<ul style="list-style: none; padding-left: 0;">');
    for (const item of section.items) {
      parts.push(
        `<li style="border-left: 4px solid ${BORDER[section.key]}; padding-left: 8px; margin-bottom: 10px; page-break-inside: avoid;">` +
          (item.title ? `<strong>${escapeHtml(item.title)}</strong><br>` : "") +
          `${escapeHtml(item.text)}` +
          (item.basedOn.length > 0 ? `<br><small style="color: #64748b;">Based on: ${escapeHtml(item.basedOn.join("; "))}</small>` : "") +
          "</li>"
      );
    }
    parts.push("</ul>");
  }
  if (view.about) parts.push(`<h3 style="margin-top: 18px;">${escapeHtml(ABOUT_HEADING)}</h3>`, `<p>${escapeHtml(view.about)}</p>`);
  return parts.join("\n  ");
}
