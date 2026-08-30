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

/** Front/rear/side roles are never inferred from polygon shape alone (BR-U2-9) - this is always
 * produced from an explicit user indication (method: USER_INDICATED, the only method Unit 2
 * implements) or is INSUFFICIENT (fail-closed). */
export interface LotLineRoleAssignment {
  status: LotLineRoleStatus;
  frontEdgeRef?: string;
  rearEdgeRef?: string;
  sideEdgeRefs?: string[];
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

const LotLineRoleAssignmentSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal(LotLineRoleStatus.ASSIGNED),
    frontEdgeRef: z.string().min(1),
    rearEdgeRef: z.string().min(1),
    sideEdgeRefs: z.array(z.string().min(1)),
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
]);

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
export const ShedProjectConfigurationSchema = z.object({
  widthFt: z.number().finite().positive().max(200),
  depthFt: z.number().finite().positive().max(200),
  heightFt: z.number().finite().positive().max(50),
  alleyAdjacent: z.boolean(),
  proposedPlacement: ProposedPlacementSchema.optional(),
  lotLineRoleAssignment: LotLineRoleAssignmentSchema.optional(),
  distanceInputMode: z.enum([DistanceInputMode.MAP_PLACEMENT, DistanceInputMode.MANUAL_FALLBACK]).optional(),
  primaryDwellingSelection: PrimaryDwellingSelectionSchema.optional(),
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
