/**
 * The minimum useful report contract (citywide zoning coverage, 2026-10-09). For each project type, the zone-specific claims a paid report must be
 * able to make before Permit Preflight takes payment. A claim is covered for a zone when an ACTIVE rule of one of its rule types governs that zone
 * (zoning/resolve.ts). Checkout is allowed when every core claim is covered for every zone the project touches, even if some findings in the report
 * remain REQUIRES_VERIFICATION; it is blocked when the report would mostly say "we do not support the applicable zoning rules".
 *
 * Zone-independent determinations (the building-permit exemption analysis) are real value but are NOT a substitute for the zone-specific claims, so
 * they are not listed here: a report that can only say whether a permit is needed, and nothing about setbacks or height in the zone, is not what
 * the customer is buying.
 */

export type CoreProjectType = "shed" | "garage" | "fence" | "deck" | "adu";

export interface CoreClaim {
  /** Customer-facing name of the claim. */
  claim: string;
  /** Covered when ANY of these rule types is ACTIVE for the zone. */
  anyOfRuleTypes: string[];
}

const SHED_GARAGE_SETBACK: CoreClaim = { claim: "setbacks", anyOfRuleTypes: ["REAR_SETBACK", "SIDE_FRONT_SETBACK_STANDARD", "MF_ACC_SETBACKS", "COMM_ACC_SETBACKS"] };
const SHED_GARAGE_HEIGHT: CoreClaim = {
  claim: "height",
  anyOfRuleTypes: ["HEIGHT_LIMIT", "SHED_PERMIT_P2B1_ACCESSORY_HEIGHT_LIMIT_IN_SETBACK", "SHED_PERMIT_P2B2_ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK", "MF_ACC_HEIGHT", "COMM_ACC_HEIGHT"],
};

export const CORE_CLAIMS: Record<CoreProjectType, CoreClaim[]> = {
  shed: [SHED_GARAGE_SETBACK, SHED_GARAGE_HEIGHT],
  garage: [SHED_GARAGE_SETBACK, SHED_GARAGE_HEIGHT],
  fence: [
    { claim: "fence height in a side or rear setback", anyOfRuleTypes: ["FENCE_F1_HEIGHT_LIMIT_STANDARD"] },
    { claim: "fence height in a front or street-side setback", anyOfRuleTypes: ["FENCE_F2_HEIGHT_LIMIT_FRONT_STREET_SIDE"] },
  ],
  deck: [{ claim: "deck setback allowance", anyOfRuleTypes: ["DECK_D1_SETBACK_HEIGHT_ALLOWANCE"] }],
  adu: [
    { claim: "dwelling-unit count and density", anyOfRuleTypes: ["ADU_A1_COUNT_AND_DENSITY", "ADU_MF_COUNT"] },
    { claim: "setbacks", anyOfRuleTypes: ["ADU_A3_SETBACKS", "ADU_COMM_SETBACKS"] },
    { claim: "height", anyOfRuleTypes: ["ADU_A5_HEIGHT", "ADU_COMM_HEIGHT"] },
  ],
};

export function isCoreProjectType(t: string | null | undefined): t is CoreProjectType {
  return t === "shed" || t === "garage" || t === "fence" || t === "deck" || t === "adu";
}

export const PROJECT_NOUN_PLURAL: Record<CoreProjectType, string> = {
  shed: "sheds",
  garage: "detached garages",
  fence: "fences",
  deck: "decks",
  adu: "accessory dwelling units",
};


/**
 * Combinations the governing code makes genuinely inapplicable. NOT_APPLICABLE is never "not built yet": each entry cites the code and was read in the source
 * (2026-10-09). The ADU entry follows SMC 23.42.022.A ("allowed as a housing use in all zones where housing uses are allowed").
 */
export interface NotApplicableDeclaration {
  projectType: CoreProjectType;
  /** Matches the designation's zone code. */
  zoneCode: string;
  reason: string;
  citation: string;
}
export const NOT_APPLICABLE: NotApplicableDeclaration[] = [
  {
    projectType: "adu",
    zoneCode: "IB",
    reason: "Residential uses are prohibited in the Industrial Buffer zone except artist's studio/dwellings and caretaker's quarters, and an accessory dwelling unit is allowed only where housing uses are allowed",
    citation: "SMC 23.50.012 Table A (J.1-J.3); SMC 23.42.022.A",
  },
  // Chapter 23.50A (Maritime Manufacturing and Logistics, Industrial Innovation, Industrial Commercial): Table A row J. "Residential uses not listed below" is prohibited (X); the only
  // exceptions are artist's studio/dwellings (EB/CU or X) and caretaker's quarters (P). Housing is not a permitted use, so an ADU (a housing use, SMC 23.42.022.A-B) cannot be
  // established. Urban Industrial (UI) is NOT listed: residential uses there are conditional uses (CU), a different situation that is not yet supported rather than inapplicable.
  ...(["MML", "II", "IC"] as const).map(
    (zoneCode): NotApplicableDeclaration => ({
      projectType: "adu",
      zoneCode,
      reason: "Residential uses are prohibited in this Industrial zone except artist's studio/dwellings and caretaker's quarters, and an accessory dwelling unit is allowed only where housing uses are allowed",
      citation: "SMC 23.50A.040 Table A (J.1-J.3); SMC 23.42.022.A",
    })
  ),
];
