/**
 * Zone-aware rule resolution (citywide zoning coverage, 2026-10-09). Pure and centralized.
 *
 *   resolveApplicableRules({ projectType, zoning, candidateRules }) -> ZoningResolution
 *
 * answers, for one project in one zoning context: which ACTIVE rules govern each claim, and which claims cannot be settled
 * because the standards differ between the zones the project touches. Evaluators receive `resolution.rules` (never the
 * unfiltered table) and render `resolution.ambiguousClaims` as REQUIRES_VERIFICATION, so the zone logic lives here and
 * nowhere else.
 *
 * Which zones a claim is answered against follows what the claim depends on (claim-kinds.ts):
 *   - a LOCATION claim (setback, height, separation, fence/deck placement) uses the zones under the proposed FOOTPRINT when
 *     the project has one and its zoning is known; otherwise the zones on the LOT;
 *   - a LOT claim (lot coverage, floor area ratio, amenity area, density) uses the zones on the LOT, because those
 *     standards are written for the lot as a whole (SMC 23.45.508.G applies each zone's standards in that zone and treats a
 *     lot-area standard on a split lot by the contiguous area in the corresponding zone - not resolvable from the mapping);
 *   - a ZONE_INDEPENDENT claim (building-permit exemptions) applies whatever the zoning.
 * A rule type is "settled" only when every zone the claim touches resolves it to the same single row. No majority zone is
 * ever chosen.
 */

import { LifecycleState } from "../regulatory-rule-governance/types.js";
import type { RegulatoryRule } from "../regulatory-rule-governance/types.js";
import { claimKindOf } from "./claim-kinds.js";
import { hasAnyOverlay } from "./context.js";
import type { OverlayFlags, ZoneShare, ZoningContext } from "./context.js";
import { ZoneFamily } from "./designation.js";
import type { ZoningDesignation } from "./designation.js";
import { parseZoneScope, zoneInScope } from "./scope.js";

export type ZoningStatus = "RESOLVED" | "AMBIGUOUS" | "UNRESOLVED";

export interface AmbiguousClaim {
  ruleType: string;
  /** Subject of one of the rows involved, for the customer-facing sentence. */
  subject: string;
  kind: "LOCATION" | "LOT";
  /** Why the claim cannot be settled: the zones involved resolve it differently, or the zoning needed is unknown. */
  reason: string;
  byZone: { zone: string; rule?: string }[];
}

export interface ZoningResolution {
  status: ZoningStatus;
  /** Why no zoning can be applied at all (status UNRESOLVED). */
  reason?: string;
  /** Designations the LOCATION claims were resolved against, as published, largest share first; empty when unknown. */
  locationZones: ZoningDesignation[];
  /** Designations on the lot (empty when unknown). */
  lotZones: ZoningDesignation[];
  /** Where the location claims' zoning came from. */
  basis: "PROJECT_FOOTPRINT" | "LOT";
  /** The one designation the LOCATION standards come from; undefined when the location zones disagree or are unknown. */
  governing?: ZoningDesignation;
  footprintCrossesZones: boolean;
  lotHasMultipleDesignations: boolean;
  /** ACTIVE rules that apply unambiguously; this is the only rule list an evaluator may use. */
  rules: RegulatoryRule[];
  ambiguousClaims: AmbiguousClaim[];
  /** Rule types for which two rows claim the same zone (an authoring defect): excluded, fail closed. */
  conflictingRuleTypes: string[];
  overlays: OverlayFlags;
  /** The project type's families on the location zones, for expected-coverage decisions. */
  locationFamilies: ZoneFamily[];
}

export interface ResolveInput {
  zoning: ZoningContext;
  candidateRules: RegulatoryRule[];
}

function ruleTypeOf(rule: RegulatoryRule): string | undefined {
  return (rule.ruleSpecification as { ruleType?: string }).ruleType;
}

