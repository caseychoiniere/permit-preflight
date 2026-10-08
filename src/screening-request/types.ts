/**
 * Screening Request domain types (Functional Design domain-entities.md). EXISTING_PROPERTY is the
 * only WorkflowType exercised through Unit 4; ProjectType now covers both shed (Unit 2) and
 * garage (Unit 4).
 */

import { z } from "zod";
import type { GeographicPoint } from "../spatial-analysis/types.js";

export const LotLineRoleStatus = {
  ASSIGNED: "ASSIGNED",
  INSUFFICIENT: "INSUFFICIENT",
} as const;
export type LotLineRoleStatus = (typeof LotLineRoleStatus)[keyof typeof LotLineRoleStatus];

/**
 * Maintenance correction (2026-09-15, founder direction) - Seattle distinguishes an ORDINARY
 * interior side lot line from a SIDE STREET lot line (a corner lot's additional street frontage),
 * and the two may carry different regulatory setback treatment. This answer is REQUIRED (no
 * default) whenever `status` is ASSIGNED - never silently inferred from an unanswered/unchecked
 * control, which would be indistinguishable from a genuine "No." See `streetFrontageEdgeRefs`
 * below for which edges YES applies to.
 */
export const MultipleFrontageAnswer = {
  YES: "YES",
  NO: "NO",
  NOT_SURE: "NOT_SURE",
} as const;
export type MultipleFrontageAnswer = (typeof MultipleFrontageAnswer)[keyof typeof MultipleFrontageAnswer];

/** Front/rear/side roles are never inferred from polygon shape alone (BR-U2-9) - this is always
 * produced from an explicit user indication (method: USER_INDICATED, the only method Unit 2
 * implements) or is INSUFFICIENT (fail-closed).
 *
 * Maintenance correction (2026-09-15, founder direction) - `sideEdgeRefs` remains every edge that
 * is neither front nor rear (the full geometric side-candidate set, for ANY polygon shape - no
 * rectangle/opposite/four-edge requirement). `streetFrontageEdgeRefs` is a separate, optional
 * SUBSET of `sideEdgeRefs` the customer has explicitly confirmed faces an additional public
 * street (a corner lot's second frontage) - support for zero, one, or several such edges, never
 * hard-coded to exactly one. Every edge in `sideEdgeRefs` that is NOT in `streetFrontageEdgeRefs`
 * is an ORDINARY_SIDE edge. `multipleFrontageAnswer` is required (no default) once ASSIGNED;
 * `streetFrontageEdgeRefs` is only ever non-empty when the answer is YES.
 *
 * Maintenance correction (2026-09-17, founder-directed through-lot fix) - `streetFrontageEdgeRefs`
 * can only ever reference `sideEdgeRefs` entries (see the schema's subset check below), which
 * structurally EXCLUDES the customer's own rear pick. That left no way to record the one fact SMC
 * 23.44.090.B's through-lot rule actually turns on: whether the customer's OWN rear line is ALSO a
 * street (the ordinary, expected way a real through lot presents - the customer typically clicks
 * their far/opposite edge as "rear," not as an "additional side street"). `rearAlsoFacesStreet` is
 * that separate, minimal signal - only meaningful (and only ever true) when `multipleFrontageAnswer`
 * is YES. It is deliberately NOT folded into `streetFrontageEdgeRefs`: rear is a single,
 * already-uniquely-identified edge, not a multi-select side candidate, and keeping it out preserves
 * the existing `streetFrontageEdgeRefs ⊆ sideEdgeRefs` invariant untouched. */
export interface LotLineRoleAssignment {
  status: LotLineRoleStatus;
  frontEdgeRef?: string;
  rearEdgeRef?: string;
  sideEdgeRefs?: string[];
  multipleFrontageAnswer?: MultipleFrontageAnswer;
  streetFrontageEdgeRefs?: string[];
  rearAlsoFacesStreet?: boolean;
  method: "USER_INDICATED";
  indicatedBy?: string;
  indicatedAt?: string;
}

/**
 * The user's placement gesture, submitted exactly as the browser/MapLibre produced it - WGS84
 * (EPSG:4326) longitude/latitude, never locally reprojected or approximated (Code Generation CRS
 * correction, 2026-08-23). `orientationDeg` is unitless (degrees of rotation), not affected by
 * CRS. The server is the only place this ever becomes a projected/feet-based coordinate, via
 * PostGIS's ST_Transform (spatial-analysis/postgis-adapter.ts) - never via application-level math.
 */
export interface ProposedPlacement {
  anchor: GeographicPoint;
  orientationDeg: number;
}

export const DistanceInputMode = {
  MAP_PLACEMENT: "MAP_PLACEMENT",
  MANUAL_FALLBACK: "MANUAL_FALLBACK",
} as const;
export type DistanceInputMode = (typeof DistanceInputMode)[keyof typeof DistanceInputMode];

/** Building intelligence v1 (founder correction, 2026-08-29) - which building footprint (if any)
 * the property owner confirmed is the primary dwelling, captured the same way LotLineRoleAssignment
 * captures front/rear (an explicit user indication, never inferred from footprint size/count).
 * SELECTED carries the chosen footprint's `outlineId` (Seattle Building Outlines 2023's own id -
 * re-validated server-side against a fresh fetch before ever being trusted, never taken on faith
 * from the client). UNKNOWN covers every case where no dwelling was established - zero footprints
 * existed, the user could not tell which one it was, or the user declined - all resolve the same
 * way downstream (dwelling separation becomes REQUIRES_VERIFICATION, never a blocked report). */
