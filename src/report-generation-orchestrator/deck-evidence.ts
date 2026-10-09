/**
 * Unit 8 (Decks) - pure evidence-entry construction, in its own module with no database or server
 * imports (so the client-side dev intake preview can use it). `deck-permit-requirement` is evidence
 * only - never a Finding - so it cannot reach Report Explanation's input (the Unit 6B invariant).
 */

import type { DeckEvaluationOutcome } from "../regulatory-rules-engine/deck-types.js";

export function assembleDeckEvidence(outcome: DeckEvaluationOutcome): { factType: string; value: unknown; provenance: Record<string, unknown> }[] {
  return [
    { factType: "deck-declared-inputs", value: outcome.declaredInputs, provenance: {} },
    ...(outcome.permitRequirement ? [{ factType: "deck-permit-requirement", value: outcome.permitRequirement, provenance: {} }] : []),
    { factType: "uncovered-constraint-types", value: outcome.uncoveredConstraintTypes, provenance: {} },
    ...(outcome.zoningApplied ? [{ factType: "zoning-resolution", value: outcome.zoningApplied, provenance: {} }] : []),
  ];
}
