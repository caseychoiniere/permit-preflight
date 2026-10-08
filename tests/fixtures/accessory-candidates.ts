/**
 * REAL governance candidates for accessory structures (Unit 11 Slice 2): three for a shed and five for a detached garage. They replace the
 * four STAGING-TEST-ONLY shed fixtures. Content is current Seattle code as read live from Municode on 2026-10-08 (Ord. 127376, 2025):
 *  - SMC 23.44.090 Table A (front 15 ft, 10 ft with 3+ dwelling units; rear; side 5 ft average / 3 ft minimum, 3 ft on small lots near frequent transit),
 *  - 23.44.090.I (an accessory structure that is not a dwelling unit: in the rear setback if >= 5 ft from a non-alley rear lot line, <= 12 ft, >= 3 ft from a
 *    dwelling eave to eave; in a side or rear setback abutting another lot's only with a recorded agreement),
 *  - 23.44.090.G (garages and carports), 23.44.070.A (12 ft in a required setback; 32 ft generally), 23.44.100.A (5 ft between structures containing floor
 *    area), 23.44.080.A (50% coverage).
 * Interpretive edges are handled by the evaluator as REQUIRES_VERIFICATION (the side average, small-lot transit setback, three-unit front setback, the
 * separation that depends on being inside or outside the rear setback, garage exceptions); the screening tolerance for county-mapped distances is 2 ft.
 * Advanced only to APPROVED by scripts/accessory-rules-governance.ts; activation is a separate decision.
 */
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { ShedPermitRuleType } from "../../src/regulatory-rules-engine/evaluate.js";

const BASIS =
  "Ordinance 127376 (2025): SMC 23.44.070, 23.44.080, 23.44.090 and 23.44.100 as published on Municode Library (CURRENT) and read live 2026-10-08; the pre-2025 citation SMC 23.44.014 no longer exists.";
const MAPPED = {
  category: "mapped distance, not a survey",
  description:
    "Distances are measured by PostGIS from the footprint the customer placed on King County's parcel polygon (general-location mapping) and Seattle Building Outlines (2023). A distance within the 2 ft screening tolerance of a threshold is REQUIRES_VERIFICATION; the tolerance is a product margin, not a statement about the sources' accuracy. A footprint that reaches over a lot line produces no distance at all.",
  affectedConditionOrInterpretation: "Reliability of a measured distance near a threshold",
  sourceReferences: ["King County parcel polygon quality caveat", "BR-U2-10"],
  resolutionStatus: "Resolved by design.",
};

export interface AccessoryTestInput {
  project: Record<string, unknown>;
}
type Case = { kind: "POSITIVE" | "NEGATIVE" | "EXCEPTION" | "BOUNDARY"; description: string; input: Record<string, unknown>; expected: Record<string, unknown> };
const tc = (kind: Case["kind"], description: string, project: Record<string, unknown>, finding: string, outcome: string): Case => ({ kind, description, input: { project }, expected: { finding, outcome } });