export const PrimaryDwellingSelectionStatus = {
  SELECTED: "SELECTED",
  UNKNOWN: "UNKNOWN",
} as const;
export type PrimaryDwellingSelectionStatus = (typeof PrimaryDwellingSelectionStatus)[keyof typeof PrimaryDwellingSelectionStatus];

export interface PrimaryDwellingSelection {
  status: PrimaryDwellingSelectionStatus;
  outlineId?: string;
  method: "USER_CONFIRMED";
  indicatedAt?: string;
}

/** Unit 6B (functional-design/domain-entities.md §2) - shed permit-determination intake. All
 * optional, `undefined` by default - "not answered" is never coerced to a guessed value, matching
 * every existing shed intake field's convention. */
export const FoundationType = {
  SLAB_ON_GRADE: "SLAB_ON_GRADE",
  PIER_BLOCKS: "PIER_BLOCKS",
  ON_SOIL: "ON_SOIL",
  FROST_FOOTING: "FROST_FOOTING",
  PILES: "PILES",
  WOOD_FOUNDATION: "WOOD_FOUNDATION",
} as const;
export type FoundationType = (typeof FoundationType)[keyof typeof FoundationType];

export const ShedAttachment = {
  DETACHED: "DETACHED",
  ATTACHED: "ATTACHED",
} as const;
export type ShedAttachment = (typeof ShedAttachment)[keyof typeof ShedAttachment];

export const ShedIntendedUse = {
  STORAGE: "STORAGE",
  GREENHOUSE_PLANTS: "GREENHOUSE_PLANTS",
  HOBBY_WORKSHOP_UNOCCUPIED: "HOBBY_WORKSHOP_UNOCCUPIED",
  OCCUPIABLE: "OCCUPIABLE",
} as const;
export type ShedIntendedUse = (typeof ShedIntendedUse)[keyof typeof ShedIntendedUse];

/** Progressive - triggered only when `wallFootprintSqFt` (widthFt x depthFt) `<= 120` (BR-U6B-6,
 * a deterministic threshold, never an arbitrary margin band). */
export interface RoofOverhang {
  extendsBeyondWalls: boolean;
  /** Optional even when extendsBeyondWalls===true - absent -> the roof-area criterion becomes
   * REQUIRES_VERIFICATION rather than guessed. */
  approxOverhangIn?: number;
}

/** Progressive - only asked when it can still change reviewPath (BR-U6B-7). Never inferred from
 * widthFt/depthFt. Numeric, not categorical (2026-09-15 correction) - a category enum could not
 * distinguish a 20-ft manufactured truss from a 35-ft one, even though the 30-ft threshold
 * matters. */
export interface StructuralSpanInfo {
  structuralSpanFt: number;
  usesManufacturedTruss?: boolean;
}

/** Progressive, optional. Each sub-field independent. Drives trade-permit DISCLOSURE only
 * (candidate P8, non-tiered advisory) - never the buildingPermit/reviewPath state. */
export interface UtilityIntent {
  electrical?: boolean;
  plumbing?: boolean;
  mechanical?: boolean;
}

export interface ShedProjectConfiguration {
  widthFt: number;
  depthFt: number;
  heightFt: number;
  alleyAdjacent: boolean;
  proposedPlacement?: ProposedPlacement;
  lotLineRoleAssignment?: LotLineRoleAssignment;
  distanceInputMode?: DistanceInputMode;
  /** Shed-only, mirroring distanceToDwellingFt/DWELLING_SEPARATION's own shed-only scope
   * (regulatory-rules-engine/types.ts - a garage has no equivalent field or rule). */
  primaryDwellingSelection?: PrimaryDwellingSelection;
  /** Unit 6B additions - permit-requirement/lot-coverage intake (functional-design/
   * domain-entities.md §2). All optional; all always asked except roofOverhang/structuralSpanInfo/
   * utilityIntent, which are progressive (business-rules.md BR-U6B-5/6/7/8). */
  foundationType?: FoundationType;
  attachment?: ShedAttachment;
  intendedUse?: ShedIntendedUse;
  roofOverhang?: RoofOverhang;
  structuralSpanInfo?: StructuralSpanInfo;
  utilityIntent?: UtilityIntent;
}

/** Unit 4 (domain-entities.md) - garage-specific intake fields beyond the shed shape.
 * `existingStructuresFootprintSqFt` is USER_SUPPLIED and unverified (business-rules.md BR-U4-3,
 * revised for SMC-countable-area numerator semantics) - undefined means "not supplied", never
 * defaulted to 0; an explicit 0 is a deliberate user assertion. `stackedDwellingUnits` is the L6
 * applicability fact (garage-rule-inventory-and-tier-triage.md) - undefined means "not
 * established", never inferred. Both must reach the server as `undefined`, not `null` or a
 * coerced `0`/`false`, so the Boundary Validator schema below can tell "not answered" apart from
 * an explicit answer. */
export interface GarageProjectConfiguration {
  widthFt: number;
  depthFt: number;
  heightFt: number;
  alleyAdjacent: boolean;
  proposedPlacement?: ProposedPlacement;
  lotLineRoleAssignment?: LotLineRoleAssignment;
  distanceInputMode?: DistanceInputMode;
  existingStructuresFootprintSqFt?: number;
  stackedDwellingUnits?: boolean;
}


/** Unit 7 (Fences) - where along the property a fence lies, in SMC 23.44.090.H.4's own terms. All
 * values are USER-DECLARED (a fence is a line, not a placed rectangle; no map placement is
 * collected for it). `FRONT_SETBACK` is the required front setback extended to the side lot lines;
 * `STREET_SIDE_SETBACK` is the setback along a side street (corner lots) extended to the front and
 * rear lot lines - both are the 4-foot zones. `OUTSIDE_REQUIRED_SETBACKS` means no setback is
 * required where the fence runs (e.g. an alley edge or the buildable area). */
