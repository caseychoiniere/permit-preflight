/**
 * Real boundary parser/hydrator for a persisted `ScreeningRequest`/`ScreeningRequestSnapshot`
 * shape (Code Generation review correction, NFR-U5-4). A TypeScript `as` cast on a `jsonb` column
 * value or a live DB row's own fields is NOT real validation - it discriminates on `workflowType`,
 * validates every required branch field, rejects cross-workflow combinations (e.g. a
 * `VACANT_LAND` payload carrying `projectType`), rejects an unrecognized `workflowType`, and fails
 * closed rather than casting an invalid shape into a valid domain object.
 *
 * Used anywhere a persisted row/snapshot becomes a domain request consumed by authorization,
 * checkout, or report generation (`authorization.ts`, `checkout-fulfillment/index.ts`,
 * `report-generation-orchestrator/pipeline.ts`).
 */

import { z } from "zod";
import {
  GarageProjectConfigurationSchema,
  ProjectType,
  ShedProjectConfigurationSchema,
  VacantLandDetailsSchema,
  VacantLandScreeningIntent,
  WorkflowType,
} from "./types.js";
import type { ExistingPropertyScreeningRequestSnapshot, VacantLandScreeningRequestSnapshot } from "./types.js";
import { validateAtBoundary } from "../shared/validation.js";

const ExistingPropertyShapeSchema = z
  .object({
    workflowType: z.literal(WorkflowType.EXISTING_PROPERTY),
    confirmedParcelId: z.string().min(1),
    projectType: z.enum([ProjectType.SHED, ProjectType.GARAGE]),
    // Deliberately z.unknown() here, not the final Shed/Garage schema - z.discriminatedUnion
    // requires every branch to be a plain ZodObject (a `.superRefine`-wrapped ZodEffects is
    // rejected at the type level). `projectDetails`'s own shape - which schema applies depends on
    // the sibling `projectType` field, decided only after the discriminated union has already
    // picked this branch - is validated as a second pass below, in hydrateScreeningRequestShape.
    projectDetails: z.unknown(),
  })
  .strict();

const VacantLandShapeSchema = z
  .object({
    workflowType: z.literal(WorkflowType.VACANT_LAND),
    confirmedParcelId: z.string().min(1),
    screeningIntent: z.enum([VacantLandScreeningIntent.VACANT_PARCEL, VacantLandScreeningIntent.REDEVELOP_EXISTING_PARCEL]),
    vacantLandDetails: VacantLandDetailsSchema,
  })
  .strict();

/** `.strict()` on both branches means a payload carrying fields from the OTHER workflow's shape
 * (e.g. a VACANT_LAND-declared object that also has `projectType`) fails validation outright -
 * cross-workflow field pollution is rejected, not silently ignored. An unrecognized
 * `workflowType` fails to match either branch of the discriminated union. */
export const ScreeningRequestShapeSchema = z.discriminatedUnion("workflowType", [ExistingPropertyShapeSchema, VacantLandShapeSchema]);

export type HydratedScreeningRequestShape =
  | { workflowType: typeof WorkflowType.EXISTING_PROPERTY; confirmedParcelId: string; projectType: ProjectType; projectDetails: ExistingPropertyScreeningRequestSnapshot["projectDetails"] }
  | { workflowType: typeof WorkflowType.VACANT_LAND; confirmedParcelId: string; screeningIntent: VacantLandScreeningIntent; vacantLandDetails: VacantLandScreeningRequestSnapshot["vacantLandDetails"] };

export type HydrateResult = { outcome: "VALID"; value: HydratedScreeningRequestShape } | { outcome: "INVALID"; issues: string[] };

/** Fails closed - returns INVALID rather than throwing or casting, matching this project's
 * existing `validateAtBoundary` convention. Callers decide what INVALID means for their own
 * context (e.g. `markJobFailed` in the report-generation pipeline). Two passes: (1) the
 * discriminated-union shape (workflowType + its branch's own required fields, `.strict()`
 * cross-workflow rejection); (2) for EXISTING_PROPERTY, `projectDetails`'s own shape against
 * whichever of Shed/GarageProjectConfigurationSchema `projectType` selects - deferred to this
 * second pass because zod's discriminatedUnion cannot express a check that depends on a sibling
 * field's own value. */
