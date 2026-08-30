/**
 * Existing-structure intelligence v1 (building intelligence v1 - NOT a generalized GIS
 * subsystem). Normalized shape for a real building footprint (Seattle Building Outlines 2023, see
 * seattle-building-outlines.ts) plus its dwelling classification.
 *
 * Classification strategy (founder correction, 2026-08-29): EXPLICIT USER CONFIRMATION only.
 * King County resbldg_extr (assessor data) is deliberately NOT integrated in this slice and is
 * NEVER a blocker - the original research recommendation to make it a classification prerequisite
 * was explicitly superseded. Classification is never inferred from footprint size or count
 * ("largest building wins" is explicitly excluded) - only an outline the user themselves pointed
 * to can ever become PRIMARY_DWELLING.
 *
 * "Fail closed on claims, not on customer journey": an unresolved classification is UNKNOWN,
 * never guessed, and never blocks the report - dwelling separation simply falls back to the
 * Regulatory Rules Engine's existing REQUIRES_VERIFICATION path (evaluate.ts's DWELLING_SEPARATION
 * case, unmodified).
 *
 * Deliberately the smallest shape that fits today's need (PRIMARY_DWELLING/UNKNOWN via
 * USER_CONFIRMED) while remaining extensible for later, NOT-YET-BUILT uses of the same footprint
 * geometry - lot coverage, existing-structure context, garages/additions/ADUs/decks, improved map
 * visualization. None of that is implemented here.
 */

import type { Polygon } from "../spatial-analysis/types.js";
import type { Provenance } from "./types.js";

/** One building footprint as returned by the source geometry dataset (Seattle Building Outlines
 * 2023) - geometry only, no structure identity. `outlineId` is that dataset's own OUTLINE_ID,
 * stringified - an internal identifier, never shown to the end user (see ParcelPlacementMap's
 * building-selection UX, which labels footprints in plain language instead). */
export interface RawBuildingFootprint {
  outlineId: string;
  parcelPin: string;
  footprint: Polygon;
  areaSqFt?: number;
}

export const StructureClassification = {
  PRIMARY_DWELLING: "PRIMARY_DWELLING",
  UNKNOWN: "UNKNOWN",
} as const;
export type StructureClassification = (typeof StructureClassification)[keyof typeof StructureClassification];

/** How a PRIMARY_DWELLING classification was reached. Only USER_CONFIRMED is produced by this
 * slice. AUTHORITATIVE/CORROBORATED are reserved names for a possible future assessor-data
 * enrichment (explicitly deferred - not built, not wired anywhere, not a blocker) so that future
 * work does not have to widen this type; nothing in this codebase constructs those values today. */
export const ClassificationBasis = {
  USER_CONFIRMED: "USER_CONFIRMED",
} as const;
export type ClassificationBasis = (typeof ClassificationBasis)[keyof typeof ClassificationBasis];

/** A footprint plus its classification - the normalized fact Spatial Analysis and the Rules
 * Engine wiring consume. `geometryProvenance` (City of Seattle Building Outlines 2023 - WHERE the
 * shape came from) and `classificationBasis` (USER_CONFIRMED - WHO said it's the dwelling) are
 * kept structurally distinct so the geometry source is never represented as having identified a
 * dwelling when it did not; only the user did. */
export interface ExistingStructure {
  outlineId: string;
  parcelPin: string;
  footprint: Polygon;
  areaSqFt?: number;
  classification: StructureClassification;
  classificationBasis?: ClassificationBasis;
  geometryProvenance: Provenance;
}

/** Structurally compatible with screening-request/types.ts's PrimaryDwellingSelection (this
 * module deliberately does not import that type directly, to keep property-intelligence's own
 * classification logic decoupled from the screening-request persistence shape) - `status` is kept
 * as a plain `string` rather than a literal union so callers can pass the real
 * PrimaryDwellingSelectionStatus enum value without a type-widening cast; the runtime check below
 * compares by value either way. */
export interface PrimaryDwellingSelectionInput {
  status: string;
  outlineId?: string;
}

/**
 * Joins the freshly-fetched footprints (server-side, authoritative - never a client-submitted
 * geometry) against the user's own selection (persisted on the ShedProjectConfiguration snapshot -
 * see screening-request/types.ts's PrimaryDwellingSelection) to produce the classified structure
 * list. Pure - no network/DB, directly unit-testable.
 *
 * Re-validates the selection against what was ACTUALLY fetched this time - never trusts a stale
 * or removed outlineId. If the selected outline is no longer present in the fresh fetch, this is a
 * genuine "cannot establish dwelling geometry" case: every footprint resolves to UNKNOWN, never
 * guessed or silently re-mapped to a different one.
 */
export function classifyExistingStructures(footprints: RawBuildingFootprint[], geometryProvenance: Provenance, selection: PrimaryDwellingSelectionInput | undefined): ExistingStructure[] {
  const selectedOutlineId = selection?.status === "SELECTED" ? selection.outlineId : undefined;
  const selectedExists = selectedOutlineId !== undefined && footprints.some((f) => f.outlineId === selectedOutlineId);

  return footprints.map((f) => {
    const isSelectedPrimary = selectedExists && f.outlineId === selectedOutlineId;
    return {
      ...f,
      geometryProvenance,
      classification: isSelectedPrimary ? StructureClassification.PRIMARY_DWELLING : StructureClassification.UNKNOWN,
      classificationBasis: isSelectedPrimary ? ClassificationBasis.USER_CONFIRMED : undefined,
    };
  });
}

/** Convenience for pipeline wiring - the single PRIMARY_DWELLING footprint, if the user's
 * selection matched a footprint actually returned this time; undefined otherwise (zero footprints,
 * the user selected UNKNOWN/nothing, or the selected outline no longer exists). */
export function findPrimaryDwelling(structures: ExistingStructure[]): ExistingStructure | undefined {
  return structures.find((s) => s.classification === StructureClassification.PRIMARY_DWELLING);
}