export const FenceLocation = {
  FRONT_SETBACK: "FRONT_SETBACK",
  STREET_SIDE_SETBACK: "STREET_SIDE_SETBACK",
  OTHER_SIDE_OR_REAR_SETBACK: "OTHER_SIDE_OR_REAR_SETBACK",
  OUTSIDE_REQUIRED_SETBACKS: "OUTSIDE_REQUIRED_SETBACKS",
} as const;
export type FenceLocation = (typeof FenceLocation)[keyof typeof FenceLocation];

/** How the fence relates to a bulkhead/retaining wall (SMC 23.44.090.H.4.a, H.5). No default - the
 * intake requires an explicit answer, `NONE` included. */
export const FenceWallRelation = {
  NONE: "NONE",
  ON_NEW_WALL_RAISING_GRADE: "ON_NEW_WALL_RAISING_GRADE",
  ON_OTHER_WALL_OR_BULKHEAD: "ON_OTHER_WALL_OR_BULKHEAD",
  SET_BACK_FROM_CUT_WALL: "SET_BACK_FROM_CUT_WALL",
} as const;
export type FenceWallRelation = (typeof FenceWallRelation)[keyof typeof FenceWallRelation];

/** Unit 7 - fence intake (aidlc-docs/construction/unit-7-fences/functional-design.md §3). Every
 * field is user-declared and is labeled as such in the report. */
export interface FenceProjectConfiguration {
  heightFt: number;
  locations: FenceLocation[];
  openFeatureHeightFt?: number;
  siteSlopes: boolean;
  tallestPortionHeightFt?: number;
  wallRelation: FenceWallRelation;
  wallHeightFt?: number;
  cutWallSetbackFt?: number;
  hasMasonryOrConcreteAbove6Ft?: boolean;
}

/** Unit 8 (Decks) - declared intake, same approach as fences (no map placement; nothing silently
 * defaulted). aidlc-docs/construction/unit-8-decks/functional-design.md §3. */
export const DeckAttachment = {
  DETACHED: "DETACHED",
  ATTACHED_TO_DWELLING: "ATTACHED_TO_DWELLING",
} as const;
export type DeckAttachment = (typeof DeckAttachment)[keyof typeof DeckAttachment];

export const DeckBuildingRelation = {
  OPEN_GROUND_BELOW: "OPEN_GROUND_BELOW",
  OVER_BASEMENT_OR_STORY_BELOW: "OVER_BASEMENT_OR_STORY_BELOW",
  ROOF_DECK: "ROOF_DECK",
} as const;
export type DeckBuildingRelation = (typeof DeckBuildingRelation)[keyof typeof DeckBuildingRelation];

/** Where the deck lies relative to the required setbacks (SMC 23.44.090 Table A), USER-DECLARED. */
export const DeckSetbackLocation = {
  FRONT_SETBACK: "FRONT_SETBACK",
  STREET_SIDE_SETBACK: "STREET_SIDE_SETBACK",
  SIDE_SETBACK: "SIDE_SETBACK",
  REAR_SETBACK: "REAR_SETBACK",
  OUTSIDE_REQUIRED_SETBACKS: "OUTSIDE_REQUIRED_SETBACKS",
} as const;
export type DeckSetbackLocation = (typeof DeckSetbackLocation)[keyof typeof DeckSetbackLocation];

export interface DeckProjectConfiguration {
  heightAboveGradeIn: number;
  widthFt: number;
  depthFt: number;
  attachment: DeckAttachment;
  buildingRelation: DeckBuildingRelation;
  setbackLocations: DeckSetbackLocation[];
  solidFlooring?: boolean;
  longestBeamFt?: number;
  distanceFromRearLotLineFt?: number;
  distanceFromDwellingFt?: number;
}

/** Unit 11 (ADUs) - Slice 3 intake for a NEW DETACHED accessory dwelling unit. Placement, lot-line roles
 * and the existing-dwelling selection reuse the shed's map-based model (the browser submits only what the
 * customer indicated; every distance is computed server-side). Counts and floor area are DECLARED and
 * labeled as such in the report; nothing is defaulted, so "not answered" stays distinguishable from an
 * explicit answer. */
export const AduTypeValue = {
  DETACHED_NEW: "DETACHED_NEW",
  CONVERSION_EXISTING: "CONVERSION_EXISTING",
  ATTACHED_TO_HOUSE: "ATTACHED_TO_HOUSE",
} as const;
export type AduTypeValue = (typeof AduTypeValue)[keyof typeof AduTypeValue];

/** Unit 11 Slice 4 - converting an existing accessory structure (a garage or shed) to a detached ADU
 * (SMC 23.42.022.H). The building is chosen on the map from Seattle's building outlines (its footprint is the
 * mapped outline, so no footprint is drawn); everything else is declared. */
export interface ConvertedStructureSelection {
  outlineId: string;
  method: "USER_CONFIRMED";
}
export interface AduConversionConfiguration {
  aduType: typeof AduTypeValue.CONVERSION_EXISTING;
  convertedStructure?: ConvertedStructureSelection;
  stories: number;
  bedrooms: number;
  alleyAdjacent: boolean;
  existingPrincipalDwellingUnits: number;
  existingAduCount: number;
  /** Did the building exist before July 23, 2023 (SMC 23.42.022.H.2)? undefined = not sure. */
  existedBeforeJuly2023?: boolean;
  /** Will the conversion keep the building's footprint and height as they are (no addition, relocation or rebuild)? undefined = not sure. */
  keepsFootprintAndHeight?: boolean;
  existingHouseBuiltBefore1982?: boolean;
  existingChargeableFloorAreaSqFt?: number;
  lotLineRoleAssignment?: LotLineRoleAssignment;
  distanceInputMode?: DistanceInputMode;
  primaryDwellingSelection?: PrimaryDwellingSelection;
}

