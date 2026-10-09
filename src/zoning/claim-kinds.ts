/**
 * What a rule's claim depends on (citywide zoning coverage, 2026-10-09). Pure.
 *
 *   ZONE_INDEPENDENT  the code answers the same way in every zone (building-permit exemptions, SDCI's critical-area permit
 *                     conditions, "an exemption is not zoning compliance"). The rule applies whatever the zoning is, so the
 *                     row's zone scope is not consulted. Rows of this kind written before citywide coverage still carry "NR".
 *   LOCATION          depends on the zone the proposed structure stands in (setbacks, height, separation, fence/deck placement)
 *   LOT               depends on the lot as a whole (lot coverage, floor area ratio, density, amenity area, tree requirements)
 *
 * Every rule type the platform can evaluate must be listed here: an unlisted type is treated as LOCATION (the cautious
 * default - it is only ever answered for a single, unambiguous zone), and a test fails the build when a known type is missing.
 */

export type ClaimKind = "ZONE_INDEPENDENT" | "LOCATION" | "LOT";

const ZONE_INDEPENDENT: string[] = [
  // Shed building-permit determination (Unit 6B)
  "SHED_PERMIT_P1_ROOF_AREA",
  "SHED_PERMIT_P2A_STORY_HEIGHT",
  "SHED_PERMIT_P3A_FOUNDATION_EXEMPTION",
  "SHED_PERMIT_P3B_FOUNDATION_STFI_DISQUALIFIER",
  "SHED_PERMIT_P4_ATTACHMENT",
  "SHED_PERMIT_P5_USE",
  "SHED_PERMIT_P6_ECA_CRITERION",
  "SHED_PERMIT_P7A_SIZE_SPAN_FOOTPRINT",
  "SHED_PERMIT_P7B_SIZE_SPAN_STRUCTURAL",
  "SHED_PERMIT_P9_EXEMPTION_NOT_ZONING_COMPLIANCE",
  // Fence building-permit determination (Unit 7)
  "FENCE_F5_PERMIT_HEIGHT_EXEMPTION",
  "FENCE_F6_PERMIT_MASONRY_CONCRETE",
  "FENCE_F7_EXEMPTION_NOT_ZONING_COMPLIANCE",
  "FENCE_F8_PERMIT_FLOOD_PRONE_CONDITION",
  // Deck building-permit determination (Unit 8)
  "DECK_D3_PERMIT_EXEMPTION",
  "DECK_D4_STFI_ELIGIBILITY",
  "DECK_D5_ECA_CONDITION",
  "DECK_D6_EXEMPTION_NOT_ZONING_COMPLIANCE",
];

const LOT: string[] = [
  "LOT_COVERAGE",
  "SHED_LOT_COVERAGE_C1A_BASE_MAXIMUM",
  "SHED_LOT_COVERAGE_C1B_ECA_LOT_AREA_EXCLUSION",
  "SHED_LOT_COVERAGE_C1C_TRANSIT_BONUS",
  "SHED_LOT_COVERAGE_C1D_STACKED_BONUS",
  "SHED_LOT_COVERAGE_C1E_MINIMUM_FLOOR",
  "SHED_LOT_COVERAGE_C1E_DIRECTOR_ALTERNATIVE",
  "SHED_LOT_COVERAGE_C2_ESTIMATE_CAVEAT",
  "DECK_D2_LOT_COVERAGE_THRESHOLD",
  "ADU_A1_COUNT_AND_DENSITY",
  "ADU_A6_LOT_COVERAGE",
  "ADU_A7_FLOOR_AREA_RATIO",
  "ADU_A8_AMENITY_AREA",
  "ADU_A9_TREES",
  "MF_FAR",
  "COMM_FAR_NOTE",
  "ADU_MF_COUNT",
  "ADU_MF_NO_LOT_COVERAGE_LIMIT",
  "ADU_MF_FAR",
  "ADU_MF_LANDSCAPING_NOTE",
  "DECK_MF_NO_LOT_COVERAGE_LIMIT",
];

const LOCATION: string[] = [
  "REAR_SETBACK",
  "SIDE_FRONT_SETBACK_STANDARD",
  "HEIGHT_LIMIT",
  "DWELLING_SEPARATION",
  "GARAGE_SEPARATION",
  "SHED_PERMIT_P2B1_ACCESSORY_HEIGHT_LIMIT_IN_SETBACK",
  "SHED_PERMIT_P2B2_ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK",
  "FENCE_F1_HEIGHT_LIMIT_STANDARD",
  "FENCE_F2_HEIGHT_LIMIT_FRONT_STREET_SIDE",
  "FENCE_F3_RETAINING_WALL",
  "FENCE_F4_OUTSIDE_REQUIRED_SETBACKS",
  "DECK_D1_SETBACK_HEIGHT_ALLOWANCE",
  "ADU_A2_SIZE_LIMIT",
  "ADU_A3_SETBACKS",
  "ADU_A4_SEPARATION",
  "ADU_A5_HEIGHT",
  "ADU_A10_DESIGN_STANDARDS",
  "ADU_A11_CONVERSION_OF_EXISTING_ACCESSORY_STRUCTURE",
  "ADU_A12_ATTACHED_TO_OR_INSIDE_HOUSE",
  // Multifamily (Chapter 23.45) accessory structures: shed and detached garage in LR, MR and HR zones
  "MF_ACC_SETBACKS",
  "MF_ACC_HEIGHT",
  "MF_ACC_SEPARATION",
  "MF_GARAGE_PARKING_ACCESS",
  // Neighborhood Commercial and Commercial (SMC Chapter 23.47A) accessory structures
  "COMM_ACC_SETBACKS",
  "COMM_ACC_HEIGHT",
  "COMM_GARAGE_PARKING_ACCESS",
];

/** Rule types of the generic inference-policy mechanism; they carry no zone claim of their own. */
const OTHER: Record<string, ClaimKind> = { REQUIRES_INFERENCE_POLICY: "LOCATION" };

const REGISTRY = new Map<string, ClaimKind>([
  ...ZONE_INDEPENDENT.map((t) => [t, "ZONE_INDEPENDENT"] as const),
  ...LOT.map((t) => [t, "LOT"] as const),
  ...LOCATION.map((t) => [t, "LOCATION"] as const),
  ...Object.entries(OTHER),
]);

export function claimKindOf(ruleType: string | undefined): ClaimKind {
  return (ruleType !== undefined ? REGISTRY.get(ruleType) : undefined) ?? "LOCATION";
}

export function isRegisteredRuleType(ruleType: string): boolean {
  return REGISTRY.has(ruleType);
}
