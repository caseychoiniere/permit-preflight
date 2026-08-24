/**
 * Concrete AiCompletionClient backed by the real Anthropic Messages API. This is what satisfies
 * RRAG-1's "AI-assisted research" behavior for real - the AiCompletionClient interface alone
 * (index.ts) is a seam, not an implementation.
 *
 * - ANTHROPIC_API_KEY is read from the environment only, never hardcoded, never logged.
 * - Constructed lazily by the caller (Rule Governance Workflow Service, a later unit's UI/CLI, or
 *   an integration test) - never constructed by deterministic tests or by any code on the
 *   deterministic (`npm test`) path, so its absence never breaks that suite.
 * - Returns the raw parsed JSON body as `unknown` - it does NOT validate against
 *   CandidateRulePackageSchema itself; `researchCandidateRule` (index.ts) owns that validation,
 *   consistent with the Boundary Validator pattern living at the point domain code consumes
 *   external input, not inside the transport client.
 * - Cannot advance rule tier/lifecycle - this client has no dependency on, or knowledge of,
 *   regulatory-rule-governance/lifecycle.ts at all.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicCompletionClientOptions {
  /** Defaults to process.env.ANTHROPIC_API_KEY. Only pass explicitly from a test harness. */
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Constructs a real Anthropic-backed AiCompletionClient. Throws immediately (at construction
 * time, not on first use) if no API key is available - never falls back to a fabricated or
 * simulated response when credentials are missing (per the user's explicit
 * "do not fabricate AI output" constraint).
 */
export function createAnthropicCompletionClient(options: AnthropicCompletionClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. The Anthropic-backed AiCompletionClient requires a real key at " +
        "construction time - it never falls back to a fabricated response. Set it in .env " +
        "(see .env.example) or pass { apiKey } explicitly. Deterministic tests never construct this " +
        "client - see tests/rule-research-assistant/research.test.ts's fake AiCompletionClient instead."
    );
  }
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  return {
    async completeStructured(prompt: string, description: string): Promise<unknown> {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system:
            `You produce ONLY a single valid JSON object matching the requested schema for: ${description}. ` +
            "Output raw JSON only - no markdown code fences, no commentary before or after the object.",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Anthropic API request failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as AnthropicMessageResponse;
      const text = payload.content?.find((block) => block.type === "text")?.text;
      if (!text) {
        throw new Error("Anthropic API response did not include a text content block.");
      }

      const jsonText = stripMarkdownFence(text);
      try {
        return JSON.parse(jsonText) as unknown;
      } catch {
        throw new Error(`Anthropic API response was not valid JSON for "${description}": ${jsonText.slice(0, 300)}`);
      }
    },
  };
}

/** Anthropic models sometimes wrap JSON in ```json fences despite instructions not to - strip
 * only an outer fence, never touch the content, and never repair malformed JSON inside it. */
function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenceMatch ? fenceMatch[1]! : trimmed;
}