/** Unit 11 Slice 5 - an ADU inside or attached to the existing house (a basement, attic, garage or room conversion, or a new addition). Declared only,
 * like a fence or deck: nothing is placed on the map (an addition's position is not collected, and a unit inside the house changes no exterior wall). */
export interface AduAttachedConfiguration {
  aduType: typeof AduTypeValue.ATTACHED_TO_HOUSE;
  /** Gross floor area of the ADU as the code counts it: leave out underground floors and up to 250 sq ft of an attached garage. */
  grossFloorAreaSqFt: number;
  bedrooms: number;
  /** Is any part of the ADU in a new addition or expansion of the house? */
  includesAddition: boolean;
  /** Did the part of the house the ADU would be in exist before July 23, 2023? undefined = not sure. */
  portionExistedBeforeJuly2023?: boolean;
  existingPrincipalDwellingUnits: number;
  existingAduCount: number;
  existingHouseBuiltBefore1982?: boolean;
  existingChargeableFloorAreaSqFt?: number;
  /** Lot-line roles are not used by an attached ADU; kept optional so a shared intake payload shape stays valid. */
  lotLineRoleAssignment?: LotLineRoleAssignment;
}

export interface AduNewDetachedConfiguration {
  aduType: typeof AduTypeValue.DETACHED_NEW;
  widthFt: number;
  depthFt: number;
  stories: number;
  bedrooms: number;
  heightFt: number;
  alleyAdjacent: boolean;
  existingPrincipalDwellingUnits: number;
  existingAduCount: number;
  existingHouseBuiltBefore1982?: boolean;
  existingChargeableFloorAreaSqFt?: number;
  proposedPlacement?: ProposedPlacement;
  lotLineRoleAssignment?: LotLineRoleAssignment;
  distanceInputMode?: DistanceInputMode;
  primaryDwellingSelection?: PrimaryDwellingSelection;
}

export type AduProjectConfiguration = AduNewDetachedConfiguration | AduConversionConfiguration | AduAttachedConfiguration;

/** Unit 4 - `ProjectDetails` (domain-entities.md). Neither member carries its own `projectType`
 * discriminant field - the sibling `ScreeningRequest.projectType` column is the actual
 * discriminant (a plain `jsonb` column has no way to enforce a matching internal tag, so code
 * must consistently branch on the SIBLING field, then narrow/cast - never trust an internal tag
 * inside untrusted JSON as authoritative on its own). See `screening-request/repository.ts` and
 * `report-generation-orchestrator/pipeline.ts` for the actual branch points. */
export type ProjectConfiguration = ShedProjectConfiguration | GarageProjectConfiguration | FenceProjectConfiguration | DeckProjectConfiguration | AduProjectConfiguration;

export const ValidationState = {
  DRAFT: "DRAFT",
  VALID: "VALID",
} as const;
export type ValidationState = (typeof ValidationState)[keyof typeof ValidationState];

/** Unit 5 adds VACANT_LAND as this project's first second-*workflow* implementation (not a third
 * project type - `domain-entities.md`'s own design invariant). Kept as a canonical const (not an
 * inline literal) so every construction site references the same source of truth as the set
 * of supported workflows grows (screening-request/authorization.ts, repository.ts). */
export const WorkflowType = {
  EXISTING_PROPERTY: "EXISTING_PROPERTY",
  VACANT_LAND: "VACANT_LAND",
} as const;
export type WorkflowType = (typeof WorkflowType)[keyof typeof WorkflowType];

