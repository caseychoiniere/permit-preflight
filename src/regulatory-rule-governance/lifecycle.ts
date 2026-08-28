/**
 * Regulatory Rule lifecycle state machine - BR-6, BR-7, BR-8 (business-rules.md), Workflow 5
 * (business-logic-model.md). Pure, structurally enforces:
 *   - no automated process may transition to TRIAGED/APPROVED/ACTIVE (RRAG-8's guardrail) -
 *     every transition function below REQUIRES a human-identity parameter; there is no code
 *     path that reaches these states without one being supplied by a caller.
 *   - Tier 2 rules require a recorded escalated-professional opinion before SOURCE_VERIFIED,
 *     in addition to (never instead of) founder sign-off (RRAG-5).
 *   - disable()/reenable() (Unit 3, ADM-7) are the only functions that produce/reverse DISABLED -
 *     both are pure lifecycle-state-only toggles; the DB-level concurrency-correctness boundary
 *     for a real HTTP request lives in repository.ts's transitionLifecycleState, not here.
 */

import { LifecycleState, Tier } from "./types.js";
import type { AmbiguityCaveat, EvidenceQuality, InferencePolicy, RegulatoryRule, RuleCitation, RuleTestCase, VerificationRecord } from "./types.js";

export type LifecycleResult<T> = { outcome: "OK"; rule: T } | { outcome: "REJECTED"; reason: string };

export interface DraftedRuleInput {
  id: string;
  subject: string;
  /** Unit 5: required for an EXISTING_PROPERTY-scoped candidate (unchanged, shed/garage), MUST be
   * omitted for a VACANT_LAND-scoped candidate - never a bogus shed/garage value. See
   * applicableWorkflowType below. */
  applicableProjectType?: string;
  /** Unit 5 addition - omit (defaults to EXISTING_PROPERTY, unchanged behavior) or set explicitly
   * to "VACANT_LAND" for a Unit 5 candidate. */
  applicableWorkflowType?: "EXISTING_PROPERTY" | "VACANT_LAND";
  applicableZone: string;
  ruleSpecification: Record<string, unknown>;
  citation: RuleCitation;
  caveats: AmbiguityCaveat[];
  testCases: RuleTestCase[];
  isTestOnlyFixture: boolean;
}

/** RESEARCHED -> DRAFTED (RRAG-1). Always the output of Rule Research Assistant - never
 * self-advances further; a DRAFTED rule is candidate material only. */
export function draft(input: DraftedRuleInput): RegulatoryRule {
  return {
    ...input,
    lifecycleState: LifecycleState.DRAFTED,
    verificationHistory: [],
    // Evidence-quality acceptance is a decision made at APPROVED, not at draft time (BR-U2-10) -
    // starts empty, meaning "accepts nothing but AUTHORITATIVE evidence" until a human decides
    // otherwise via approve().
    acceptedEvidenceQuality: [],
  };
}

/** DRAFTED -> TRIAGED (RRAG-2/RRAG-8). `founderIdentity` and `tier` are REQUIRED parameters -
 * there is no way to call this function without supplying a human decision-maker. The AI's
 * suggested tier (if any, carried in caveats/notes upstream) is never accepted as authoritative
 * here - only the founder's tier decision is recorded. */
export function triage(rule: RegulatoryRule, founderIdentity: string, tier: Tier): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.DRAFTED) {
    return { outcome: "REJECTED", reason: `Cannot triage from state ${rule.lifecycleState}; must be DRAFTED.` };
  }
  if (!founderIdentity.trim()) {
    return { outcome: "REJECTED", reason: "founderIdentity is required to triage a candidate rule." };
  }
  return { outcome: "OK", rule: { ...rule, lifecycleState: LifecycleState.TRIAGED, tier } };
}

/** TRIAGED -> SOURCE_VERIFIED (RRAG-3 for Tier 1, RRAG-4/RRAG-5 for Tier 2). For TIER_2 rules,
 * `verification.escalatedProfessional` MUST be present - this is a structural, not a
 * documentation-only, requirement (BR-7: "professional informs, never unilaterally activates" -
 * the founder identity is always present too, on every path). */
