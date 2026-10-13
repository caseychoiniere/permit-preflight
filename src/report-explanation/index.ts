/**
 * Report Explanation - RGD-5. Turns finalized deterministic findings into plain-language
 * narrative, and nothing else. Reuses the AiCompletionClient interface shape Unit 1 established
 * for Rule Research Assistant (Functional Design Question 4), but is a structurally distinct
 * module/use-case - this file has no import of regulatory-rule-governance/lifecycle.ts, and
 * cannot alter classification, evidence, or governance state (BR-U2-8).
 */

import { validateAtBoundary } from "../shared/validation.js";
import type { AiCompletionClient } from "../rule-research-assistant/index.js";
import type { Finding } from "../regulatory-rules-engine/types.js";
import { logger } from "../shared/logger.js";
import { ModelExplanationSchema, buildExplanation, countFindings, overallStatus, type Explanation, type OverallStatus } from "./structured.js";

export { ExplanationSchema, type Explanation } from "./structured.js";

export type ExplanationResult = { outcome: "AVAILABLE"; explanation: Explanation } | { outcome: "UNAVAILABLE"; reason: string };

/**
 * Consumes only finalized deterministic Finding[] - cannot change classification, create new
 * regulatory conclusions, alter supporting evidence, or invoke governance transitions (there is
 * no import here that could do any of those). Degrades safely: on any failure (provider error,
 * timeout, schema-invalid output), returns UNAVAILABLE rather than throwing - the pipeline must
 * proceed without explanation, never fail the whole report (BR-U2-8).
 */
export async function explainFindings(findings: Finding[], ai: AiCompletionClient): Promise<ExplanationResult> {
  if (findings.length === 0) {
    return { outcome: "UNAVAILABLE", reason: "No findings to explain." };
  }

  try {
    const prompt = buildExplanationPrompt(findings);
    const raw = await ai.completeStructured(prompt, "plain-language report explanation");
    const validated = validateAtBoundary(ModelExplanationSchema, raw);
    if (validated.outcome === "INVALID") {
      return { outcome: "UNAVAILABLE", reason: `AI explanation output failed schema validation: ${validated.issues.join("; ")}` };
    }
    // The structure (sections, titles, coverage, the leading summary paragraph) comes from the deterministic findings; the model contributes only the notes and summary
    // paragraphs that pass acceptance (structured.ts). `evidenceRefs` index `findings`; the pipeline remaps them to the stored findings array.
    const { explanation, report } = buildExplanation(validated.data, findings);
    if (report.rejectedNotes + report.ignoredNotes + report.rejectedSummaryParagraphs > 0) logger.warn("REPORT_EXPLANATION_ADJUSTED", { ...report });
    return { outcome: "AVAILABLE", explanation };
  } catch (err) {
    return { outcome: "UNAVAILABLE", reason: err instanceof Error ? err.message : "Unknown explanation failure." };
  }
}

const SUMMARY_STRENGTH: Record<OverallStatus, string> = {
  HAS_FAILURE:
    "At least one requirement is DEFINITELY NOT MET. The summary must say plainly that this specific proposal has a problem. It must not describe the proposal as allowed, feasible, buildable or compliant, and must not say \"you can build\" or \"you're allowed to build\" it, however many other findings are positive.",
  HAS_VERIFICATION:
    "Nothing is definitely unmet, but at least one requirement is UNRESOLVED (requires verification). The summary must say the proposal cannot yet be called feasible, and must not say it is allowed, approved or compliant.",
  ALL_MET: "Every checked requirement is met. The summary may say the proposal appears to meet the requirements that were checked, and that this is a screening rather than a permit decision.",
  NOTHING_CHECKED: "No requirement produced a result. Say so; make no statement about whether the proposal is allowed.",
};