export function hydrateScreeningRequestShape(raw: unknown): HydrateResult {
  const shapeResult = validateAtBoundary(ScreeningRequestShapeSchema, raw);
  if (shapeResult.outcome === "INVALID") return { outcome: "INVALID", issues: shapeResult.issues };

  if (shapeResult.data.workflowType === WorkflowType.EXISTING_PROPERTY) {
    const detailsSchema = shapeResult.data.projectType === ProjectType.GARAGE ? GarageProjectConfigurationSchema : ShedProjectConfigurationSchema;
    const detailsResult = validateAtBoundary(detailsSchema, shapeResult.data.projectDetails);
    if (detailsResult.outcome === "INVALID") return { outcome: "INVALID", issues: detailsResult.issues.map((i) => `projectDetails.${i}`) };
    return {
      outcome: "VALID",
      value: { workflowType: WorkflowType.EXISTING_PROPERTY, confirmedParcelId: shapeResult.data.confirmedParcelId, projectType: shapeResult.data.projectType, projectDetails: detailsResult.data },
    };
  }
  return {
    outcome: "VALID",
    value: {
      workflowType: WorkflowType.VACANT_LAND,
      confirmedParcelId: shapeResult.data.confirmedParcelId,
      screeningIntent: shapeResult.data.screeningIntent,
      vacantLandDetails: shapeResult.data.vacantLandDetails,
    },
  };
}

/** A live `ScreeningRequestRow` (Drizzle-selected) carries many columns beyond the 5 this
 * hydrator's `.strict()` schemas validate (`id`, `validationState`, `createdAt`, `snapshot`,
 * etc.) - passing the full row directly would fail `.strict()` on those unrelated columns.
 * Narrows to exactly the fields the discriminated shape needs before hydrating. */
export function hydrateScreeningRequestRow(row: {
  workflowType: string;
  confirmedParcelId: string;
  projectType: string | null;
  projectDetails: unknown;
  screeningIntent: string | null;
  vacantLandDetails: unknown;
}): HydrateResult {
  // Deliberately includes EVERY branch-specific field whose stored value is non-null, regardless
  // of what `workflowType` claims - a corrupted row with workflowType='VACANT_LAND' AND a
  // non-null projectType must still be caught here. Since `.strict()` on each branch schema
  // declares only that branch's own fields, an extra non-null field from the OTHER branch fails
  // validation as an unrecognized key - the cross-workflow-pollution rejection the schema exists
  // to enforce. A clean row (the other branch's fields genuinely NULL in the database) omits
  // those keys entirely and validates normally.
  const candidate: Record<string, unknown> = { workflowType: row.workflowType, confirmedParcelId: row.confirmedParcelId };
  if (row.projectType !== null) candidate.projectType = row.projectType;
  if (row.projectDetails !== null && row.projectDetails !== undefined) candidate.projectDetails = row.projectDetails;
  if (row.screeningIntent !== null) candidate.screeningIntent = row.screeningIntent;
  if (row.vacantLandDetails !== null && row.vacantLandDetails !== undefined) candidate.vacantLandDetails = row.vacantLandDetails;
  return hydrateScreeningRequestShape(candidate);
}

/** Convenience wrapper for hydrating a snapshot/live-row shape directly into the discriminated
 * `ExistingPropertyScreeningRequestSnapshot | VacantLandScreeningRequestSnapshot` union
 * (`screening-request/types.ts`) - the same validated fields, with `workflowType` repeated as the
 * snapshot's own discriminant (matching the existing snapshot shape exactly). */
export function hydrateScreeningRequestSnapshot(raw: unknown): { outcome: "VALID"; snapshot: ExistingPropertyScreeningRequestSnapshot | VacantLandScreeningRequestSnapshot } | { outcome: "INVALID"; issues: string[] } {
  const result = hydrateScreeningRequestShape(raw);
  if (result.outcome === "INVALID") return result;
  const value = result.value;
  if (value.workflowType === WorkflowType.VACANT_LAND) {
    return {
      outcome: "VALID",
      snapshot: { workflowType: WorkflowType.VACANT_LAND, confirmedParcelId: value.confirmedParcelId, screeningIntent: value.screeningIntent, vacantLandDetails: value.vacantLandDetails },
    };
  }
  return {
    outcome: "VALID",
    snapshot: { workflowType: WorkflowType.EXISTING_PROPERTY, confirmedParcelId: value.confirmedParcelId, projectType: value.projectType, projectDetails: value.projectDetails },
  };
}
