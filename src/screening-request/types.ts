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

/** Unit 4 - `ProjectDetails` (domain-entities.md). Neither member carries its own `projectType`
 * discriminant field - the sibling `ScreeningRequest.projectType` column is the actual
 * discriminant (a plain `jsonb` column has no way to enforce a matching internal tag, so code
 * must consistently branch on the SIBLING field, then narrow/cast - never trust an internal tag
 * inside untrusted JSON as authoritative on its own). See `screening-request/repository.ts` and
 * `report-generation-orchestrator/pipeline.ts` for the actual branch points. */
export type ProjectConfiguration = ShedProjectConfiguration | GarageProjectConfiguration;

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
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

/** Single source of truth for which project types the system currently persists/evaluates
 * (Unit 4 business-rules.md BR-U4-1, revised - intake/evaluability, NOT public purchase
 * eligibility, which is a separate, additional gate - see authorization.ts's Garage Screening
 * Coverage Readiness check). Every call site that previously redeclared its own copy of this set
 * (screening-request/repository.ts, screening-request/authorization.ts,
 * checkout-fulfillment/index.ts, app/api/screening-requests/route.ts) now imports this one. */
export const SUPPORTED_PROJECT_TYPES = new Set<string>([ProjectType.SHED, ProjectType.GARAGE]);

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