export const shedAccessoryCandidates: DraftedRuleInput[] = [
  {
    id: "shed-s1-rear-setback-2026",
    subject: "Shed rear setback - 5 ft from a non-alley rear lot line (none at an alley)",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0, mappingToleranceFt: 2 },
    citation: { smcSections: ["SMC 23.44.090.I.2.a", "SMC 23.44.090 Table A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [MAPPED, { category: "rear setback region", description: "A structure beyond the 15 ft rear setback has no rear limit; the rule is applied as a 5 ft minimum, which a structure outside the setback also meets.", affectedConditionOrInterpretation: "SMC 23.44.090.I.2", sourceReferences: ["SMC 23.44.090.I.2", "SMC 23.44.090 Table A"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "20 ft from the rear lot line", { distanceToRearLotLineFt: 20 }, "Shed rear setback", "KNOWN/PASS"),
      tc("NEGATIVE", "1 ft from the rear lot line", { distanceToRearLotLineFt: 1 }, "Shed rear setback", "KNOWN/FAIL"),
      tc("BOUNDARY", "6 ft: inside the 2 ft screening tolerance of 5 ft", { distanceToRearLotLineFt: 6 }, "Shed rear setback", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "0 ft at an alley", { alleyAdjacent: true, distanceToRearLotLineFt: 0 }, "Shed rear setback", "KNOWN/PASS"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-s2-side-front-setback-2026",
    subject: "Shed side and front setbacks - side 5 ft average / 3 ft minimum; front 15 ft (10 ft with three or more dwelling units)",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: "SIDE_FRONT_SETBACK_STANDARD", sideAverageFt: 5, sideMinFt: 3, frontFt: 15, frontReducedFt: 10, mappingToleranceFt: 2 },
    citation: { smcSections: ["SMC 23.44.090 Table A", "SMC 23.44.090.I.1", "SMC 23.44.090.B"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      MAPPED,
      { category: "side average, small-lot transit setback, recorded agreement, three-unit front", description: "The side setback is 5 ft on average with a 3 ft minimum (3 ft on lots under 5,000 sq ft in a frequent transit service area), and an accessory structure in a required side setback needs a recorded neighbor agreement (I.1). A distance clearly beyond the 5 ft average passes; clearly under 3 ft fails; anything between is REQUIRES_VERIFICATION. The front setback is 10 ft with three or more dwelling units, so a distance between 10 and 15 ft is REQUIRES_VERIFICATION. Corner and through lots are never resolved from the parcel shape alone.", affectedConditionOrInterpretation: "Table A side and front; I.1; B", sourceReferences: ["SMC 23.44.090 Table A", "SMC 23.44.090.I.1", "SMC 23.84A.024"], resolutionStatus: "Resolved by design - every uncertain case is REQUIRES_VERIFICATION." },
    ],
    testCases: [
      tc("POSITIVE", "12 ft from the nearest side lot line", { distanceToSideLotLineFt: 12 }, "(side)", "KNOWN/PASS"),
      tc("NEGATIVE", "0.5 ft from the nearest side lot line", { distanceToSideLotLineFt: 0.5 }, "(side)", "KNOWN/FAIL"),
      tc("EXCEPTION", "4 ft: meets the 3 ft minimum but not clearly the 5 ft average", { distanceToSideLotLineFt: 4 }, "(side)", "REQUIRES_VERIFICATION"),
      tc("POSITIVE", "40 ft from the front lot line", { distanceToFrontLotLineFt: 40 }, "(front)", "KNOWN/PASS"),
      tc("NEGATIVE", "5 ft from the front lot line", { distanceToFrontLotLineFt: 5 }, "(front)", "KNOWN/FAIL"),
      tc("EXCEPTION", "12 ft from the front lot line: the three-unit 10 ft setback may apply", { distanceToFrontLotLineFt: 12 }, "(front)", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "shed-s3-dwelling-separation-2026",
    subject: "Shed separation from the dwelling - 3 ft eave to eave in the rear setback; 5 ft between structures containing floor area elsewhere",
    applicableProjectType: "shed",
    applicableZone: "NR",
    ruleSpecification: { ruleType: "DWELLING_SEPARATION", minFt: 3, outsideRearSetbackFt: 5, mappingToleranceFt: 2 },
    citation: { smcSections: ["SMC 23.44.090.I.2.c", "SMC 23.44.100.A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [MAPPED, { category: "where the shed stands", description: "The 3 ft separation (eave to eave) is the rear-setback allowance; outside the rear setback a structure containing floor area must be 5 ft from the house. Without the shed's position relative to the rear setback, a distance between 3 and 5 ft (plus tolerance) is REQUIRES_VERIFICATION; under 3 ft fails either way.", affectedConditionOrInterpretation: "SMC 23.44.090.I.2.c vs 23.44.100.A", sourceReferences: ["SMC 23.44.090.I.2.c", "SMC 23.44.100.A"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "12 ft from the house", { distanceToDwellingFt: 12 }, "Shed separation from the dwelling", "KNOWN/PASS"),
      tc("NEGATIVE", "0.5 ft from the house: clearly short of 3 ft even allowing the tolerance", { distanceToDwellingFt: 0.5 }, "Shed separation from the dwelling", "KNOWN/FAIL"),
      tc("EXCEPTION", "6 ft: enough in the rear setback, near the 5 ft that applies elsewhere", { distanceToDwellingFt: 6 }, "Shed separation from the dwelling", "REQUIRES_VERIFICATION"),
      tc("BOUNDARY", "4 ft: inside the tolerance of 3 ft", { distanceToDwellingFt: 4 }, "Shed separation from the dwelling", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
];

const GARAGE_EXCEPTION =
  "Garages and carports may be allowed in a setback in specific situations (SMC 23.44.090.G and SMC 23.44.160.D), so a distance short of the requirement is for SDCI to resolve.";

export const garageAccessoryCandidates: DraftedRuleInput[] = [
  {
    id: "garage-g1-rear-setback-2026",
    subject: "Detached garage rear setback - 5 ft from the rear property line (none at an alley)",
    applicableProjectType: "garage",
    applicableZone: "NR",
    ruleSpecification: { ruleType: "REAR_SETBACK", minFt: 5, minFtIfAlleyAdjacent: 0, mappingToleranceFt: 2 },
    citation: { smcSections: ["SMC 23.44.090.G.3", "SMC 23.44.090 Table A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [MAPPED],
    testCases: [
      tc("POSITIVE", "20 ft from the rear lot line", { distanceToRearLotLineFt: 20 }, "Detached garage rear setback", "KNOWN/PASS"),
      tc("NEGATIVE", "1 ft from the rear lot line", { distanceToRearLotLineFt: 1 }, "Detached garage rear setback", "KNOWN/FAIL"),
      tc("BOUNDARY", "6 ft: inside the screening tolerance", { distanceToRearLotLineFt: 6 }, "Detached garage rear setback", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "garage-g2-side-front-setback-2026",
    subject: "Detached garage side and front setbacks - side 5 ft average / 3 ft minimum; front 15 ft; exceptions for garages never a definite failure",
    applicableProjectType: "garage",
    applicableZone: "NR",
    ruleSpecification: { ruleType: "SIDE_FRONT_SETBACK_STANDARD", sideAverageFt: 5, sideMinFt: 3, frontFt: 15, frontReducedFt: 10, mappingToleranceFt: 2, exceptionNote: GARAGE_EXCEPTION },
    citation: { smcSections: ["SMC 23.44.090 Table A", "SMC 23.44.090.G.1", "SMC 23.44.090.G.2", "SMC 23.44.090.G.4", "SMC 23.44.160.D.4", "SMC 23.44.160.D.5"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      MAPPED,
      { category: "garage and carport exceptions", description: "Garages and carports may stand in a side setback within 40 ft of an alley centerline or within 25 ft of a non-alley rear lot line, or by recorded agreement (G.2), and in a front setback where parking is allowed there (G.1, SMC 23.44.160.D.4-5). Permit Preflight cannot establish those situations, so a distance short of the side or front requirement is REQUIRES_VERIFICATION with a note, never a definite FAIL; only a distance clearly beyond the requirement is a PASS.", affectedConditionOrInterpretation: "SMC 23.44.090.G", sourceReferences: ["SMC 23.44.090.G", "SMC 23.44.160.D"], resolutionStatus: "Resolved by design." },
    ],
    testCases: [
      tc("POSITIVE", "12 ft from the side lot line", { distanceToSideLotLineFt: 12 }, "(side)", "KNOWN/PASS"),
      tc("EXCEPTION", "0.5 ft from the side lot line: exceptions may apply, so not a definite failure", { distanceToSideLotLineFt: 0.5 }, "(side)", "REQUIRES_VERIFICATION"),
      tc("POSITIVE", "40 ft from the front lot line", { distanceToFrontLotLineFt: 40 }, "(front)", "KNOWN/PASS"),
      tc("EXCEPTION", "5 ft from the front lot line: a garage may be allowed in a front setback in some cases", { distanceToFrontLotLineFt: 5 }, "(front)", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "garage-g3-height-in-setback-2026",
    subject: "Accessory structure height limit - in a required setback (12 ft)",
    applicableProjectType: "garage",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_IN_SETBACK },
    citation: { smcSections: ["SMC 23.44.070.A.3"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [{ category: "roof exceptions", description: "A pitched-roof ridge may rise 3 ft above the limit (4:12 or steeper); the product states over-limit heights as REQUIRES_VERIFICATION, never an unconditional FAIL.", affectedConditionOrInterpretation: "SMC 23.44.070.A.3.a", sourceReferences: ["SMC 23.44.070.A.3"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "In a setback, 10 ft", { isInRequiredSetback: true, heightFt: 10 }, "Accessory structure height limit", "KNOWN/PASS"),
      tc("EXCEPTION", "In a setback, 14 ft", { isInRequiredSetback: true, heightFt: 14 }, "Accessory structure height limit", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "garage-g4-height-outside-setback-2026",
    subject: "Accessory structure height limit - outside every required setback (32 ft)",
    applicableProjectType: "garage",
    applicableZone: "NR",
    ruleSpecification: { ruleType: ShedPermitRuleType.ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK },
    citation: { smcSections: ["SMC 23.44.070.A.1"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [{ category: "roof exceptions", description: "Same as the in-setback row: over-limit heights are REQUIRES_VERIFICATION.", affectedConditionOrInterpretation: "SMC 23.44.070", sourceReferences: ["SMC 23.44.070"], resolutionStatus: "Resolved by design." }],
    testCases: [
      tc("POSITIVE", "Outside setbacks, 20 ft", { isInRequiredSetback: false, heightFt: 20 }, "Accessory structure height limit", "KNOWN/PASS"),
      tc("EXCEPTION", "Outside setbacks, 35 ft", { isInRequiredSetback: false, heightFt: 35 }, "Accessory structure height limit", "REQUIRES_VERIFICATION"),
      tc("EXCEPTION", "Whether the placement is in a required setback is unresolved", { isInRequiredSetback: undefined, requiredSetbackEvidenceGapReasons: ["test gap"], heightFt: 10 }, "Accessory structure height limit", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
  {
    id: "garage-g5-lot-coverage-2026",
    subject: "Detached garage lot coverage (base 50% maximum)",
    applicableProjectType: "garage",
    applicableZone: "NR",
    ruleSpecification: { ruleType: "LOT_COVERAGE" },
    citation: { smcSections: ["SMC 23.44.080.A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [{ category: "existing footprint is self-reported; excluded land unknown", description: "The existing-structures figure is customer-supplied and the countable lot area cannot be established from advisory maps, so the result is REQUIRES_VERIFICATION in every real evaluation (BR-U4-3, BR-U4-7).", affectedConditionOrInterpretation: "SMC 23.44.080.A-E", sourceReferences: ["SMC 23.44.080"], resolutionStatus: "Resolved by design - the rule exists so the claim is governed; the evaluator never produces a KNOWN result today." }],
    testCases: [
      tc("EXCEPTION", "No existing-structures figure supplied", { lotCoverageFacts: "UNSUPPLIED" }, "Detached garage lot coverage", "REQUIRES_VERIFICATION"),
    ],
    isTestOnlyFixture: false,
  },
];

export const ACCESSORY_FIXED_ROW_IDS: Record<string, string> = {
  "shed-s1-rear-setback-2026": "daccb543-ee44-42a1-89d6-7921d5eb5b02",
  "shed-s2-side-front-setback-2026": "989ef8f6-7881-42db-a2d1-851b6f3d42dc",
  "shed-s3-dwelling-separation-2026": "5ac44c0d-f97d-41c9-8b71-39af1346aac8",
  "garage-g1-rear-setback-2026": "c2731426-d201-4da3-8530-23c632367cd3",
  "garage-g2-side-front-setback-2026": "88ea1454-5af8-49be-a858-398a530e01cf",
  "garage-g3-height-in-setback-2026": "78013662-92e3-4d93-a753-dd6ba158c98a",
  "garage-g4-height-outside-setback-2026": "ea5ac746-fbe4-4837-ba90-01374a4e2d22",
  "garage-g5-lot-coverage-2026": "797e9e92-faba-472c-a36d-027760edb108",
};
export const allAccessoryCandidates: DraftedRuleInput[] = [...shedAccessoryCandidates, ...garageAccessoryCandidates];
