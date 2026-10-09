/**
 * REAL governance candidates for the detached-garage separation from the principal structure, one row per zone family where the code supplies a deterministic
 * rule (zone-aware expected-constraint fix, 2026-10-09). Content is current Seattle code as read live from Municode (version Sep 25 2026, Ord. 127376):
 *  - Neighborhood Residential: SMC 23.44.100.A (5 ft between structures containing floor area; 2 ft more than the width of a driveway or parking aisle between
 *    them, up to 24 ft), 23.44.100.C (eaves, gutters and weather protection may project 2 ft into a required separation) and 23.44.090.I.2.c (an enclosed
 *    structure that is not a dwelling unit is allowed in the rear setback if separated from a dwelling unit by 3 ft, eave to eave). The former garage-specific
 *    5 ft separation and its terraced-garage exception no longer appear in Chapter 23.44.
 *  - Lowrise and Midrise: SMC 23.45.519.A-B (same 5 ft, driveway/aisle variation and 2 ft eave projections) and 23.45.518.H.1.d (3 ft from all principal
 *    structures, including eaves, gutters and projecting features, for an accessory structure in a required rear or side setback).
 *  - Highrise: 23.45.519 governs LR and MR zones only; the 3 ft of 23.45.518.H.1.d is the only separation, and only for a garage in a required setback.
 *  - Neighborhood Commercial and Commercial: Chapter 23.47A contains no garage-to-principal-structure separation (its separation provisions concern structures
 *    wider than 250 ft and optional facade breaks). There is deliberately NO row for those zones: the claim is NOT_APPLICABLE and the report lists nothing.
 * A garage's floor area counts toward the floor area limits (23.44.050, 23.45.510), so it is a "structure containing floor area". Each row is Tier 1: numeric
 * thresholds in the code text; every interpretive edge (position relative to a required setback, eaves, a driveway between the structures) is handled by the
 * evaluator as REQUIRES_VERIFICATION.
 */
import type { DraftedRuleInput } from "../../src/regulatory-rule-governance/lifecycle.js";
import { mfRowId } from "./multifamily-candidates.js";

const BASIS = "Ordinance 127376 (2025): SMC Chapters 23.44 and 23.45 as published on Municode Library (CURRENT, version Sep 25 2026) and read live 2026-10-09.";
const SUBJECT_FINDING = "Detached garage separation from the principal structure";
const MAPPED = {
  category: "mapped distance, not a survey",
  description:
    "The distance is measured by PostGIS from the footprint the customer placed to the building the customer confirmed as the main house, using Seattle Building Outlines (2023, a roof edge from aerial imagery that includes eaves). A distance within the 2 ft screening tolerance of a threshold is REQUIRES_VERIFICATION, never a definite PASS or FAIL.",
  affectedConditionOrInterpretation: "Reliability of a measured distance near a threshold",
  sourceReferences: ["Seattle Building Outlines 2023", "BR-U2-10"],
  resolutionStatus: "Resolved by design.",
};
const EAVES_AND_POSITION = {
  category: "eaves, wall measurement and position",
  description:
    "The 5 ft between structures is measured wall to wall and eaves may project 2 ft into it; the 3 ft in a required setback includes eaves and gutters. A distance clearly under 3 ft fails either way; clearly beyond the requirement passes; between them whether it is enough depends on where the garage stands relative to the required setbacks and on the eaves, so it is REQUIRES_VERIFICATION.",
  affectedConditionOrInterpretation: "Which separation applies at a distance between the in-setback and between-structures figures",
  sourceReferences: ["SMC 23.44.100.A", "SMC 23.44.100.C", "SMC 23.45.519.A", "SMC 23.45.519.B", "SMC 23.45.518.H.1.d"],
  resolutionStatus: "Resolved by design.",
};
const DRIVEWAY = {
  category: "driveway or parking aisle between the structures",
  description:
    "Where a driveway or parking aisle separates the structures the requirement is 2 ft more than its required width, never more than 24 ft. The customer is asked whether one lies between the garage and the house; the width is not known, so beyond 5 ft and short of 24 ft the result is a PASS only when the customer states there is none.",
  affectedConditionOrInterpretation: "Required separation across a driveway or parking aisle",
  sourceReferences: ["SMC 23.44.100.A", "SMC 23.45.519.A"],
  resolutionStatus: "Resolved by design - the garage form asks, and an unanswered question is REQUIRES_VERIFICATION.",
};
const NO_TERRACED = {
  category: "terraced and attached garages",
  description:
    "The terraced-garage exception to the garage separation (former SMC 23.44.016) no longer appears in Chapter 23.44. An attached garage is part of the principal structure and has no separation from it; this product screens detached garages only.",
  affectedConditionOrInterpretation: "Terraced or attached garage treatment",
  sourceReferences: ["SMC Chapter 23.44 (Ord. 127376), no terraced-garage provision"],
  resolutionStatus: "Resolved - nothing to encode.",
};

