/**
 * Dev-preview only: a structured explanation built from the real findings WITHOUT a model - one item per finding, titled by its subject, worded by its own basis,
 * with the summary the deterministic counts produce - so every project type's preview shows the real explanation sections (same enforcement, same renderers) with no
 * Anthropic call. Never used for a customer report.
 */
import { isCriticalAreaFinding } from "../regulatory-rules-engine/evaluate.js";
import { buildExplanation, type Explanation } from "../report-explanation/structured.js";
import type { Finding } from "../regulatory-rules-engine/types.js";

export function previewExplanation(allFindings: Finding[]): Explanation {
  // The same boundary the pipeline applies (selectFindingsForExplanation): per-hazard critical-area findings have their own report section.
  const findings = allFindings.filter((f) => !isCriticalAreaFinding(f.subject));
  return buildExplanation({ summary: "Preview only: this explanation is built from the findings, without a model.", notes: findings.map((f, i) => ({ ref: i, text: f.explanationBasis })) }, findings).explanation;
}