export const ProjectType = {
  SHED: "shed",
  GARAGE: "garage",
  FENCE: "fence",
  DECK: "deck",
  ADU: "adu",
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

/** Single source of truth for which project types the system currently persists/evaluates
 * (Unit 4 business-rules.md BR-U4-1, revised - intake/evaluability, NOT public purchase
 * eligibility, which is a separate, additional gate - see authorization.ts's Garage Screening
 * Coverage Readiness check). Every call site that previously redeclared its own copy of this set
 * (screening-request/repository.ts, screening-request/authorization.ts,
 * checkout-fulfillment/index.ts, app/api/screening-requests/route.ts) now imports this one. */
export const SUPPORTED_PROJECT_TYPES = new Set<string>([ProjectType.SHED, ProjectType.GARAGE, ProjectType.FENCE, ProjectType.DECK, ProjectType.ADU]);

export const VacantLandScreeningIntent = {
  VACANT_PARCEL: "VACANT_PARCEL",
  REDEVELOP_EXISTING_PARCEL: "REDEVELOP_EXISTING_PARCEL",
} as const;
export type VacantLandScreeningIntent = (typeof VacantLandScreeningIntent)[keyof typeof VacantLandScreeningIntent];

/** Unit 5 (domain-entities.md) - deliberately minimal, per VL-1's "no Project Configuration step."
 * Every other fact the vacant-land evaluation needs comes from the existing Property
 * Intelligence/Spatial Analysis pipeline, keyed off the confirmed parcel alone. */
export interface VacantLandDetails {
  screeningIntent: VacantLandScreeningIntent;
}

export const VacantLandDetailsSchema = z.object({
  screeningIntent: z.enum([VacantLandScreeningIntent.VACANT_PARCEL, VacantLandScreeningIntent.REDEVELOP_EXISTING_PARCEL]),
});
export type VacantLandDetailsInput = z.infer<typeof VacantLandDetailsSchema>;

interface ScreeningRequestBase {
  id: string;
  confirmedParcelId: string;
  validationState: ValidationState;
  snapshotTakenAt?: string;
}

/** Unit 5 BR-U5-1: `ScreeningRequest`/`ScreeningRequestSnapshot` are `workflowType`-discriminated
 * unions, not one interface with loosely-optional fields - a `VACANT_LAND` variant structurally
 * cannot carry `projectType`/`projectDetails` at all (not optional-and-unset), and vice versa. */
export interface ExistingPropertyScreeningRequest extends ScreeningRequestBase {
  workflowType: typeof WorkflowType.EXISTING_PROPERTY;
  projectType: ProjectType;
  projectDetails: ProjectConfiguration;
  snapshot?: ExistingPropertyScreeningRequestSnapshot;
}

export interface VacantLandScreeningRequest extends ScreeningRequestBase {
  workflowType: typeof WorkflowType.VACANT_LAND;
  screeningIntent: VacantLandScreeningIntent;
  vacantLandDetails: VacantLandDetails;
  snapshot?: VacantLandScreeningRequestSnapshot;
}

export type ScreeningRequest = ExistingPropertyScreeningRequest | VacantLandScreeningRequest;

/** The immutable copy taken at generation-authorization time (BR-U2-2/RGD-4). */
export interface ExistingPropertyScreeningRequestSnapshot {
  workflowType: typeof WorkflowType.EXISTING_PROPERTY;
  confirmedParcelId: string;
  projectType: ProjectType;
  projectDetails: ProjectConfiguration;
}

export interface VacantLandScreeningRequestSnapshot {
  workflowType: typeof WorkflowType.VACANT_LAND;
  confirmedParcelId: string;
  screeningIntent: VacantLandScreeningIntent;
  vacantLandDetails: VacantLandDetails;
}

export type ScreeningRequestSnapshot = ExistingPropertyScreeningRequestSnapshot | VacantLandScreeningRequestSnapshot;

const GeographicPointSchema = z.object({
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
});

const ProposedPlacementSchema = z.object({
  anchor: GeographicPointSchema,
  orientationDeg: z.number().finite().min(0).max(360),
});

/** Maintenance correction (2026-09-15, founder direction) - `multipleFrontageAnswer` is required
 * (no `.optional()`) for an ASSIGNED assignment - the server must never accept a submission that
 * silently omits this answer, matching the UI's own "Next remains disabled until answered" gate
 * with an independent, defense-in-depth check (NFR-U2-4's existing discipline). The `superRefine`
 * below cross-checks `streetFrontageEdgeRefs` against the answer: required + non-empty exactly
 * when YES, forbidden otherwise - never left for the client alone to keep consistent. */
const LotLineRoleAssignmentSchema = z
  .discriminatedUnion("status", [
    z.object({
      status: z.literal(LotLineRoleStatus.ASSIGNED),
      frontEdgeRef: z.string().min(1),
      rearEdgeRef: z.string().min(1),
      sideEdgeRefs: z.array(z.string().min(1)),
      multipleFrontageAnswer: z.enum([MultipleFrontageAnswer.YES, MultipleFrontageAnswer.NO, MultipleFrontageAnswer.NOT_SURE]),
      streetFrontageEdgeRefs: z.array(z.string().min(1)).optional(),
      rearAlsoFacesStreet: z.boolean().optional(),
      method: z.literal("USER_INDICATED"),
      indicatedBy: z.string().min(1).optional(),
      indicatedAt: z.string().optional(),
    }),
    z.object({
      status: z.literal(LotLineRoleStatus.INSUFFICIENT),
      method: z.literal("USER_INDICATED"),
      indicatedBy: z.string().min(1).optional(),
      indicatedAt: z.string().optional(),
    }),
  ])
  .superRefine((val, ctx) => {
    if (val.status !== LotLineRoleStatus.ASSIGNED) return;
    const hasStreetFrontageEdges = (val.streetFrontageEdgeRefs?.length ?? 0) > 0;
    // Maintenance correction (2026-09-17, founder-directed through-lot fix) - a customer whose
    // ONLY additional street frontage is their own rear line (rearAlsoFacesStreet) legitimately has
    // zero streetFrontageEdgeRefs - this is the ordinary way a real through lot presents, not an
    // incomplete answer. The "at least one confirmed edge" requirement is satisfied by EITHER
    // signal, never streetFrontageEdgeRefs alone.
    if (val.multipleFrontageAnswer === MultipleFrontageAnswer.YES && !hasStreetFrontageEdges && val.rearAlsoFacesStreet !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "streetFrontageEdgeRefs must identify at least one edge, or rearAlsoFacesStreet must be true, when multipleFrontageAnswer is YES.",
        path: ["streetFrontageEdgeRefs"],
      });
    }
    if (val.multipleFrontageAnswer !== MultipleFrontageAnswer.YES && hasStreetFrontageEdges) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "streetFrontageEdgeRefs must be empty unless multipleFrontageAnswer is YES.",
        path: ["streetFrontageEdgeRefs"],
      });
    }
    // Reviewer-caught gap (2026-09-15, decision 266339d9-3f11-44c0-b90d-314e9208654a) - every
    // streetFrontageEdgeRefs entry must also be a genuine side candidate (present in
    // sideEdgeRefs), never the front/rear edge itself or a ref invented independently of the
    // actual side-candidate set this same payload declares. A purely structural cross-field check
    // (no polygon needed) - the SEPARATE concern of whether sideEdgeRefs/streetFrontageEdgeRefs
    // entries belong to the real submitted polygon at all remains validateLotLineRoleAssignment's
    // job (spatial-analysis/lot-line-roles.ts).
    const sideEdgeRefSet = new Set(val.sideEdgeRefs ?? []);
    const foreignFrontageRefs = (val.streetFrontageEdgeRefs ?? []).filter((ref) => !sideEdgeRefSet.has(ref));
    if (foreignFrontageRefs.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `streetFrontageEdgeRefs must be a subset of sideEdgeRefs - found reference(s) that are not side candidates: ${foreignFrontageRefs.join(", ")}.`,
        path: ["streetFrontageEdgeRefs"],
      });
    }
    // Reviewer-caught gap (2026-09-15, decision 8475f281-b781-428c-bb2a-9ca9303f5f3a) - an edge ref
    // can only meaningfully appear once in either array; a duplicate is never a legitimate distinct
    // indication and previously nothing rejected one, which could otherwise cause an array-length
    // comparison downstream (deriveSideSetbackEvidenceGapReason, report-generation-orchestrator/
    // pipeline.ts) to reach the wrong conclusion about whether every side edge was accounted for.
    // That derivation has since been corrected to use set membership regardless, but rejecting
    // duplicates here closes the actual root cause rather than relying solely on downstream code to
    // compensate for malformed input.
    if (new Set(val.sideEdgeRefs ?? []).size !== (val.sideEdgeRefs ?? []).length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sideEdgeRefs must not contain duplicate entries.", path: ["sideEdgeRefs"] });
    }
    if (new Set(val.streetFrontageEdgeRefs ?? []).size !== (val.streetFrontageEdgeRefs ?? []).length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "streetFrontageEdgeRefs must not contain duplicate entries.", path: ["streetFrontageEdgeRefs"] });
    }
    // Maintenance correction (2026-09-17, founder-directed through-lot fix) - rearAlsoFacesStreet
    // is only meaningful once the customer has confirmed additional street frontage exists at all;
    // true otherwise would be indistinguishable from a genuine "my rear doesn't face a street."
    if (val.rearAlsoFacesStreet === true && val.multipleFrontageAnswer !== MultipleFrontageAnswer.YES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rearAlsoFacesStreet can only be true when multipleFrontageAnswer is YES.",
        path: ["rearAlsoFacesStreet"],
      });
    }
  });

