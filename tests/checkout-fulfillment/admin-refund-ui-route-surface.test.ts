/**
 * ADM-6, corrected 2026-08-25: the admin order-detail UI must expose a refund command for PAID
 * (a new refund) and REFUND_PENDING (resuming the existing one) only - never for
 * PENDING/REFUNDED/REFUND_FAILED/EXPIRED. Structural/production-boundary-style test, matching
 * this project's established style elsewhere (internal-prototype-route-surface.test.ts,
 * admin-search-route-surface.test.ts) - inspects the actual source rather than rendering React,
 * since this codebase has no component-testing framework.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

describe("ADM-6 admin order-detail refund UI surface", () => {
  it("[hard invariant] the refund action is derived from order.state, mapping only PAID and REFUND_PENDING to an available command", () => {
    const source = readFileSync(join(REPO_ROOT, "app/admin/orders/[orderId]/page.tsx"), "utf8");
    expect(source).toMatch(/order\.state === "PAID" \? "NEW" : order\.state === "REFUND_PENDING" \? "RESUME" : "NONE"/);
  });

  it("the resumption path never renders a reason selector - the existing reason is shown read-only", () => {
    const source = readFileSync(join(REPO_ROOT, "app/admin/orders/[orderId]/page.tsx"), "utf8");
    const resumeSection = source.slice(source.indexOf('refundMode === "RESUME"'));
    expect(resumeSection).not.toMatch(/<select/);
    expect(resumeSection).toMatch(/Existing reason/);
  });

  it("the server route uses decideAdminRefundCommand (the existing decideRefundAction) as the sole state-validation authority - never a duplicated state machine", () => {
    const source = readFileSync(join(REPO_ROOT, "app/api/admin/orders/[orderId]/refund/route.ts"), "utf8");
    expect(source).toMatch(/decideAdminRefundCommand/);
    expect(source).not.toMatch(/order\.state === "PAID"/); // no route-local re-implementation of the state check
  });
});
