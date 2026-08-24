import { describe, expect, it } from "vitest";
import { createAnthropicCompletionClient } from "../../src/rule-research-assistant/anthropic-client.js";

describe("createAnthropicCompletionClient (deterministic, no network)", () => {
  it("[hard invariant] throws immediately when no API key is available, never falling back to a fabricated response", () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try {
      expect(() => createAnthropicCompletionClient({})).toThrow(/ANTHROPIC_API_KEY is not set/);
    } finally {
      if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved;
    }
  });

  it("does not throw when an explicit apiKey is supplied, even without an env var", () => {
    expect(() => createAnthropicCompletionClient({ apiKey: "sk-ant-test-only-not-a-real-key" })).not.toThrow();
  });
});
