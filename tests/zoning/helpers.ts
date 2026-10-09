import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";

/** An in-memory ACTIVE rule row for resolver / evaluator tests (never persisted). */
export function mkRule(ruleType: string, zone: string, over: Partial<RegulatoryRule> & { spec?: Record<string, unknown> } = {}): RegulatoryRule {
  const { spec, ...rest } = over;
  return {
    id: `rule-${ruleType}-${zone}`,
    subject: `${ruleType} @ ${zone}`,
    applicableProjectType: "shed",
    applicableZone: zone,
    ruleSpecification: { ruleType, ...(spec ?? {}) },
    citation: { smcSections: ["SMC test"] },
    lifecycleState: "ACTIVE",
    caveats: [],
    testCases: [],
    verificationHistory: [],
    isTestOnlyFixture: true,
    acceptedEvidenceQuality: ["AUTHORITATIVE", "GENERAL_LOCATION_ONLY"],
    ...rest,
  } as RegulatoryRule;
}