/** An ordinary, interpretable designation: a known family, no parse problem, no Major Institution Overlay. */
export function interpretabilityProblem(d: ZoningDesignation): string | undefined {
  if (d.family === ZoneFamily.UNKNOWN || d.parseProblem !== undefined) return `Seattle's zoning data shows a designation Permit Preflight does not recognize (${d.raw})`;
  if (d.majorInstitutionOverlay) return `the property is within a Major Institution Overlay (${d.raw}), which has its own standards`;
  return undefined;
}

function zonesOf(shares: ZoneShare[]): ZoningDesignation[] {
  const seen = new Set<string>();
  const out: ZoningDesignation[] = [];
  for (const s of [...shares].sort((a, b) => b.fraction - a.fraction)) {
    if (seen.has(s.designation.raw)) continue;
    seen.add(s.designation.raw);
    out.push(s.designation);
  }
  return out;
}

function firstProblem(zones: ZoningDesignation[]): string | undefined {
  for (const z of zones) {
    const p = interpretabilityProblem(z);
    if (p) return p;
  }
  return undefined;
}

export function resolveApplicableRules(input: ResolveInput): ZoningResolution {
  const { zoning } = input;
  const active = input.candidateRules.filter((r) => r.lifecycleState === LifecycleState.ACTIVE);
  const overlays = zoning.overlays;

  // ---- which zones answer which kind of claim -------------------------------------------------------------------------
  const lotAll = zonesOf(zoning.lotZones);
  let lotProblem: string | undefined;
  if (!zoning.available) lotProblem = zoning.unavailableReason ?? "Seattle's zoning data was not available for this evaluation";
  else if (zoning.lotGap) lotProblem = zoning.lotGap;
  else if (lotAll.length === 0) lotProblem = "no zone was found for the property";
  else lotProblem = firstProblem(lotAll);
  const lotZoneSet = lotProblem === undefined ? lotAll : undefined;

  const footprintAll = zoning.footprintZones ? zonesOf(zoning.footprintZones) : undefined;
  let locationZoneSet: ZoningDesignation[] | undefined;
  let basis: ZoningResolution["basis"] = "LOT";
  let locationProblem: string | undefined;
  if (footprintAll && footprintAll.length > 0) {
    locationProblem = firstProblem(footprintAll);
    if (locationProblem === undefined) {
      locationZoneSet = footprintAll;
      basis = "PROJECT_FOOTPRINT";
    }
  } else {
    // No usable footprint zoning (declared project, or the footprint lookup failed): answer against the lot's zones.
    locationProblem = lotProblem;
    locationZoneSet = lotZoneSet;
  }

  const unresolvedReason = locationZoneSet === undefined && lotZoneSet === undefined ? (locationProblem ?? lotProblem ?? "the zoning could not be determined") : undefined;

  const base = {
    locationZones: locationZoneSet ?? [],
    lotZones: lotZoneSet ?? [],
    basis,
    footprintCrossesZones: basis === "PROJECT_FOOTPRINT" && (locationZoneSet?.length ?? 0) > 1,
    lotHasMultipleDesignations: lotAll.length > 1,
    overlays,
    locationFamilies: [...new Set((locationZoneSet ?? []).map((z) => z.family))],
  };

  // ---- resolve claim by claim ----------------------------------------------------------------------------------------
  const byType = new Map<string, RegulatoryRule[]>();
  for (const r of active) {
    const t = ruleTypeOf(r);
    if (!t) continue;
    byType.set(t, [...(byType.get(t) ?? []), r]);
  }

  const rules: RegulatoryRule[] = [];
  const ambiguousClaims: AmbiguousClaim[] = [];
  const conflictingRuleTypes: string[] = [];
  let locationAmbiguous = false;

  for (const [ruleType, rows] of byType) {
    const kind = claimKindOf(ruleType);
    if (kind === "ZONE_INDEPENDENT") {
      if (rows.length > 1) conflictingRuleTypes.push(ruleType);
      else rules.push(rows[0]!);
      continue;
    }
    const zoneSet = kind === "LOT" ? lotZoneSet : locationZoneSet;
    if (!zoneSet) {
      // The zoning this kind of claim needs is unknown. Only claims that could apply to some zone matter; every row's own scope is unknown here.
      ambiguousClaims.push({
        ruleType,
        subject: rows[0]!.subject,
        kind,
        reason: (kind === "LOT" ? lotProblem : locationProblem) ?? "the zoning needed for this claim is not known",
        byZone: [],
      });
      if (kind === "LOCATION") locationAmbiguous = true;
      continue;
    }
    const signatures: { zone: ZoningDesignation; row?: RegulatoryRule }[] = [];
    let conflict = false;
    for (const zone of zoneSet) {
      const matching = rows.filter((r) => zoneInScope(parseZoneScope(r.applicableZone), zone));
      if (matching.length > 1) {
        conflict = true;
        break;
      }
      signatures.push({ zone, ...(matching[0] ? { row: matching[0] } : {}) });
    }
    if (conflict) {
      conflictingRuleTypes.push(ruleType);
      continue;
    }
    const ids = new Set(signatures.map((s) => s.row?.id ?? "NONE"));
    if (ids.size === 1) {
      const row = signatures[0]!.row;
      if (row) rules.push(row);
      continue;
    }
    ambiguousClaims.push({
      ruleType,
      subject: (signatures.find((s) => s.row)?.row ?? rows[0]!).subject,
      kind,
      reason: "the zones involved have different standards for this claim",
      byZone: signatures.map((s) => ({ zone: s.zone.raw, ...(s.row ? { rule: s.row.subject } : {}) })),
    });
    if (kind === "LOCATION") locationAmbiguous = true;
  }

  const governing = locationZoneSet && !locationAmbiguous ? locationZoneSet[0] : undefined;
  const status: ZoningStatus = unresolvedReason !== undefined ? "UNRESOLVED" : ambiguousClaims.length > 0 || (locationZoneSet?.length ?? 0) > 1 && !governing ? "AMBIGUOUS" : "RESOLVED";

  return {
    status,
    ...(unresolvedReason !== undefined ? { reason: unresolvedReason } : {}),
    ...base,
    ...(governing ? { governing } : {}),
    rules,
    ambiguousClaims,
    conflictingRuleTypes,
  };
}

