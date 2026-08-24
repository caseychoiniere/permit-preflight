/**
 * ReportPdfRendering persistence - lazy, cached, and structurally separate from
 * EvidenceReportArtifact (NFR Design Pattern 6, Functional Design correction). This module never
 * issues an UPDATE against evidence_report_artifacts.
 */

import { eq, and } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Db } from "../db/client.js";
import { reportPdfRenderings, type ReportPdfRenderingRow, type EvidenceReportArtifactRow } from "../db/schema.js";
import { renderReportHtml, renderPdfBytes } from "./render.js";

const CURRENT_RENDERING_VERSION = "1";

export async function findReportPdfRendering(db: Db, reportArtifactId: string, renderingVersion = CURRENT_RENDERING_VERSION): Promise<ReportPdfRenderingRow | undefined> {
  const [row] = await db
    .select()
    .from(reportPdfRenderings)
    .where(and(eq(reportPdfRenderings.reportArtifactId, reportArtifactId), eq(reportPdfRenderings.renderingVersion, renderingVersion)));
  return row;
}

/**
 * Lazy, cached PDF retrieval: returns the existing rendering if one already exists for this
 * artifact/version, otherwise renders from the immutable artifact, persists, and returns it.
 * Never mutates `artifact`. A rendering failure does not corrupt or modify the report artifact -
 * it simply produces no persisted row, and the caller sees the thrown error.
 */
export async function getOrRenderReportPdf(db: Db, artifact: EvidenceReportArtifactRow): Promise<ReportPdfRenderingRow> {
  const existing = await findReportPdfRendering(db, artifact.id, CURRENT_RENDERING_VERSION);
  if (existing) return existing;

  const html = renderReportHtml(artifact);
  const bytes = await renderPdfBytes(html);
  const contentHash = createHash("sha256").update(bytes).digest("hex");

  try {
    const [row] = await db
      .insert(reportPdfRenderings)
      .values({ reportArtifactId: artifact.id, renderingVersion: CURRENT_RENDERING_VERSION, bytes, contentHash })
      .returning();
    if (!row) throw new Error("Failed to persist ReportPdfRendering.");
    return row;
  } catch (err) {
    // A uniqueness/race condition between two concurrent first-requests is tolerated at
    // prototype scale (Infrastructure Design Q5) - if another request won the insert race,
    // return its result instead of erroring.
    const raceWinner = await findReportPdfRendering(db, artifact.id, CURRENT_RENDERING_VERSION);
    if (raceWinner) return raceWinner;
    throw err;
  }
}