type Kind = "POSITIVE" | "NEGATIVE" | "EXCEPTION" | "BOUNDARY";
const tc = (kind: Kind, description: string, project: Record<string, unknown>, outcome: string, zoning: string) => ({
  kind,
  description,
  input: { project, zoning },
  expected: { finding: SUBJECT_FINDING, outcome },
});

/** The cases every two-threshold (3 ft / 5 ft) row declares, run in the zone given. */
const twoThresholdCases = (zoning: string) => [
  tc("POSITIVE", "30 ft from the principal structure: beyond even the 24 ft a driveway between them could require", { distanceToDwellingFt: 30 }, "KNOWN/PASS", zoning),
  tc("POSITIVE", "10 ft with the customer stating no driveway or parking aisle lies between", { distanceToDwellingFt: 10, drivewayOrAisleBetween: false }, "KNOWN/PASS", zoning),
  tc("NEGATIVE", "0.5 ft from the principal structure: under 3 ft even allowing the tolerance", { distanceToDwellingFt: 0.5 }, "KNOWN/FAIL", zoning),
  tc("BOUNDARY", "4 ft: between the 3 ft in a setback and the 5 ft between structures", { distanceToDwellingFt: 4 }, "REQUIRES_VERIFICATION", zoning),
  tc("BOUNDARY", "6.5 ft: inside the tolerance of 5 ft", { distanceToDwellingFt: 6.5, drivewayOrAisleBetween: false }, "REQUIRES_VERIFICATION", zoning),
  tc("EXCEPTION", "10 ft with no answer about a driveway or parking aisle between the structures", { distanceToDwellingFt: 10 }, "REQUIRES_VERIFICATION", zoning),
  tc("EXCEPTION", "10 ft with a driveway or parking aisle between the structures (width unknown)", { distanceToDwellingFt: 10, drivewayOrAisleBetween: true }, "REQUIRES_VERIFICATION", zoning),
  tc("EXCEPTION", "no principal structure established: the distance cannot be measured", { distanceToDwellingFt: undefined, dwellingSeparationEvidenceGapReason: "No building was confirmed as the main house." }, "REQUIRES_VERIFICATION", zoning),
];

