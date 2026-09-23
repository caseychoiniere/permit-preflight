/**
 * Deterministic (no DB) test for pipeline.ts's Report Explanation input boundary
 * (selectFindingsForExplanation) - maintenance correction, 2026-09-15, RC-6. No prior deterministic
 * test file existed for pipeline.ts itself (only the live pipeline.integration.test.ts) since the
 * orchestrator as a whole needs a real DB - this one pure, exported function does not.
 */
import { describe, expect, it } from "vitest";
import {
  selectFindingsForExplanation,
  deriveDwellingSeparationEvidenceGapReason,
  selectDwellingSeparationEvidenceGapCase,
  deriveStreetFrontageRoleGapReasons,
  deriveIsInRequiredSetback,
  type RequiredSetbackDerivationContext,
} from "../../src/report-generation-orchestrator/pipeline.js";
import { evaluateProject } from "../../src/regulatory-rules-engine/evaluate.js";
import { MultipleFrontageAnswer } from "../../src/screening-request/types.js";
import type { Finding } from "../../src/regulatory-rules-engine/types.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";
import type { RegulatoryRule } from "../../src/regulatory-rule-governance/types.js";

function known(subject: string): Finding {
  return { subject, classification: "KNOWN", complianceOutcome: "PASS", explanationBasis: `${subject} basis`, supportingEvidence: [] };
}
function requiresVerification(subject: string): Finding {
  return { subject, classification: "REQUIRES_VERIFICATION", explanationBasis: `${subject} basis`, supportingEvidence: [] };
}

