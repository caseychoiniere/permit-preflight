/**
 * processRefundWorkflow - Unit 2B's durable wrapper around order-payment.processRefund
 * (BR-U2B-5/6/7, corrected 2026-08-24 post-approval founder review). Started from three places:
 * (a) the report-generation workflow's FAILED/VERIFIED_PAYMENT terminal step (GENERATION_FAILURE),
 * (b) an internal-only manual-refund trigger (CUSTOMER_REQUEST/GOODWILL, never an HTTP route -
 * BR-U2B-9's route-surface correction), (c) the Cron reconciliation backstop.
 *
 * `REFUND_PENDING` is a RESUMABLE state, not a dedup-exit - see order-payment/repository.ts's
 * processRefund for the full corrected state machine. This workflow function is a thin durable
 * wrapper around that same function, not a second implementation of it: the ENTIRE state-branching
 * logic runs inside ONE step (submitRefundStep). This is deliberate, not a simplification that
 * loses anything - a step that fails partway through (after the DB claim commits, before the
 * Stripe call completes) gets automatically retried by the Workflow SDK, and that retry re-invokes
 * `processRefund`, which re-reads the Order's now-current state and correctly resumes via the
 * REFUND_PENDING branch using the persisted `refundIdempotencyKey`. The exact same resumability
 * applies whether the retry comes from the SDK's own step-retry or from an entirely fresh run
 * started later by Cron reconciliation - both re-invoke the same idempotent function.
 */

import { createHook } from "workflow";
import { getDb } from "../db/client.js";
import { createStripeClient } from "../order-payment/stripe-client.js";
import { processRefund, type ProcessRefundResult } from "../order-payment/repository.js";
import type { RefundReason } from "../order-payment/types.js";

export async function processRefundWorkflow(orderId: string, reason: RefundReason) {
  "use workflow";

  const hook = createHook({ token: `refund:${orderId}` });
  const conflict = await hook.getConflict();
  hook.dispose();
  if (conflict) {
    // Defense-in-depth only (see module docstring) - NOT relied upon for correctness. Even if
    // this check is bypassed, the DB-persisted refundIdempotencyKey and Stripe's own idempotency-
    // key deduplication are what actually prevent a duplicate refund.
    return { outcome: "DEDUPED" as const, ownerRunId: conflict.runId };
  }

  return submitRefundStep(orderId, reason);
}

async function submitRefundStep(orderId: string, reason: RefundReason): Promise<ProcessRefundResult> {
  "use step";
  return processRefund(getDb(), createStripeClient(), orderId, reason);
}