/** Compact, persistable description of the zoning a screening applied (evidence for the report and for audit). */
export interface ZoningAppliedSummary {
  status: ZoningStatus;
  reason?: string;
  basis: "PROJECT_FOOTPRINT" | "LOT";
  locationZones: string[];
  lotZones: string[];
  governing?: string;
  governingFamily?: string;
  footprintCrossesZones: boolean;
  lotHasMultipleDesignations: boolean;
  appliedRules: { id: string; ruleType: string; subject: string }[];
  ambiguousClaims: { ruleType: string; kind: "LOCATION" | "LOT"; byZone: { zone: string; rule?: string }[]; reason: string }[];
  conflictingRuleTypes: string[];
}

export function summarizeZoningResolution(r: ZoningResolution): ZoningAppliedSummary {
  return {
    status: r.status,
    ...(r.reason !== undefined ? { reason: r.reason } : {}),
    basis: r.basis,
    locationZones: r.locationZones.map((z) => z.raw),
    lotZones: r.lotZones.map((z) => z.raw),
    ...(r.governing ? { governing: r.governing.raw, governingFamily: r.governing.family } : {}),
    footprintCrossesZones: r.footprintCrossesZones,
    lotHasMultipleDesignations: r.lotHasMultipleDesignations,
    appliedRules: r.rules.map((rule) => ({ id: rule.id, ruleType: ruleTypeOf(rule) ?? "", subject: rule.subject })),
    ambiguousClaims: r.ambiguousClaims.map((c) => ({ ruleType: c.ruleType, kind: c.kind, byZone: c.byZone, reason: c.reason })),
    conflictingRuleTypes: r.conflictingRuleTypes,
  };
}

export { hasAnyOverlay };
