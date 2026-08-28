/**
 * NFR Design Pattern 4: the guest status-read response must be exactly the minimized
 * GuestOrderStatus enum - never customerEmail, stripePaymentIntentId, stripeRefundId,
 * reportAccessToken, or any other internal field. A structural/source-text check on the route
 * handler, matching this unit's other production-boundary-style tests (INTERNAL_PROTOTYPE route
 * absence) - it fails loudly if a future change accidentally widens the response shape.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GuestOrderStatus } from "../../src/order-payment/types.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const FORBIDDEN_FIELD_NAMES = ["customerEmail", "stripePaymentIntentId", "stripeRefundId", "reportAccessToken", "refundIdempotencyKey", "checkoutCreationIdempotencyKey"];

describe("Guest status-read minimization", () => {
  it("[hard invariant] the status route's source never references a forbidden internal field name", () => {
    const source = readFileSync(join(REPO_ROOT, "app/api/checkout/status/route.ts"), "utf8");
    for (const field of FORBIDDEN_FIELD_NAMES) {
      expect(source, `status route must never reference ${field}`).not.toContain(field);
    }
  });

  it("[hard invariant] the status route sets Cache-Control: no-store", () => {
    const source = readFileSync(join(REPO_ROOT, "app/api/checkout/status/route.ts"), "utf8");
    expect(source).toContain("no-store");
  });

  it("GuestOrderStatus is exactly the 9 minimized values from Pattern 4 - never grows an internal field", () => {
    expect(Object.values(GuestOrderStatus).sort()).toEqual(
      ["PENDING", "PAYMENT_CONFIRMED", "REPORT_READY", "REFUND_PENDING", "REFUNDED", "REFUND_REQUIRES_SUPPORT", "EXPIRED", "RECONCILING", "NOT_FOUND"].sort()
    );
  });
});
