/**
 * Lot-Line Role Assignment - BR-U2-9 (business-rules.md, Functional Design correction). Front/
 * rear/side roles are NEVER inferred from polygon shape alone - this module only ever confirms
 * or rejects a role assignment derived from the user's explicit front/rear edge indication. It
 * never guesses.
 *
 * Edge identity convention: for a Polygon with points [p0, p1, ..., p(n-1)], edge i connects
 * points[i] to points[(i+1) % n] and is referenced as the string `edge-${i}`. This gives every
 * edge reference a verifiable membership test against the specific polygon it names.
 */

import type { Polygon } from "./types.js";
import { LotLineRoleStatus } from "../screening-request/types.js";
import type { LotLineRoleAssignment } from "../screening-request/types.js";

export function edgeRefsForPolygon(polygon: Polygon): string[] {
  return polygon.points.map((_, i) => `edge-${i}`);
}

function edgeIndex(edgeRef: string): number | undefined {
  const match = /^edge-(\d+)$/.exec(edgeRef);
  return match ? Number(match[1]) : undefined;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

/** Confirms every edge reference in an ASSIGNED assignment actually belongs to this polygon
 * (NFR-U2-4's "reject edge references that do not belong to the submitted parcel boundary").
 * INSUFFICIENT assignments have no edge references to check and always pass. */
export function validateLotLineRoleAssignment(assignment: LotLineRoleAssignment, boundaryPolygon: Polygon): ValidationResult {
  if (assignment.status === LotLineRoleStatus.INSUFFICIENT) return { valid: true, issues: [] };

  const issues: string[] = [];
  const validRefs = new Set(edgeRefsForPolygon(boundaryPolygon));

  const allRefs = [assignment.frontEdgeRef, assignment.rearEdgeRef, ...(assignment.sideEdgeRefs ?? [])].filter(
    (ref): ref is string => ref !== undefined
  );
  for (const ref of allRefs) {
    if (!validRefs.has(ref)) issues.push(`Edge reference "${ref}" does not belong to the submitted parcel boundary.`);
  }
  if (assignment.frontEdgeRef && assignment.rearEdgeRef && assignment.frontEdgeRef === assignment.rearEdgeRef) {
    issues.push("frontEdgeRef and rearEdgeRef must be distinct edges.");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * The "deliberately simple prototype mechanism" (Functional Design Question 3 correction): given
 * the user's front/rear edge selections, determine whether the remaining boundary can safely be
 * treated as side. Succeeds only for the narrow, safely-representable case: a quadrilateral
 * (4-edge) parcel where the chosen front/rear edges are non-adjacent ("opposite" in a 4-gon).
 * Anything else - corner lots, irregular/multi-sided parcels, adjacent front/rear selections -
 * fails closed to INSUFFICIENT. This never runs automatically from polygon shape; it always
 * requires the caller to have already captured an explicit user front/rear indication.
 */
export function deriveLotLineRoleAssignment(
  boundaryPolygon: Polygon,
  frontEdgeRef: string,
  rearEdgeRef: string,
  indicatedBy?: string
): LotLineRoleAssignment {
  const now = new Date().toISOString();
  const base = { method: "USER_INDICATED" as const, ...(indicatedBy ? { indicatedBy } : {}), indicatedAt: now };

  const edgeCount = boundaryPolygon.points.length;
  const front = edgeIndex(frontEdgeRef);
  const rear = edgeIndex(rearEdgeRef);

  if (edgeCount !== 4 || front === undefined || rear === undefined || front === rear) {
    return { status: LotLineRoleStatus.INSUFFICIENT, ...base };
  }

  // "Opposite" in a 4-edge polygon: the two edges are 2 apart (non-adjacent).
  const isOpposite = Math.abs(front - rear) === 2;
  if (!isOpposite) {
    return { status: LotLineRoleStatus.INSUFFICIENT, ...base };
  }

  const allRefs = edgeRefsForPolygon(boundaryPolygon);
  const sideEdgeRefs = allRefs.filter((ref) => ref !== frontEdgeRef && ref !== rearEdgeRef);

  return { status: LotLineRoleStatus.ASSIGNED, frontEdgeRef, rearEdgeRef, sideEdgeRefs, ...base };
}
