import { describe, expect, it } from "vitest";
import { evaluateProject, isCriticalAreaFinding } from "../../src/regulatory-rules-engine/evaluate.js";
import type { PropertyContext } from "../../src/property-intelligence/types.js";
import {
  approvedZoneBoundaryPolicy,
  dwellingSeparationRule,
  heightRule,
  notYetActiveRule,
  rearSetbackRule,
  sideFrontSetbackRule,
  zoneBoundaryInferenceRule,
} from "../fixtures/test-only-active-rules.js";

function propertyContext(facts: PropertyContext["facts"] = []): PropertyContext {
  return { parcelId: "test-parcel", assembledAt: "2026-01-01T00:00:00.000Z", facts };
}

describe("Regulatory Rules Engine - BR-4/BR-4a", () => {
  it("produces a KNOWN PASS finding for a compliant rear setback", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6 },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.status).toBe("COMPLETE");
    expect(outcome.findings[0]).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
  });

  it(
    "[founder-caught presentation gap, 2026-09-17] displayed distances are rounded to 0.1ft in explanationBasis - PostGIS's full float " +
      "precision (e.g. 43.60679091361771) must never reach customer-facing prose, though the PASS/FAIL comparison itself still uses " +
      "the full-precision value unrounded",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 43.60679091361771 },
        candidateActiveRules: [rearSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });
      expect(outcome.findings[0]?.explanationBasis).toContain("43.6ft");
      expect(outcome.findings[0]?.explanationBasis).not.toContain("43.60679091361771");
      expect(outcome.findings[0]).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" }); // comparison unaffected by rounding
    }
  );

  it("produces a KNOWN FAIL finding for a non-compliant rear setback", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 2 },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.findings[0]).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
  });

  it("[hard invariant] missing evidence produces REQUIRES_VERIFICATION, never a silently favorable finding", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false }, // distanceToRearLotLineFt intentionally omitted
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.findings[0]!.classification).toBe("REQUIRES_VERIFICATION");
    expect(outcome.findings[0]!.complianceOutcome).toBeUndefined();
  });

  it("[hard invariant] only ACTIVE rules are consumed - a DRAFTED rule passed in is silently excluded from findings", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 200, alleyAdjacent: false }, // would clearly FAIL notYetActiveRule's 1ft max if evaluated
      candidateActiveRules: [notYetActiveRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.findings).toHaveLength(0);
  });

  it("evaluates height and dwelling separation correctly", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 15, alleyAdjacent: false, distanceToDwellingFt: 2 },
      candidateActiveRules: [heightRule, dwellingSeparationRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const heightFinding = outcome.findings.find((f) => f.appliedRule?.id === heightRule.id);
    const separationFinding = outcome.findings.find((f) => f.appliedRule?.id === dwellingSeparationRule.id);
    expect(heightFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" }); // 15ft > 12ft max
    expect(separationFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" }); // 2ft < 3ft min
  });

  it("side/front setback rule applies the FULL standard setback - no reduced-setback exception for accessory structures", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: {
        projectType: "shed",
        widthFt: 8,
        depthFt: 10,
        heightFt: 10,
        alleyAdjacent: false,
        distanceToSideLotLineFt: 2, // below the 3ft standard minimum
        distanceToFrontLotLineFt: 20,
      },
      candidateActiveRules: [sideFrontSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
    const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
    expect(sideFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
    expect(frontFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
  });

  it(
    "[hard invariant, regression test 2026-08-30] Building Intelligence returning zero/multiple/unconfirmed dwelling footprints (distanceToDwellingFt " +
      "undefined) affects ONLY the dwelling-separation finding - rear/height/side/front all still produce real KNOWN findings from the SAME ACTIVE " +
      "rule set the real staging shed rules use (rear setback, height, dwelling separation, side/front setback together, exactly as they're actually " +
      "loaded in production/staging)",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 15, // > 12ft max - deliberately FAILs, proving this isn't a "nothing evaluated" false positive
          alleyAdjacent: false,
          distanceToRearLotLineFt: 6,
          distanceToSideLotLineFt: 2,
          distanceToFrontLotLineFt: 20,
          // distanceToDwellingFt intentionally omitted - simulates Building Intelligence returning
          // zero footprints, multiple footprints with none selected, or a selection that didn't
          // match fresh source data. Never fabricated or defaulted.
        },
        candidateActiveRules: [rearSetbackRule, heightRule, dwellingSeparationRule, sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      expect(outcome.status).toBe("COMPLETE");
      expect(outcome.findings.length).toBeGreaterThanOrEqual(4); // rear, height, dwelling, side, front (side/front produce 2 findings)

      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);
      const heightFinding = outcome.findings.find((f) => f.appliedRule?.id === heightRule.id);
      const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
      const dwellingFinding = outcome.findings.find((f) => f.appliedRule?.id === dwellingSeparationRule.id);

      // The 4 unrelated findings are all real, evaluated KNOWN results - never suppressed, never
      // REQUIRES_VERIFICATION, just because Building Intelligence didn't establish a dwelling.
      expect(rearFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });
      expect(heightFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
      expect(sideFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "FAIL" });
      expect(frontFinding).toMatchObject({ classification: "KNOWN", complianceOutcome: "PASS" });

      // Only dwelling separation is affected, and only in the expected, fail-closed way.
      expect(dwellingFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(dwellingFinding?.complianceOutcome).toBeUndefined();
    }
  );

  it("[hard invariant] INFERRED requires a matching approved InferencePolicy - falls to REQUIRES_VERIFICATION without one", () => {
    const withoutPolicy = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false },
      candidateActiveRules: [zoneBoundaryInferenceRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [], // no policy available
    });
    expect(withoutPolicy.findings[0]!.classification).toBe("REQUIRES_VERIFICATION");
    expect(withoutPolicy.findings[0]!.appliedInferencePolicy).toBeUndefined();

    const withPolicy = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false },
      candidateActiveRules: [zoneBoundaryInferenceRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [approvedZoneBoundaryPolicy],
    });
    expect(withPolicy.findings[0]!.classification).toBe("INFERRED");
    expect(withPolicy.findings[0]!.appliedInferencePolicy?.id).toBe(approvedZoneBoundaryPolicy.id);
  });

  it("[hard invariant] deterministic reproducibility - identical inputs produce an identical EvaluationOutcome (NFR-1)", () => {
    const input = {
      propertyContext: propertyContext(),
      project: { projectType: "shed" as const, widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6, distanceToDwellingFt: 4 },
      candidateActiveRules: [rearSetbackRule, dwellingSeparationRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    };
    const first = evaluateProject(input);
    const second = evaluateProject(input);
    expect(first).toEqual(second);
  });

  it("[hard invariant] every finding carries provenance (supportingEvidence/appliedRule/explanationBasis) populated at creation", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6 },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    const finding = outcome.findings[0]!;
    expect(finding.appliedRule).toBeDefined();
    expect(finding.supportingEvidence.length).toBeGreaterThan(0);
    expect(finding.explanationBasis.length).toBeGreaterThan(0);
  });

  it(
    "[maintenance correction, 2026-09-15] a REQUIRES_VERIFICATION setback finding states the real evidence-gap reason " +
      "(setbackEvidenceGapReason) instead of the generic 'is not available' fallback, when the pipeline supplies one - " +
      "and dwelling separation's own message is unaffected (that reason is scoped to lot-line-relative distances only)",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 10,
          alleyAdjacent: false,
          // distanceToRearLotLineFt/Side/Front intentionally omitted - simulates INSUFFICIENT
          // lot-line-role resolution.
          setbackEvidenceGapReason: "The front, rear, and side property lines could not be confidently identified for this parcel's shape.",
        },
        candidateActiveRules: [rearSetbackRule, sideFrontSetbackRule, dwellingSeparationRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);
      const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
      const dwellingFinding = outcome.findings.find((f) => f.appliedRule?.id === dwellingSeparationRule.id);

      expect(rearFinding?.explanationBasis).toContain("The front, rear, and side property lines could not be confidently identified");
      expect(sideFinding?.explanationBasis).toContain("The front, rear, and side property lines could not be confidently identified");
      expect(frontFinding?.explanationBasis).toContain("The front, rear, and side property lines could not be confidently identified");
      // Dwelling separation never uses this reason - it's a genuinely different cause (no
      // dwelling established), never attributed to lot-line-role resolution.
      expect(dwellingFinding?.explanationBasis).toContain("distanceToDwellingFt is not available");
    }
  );

  it("[hard invariant] a setback finding falls back to the generic 'is not available' message when no setbackEvidenceGapReason is supplied (e.g. no placement was ever attempted at all)", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.findings[0]?.explanationBasis).toBe("Cannot evaluate: distanceToRearLotLineFt is not available.");
  });

  it(
    "[maintenance correction, 2026-09-16, founder-directed current-code research] a confirmed street-frontage edge's distance is " +
      "evaluated by the SAME SIDE_FRONT_SETBACK_STANDARD rule as an ordinary side - current SMC 23.44.090 imposes no distinct " +
      "required depth for a side-street lot line, so distanceToSideLotLineFt already reflects it and no separate finding is produced",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 10,
          alleyAdjacent: false,
          distanceToRearLotLineFt: 20,
          distanceToFrontLotLineFt: 20,
          distanceToSideLotLineFt: 4, // the min across ordinary AND confirmed street-frontage edges alike
          sideEdgeDistancesFt: { "edge-1": 4, "edge-2": 6.8 },
        },
        candidateActiveRules: [rearSetbackRule, sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);
      const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));

      expect(rearFinding).toMatchObject({ classification: "KNOWN" });
      expect(frontFinding).toMatchObject({ classification: "KNOWN" });
      expect(sideFinding).toMatchObject({ classification: "KNOWN" });
      expect(sideFinding?.explanationBasis).toContain("4ft");
      // No separate "Side-street setback" finding exists anymore - folded into the single Side finding.
      expect(outcome.findings.some((f) => f.subject.startsWith("Side-street setback"))).toBe(false);
    }
  );

  it(
    "[maintenance correction, 2026-09-17, founder correction after reviewer escalation 53f30444-b566-4197-b0dd-e2aff768fa65] a KNOWN " +
      "front-line distance with frontRoleEvidenceGapReason set produces REQUIRES_VERIFICATION for the front finding specifically - " +
      "measurement stays KNOWN in the explanation text and supportingEvidence, but the conclusion is not a confident PASS/FAIL, because " +
      "the front-line role cannot be resolved from parcel geometry alone (through-lot vs. Director-determined corner lot vs. ordinary " +
      "side-street all remain possible)",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 10,
          alleyAdjacent: false,
          distanceToRearLotLineFt: 20,
          distanceToFrontLotLineFt: 42.8,
          distanceToSideLotLineFt: 7,
          frontRoleEvidenceGapReason:
            "current Seattle code cannot confirm from this property's boundary geometry alone whether this is a through-lot front line or a Director-determined corner-lot front.",
          unresolvedStreetFrontageDistancesFt: { "edge-2": 6.8 },
          streetFrontageHeuristics: {
            "edge-2": { frontEdgeRef: "edge-0", edgeRef: "edge-2", azimuthFrontDeg: 90, azimuthEdgeDeg: 95, angleFromParallelDeg: 5, possibleThroughLot: true, evidenceQuality: "INFERRED" },
          },
        },
        candidateActiveRules: [rearSetbackRule, sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
      const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);
      const frontageFinding = outcome.findings.find((f) => f.subject.endsWith("(additional street frontage)"));

      expect(frontFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(frontFinding?.complianceOutcome).toBeUndefined();
      expect(frontFinding?.explanationBasis).toContain("42.8ft"); // the known measurement, still surfaced
      expect(frontFinding?.explanationBasis).toContain("Director-determined corner-lot front");
      expect(frontFinding?.supportingEvidence).toContain("distanceToFrontLotLineFt=42.8");
      // Ordinary side and rear findings are unaffected - the founder's own "do not downgrade
      // unrelated front/rear/side geometry" instruction.
      expect(sideFinding).toMatchObject({ classification: "KNOWN" });
      expect(rearFinding).toMatchObject({ classification: "KNOWN" });
      // One grouped finding for the unresolved edge(s), not one per edge - the KNOWN distance is
      // preserved and cited, but no PASS/FAIL is asserted for it, and the through-lot/Director
      // possibilities are both named without asserting either conclusively.
      expect(frontageFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(frontageFinding?.complianceOutcome).toBeUndefined();
      expect(frontageFinding?.explanationBasis).toContain("6.8ft");
      expect(frontageFinding?.explanationBasis).toContain("Director of Construction");
      expect(frontageFinding?.explanationBasis).toContain("through lot");
      expect(frontageFinding?.supportingEvidence).toContain("edge-2=6.8");
      // Heuristic evidence is persisted for traceability, explicitly labeled non-authoritative.
      expect(frontageFinding?.supportingEvidence?.some((e) => e.includes("heuristic(edge-2)") && e.includes("evidenceQuality:INFERRED"))).toBe(true);
    }
  );

  it(
    "[maintenance correction, 2026-09-17] multiple unresolved street-frontage edges are grouped into ONE additional-street-frontage " +
      "finding citing the closest (minimum) distance, never one finding per edge",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 10,
          alleyAdjacent: false,
          distanceToRearLotLineFt: 20,
          distanceToFrontLotLineFt: 42.8,
          distanceToSideLotLineFt: 7,
          frontRoleEvidenceGapReason: "current Seattle code cannot confirm the front-line role from parcel geometry alone.",
          unresolvedStreetFrontageDistancesFt: { "edge-2": 6.8, "edge-3": 8.367923335393728 },
        },
        candidateActiveRules: [sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      const frontageFindings = outcome.findings.filter((f) => f.subject.endsWith("(additional street frontage)"));
      expect(frontageFindings).toHaveLength(1);
      expect(frontageFindings[0]?.explanationBasis).toContain("6.8ft"); // the minimum of the two
      expect(frontageFindings[0]?.explanationBasis).not.toContain("8.367923335393728");
      expect(frontageFindings[0]?.supportingEvidence).toEqual(["edge-2=6.8", "edge-3=8.367923335393728"]);
    }
  );

  it(
    "[evaluator field-independence, isolated unit test - NOT a realistic pipeline-derived combination] rearRoleEvidenceGapReason alone " +
      "(with no unresolvedStreetFrontageDistancesFt/frontRoleEvidenceGapReason set) produces REQUIRES_VERIFICATION for rear specifically " +
      "without affecting the front finding - verifies evaluateRearSetback/evaluateSideFrontSetback check their OWN gap-reason field " +
      "independently, never cross-affecting each other. Real production rearAlsoFacesStreet=true always sets frontRoleEvidenceGapReason " +
      "TOO (see the next test) - reviewer-caught gap, 2026-09-17, decision ccf1dee8-392a-416a-82d4-82222a837446",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 10,
          alleyAdjacent: false,
          distanceToSideLotLineFt: 7,
          distanceToFrontLotLineFt: 42.8,
          distanceToRearLotLineFt: 70.6, // KNOWN - never undefined, even though its role is unresolved
          rearRoleEvidenceGapReason: "your rear property line was confirmed to also face a street, and current Seattle code cannot confirm...",
        },
        candidateActiveRules: [rearSetbackRule, sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);
      expect(frontFinding).toMatchObject({ classification: "KNOWN" });
      expect(outcome.findings.some((f) => f.subject.endsWith("(additional street frontage)"))).toBe(false);
      expect(rearFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(rearFinding?.explanationBasis).toContain("70.6ft"); // known measurement, still surfaced
      expect(rearFinding?.explanationBasis).toContain("confirmed to also face a street");
      expect(rearFinding?.supportingEvidence).toContain("distanceToRearLotLineFt=70.6");
    }
  );

  it(
    "[the REAL rearAlsoFacesStreet=true combination, matching pipeline.ts's actual deriveStreetFrontageRoleGapReasons derivation] " +
      "front AND rear both become REQUIRES_VERIFICATION together, since computeSetbackDistances places the rear edge itself into " +
      "unresolvedStreetFrontageDistancesFt whenever rearAlsoFacesStreet is true - front is never left confidently KNOWN in this case " +
      "(reviewer-caught test-accuracy gap, 2026-09-17, decision ccf1dee8-392a-416a-82d4-82222a837446)",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 10,
          alleyAdjacent: false,
          distanceToSideLotLineFt: 7,
          distanceToFrontLotLineFt: 42.8,
          distanceToRearLotLineFt: 70.6,
          frontRoleEvidenceGapReason:
            "current Seattle code cannot confirm from this property's boundary geometry alone whether the actual streets involved make this a mandatory through-lot front line or leave the front-line determination to the Director - see the additional street frontage finding.",
          rearRoleEvidenceGapReason:
            "your rear property line was confirmed to also face a street, and current Seattle code cannot confirm from parcel geometry alone whether that makes it a through-lot front line or a Director-determined front line, or leaves it as an ordinary rear line - see the additional street frontage finding.",
          unresolvedStreetFrontageDistancesFt: { "edge-2": 70.6 },
        },
        candidateActiveRules: [rearSetbackRule, sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);
      const frontageFinding = outcome.findings.find((f) => f.subject.endsWith("(additional street frontage)"));

      expect(frontFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(frontFinding?.complianceOutcome).toBeUndefined();
      expect(rearFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(rearFinding?.complianceOutcome).toBeUndefined();
      expect(rearFinding?.explanationBasis).toContain("70.6ft");
      expect(frontageFinding?.classification).toBe("REQUIRES_VERIFICATION");
      expect(frontageFinding?.supportingEvidence).toContain("edge-2=70.6");
    }
  );

  it(
    "[maintenance correction, 2026-09-17, founder correction after reviewer escalation] NOT_SURE makes front/rear/side role-dependent " +
      "conclusions REQUIRES_VERIFICATION, never behaving like NO - every measurement stays KNOWN in the explanation text",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: {
          projectType: "shed",
          widthFt: 8,
          depthFt: 10,
          heightFt: 10,
          alleyAdjacent: false,
          distanceToFrontLotLineFt: 42.8,
          distanceToRearLotLineFt: 20,
          distanceToSideLotLineFt: 7,
          frontRoleEvidenceGapReason: "you indicated you're not sure whether this property has street frontage on more than one side...",
          rearRoleEvidenceGapReason: "you indicated you're not sure whether this property has street frontage on more than one side...",
          sideRoleEvidenceGapReason: "you indicated you're not sure whether this property has street frontage on more than one side...",
        },
        candidateActiveRules: [rearSetbackRule, sideFrontSetbackRule],
        ecaFindings: [],
        candidateActiveInferencePolicies: [],
      });

      const frontFinding = outcome.findings.find((f) => f.subject.endsWith("(front)"));
      const sideFinding = outcome.findings.find((f) => f.subject.endsWith("(side)"));
      const rearFinding = outcome.findings.find((f) => f.appliedRule?.id === rearSetbackRule.id);

      for (const finding of [frontFinding, sideFinding, rearFinding]) {
        expect(finding?.classification).toBe("REQUIRES_VERIFICATION");
        expect(finding?.complianceOutcome).toBeUndefined();
        expect(finding?.explanationBasis).toContain("not sure");
      }
      expect(frontFinding?.explanationBasis).toContain("42.8ft");
      expect(rearFinding?.explanationBasis).toContain("20ft");
      expect(sideFinding?.explanationBasis).toContain("7ft");
    }
  );

  it(
    "[maintenance correction, 2026-09-15] isCriticalAreaFinding correctly identifies every per-hazard ECA finding evaluateProject " +
      "produces, and only those - the exact predicate pipeline.ts's Report Explanation input and ReportView's general Findings " +
      "lists both use to exclude them, so they are narrated only by the dedicated Mapped Environmental / Site Constraints section",
    () => {
      const outcome = evaluateProject({
        propertyContext: propertyContext(),
        project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 6 },
        candidateActiveRules: [rearSetbackRule],
        ecaFindings: [
          { hazardType: "steep_slope", mappedIntersectionResult: "NO_INTERSECTION", advisoryStatus: "ADVISORY_ONLY", toleranceBasis: "test" },
          { hazardType: "priority_habitat", mappedIntersectionResult: "INTERSECTS", advisoryStatus: "MAP_DISPOSITIVE", toleranceBasis: "test" },
        ],
        candidateActiveInferencePolicies: [],
      });

      const ecaFindings = outcome.findings.filter((f) => isCriticalAreaFinding(f.subject));
      const nonEcaFindings = outcome.findings.filter((f) => !isCriticalAreaFinding(f.subject));
      expect(ecaFindings).toHaveLength(2);
      expect(ecaFindings.every((f) => f.subject.startsWith("Critical area: "))).toBe(true);
      expect(nonEcaFindings).toHaveLength(1);
      expect(nonEcaFindings[0]!.appliedRule?.id).toBe(rearSetbackRule.id);
    }
  );

  it("[hard invariant] defers the whole evaluation (never a hollow REQUIRES_VERIFICATION-only report) when parcel geometry itself is unavailable", () => {
    const outcome = evaluateProject({
      propertyContext: propertyContext([
        {
          factType: "parcel-geometry-available",
          provenance: { sourceAgency: "test", dataset: "test", retrievalTimestamp: "2026-01-01T00:00:00.000Z" },
          availabilityState: "UNAVAILABLE",
        },
      ]),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false },
      candidateActiveRules: [rearSetbackRule],
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });
    expect(outcome.status).toBe("DEFERRED");
    expect(outcome.findings).toHaveLength(0);
    expect(outcome.deferralReason).toBeTruthy();
  });
});

