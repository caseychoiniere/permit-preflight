/**
 * Runtime schemas for the aidlc-reviewer MCP tool.
 *
 * Two independent schemas guard the two trust boundaries in this system:
 *  - ReviewGateInputSchema validates what Claude Code sends us (untrusted MCP tool input).
 *  - ModelReviewDecisionSchema validates what OpenAI sends us (untrusted model output), after
 *    JSON.parse. A third layer, checkDecisionInvariants(), enforces the business-logic
 *    invariants a JSON Schema alone cannot express (e.g. "APPROVE implies zero required
 *    changes"). All three must pass before a decision is ever handed back to Claude or logged.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------------------------
// ReviewGateInput (Claude Code -> MCP server)
// ---------------------------------------------------------------------------------------------

/**
 * Matches this repository's actual AI-DLC stages (CLAUDE.md's INCEPTION/CONSTRUCTION phases),
 * not a generic guess. NFR_REQUIREMENTS/NFR_DESIGN/INFRASTRUCTURE_DESIGN/CODE_GENERATION/
 * BUILD_AND_TEST/OPERATIONS added 2026-09-14 (founder correction - the original list was missing
 * most of the per-unit Construction loop and Build & Test/Operations entirely, which made an
 * NFR-Design-to-Code-Generation gate impossible to represent accurately). COMPONENT_DESIGN and
 * IMPLEMENTATION are retained (generic buckets for a sub-component decision or an implementation-
 * level decision that isn't itself a full AI-DLC stage), TESTING/REGULATORY_RULE/OTHER unchanged.
 */
export const GATE_STAGES = [
  "REQUIREMENTS",
  "USER_STORIES",
  "WORKFLOW_PLANNING",
  "FUNCTIONAL_DESIGN",
  "NFR_REQUIREMENTS",
  "NFR_DESIGN",
  "INFRASTRUCTURE_DESIGN",
  "CODE_GENERATION",
  "BUILD_AND_TEST",
  "OPERATIONS",
  "COMPONENT_DESIGN",
  "IMPLEMENTATION",
  "TESTING",
  "REGULATORY_RULE",
  "OTHER",
] as const;

export const GATE_TYPES = [
  "PLAN_APPROVAL",
  "DESIGN_APPROVAL",
  "IMPLEMENTATION_APPROVAL",
  "TEST_APPROVAL",
  "STAGE_TRANSITION",
  "DECISION",
  "REGULATORY_REVIEW",
] as const;

const AlternativeSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

const RiskFlagsSchema = z.object({
  productScope: z.boolean(),
  regulatoryInterpretation: z.boolean(),
  pricingOrMonetization: z.boolean(),
  legalPosture: z.boolean(),
  destructiveDataChange: z.boolean(),
  securitySensitive: z.boolean(),
  materialCostChange: z.boolean(),
});

/** Raw zod shape (not a ZodObject) - this is the shape registerTool()'s inputSchema expects. */
export const ReviewGateInputShape = {
  gateId: z.string().min(1, "gateId must be a non-empty string"),
  stage: z.enum(GATE_STAGES),
  gateType: z.enum(GATE_TYPES),
  unitId: z.string().min(1, "unitId must be a non-empty string"),
  question: z.string().min(1, "question must be a non-empty string"),
  claudeRecommendation: z.string().nullable(),
  alternatives: z.array(AlternativeSchema),
  artifactPaths: z.array(z.string().min(1)),
  changedFiles: z.array(z.string().min(1)),
  acceptanceCriteria: z.array(z.string()),
  testSummary: z.string().nullable(),
  evidenceSummary: z.string().nullable(),
  priorDecisionIds: z.array(z.string().min(1)),
  riskFlags: RiskFlagsSchema,
};

export const ReviewGateInputSchema = z.object(ReviewGateInputShape);
export type ReviewGateInput = z.infer<typeof ReviewGateInputSchema>;

// ---------------------------------------------------------------------------------------------
// ReviewDecision (OpenAI -> MCP server), validated after JSON.parse
// ---------------------------------------------------------------------------------------------

export const DECISIONS = ["APPROVE", "REVISE", "ESCALATE"] as const;
export const AUTHORITIES = ["DELEGATED", "RESERVED_FOUNDER"] as const;
const SEVERITIES = ["INFO", "MINOR", "MAJOR", "CRITICAL"] as const;
const FINDING_CATEGORIES = [
  "REQUIREMENTS",
  "ARCHITECTURE",
  "IMPLEMENTATION",
  "TESTING",
  "SECURITY",
  "REGULATORY",
  "PRODUCT",
  "COST",
  "SCOPE",
  "CONSISTENCY",
] as const;

const FindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  category: z.enum(FINDING_CATEGORIES),
  description: z.string().min(1),
  evidence: z.array(z.string()),
});

const RequiredChangeSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1),
  reason: z.string().min(1),
});

const EscalationSchema = z.object({
  required: z.boolean(),
  reason: z.string().nullable(),
  founderQuestion: z.string().nullable(),
  recommendation: z.string().nullable(),
});

