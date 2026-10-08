import { describe, expect, it } from "vitest";
import { assembleDeckEvidence } from "../../src/report-generation-orchestrator/deck-evidence.js";
import type { DeckEvaluationOutcome } from "../../src/regulatory-rules-engine/deck-types.js";

const base: DeckEvaluationOutcome = { findings: [], declaredInputs: [{ label: "Height above ground", value: "24 in" }], uncoveredConstraintTypes: [] };

describe("assembleDeckEvidence", () => {
  it("always emits declared inputs and uncovered types; the permit aggregate only when it exists, always as evidence (never a finding)", () => {
    expect(assembleDeckEvidence(base).map((e) => e.factType)).toEqual(["deck-declared-inputs", "uncovered-constraint-types"]);
    const withPermit = assembleDeckEvidence({ ...base, permitRequirement: { buildingPermit: "REQUIRES_VERIFICATION", criteria: [], turnsOnlyOnEcaStatus: false, disclosures: [] } });
    expect(withPermit.map((e) => e.factType)).toEqual(["deck-declared-inputs", "deck-permit-requirement", "uncovered-constraint-types"]);
  });
  it("carries uncovered claims through verbatim", () => {
    expect(assembleDeckEvidence({ ...base, uncoveredConstraintTypes: ["deck building permit"] }).find((e) => e.factType === "uncovered-constraint-types")?.value).toEqual(["deck building permit"]);
  });
});
