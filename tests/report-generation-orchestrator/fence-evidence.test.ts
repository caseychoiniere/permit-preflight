import { describe, expect, it } from "vitest";
import { assembleFenceEvidence } from "../../src/report-generation-orchestrator/fence-evidence.js";
import type { FenceEvaluationOutcome } from "../../src/regulatory-rules-engine/fence-types.js";

const base: FenceEvaluationOutcome = { findings: [], declaredInputs: [{ label: "Fence height", value: "6 ft" }], uncoveredConstraintTypes: [] };

describe("assembleFenceEvidence", () => {
  it("emits declared inputs and uncovered types always; the permit aggregate only when it exists, and always as evidence (never a finding)", () => {
    expect(assembleFenceEvidence(base).map((e) => e.factType)).toEqual(["fence-declared-inputs", "uncovered-constraint-types"]);
    const withPermit = assembleFenceEvidence({
      ...base,
      permitRequirement: { buildingPermit: "REQUIRES_VERIFICATION", criteria: [], turnsOnlyOnFloodProneStatus: false, disclosures: [] },
    });
    expect(withPermit.map((e) => e.factType)).toEqual(["fence-declared-inputs", "fence-permit-requirement", "uncovered-constraint-types"]);
  });
  it("carries the uncovered claims through verbatim", () => {
    expect(assembleFenceEvidence({ ...base, uncoveredConstraintTypes: ["fence building permit"] }).find((e) => e.factType === "uncovered-constraint-types")?.value).toEqual(["fence building permit"]);
  });
});
