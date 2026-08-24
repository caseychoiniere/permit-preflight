/**
 * Live Anthropic integration test for RRAG-1 (real AI-assisted candidate rule synthesis).
 * Skipped (not failed) when ANTHROPIC_API_KEY is unset, so this file is safe to include in
 * `npm run test:integration` in any environment. NOT executed in the Build & Test session that
 * wrote this file - no ANTHROPIC_API_KEY was provisioned in that sandbox (see
 * build-and-test-summary.md for the concrete reason and what remains to run this for real).
 */

import { describe, expect, it } from "vitest";
import { createAnthropicCompletionClient } from "../../src/rule-research-assistant/anthropic-client.js";
import { researchCandidateRule } from "../../src/rule-research-assistant/index.js";
import type { PermittedSourceEvidenceBundle } from "../../src/regulatory-source-access/index.js";

const hasKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

const realEvidenceBundle: PermittedSourceEvidenceBundle = {
  sourceExcerpts: [
    {
      text:
        "23.44.090 Accessory structures. Table A: Rear yard setback for accessory structures 5 feet, except " +
        "0 feet if the rear lot line abuts an alley.",
      citation: "SMC 23.44.090 Table A",
    },
  ],
  citationMetadata: { smcSections: ["SMC 23.44.090 Table A"], ordinanceNumber: "127376" },
  acquisitionMethod: "human-interactive-browser (Municode) - captured during Unit 0B",
  acquiredAt: "2026-08-19T00:00:00Z",
};

describe.skipIf(!hasKey)("Rule Research Assistant / RRAG-1 live Anthropic integration", () => {
  it("produces a schema-valid candidate rule package from real evidence", async () => {
    const ai = createAnthropicCompletionClient();
    const result = await researchCandidateRule(
      { targetRuleNeed: "shed rear-yard setback", applicableProjectType: "shed", applicableZone: "NR", evidenceBundle: realEvidenceBundle },
      ai
    );
    expect(result.subject.length).toBeGreaterThan(0);
    expect(["TIER_1", "TIER_2"]).toContain(result.suggestedTier);
    expect(result.reasoningChain.length).toBeGreaterThan(0);
  }, 30000);
});

describe.skipIf(hasKey)("Rule Research Assistant / RRAG-1 live Anthropic integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasKey).toBe(false); // ANTHROPIC_API_KEY not provisioned in this environment.
  });
});
