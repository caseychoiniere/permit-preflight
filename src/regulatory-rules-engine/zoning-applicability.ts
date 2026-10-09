/**
 * Customer-facing notices for constraints a report could not screen. The zoning logic itself lives in src/zoning/ (designation parser,
 * zone-scoped rule resolution, zoning findings); this module keeps the one shared wording function that both the web report and the PDF use.
 */

export const NO_ACTIVE_RULE_UNCOVERED_NOTICE =
  "This constraint could not yet be automatically screened for this project type - no active regulatory rule currently governs it in this system. This is not the same as a compliance finding of any kind and should not be read as a pass.";

/** Marker carried by the uncovered-constraint entry that stands in for every zone-specific claim when no zoning could be applied. */
export const ZONING_NOT_APPLIED_MARKER = "Seattle zoning could not be applied";
export const ZONING_NOT_APPLIED_NOTICE =
  "Permit Preflight could not apply this property's zoning, so it made no zone-specific conclusion here. This is not the same as a compliance finding of any kind and should not be read as a pass.";

/** The customer-facing explanation for one "Not Yet Automatically Screenable" entry (web and PDF share it). */
export function uncoveredConstraintNotice(constraintType: string): string {
  return constraintType.includes(ZONING_NOT_APPLIED_MARKER) ? ZONING_NOT_APPLIED_NOTICE : NO_ACTIVE_RULE_UNCOVERED_NOTICE;
}