export function sourceVerify(rule: RegulatoryRule, verification: VerificationRecord): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.TRIAGED) {
    return { outcome: "REJECTED", reason: `Cannot source-verify from state ${rule.lifecycleState}; must be TRIAGED.` };
  }
  if (!rule.tier) {
    return { outcome: "REJECTED", reason: "Rule has no confirmed tier; triage() must run first." };
  }
  if (!verification.founderIdentity.trim()) {
    return { outcome: "REJECTED", reason: "founderIdentity is required for source verification." };
  }
  if (verification.tier !== rule.tier) {
    return { outcome: "REJECTED", reason: "Verification tier does not match the rule's confirmed tier." };
  }
  if (rule.tier === Tier.TIER_2 && !verification.escalatedProfessional) {
    return {
      outcome: "REJECTED",
      reason: "TIER_2 rules require a recorded escalated domain-professional opinion before SOURCE_VERIFIED.",
    };
  }
  return {
    outcome: "OK",
    rule: {
      ...rule,
      lifecycleState: LifecycleState.SOURCE_VERIFIED,
      verificationHistory: [...rule.verificationHistory, verification],
    },
  };
}

/** SOURCE_VERIFIED -> TESTED. Requires every declared test case to have actually passed. */
export function markTested(rule: RegulatoryRule, results: { testCaseIndex: number; passed: boolean }[]): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.SOURCE_VERIFIED) {
    return { outcome: "REJECTED", reason: `Cannot mark tested from state ${rule.lifecycleState}; must be SOURCE_VERIFIED.` };
  }
  if (results.length !== rule.testCases.length) {
    return { outcome: "REJECTED", reason: "Test results do not cover every declared test case." };
  }
  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    return { outcome: "REJECTED", reason: "Not all test cases passed; rule remains SOURCE_VERIFIED." };
  }
  return { outcome: "OK", rule: { ...rule, lifecycleState: LifecycleState.TESTED } };
}

/** TESTED -> APPROVED. Founder final approval - required parameter, no automated path.
 * `acceptedEvidenceQuality` is REQUIRED (not defaulted) so a human must explicitly decide, at
 * this exact moment, which evidence-quality levels this rule may rely on for a KNOWN
 * classification (BR-U2-10) - the same "explicit human decision, not an implicit default"
 * discipline this codebase already applies to tier confirmation and Tier 2 escalation. Pass []
 * if the rule should continue accepting only AUTHORITATIVE evidence. */
/**
 * `approvedAt` is received explicitly, not read from the clock internally (2026-08-25 correction)
 * - keeps this function deterministic/testable like every other lifecycle transition, and makes
 * the caller (not this module) responsible for what "now" means at call time.
 */
export function approve(
  rule: RegulatoryRule,
  founderIdentity: string,
  acceptedEvidenceQuality: EvidenceQuality[],
  approvedAt: string
): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.TESTED) {
    return { outcome: "REJECTED", reason: `Cannot approve from state ${rule.lifecycleState}; must be TESTED.` };
  }
  if (!founderIdentity.trim()) {
    return { outcome: "REJECTED", reason: "founderIdentity is required to approve a rule." };
  }
  return {
    outcome: "OK",
    rule: { ...rule, lifecycleState: LifecycleState.APPROVED, acceptedEvidenceQuality, approvalRecord: { founderIdentity, approvedAt } },
  };
}

/** APPROVED -> ACTIVE. The one-way publication to the Regulatory Rules Engine's consumption
 * boundary. Caveats are NOT cleared here (BR-8) - ACTIVE means "passed governance despite
 * documented caveats," not "no ambiguity exists." */
export function activate(rule: RegulatoryRule): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.APPROVED) {
    return { outcome: "REJECTED", reason: `Cannot activate from state ${rule.lifecycleState}; must be APPROVED.` };
  }
  return { outcome: "OK", rule: { ...rule, lifecycleState: LifecycleState.ACTIVE } };
}

