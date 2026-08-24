/**
 * Evidence & Report Artifact - immutable once created (RGD-4). No function in this module ever
 * UPDATEs a row in evidence_report_artifacts after insert; a new evaluation always produces a
 * new, separate row.
 */

import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { evidenceReportArtifacts, type EvidenceReportArtifactRow } from "../db/schema.js";
import type { Finding } from "../regulatory-rules-engine/types.js";
import { createAccessCredential } from "../report-access/repository.js";
import type { AccessCredential } from "../report-access/credential.js";

export interface EvidenceEntry {
  factType: string;
  /** The actual retrieved value, when there is one to show (e.g. parcel geometry for RGD-2's map
   * view) - added for ReportMap, a presentation of THIS immutable snapshot only, never re-derived
   * at view time. */
  value?: unknown;
  provenance: Record<string, unknown>;
}

export interface ExplanationResult {
  text: string;
  referencedFindingIds: string[];
}

export interface CreateArtifactInput {
  screeningRequestId: string;
  reportGenerationJobId: string;
  findings: Finding[];
  evidence: EvidenceEntry[];
  explanation?: ExplanationResult;
  ruleVersionsUsed: string[];
  dataRetrievalTimestamps: Record<string, string>;
}

/** Creates the immutable artifact AND its first access credential in one call - the artifact is
 * never useful without a way to reach it, and issuing the credential here (rather than as a
 * separate later step) avoids a window where a COMPLETE job has no valid access path. */
export async function createEvidenceReportArtifact(db: Db, input: CreateArtifactInput): Promise<{ artifact: EvidenceReportArtifactRow; credential: AccessCredential }> {
  const [artifact] = await db
    .insert(evidenceReportArtifacts)
    .values({
      screeningRequestId: input.screeningRequestId,
      reportGenerationJobId: input.reportGenerationJobId,
      findings: input.findings,
      evidence: input.evidence,
      explanation: input.explanation ?? null,
      ruleVersionsUsed: input.ruleVersionsUsed,
      dataRetrievalTimestamps: input.dataRetrievalTimestamps,
    })
    .returning();
  if (!artifact) throw new Error("Failed to create EvidenceReportArtifact.");

  const credential = await createAccessCredential(db, artifact.id);
  return { artifact, credential };
}

/** Internal-use read by id - never exposed directly to a client-facing path. User-facing
 * retrieval must go through report-access's resolveByAccessToken/findArtifactIdByAccessToken
 * (BR-U2-7) and call this only with the id that resolution already authorized. */
export async function getReportById(db: Db, id: string): Promise<EvidenceReportArtifactRow | undefined> {
  const [row] = await db.select().from(evidenceReportArtifacts).where(eq(evidenceReportArtifacts.id, id));
  return row;
}
