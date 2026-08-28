/**
 * ADMIN_OPERATOR_ID attribution + mutating-command justification checks (BR-U3-0a, BR-U3-9) -
 * both independent of proxy.ts's Basic Auth having already succeeded. Authentication proves "this
 * request is from the operator"; these checks separately prove "this specific mutation carries
 * attribution and a reason," and fail closed on their own if either is missing.
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";

/** Fails closed if ADMIN_OPERATOR_ID is absent/blank, independent of Basic Auth passing -
 * BR-U3-0a. Returns undefined (never throws) so every call site handles the failure explicitly. */
export function requireOperatorId(): string | undefined {
  const raw = process.env["ADMIN_OPERATOR_ID"];
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

const ReasonSchema = z.string().trim().min(1);

/** Every Unit 3 mutating operator command requires a non-empty human justification (corrected
 * 2026-08-25 founder review) - validated here at the API boundary, in addition to the database's
 * own NOT NULL + CHECK(length(trim(reason)) > 0) constraint on admin_action_log.reason. */
export function validateReason(raw: unknown): { outcome: "VALID"; data: string } | { outcome: "INVALID"; issues: string[] } {
  return validateAtBoundary(ReasonSchema, raw);
}
