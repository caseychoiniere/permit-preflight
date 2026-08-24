/**
 * Live Anthropic integration test for Report Explanation (RGD-5). Skips cleanly without
 * ANTHROPIC_API_KEY - NOT executed in this Code Generation session.
 */

import { describe, expect, it } from "vitest";
import { createAnthropicCompletionClient } from "../../src/rule-research-assistant/anthropic-client.js";
import { explainFindings } from "../../src/report-explanation/index.js";
import type { Finding } from "../../src/regulatory-rules-engine/types.js";

const hasKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

const sampleFindings: Finding[] = [
  {
    classification: "KNOWN",
    subject: "Rear setback",
    complianceOutcome: "PASS",
    supportingEvidence: ["distanceToRearLotLineFt=10"],
    explanationBasis: "Rear setback 10ft meets the required 5ft minimum.",
  },
  {
    classification: "REQUIRES_VERIFICATION",
    subject: "Dwelling separation",
    supportingEvidence: [],
    explanationBasis: "Cannot evaluate: distanceToDwellingFt is not available.",
  },
];

describe.skipIf(!hasKey)("Report Explanation live Anthropic integration", () => {
  it("produces a schema-valid explanation from real findings", async () => {
    const ai = createAnthropicCompletionClient();
    const result = await explainFindings(sampleFindings, ai);
    expect(result.outcome).toBe("AVAILABLE");
    if (result.outcome === "AVAILABLE") {
      expect(result.explanation.text.length).toBeGreaterThan(0);
    }
  }, 30000);
});

describe.skipIf(hasKey)("Report Explanation live Anthropic integration (skipped)", () => {
  it("documents why this suite did not run", () => {
    expect(hasKey).toBe(false); // ANTHROPIC_API_KEY not provisioned in this environment.
  });
});