describe("selectFindingsForExplanation (maintenance correction, 2026-09-15, RC-6)", () => {
  it("excludes every 'Critical area: X' finding regardless of classification, retaining every non-ECA finding unchanged", () => {
    const mixed: Finding[] = [
      known("Shed height limit"),
      requiresVerification("Shed rear setback"),
      known("Critical area: priority_habitat"), // KNOWN, map-dispositive-clean
      requiresVerification("Critical area: steep_slope"), // REQUIRES_VERIFICATION, advisory-only
      requiresVerification("Critical area: wetland"),
      known("Shed dwelling separation"),
    ];

    const result = selectFindingsForExplanation(mixed);

    expect(result).toHaveLength(3);
    expect(result.map((f) => f.subject)).toEqual(["Shed height limit", "Shed rear setback", "Shed dwelling separation"]);
    expect(result.some((f) => f.subject.startsWith("Critical area: "))).toBe(false);
  });

  it("is a pure, non-mutating filter - the original array and its entries are untouched (the immutable artifact persists the FULL outcome.findings, not this narrowed list)", () => {
    const mixed: Finding[] = [known("Shed height limit"), known("Critical area: priority_habitat")];
    const originalLength = mixed.length;
    const result = selectFindingsForExplanation(mixed);
    expect(mixed).toHaveLength(originalLength); // input array itself unmodified
    expect(result).not.toBe(mixed); // a new array, not the same reference
  });

  it("returns every finding unchanged when there are no ECA findings at all (e.g. garage/vacant-land reports, which never produce 'Critical area:' findings today)", () => {
    const nonEca: Finding[] = [known("Shed height limit"), requiresVerification("Shed rear setback")];
    expect(selectFindingsForExplanation(nonEca)).toEqual(nonEca);
  });

  it("returns an empty array (never throws) when every finding is ECA - explainFindings' own empty-findings guard then degrades to UNAVAILABLE rather than fabricating a narrative", () => {
    const allEca: Finding[] = [known("Critical area: priority_habitat"), requiresVerification("Critical area: steep_slope")];
    expect(selectFindingsForExplanation(allEca)).toEqual([]);
  });

  it(
    "[RC-8] using a REAL EvaluationOutcome (evaluateProject, every Unit 6B rule hypothetically ACTIVE) with mixed ECA/non-ECA findings AND populated " +
      "permitRequirement/shedLotCoverage aggregates: selectFindingsForExplanation excludes only the ECA findings, and the outcome's own findings, " +
      "permitRequirement, and shedLotCoverage remain fully intact and unchanged afterward - proving the filter cannot reach or alter anything but the " +
      "Finding[] array explicitly passed to it",
    () => {
      function activeRule(ruleType: string): RegulatoryRule {
        return {
          id: `active-${ruleType}`,
          subject: ruleType,
          applicableProjectType: "shed",
          applicableZone: "NR",
          ruleSpecification: { ruleType },
          citation: { smcSections: [] },
          lifecycleState: "ACTIVE",
          caveats: [],
          testCases: [],
          verificationHistory: [],
          isTestOnlyFixture: true,
          acceptedEvidenceQuality: [],
        };
      }
      const permitRuleTypes = [
        "SHED_PERMIT_P1_ROOF_AREA",
        "SHED_PERMIT_P2A_STORY_HEIGHT",
        "SHED_PERMIT_P3A_FOUNDATION_EXEMPTION",
        "SHED_PERMIT_P3B_FOUNDATION_STFI_DISQUALIFIER",
        "SHED_PERMIT_P4_ATTACHMENT",
        "SHED_PERMIT_P5_USE",
        "SHED_PERMIT_P6_ECA_CRITERION",
        "SHED_PERMIT_P7A_SIZE_SPAN_FOOTPRINT",
        "SHED_PERMIT_P7B_SIZE_SPAN_STRUCTURAL",
      ];
      const lotCoverageRuleTypes = [
        "SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM",
        "SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION",
        "SHED_LOT_COVERAGE_C1C_TRANSIT_BONUS",
        "SHED_LOT_COVERAGE_C1D_STACKED_BONUS",
        "SHED_LOT_COVERAGE_C1E_MINIMUM_FLOOR",
        "SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE",
      ];
      // Includes a real environmental-constraints PropertyFact - the exact factType/shape
      // pipeline.ts's own evidence array assembles from propertyContext.facts (see pipeline.ts's
      // `evidence = [...propertyContext.facts.map((f) => ({ factType: f.factType, value: f.value, ... }))]`).
      // evaluateProject itself never reads propertyContext.facts for ECA (ecaFindings is a
      // separate parameter below) - this fact exists here purely to prove the "environmental
      // evidence" the report persists is a structurally separate value the explanation filter
      // never touches, replicated here without needing a live database.
      const ecaFindingsList = [
        { hazardType: "priority_habitat", mappedIntersectionResult: "NO_INTERSECTION" as const, advisoryStatus: "MAP_DISPOSITIVE" as const, toleranceBasis: "test" },
        { hazardType: "peat_settlement", mappedIntersectionResult: "NO_INTERSECTION" as const, advisoryStatus: "MAP_DISPOSITIVE" as const, toleranceBasis: "test" },
      ];
      const propertyContext: PropertyContext = {
        parcelId: "test",
        assembledAt: "2026-01-01T00:00:00.000Z",
        facts: [
          {
            factType: "environmental-constraints",
            value: ecaFindingsList,
            provenance: { sourceAgency: "test", dataset: "test", retrievalTimestamp: "2026-01-01T00:00:00.000Z" },
            availabilityState: "AVAILABLE",
          },
        ],
      };
      const outcome = evaluateProject({
        propertyContext,
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 8,
          heightFt: 8,
          alleyAdjacent: false,
          foundationType: "SLAB_ON_GRADE",
          attachment: "DETACHED",
          intendedUse: "STORAGE",
          isInRequiredSetback: false,
        },
        candidateActiveRules: [...permitRuleTypes.map(activeRule), ...lotCoverageRuleTypes.map(activeRule)],
        ecaFindings: ecaFindingsList,
        candidateActiveInferencePolicies: [],
        shedLotCoverageFacts: { parcelAreaSqFt: 5000, existingMappedCoverageSqFt: 500, proposedShedFootprintSqFt: 100, ecaAdjustment: { status: "NOT_APPLICABLE", reason: "test" } },
      });

      // The exact evidence-assembly expression pipeline.ts itself uses (report-generation-orchestrator/pipeline.ts).
      const evidence = propertyContext.facts.map((f) => ({ factType: f.factType, value: f.value, provenance: f.provenance }));

      // Sanity: this outcome really does have both aggregates populated and real ECA findings mixed in.
      expect(outcome.shedLotCoverage).toBeDefined();
      expect(outcome.permitRequirement).toBeDefined();
      const ecaCountBefore = outcome.findings.filter((f) => f.subject.startsWith("Critical area: ")).length;
      expect(ecaCountBefore).toBeGreaterThan(0);
      expect(evidence.find((e) => e.factType === "environmental-constraints")?.value).toHaveLength(2);

      // Full before snapshots (deep clone, not references) of everything the report actually
      // persists/renders downstream - findings, both aggregates, and the environmental evidence.
      const findingsBefore = structuredClone(outcome.findings);
      const permitRequirementBefore = structuredClone(outcome.permitRequirement);
      const shedLotCoverageBefore = structuredClone(outcome.shedLotCoverage);
      const evidenceBefore = structuredClone(evidence);

      const forExplanation = selectFindingsForExplanation(outcome.findings);

      expect(forExplanation.some((f) => f.subject.startsWith("Critical area: "))).toBe(false);
      // Complete before/after snapshot comparisons - not just counts/definedness - proving
      // selectFindingsForExplanation altered nothing it was not explicitly given: the full
      // findings array, both permit/coverage aggregates, and the separately-assembled
      // environmental evidence are all byte-for-byte identical to their pre-filter snapshots.
      expect(outcome.findings).toEqual(findingsBefore);
      expect(outcome.permitRequirement).toEqual(permitRequirementBefore);
      expect(outcome.shedLotCoverage).toEqual(shedLotCoverageBefore);
      expect(evidence).toEqual(evidenceBefore);
    }
  );
});