/** ACTIVE -> DISABLED (ADM-7, Unit 3). A reversible lifecycle-state-only toggle - never permission
 * to mutate published content (ruleSpecification/citation/caveats/testCases are untouched here).
 * Operator attribution/reason is AdminActionLog's job (BR-U3-9/Q5), not a parameter of this pure
 * function. This function alone is NOT the concurrency-correctness boundary for a real HTTP
 * request - see regulatory-rule-governance/repository.ts's transitionLifecycleState for the
 * conditional-UPDATE persistence guard a concurrent/stale request needs; this function is the
 * tested domain-rule expression that guard's expected {from, to} pair is derived from. */
export function disable(rule: RegulatoryRule): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.ACTIVE) {
    return { outcome: "REJECTED", reason: `Cannot disable from state ${rule.lifecycleState}; must be ACTIVE.` };
  }
  return { outcome: "OK", rule: { ...rule, lifecycleState: LifecycleState.DISABLED } };
}

/** DISABLED -> ACTIVE (ADM-7, Unit 3). Legal only for the exact rule row being re-enabled - no
 * version substitution is possible through this path (this function takes and returns the same
 * RegulatoryRule object; it never constructs a new version). If correcting the underlying problem
 * requires changing any regulatory logic/applicability/threshold/citation content, this function
 * must NOT be used - a new version goes through the full RESEARCHED->...->ACTIVE pipeline instead.
 * See disable()'s docstring re: the separate DB-level concurrency guard this function does not
 * itself provide. */
export function reenable(rule: RegulatoryRule): LifecycleResult<RegulatoryRule> {
  if (rule.lifecycleState !== LifecycleState.DISABLED) {
    return { outcome: "REJECTED", reason: `Cannot re-enable from state ${rule.lifecycleState}; must be DISABLED.` };
  }
  return { outcome: "OK", rule: { ...rule, lifecycleState: LifecycleState.ACTIVE } };
}

/** ACTIVE -> SUPERSEDED (for the old version) when a new version reaches ACTIVE. Does not touch
 * historical report reproducibility (a later unit's concern) - purely a lifecycle-state update. */
export function supersede(
  oldActiveRule: RegulatoryRule,
  newActiveRule: RegulatoryRule
): LifecycleResult<{ old: RegulatoryRule; new_: RegulatoryRule }> {
  if (oldActiveRule.lifecycleState !== LifecycleState.ACTIVE) {
    return { outcome: "REJECTED", reason: "Only an ACTIVE rule can be superseded." };
  }
  if (newActiveRule.lifecycleState !== LifecycleState.ACTIVE) {
    return { outcome: "REJECTED", reason: "The replacement rule must already be ACTIVE before superseding the old one." };
  }
  return {
    outcome: "OK",
    rule: {
      old: { ...oldActiveRule, lifecycleState: LifecycleState.SUPERSEDED, supersededByRuleId: newActiveRule.id },
      new_: { ...newActiveRule, supersedesRuleId: oldActiveRule.id },
    },
  };
}

// --- InferencePolicy: reuses the same lifecycle principles as RegulatoryRule, per the user's
// explicit carry-forward instruction, rather than a separate governance subsystem. Only the
// subset of transitions actually needed (draft -> approve) is implemented; extend only if a
// concrete requirement demonstrates the simpler lifecycle is insufficient. ---

export function draftInferencePolicy(input: Omit<InferencePolicy, "lifecycleState">): InferencePolicy {
  return { ...input, lifecycleState: LifecycleState.DRAFTED };
}

export function approveInferencePolicy(policy: InferencePolicy, founderIdentity: string): LifecycleResult<InferencePolicy> {
  if (policy.lifecycleState !== LifecycleState.DRAFTED) {
    return { outcome: "REJECTED", reason: `Cannot approve InferencePolicy from state ${policy.lifecycleState}; must be DRAFTED.` };
  }
  if (!founderIdentity.trim()) {
    return { outcome: "REJECTED", reason: "founderIdentity is required to approve an InferencePolicy." };
  }
  // Approval directly to ACTIVE (skipping the fuller RegulatoryRule lifecycle's intermediate
  // states) since InferencePolicy's approval need is materially simpler - a derivation METHOD,
  // not a regulatory conclusion with Tier 1/Tier 2 professional-review stakes of its own.
  return { outcome: "OK", rule: { ...policy, lifecycleState: LifecycleState.ACTIVE } };
}
