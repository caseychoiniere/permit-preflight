/**
 * Customer-facing zoning findings (citywide zoning coverage, 2026-10-09). Pure. One place produces the wording that tells the
 * customer which zoning a screening applied, so the report names the real designation instead of a generic "not NR" message.
 */

import { FindingClassification } from "../regulatory-rules-engine/types.js";
import type { Finding } from "../regulatory-rules-engine/types.js";
import { hasAnyOverlay } from "./context.js";
import type { OverlayFlags } from "./context.js";
import { ZONE_FAMILY_INFO, ZoneFamily } from "./designation.js";
import type { ZoningDesignation } from "./designation.js";
import type { ZoningResolution } from "./resolve.js";

export const ZONING_SUBJECT = "Zoning applied to this screening";
export const C2_USE_SUBJECT = "Residential use in a Commercial 2 zone";
export const OVERLAY_SUBJECT = "Overlay districts (shoreline, historic, landmark)";

const MAPPING_CAVEAT = "That data is general mapping, not a legal determination; SDCI confirms the zone.";

function familyPhrase(d: ZoningDesignation): string {
  const info = ZONE_FAMILY_INFO[d.family];
  const code = d.family === ZoneFamily.NR || d.family === ZoneFamily.MASTER_PLANNED ? "" : ` (${d.zoneCode})`;
  switch (d.family) {
    case ZoneFamily.LR:
      return `Lowrise${code}`;
    case ZoneFamily.MR:
    case ZoneFamily.HR:
      return info.name;
    default:
      return `${info.name}${code}`;
  }
}

function designationNotes(d: ZoningDesignation): string[] {
  const notes: string[] = [];
  if (d.unrecognizedSuffixes.length > 0) {
    notes.push(
      `The designation carries a suffix (${d.unrecognizedSuffixes.map((s) => `"${s}"`).join(", ")}) that Permit Preflight does not interpret; it can change floor-area and height limits, so claims that depend on it are not made.`
    );
  }
  if (d.residentialCommercial) {
    notes.push(
      "The RC (Residential-Commercial) designation concerns commercial uses; a development without a commercial use is regulated by the standards of the underlying residential zone (SMC 23.46.002.B), which is what this screening applies."
    );
  }
  return notes;
}

function list(zones: ZoningDesignation[]): string {
  const raws = zones.map((z) => z.raw);
  if (raws.length <= 1) return raws.join("");
  return `${raws.slice(0, -1).join(", ")} and ${raws[raws.length - 1]}`;
}

export interface ZoningFindingOptions {
  /** "detached garage", "shed", "fence", "deck", "accessory dwelling unit" */
  projectNoun: string;
  /** Customer label for a rule type's claim (e.g. "Setbacks"). */
  claimLabel: (ruleType: string, fallbackSubject: string) => string;
  /** True when no rule at all is active for the governing zone's family (the report is mostly unscreened). */
  noRulesForZone?: boolean;
}

function buildOverlayFinding(o: OverlayFlags): Finding | undefined {
  if (!hasAnyOverlay(o)) return undefined;
  const parts: string[] = [];
  if (o.shorelineDistrict) parts.push("a Shoreline District (the Shoreline Master Program, SMC 23.60A, applies)");
  if (o.historicDistrict) parts.push("a historic or special review district");
  if (o.landmarkParcel) parts.push("a designated landmark (Landmarks Preservation Board review applies)");
  for (const label of o.overlayLabels) parts.push(`the "${label}" overlay`);
  return {
    classification: FindingClassification.REQUIRES_VERIFICATION,
    subject: OVERLAY_SUBJECT,
    supportingEvidence: parts,
    explanationBasis: `Seattle's data shows this property is in or is: ${parts.join("; ")}. Additional or different rules can apply there; Permit Preflight does not evaluate them. SDCI determines which apply.`,
  };
}