describe("selectDwellingSeparationEvidenceGapCase (maintenance correction, 2026-09-15, RC-7) - derives the correct case from real, raw pipeline preconditions", () => {
  it("a matched primary dwelling -> PRIMARY_DWELLING_FOUND, regardless of any other precondition", () => {
    expect(
      selectDwellingSeparationEvidenceGapCase({ buildingFootprintsAvailable: true, footprintProjected: true, primaryDwellingFound: true, primaryDwellingSelectionStatus: "SELECTED" })
    ).toBe("PRIMARY_DWELLING_FOUND");
  });

  it("building-outline data available, no match found, a SELECTED selection on file -> SELECTION_NOT_MATCHED (a stale/removed selection)", () => {
    expect(
      selectDwellingSeparationEvidenceGapCase({ buildingFootprintsAvailable: true, footprintProjected: true, primaryDwellingFound: false, primaryDwellingSelectionStatus: "SELECTED" })
    ).toBe("SELECTION_NOT_MATCHED");
  });

  it("building-outline data available, no match found, no selection on file -> NO_SELECTION_MADE", () => {
    expect(
      selectDwellingSeparationEvidenceGapCase({ buildingFootprintsAvailable: true, footprintProjected: true, primaryDwellingFound: false, primaryDwellingSelectionStatus: undefined })
    ).toBe("NO_SELECTION_MADE");
  });

  it("building-outline data unavailable but the shed's own footprint exists -> BUILDING_OUTLINES_UNAVAILABLE", () => {
    expect(
      selectDwellingSeparationEvidenceGapCase({ buildingFootprintsAvailable: false, footprintProjected: true, primaryDwellingFound: false, primaryDwellingSelectionStatus: undefined })
    ).toBe("BUILDING_OUTLINES_UNAVAILABLE");
  });

  it("no footprint at all (placement never established) -> NO_FOOTPRINT, the most fundamental gap", () => {
    expect(
      selectDwellingSeparationEvidenceGapCase({ buildingFootprintsAvailable: false, footprintProjected: false, primaryDwellingFound: false, primaryDwellingSelectionStatus: undefined })
    ).toBe("NO_FOOTPRINT");
  });

  it("the full case -> reason pipeline resolves correctly end-to-end for a real precondition combination (not just the case-only unit tested elsewhere)", () => {
    const gapCase = selectDwellingSeparationEvidenceGapCase({ buildingFootprintsAvailable: false, footprintProjected: false, primaryDwellingFound: false, primaryDwellingSelectionStatus: undefined });
    const reason = deriveDwellingSeparationEvidenceGapReason({ case: gapCase });
    expect(reason).toBe("The shed's proposed placement was not established, so dwelling separation could not be evaluated.");
  });
});

