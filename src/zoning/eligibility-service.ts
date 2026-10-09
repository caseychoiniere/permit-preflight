/**
 * Purchase eligibility with I/O (citywide zoning coverage, 2026-10-09): reads the property's zoning from Seattle's layer, the ACTIVE rules from the
 * database and - for a placed project - the footprint's own zoning, then applies the pure rule in eligibility.ts. Server-only.
 */

import type { Db } from "../db/client.js";
import { fetchParcelBoundaryPolygon } from "../property-intelligence/king-county-parcel-geometry.js";
import { queryZoningForPolygon } from "../property-intelligence/seattle-zoning.js";
import type { ZoningFactValue } from "../property-intelligence/seattle-zoning.js";
import { listActiveRulesForProject } from "../regulatory-rule-governance/repository.js";
import { computeProposedFootprint } from "../spatial-analysis/postgis-adapter.js";
import type { Polygon } from "../spatial-analysis/types.js";
import { logger } from "../shared/logger.js";
import { buildZoningContext } from "./context.js";
import type { ZoningContext } from "./context.js";
import { isCoreProjectType, CORE_CLAIMS } from "./core-claims.js";
import type { CoreProjectType } from "./core-claims.js";
import { evaluatePurchaseEligibility } from "./eligibility.js";
import type { PurchaseEligibility } from "./eligibility.js";

const ZONING_TIMEOUT_MS = 8000;

interface ZoningRead {
  context: ZoningContext;
  boundary?: Polygon;
}

async function readLotZoning(parcelId: string): Promise<ZoningRead> {
  let boundary: Polygon;
  try {
    boundary = await fetchParcelBoundaryPolygon(parcelId);
  } catch (error) {
    logger.warn("SOURCE_FAILURE", { sourceId: "king-county-parcel-polygon", stage: "ELIGIBILITY", error: error instanceof Error ? error.message : String(error) });
    return { context: buildZoningContext({ lot: undefined }) };
  }
  let lot: ZoningFactValue | undefined;
  try {
    lot = await queryZoningForPolygon(boundary, ZONING_TIMEOUT_MS, "PARCEL");
  } catch (error) {
    logger.warn("SOURCE_FAILURE", { sourceId: "seattle-zoning", stage: "ELIGIBILITY", error: error instanceof Error ? error.message : String(error) });
  }
  return { context: buildZoningContext({ lot }), boundary };
}

/** Lot-level advisory for every project type, shown before the customer enters any details. Not the checkout gate. */
export async function checkParcelZoningEligibility(db: Db, parcelId: string): Promise<{ zoneLabels: string[]; byProjectType: Record<CoreProjectType, PurchaseEligibility> }> {
  const { context } = await readLotZoning(parcelId);
  const types = Object.keys(CORE_CLAIMS) as CoreProjectType[];
  const byProjectType = {} as Record<CoreProjectType, PurchaseEligibility>;
  for (const type of types) {
    byProjectType[type] = evaluatePurchaseEligibility({ projectType: type, zoning: context, activeRules: await listActiveRulesForProject(db, type), requireAllZones: false });
  }
  return { zoneLabels: context.lotZones.map((z) => z.designation.raw), byProjectType };
}

export interface EligibilityRequest {
  projectType: string | null;
  confirmedParcelId: string;
  projectDetails: unknown;
}

/** The authoritative gate used by checkout: the project's own zones (the footprint's, when it is placed on a lot with more than one designation). */
export async function checkZoningPurchaseEligibility(db: Db, request: EligibilityRequest): Promise<PurchaseEligibility> {
  if (!isCoreProjectType(request.projectType)) return { eligible: true, zoneLabels: [], coveredClaims: [], unresolvedNotes: [] };
  const { context, boundary } = await readLotZoning(request.confirmedParcelId);
  let zoning = context;
  if (context.available && context.lotZones.length > 1 && boundary) {
    const details = request.projectDetails as { proposedPlacement?: { anchor: { lat: number; lng: number }; orientationDeg: number }; widthFt?: number; depthFt?: number; lotLineRoleAssignment?: { status?: string } } | null;
    if (details?.proposedPlacement && typeof details.widthFt === "number" && typeof details.depthFt === "number") {
      try {
        const footprint = await computeProposedFootprint(db, boundary, details.proposedPlacement, { widthFt: details.widthFt, depthFt: details.depthFt });
        const footprintZoning = await queryZoningForPolygon(footprint, ZONING_TIMEOUT_MS, "PROJECT_FOOTPRINT");
        zoning = buildZoningContext({ lot: lotFactFrom(context), footprint: footprintZoning });
      } catch (error) {
        logger.warn("SOURCE_FAILURE", { sourceId: "seattle-zoning", stage: "ELIGIBILITY_FOOTPRINT", error: error instanceof Error ? error.message : String(error) });
        zoning = { ...context, footprintGap: "Seattle's zoning data could not be read for the proposed footprint" };
      }
    }
  }
  return evaluatePurchaseEligibility({ projectType: request.projectType, zoning, activeRules: await listActiveRulesForProject(db, request.projectType) });
}

/** Rebuild a ZoningFactValue from a built context (the lot share list is all the footprint merge needs). */
function lotFactFrom(context: ZoningContext): ZoningFactValue {
  return {
    zones: context.lotZones.map((z) => ({
      zoning: z.designation.raw,
      baseZone: z.designation.baseZone,
      shorelineDistrict: z.shorelineDistrict,
      historicDistrict: z.historicDistrict,
      ...(z.overlay ? { overlay: z.overlay } : {}),
      fractionOfParcel: z.fraction,
      designation: z.designation,
    })),
    sampledPointCount: 0,
    coveredFraction: context.lotGap ? 0 : 1,
  };
}

