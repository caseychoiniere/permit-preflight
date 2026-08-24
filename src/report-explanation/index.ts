/**
 * Report Explanation - RGD-5. Turns finalized deterministic findings into plain-language
 * narrative, and nothing else. Reuses the AiCompletionClient interface shape Unit 1 established
 * for Rule Research Assistant (Functional Design Question 4), but is a structurally distinct
 * module/use-case - this file has no import of regulatory-rule-governance/lifecycle.ts, and
 * cannot alter classification, evidence, or governance state (BR-U2-8).
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";
import type { AiCompletionClient } from "../rule-research-assistant/index.js";
import type { Finding } from "../regulatory-rules-engine/types.js";

export const ExplanationSchema = z.object({
  text: z.string().min(1),
  referencedFindingIds: z.array(z.string()),
});

export type Explanation = z.infer<typeof ExplanationSchema>;

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
    const validated = validateAtBoundary(ExplanationSchema, raw);
    if (validated.outcome === "INVALID") {
      return { outcome: "UNAVAILABLE", reason: `AI explanation output failed schema validation: ${validated.issues.join("; ")}` };
    }
    return { outcome: "AVAILABLE", explanation: validated.data };
  } catch (err) {
    return { outcome: "UNAVAILABLE", reason: err instanceof Error ? err.message : "Unknown explanation failure." };
  }
}

function buildExplanationPrompt(findings: Finding[]): string {
  const findingsText = findings
    .map((f, i) => `[${i}] subject="${f.subject}" classification=${f.classification}${f.complianceOutcome ? ` compliance=${f.complianceOutcome}` : ""} basis="${f.explanationBasis}"`)
    .join("\n");
  return [
    "Explain the following deterministic buildability findings in plain, homeowner-friendly language.",
    "Do NOT change, question, or reinterpret any classification or compliance outcome - only explain what is already there.",
    "Reference specific finding indices (from the [N] labels below) in referencedFindingIds.",
    "Respond with ONLY a JSON object: {\"text\": string, \"referencedFindingIds\": string[]}. No markdown fences.",
    "",
    "Findings:",
    findingsText,
  ].join("\n");
}