export const garageSeparationCandidates: DraftedRuleInput[] = [
  {
    id: "garage-nr-separation-2026",
    subject: "Detached garage separation from the principal structure in Neighborhood Residential zones - 5 ft between structures containing floor area (3 ft in the rear setback)",
    applicableProjectType: "garage",
    applicableZone: "NR",
    ruleSpecification: {
      ruleType: "GARAGE_SEPARATION",
      inSetbackMinFt: 3,
      betweenStructuresMinFt: 5,
      drivewayAisleCapFt: 24,
      eaveProjectionFt: 2,
      mappingToleranceFt: 2,
      inSetbackCitation: "SMC 23.44.090.I.2.c",
      betweenCitation: "SMC 23.44.100.A",
      zoneNoun: "a Neighborhood Residential zone",
    },
    citation: { smcSections: ["SMC 23.44.100.A", "SMC 23.44.100.C", "SMC 23.44.090.I.2.c"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [MAPPED, EAVES_AND_POSITION, DRIVEWAY, NO_TERRACED],
    testCases: twoThresholdCases("NR"),
    isTestOnlyFixture: false,
  },
  {
    id: "garage-mf-separation-lr-mr-2026",
    subject: "Detached garage separation from the principal structure in Lowrise and Midrise zones - 5 ft between structures containing floor area (3 ft in a required setback)",
    applicableProjectType: "garage",
    applicableZone: "LR,MR",
    ruleSpecification: {
      ruleType: "GARAGE_SEPARATION",
      inSetbackMinFt: 3,
      betweenStructuresMinFt: 5,
      drivewayAisleCapFt: 24,
      eaveProjectionFt: 2,
      mappingToleranceFt: 2,
      inSetbackCitation: "SMC 23.45.518.H.1.d",
      betweenCitation: "SMC 23.45.519.A",
      zoneNoun: "a Lowrise or Midrise zone",
    },
    citation: { smcSections: ["SMC 23.45.519.A", "SMC 23.45.519.B", "SMC 23.45.518.H.1.d"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [MAPPED, EAVES_AND_POSITION, DRIVEWAY],
    testCases: [...twoThresholdCases("LR2 (M)"), tc("POSITIVE", "Midrise: 30 ft from the principal structure", { distanceToDwellingFt: 30 }, "KNOWN/PASS", "MR (M1)")],
    isTestOnlyFixture: false,
  },
  {
    id: "garage-mf-separation-hr-2026",
    subject: "Detached garage separation from the principal structure in Highrise zones - 3 ft from a principal structure for a garage in a required setback (no 5 ft rule)",
    applicableProjectType: "garage",
    applicableZone: "HR",
    ruleSpecification: {
      ruleType: "GARAGE_SEPARATION",
      inSetbackMinFt: 3,
      mappingToleranceFt: 2,
      inSetbackCitation: "SMC 23.45.518.H.1.d",
      zoneNoun: "a Highrise zone",
    },
    citation: { smcSections: ["SMC 23.45.518.H.1.d", "SMC 23.45.519.A"], ordinanceNumber: "127376", effectiveDateBasis: BASIS },
    caveats: [
      MAPPED,
      {
        category: "Highrise has no 5 ft between-structures rule",
        description: "SMC 23.45.519.A applies in LR and MR zones only. In a Highrise zone the only separation is the 3 ft from a principal structure for a garage standing in a required setback; a garage that is not in a required setback has no zoning separation requirement from this section.",
        affectedConditionOrInterpretation: "Whether any separation applies to a garage outside a required setback in a Highrise zone",
        sourceReferences: ["SMC 23.45.518.H.1.d", "SMC 23.45.519.A"],
        resolutionStatus: "Resolved by design - a short distance is a definite FAIL only when the garage is known to stand in a required setback.",
      },
    ],
    testCases: [
      tc("POSITIVE", "10 ft from the principal structure", { distanceToDwellingFt: 10 }, "KNOWN/PASS", "HR (M)"),
      tc("NEGATIVE", "0.5 ft from the principal structure and known to stand in a required setback", { distanceToDwellingFt: 0.5, isInRequiredSetback: true }, "KNOWN/FAIL", "HR (M)"),
      tc("EXCEPTION", "0.5 ft, outside every required setback: no separation rule applies by itself", { distanceToDwellingFt: 0.5, isInRequiredSetback: false }, "REQUIRES_VERIFICATION", "HR (M)"),
      tc("BOUNDARY", "4 ft: inside the tolerance of 3 ft", { distanceToDwellingFt: 4 }, "REQUIRES_VERIFICATION", "HR (M)"),
      tc("EXCEPTION", "no principal structure established", { distanceToDwellingFt: undefined, dwellingSeparationEvidenceGapReason: "No building was confirmed as the main house." }, "REQUIRES_VERIFICATION", "HR (M)"),
    ],
    isTestOnlyFixture: false,
  },
];

export const GARAGE_SEPARATION_FIXED_ROW_IDS: Record<string, string> = Object.fromEntries(garageSeparationCandidates.map((c) => [c.id, mfRowId(c.id)]));