/** Building intelligence v1 - mirrors LotLineRoleAssignmentSchema's discriminated-union shape
 * exactly (SELECTED/UNKNOWN in place of ASSIGNED/INSUFFICIENT). Note there is no "client-computed
 * distance" field here either - same discipline as ProposedPlacementSchema above; the browser
 * submits only which footprint the user pointed to, never a distance it computed itself. */
const PrimaryDwellingSelectionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal(PrimaryDwellingSelectionStatus.SELECTED),
    outlineId: z.string().min(1),
    method: z.literal("USER_CONFIRMED"),
    indicatedAt: z.string().optional(),
  }),
  z.object({
    status: z.literal(PrimaryDwellingSelectionStatus.UNKNOWN),
    method: z.literal("USER_CONFIRMED"),
    indicatedAt: z.string().optional(),
  }),
]);

/** PC-2's server-side validation boundary. Rejects malformed polygons, non-finite coordinates,
 * out-of-range geographic coordinates, structurally invalid lot-line assignments, and
 * out-of-range shed dimensions - regardless of what client-side validation already checked
 * (NFR-U2-4). Note there is no "client-computed distance" field anywhere in this schema by
 * design - the browser is structurally unable to submit one (Code Generation CRS correction). */
const RoofOverhangSchema = z.object({
  extendsBeyondWalls: z.boolean(),
  approxOverhangIn: z.number().finite().nonnegative().max(240).optional(),
});

const StructuralSpanInfoSchema = z.object({
  structuralSpanFt: z.number().finite().positive().max(200),
  usesManufacturedTruss: z.boolean().optional(),
});

const UtilityIntentSchema = z.object({
  electrical: z.boolean().optional(),
  plumbing: z.boolean().optional(),
  mechanical: z.boolean().optional(),
});

export const ShedProjectConfigurationSchema = z.object({
  widthFt: z.number().finite().positive().max(200),
  depthFt: z.number().finite().positive().max(200),
  heightFt: z.number().finite().positive().max(50),
  alleyAdjacent: z.boolean(),
  proposedPlacement: ProposedPlacementSchema.optional(),
  lotLineRoleAssignment: LotLineRoleAssignmentSchema.optional(),
  distanceInputMode: z.enum([DistanceInputMode.MAP_PLACEMENT, DistanceInputMode.MANUAL_FALLBACK]).optional(),
  primaryDwellingSelection: PrimaryDwellingSelectionSchema.optional(),
  foundationType: z
    .enum([
      FoundationType.SLAB_ON_GRADE,
      FoundationType.PIER_BLOCKS,
      FoundationType.ON_SOIL,
      FoundationType.FROST_FOOTING,
      FoundationType.PILES,
      FoundationType.WOOD_FOUNDATION,
    ])
    .optional(),
  attachment: z.enum([ShedAttachment.DETACHED, ShedAttachment.ATTACHED]).optional(),
  intendedUse: z
    .enum([ShedIntendedUse.STORAGE, ShedIntendedUse.GREENHOUSE_PLANTS, ShedIntendedUse.HOBBY_WORKSHOP_UNOCCUPIED, ShedIntendedUse.OCCUPIABLE])
    .optional(),
  roofOverhang: RoofOverhangSchema.optional(),
  structuralSpanInfo: StructuralSpanInfoSchema.optional(),
  utilityIntent: UtilityIntentSchema.optional(),
});

export type ShedProjectConfigurationInput = z.infer<typeof ShedProjectConfigurationSchema>;

