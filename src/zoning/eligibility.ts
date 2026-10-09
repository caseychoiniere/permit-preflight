/**
 * Per-property purchase eligibility (citywide zoning coverage, 2026-10-09). Pure: given the project type, the property's zoning and the ACTIVE rules,
 * decide whether Permit Preflight can deliver the minimum useful report (zoning/core-claims.ts) - so a customer is never charged for a report that would
 * mostly say the applicable zoning rules are not supported. This replaces the former "Neighborhood Residential only" assumption: a property in any
 * zone is eligible once enough implemented coverage exists for that zone, and is never rejected permanently.
 *
 * The check runs per zone the project touches (the footprint's zones when a footprint is known, else the lot's): a lot split between a supported zone
 * and an unsupported one is eligible only when the footprint is known to stand in the supported part.
 */

import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { CORE_CLAIMS, PROJECT_NOUN_PLURAL } from "./core-claims.js";
import type { CoreProjectType } from "./core-claims.js";
import { singleZoneContext } from "./context.js";
import type { ZoningContext } from "./context.js";
import { ZONE_FAMILY_INFO } from "./designation.js";
import type { ZoningDesignation } from "./designation.js";
import { resolveApplicableRules } from "./resolve.js";

export type EligibilityCode = "ZONING_UNAVAILABLE" | "ZONING_UNRESOLVED" | "ZONE_NOT_YET_SUPPORTED";

export type PurchaseEligibility =
  | { eligible: true; zoneLabels: string[]; coveredClaims: string[]; unresolvedNotes: string[] }
  | { eligible: false; code: EligibilityCode; message: string; zoneLabels: string[]; missingClaims: string[]; retryable: boolean };

const ruleTypeOf = (r: RegulatoryRule): string | undefined => (r.ruleSpecification as { ruleType?: string }).ruleType;

function zoneName(d: ZoningDesignation): string {
  const info = ZONE_FAMILY_INFO[d.family];
  return d.family === "LR" || d.family === "NC" || d.family === "C" ? `${info.name} (${d.zoneCode})` : info.name;
}

export function evaluatePurchaseEligibility(input: { projectType: CoreProjectType; zoning: ZoningContext; activeRules: RegulatoryRule[] }): PurchaseEligibility {
  const { projectType } = input;
  const plural = PROJECT_NOUN_PLURAL[projectType];
  const resolution = resolveApplicableRules({ zoning: input.zoning, candidateRules: input.activeRules });

  if (!input.zoning.available) {
    return {
      eligible: false,
      code: "ZONING_UNAVAILABLE",
      message: "Seattle's zoning data could not be read for this property just now, so Permit Preflight cannot tell whether it can screen this project. Nothing was charged; please try again in a few minutes.",
      zoneLabels: [],
      missingClaims: [],
      retryable: true,
    };
  }
  // No zoning at all that can be applied (a data gap, an unrecognized designation, a Major Institution Overlay): the claims depend on a zone we cannot name.
  const zones = resolution.locationZones.length > 0 ? resolution.locationZones : resolution.lotZones;
  if (resolution.status === "UNRESOLVED" || zones.length === 0) {
    return {
      eligible: false,
      code: "ZONING_UNRESOLVED",
      message: `Permit Preflight cannot apply this property's zoning (${resolution.reason ?? "the zoning could not be determined"}), so it cannot yet screen ${plural} here. Nothing was charged.`,
      zoneLabels: input.zoning.lotZones.map((z) => z.designation.raw),
      missingClaims: [],
      retryable: false,
    };
  }

  const core = CORE_CLAIMS[projectType];
  const missingByZone: { zone: ZoningDesignation; missing: string[] }[] = [];
  for (const zone of zones) {
    const perZone = resolveApplicableRules({ zoning: singleZoneContext(zone.raw), candidateRules: input.activeRules });
    const types = new Set(perZone.rules.map(ruleTypeOf));
    const missing = core.filter((c) => !c.anyOfRuleTypes.some((t) => types.has(t))).map((c) => c.claim);
    if (missing.length > 0) missingByZone.push({ zone, missing });
  }
  if (missingByZone.length > 0) {
    const first = missingByZone[0]!;
    const named = missingByZone.map((m) => `${m.zone.raw} (${zoneName(m.zone)})`).join(" and ");
    return {
      eligible: false,
      code: "ZONE_NOT_YET_SUPPORTED",
      message: `Seattle zoning data maps this property as ${named}. Permit Preflight cannot yet screen ${plural} against the ${zoneName(first.zone)} zone standards (${first.missing.join(", ")}), so a report for this property would mostly say that. Nothing was charged.`,
      zoneLabels: zones.map((z) => z.raw),
      missingClaims: [...new Set(missingByZone.flatMap((m) => m.missing))],
      retryable: false,
    };
  }

  const notes: string[] = [];
  if (resolution.status === "AMBIGUOUS") notes.push("The property or the proposed structure is in more than one zone; claims whose standards differ between them will be listed for verification.");
  return { eligible: true, zoneLabels: zones.map((z) => z.raw), coveredClaims: core.map((c) => c.claim), unresolvedNotes: notes };
}
