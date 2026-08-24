/**
 * Rule Research Assistant - domain-entities.md "Rule Research Assistant". Consumes a
 * PermittedSourceEvidenceBundle (never acquires source material itself - that's Regulatory
 * Source Access) and uses the AI Service to synthesize a candidate rule package.
 *
 * Structural guardrail: this module's return type can only ever represent DRAFTED-stage material
 * (see draft() in regulatory-rule-governance/lifecycle.ts) - there is no function here that can
 * produce a TRIAGED, APPROVED, or ACTIVE rule. The suggested tier is plain data on the return
 * value, consumed by a human as ADVISORY input to triage() - this module never calls triage()
 * itself. This file has no import of anything from regulatory-rule-governance/lifecycle.ts -
 * that absence is itself part of the guardrail (see tests/rule-research-assistant/research.test.ts's
 * structural assertion).
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";
import { RuleTestCaseKind, Tier } from "../regulatory-rule-governance/types.js";
import type { AmbiguityCaveat, RuleCitation, RuleTestCase } from "../regulatory-rule-governance/types.js";
import type { PermittedSourceEvidenceBundle } from "../regulatory-source-access/index.js";

const RuleCitationSchema = z.object({
  smcSections: z.array(z.string()),
  ordinanceNumber: z.string().optional(),
  effectiveDate: z.string().optional(),
  effectiveDateBasis: z.string().optional(),
});

const AmbiguityCaveatSchema = z.object({
  category: z.string(),
  description: z.string(),
  affectedConditionOrInterpretation: z.string(),
  sourceReferences: z.array(z.string()),
  reviewerNotes: z.string().optional(),
  resolutionStatus: z.string(),
});

const RuleTestCaseSchema = z.object({
  kind: z.enum([RuleTestCaseKind.POSITIVE, RuleTestCaseKind.NEGATIVE, RuleTestCaseKind.BOUNDARY, RuleTestCaseKind.EXCEPTION]),
  description: z.string(),
  input: z.record(z.string(), z.unknown()),
  expected: z.record(z.string(), z.unknown()),
});

/**
 * Schema for the AI's structured output. Deliberately does NOT include any lifecycle/tier
 * *confirmation* field - only `suggestedTier`, which the schema itself marks advisory via the
 * TypeScript-level doc comment on CandidateRulePackage below. A schema-valid response can never
 * be, e.g., `{lifecycleState: "ACTIVE"}` - that shape isn't part of this contract at all.
 */
export const CandidateRulePackageSchema = z.object({
  subject: z.string(),
  applicableProjectType: z.string(),
  applicableZone: z.string(),
  ruleSpecification: z.record(z.string(), z.unknown()),
  citation: RuleCitationSchema,
  reasoningChain: z.string(),
  proposedTestCases: z.array(RuleTestCaseSchema),
  caveats: z.array(AmbiguityCaveatSchema),
  suggestedTier: z.enum([Tier.TIER_1, Tier.TIER_2]),
});

export interface CandidateRulePackage {
  subject: string;
  applicableProjectType: string;
  applicableZone: string;
  ruleSpecification: Record<string, unknown>;
  citation: RuleCitation;
  reasoningChain: string;
  proposedTestCases: RuleTestCase[];
  caveats: AmbiguityCaveat[];
  /** Advisory only - a human (Founder) must confirm this via triage(), which never accepts this
   * value as authoritative on its own. */
  suggestedTier: Tier;
}

export interface AiCompletionClient {
  /** Thin seam over the AI Service / AI Provider Adapter (Application Design). Returns the raw
   * parsed JSON response body - deliberately `unknown`, not a caller-supplied generic, because an
   * AI response is external input and MUST cross the Boundary Validator (validateAtBoundary)
   * before any domain code trusts its shape (requirements.md SS6, NFR-5). See
   * `createAnthropicCompletionClient` (anthropic-client.ts) for the concrete implementation. */
  completeStructured(prompt: string, description: string): Promise<unknown>;
}

export interface ResearchCandidateRuleInput {
  targetRuleNeed: string;
  applicableProjectType: string;
  applicableZone: string;
  evidenceBundle: PermittedSourceEvidenceBundle;
}

/**
 * RRAG-1: synthesizes a candidate rule package from a permitted-source evidence bundle. Uses the
 * AI Service for synthesis only - the resulting caveats/reasoning must still be reviewed by a
 * human before the package can advance past DRAFTED (enforced structurally by
 * regulatory-rule-governance/lifecycle.ts, not by this module). The AI's raw output is validated
 * at this boundary (Boundary Validator pattern) - a schema-invalid response is rejected outright,
 * never coerced or repaired into something schema-valid.
 */
export async function researchCandidateRule(
  input: ResearchCandidateRuleInput,
  ai: AiCompletionClient
): Promise<CandidateRulePackage> {
  if (input.evidenceBundle.sourceExcerpts.length === 0) {
    throw new Error("Cannot research a candidate rule from an empty evidence bundle.");
  }

  const prompt = buildResearchPrompt(input);
  const raw = await ai.completeStructured(prompt, `candidate rule package for: ${input.targetRuleNeed}`);

  const validated = validateAtBoundary(CandidateRulePackageSchema, raw);
  if (validated.outcome === "INVALID") {
    throw new Error(`AI-produced candidate rule package failed schema validation: ${validated.issues.join("; ")}`);
  }
  return validated.data;
}

function buildResearchPrompt(input: ResearchCandidateRuleInput): string {
  const excerpts = input.evidenceBundle.sourceExcerpts.map((e) => `[${e.citation}] ${e.text}`).join("\n\n");
  return [
    `Draft a candidate regulatory rule specification for: ${input.targetRuleNeed}`,
    `Project type: ${input.applicableProjectType}. Zone: ${input.applicableZone}.`,
    `Use ONLY the following permitted-source evidence. Write an independently-worded rule`,
    `specification - never reproduce the source text verbatim. Identify any genuine ambiguity`,
    `(do not force a clean answer if the source is unclear) and suggest TIER_1 only if the rule`,
    `is a single unambiguous threshold with no conflicting provisions and no exceptions; suggest`,
    `TIER_2 for anything else, defaulting to TIER_2 when in doubt.`,
    ``,
    `Respond with ONLY a single JSON object with exactly these fields: subject (string),`,
    `applicableProjectType (string), applicableZone (string), ruleSpecification (object),`,
    `citation ({smcSections: string[], ordinanceNumber?, effectiveDate?, effectiveDateBasis?}),`,
    `reasoningChain (string), proposedTestCases (array of {kind: POSITIVE|NEGATIVE|BOUNDARY|EXCEPTION,`,
    `description, input, expected}), caveats (array of {category, description,`,
    `affectedConditionOrInterpretation, sourceReferences: string[], reviewerNotes?, resolutionStatus}),`,
    `suggestedTier (TIER_1 or TIER_2). No markdown fences, no commentary outside the JSON object.`,
    ``,
    `Evidence:`,
    excerpts,
  ].join("\n");
}