/** Unit 4's Boundary Validator schema for garage intake (mirrors ShedProjectConfigurationSchema's
 * dimensional bounds). `existingStructuresFootprintSqFt`/`stackedDwellingUnits` are optional and
 * deliberately NOT given a `.default(...)` - zod's `.optional()` alone preserves the
 * undefined-vs-explicit-value distinction BR-U4-3/L6 require; a `.default()` would silently
 * collapse "not answered" into a concrete value, exactly what the intake UI's 3-choice contract
 * (frontend-components.md) is designed to prevent. `existingStructuresFootprintSqFt` allows 0 (an
 * explicit "no existing structures" assertion) but rejects negative/non-finite values. */
export const GarageProjectConfigurationSchema = z.object({
  widthFt: z.number().finite().positive().max(200),
  depthFt: z.number().finite().positive().max(200),
  heightFt: z.number().finite().positive().max(50),
  alleyAdjacent: z.boolean(),
  proposedPlacement: ProposedPlacementSchema.optional(),
  lotLineRoleAssignment: LotLineRoleAssignmentSchema.optional(),
  distanceInputMode: z.enum([DistanceInputMode.MAP_PLACEMENT, DistanceInputMode.MANUAL_FALLBACK]).optional(),
  existingStructuresFootprintSqFt: z.number().finite().nonnegative().max(1_000_000).optional(),
  stackedDwellingUnits: z.boolean().optional(),
});

export type GarageProjectConfigurationInput = z.infer<typeof GarageProjectConfigurationSchema>;

/** Unit 7's Boundary Validator schema for fence intake. Cross-field refinements keep an internally
 * inconsistent declaration from ever becoming VALID: wall fields travel with `wallRelation`,
 * `tallestPortionHeightFt` is never below the fence height, and locations are non-empty and unique.
 * Nothing is defaulted - `openFeatureHeightFt`, `tallestPortionHeightFt`, `wallHeightFt`,
 * `cutWallSetbackFt` and `hasMasonryOrConcreteAbove6Ft` stay `undefined` when not answered. */
export const FenceProjectConfigurationSchema = z
  .object({
    heightFt: z.number().finite().positive().max(20),
    locations: z
      .array(z.enum([FenceLocation.FRONT_SETBACK, FenceLocation.STREET_SIDE_SETBACK, FenceLocation.OTHER_SIDE_OR_REAR_SETBACK, FenceLocation.OUTSIDE_REQUIRED_SETBACKS]))
      .min(1)
      .max(4),
    openFeatureHeightFt: z.number().finite().nonnegative().max(4).optional(),
    siteSlopes: z.boolean(),
    tallestPortionHeightFt: z.number().finite().positive().max(30).optional(),
    wallRelation: z.enum([
      FenceWallRelation.NONE,
      FenceWallRelation.ON_NEW_WALL_RAISING_GRADE,
      FenceWallRelation.ON_OTHER_WALL_OR_BULKHEAD,
      FenceWallRelation.SET_BACK_FROM_CUT_WALL,
    ]),
    wallHeightFt: z.number().finite().positive().max(30).optional(),
    cutWallSetbackFt: z.number().finite().nonnegative().max(200).optional(),
    hasMasonryOrConcreteAbove6Ft: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.locations).size !== value.locations.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "locations must not repeat.", path: ["locations"] });
    }
    if (value.tallestPortionHeightFt !== undefined) {
      if (!value.siteSlopes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tallestPortionHeightFt applies only when siteSlopes is true.", path: ["tallestPortionHeightFt"] });
      } else if (value.tallestPortionHeightFt < value.heightFt) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tallestPortionHeightFt cannot be below heightFt.", path: ["tallestPortionHeightFt"] });
      }
    }
    if (value.wallRelation === FenceWallRelation.NONE) {
      if (value.wallHeightFt !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "wallHeightFt requires a wallRelation other than NONE.", path: ["wallHeightFt"] });
      }
      if (value.cutWallSetbackFt !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cutWallSetbackFt requires wallRelation SET_BACK_FROM_CUT_WALL.", path: ["cutWallSetbackFt"] });
      }
    } else {
      if (value.wallHeightFt === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "wallHeightFt is required when the fence relates to a wall.", path: ["wallHeightFt"] });
      }
      if (value.wallRelation === FenceWallRelation.SET_BACK_FROM_CUT_WALL) {
        if (value.cutWallSetbackFt === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cutWallSetbackFt is required for SET_BACK_FROM_CUT_WALL.", path: ["cutWallSetbackFt"] });
        }
      } else if (value.cutWallSetbackFt !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cutWallSetbackFt applies only to SET_BACK_FROM_CUT_WALL.", path: ["cutWallSetbackFt"] });
      }
    }
  });

export type FenceProjectConfigurationInput = z.infer<typeof FenceProjectConfigurationSchema>;

/** Unit 8's Boundary Validator schema for deck intake. Cross-field refinements keep an internally
 * inconsistent declaration from ever becoming VALID. Optional answers stay `undefined` when not
 * answered (no defaults). */
