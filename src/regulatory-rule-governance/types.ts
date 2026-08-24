/**
 * Regulatory Rule Governance domain types (domain-entities.md "Regulatory Rule Domain").
 * Mirrors the approved Functional Design exactly, including AmbiguityCaveat as first-class,
 * persistent metadata (correction/Q4) and InferencePolicy (second-pass correction 2).
 */

export const LifecycleState = {
  RESEARCHED: "RESEARCHED",
  DRAFTED: "DRAFTED",
  TRIAGED: "TRIAGED",
  SOURCE_VERIFIED: "SOURCE_VERIFIED",
  TESTED: "TESTED",
  APPROVED: "APPROVED",
  ACTIVE: "ACTIVE",
  SUPERSEDED: "SUPERSEDED",
  // Acknowledged for compatibility only - transition/tooling is Unit 3 (ADM-7).
  DISABLED: "DISABLED",
} as const;
export type LifecycleState = (typeof LifecycleState)[keyof typeof LifecycleState];

export const Tier = {
  TIER_1: "TIER_1",
  TIER_2: "TIER_2",
} as const;
export type Tier = (typeof Tier)[keyof typeof Tier];

export interface RuleCitation {
  smcSections: string[];
  ordinanceNumber?: string;
  effectiveDate?: string;
  effectiveDateBasis?: string; // e.g. "inferred from Seattle's 30-day post-publication default"
}

export interface AmbiguityCaveat {
  category: string;
  description: string;
  affectedConditionOrInterpretation: string;
  sourceReferences: string[];
  reviewerNotes?: string;
  resolutionStatus: string;
}

export const RuleTestCaseKind = {
  POSITIVE: "POSITIVE",
  NEGATIVE: "NEGATIVE",
  BOUNDARY: "BOUNDARY",
  EXCEPTION: "EXCEPTION",
} as const;
export type RuleTestCaseKind = (typeof RuleTestCaseKind)[keyof typeof RuleTestCaseKind];

export interface RuleTestCase {
  kind: RuleTestCaseKind;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

export const ProfessionType = {
  LAND_USE_CONSULTANT: "LAND_USE_CONSULTANT",
  ARCHITECT: "ARCHITECT",
  ATTORNEY: "ATTORNEY",
  OTHER: "OTHER",
} as const;
export type ProfessionType = (typeof ProfessionType)[keyof typeof ProfessionType];

export interface VerificationRecord {
  tier: Tier;
  founderIdentity: string;
  founderVerifiedAt: string;
  escalatedProfessional?: {
    identity: string;
    professionType: ProfessionType;
    opinion: string;
    reviewedAt: string;
  };
}

export interface RegulatoryRule {
  id: string;
  subject: string;
  applicableProjectType: string;
  applicableZone: string;
  ruleSpecification: Record<string, unknown>;
  citation: RuleCitation;
  lifecycleState: LifecycleState;
  tier?: Tier;
  caveats: AmbiguityCaveat[];
  testCases: RuleTestCase[];
  verificationHistory: VerificationRecord[];
  supersedesRuleId?: string;
  supersededByRuleId?: string;
  /** Marks fixture/test-only rules so they can never be mistaken for real production content
   * (user's explicit constraint: "any test-only approved/ACTIVE rule must be clearly
   * distinguishable from real production-authoritative regulatory content"). */
  isTestOnlyFixture: boolean;
  /** Unit 2 addition (BR-U2-10, domain-entities.md "RegulatoryRule Extension"). The evidence-
   * quality levels a human explicitly decided, at governance-approval time, are sufficient for a
   * KNOWN classification under this rule. Never set by application code at evaluation time - only
   * by the governance workflow. A rule with no entry for "GENERAL_LOCATION_ONLY" cannot produce
   * KNOWN from GENERAL_LOCATION_ONLY-sourced evidence (regulatory-rules-engine/evaluate.ts). */
  acceptedEvidenceQuality: EvidenceQuality[];
}

/** Mirrors property-intelligence/types.ts's EvidenceQuality - re-declared here (not imported)
 * because regulatory-rule-governance must not depend on property-intelligence (component
 * boundary, unchanged from Unit 1's Application Design). */
export const EvidenceQuality = {
  AUTHORITATIVE: "AUTHORITATIVE",
  GENERAL_LOCATION_ONLY: "GENERAL_LOCATION_ONLY",
} as const;
export type EvidenceQuality = (typeof EvidenceQuality)[keyof typeof EvidenceQuality];

export interface InferencePolicy {
  id: string;
  subject: string;
  derivationMethod: string;
  citationOrBasis: string;
  lifecycleState: LifecycleState;
  version: string;
  isTestOnlyFixture: boolean;
}