/**
 * The shape OpenAI is asked to produce. decisionId is deliberately NOT part of this schema - it
 * is a server-generated identifier (crypto.randomUUID()), never fabricated by the model. This is
 * a disclosed, intentional deviation from asking the model to invent its own "stable unique
 * decision ID": a server-generated UUID is trivially collision-free and doesn't depend on the
 * model following instructions correctly, which is a better fit for something the audit log's
 * integrity depends on. See tools/aidlc-reviewer/README.md.
 */
export const ModelReviewDecisionSchema = z.object({
  decision: z.enum(DECISIONS),
  confidence: z.number().min(0).max(1),
  authority: z.enum(AUTHORITIES),
  summary: z.string().min(1),
  findings: z.array(FindingSchema),
  requiredChanges: z.array(RequiredChangeSchema),
  escalation: EscalationSchema,
  artifactsReviewed: z.array(z.string()),
  priorDecisionsConsidered: z.array(z.string()),
});

export type ModelReviewDecision = z.infer<typeof ModelReviewDecisionSchema>;

/** What this server actually returns to Claude and logs: the model's decision plus our own id. */
export interface ReviewDecision extends ModelReviewDecision {
  decisionId: string;
}

// ---------------------------------------------------------------------------------------------
// Decision invariants - business rules a JSON Schema cannot express on its own. Violating any of
// these means the review FAILED, never that it silently becomes an approval.
// ---------------------------------------------------------------------------------------------

export function checkDecisionInvariants(decision: ModelReviewDecision): string[] {
  const violations: string[] = [];

  // General rule: RESERVED_FOUNDER authority always means ESCALATE. The converse is NOT
  // required - ESCALATE may legitimately occur with DELEGATED authority (insufficient
  // confidence, conflicting approved requirements, a stuck revision cycle, etc. - none of which
  // are themselves reserved-authority questions).
  if (decision.authority === "RESERVED_FOUNDER" && decision.decision !== "ESCALATE") {
    violations.push('authority "RESERVED_FOUNDER" requires decision "ESCALATE"');
  }

  if (decision.decision === "APPROVE") {
    if (decision.authority !== "DELEGATED") {
      violations.push('decision "APPROVE" requires authority "DELEGATED"');
    }
    if (decision.confidence < 0.8) {
      violations.push(`decision "APPROVE" requires confidence >= 0.80, got ${decision.confidence}`);
    }
    if (decision.requiredChanges.length > 0) {
      violations.push('decision "APPROVE" requires an empty requiredChanges array');
    }
    if (decision.escalation.required) {
      violations.push('decision "APPROVE" requires escalation.required to be false');
    }
  }

  if (decision.decision === "REVISE") {
    if (decision.authority !== "DELEGATED") {
      violations.push('decision "REVISE" requires authority "DELEGATED"');
    }
    if (decision.requiredChanges.length === 0) {
      violations.push('decision "REVISE" requires at least one entry in requiredChanges');
    }
    if (decision.escalation.required) {
      violations.push('decision "REVISE" requires escalation.required to be false');
    }
  }

  if (decision.decision === "ESCALATE") {
    if (!decision.escalation.required) {
      violations.push('decision "ESCALATE" requires escalation.required to be true');
    }
    if (!decision.escalation.founderQuestion || decision.escalation.founderQuestion.trim().length === 0) {
      violations.push('decision "ESCALATE" requires a non-empty escalation.founderQuestion');
    }
    if (decision.requiredChanges.length > 0) {
      violations.push('decision "ESCALATE" requires an empty requiredChanges array');
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------------------------
// Hand-written JSON Schema for OpenAI's strict structured-output mode.
//
// Hand-written rather than generated from the zod schema above: OpenAI's strict mode requires
// every object to set "additionalProperties": false and list EVERY property (including optional
// ones, modeled as nullable) in "required" - a generic zod-to-json-schema conversion is not
// guaranteed to produce that shape, and getting it wrong would silently break structured output
// validation for something the audit log's integrity depends on. Keep this in sync with
// ModelReviewDecisionSchema above by hand; the two are tested together (see test/schemas.test.ts).
// ---------------------------------------------------------------------------------------------

export const REVIEW_DECISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "confidence", "authority", "summary", "findings", "requiredChanges", "escalation", "artifactsReviewed", "priorDecisionsConsidered"],
  properties: {
    decision: { type: "string", enum: [...DECISIONS] },
    confidence: { type: "number", description: "0.0 to 1.0" },
    authority: { type: "string", enum: [...AUTHORITIES] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "category", "description", "evidence"],
        properties: {
          severity: { type: "string", enum: [...SEVERITIES] },
          category: { type: "string", enum: [...FINDING_CATEGORIES] },
          description: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
      },
    },
    requiredChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "instruction", "reason"],
        properties: {
          id: { type: "string" },
          instruction: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    escalation: {
      type: "object",
      additionalProperties: false,
      required: ["required", "reason", "founderQuestion", "recommendation"],
      properties: {
        required: { type: "boolean" },
        reason: { type: ["string", "null"] },
        founderQuestion: { type: ["string", "null"] },
        recommendation: { type: ["string", "null"] },
      },
    },
    artifactsReviewed: { type: "array", items: { type: "string" } },
    priorDecisionsConsidered: { type: "array", items: { type: "string" } },
  },
} as const;
