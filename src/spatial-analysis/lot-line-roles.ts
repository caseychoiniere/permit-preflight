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
import { LotLineRoleStatus, MultipleFrontageAnswer } from "../screening-request/types.js";
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
 * INSUFFICIENT assignments have no edge references to check and always pass.
 *
 * Maintenance correction (2026-09-15, founder direction) - also validates `streetFrontageEdgeRefs`
 * membership (each must belong to the polygon, same as front/rear/side) and its cross-field
 * consistency with `multipleFrontageAnswer` (required when ASSIGNED; non-empty only when YES). */
export function validateLotLineRoleAssignment(assignment: LotLineRoleAssignment, boundaryPolygon: Polygon): ValidationResult {
  if (assignment.status === LotLineRoleStatus.INSUFFICIENT) return { valid: true, issues: [] };

  const issues: string[] = [];
  const validRefs = new Set(edgeRefsForPolygon(boundaryPolygon));

  const allRefs = [assignment.frontEdgeRef, assignment.rearEdgeRef, ...(assignment.sideEdgeRefs ?? []), ...(assignment.streetFrontageEdgeRefs ?? [])].filter(
    (ref): ref is string => ref !== undefined
  );
  for (const ref of allRefs) {
    if (!validRefs.has(ref)) issues.push(`Edge reference "${ref}" does not belong to the submitted parcel boundary.`);
  }
  if (assignment.frontEdgeRef && assignment.rearEdgeRef && assignment.frontEdgeRef === assignment.rearEdgeRef) {
    issues.push("frontEdgeRef and rearEdgeRef must be distinct edges.");
  }
  if (assignment.multipleFrontageAnswer === undefined) {
    issues.push("multipleFrontageAnswer is required for an ASSIGNED lot-line role assignment.");
  } else if (assignment.multipleFrontageAnswer === MultipleFrontageAnswer.YES) {
    // Maintenance correction (2026-09-17, founder-directed through-lot fix) - see
    // LotLineRoleAssignmentSchema's matching superRefine (screening-request/types.ts) for why
    // rearAlsoFacesStreet alone also satisfies this requirement.
    if ((!assignment.streetFrontageEdgeRefs || assignment.streetFrontageEdgeRefs.length === 0) && assignment.rearAlsoFacesStreet !== true) {
      issues.push("streetFrontageEdgeRefs must identify at least one edge, or rearAlsoFacesStreet must be true, when multipleFrontageAnswer is YES.");
    }
  } else if (assignment.streetFrontageEdgeRefs && assignment.streetFrontageEdgeRefs.length > 0) {
    issues.push("streetFrontageEdgeRefs must be empty unless multipleFrontageAnswer is YES.");
  }
  if (assignment.rearAlsoFacesStreet === true && assignment.multipleFrontageAnswer !== MultipleFrontageAnswer.YES) {
    issues.push("rearAlsoFacesStreet can only be true when multipleFrontageAnswer is YES.");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Given the user's front/rear edge selections, determine whether the remaining boundary can
 * safely be treated as side.
 *
 * Maintenance correction (2026-09-15, founder direction): previously succeeded ONLY for an
 * exactly-4-edge parcel with front/rear "opposite" (2 apart) - fail-closed to INSUFFICIENT for
 * every other shape, including the ordinary case of a non-rectangular Seattle lot (5+ edges).
 * That restriction was never a geometric necessity: computeSetbackDistances' side-distance
 * computation (postgis-adapter.ts) already treats "side" generically as the MINIMUM ST_Distance
 * from the shed footprint to ANY of the edges that are neither front nor rear (Math.min over
 * every sideEdgeRefs entry) - a plain point/line-segment distance operation that has never
 * required a single straight side line or a rectangular lot, and needed no change here. The only
 * real, shape-independent invariant worth failing closed on is that front and rear must not be
 * ADJACENT (share an endpoint) - a lot's front and rear can never touch each other, regardless of
 * how many total edges the parcel has; anything else (front/rear the same edge, or genuinely
 * undefined edge refs) is also INSUFFICIENT. This still never runs automatically from polygon
 * shape; it always requires the caller to have already captured an explicit user front/rear
 * indication - BR-U2-9's "never guess" invariant is unchanged, only which selections are
 * ACCEPTABLE has widened.
 *
 * Known, disclosed, unaddressed by this change either way (not newly introduced): a corner lot
 * whose second street-facing edge should regulatorily be treated as a second front (not a side)
 * is not detected here or anywhere else in this codebase today - "side" is simply "every edge that
 * isn't the user-designated front or rear."
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

  // Reviewer-caught gap (2026-09-15, decision bf8aadcd-00b6-4f49-8ed3-598d0ca9c2c4) - an edge
  // index must actually be within [0, edgeCount) to name a real edge of THIS polygon; without this
  // check, an out-of-range ref (e.g. "edge-99" on a 6-edge parcel) could still pass the adjacency
  // test below by numeric coincidence and reach ASSIGNED with a front/rear that doesn't belong to
  // the boundary at all. validateLotLineRoleAssignment catches this for a fully-formed
  // LotLineRoleAssignment, but derivation itself must never produce one that needs catching.
  if (front === undefined || rear === undefined || front === rear || front < 0 || front >= edgeCount || rear < 0 || rear >= edgeCount) {
    return { status: LotLineRoleStatus.INSUFFICIENT, ...base };
  }

  const isAdjacent = (front + 1) % edgeCount === rear || (rear + 1) % edgeCount === front;
  if (isAdjacent) {
    return { status: LotLineRoleStatus.INSUFFICIENT, ...base };
  }

  const allRefs = edgeRefsForPolygon(boundaryPolygon);
  const sideEdgeRefs = allRefs.filter((ref) => ref !== frontEdgeRef && ref !== rearEdgeRef);

  return { status: LotLineRoleStatus.ASSIGNED, frontEdgeRef, rearEdgeRef, sideEdgeRefs, ...base };
}

/**
 * Maintenance correction (2026-09-15, founder direction) - separates GEOMETRIC role derivation
 * (deriveLotLineRoleAssignment above - front/rear picks, side candidates, unchanged) from
 * REGULATORY classification of which side-candidate edges are ORDINARY_SIDE vs. an additional
 * street frontage (Seattle distinguishes a side lot line from a side-street lot line). Layers the
 * customer's explicit tri-state answer (`MultipleFrontageAnswer`) on top of an already-derived
 * assignment - never runs before front/rear are themselves resolved (a no-op when `status` is
 * INSUFFICIENT, since there is no side-candidate set to classify yet).
 *
 * NO / NOT_SURE: `streetFrontageEdgeRefs` is always empty - every side-candidate edge stays a
 * plain, undifferentiated candidate in `sideEdgeRefs` (unchanged). The distinction between the two
 * answers is NOT this function's concern - it only matters to computeSetbackDistances (NOT_SURE
 * must not let the ordinary-side minimum be derived at all; NO safely uses every side-candidate
 * edge, exactly like today).
 *
 * YES: every provided edge ref must actually belong to `sideEdgeRefs` (not front, not rear, not a
 * foreign/out-of-range ref) - generalizes the same "never trust an edge ref without verifying
 * polygon membership" discipline `deriveLotLineRoleAssignment`'s own adjacency/range checks already
 * apply to front/rear. An INVALID ref (one that exists but doesn't belong) fails the WHOLE answer
 * closed to NOT_SURE with zero street-frontage edges recorded - never silently drops just the bad
 * ref and proceeds with a partial, unverified customer indication. A genuinely EMPTY selection
 * under YES is a distinct case from "invalid": it means the customer has answered YES but has not
 * finished picking edges yet (real-time UI state while ParcelPlacementMap.tsx's picking mode is
 * still open) - this is not itself untrustworthy data, so it stays YES with an empty
 * streetFrontageEdgeRefs rather than being reclassified as NOT_SURE (a real, live UX bug found
 * during this correction's own browser verification: reclassifying an in-progress YES as NOT_SURE
 * produced the wrong customer-facing message the instant "Yes" was clicked, before they had any
 * chance to pick an edge). Completeness - requiring at least one edge before the customer can
 * proceed - is enforced separately by checkPlacementCompleteness (parcel-placement-helpers.ts),
 * not by this function.
 *
 * Maintenance correction (2026-09-17, founder-directed through-lot fix) - `rearAlsoFacesStreet` is
 * threaded through the same way: forced to `false` whenever the answer isn't YES (never left
 * dangling from a prior YES), and passed through as given when YES. It needs no ref-membership
 * validation (unlike `streetFrontageEdgeRefs`) since it is a plain boolean about the
 * already-verified `rearEdgeRef`, not a caller-supplied edge reference.
 */
export function applyMultipleFrontageAnswer<T extends { status: LotLineRoleStatus; sideEdgeRefs?: string[] }>(
  assignment: T,
  multipleFrontageAnswer: MultipleFrontageAnswer,
  streetFrontageEdgeRefs: string[] = [],
  rearAlsoFacesStreet: boolean = false
): T & { multipleFrontageAnswer?: MultipleFrontageAnswer; streetFrontageEdgeRefs?: string[]; rearAlsoFacesStreet?: boolean } {
  if (assignment.status !== LotLineRoleStatus.ASSIGNED) return assignment;

  if (multipleFrontageAnswer !== MultipleFrontageAnswer.YES) {
    return { ...assignment, multipleFrontageAnswer, streetFrontageEdgeRefs: [], rearAlsoFacesStreet: false };
  }

  if (streetFrontageEdgeRefs.length === 0) {
    return { ...assignment, multipleFrontageAnswer: MultipleFrontageAnswer.YES, streetFrontageEdgeRefs: [], rearAlsoFacesStreet };
  }

  const validSideRefs = new Set(assignment.sideEdgeRefs ?? []);
  const allValid = streetFrontageEdgeRefs.every((ref) => validSideRefs.has(ref));
  if (!allValid) {
    return { ...assignment, multipleFrontageAnswer: MultipleFrontageAnswer.NOT_SURE, streetFrontageEdgeRefs: [], rearAlsoFacesStreet: false };
  }

  return { ...assignment, multipleFrontageAnswer, streetFrontageEdgeRefs, rearAlsoFacesStreet };
}
