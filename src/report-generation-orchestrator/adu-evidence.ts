/**
 * Unit 11 (ADUs) - pure evidence-entry construction, in its own module with no database or server imports
 * so the dev preview can build exactly the evidence the production pipeline persists. The feasibility
 * summary is evidence only (never a Finding), so the explanation model narrates findings but cannot
 * restate or reinterpret the headline.
 */

import type { AduEvaluationOutcome } from "../regulatory-rules-engine/adu-types.js";

export function assembleAduEvidence(outcome: AduEvaluationOutcome): { factType: string; value: unknown; provenance: Record<string, unknown> }[] {
  return [
    { factType: "adu-declared-inputs", value: outcome.declaredInputs, provenance: {} },
    { factType: "adu-feasibility", value: outcome.feasibility, provenance: {} },
    { factType: "uncovered-constraint-types", value: outcome.uncoveredConstraintTypes, provenance: {} },
    ...(outcome.zoningApplied ? [{ factType: "zoning-resolution", value: outcome.zoningApplied, provenance: {} }] : []),
  ];
}