function buildExplanationPrompt(findings: Finding[]): string {
  const findingsText = findings
    .map((f, i) => `[${i}] subject="${f.subject}" classification=${f.classification}${f.complianceOutcome ? ` compliance=${f.complianceOutcome}` : ""} basis="${f.explanationBasis}"`)
    .join("\n");
  const c = countFindings(findings);
  const status = overallStatus(findings);
  return [
    "Explain the following deterministic buildability findings for a homeowner, as structured report content.",
    "",
    "Hard rules - you EXPLAIN deterministic findings; you may NOT strengthen them:",
    "Do NOT change, question, or reinterpret any classification or compliance outcome - only explain what is already there.",
    "A REQUIRES_VERIFICATION finding is never described as complying, allowed, approved or satisfied. A compliance=FAIL finding is never softened.",
    "Never describe the whole proposal as allowed, feasible, buildable, compliant or approved, and never write \"you can build this\" or \"you're allowed to build this\", unless the overall result below explicitly allows it. A finding that a USE or UNIT COUNT is allowed (for example that accessory dwelling units are allowed in this zoning context) supports only that narrow statement: say \"ADUs are an allowed residential use in this zoning context, but this specific proposal still has requirements that need attention\" (or equivalent), never \"this ADU is allowed\".",
    "Never promise what the city will decide (\"will be approved\", \"will qualify\", \"will pass\").",
    // Maintenance correction (2026-09-15) - closes a real deterministic-to-LLM boundary gap, not a
    // wording preference: a customer report asked the homeowner to "provide" setback distances
    // that are actually computed server-side from placement geometry, and a separate synthesis
    // asserted a specific claim ("the city will officially verify this") that existed in no
    // individual finding's own basis text. Both are now structurally forbidden, not merely
    // discouraged by tone.
    "A REQUIRES_VERIFICATION finding whose basis says a value \"is not available\" or gives a specific reason for that gap reflects an evidence limitation in what this system could determine - never something the homeowner failed to provide or must go calculate themselves. State the reason given in that finding's own basis; do not imply the homeowner is responsible for supplying it.",
    "Never state a fact, requirement, or conclusion that does not appear in at least one finding's own explanationBasis or supportingEvidence below. Do not generalize, combine, or infer a new claim across multiple findings (for example, inventing a shared procedural requirement) unless that exact claim is already present in one of them.",
    "",
    `Overall deterministic result: ${status} (${c.fail} definitely not met, ${c.verify} requires verification, ${c.pass} met, ${c.info} informational).`,
    SUMMARY_STRENGTH[status],
    "",
    "How to write it:",
    "- Write for a homeowner. Short paragraphs, plain words, no legalistic filler, no re-listing the whole report mechanically.",
    "- The report already states the overall result in its first line, and already lists every definitely-not-met and unresolved finding under its own title with its own basis. Your summary and notes add plain-language context; they never replace those.",
    "- summary: 1 or 2 short paragraphs (2 or 3 sentences each) of context for the homeowner: what appears feasible, what is wrong, what still needs verification, and what to pay attention to next. Build each paragraph from the findings' own terms rather than new vocabulary. Do not repeat every finding. Do not restate the counts. Do not introduce any distance, area, percentage or other figure that is not in a finding below, and do not state any fact, requirement or conclusion that no finding states (for example, never say the property or project \"is eligible\" or that a permit is or is not required).",
    "- notes: a plain-language note about individual findings, each {\"ref\": N, \"text\": string}, ref being the [N] index of exactly ONE finding. Write a note for every finding that is not met (compliance=FAIL) or REQUIRES_VERIFICATION, and a one-sentence note for each met finding worth the homeowner's attention (the report lists the others as they are). A note explains only its own finding, in plain words that stay close to the finding's own wording: keep its key terms and its figures, and add no claim of your own (nothing about permits, eligibility, approvals or what the city requires that the finding does not itself state). A note about a failure must say plainly that the requirement is not met and keep the figures from its basis. A note about a REQUIRES_VERIFICATION finding must say plainly that it is unresolved and why. No titles, no headings, no grouping - the report groups by classification itself.",
    "- Do not repeat the same caveat in several notes.",
    "Respond with ONLY a JSON object: {\"summary\": string, \"notes\": [{\"ref\": number, \"text\": string}]}. No markdown, no markdown fences, no ** or # characters inside any string.",
    "",
    "Findings:",
    findingsText,
  ].join("\n");
}

