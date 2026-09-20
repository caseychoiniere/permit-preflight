/**
 * Deterministic tests for explainFindings' own prompt construction (report-explanation/index.ts)
 * - no prior test file exercised this directly (anthropic-wiring.test.ts covers the
 * generateReportExplanation wiring/degradation layer, not the prompt content itself). Added
 * 2026-09-15 as part of the maintenance correction closing two real deterministic-to-LLM boundary
 * gaps found during Unit 6B founder acceptance testing: a customer report asked the homeowner to
 * supply setback distances that are actually computed server-side, and a separate synthesis
 * asserted a specific claim not present in any individual finding's own basis text.
 */
import { describe, expect, it } from "vitest";
import { explainFindings, ExplanationSchema } from "../../src/report-explanation/index.js";
import type { AiCompletionClient } from "../../src/rule-research-assistant/index.js";
import type { Finding } from "../../src/regulatory-rules-engine/types.js";

function capturingClient(response: unknown): { client: AiCompletionClient; capturedPrompt: () => string | undefined } {
  let capturedPrompt: string | undefined;
  return {
    client: {
      completeStructured: async (prompt: string) => {
        capturedPrompt = prompt;
        return response;
      },
    },
    capturedPrompt: () => capturedPrompt,
  };
}

const rearSetbackFinding: Finding = {
  subject: "Shed rear setback",
  classification: "REQUIRES_VERIFICATION",
  explanationBasis: "Cannot evaluate: The front, rear, and side property lines could not be confidently identified for this parcel's shape.",
  supportingEvidence: [],
};

describe("explainFindings - prompt construction (maintenance correction, 2026-09-15)", () => {
  it("[maintenance correction] the prompt forbids attributing an evidence gap to the homeowner", async () => {
    const { client, capturedPrompt } = capturingClient({ text: "ok", referencedFindingIds: ["0"] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toMatch(/never something the homeowner failed to provide or must go calculate themselves/i);
  });

  it("[maintenance correction] the prompt forbids asserting any claim absent from a finding's own basis/evidence", async () => {
    const { client, capturedPrompt } = capturingClient({ text: "ok", referencedFindingIds: ["0"] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toMatch(/does not appear in at least one finding's own explanationBasis or supportingEvidence/i);
    expect(capturedPrompt()).toMatch(/do not generalize, combine, or infer a new claim across multiple findings/i);
  });

  it("every finding's exact explanationBasis text is included verbatim in the prompt", async () => {
    const { client, capturedPrompt } = capturingClient({ text: "ok", referencedFindingIds: ["0"] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toContain(rearSetbackFinding.explanationBasis);
  });

  it("[hard invariant, unchanged] still forbids changing/questioning/reinterpreting classification or compliance outcome", async () => {
    const { client, capturedPrompt } = capturingClient({ text: "ok", referencedFindingIds: ["0"] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toMatch(/do not change, question, or reinterpret any classification or compliance outcome/i);
  });

  it("[hard invariant, unchanged] a schema-invalid AI response degrades to UNAVAILABLE rather than throwing", async () => {
    const { client } = capturingClient({ notTheRightShape: true });
    const result = await explainFindings([rearSetbackFinding], client);
    expect(result.outcome).toBe("UNAVAILABLE");
  });

  it("[hard invariant, unchanged] a valid response validates against ExplanationSchema and is returned AVAILABLE", async () => {
    const { client } = capturingClient({ text: "A real explanation.", referencedFindingIds: ["0"] });
    const result = await explainFindings([rearSetbackFinding], client);
    expect(result.outcome).toBe("AVAILABLE");
    if (result.outcome === "AVAILABLE") {
      expect(ExplanationSchema.safeParse(result.explanation).success).toBe(true);
    }
  });
});
