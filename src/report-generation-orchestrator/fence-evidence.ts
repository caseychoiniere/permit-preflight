/**
 * Unit 7 (Fences) - pure evidence-entry construction, deliberately in its own module with no database
 * or server imports so the (client-side) dev intake preview can build exactly the evidence the
 * production pipeline persists. `fence-permit-requirement` is evidence only - never a Finding - so it
 * cannot reach Report Explanation's input (the Unit 6B invariant).
 */

import type { FenceEvaluationOutcome } from "../regulatory-rules-engine/fence-types.js";

export function assembleFenceEvidence(outcome: FenceEvaluationOutcome): { factType: string; value: unknown; provenance: Record<string, unknown> }[] {
  return [
    { factType: "fence-declared-inputs", value: outcome.declaredInputs, provenance: {} },
    ...(outcome.permitRequirement ? [{ factType: "fence-permit-requirement", value: outcome.permitRequirement, provenance: {} }] : []),
    { factType: "uncovered-constraint-types", value: outcome.uncoveredConstraintTypes, provenance: {} },
  ];
}
