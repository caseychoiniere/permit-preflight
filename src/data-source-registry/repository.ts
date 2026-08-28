/**
 * Data Source Registry repository - persisted replacement for Unit 1's in-memory
 * DataSourceRegistry class (2026-08-25, Unit 3). Same conceptual API (getSourceHealth /
 * isKnownUnhealthy / recordIngestionResult / listUnhealthySources), backed by the
 * dataSourceHealth table instead of a process-local Map, since Vercel Functions are stateless,
 * independent invocations with no shared process memory - the in-memory version's own doc
 * comment anticipated this ("A later unit may back this with real persistence... if Admin/Support
 * (Unit 3) needs durable history across restarts"); the actual constraint is stricter than
 * restarts.
 */

import { eq, sql } from "drizzle-orm";
import { dataSourceHealth, type DataSourceHealthRow } from "../db/schema.js";
import type { Db, TransactionalDb } from "../db/client.js";
import { SourceHealthState, computeEffectiveHealthState, type SourceHealthSnapshot } from "./types.js";

function toSnapshot(row: DataSourceHealthRow): SourceHealthSnapshot {
  const observedHealthState = row.observedHealthState as SourceHealthState;
  const manualOverrideState = (row.manualOverrideState as SourceHealthState | null) ?? undefined;
  return {
    sourceId: row.sourceId,
    observedHealthState,
    ...(row.lastSuccessfulRetrieval ? { lastSuccessfulRetrieval: row.lastSuccessfulRetrieval.toISOString() } : {}),
    ...(row.lastFailureAt ? { lastFailureAt: row.lastFailureAt.toISOString() } : {}),
    ...(row.lastFailureReason ? { lastFailureReason: row.lastFailureReason } : {}),
    ...(manualOverrideState ? { manualOverrideState } : {}),
    effectiveHealthState: computeEffectiveHealthState(observedHealthState, manualOverrideState),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Get-or-default-UNKNOWN read, upserting a row for a never-before-seen source id on first touch
 * (known-source-initialization requirement - an operator can override a source before any
 * automated ingestion has ever run against it).
 */
export async function getSourceHealth(db: Db | TransactionalDb, sourceId: string): Promise<SourceHealthSnapshot> {
  const [existing] = await db.select().from(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
  if (existing) return toSnapshot(existing);

  const inserted = await db.insert(dataSourceHealth).values({ sourceId }).onConflictDoNothing().returning();
  if (inserted[0]) return toSnapshot(inserted[0]);

  // Lost a concurrent-insert race - the row now exists courtesy of the other writer; re-read it.
  const [row] = await db.select().from(dataSourceHealth).where(eq(dataSourceHealth.sourceId, sourceId));
  if (!row) throw new Error(`Failed to read or initialize DataSourceHealth row for "${sourceId}".`);
  return toSnapshot(row);
}

/** Reads EFFECTIVE health (manualOverrideState ?? observedHealthState) - used by
 * checkReadiness/checkout-fulfillment exactly as the original in-memory isKnownUnhealthy was. */
export async function isKnownUnhealthy(db: Db | TransactionalDb, sourceId: string): Promise<boolean> {
  const snapshot = await getSourceHealth(db, sourceId);
  return snapshot.effectiveHealthState === SourceHealthState.UNHEALTHY;
}

/**
 * Writes ONLY observedHealthState (+ lastSuccessfulRetrieval/lastFailureAt/lastFailureReason) -
 * NEVER touches manualOverrideState. Corrected from Unit 1's original in-memory version: does
 * NOT early-return when a manual override is active - automated ingestion keeps observing even
 * under override; the override governs only the EFFECTIVE value, it does not pause monitoring.
 */
export async function recordIngestionResult(
  db: Db | TransactionalDb,
  sourceId: string,
  outcome: { success: true } | { success: false; reason: string }
): Promise<void> {
  await getSourceHealth(db, sourceId); // ensure a row exists first

  if (outcome.success) {
    await db
      .update(dataSourceHealth)
      .set({ observedHealthState: "HEALTHY", lastSuccessfulRetrieval: sql`now()`, updatedAt: sql`now()` })
      .where(eq(dataSourceHealth.sourceId, sourceId));
  } else {
    await db
      .update(dataSourceHealth)
      .set({ observedHealthState: "UNHEALTHY", lastFailureAt: sql`now()`, lastFailureReason: outcome.reason, updatedAt: sql`now()` })
      .where(eq(dataSourceHealth.sourceId, sourceId));
  }
}

/** Writes ONLY manualOverrideState. Called from Unit 3's admin route inside withAdminTransaction
 * (ADM-8's "set override"), never standalone - the caller also records the AdminActionLog entry
 * in the same transaction. */
export async function setManualOverride(tx: TransactionalDb, sourceId: string, state: SourceHealthState): Promise<void> {
  await getSourceHealth(tx, sourceId);
  await tx.update(dataSourceHealth).set({ manualOverrideState: state, updatedAt: sql`now()` }).where(eq(dataSourceHealth.sourceId, sourceId));
}

/** Writes ONLY manualOverrideState (to null). effectiveHealthState immediately reflects whatever
 * observedHealthState already is - no wait for a future ingestion result, since it was already
 * being tracked the entire time. Called from Unit 3's admin route inside withAdminTransaction
 * (ADM-8's "clear override"), never standalone. */
export async function clearManualOverride(tx: TransactionalDb, sourceId: string): Promise<void> {
  await getSourceHealth(tx, sourceId);
  await tx.update(dataSourceHealth).set({ manualOverrideState: null, updatedAt: sql`now()` }).where(eq(dataSourceHealth.sourceId, sourceId));
}

export async function listUnhealthySources(db: Db | TransactionalDb): Promise<SourceHealthSnapshot[]> {
  const rows = await db.select().from(dataSourceHealth);
  return rows.map(toSnapshot).filter((snapshot) => snapshot.effectiveHealthState === SourceHealthState.UNHEALTHY);
}