describe("deriveDwellingSeparationEvidenceGapReason (maintenance correction, 2026-09-15, RC-4/RC-7)", () => {
  it("PRIMARY_DWELLING_FOUND returns undefined - a real distance was computed, no evidence-gap reason applies", () => {
    expect(deriveDwellingSeparationEvidenceGapReason({ case: "PRIMARY_DWELLING_FOUND" })).toBeUndefined();
  });

  it("each of the four gap cases returns its own distinct, non-empty reason - never sharing text, never sharing the lot-line-roles reason", () => {
    const reasons = [
      deriveDwellingSeparationEvidenceGapReason({ case: "SELECTION_NOT_MATCHED" }),
      deriveDwellingSeparationEvidenceGapReason({ case: "NO_SELECTION_MADE" }),
      deriveDwellingSeparationEvidenceGapReason({ case: "BUILDING_OUTLINES_UNAVAILABLE" }),
      deriveDwellingSeparationEvidenceGapReason({ case: "NO_FOOTPRINT" }),
    ];
    for (const reason of reasons) {
      expect(reason).toBeTruthy();
      expect(reason).not.toContain("property lines could not be confidently identified"); // never the setback reason
    }
    expect(new Set(reasons).size).toBe(reasons.length); // all four are distinct strings
  });

  it("SELECTION_NOT_MATCHED's reason matches the exact text pipeline.ts persists as dwellingSelectionNotMatchedExplanation (single source of truth)", () => {
    expect(deriveDwellingSeparationEvidenceGapReason({ case: "SELECTION_NOT_MATCHED" })).toContain(
      "could not be matched against the current Seattle Building Outlines data"
    );
  });
});

