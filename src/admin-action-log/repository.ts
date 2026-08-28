/**
 * AdminActionLog repository - insert-only, append-only. No read/update/delete function is built:
 * this unit has no "view the audit log" story (ADM-1 through ADM-8 never require reading
 * AdminActionLog back).
 *
 * Atomicity/sequencing guarantees (BR-U3-9, corrected 2026-08-25 founder review) live at the
 * CALL SITE, not here:
 * - For the 4 local mutations (RULE_DISABLED, RULE_REENABLED, DATA_SOURCE_MARKED_UNHEALTHY,
 *   DATA_SOURCE_OVERRIDE_CLEARED), the caller passes a TransactionalDb obtained from
 *   db/client.ts's withAdminTransaction - the domain mutation and this insert share one real
 *   Postgres transaction, so either both commit or neither does.
 * - For REFUND_INITIATED, the caller passes a plain Db (getDb()) and awaits this call to commit
 *   BEFORE ever calling start(processRefundWorkflow, ...) - no distributed transaction, but no
 *   admin refund command can appear to succeed without a durable audit record already existing.
 */

import { adminActionLog } from "../db/schema.js";
import type { Db, TransactionalDb } from "../db/client.js";
import type { AdminActionLogEntry } from "./types.js";

export async function recordAdminAction(db: Db | TransactionalDb, entry: AdminActionLogEntry): Promise<void> {
  await db.insert(adminActionLog).values({
    operatorId: entry.operatorId,
    actionType: entry.actionType,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  });
}