describe("shed: 'Not yet automatically screenable' when the position-dependent rules are not ACTIVE", () => {
  const evalShed = (rules: Parameters<typeof evaluateProject>[0]["candidateActiveRules"]) =>
    evaluateProject({
      propertyContext: propertyContext(),
      project: { projectType: "shed", widthFt: 8, depthFt: 10, heightFt: 10, alleyAdjacent: false, distanceToRearLotLineFt: 20, distanceToSideLotLineFt: 10, distanceToFrontLotLineFt: 40, distanceToDwellingFt: 15 },
      candidateActiveRules: rules,
      ecaFindings: [],
      candidateActiveInferencePolicies: [],
    });

  it("with no rules ACTIVE every position-dependent constraint is reported as not screened (never silently omitted)", () => {
    const o = evalShed([]);
    expect(o.findings.filter((f) => f.appliedRule)).toEqual([]);
    expect(o.uncoveredConstraintTypes).toEqual(["setback", "height", "separation from the house"]);
  });

  it("each constraint is covered by exactly its own rule types; with all of them ACTIVE nothing is uncovered", () => {
    expect(evalShed([heightRule]).uncoveredConstraintTypes).toEqual(["setback", "separation from the house"]);
    expect(evalShed([rearSetbackRule]).uncoveredConstraintTypes).toEqual(["height", "separation from the house"]);
    expect(evalShed([sideFrontSetbackRule]).uncoveredConstraintTypes).toEqual(["height", "separation from the house"]);
    expect(evalShed([dwellingSeparationRule]).uncoveredConstraintTypes).toEqual(["setback", "height"]);
    expect(evalShed([rearSetbackRule, sideFrontSetbackRule, heightRule, dwellingSeparationRule]).uncoveredConstraintTypes).toEqual([]);
  });

  it("an inactive rule does not count as coverage", () => {
    expect(evalShed([notYetActiveRule]).uncoveredConstraintTypes).toEqual(["setback", "height", "separation from the house"]);
  });
});
