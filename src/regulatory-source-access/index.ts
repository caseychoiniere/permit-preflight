/**
 * Regulatory Source Access - domain-entities.md "Regulatory Source Access". Owns permitted-access
 * regulatory source acquisition. Explicitly does NOT interpret or approve regulatory meaning, and
 * does NOT scrape/bulk-ingest Municode (confirmed impossible during Unit 0/0B - Municode returns
 * HTTP 403 on direct programmatic fetch; access is interactive-browser/human-research only).
 *
 * This module therefore models the acquisition boundary honestly: it accepts a bundle that a
 * human (optionally AI-assisted, e.g. via an interactive browser session) has already gathered,
 * rather than pretending to auto-fetch Municode itself. City Clerk/Legistar's ordinance-history
 * API (confirmed accessible during Unit 0B) IS fetched programmatically here, since that source
 * does not have Municode's access restriction.
 */

import { z } from "zod";
import { validateAtBoundary } from "../shared/validation.js";
import { executeWithBoundedRetry, DEFAULT_RETRY_POLICY, type RetryPolicy } from "../shared/retry.js";

export interface PermittedSourceEvidenceBundle {
  sourceExcerpts: { text: string; citation: string }[];
  citationMetadata: { smcSections: string[]; ordinanceNumber?: string; effectiveDate?: string; effectiveDateBasis?: string };
  acquisitionMethod: string;
  acquiredAt: string; // ISO 8601
}

export interface OrdinanceHistoryEntry {
  ordinanceNumber: string;
  /** The council bill number (e.g. "CB 120993") - a distinct identifier from the ordinance
   * number, tracked separately rather than conflated with it (a real defect found and fixed
   * during Build & Test live integration testing - see build-and-test-summary.md). */
  billNumber?: string;
  passedDate?: string;
  signedDate?: string;
  attestedDate?: string;
  billTitle?: string;
}

const LegistarMatterSchema = z.object({
  MatterFile: z.string().nullable().optional(),
  MatterPassedDate: z.string().nullable().optional(),
  MatterEnactmentDate: z.string().nullable().optional(),
  /** The actual enacted ordinance number lives here, formatted like "Ord 127376" - NOT in
   * MatterFile (the council bill number, e.g. "CB 120993") and NOT reliably in MatterName
   * (null for many matter types). Confirmed against live Legistar data during Build & Test. */
  MatterEnactmentNumber: z.string().nullable().optional(),
  MatterTitle: z.string().nullable().optional(),
});
const LegistarResponseSchema = z.array(LegistarMatterSchema);

const ORDINANCE_NUMBER_PATTERN = /Ord\s+(\d+)/i;

/**
 * Fetches ordinance history from Seattle Legistar's public API for a given ordinance-number
 * search term (e.g. "127376"). Real integration code, exercised by the integration test suite.
 *
 * Searches MatterEnactmentNumber (the field that actually holds "Ord <number>" for enacted
 * ordinances) rather than MatterName, which is frequently null and, even when populated, mirrors
 * the council bill number rather than the ordinance number - confirmed via live API inspection
 * during Build & Test after the original MatterName-based search returned zero results for a
 * known-real ordinance.
 */
export async function getOrdinanceHistory(
  searchTerm: string,
  retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY
): Promise<OrdinanceHistoryEntry[]> {
  const url = `https://webapi.legistar.com/v1/seattle/matters?$filter=substringof('${encodeURIComponent(searchTerm)}',MatterEnactmentNumber)`;
  const result = await executeWithBoundedRetry(async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Legistar request failed: ${response.status}`);
    const raw: unknown = await response.json();
    const validated = validateAtBoundary(LegistarResponseSchema, raw);
    if (validated.outcome === "INVALID") throw new Error(`Legistar response failed validation: ${validated.issues.join("; ")}`);
    return validated.data;
  }, retryPolicy);

  if (result.outcome === "EXHAUSTED") {
    throw new Error(`Could not retrieve ordinance history for "${searchTerm}" after retries.`);
  }

  return result.data.map((m) => {
    const enactmentMatch = m.MatterEnactmentNumber ? ORDINANCE_NUMBER_PATTERN.exec(m.MatterEnactmentNumber) : null;
    const ordinanceNumber = enactmentMatch?.[1] ?? m.MatterEnactmentNumber ?? "unknown";
    return {
      ordinanceNumber,
      ...(m.MatterFile ? { billNumber: m.MatterFile } : {}),
      ...(m.MatterPassedDate ? { passedDate: m.MatterPassedDate } : {}),
      ...(m.MatterEnactmentDate ? { signedDate: m.MatterEnactmentDate } : {}),
      ...(m.MatterTitle ? { billTitle: m.MatterTitle } : {}),
    };
  });
}

/**
 * Accepts a human/interactive-browser-acquired Municode research bundle. This function performs
 * no fetch itself for Municode content - it validates and packages what was already gathered, per
 * the confirmed operational constraint (Unit 0B). Rule Research Assistant consumes this output.
 */
export function packageEvidenceBundle(bundle: PermittedSourceEvidenceBundle): PermittedSourceEvidenceBundle {
  if (bundle.sourceExcerpts.length === 0) {
    throw new Error("An evidence bundle must contain at least one source excerpt with citation.");
  }
  return bundle;
}