describe(
  "deriveStreetFrontageRoleGapReasons (maintenance correction, 2026-09-17, founder correction after reviewer escalation " +
    "ccf1dee8-392a-416a-82d4-82222a837446 - extracted from runReportGenerationPipeline's own inline logic so the actual derivation " +
    "evaluateSideFrontSetback/evaluateRearSetback depend on is independently unit-testable, not just hand-fed field combinations)",
  () => {
    it("NO with no unresolved street frontage: no gap reasons at all - ordinary single-street lot behavior, byte-for-byte unaffected", () => {
      const reasons = deriveStreetFrontageRoleGapReasons({ multipleFrontageAnswer: MultipleFrontageAnswer.NO, rearAlsoFacesStreet: false, hasUnresolvedStreetFrontage: false });
      expect(reasons).toEqual({});
    });

    it("YES with a specific unresolved street-frontage edge (side): only frontRoleEvidenceGapReason is set - rear/side stay confidently resolvable, matching computeSetbackDistances' own exclusion of only that specific edge", () => {
      const reasons = deriveStreetFrontageRoleGapReasons({ multipleFrontageAnswer: MultipleFrontageAnswer.YES, rearAlsoFacesStreet: false, hasUnresolvedStreetFrontage: true });
      expect(reasons.frontRoleEvidenceGapReason).toBeTruthy();
      expect(reasons.rearRoleEvidenceGapReason).toBeUndefined();
      expect(reasons.sideRoleEvidenceGapReason).toBeUndefined();
    });

    it(
      "rearAlsoFacesStreet=true: BOTH frontRoleEvidenceGapReason AND rearRoleEvidenceGapReason are set together - accurately reflecting " +
        "that computeSetbackDistances places the rear edge itself into unresolvedStreetFrontageDistancesFt whenever rearAlsoFacesStreet " +
        "is true, so hasUnresolvedStreetFrontage is ALWAYS true in this real combination (never front-alone or rear-alone)",
      () => {
        const reasons = deriveStreetFrontageRoleGapReasons({ multipleFrontageAnswer: MultipleFrontageAnswer.YES, rearAlsoFacesStreet: true, hasUnresolvedStreetFrontage: true });
        expect(reasons.frontRoleEvidenceGapReason).toBeTruthy();
        expect(reasons.rearRoleEvidenceGapReason).toBeTruthy();
        expect(reasons.sideRoleEvidenceGapReason).toBeUndefined(); // rearAlsoFacesStreet alone never touches ordinary side edges
      }
    );

    it("NOT_SURE: all three of front/rear/side get a gap reason, never behaving like NO - the core defect this correction fixed", () => {
      const reasons = deriveStreetFrontageRoleGapReasons({ multipleFrontageAnswer: MultipleFrontageAnswer.NOT_SURE, rearAlsoFacesStreet: false, hasUnresolvedStreetFrontage: false });
      expect(reasons.frontRoleEvidenceGapReason).toBeTruthy();
      expect(reasons.rearRoleEvidenceGapReason).toBeTruthy();
      expect(reasons.sideRoleEvidenceGapReason).toBeTruthy();
      // Distinct wording per field - never the same generic string reused three times.
      expect(new Set([reasons.frontRoleEvidenceGapReason, reasons.rearRoleEvidenceGapReason, reasons.sideRoleEvidenceGapReason]).size).toBe(3);
    });

    it("YES with no unresolved edges at all (customer answered YES but hasn't finished picking edges yet): no gap reasons - matches applyMultipleFrontageAnswer's own 'YES + empty stays YES' in-progress state", () => {
      const reasons = deriveStreetFrontageRoleGapReasons({ multipleFrontageAnswer: MultipleFrontageAnswer.YES, rearAlsoFacesStreet: false, hasUnresolvedStreetFrontage: false });
      expect(reasons).toEqual({});
    });
  }
);