/** The zoning finding(s) for a resolution: which zoning was applied, or exactly what is unresolved. */
export function zoningFindings(resolution: ZoningResolution, opts: ZoningFindingOptions): Finding[] {
  const out: Finding[] = [];
  const noun = opts.projectNoun;

  if (resolution.status === "UNRESOLVED") {
    out.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: ZONING_SUBJECT,
      supportingEvidence: ["parcel zoning not verified"],
      explanationBasis: `Permit Preflight could not apply this property's zoning (${resolution.reason ?? "the zoning could not be determined"}), so it makes no zone-specific conclusions about the proposed ${noun}. Questions that do not depend on the zone, such as building-permit exemptions, are still answered. SDCI determines the applicable zone and rules.`,
    });
  } else if (resolution.status === "AMBIGUOUS") {
    const where = resolution.footprintCrossesZones
      ? `the proposed ${noun} would stand in more than one zone (${list(resolution.locationZones)})`
      : resolution.locationZones.length > 1
        ? `this property is in more than one zone (${list(resolution.locationZones)})`
        : `this property has more than one zoning designation (${list(resolution.lotZones)})`;
    const claims = [...new Set(resolution.ambiguousClaims.map((c) => opts.claimLabel(c.ruleType, c.subject)))];
    out.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: ZONING_SUBJECT,
      supportingEvidence: [`zoning=${list([...new Set([...resolution.locationZones, ...resolution.lotZones])])}`, `basis=${resolution.basis}`],
      explanationBasis: `Seattle zoning data shows ${where}. Permit Preflight evaluates a claim only where every zone involved has the same standard, and it does not choose between zones. ${
        claims.length > 0 ? `The standards differ for: ${claims.join("; ")}. Those are left for SDCI to confirm.` : "Claims whose standards are the same in each zone are evaluated normally."
      } ${MAPPING_CAVEAT}`,
    });
  } else {
    const d = resolution.governing ?? resolution.locationZones[0]!;
    const sameStandards = resolution.locationZones.filter((z) => z.raw !== d.raw);
    const mapped = sameStandards.length > 0 ? `${d.raw} (and ${list(sameStandards)}, which carry the same standards for this screening)` : d.raw;
    const standards = d.family === ZoneFamily.NR ? "Neighborhood Residential (NR) standards" : `${familyPhrase(d)} standards`;
    const lotNote =
      resolution.basis === "PROJECT_FOOTPRINT" && resolution.lotHasMultipleDesignations
        ? ` This property has more than one zoning designation (${list(resolution.lotZones)}); the proposed ${noun} stands in the ${d.raw} part, and standards written for the lot as a whole are noted separately.`
        : "";
    const coverageNote = opts.noRulesForZone
      ? ` Permit Preflight does not yet have active rules for these standards, so the zoning limits below are listed as not yet automatically screenable.`
      : "";
    out.push({
      classification: FindingClassification.KNOWN,
      subject: ZONING_SUBJECT,
      supportingEvidence: [`zoning=${d.raw}`, `zoneFamily=${d.family}`, `basis=${resolution.basis}`],
      explanationBasis: `Seattle zoning data maps this property as ${mapped}. This screening applies the ${standards} relevant to the proposed ${noun} (SMC Chapter ${ZONE_FAMILY_INFO[d.family].chapter}).${lotNote}${coverageNote} ${[...designationNotes(d), MAPPING_CAVEAT].join(" ")}`,
    });
  }

  // Commercial 2: the standards for these structures are the chapter's (SMC 23.47A), but residential use is only a conditional use there (23.47A.004 Table A), so a house
  // and its accessory structures may be a conditional use, a legal nonconforming use (whose expansion is limited, SMC 23.42.100-.112) or neither: not checked.
  // Whenever ANY zone involved is C2 - a single-zone lot, a split lot, an ambiguous or unresolved one - the customer is told.
  if ([...resolution.lotZones, ...resolution.locationZones].some((z) => z.zoneCode === "C2")) {
    out.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: C2_USE_SUBJECT,
      supportingEvidence: ["zoneCode=C2"],
      explanationBasis: `In a Commercial 2 (C2) zone residential uses are conditional uses (SMC 23.47A.004 Table A). The standards screened here for the proposed ${noun} are those of Chapter 23.47A, but Permit Preflight does not check whether a dwelling on this property was approved as a conditional use or is a legal nonconforming use (whose expansion is limited, SMC 23.42.100-23.42.112), which can affect whether a new accessory structure is allowed. SDCI confirms this.`,
    });
  }

  const overlay = buildOverlayFinding(resolution.overlays);
  if (overlay) out.push(overlay);
  return out;
}

/** One REQUIRES_VERIFICATION finding per claim the resolver could not settle, naming the zones involved. */
export function ambiguousClaimFindings(resolution: ZoningResolution, opts: Pick<ZoningFindingOptions, "claimLabel" | "projectNoun">): Finding[] {
  if (resolution.status === "UNRESOLVED") return [];
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const c of resolution.ambiguousClaims) {
    const label = opts.claimLabel(c.ruleType, c.subject);
    if (seen.has(label)) continue;
    seen.add(label);
    const zones = c.byZone.length > 0 ? c.byZone.map((z) => `${z.zone}: ${z.rule ?? "no active rule"}`).join("; ") : c.reason;
    if (c.conflict) {
      out.push({
        classification: FindingClassification.REQUIRES_VERIFICATION,
        subject: label,
        supportingEvidence: [`ruleType=${c.ruleType}`],
        explanationBasis: `Permit Preflight could not apply its own rules to this standard (${c.reason}), so it makes no statement about it. This is left for SDCI to confirm.`,
      });
      continue;
    }
    out.push({
      classification: FindingClassification.REQUIRES_VERIFICATION,
      subject: label,
      supportingEvidence: c.byZone.map((z) => `zone=${z.zone}`),
      explanationBasis: `${c.kind === "LOT" ? "This standard is written for the property as a whole" : `This standard depends on the zone the proposed ${opts.projectNoun} stands in`}, and ${c.byZone.length > 0 ? `the zones involved have different standards (${zones})` : `the zoning needed to apply it is not known (${zones})`}. Permit Preflight does not choose between them, so this is left for SDCI to confirm.`,
    });
  }
  return out;
}
