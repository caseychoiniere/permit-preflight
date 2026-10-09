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

const SHED_GARAGE_SETBACK: CoreClaim = { claim: "setbacks", anyOfRuleTypes: ["REAR_SETBACK", "SIDE_FRONT_SETBACK_STANDARD", "MF_ACC_SETBACKS"] };
const SHED_GARAGE_HEIGHT: CoreClaim = {
  claim: "height",
  anyOfRuleTypes: ["HEIGHT_LIMIT", "SHED_PERMIT_P2B1_ACCESSORY_HEIGHT_LIMIT_IN_SETBACK", "SHED_PERMIT_P2B2_ACCESSORY_HEIGHT_LIMIT_OUTSIDE_SETBACK", "MF_ACC_HEIGHT"],
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
    { claim: "dwelling-unit count and density", anyOfRuleTypes: ["ADU_A1_COUNT_AND_DENSITY"] },
    { claim: "setbacks", anyOfRuleTypes: ["ADU_A3_SETBACKS"] },
    { claim: "height", anyOfRuleTypes: ["ADU_A5_HEIGHT"] },
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
