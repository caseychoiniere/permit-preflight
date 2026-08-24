/**
 * Screening Request domain types (Functional Design domain-entities.md). Unit 2 exercises only
 * the EXISTING_PROPERTY / shed path.
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

export interface ShedProjectConfiguration {
  widthFt: number;
  depthFt: number;
  heightFt: number;
  alleyAdjacent: boolean;
  proposedPlacement?: ProposedPlacement;
  lotLineRoleAssignment?: LotLineRoleAssignment;
  distanceInputMode?: DistanceInputMode;
}

export const ValidationState = {
  DRAFT: "DRAFT",
  VALID: "VALID",
} as const;
export type ValidationState = (typeof ValidationState)[keyof typeof ValidationState];

/** Unit 2 exercises only this one workflow/project type - kept as a canonical const (not an
 * inline literal) so every construction site references the same source of truth as the set
 * of supported types grows (screening-request/authorization.ts, repository.ts). */
export const WorkflowType = {
  EXISTING_PROPERTY: "EXISTING_PROPERTY",
} as const;
export type WorkflowType = (typeof WorkflowType)[keyof typeof WorkflowType];

export const ProjectType = {
  SHED: "shed",
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

export interface ScreeningRequest {
  id: string;
  workflowType: WorkflowType;
  confirmedParcelId: string;
  projectType: ProjectType;
  projectDetails: ShedProjectConfiguration;
  validationState: ValidationState;
  snapshot?: ScreeningRequestSnapshot;
  snapshotTakenAt?: string;
}

/** The immutable copy taken at generation-authorization time (BR-U2-2/RGD-4). */
export interface ScreeningRequestSnapshot {
  confirmedParcelId: string;
  projectType: ProjectType;
  projectDetails: ShedProjectConfiguration;
}

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
});

export type ShedProjectConfigurationInput = z.infer<typeof ShedProjectConfigurationSchema>;