export const DeckProjectConfigurationSchema = z
  .object({
    heightAboveGradeIn: z.number().finite().positive().max(240),
    widthFt: z.number().finite().positive().max(100),
    depthFt: z.number().finite().positive().max(100),
    attachment: z.enum([DeckAttachment.DETACHED, DeckAttachment.ATTACHED_TO_DWELLING]),
    buildingRelation: z.enum([DeckBuildingRelation.OPEN_GROUND_BELOW, DeckBuildingRelation.OVER_BASEMENT_OR_STORY_BELOW, DeckBuildingRelation.ROOF_DECK]),
    setbackLocations: z
      .array(
        z.enum([
          DeckSetbackLocation.FRONT_SETBACK,
          DeckSetbackLocation.STREET_SIDE_SETBACK,
          DeckSetbackLocation.SIDE_SETBACK,
          DeckSetbackLocation.REAR_SETBACK,
          DeckSetbackLocation.OUTSIDE_REQUIRED_SETBACKS,
        ])
      )
      .min(1)
      .max(5),
    solidFlooring: z.boolean().optional(),
    longestBeamFt: z.number().finite().positive().max(100).optional(),
    distanceFromRearLotLineFt: z.number().finite().nonnegative().max(500).optional(),
    distanceFromDwellingFt: z.number().finite().nonnegative().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.setbackLocations).size !== value.setbackLocations.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "setbackLocations must not repeat.", path: ["setbackLocations"] });
    }
    if (value.distanceFromRearLotLineFt !== undefined && !value.setbackLocations.includes(DeckSetbackLocation.REAR_SETBACK)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "distanceFromRearLotLineFt applies only when the deck is in the rear setback.", path: ["distanceFromRearLotLineFt"] });
    }
    if (value.distanceFromDwellingFt !== undefined && value.attachment === DeckAttachment.ATTACHED_TO_DWELLING) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "distanceFromDwellingFt applies only to a detached deck.", path: ["distanceFromDwellingFt"] });
    }
    if (value.buildingRelation === DeckBuildingRelation.ROOF_DECK && value.attachment === DeckAttachment.DETACHED) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A roof deck is part of the building; it cannot be detached from the dwelling.", path: ["attachment"] });
    }
  });

export type DeckProjectConfigurationInput = z.infer<typeof DeckProjectConfigurationSchema>;

const AduCommonFields = {
  stories: z.number().int().min(1).max(3),
  bedrooms: z.number().int().min(0).max(8),
  alleyAdjacent: z.boolean(),
  existingPrincipalDwellingUnits: z.number().int().min(1).max(10),
  existingAduCount: z.number().int().min(0).max(10),
  existingHouseBuiltBefore1982: z.boolean().optional(),
  existingChargeableFloorAreaSqFt: z.number().finite().nonnegative().max(200_000).optional(),
  lotLineRoleAssignment: LotLineRoleAssignmentSchema.optional(),
  distanceInputMode: z.enum([DistanceInputMode.MAP_PLACEMENT, DistanceInputMode.MANUAL_FALLBACK]).optional(),
  primaryDwellingSelection: PrimaryDwellingSelectionSchema.optional(),
};

const AduNewDetachedSchema = z.object({
  aduType: z.literal(AduTypeValue.DETACHED_NEW),
  widthFt: z.number().finite().positive().max(80),
  depthFt: z.number().finite().positive().max(80),
  heightFt: z.number().finite().positive().max(60),
  proposedPlacement: ProposedPlacementSchema.optional(),
  ...AduCommonFields,
});

const AduConversionSchema = z.object({
  aduType: z.literal(AduTypeValue.CONVERSION_EXISTING),
  convertedStructure: z.object({ outlineId: z.string().min(1), method: z.literal("USER_CONFIRMED") }).optional(),
  existedBeforeJuly2023: z.boolean().optional(),
  keepsFootprintAndHeight: z.boolean().optional(),
  ...AduCommonFields,
});

const AduAttachedSchema = z.object({
  aduType: z.literal(AduTypeValue.ATTACHED_TO_HOUSE),
  grossFloorAreaSqFt: z.number().finite().positive().max(10_000),
  bedrooms: z.number().int().min(0).max(8),
  includesAddition: z.boolean(),
  portionExistedBeforeJuly2023: z.boolean().optional(),
  existingPrincipalDwellingUnits: z.number().int().min(1).max(10),
  existingAduCount: z.number().int().min(0).max(10),
  existingHouseBuiltBefore1982: z.boolean().optional(),
  existingChargeableFloorAreaSqFt: z.number().finite().nonnegative().max(200_000).optional(),
  lotLineRoleAssignment: LotLineRoleAssignmentSchema.optional(),
});

/** Unit 11's Boundary Validator schema for ADU intake (a new detached ADU, the conversion of an existing accessory
 * structure, or an ADU attached to or inside the house, discriminated by `aduType`). Counts are integers; nothing is defaulted. */
export const AduProjectConfigurationSchema = z.discriminatedUnion("aduType", [AduNewDetachedSchema, AduConversionSchema, AduAttachedSchema]).superRefine((value, ctx) => {
  if (value.aduType !== AduTypeValue.CONVERSION_EXISTING) return;
  const dwelling = value.primaryDwellingSelection;
  if (value.convertedStructure && dwelling?.status === PrimaryDwellingSelectionStatus.SELECTED && dwelling.outlineId === value.convertedStructure.outlineId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The building to convert cannot also be the main house.", path: ["convertedStructure"] });
  }
});

export type AduProjectConfigurationInput = z.infer<typeof AduProjectConfigurationSchema>;

/** Single dispatch point from the sibling `projectType` column to the project-details schema (the
 * column, never a tag inside the untrusted JSON, is the discriminant). Exhaustive over ProjectType. */
export function projectDetailsSchemaFor(projectType: string): z.ZodType<ProjectConfiguration> {
  switch (projectType) {
    case ProjectType.GARAGE:
      return GarageProjectConfigurationSchema as unknown as z.ZodType<ProjectConfiguration>;
    case ProjectType.FENCE:
      return FenceProjectConfigurationSchema as unknown as z.ZodType<ProjectConfiguration>;
    case ProjectType.DECK:
      return DeckProjectConfigurationSchema as unknown as z.ZodType<ProjectConfiguration>;
    case ProjectType.ADU:
      return AduProjectConfigurationSchema as unknown as z.ZodType<ProjectConfiguration>;
    default:
      return ShedProjectConfigurationSchema as unknown as z.ZodType<ProjectConfiguration>;
  }
}