describe(
  "deriveIsInRequiredSetback (Unit 6B Capability B, founder-approved bounded-band derivation, 2026-09-23 - " +
    "aidlc-docs/decisions/2026-09-17-side-street-setback-current-code-research.md's 'Correction (2026-09-23, same day)' section)",
  () => {
    const resolved: RequiredSetbackDerivationContext = {
      distanceToFrontLotLineFt: 20,
      distanceToRearLotLineFt: 20,
      distanceToSideLotLineFt: 20,
      frontRoleEvidenceGapReason: undefined,
      rearRoleEvidenceGapReason: undefined,
      sideRoleEvidenceGapReason: undefined,
    };

    it("any boundary DEFINITELY_INSIDE (front < 10ft) resolves true regardless of the other two boundaries", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToFrontLotLineFt: 9 });
      expect(result.isInRequiredSetback).toBe(true);
      expect(result.requiredSetbackEvidenceGapReasons).toBeUndefined();
    });

    it("rear < 5ft resolves DEFINITELY_INSIDE -> true", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToRearLotLineFt: 4 });
      expect(result.isInRequiredSetback).toBe(true);
    });

    it("side < 3ft resolves DEFINITELY_INSIDE -> true", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToSideLotLineFt: 2.9 });
      expect(result.isInRequiredSetback).toBe(true);
    });

    it("front in the 10-15ft band is REQUIRES_VERIFICATION citing dwelling-unit count, never definitely inside or outside", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToFrontLotLineFt: 12 });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("dwelling-unit count")]));
    });

    it("front >= 15ft is REQUIRES_VERIFICATION citing the Queen Anne Boulevard guard, never DEFINITELY_OUTSIDE - no street-name evidence exists anywhere in this codebase to rule the exception out", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToFrontLotLineFt: 30 });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("Queen Anne Boulevard")]));
    });

    it("rear in the 5-15ft band is REQUIRES_VERIFICATION citing the Chapter 23.53 guard", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToRearLotLineFt: 8 });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("Chapter 23.53")]));
    });

    it("rear >= 15ft is REQUIRES_VERIFICATION citing the Chapter 23.53 guard, never DEFINITELY_OUTSIDE", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToRearLotLineFt: 40 });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("Chapter 23.53")]));
    });

    it("side in the 3-5ft band is REQUIRES_VERIFICATION citing frequent-transit-service-area status - never claimed outside merely for clearing the 3ft floor (the corrected treatment)", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToSideLotLineFt: 4 });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("3-5ft band")]));
    });

    it("side >= 5ft is REQUIRES_VERIFICATION citing the Chapter 23.53 guard, never DEFINITELY_OUTSIDE", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToSideLotLineFt: 9 });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("Chapter 23.53")]));
    });

    it("front role unresolved (frontRoleEvidenceGapReason set) short-circuits that boundary to REQUIRES_VERIFICATION even when the raw distance would otherwise be DEFINITELY_INSIDE", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToFrontLotLineFt: 5, frontRoleEvidenceGapReason: "front role unresolved for this test" });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("front lot-line regulatory role unresolved")]));
    });

    it("rear distance undefined (evidence never computed) resolves REQUIRES_VERIFICATION citing rear role, not a thrown error or a false DEFINITELY_OUTSIDE", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToRearLotLineFt: undefined });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("rear lot-line regulatory role unresolved")]));
    });

    it("side role unresolved short-circuits that boundary regardless of distance", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToSideLotLineFt: 1, sideRoleEvidenceGapReason: undefined });
      // Sanity: with no role gap and distance 1 (< 3), side alone should already resolve true.
      expect(result.isInRequiredSetback).toBe(true);
      const withGap = deriveIsInRequiredSetback({ ...resolved, distanceToSideLotLineFt: 1, sideRoleEvidenceGapReason: "side role unresolved for this test" });
      // Front/rear are both resolved-outside-band (20ft each, Chapter 23.53-guarded), so with the
      // side boundary itself downgraded to unresolved by the role gap, no boundary is definitely
      // inside and the aggregate must fall through to REQUIRES_VERIFICATION.
      expect(withGap.isInRequiredSetback).toBeUndefined();
      expect(withGap.requiredSetbackEvidenceGapReasons).toEqual(expect.arrayContaining([expect.stringContaining("side lot-line regulatory role unresolved")]));
    });

    it("[hard invariant] false is not reachable via any combination of today's inputs - the Chapter 23.53 and Queen Anne Boulevard guards always block DEFINITELY_OUTSIDE with currently-available evidence, an honest disclosed consequence per the founder-approved design, not a defect", () => {
      const candidateDistances = [0, 2, 3, 4, 5, 8, 9, 10, 12, 14, 15, 20, 50, 1000];
      const roleGapCombinations: (string | undefined)[] = [undefined, "role gap"];
      for (const front of candidateDistances) {
        for (const rear of candidateDistances) {
          for (const side of candidateDistances) {
            for (const frontGap of roleGapCombinations) {
              for (const rearGap of roleGapCombinations) {
                for (const sideGap of roleGapCombinations) {
                  const result = deriveIsInRequiredSetback({
                    distanceToFrontLotLineFt: front,
                    distanceToRearLotLineFt: rear,
                    distanceToSideLotLineFt: side,
                    frontRoleEvidenceGapReason: frontGap,
                    rearRoleEvidenceGapReason: rearGap,
                    sideRoleEvidenceGapReason: sideGap,
                  });
                  expect(result.isInRequiredSetback).not.toBe(false);
                }
              }
            }
          }
        }
      }
    });

    it("multiple simultaneously-unresolved boundaries aggregate every contributing reason, never just the first one found", () => {
      const result = deriveIsInRequiredSetback({ ...resolved, distanceToFrontLotLineFt: 12, distanceToRearLotLineFt: 8, distanceToSideLotLineFt: 4 });
      expect(result.isInRequiredSetback).toBeUndefined();
      expect(result.requiredSetbackEvidenceGapReasons).toHaveLength(3);
    });
  }
);

