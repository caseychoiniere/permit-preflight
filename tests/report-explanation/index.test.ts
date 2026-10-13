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
    const { client, capturedPrompt } = capturingClient({ summary: "ok", notes: [{ ref: 0, text: "The rear setback could not be determined." }] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toMatch(/never something the homeowner failed to provide or must go calculate themselves/i);
  });

  it("[maintenance correction] the prompt forbids asserting any claim absent from a finding's own basis/evidence", async () => {
    const { client, capturedPrompt } = capturingClient({ summary: "ok", notes: [{ ref: 0, text: "The rear setback could not be determined." }] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toMatch(/does not appear in at least one finding's own explanationBasis or supportingEvidence/i);
    expect(capturedPrompt()).toMatch(/do not generalize, combine, or infer a new claim across multiple findings/i);
  });

  it("every finding's exact explanationBasis text is included verbatim in the prompt", async () => {
    const { client, capturedPrompt } = capturingClient({ summary: "ok", notes: [{ ref: 0, text: "The rear setback could not be determined." }] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toContain(rearSetbackFinding.explanationBasis);
  });

  it("[hard invariant, unchanged] still forbids changing/questioning/reinterpreting classification or compliance outcome", async () => {
    const { client, capturedPrompt } = capturingClient({ summary: "ok", notes: [{ ref: 0, text: "The rear setback could not be determined." }] });
    await explainFindings([rearSetbackFinding], client);
    expect(capturedPrompt()).toMatch(/do not change, question, or reinterpret any classification or compliance outcome/i);
  });

  it("[hard invariant, unchanged] a schema-invalid AI response degrades to UNAVAILABLE rather than throwing", async () => {
    const { client } = capturingClient({ notTheRightShape: true });
    const result = await explainFindings([rearSetbackFinding], client);
    expect(result.outcome).toBe("UNAVAILABLE");
  });

  it("[hard invariant, unchanged] a valid response validates against ExplanationSchema and is returned AVAILABLE", async () => {
    const { client } = capturingClient({ summary: "A real explanation.", notes: [{ ref: 0, text: "The rear setback could not be determined." }] });
    const result = await explainFindings([rearSetbackFinding], client);
    expect(result.outcome).toBe("AVAILABLE");
    if (result.outcome === "AVAILABLE") {
      expect(ExplanationSchema.safeParse(result.explanation).success).toBe(true);
    }
  });

  // Structured explanation (2026-10-13): the prompt carries the whole of the no-strengthening contract.
  it("[explanation safety invariant] the prompt states the overall deterministic result and limits how strong the summary may be", async () => {
    const { client, capturedPrompt } = capturingClient(
      { summary: "ok", notes: [] }
    );
    await explainFindings([rearSetbackFinding, { subject: "Rear setback", classification: "KNOWN", complianceOutcome: "FAIL", explanationBasis: "Too close.", supportingEvidence: [] }], client);
    const p = capturedPrompt()!;
    expect(p).toMatch(/Overall deterministic result: HAS_FAILURE \(1 definitely not met, 1 requires verification, 0 met/);
    expect(p).toMatch(/must not describe the proposal as allowed, feasible, buildable or compliant/);
    expect(p).toMatch(/you EXPLAIN deterministic findings; you may NOT strengthen them/);
    expect(p).toMatch(/never described as complying, allowed, approved or satisfied/);
    expect(p).toMatch(/Never describe the whole proposal as allowed/);
    expect(p).toMatch(/for example that accessory dwelling units are allowed in this zoning context\) supports only that narrow statement/);
    expect(p).toMatch(/never "this ADU is allowed"/);
    expect(p).toMatch(/Never promise what the city will decide/);
  });
  it("the prompt asks for context and per-finding notes only - no titles, grouping or sections - written for a homeowner, with no markdown", async () => {
    const { client, capturedPrompt } = capturingClient({ summary: "ok", notes: [] });
    await explainFindings([rearSetbackFinding], client);
    const p = capturedPrompt()!;
    expect(p).toMatch(/summary: 1 or 2 short paragraphs \(2 or 3 sentences each\) of context/);
    expect(p).toMatch(/Build each paragraph from the findings' own terms/);
    expect(p).toMatch(/Do not repeat every finding/);
    expect(p).toMatch(/Do not restate the counts/);
    expect(p).toMatch(/Do not introduce any distance, area, percentage or other figure that is not in a finding/);
    expect(p).toMatch(/Write for a homeowner/);
    expect(p).toMatch(/no legalistic filler/);
    expect(p).toMatch(/Do not repeat the same caveat/);
    expect(p).toMatch(/already states the overall result in its first line, and already lists every definitely-not-met and unresolved finding/);
    expect(p).toMatch(/\{"ref": N, "text": string\}, ref being the \[N\] index of exactly ONE finding/);
    expect(p).toMatch(/A note about a failure must say plainly that the requirement is not met and keep the figures from its basis/);
    expect(p).toMatch(/A note about a REQUIRES_VERIFICATION finding must say plainly that it is unresolved and why/);
    expect(p).toMatch(/stay close to the finding's own wording: keep its key terms and its figures, and add no claim of your own/);
    expect(p).toMatch(/never say the property or project "is eligible"/);
    expect(p).toMatch(/No titles, no headings, no grouping/);
    expect(p).toMatch(/no \*\* or # characters/);
    expect(p).toContain('[0] subject="Shed rear setback"');
  });
  it("the overall status in the prompt follows the findings (verification only, all met)", async () => {
    const empty = { summary: "ok", notes: [] };
    const a = capturingClient(empty);
    await explainFindings([rearSetbackFinding], a.client);
    expect(a.capturedPrompt()).toMatch(/Overall deterministic result: HAS_VERIFICATION/);
    const b = capturingClient(empty);
    await explainFindings([{ subject: "x", classification: "KNOWN", complianceOutcome: "PASS", explanationBasis: "met", supportingEvidence: [] }], b.client);
    expect(b.capturedPrompt()).toMatch(/Overall deterministic result: ALL_MET/);
  });
});
