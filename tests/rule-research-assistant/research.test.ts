import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { researchCandidateRule, type AiCompletionClient, type CandidateRulePackage } from "../../src/rule-research-assistant/index.js";
import type { PermittedSourceEvidenceBundle } from "../../src/regulatory-source-access/index.js";

const evidenceBundle: PermittedSourceEvidenceBundle = {
  sourceExcerpts: [
    { text: "Accessory structures in the rear yard shall be set back not less than 5 feet...", citation: "SMC 23.44.090 Table A" },
  ],
  citationMetadata: { smcSections: ["SMC 23.44.090 Table A"], ordinanceNumber: "127376" },
  acquisitionMethod: "human-interactive-browser (Municode)",
  acquiredAt: "2026-08-19T00:00:00Z",
};

const validPackage: CandidateRulePackage = {
  subject: "Detached accessory structure rear-yard setback - NR zone",
  applicableProjectType: "shed",
  applicableZone: "NR",
  ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0 },
  citation: { smcSections: ["SMC 23.44.090 Table A"], ordinanceNumber: "127376" },
  reasoningChain: "SMC 23.44.090 Table A states a 5ft rear setback for accessory structures...",
  proposedTestCases: [
    { kind: "POSITIVE", description: "6ft from rear line - passes", input: { distanceToRearLotLineFt: 6 }, expected: { complianceOutcome: "PASS" } },
  ],
  caveats: [],
  suggestedTier: "TIER_2",
};

/** A fake AiCompletionClient - no network, deterministic, returns whatever the test configures. */
function fakeClient(response: unknown): AiCompletionClient {
  return {
    completeStructured: async () => response,
  };
}

describe("researchCandidateRule (RRAG-1)", () => {
  it("returns a validated candidate package when the AI response is schema-valid", async () => {
    const result = await researchCandidateRule(
      { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
      fakeClient(validPackage)
    );
    expect(result).toEqual(validPackage);
  });

  it("[hard invariant] rejects a schema-invalid AI response rather than coercing or fabricating one", async () => {
    const malformed = { ...validPackage, suggestedTier: "TIER_3_MADE_UP" };
    await expect(
      researchCandidateRule(
        { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
        fakeClient(malformed)
      )
    ).rejects.toThrow(/schema validation/i);
  });

  it(
    "[hard invariant, real-bug regression 2026-08-30] a bare string in place of a test case's " +
      "required {complianceOutcome} object is REJECTED, never coerced/guessed into an object - " +
      "the real Anthropic model has produced exactly this shape (e.g. expected: \"PASS\"); the fix " +
      "for it lives in the prompt (buildResearchPrompt's explicit shape example), not in loosening " +
      "this schema, per researchCandidateRule's own 'never coerced or repaired' contract",
    async () => {
      const badExpected = {
        ...validPackage,
        proposedTestCases: [{ kind: "POSITIVE", description: "6ft from rear line - passes", input: { distanceToRearLotLineFt: 6 }, expected: "PASS" }],
      };
      await expect(
        researchCandidateRule(
          { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
          fakeClient(badExpected)
        )
      ).rejects.toThrow(/schema validation/i);
    }
  );

  it("[hard invariant, real-bug regression 2026-08-30] a caveat missing resolutionStatus entirely is REJECTED, never defaulted to a fabricated status - the real Anthropic model has omitted this required field for one caveat in a multi-caveat response", async () => {
    const missingResolutionStatus = {
      ...validPackage,
      caveats: [{ category: "ambiguity", description: "text", affectedConditionOrInterpretation: "text", sourceReferences: ["SMC 23.44.090"] /* resolutionStatus omitted */ }],
    };
    await expect(
      researchCandidateRule(
        { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
        fakeClient(missingResolutionStatus)
      )
    ).rejects.toThrow(/schema validation/i);
  });

  it("rejects a response missing required fields entirely (e.g. a free-text answer instead of structured JSON)", async () => {
    await expect(
      researchCandidateRule(
        { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
        fakeClient("Sure, here's a summary of the setback rule...")
      )
    ).rejects.toThrow(/schema validation/i);
  });

  it("never calls the AI client at all for an empty evidence bundle", async () => {
    let called = false;
    const client: AiCompletionClient = {
      completeStructured: async () => {
        called = true;
        return validPackage;
      },
    };
    await expect(
      researchCandidateRule(
        {
          targetRuleNeed: "shed rear setback",
          applicableProjectType: "shed",
          applicableZone: "NR",
          evidenceBundle: { ...evidenceBundle, sourceExcerpts: [] },
        },
        client
      )
    ).rejects.toThrow(/empty evidence bundle/i);
    expect(called).toBe(false);
  });

  it("suggestedTier on the returned package is advisory data only - the package is a plain value, not a governance-lifecycle object", async () => {
    const result = await researchCandidateRule(
      { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
      fakeClient(validPackage)
    );
    expect(result).not.toHaveProperty("lifecycleState");
    expect(result).not.toHaveProperty("id");
    expect(result.suggestedTier).toBe("TIER_2");
  });

  it("[hard invariant, real-bug regression 2026-08-30] an explicit JSON null on an optional citation/caveat field is normalized to undefined, not rejected - the real Anthropic model emits null rather than omitting an unknown optional field", async () => {
    const withNulls = {
      ...validPackage,
      citation: { smcSections: ["SMC 23.44.090 Table A"], ordinanceNumber: null, effectiveDate: null, effectiveDateBasis: null },
      caveats: [{ category: "ambiguity", description: "text", affectedConditionOrInterpretation: "text", sourceReferences: ["SMC 23.44.090"], reviewerNotes: null, resolutionStatus: "OPEN" }],
    };
    const result = await researchCandidateRule(
      { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
      fakeClient(withNulls)
    );
    expect(result.citation.ordinanceNumber).toBeUndefined();
    expect(result.citation.effectiveDate).toBeUndefined();
    expect(result.citation.effectiveDateBasis).toBeUndefined();
    expect(result.caveats[0]!.reviewerNotes).toBeUndefined();
    // Never a literal null leaking into the domain shape - RuleCitation/AmbiguityCaveat declare
    // these as `string | undefined`, never `string | null`.
    expect(result.citation).not.toHaveProperty("ordinanceNumber", null);
    expect(Object.values(result.citation)).not.toContain(null);
  });

  it("still accepts a cleanly-omitted optional field (the key missing entirely, not null) - both real shapes work", async () => {
    const omitted = { ...validPackage, citation: { smcSections: ["SMC 23.44.090 Table A"] } };
    const result = await researchCandidateRule(
      { targetRuleNeed: "shed rear setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle },
      fakeClient(omitted)
    );
    expect(result.citation.ordinanceNumber).toBeUndefined();
  });

  it("[hard invariant] AI cannot activate or self-determine final tier: this module has no import statement pulling in regulatory-rule-governance/lifecycle.ts", () => {
    const source = readFileSync(fileURLToPath(new URL("../../src/rule-research-assistant/index.ts", import.meta.url)), "utf-8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    expect(importLines.some((line) => line.includes("regulatory-rule-governance/lifecycle"))).toBe(false);
  });
});
