/**
 * Stage-level timing instrumentation - NFR Design Pattern 4. Extends the existing structured
 * logger with STAGE_TIMING events; instrumentation failure must never fail report generation.
 */

import { logger } from "../shared/logger.js";

export type PipelineStage =
  | "PARCEL_GEOMETRY_RETRIEVAL"
  | "PROPERTY_INTELLIGENCE"
  | "SPATIAL_ANALYSIS"
  | "RULES_ENGINE"
  | "REPORT_EXPLANATION"
  | "ARTIFACT_PERSISTENCE"
  | "PDF_RENDERING";

/** Times `fn` and emits a STAGE_TIMING event using a monotonic clock (process.hrtime), not
 * wall-clock subtraction. If logging itself throws, the error is swallowed - timing is
 * observational, never load-bearing. */
export async function withStageTiming<T>(stage: PipelineStage, reportGenerationJobId: string, fn: () => Promise<T>): Promise<T> {
  const start = process.hrtime.bigint();
  try {
    return await fn();
  } finally {
    try {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.info("STAGE_TIMING", { stage, durationMs, reportGenerationJobId });
    } catch {
      // Instrumentation failure must never fail report generation.
    }
  }
}
