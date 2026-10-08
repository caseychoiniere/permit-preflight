/**
 * Unit 11 (ADUs) - shared, client-safe display vocabulary so the web report and the PDF print identical
 * headline wording. Pure: no server or database imports.
 */

import type { AduFeasibility, AduFeasibilityHeadline } from "../regulatory-rules-engine/adu-types.js";

export type AduFeasibilityDisplay = AduFeasibility;

export const ADU_HEADLINE_LABEL: Record<AduFeasibilityHeadline, string> = {
  LOOKS_FEASIBLE: "Looks feasible - items to verify",
  LIKELY_CONSTRAINED: "Likely constrained - verify these first",
  BLOCKED: "Blocked as entered",
  CANNOT_TELL: "Cannot tell",
};

export const ADU_SECTION_TITLES = {
  headline: "ADU feasibility",
  stop: "What could stop it",
  verify: "Verify before paying for design work",
  told: "What you told us",
  notEvaluated: "Not evaluated",
} as const;

export const ADU_DECLARED_NOTE = "This ADU was evaluated from the details you entered and the footprint you placed on the map, not from a survey of the site.";
export const ADU_SCREENING_NOTE = "This is a screening read, not an approval or a permit determination. SDCI makes the final determination.";
